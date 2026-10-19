# 官网更新签名

启动器可以从官网（`downloads/latest.json`）检查和下载新版本。为了防止官网服务器被入侵后安装包被替换，
每次发布时 GitHub Actions 会用 **Ed25519 私钥**给 5 个安装包的清单（文件名、大小、SHA-256）签名，
启动器内置对应的**公钥**，验证通过才会使用官网提供的版本号和 SHA-256。

- 私钥只保存在 GitHub 仓库的 Secret 里，官网服务器上没有，所以即使服务器被入侵也伪造不了签名
- 签名验证失败时，「自动」更新来源会改用 GitHub；「只用官网」时会提示签名无效
- 没有配置密钥时，一切和以前一样（只校验官网提供的 SHA-256）

## 第一次配置

### 1. 生成密钥

在自己电脑上（需要 Node.js），进入仓库文件夹运行：

```bash
node scripts/update-signing.mjs keygen
```

会输出两行很长的文字：**私钥**和**公钥**。

> 私钥只能填到下面的 Secret 里，不要发给任何人、不要提交到代码里、不要贴到聊天里。
> 建议另外在密码管理器里保存一份：私钥丢了只能换一对新密钥，已经安装的旧版本启动器就无法再从官网更新（仍可以从 GitHub 更新）。

### 2. 填到 GitHub 仓库

仓库 → Settings → Secrets and variables → Actions：

| 位置 | 名称 | 内容 |
|---|---|---|
| Secrets → New repository secret | `UPDATE_SIGNING_KEY` | 私钥 |
| Variables → New repository variable | `UPDATE_PUBLIC_KEY` | 公钥 |

两项必须同时配置，并且是同一对：只配了一项或不是一对时，发布流程会报错停止，避免发布出无法从官网更新的版本。

### 3. 更新服务器上的脚本

把仓库里最新的 `deploy/update_site.py` 重新上传到服务器，替换旧文件（见 [deploy/README.md](../deploy/README.md) 第 3 步）。
新脚本会把发布附带的签名文件写进 `latest.json`。

### 4. 发布新版本

之后每次发布：

- Release 里会多一个 `LiuliLauncher-<版本>-signature.json`（只有版本号和 5 个安装包的 SHA-256，不含任何密钥）
- 服务器脚本把它写进官网的 `latest.json`
- 从这个版本开始打包的启动器会验证签名；之前安装的旧版本启动器不验证，更新到新版本后开始验证

## 检查签名

```bash
node scripts/update-signing.mjs verify LiuliLauncher-0.3.3-signature.json <公钥>
```
