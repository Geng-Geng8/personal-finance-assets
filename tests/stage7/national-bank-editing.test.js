const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repositoryRoot = path.resolve(__dirname, "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

function loadBackendContext(customData = {}) {
  const code = read("apps-script/Code.js");
  const propertiesStore = {
    PRODUCTION_SPREADSHEET_ID: "mock-prod-id",
    PERSONAL_APP_DEVICE_KEY: "a".repeat(64)
  };

  const cellValues = Object.assign({
    H14: 18925.64,
    I14: 137798.17,
    J14: 33488.20,
    K14: 15527.88,
    L14: 27653.19,
    M14: 186814.25,
    N14: 2408.83,
    O14: 4567.77,
    P14: 6000.00,
    N10: 0,
    O10: 0,
    I17: 23222.82,
    I18: 81141.10,
    I19: 30985.47,
    I20: 33488.20,
    I21: 2448.78,
    I22: 15527.88,
    I23: 400.00,
    I24: 1000.00,
    I25: 30000.00,
    I26: 205.00,
    I27: 100.24,
    I28: 197.00,
    I29: 31902.24,
    J21: 1800.57
  }, customData.cellValues || {});

  const cellFormulas = Object.assign({
    H14: "=I29-P14-N14-O14",
    N10: "",
    O10: "",
    N14: "=SUM(N2:N13)",
    O14: "=SUM(O2:O13)",
    P14: "",
    J14: "=I20",
    K14: "=I22",
    I17: "",
    I18: "",
    I19: "",
    I20: "",
    I21: '=J21*GOOGLEFINANCE("CURRENCY:USDCAD")',
    I22: "",
    I23: "",
    I24: "",
    I25: "",
    I26: "",
    I27: "",
    I28: "",
    J21: ""
  }, customData.cellFormulas || {});

  const defaultAccountRows = [
    ["EQ-TFSA", cellValues.I17],
    ["WEALTHSIMPLE- TFSA", cellValues.I18],
    ["National Bank TFSA", cellValues.I19],
    ["National Bank FHSA", cellValues.I20],
    ["National Bank TFSA-USD", cellValues.I21],
    ["National Bank RRSP", cellValues.I22],
    ["Simplii - Che", cellValues.I23],
    ["Simplii - Sav", cellValues.I24],
    ["EQ - Sav", cellValues.I25],
    ["EQ Bank Card", cellValues.I26],
    ["EQ - Geng-Cash", cellValues.I27],
    ["TD - Sav", cellValues.I28]
  ];

  const accountRows = customData.accountRows || defaultAccountRows;

  const accountFormulaRows = [
    ["", cellFormulas.I17],
    ["", cellFormulas.I18],
    ["", cellFormulas.I19],
    ["", cellFormulas.I20],
    ["", cellFormulas.I21],
    ["", cellFormulas.I22],
    ["", cellFormulas.I23],
    ["", cellFormulas.I24],
    ["", cellFormulas.I25],
    ["", cellFormulas.I26],
    ["", cellFormulas.I27],
    ["", cellFormulas.I28]
  ];

  let lockAcquired = false;
  let lockReleased = false;
  let setValueCount = 0;
  const writtenCells = {};

  const mockWealthSheet = {
    name: "2026-Budgets",
    getRange(rangeStr) {
      if (rangeStr === "H14:P14") {
        return {
          getValues: () => [[
            cellValues.H14,
            cellValues.I14,
            cellValues.J14,
            cellValues.K14,
            cellValues.L14,
            cellValues.M14,
            cellValues.N14,
            cellValues.O14,
            cellValues.P14
          ]]
        };
      }
      if (rangeStr === "I29") {
        return { getValue: () => cellValues.I29 };
      }
      if (rangeStr === "H17:I28") {
        return {
          getValues: () => accountRows,
          getFormulas: () => accountFormulaRows
        };
      }
      if (rangeStr.startsWith("H")) {
        const rowNum = parseInt(rangeStr.slice(1), 10);
        const idx = rowNum - 17;
        if (idx >= 0 && idx < accountRows.length) {
          return {
            getValue: () => accountRows[idx][0],
            getFormula: () => ""
          };
        }
      }
      if (cellValues.hasOwnProperty(rangeStr)) {
        return {
          getValue: () => cellValues[rangeStr],
          getFormula: () => cellFormulas[rangeStr] || "",
          setValue: (newVal) => {
            setValueCount++;
            writtenCells[rangeStr] = newVal;
            cellValues[rangeStr] = newVal;
            const match = rangeStr.match(/^I(\d+)$/);
            if (match) {
              const r = parseInt(match[1], 10) - 17;
              if (r >= 0 && r < accountRows.length) {
                accountRows[r][1] = newVal;
              }
            }
          }
        };
      }
      throw new Error("Unexpected range: " + rangeStr);
    }
  };

  const mockSpreadsheet = {
    id: "mock-prod-id",
    getSheetByName: (name) => (name === "2026-Budgets" ? mockWealthSheet : null)
  };

  const context = {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => propertiesStore[k] || null
      })
    },
    SpreadsheetApp: {
      openById: () => mockSpreadsheet,
      flush: () => {
        // simulate Sheet formula recalculations on flush
        if (cellFormulas.J14 === "=I20") {
          cellValues.J14 = cellValues.I20;
        }
        if (cellFormulas.K14 === "=I22") {
          cellValues.K14 = cellValues.I22;
        }
        if (cellFormulas.I21 && cellFormulas.I21.includes("GOOGLEFINANCE")) {
          // simulated FX rate: 1.36
          cellValues.I21 = Math.round(cellValues.J21 * 1.36 * 100) / 100;
          accountRows[4][1] = cellValues.I21;
        }
        cellValues.M14 = (cellValues.I14 || 0) + (cellValues.J14 || 0) + (cellValues.K14 || 0);
      }
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => { lockAcquired = true; return true; },
        releaseLock: () => { lockReleased = true; }
      })
    },
    _getCellValues: () => cellValues,
    _getCellFormulas: () => cellFormulas,
    _getWrittenCells: () => writtenCells,
    _getSetValueCount: () => setValueCount,
    _isLockAcquired: () => lockAcquired,
    _isLockReleased: () => lockReleased
  };

  vm.createContext(context);
  vm.runInContext(code, context);
  return context;
}

