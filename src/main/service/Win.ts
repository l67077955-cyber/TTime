import { app, clipboard, ipcMain, nativeImage, screen } from 'electron'
import { GlobalShortcutEvent } from './GlobalShortcutEvent'
import { isNull } from '../../common/utils/validate'
import { SystemTypeEnum } from '../enums/SystemTypeEnum'
import AutoLaunch from 'auto-launch'
import log from '../utils/log'
import { EnvEnum } from '../enums/EnvEnum'
import GlobalWin from './GlobalWin'

// 翻译窗口高度上下限
const MAX_WIN_HEIGHT = 722
const MIN_WIN_HEIGHT = 100

class WinEvent {
  static mainWinInfo

  // 窗口因底边越界被上移时记录的原始纵坐标与上移后的纵坐标
  static winShiftMap = new Map<number, { originY: number; shiftedY: number }>()

  constructor(mainWinInfo) {
    WinEvent.mainWinInfo = mainWinInfo
    /**
     * 监听页面高度更新窗口大小
     */
    ipcMain.handle('window-height-change-event', (_event, height) => {
      // 更新窗口大小
      WinEvent.updateWinSize(GlobalWin.mainWin, GlobalWin.mainWin.getSize()[0], height)
    })
    /**
     * 文字写入剪贴板
     */
    ipcMain.handle('text-write-shear-plate-event', (_event, text) => {
      // 写入剪贴板
      clipboard.writeText(text)
    })
    /**
     * 图片写入剪贴板
     */
    ipcMain.handle('base64-img-write-shear-plate-event', (_event, base64Img) => {
      // 写入剪贴板
      clipboard.writeImage(nativeImage.createFromDataURL(base64Img))
    })
    /**
     * 始终在最前面
     */
    ipcMain.handle('always-on-top-event', (_event, status) => {
      WinEvent.alwaysOnTop(status)
    })
    /**
     * 始终在最前面
     */
    ipcMain.handle('ocr-always-on-top-event', (_event, status) => {
      WinEvent.ocrAlwaysOnTop(status)
    })
    /**
     * 调起翻译
     */
    ipcMain.handle('update-translated-content-event', (_event, text) => {
      // 推送给Vue页面进行更新翻译输入内容
      GlobalWin.mainWinUpdateTranslatedContent(text)
      GlobalWin.mainWinShow()
    })
    /**
     * 初始加载翻译快捷键
     */
    ipcMain.handle('init-load-translate-shortcut-key-event', (_event, list) => {
      list.forEach((translateShortcutKey) => {
        const type = translateShortcutKey.type
        const shortcutKey = translateShortcutKey.shortcutKey
        if (isNull(type) || isNull(shortcutKey)) {
          return
        }
        GlobalShortcutEvent.translateRegister(
          translateShortcutKey.type,
          translateShortcutKey.shortcutKey
        )
      })
    })
    /**
     * 开机自启事件
     */
    ipcMain.handle('auto-launch-event', (_event, status) => {
      log.info('开机自启事件 : ', status)
      WinEvent.updateAutoLaunch(status, () => {
        return status
      })
    })
  }

  /**
   * 主窗口置顶
   *
   * @param status 置顶状态
   */
  static alwaysOnTop(status): void {
    GlobalWin.mainWin.setAlwaysOnTop(status)
    GlobalWin.isMainAlwaysOnTop = status
    // 触发窗口置顶时候也触发窗口显示回调
    // 用于处理 alwaysOnTopAllowEscStatus 逻辑
    GlobalWin.mainOrOcrWinShowCallback()
  }

  /**
   * OCR窗口置顶
   *
   * @param status 置顶状态
   */
  static ocrAlwaysOnTop(status): void {
    GlobalWin.ocrWin.setAlwaysOnTop(status)
    GlobalWin.isOcrAlwaysOnTop = status
    // 触发窗口置顶时候也触发窗口显示回调
    // 用于处理 alwaysOnTopAllowEscStatus 逻辑
    GlobalWin.mainOrOcrWinShowCallback()
  }

  /**
   * 翻译窗口注册Esc
   * 一般是窗口置顶时触发
   */
  static translateWinRegisterEsc(): void {
    setTimeout(() => {
      // 翻译窗口注册Esc快捷键 一般是窗口置顶时触发
      GlobalShortcutEvent.register('Esc', () => {
        GlobalWin.mainWinHide()
        GlobalWin.ocrWinHide()
      })
    }, 300)
  }

