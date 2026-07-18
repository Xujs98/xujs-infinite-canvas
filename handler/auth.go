package handler

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
	"github.com/basketikun/infinite-canvas/ws"
)

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type registerRequest struct {
	Username         string `json:"username"`
	Password         string `json:"password"`
	AffCode          string `json:"affCode"`
	Email            string `json:"email"`
	VerificationCode string `json:"verificationCode"`
}

type registrationEmailCodeRequest struct {
	Email string `json:"email"`
}

type emailCodeLoginRequest struct {
	Email            string `json:"email"`
	VerificationCode string `json:"verificationCode"`
}

type bindAffCodeRequest struct {
	AffCode string `json:"affCode"`
}

type saveUserRequest struct {
	ID                  string           `json:"id"`
	Username            string           `json:"username"`
	Password            string           `json:"password"`
	Email               string           `json:"email"`
	DisplayName         string           `json:"displayName"`
	Role                model.UserRole   `json:"role"`
	Status              model.UserStatus `json:"status"`
	MembershipExpiresAt string           `json:"membershipExpiresAt"`
}

type adjustUserCreditsRequest struct {
	Credits int `json:"credits"`
}

func Register(w http.ResponseWriter, r *http.Request) {
	var request registerRequest
	_ = json.NewDecoder(r.Body).Decode(&request)
	session, err := service.Register(request.Username, request.Password, request.AffCode, request.Email, request.VerificationCode)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, session)
}

func SendRegistrationEmailCode(w http.ResponseWriter, r *http.Request) {
	var request registrationEmailCodeRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		Fail(w, "参数错误")
		return
	}
	if err := service.SendRegistrationEmailCode(request.Email, r.RemoteAddr); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}

func SendLoginEmailCode(w http.ResponseWriter, r *http.Request) {
	var request registrationEmailCodeRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		Fail(w, "参数错误")
		return
	}
	if err := service.SendLoginEmailCode(request.Email, r.RemoteAddr); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}

func LoginWithEmailCode(w http.ResponseWriter, r *http.Request) {
	var request emailCodeLoginRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		Fail(w, "参数错误")
		return
	}
	session, err := service.LoginWithEmailCode(request.Email, request.VerificationCode)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, session)
}

func BindAffCode(w http.ResponseWriter, r *http.Request) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录")
		return
	}
	var request bindAffCodeRequest
	_ = json.NewDecoder(r.Body).Decode(&request)
	updated, err := service.BindAffCode(user.ID, request.AffCode)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, updated)
}

func Login(w http.ResponseWriter, r *http.Request) {
	var request loginRequest
	_ = json.NewDecoder(r.Body).Decode(&request)
	session, err := service.Login(request.Username, request.Password)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, session)
}

func LinuxDoAuthorize(w http.ResponseWriter, r *http.Request) {
	authURL, err := service.LinuxDoAuthorizeURL(r, r.URL.Query().Get("redirect"))
	if err != nil {
		FailError(w, err)
		return
	}
	http.Redirect(w, r, authURL, http.StatusFound)
}

func LinuxDoCallback(w http.ResponseWriter, r *http.Request) {
	session, redirect, err := service.LoginWithLinuxDo(r, r.URL.Query().Get("code"), r.URL.Query().Get("state"))
	if err != nil {
		http.Redirect(w, r, loginRedirect(r, redirect, "", err.Error()), http.StatusFound)
		return
	}
	http.Redirect(w, r, loginRedirect(r, redirect, session.Token, ""), http.StatusFound)
}

func AdminLogin(w http.ResponseWriter, r *http.Request) {
	var request loginRequest
	_ = json.NewDecoder(r.Body).Decode(&request)
	session, err := service.Login(request.Username, request.Password)
	if err != nil {
		FailError(w, err)
		return
	}
	if session.User.Role != model.UserRoleAdmin {
		Fail(w, "需要管理员权限")
		return
	}
	OK(w, session)
}

func CurrentUser(w http.ResponseWriter, r *http.Request) {
	if user, ok := service.UserFromContext(r.Context()); ok {
		OK(w, user)
		return
	}
	OK(w, service.GuestUser())
}

func AdminUsers(w http.ResponseWriter, r *http.Request) {
	users, err := service.ListUsers(parseQuery(r))
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, users)
}

