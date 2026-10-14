import fs from 'node:fs/promises'
import path from 'node:path'

const LOCALES_DIR = path.resolve('src/i18n/locales')

function stableStringify(obj) {
  return JSON.stringify(obj, null, 2) + '\n'
}

const newKeys = {
  en: {
    Resolution: 'Resolution',
    Low: 'Low',
    Medium: 'Medium',
    High: 'High',
    HD: 'HD',
    '2K': '2K',
    '4K': '4K',
    '480p': '480p',
    '720p': '720p',
    '1080p': '1080p',
    'Current model does not support this image resolution':
      'Current model does not support this image resolution',
  },
  zh: {
    Resolution: '清晰度',
    Low: '低',
    Medium: '中',
    High: '高',
    HD: '高清',
    '2K': '2K',
    '4K': '4K',
    '480p': '480p',
    '720p': '720p',
    '1080p': '1080p',
    'Current model does not support this image resolution':
      '当前模型不支持该图片清晰度',
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
