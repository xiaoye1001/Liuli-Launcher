/// <reference types="electron-vite/node" />

interface ImportMetaEnv {
  /** 微软登录使用的 Azure 应用 Client ID，构建时注入（见 .env.example） */
  readonly MAIN_VITE_MS_CLIENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** 启动器版本号（构建时写入） */
declare const __APP_VERSION__: string
