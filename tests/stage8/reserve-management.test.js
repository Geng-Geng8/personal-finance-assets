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
  const baseTaxReserveCents = customData.baseTaxReserveCents === undefined ? 90000 : customData.baseTaxReserveCents;
  const baseIncomeReserveCents = customData.baseIncomeReserveCents === undefined ? 180000 : customData.baseIncomeReserveCents;
  const cellValues = Object.assign({
    N10: 100,
    O10: 200,
    P14: 6000,
    I17: 23000,
    I18: 81000,
    I19: 31000,
    I20: 33000,
    I21: 2400,
    I22: 15000,
    I23: 400,
    I24: 1000,
    I25: 30000,
    I26: 200,
    I27: 100,
    I28: 200,
    I29: 31900,
    J14: 33000,
    K14: 15000,
    J21: 1800
  }, customData.cellValues || {});
  const cellFormulas = Object.assign({
    H14: "=I29-P14-N14-O14",
    N10: "",
    O10: "",
    N14: "=SUM(N2:N13)",
    O14: "=SUM(O2:O13)",
    P14: "",
    J14: "",
    K14: "",
    J21: "",
    I17: "",
    I18: "",
    I19: "",
    I20: "",
    I21: "=1800*1.36",
    I22: "",
    I23: "",
    I24: "",
    I25: "",
    I26: "",
    I27: "",
    I28: ""
  }, customData.cellFormulas || {});
  const accountRows = [
    ["EQ-TFSA", cellValues.I17],
    ["WEALTHSIMPLE- TFSA", cellValues.I18],
    ["National Bank TFSA", cellValues.I19],
    ["National Bank FHSA ", cellValues.I20],
    ["National Bank TFSA-USD", cellValues.I21],
    ["National Bank RRSP", cellValues.I22],
    ["Simplii - Che", cellValues.I23],
    ["Simplii - Sav", cellValues.I24],
    ["EQ - Sav", cellValues.I25],
    ["EQ Bank Card", cellValues.I26],
    ["EQ - Geng-Cash", cellValues.I27],
    ["TD - Sav", cellValues.I28]
  ];
  const accountFormulaRows = accountRows.map(function(_, index) {
    const cell = "I" + (17 + index);
    return ["", cellFormulas[cell] || ""];
  });

  let lockAcquired = false;
  let lockReleased = false;
  let wasLockedDuringWrite = false;
  let flushCount = 0;
  let wealthReadCount = 0;
  const writtenCells = [];

  function taxReserveValue() {
    return (baseTaxReserveCents + Math.round(Number(cellValues.N10 || 0) * 100)) / 100;
  }

  function incomeReserveValue() {
    return (baseIncomeReserveCents + Math.round(Number(cellValues.O10 || 0) * 100)) / 100;
  }

  function availableCashValue() {
    return cellValues.I29 - cellValues.P14 - taxReserveValue() - incomeReserveValue();
  }

  function rangeForCell(rangeStr) {
    return {
      getValue: () => {
        if (rangeStr === "N14") return taxReserveValue();
        if (rangeStr === "O14") return incomeReserveValue();
        if (rangeStr === "H14") return availableCashValue();
        return cellValues[rangeStr];
      },
      getFormula: () => cellFormulas[rangeStr] || "",
      setValue: (value) => {
        if (lockAcquired && !lockReleased) wasLockedDuringWrite = true;
        if (customData.failDuringWrite) throw new Error("Simulated write failure");
        cellValues[rangeStr] = value;
        writtenCells.push(rangeStr);
      }
    };
  }

  const mockSheet = {
    getRange(rangeStr) {
      if (rangeStr === "H14:P14") {
        wealthReadCount++;
        return {
          getValues: () => [[
            availableCashValue(), 135000, 33000, 15000, 27000, 183000,
            taxReserveValue(), incomeReserveValue(), cellValues.P14
          ]]
        };
      }
      if (rangeStr === "H17:I28") {
        return {
          getValues: () => accountRows,
          getFormulas: () => accountFormulaRows
        };
      }
      if (/^H(?:1[7-9]|2[0-8])$/.test(rangeStr)) {
        const index = Number(rangeStr.slice(1)) - 17;
        return { getValue: () => accountRows[index][0], getFormula: () => "" };
      }
      if (
        Object.prototype.hasOwnProperty.call(cellValues, rangeStr) ||
        Object.prototype.hasOwnProperty.call(cellFormulas, rangeStr) ||
        rangeStr === "N14" || rangeStr === "O14" || rangeStr === "H14"
      ) {
        return rangeForCell(rangeStr);
      }
      throw new Error("Unexpected range: " + rangeStr);
    }
  };

  const context = {
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: (key) => propertiesStore[key] || null })
    },
    SpreadsheetApp: {
      openById: () => ({ getSheetByName: (name) => name === "2026-Budgets" ? mockSheet : null }),
      flush: () => { flushCount++; }
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => {
          if (customData.lockBusy) return false;
          lockAcquired = true;
          lockReleased = false;
          return true;
        },
        releaseLock: () => {
          lockReleased = true;
        }
      })
    },
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput: (content) => ({
        content,
        setMimeType: function(mimeType) { this.mimeType = mimeType; return this; }
      })
    },
    HtmlService: {
      createTemplateFromFile: () => ({
        evaluate: () => ({
          setTitle: function() { return this; },
          setFaviconUrl: function() { return this; },
          addMetaTag: function() { return this; }
        })
      })
    },
    _getCellValues: () => cellValues,
    _getWrittenCells: () => writtenCells.slice(),
    _getWriteState: () => ({ lockAcquired, lockReleased, wasLockedDuringWrite, flushCount, wealthReadCount })
  };

  vm.createContext(context);
  vm.runInContext(code, context);
  return context;
}

