# 代码签名

GitHub Actions 的发布流程（`.github/workflows/release.yml`）会自动打包并签名：
在仓库里配置好证书后，下一次发布就会自动签名；没有配置时照常打包未签名的版本，不会失败。

签名完成后流程会自动检查签名是否有效（Windows 还会检查时间戳，macOS 会检查公证票据），
检查不通过就不会发布。Release 说明里的「下载与运行」也会按是否签名自动调整。

所有证书和密钥都放在仓库的 **Settings → Secrets and variables → Actions** 里，
不要把证书文件提交到仓库。

| 平台 | 需要 | 费用 | 签名后的效果 |
|---|---|---|---|
| Windows | 代码签名证书（见下文三种方式） | 免费 ~ 每年数百美元 | 不再显示「未知发布者」，SmartScreen 拦截逐渐减少 |
| macOS | Apple Developer Program 会员 | 99 美元 / 年（国内 688 元 / 年） | 双击直接打开，不再提示「无法验证开发者」「已损坏」 |
| Linux | 不需要 | — | AppImage 没有通用的签名机制，下载文件可以用 Release 页面上的 SHA-256 核对 |

> 启动器自带的更新功能始终会校验安装包的 SHA-256，和是否签名无关。

---

## Windows

2023 年 6 月以后，新签发的代码签名证书私钥必须保存在 USB 硬件密钥或云端，
一般**不能再导出成 pfx 文件**放到 GitHub 里。在 GitHub Actions 里自动签名，实际可行的是下面几种方式：

### 方式一：SignPath Foundation（开源项目免费，推荐）

[SignPath Foundation](https://signpath.org/) 为开源项目免费提供代码签名，本项目使用 MIT 许可证，符合要求。

- 申请条件（以 SignPath 官网为准）：开源许可证、源码公开、免费下载、持续维护、安装包由自动化流程从仓库源码构建
- 主页和下载页需要写一段「Code signing policy（代码签名策略）」说明签名由 SignPath 提供
- 签名显示的发布者是「SignPath Foundation」，不是你的名字
- 申请地址：<https://signpath.org/apply.html>

SignPath 的签名流程和下面两种方式不同（把打包好的文件交给 SignPath 签名后再取回），
需要申请通过后拿到组织 ID、项目名称等信息再接入发布流程。

### 方式二：Azure Artifact Signing（原 Trusted Signing）

微软的云签名服务，约 9.99 美元 / 月。目前**个人开发者只支持美国和加拿大**，
公司 / 组织支持欧盟、英国、日本、韩国、新加坡等十几个国家和地区（不包括中国大陆）。
不支持免费或试用订阅。详见 [微软文档](https://learn.microsoft.com/azure/artifact-signing/quickstart)。

开通并创建好签名账号和证书配置文件后，在仓库里添加：

| 类型 | 名称 | 内容 |
|---|---|---|
| Secret | `AZURE_TENANT_ID` | Microsoft Entra 租户 ID |
| Secret | `AZURE_CLIENT_ID` | 用于签名的应用（服务主体）的客户端 ID |
| Secret | `AZURE_CLIENT_SECRET` | 该应用的客户端密码 |
| Variable | `AZURE_SIGN_ENDPOINT` | 签名账号所在区域的地址，例如 `https://eus.codesigning.azure.net/` |
| Variable | `AZURE_SIGN_ACCOUNT` | 签名账号名称 |
| Variable | `AZURE_SIGN_PROFILE` | 证书配置文件名称 |
| Variable | `AZURE_SIGN_PUBLISHER` | 证书的使用者名称（CN），需要和证书完全一致 |

这个应用需要在签名账号上拥有「证书配置文件签名者（Certificate Profile Signer）」角色。

### 方式三：pfx 证书文件

如果你有可以导出的 pfx 证书（例如 2023 年 6 月以前签发的证书），可以直接使用：

1. 在 Windows 的 PowerShell 里把证书转成文本并复制：

   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("证书.pfx")) | Set-Clipboard
   ```

2. 添加 Secret `WIN_CSC_LINK`，内容粘贴上一步复制的文本
3. 添加 Secret `WIN_CSC_KEY_PASSWORD`，内容为证书密码

### 关于 SmartScreen

签名后，安装包属性里会显示发布者，不再是「未知发布者」。
但新证书刚开始使用时还没有「信誉」，Windows SmartScreen 仍可能拦截，
下载和安装的人多了以后会逐渐消失。Release 说明里已经写了遇到拦截时的处理方法。

---

## macOS

需要加入 [Apple Developer Program](https://developer.apple.com/programs/)（个人可以加入），然后配置两部分：

### 1. 签名证书（Developer ID Application）

1. 在 Mac 上打开 Xcode →「设置」→「Accounts」→ 选中你的 Apple ID →「Manage Certificates」→
   左下角「+」→「Developer ID Application」
   （也可以在 [开发者网站](https://developer.apple.com/account/resources/certificates/list) 上用「钥匙串访问」生成的 CSR 创建）
2. 打开「钥匙串访问」→「我的证书」，右键「Developer ID Application: 你的名字」→「导出」，
   保存为 `.p12` 文件并设置一个密码
3. 在「终端」里把证书转成文本并复制：

   ```bash
   base64 -i 证书.p12 | pbcopy
   ```

4. 添加 Secret `MAC_CSC_LINK`，内容粘贴上一步复制的文本
5. 添加 Secret `MAC_CSC_KEY_PASSWORD`，内容为导出时设置的密码

只配置证书、不配置公证时，用户打开时仍会被 macOS 拦截，所以请把下面的公证也配置上。

### 2. 公证（Notarization）

1. 打开 [App Store Connect](https://appstoreconnect.apple.com/) →「用户和访问」→「集成」→「App Store Connect API」→「团队密钥」
2. 点「+」生成一个密钥，访问权限选「开发者（Developer）」
3. 下载 `AuthKey_XXXXXXXXXX.p8` 文件（**只能下载一次**，请妥善保存）
4. 添加三个 Secret：

| 名称 | 内容 |
|---|---|
| `APPLE_API_KEY` | 用文本编辑器打开 `.p8` 文件，复制全部内容（包括 `-----BEGIN PRIVATE KEY-----` 那几行） |
| `APPLE_API_KEY_ID` | 密钥 ID（页面上「密钥 ID」一列，也是文件名里的 XXXXXXXXXX） |
| `APPLE_API_ISSUER` | 页面上方的「Issuer ID」 |

配置完成后，发布流程会用 Developer ID 证书签名（开启强化运行时），把 App 和 dmg 都提交给 Apple 公证并附上公证票据。
公证一般需要几分钟，偶尔会更久。

---

## 检查是否生效

配置好以后发布一个新版本，在 Actions 的运行记录里：

- Windows 的「Check code signing」步骤显示「已配置 Windows 代码签名」，「Verify signatures」步骤列出每个 exe 的签名信息
- macOS 的「Check code signing」步骤显示「已配置 Apple 签名与公证」，「Verify signatures」步骤通过

也可以下载安装包检查：Windows 右键 exe →「属性」→「数字签名」；
macOS 在「终端」运行 `spctl -a -vv /Applications/琉璃启动器.app`，应显示 `source=Notarized Developer ID`。
