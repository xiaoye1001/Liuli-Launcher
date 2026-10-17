<div align="center">

# 琉璃启动器 · Liuli Launcher

一个界面清爽、开箱即用的 **Minecraft: Java Edition** 启动器

玻璃质感界面 · 深浅色主题 · 国内镜像高速下载 · 模组加载器一键安装 · 微软正版登录

**简体中文** | [English](README.en.md)

</div>

![主页](docs/screenshots/home.png)

## 功能

### 游戏下载与安装
- 版本列表分为正式版、快照版和远古版，支持搜索
- 两个下载源可选：**BMCLAPI 镜像**（国内推荐）或 **Mojang 官方源**，镜像失败时自动回退到官方
- 多线程下载，实时显示进度和速度；安装过程中可以取消，失败后可以重试
- **下载与网络设置**：可以调整同时下载数；支持系统代理或手动设置 HTTP 代理（下载、版本列表、Modrinth、登录和界面图片都走代理），可以一键测试各服务器能否连接
- 安装前可以自定义版本名，并选择要附加的模组加载器：
  - **Forge**、**NeoForge**、**Fabric**、**Quilt**（四选一）
  - **OptiFine**（可以单独安装，也可以和 Forge 一起安装）
- 导入本地整合包（点按钮选择，或直接拖进窗口）：支持 Modrinth（`.mrpack`）、CurseForge、MultiMC / Prism、MCBBS（`.zip`）格式，自动安装对应的 Minecraft 与模组加载器（Forge / NeoForge / Fabric / Quilt）、下载全部模组并放好配置文件
- **导出整合包**：把版本导出为 Modrinth（`.mrpack`）、CurseForge、MultiMC / Prism、MCBBS 格式，自由勾选要带上的模组、配置、资源包、存档等；Modrinth 格式可以把 Modrinth 上能找到的文件改为下载地址，整合包更小
- 已安装版本可以「检查并修复」，只重新下载缺失或损坏的文件
- 删除版本前会检查是否有其他版本依赖它；版本文件夹里有存档时会特别提醒

### 社区资源
「下载」页左侧分为 **原版游戏** 和 **社区资源**（Mod、整合包、数据包、资源包、光影包），来源可以选 **全部**（同时搜索 Modrinth 和 CurseForge，合并显示并标出来源，两边都有的项目只显示 Modrinth 的）、**Modrinth** 或 **CurseForge**：
- CurseForge 通过 MCIM 镜像访问，不需要 API Key；下载源选 BMCLAPI 时文件也优先从镜像下载
- 每类资源都可以搜索，并按 Minecraft 版本、加载器、分类（仅 Modrinth）筛选，按下载量、更新时间等排序
- 展开项目可以看到全部版本，符合筛选条件的排在前面，可以自己挑要下载的版本
- 选好「安装到」哪个游戏版本后，筛选条件会自动跟随该版本的 Minecraft 版本和加载器
- 模组放进 `mods`（自动安装前置模组），资源包放进 `resourcepacks`，光影包放进 `shaderpacks`，数据包放进所选存档的 `datapacks`；整合包下载后进入安装页

