package handler

import (
	"encoding/json"
	"net/http"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
	"github.com/basketikun/infinite-canvas/ws"
)


func broadcastRolesChanged() {
	roles, err := service.GetAllRoles()
	if err != nil {
		return
	}
	ws.DefaultHub.BroadcastJSON(map[string]any{
		"type": "roles-changed",
		"data": roles,
	})
}

func ListRoles(w http.ResponseWriter, r *http.Request) {
	q := parseQuery(r)
	page := q.Page
	if page < 1 {
		page = 1
	}
	pageSize := q.PageSize
	if pageSize < 1 {
		pageSize = 20
	}
	result, err := service.ListRoles(q.Keyword, page, pageSize)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func GetAllRoles(w http.ResponseWriter, r *http.Request) {
	result, err := service.GetAllRoles()
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func CreateRole(w http.ResponseWriter, r *http.Request) {
	var role model.Role
	if err := json.NewDecoder(r.Body).Decode(&role); err != nil {
		Fail(w, "参数错误")
		return
	}
	if role.Name == "" || role.Label == "" {
		Fail(w, "角色标识和名称不能为空")
		return
	}
	result, err := service.CreateRole(role)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
	broadcastRolesChanged()
}

func UpdateRole(w http.ResponseWriter, r *http.Request, id string) {
	if id == "" {
		Fail(w, "缺少ID")
		return
	}
	var role model.Role
	if err := json.NewDecoder(r.Body).Decode(&role); err != nil {
		Fail(w, "参数错误")
		return
	}
	result, err := service.UpdateRole(id, role)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
	broadcastRolesChanged()
}

func DeleteRole(w http.ResponseWriter, r *http.Request, id string) {
	if id == "" {
		Fail(w, "缺少ID")
		return
	}
	if err := service.DeleteRole(id); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
	broadcastRolesChanged()
}

func BatchDeleteRoles(w http.ResponseWriter, r *http.Request) {
	var request struct {
		IDs []string `json:"ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		Fail(w, "参数错误")
		return
	}
	if len(request.IDs) == 0 {
		Fail(w, "请选择要删除的记录")
		return
	}
	if err := service.BatchDeleteRoles(request.IDs); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}
