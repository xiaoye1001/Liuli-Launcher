<div align="center">

# Liuli Launcher · 琉璃启动器

A clean, ready-to-use launcher for **Minecraft: Java Edition**

Glass-style UI · Dark & light themes · Fast downloads via mirrors · One-click mod loaders · Microsoft account login

[简体中文](README.md) | **English**

</div>

![Home](docs/screenshots/home.png)

> The screenshots show the Chinese UI. The launcher interface is currently available in Simplified Chinese only.

*"Liuli" (琉璃) is the Chinese word for colored glass, a nod to the launcher's glass-style design.*

## Features

### Game download & installation
- Version list split into releases, snapshots and old versions, with search
- Two download sources: the **BMCLAPI mirror** (recommended in mainland China) or the **official Mojang servers**; automatically falls back to the official source if the mirror fails
- Multi-threaded downloads with live progress and speed; installs can be cancelled and retried
- Choose a custom version name and attach a mod loader before installing:
  - **Forge**, **NeoForge** or **Fabric** (pick one)
  - **OptiFine** (on its own, or together with Forge)
- Import local modpacks (pick a file, or just drag it onto the window): Modrinth (`.mrpack`), CurseForge, MultiMC / Prism and MCBBS (`.zip`) formats are supported; the matching Minecraft version and mod loader, every mod, and the bundled config files are installed in one go
- "Check & repair" installed versions: only missing or corrupted files are downloaded again
- Before deleting a version, the launcher checks whether other versions depend on it, and warns you if its folder contains worlds

### Community resources
The **Download** page has a side menu with **Vanilla** and **Community resources** (mods, modpacks, data packs, resource packs, shader packs), all from Modrinth:
- Search every resource type and filter by Minecraft version, loader and category, or sort by downloads, last update and more
- Expand a project to see all of its versions, with the ones matching your filters listed first, and pick exactly which one to download
- Choose which installed game version to install into, and the filters follow that version's Minecraft version and loader
- Mods go to `mods` (required dependencies are installed too), resource packs to `resourcepacks`, shader packs to `shaderpacks`, and data packs to the chosen world's `datapacks`; modpacks open the install page after downloading

### Launching
- **Automatic Java**: picks the right Java for each game version and downloads it automatically when missing (the same Java runtimes as the official launcher); Java 8 / 17 / 21 / 25 can also be downloaded from Settings with one click, or chosen manually
- Configurable game memory
- Live game log window with search filtering and one-click copy
- **Crash analysis**: after a crash, the launcher reads the game output, crash report and Java crash log and explains the cause and how to fix it: missing dependencies, mods that don't match the game version or conflict with each other, duplicate mods, Mixin failures, Java too old or too new, out of memory, invalid JVM arguments, graphics drivers, incompatible OptiFine, corrupted files and more. You can open the crash report directly, or export all related files as a zip to ask others for help
- **Version isolation**: modded versions (or all versions) each get their own `mods`, worlds and config, so they never interfere with each other
- **Version management**: the Versions page gathers everything for installed versions: choosing the version to launch, mods, worlds, resources, version settings, opening the folder, check & repair, and deleting
- **World management**: see each world's name, icon, game mode (hardcore / cheats), game version and last played time; back up a world to a zip in one click, import worlds from zip files, or move them to the recycle bin; manage each world's data packs (with their enabled state; add, download or delete)
- **Resource pack & shader management**: see each version's resource packs (with icon and description) and shader packs; enable resource packs, switch or turn off shaders (Iris, Oculus and OptiFine supported) right from the launcher, add files, or move them to the recycle bin
- **Per-version settings** (from the Versions page or the gear button next to the version on Home): set memory, Java, version isolation, game window size (or fullscreen) and extra JVM / game arguments for each version; anything not set follows the global settings. The settings are stored in `liuli-version.json` inside the version's folder

### Mod management
- Shows each mod's name, version, description and icon; supports Fabric / Quilt / Forge / NeoForge
- Enable or disable mods (using the `.disabled` suffix, compatible with other launchers); deleted mods go to the recycle bin
- Flags mods that don't match the version's mod loader
- **Search and install mods from Modrinth** right inside the launcher: only mods compatible with the current version are shown, and required dependencies are installed automatically

### Accounts
- **Offline accounts**: upload a skin and preview it on an animated 3D model
- **Microsoft login**: sign in by entering a code on Microsoft's website, so the launcher never sees your password; switch between multiple accounts, with sessions refreshed automatically at launch

### Interface
- Glass-style design with page transition animations
- Dark / light / follow-system themes

| Install setup | Mod management |
|---|---|
| ![Install setup](docs/screenshots/install.png) | ![Mod management](docs/screenshots/mods.png) |

![Accounts](docs/screenshots/account.png)

## Getting started

