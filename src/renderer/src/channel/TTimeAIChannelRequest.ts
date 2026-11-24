import R from '../../../common/class/R'
import AgentTranslateCallbackVo from '../../../common/class/AgentTranslateCallbackVo'
import { OpenAIStatusEnum } from '../../../common/enums/OpenAIStatusEnum'
import { EventStreamContentType, fetchEventSource } from '@fortaine/fetch-event-source'
import { cacheGet } from '../utils/cacheUtil'
import { ThinkBlockFilter } from './ThinkBlockFilter'

class TTimeAIChannelRequest {
  /**
   * OpenAI - 翻译
   *
   * @param info            翻译信息
   */
  static openaiTranslate = async (info, signal: AbortSignal): Promise<void> => {
    window.api['agentApiTranslateCallback'](
      R.okD(
        new AgentTranslateCallbackVo(info, {
          code: OpenAIStatusEnum.START
        })
      )
    )
    let text = ''
    const thinkFilter = new ThinkBlockFilter()
    const appendResult = (content: string): void => {
      if (!content) return
      text += content
      window.api['agentApiTranslateCallback'](
        R.okD(new AgentTranslateCallbackVo(info, { code: OpenAIStatusEnum.ING, content }))
      )
    }

    await fetchEventSource('https://ink.timerecord.cn/apis/translate/translateAi/stream', {
      method: 'POST',
      signal,
      body: JSON.stringify({
        languageType: info.languageType,
        languageResultType: info.languageResultType,
        translateContent: info.translateContent
      }),
      headers: {
        'Content-Type': 'application/json',
        token: cacheGet('token')
      },
      async onopen(response) {
        if (response.ok && response.headers.get('content-type')?.includes(EventStreamContentType)) return
        throw new Error(`连接失败 [${response.status}] ${response.statusText}`)
      },
      onmessage(msg) {
        if (signal.aborted) return
        const resStr = msg.data
        try {
          const res = JSON.parse(resStr)
          const content = res.status === 200 ? res.data?.content : res.msg
          if (typeof content === 'string') appendResult(thinkFilter.push(content))
        } catch (e) {
          window.api.logErrorEvent('[TTimeAI翻译事件] - parse error : ', text, msg)
        }
      },
      onclose() {
        if (signal.aborted) return
        appendResult(thinkFilter.finish())
        window.api['agentApiTranslateCallback'](
          R.okD(
            new AgentTranslateCallbackVo(info, {
              code: OpenAIStatusEnum.END
            })
          )
        )
        window.api.logInfoEvent('[TTimeAI翻译事件] - 响应报文 : ', text)
      },
      onerror(err) {
        if (signal.aborted) throw err
        window.api.logInfoEvent('[TTimeAI翻译事件] - error {}', err)
        window.api['agentApiTranslateCallback'](
          R.errorD(
            new AgentTranslateCallbackVo(info, {
              code: OpenAIStatusEnum.ERROR,
                error: err instanceof Error ? err.message : String(err)
            })
          )
        )
        throw err
      }
    })
  }
}

export { TTimeAIChannelRequest }
