# POS Hardware Bridge - Installer Setup

This Electron app is configured to build a Windows installer using electron-builder with NSIS.

## Features

- **Installation to Program Files**: App installs to `C:\Program Files\POS Hardware Bridge`
- **Config File for IT Staff**: Configuration stored in `C:\ProgramData\POS Hardware Bridge\config.json` (accessible to all users)
- **Startup on Boot**: Registry key added to run app automatically at Windows startup
- **System Tray**: Runs in background with system tray icon


## Output

After running `npm run build:installer`, you'll find:
- `dist/POS Hardware Bridge Setup 1.0.0.exe` - The installer executable
- `dist/win-unpacked/` - Unpacked application files

## Installation Process

When running the installer:

1. **Installation Directory**: Defaults to Program Files (user can change)
2. **Config Placement**: Default config copied to `C:\ProgramData\POS Hardware Bridge\config.json`
3. **Permissions**: Config directory granted full access to Users group
4. **Startup**: Registry entry added under `HKLM\Software\Microsoft\Windows\CurrentVersion\Run`
5. **Shortcuts**: Desktop and Start Menu shortcuts created

## Configuration

IT staff can modify settings by editing:
```
C:\ProgramData\POS Hardware Bridge\config.json
```

The app will automatically reload configuration on restart.

## Uninstallation

Uninstaller removes:
- Application files from Program Files
- Registry startup key
- Registry uninstall entries
- Desktop and Start Menu shortcuts

**Note**: Config file in ProgramData is preserved to maintain IT settings across updates.

## Development vs Production

- **Development**: Uses local `config.json` in project directory
- **Production**: Uses `C:\ProgramData\POS Hardware Bridge\config.json`

## NSIS Custom Script

The custom installer script (`installer.nsh`) handles:
- ProgramData directory creation
- Config file deployment
- Permission setting with icacls
- Startup registry entry
- Uninstall registry entries