### 启动
- **自动选择 Java**：按每个游戏版本的要求挑选合适的 Java，本机没有时自动下载（与官方启动器相同的 Java 运行环境）；也可以在设置中一键下载 Java 8 / 17 / 21 / 25，或手动指定
- **自动分配内存**（默认开启）：启动时根据电脑的可用内存和模组数量决定（原版 2 GB，模组版本 3 GB 起、模组越多分配越多），也可以改为手动设置
- **启动前检查游戏文件**：发现缺失或损坏的游戏本体、依赖库、资源文件时自动下载补全再启动，只下载有问题的文件（可在设置中关闭）
- 实时游戏日志窗口，支持搜索过滤和一键复制
- **游玩统计**：记录每个版本的累计游玩时长与启动次数；主页显示「最近游玩」，点一下直接启动；游戏运行时显示本次已玩时长
- **崩溃分析**：游戏崩溃后自动读取日志、崩溃报告和 Java 崩溃日志，用中文说明原因和解决办法：缺少前置模组、模组版本不匹配或冲突、重复模组、Mixin 注入失败、Java 版本过高或过低、内存不足、JVM 参数无效、显卡驱动、OptiFine 不兼容、文件损坏等；可以一键打开崩溃报告，或把相关文件导出为 zip 发给别人求助
- **多个游戏目录**：在「设置」中添加多个 `.minecraft` 文件夹（例如官方启动器的目录、各个整合包的文件夹），可以重命名、从列表移除（不删除文件）；在「版本」页顶部随时切换，每个目录记住各自选中的版本
- **版本隔离**：模组版本（或全部版本）各自使用独立的 `mods`、存档和配置，互不干扰
- **版本管理**：「版本」页集中管理已安装的版本：设为启动版本、模组、存档、资源、版本设置、打开文件夹、检查修复、删除；还可以重命名、复制版本（可选是否带上存档），或在桌面创建快捷方式，双击直接启动这个版本
- **存档管理**：显示存档名称、图标、游戏模式（极限 / 作弊）、游戏版本和最后游玩时间；一键备份为 zip，随时从备份还原（覆盖原存档前会自动备份当前存档，也可以还原为新存档；已删除的存档也能从备份找回）、从 zip 导入存档、删除到回收站；管理存档里的数据包（显示启用状态，可以添加、下载、删除）
- **截图管理**：按版本查看游戏截图（缩略图网格），点开大图预览、键盘左右切换，可以复制到剪贴板直接粘贴到聊天软件、在文件夹中显示或删除
- **资源包与光影管理**：查看每个版本的资源包（显示图标和简介）和光影包；在启动器里直接启用资源包、切换或关闭光影（支持 Iris、Oculus、OptiFine），也可以添加文件、删除到回收站；可以检查 Modrinth 上的资源包和光影包有没有新版本并一键更新，启用中的资源包和正在使用的光影更新后保持启用
- **版本设置**（「版本」页或主页版本旁的齿轮按钮）：每个版本可以单独设置内存、Java、版本隔离、游戏窗口大小（或全屏）以及附加的 JVM / 游戏参数；还可以设置包装命令（如 gamemoderun、prime-run）、环境变量、启动前执行的命令（失败时取消启动）和游戏退出后执行的命令，命令中可以使用 `INST_NAME`、`INST_DIR` 等变量。没有单独设置的项跟随全局设置。设置保存在该版本文件夹的 `liuli-version.json` 中

### 服务器
- 侧栏「服务器」页收藏常玩的服务器，显示服务器图标、彩色简介（MOTD）、在线人数、延迟和服务端版本，支持 SRV 记录（不写端口的域名）
- 点「加入」启动游戏并直接进入服务器（1.20 及以上使用 Quick Play，更早的版本使用 `--server` 参数），每个服务器可以指定使用的游戏版本
- 可以从游戏「多人游戏」列表（`servers.dat`）一键导入

### 模组管理
- 读取每个模组的名称、版本、简介和图标，支持 Fabric / Quilt / Forge / NeoForge
- 启用或禁用模组（与其他启动器通用的 `.disabled` 方式）；删除的模组会移到回收站
- 标出与当前版本加载器不兼容的模组
- **检查模组更新**：识别 Modrinth 上发布的模组，找出适用于当前游戏版本和加载器的新版本，可以逐个或一键全部更新；正式版不会被升级成测试版，禁用的模组更新后仍然禁用，旧版本移到回收站
- 在启动器里直接 **从 Modrinth 搜索并安装模组**：只显示适用于当前版本的模组，并自动安装必需的前置模组

