const { app, BrowserWindow, Menu, nativeTheme, shell } = require('electron')
const path = require('node:path')

function createWindow () {
  const win = new BrowserWindow({
    width: 1280,
    height: 920,
    minWidth: 760,
    minHeight: 560,
    show: false,
    title: 'Critical Path Drill',
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f1319' : '#f3f5f8',
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  })
  win.once('ready-to-show', () => win.show())
  win.loadFile(path.join(__dirname, 'app', 'index.html'))
  // The course has no links of its own, but anything that tries to open one goes to the browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(() => {
  // No menu bar on Windows or Linux. On a Mac the app menu has to exist for the usual
  // shortcuts to work, so it keeps the standard three and nothing else.
  Menu.setApplicationMenu(process.platform === 'darwin'
    ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }])
    : null)
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
