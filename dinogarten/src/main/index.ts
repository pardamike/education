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
  win.once('ready-to-show', () => win.show())

  // electron-vite sets this while `pnpm dev` is running; a built app loads its own files.
  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (devServerUrl) {
    void win.loadURL(devServerUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

void app.whenReady().then(createWindow)

// A game, not a document app: closing the window quits, on macOS too.
app.on('window-all-closed', () => app.quit())
