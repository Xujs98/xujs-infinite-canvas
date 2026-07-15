package repository

import (
	"errors"
	"strings"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
)

// ListUsers 分页查询用户。
func ListUsers(q model.Query) ([]model.User, int64, error) {
	db, err := DB()
	if err != nil {
		return nil, 0, err
	}
	q.Normalize()
	tx := db.Model(&model.User{})
	if keyword := strings.TrimSpace(q.Keyword); keyword != "" {
		like := "%" + keyword + "%"
		tx = tx.Where("username LIKE ? OR display_name LIKE ? OR email LIKE ? OR linux_do_id LIKE ?", like, like, like, like)
	}
	if q.Role != "" {
		tx = tx.Where("role = ?", q.Role)
	}
	if q.Status != "" {
		tx = tx.Where("status = ?", q.Status)
	}

	var total int64
	if err := tx.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var users []model.User
	err = tx.Order("created_at desc").Offset(q.Offset()).Limit(q.PageSize).Find(&users).Error
	return users, total, err
}

// CountUsers 返回用户总数。
func CountUsers() (int64, error) {
	db, err := DB()
	if err != nil {
		return 0, err
	}
	var total int64
	return total, db.Model(&model.User{}).Count(&total).Error
}

// HasAdmin 判断系统中是否存在管理员。
func HasAdmin() (bool, error) {
	db, err := DB()
	if err != nil {
		return false, err
	}
	var total int64
	err = db.Model(&model.User{}).Where("role = ?", model.UserRoleAdmin).Count(&total).Error
	return total > 0, err
}

// GetUserByID 根据 ID 查询用户。
func GetUserByID(id string) (model.User, bool, error) {
	db, err := DB()
	if err != nil {
		return model.User{}, false, err
	}
	return findUser(db, "id = ?", id)
}

// GetUserByUsername 根据用户名查询用户。
func GetUserByUsername(username string) (model.User, bool, error) {
	db, err := DB()
	if err != nil {
		return model.User{}, false, err
	}
	return findUser(db, "username = ?", username)
}

// SaveUser 保存用户信息。
func SaveUser(user model.User) (model.User, error) {
	db, err := DB()
	if err != nil {
		return user, err
	}
	return user, db.Save(&user).Error
}

func ConsumeUserCredits(id string, credits int, now string) (model.User, bool, error) {
	db, err := DB()
	if err != nil {
		return model.User{}, false, err
	}
	if credits <= 0 {
		user, ok, err := GetUserByID(id)
		return user, ok, err
	}
	tx := db.Model(&model.User{}).Where("id = ? AND credits >= ?", id, credits).Updates(map[string]any{
		"credits":    gorm.Expr("credits - ?", credits),
		"updated_at": now,
	})
	if tx.Error != nil {
		return model.User{}, false, tx.Error
	}
	user, ok, err := GetUserByID(id)
	return user, ok && tx.RowsAffected > 0, err
}

func RefundUserCredits(id string, credits int, now string) (model.User, bool, error) {
	db, err := DB()
	if err != nil {
		return model.User{}, false, err
	}
	if credits <= 0 {
		user, ok, err := GetUserByID(id)
		return user, ok, err
	}
	tx := db.Model(&model.User{}).Where("id = ?", id).Updates(map[string]any{
		"credits":    gorm.Expr("credits + ?", credits),
		"updated_at": now,
	})
	if tx.Error != nil {
		return model.User{}, false, tx.Error
	}
	user, ok, err := GetUserByID(id)
	return user, ok && tx.RowsAffected > 0, err
}

// SaveCreditLog 保存算力点变更流水。
func SaveCreditLog(log model.CreditLog) (model.CreditLog, error) {
	db, err := DB()
	if err != nil {
		return log, err
	}
	return log, db.Save(&log).Error
}

