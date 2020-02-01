
const BPromise = require('bluebird')
const yargs = require('yargs')
const fs = require('fs')
const pdf = require('pdf-parse')
const mammoth = require('mammoth')
const isAlpha = require('is-alphanumerical')
const thaiCut = require('thai-cut-slim')
const thaiDict = require('thaidict')
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
    const apkg = new AnkiExport(filename)
    
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

    interface WordDefinitionMap {
      [key: string]: string
    }

    await thaiDict.init()
    const definitions: WordDefinitionMap = await BPromise.reduce(dedupedWords, async (acc: WordDefinitionMap, word: string) => {
      try {

        interface Result {
          search: string
          result: string
          type: string
          synonym: string[]
          antonym: string[]
          relate: string[]
          sample: string
          tag: string[]
        }

        const results: Result[] = await thaiDict.search(word)
        if (results.length === 0) {
          throw new Error(`no results found for word: ${word}`)
        }
        const { type, relate=[] } = results[0]
        const englishWords = results.map((r: Result) => r.result).join(', ')
        acc[word] = `[${type}] ${englishWords}`
        if (relate.length > 0) {
          acc[word] += ` (${relate.join(', ')})`
        }
      } catch (err) {
        acc[word] = ''
        // console.error(`error fetching definition for ${word}: `, err.message)
      }
      console.log(acc[word])
      return acc
    }, {} as WordDefinitionMap)
    
    dedupedWords
    .sort((a: string, b: string) => {
      return wordCounts[b] - wordCounts[a]
    })
    .forEach((thaiWord: string) => {
      const definition = definitions[thaiWord] || ''
      const front: string = thaiWord
      const back: string = definition.length > 0 ? definition : '(no definition)'
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

async function getTextFromDocx(filename: string) {
  try {
    const result = await mammoth.extractRawText({ path: filename })
    const text = result.value
    return text
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
        text = await getTextFromDocx(filename)
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