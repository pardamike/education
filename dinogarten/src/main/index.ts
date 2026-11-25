import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: 'Dinogarten',
    backgroundColor: '#a9defa',
    autoHideMenuBar: true,
    show: false
  })
  // Automated previews set this so the window appears without taking the keyboard from whoever is typing.
  const quiet = Boolean(process.env['DINOGARTEN_PREVIEW'])
  win.once('ready-to-show', () => (quiet ? win.showInactive() : win.show()))

  // electron-vite sets this while `pnpm dev` is running; a built app loads its own files.
  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (devServerUrl) {
    void win.loadURL(devServerUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// A preview must not become the active app either, or it would swallow keystrokes meant for another window.
if (process.env['DINOGARTEN_PREVIEW'] && process.platform === 'darwin') app.setActivationPolicy('accessory')

void app.whenReady().then(createWindow)

// A game, not a document app: closing the window quits, on macOS too.
app.on('window-all-closed', () => app.quit())
