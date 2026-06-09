import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import icon from '../../resources/icon.png?asset'
import { registerIpc } from './ipc'

let updaterWired = false

function setupAutoUpdater(win: BrowserWindow): void {
  if (updaterWired) return // once per app run (ready-to-show can re-fire)
  updaterWired = true

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    win.webContents.send('update:available', info.version)
  })
  autoUpdater.on('update-downloaded', (info) => {
    win.webContents.send('update:downloaded', info.version)
  })
  autoUpdater.on('error', (err) => {
    console.error('[updater]', err.message)
  })

  ipcMain.on('update:install', () => {
    // Destroy all windows synchronously so NSIS doesn't detect the app as
    // still running when the installer starts (quitAndInstall spawns the
    // installer before app.quit() fully drains the process).
    for (const win of BrowserWindow.getAllWindows()) {
      win.destroy()
    }
    autoUpdater.quitAndInstall(false, true)
  })

  // Manual "check for updates" — invokable from the UI. Returns a status the
  // renderer toasts. In dev there's no release feed, so report that plainly.
  ipcMain.handle('update:check', async () => {
    const current = app.getVersion()
    if (is.dev) return { status: 'dev' as const, current }
    try {
      const r = await autoUpdater.checkForUpdates()
      const latest = r?.updateInfo?.version
      if (!latest) return { status: 'unknown' as const, current }
      // a newer version → autoDownload runs; the 'update:downloaded' toast follows
      return {
        status: latest !== current ? ('available' as const) : ('up-to-date' as const),
        version: latest,
        current
      }
    } catch (err) {
      return {
        status: 'error' as const,
        error: err instanceof Error ? err.message : String(err),
        current
      }
    }
  })

  // Auto-check shortly after launch (packaged only — dev has no feed)
  if (!is.dev) setTimeout(() => void autoUpdater.checkForUpdates(), 5000)
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    // custom title bar — frameless on Windows/Linux, hidden traffic-light inset
    // on macOS (keep the native close/min/max but no title strip)
    frame: false,
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hidden', trafficLightPosition: { x: 12, y: 10 } }
      : {}),
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.maximize()

  // tell the renderer when maximized state changes (swap the max/restore icon)
  const sendMaxState = (): void =>
    mainWindow.webContents.send('window:maximized', mainWindow.isMaximized())
  mainWindow.on('maximize', sendMaxState)
  mainWindow.on('unmaximize', sendMaxState)

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    setupAutoUpdater(mainWindow)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.krust.studio')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpc()

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
