import { isNotNull, isNull } from '../../../common/utils/validate'
import HttpMethodType from '../enums/HttpMethodTypeClassEnum'
import request from '../utils/requestNotHandle'
import R from '../../../common/class/R'
import AgentTranslateCallbackVo from '../../../common/class/AgentTranslateCallbackVo'
import TranslateServiceEnum from '../../../common/enums/TranslateServiceEnum'
import { commonError } from '../utils/RequestUtil'
import { OpenAIStatusEnum } from '../../../common/enums/OpenAIStatusEnum'
import { v4 as uuidv4 } from 'uuid'
import { OpenAIModelEnum } from '../../../common/enums/OpenAIModelEnum'
import { EventStreamContentType, fetchEventSource } from '@fortaine/fetch-event-source'

export class QuoteProcessor {
  private quote: string
  public quoteStart: string
  public quoteEnd: string
  private prevQuoteStartBuffer: string
  private prevQuoteEndBuffer: string

  constructor() {
    this.quote = uuidv4().replace(/-/g, '').slice(0, 4)
    this.quoteStart = `<${this.quote}>`
    this.quoteEnd = `</${this.quote}>`
    this.prevQuoteStartBuffer = ''
    this.prevQuoteEndBuffer = ''
  }

  public processText(text: string): string {
    const deltas = text.split('')
    const targetPieces = deltas.map((delta) => this.processTextDelta(delta))
    return targetPieces.join('')
  }

  private processTextDelta(textDelta: string): string {
    if (textDelta === '') {
      return ''
    }
    if (textDelta.trim() === this.quoteEnd) {
      return ''
    }
    let result = textDelta
    // process quote start
    let quoteStartBuffer = this.prevQuoteStartBuffer
    // console.debug('\n\n')
    // console.debug('---- process quote start -----')
    // console.debug('textDelta', textDelta)
    // console.debug('this.quoteStartbuffer', this.quoteStartBuffer)
    // console.debug('start loop:')
    let startIdx = 0
    for (let i = 0; i < textDelta.length; i++) {
      const char = textDelta[i]
      // console.debug(`---- i: ${i} startIdx: ${startIdx} ----`)
      // console.debug('char', char)
      // console.debug('quoteStartBuffer', quoteStartBuffer)
      // console.debug('result', result)
      if (char === this.quoteStart[quoteStartBuffer.length]) {
        if (this.prevQuoteStartBuffer.length > 0) {
          if (i === startIdx) {
            quoteStartBuffer += char
            result = textDelta.slice(i + 1)
            startIdx += 1
          } else {
            result = this.prevQuoteStartBuffer + textDelta
            quoteStartBuffer = ''
            break
          }
        } else {
          quoteStartBuffer += char
          result = textDelta.slice(i + 1)
        }
      } else {
        if (quoteStartBuffer.length === this.quoteStart.length) {
          quoteStartBuffer = ''
          break
        }
        if (quoteStartBuffer.length > 0) {
          result = this.prevQuoteStartBuffer + textDelta
          quoteStartBuffer = ''
          break
        }
      }
    }
    // console.debug('end loop!')
    this.prevQuoteStartBuffer = quoteStartBuffer
    // console.debug('result', result)
    // console.debug('this.quoteStartBuffer', this.quoteStartBuffer)
    // console.debug('---- end of process quote start -----')
    textDelta = result
    // process quote end
    let quoteEndBuffer = this.prevQuoteEndBuffer
    // console.debug('\n\n')
    // console.debug('---- start process quote end -----')
    // console.debug('textDelta', textDelta)
    // console.debug('this.quoteEndBuffer', this.quoteEndBuffer)
    // console.debug('start loop:')
    let endIdx = 0
    for (let i = 0; i < textDelta.length; i++) {
      const char = textDelta[i]
      // console.debug(`---- i: ${i}, endIdx: ${endIdx} ----`)
      // console.debug('char', char)
      // console.debug('quoteEndBuffer', quoteEndBuffer)
      // console.debug('result', result)
      if (char === this.quoteEnd[quoteEndBuffer.length]) {
        if (this.prevQuoteEndBuffer.length > 0) {
          if (i === endIdx) {
            quoteEndBuffer += char
            result = textDelta.slice(i + 1)
            endIdx += 1
          } else {
            result = this.prevQuoteEndBuffer + textDelta
            quoteEndBuffer = ''
            break
          }
        } else {
          quoteEndBuffer += char
          result = textDelta.slice(0, textDelta.length - quoteEndBuffer.length)
        }
      } else {
        if (quoteEndBuffer.length === this.quoteEnd.length) {
          quoteEndBuffer = ''
          break
        }
        if (quoteEndBuffer.length > 0) {
          result = this.prevQuoteEndBuffer + textDelta
          quoteEndBuffer = ''
          break
        }
      }
    }
    // console.debug('end loop!')
    this.prevQuoteEndBuffer = quoteEndBuffer
    // console.debug('totally result', result)
    // console.debug('this.quoteEndBuffer', this.quoteEndBuffer)
    // console.debug('---- end of process quote end -----')
    return result
  }
}

