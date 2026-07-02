package router

import (
	"net/http"
	"os"

	"github.com/basketikun/infinite-canvas/handler"
	"github.com/basketikun/infinite-canvas/middleware"
	"github.com/basketikun/infinite-canvas/seedance"
	"github.com/gin-gonic/gin"
)

func New() *gin.Engine {
	router := gin.Default()
	router.RedirectTrailingSlash = false
	_ = router.SetTrustedProxies(nil)
	api := router.Group("/api")
	api.GET("/health", func(c *gin.Context) {
		c.String(http.StatusOK, "ok")
	})
	api.POST("/auth/register", gin.WrapF(handler.Register))
	api.POST("/auth/login", gin.WrapF(handler.Login))
	api.GET("/auth/linux-do/authorize", gin.WrapF(handler.LinuxDoAuthorize))
	api.GET("/auth/linux-do/callback", gin.WrapF(handler.LinuxDoCallback))
	api.GET("/auth/me", middleware.OptionalAuth, gin.WrapF(handler.CurrentUser))
	api.GET("/settings", gin.WrapF(handler.Settings))
	api.GET("/media/references/:id", func(c *gin.Context) {
		handler.ReferenceMedia(c.Writer, c.Request, c.Param("id"))
	})
	api.HEAD("/media/references/:id", func(c *gin.Context) {
		handler.ReferenceMedia(c.Writer, c.Request, c.Param("id"))
	})
	v1 := api.Group("/v1", middleware.UserAuth)
	v1.POST("/images/generations", gin.WrapF(handler.AIImagesGenerations))
	v1.POST("/images/edits", gin.WrapF(handler.AIImagesEdits))
	v1.POST("/image-tasks/generations", gin.WrapF(handler.CreateImageGenerationTask))
	v1.POST("/image-tasks/edits", gin.WrapF(handler.CreateImageEditTask))
	v1.POST("/video-tasks", gin.WrapF(handler.CreateVideoGenerationTask))
	v1.GET("/generation-tasks/:id", func(c *gin.Context) {
		handler.GetGenerationTask(c.Writer, c.Request, c.Param("id"))
	})
	v1.POST("/chat/completions", gin.WrapF(handler.AIChatCompletions))
	v1.POST("/audio/speech", gin.WrapF(handler.AIAudioSpeech))
	v1.POST("/videos", gin.WrapF(handler.AIVideos))
	v1.POST("/media/references", gin.WrapF(handler.UploadReferenceMedia))
	v1.POST("/redeem-code", gin.WrapF(handler.RedeemCode))
	v1.PUT("/profile", gin.WrapF(handler.UpdateProfile))
	v1.POST("/bind-aff-code", gin.WrapF(handler.BindAffCode))
	v1.GET("/credit-logs", gin.WrapF(handler.UserCreditLogs))
	v1.POST("/credits/consume", gin.WrapF(handler.ConsumeCredits))
	v1.POST("/credits/refund", gin.WrapF(handler.RefundCredits))
	v1.POST("/checkin", gin.WrapF(handler.DailyCheckIn))
	v1.GET("/checkin/month", gin.WrapF(handler.GetCheckInMonth))
	v1.POST("/request-logs", gin.WrapF(handler.SubmitAppRequestLog))
	v1.GET("/videos/:id", func(c *gin.Context) {
		handler.AIVideo(c.Writer, c.Request, c.Param("id"))
	})
	v1.GET("/videos/:id/content", func(c *gin.Context) {
		handler.AIVideoContent(c.Writer, c.Request, c.Param("id"))
	})

	// Jimeng (即梦) CLI integration
	api.GET("/jimeng/status", gin.WrapF(handler.JimengStatus))
	api.GET("/jimeng/credit", middleware.UserAuth, gin.WrapF(handler.JimengCredit))
	api.POST("/jimeng/login/start", gin.WrapF(handler.JimengLoginStart))
	api.GET("/jimeng/login/status", gin.WrapF(handler.JimengLoginStatus))
	api.POST("/jimeng/logout", gin.WrapF(handler.JimengLogout))
	api.POST("/jimeng/generate/image", middleware.UserAuth, gin.WrapF(handler.JimengGenerateImage))
	api.POST("/jimeng/generate/video", middleware.UserAuth, gin.WrapF(handler.JimengGenerateVideo))
	api.GET("/jimeng/task/:id", middleware.UserAuth, func(c *gin.Context) {
		handler.JimengTaskStatus(c.Writer, c.Request, c.Param("id"))
	})
	api.POST("/jimeng/query-media", middleware.UserAuth, gin.WrapF(handler.JimengQueryMedia))
	api.GET("/prompts", middleware.OptionalAuth, gin.WrapF(handler.Prompts))
	api.GET("/prompt-presets", middleware.OptionalAuth, gin.WrapF(handler.PromptPresets))
	api.GET("/ai-text-agents", middleware.OptionalAuth, gin.WrapF(handler.AITextAgents))
	api.GET("/assets", middleware.OptionalAuth, gin.WrapF(handler.Assets))
	api.GET("/system-settings", gin.WrapF(handler.GetPublicSystemSettings))
	api.GET("/available-models", gin.WrapF(handler.GetPublicAvailableModels))
	v1.GET("/channels", gin.WrapF(handler.GetPublicChannels))
	v1.GET("/model-classifications", gin.WrapF(handler.GetPublicModelClassifications))
	api.GET("/ws", gin.WrapF(handler.HandleWebSocket))
	api.POST("/admin/login", gin.WrapF(handler.AdminLogin))

	admin := api.Group("/admin", middleware.AdminAuth)
	admin.GET("/users", gin.WrapF(handler.AdminUsers))
	admin.POST("/users", gin.WrapF(handler.AdminSaveUser))
	admin.POST("/users/:id/credits", func(c *gin.Context) {
		handler.AdminAdjustUserCredits(c.Writer, c.Request, c.Param("id"))
	})
	admin.POST("/users/batch-delete", gin.WrapF(handler.AdminBatchDeleteUsers))
	admin.POST("/users/batch-status", gin.WrapF(handler.AdminBatchUpdateUserStatus))
	admin.DELETE("/users/:id", func(c *gin.Context) {
		handler.AdminDeleteUser(c.Writer, c.Request, c.Param("id"))
	})
	admin.GET("/credit-logs", gin.WrapF(handler.AdminCreditLogs))
	admin.POST("/credit-logs", gin.WrapF(handler.AdminSaveCreditLog))
	admin.POST("/credit-logs/batch-delete", gin.WrapF(handler.AdminBatchDeleteCreditLogs))
	admin.DELETE("/credit-logs/:id", func(c *gin.Context) {
		handler.AdminDeleteCreditLog(c.Writer, c.Request, c.Param("id"))
	})
	admin.GET("/settings", gin.WrapF(handler.AdminSettings))
	admin.POST("/settings", gin.WrapF(handler.AdminSaveSettings))
	admin.GET("/settings/channel-models", gin.WrapF(handler.AdminAllChannelModels))
	admin.POST("/settings/channel-models", gin.WrapF(handler.AdminChannelModels))
	admin.POST("/settings/channel-test", gin.WrapF(handler.AdminTestChannelModel))
	admin.GET("/settings/channel-request-logs", gin.WrapF(handler.HandleGetChannelRequestLogs))
	admin.GET("/system-settings", gin.WrapF(handler.AdminGetSystemSettings))
	admin.POST("/system-settings", gin.WrapF(handler.AdminSaveSystemSettings))
	admin.POST("/system-settings/logo", gin.WrapF(handler.AdminUploadLogo))
	admin.DELETE("/system-settings/logo", gin.WrapF(handler.AdminRemoveLogo))
	admin.GET("/prompt-categories", gin.WrapF(handler.AdminPromptCategories))
	admin.POST("/prompt-categories/sync", gin.WrapF(handler.AdminSyncPromptCategories))
	admin.GET("/prompts", gin.WrapF(handler.AdminPrompts))
	admin.POST("/prompts", gin.WrapF(handler.AdminSavePrompt))
	admin.POST("/prompts/batch-delete", gin.WrapF(handler.AdminDeletePrompts))
	admin.DELETE("/prompts/:id", func(c *gin.Context) {
		handler.AdminDeletePrompt(c.Writer, c.Request, c.Param("id"))
	})
	admin.GET("/prompt-presets", gin.WrapF(handler.AdminPromptPresets))
	admin.POST("/prompt-presets", gin.WrapF(handler.AdminSavePromptPreset))
	admin.POST("/prompt-presets/batch-delete", gin.WrapF(handler.AdminDeletePromptPresets))
	admin.DELETE("/prompt-presets/:id", func(c *gin.Context) {
		handler.AdminDeletePromptPreset(c.Writer, c.Request, c.Param("id"))
	})
	admin.GET("/ai-text-agents", gin.WrapF(handler.AdminAITextAgents))
	admin.POST("/ai-text-agents", gin.WrapF(handler.AdminSaveAITextAgent))
	admin.POST("/ai-text-agents/batch-delete", gin.WrapF(handler.AdminDeleteAITextAgents))
	admin.DELETE("/ai-text-agents/:id", func(c *gin.Context) {
		handler.AdminDeleteAITextAgent(c.Writer, c.Request, c.Param("id"))
	})
	admin.GET("/assets", gin.WrapF(handler.AdminAssets))
	admin.POST("/assets", gin.WrapF(handler.AdminSaveAsset))
	admin.DELETE("/assets/:id", func(c *gin.Context) {
		handler.AdminDeleteAsset(c.Writer, c.Request, c.Param("id"))
	})
	admin.GET("/redeem-codes", gin.WrapF(handler.AdminRedeemCodes))
	admin.POST("/redeem-codes/generate", gin.WrapF(handler.AdminGenerateRedeemCodes))
	admin.POST("/redeem-codes/batch-delete", gin.WrapF(handler.AdminBatchDeleteRedeemCodes))
	admin.DELETE("/redeem-codes/:id", func(c *gin.Context) {
		handler.AdminDeleteRedeemCode(c.Writer, c.Request, c.Param("id"))
	})
	admin.GET("/announcements", gin.WrapF(handler.AdminAnnouncements))
	admin.POST("/announcements", gin.WrapF(handler.AdminSaveAnnouncement))
	admin.DELETE("/announcements/:id", func(c *gin.Context) {
		handler.AdminDeleteAnnouncement(c.Writer, c.Request, c.Param("id"))
	})
	admin.POST("/announcements/batch-delete", gin.WrapF(handler.AdminBatchDeleteAnnouncements))
	admin.POST("/announcements/batch-pinned", gin.WrapF(handler.AdminBatchUpdateAnnouncementPinned))
	admin.GET("/agent/status", gin.WrapF(handler.AdminAgentStatus))
	admin.POST("/agent/start", gin.WrapF(handler.AdminAgentStart))
	admin.POST("/agent/stop", gin.WrapF(handler.AdminAgentStop))
	admin.GET("/agent/settings", gin.WrapF(handler.AdminGetAgentSettings))
	admin.POST("/agent/settings", gin.WrapF(handler.AdminSaveAgentSettings))
	admin.GET("/call-logs", gin.WrapF(handler.AdminCallLogs))
	admin.POST("/call-logs/batch-delete", gin.WrapF(handler.AdminBatchDeleteCallLogs))
	admin.GET("/request-logs", gin.WrapF(handler.AdminRequestLogs))
	admin.POST("/request-logs/batch-delete", gin.WrapF(handler.AdminBatchDeleteRequestLogs))
	admin.GET("/tasks", gin.WrapF(handler.AdminGenerationTasks))
	admin.GET("/model-classifications", gin.WrapF(handler.ListModelClassifications))
	admin.POST("/model-classifications", gin.WrapF(handler.CreateModelClassification))
	admin.PUT("/model-classifications/:id", func(c *gin.Context) {
		handler.UpdateModelClassification(c.Writer, c.Request, c.Param("id"))
	})
	admin.DELETE("/model-classifications/:id", func(c *gin.Context) {
		handler.DeleteModelClassification(c.Writer, c.Request, c.Param("id"))
	})
	admin.POST("/model-classifications/batch-delete", gin.WrapF(handler.BatchDeleteModelClassifications))
	admin.GET("/roles", gin.WrapF(handler.ListRoles))
	admin.POST("/roles", gin.WrapF(handler.CreateRole))
	admin.PUT("/roles/:id", func(c *gin.Context) {
		handler.UpdateRole(c.Writer, c.Request, c.Param("id"))
	})
	admin.DELETE("/roles/:id", func(c *gin.Context) {
		handler.DeleteRole(c.Writer, c.Request, c.Param("id"))
	})
	admin.POST("/roles/batch-delete", gin.WrapF(handler.BatchDeleteRoles))
	api.GET("/roles", gin.WrapF(handler.GetAllRoles))
	api.GET("/proxy-image", gin.WrapF(handler.ProxyImage))
	api.GET("/model-classifications/map", gin.WrapF(handler.GetModelClassificationsMap))
	api.GET("/model-classifications/all", gin.WrapF(handler.GetAllModelClassifications))
	api.Any("/agent/*path", gin.WrapF(handler.AgentProxy))
	api.GET("/announcements", gin.WrapF(handler.PublicAnnouncements))

	// 视频脚本创作助手
	workDir, _ := os.Getwd()
	seedanceGroup := api.Group("/seedance")
	seedanceGroup.Use(func(c *gin.Context) {
		c.Set("workDir", workDir)
		c.Next()
	}, middleware.OptionalAuth)
	seedanceGroup.GET("/ws", func(c *gin.Context) { seedance.HandleWS(c) })
	seedanceGroup.GET("/health", func(c *gin.Context) { seedance.HandleHealth(c) })
	seedanceGroup.GET("/output", func(c *gin.Context) { seedance.HandleOutput(c) })
	seedanceGroup.POST("/upload", middleware.UserAuth, func(c *gin.Context) { seedance.HandleUpload(c) })
	seedanceGroup.GET("/output/*filepath", func(c *gin.Context) { seedance.HandleOutputFile(c) })

	router.NoRoute(middleware.NotFoundJSON)

	return router
}