/* ============================================================
   A. NATIONAL BANK FHSA TESTS
============================================================ */

test("A1. FHSA maps only to I20 with required summary formula J14 = '=I20'", () => {
  const ctx = loadBackendContext();
  const entry = ctx.WEALTH_EDITABLE_WHITELIST.national_bank_fhsa;
  assert.ok(entry);
  assert.equal(entry.id, "national_bank_fhsa");
  assert.equal(entry.nameCell, "H20");
  assert.equal(entry.displayBalanceCell, "I20");
  assert.equal(entry.writeCell, "I20");
  assert.equal(entry.requiredFormulaCell, "J14");
  assert.equal(entry.expectedFormula, "=I20");
  assert.equal(entry.editCurrency, "CAD");
});

test("A2. FHSA is editable when J14 has '=I20' and I20 has no formula", () => {
  const ctx = loadBackendContext();
  const wealth = ctx.getWealth();
  const fhsa = wealth.accounts.find(a => a.id === "national_bank_fhsa");
  assert.ok(fhsa);
  assert.equal(fhsa.isEditable, true);
  assert.equal(fhsa.isFormula, false);
  assert.equal(fhsa.balance, 33488.20);
  assert.equal(fhsa.editValue, 33488.20);
  assert.equal(fhsa.editCurrency, "CAD");
});

test("A3. FHSA fails closed when J14 formula is missing or unapproved", () => {
  const ctx = loadBackendContext({
    cellFormulas: { J14: "" } // manual summary
  });
  const wealth = ctx.getWealth();
  const fhsa = wealth.accounts.find(a => a.id === "national_bank_fhsa");
  assert.equal(fhsa.isEditable, false);

  assert.throws(() => {
    ctx.updateWealthAccountBalance({ accountId: "national_bank_fhsa", balance: 35000 });
  }, /Account formula changed/);
  assert.equal(ctx._getSetValueCount(), 0);
});

