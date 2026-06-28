package handler

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"
)

// jimengState stores the login state and pending tasks
var (
	jimengMu       sync.Mutex
	jimengLoggedIn bool
	jimengLoginCh  chan jimengLoginResult
	jimengTasks    = make(map[string]*jimengTask)
)

type jimengLoginResult struct {
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
}

type jimengTask struct {
	SubmitID string    `json:"submit_id"`
	Kind     string    `json:"kind"` // image or video
	Status   string    `json:"status"`
	URLs     []string  `json:"urls,omitempty"`
	Error    string    `json:"error,omitempty"`
	Created  time.Time `json:"created"`
}

// jimengCLIPath returns the path to the dreamina CLI
func jimengCLIPath() string {
	path, err := exec.LookPath("dreamina")
	if err != nil {
		return ""
	}
	return path
}

// jimengUseWSL returns true if we should use WSL on Windows
func jimengUseWSL() bool {
	if runtime.GOOS != "windows" {
		return false
	}
	return strings.TrimSpace(getEnvOrDefault("JIMENG_USE_WSL", "")) == "1"
}

func getEnvOrDefault(key, def string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return def
}

// runJimengCLI runs the dreamina CLI with the given arguments
func runJimengCLI(ctx context.Context, args []string, timeout time.Duration) (string, error) {
	cliPath := jimengCLIPath()
	if cliPath == "" {
		return "", fmt.Errorf("dreamina CLI 未安装，请先安装: npm install -g dreamina-cli")
	}

	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, cliPath, args...)
	cmd.Env = append(cmd.Environ(), "NO_COLOR=1")

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return "", fmt.Errorf("创建 stdout 管道失败: %w", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return "", fmt.Errorf("创建 stderr 管道失败: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return "", fmt.Errorf("启动 dreamina 失败: %w", err)
	}

	var outBuf, errBuf strings.Builder
	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			line := scanner.Text()
			outBuf.WriteString(line + "\n")
		}
	}()
	go func() {
		defer wg.Done()
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			line := scanner.Text()
			// filter WSL proxy warnings
			if strings.Contains(line, "Proxy") && strings.Contains(line, "WSL") {
				continue
			}
			errBuf.WriteString(line + "\n")
		}
	}()

	err = cmd.Wait()
	wg.Wait()

	output := outBuf.String()
	if err != nil {
		return output, fmt.Errorf("dreamina 执行失败: %w\n%s", err, errBuf.String())
	}
	return output, nil
}

// JimengStatus checks if dreamina CLI is installed and login status
func JimengStatus(w http.ResponseWriter, r *http.Request) {
	cliPath := jimengCLIPath()
	if cliPath == "" {
		OK(w, map[string]any{
			"installed": false,
			"loggedIn":  false,
		})
		return
	}

	// check login status by running user_credit
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	output, err := runJimengCLI(ctx, []string{"user_credit"}, 10*time.Second)
	loggedIn := err == nil && strings.Contains(output, "credit")

	OK(w, map[string]any{
		"installed": true,
		"loggedIn":  loggedIn,
	})
}

// JimengCredit queries user credit
func JimengCredit(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	output, err := runJimengCLI(ctx, []string{"user_credit"}, 15*time.Second)
	if err != nil {
		Fail(w, "查询积分失败: "+err.Error())
		return
	}
	OK(w, map[string]any{"raw": output})
}

// JimengLoginStart starts the QR code login flow
func JimengLoginStart(w http.ResponseWriter, r *http.Request) {
	jimengMu.Lock()
	defer jimengMu.Unlock()

	if jimengLoginCh != nil {
		Fail(w, "登录流程已在进行中")
		return
	}
	jimengLoginCh = make(chan jimengLoginResult, 1)

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
		defer cancel()

		output, err := runJimengCLI(ctx, []string{"login", "--headless"}, 120*time.Second)
		jimengMu.Lock()
		jimengLoggedIn = err == nil && (strings.Contains(output, "success") || strings.Contains(output, "登录成功"))
		result := jimengLoginResult{Success: jimengLoggedIn}
		if err != nil {
			result.Error = err.Error()
		}
		if jimengLoginCh != nil {
			jimengLoginCh <- result
			close(jimengLoginCh)
			jimengLoginCh = nil
		}
		jimengMu.Unlock()
	}()

	// Extract QR code URL from the first output
	// The CLI outputs a QR code URL to stderr
	OK(w, map[string]any{"started": true})
}

