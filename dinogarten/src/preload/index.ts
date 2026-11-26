import { contextBridge, ipcRenderer } from 'electron'

// The game's screen is a web page and may not touch files itself. This hands it the two things
// it needs: reading the players' save file, and writing it. The main process does the file work.
contextBridge.exposeInMainWorld('saves', {
  read: (): Promise<unknown> => ipcRenderer.invoke('saves:read'),
  write: (saves: unknown): Promise<void> => ipcRenderer.invoke('saves:write', saves)
})
