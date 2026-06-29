const { app, BrowserWindow, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { startServer } = require('./server');

// Determine config file location (ProgramData for installed version, local for dev)
const isDev = !app.isPackaged;
const configDir = isDev ? __dirname : path.join(process.env.ProgramData || 'C:\\ProgramData', 'POS Hardware Bridge');
const configPath = path.join(configDir, 'config.json');
const cduLogPath = path.join(configDir, 'cdu_log.txt');

// Try to load serialport if available; gracefully degrade if not installed
let SerialPortLib = null;
try {
  SerialPortLib = require('serialport');
} catch (e) {
  SerialPortLib = null;
}

let cduSerialPort = null; // Holds the active serial connection instance
let serverInstance = null; // Holds the active Express server listener instance
let trayInstance = null;   // Holds the native system tray item instance

// CDU port auto-detection helper
async function findCDUPort(configPort) {
  if (configPort && configPort !== 'AUTO') return configPort;
  if (!SerialPortLib || !SerialPortLib.list) return 'COM3';
  try {
    const ports = await SerialPortLib.list();
    const autoFoundPort = ports.find(port => {
      const desc = (port.friendlyName || port.manufacturer || port.path || '').toLowerCase();
      return desc.includes('ch340') || desc.includes('prolific') || desc.includes('usb-to-serial') || desc.includes('ftdi');
    });
    if (autoFoundPort) {
      console.log(`[CDU] Found device automatically on: ${autoFoundPort.path}`);
      return autoFoundPort.path;
    }
  } catch (err) {
    console.error('[CDU] Error scanning COM ports:', err);
  }
  return 'COM3';
}

// Global function accessible by server.js to push text straight to the physical hardware display
global.writeToCDU = function(textData) {
  if (!cduSerialPort || !cduSerialPort.isOpen) {
    console.warn('[CDU] Cannot write. Hardware serial port is not open.');
    return;
  }

  // Most pole displays require a Carriage Return (\r) or Newline (\n) to update the lines
  cduSerialPort.write(textData + '\r\n', 'utf8', (err) => {
    if (err) {
      console.error('[CDU] Error writing text data to physical hardware:', err);
    } else {
      console.log(`[CDU] Hardware Output Sent: ${textData.trim()}`);
    }
  });
};

// Initialize the physical pole display link connection
async function initCDUHardware() {
  try {
    const configured = process.env.CDU_PORT || 'AUTO';
    const portPath = await findCDUPort(configured);

    if (!SerialPortLib) {
      console.warn('[CDU] serialport module not installed. Hardware connection skipped.');
      return;
    }

    const SerialCtor = SerialPortLib.SerialPort || SerialPortLib;
    
    try {
      cduSerialPort = new SerialCtor({ path: portPath, baudRate: 9600 });
    } catch (e) {
      try {
        cduSerialPort = new SerialCtor(portPath, { baudRate: 9600 });
      } catch (err) {
        console.error('[CDU] Failed to initialize hardware serial channel:', err);
        return;
      }
    }

    cduSerialPort.on('open', () => {
      console.log(`[CDU] Opened hardware connection loop cleanly on target port: ${portPath}`);
      
      // Clear screen command initialization sequence (Standard Epson display reset)
      cduSerialPort.write('\x0C'); 
    });

    cduSerialPort.on('error', (err) => {
      console.error('[CDU] Hardware connection dropped or experienced a runtime error:', err);
    });

  } catch (err) {
    console.error('[CDU] Critical error running hardware loop config init:', err);
  }
}

let mainWindow;

const hideWindow = true; // Hard-locked to true to ensure it runs completely in background tray mode

// Automated routine to wipe and reboot core infrastructure processes cleanly
async function restartEntireService() {
  console.log('====== TRACING RESTART SEQUENCE ======');

  // 1. Terminate Express Server instance safely
  if (serverInstance && serverInstance.close) {
    console.log('[SYSTEM] Killing operational Express server connection...');
    serverInstance.close();
  }

  // 2. Clear out active Serial Port pipes
  if (cduSerialPort && cduSerialPort.isOpen) {
    console.log('[SYSTEM] Unlinking active hardware serial pipes...');
    cduSerialPort.close((err) => {
      if (err) console.error('[CDU] Error unlinking hardware port:', err);
    });
  }
  cduSerialPort = null;

  // 3. Sprout infrastructure back fresh
  serverInstance = startServer();
  await initCDUHardware();

  console.log('[SYSTEM] Entire Customer Display service successfully auto-restarted.');
}

function createWindow() {
  // Setup window configurations explicitly hiding it off the taskbar array
  mainWindow = new BrowserWindow({
    width: 400,
    height: 600,
    show: false, // Do not show an actual open application frame
    skipTaskbar: true, // Keep the app invisible on the main Windows bottom taskbar
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Setup the native System Tray icon loop
  // Note: Place a 'tray_icon.png' file inside your project root directory (recommended 16x16 size)
  const iconPath = path.join(__dirname, 'tray_icon.png');
  trayInstance = new Tray(iconPath);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Restart Service',
      click: () => {
        restartEntireService();

        // Push an app balloon notification to the user
        trayInstance.displayBalloon({
          title: 'Display Service Engine',
          content: 'The background data stream has restarted cleanly.',
          iconType: 'info'
        });
      }
    },
    { type: 'separator' },
    { label: 'Developed by Min Chit Thu', enabled: false }
    // { type: 'separator' },
    // {
    //   label: 'Exit Application',
    //   click: () => {
    //     if (serverInstance && serverInstance.close) serverInstance.close();
    //     app.quit();
    //   }
    // }
  ]);

  trayInstance.setToolTip('Million Mart Customer Display');
  trayInstance.setContextMenu(contextMenu);

  // Initial runtime spawn
  serverInstance = startServer();
  initCDUHardware();
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

// Globally accessible printer function
global.printHTMLReceipt = function(htmlContent, printerName) {
  const configuredPrinter = (printerName || '').trim();
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
      console.log(`No printer configured; using system default: ${defaultPrinter?.name || '(system default)'}`);
    }

    workerWindow.webContents.print(printOptions, (success, failureReason) => {
      if (!success) console.error('Print spooler error:', failureReason);
      workerWindow.close();
    });
  });
};

app.whenReady().then(() => {
  // Hide native macOS dock if executed on Unix platform layers
  if (app.dock) app.dock.hide();
  createWindow();
});

// Overriding default exit hooks so app remains alive inside the tray array background layer
app.on('window-all-closed', (e) => {
  e.preventDefault();
});