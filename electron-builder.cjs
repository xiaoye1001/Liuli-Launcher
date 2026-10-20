// 打包配置（electron-builder）
//
// 代码签名由环境变量控制（GitHub Actions 里来自仓库的 Secrets / Variables，见 docs/code-signing.md）：
// - macOS：MAC_SIGN=true 时用 CSC_LINK 里的 Developer ID 证书签名；同时设置了 APPLE_API_KEY、
//   APPLE_API_KEY_ID、APPLE_API_ISSUER 时自动提交 Apple 公证。否则使用临时签名（ad-hoc）。
// - Windows：设置了 AZURE_SIGN_ENDPOINT 等变量时用 Azure Artifact Signing 签名；
//   设置了 WIN_CSC_LINK（pfx 证书）时 electron-builder 会自动用它签名。都没有时不签名。

// 免安装版：程序文件解压到 exe 旁边的数据文件夹，而不是每次解压到系统临时文件夹（见 build/portable.nsi）
require('./scripts/portable-template.cjs').installPortableTemplate()

const env = process.env
const macSigned = env.MAC_SIGN === 'true'
const azureSign =
  env.AZURE_SIGN_ENDPOINT && env.AZURE_SIGN_ACCOUNT && env.AZURE_SIGN_PROFILE && env.AZURE_SIGN_PUBLISHER
    ? {
        publisherName: env.AZURE_SIGN_PUBLISHER,
        endpoint: env.AZURE_SIGN_ENDPOINT,
        codeSigningAccountName: env.AZURE_SIGN_ACCOUNT,
        certificateProfileName: env.AZURE_SIGN_PROFILE
      }
    : undefined

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'io.github.xiaoye1001.liuli-launcher',
  productName: '琉璃启动器',
  copyright: 'Copyright © 2026 xiaoye1001',
  directories: {
    buildResources: 'build',
    output: 'dist'
  },
  // 只打包构建产物与运行时依赖，源码、配置与文档不放进安装包
  files: [
    '!**/.vscode/*',
    '!src/*',
    '!docs/*',
    '!dist/*',
    '!website/**',
    '!deploy/**',
    '!scripts/**',
    '!electron.vite.config.{js,ts,mjs,cjs}',
    '!electron-builder.cjs',
    '!{.prettierignore,.prettierrc.json,.editorconfig,.gitattributes,dev-app-update.yml}',
    '!{README.md,README.en.md,PRIVACY.md,CONTRIBUTING.md,SECURITY.md,CODE_OF_CONDUCT.md}',
    '!{.env,.env.*,.npmrc,pnpm-lock.yaml}',
    '!{tsconfig.json,tsconfig.node.json,tsconfig.web.json,*.tsbuildinfo}',
    '!{tailwind.config.js,postcss.config.js}'
  ],
  asarUnpack: ['resources/**'],
  win: {
    // 可执行文件用英文名，避免部分环境下中文路径出问题
    executableName: 'LiuliLauncher',
    target: [
      { target: 'nsis', arch: ['x64'] },
      { target: 'portable', arch: ['x64'] }
    ],
    ...(azureSign ? { azureSignOptions: azureSign } : {})
  },
  // 免安装版：单个 exe，双击直接运行，数据保存在 exe 旁边的 LiuliLauncher-Data 文件夹
  portable: {
    artifactName: 'LiuliLauncher-Portable-${version}.${ext}'
  },
  nsis: {
    artifactName: 'LiuliLauncher-Setup-${version}.${ext}',
    // 安装向导：可以选择安装位置，而不是一键静默安装
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: 'always',
    createStartMenuShortcut: true,
    shortcutName: '琉璃启动器',
    uninstallDisplayName: '琉璃启动器',
    installerLanguages: ['zh_CN'],
    language: '2052',
    // 卸载时保留用户数据（设置、账号、游戏目录）
    deleteAppDataOnUninstall: false
  },
  mac: {
    target: ['dmg'],
    artifactName: 'LiuliLauncher-${version}-${arch}.${ext}',
    category: 'public.app-category.games',
    ...(macSigned
      ? {
          // Developer ID 签名 + 强化运行时（公证必须开启），证书从 CSC_LINK 自动找到
          hardenedRuntime: true,
          entitlements: 'build/entitlements.mac.plist',
          entitlementsInherit: 'build/entitlements.mac.plist',
          gatekeeperAssess: false
        }
      : {
          // 没有 Apple 开发者证书：使用临时签名（ad-hoc），否则 Apple 芯片的 Mac 无法运行
          identity: '-',
          hardenedRuntime: false,
          gatekeeperAssess: false,
          notarize: false
        })
  },
  dmg: {
    title: '琉璃启动器 ${version}'
  },
  linux: {
    target: ['AppImage'],
    executableName: 'liuli-launcher',
    artifactName: 'LiuliLauncher-${version}.${ext}',
    category: 'Game'
  },
  npmRebuild: false
}
