import { chromium } from "playwright";

const b = await chromium.launch();
const shots = [
  { url: "http://localhost:3000/court/court-demo", name: "court-list", wait: "ScanDine Food Court" },
  { url: "http://localhost:3000/court/court-demo/friends-fries-cafe", name: "court-menu", wait: "Friends & Fries" },
];
for (const w of [390, 1280]) {
  for (const s of shots) {
    const p = await b.newPage({ viewport: { width: w, height: 900 } });
    await p.goto(s.url, { waitUntil: "networkidle" });
    try {
      await p.getByText(s.wait).first().waitFor({ timeout: 8000 });
    } catch {
      /* still screenshot */
    }
    await p.screenshot({ path: `shot-${s.name}-${w}.png` });
    await p.close();
    console.log(`shot-${s.name}-${w}.png`);
  }
}
await b.close();
