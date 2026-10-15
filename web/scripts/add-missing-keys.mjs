import fs from 'node:fs/promises'
import path from 'node:path'

const LOCALES_DIR = path.resolve('src/i18n/locales')

function stableStringify(obj) {
  return JSON.stringify(obj, null, 2) + '\n'
}

const newKeys = {
  en: {
    'Optimize prompt': 'Optimize prompt',
    'Est. about {{count}} tokens': 'Est. about {{count}} tokens',
    'Prompt enhance model is not configured':
      'Prompt enhance model is not configured',
    'Prompt enhance returned empty content':
      'Prompt enhance returned empty content',
    'Prompt optimized': 'Prompt optimized',
    'Failed to optimize prompt': 'Failed to optimize prompt',
    'Enable prompt enhance': 'Enable prompt enhance',
    'Show an optimize-prompt button on the model usage page. Users pay for the dedicated chat model below.':
      'Show an optimize-prompt button on the model usage page. Users pay for the dedicated chat model below.',
    'Prompt enhance model': 'Prompt enhance model',
    'e.g. gpt-4o-mini': 'e.g. gpt-4o-mini',
    'Must be an available chat model. Image or video-only models are not supported.':
      'Must be an available chat model. Image or video-only models are not supported.',
    'Prompt enhance max tokens': 'Prompt enhance max tokens',
    'Output cap for each enhance request. Also used for the hover estimate.':
      'Output cap for each enhance request. Also used for the hover estimate.',
  },
  zh: {
    'Optimize prompt': '优化提示词',
    'Est. about {{count}} tokens': '预计约 {{count}} tokens',
    'Prompt enhance model is not configured': '管理员未配置扩写模型',
    'Prompt enhance returned empty content': '扩写结果为空',
    'Prompt optimized': '提示词已优化',
    'Failed to optimize prompt': '优化提示词失败',
    'Enable prompt enhance': '启用提示词扩写',
    'Show an optimize-prompt button on the model usage page. Users pay for the dedicated chat model below.':
      '在模型使用页显示优化提示词按钮。用户将按下方专用对话模型计费。',
    'Prompt enhance model': '提示词扩写模型',
    'e.g. gpt-4o-mini': '例如 gpt-4o-mini',
    'Must be an available chat model. Image or video-only models are not supported.':
      '须为已开放的对话（chat）模型；不支持仅图片/视频接口的模型。',
    'Prompt enhance max tokens': '扩写最大输出 tokens',
    'Output cap for each enhance request. Also used for the hover estimate.':
      '单次扩写输出上限，同时用于悬停预估消耗。',
  },
  'zh-TW': {
    'Optimize prompt': '優化提示詞',
    'Est. about {{count}} tokens': '預計約 {{count}} tokens',
    'Prompt enhance model is not configured': '管理員未設定擴寫模型',
    'Prompt enhance returned empty content': '擴寫結果為空',
    'Prompt optimized': '提示詞已優化',
    'Failed to optimize prompt': '優化提示詞失敗',
    'Enable prompt enhance': '啟用提示詞擴寫',
    'Show an optimize-prompt button on the model usage page. Users pay for the dedicated chat model below.':
      '在模型使用頁顯示優化提示詞按鈕。使用者將按下方專用對話模型計費。',
    'Prompt enhance model': '提示詞擴寫模型',
    'e.g. gpt-4o-mini': '例如 gpt-4o-mini',
    'Must be an available chat model. Image or video-only models are not supported.':
      '須為已開放的對話（chat）模型；不支援僅圖片/影片介面的模型。',
    'Prompt enhance max tokens': '擴寫最大輸出 tokens',
    'Output cap for each enhance request. Also used for the hover estimate.':
      '單次擴寫輸出上限，同時用於懸停預估消耗。',
  },
  ja: {
    'Optimize prompt': 'プロンプトを最適化',
    'Est. about {{count}} tokens': '見込み約 {{count}} tokens',
    'Prompt enhance model is not configured':
      '拡張用モデルが未設定です',
    'Prompt enhance returned empty content': '拡張結果が空です',
    'Prompt optimized': 'プロンプトを最適化しました',
    'Failed to optimize prompt': 'プロンプトの最適化に失敗しました',
    'Enable prompt enhance': 'プロンプト拡張を有効化',
    'Show an optimize-prompt button on the model usage page. Users pay for the dedicated chat model below.':
      'モデル利用ページに最適化ボタンを表示します。下の専用チャットモデルで課金されます。',
    'Prompt enhance model': 'プロンプト拡張モデル',
    'e.g. gpt-4o-mini': '例: gpt-4o-mini',
    'Must be an available chat model. Image or video-only models are not supported.':
      '利用可能なチャットモデルである必要があります。画像/動画専用モデルは非対応です。',
    'Prompt enhance max tokens': '拡張の最大出力 tokens',
    'Output cap for each enhance request. Also used for the hover estimate.':
      '1回あたりの出力上限。ホバー見積もりにも使用します。',
  },
  fr: {
    'Optimize prompt': 'Optimiser le prompt',
    'Est. about {{count}} tokens': 'Environ {{count}} tokens',
    'Prompt enhance model is not configured':
      'Le modèle d’enrichissement n’est pas configuré',
    'Prompt enhance returned empty content':
      'Le résultat d’enrichissement est vide',
    'Prompt optimized': 'Prompt optimisé',
    'Failed to optimize prompt': 'Échec de l’optimisation du prompt',
    'Enable prompt enhance': 'Activer l’enrichissement de prompt',
    'Show an optimize-prompt button on the model usage page. Users pay for the dedicated chat model below.':
      'Affiche un bouton d’optimisation sur la page d’utilisation des modèles. Les utilisateurs paient le modèle de chat dédié ci-dessous.',
    'Prompt enhance model': 'Modèle d’enrichissement',
    'e.g. gpt-4o-mini': 'ex. gpt-4o-mini',
    'Must be an available chat model. Image or video-only models are not supported.':
      'Doit être un modèle chat disponible. Les modèles image/vidéo seuls ne sont pas pris en charge.',
    'Prompt enhance max tokens': 'Tokens max d’enrichissement',
    'Output cap for each enhance request. Also used for the hover estimate.':
      'Plafond de sortie par requête, aussi utilisé pour l’estimation au survol.',
  },
  ru: {
    'Optimize prompt': 'Оптимизировать промпт',
    'Est. about {{count}} tokens': 'Около {{count}} tokens',
    'Prompt enhance model is not configured':
      'Модель улучшения промпта не настроена',
    'Prompt enhance returned empty content': 'Пустой результат улучшения',
    'Prompt optimized': 'Промпт оптимизирован',
    'Failed to optimize prompt': 'Не удалось оптимизировать промпт',
    'Enable prompt enhance': 'Включить улучшение промпта',
    'Show an optimize-prompt button on the model usage page. Users pay for the dedicated chat model below.':
      'Показать кнопку оптимизации на странице использования моделей. Пользователи платят за указанную ниже chat-модель.',
    'Prompt enhance model': 'Модель улучшения промпта',
    'e.g. gpt-4o-mini': 'напр. gpt-4o-mini',
    'Must be an available chat model. Image or video-only models are not supported.':
      'Нужна доступная chat-модель. Модели только для изображений/видео не поддерживаются.',
    'Prompt enhance max tokens': 'Макс. tokens улучшения',
    'Output cap for each enhance request. Also used for the hover estimate.':
      'Лимит вывода на запрос; также для оценки при наведении.',
  },
  vi: {
    'Optimize prompt': 'Tối ưu prompt',
    'Est. about {{count}} tokens': 'Ước tính khoảng {{count}} tokens',
    'Prompt enhance model is not configured':
      'Chưa cấu hình mô hình mở rộng prompt',
    'Prompt enhance returned empty content': 'Kết quả mở rộng trống',
    'Prompt optimized': 'Đã tối ưu prompt',
    'Failed to optimize prompt': 'Tối ưu prompt thất bại',
    'Enable prompt enhance': 'Bật mở rộng prompt',
    'Show an optimize-prompt button on the model usage page. Users pay for the dedicated chat model below.':
      'Hiện nút tối ưu trên trang dùng mô hình. Người dùng trả phí theo mô hình chat bên dưới.',
    'Prompt enhance model': 'Mô hình mở rộng prompt',
    'e.g. gpt-4o-mini': 'vd. gpt-4o-mini',
    'Must be an available chat model. Image or video-only models are not supported.':
      'Phải là mô hình chat khả dụng. Không hỗ trợ mô hình chỉ ảnh/video.',
    'Prompt enhance max tokens': 'Max tokens mở rộng',
    'Output cap for each enhance request. Also used for the hover estimate.':
      'Giới hạn output mỗi lần; cũng dùng để ước tính khi hover.',
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
