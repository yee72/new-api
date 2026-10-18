package model

import (
	"errors"
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

const (
	OptionCreativeEnabled            = "creative.enabled"
	OptionCreativeDefaultConcurrency = "creative.default_concurrency"
	OptionCreativeSensitiveWords     = "creative.sensitive_words"
)

func EnsureCreativeSeed() error {
	now := CreativeNow()
	var count int64
	if err := DB.Model(&CreativeType{}).Where("type_id = ?", CreativeTypeEcommerceSuite).Count(&count).Error; err != nil {
		return err
	}
	if count == 0 {
		pkg := DefaultEcommercePackage()
		pkgJSON, err := common.Marshal(pkg)
		if err != nil {
			return err
		}
		item := &CreativeType{
			TypeId:      CreativeTypeEcommerceSuite,
			Title:       "电商套图",
			Enabled:     true,
			SortOrder:   0,
			Description: "一键上传 → AI 多步出主图/详情图",
			BillingMode: "user_token",
			PackageJSON: string(pkgJSON),
			CreatedAt:   now,
			UpdatedAt:   now,
		}
		if err := DB.Create(item).Error; err != nil {
			return err
		}
	}

	stages := []string{CreativeStageAnalyzeVL, CreativeStageCopyLLM, CreativeStageImageGen, CreativeStageImageQA}
	for _, stage := range stages {
		var n int64
		if err := DB.Model(&CreativeModelBinding{}).
			Where("type_id = ? AND stage = ?", CreativeTypeEcommerceSuite, stage).
			Count(&n).Error; err != nil {
			return err
		}
		if n == 0 {
			binding := &CreativeModelBinding{
				TypeId:      CreativeTypeEcommerceSuite,
				Stage:       stage,
				Temperature: 0.7,
				MaxTokens:   2048,
				UpdatedAt:   now,
			}
			if err := DB.Create(binding).Error; err != nil {
				return err
			}
		}
	}

	if err := ensureDefaultCreativeSkills(now); err != nil {
		return err
	}

	common.OptionMapRWMutex.Lock()
	defer common.OptionMapRWMutex.Unlock()
	if _, ok := common.OptionMap[OptionCreativeEnabled]; !ok {
		common.OptionMap[OptionCreativeEnabled] = "true"
	}
	if _, ok := common.OptionMap[OptionCreativeDefaultConcurrency]; !ok {
		common.OptionMap[OptionCreativeDefaultConcurrency] = "3"
	}
	if _, ok := common.OptionMap[OptionCreativeSensitiveWords]; !ok {
		common.OptionMap[OptionCreativeSensitiveWords] = "[]"
	}
	return nil
}

func ensureDefaultCreativeSkills(now int64) error {
	defaults := []struct {
		skillId, name, stage, platform, body string
	}{
		{
			skillId:  "ecommerce_analyze",
			name:     "商品智能分析",
			stage:    CreativeStageAnalyzeVL,
			platform: "",
			body: `你是电商商品分析助手。根据参考图与补充文本，输出 JSON：
{"category_l1":"","category_l2":"","selling_points":["至少3条"],"appearance":"主体外观一句","complete":true/false,"missing":["缺项"]}
平台={{platform}} 风格={{style}} 补充={{specs}}`,
		},
		{
			skillId:  "ecommerce_copy",
			name:     "文案构图",
			stage:    CreativeStageCopyLLM,
			platform: "",
			// prepare 会把该模板直接发给生图模型，须要求出图而非「写提示词」
			body: defaultEcommerceCopySkillBody,
		},
		{
			skillId:  "ecommerce_image",
			name:     "生图指令",
			stage:    CreativeStageImageGen,
			platform: "",
			body:     `{{prompt}}`,
		},
	}
	for _, d := range defaults {
		var n int64
		if err := DB.Model(&CreativeSkill{}).
			Where("skill_id = ? AND version = ?", d.skillId, 1).
			Count(&n).Error; err != nil {
			return err
		}
		if n > 0 {
			continue
		}
		skill := &CreativeSkill{
			SkillId:   d.skillId,
			Name:      d.name,
			Version:   1,
			TypeId:    CreativeTypeEcommerceSuite,
			Stage:     d.stage,
			Platform:  d.platform,
			Body:      d.body,
			Enabled:   true,
			CreatedAt: now,
			UpdatedAt: now,
		}
		if err := DB.Create(skill).Error; err != nil {
			return err
		}
	}
	return repairEcommerceCopySkillIfLegacy(now)
}

// 旧种子会让生图模型只写文字提示词；已入库的默认版需自动改写
const (
	legacyEcommerceCopySkillBody = `为电商套图第 {{slot_index}} 张（类型={{kind}}）撰写生图提示词。
平台={{platform}} 风格={{style}} 卖点={{selling_points}} 外观={{appearance}} 尺寸={{width}}x{{height}}
只输出提示词正文。`
	defaultEcommerceCopySkillBody = `根据参考图生成电商套图第 {{slot_index}} 张图片（类型={{kind}}）。
平台={{platform}} 风格={{style}} 卖点={{selling_points}} 外观={{appearance}} 尺寸={{width}}x{{height}} {{refine}}
直接生成图片，不要只输出文字描述或提示词。`
)

func repairEcommerceCopySkillIfLegacy(now int64) error {
	var skill CreativeSkill
	err := DB.Where("skill_id = ? AND version = ?", "ecommerce_copy", 1).First(&skill).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	body := strings.TrimSpace(skill.Body)
	if body != strings.TrimSpace(legacyEcommerceCopySkillBody) &&
		!strings.Contains(body, "撰写生图提示词") &&
		!strings.Contains(body, "只输出提示词正文") {
		return nil
	}
	skill.Body = defaultEcommerceCopySkillBody
	skill.UpdatedAt = now
	return DB.Save(&skill).Error
}

func IsCreativeGloballyEnabled() bool {
	common.OptionMapRWMutex.RLock()
	defer common.OptionMapRWMutex.RUnlock()
	v := common.OptionMap[OptionCreativeEnabled]
	return v == "" || v == "true"
}

func CountEnabledCreativeTypes() (int64, error) {
	var n int64
	err := DB.Model(&CreativeType{}).Where("enabled = ?", true).Count(&n).Error
	return n, err
}

func GetCreativeTypeByTypeId(typeId string) (*CreativeType, error) {
	var item CreativeType
	err := DB.Where("type_id = ?", typeId).First(&item).Error
	if err != nil {
		return nil, err
	}
	return &item, nil
}

func ListCreativeTypes(enabledOnly bool) ([]*CreativeType, error) {
	var items []*CreativeType
	q := DB.Model(&CreativeType{}).Order("sort_order asc, id asc")
	if enabledOnly {
		q = q.Where("enabled = ?", true)
	}
	if err := q.Find(&items).Error; err != nil {
		return nil, err
	}
	return items, nil
}

func ParseCreativePackage(raw string) (CreativeTypePackage, error) {
	pkg := DefaultEcommercePackage()
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return pkg, nil
	}
	if err := common.Unmarshal([]byte(raw), &pkg); err != nil {
		return DefaultEcommercePackage(), err
	}
	if pkg.MaxReferences <= 0 {
		pkg.MaxReferences = 5
	}
	if pkg.Concurrency <= 0 {
		pkg.Concurrency = 3
	}
	if pkg.MaxAutoRetries < 0 {
		pkg.MaxAutoRetries = 2
	}
	return pkg, nil
}

