# 琉璃启动器免安装版的外壳程序（替换 electron-builder 自带的 portable.nsi，见 scripts/portable-template.cjs）
#
# electron-builder 自带的免安装版每次打开都把整个程序（几百 MB）解压到系统临时文件夹 %TEMP%，
# 看起来就像在系统里又装了一份，退出时才删除；被强制结束、断电时还会一直留在那里。
# 这里改为解压到 exe 旁边的 LiuliLauncher-Data\launcher\<版本号> 文件夹（与数据放在一起，整个文件夹可以带走）：
# - 同一个版本只在第一次打开时解压，之后直接运行，打开更快
# - 不往系统临时文件夹、AppData 里写任何东西
# - 旧版本的文件夹由新版本启动后删除（src/main/portableCleanup.ts）
# 只有 exe 所在的文件夹不能写入时（例如放在 Program Files 里），才按原来的方式解压到临时文件夹并在退出后删除。

!include "common.nsh"
!include "extractAppPackage.nsh"

# https://github.com/electron-userland/electron-builder/issues/3972#issuecomment-505171582
CRCCheck off
WindowIcon Off
AutoCloseWindow True
RequestExecutionLevel ${REQUEST_EXECUTION_LEVEL}

# 与 src/main/paths.ts 的 PORTABLE_DATA_DIR 一致
!define PORTABLE_DATA_DIR "LiuliLauncher-Data"
# 解压完成的标记文件：写在最后，有它说明这次构建的文件已经完整解压过
!define EXTRACTED_MARKER ".liuli-extracted-${UNPACK_DIR_NAME}"

Var useTemp

Function .onInit
  !ifndef SPLASH_IMAGE
    SetSilent silent
  !endif

  !insertmacro check64BitAndSetRegView
FunctionEnd

Function .onGUIInit
  InitPluginsDir

  !ifdef SPLASH_IMAGE
    File /oname=$PLUGINSDIR\splash.bmp "${SPLASH_IMAGE}"
    BgImage::SetBg $PLUGINSDIR\splash.bmp
    BgImage::Redraw
  !endif
FunctionEnd

# 把程序文件解压到 $INSTDIR（与 electron-builder 自带的写法相同）
!macro extractAppFiles
  !ifdef APP_DIR_64
    !ifdef APP_DIR_ARM64
      !ifdef APP_DIR_32
        ${if} ${IsNativeARM64}
          File /r "${APP_DIR_ARM64}\*.*"
        ${elseif} ${RunningX64}
          File /r "${APP_DIR_64}\*.*"
        ${else}
          File /r "${APP_DIR_32}\*.*"
        ${endIf}
      !else
        ${if} ${IsNativeARM64}
          File /r "${APP_DIR_ARM64}\*.*"
        ${else}
          File /r "${APP_DIR_64}\*.*"
        ${endIf}
      !endif
    !else
      !ifdef APP_DIR_32
        ${if} ${RunningX64}
          File /r "${APP_DIR_64}\*.*"
        ${else}
          File /r "${APP_DIR_32}\*.*"
        ${endIf}
      !else
        File /r "${APP_DIR_64}\*.*"
      !endif
    !endif
  !else
    !ifdef APP_DIR_32
      File /r "${APP_DIR_32}\*.*"
    !else
      !insertmacro extractEmbeddedAppPackage
    !endif
  !endif
!macroend

# 已经完整解压过：标记文件、程序、app.asar 都在（被杀毒软件删掉了文件时重新解压）
!macro checkExtracted RESULT
  StrCpy ${RESULT} "0"
  ${if} ${FileExists} "$INSTDIR\${EXTRACTED_MARKER}"
  ${andIf} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  ${andIf} ${FileExists} "$INSTDIR\resources\app.asar"
    StrCpy ${RESULT} "1"
  ${endIf}
!macroend

Section
  !ifdef SPLASH_IMAGE
    HideWindow
  !endif

  StrCpy $useTemp "0"
  StrCpy $INSTDIR "$EXEDIR\${PORTABLE_DATA_DIR}\launcher\${VERSION}"

  # exe 所在的文件夹能不能写入：建文件夹并试着写一个文件
  ClearErrors
  CreateDirectory "$INSTDIR"
  IfErrors useTempDir
  ClearErrors
  FileOpen $0 "$INSTDIR\.write-test" w
  IfErrors useTempDir
  FileClose $0
  Delete "$INSTDIR\.write-test"

  # 这次构建的文件已经完整解压过：直接运行（启动器已经开着时，新打开的会把已有窗口调到前面）
  !insertmacro checkExtracted $1
  StrCmp $1 "1" run

  # 没有解压过、上次解压到一半或文件缺失：清空后重新解压，确认文件完整后才写标记文件
  RMDir /r "$INSTDIR"
  Goto extract

  useTempDir:
  # 不能写入时按原来的方式：解压到临时文件夹，退出后删除
  StrCpy $useTemp "1"
  StrCpy $INSTDIR "$TEMP\${UNPACK_DIR_NAME}"
  RMDir /r "$INSTDIR"

  extract:
  # 解压程序只能出现一次（里面声明了变量和固定的标签）
  SetOutPath "$INSTDIR"
  !insertmacro extractAppFiles
  # 解压用的临时文件（完整的程序副本和压缩包）在临时文件夹里，用完立即删除
  SetOutPath "$INSTDIR"
  RMDir /r "$PLUGINSDIR\7z-out"
  Delete "$PLUGINSDIR\app-*.7z"
  Delete "$PLUGINSDIR\app-*.zip"
  ${if} $useTemp == "0"
    ${if} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    ${andIf} ${FileExists} "$INSTDIR\resources\app.asar"
      ClearErrors
      FileOpen $0 "$INSTDIR\${EXTRACTED_MARKER}" w
      ${ifNot} ${Errors}
        FileWrite $0 "${VERSION}"
        FileClose $0
      ${endIf}
    ${endIf}
  ${endIf}

  run:
  System::Call 'Kernel32::SetEnvironmentVariable(t, t)i ("PORTABLE_EXECUTABLE_DIR", "$EXEDIR").r0'
  System::Call 'Kernel32::SetEnvironmentVariable(t, t)i ("PORTABLE_EXECUTABLE_FILE", "$EXEPATH").r0'
  System::Call 'Kernel32::SetEnvironmentVariable(t, t)i ("PORTABLE_EXECUTABLE_APP_FILENAME", "${APP_FILENAME}").r0'
  ${StdUtils.GetAllParameters} $R0 0

  !ifdef SPLASH_IMAGE
    BgImage::Destroy
  !endif

  # 路径里可能有空格（例如 D:\My Games），必须加引号
  ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" $R0' $0
  SetErrorLevel $0

  SetOutPath $EXEDIR
  ${if} $useTemp == "1"
    RMDir /r "$INSTDIR"
  ${endIf}
SectionEnd
