import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { app, BrowserWindow, ipcMain } from 'electron'

// The players and their stars are kept in one small file in the app's own data folder:
//   macOS    ~/Library/Application Support/dinogarten/players.json
//   Windows  %APPDATA%\dinogarten\players.json
// Deleting that file starts everyone afresh; copying it is a backup.
const savesFile = (): string => join(app.getPath('userData'), 'players.json')

ipcMain.handle('saves:read', async (): Promise<unknown> => {
  try {
    return JSON.parse(await readFile(savesFile(), 'utf8'))
  } catch {
    // No file yet: nobody has played.
    return null
  }
})

ipcMain.handle('saves:write', async (_event, saves: unknown): Promise<void> => {
  // Written beside the real file and then swapped in, so a crash mid-write cannot leave half a file.
  const draft = `${savesFile()}.new`
  await mkdir(dirname(draft), { recursive: true })
  await writeFile(draft, JSON.stringify(saves, null, 2))
  await rename(draft, savesFile())
})

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: 'Dinogarten',
    backgroundColor: '#a9defa',
    autoHideMenuBar: true,
    show: false,
    webPreferences: { preload: join(__dirname, '../preload/index.js') }
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
