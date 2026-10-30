<div align="center">

# 琉璃启动器 · Liuli Launcher

一个界面清爽、开箱即用的 **Minecraft: Java Edition** 启动器

[![Release](https://img.shields.io/github/v/release/xiaoye1001/Liuli-Launcher)](https://github.com/xiaoye1001/Liuli-Launcher/releases/latest)
[![License](https://img.shields.io/github/license/xiaoye1001/Liuli-Launcher)](LICENSE)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)

**简体中文** | [English](README.en.md)

</div>

## 目录

- [简介](#简介)
- [下载安装](#下载安装)
- [功能](#功能)
- [微软正版登录](#微软正版登录)
- [数据存放位置](#数据存放位置)
- [开发](#开发)
- [技术栈](#技术栈)
- [参与贡献](#参与贡献)
- [致谢](#致谢)
- [声明](#声明)
- [许可证](#许可证)

## 简介

琉璃启动器基于 Electron + React 开发，支持 Windows、macOS 和 Linux。它把游戏下载、模组加载器安装、社区资源、整合包、多人联机和个性化外观放在一个玻璃质感的界面里，面向国内网络环境做了镜像加速，安装后即可直接使用。

## 下载安装

在 [Releases](https://github.com/xiaoye1001/Liuli-Launcher/releases/latest) 页面下载对应系统的安装包：

| 系统 | 文件 | 说明 |
|---|---|---|
| Windows | `LiuliLauncher-Setup-<版本号>.exe` | 安装版，可选择安装位置并创建快捷方式 |
| Windows | `LiuliLauncher-Portable-<版本号>.exe` | 免安装版，数据保存在 exe 旁边的 `LiuliLauncher-Data` 文件夹 |
| macOS（Apple 芯片） | `LiuliLauncher-<版本号>-arm64.dmg` | 打开后拖入「应用程序」 |
| macOS（Intel） | `LiuliLauncher-<版本号>-x64.dmg` | 同上 |
| Linux | `LiuliLauncher-<版本号>.AppImage` | 添加执行权限后直接运行，需要 FUSE 2 |

运行游戏需要 Java：1.20.5 及以上需要 Java 21，1.18 ~ 1.20.4 需要 Java 17，1.17 需要 Java 16，更早的版本需要 Java 8。启动器可以自动下载合适的 Java。

> 安装包目前没有代码签名。Windows 首次运行如果提示「Windows 已保护你的电脑」，点「更多信息」→「仍要运行」；macOS 首次打开请在「应用程序」中右键 →「打开」。

## 功能

### 游戏下载与安装
- 正式版、快照版、远古版列表，支持搜索；可选 **BMCLAPI 镜像** 或 **Mojang 官方源**，镜像失败时自动回退
- 一键安装 **Forge**、**NeoForge**、**Fabric**、**Quilt** 和 **OptiFine**
- 多线程分块下载，支持取消、重试；已安装版本可以「检查并修复」
- 导入、导出 Modrinth（`.mrpack`）、CurseForge、MultiMC / Prism、MCBBS 格式整合包；从下载页安装的整合包支持 **一键更新**，保留存档和改过的配置

### 社区资源
- 同时搜索 **Modrinth** 与 **CurseForge**（CurseForge 通过 MCIM 镜像访问），下载模组、整合包、数据包、资源包和光影包
- 按游戏版本、加载器、分类筛选和排序；安装模组时自动安装前置模组
- 常用模组显示中文名，可以直接用中文名搜索

### 启动
- 自动选择或下载合适的 Java；按游戏版本、模组、光影和电脑内存 **自动分配内存**
- 启动前检查游戏文件，缺失或损坏时自动补全
- 分阶段的启动动画、实时日志窗口；游戏运行中可以一键结束游戏
- **崩溃分析**：用中文说明崩溃原因和解决办法，可一键分享日志到 [mclo.gs](https://mclo.gs/)
- 每个版本可以单独设置内存、Java、窗口大小、JVM 参数、启动前 / 退出后命令等
- 支持多个游戏目录、版本隔离、版本收藏与自定义图标、游玩时长统计

### 版本与存档管理
- 模组管理：启用 / 禁用、依赖检查、检查更新
- 存档管理：备份与还原、导入、查看种子与游戏规则、管理数据包
- 资源包、光影包和游戏截图管理

### 服务器与多人联机
- 收藏服务器，显示在线人数、延迟和 MOTD，点「加入」直接进入
- 三种联机方式，都用一个房间码完成：**极速直连**、**P2P 组网**（基于 [EasyTier](https://github.com/EasyTier/EasyTier)）和 **内网穿透**

### 账号
- 离线账号、**微软正版账号**、外置登录（LittleSkin 等 authlib-injector 皮肤站）
- 3D 皮肤预览，正版账号可以直接更换皮肤和披风

### 界面与个性化
- 深色 / 浅色 / 跟随系统主题，多套主题方案和动态粒子背景
- 原创精选主题（高清壁纸与背景音乐）；自定义壁纸（图片或视频）、主题色、字体、界面缩放
- 背景音乐播放器、鼠标点击特效、Minecraft 官方新闻
- 自动检查更新，下载后校验签名并一键重启更新

## 微软正版登录

启动器使用微软官方的设备代码登录：在微软官网输入启动器显示的代码即可完成登录，启动器不会接触你的账号密码。

- 支持添加多个微软账号并随时切换
- 登录凭证使用系统的安全存储加密保存，启动游戏时自动续期
- 登录后可以在账号页更换正版皮肤和披风

## 数据存放位置

免安装版的数据在 exe 旁边的 `LiuliLauncher-Data` 文件夹；安装版保存在：

| 系统 | 路径 |
|---|---|
| Windows | `%APPDATA%\mc_launcher` |
| macOS | `~/Library/Application Support/mc_launcher` |
| Linux | `~/.config/mc_launcher` |

卸载时不会删除这些数据。

## 开发

### 环境要求
- [Node.js](https://nodejs.org/) 22.12 或更高版本

### 运行
```bash
git clone https://github.com/xiaoye1001/Liuli-Launcher.git
cd Liuli-Launcher
npm install
npm run dev
```

### 常用命令
| 命令 | 作用 |
|---|---|
| `npm run dev` | 开发模式运行 |
| `npm run build` | 构建到 `out/` 目录 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run format` | 用 Prettier 格式化代码（`format:check` 只检查） |
| `npm run build:win` | 打包 Windows 安装版与免安装版 |
| `npm run build:mac` | 打包 macOS dmg（需要在 macOS 上运行） |
| `npm run build:linux` | 打包 Linux AppImage |

打包结果在 `dist/` 目录。正式版本由 GitHub Actions 的 Release 工作流自动构建并发布。

### 项目结构
```
src/
├── main/        # 主进程：下载安装、启动游戏、账号、模组管理等
├── preload/     # 预加载脚本：向界面暴露 window.api
├── renderer/    # 界面（React）
└── shared/      # 主进程与界面共用的类型和工具
```

## 技术栈

- [Electron](https://www.electronjs.org/) + [electron-vite](https://electron-vite.org/)
- [React 18](https://react.dev/) + TypeScript + [Tailwind CSS](https://tailwindcss.com/) + [Framer Motion](https://www.framer.com/motion/) + [Lucide](https://lucide.dev/)
- [@xmcl](https://github.com/Voxelum/minecraft-launcher-core-node)：游戏安装、启动、模组解析与登录
- [skinview3d](https://github.com/bs-community/skinview3d)：3D 皮肤预览

## 参与贡献

欢迎提交 Issue 和 Pull Request，请先阅读 [贡献指南](CONTRIBUTING.md) 与 [行为准则](CODE_OF_CONDUCT.md)。安全漏洞请按 [安全策略](SECURITY.md) 私下报告。

## 致谢

- [BMCLAPI](https://bmclapi2.bangbang93.com/)：国内下载镜像
- [MCIM](https://mod.mcimirror.top/)：Modrinth 与 CurseForge 国内镜像
- [Modrinth](https://modrinth.com/)、[CurseForge](https://www.curseforge.com/minecraft)：社区资源
- [mclo.gs](https://mclo.gs/)：日志分享
- [EasyTier](https://github.com/EasyTier/EasyTier)：P2P 联机
- [@xmcl / minecraft-launcher-core-node](https://github.com/Voxelum/minecraft-launcher-core-node)、[skinview3d](https://github.com/bs-community/skinview3d)

## 声明

本项目与 Mojang Studios、Microsoft 没有任何关联。Minecraft 是 Mojang Studios 的商标。请购买正版游戏以支持开发者。

启动器不收集任何数据，详见 [隐私政策](PRIVACY.md)。

## 许可证

本项目基于 [MIT 许可证](LICENSE) 开源。
