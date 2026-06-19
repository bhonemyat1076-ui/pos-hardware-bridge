const { app, BrowserWindow } = require('electron');
const path = require('path');
const { startServer } = require('./server');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 600,
    show: true, // Set to true so you can see your bridge dashboard status
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Start the background Express server
  startServer();
}

// Create a globally accessible printer function that server.js can call directly
global.printHTMLReceipt = function(htmlContent, printerName) {
  // Create an invisible background window for rendering the receipt
  let workerWindow = new BrowserWindow({ show: false });
  
  workerWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

  workerWindow.webContents.on('did-finish-load', () => {
    workerWindow.webContents.print({
      silent: true,
      printBackground: true,
      deviceName: printerName,
      margins: { marginType: 'none' } // Disables the awful Notepad margins completely!
    }, (success, failureReason) => {
      if (!success) console.error('Print spooler error:', failureReason);
      workerWindow.close(); // Clean up memory safely
    });
  });
};

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});