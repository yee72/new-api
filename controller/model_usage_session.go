package controller

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

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
	if expires := c.Query("expires"); expires != "" {
		expiresAt, parseErr := strconv.ParseInt(expires, 10, 64)
		if parseErr == nil && expiresAt > 0 && time.Now().Unix() > expiresAt {
			writeModelUsageMediaError(c, service.ErrModelUsageMediaExpired)
			return
		}
	}
	objectKey, err := service.ResolveModelUsageMediaObjectKey(userId, rawKey, c.Query("access"))
	if err != nil {
		writeModelUsageMediaError(c, err)
		return
	}
	store := service.GetObjectBlobStore()
	if err := store.ServeObject(c, objectKey, ""); err != nil {
		writeModelUsageMediaError(c, err)
	}
}

func PostModelUsageAttachment(c *gin.Context) {
	userId := common.GetContextKeyInt(c, constant.ContextKeyUserId)
	fileHeader, err := c.FormFile("file")
	if err != nil || fileHeader == nil {
		common.ApiErrorMsg(c, "file is required")
		return
	}
	file, err := fileHeader.Open()
	if err != nil {
		common.ApiErrorMsg(c, "invalid file")
		return
	}
	defer file.Close()
	contentType := fileHeader.Header.Get("Content-Type")
	attachment, err := service.UploadModelUsageAttachment(
		c.Request.Context(),
		userId,
		fileHeader.Filename,
		contentType,
		fileHeader.Size,
		file,
	)
	if err != nil {
		writeModelUsageSessionError(c, err)
		return
	}
	common.ApiSuccess(c, attachment)
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

// writeModelUsageMediaError：媒体响应不能用 200 JSON，否则 <img>/<video> 会当成损坏文件。
func writeModelUsageMediaError(c *gin.Context, err error) {
	c.Header("Cache-Control", "private, no-store")
	switch {
	case errors.Is(err, service.ErrModelUsageMediaForbidden):
		c.AbortWithStatus(http.StatusForbidden)
	case errors.Is(err, service.ErrModelUsageMediaExpired):
		c.AbortWithStatus(http.StatusGone)
	case errors.Is(err, service.ErrModelUsageInvalidRequest):
		c.AbortWithStatus(http.StatusBadRequest)
	case errors.Is(err, service.ErrModelUsageObjectStoreRequired),
		errors.Is(err, service.ErrTaskArtifactStoreDisabled):
		c.AbortWithStatus(http.StatusServiceUnavailable)
	default:
		c.AbortWithStatus(http.StatusNotFound)
	}
}
