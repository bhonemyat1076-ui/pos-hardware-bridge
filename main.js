const { app, BrowserWindow } = require('electron');
const path = require('path');
const { startServer } = require('./server');

let mainWindow;

// Allow hiding the UI when started with the HIDE_WINDOW env flag or --hidden arg
const hideWindow =
  process.env.HIDE_WINDOW === '1' ||
  process.env.HIDE_WINDOW === 'true' ||
  process.argv.includes('--hidden');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 600,
    show: !hideWindow, // show = false when running in background mode
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Start the background Express server
  startServer();
}

function resolvePrinterDeviceName(printers, configuredName) {
  const target = configuredName.trim();
  const exact = printers.find(
    (p) => p.name === target || p.displayName === target
  );
  if (exact) return exact.name;

  const lower = target.toLowerCase();
  const fuzzy = printers.find(
    (p) =>
      p.name.toLowerCase() === lower ||
      (p.displayName && p.displayName.toLowerCase() === lower)
  );
  return fuzzy ? fuzzy.name : target;
}

// Create a globally accessible printer function that server.js can call directly
global.printHTMLReceipt = function(htmlContent, printerName) {
  const configuredPrinter = (printerName || '').trim();

  // Create an invisible background window for rendering the receipt
  let workerWindow = new BrowserWindow({ show: false });

  workerWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

  workerWindow.webContents.on('did-finish-load', async () => {
    const printOptions = {
      silent: true,
      printBackground: true,
      margins: { marginType: 'none' }
    };

    if (configuredPrinter) {
      const printers = await workerWindow.webContents.getPrintersAsync();
      printOptions.deviceName = resolvePrinterDeviceName(printers, configuredPrinter);
      const matched = printers.some((p) => p.name === printOptions.deviceName);
      if (!matched) {
        console.warn(`Configured printer "${configuredPrinter}" not found; attempting direct name.`);
      } else {
        console.log(`Printing to configured printer: ${printOptions.deviceName}`);
      }
    } else {
      const printers = await workerWindow.webContents.getPrintersAsync();
      const defaultPrinter = printers.find((p) => p.isDefault);
      console.log(
        `No printer configured; using system default: ${defaultPrinter?.name || '(system default)'}`
      );
    }

    workerWindow.webContents.print(printOptions, (success, failureReason) => {
      if (!success) console.error('Print spooler error:', failureReason);
      workerWindow.close();
    });
  });
};

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  // When running in background (no UI), don't quit the app when there are no windows.
  if (process.platform !== 'darwin' && !hideWindow) app.quit();
});