  /**
   * 修改开机自启状态
   *
   * @param status    设置自启状态
   * @param callback    设置自启状态
   */
  static updateAutoLaunch(status, callback): void {
    if (EnvEnum.isDev()) {
      log.info('开发环境不设置开机自启')
      return
    }
    log.info('开机自启事件 : ', status)
    const autoLaunchConfig = {
      name: app.getName()
    }
    // linux下需要指定path。参考https://github.com/Teamwork/node-auto-launch/issues/89
    if (SystemTypeEnum.isLinux()) {
      autoLaunchConfig['path'] = process.env.APPIMAGE
    }
    const autoLaunch = new AutoLaunch(autoLaunchConfig)
    autoLaunch.isEnabled().then(async (isEnabled) => {
      log.info('当前开机自启状态 isEnabled = ', isEnabled)
      status = callback(isEnabled)
      if (status) {
        if (isEnabled) {
          log.info('已开启开机自启状态，不重复配置')
          return
        }
        autoLaunch.enable().catch((error) => {
          log.error('开启开机自启错误：', error)
        })
      } else {
        if (!isEnabled) {
          log.log('已关闭开机自启状态，不重复配置')
          return
        }
        autoLaunch.disable().catch((error) => {
          log.error('关闭开机自启错误：', error)
        })
      }
    })
  }

  /**
   * 更新窗口大小
   *
   * @param win       窗口
   * @param width     宽度
   * @param height    高度
   */
  static updateWinSize(win, width, height): void {
    if (isNull(win)) {
      return
    }
    const bounds = win.getBounds()
    const workArea = screen.getDisplayMatching(bounds).workArea
    const maxHeight = WinEvent.getMaxWinHeight(workArea)
    height = Math.min(Math.max(MIN_WIN_HEIGHT, Math.ceil(height)), maxHeight)
    // win.setMaximumSize(width, height)
    win.setMinimumSize(450, height)
    win.setSize(width, height)
    // Electron 在Win系统环境中当设置了缩放比例后，部分电脑在设置大小时会与设置的原始大小不一致
    // 例如：设置 500 的宽度，但实际会设置变成 501
    // 所以此处在设置完毕后再检测一遍 如果错误则重新计算设置一次
    // 问题详见：https://github.com/electron/electron/issues/27651
    const newWidth = win.getSize()[0]
    if (newWidth != width) {
      if (newWidth > width) {
        win.setSize(width - (newWidth - width), height)
      }
    }
    WinEvent.keepWinInWorkArea(win, height, workArea)
    // 通知页面实际生效的窗口高度与当前显示器下的最大高度 页面以此为准同步滚动容器高度
    win.webContents.send('win-height-limit-update', { height: win.getSize()[1], maxHeight })
  }

  /**
   * 根据显示器工作区计算窗口最大高度
   */
  static getMaxWinHeight(workArea): number {
    return Math.min(MAX_WIN_HEIGHT, Math.max(240, workArea.height - 20))
  }

  /**
   * 窗口底边超出工作区时上移窗口 内容变少后再移回原位置
   * 用户手动移动过窗口时不再移回
   */
  static keepWinInWorkArea(win, height, workArea): void {
    const { x, y } = win.getBounds()
    const shift = WinEvent.winShiftMap.get(win.id)
    if (shift && shift.shiftedY !== y) {
      WinEvent.winShiftMap.delete(win.id)
    }
    const originY = WinEvent.winShiftMap.get(win.id)?.originY ?? y
    const maxBottom = workArea.y + workArea.height - 8
    const nextY = Math.floor(Math.max(workArea.y + 8, Math.min(originY, maxBottom - height)))
    if (nextY === originY) {
      WinEvent.winShiftMap.delete(win.id)
    } else {
      WinEvent.winShiftMap.set(win.id, { originY, shiftedY: nextY })
    }
    if (nextY !== y) {
      win.setPosition(x, nextY)
    }
  }

  /**
   * 窗口被重新定位显示时 清除之前记录的上移信息
   */
  static resetWinShift(win): void {
    WinEvent.winShiftMap.delete(win.id)
  }
}

export { WinEvent }
