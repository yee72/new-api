package controller

import (
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

// GetModelUsageModels 公开模型使用落地页目录（按近 7 天请求次数+手动增量排序）
func GetModelUsageModels(c *gin.Context) {
	typeFilter := c.DefaultQuery("type", "all")
	keyword := c.Query("q")
	var vendorIDs []int
	if raw := strings.TrimSpace(c.Query("vendor_ids")); raw != "" {
		for part := range strings.SplitSeq(raw, ",") {
			part = strings.TrimSpace(part)
			if part == "" {
				continue
			}
			id, err := strconv.Atoi(part)
			if err != nil || id <= 0 {
				common.ApiErrorMsg(c, "invalid vendor_ids")
				return
			}
			vendorIDs = append(vendorIDs, id)
		}
	}

	result, err := service.GetModelUsageCatalog(typeFilter, keyword, vendorIDs)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, result)
}
