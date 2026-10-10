package model

import (
	"gorm.io/gorm"
)

// ModelUsageRequestTotal 近窗口内按请求次数汇总的模型用量
type ModelUsageRequestTotal struct {
	ModelName  string `json:"model_name"`
	TotalCount int64  `json:"total_count"`
}

// GetModelUsageRequestTotals 按成功请求次数汇总（模型使用落地页热度）
func GetModelUsageRequestTotals(startTime int64, endTime int64) ([]ModelUsageRequestTotal, error) {
	var rows []ModelUsageRequestTotal
	query := DB.Table("quota_data").
		Select("model_name, sum(count) as total_count").
		Where("model_name <> ''").
		Group("model_name").
		Having("sum(count) > 0").
		Order("total_count DESC")
	query = applyModelUsageTimeRange(query, startTime, endTime)
	err := query.Find(&rows).Error
	return rows, err
}

func applyModelUsageTimeRange(query *gorm.DB, startTime int64, endTime int64) *gorm.DB {
	if startTime > 0 {
		query = query.Where("created_at >= ?", startTime)
	}
	if endTime > 0 {
		query = query.Where("created_at <= ?", endTime)
	}
	return query
}
