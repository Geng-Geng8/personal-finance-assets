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
          }
        };
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
