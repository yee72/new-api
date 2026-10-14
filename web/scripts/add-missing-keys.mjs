import fs from 'node:fs/promises'
import path from 'node:path'

const LOCALES_DIR = path.resolve('src/i18n/locales')

function stableStringify(obj) {
  return JSON.stringify(obj, null, 2) + '\n'
}

const newKeys = {
  en: {
    'Waiting to load...': 'Waiting to load...',
    'Waiting to generate...': 'Waiting to generate...',
  },
  zh: {
    'Waiting to load...': '等待加载中…',
    'Waiting to generate...': '等待生成中…',
  },
  'zh-TW': {
    'Waiting to load...': '等待載入中…',
    'Waiting to generate...': '等待生成中…',
  },
  ja: {
    'Waiting to load...': '読み込み待機中…',
    'Waiting to generate...': '生成待機中…',
  },
  fr: {
    'Waiting to load...': 'Chargement en attente…',
    'Waiting to generate...': 'Génération en attente…',
  },
  ru: {
    'Waiting to load...': 'Ожидание загрузки…',
    'Waiting to generate...': 'Ожидание генерации…',
  },
  vi: {
    'Waiting to load...': 'Đang chờ tải…',
    'Waiting to generate...': 'Đang chờ tạo…',
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
