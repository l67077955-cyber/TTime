import { OpenAIChannelRequest } from './OpenAIChannelRequest'
import { BingChannelRequest } from './BingChannelRequest'
import { GoogleChannelRequest } from './GoogleChannelRequest'
import { DeepLChannelRequest } from './DeepLChannelRequest'
import { AzureOpenAIChannelRequest } from './AzureOpenAIChannelRequest'
import { BaiduChannelRequest } from './BaiduChannelRequest'
import { TTimeAIChannelRequest } from './TTimeAIChannelRequest'
import TranslateServiceEnum from '../../../common/enums/TranslateServiceEnum'

let currentRequestId: string | undefined
let currentStream: AbortController | undefined
// 进行中的翻译任务
const pendingTasks = new Set<Promise<void>>()
// 等待翻译任务结束的最长时间 避免个别请求无法响应中止信号时一直无法开始新的翻译
const STOP_TIMEOUT = 5000

export const setActiveTranslationRequest = (requestId?: string): void => {
  currentStream?.abort()
  currentRequestId = requestId
  currentStream = requestId ? new AbortController() : undefined
}

/**
 * 中止当前翻译 并等待渲染进程与主进程中进行中的翻译请求全部结束
 */
export const stopActiveTranslation = async (): Promise<void> => {
  setActiveTranslationRequest()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(true), STOP_TIMEOUT)
  })
  const stopped = Promise.allSettled([...pendingTasks, window.api.apiStopTranslate()]).then(() => false)
  const timedOut = await Promise.race([stopped, timeout])
  clearTimeout(timer)
  if (timedOut) window.api.logInfoEvent('[翻译事件] - 等待上一次翻译结束超时')
}

class ChannelRequest {
  /**
   * DeepL - 翻译
   *
   * @param info 翻译信息
   */
  static deeplTranslate = (info, signal?: AbortSignal): Promise<void> => {
    return DeepLChannelRequest.apiTranslateByDeepL(info, signal)
  }

  /**
   * DeepL - 翻译
   *
   * @param info 翻译信息
   */
  static deeplbuiltinTranslate = (info, signal?: AbortSignal): Promise<void> => {
    return DeepLChannelRequest.apiTranslateByDeepLBuiltIn(info, signal)
  }

  /**
   * Google - 翻译
   *
   * @param info 翻译信息
   */
  static googleTranslate = (info, signal?: AbortSignal): Promise<void> => {
    return GoogleChannelRequest.apiTranslateByGoogle(info, signal)
  }

  /**
   * Google - 翻译
   *
   * @param info 翻译信息
   */
  static googlebuiltinTranslate = (info, signal?: AbortSignal): Promise<void> => {
    return GoogleChannelRequest.apiTranslateByGoogleBuiltIn(info, signal)
  }

  /**
   * OpenAI - 翻译
   *
   * @param info            翻译信息
   */
  static openaiTranslate = (info, signal: AbortSignal): void => {
    if (info.isTranslateCheckType) {
      OpenAIChannelRequest.openaiCheck(info)
    } else {
      return void OpenAIChannelRequest.openaiTranslate(info, signal)
    }
  }

  /**
   * OpenAI - 翻译
   *
   * @param info            翻译信息
   */
  static azureopenaiTranslate = (info, signal: AbortSignal): Promise<void> | void => {
    if (info.isTranslateCheckType) {
      AzureOpenAIChannelRequest.openaiCheck(info)
    } else {
      return AzureOpenAIChannelRequest.openaiTranslate(info, signal)
    }
  }

  /**
   * TTimeAI - 翻译
   *
   * @param info            翻译信息
   */
  static ttimeaiTranslate = (info, signal: AbortSignal): Promise<void> => {
    return TTimeAIChannelRequest.openaiTranslate(info, signal)
  }

  /**
   * bing - 翻译
   *
   * @param info 翻译信息
   */
  static bingTranslate = (info, signal?: AbortSignal): Promise<void> => {
    return BingChannelRequest.apiTranslateByBing(info, signal)
  }

  /**
   * bing字典 - 翻译
   *
   * @param info 翻译信息
   */
  static bingdictTranslate = (info, signal?: AbortSignal): Promise<void> => {
    return BingChannelRequest.apiTranslateByBingDict(info, signal)
  }

  /**
   * 百度图片翻译
   *
   * @param info 信息
   */
  static baiduimageOcr = (info): void => {
    BaiduChannelRequest.apiOcrImg(info)
  }
}

/**
 * 代理模式 - api翻译
 *
 * @param type 翻译源类型
 * @param info 翻译源类型
 */
window.api['agentApiTranslate']((info) => {
  const translate = (signal?: AbortSignal): Promise<void> =>
    Promise.resolve(ChannelRequest[info.type.toLowerCase() + 'Translate'](info, signal))
  if (info.isTranslateCheckType) {
    translate().catch((error) => window.api.logErrorEvent('翻译请求失败', error))
    return
  }
  const isStream =
    info.type === TranslateServiceEnum.OPEN_AI ||
    info.type === TranslateServiceEnum.AZURE_OPEN_AI ||
    info.type === TranslateServiceEnum.TTIME_AI
  // 已被中止或已过期的翻译请求不再执行
  if ((isStream && !currentStream) || (info.requestId && info.requestId !== currentRequestId)) {
    return
  }
  const signal = currentStream?.signal
  const task = translate(signal).catch((error) => {
    if (!signal?.aborted) window.api.logErrorEvent('翻译请求失败', error)
  })
  pendingTasks.add(task)
  task.finally(() => pendingTasks.delete(task))
})

/**
 * 代理模式 - api翻译
 *
 * @param type 翻译源类型
 * @param info 翻译源类型
 */
window.api['agentApiOcr']((info) => {
  ChannelRequest[info.type.toLowerCase() + 'Ocr'](info)
})
