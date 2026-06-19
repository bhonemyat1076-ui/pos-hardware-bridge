const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const configPath = path.join(__dirname, 'config.json');

function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (e) {
    console.error("Config missing or malformed, loading defaults");
  }
  return {
    port: 8080,
    printerName: "POS80 Printer",
    companyName: "Million Mart",
    branchAddress: "No.12, 62th Street, Corner of 104th St, Chan Mya Thar Si, Mandalay.",
    operatingHours: "Open Daily : 9:00 AM To 10:00 PM",
    footerMessage1: '"Thank You"',
    footerMessage2: '"Items sold are not returnable"'
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

// Intercept the receipt print path
app.post('/PrinterService/ps/rptslip', (req, res) => {
  console.log('====== RECEIPT DATA CAPTURED ======');
  const data = req.body || {};
  const config = loadConfig();

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
        <span class="qty">${qty}</span>
        <span class="name">${unit} ${stockName}</span>
        <span class="price">${formatAmount(lineTotal)}</span>
      </div>
    `;

    // Append item-specific markdown lines if any are present
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
  const totalQty = parseFloat(data.mainQty || 0).toFixed(1);

  // Exact target HTML using your exact classes and structural distribution rules
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
        <strong>${config.companyName}</strong><br/>
        <span>${config.branchAddress}</span><br/><br/>
        <span>${config.operatingHours}</span><br/>
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
          <span>${totalQty}</span>
          <span class="label">${taxLabel}</span>
          <span class="amount">Ks ${formatAmount(data.totalAmount)}</span>
        </div>
        ${itemDiscount > 0 ? `
        <div class="line">
          <span>&nbsp;</span>
          <span class="label">Item Discount</span>
          <span class="amount">-${formatAmount(itemDiscount)}</span>
        </div>` : ''}
      </div>

      <div class="dashed-line"></div>

      <div class="summary">
        <div class="line">
          <span>&nbsp;</span>
          <span class="label" style="font-weight: bold; text-align: left; padding-left: 35px;">Net Amount</span>
          <span class="amount" style="font-weight: bold;">Ks ${formatAmount(data.netAmount)}</span>
        </div>
      </div>

      <div class="dashed-line"></div>

      <div class="summary">
        <div class="line">
          <span>&nbsp;</span>
          <span class="label" style="font-weight: bold; text-align: left; padding-left: 35px;">Paid By : ${cashPayment.payType || 'Cash'}</span>
          <span class="amount" style="font-weight: bold;">Ks ${formatAmount(paidAmount)}</span>
        </div>
      </div>

      <div class="dashed-line"></div>

      <br/>
      <div class="text-center" style="margin-bottom: 10px;">
        ${config.footerMessage1}<br/>
        ${config.footerMessage2}
      </div>
    </body>
    </html>
  `;

  // Safe background dispatch to Electron container layout pipeline
  if (global.printHTMLReceipt) {
    global.printHTMLReceipt(htmlContent, config.printerName);
    res.status(200).json({ status: "success", message: "Receipt pipeline executed" });
  } else {
    console.error("Printer binding not available.");
    res.status(500).json({ status: "error", message: "Core hardware handler connection failed" });
  }
});

// Pole CDU data intercept receiver loop
app.post('/PrinterService/ps/sendCDUData', (req, res) => {
  res.status(200).json({ status: "success" });
});

// Fallback listener
app.use((req, res) => { res.status(200).send("Bridge Layer Awake"); });

function startServer() {
  const config = loadConfig();
  app.listen(config.port, '0.0.0.0', () => {
    console.log(`Express engine running on hardware endpoint configuration port: ${config.port}`);
  });
}

module.exports = { startServer };