function responseJson(response) {
  return JSON.parse(response.content);
}

test("1. approved reserve IDs map only to the exact September and Emergency Fund targets", () => {
  const ctx = loadBackendContext();
  assert.deepEqual(Object.keys(ctx.WEALTH_RESERVE_EDITABLE_WHITELIST), [
    "tax_reserve_2026_09",
    "income_tax_cpp_reserve_2026_09",
    "emergency_fund"
  ]);
  assert.equal(ctx.WEALTH_RESERVE_EDITABLE_WHITELIST.tax_reserve_2026_09.sourceCell, "N10");
  assert.equal(ctx.WEALTH_RESERVE_EDITABLE_WHITELIST.income_tax_cpp_reserve_2026_09.sourceCell, "O10");
  assert.equal(ctx.WEALTH_RESERVE_EDITABLE_WHITELIST.emergency_fund.sourceCell, "P14");
});

test("2. arbitrary reserve IDs are denied", () => {
  const ctx = loadBackendContext();
  assert.throws(() => ctx.updateWealthReserve({ reserveId: "tax_reserve_2026_10", operation: "add", amount: 10 }), /Invalid or non-editable reserve/);
});

test("3. client-supplied Sheet coordinates and formulas are denied", () => {
  ["sheet", "sheetName", "spreadsheetId", "range", "cell", "row", "column", "formula"].forEach((field) => {
    const ctx = loadBackendContext();
    const payload = { reserveId: "tax_reserve_2026_09", operation: "add", amount: 10 };
    payload[field] = "untrusted";
    assert.throws(() => ctx.updateWealthReserve(payload), /Arbitrary sheet or cell coordinates/);
  });
});

test("4. updateWealthReserve is an authenticated POST action", () => {
  const ctx = loadBackendContext();
  const response = ctx.doPost({ postData: { contents: JSON.stringify({
    deviceKey: "a".repeat(64),
    action: "updateWealthReserve",
    payload: { reserveId: "tax_reserve_2026_09", operation: "add", amount: 25 }
  }) } });
  assert.equal(responseJson(response).ok, true);
  assert.match(read("api.js"), /"updateWealthReserve"/);
});

test("5. financial GET remains denied", () => {
  const ctx = loadBackendContext();
  const response = ctx.doGet({ parameter: { action: "updateWealthReserve" } });
  assert.deepEqual(responseJson(response), { ok: false, error: "Unauthorized" });
});

test("6. missing and invalid device keys are denied", () => {
  const ctx = loadBackendContext();
  for (const deviceKey of [undefined, "b".repeat(64)]) {
    const response = ctx.doPost({ postData: { contents: JSON.stringify({
      deviceKey,
      action: "updateWealthReserve",
      payload: { reserveId: "tax_reserve_2026_09", operation: "add", amount: 25 }
    }) } });
    assert.equal(responseJson(response).error, "Unauthorized");
  }
});

test("7. Tax Add uses cents-safe addition", () => {
  const ctx = loadBackendContext({ cellValues: { N10: 100.10 } });
  ctx.updateWealthReserve({ reserveId: "tax_reserve_2026_09", operation: "add", amount: 0.20 });
  assert.equal(ctx._getCellValues().N10, 100.30);
});