func AdminUserDetail(w http.ResponseWriter, r *http.Request, id string) {
	result, err := service.GetAdminUserDetail(id)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminUserCreditLogs(w http.ResponseWriter, r *http.Request, id string) {
	result, err := service.ListUserCreditLogs(id, parseQuery(r))
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminSaveUser(w http.ResponseWriter, r *http.Request) {
	var request saveUserRequest
	_ = json.NewDecoder(r.Body).Decode(&request)
	user, err := service.SaveUser(model.User{
		ID:                  request.ID,
		Username:            request.Username,
		Email:               request.Email,
		DisplayName:         request.DisplayName,
		Role:                request.Role,
		Status:              request.Status,
		MembershipExpiresAt: request.MembershipExpiresAt,
	}, request.Password)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, user)
}

func AdminAdjustUserCredits(w http.ResponseWriter, r *http.Request, id string) {
	var request adjustUserCreditsRequest
	_ = json.NewDecoder(r.Body).Decode(&request)
	user, err := service.AdjustUserCredits(id, request.Credits)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, user)
	ws.DefaultHub.SendToUser(id, map[string]any{"type": "credits-changed"})
}

func AdminCreditLogs(w http.ResponseWriter, r *http.Request) {
	logs, err := service.ListCreditLogs(parseQuery(r))
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, logs)
}

func AdminSaveCreditLog(w http.ResponseWriter, r *http.Request) {
	var log model.CreditLog
	_ = json.NewDecoder(r.Body).Decode(&log)
	result, err := service.SaveCreditLog(log)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminDeleteCreditLog(w http.ResponseWriter, r *http.Request, id string) {
	if err := service.DeleteCreditLog(id); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}

func UpdateProfile(w http.ResponseWriter, r *http.Request) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	var request struct {
		DisplayName      string `json:"displayName"`
		Password         string `json:"password"`
		VerificationCode string `json:"verificationCode"`
	}
	_ = json.NewDecoder(r.Body).Decode(&request)
	updated, err := service.UpdateProfile(user.ID, request.DisplayName, request.Password, request.VerificationCode)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, updated)
}

func SendPasswordChangeEmailCode(w http.ResponseWriter, r *http.Request) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	if err := service.SendPasswordChangeEmailCode(user.ID, r.RemoteAddr); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}

func UserCreditLogs(w http.ResponseWriter, r *http.Request) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录")
		return
	}
	q := parseQuery(r)
	logs, err := service.ListVisibleUserCreditLogs(user.ID, q)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, logs)
}

func AdminBatchDeleteCreditLogs(w http.ResponseWriter, r *http.Request) {
	var request struct {
		IDs []string `json:"ids"`
	}
	_ = json.NewDecoder(r.Body).Decode(&request)
	if len(request.IDs) == 0 {
		Fail(w, "请选择要删除的日志")
		return
	}
	if err := service.BatchDeleteCreditLogs(request.IDs); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}

func loginRedirect(r *http.Request, redirect string, token string, message string) string {
	values := url.Values{}
	if strings.TrimSpace(token) != "" {
		values.Set("token", token)
	}
	if strings.TrimSpace(message) != "" {
		values.Set("error", message)
	}
	if strings.TrimSpace(redirect) != "" {
		values.Set("redirect", redirect)
	}
	return service.RequestOrigin(r) + "/login?" + values.Encode()
}

func AdminDeleteUser(w http.ResponseWriter, r *http.Request, id string) {
	if err := service.DeleteUser(id); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}

func AdminBatchDeleteUsers(w http.ResponseWriter, r *http.Request) {
	var request struct {
		IDs []string `json:"ids"`
	}
	_ = json.NewDecoder(r.Body).Decode(&request)
	if len(request.IDs) == 0 {
		Fail(w, "请选择要删除的用户")
		return
	}
	if err := service.BatchDeleteUsers(request.IDs); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}

func AdminBatchUpdateUserStatus(w http.ResponseWriter, r *http.Request) {
	var request struct {
		IDs    []string         `json:"ids"`
		Status model.UserStatus `json:"status"`
	}
	_ = json.NewDecoder(r.Body).Decode(&request)
	if len(request.IDs) == 0 {
		Fail(w, "请选择要操作的用户")
		return
	}
	if request.Status != model.UserStatusActive && request.Status != model.UserStatusBan {
		Fail(w, "无效的状态值")
		return
	}
	if err := service.BatchUpdateUserStatus(request.IDs, request.Status); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}
