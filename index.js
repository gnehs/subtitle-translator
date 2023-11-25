import fs from 'fs'
import colors from 'colors'
import { Configuration, OpenAIApi } from 'openai'
import { parseSync, stringifySync } from 'subtitle'
const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'))

const configuration = new Configuration({
  apiKey: config.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

let subtitles = fs.readdirSync('./src')
let supportExtensions = ['srt', 'vtt']
for (let subtitleFile of subtitles) {
  if (!supportExtensions.includes(subtitleFile.split('.').pop())) continue
  let subtitle = fs.readFileSync(`./src/${subtitleFile}`, 'utf8')
  subtitle = parseSync(subtitle)
  subtitle = subtitle.filter(line => line.type === 'cue')

  let previousSubtitles = []

  for (let i = 0; i < subtitle.length; i++) {
    // for (let i = 0; i < 10; i++) {
    let text = subtitle[i].data.text
    let input = { Input: text }
    if (subtitle[i + 1]) {
      input.Next = subtitle[i + 1].data.text
    }
    let completion;
    for (;;) {
      try {
        completion = await openai.createChatCompletion({
          model: config.MODEL,
          messages: [
            {
              role: "system",
              content: `You are a program responsible for translating subtitles. Your task is to output the specified target language based on the input text. Please do not create the following subtitles on your own. Please do not output any text other than the translation. You will receive the subtitles as array that needs to be translated, as well as the previous translation results and next subtitle. If you need to merge the subtitles with the following line, simply repeat the translation. Please transliterate the person's name into the local language. Target language: ${config.TARGET_LANGUAGE}`
            },
            ...previousSubtitles.slice(-4),
            {
              role: "user",
              content: JSON.stringify(input)
            }
          ],
        }, {timeout: 60 * 1000 });
        break;
      } catch (e) {
        console.error(`Error:    ${e}`);
        console.log('retrying...'.red);
      }
    }
    let result = completion.data.choices[0].message.content
    try {
      result = JSON.parse(result).Input
    } catch (e) {
      try {
        result = result.match(/"Input":"(.*?)"/)[1]
      } catch (e) {
        console.log('###'.red)
        console.log(e.toString().red)
        console.log(result.red)
        console.log('###'.red)
      }
    }
    previousSubtitles.push({ role: "user", content: JSON.stringify(input) })
    previousSubtitles.push({ role: 'assistant', content: JSON.stringify({ ...input, Input: result }) })
    // console.log(`${subtitle[i].data.text}`.blue)
    subtitle[i].data.text = `${result}\n${text}`
    console.log(`-----------------`.gray)
    console.log(`${i + 1} / ${subtitle.length}`.gray)
    console.log(`${result}`.green)
    console.log(`${text}`.white)
  }
  fs.writeFileSync(`./res/${subtitleFile}`, stringifySync(subtitle, { format: 'srt' }))

}