### 账号
- **离线账号**：可以保存多个离线账号，每个账号有自己的玩家名和皮肤，一键切换；皮肤用 3D 模型预览，提供多种动作
- **微软正版登录**：在微软官网输入代码完成登录，启动器不接触你的密码；支持多个账号切换，启动时自动续期登录状态
- **正版皮肤与披风**：在账号页直接上传新皮肤（可选经典或纤细体型）、恢复默认皮肤、选择显示哪件披风，3D 预览同步显示披风
- **外置登录**：支持 LittleSkin 等 authlib-injector 皮肤站账号（填皮肤站首页地址即可），启动时自动下载 authlib-injector；只保存加密的登录令牌，不保存密码

### 界面
- **Minecraft 新闻**：主页显示 Minecraft 官方发布的 Java 版新闻与更新公告，点击在浏览器中阅读全文；没有网络时显示上次获取的新闻，可以在主页或设置中关闭
- 玻璃质感设计，页面切换动画
- 深色 / 浅色 / 跟随系统 三种主题
- **检查更新**：启动时自动检查 GitHub 上的新版本，在窗口右下角提示，可以查看更新内容；点「下载并更新」在启动器里下载新版本（校验 SHA-256），再点「重启并更新」自动替换并重新打开（免安装版、安装版、AppImage、macOS 都支持），不用自己替换文件；也可以在「设置 → 关于」中手动检查或关闭自动检查

| 安装设置 | 模组管理 |
|---|---|
| ![安装设置](docs/screenshots/install.png) | ![模组管理](docs/screenshots/mods.png) |

![账号](docs/screenshots/account.png)

## 快速开始

