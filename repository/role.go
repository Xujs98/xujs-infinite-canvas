package repository

import "github.com/basketikun/infinite-canvas/model"

func ListRoles(keyword string, page, pageSize int) (model.RoleList, error) {
	db, err := DB()
	if err != nil {
		return model.RoleList{}, err
	}
	var total int64
	q := db.Model(&model.Role{})
	if keyword != "" {
		like := "%" + keyword + "%"
		q = q.Where("name LIKE ? OR label LIKE ?", like, like)
	}
	if err := q.Count(&total).Error; err != nil {
		return model.RoleList{}, err
	}
	var items []model.Role
	if err := q.Order("is_builtin DESC, created_at DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&items).Error; err != nil {
		return model.RoleList{}, err
	}
	return model.RoleList{Items: items, Total: int(total)}, nil
}

func GetAllRoles() ([]model.Role, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	var items []model.Role
	if err := db.Order("is_builtin DESC, created_at DESC").Find(&items).Error; err != nil {
		return nil, err
	}
	return items, nil
}

func GetRoleByName(name string) (model.Role, bool, error) {
	db, err := DB()
	if err != nil {
		return model.Role{}, false, err
	}
	var item model.Role
	if err := db.Where("name = ?", name).First(&item).Error; err != nil {
		return model.Role{}, false, err
	}
	return item, true, nil
}

func SaveRole(item model.Role) (model.Role, error) {
	db, err := DB()
	if err != nil {
		return model.Role{}, err
	}
	if err := db.Save(&item).Error; err != nil {
		return model.Role{}, err
	}
	return item, nil
}

func DeleteRole(id string) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Delete(&model.Role{}, "id = ? AND is_builtin = ?", id, false).Error
}

func BatchDeleteRoles(ids []string) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Where("id IN ? AND is_builtin = ?", ids, false).Delete(&model.Role{}).Error
}

func CountRoles() (int64, error) {
	db, err := DB()
	if err != nil {
		return 0, err
	}
	var count int64
	err = db.Model(&model.Role{}).Count(&count).Error
	return count, err
}
