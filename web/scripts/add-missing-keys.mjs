import fs from 'node:fs/promises'
import path from 'node:path'

const LOCALES_DIR = path.resolve('src/i18n/locales')

function stableStringify(obj) {
  return JSON.stringify(obj, null, 2) + '\n'
}

const newKeys = {
  en: {
    'Your compute balance is not enough for this chat. Top up to continue chatting~':
      'Your compute balance is not enough for this chat. Top up to continue chatting~',
    'Show error details': 'Show error details',
    'Hide error details': 'Hide error details',
  },
  zh: {
    'Your compute balance is not enough for this chat. Top up to continue chatting~':
      '您的算力余额不够本次对话啦，充值后即可继续畅聊～',
    'Show error details': '展开错误详情',
    'Hide error details': '收起错误详情',
  },
  'zh-TW': {
    'Your compute balance is not enough for this chat. Top up to continue chatting~':
      '您的算力餘額不夠本次對話啦，儲值後即可繼續暢聊～',
    'Show error details': '展開錯誤詳情',
    'Hide error details': '收起錯誤詳情',
  },
  ja: {
    'Your compute balance is not enough for this chat. Top up to continue chatting~':
      '今回の会話には計算クレジットが足りません。チャージ後に続けてチャットできます～',
    'Show error details': 'エラー詳細を表示',
    'Hide error details': 'エラー詳細を隠す',
  },
  fr: {
    'Your compute balance is not enough for this chat. Top up to continue chatting~':
      'Votre solde de calcul ne suffit pas pour cette conversation. Rechargez pour continuer à discuter～',
    'Show error details': 'Afficher les détails',
    'Hide error details': 'Masquer les détails',
  },
  ru: {
    'Your compute balance is not enough for this chat. Top up to continue chatting~':
      'Баланса вычислительных ресурсов недостаточно для этого чата. Пополните, чтобы продолжить～',
    'Show error details': 'Показать детали ошибки',
    'Hide error details': 'Скрыть детали ошибки',
  },
  vi: {
    'Your compute balance is not enough for this chat. Top up to continue chatting~':
      'Số dư tính toán không đủ cho cuộc trò chuyện này. Nạp thêm để tiếp tục chat nhé～',
    'Show error details': 'Hiện chi tiết lỗi',
    'Hide error details': 'Ẩn chi tiết lỗi',
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
