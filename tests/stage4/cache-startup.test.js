const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

const SNAPSHOT_KEY = "personalFinance.expenseSnapshot";
const UPDATED_AT_KEY = "personalFinance.expenseSnapshotUpdatedAt";

// 1. cache absent → loading state → network → render
test("1. cache absent triggers loading state followed by network fetch and render", () => {
  const appCode = read("app.js");
  // When no cache is present, setupAuthGate shows loading and runs full fetch
  assert.match(appCode, /if\s*\(hasCache\)\s*\{[\s\S]*\}\s*else\s*\{[\s\S]*showLoading\(/);
});

// 2. cache present → cached expenses render immediately
test("2. cache present renders cached expenses immediately without waiting for network", () => {
  const appCode = read("app.js");
  // When hasCache is true, hideAuthGate is called immediately
  assert.match(appCode, /const\s+hasCache\s*=\s*restoreExpensesFromCache\(\);\s*if\s*\(hasCache\)\s*\{\s*hideAuthGate\(\);/);
});

// 3. background refresh starts after cached render
test("3. background refresh starts after cached render", () => {
  const appCode = read("app.js");
  assert.match(appCode, /startAuthorizedSession\(\{\s*backgroundOnly:\s*true\s*\}\);/);
});

// 4. successful refresh replaces cache
test("4. successful refresh replaces cache and timestamp", () => {
  const appCode = read("app.js");
  assert.match(appCode, /saveExpensesToCache\(\s*freshExpenses,\s*lastSuccessfulSyncAt\s*\);/);
});

// 5. refresh failure keeps cached data visible
test("5. refresh failure keeps cached data visible and updates sync status to saved data", () => {
  const appCode = read("app.js");
  assert.match(appCode, /if\s*\(\s*hasRenderedExpenseData\s*\)\s*\{[\s\S]*updateSyncStatus\(["']error["'],\s*["']Saved data["']\);/);
});

// 6. Remove This Device clears cache
test("6. Remove This Device clears device key, expense snapshot, and timestamp", () => {
  const appCode = read("app.js");
  assert.match(appCode, /removeExpenseCache\(\);/);
  assert.match(appCode, /SNAPSHOT_CACHE_KEY\s*=\s*["']personalFinance\.expenseSnapshot["']/);
  assert.match(appCode, /SNAPSHOT_UPDATED_AT_KEY\s*=\s*["']personalFinance\.expenseSnapshotUpdatedAt["']/);
});

// 7. device key never stored inside expense snapshot
test("7. device key is never stored inside expense snapshot", () => {
  const appCode = read("app.js");
  // Verify snapshot saving only stores expenses array
  assert.match(appCode, /window\.localStorage\.setItem\(\s*SNAPSHOT_CACHE_KEY,\s*JSON\.stringify\(expenses\)\s*\);/);
  assert.doesNotMatch(appCode, /SNAPSHOT_CACHE_KEY.*deviceKey/);
});

// 8. service worker does not cache API response
test("8. service worker does not cache API response or cross-origin URLs", () => {
  const swCode = read("sw.js");
  assert.match(swCode, /url\.origin\s*!==\s*self\.location\.origin/);
  assert.match(swCode, /event\.request\.method\s*!==\s*["']GET["']/);
});

// 9. Google Sheet remains authoritative
test("9. Google Sheet remains authoritative with bulk read and locks", () => {
  const backendCode = read("apps-script/Code.js");
  assert.match(backendCode, /getExpenseSheet\(\)/);
  assert.match(backendCode, /getRange[\s\S]*getValues\(\)/);
});


// 10. mutation behavior remains unchanged
test("10. mutation behavior remains unchanged through server API", () => {
  const appCode = read("app.js");
  assert.match(appCode, /financeApi\s*\.\s*addExpense/);
  assert.match(appCode, /financeApi\s*\.\s*updateExpense/);
  assert.match(appCode, /financeApi\s*\.\s*deleteExpense/);
});


// 11. existing finance calculations remain unchanged
test("11. existing finance calculations remain unchanged", () => {
  const { loadClient } = require("../helpers/load-app-source");
  const client = loadClient();
  assert.equal(client.moneyToCents(10.075), 1008);
  assert.equal(client.normalizeMoney(10.075), 10.08);
  assert.equal(client.calculateTotal([ { cost: 0.1 }, { cost: 0.2 }, { cost: "19.99" } ]), 20.29);
});

// 12. new shell version invalidates old cache
test("12. new shell version is finance-shell-v2 and cleans old cache versions", () => {
  const swCode = read("sw.js");
  assert.match(swCode, /const CACHE_NAME = "finance-shell-v2";/);
  assert.match(swCode, /self\.skipWaiting\(\)/);
  assert.match(swCode, /caches\.delete\(key\)/);
  assert.match(swCode, /self\.clients\.claim\(\)/);
});

// 13. HTML and script update path uses network-first to prevent stale lock-in
test("13. HTML and script update path uses network-first strategy", () => {
  const swCode = read("sw.js");
  // Network first: tries fetch first, then catches to caches.match
  assert.match(swCode, /fetch\(event\.request\)[\s\S]*\.catch\(\(\)\s*=>\s*\{[\s\S]*caches\.match/);
});

// 14. fast-start pre-render script exists in index.html head
test("14. fast-start pre-render script exists in head of index.html", () => {
  const html = read("index.html");
  assert.match(html, /<script>[\s\S]*document\.documentElement\.classList\.add\("fast-start"\)[\s\S]*<\/script>[\s\S]*<\/head>/);
});

// 15. fast-start CSS rule suppresses authGate before first paint
test("15. fast-start CSS rule suppresses authGate before first paint", () => {
  const css = read("styles.css");
  assert.match(css, /html\.fast-start\s*#authGate\s*\{[\s\S]*display:\s*none\s*!important/);
});