func GetCreativeBindings(typeId string) ([]*CreativeModelBinding, error) {
	var items []*CreativeModelBinding
	err := DB.Where("type_id = ?", typeId).Find(&items).Error
	return items, err
}

func UpsertCreativeBinding(binding *CreativeModelBinding) error {
	binding.UpdatedAt = CreativeNow()
	var existing CreativeModelBinding
	err := DB.Where("type_id = ? AND stage = ?", binding.TypeId, binding.Stage).First(&existing).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return DB.Create(binding).Error
	}
	if err != nil {
		return err
	}
	binding.Id = existing.Id
	return DB.Save(binding).Error
}

func GetEnabledCreativeSkill(typeId, stage, platform string) (*CreativeSkill, error) {
	var skill CreativeSkill
	// 优先平台覆盖
	if platform != "" {
		err := DB.Where("type_id = ? AND stage = ? AND platform = ? AND enabled = ?", typeId, stage, platform, true).
			Order("version desc").First(&skill).Error
		if err == nil {
			return &skill, nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
	}
	err := DB.Where("type_id = ? AND stage = ? AND (platform = '' OR platform IS NULL) AND enabled = ?", typeId, stage, true).
		Order("version desc").First(&skill).Error
	if err != nil {
		return nil, err
	}
	return &skill, nil
}

func WriteCreativeAudit(actorId int, actorName, entityType, entityId, action string, before any, after any) error {
	beforeJSON := ""
	afterJSON := ""
	if before != nil {
		if b, err := common.Marshal(before); err == nil {
			beforeJSON = string(b)
		}
	}
	if after != nil {
		if b, err := common.Marshal(after); err == nil {
			afterJSON = string(b)
		}
	}
	return DB.Create(&CreativeAuditLog{
		ActorId:    actorId,
		ActorName:  actorName,
		EntityType: entityType,
		EntityId:   entityId,
		Action:     action,
		BeforeJSON: beforeJSON,
		AfterJSON:  afterJSON,
		CreatedAt:  CreativeNow(),
	}).Error
}

func GetCreativeTaskForUser(taskId, userId int) (*CreativeTask, error) {
	var task CreativeTask
	err := DB.Where("id = ? AND user_id = ?", taskId, userId).First(&task).Error
	if err != nil {
		return nil, err
	}
	return &task, nil
}

func ListCreativeAssets(taskId int) ([]*CreativeAsset, error) {
	var items []*CreativeAsset
	err := DB.Where("task_id = ?", taskId).Order("kind asc, slot_index asc, id asc").Find(&items).Error
	return items, err
}

func CreateCreativeAssetSlots(task *CreativeTask, pkg CreativePlatformPackage) error {
	now := CreativeNow()
	add := func(kind string, count, width, height int) error {
		for i := range count {
			asset := &CreativeAsset{
				TaskId:    task.Id,
				UserId:    task.UserId,
				Kind:      kind,
				SlotIndex: i,
				Status:    CreativeAssetPending,
				Width:     width,
				Height:    height,
				CreatedAt: now,
				UpdatedAt: now,
			}
			if err := DB.Create(asset).Error; err != nil {
				return err
			}
		}
		return nil
	}
	if err := add(CreativeAssetKindHero, pkg.HeroCount, pkg.HeroWidth, pkg.HeroHeight); err != nil {
		return err
	}
	if err := add(CreativeAssetKindHeroBg, pkg.HeroBgCount, pkg.HeroWidth, pkg.HeroHeight); err != nil {
		return err
	}
	return add(CreativeAssetKindDetail, pkg.DetailCount, pkg.DetailWidth, pkg.DetailHeight)
}

func CreativeProfileComplete(profile *CreativeProductProfile) (bool, []string) {
	missing := make([]string, 0)
	if strings.TrimSpace(profile.CategoryL1) == "" {
		missing = append(missing, "category_l1")
	}
	if strings.TrimSpace(profile.CategoryL2) == "" {
		missing = append(missing, "category_l2")
	}
	if len(profile.SellingPoints) < 3 {
		missing = append(missing, "selling_points")
	}
	if strings.TrimSpace(profile.Appearance) == "" {
		missing = append(missing, "appearance")
	}
	return len(missing) == 0, missing
}

func RenderCreativeSkill(body string, vars map[string]string) string {
	out := body
	for k, v := range vars {
		out = strings.ReplaceAll(out, "{{"+k+"}}", v)
	}
	return out
}

func CreativeAssetFolderName(kind string) string {
	switch kind {
	case CreativeAssetKindHero:
		return "主图"
	case CreativeAssetKindHeroBg:
		return "带背景主图"
	case CreativeAssetKindDetail:
		return "详情图"
	default:
		return kind
	}
}

func FormatCreativeEntity(entity string, id any) string {
	return fmt.Sprintf("%s:%v", entity, id)
}
