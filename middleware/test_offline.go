package middleware

import (
	"net/http"
	"strings"

	"github.com/basketikun/infinite-canvas/service"
	"github.com/gin-gonic/gin"
)

func TestOfflineMode(c *gin.Context) {
	if !service.TestOfflineMode() {
		c.Next()
		return
	}

	path := c.Request.URL.Path
	if path == "/api/health" || strings.HasPrefix(path, "/api/admin") {
		c.Next()
		return
	}

	c.JSON(http.StatusServiceUnavailable, gin.H{
		"code": 1,
		"data": nil,
		"msg":  "服务端测试离线中",
	})
	c.Abort()
}