test("A4. FHSA fails closed when I20 contains a formula", () => {
  const ctx = loadBackendContext({
    cellFormulas: { I20: "=SUM(1,2)" }
  });
  const wealth = ctx.getWealth();
  const fhsa = wealth.accounts.find(a => a.id === "national_bank_fhsa");
  assert.equal(fhsa.isEditable, false);

  assert.throws(() => {
    ctx.updateWealthAccountBalance({ accountId: "national_bank_fhsa", balance: 35000 });
  }, /This value is calculated automatically/);
  assert.equal(ctx._getSetValueCount(), 0);
});

test("A5. FHSA write updates I20 only, never writes J14, and downstream recalculates", () => {
  const ctx = loadBackendContext();
  const res = ctx.updateWealthAccountBalance({ accountId: "national_bank_fhsa", balance: 36000 });
  assert.equal(res.ok, true);
  assert.equal(ctx._getWrittenCells().I20, 36000);
  assert.equal(ctx._getWrittenCells().J14, undefined, "J14 must NEVER be written");
  assert.equal(ctx._getSetValueCount(), 1);

  // Authoritative reread
  const updatedFhsa = res.wealth.accounts.find(a => a.id === "national_bank_fhsa");
  assert.equal(updatedFhsa.balance, 36000);
  assert.equal(res.wealth.fhsa, 36000);
  assert.equal(res.wealth.totalInvested, 137798.17 + 36000 + 15527.88);
});

/* ============================================================
   B. NATIONAL BANK RRSP TESTS
============================================================ */

test("B1. RRSP maps only to I22 with required summary formula K14 = '=I22'", () => {
  const ctx = loadBackendContext();
  const entry = ctx.WEALTH_EDITABLE_WHITELIST.national_bank_rrsp;
  assert.ok(entry);
  assert.equal(entry.id, "national_bank_rrsp");
  assert.equal(entry.nameCell, "H22");
  assert.equal(entry.displayBalanceCell, "I22");
  assert.equal(entry.writeCell, "I22");
  assert.equal(entry.requiredFormulaCell, "K14");
  assert.equal(entry.expectedFormula, "=I22");
  assert.equal(entry.editCurrency, "CAD");
});

test("B2. RRSP is editable when K14 has '=I22' and I22 has no formula", () => {
  const ctx = loadBackendContext();
  const wealth = ctx.getWealth();
  const rrsp = wealth.accounts.find(a => a.id === "national_bank_rrsp");
  assert.ok(rrsp);
  assert.equal(rrsp.isEditable, true);
  assert.equal(rrsp.isFormula, false);
  assert.equal(rrsp.balance, 15527.88);
  assert.equal(rrsp.editValue, 15527.88);
  assert.equal(rrsp.editCurrency, "CAD");
});

test("B3. RRSP fails closed when K14 formula is missing or unapproved", () => {
  const ctx = loadBackendContext({
    cellFormulas: { K14: "" } // manual summary
  });
  const wealth = ctx.getWealth();
  const rrsp = wealth.accounts.find(a => a.id === "national_bank_rrsp");
  assert.equal(rrsp.isEditable, false);

  assert.throws(() => {
    ctx.updateWealthAccountBalance({ accountId: "national_bank_rrsp", balance: 17000 });
  }, /Account formula changed/);
  assert.equal(ctx._getSetValueCount(), 0);
});

test("B4. RRSP fails closed when I22 contains a formula", () => {
  const ctx = loadBackendContext({
    cellFormulas: { I22: "=SUM(1,2)" }
  });
  const wealth = ctx.getWealth();
  const rrsp = wealth.accounts.find(a => a.id === "national_bank_rrsp");
  assert.equal(rrsp.isEditable, false);

  assert.throws(() => {
    ctx.updateWealthAccountBalance({ accountId: "national_bank_rrsp", balance: 17000 });
  }, /This value is calculated automatically/);
  assert.equal(ctx._getSetValueCount(), 0);
});

