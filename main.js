
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');

// Impede que o app seja iniciado várias vezes
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  let win;

  function createWindow() {
    win = new BrowserWindow({
      width: 1280,
      height: 800,
      minWidth: 1024,
      minHeight: 768,
      fullscreen: false,
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: '#ffffff',
        symbolColor: '#1f2937',
        height: 32
      },
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        preload: path.join(__dirname, 'preload.js') 
      }
    });

    win.loadFile(path.join(__dirname, 'index.html'));
    
    win.on('ready-to-show', () => {
      win.show();
      win.focus();
    });
  }

  app.whenReady().then(createWindow);

  // Fornece o caminho AppData para o script.js com segurança
  ipcMain.on('get-user-data-path', (event) => {
    event.returnValue = app.getPath('userData');
  });

  // Abre a pasta de dados no Explorer
  ipcMain.on('open-data-folder', () => {
    shell.openPath(app.getPath('userData'));
  });

  // Escuta o comando de fechar o sistema
  ipcMain.on('quit-app', () => {
    console.log('Encerrando aplicação...');
    app.quit();
  });

  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
