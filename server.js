const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const cduLogPath = path.join(__dirname, 'cdu_log.txt');

// Global variables to track state and handle timeout resets
let currentCduState = {
  mode: "WELCOME", // WELCOME, TRANSACTION, THANKYOU
  amount: "0.00"
};
let idleResetTimeout = null;

// 1. Define where the configuration file lives dynamically
const getStoragePath = () => {
  // If running in packaged production mode, point to the writable ProgramData directory
  if (process.env.NODE_ENV !== 'development' && process.env.PROGRAMDATA) {
    return path.join(process.env.PROGRAMDATA, 'POS Hardware Bridge');
  }
  // Fallback to local project folder during regular development tracking (npm start)
  return __dirname;
};

const configPath = path.join(getStoragePath(), 'config.json');

// 2. Your updated loadConfig function
function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (e) {
    console.error("Config missing or malformed, loading defaults");
  }
  
  // Return your exact retail parameters if the file doesn't exist yet
  return {
    port: 8080,
    companyName: "Company Name",
    operatingHours: "Open Daily : 9:00 AM To 10:00 PM",
    footerMessage1: '"Footer Message 1"',
    footerMessage2: '"Footer Message 2"',
    cdu: {
      enabled: true,
      comPort: "AUTO",
      baudRate: 9600,
      welcomeMessage: "Welcome Massage"
    }
  };
}

// Global CORS Handlers
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json());