### 环境要求
- [Node.js](https://nodejs.org/) 20 或更高版本
- 运行游戏需要安装 Java：1.20.5 及以上需要 Java 21，1.18 ~ 1.20.4 需要 Java 17，1.17 需要 Java 16，更早的版本需要 Java 8

### 运行
```bash
git clone https://github.com/xiaoye1001/Liuli-Launcher.git
cd Liuli-Launcher
npm install
npm run dev
```

项目自带 `.npmrc`，Electron 会从国内镜像下载，安装速度更快。

### 其他命令
| 命令 | 作用 |
|---|---|
| `npm run dev` | 开发模式运行（修改代码后自动刷新） |
| `npm run build` | 构建到 `out/` 目录 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run build:win` | 同时打包 Windows 安装版与免安装版 |
| `npm run build:win:setup` | 只打包安装版 |
| `npm run build:win:portable` | 只打包免安装版 |
| `npm run build:unpack` | 打包成免安装文件夹（不生成安装程序，用于快速测试） |

### 打包 Windows 版本
在 Windows 上运行：
```bash
npm run build:win
```
完成后在 `dist/` 目录得到两个文件：

| 文件 | 说明 |
|---|---|
| `LiuliLauncher-Setup-<版本号>.exe` | **安装版**：可以选择安装位置，会创建桌面和开始菜单快捷方式；卸载时不会删除你的设置、账号和游戏文件 |
| `LiuliLauncher-Portable-<版本号>.exe` | **免安装版**：单个 exe，双击直接运行；数据保存在 exe 旁边的 `LiuliLauncher-Data` 文件夹，连同 exe 一起复制到 U 盘就能带走 |

免安装版每次启动需要先解压，会比安装版慢几秒。exe 所在位置不可写时（例如放在 `C:\Program Files` 里），数据会改存到与安装版相同的位置。

> 安装包没有代码签名证书，第一次运行时 Windows 可能提示「Windows 已保护你的电脑」，点「更多信息」→「仍要运行」即可。

`build:mac` / `build:linux` 分别用于打包 macOS（dmg）和 Linux（AppImage），需要在对应系统上运行。

发布新版本时，在仓库的 Actions → Release → Run workflow 中填写版本号（例如 `0.2.0`），会自动打包 Windows、macOS（Apple 芯片与 Intel）、Linux 三个平台并发布到 Releases。macOS 版本没有 Apple 开发者签名，第一次打开需要右键 →「打开」；提示「已损坏」时在终端运行 `xattr -cr /Applications/琉璃启动器.app`。

## 微软正版登录

Minecraft 的登录接口只允许 **经过 Mojang 审核的 Azure 应用** 使用。Client ID 在**构建时**写入程序，界面中不会显示，也不保存在源码里（避免被他人直接复用）。自己构建时需要先申请一个 Client ID：

1. 登录 [Azure 门户](https://portal.azure.com)，搜索「**应用注册**」→「**新注册**」：
   - 名称：例如 `Liuli Launcher`
   - 受支持的帐户类型：**仅个人 Microsoft 帐户**
   - 重定向 URI：留空
2. 在应用的「**身份验证**」中，把「**允许公共客户端流**」设为「是」并保存（不需要创建客户端密码）
3. 在 [Mojang 审核表单](https://aka.ms/mce-reviewappid) 提交申请，选择 *New AppID for Approval*，并填写「概述」页中的应用程序(客户端) ID 和目录(租户) ID
4. 把项目根目录的 `.env.example` 复制为 `.env`，填入 Client ID：
   ```
   MAIN_VITE_MS_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   ```
   `.env` 已加入 `.gitignore`，不会被提交。之后 `npm run dev` 与打包出的程序都会开启微软登录
5. 用 GitHub Actions 发布时，在仓库的 Settings → Secrets and variables → Actions 中添加名为 `MS_CLIENT_ID` 的 Secret

没有配置 Client ID 时，「添加微软账号」按钮不可用，只能使用离线账号。审核通过前，登录会在最后一步提示「未通过 Mojang 审核」，这是正常的。

## 数据存放位置

免安装版的数据在 exe 旁边的 `LiuliLauncher-Data` 文件夹；安装版与开发模式如下：

| 系统 | 路径 |
|---|---|
| Windows | `%APPDATA%\mc_launcher` |
| macOS | `~/Library/Application Support/mc_launcher` |
| Linux | `~/.config/mc_launcher` |

- `settings.json`：启动器设置
- `accounts.json`：微软账号（登录凭证用系统安全存储加密）
- `.minecraft/`：默认游戏目录（可以在「设置」中添加官方启动器的目录或任意文件夹并切换）
- `cache/`：OptiFine 安装器等缓存

## 技术栈

- [Electron](https://www.electronjs.org/) + [electron-vite](https://electron-vite.org/)
- [React 18](https://react.dev/) + TypeScript + [Tailwind CSS](https://tailwindcss.com/) + [Framer Motion](https://www.framer.com/motion/) + [Lucide](https://lucide.dev/)
- [@xmcl](https://github.com/Voxelum/minecraft-launcher-core-node) 系列库：游戏安装、启动、模组解析、微软登录
- [skinview3d](https://github.com/bs-community/skinview3d)：3D 皮肤预览

```
src/
├── main/        # 主进程：下载安装、启动游戏、账号、模组管理等
├── preload/     # 预加载脚本：向界面暴露 window.api
├── renderer/    # 界面（React）
└── shared/      # 主进程与界面共用的类型定义
```

## 致谢

- [BMCLAPI](https://bmclapi2.bangbang93.com/)：国内下载镜像
- [MCIM](https://mod.mcimirror.top/)：Modrinth 与 CurseForge 国内镜像
- [Modrinth](https://modrinth.com/)、[CurseForge](https://www.curseforge.com/minecraft)：模组搜索与下载
- [@xmcl / minecraft-launcher-core-node](https://github.com/Voxelum/minecraft-launcher-core-node)
- [skinview3d](https://github.com/bs-community/skinview3d)

## 声明

本项目与 Mojang Studios、Microsoft 没有任何关联。Minecraft 是 Mojang Studios 的商标。请购买正版游戏以支持开发者。

## 许可证

[MIT](LICENSE)
