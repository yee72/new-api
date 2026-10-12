import fs from 'node:fs/promises'
import path from 'node:path'

const LOCALES_DIR = path.resolve('src/i18n/locales')

function stableStringify(obj) {
  return JSON.stringify(obj, null, 2) + '\n'
}

const newKeys = {
  en: {
    'Show endpoint type filter': 'Show endpoint type filter',
    'Allow users to filter models by endpoint type on the model plaza':
      'Allow users to filter models by endpoint type on the model plaza',
  },
  zh: {
    'Show endpoint type filter': '显示端点类型筛选',
    'Allow users to filter models by endpoint type on the model plaza':
      '允许用户在模型广场按端点类型筛选模型',
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
