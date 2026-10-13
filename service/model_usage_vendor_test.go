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

	displayOnly, err := GetModelUsageCatalog("all", "", "-1012")
	require.NoError(t, err)
	require.Len(t, displayOnly.Models, 1)
	assert.Equal(t, "gpt-4o", displayOnly.Models[0].ModelName)

	stored, err := GetModelUsageCatalog("all", "", "3")
	require.NoError(t, err)
	require.Len(t, stored.Models, 1)
	assert.Equal(t, "claude", stored.Models[0].ModelName)

	_, err = GetModelUsageCatalog("all", "", "0")
	require.ErrorIs(t, err, ErrInvalidModelUsageVendorIDs)
	_, err = GetModelUsageCatalog("all", "", "abc")
	require.ErrorIs(t, err, ErrInvalidModelUsageVendorIDs)
}
