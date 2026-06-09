; Custom NSIS hook — close any running Krust Studio instance before install.
; electron-builder includes this via nsis.include in electron-builder.yml.
;
; taskkill /F  = force-terminate
;          /IM = match by image name
;          /T  = also kill child processes (Electron spawns renderer workers)
; Exit code 0 = process was found and killed.
; Exit code 128 = no matching process — that's fine, ignore it.

!macro customInstall
  DetailPrint "Closing Krust Studio if it is running..."
  nsExec::ExecToLog 'taskkill /F /IM "krust-studio-app.exe" /T'
  Pop $0
!macroend
