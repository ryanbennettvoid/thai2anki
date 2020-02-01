
const yargs = require('yargs')
const fs = require('fs')
const pdf = require('pdf-parse')
const isAlpha = require('is-alphanumerical')
const thaiCut = require('thai-cut-slim')
const AnkiExport = require('anki-apkg-export').default

const textFilterRegExp = new RegExp("^(|[0-9]|[/]|[\\]|[ ]|[\n]|[.]|[ๅภถุึคตจขชๆไำพะัีรนยบลฃฟหกดเ้่าสวงผปแอิืทมใฝ๑๒๓๔ู฿๕๖๗๘๙๐ฎฑธํ๊ณฯญฐฅฤฆฏโฌ็๋ษศซฉฮฺ์ฒฬฦ])+$", "g")

const FILE_TYPE_PDF = 'pdf'
const FILE_TYPE_DOCX = 'docx'

function getFilenameSuffix(filename: string) : string {
  const suffix: string = (filename.split('.').reverse()[0] || '')
    .toLowerCase()
  return suffix
}

async function getTextFromPdf(filename: string) : Promise<string> {
  try {

    const dataBuffer = fs.readFileSync(filename)
    const data = await pdf(dataBuffer)

    const text: string = data.text
      .split('\n')
      .filter((line: string) => textFilterRegExp.test(line))
      .join('')
      .split('\t')
      .join('')

    return text

  } catch (err) {
    return Promise.reject(err)
  }
}

async function buildAnkiDeck(words: string[], filename: string) {
  try {
    const apkg = new AnkiExport('deck-name')
    
    interface WordCountMap { 
      [key: string]: number
    }

    const wordCounts: WordCountMap = words.reduce((acc: WordCountMap, word: string) => {
      if (typeof acc[word] === 'undefined') {
        acc[word] = 0
      }
      acc[word]++
      return acc
    }, {} as WordCountMap)

    const dedupedWords: string[] = Object.keys(wordCounts)
    
    dedupedWords
    .sort((a: string, b: string) => {
      return wordCounts[b] - wordCounts[a]
    })
    .forEach((thaiWord: string) => {
      const front: string = thaiWord
      const back: string = `count: ${wordCounts[thaiWord]}`
      apkg.addCard(front, back)
    })
     
    const zip = await apkg.save()
    const ankiFilename = `${filename}.apkg`
    fs.writeFileSync(ankiFilename, zip, 'binary')
    console.log(`Package has been generated: ${ankiFilename}`)

  } catch (err) {
    return Promise.reject(err)
  }
}

async function main() {
  try {

    const { _ } = yargs.argv
    const [ filename='' ] = _
    if (!(filename && filename.length > 0)) {
      throw new Error(`no file provided`)
    }

    const suffix: string = getFilenameSuffix(filename)
    
    let text = ''

    switch (suffix) {
      case FILE_TYPE_PDF:
        text = await getTextFromPdf(filename)
        break
      case FILE_TYPE_DOCX:
        break
      default:
        throw new Error(`unsupported file type: ${suffix}`)
    }

    const words : string[] = thaiCut.cut(text)
    await buildAnkiDeck(words, filename)

  } catch (err) {
    return Promise.reject(err)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})