test("8. Tax Pay subtracts from September", () => {
  const ctx = loadBackendContext();
  ctx.updateWealthReserve({ reserveId: "tax_reserve_2026_09", operation: "pay", amount: 35.25 });
  assert.equal(ctx._getCellValues().N10, 64.75);
});

test("9. Tax Replace replaces September", () => {
  const ctx = loadBackendContext();
  ctx.updateWealthReserve({ reserveId: "tax_reserve_2026_09", operation: "replace", amount: 12.34 });
  assert.equal(ctx._getCellValues().N10, 12.34);
});

test("10. Income Tax CPP Add uses cents-safe addition", () => {
  const ctx = loadBackendContext({ cellValues: { O10: 200.10 } });
  ctx.updateWealthReserve({ reserveId: "income_tax_cpp_reserve_2026_09", operation: "add", amount: 0.20 });
  assert.equal(ctx._getCellValues().O10, 200.30);
});

test("11. Income Tax CPP Pay subtracts from September", () => {
  const ctx = loadBackendContext();
  ctx.updateWealthReserve({ reserveId: "income_tax_cpp_reserve_2026_09", operation: "pay", amount: 50.25 });
  assert.equal(ctx._getCellValues().O10, 149.75);
});

test("12. Income Tax CPP Replace replaces September", () => {
  const ctx = loadBackendContext();
  ctx.updateWealthReserve({ reserveId: "income_tax_cpp_reserve_2026_09", operation: "replace", amount: -25.50 });
  assert.equal(ctx._getCellValues().O10, -25.50);
});

test("13. Emergency Fund Replace writes the direct balance", () => {
  const ctx = loadBackendContext();
  ctx.updateWealthReserve({ reserveId: "emergency_fund", operation: "replace", amount: 6500.55 });
  assert.equal(ctx._getCellValues().P14, 6500.55);
  assert.deepEqual(ctx._getWrittenCells(), ["P14"]);
});

test("14. Emergency Fund rejects add and pay", () => {
  for (const operation of ["add", "pay"]) {
    const ctx = loadBackendContext();
    assert.throws(() => ctx.updateWealthReserve({ reserveId: "emergency_fund", operation, amount: 10 }), /Invalid operation/);
  }
});

test("15. amounts with more than two decimal places are rejected", () => {
  const ctx = loadBackendContext();
  assert.throws(() => ctx.updateWealthReserve({ reserveId: "tax_reserve_2026_09", operation: "add", amount: 1.001 }), /more than 2 decimal places/);
  assert.throws(() => ctx.updateWealthReserve({ reserveId: "tax_reserve_2026_09", operation: "add", amount: "1.001" }), /at most 2 decimal places/);
});

test("16. missing, invalid, and non-finite amounts are rejected", () => {
  for (const amount of [undefined, null, "", "abc", NaN, Infinity]) {
    const ctx = loadBackendContext();
    assert.throws(() => ctx.updateWealthReserve({ reserveId: "tax_reserve_2026_09", operation: "add", amount }), /Amount/);
  }
});

test("17. negative monthly movement is allowed when the projected reserve remains non-negative", () => {
  const ctx = loadBackendContext();
  ctx.updateWealthReserve({ reserveId: "tax_reserve_2026_09", operation: "replace", amount: -500 });
  assert.equal(ctx._getCellValues().N10, -500);
});

test("18. operations that make an authoritative reserve negative are rejected", () => {
  const ctx = loadBackendContext();
  assert.throws(() => ctx.updateWealthReserve({ reserveId: "tax_reserve_2026_09", operation: "pay", amount: 1000.01 }), /authoritative reserve total negative/);
  assert.deepEqual(ctx._getWrittenCells(), []);
});

test("19. a formula in an approved target cell blocks the write", () => {
  const ctx = loadBackendContext({ cellFormulas: { N10: "=1+1" } });
  assert.throws(() => ctx.updateWealthReserve({ reserveId: "tax_reserve_2026_09", operation: "add", amount: 10 }), /calculated automatically/);
  assert.deepEqual(ctx._getWrittenCells(), []);
});

