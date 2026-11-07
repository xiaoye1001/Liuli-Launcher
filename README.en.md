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
| Windows | `LiuliLauncher-Portable-<version>.exe` | Portable; game files go to `.minecraft` next to the exe, launcher files to `LiuliLauncher-Data` |
| macOS (Apple silicon) | `LiuliLauncher-<version>-arm64.dmg` | Drag into Applications |
| macOS (Intel) | `LiuliLauncher-<version>-x64.dmg` | Same as above |
| Linux | `LiuliLauncher-<version>.AppImage` | Make executable and run; requires FUSE 2 |

Playing requires Java: Java 21 for 1.20.5+, Java 17 for 1.18 – 1.20.4, Java 16 for 1.17 and Java 8 for older versions. The launcher can download the right Java automatically.

> The packages are not code-signed yet. On Windows, if SmartScreen appears, click "More info" → "Run anyway"; on macOS, right-click the app in Applications and choose "Open" the first time.

## Features

### Game installation
- Release, snapshot and old versions with search; choose the **BMCLAPI mirror** or the **official Mojang source**, with automatic fallback
- **New version alerts**: the home screen tells you when a new Minecraft release (optionally snapshots) comes out, with a one-click install
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
- **Crash analysis** explains causes and fixes, with one-click log sharing to [mclo.gs](https://mclo.gs/); a **crash history** keeps the time, version and cause of every crash and failed launch
- **AI assistant**: add your own API key (Claude, or OpenAI-compatible services such as DeepSeek, Qwen, Kimi and local Ollama) to analyze crashes and launch failures automatically; the key is encrypted on this computer, and sign-in tokens and other private data are removed before anything is sent
- **Repair wizard** for games that won't start: repair game files, switch to automatic Java, clear custom launch arguments, temporarily disable recently added mods and lower the graphics settings
- Per-version memory, Java, window size, JVM arguments, pre-launch / post-exit commands and more; **launch presets** set everything at once (auto / low-end PC / large modpack / ZGC low-pause), and ZGC is unavailable when Java is too old
- **Multiple instances**: open extra game windows next to the main game with different offline names, to test multiplayer yourself or run two accounts
- **In-game settings**: switch graphics presets (smooth / balanced / high), copy settings or just key bindings from another version, find **key binding conflicts** (unbind one or reset all), with an automatic backup before each change
- Multiple game directories, version isolation, favorites and custom icons, playtime statistics
- **Continue**: jump straight into your last world, skipping the title screen (1.20+); new versions start in Simplified Chinese
- Shows how long each launch took, and the game's memory and CPU usage with **usage charts** while it runs
- **Lag report**: after the game exits, the game log and resource usage tell you whether it lagged (server falling behind, out of memory, connection timeouts, CPU maxed out) and what to try; the home screen points it out when there was a problem
- System tray icon; play-time reminders that suggest taking a break; **system notifications** when downloads, installs or updates finish while the launcher is in the background

### Version and world management
- Mods: enable / disable, dependency checks, update checks, a one-click link to each mod's **MC百科 (MCMod)** page; **roll back** an update that causes problems (the crash screen suggests rolling back recently updated mods)
- **Mod update reminders**: mod updates are checked in the background and the version list shows how many mods can be updated
- **Mod conflict detection**: reads the incompatibilities mods declare themselves (respecting version ranges) and flags well-known conflicts (such as Sodium with OptiFine, or two shader loaders), with one-click disable
- **Mod compatibility check**: finds mods built for the wrong loader or game version, and old disabled copies left next to the version in use, with one-click cleanup
- **Mod bisect**: when the game crashes and you don't know which mod is to blame, each round turns on half of the suspects; play, answer "still broken" or "fixed", and the culprit is found in a few rounds. Required dependencies stay on, and everything is restored at the end
- **Mod profiles**: save which mods are on and off (for example "survival" or "shaders") and switch in one click
- **Mod migration helper**: when moving to a new game version, check which mods have a build for it and install them in one click
- **Mod sync code**: turn a version's mods into a short code for a friend, who pastes it to install the same mods (from Modrinth, with an automatic snapshot first)
- **Mod config editor**: edit mod configs (TOML, JSON, .properties, Forge .cfg) in a form that shows ranges and allowed values, with a backup before the first change and one-click restore
- **Version snapshots**: save a copy of the mods, mod configs and game settings, and restore it in one click if something breaks; **automatic snapshots** are taken before updating mods or modpacks, one-click optimization and similar actions, and the crash screen can go back to the latest snapshot
- One-click **performance mods** (Sodium, Lithium, FerriteCore and more) and **mod translations** (CFPA's I18nUpdateMod, updated automatically in game)
- **Mod collections**: save your favorite mods as a collection and install it into another version in one click (matching versions are picked automatically)
- Worlds: backup and restore, import, seed and game rules, data packs; worlds you played are **backed up automatically** after the game exits (latest 3 per world), to a backup folder of your choice
- **Cloud world backup (WebDAV)**: backups are uploaded to your own cloud drive (Jianguoyun, Nextcloud, Synology and more; **Baidu Netdisk and Quark** work through [OpenList](https://github.com/OpenListTeam/OpenList) / AList running on your computer, with presets and step-by-step instructions in settings) and can be downloaded on another computer; the password is stored encrypted
- Per-world statistics (play time, deaths, diamonds mined and more), a **world map preview** (top-down view of the Overworld that you can drag and zoom, with coordinates under the cursor), a one-click seed map and saving seeds to your favorites
- **Coordinate notebook**: note places in each world (base, village, stronghold) with automatic Nether / Overworld conversion and a copyable teleport command; saved places appear on the world map
- **World version warnings**: a heads-up to back up first when a world was saved by a newer game version or would be upgraded when opened
- **World size and trimming**: see how much space the Overworld, Nether, End and other parts take, and delete barely visited regions far from spawn and the player, with a full backup first
- Resource packs, shader packs and screenshots; screenshots can be **sorted by play session** (with the world or server you played) and a session can be turned into one collage image; **one-click shaders** installs Iris / Oculus and a rendering mod, downloads a shader pack and turns it on
- **Schematic manager** (Litematica): list the schematics in the schematics folder with size and author, and see a **material list** (in-game names, counted in stacks and shulker boxes) you can copy

### Servers and multiplayer
- Save servers with player count, ping and MOTD; join directly; turn on **online alerts** to get a notification when a server comes online or someone joins
- Three ways to play together, all with a single room code: **direct connection**, **P2P networking** (powered by [EasyTier](https://github.com/EasyTier/EasyTier)) and **tunnels**
- **One-click server**: host a vanilla server on your own computer (the official server is downloaded from Mojang, and you must agree to the Minecraft EULA) that friends on the same network can join; view the output, send commands, manage online players, operators and the whitelist with buttons, and it is saved and stopped automatically when the launcher quits; generate a **room code** so friends outside your network can join too; add **data packs** to the server, and install a **Fabric server** and server-side mods in one click (import them from a client version, skipping client-only mods automatically)

### Toolbox
- **Seed favorites**: keep track of interesting world seeds (text seeds supported), copy them or open a seed map
- **Minecraft tools**: Nether / Overworld coordinates, chunk coordinates and game time conversion (copy the /time set command)
- **Slime chunk finder** (Java Edition): enter a seed and see which chunks around a position spawn slimes, using the same algorithm as the game
- **Command generator** (Java Edition): build /give (enchantments, names), /effect, /summon and /tellraw commands from a form, using the right syntax for your game version
- **Enchanting calculator**: pick an item and the enchantments you want to get the cheapest anvil order, with no step hitting "Too Expensive!" (Java Edition 1.21+ rules and game data)
- **Redstone calculator**: hopper transfer rates, furnace / blast furnace smelting times and fuel, comparator signal strength and redstone tick conversion
- **Version diff**: compare the mods and config files of two versions (for example before and after a modpack update)
- **Map art generator**: convert an image to map colors, get the block list (in stacks and shulker boxes) and save it as a Litematica schematic to build from
- **Recipe and trade lookup**: reads the recipes from the version's own game files to show how an item is made and what it is used for, plus common vanilla villager trades and job site blocks
- **Plugins**: install .zip plugins under Toolbox → Plugins (or drop them onto the launcher window); a plugin can add a **home screen widget** that you can place alongside recent plays and news to add small tools to the launcher. Plugins run in an isolated sandbox with no access to accounts, login tokens, keys or files on your computer; the permissions a plugin asks for are listed before you agree to install it, and you can disable it, clear its data or uninstall it at any time. To make your own, see the [plugin guide](docs/plugins.md) (Chinese) and the [example plugin](docs/plugin-example/)

### Accounts
- Offline accounts, **Microsoft accounts** and authlib-injector skin sites such as LittleSkin
- 3D skin preview; change skins and capes for Microsoft accounts
- **Skin wardrobe**: keep several skins and switch with one click (applied directly for offline accounts, uploaded for Microsoft accounts)

### Appearance
- Dark / light / system themes, theme presets and animated particle backgrounds
- Original built-in themes (HD wallpapers and background music); custom wallpapers (images or video), accent colors, fonts and UI scale
- Home-screen splash text and a daily Minecraft fact; set a screenshot as the launcher wallpaper; a small surprise on your birthday if you set it
- A **daily goal** on the home screen (a small in-game challenge each day; keep a streak to unlock an achievement) and **on this day** (screenshots you took on today's date in earlier years)
- **Ctrl+K quick search** for pages, settings, tools and versions
- **Custom layout**: put the navigation bar on the left, right or top and reorder its pages; put the home screen's launch area on the left or right, reorder recent plays, news and the welcome card, and align the content to the bottom or top
- **Page layout editor**: on settings, account, version settings, download, servers, multiplayer, AI assistant, toolbox and other pages, click "Edit layout" in the title bar to drag or move blocks, hide the ones you don't use and put them full width or in the left / right column; each page is saved separately and can be reset
- **Play report** (weekly play time, most-played versions) with a shareable **yearly report image**
- 23 **launcher achievements** (including hidden ones) with an in-game style toast
- Background music player, click effects and official Minecraft news
- Automatic updates with signature verification and one-click restart
- **Pre-launch check**: before launching, the launcher checks for too much allocated memory, mods that do not fit the version and a nearly full disk, and lets you fix them or launch anyway
- A **first-run guide** sets up your name, look and download source and installs your first game
- **Export / import settings**: save settings, custom themes, servers, seeds, mod collections and the skin wardrobe to one file and restore them on another computer (accounts, keys, passwords and local paths are never included)

## Microsoft Account Login

The launcher uses Microsoft's official device code sign-in: enter the code shown by the launcher on Microsoft's website and you are signed in. The launcher never sees your password.

- Add multiple Microsoft accounts and switch between them
- Credentials are encrypted with the operating system's secure storage and refreshed automatically when you launch the game
- Change your skin and cape from the Accounts page after signing in

## Data Location

Game files (versions, mods, worlds, resource packs) are kept apart from launcher files (settings, accounts, caches, Java, themes):

| | Game files | Launcher files |
|---|---|---|
| Portable | `.minecraft` next to the exe | `LiuliLauncher-Data` next to the exe |
| Windows (installed) | `%APPDATA%\.minecraft` | `%APPDATA%\mc_launcher` |
| macOS | `~/Library/Application Support/minecraft` | `~/Library/Application Support/mc_launcher` |
| Linux | `~/.minecraft` | `~/.config/mc_launcher` |

The installed version uses the system `.minecraft`, shared with the official launcher. You can add more game directories and switch between them in Settings → Game Directory.

Servers created with the one-click server (including their worlds) are stored in `local-servers` in the launcher folder, and the skin wardrobe in `skin-wardrobe`; version snapshots are stored in `liuli-snapshots` in the version's game folder, schematics (including map art) in the version's `schematics` folder, and mod config backups in the version's `liuli-config-backup` folder; the coordinate notebook is saved as `liuli-waypoints.json` in each world folder.

Versions 0.5.1 and earlier kept game files in `.minecraft` inside the launcher folder. They are moved to the location above the first time the new version starts (a rename only — nothing is copied or deleted). If a `.minecraft` already exists there, the old folder stays where it is and appears as "旧的默认目录" (old default directory) in the list.

These files are kept when you uninstall.

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
- [MC百科 (MCMod)](https://www.mcmod.cn/): Chinese mod wiki (linked only)
- [EasyTier](https://github.com/EasyTier/EasyTier): P2P multiplayer
- [@xmcl / minecraft-launcher-core-node](https://github.com/Voxelum/minecraft-launcher-core-node), [skinview3d](https://github.com/bs-community/skinview3d)

## Disclaimer

This project is not affiliated with Mojang Studios or Microsoft. Minecraft is a trademark of Mojang Studios. Please buy the game to support its developers.

The launcher does not collect any data. See the [privacy policy](PRIVACY.md).

## License

Released under the [MIT License](LICENSE).