/**
 * 构建 Chat Completions 请求地址
 * 兼容以下几种填写方式：
 * https://api.openai.com                     -> https://api.openai.com/v1/chat/completions
 * https://api.deepseek.com/v1                -> https://api.deepseek.com/v1/chat/completions
 * https://ark.cn-beijing.volces.com/api/v3   -> https://ark.cn-beijing.volces.com/api/v3/chat/completions
 * https://xxx.com/v1/chat/completions        -> 原样使用
 *
 * @param requestUrl 请求地址
 */
export const buildChatCompletionsUrl = (requestUrl: string): string => {
  let url = isNull(requestUrl) ? OpenAIModelEnum.REQUEST_URL : requestUrl.trim()
  url = url.replace(/\/+$/, '')
  if (url.endsWith('/chat/completions')) {
    return url
  }
  if (/\/v\d+[a-z]*$/i.test(url)) {
    return url + '/chat/completions'
  }
  return url + '/v1/chat/completions'
}

/**
 * 从错误响应中解析错误信息
 *
 * @param body 响应内容
 */
const parseErrorMessage = (body: string): string => {
  try {
    const json = JSON.parse(body)
    return json?.error?.message ?? json?.message ?? json?.msg ?? body
  } catch (e) {
    return body
  }
}

/**
 * 用于终止 fetchEventSource 重试的异常
 */
class FatalError extends Error {}

class OpenAIChannelRequest {
  static buildOpenAIRequest(
    info,
    isCheckRequest
  ): { data: object; quoteProcessor: QuoteProcessor } {
    const languageType = info.languageType
    const languageResultType = info.languageResultType
    const quoteProcessor = new QuoteProcessor()
    let rolePrompt =
      'You are a professional translation engine, please translate the text into a colloquial, professional, elegant and fluent content, without the style of machine translation. You must only translate the text content, never interpret it.'
    let commandPrompt = `Translate from ${languageType} to ${languageResultType}. Return translated text only. Only translate the text between ${quoteProcessor.quoteStart} and ${quoteProcessor.quoteEnd}.`
    let contentPrompt = `${quoteProcessor.quoteStart}${info.translateContent}${quoteProcessor.quoteEnd}`
    if (languageResultType === '文字润色') {
      rolePrompt =
        "You are a professional text summarizer, you can only summarize the text, don't interpret it."
      commandPrompt = `Please polish this text in ${languageType}. Only polish the text between ${quoteProcessor.quoteStart} and ${quoteProcessor.quoteEnd}.`
    } else if (languageResultType === '总结') {
      rolePrompt =
        "You are a professional text summarizer, you can only summarize the text, don't interpret it."
      commandPrompt = `Please summarize this text in the most concise language and must use ${languageType} language! Only summarize the text between ${quoteProcessor.quoteStart} and ${quoteProcessor.quoteEnd}.`
      contentPrompt = `${quoteProcessor.quoteStart}${info.translateContent}${quoteProcessor.quoteEnd}`
    } else if (languageResultType === '分析') {
      rolePrompt = 'You are a professional translation engine and grammar analyzer.'
      commandPrompt = `Please translate this text to ${languageType} and explain the grammar in the original text using ${languageType}. Only analyze the text between ${quoteProcessor.quoteStart} and ${quoteProcessor.quoteEnd}.`
      contentPrompt = `${quoteProcessor.quoteStart}${info.translateContent}${quoteProcessor.quoteEnd}`
    } else if (languageResultType === '解释代码') {
      rolePrompt =
        'You are a code explanation engine that can only explain code but not interpret or translate it. Also, please report bugs and errors (if any).'
      commandPrompt = `explain the provided code, regex or script in the most concise language and must use ${languageType} language! You may use Markdown. If the content is not code, return an error message. If the code has obvious errors, point them out.`
      contentPrompt = '```\n' + info.translateContent + '\n```'
    }
    return {
      data: {
        model: info.model,
        // 控制随机性：随着 temperature 接近 0 ，重复提交的内容，返回的结果将变得具有确定性和重复性
        // 一个介于 0 和 1 之间的值 可以为0.1这样的小数
        // 每次提交相同的内容时 按照 0 - 1 的概率返回不同的答案
        // 我们这里默认为 0 ，重复提交相同的内容返回同样的结果
        // 不再限制 max_tokens：思考模型的思考内容也会计入 max_tokens，限制过小时会导致没有任何翻译输出
        temperature: 0,
        messages: [
          { role: 'system', content: rolePrompt },
          { role: 'user', content: commandPrompt },
          { role: 'user', content: contentPrompt }
        ],
        stream: !isCheckRequest,
        ...OpenAIChannelRequest.buildExtraRequestParams(info)
      },
      quoteProcessor
    }
  }

