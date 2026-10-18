package model

import (
	"errors"
	"time"
)

// 创作任务状态机（PRD）
const (
	CreativeTaskDraft           = "draft"
	CreativeTaskAnalyzing       = "analyzing"
	CreativeTaskAwaitingConfirm = "awaiting_confirm"
	CreativeTaskGenerating      = "generating"
	CreativeTaskReviewing       = "reviewing"
	CreativeTaskDone            = "done"
	CreativeTaskFailed          = "failed"
	CreativeTaskCancelled       = "cancelled"
)

const (
	CreativeAssetKindReference = "reference"
	CreativeAssetKindHero      = "hero"
	CreativeAssetKindHeroBg    = "hero_bg"
	CreativeAssetKindDetail    = "detail"

	CreativeAssetPending    = "pending"
	CreativeAssetGenerating = "generating"
	CreativeAssetQA         = "qa"
	CreativeAssetRetrying   = "retrying"
	CreativeAssetReview     = "review"
	CreativeAssetRefining   = "refining"
	CreativeAssetApproved   = "approved"
	CreativeAssetFailed     = "failed"
)

const (
	CreativeStageAnalyzeVL = "analyze_vl"
	CreativeStageCopyLLM   = "copy_llm"
	CreativeStageImageGen  = "image_gen"
	CreativeStageImageQA   = "image_qa"
)

const CreativeTypeEcommerceSuite = "ecommerce_suite"

// CreativeType 创作类型元数据
type CreativeType struct {
	Id          int    `json:"id" gorm:"primaryKey"`
	TypeId      string `json:"type_id" gorm:"type:varchar(64);uniqueIndex;not null"`
	Title       string `json:"title" gorm:"type:varchar(128);not null"`
	Enabled     bool   `json:"enabled"`
	SortOrder   int    `json:"sort_order"`
	Description string `json:"description" gorm:"type:varchar(512)"`
	Icon        string `json:"icon" gorm:"type:varchar(256)"`
	BillingMode string `json:"billing_mode" gorm:"type:varchar(32);not null"` // user_token
	// PackageJSON：平台套餐、风格、并发、重试、参考图上限、预估系数等
	PackageJSON string `json:"package_json" gorm:"type:text"`
	CreatedAt   int64  `json:"created_at"`
	UpdatedAt   int64  `json:"updated_at"`
}

// CreativeModelBinding 分环节模型绑定
type CreativeModelBinding struct {
	Id              int     `json:"id" gorm:"primaryKey"`
	TypeId          string  `json:"type_id" gorm:"type:varchar(64);uniqueIndex:uk_creative_binding;not null"`
	Stage           string  `json:"stage" gorm:"type:varchar(32);uniqueIndex:uk_creative_binding;not null"`
	PrimaryModel    string  `json:"primary_model" gorm:"type:varchar(191)"`
	FallbackModel   string  `json:"fallback_model" gorm:"type:varchar(191)"`
	Temperature     float64 `json:"temperature"`
	MaxTokens       int     `json:"max_tokens"`
	ExtraJSON       string  `json:"extra_json" gorm:"type:text"`
	ForceNoThinking bool    `json:"force_no_thinking"`
	UpdatedAt       int64   `json:"updated_at"`
}

// CreativeSkill 提示词版本
type CreativeSkill struct {
	Id        int    `json:"id" gorm:"primaryKey"`
	SkillId   string `json:"skill_id" gorm:"type:varchar(64);index;not null"`
	Name      string `json:"name" gorm:"type:varchar(128);not null"`
	Version   int    `json:"version" gorm:"not null"`
	TypeId    string `json:"type_id" gorm:"type:varchar(64);index;not null"`
	Stage     string `json:"stage" gorm:"type:varchar(32);index;not null"`
	Platform  string `json:"platform" gorm:"type:varchar(32);index"` // 空=通用
	Body      string `json:"body" gorm:"type:text"`
	Enabled   bool   `json:"enabled"`
	CreatedAt int64  `json:"created_at"`
	UpdatedAt int64  `json:"updated_at"`
}

// CreativeTask 用户一次出图任务
type CreativeTask struct {
	Id              int    `json:"id" gorm:"primaryKey"`
	UserId          int    `json:"user_id" gorm:"index;not null"`
	TypeId          string `json:"type_id" gorm:"type:varchar(64);index;not null"`
	Status          string `json:"status" gorm:"type:varchar(32);index;not null"`
	Platform        string `json:"platform" gorm:"type:varchar(32)"`
	Style           string `json:"style" gorm:"type:varchar(64)"`
	StyleCustom     string `json:"style_custom" gorm:"type:varchar(512)"`
	ExtraText       string `json:"extra_text" gorm:"type:text"`
	ProductProfile  string `json:"product_profile" gorm:"type:text"` // JSON
	ConfigSnapshot  string `json:"config_snapshot" gorm:"type:text"` // 启动时配置快照
	AnalyzeMessages string `json:"analyze_messages" gorm:"type:text"`
	ImageKind       string `json:"image_kind" gorm:"type:varchar(32)"` // hero | detail
	ImageCount      int    `json:"image_count"`                        // 用户选择张数，默认 2
	CompletedAt     int64  `json:"completed_at"`
	EstimatedQuota  int64  `json:"estimated_quota"`
	ConsumedQuota   int64  `json:"consumed_quota"`
	ErrorMessage    string `json:"error_message" gorm:"type:varchar(1024)"`
	CreatedAt       int64  `json:"created_at"`
	UpdatedAt       int64  `json:"updated_at"`
}