test("B5. RRSP write updates I22 only, never writes K14, and downstream recalculates", () => {
  const ctx = loadBackendContext();
  const res = ctx.updateWealthAccountBalance({ accountId: "national_bank_rrsp", balance: 17000 });
  assert.equal(res.ok, true);
  assert.equal(ctx._getWrittenCells().I22, 17000);
  assert.equal(ctx._getWrittenCells().K14, undefined, "K14 must NEVER be written");
  assert.equal(ctx._getSetValueCount(), 1);

  // Authoritative reread
  const updatedRrsp = res.wealth.accounts.find(a => a.id === "national_bank_rrsp");
  assert.equal(updatedRrsp.balance, 17000);
  assert.equal(res.wealth.rrsp, 17000);
  assert.equal(res.wealth.totalInvested, 137798.17 + 33488.20 + 17000);
});

/* ============================================================
   C. NATIONAL BANK TFSA-USD TESTS
============================================================ */

test("C1. TFSA-USD writes J21 only, display cell is I21 with required GOOGLEFINANCE formula", () => {
  const ctx = loadBackendContext();
  const entry = ctx.WEALTH_EDITABLE_WHITELIST.national_bank_tfsa_usd;
  assert.ok(entry);
  assert.equal(entry.id, "national_bank_tfsa_usd");
  assert.equal(entry.nameCell, "H21");
  assert.equal(entry.displayBalanceCell, "I21");
  assert.equal(entry.writeCell, "J21");
  assert.equal(entry.requiredFormulaCell, "I21");
  assert.equal(entry.expectedFormula, '=J21*GOOGLEFINANCE("CURRENCY:USDCAD")');
  assert.equal(entry.editCurrency, "USD");
});

test("C2. TFSA-USD getWealth returns CAD balance from I21 and USD editValue from J21", () => {
  const ctx = loadBackendContext();
  const wealth = ctx.getWealth();
  const tfsaUsd = wealth.accounts.find(a => a.id === "national_bank_tfsa_usd");
  assert.ok(tfsaUsd);
  assert.equal(tfsaUsd.isEditable, true);
  assert.equal(tfsaUsd.isFormula, true);
  assert.equal(tfsaUsd.balance, 2448.78); // CAD displayed
  assert.equal(tfsaUsd.editValue, 1800.57); // USD raw balance
  assert.equal(tfsaUsd.editCurrency, "USD");
});

test("C3. TFSA-USD writes J21 only and never writes I21", () => {
  const ctx = loadBackendContext();
  const res = ctx.updateWealthAccountBalance({ accountId: "national_bank_tfsa_usd", balance: 2000 });
  assert.equal(res.ok, true);
  assert.equal(ctx._getWrittenCells().J21, 2000);
  assert.equal(ctx._getWrittenCells().I21, undefined, "I21 must NEVER be written");
  assert.equal(ctx._getSetValueCount(), 1);

  // Authoritative reread reflects recalculated CAD balance in I21 and updated USD in editValue
  const updated = res.wealth.accounts.find(a => a.id === "national_bank_tfsa_usd");
  assert.equal(updated.editValue, 2000);
  assert.equal(updated.balance, Math.round(2000 * 1.36 * 100) / 100);
});

test("C4. TFSA-USD fails closed when I21 formula is missing or unapproved", () => {
  const ctx = loadBackendContext({
    cellFormulas: { I21: "=1800.57*1.36" } // old unapproved formula
  });
  const wealth = ctx.getWealth();
  const tfsaUsd = wealth.accounts.find(a => a.id === "national_bank_tfsa_usd");
  assert.equal(tfsaUsd.isEditable, false);

  assert.throws(() => {
    ctx.updateWealthAccountBalance({ accountId: "national_bank_tfsa_usd", balance: 2000 });
  }, /Account formula changed/);
  assert.equal(ctx._getSetValueCount(), 0);
});

test("C5. TFSA-USD fails closed when J21 contains a formula", () => {
  const ctx = loadBackendContext({
    cellFormulas: { J21: "=100+50" }
  });
  const wealth = ctx.getWealth();
  const tfsaUsd = wealth.accounts.find(a => a.id === "national_bank_tfsa_usd");
  assert.equal(tfsaUsd.isEditable, false);

  assert.throws(() => {
    ctx.updateWealthAccountBalance({ accountId: "national_bank_tfsa_usd", balance: 2000 });
  }, /This value is calculated automatically/);
  assert.equal(ctx._getSetValueCount(), 0);
});