  /**
   * 构建额外请求参数 - 思考强度 / 自定义额外参数
   *
   * @param info 翻译信息
   */
  static buildExtraRequestParams(info): object {
    const params = {}
    if (isNotNull(info.reasoningEffort)) {
      params['reasoning_effort'] = info.reasoningEffort
      // 思考模型大多不支持 temperature 参数
      params['temperature'] = undefined
    }
    if (isNotNull(info.extraParams) && isNotNull(info.extraParams.trim())) {
      try {
        Object.assign(params, JSON.parse(info.extraParams))
      } catch (e) {
        window.api.logErrorEvent('[OpenAI翻译事件] - 额外请求参数不是合法的 JSON : ', info.extraParams)
      }
    }
    return params
  }

  /**
   * OpenAI - 翻译
   *
   * @param info            翻译信息
   */
  static openaiTranslate = async (info): Promise<void> => {
    const isCheckRequest = false
    const { data, quoteProcessor } = OpenAIChannelRequest.buildOpenAIRequest(info, isCheckRequest)
    window.api['agentApiTranslateCallback'](
      R.okD(
        new AgentTranslateCallbackVo(info, {
          code: OpenAIStatusEnum.START
        })
      )
    )
    let text = ''
    // 是否收到了思考内容
    let hasReasoning = false
    // 是否已经回调过错误信息
    let errorStatus = false
    const errorCallback = (error): void => {
      if (errorStatus) {
        return
      }
      errorStatus = true
      window.api['agentApiTranslateCallback'](
        R.errorD(
          new AgentTranslateCallbackVo(info, {
            code: OpenAIStatusEnum.ERROR,
            error: error
          })
        )
      )
    }
    try {
      await fetchEventSource(buildChatCompletionsUrl(info.requestUrl), {
        method: 'POST',
        body: JSON.stringify(data),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${info.appKey}`
        },
        openWhenHidden: true,
        async onopen(response) {
          const contentType = response.headers.get('content-type') ?? ''
          if (response.ok && contentType.indexOf(EventStreamContentType) !== -1) {
            return // everything's good
          }
          const body = await response.text().catch(() => '')
          // 部分服务即使请求了流式输出也会直接返回完整的 JSON 结果
          if (response.ok) {
            try {
              const content = JSON.parse(body)?.choices?.[0]?.message?.content
              if (isNotNull(content)) {
                text = quoteProcessor.processText(content)
                window.api['agentApiTranslateCallback'](
                  R.okD(
                    new AgentTranslateCallbackVo(info, {
                      code: OpenAIStatusEnum.ING,
                      content: text
                    })
                  )
                )
                window.api['agentApiTranslateCallback'](
                  R.okD(new AgentTranslateCallbackVo(info, { code: OpenAIStatusEnum.END }))
                )
                errorStatus = true
                throw new FatalError()
              }
            } catch (e) {
              if (e instanceof FatalError) {
                throw e
              }
            }
          }
          window.api.logInfoEvent('[OpenAI翻译事件] - error 连接失败 :', {
            status: response.status,
            statusText: response.statusText,
            body
          })
          let msg = parseErrorMessage(body)
          if (isNull(msg)) {
            msg = `连接失败 [${response.status}] ${response.statusText}`
          } else if (!response.ok) {
            msg = `[${response.status}] ${msg}`
          }
          errorCallback(msg)
          throw new FatalError(msg)
        },
        onmessage(msg) {
          const value = msg.data
          try {
            const dataArray = value.split('data: ')
            dataArray.forEach((data) => {
              data = data.trim().replace(/data:/g, '')
              if (isNull(data) || data === '[DONE]') {
                return
              }
              data = JSON.parse(data)
              if (isNotNull(data['error'])) {
                errorCallback(data)
                return
              }
              const delta = data['choices']?.[0]?.['delta']
              if (isNull(delta)) {
                return
              }
              if (isNotNull(delta['reasoning_content']) || isNotNull(delta['reasoning'])) {
                hasReasoning = true
              }
              let content = delta['content']
              if (isNull(content)) {
                return
              }
              content = quoteProcessor.processText(content)
              text += content
              window.api['agentApiTranslateCallback'](
                R.okD(
                  new AgentTranslateCallbackVo(info, {
                    code: OpenAIStatusEnum.ING,
                    content: content
                  })
                )
              )
            })
          } catch (e) {
            window.api.logErrorEvent('[OpenAI翻译事件] - parse error : ', text, msg)
          }
        },
        onclose() {
          window.api.logInfoEvent('[OpenAI翻译事件] - 响应报文 : ', text)
          if (errorStatus) {
            return
          }
          if (isNull(text.trim())) {
            errorCallback(
              hasReasoning
                ? '模型只返回了思考内容，没有返回翻译结果，请检查思考参数 / 额外参数设置'
                : '模型没有返回任何内容，请检查模型名称、请求地址是否正确'
            )
            return
          }
          window.api['agentApiTranslateCallback'](
            R.okD(
              new AgentTranslateCallbackVo(info, {
                code: OpenAIStatusEnum.END
              })
            )
          )
        },
        onerror(err) {
          window.api.logInfoEvent('[OpenAI翻译事件] - error {}', err)
          // errorStatus 已为 true 时 errorCallback 不会重复回调
          errorCallback(err instanceof FatalError ? err.message : String(err))
          // 抛出异常 不再进行重试
          throw err
        }
      })
    } catch (e) {
      // 错误信息已在上方回调处理
    }
  }

  /**
   * OpenAI - 翻译
   *
   * @param info 翻译信息
   */
  static openaiCheck = (info): void => {
    const isCheckRequest = true
    const { data } = OpenAIChannelRequest.buildOpenAIRequest(info, isCheckRequest)
    const requestInfo = {
      url: buildChatCompletionsUrl(info.requestUrl),
      // 思考模型响应较慢 适当放宽超时时间
      timeout: 60000,
      method: HttpMethodType.POST,
      data,
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + info.appKey
      }
    }
    request(requestInfo).then(
      (data) => {
        const error = data['error']
        if (error) {
          window.api['agentApiTranslateCallback'](
            R.errorD(
              new AgentTranslateCallbackVo(info, commonError(TranslateServiceEnum.OPEN_AI, error))
            )
          )
          return
        }
        window.api['agentApiTranslateCallback'](R.okD(new AgentTranslateCallbackVo(info, data)))
      },
      (err) => {
        window.api['agentApiTranslateCallback'](
          R.errorD(
            new AgentTranslateCallbackVo(info, commonError(TranslateServiceEnum.OPEN_AI, err))
          )
        )
      }
    )
  }
}

export { OpenAIChannelRequest }