// CreativeAsset 参考图或生成图
type CreativeAsset struct {
	Id           int    `json:"id" gorm:"primaryKey"`
	TaskId       int    `json:"task_id" gorm:"index;not null"`
	UserId       int    `json:"user_id" gorm:"index;not null"`
	Kind         string `json:"kind" gorm:"type:varchar(32);not null"`
	SlotIndex    int    `json:"slot_index"`
	Status       string `json:"status" gorm:"type:varchar(32);index;not null"`
	Width        int    `json:"width"`
	Height       int    `json:"height"`
	Prompt       string `json:"prompt" gorm:"type:text"`
	RefineNote   string `json:"refine_note" gorm:"type:varchar(1024)"`
	URL          string `json:"url" gorm:"type:varchar(1024)"`
	ObjectKey    string `json:"object_key" gorm:"type:varchar(512)"`
	RetryCount   int    `json:"retry_count"`
	QAPassed     bool   `json:"qa_passed"`
	QAMessage    string `json:"qa_message" gorm:"type:varchar(512)"`
	ErrorMessage string `json:"error_message" gorm:"type:varchar(1024)"`
	CreatedAt    int64  `json:"created_at"`
	UpdatedAt    int64  `json:"updated_at"`
}

// CreativeAuditLog 管理端配置变更
type CreativeAuditLog struct {
	Id         int    `json:"id" gorm:"primaryKey"`
	ActorId    int    `json:"actor_id" gorm:"index;not null"`
	ActorName  string `json:"actor_name" gorm:"type:varchar(128)"`
	EntityType string `json:"entity_type" gorm:"type:varchar(64);index;not null"`
	EntityId   string `json:"entity_id" gorm:"type:varchar(128);index"`
	Action     string `json:"action" gorm:"type:varchar(64);not null"`
	BeforeJSON string `json:"before_json" gorm:"type:text"`
	AfterJSON  string `json:"after_json" gorm:"type:text"`
	CreatedAt  int64  `json:"created_at" gorm:"index"`
}

// CreativePlatformPackage 套餐中单平台配置（存 PackageJSON）
type CreativePlatformPackage struct {
	Platform     string `json:"platform"`
	HeroCount    int    `json:"hero_count"`
	HeroBgCount  int    `json:"hero_bg_count"`
	DetailCount  int    `json:"detail_count"`
	HeroWidth    int    `json:"hero_width"`
	HeroHeight   int    `json:"hero_height"`
	DetailWidth  int    `json:"detail_width"`
	DetailHeight int    `json:"detail_height"`
}

// CreativeTypePackage 类型级业务配置
type CreativeTypePackage struct {
	MaxReferences    int                       `json:"max_references"`
	Concurrency      int                       `json:"concurrency"`
	MaxAutoRetries   int                       `json:"max_auto_retries"`
	EstimateFactor   float64                   `json:"estimate_factor"`
	Styles           []string                  `json:"styles"`
	Platforms        []CreativePlatformPackage `json:"platforms"`
	QuotaPerImageEst int64                     `json:"quota_per_image_est"`
	QuotaAnalyzeEst  int64                     `json:"quota_analyze_est"`
}

// CreativeProductProfile 商品档案
type CreativeProductProfile struct {
	CategoryL1    string   `json:"category_l1"`
	CategoryL2    string   `json:"category_l2"`
	SellingPoints []string `json:"selling_points"`
	Appearance    string   `json:"appearance"`
	Complete      bool     `json:"complete"`
	Missing       []string `json:"missing,omitempty"`
}

func CreativeNow() int64 { return time.Now().Unix() }

func DefaultEcommercePackage() CreativeTypePackage {
	return CreativeTypePackage{
		MaxReferences:  5,
		Concurrency:    3,
		MaxAutoRetries: 2,
		EstimateFactor: 1.2,
		Styles: []string{
			"日系简约", "高级质感", "活力促销", "国潮风",
			"Ins 风", "复古怀旧", "科技感", "可爱萌系", "其他风格要求",
		},
		Platforms: []CreativePlatformPackage{
			{Platform: "pdd", HeroCount: 1, HeroBgCount: 4, DetailCount: 5, HeroWidth: 750, HeroHeight: 750, DetailWidth: 750, DetailHeight: 1200},
			{Platform: "taobao", HeroCount: 1, HeroBgCount: 4, DetailCount: 5, HeroWidth: 800, HeroHeight: 800, DetailWidth: 750, DetailHeight: 1200},
			{Platform: "tmall", HeroCount: 1, HeroBgCount: 3, DetailCount: 5, HeroWidth: 800, HeroHeight: 800, DetailWidth: 790, DetailHeight: 1200},
		},
		QuotaPerImageEst: 50000,
		QuotaAnalyzeEst:  20000,
	}
}

func (p CreativeTypePackage) PlatformByKey(key string) (CreativePlatformPackage, error) {
	for _, item := range p.Platforms {
		if item.Platform == key {
			return item, nil
		}
	}
	return CreativePlatformPackage{}, errors.New("unknown platform")
}

func (p CreativePlatformPackage) TotalImages() int {
	return p.HeroCount + p.HeroBgCount + p.DetailCount
}

// ApplyUserImageCount 按用户选择的图类型与张数覆盖平台套餐计数（默认 2 张）
func (p CreativePlatformPackage) ApplyUserImageCount(kind string, count int) CreativePlatformPackage {
	if count <= 0 {
		count = 2
	}
	if count > 12 {
		count = 12
	}
	out := p
	switch kind {
	case CreativeAssetKindHero:
		out.HeroCount = count
		out.HeroBgCount = 0
		out.DetailCount = 0
	case CreativeAssetKindDetail:
		out.HeroCount = 0
		out.HeroBgCount = 0
		out.DetailCount = count
	default:
		out.HeroCount = 0
		out.HeroBgCount = 0
		out.DetailCount = count
	}
	return out
}