// JimengLoginStatus checks login progress
func JimengLoginStatus(w http.ResponseWriter, r *http.Request) {
	jimengMu.Lock()
	defer jimengMu.Unlock()

	if jimengLoggedIn {
		OK(w, map[string]any{"loggedIn": true})
		return
	}
	if jimengLoginCh == nil {
		OK(w, map[string]any{"loggedIn": false, "pending": false})
		return
	}
	OK(w, map[string]any{"loggedIn": false, "pending": true})
}

// JimengGenerateImage handles text-to-image and image-to-image
func JimengGenerateImage(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Prompt        string `json:"prompt"`
		ImageURL      string `json:"image_url,omitempty"`
		Ratio         string `json:"ratio,omitempty"`
		Resolution    string `json:"resolution,omitempty"`
		ModelVersion  string `json:"model_version,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Fail(w, "请求参数错误")
		return
	}
	if strings.TrimSpace(req.Prompt) == "" {
		Fail(w, "提示词不能为空")
		return
	}

	args := []string{}
	if req.ImageURL != "" {
		args = append(args, "image2image", fmt.Sprintf("--images=%s", req.ImageURL))
	} else {
		args = append(args, "text2image")
	}
	args = append(args, fmt.Sprintf("--prompt=%s", req.Prompt))
	if req.Ratio != "" {
		args = append(args, fmt.Sprintf("--ratio=%s", req.Ratio))
	} else {
		args = append(args, "--ratio=1:1")
	}
	if req.Resolution != "" {
		args = append(args, fmt.Sprintf("--resolution_type=%s", req.Resolution))
	} else {
		args = append(args, "--resolution_type=2k")
	}
	if req.ModelVersion != "" {
		args = append(args, fmt.Sprintf("--model_version=%s", req.ModelVersion))
	}
	args = append(args, "--poll=900")

	// Store task
	taskID := fmt.Sprintf("jimeng_img_%d", time.Now().UnixNano())
	task := &jimengTask{SubmitID: taskID, Kind: "image", Status: "running", Created: time.Now()}
	jimengMu.Lock()
	jimengTasks[taskID] = task
	jimengMu.Unlock()

	go func() {
		output, err := runJimengCLI(context.Background(), args, 15*time.Minute)
		jimengMu.Lock()
		if err != nil {
			task.Status = "failed"
			task.Error = err.Error()
		} else {
			task.Status = "completed"
			task.URLs = extractURLs(output)
		}
		jimengMu.Unlock()
	}()

	OK(w, map[string]any{"task_id": taskID, "status": "running"})
}

// JimengGenerateVideo handles text-to-video, image-to-video, etc.
func JimengGenerateVideo(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Prompt       string   `json:"prompt"`
		ImageURLs    []string `json:"image_urls,omitempty"`
		VideoURLs    []string `json:"video_urls,omitempty"`
		AudioURLs    []string `json:"audio_urls,omitempty"`
		Duration     string   `json:"duration,omitempty"`
		Ratio        string   `json:"ratio,omitempty"`
		Resolution   string   `json:"resolution,omitempty"`
		ModelVersion string   `json:"model_version,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Fail(w, "请求参数错误")
		return
	}
	if strings.TrimSpace(req.Prompt) == "" {
		Fail(w, "提示词不能为空")
		return
	}

	args := []string{}
	images := req.ImageURLs
	videos := req.VideoURLs
	audios := req.AudioURLs

	if len(images) == 0 && len(videos) == 0 && len(audios) == 0 {
		args = append(args, "text2video")
	} else if len(images) == 1 && len(videos) == 0 && len(audios) == 0 {
		args = append(args, "image2video", fmt.Sprintf("--images=%s", images[0]))
	} else if len(images) >= 2 && len(videos) == 0 {
		args = append(args, "multiframe2video", fmt.Sprintf("--images=%s", strings.Join(images, ",")))
	} else {
		args = append(args, "multimodal2video")
		for _, img := range images {
			args = append(args, fmt.Sprintf("--image=%s", img))
		}
		for _, vid := range videos {
			args = append(args, fmt.Sprintf("--video=%s", vid))
		}
		for _, aud := range audios {
			args = append(args, fmt.Sprintf("--audio=%s", aud))
		}
	}

	args = append(args, fmt.Sprintf("--prompt=%s", req.Prompt))
	if req.Duration != "" {
		args = append(args, fmt.Sprintf("--duration=%s", req.Duration))
	}
	if req.Ratio != "" {
		args = append(args, fmt.Sprintf("--ratio=%s", req.Ratio))
	}
	if req.Resolution != "" {
		args = append(args, fmt.Sprintf("--video_resolution=%s", req.Resolution))
	}
	if req.ModelVersion != "" {
		args = append(args, fmt.Sprintf("--model_version=%s", req.ModelVersion))
	}
	args = append(args, "--poll=900")

	taskID := fmt.Sprintf("jimeng_vid_%d", time.Now().UnixNano())
	task := &jimengTask{SubmitID: taskID, Kind: "video", Status: "running", Created: time.Now()}
	jimengMu.Lock()
	jimengTasks[taskID] = task
	jimengMu.Unlock()

	go func() {
		output, err := runJimengCLI(context.Background(), args, 15*time.Minute)
		jimengMu.Lock()
		if err != nil {
			task.Status = "failed"
			task.Error = err.Error()
		} else {
			task.Status = "completed"
			task.URLs = extractURLs(output)
		}
		jimengMu.Unlock()
	}()

	OK(w, map[string]any{"task_id": taskID, "status": "running"})
}

