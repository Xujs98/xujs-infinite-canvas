package model

// PermissionPolicy controls whether a feature inherits its parent setting or
// explicitly overrides it.
type PermissionPolicy string

const (
	PermissionPolicyInherit  PermissionPolicy = "inherit"
	PermissionPolicyEnabled  PermissionPolicy = "enabled"
	PermissionPolicyDisabled PermissionPolicy = "disabled"
)
