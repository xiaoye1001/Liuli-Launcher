# 参与贡献

感谢你愿意帮助改进琉璃启动器！提交问题和代码前，请先看完下面的说明。

## 报告问题

- 先在 [Issues](https://github.com/xiaoye1001/Liuli-Launcher/issues) 中搜索，避免重复
- 使用「问题反馈」模板，写清启动器版本、系统、游戏版本与模组加载器、复现步骤
- 游戏日志请用启动器里的「分享日志」上传（会自动去掉登录凭证和用户目录）。**不要**直接粘贴含有 `accessToken` 等登录信息的内容
- 安全漏洞不要公开提交，见 [SECURITY.md](SECURITY.md)

## 开发环境

需要 Node.js 22 和 npm。

```bash
npm install
npm run dev        # 开发模式运行
```

微软登录需要自己的 Azure 应用 Client ID，配置方法见 README 的「微软正版登录」。没有配置时只能使用离线账号，其他功能不受影响。

## 提交代码

1. Fork 仓库，从 `main` 新建分支
2. 修改后运行检查，全部通过再提交：
   ```bash
   npm run typecheck
   npm run format:check   # 不通过时运行 npm run format 自动格式化
   npm run build
   ```
3. 提交 Pull Request，按模板说明改了什么、怎么测试的；界面改动请附截图

### 代码约定

- TypeScript 严格模式；格式由 Prettier 统一（不加分号、单引号、每行最多 120 字符）
- 界面文字和代码注释使用简体中文
- 主进程（`src/main`）负责文件、网络与游戏进程，界面（`src/renderer`）只通过 `window.api` 调用，新增接口需要同时修改 `src/preload/index.ts` 与 `index.d.ts`
- 共用的类型放在 `src/shared/types.ts`

### 安全要求

- 不要提交任何密钥、Client ID 或 `.env` 文件；不要使用其他启动器的 Azure Client ID
- 登录凭证只能用系统安全存储（`safeStorage`）加密保存，不能写入日志
- 从网络下载的文件要校验（SHA1 / SHA-256 / 文件大小），文件名要检查，防止写到目标目录之外
- 外部链接只允许 https

## 许可

提交的代码将以 [MIT 许可证](LICENSE) 发布。
