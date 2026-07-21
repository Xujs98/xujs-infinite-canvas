package service

import (
	"testing"

	"github.com/basketikun/infinite-canvas/model"
)

func TestResolveCustomChannelPermissionPriority(t *testing.T) {
	tests := []struct {
		name          string
		systemAllowed bool
		rolePolicy    model.PermissionPolicy
		userPolicy    model.PermissionPolicy
		want          bool
	}{
		{name: "all inherit enabled system", systemAllowed: true, rolePolicy: model.PermissionPolicyInherit, userPolicy: model.PermissionPolicyInherit, want: true},
		{name: "all inherit disabled system", systemAllowed: false, rolePolicy: model.PermissionPolicyInherit, userPolicy: model.PermissionPolicyInherit, want: false},
		{name: "role enables over system", systemAllowed: false, rolePolicy: model.PermissionPolicyEnabled, userPolicy: model.PermissionPolicyInherit, want: true},
		{name: "role disables over system", systemAllowed: true, rolePolicy: model.PermissionPolicyDisabled, userPolicy: model.PermissionPolicyInherit, want: false},
		{name: "user enables over role", systemAllowed: false, rolePolicy: model.PermissionPolicyDisabled, userPolicy: model.PermissionPolicyEnabled, want: true},
		{name: "user disables over role", systemAllowed: true, rolePolicy: model.PermissionPolicyEnabled, userPolicy: model.PermissionPolicyDisabled, want: false},
		{name: "invalid values inherit", systemAllowed: true, rolePolicy: model.PermissionPolicy("invalid"), userPolicy: model.PermissionPolicy("invalid"), want: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := ResolveCustomChannelPermission(tt.systemAllowed, tt.rolePolicy, tt.userPolicy); got != tt.want {
				t.Fatalf("ResolveCustomChannelPermission() = %v, want %v", got, tt.want)
			}
		})
	}
}
