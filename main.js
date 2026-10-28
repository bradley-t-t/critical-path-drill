const { app, BrowserWindow, nativeTheme, shell } = require('electron')
const path = require('node:path')

function createWindow () {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 720,
    minHeight: 540,
    title: 'Critical Path Drill',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#12161c' : '#f6f7f9',
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  })
  win.loadFile(path.join(__dirname, 'app', 'index.html'))
  // The drill has no links of its own, but anything that tries to open one goes to the browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
