package controller

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

// GetModelUsageModels 公开模型使用落地页目录（按近 7 天请求次数+手动增量排序）
func GetModelUsageModels(c *gin.Context) {
	result, err := service.GetModelUsageCatalog(
		c.DefaultQuery("type", "all"),
		c.Query("q"),
		c.Query("vendor_ids"),
	)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, result)
}
