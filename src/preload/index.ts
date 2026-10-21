import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import common from './common'
import TranslateServiceEnum from '../common/enums/TranslateServiceEnum'

// 计算当前屏幕下允许的窗口最大高度与滚动容器最大高度
const getMaxWindowHeight = (): number => {
  const availHeight = window?.screen?.availHeight || 722
  return Math.min(722, Math.max(240, availHeight - 20))
}

const syncMaxHeightCssVar = (): number => {
  const maxWinHeight = getMaxWindowHeight()
  const maxBlockLayerHeight = Math.max(180, maxWinHeight - 51)
  if (document?.documentElement) {
    document.documentElement.style.setProperty(
      '--ttime-translate-max-height',
      `${maxBlockLayerHeight}px`
    )
  }
  return maxWinHeight
}

const getActualWindowHeight = (): number => {
  const maxWinHeight = syncMaxHeightCssVar()
  const blockEl = document.querySelector('.block') as HTMLElement | null
  const htmlEl = document.documentElement
  const contentHeight = blockEl ? blockEl.offsetHeight : htmlEl ? htmlEl.offsetHeight : 334
  const rawHeight = contentHeight + 5
  return Math.min(maxWinHeight, Math.max(100, Math.ceil(rawHeight)))
}

let lastSentHeight = 0
let syncTimer: ReturnType<typeof setTimeout> | null = null

const applyWindowHeightNow = (): void => {
  const targetHeight = getActualWindowHeight()
  if (targetHeight !== lastSentHeight) {
    lastSentHeight = targetHeight
    ipcRenderer.invoke('window-height-change-event', targetHeight)
  }
}

const scheduleWindowHeightSync = (delay = 60): void => {
  if (syncTimer) {
    clearTimeout(syncTimer)
  }
  syncTimer = setTimeout(() => {
    syncTimer = null
    applyWindowHeightNow()
  }, delay)
}

// 监听页面高度变化
const pageHeightChangeEvent = (): void => {
  syncMaxHeightCssVar()
  const targetNode = document.scrollingElement || document.documentElement
  if (null == targetNode) {
    return
  }
  let blockObserved = false
  let resizeObserver: ResizeObserver | null = null
  const tryObserveBlock = (): void => {
    if (blockObserved || !resizeObserver) {
      return
    }
    const blockEl = document.querySelector('.block')
    if (blockEl) {
      resizeObserver.observe(blockEl)
      blockObserved = true
    }
  }
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      applyWindowHeightNow()
      scheduleWindowHeightSync(80)
    })
    if (document.body) {
      resizeObserver.observe(document.body)
    }
    const appEl = document.getElementById('app')
    if (appEl) {
      resizeObserver.observe(appEl)
    }
    tryObserveBlock()
  }
  const config = { attributes: true, childList: true, subtree: true }
  const observer = new MutationObserver(() => {
    tryObserveBlock()
    applyWindowHeightNow()
    scheduleWindowHeightSync(100)
  })
  observer.observe(targetNode, config)
}

/**
 * 窗口高度更新为最大（按当前页面实际高度与屏幕上限自适应）
 */
const windowHeightChangeMaxEvent = (): void => {
  applyWindowHeightNow()
  scheduleWindowHeightSync(100)
  setTimeout(() => applyWindowHeightNow(), 320)
}

/**
 * 监听页面高度更新窗口大小
 */
const windowHeightChangeEvent = (): void => {
  applyWindowHeightNow()
  // 延迟执行 防止获取页面高度还未更新就执行了更新窗口大小
  setTimeout(() => {
    lastSentHeight = 0
    applyWindowHeightNow()
  }, 120)
  setTimeout(() => {
    applyWindowHeightNow()
  }, 320)
}

/**
 * 监听更新翻译输入内容事件
 *
 * @param callback 回调方法 用于主进程内部触发时推送到Vue页面执行
 */
const updateTranslateContentEvent = (callback): void => {
  ipcRenderer.on('update-translated-content', (_event, content) => {
    callback(content)
  })
}

/**
 * 截图翻译结束通知事件
 *
 * @param callback 回调方法 用于主进程内部触发时推送到Vue页面执行
 */
const screenshotEndNotifyEvent = (callback): void => {
  ipcRenderer.on('screenshot-end-notify-event', (_event) => {
    callback()
  })
}

/**
 * 清空翻译输入、结果内容事件
 *
 * @param callback 回调方法 用于主进程内部触发时推送到Vue页面执行
 */
const clearAllTranslateContentEvent = (callback): void => {
  ipcRenderer.on('clear-all-translated-content', (_event, _content) => {
    callback()
  })
}

const winShowEvent = (callback): void => {
  ipcRenderer.on('win-show-event', () => {
    callback()
  })
}

