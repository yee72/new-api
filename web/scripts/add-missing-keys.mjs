import fs from 'node:fs/promises'
import path from 'node:path'

const LOCALES_DIR = path.resolve('src/i18n/locales')

function stableStringify(obj) {
  return JSON.stringify(obj, null, 2) + '\n'
}

const newKeys = {
  en: {
    'Submitted parameters': 'Submitted parameters',
    'Platform: {{value}}': 'Platform: {{value}}',
    'Style: {{value}}': 'Style: {{value}}',
    'Image type: {{kind}}': 'Image type: {{kind}}',
    'Quantity: {{count}}': 'Quantity: {{count}}',
    'Image model: {{value}}': 'Image model: {{value}}',
    'Group: {{value}}': 'Group: {{value}}',
    'Reference images: {{count}}': 'Reference images: {{count}}',
    Requirements: 'Requirements',
    'Using model: {{value}}': 'Using model: {{value}}',
    'Output size: {{value}}': 'Output size: {{value}}',
    'Model prompt ({{kind}} {{current}}/{{total}})':
      'Model prompt ({{kind}} {{current}}/{{total}})',
  },
  zh: {
    'Submitted parameters': '提交参数',
    'Platform: {{value}}': '平台：{{value}}',
    'Style: {{value}}': '风格：{{value}}',
    'Image type: {{kind}}': '图片类型：{{kind}}',
    'Quantity: {{count}}': '数量：{{count}}',
    'Image model: {{value}}': '生图模型：{{value}}',
    'Group: {{value}}': '分组：{{value}}',
    'Reference images: {{count}}': '参考图：{{count}} 张',
    Requirements: '需求说明',
    'Using model: {{value}}': '使用模型：{{value}}',
    'Output size: {{value}}': '输出尺寸：{{value}}',
    'Model prompt ({{kind}} {{current}}/{{total}})':
      '模型提示词（{{kind}} {{current}}/{{total}}）',
  },
  'zh-TW': {
    'Submitted parameters': '提交參數',
    'Platform: {{value}}': '平台：{{value}}',
    'Style: {{value}}': '風格：{{value}}',
    'Image type: {{kind}}': '圖片類型：{{kind}}',
    'Quantity: {{count}}': '數量：{{count}}',
    'Image model: {{value}}': '生圖模型：{{value}}',
    'Group: {{value}}': '分組：{{value}}',
    'Reference images: {{count}}': '參考圖：{{count}} 張',
    Requirements: '需求說明',
    'Using model: {{value}}': '使用模型：{{value}}',
    'Output size: {{value}}': '輸出尺寸：{{value}}',
    'Model prompt ({{kind}} {{current}}/{{total}})':
      '模型提示詞（{{kind}} {{current}}/{{total}}）',
  },
  ja: {
    'Submitted parameters': '送信パラメータ',
    'Platform: {{value}}': 'プラットフォーム：{{value}}',
    'Style: {{value}}': 'スタイル：{{value}}',
    'Image type: {{kind}}': '画像タイプ：{{kind}}',
    'Quantity: {{count}}': '枚数：{{count}}',
    'Image model: {{value}}': '画像モデル：{{value}}',
    'Group: {{value}}': 'グループ：{{value}}',
    'Reference images: {{count}}': '参照画像：{{count}}',
    Requirements: '要件',
    'Using model: {{value}}': '使用モデル：{{value}}',
    'Output size: {{value}}': '出力サイズ：{{value}}',
    'Model prompt ({{kind}} {{current}}/{{total}})':
      'モデルプロンプト（{{kind}} {{current}}/{{total}}）',
  },
  fr: {
    'Submitted parameters': 'Paramètres soumis',
    'Platform: {{value}}': 'Plateforme : {{value}}',
    'Style: {{value}}': 'Style : {{value}}',
    'Image type: {{kind}}': 'Type d’image : {{kind}}',
    'Quantity: {{count}}': 'Quantité : {{count}}',
    'Image model: {{value}}': 'Modèle d’image : {{value}}',
    'Group: {{value}}': 'Groupe : {{value}}',
    'Reference images: {{count}}': 'Images de référence : {{count}}',
    Requirements: 'Exigences',
    'Using model: {{value}}': 'Modèle utilisé : {{value}}',
    'Output size: {{value}}': 'Taille de sortie : {{value}}',
    'Model prompt ({{kind}} {{current}}/{{total}})':
      'Invite du modèle ({{kind}} {{current}}/{{total}})',
  },
  ru: {
    'Submitted parameters': 'Отправленные параметры',
    'Platform: {{value}}': 'Платформа: {{value}}',
    'Style: {{value}}': 'Стиль: {{value}}',
    'Image type: {{kind}}': 'Тип изображения: {{kind}}',
    'Quantity: {{count}}': 'Количество: {{count}}',
    'Image model: {{value}}': 'Модель изображения: {{value}}',
    'Group: {{value}}': 'Группа: {{value}}',
    'Reference images: {{count}}': 'Справочные изображения: {{count}}',
    Requirements: 'Требования',
    'Using model: {{value}}': 'Используемая модель: {{value}}',
    'Output size: {{value}}': 'Размер выхода: {{value}}',
    'Model prompt ({{kind}} {{current}}/{{total}})':
      'Промпт модели ({{kind}} {{current}}/{{total}})',
  },
  vi: {
    'Submitted parameters': 'Tham số đã gửi',
    'Platform: {{value}}': 'Nền tảng: {{value}}',
    'Style: {{value}}': 'Phong cách: {{value}}',
    'Image type: {{kind}}': 'Loại ảnh: {{kind}}',
    'Quantity: {{count}}': 'Số lượng: {{count}}',
    'Image model: {{value}}': 'Mô hình tạo ảnh: {{value}}',
    'Group: {{value}}': 'Nhóm: {{value}}',
    'Reference images: {{count}}': 'Ảnh tham chiếu: {{count}}',
    Requirements: 'Yêu cầu',
    'Using model: {{value}}': 'Dùng mô hình: {{value}}',
    'Output size: {{value}}': 'Kích thước đầu ra: {{value}}',
    'Model prompt ({{kind}} {{current}}/{{total}})':
      'Prompt mô hình ({{kind}} {{current}}/{{total}})',
  },
}

async function main() {
  let totalAdded = 0
  for (const [locale, trans] of Object.entries(newKeys)) {
    const filePath = path.join(LOCALES_DIR, `${locale}.json`)
    const json = JSON.parse(await fs.readFile(filePath, 'utf8'))
    let count = 0
    for (const [key, value] of Object.entries(trans)) {
      if (!Object.prototype.hasOwnProperty.call(json.translation, key)) {
        json.translation[key] = value
        count++
      } else if (json.translation[key] !== value) {
        json.translation[key] = value
        count++
      }
    }
    if (count > 0) {
      json.translation = Object.fromEntries(
        Object.entries(json.translation).sort(([a], [b]) => a.localeCompare(b))
      )
      await fs.writeFile(filePath, stableStringify(json), 'utf8')
    }
    console.log(`${locale}: ${count} translations applied`)
    totalAdded += count
  }
  console.log(`\nTotal: ${totalAdded} translations applied`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
