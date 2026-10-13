package controller

import (
	"errors"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func GetModelUsageSession(c *gin.Context) {
	userId := common.GetContextKeyInt(c, constant.ContextKeyUserId)
	dto, err := service.GetModelUsageSessionDTO(userId, c.Param("model"))
	if err != nil {
		writeModelUsageSessionError(c, err)
		return
	}
	common.ApiSuccess(c, dto)
}

func PutModelUsageSession(c *gin.Context) {
	userId := common.GetContextKeyInt(c, constant.ContextKeyUserId)
	var body service.ModelUsageSessionDTO
	if err := common.DecodeJson(c.Request.Body, &body); err != nil {
		common.ApiErrorMsg(c, "invalid request body")
		return
	}
	dto, err := service.ReplaceModelUsageSession(userId, c.Param("model"), body)
	if err != nil {
		writeModelUsageSessionError(c, err)
		return
	}
	common.ApiSuccess(c, dto)
}

func PostModelUsageTurn(c *gin.Context) {
	userId := common.GetContextKeyInt(c, constant.ContextKeyUserId)
	var body service.ModelUsageTurnRequest
	if err := common.DecodeJson(c.Request.Body, &body); err != nil {
		common.ApiErrorMsg(c, "invalid request body")
		return
	}
	dto, err := service.CommitModelUsageTurn(c.Request.Context(), userId, c.Param("model"), body)
	if err != nil {
		writeModelUsageSessionError(c, err)
		return
	}
	common.ApiSuccess(c, dto)
}

func PostModelUsageRefreshVideo(c *gin.Context) {
	userId := common.GetContextKeyInt(c, constant.ContextKeyUserId)
	dto, err := service.RefreshModelUsageVideoTurn(
		c.Request.Context(),
		userId,
		c.Param("model"),
		c.Param("turnId"),
	)
	if err != nil {
		writeModelUsageSessionError(c, err)
		return
	}
	common.ApiSuccess(c, dto)
}

func GetModelUsageMedia(c *gin.Context) {
	userId := common.GetContextKeyInt(c, constant.ContextKeyUserId)
	rawKey := strings.TrimPrefix(c.Param("objectKey"), "/")
	objectKey, err := service.ResolveModelUsageMediaObjectKey(userId, rawKey, c.Query("access"))
	if err != nil {
		writeModelUsageSessionError(c, err)
		return
	}
	store := service.GetObjectBlobStore()
	if err := store.ServeObject(c, objectKey, ""); err != nil {
		writeModelUsageSessionError(c, err)
	}
}

func writeModelUsageSessionError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, service.ErrModelUsageInvalidRequest):
		common.ApiErrorMsg(c, err.Error())
	case errors.Is(err, service.ErrModelUsageObjectStoreRequired):
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
	case errors.Is(err, service.ErrModelUsageMediaForbidden):
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
	case errors.Is(err, gorm.ErrRecordNotFound):
		common.ApiErrorMsg(c, "session not found")
	case errors.Is(err, service.ErrTaskArtifactStoreDisabled):
		common.ApiErrorMsg(c, service.ErrModelUsageObjectStoreRequired.Error())
	default:
		common.ApiError(c, err)
	}
}
