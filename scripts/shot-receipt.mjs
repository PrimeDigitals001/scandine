/** Render a representative print receipt and screenshot it (visual check). */
import { chromium } from "playwright";

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: 80mm auto; margin: 4mm; }
* { box-sizing: border-box; }
body { width: 72mm; margin: 0 auto; font-family: ui-monospace,"Courier New",monospace; color:#000; font-size:12px; line-height:1.45; background:#fff; padding:10px; }
.c { text-align:center; } .name { font-size:15px; font-weight:700; } .muted { color:#222; font-size:11px; }
hr { border:none; border-top:1px dashed #000; margin:6px 0; }
table { width:100%; border-collapse:collapse; }
td.q { width:30px; vertical-align:top; } td.n { vertical-align:top; padding-right:6px; word-break:break-word; }
td.a { text-align:right; white-space:nowrap; vertical-align:top; }
.row { display:flex; justify-content:space-between; } .tot { font-weight:700; font-size:14px; }
.pay { text-align:center; font-weight:700; margin-top:6px; text-transform:capitalize; }
.foot { text-align:center; margin-top:10px; font-size:11px; }
</style></head><body>
<div class="c name">Friends &amp; Fries Café</div>
<div class="c muted">12 MG Road, Bengaluru</div>
<div class="c muted">GSTIN: 29ABCDE1234F1Z5</div>
<hr>
<div class="row"><span>Table T1</span><span>7 Jun 2026, 8:42 pm</span></div>
<hr>
<table>
<tr><td class="q">2×</td><td class="n">Kullad Masala Chai</td><td class="a">₹80.00</td></tr>
<tr><td class="q">1×</td><td class="n">Nutella Brownie (Large)</td><td class="a">₹180.00</td></tr>
<tr><td class="q">1×</td><td class="n">Peri Peri Fries</td><td class="a">₹140.00</td></tr>
</table>
<hr>
<div class="row"><span>Item total</span><span>₹400.00</span></div>
<div class="row"><span>SGST (2.5%)</span><span>₹10.00</span></div>
<div class="row"><span>CGST (2.5%)</span><span>₹10.00</span></div>
<div class="row"><span>Discount</span><span>− ₹20.00</span></div>
<hr>
<div class="row tot"><span>TOTAL</span><span>₹400.00</span></div>
<div class="pay">Paid via upi</div>
<div class="foot">Thank you! Please visit again.<br>Powered by ScanDine</div>
</body></html>`;

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 320, height: 560 } });
await p.setContent(html, { waitUntil: "load" });
await p.screenshot({ path: "shot-receipt.png", fullPage: true });
await b.close();
console.log("saved shot-receipt.png");
