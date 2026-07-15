package repository

import (
	"errors"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
)

func ListAppReleases(q model.Query) (model.AppReleaseList, error) {
	db, err := DB()
	if err != nil {
		return model.AppReleaseList{}, err
	}
	q.Normalize()
	tx := db.Model(&model.AppRelease{})
	if keyword := strings.TrimSpace(q.Keyword); keyword != "" {
		like := "%" + keyword + "%"
		tx = tx.Where("version LIKE ? OR title LIKE ? OR notes LIKE ?", like, like, like)
	}
	if q.Status != "" {
		tx = tx.Where("status = ?", q.Status)
	}
	var total int64
	if err := tx.Count(&total).Error; err != nil {
		return model.AppReleaseList{}, err
	}
	var items []model.AppRelease
	err = tx.Preload("Artifacts").Order("created_at DESC").Offset(q.Offset()).Limit(q.PageSize).Find(&items).Error
	return model.AppReleaseList{Items: items, Total: total}, err
}

func GetAppRelease(id string) (model.AppRelease, error) {
	db, err := DB()
	if err != nil {
		return model.AppRelease{}, err
	}
	var item model.AppRelease
	err = db.Preload("Artifacts").First(&item, "id = ?", id).Error
	return item, err
}

func GetAppReleaseByVersion(version string) (model.AppRelease, bool, error) {
	db, err := DB()
	if err != nil {
		return model.AppRelease{}, false, err
	}
	var item model.AppRelease
	err = db.First(&item, "version = ?", version).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.AppRelease{}, false, nil
	}
	return item, err == nil, err
}

func GetLatestPublishedAppRelease() (model.AppRelease, error) {
	db, err := DB()
	if err != nil {
		return model.AppRelease{}, err
	}
	var item model.AppRelease
	err = db.Preload("Artifacts").Where("status = ?", model.AppReleaseStatusPublished).Order("published_at DESC, created_at DESC").First(&item).Error
	return item, err
}

func CreateAppRelease(item model.AppRelease) (model.AppRelease, error) {
	db, err := DB()
	if err != nil {
		return item, err
	}
	return item, db.Create(&item).Error
}

func SaveAppRelease(item model.AppRelease) (model.AppRelease, error) {
	db, err := DB()
	if err != nil {
		return item, err
	}
	return item, db.Omit("Artifacts").Save(&item).Error
}

func DeleteAppRelease(id string) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Delete(&model.AppReleaseArtifact{}, "release_id = ?", id).Error; err != nil {
			return err
		}
		result := tx.Delete(&model.AppRelease{}, "id = ?", id)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}
		return nil
	})
}

func GetAppReleaseArtifact(id string) (model.AppReleaseArtifact, error) {
	db, err := DB()
	if err != nil {
		return model.AppReleaseArtifact{}, err
	}
	var item model.AppReleaseArtifact
	err = db.First(&item, "id = ?", id).Error
	return item, err
}

func GetPublishedAppReleaseArtifact(id string) (model.AppReleaseArtifact, error) {
	db, err := DB()
	if err != nil {
		return model.AppReleaseArtifact{}, err
	}
	var item model.AppReleaseArtifact
	err = db.Table("app_release_artifacts AS artifact").Select("artifact.*").Joins("JOIN app_releases AS release ON release.id = artifact.release_id").Where("artifact.id = ? AND release.status = ?", id, model.AppReleaseStatusPublished).Scan(&item).Error
	if err == nil && item.ID == "" {
		err = gorm.ErrRecordNotFound
	}
	return item, err
}

func UpsertAppReleaseArtifact(item model.AppReleaseArtifact) (model.AppReleaseArtifact, *model.AppReleaseArtifact, error) {
	db, err := DB()
	if err != nil {
		return item, nil, err
	}
	var replaced *model.AppReleaseArtifact
	err = db.Transaction(func(tx *gorm.DB) error {
		var existing model.AppReleaseArtifact
		result := tx.Where("release_id = ? AND platform = ? AND arch = ?", item.ReleaseID, item.Platform, item.Arch).First(&existing)
		if result.Error == nil {
			replaced = &existing
			if err := tx.Delete(&existing).Error; err != nil {
				return err
			}
		} else if !errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return result.Error
		}
		return tx.Create(&item).Error
	})
	return item, replaced, err
}

func DeleteAppReleaseArtifact(id string) (model.AppReleaseArtifact, error) {
	db, err := DB()
	if err != nil {
		return model.AppReleaseArtifact{}, err
	}
	var item model.AppReleaseArtifact
	err = db.Transaction(func(tx *gorm.DB) error {
		if err := tx.First(&item, "id = ?", id).Error; err != nil {
			return err
		}
		return tx.Delete(&item).Error
	})
	return item, err
}