### Requirements
- [Node.js](https://nodejs.org/) 20 or later
- Java is required to run the game: Java 21 for 1.20.5 and later, Java 17 for 1.18–1.20.4, Java 16 for 1.17, and Java 8 for older versions

### Run
```bash
git clone https://github.com/xiaoye1001/Liuli-Launcher.git
cd Liuli-Launcher
npm install
npm run dev
```

The project ships with an `.npmrc` that downloads Electron from a mirror in China. If you are elsewhere and the mirror is slow, delete that line from `.npmrc` to use the default source.

### Other commands
| Command | Description |
|---|---|
| `npm run dev` | Run in development mode (reloads on code changes) |
| `npm run build` | Build into the `out/` directory |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run build:win` | Build both the Windows installer and the portable version |
| `npm run build:win:setup` | Build the installer only |
| `npm run build:win:portable` | Build the portable version only |
| `npm run build:unpack` | Build an unpacked app folder (no installer, for quick testing) |

### Building for Windows
On Windows, run:
```bash
npm run build:win
```
Two files are written to `dist/`:

| File | Description |
|---|---|
| `LiuliLauncher-Setup-<version>.exe` | **Installer**: lets you choose the install location and creates desktop and Start menu shortcuts. Uninstalling keeps your settings, accounts and game files |
| `LiuliLauncher-Portable-<version>.exe` | **Portable**: a single exe that runs without installation. Data is stored in the `LiuliLauncher-Data` folder next to the exe, so you can carry both on a USB drive |

The portable version unpacks itself on every start, so it launches a few seconds slower than the installed one. If the exe's folder is not writable (e.g. inside `C:\Program Files`), data is stored in the same place as the installed version instead.

> The installer is not code-signed, so Windows SmartScreen may show "Windows protected your PC" on first run. Click **More info** → **Run anyway**.

`build:mac` / `build:linux` build a macOS dmg and a Linux AppImage respectively, and must be run on those systems.

## Microsoft login

Minecraft's login API only accepts **Azure apps approved by Mojang**. The Client ID is compiled into the app **at build time**: it is not shown in the UI and not stored in the source code (so others can't simply reuse it). To build with Microsoft login, first register your own Client ID:

1. Sign in to the [Azure portal](https://portal.azure.com), search for **App registrations** → **New registration**:
   - Name: e.g. `Liuli Launcher`
   - Supported account types: **Personal Microsoft accounts only**
   - Redirect URI: leave empty
2. Under **Authentication**, set **Allow public client flows** to **Yes** and save (no client secret is needed)
3. Submit the [Mojang review form](https://aka.ms/mce-reviewappid), choose *New AppID for Approval*, and fill in the Application (client) ID and Directory (tenant) ID from the app's **Overview** page
4. Copy `.env.example` in the project root to `.env` and fill in the Client ID:
   ```
   MAIN_VITE_MS_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   ```
   `.env` is listed in `.gitignore` and will not be committed. Both `npm run dev` and packaged builds will then have Microsoft login enabled
5. For releases built by GitHub Actions, add a secret named `MS_CLIENT_ID` under the repository's Settings → Secrets and variables → Actions

Without a Client ID, the **添加微软账号 (Add Microsoft account)** button is disabled and only offline accounts are available. Until the app is approved, login fails at the last step with a "not approved by Mojang" message. This is expected.

## Data location

The portable version keeps its data in the `LiuliLauncher-Data` folder next to the exe. The installed version and development mode use:

| OS | Path |
|---|---|
| Windows | `%APPDATA%\mc_launcher` |
| macOS | `~/Library/Application Support/mc_launcher` |
| Linux | `~/.config/mc_launcher` |

- `settings.json`: launcher settings
- `accounts.json`: Microsoft accounts (credentials are encrypted with the OS secure storage)
- `.minecraft/`: default game directory (can be changed in Settings to the official launcher's directory or any folder)
- `cache/`: cached files such as OptiFine installers

## Tech stack

- [Electron](https://www.electronjs.org/) + [electron-vite](https://electron-vite.org/)
- [React 18](https://react.dev/) + TypeScript + [Tailwind CSS](https://tailwindcss.com/) + [Framer Motion](https://www.framer.com/motion/) + [Lucide](https://lucide.dev/)
- [@xmcl](https://github.com/Voxelum/minecraft-launcher-core-node) libraries for game installation, launching, mod parsing and Microsoft login
- [skinview3d](https://github.com/bs-community/skinview3d) for 3D skin preview

```
src/
├── main/        # Main process: downloads, installation, launching, accounts, mods
├── preload/     # Preload script: exposes window.api to the UI
├── renderer/    # UI (React)
└── shared/      # Types shared by the main process and the UI
```

## Acknowledgements

- [BMCLAPI](https://bmclapi2.bangbang93.com/): download mirror
- [MCIM](https://mod.mcimirror.top/): Modrinth mirror
- [Modrinth](https://modrinth.com/): mod search and downloads
- [@xmcl / minecraft-launcher-core-node](https://github.com/Voxelum/minecraft-launcher-core-node)
- [skinview3d](https://github.com/bs-community/skinview3d)

## Disclaimer

This project is not affiliated with Mojang Studios or Microsoft. Minecraft is a trademark of Mojang Studios. Please buy the game to support its developers.

## License

[MIT](LICENSE)
