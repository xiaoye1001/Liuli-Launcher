<div align="center">

# Liuli Launcher · 琉璃启动器

A clean, ready-to-use launcher for **Minecraft: Java Edition**

[![Release](https://img.shields.io/github/v/release/xiaoye1001/Liuli-Launcher)](https://github.com/xiaoye1001/Liuli-Launcher/releases/latest)
[![License](https://img.shields.io/github/license/xiaoye1001/Liuli-Launcher)](LICENSE)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)

[简体中文](README.md) | **English**

</div>

## Contents

- [About](#about)
- [Download](#download)
- [Features](#features)
- [Microsoft Account Login](#microsoft-account-login)
- [Data Location](#data-location)
- [Development](#development)
- [Tech Stack](#tech-stack)
- [Contributing](#contributing)
- [Acknowledgements](#acknowledgements)
- [Disclaimer](#disclaimer)
- [License](#license)

## About

Liuli Launcher is built with Electron and React and runs on Windows, macOS and Linux. It brings game installation, mod loaders, community resources, modpacks, multiplayer and appearance customization together in one glass-style interface, with mirror acceleration for networks in mainland China.

*"Liuli" (琉璃) is the Chinese word for colored glass. The launcher interface is currently available in Simplified Chinese only.*

## Download

Download the package for your system from [Releases](https://github.com/xiaoye1001/Liuli-Launcher/releases/latest):

| System | File | Notes |
|---|---|---|
| Windows | `LiuliLauncher-Setup-<version>.exe` | Installer with a choice of install location and shortcuts |
| Windows | `LiuliLauncher-Portable-<version>.exe` | Portable; data is stored in `LiuliLauncher-Data` next to the exe |
| macOS (Apple silicon) | `LiuliLauncher-<version>-arm64.dmg` | Drag into Applications |
| macOS (Intel) | `LiuliLauncher-<version>-x64.dmg` | Same as above |
| Linux | `LiuliLauncher-<version>.AppImage` | Make executable and run; requires FUSE 2 |

Playing requires Java: Java 21 for 1.20.5+, Java 17 for 1.18 – 1.20.4, Java 16 for 1.17 and Java 8 for older versions. The launcher can download the right Java automatically.

> The packages are not code-signed yet. On Windows, if SmartScreen appears, click "More info" → "Run anyway"; on macOS, right-click the app in Applications and choose "Open" the first time.

## Features

### Game installation
- Release, snapshot and old versions with search; choose the **BMCLAPI mirror** or the **official Mojang source**, with automatic fallback
- One-click install of **Forge**, **NeoForge**, **Fabric**, **Quilt** and **OptiFine**
- Multi-threaded chunked downloads with cancel and retry; "Check and repair" for installed versions
- Import and export Modrinth (`.mrpack`), CurseForge, MultiMC / Prism and MCBBS modpacks; modpacks installed from the download page can be **updated in one click**, keeping worlds and edited configs

### Community resources
- Search **Modrinth** and **CurseForge** together (CurseForge via the MCIM mirror) for mods, modpacks, data packs, resource packs and shaders
- Filter by game version, loader and category; required dependencies are installed automatically
- Popular mods show their Chinese names and can be searched in Chinese

### Launching
- Automatically picks or downloads the right Java; **automatic memory allocation** based on version, mods, shaders and available RAM
- Verifies game files before launch and repairs missing or corrupted ones
- Staged launch animation and live log window; stop the game from the launcher while it runs
- **Crash analysis** explains causes and fixes, with one-click log sharing to [mclo.gs](https://mclo.gs/)
- Per-version memory, Java, window size, JVM arguments, pre-launch / post-exit commands and more
- Multiple game directories, version isolation, favorites and custom icons, playtime statistics

### Version and world management
- Mods: enable / disable, dependency checks, update checks
- Worlds: backup and restore, import, seed and game rules, data packs
- Resource packs, shader packs and screenshots

### Servers and multiplayer
- Save servers with player count, ping and MOTD; join directly
- Three ways to play together, all with a single room code: **direct connection**, **P2P networking** (powered by [EasyTier](https://github.com/EasyTier/EasyTier)) and **tunnels**

### Accounts
- Offline accounts, **Microsoft accounts** and authlib-injector skin sites such as LittleSkin
- 3D skin preview; change skins and capes for Microsoft accounts

### Appearance
- Dark / light / system themes, theme presets and animated particle backgrounds
- Original built-in themes (HD wallpapers and background music); custom wallpapers (images or video), accent colors, fonts and UI scale
- Background music player, click effects and official Minecraft news
- Automatic updates with signature verification and one-click restart

## Microsoft Account Login

The launcher uses Microsoft's official device code sign-in: enter the code shown by the launcher on Microsoft's website and you are signed in. The launcher never sees your password.

- Add multiple Microsoft accounts and switch between them
- Credentials are encrypted with the operating system's secure storage and refreshed automatically when you launch the game
- Change your skin and cape from the Accounts page after signing in

## Data Location

The portable version stores data in `LiuliLauncher-Data` next to the exe. The installed version uses:

| System | Path |
|---|---|
| Windows | `%APPDATA%\mc_launcher` |
| macOS | `~/Library/Application Support/mc_launcher` |
| Linux | `~/.config/mc_launcher` |

This data is kept when you uninstall.

## Development

### Requirements
- [Node.js](https://nodejs.org/) 22.12 or later

### Run
```bash
git clone https://github.com/xiaoye1001/Liuli-Launcher.git
cd Liuli-Launcher
npm install
npm run dev
```

### Commands
| Command | Description |
|---|---|
| `npm run dev` | Run in development mode |
| `npm run build` | Build into `out/` |
| `npm run typecheck` | TypeScript type check |
| `npm run format` | Format with Prettier (`format:check` only checks) |
| `npm run build:win` | Package the Windows installer and portable version |
| `npm run build:mac` | Package the macOS dmg (run on macOS) |
| `npm run build:linux` | Package the Linux AppImage |

Packages are written to `dist/`. Official releases are built and published by the Release workflow on GitHub Actions.

### Project structure
```
src/
├── main/        # Main process: installation, launching, accounts, mods, etc.
├── preload/     # Preload script exposing window.api to the UI
├── renderer/    # UI (React)
└── shared/      # Types and helpers shared by main and renderer
```

## Tech Stack

- [Electron](https://www.electronjs.org/) + [electron-vite](https://electron-vite.org/)
- [React 18](https://react.dev/) + TypeScript + [Tailwind CSS](https://tailwindcss.com/) + [Framer Motion](https://www.framer.com/motion/) + [Lucide](https://lucide.dev/)
- [@xmcl](https://github.com/Voxelum/minecraft-launcher-core-node): game installation, launching, mod parsing and sign-in
- [skinview3d](https://github.com/bs-community/skinview3d): 3D skin preview

## Contributing

Issues and pull requests are welcome. Please read the [contributing guide](CONTRIBUTING.md) and [code of conduct](CODE_OF_CONDUCT.md) first. Report security vulnerabilities privately as described in the [security policy](SECURITY.md).

## Acknowledgements

- [BMCLAPI](https://bmclapi2.bangbang93.com/): download mirror for mainland China
- [MCIM](https://mod.mcimirror.top/): Modrinth and CurseForge mirror
- [Modrinth](https://modrinth.com/), [CurseForge](https://www.curseforge.com/minecraft): community resources
- [mclo.gs](https://mclo.gs/): log sharing
- [EasyTier](https://github.com/EasyTier/EasyTier): P2P multiplayer
- [@xmcl / minecraft-launcher-core-node](https://github.com/Voxelum/minecraft-launcher-core-node), [skinview3d](https://github.com/bs-community/skinview3d)

## Disclaimer

This project is not affiliated with Mojang Studios or Microsoft. Minecraft is a trademark of Mojang Studios. Please buy the game to support its developers.

The launcher does not collect any data. See the [privacy policy](PRIVACY.md).

## License

Released under the [MIT License](LICENSE).
