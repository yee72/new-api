package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func TestCreativeAutoMigrateAndSeedSQLite(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	require.NoError(t, err)

	prev := DB
	DB = db
	t.Cleanup(func() { DB = prev })

	require.NoError(t, db.AutoMigrate(
		&CreativeType{},
		&CreativeModelBinding{},
		&CreativeSkill{},
		&CreativeTask{},
		&CreativeAsset{},
		&CreativeAuditLog{},
	))

	common.OptionMapRWMutex.Lock()
	if common.OptionMap == nil {
		common.OptionMap = map[string]string{}
	}
	common.OptionMapRWMutex.Unlock()

	require.NoError(t, EnsureCreativeSeed())

	ct, err := GetCreativeTypeByTypeId(CreativeTypeEcommerceSuite)
	require.NoError(t, err)
	require.True(t, ct.Enabled)
	require.Equal(t, "user_token", ct.BillingMode)

	pkg, err := ParseCreativePackage(ct.PackageJSON)
	require.NoError(t, err)
	require.Equal(t, 2, pkg.MaxAutoRetries)
	require.Len(t, pkg.Platforms, 3)

	bindings, err := GetCreativeBindings(CreativeTypeEcommerceSuite)
	require.NoError(t, err)
	require.GreaterOrEqual(t, len(bindings), 4)

	var skillCount int64
	require.NoError(t, db.Model(&CreativeSkill{}).Count(&skillCount).Error)
	require.GreaterOrEqual(t, skillCount, int64(3))

	// 幂等：再次种子不报错、不重复类型
	require.NoError(t, EnsureCreativeSeed())
	var typeCount int64
	require.NoError(t, db.Model(&CreativeType{}).Where("type_id = ?", CreativeTypeEcommerceSuite).Count(&typeCount).Error)
	require.Equal(t, int64(1), typeCount)
}

func TestApplyUserImageCountDefaultsToTwo(t *testing.T) {
	plat := CreativePlatformPackage{HeroCount: 1, HeroBgCount: 4, DetailCount: 5}
	out := plat.ApplyUserImageCount(CreativeAssetKindDetail, 0)
	require.Equal(t, 0, out.HeroCount)
	require.Equal(t, 0, out.HeroBgCount)
	require.Equal(t, 2, out.DetailCount)
	hero := plat.ApplyUserImageCount(CreativeAssetKindHero, 3)
	require.Equal(t, 3, hero.HeroCount)
	require.Equal(t, 0, hero.DetailCount)
}
