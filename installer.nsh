; Custom NSIS script for POS Hardware Bridge installer
; This script handles:
; 1. Config directory creation in ProgramData for IT staff access
; 2. Default config file creation
; 3. Registry keys for startup

!macro customInstall
  ; Expand the ProgramData environment variable into $0
  ExpandEnvStrings $0 "%PROGRAMDATA%"
  
  ; Build the full config directory path in $1 (properly wrapped for paths with spaces)
  StrCpy $1 "$0\POS Hardware Bridge"
  
  ; Create config directory in ProgramData (accessible to all users)
  CreateDirectory "$1"
  
  ; Copy default config from installer files into ProgramData if it's not already there
  SetOutPath "$1"
  IfFileExists "$1\config.json" +2
    File "${PROJECT_DIR}\config.json"
  
  ; Set permissions so IT staff can easily modify config manually
  ExecWait 'icacls "$1" /grant "Users:(OI)(CI)F"'
!macroend

!macro customUninstall
  ; Remove startup registry key
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "POS Hardware Bridge"
!macroend
