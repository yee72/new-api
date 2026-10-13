import fs from 'node:fs/promises'
import path from 'node:path'

const LOCALES_DIR = path.resolve('src/i18n/locales')

function stableStringify(obj) {
  return JSON.stringify(obj, null, 2) + '\n'
}

const newKeys = {
  en: {
    'Failed to load conversation': 'Failed to load conversation',
    'Failed to save conversation': 'Failed to save conversation',
    'Please sign in to save generated works':
      'Please sign in to save generated works',
  },
  zh: {
    'Failed to load conversation': '加载对话失败',
    'Failed to save conversation': '保存对话失败',
    'Please sign in to save generated works': '请先登录以保存生成的作品',
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

    const sorted = {}
    for (const key of Object.keys(json.translation).sort((a, b) =>
      a.localeCompare(b)
    )) {
      sorted[key] = json.translation[key]
    }
    json.translation = sorted

    await fs.writeFile(filePath, stableStringify(json))
    console.log(`${locale}: ${count} keys added/updated`)
    totalAdded += count
  }

  console.log(`Done. ${totalAdded} total.`)
}

await main()
