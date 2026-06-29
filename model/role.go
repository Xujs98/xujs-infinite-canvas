package model

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
)

// Role 角色定义。
type Role struct {
	ID            string   `json:"id" gorm:"primaryKey"`
	Name          string   `json:"name" gorm:"uniqueIndex"`
	Label         string   `json:"label"`
	Description   string   `json:"description"`
	AllowedModels []string `json:"allowedModels" gorm:"serializer:json"`
	FreeModels    []string `json:"freeModels" gorm:"serializer:json"`
	IsBuiltin     bool     `json:"isBuiltin" gorm:"default:false"`
	CreatedAt     string   `json:"createdAt"`
	UpdatedAt     string   `json:"updatedAt"`
}

type RoleList struct {
	Items []Role `json:"items"`
	Total int    `json:"total"`
}

// AllowedModelsValue 实现 driver.Valuer 接口。
func (r Role) AllowedModelsValue() (driver.Value, error) {
	b, err := json.Marshal(r.AllowedModels)
	if err != nil {
		return nil, err
	}
	return string(b), nil
}

// Scan 实现 sql.Scanner 接口。
func (r *Role) Scan(src interface{}) error {
	if src == nil {
		return nil
	}
	switch v := src.(type) {
	case []byte:
		return json.Unmarshal(v, &r.AllowedModels)
	case string:
		return json.Unmarshal([]byte(v), &r.AllowedModels)
	default:
		return fmt.Errorf("cannot scan %T into Role.AllowedModels", src)
	}
}
