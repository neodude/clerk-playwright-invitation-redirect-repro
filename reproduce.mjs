import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:https";
import { chromium } from "@playwright/test";
import { setupClerkTestingToken } from "@clerk/testing/playwright";

const tls = { key: readFileSync("key.pem"), cert: readFileSync("cert.pem") };
const requests = [];
let consumed = false;
const singleUse = process.argv.includes("--single-use");
async function serve(name, handler) {
  const server = createServer(tls, (req, res) => {
    const path = new URL(req.url, "https://localhost").pathname;
    requests.push(name + path);
    handler(path, res);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return { server, origin: "https://127.0.0.1:" + server.address().port };
}
const app = await serve("app", (path, res) => {
  if (path === "/invitation/sign-up") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end('<h1>Invitation</h1><script src="/invite.js"></script>');
  } else if (path === "/invite.js") {
    res.writeHead(200, { "Content-Type": "text/javascript" });
    res.end("window.invitationReady = true;");
  } else res.writeHead(404).end();
});
const fapi = await serve("fapi", (path, res) => {
  if (path === "/v1/tickets/accept") {
    if (singleUse && consumed) {
      res.writeHead(410, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "Ticket already used" }));
      return;
    }
    consumed = true;
    res.writeHead(303, { Location: app.origin + "/invitation/sign-up" }).end();
  } else res.writeHead(404).end();
});
let browser;
try {
  process.env.CLERK_TESTING_TOKEN = "fixture-only";
  browser = await chromium.launch({ channel: "chrome" });
  console.log("Chrome", browser.version(), "Node", process.version);
  for (const useHelper of [false, true]) {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    try {
      if (useHelper) await setupClerkTestingToken({
        context, options: { frontendApiUrl: new URL(fapi.origin).host }
      });
      requests.length = 0;
      consumed = false;
      const page = await context.newPage();
      const entry = fapi.origin + "/v1/tickets/accept";
      const response = await page.goto(entry);
      const status = response.status();
      const heading = await page.locator("h1").allTextContents();
      const scriptLoaded = await page.evaluate(() => window.invitationReady === true);
      const finalUrl = page.url();
      console.log(JSON.stringify({ useHelper, status, heading, finalUrl, scriptLoaded, requests }));
      // The expected browser behavior is identical in both contexts.
      assert.equal(finalUrl, app.origin + "/invitation/sign-up");
      assert.equal(scriptLoaded, true);
      assert.equal(requests.filter(r => r === "fapi/v1/tickets/accept").length, 1);
    } finally { await context.close(); }
  }
} finally {
  await browser?.close();
  for (const { server } of [fapi, app]) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}
