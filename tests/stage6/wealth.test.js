const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

function loadBackendContext(mockSheetData = {}) {
  const code = read("apps-script/Code.js");
  const propertiesStore = {
    PRODUCTION_SPREADSHEET_ID: "mock-prod-id",
    PERSONAL_APP_DEVICE_KEY: "a".repeat(64)
  };

  const defaultRow14 = [
    12500.50, // H14: Available Cash
    45000.00, // I14: TFSA
    16000.00, // J14: FHSA
    25000.00, // K14: RRSP
    5200.00,  // L14: Crypto
    86000.00, // M14: Total Invested
    3000.00,  // N14: Tax Reserve
    2500.00,  // O14: Income Tax / CPP Reserve
    10000.00  // P14: Emergency Fund
  ];

  const defaultTotalCash = 28000.50; // I29

  const defaultAccountRows = [
    ["BMO Chequing", 5000.00],
    ["EQ Bank Savings", 15000.50],
    ["Emergency HISA", 8000.00],
    ["Wealthsimple TFSA", 45000.00],
    ["Questrade FHSA", 16000.00],
    ["Wealthsimple RRSP", 25000.00],
    ["Coinbase Crypto", 5200.00],
    ["", 0]
  ];

  const row14 = mockSheetData.row14 || defaultRow14;
  const totalCash = mockSheetData.totalCash !== undefined ? mockSheetData.totalCash : defaultTotalCash;
  const accountRows = mockSheetData.accountRows || defaultAccountRows;

  const mockWealthSheet = {
    name: "2026-Budgets",
    getRange(rangeStr) {
      if (rangeStr === "H14:P14") {
        return {
          getValues() {
            return [row14];
          }
        };
      }
      if (rangeStr === "I29") {
        return {
          getValue() {
            return totalCash;
          }
        };
      }
      if (rangeStr === "H17:I28") {
        return {
          getValues() {
            return accountRows;
          },
          getFormulas() {
            return accountRows.map(() => ["", ""]);
          }
        };
      }
      if (rangeStr === "H14") {
        return { getValue: () => row14[0], getFormula: () => "=I29-P14-N14-O14" };
      }
      if (rangeStr === "N10") {
        return { getValue: () => 0, getFormula: () => "" };
      }
      if (rangeStr === "O10") {
        return { getValue: () => 0, getFormula: () => "" };
      }
      if (rangeStr === "N14") {
        return { getValue: () => row14[6], getFormula: () => "=SUM(N2:N13)" };
      }
      if (rangeStr === "O14") {
        return { getValue: () => row14[7], getFormula: () => "=SUM(O2:O13)" };
      }
      if (rangeStr === "P14") {
        return { getValue: () => row14[8], getFormula: () => "" };
      }
      throw new Error("Unexpected range: " + rangeStr);
    }
  };

  const mockSpreadsheet = {
    id: "mock-prod-id",
    getSheetByName(name) {
      if (name === "2026-Budgets") return mockWealthSheet;
      if (name === "Spending_Master2026") return { name };
      return null;
    }
  };

  const context = {
    PropertiesService: {
      getScriptProperties() {
        return {
          getProperty(k) {
            return propertiesStore[k] || null;
          }
        };
      }
    },
    SpreadsheetApp: {
      openById() {
        return mockSpreadsheet;
      }
    },
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput(content) {
        return {
          content,
          setMimeType(m) {
            this.mimeType = m;
            return this;
          }
        };
      }
    },
    HtmlService: {
      createTemplateFromFile() {
        return {
          evaluate() {
            return {
              setTitle() { return this; },
              setFaviconUrl() { return this; },
              addMetaTag() { return this; }
            };
          }
        };
      }
    }
  };

  const vm = require("node:vm");
  vm.createContext(context);
  vm.runInContext(code, context);
  return context;
}