func ListCreditLogs(q model.Query) ([]model.CreditLog, int64, error) {
	db, err := DB()
	if err != nil {
		return nil, 0, err
	}
	q.Normalize()
	tx := db.Model(&model.CreditLog{})
	if keyword := strings.TrimSpace(q.Keyword); keyword != "" {
		like := "%" + keyword + "%"
		tx = tx.Where("user_id LIKE ? OR type LIKE ? OR remark LIKE ? OR related_id LIKE ?", like, like, like, like)
	}
	if logType := strings.TrimSpace(q.Type); logType != "" {
		switch logType {
		case string(model.CreditLogTypeOfflineConsume):
			tx = tx.Where("type = ? OR (type = ? AND related_id LIKE ?)", logType, model.CreditLogTypeAIConsume, "offline:%")
		case string(model.CreditLogTypeOfflineRefund):
			tx = tx.Where("type = ? OR (type = ? AND related_id LIKE ?)", logType, model.CreditLogTypeAIRefund, "offline:%")
		case string(model.CreditLogTypeAIConsume):
			tx = tx.Where("type = ? AND (related_id = '' OR related_id NOT LIKE ?)", logType, "offline:%")
		case string(model.CreditLogTypeAIRefund):
			tx = tx.Where("type = ? AND (related_id = '' OR related_id NOT LIKE ?)", logType, "offline:%")
		default:
			tx = tx.Where("type = ?", logType)
		}
	}
	var total int64
	if err := tx.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var logs []model.CreditLog
	orderExpr := "created_at desc"
	if strings.EqualFold(strings.TrimSpace(config.Cfg.StorageDriver), "sqlite") || strings.TrimSpace(config.Cfg.StorageDriver) == "" {
		orderExpr = "datetime(created_at) desc, created_at desc"
	}
	err = tx.Order(orderExpr).Offset(q.Offset()).Limit(q.PageSize).Find(&logs).Error
	return logs, total, err
}

func DeleteCreditLog(id string) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Delete(&model.CreditLog{}, "id = ?", id).Error
}

func BatchDeleteCreditLogs(ids []string) error {
	if len(ids) == 0 {
		return nil
	}
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Delete(&model.CreditLog{}, "id IN ?", ids).Error
}

// DeleteUser 删除指定用户。
func DeleteUser(id string) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Delete(&model.User{}, "id = ?", id).Error
}

// BatchDeleteUsers 批量删除用户。
func BatchDeleteUsers(ids []string) error {
	if len(ids) == 0 {
		return nil
	}
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Delete(&model.User{}, "id IN ?", ids).Error
}

// BatchUpdateUserStatus 批量更新用户状态。
func BatchUpdateUserStatus(ids []string, status model.UserStatus) error {
	if len(ids) == 0 {
		return nil
	}
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Model(&model.User{}).Where("id IN ?", ids).Update("status", status).Error
}

// GetUserByAffCode 根据邀请码查询用户。
func GetUserByAffCode(code string) (model.User, bool, error) {
	db, err := DB()
	if err != nil {
		return model.User{}, false, err
	}
	return findUser(db, "aff_code = ?", code)
}

// GetUserByLinuxDoID 根据 Linux.do ID 查询用户。
func GetUserByLinuxDoID(id string) (model.User, bool, error) {
	db, err := DB()
	if err != nil {
		return model.User{}, false, err
	}
	return findUser(db, "linux_do_id = ?", id)
}

// GetUsersByIDs 批量查询用户，返回 id -> username 映射。
func GetUsersByIDs(ids []string) (map[string]string, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	db, err := DB()
	if err != nil {
		return nil, err
	}
	var users []model.User
	if err := db.Select("id, username").Where("id IN ?", ids).Find(&users).Error; err != nil {
		return nil, err
	}
	m := make(map[string]string, len(users))
	for _, u := range users {
		m[u.ID] = u.Username
	}
	return m, nil
}

// findUser 查询单个用户，并将未命中转换为 ok=false。
func findUser(db *gorm.DB, query string, args ...any) (model.User, bool, error) {
	user := model.User{}
	err := db.Where(query, args...).First(&user).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.User{}, false, nil
	}
	return user, err == nil, err
}