test("20. reserve summary and Available Cash formula changes fail closed", () => {
  const cases = [
    { cellFormulas: { N14: "=0" }, reserveId: "tax_reserve_2026_09", message: /summary formula changed/ },
    { cellFormulas: { O14: "=0" }, reserveId: "income_tax_cpp_reserve_2026_09", message: /summary formula changed/ },
    { cellFormulas: { H14: "=0" }, reserveId: "emergency_fund", message: /Available Cash formula changed/ }
  ];
  for (const item of cases) {
    const ctx = loadBackendContext({ cellFormulas: item.cellFormulas });
    assert.throws(() => ctx.updateWealthReserve({ reserveId: item.reserveId, operation: "replace", amount: 10 }), item.message);
    assert.deepEqual(ctx._getWrittenCells(), []);
  }
});

test("21. LockService surrounds the single-cell write and flush", () => {
  const ctx = loadBackendContext();
  ctx.updateWealthReserve({ reserveId: "tax_reserve_2026_09", operation: "add", amount: 10 });
  const state = ctx._getWriteState();
  assert.equal(state.wasLockedDuringWrite, true);
  assert.equal(state.lockReleased, true);
  assert.equal(state.flushCount, 1);
  assert.deepEqual(ctx._getWrittenCells(), ["N10"]);

  const failingContext = loadBackendContext({ failDuringWrite: true });
  assert.throws(() => failingContext.updateWealthReserve({ reserveId: "tax_reserve_2026_09", operation: "add", amount: 10 }), /Simulated write failure/);
  assert.equal(failingContext._getWriteState().lockReleased, true);
  assert.equal(failingContext._getWriteState().flushCount, 0);
});

test("22. failed frontend reserve updates do not change Wealth state or cache", () => {
  const appCode = read("app.js");
  const functionStart = appCode.indexOf("async function handleSaveWealthReserve()");
  const catchStart = appCode.indexOf("} catch (err) {", functionStart);
  const catchEnd = appCode.indexOf("function setInsightsSubView", catchStart);
  const catchBlock = appCode.substring(catchStart, catchEnd);
  assert.ok(functionStart > 0 && catchStart > functionStart);
  assert.doesNotMatch(catchBlock, /currentWealthData\s*=/);
  assert.doesNotMatch(catchBlock, /saveWealthToCache/);
});

test("23. success returns and caches only a full authoritative getWealth reread", () => {
  const ctx = loadBackendContext();
  const result = ctx.updateWealthReserve({ reserveId: "tax_reserve_2026_09", operation: "add", amount: 10 });
  assert.equal(result.ok, true);
  assert.equal(Array.isArray(result.wealth.accounts), true);
  assert.equal(result.wealth.accounts.length, 12);
  assert.equal(result.wealth.reserveManagement.periodId, "2026-09");
  assert.deepEqual(
    Array.from(result.wealth.reserveManagement.reserves, (reserve) => [reserve.reserveId, reserve.currentValue]),
    [["tax_reserve_2026_09", 110], ["income_tax_cpp_reserve_2026_09", 200], ["emergency_fund", 6000]]
  );
  assert.ok(ctx._getWriteState().wealthReadCount > 0);
  const appCode = read("app.js");
  const awaitIndex = appCode.indexOf("await financeApi.updateWealthReserve");
  assert.ok(appCode.indexOf("saveWealthToCache(updatedWealth)", awaitIndex) > awaitIndex);
  assert.ok(appCode.indexOf("renderWealthView(updatedWealth)", awaitIndex) > awaitIndex);
});

test("24. Phase 2A account whitelist and account writes remain unchanged", () => {
  const ctx = loadBackendContext();
  const phase2aIds = ["eq_tfsa", "wealthsimple_tfsa", "national_bank_tfsa", "simplii_chequing", "simplii_savings", "eq_savings", "eq_bank_card", "eq_geng_cash", "td_savings"];
  for (const id of phase2aIds) {
    assert.ok(ctx.WEALTH_EDITABLE_WHITELIST[id], `Missing phase 2A account ${id}`);
  }
  ctx.updateWealthAccountBalance({ accountId: "simplii_chequing", balance: 450.25 });
  assert.equal(ctx._getCellValues().I23, 450.25);
});

test("25. UI exposes the approved reserve actions without editable formula or historical controls", () => {
  const html = read("index.html");
  assert.match(html, /id="manageReservesButton"/);
  assert.match(html, />Add Set-Aside</);
  assert.match(html, />Pay CRA</);
  assert.match(html, />Correct September Total</);
  assert.match(html, />Set Emergency Fund Balance</);
  assert.doesNotMatch(html, /<(?:input|select|textarea|button)[^>]*(?:N14|O14|H14|I29|P2:P13)/i);
});
