package middleware

import (
	"net/http"
	"strings"

	"github.com/basketikun/infinite-canvas/handler"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
	"github.com/gin-gonic/gin"
)

func AdminAuth(c *gin.Context) {
	if rejectBlockedAccess(c) {
		return
	}
	user, ok := authUser(c)
	if !ok || user.Role != model.UserRoleAdmin {
		handler.Fail(c.Writer, "未登录或权限不足")
		c.Abort()
		return
	}
	c.Request = c.Request.WithContext(service.WithUser(c.Request.Context(), user))
	c.Next()
}

func UserAuth(c *gin.Context) {
	if rejectBlockedAccess(c) {
		return
	}
	user, ok := authUser(c)
	if !ok || user.Role == model.UserRoleGuest {
		handler.Fail(c.Writer, "未登录或权限不足")
		c.Abort()
		return
	}
	c.Request = c.Request.WithContext(service.WithUser(c.Request.Context(), user))
	c.Next()
}

func OptionalAuth(c *gin.Context) {
	if rejectBlockedAccess(c) {
		return
	}
	if user, ok := authUser(c); ok {
		c.Request = c.Request.WithContext(service.WithUser(c.Request.Context(), user))
	}
	c.Next()
}

func ClientRiskInspection(c *gin.Context) {
	user, _ := authUser(c)
	decision, err := service.InspectClientRiskSignals(c.Request, user)
	if err != nil {
		handler.FailError(c.Writer, err)
		c.Abort()
		return
	}
	if decision.Blocked {
		handler.Fail(c.Writer, decision.Message)
		c.Abort()
		return
	}
	c.Next()
}

func rejectBlockedAccess(c *gin.Context) bool {
	decision, err := service.CheckRequestAccess(c.Request)
	if err != nil {
		handler.FailError(c.Writer, err)
		c.Abort()
		return true
	}
	if decision.Blocked {
		user, _ := authUser(c)
		service.RecordRequestRisk(c.Request, user, "blocked_access_attempt", model.RiskLevelHigh, "access", "被封禁的访问来源继续请求服务端", map[string]any{"banKind": decision.Kind})
		handler.Fail(c.Writer, decision.Message)
		c.Abort()
		return true
	}
	return false
}

func NotFoundJSON(c *gin.Context) {
	c.JSON(http.StatusNotFound, gin.H{"code": 1, "data": nil, "msg": "接口不存在"})
}

func authUser(c *gin.Context) (model.AuthUser, bool) {
	token := strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer ")
	if strings.TrimSpace(token) == "" {
		return model.AuthUser{}, false
	}
	return service.CurrentAuthUser(token)
}
