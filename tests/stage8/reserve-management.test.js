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
    A10: new Date("2026-09-15T12:00:00Z"),
    A11: new Date("2026-10-15T12:00:00Z"),
    A12: new Date("2026-11-15T12:00:00Z"),
    A13: new Date("2026-12-15T12:00:00Z"),
    N10: 100,
    O10: 200,
    N11: 0,
    O11: 0,
    N12: 0,
    O12: 0,
    N13: 0,
    O13: 0,
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
    A10: "",
    A11: "",
    A12: "",
    A13: "",
    H14: "=I29-P14-N14-O14",
    N10: "",
    O10: "",
    N11: "",
    O11: "",
    N12: "",
    O12: "",
    N13: "",
    O13: "",
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
    const monthlySum = Number(cellValues.N10 || 0) + Number(cellValues.N11 || 0) + Number(cellValues.N12 || 0) + Number(cellValues.N13 || 0);
    return (baseTaxReserveCents + Math.round(monthlySum * 100)) / 100;
  }

  function incomeReserveValue() {
    const monthlySum = Number(cellValues.O10 || 0) + Number(cellValues.O11 || 0) + Number(cellValues.O12 || 0) + Number(cellValues.O13 || 0);
    return (baseIncomeReserveCents + Math.round(monthlySum * 100)) / 100;
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
      openById: () => ({
        getSheetByName: (name) => name === "2026-Budgets" ? mockSheet : null,
        getSpreadsheetTimeZone: () => customData.timeZone || "America/Toronto"
      }),
      flush: () => { flushCount++; }
    },
    Utilities: {
      formatDate: (date, tz, format) => {
        const dtf = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit" });
        const parts = dtf.formatToParts(date);
        const y = parts.find(p => p.type === "year").value;
        const m = parts.find(p => p.type === "month").value;
        return y + "-" + m;
      }
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => {
          if (customData.lockBusy) return false;
          lockAcquired = true;
          lockReleased = false;
          if (customData.advanceDateOnLock) {
            context.TEST_RESERVE_DATE_OVERRIDE_ = customData.advanceDateOnLock;
          }
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
    TEST_RESERVE_DATE_OVERRIDE_: customData.testDate || new Date("2026-09-15T12:00:00Z"),
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

test("1. approved reserve IDs map only to approved 2026 month rows (N10:O13) and Emergency Fund (P14)", () => {
  const ctx = loadBackendContext();
  assert.deepEqual(Object.keys(ctx.WEALTH_RESERVE_EDITABLE_WHITELIST), [
    "tax_reserve_2026_09",
    "income_tax_cpp_reserve_2026_09",
    "tax_reserve_2026_10",
    "income_tax_cpp_reserve_2026_10",
    "tax_reserve_2026_11",
    "income_tax_cpp_reserve_2026_11",
    "tax_reserve_2026_12",
    "income_tax_cpp_reserve_2026_12",
    "emergency_fund"
  ]);
  assert.equal(ctx.WEALTH_RESERVE_EDITABLE_WHITELIST.tax_reserve_2026_09.sourceCell, "N10");
  assert.equal(ctx.WEALTH_RESERVE_EDITABLE_WHITELIST.income_tax_cpp_reserve_2026_09.sourceCell, "O10");
  assert.equal(ctx.WEALTH_RESERVE_EDITABLE_WHITELIST.tax_reserve_2026_10.sourceCell, "N11");
  assert.equal(ctx.WEALTH_RESERVE_EDITABLE_WHITELIST.income_tax_cpp_reserve_2026_10.sourceCell, "O11");
  assert.equal(ctx.WEALTH_RESERVE_EDITABLE_WHITELIST.tax_reserve_2026_11.sourceCell, "N12");
  assert.equal(ctx.WEALTH_RESERVE_EDITABLE_WHITELIST.income_tax_cpp_reserve_2026_11.sourceCell, "O12");
  assert.equal(ctx.WEALTH_RESERVE_EDITABLE_WHITELIST.tax_reserve_2026_12.sourceCell, "N13");
  assert.equal(ctx.WEALTH_RESERVE_EDITABLE_WHITELIST.income_tax_cpp_reserve_2026_12.sourceCell, "O13");
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

test("26. September resolves N10/O10 and returns September metadata", () => {
  const ctx = loadBackendContext({ testDate: new Date("2026-09-15T12:00:00Z") });
  const wealth = ctx.getWealth();
  assert.equal(wealth.reserveManagement.periodId, "2026-09");
  assert.equal(wealth.reserveManagement.periodLabel, "September 2026");
  ctx.updateWealthReserve({ reserveId: "tax_reserve_2026_09", operation: "add", amount: 15 });
  assert.equal(ctx._getCellValues().N10, 115);
  ctx.updateWealthReserve({ reserveId: "income_tax_cpp_reserve_2026_09", operation: "add", amount: 25 });
  assert.equal(ctx._getCellValues().O10, 225);
  assert.equal(ctx._getCellValues().N11, 0);
  assert.equal(ctx._getCellValues().O11, 0);
});

test("27. October resolves N11/O11 and returns October metadata", () => {
  const ctx = loadBackendContext({ testDate: new Date("2026-10-05T12:00:00Z") });
  const wealth = ctx.getWealth();
  assert.equal(wealth.reserveManagement.periodId, "2026-10");
  assert.equal(wealth.reserveManagement.periodLabel, "October 2026");
  ctx.updateWealthReserve({ reserveId: "tax_reserve_2026_10", operation: "add", amount: 50 });
  assert.equal(ctx._getCellValues().N11, 50);
  ctx.updateWealthReserve({ reserveId: "income_tax_cpp_reserve_2026_10", operation: "add", amount: 75 });
  assert.equal(ctx._getCellValues().O11, 75);
  assert.equal(ctx._getCellValues().N10, 100);
  assert.equal(ctx._getCellValues().O10, 200);
});

test("28. November resolves N12/O12 and returns November metadata", () => {
  const ctx = loadBackendContext({ testDate: new Date("2026-11-20T12:00:00Z") });
  const wealth = ctx.getWealth();
  assert.equal(wealth.reserveManagement.periodId, "2026-11");
  assert.equal(wealth.reserveManagement.periodLabel, "November 2026");
  ctx.updateWealthReserve({ reserveId: "tax_reserve_2026_11", operation: "add", amount: 30 });
  assert.equal(ctx._getCellValues().N12, 30);
  ctx.updateWealthReserve({ reserveId: "income_tax_cpp_reserve_2026_11", operation: "replace", amount: 80 });
  assert.equal(ctx._getCellValues().O12, 80);
});

test("29. December resolves N13/O13 and returns December metadata", () => {
  const ctx = loadBackendContext({ testDate: new Date("2026-12-10T12:00:00Z") });
  const wealth = ctx.getWealth();
  assert.equal(wealth.reserveManagement.periodId, "2026-12");
  assert.equal(wealth.reserveManagement.periodLabel, "December 2026");
  ctx.updateWealthReserve({ reserveId: "tax_reserve_2026_12", operation: "add", amount: 40 });
  assert.equal(ctx._getCellValues().N13, 40);
  ctx.updateWealthReserve({ reserveId: "income_tax_cpp_reserve_2026_12", operation: "add", amount: 60 });
  assert.equal(ctx._getCellValues().O13, 60);
});

test("30. Tax and Income Tax/CPP resolve independently to the correct columns", () => {
  const ctx = loadBackendContext({ testDate: new Date("2026-10-15T12:00:00Z") });
  ctx.updateWealthReserve({ reserveId: "tax_reserve", operation: "add", amount: 10 });
  assert.equal(ctx._getCellValues().N11, 10);
  assert.equal(ctx._getCellValues().O11, 0);
  ctx.updateWealthReserve({ reserveId: "income_tax_cpp_reserve", operation: "add", amount: 20 });
  assert.equal(ctx._getCellValues().O11, 20);
  assert.equal(ctx._getCellValues().N11, 10);
});

test("31. Emergency Fund remains P14 across all months", () => {
  for (const dateStr of ["2026-09-01T12:00:00Z", "2026-10-01T12:00:00Z", "2026-11-01T12:00:00Z", "2026-12-01T12:00:00Z"]) {
    const ctx = loadBackendContext({ testDate: new Date(dateStr) });
    ctx.updateWealthReserve({ reserveId: "emergency_fund", operation: "replace", amount: 7500 });
    assert.equal(ctx._getCellValues().P14, 7500);
  }
});

test("32. unsupported month/year fails closed (2026-08 and 2027-01)", () => {
  const ctxAugust = loadBackendContext({ testDate: new Date("2026-08-15T12:00:00Z") });
  assert.throws(() => ctxAugust.updateWealthReserve({ reserveId: "tax_reserve", operation: "add", amount: 10 }), /Reserve management is not configured for period 2026-08/);

  const ctxJanuary = loadBackendContext({ testDate: new Date("2027-01-05T12:00:00Z") });
  assert.throws(() => ctxJanuary.updateWealthReserve({ reserveId: "tax_reserve", operation: "add", amount: 10 }), /Reserve management is not configured for period 2027-01/);
});

test("33. historical month modification is denied when another month is active", () => {
  const ctxOctober = loadBackendContext({ testDate: new Date("2026-10-15T12:00:00Z") });
  assert.throws(() => ctxOctober.updateWealthReserve({ reserveId: "tax_reserve_2026_09", operation: "add", amount: 10 }), /Invalid or non-editable reserve/);
  assert.throws(() => ctxOctober.updateWealthReserve({ reserveId: "tax_reserve_2026_11", operation: "add", amount: 10 }), /Invalid or non-editable reserve/);
});

test("34. month change between initial resolution and locked write fails closed without writing the old month", () => {
  const ctx = loadBackendContext({
    testDate: new Date("2026-09-30T12:00:00Z"),
    advanceDateOnLock: new Date("2026-10-01T12:00:00Z")
  });
  assert.throws(() => {
    ctx.updateWealthReserve({ reserveId: "tax_reserve_2026_09", operation: "add", amount: 50 });
  }, /Active reserve month changed|Invalid or non-editable reserve/);

  assert.equal(ctx._getCellValues().N10, 100);
  assert.equal(ctx._getCellValues().N11, 0);
  assert.equal(ctx._getWrittenCells().length, 0);
  assert.equal(ctx._getWriteState().lockReleased, true);

  const ctxGeneric = loadBackendContext({
    testDate: new Date("2026-09-30T12:00:00Z"),
    advanceDateOnLock: new Date("2026-10-01T12:00:00Z")
  });
  assert.throws(() => {
    ctxGeneric.updateWealthReserve({ reserveId: "tax_reserve", operation: "add", amount: 50 });
  }, /Active reserve month changed/);
  assert.equal(ctxGeneric._getCellValues().N10, 100);
  assert.equal(ctxGeneric._getCellValues().N11, 0);
  assert.equal(ctxGeneric._getWrittenCells().length, 0);
  assert.equal(ctxGeneric._getWriteState().lockReleased, true);
});

test("35. correct month row identity permits the write", () => {
  const ctxDate = loadBackendContext({
    testDate: new Date("2026-10-15T12:00:00Z"),
    cellValues: { A11: new Date("2026-10-15T12:00:00Z") }
  });
  const resDate = ctxDate.updateWealthReserve({ reserveId: "tax_reserve_2026_10", operation: "add", amount: 35 });
  assert.equal(resDate.ok, true);
  assert.equal(ctxDate._getCellValues().N11, 35);

  const ctxString = loadBackendContext({
    testDate: new Date("2026-10-15T12:00:00Z"),
    cellValues: { A11: "October 2026" }
  });
  const resString = ctxString.updateWealthReserve({ reserveId: "income_tax_cpp_reserve_2026_10", operation: "add", amount: 45 });
  assert.equal(resString.ok, true);
  assert.equal(ctxString._getCellValues().O11, 45);
});

test("36. incorrect or swapped month row identity blocks the write", () => {
  const ctxSwapped = loadBackendContext({
    testDate: new Date("2026-10-15T12:00:00Z"),
    cellValues: { A11: "November 2026" }
  });
  assert.throws(() => {
    ctxSwapped.updateWealthReserve({ reserveId: "tax_reserve_2026_10", operation: "add", amount: 20 });
  }, /Month row identity mismatch at row 11/);
  assert.equal(ctxSwapped._getCellValues().N11, 0);
  assert.equal(ctxSwapped._getWrittenCells().length, 0);

  const ctxBlank = loadBackendContext({
    testDate: new Date("2026-09-15T12:00:00Z"),
    cellValues: { A10: "" }
  });
  assert.throws(() => {
    ctxBlank.updateWealthReserve({ reserveId: "tax_reserve_2026_09", operation: "add", amount: 20 });
  }, /Month row identity mismatch at row 10/);
  assert.equal(ctxBlank._getCellValues().N10, 100);
  assert.equal(ctxBlank._getWrittenCells().length, 0);
});

test("37. Tax and Income Tax + CPP both use the same month-row guard", () => {
  const ctxTax = loadBackendContext({
    testDate: new Date("2026-11-15T12:00:00Z"),
    cellValues: { A12: "Wrong Month" }
  });
  assert.throws(() => {
    ctxTax.updateWealthReserve({ reserveId: "tax_reserve_2026_11", operation: "add", amount: 10 });
  }, /Month row identity mismatch at row 12/);
  assert.equal(ctxTax._getCellValues().N12, 0);

  const ctxIncome = loadBackendContext({
    testDate: new Date("2026-11-15T12:00:00Z"),
    cellValues: { A12: "Wrong Month" }
  });
  assert.throws(() => {
    ctxIncome.updateWealthReserve({ reserveId: "income_tax_cpp_reserve_2026_11", operation: "add", amount: 10 });
  }, /Month row identity mismatch at row 12/);
  assert.equal(ctxIncome._getCellValues().O12, 0);
});

test("38. Emergency Fund remains unaffected by month row identity or month boundaries", () => {
  const ctx = loadBackendContext({
    testDate: new Date("2026-10-15T12:00:00Z"),
    advanceDateOnLock: new Date("2026-11-01T00:00:01Z"),
    cellValues: { A10: "bad", A11: "bad", A12: "bad", A13: "bad" }
  });
  const res = ctx.updateWealthReserve({ reserveId: "emergency_fund", operation: "replace", amount: 8200 });
  assert.equal(res.ok, true);
  assert.equal(ctx._getCellValues().P14, 8200);
  assert.deepEqual(ctx._getWrittenCells(), ["P14"]);
});
