package handler

import (
	"bufio"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type aiStreamProxyResult struct {
	body      string
	truncated bool
	err       error
}

func TestProxyAIStreamResponseFlushesBeforeUpstreamCompletes(t *testing.T) {
	releaseUpstream := make(chan struct{})
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = io.WriteString(w, "data: {\"choices\":[{\"delta\":{\"content\":\"first\"}}]}\n\n")
		w.(http.Flusher).Flush()
		<-releaseUpstream
		_, _ = io.WriteString(w, "data: [DONE]\n\n")
	}))
	defer upstream.Close()

	result := make(chan aiStreamProxyResult, 1)
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		request, err := http.NewRequestWithContext(r.Context(), http.MethodGet, upstream.URL, nil)
		if err != nil {
			result <- aiStreamProxyResult{err: err}
			return
		}
		response, err := http.DefaultClient.Do(request)
		if err != nil {
			result <- aiStreamProxyResult{err: err}
			return
		}
		defer response.Body.Close()
		body, truncated, streamErr := proxyAIStreamResponse(w, response)
		result <- aiStreamProxyResult{body: string(body), truncated: truncated, err: streamErr}
	}))
	defer proxy.Close()

	response, err := http.Get(proxy.URL)
	if err != nil {
		close(releaseUpstream)
		t.Fatal(err)
	}
	defer response.Body.Close()

	firstLine, err := bufio.NewReader(response.Body).ReadString('\n')
	if err != nil {
		close(releaseUpstream)
		t.Fatal(err)
	}
	if !strings.Contains(firstLine, "first") {
		close(releaseUpstream)
		t.Fatalf("first streamed line = %q", firstLine)
	}
	if response.Header.Get("X-Accel-Buffering") != "no" {
		close(releaseUpstream)
		t.Fatalf("X-Accel-Buffering = %q", response.Header.Get("X-Accel-Buffering"))
	}

	close(releaseUpstream)
	_, _ = io.Copy(io.Discard, response.Body)
	proxyResult := <-result
	if proxyResult.err != nil {
		t.Fatal(proxyResult.err)
	}
	if proxyResult.truncated {
		t.Fatal("short SSE response was unexpectedly truncated")
	}
	if !strings.Contains(proxyResult.body, "first") || !strings.Contains(proxyResult.body, "[DONE]") {
		t.Fatalf("captured body = %q", proxyResult.body)
	}
}

func TestAIStreamResponseIndicatesFailure(t *testing.T) {
	body := []byte("data: {\"error\":{\"code\":\"upstream_error\",\"message\":\"generation failed\"}}\n\n")
	failed, message := aiStreamResponseIndicatesFailure(body)
	if !failed || !strings.Contains(message, "generation failed") {
		t.Fatalf("failed=%v message=%q", failed, message)
	}
}

func TestShouldProxyAIStream(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	request.Header.Set("Accept", "text/event-stream")
	response := &http.Response{Header: make(http.Header)}
	if !shouldProxyAIStream("/v1/chat/completions", request, response) {
		t.Fatal("chat SSE request was not detected")
	}
	if shouldProxyAIStream("/images/generations", request, response) {
		t.Fatal("non-chat request was detected as SSE")
	}
}
