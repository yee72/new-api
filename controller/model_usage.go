package controller

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

// GetModelUsageModels 模型使用落地页目录。
// 排序 = 当前用户近 7 天用量 + 管理员手动增量（各用户独立，互不影响）。
func GetModelUsageModels(c *gin.Context) {
	userId := common.GetContextKeyInt(c, constant.ContextKeyUserId)
	result, err := service.GetModelUsageCatalog(
		userId,
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