// JimengTaskStatus checks the status of a Jimeng generation task
func JimengTaskStatus(w http.ResponseWriter, r *http.Request, taskID string) {
	jimengMu.Lock()
	task, exists := jimengTasks[taskID]
	jimengMu.Unlock()

	if !exists {
		Fail(w, "任务不存在")
		return
	}

	OK(w, map[string]any{
		"task_id": task.SubmitID,
		"status":  task.Status,
		"kind":    task.Kind,
		"urls":    task.URLs,
		"error":   task.Error,
	})
}

// JimengQueryMedia queries media by submit_id
func JimengQueryMedia(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SubmitID string `json:"submit_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Fail(w, "请求参数错误")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	output, err := runJimengCLI(ctx, []string{"query_result", fmt.Sprintf("--submit_id=%s", req.SubmitID)}, 30*time.Second)
	if err != nil {
		Fail(w, "查询失败: "+err.Error())
		return
	}

	urls := extractURLs(output)
	OK(w, map[string]any{"urls": urls, "raw": output})
}

// JimengLogout logs out from Jimeng
func JimengLogout(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	_, err := runJimengCLI(ctx, []string{"logout"}, 10*time.Second)
	if err != nil {
		Fail(w, "登出失败: "+err.Error())
		return
	}
	jimengMu.Lock()
	jimengLoggedIn = false
	jimengMu.Unlock()
	OK(w, map[string]any{"logged_out": true})
}

var urlRegex = regexp.MustCompile(`https?://[^\s"'<>\]]+\.(?:jpg|jpeg|png|webp|gif|mp4|mov|webm)(?:\?[^\s"'<>\]]*)?`)

func extractURLs(output string) []string {
	matches := urlRegex.FindAllString(output, -1)
	seen := make(map[string]bool)
	var result []string
	for _, u := range matches {
		u = strings.TrimRight(u, ".,;:!?)")
		if !seen[u] {
			seen[u] = true
			result = append(result, u)
		}
	}
	return result
}
