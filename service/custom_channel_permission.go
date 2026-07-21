package service

import (
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func normalizePermissionPolicy(policy model.PermissionPolicy) model.PermissionPolicy {
	switch policy {
	case model.PermissionPolicyEnabled, model.PermissionPolicyDisabled:
		return policy
	default:
		return model.PermissionPolicyInherit
	}
}

func applyPermissionPolicy(fallback bool, policy model.PermissionPolicy) bool {
	switch normalizePermissionPolicy(policy) {
	case model.PermissionPolicyEnabled:
		return true
	case model.PermissionPolicyDisabled:
		return false
	default:
		return fallback
	}
}

// ResolveCustomChannelPermission applies the documented priority order:
// user override > role override > system setting.
func ResolveCustomChannelPermission(systemAllowed bool, rolePolicy, userPolicy model.PermissionPolicy) bool {
	roleAllowed := applyPermissionPolicy(systemAllowed, rolePolicy)
	return applyPermissionPolicy(roleAllowed, userPolicy)
}

func IsUserCustomChannelAllowed(user model.User) bool {
	systemAllowed := false
	if settings, err := GetSystemSettings(); err == nil {
		systemAllowed = settings.AllowCustomChannel
	}

	rolePolicy := model.PermissionPolicyInherit
	if role, ok, err := repository.GetRoleByName(string(user.Role)); err == nil && ok {
		rolePolicy = role.CustomChannelPolicy
	}
	return ResolveCustomChannelPermission(systemAllowed, rolePolicy, user.CustomChannelPolicy)
}