// ==========================================
// 1. RECEIPT PRINT PATH INTERCEPTOR
// ==========================================
app.post('/PrinterService/ps/rptslip', (req, res) => {
  console.log('====== RECEIPT DATA CAPTURED ======');
  const data = req.body || {};
  const config = loadConfig();

  const storeContactDetails = [];
if (config.tel1 && config.tel1.trim()) storeContactDetails.push(`Tel: ${config.tel1.trim()}`);
if (config.tel2 && config.tel2.trim()) storeContactDetails.push(`Tel: ${config.tel2.trim()}`);
if (config.email1 && config.email1.trim()) storeContactDetails.push(`Email: ${config.email1.trim()}`);
if (config.email2 && config.email2.trim()) storeContactDetails.push(`Email: ${config.email2.trim()}`);

const contactHtmlLine = storeContactDetails.length > 0 
  ? `<span>${storeContactDetails.join(' | ')}</span><br/>` 
  : '';

  // Value Formatter Helpers
  const formatAmount = (num) =>
    Number(num || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const itemRows = (data.detailList || []).map(item => {
    const qty = parseInt(item.qty || 0);
    const unit = item.unit || 'Pcs';
    let stockName = (item.stock || '').trim();
    if (stockName.endsWith(';')) stockName = `${stockName.slice(0, -1)},`;
    
    const price = parseFloat(item.price || 0);
    const lineTotal = qty * price;
    const discount = Math.abs(parseFloat(item.discount || 0));

    let rowHtml = `
      <div class="item">
        <span class="qty">${qty} ${unit}</span>
        <span class="name">${stockName}</span>
        <span class="price">${formatAmount(lineTotal)}</span>
      </div>
    `;

    if (discount > 0) {
      rowHtml += `
        <div class="item" style="margin-top: -2px; font-weight: bold;">
          <span class="qty">&nbsp;</span>
          <span class="name" style="text-align: right; padding-right: 10px;">Discount:</span>
          <span class="price">-${formatAmount(discount)}</span>
        </div>
      `;
    }
    return rowHtml;
  }).join('');

  // Computations parsing
  const cashPayment = data.paymentDetail?.find(p => p.payAmount > 0) || { payType: "Cash", payAmount: data.netAmount || 0 };
  const taxLabel = data.isTaxIn === 0 ? "Total(Exclusive Tax)" : "Total(Inclusive Tax)";
  const itemDiscount = data.detailDisc || data.disAmount || 0;
  const paidAmount = cashPayment.payAmount || data.netAmount || 0;
  const changeAmount = data.paidAmount - (data.netAmount || 0);
  const totalQty = parseFloat(data.mainQty || 0).toFixed(1);

  // Exact target HTML using exact templates and styles for 80mm thermal printer formatting
  const companyHtml = config.companyName && String(config.companyName).trim()
    ? `<strong>${String(config.companyName).trim()}</strong><br/>`
    : '';
  const branchHtml = config.branchAddress && String(config.branchAddress).trim()
    ? `<span>${String(config.branchAddress).trim()}</span><br/>`
    : '';
  const operatingHtml = config.operatingHours && String(config.operatingHours).trim()
    ? `<span>${String(config.operatingHours).trim()}</span><br/>`
    : '';
  const footerHtml1 = config.footerMessage1 && String(config.footerMessage1).trim()
    ? `<div>${String(config.footerMessage1).trim()}</div>`
    : '';
  const footerHtml2 = config.footerMessage2 && String(config.footerMessage2).trim()
    ? `<div>${String(config.footerMessage2).trim()}</div>`
    : '';
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
    <style>
      @page { 
        size: 76mm auto; 
        margin: 0; 
      }
      html, body {
        margin: 0;
        padding: 0;
        width: 76mm;
        max-width: 76mm;
        background: #fff;
        color: #000;
        font-family: Arial, sans-serif;
        font-size: 12px;
        line-height: 1.4;
        -webkit-print-color-adjust: exact;
      }
      body {
        padding: 0 5mm 0 3mm;
        box-sizing: border-box;
      }

      .text-center { text-align: center; }
      .dashed-line { 
        border-top: 1px dashed #000; 
        margin: 5px 0; 
      }

      .row {
        display: flex;
        justify-content: space-between;
        margin: 2px 0;
      }
      .row span { flex: 1; }
      .row .label { flex: 0 0 25%; }
      .row .value { flex: 1; }

      .items { margin-top: 5px; }
      .item {
        display: flex;
        justify-content: space-between;
        margin: 2px 0;
      }
      .item .qty { flex: 0 0 15%; text-align: left; }
      .item .name { flex: 1; text-align: center; word-break: break-all; padding: 0 4px; }
      .item .price { flex: 0 0 25%; text-align: right; }

      .summary {
        margin-top: 5px;
      }
      .summary .line {
        display: flex;
        justify-content: space-between;
        margin: 2px 0;
      }
      .summary .line span { flex: 1; }
      .summary .line .label { text-align: center; }
      .summary .line .amount { text-align: right; }
    </style>
    </head>
    <body>
      <div class="text-center" style="margin-top: 10px;">
        ${companyHtml}
        ${branchHtml}
        ${contactHtmlLine}
        ${operatingHtml}
        <div style="margin: 3px 0; font-weight: bold;">CASH SALE</div>
      </div>

      <div class="row">
        <span class="label">SlipNo.</span>
        <span class="value">: ${data.slipNo || ''}</span>
        <span style="text-align: right;">${data.date || ''}</span>
        <span style="text-align: right; max-width: 65px;">${data.time || ''}</span>
      </div>
      <div class="row">
        <span class="label">Counter</span>
        <span class="value">: ${data.counter || ''}</span>
        <span>CashierID:</span>
        <span style="text-align: right;">${data.salesPerson1 || data.cashierId || ''}</span>
      </div>
      <div class="row"><span class="label">Name</span><span class="value">: ${data.custName || data.memberName || ''}</span></div>
      <div class="row"><span class="label">Card No.</span><span class="value">: ${data.cardNumber || data.memberId || ''}</span></div>
      <div class="row"><span class="label">Earn Point</span><span class="value">: ${formatAmount(data.localEarnPoint)}</span></div>
      <div class="row"><span class="label">Use Point</span><span class="value">: ${formatAmount(data.localRedeemPoint)}</span></div>
      <div class="row"><span class="label">Remark</span><span class="value">: ${data.remark || ''}</span></div>

      <div class="items">
        <div class="item" style="font-weight: bold;">
          <span class="qty">Qty</span>
          <span class="name"><div class="dashed-line" style="margin: 7px 0 0 0;"></div></span>
          <span class="price">Ks</span>
        </div>
        
        ${itemRows}
      </div>

      <div class="dashed-line"></div>

      <div class="summary">
        <div class="line">
         <span class="qty" style="text-align: left;">${totalQty}</span>
          <span class="label">${taxLabel}</span>
          <span class="amount">Ks ${formatAmount(data.totalAmount)}</span>
        </div>
        ${itemDiscount > 0 ? `
        <div class="line">
          <span class="label" style=" text-align: left; padding-left: 40px;">Item Discount</span>
          <span class="amount">-${formatAmount(itemDiscount)}</span>
        </div>` : ''}
      </div>

      <div class="dashed-line"></div>

      <div class="summary">
        <div class="line">
          <span class="label" style="font-weight: bold; text-align: left; padding-left: 40px;">Net Amount</span>
          <span class="amount" style="font-weight: bold;">Ks ${formatAmount(data.netAmount)}</span>
        </div>
      </div>

      <div class="dashed-line"></div>

      <div class="summary">
        <div class="line">
          <span class="label" style="font-weight: bold; text-align: left; padding-left: 40px;">Paid By : ${cashPayment.payType || 'Cash'}</span>
          <span class="amount" style="font-weight: bold;">Ks ${formatAmount(paidAmount)}</span>
        </div>
      </div>
      ${changeAmount > 0 ? `
      <div class="summary">
        <div class="line">
          <span class="label" style="font-weight: bold; text-align: left; padding-left: 40px;">Change</span>
          <span class="amount" style="font-weight: bold;">Ks ${formatAmount(Math.abs(changeAmount))}</span>
        </div>
      </div>` : ''}

      <div class="dashed-line"></div>

      <br/>
      <div class="text-center" style="margin-bottom: 10px;">
        ${footerHtml1}
        ${footerHtml2}
      </div>
    </body>
    </html>
  `;

  if (global.printHTMLReceipt) {
    global.printHTMLReceipt(htmlContent, config.printerName);
    res.status(200).json({ status: "success", message: "Receipt sent to printer" });
  } else {
    console.error("Printer binding not available.");
    res.status(500).json({ status: "error", message: "Failed to send receipt to printer" });
  }
});

// ==========================================
// 2. POLE CDU INTERCEPT WORKFLOW RECEIVER (Fixed for String Numbers with Commas)
// ==========================================
app.post('/PrinterService/ps/sendCDUData', (req, res) => {
  const timestamp = new Date().toISOString();
  const data = req.body || {};
  const config = loadConfig();
  const defaultGreeting = config.cdu?.welcomeMessage || "Thank you for coming";
  
  let displayOutput = "";

  // Clear any existing idle-return clocks running in the background
  if (idleResetTimeout) {
    clearTimeout(idleResetTimeout);
    idleResetTimeout = null;
  }

  // Helper function to safely clean up strings containing commas before parsing to a number
  const parsePayloadAmount = (val) => {
    if (val === undefined || val === null) return 0;
    // If it's a string, strip out all commas before converting to a number
    if (typeof val === 'string') {
      return parseFloat(val.replace(/,/g, '')) || 0;
    }
    return parseFloat(val) || 0;
  };

  // A. ITEM SCAN MODE (Type 2: shows running subtotal with discounts applied)
  if (data.type === 2) {
    currentCduState.mode = "TRANSACTION";
    const rawAmount = data.total !== undefined ? data.total : (data.price || 0);
    const cleanNumber = parsePayloadAmount(rawAmount);
    
    currentCduState.amount = cleanNumber.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    displayOutput = `Amount: Ks ${currentCduState.amount}`;
  } 
  
  // B. SLIP SAVE MODE (Type 3: holds final grand calculation total)
  else if (data.type === 3) {
    currentCduState.mode = "TRANSACTION";
    const cleanNumber = parsePayloadAmount(data.total);
    
    currentCduState.amount = cleanNumber.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    displayOutput = `Total Amount: Ks ${currentCduState.amount}`;
  } 
  
  // C. SLIP PRINTING / RESET IDLE MODE (Type 1: triggers Thank You, then defaults)
  else {
    currentCduState.mode = "THANKYOU";
    currentCduState.amount = "0.00";
    displayOutput = "Thank You!";

    // Start a 5-second countdown to revert the screen back to the Configured message
    idleResetTimeout = setTimeout(() => {
      currentCduState.mode = "WELCOME";
      console.log(`[CDU] Screen reset to config statement: "${defaultGreeting}"`);
      
      if (global.writeToCDU) {
        global.writeToCDU(defaultGreeting.substring(0, 40));
      }
    }, 5000);
  }

  // Write event blocks to your text logging tracks
  const formattedLogEntry = `[${timestamp}] [CDU RUN] ${displayOutput}\n`;
  fs.appendFile(cduLogPath, formattedLogEntry, 'utf8', (err) => {
    if (err) console.error("Failed to write CDU data to log file:", err);
  });

  // Relay strings straight to your physical main process drivers
  if (global.writeToCDU) {
    if (currentCduState.mode === "THANKYOU") {
      global.writeToCDU("     THANK YOU      \n    COME AGAIN!     ");
    } else if (currentCduState.mode === "TRANSACTION") {
      global.writeToCDU(`TOTAL AMOUNT:       \nKs ${currentCduState.amount}`);
    }
  }

  res.status(200).json({ status: "success" });
});

function startServer() {
  const config = loadConfig();
  // MUST return the app.listen instance so Electron can call .close() on it
  return app.listen(config.port, '0.0.0.0', () => {
    console.log(`Express engine running on port: ${config.port}`);
  });
}

module.exports = { startServer };