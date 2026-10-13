import fs from 'node:fs/promises'
import path from 'node:path'

const LOCALES_DIR = path.resolve('src/i18n/locales')

function stableStringify(obj) {
  return JSON.stringify(obj, null, 2) + '\n'
}

const newKeys = {
  en: {
    'Controls the Model Usage tab (Chat / Image / Video). The actual API route still follows the model endpoints: image-generation uses the Images API, openai-video uses Videos, otherwise Chat Completions. Set Image for chat-based image models (for example Gemini image) so they appear under Image.':
      'Controls the Model Usage tab (Chat / Image / Video). The actual API route still follows the model endpoints: image-generation uses the Images API, openai-video uses Videos, otherwise Chat Completions. Set Image for chat-based image models (for example Gemini image) so they appear under Image.',
  },
  zh: {
    'Controls the Model Usage tab (Chat / Image / Video). The actual API route still follows the model endpoints: image-generation uses the Images API, openai-video uses Videos, otherwise Chat Completions. Set Image for chat-based image models (for example Gemini image) so they appear under Image.':
      '决定「模型使用」页的 Tab（聊天 / 图片 / 视频）。实际调用协议仍按模型端点：含 image-generation 走图片 API，含 openai-video 走视频 API，否则走对话补全。若模型通过对话协议生图（例如 Gemini image），请将类型设为「图片」以出现在图片 Tab。',
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