// 1. Backend getWealth reads exact cells from 2026-Budgets
test("1. backend getWealth reads exact cells from 2026-Budgets", () => {
  const ctx = loadBackendContext();
  const wealth = ctx.getWealth();

  assert.equal(wealth.availableCash, 12500.50);
  assert.equal(wealth.tfsa, 45000.00);
  assert.equal(wealth.fhsa, 16000.00);
  assert.equal(wealth.rrsp, 25000.00);
  assert.equal(wealth.crypto, 5200.00);
  assert.equal(wealth.totalInvested, 86000.00);
  assert.equal(wealth.taxReserve, 3000.00);
  assert.equal(wealth.incomeTaxCppReserve, 2500.00);
  assert.equal(wealth.emergencyFund, 10000.00);
  assert.equal(wealth.totalCash, 28000.50);
  assert.ok(Array.isArray(wealth.accounts));
  assert.equal(wealth.accounts.length, 7); // ignores empty row
});

// 2. Account rows are categorized into cash and investment
test("2. account rows are categorized into cash and investment", () => {
  const ctx = loadBackendContext();
  const wealth = ctx.getWealth();

  const chequing = wealth.accounts.find(a => a.name === "BMO Chequing");
  assert.ok(chequing);
  assert.equal(chequing.type, "cash");

  const tfsa = wealth.accounts.find(a => a.name === "Wealthsimple TFSA");
  assert.ok(tfsa);
  assert.equal(tfsa.type, "investment");
});

// 3. apiRequest exposes getWealth action
test("3. apiRequest exposes getWealth action", () => {
  const ctx = loadBackendContext();
  const res = ctx.apiRequest({ action: "getWealth", payload: {} });
  assert.equal(res.ok, true);
  assert.ok(res.wealth);
  assert.equal(res.wealth.availableCash, 12500.50);
});

// 4. api.js contains getWealth in ALLOWED_ACTIONS and exposes financeApi.getWealth
test("4. api.js contains getWealth in ALLOWED_ACTIONS and exposes financeApi.getWealth", () => {
  const apiCode = read("api.js");
  assert.match(apiCode, /"getWealth"/);
  assert.match(apiCode, /async function getWealth\(\)/);
  assert.match(apiCode, /getWealth,/);
});

// 5. index.html contains segmented control inside insightsView
test("5. index.html contains segmented control: Spending | Wealth", () => {
  const html = read("index.html");
  assert.match(html, /id="tabSpending"/);
  assert.match(html, /id="tabWealth"/);
  assert.match(html, /id="spendingSubView"/);
  assert.match(html, /id="wealthSubView"/);
});

// 6. index.html contains hero card with Available Cash and supporting text
test("6. index.html contains hero card with Available Cash and supporting text", () => {
  const html = read("index.html");
  assert.match(html, /id="wealthAvailableCash"/);
  assert.match(html, /AVAILABLE CASH/);
  assert.match(html, /Cash available after protected reserves/);
});

// 7. index.html contains Cash Position and visual arithmetic relationship
test("7. index.html contains Cash Position and visual arithmetic relationship", () => {
  const html = read("index.html");
  assert.match(html, /id="wealthTotalCash"/);
  assert.match(html, /id="wealthTaxReserve"/);
  assert.match(html, /id="wealthIncomeTaxCpp"/);
  assert.match(html, /id="wealthEmergencyFund"/);
  assert.match(html, /id="wealthMathTotalCash"/);
  assert.match(html, /id="wealthMathReserves"/);
  assert.match(html, /id="wealthMathAvailable"/);
});

// 8. index.html contains Investments and separate Crypto section
test("8. index.html contains Investments and separate Crypto section", () => {
  const html = read("index.html");
  assert.match(html, /id="wealthTotalInvested"/);
  assert.match(html, /id="wealthTfsa"/);
  assert.match(html, /id="wealthFhsa"/);
  assert.match(html, /id="wealthRrsp"/);
  assert.match(html, /id="wealthCrypto"/);
  assert.match(html, /wealth-crypto-card/);
});

// 9. index.html contains expandable Accounts accordion
test("9. index.html contains expandable Accounts accordion", () => {
  const html = read("index.html");
  assert.match(html, /id="wealthAccountsAccordion"/);
  assert.match(html, /id="wealthCashAccountsList"/);
  assert.match(html, /id="wealthInvestAccountsList"/);
  assert.match(html, /id="wealthAccountsCount"/);
});

