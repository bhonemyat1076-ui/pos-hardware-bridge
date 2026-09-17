# POS Hardware Bridge

POS Hardware Bridge is a Windows desktop service built with Electron, Express, and Node.js for connecting a retail POS system to local hardware such as a thermal receipt printer and a customer display unit (CDU). It listens for receipt and display requests from the POS application, formats the print content, and sends output to the configured hardware.

This project is designed for retail environments where a POS system needs to print customer receipts and show transactions or welcome messages on a pole display without requiring a custom local app for each device.

## Features

- Receives receipt payloads from a POS backend over HTTP
- Formats receipt output for thermal printer printing
- Supports customer display messages for transaction totals and thank-you screens
- Auto-detects serial COM ports for CDU devices when configured as AUTO
- Runs silently in the Windows system tray
- Stores configuration in a writable system location for installed builds
- Supports packaged Windows builds using Electron Builder

## Project Structure

- `main.js` – Electron app startup, tray integration, hardware setup, and printer handling
- `server.js` – Express API endpoints for receipt printing and CDU display updates
- `config.json` – Runtime configuration for port, printer, company details, and CDU settings
- `installer.nsh` – Custom NSIS installer configuration
- `package.json` – Project scripts and build configuration

## Requirements

- Node.js 18+
- npm
- Windows OS for the Electron tray and serial hardware integration
- A thermal receipt printer connected to the system
- A compatible customer display or pole display connected over serial COM port

## Installation

1. Open a terminal in the project folder.
2. Install dependencies:

```bash
npm install
```

3. Update the configuration file if needed:

```json
{
  "port": 8080,
  "printerName": "POS80 Printer",
  "companyName": "Company Name",
  "branchAddress": "Address of the Branch",
  "tel1": "",
  "tel2": "",
  "email1": "",
  "email2": "",
  "operatingHours": "Open Daily : 9:00 AM To 10:00 PM",
  "footerMessage1": "\"Footer Message 1\"",
  "footerMessage2": "\"Footer Message 2\"",
  "cdu": {
    "enabled": true,
    "comPort": "AUTO",
    "baudRate": 9600,
    "welcomeMessage": "Welcome Message on CDU"
  }
}
```

4. Start the app:

```bash
npm start
```

The application runs in the background tray and keeps the POS bridge service active without opening a visible desktop window.

## Runtime Behavior

### Receipt printing endpoint

The service listens for receipt payloads at:

```http
POST /PrinterService/ps/rptslip
```

This endpoint reads the JSON payload sent from the POS system, formats a receipt layout, and sends the receipt to the configured printer.

Example request structure:

```json
{
  "slipNo": "INV-1001",
  "date": "2026-09-17",
  "time": "15:42:11",
  "counter": "1",
  "cashierId": "CASHIER01",
  "totalAmount": 1500,
  "netAmount": 1500,
  "paidAmount": 2000,
  "detailList": [
    { "qty": 2, "unit": "Pcs", "stock": "Coffee", "price": 500 }
  ]
}
```

### Customer display endpoint

The service listens for CDU display updates at:

```http
POST /PrinterService/ps/sendCDUData
```

This endpoint updates the display text based on the supplied POS status, such as:

- welcome screen
- running transaction total
- final total amount
- thank-you message

Typical payloads include fields like `type`, `total`, `price`, and other sale values.

## Configuration Details

### `port`

Local HTTP port for the Express server.

### `printerName`

Name of the printer to use. If empty, the app falls back to the default system printer.

### `companyName`

Displayed at the top of the receipt for the business name.

### `branchAddress`

Branch location or address shown on receipts.

### `operatingHours`

Business hours displayed beneath the company information.

### `footerMessage1` and `footerMessage2`

Footer text shown near the bottom of the receipt.

### `cdu`

Customer display configuration:

- `enabled` – turns the CDU integration on or off
- `comPort` – COM port or AUTO for device auto-detection
- `baudRate` – communication speed such as 9600
- `welcomeMessage` – default text shown when the screen resets

## Building the App

Build the Windows package using:

```bash
npm run build
```

For portable builds:

```bash
npm run build:portable
```

For installer-based builds:

```bash
npm run build:installer
```

The build output is generated in the `dist` folder according to the configuration in `package.json`.

## Tray and Background Operation

When started, the app runs as a system tray application. It exposes a tray menu with the option:

- Restart Service

This restarts the Express server and serial display connection without needing to reopen the app.

## Troubleshooting

### Printer not printing

- Check that the configured printer name matches a valid installed printer.
- Verify the POS endpoint is sending valid receipt data.
- Confirm the printer is online and available in Windows.

### CDU not updating

- Confirm the serial port is available and the device is connected.
- Set `comPort` to `AUTO` or explicitly choose the correct COM port.
- Check whether the `serialport` dependency installed correctly.

### App does not start

- Ensure all dependencies are installed:

```bash
npm install
```

- Check the console logs for startup or serial connection errors.

## Notes

This project is tailored for a retail POS workflow and is intended to run on a local Windows machine connected to physical retail hardware. It is especially useful in cashier or checkout environments where the POS needs to communicate with customer-facing hardware directly.

## License

This project is provided as-is for local retail deployment and customization.
