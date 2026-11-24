import { OpenAIChannelRequest } from './OpenAIChannelRequest'
import { BingChannelRequest } from './BingChannelRequest'
import { GoogleChannelRequest } from './GoogleChannelRequest'
import { DeepLChannelRequest } from './DeepLChannelRequest'
import { AzureOpenAIChannelRequest } from './AzureOpenAIChannelRequest'
import { BaiduChannelRequest } from './BaiduChannelRequest'
import { TTimeAIChannelRequest } from './TTimeAIChannelRequest'
import TranslateServiceEnum from '../../../common/enums/TranslateServiceEnum'

let currentRequestId: string
let currentStream: AbortController

export const setActiveTranslationRequest = (requestId?: string): void => {
  currentStream?.abort()
  currentRequestId = requestId
  currentStream = requestId ? new AbortController() : undefined
}

class ChannelRequest {
  /**
   * DeepL - 翻译
   *
   * @param info 翻译信息
   */
  static deeplTranslate = (info): void => {
    DeepLChannelRequest.apiTranslateByDeepL(info)
  }

  /**
   * DeepL - 翻译
   *
   * @param info 翻译信息
   */
  static deeplbuiltinTranslate = (info): void => {
    DeepLChannelRequest.apiTranslateByDeepLBuiltIn(info)
  }

  /**
   * Google - 翻译
   *
   * @param info 翻译信息
   */
  static googleTranslate = (info): void => {
    GoogleChannelRequest.apiTranslateByGoogle(info)
  }

  /**
   * Google - 翻译
   *
   * @param info 翻译信息
   */
  static googlebuiltinTranslate = (info): void => {
    GoogleChannelRequest.apiTranslateByGoogleBuiltIn(info)
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
  static bingTranslate = (info): void => {
    BingChannelRequest.apiTranslateByBing(info)
  }

  /**
   * bing字典 - 翻译
   *
   * @param info 翻译信息
   */
  static bingdictTranslate = (info): void => {
    BingChannelRequest.apiTranslateByBingDict(info)
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
window.api['agentApiTranslate'](async (info) => {
  if (
    !info.isTranslateCheckType &&
    (info.type === TranslateServiceEnum.OPEN_AI ||
      info.type === TranslateServiceEnum.AZURE_OPEN_AI ||
      info.type === TranslateServiceEnum.TTIME_AI) &&
    (!currentStream || info.requestId !== currentRequestId)
  ) {
    return
  }
  const signal = currentStream?.signal
  try {
    await ChannelRequest[info.type.toLowerCase() + 'Translate'](info, signal)
  } catch (error) {
    if (!signal?.aborted) window.api.logErrorEvent('翻译请求失败', error)
  }
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
