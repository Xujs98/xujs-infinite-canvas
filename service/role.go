package service

import (
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

// EnsureBuiltinRoles 确保内置角色存在。
func EnsureBuiltinRoles() {
	builtinRoles := []struct {
		name  string
		label string
		desc  string
	}{
		{"admin", "管理员", "系统管理员，拥有所有权限"},
		{"user", "用户", "普通注册用户"},
		{"member", "会员", "付费会员用户"},
	}
	for _, r := range builtinRoles {
		if _, ok, _ := repository.GetRoleByName(r.name); !ok {
			repository.SaveRole(model.Role{
				ID:                  newID("role"),
				Name:                r.name,
				Label:               r.label,
				Description:         r.desc,
				AllowedModels:       []string{},
				FreeModels:          []string{},
				CustomChannelPolicy: model.PermissionPolicyInherit,
				IsBuiltin:           true,
				CreatedAt:           now(),
				UpdatedAt:           now(),
			})
		}
	}
}

func ListRoles(keyword string, page, pageSize int) (model.RoleList, error) {
	result, err := repository.ListRoles(keyword, page, pageSize)
	if err != nil {
		return model.RoleList{}, err
	}
	for i := range result.Items {
		normalizeRolePermissions(&result.Items[i])
	}
	return result, nil
}

func GetAllRoles() ([]model.Role, error) {
	roles, err := repository.GetAllRoles()
	if err != nil {
		return nil, err
	}
	for i := range roles {
		normalizeRolePermissions(&roles[i])
	}
	return roles, nil
}

func CreateRole(role model.Role) (model.Role, error) {
	role.ID = newID("role")
	role.IsBuiltin = false
	normalizeRolePermissions(&role)
	normalizeRoleOfflineLimit(&role)
	role.CreatedAt = now()
	role.UpdatedAt = now()
	return repository.SaveRole(role)
}

func UpdateRole(id string, role model.Role) (model.Role, error) {
	db, dbErr := repository.DB()
	if dbErr != nil {
		return model.Role{}, dbErr
	}
	var current model.Role
	if err := db.First(&current, "id = ?", id).Error; err != nil {
		return model.Role{}, err
	}
	current.Label = role.Label
	current.Description = role.Description
	current.AllowedModels = role.AllowedModels
	current.FreeModels = role.FreeModels
	current.AllowOffline = role.AllowOffline
	current.OfflineCreditLimit = role.OfflineCreditLimit
	current.EnableTasks = role.EnableTasks
	current.CustomChannelPolicy = normalizePermissionPolicy(role.CustomChannelPolicy)
	normalizeRoleOfflineLimit(&current)
	current.UpdatedAt = now()
	return repository.SaveRole(current)
}

func DeleteRole(id string) error {
	return repository.DeleteRole(id)
}

func BatchDeleteRoles(ids []string) error {
	return repository.BatchDeleteRoles(ids)
}

// GetRoleAllowedModels 获取角色允许使用的模型列表，空列表表示允许全部。
func GetRoleAllowedModels(roleName string) ([]string, bool) {
	role, ok, _ := repository.GetRoleByName(roleName)
	if !ok {
		return nil, false
	}
	return role.AllowedModels, true
}

// GetRoleFreeModels 获取角色可免费使用的模型列表，空列表表示没有免费模型。
func GetRoleFreeModels(roleName string) ([]string, bool) {
	role, ok, _ := repository.GetRoleByName(roleName)
	if !ok {
		return nil, false
	}
	return role.FreeModels, true
}

// IsModelAllowedForRole 检查角色是否可以使用指定模型。
func IsModelAllowedForRole(roleName, modelName string) bool {
	allowed, ok := GetRoleAllowedModels(roleName)
	if !ok || len(allowed) == 0 {
		return true
	}
	for _, m := range allowed {
		if m == modelName {
			return true
		}
	}
	return false
}

// IsModelFreeForRole 检查角色是否可免费使用指定模型。
func IsModelFreeForRole(roleName, modelName string) bool {
	freeModels, ok := GetRoleFreeModels(roleName)
	if !ok || len(freeModels) == 0 {
		return false
	}
	for _, m := range freeModels {
		if m == modelName {
			return true
		}
	}
	return false
}

// IsRoleAllowedOffline 检查角色是否允许 App 在服务端断开后继续保留登录和离线扣费。
func IsRoleAllowedOffline(roleName string) bool {
	role, ok, _ := repository.GetRoleByName(roleName)
	return ok && role.AllowOffline
}

// IsRoleTasksEnabled 检查角色是否启用服务端任务持久化。
func IsRoleTasksEnabled(roleName string) bool {
	role, ok, _ := repository.GetRoleByName(roleName)
	return ok && role.EnableTasks
}

func IsUserTasksEnabled(userID string) bool {
	user, ok, _ := repository.GetUserByID(userID)
	return ok && IsRoleTasksEnabled(string(user.Role))
}

// GetRoleOfflineCreditLimit 获取角色允许离线时可预支的最大算力点；0 表示无限制。
func GetRoleOfflineCreditLimit(roleName string) int {
	role, ok, _ := repository.GetRoleByName(roleName)
	if !ok || !role.AllowOffline || role.OfflineCreditLimit <= 0 {
		return 0
	}
	return role.OfflineCreditLimit
}

func normalizeRoleOfflineLimit(role *model.Role) {
	if !role.AllowOffline || role.OfflineCreditLimit < 0 {
		role.OfflineCreditLimit = 0
	}
}

func normalizeRolePermissions(role *model.Role) {
	role.CustomChannelPolicy = normalizePermissionPolicy(role.CustomChannelPolicy)
}
