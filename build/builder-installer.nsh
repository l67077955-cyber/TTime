!define APP_NAME "TTime"
!define MUI_FINISHPAGE_LINK "官方网站 : https://ttime.timerecord.cn"
!define MUI_FINISHPAGE_LINK_LOCATION "https://ttime.timerecord.cn"

; 开机自启配置必须在 BUILD_UNINSTALLER 这里面加载 否则打包时会报错
!ifndef BUILD_UNINSTALLER
  ; 添加开机自启配置
  Function AutoStartup
      WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${APP_NAME}" "$INSTDIR\${APP_NAME}.exe"
  FunctionEnd

  !define MUI_FINISHPAGE_SHOWREADME
  !define MUI_FINISHPAGE_SHOWREADME_TEXT "开机自启"
  !define MUI_FINISHPAGE_SHOWREADME_FUNCTION AutoStartup
!endif

; 安装时触发
!macro customInstall
  ; VC++ 运行库 DLL 已内置在应用目录中（见 build/afterPack.js）
  ; 不再检测或安装系统 VC++ 运行库，不会修改用户电脑上已有的运行库版本

; 安装时删除开机自启配置 防止如果用户前一个版本是开机自启的
; 但是覆盖安装新版本时选择不开机自启 最后开启自启逻辑还在 导致安装时即使设置的关闭开机自启 但应用启动时还是开启自启状态的
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${APP_NAME}"
!macroend

; 卸载时删除开机自启配置
!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${APP_NAME}"
!macroend

; 选择的安装路径尾部自动追加应用名称
Function .onVerifyInstDir
  StrLen $0 "\${APP_NAME}"
  StrCpy $1 "$INSTDIR" "" -$0
  StrCmp $1 "\${APP_NAME}" +2 0
  StrCpy $INSTDIR "$INSTDIR\${APP_NAME}"
FunctionEnd