const winShowByInputEvent = (callback): void => {
  ipcRenderer.on('win-show-input-event', () => {
    callback()
  })
}

/**
 * 始终在最前面
 */
const alwaysOnTopEvent = (status): void => {
  ipcRenderer.invoke('always-on-top-event', status)
}

/**
 * 更新消息事件
 *
 * @param callback 回调方法
 */
const updateMessageEvent = (callback): void => {
  ipcRenderer.on('update-message-event', (_event, { type, text }) => {
    callback(type, text)
  })
}

/**
 * api翻译回调
 */
const apiTranslateCallbackEventList = {}
/**
 * 根据枚举类型进行创建回调方法
 */
Object.keys(TranslateServiceEnum)
  .filter((key) => typeof TranslateServiceEnum[key] === 'string')
  .map((key) => TranslateServiceEnum[key].toLowerCase())
  .forEach((code) => {
    apiTranslateCallbackEventList[code + 'ApiTranslateCallbackEvent'] = (callback): void => {
      ipcRenderer.on(code + '-api-translate-callback-event', (_event, obj) => {
        callback(obj)
      })
    }
  })

/**
 * 翻译结果消息回调
 * 如果校验无法翻译时，但也不能触发翻译事件时候，此处模拟翻译结果消息回调
 * 目前主要用于手动设置了翻译语言后的校验逻辑
 *
 * @param type 翻译渠道类型
 * @param msg  回调消息内容
 */
const apiTranslateResultMsgCallbackEvent = (type, msg): void => {
  ipcRenderer.invoke('api-translate-result-msg-callback-event', type, msg)
}

/**
 * 翻译
 *
 * @param type 翻译渠道类型
 * @param info 翻译信息
 */
const apiUniteTranslate = (type, info): void => {
  ipcRenderer.invoke('api-unite-translate', type, info)
}

/**
 * 应用启动
 */
const ttimeApiAppStart = (): void => {
  ipcRenderer.invoke('ttime-api-app-start')
}

/**
 * 应用翻译使用
 */
const ttimeApiTranslateUse = (): void => {
  ipcRenderer.invoke('ttime-api-translate-use')
}

/**
 * 更新翻译源通知
 *
 * @param callback 回调方法 用于主进程内部触发时推送到Vue页面执行
 */
const updateTranslateServiceEvent = (callback): void => {
  ipcRenderer.on('update-translate-service-event', (_event) => {
    callback()
  })
}

/**
 * 更新翻译源通知
 */
const updateTranslateServiceNotify = (): void => {
  ipcRenderer.invoke('update-translate-service-notify')
}

/**
 * 窗口字体大小更新通知
 *
 * @param callback 回调方法 用于主进程内部触发时推送到Vue页面执行
 */
const winFontSizeNotify = (callback): void => {
  ipcRenderer.on('win-font-size-notify', (_event) => {
    callback()
  })
}

/**
 * 代理模式 - api翻译
 *
 * @param callback 回调
 */
const agentApiTranslate = (callback): void => {
  ipcRenderer.on('agent-api-translate', (_event, info) => {
    callback(info)
  })
}

/**
 * 代理翻译 - 调用翻译结果回调
 *
 * @param res 信息
 */
const agentApiTranslateCallback = (res): void => {
  ipcRenderer.invoke('agent-api-translate-callback', res)
}

/**
 * 代理模式 - api OCR
 *
 * @param callback 回调
 */
const agentApiOcr = (callback): void => {
  ipcRenderer.on('agent-api-ocr', (_event, info) => {
    callback(info)
  })
}

/**
 * 代理OCR - 调用OCR回调
 *
 * @param res 信息
 */
const agentApiOcrCallback = (res): void => {
  ipcRenderer.invoke('agent-api-ocr-callback', res)
}

/**
 * 窗口大小更新
 */
const winSizeUpdate = (callback): void => {
  ipcRenderer.on('win-size-update', (_event, newBounds) => {
    callback(newBounds)
  })
}

// Custom APIs for renderer
const api = {
  ...common,
  ...apiTranslateCallbackEventList,
  windowHeightChangeEvent,
  updateTranslateContentEvent,
  clearAllTranslateContentEvent,
  pageHeightChangeEvent,
  alwaysOnTopEvent,
  updateMessageEvent,
  windowHeightChangeMaxEvent,
  screenshotEndNotifyEvent,
  winShowEvent,
  winShowByInputEvent,
  apiUniteTranslate,
  ttimeApiAppStart,
  updateTranslateServiceEvent,
  updateTranslateServiceNotify,
  ttimeApiTranslateUse,
  apiTranslateResultMsgCallbackEvent,
  agentApiTranslate,
  agentApiTranslateCallback,
  agentApiOcr,
  agentApiOcrCallback,
  winFontSizeNotify,
  winSizeUpdate
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
