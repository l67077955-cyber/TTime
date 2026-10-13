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
  ; 检测 VC++ 运行库(VC_redist.x64) 是否已安装
  ; VC_redist.x64.exe 下载来源：https://aka.ms/vs/17/release/VC_redist.x64.exe
  ; 目前内置 VC_redist.x64.exe 的版本号为 14.34
  ; 读取微软官方的运行库注册表标记 Installed / Minor，任意 >= 14.34 的版本都视为已安装
  ; 不再按具体版本号逐个判断（旧逻辑只认 14.34 ~ 14.37，新版本会被误判为未安装）
  SetRegView 64
  ReadRegDWORD $1 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Installed"
  ReadRegDWORD $2 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Minor"
  SetRegView lastused
  StrCpy $0 ""
  ${If} $1 == 1
  ${AndIf} $2 >= 34
      StrCpy $0 "installed"
  ${EndIf}
  ${If} $0 == ""
      ; 不存在则提示安装
      MessageBox MB_OK "检测到电脑缺少 VC++ 运行库(DLL 依赖)，点击确认后将会弹出安装界面"
      File /oname=$PLUGINSDIR\VC_redist.x64.exe "${BUILD_RESOURCES_DIR}\VC_redist.x64.exe"
      ExecWait '"$PLUGINSDIR\VC_redist.x64.exe"'
  ${EndIf}

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
