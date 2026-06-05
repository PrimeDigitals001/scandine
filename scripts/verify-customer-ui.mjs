/**
 * ScanDine — Customer PWA *interaction* test in a real headless browser.
 * Clicks the actual buttons a customer taps, at BOTH a phone and a desktop
 * viewport, and checks the desktop layout is multi-column (responsive).
 * Requires `npm run dev` running.
 *
 * Run:  node scripts/verify-customer-ui.mjs
 */
import { chromium, webkit } from "playwright";

const ENGINE = process.env.ENGINE === "webkit" ? webkit : chromium;
const ENGINE_NAME = process.env.ENGINE === "webkit" ? "WebKit/Safari" : "Chromium";
const BASE = process.env.BASE ?? "http://localhost:3000";
let pass = 0;
let fail = 0;
const ok = (name, cond, detail = "") => {
  console.log(`${cond ? "✅" : "❌"}  ${name}${detail ? `  —  ${detail}` : ""}`);
  if (cond) pass++;
  else fail++;
};

console.log(`Engine: ${ENGINE_NAME} · ${BASE}`);
const browser = await ENGINE.launch();

async function runFlow(label, viewport, expectTwoCols) {
  console.log(`\n— ${label} (${viewport.width}×${viewport.height}) —`);
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));

  const clickAddFor = async (name) => {
    const heading = page.getByRole("heading", { name, exact: true });
    await heading.waitFor({ timeout: 15000 });
    const card = heading.locator(
      'xpath=ancestor::div[contains(@class,"rounded-card")][1]',
    );
    await card.getByRole("button", { name: "Add" }).click();
  };

  try {
    await page.goto(`${BASE}/order/demo`, { waitUntil: "domcontentloaded" });
    await page.getByText("Friends & Fries Café").waitFor({ timeout: 20000 });

    // bottom tab bar present + the "Order" tab navigates to the tracker
    const tabsOk =
      (await page.getByRole("link", { name: "Order" }).first().isVisible()) &&
      (await page.getByRole("link", { name: "Bill" }).first().isVisible());
    await page.getByRole("link", { name: "Order" }).first().click();
    await page.waitForURL("**/status", { timeout: 10000 });
    ok(`${label}: tab bar navigates Menu→Order`, tabsOk && page.url().includes("/status"));
    await page.goBack();
    await page.getByText("Friends & Fries Café").waitFor({ timeout: 10000 });

    // responsive: first two item cards side-by-side on desktop, stacked on phone
    const h = page.getByRole("heading", { level: 3 });
    const box0 = await h
      .nth(0)
      .locator('xpath=ancestor::div[contains(@class,"rounded-card")][1]')
      .boundingBox();
    const box1 = await h
      .nth(1)
      .locator('xpath=ancestor::div[contains(@class,"rounded-card")][1]')
      .boundingBox();
    const sideBySide =
      box1.x > box0.x + box0.width * 0.5 &&
      Math.abs(box1.y - box0.y) < box0.height;
    ok(
      `${label}: layout is ${expectTwoCols ? "multi-column" : "single-column"}`,
      sideBySide === expectTwoCols,
      `card2 ${sideBySide ? "beside" : "below"} card1`,
    );

    // quick-add → cart appears (bottom bar on mobile, sidebar on desktop)
    await clickAddFor("Cinnamon Roll");
    const cartCta = page
      .getByRole("link", { name: expectTwoCols ? /Review/ : /View cart/ })
      .first();
    let cartBar = false;
    try {
      await cartCta.waitFor({ state: "visible", timeout: 8000 });
      cartBar = true;
    } catch {}
    ok(
      `${label}: Add reveals the cart (${expectTwoCols ? "sidebar" : "bottom bar"})`,
      cartBar,
    );

    // customise sheet
    await clickAddFor("Kullad Masala Chai");
    let sheet = false;
    try {
      await page.getByText("Choose one").waitFor({ state: "visible", timeout: 6000 });
      sheet = true;
    } catch {}
    ok(`${label}: customisable item opens the sheet`, sheet);
    if (sheet) {
      await page.getByRole("button", { name: /^Add ·/ }).click();
      await page.waitForTimeout(400);
    }

    // go to cart, place-order button present
    await cartCta.click();
    await page.waitForURL("**/cart", { timeout: 12000 });
    let cartPage = false;
    try {
      // "Place order" normally, or "Add to order" when the table has an active order
      await page
        .getByRole("button", { name: /Place order|Add to order/ })
        .waitFor({ timeout: 15000 });
      cartPage = true;
    } catch {}
    ok(`${label}: cart opens with a place/add-order button`, cartPage);
    ok(`${label}: cart lists the added item`, await page.getByText("Cinnamon Roll").isVisible());

    ok(`${label}: no console/page errors`, errors.length === 0, errors.slice(0, 2).join(" | "));
  } catch (e) {
    ok(`${label}: flow crashed`, false, e.message);
  } finally {
    await page.close();
  }
}

// warm /cart so dev compile time doesn't skew the first run
await fetch(`${BASE}/order/demo/cart`).catch(() => {});

await runFlow("phone", { width: 390, height: 844 }, false);
await runFlow("desktop", { width: 1440, height: 900 }, true);

await browser.close();
console.log(`\n${fail === 0 ? "🎉" : "⚠️ "} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