// 10. app.js handles tab switching, caching, and clear on device removal
test("10. app.js handles tab switching, caching, and clear on device removal", () => {
  const appCode = read("app.js");
  assert.match(appCode, /setInsightsSubView/);
  assert.match(appCode, /fetchWealthData/);
  assert.match(appCode, /restoreWealthFromCache/);
  assert.match(appCode, /saveWealthToCache/);
  assert.match(appCode, /removeWealthCache/);
  assert.match(appCode, /renderWealthView/);
  assert.match(appCode, /personalFinance\.wealthSnapshot/);
});

// 11. doGet rejects unauthenticated action=getWealth query and returns Unauthorized
test("11. doGet rejects unauthenticated action=getWealth query and returns Unauthorized", () => {
  const ctx = loadBackendContext();
  const res = ctx.doGet({ parameter: { action: "getWealth" } });
  assert.ok(res);
  assert.ok(res.content);
  const parsed = JSON.parse(res.content);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.error, "Unauthorized");
  assert.equal(parsed.wealth, undefined);
});

// 12. doGet rejects unauthenticated action=getExpenses query and returns Unauthorized
test("12. doGet rejects unauthenticated action=getExpenses query and returns Unauthorized", () => {
  const ctx = loadBackendContext();
  const res = ctx.doGet({ parameter: { action: "getExpenses" } });
  assert.ok(res);
  assert.ok(res.content);
  const parsed = JSON.parse(res.content);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.error, "Unauthorized");
  assert.equal(parsed.expenses, undefined);
});

// 13. doPost with valid device key and getWealth returns wealth data
test("13. doPost with valid device key and getWealth returns wealth data", () => {
  const ctx = loadBackendContext();
  const validKey = "a".repeat(64);
  const res = ctx.doPost({
    postData: {
      contents: JSON.stringify({
        deviceKey: validKey,
        action: "getWealth",
        payload: {}
      })
    }
  });
  assert.ok(res);
  assert.ok(res.content);
  const parsed = JSON.parse(res.content);
  assert.equal(parsed.ok, true);
  assert.ok(parsed.wealth);
  assert.equal(parsed.wealth.availableCash, 12500.50);
});

// 14. doPost without device key or invalid device key returns Unauthorized
test("14. doPost without device key or invalid device key returns Unauthorized", () => {
  const ctx = loadBackendContext();

  // Missing key
  const missingRes = ctx.doPost({
    postData: {
      contents: JSON.stringify({
        action: "getWealth",
        payload: {}
      })
    }
  });
  const parsedMissing = JSON.parse(missingRes.content);
  assert.equal(parsedMissing.ok, false);
  assert.equal(parsedMissing.error, "Unauthorized");

  // Invalid key
  const invalidRes = ctx.doPost({
    postData: {
      contents: JSON.stringify({
        deviceKey: "b".repeat(64),
        action: "getWealth",
        payload: {}
      })
    }
  });
  const parsedInvalid = JSON.parse(invalidRes.content);
  assert.equal(parsedInvalid.ok, false);
  assert.equal(parsedInvalid.error, "Unauthorized");
});

// 15. index.html contains editable-crypto-card and wealthCryptoCard
test("15. index.html contains editable-crypto-card and wealthCryptoCard", () => {
  const html = read("index.html");
  assert.match(html, /editable-crypto-card/);
  assert.match(html, /id="wealthCryptoCard"/);
  assert.match(html, /wealth-account-chevron/);
});

// 16. styles.css contains interactive styles for .editable-crypto-card
test("16. styles.css contains interactive styles for .editable-crypto-card", () => {
  const css = read("styles.css");
  assert.match(css, /\.editable-crypto-card\s*\{[^}]*cursor:\s*pointer/);
  assert.match(css, /\.editable-crypto-card:active\s*\{[^}]*transform:\s*scale\(0\.985\)/);
});

// 17. app.js handles crypto in openWealthBalanceEditor and setupWealthAccountsDelegation
test("17. app.js handles crypto in openWealthBalanceEditor and setupWealthAccountsDelegation", () => {
  const appJs = read("app.js");
  assert.ok(appJs.includes('openWealthBalanceEditor("crypto")'));
  assert.ok(appJs.includes('accountId === "crypto"'));
  assert.ok(appJs.includes('elSheet.dataset.accountId = account.id;'));
});