test("C6. TFSA-USD rejects client-supplied topology injection", () => {
  const ctx = loadBackendContext();
  const injections = [
    { cell: "I21" },
    { range: "J21" },
    { sheet: "2026-Budgets" },
    { spreadsheetId: "other" },
    { row: 21 },
    { formula: "=1+1" }
  ];
  for (const injection of injections) {
    assert.throws(() => {
      ctx.updateWealthAccountBalance(Object.assign({ accountId: "national_bank_tfsa_usd", balance: 2000 }, injection));
    }, /Arbitrary sheet or cell coordinates are not permitted/);
  }
  assert.equal(ctx._getSetValueCount(), 0);
});

/* ============================================================
   D. FRONTEND CONTRACT TESTS
============================================================ */

test("D1. frontend root and frontend/ parity is maintained across app.js, index.html, and styles.css", () => {
  const rootApp = read("app.js");
  const frontendApp = read("frontend/app.js");
  assert.equal(rootApp, frontendApp, "app.js and frontend/app.js must be identical");

  const rootHtml = read("index.html");
  const frontendHtml = read("frontend/index.html");
  assert.equal(rootHtml, frontendHtml, "index.html and frontend/index.html must be identical");

  const rootCss = read("styles.css");
  const frontendCss = read("frontend/styles.css");
  assert.equal(rootCss, frontendCss, "styles.css and frontend/styles.css must be identical");
});

test("D2. frontend openWealthBalanceEditor configures USD balance label and helper text for USD accounts", () => {
  const appCode = read("app.js");
  // Pre-fills editValue if present
  assert.match(appCode, /account\.editCurrency === "USD"/);
  assert.match(appCode, /USD Balance/);
  assert.match(appCode, /CAD value is calculated automatically using the current USD\/CAD rate\./);
  // Does not calculate FX in frontend JavaScript
  assert.doesNotMatch(appCode, /account\.balance\s*[\*\/]\s*1\.36/);
  assert.doesNotMatch(appCode, /GOOGLEFINANCE/);
});

test("D3. HTML templates contain wealthEditInputLabel and wealthEditHelperText elements", () => {
  const html = read("index.html");
  assert.match(html, /id="wealthEditInputLabel"/);
  assert.match(html, /id="wealthEditHelperText"/);
});

/* ============================================================
   E. REGRESSION TESTS
============================================================ */

test("E1. all nine original Phase 2A accounts remain editable with CAD currency", () => {
  const ctx = loadBackendContext();
  const phase2aIds = [
    "eq_tfsa", "wealthsimple_tfsa", "national_bank_tfsa",
    "simplii_chequing", "simplii_savings", "eq_savings",
    "eq_bank_card", "eq_geng_cash", "td_savings"
  ];
  const wealth = ctx.getWealth();
  for (const id of phase2aIds) {
    const acc = wealth.accounts.find(a => a.id === id);
    assert.ok(acc, `Account ${id} missing in getWealth()`);
    assert.equal(acc.isEditable, true, `Account ${id} should be editable`);
    assert.equal(acc.editCurrency, "CAD");
    const entry = ctx.WEALTH_EDITABLE_WHITELIST[id];
    assert.equal(entry.displayBalanceCell, entry.writeCell);
  }
});

test("E2. existing write validation rules remain strictly enforced on all accounts", () => {
  const ctx = loadBackendContext();
  const accountsToTest = ["national_bank_fhsa", "national_bank_rrsp", "national_bank_tfsa_usd", "td_savings"];
  for (const accountId of accountsToTest) {
    // Negative balance
    assert.throws(() => {
      ctx.updateWealthAccountBalance({ accountId, balance: -1 });
    }, /Asset balance cannot be negative/);

    // More than 2 decimal places
    assert.throws(() => {
      ctx.updateWealthAccountBalance({ accountId, balance: 100.123 });
    }, /Balance cannot have more than 2 decimal places/);

    // Above maximum limit
    assert.throws(() => {
      ctx.updateWealthAccountBalance({ accountId, balance: 1000000000.01 });
    }, /Balance exceeds maximum allowed limit/);

    // Non-finite
    assert.throws(() => {
      ctx.updateWealthAccountBalance({ accountId, balance: NaN });
    }, /Invalid balance: must be a finite number/);
  }
});
