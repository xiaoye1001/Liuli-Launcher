/// <reference types="electron-vite/node" />

interface ImportMetaEnv {
  /** 微软登录使用的 Azure 应用 Client ID，构建时注入（见 .env.example） */
  readonly MAIN_VITE_MS_CLIENT_ID?: string
  /** 官网地址（https），启动器可以从官网检查和下载更新 */
  readonly MAIN_VITE_OFFICIAL_SITE?: string
  /** 验证官网版本信息签名的 Ed25519 公钥（base64 编码的 SPKI DER），见 scripts/update-signing.mjs */
  readonly MAIN_VITE_UPDATE_PUBLIC_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** 启动器版本号（构建时写入） */
declare const __APP_VERSION__: string
