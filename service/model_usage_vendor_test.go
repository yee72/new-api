package service

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/model"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetModelUsageCatalogFiltersDisplayVendorIDs(t *testing.T) {
	modelUsageCacheMu.Lock()
	previous := modelUsageCache
	modelUsageCache = &modelUsageCacheEntry{
		expiresAt: time.Now().Add(time.Minute),
		items: []ModelUsageItem{
			{ModelName: "gpt-4o", VendorID: -1012, ModelType: model.ModelTypeChat},
			{ModelName: "claude", VendorID: 3, ModelType: model.ModelTypeChat},
		},
	}
	modelUsageCacheMu.Unlock()
	t.Cleanup(func() {
		modelUsageCacheMu.Lock()
		modelUsageCache = previous
		modelUsageCacheMu.Unlock()
	})

	displayOnly, err := GetModelUsageCatalog(0, "all", "", "-1012")
	require.NoError(t, err)
	require.Len(t, displayOnly.Models, 1)
	assert.Equal(t, "gpt-4o", displayOnly.Models[0].ModelName)

	stored, err := GetModelUsageCatalog(0, "all", "", "3")
	require.NoError(t, err)
	require.Len(t, stored.Models, 1)
	assert.Equal(t, "claude", stored.Models[0].ModelName)

	_, err = GetModelUsageCatalog(0, "all", "", "0")
	require.ErrorIs(t, err, ErrInvalidModelUsageVendorIDs)
	_, err = GetModelUsageCatalog(0, "all", "", "abc")
	require.ErrorIs(t, err, ErrInvalidModelUsageVendorIDs)
}

// 未登录 / 无个人用量时：仅按管理员 ManualUsage 排序，不受全站热度影响。
func TestGetModelUsageCatalog_AnonymousSortsByManualUsageOnly(t *testing.T) {
	modelUsageCacheMu.Lock()
	previous := modelUsageCache
	modelUsageCache = &modelUsageCacheEntry{
		expiresAt: time.Now().Add(time.Minute),
		items: []ModelUsageItem{
			{ModelName: "wan2.7-t2v", ManualUsage: 10, CreatedTime: 1, ModelType: model.ModelTypeVideo},
			{ModelName: "featured", ManualUsage: 100, CreatedTime: 2, ModelType: model.ModelTypeVideo},
			{ModelName: "plain", ManualUsage: 0, CreatedTime: 99, ModelType: model.ModelTypeVideo},
		},
	}
	modelUsageCacheMu.Unlock()
	t.Cleanup(func() {
		modelUsageCacheMu.Lock()
		modelUsageCache = previous
		modelUsageCacheMu.Unlock()
	})

	result, err := GetModelUsageCatalog(0, "all", "", "")
	require.NoError(t, err)
	require.Len(t, result.Models, 3)
	assert.Equal(t, []string{"featured", "wan2.7-t2v", "plain"}, []string{
		result.Models[0].ModelName,
		result.Models[1].ModelName,
		result.Models[2].ModelName,
	})
	assert.Equal(t, int64(100), result.Models[0].DisplayUsage)
	assert.Equal(t, int64(0), result.Models[0].ActualUsage7d)
}
