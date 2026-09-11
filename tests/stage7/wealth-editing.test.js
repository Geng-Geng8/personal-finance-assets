const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

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

  const row14 = [
    18925.64, // H14 Available Cash
    137798.17, // I14 Total TFSA
    33488.20, // J14 Total FHSA
    15527.88, // K14 Total RRSP
    27653.19, // L14 Total Crypto
    186814.25, // M14 Total Invested
    2408.83, // N14 Tax Reserve
    4567.77, // O14 Income Tax / CPP Reserve
    6000.00 // P14 Emergency Fund
  ];

  const cellValues = Object.assign({
    H14: row14[0],
    N10: 0,
    O10: 0,
    N14: row14[6],
    O14: row14[7],
    P14: row14[8],
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
    J14: row14[2],
    K14: row14[3],
    J21: 1800.57,
    H30: "cash (Cad) ", I30: 375, J30: "",
    H31: "Cash (php) ", I31: 0, J31: 0,
    H32: "GoTyme (Php) ", I32: 123, J32: 3.47,
    H33: "Gcash(Php) ", I33: 2345, J33: 61.23
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
    I21: "=1800.57*1.36", // formula driven
    I22: "",
    I23: "",
    I24: "",
    I25: "",
    I26: "",
    I27: "",
    I28: "",
    J31: '=I31 * GOOGLEFINANCE("CURRENCY:PHPCAD")',
    J32: '=I32 * GOOGLEFINANCE("CURRENCY:PHPCAD")',
    J33: '=I33 * GOOGLEFINANCE("CURRENCY:PHPCAD")'
  }, customData.cellFormulas || {});

  const defaultAccountRows = [
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
  let lockBusy = Boolean(customData.lockBusy);
  let wasLockedDuringWrite = false;
  let setValueCount = 0;
  let failDuringWrite = Boolean(customData.failDuringWrite);
  const writtenCells = [];
  let philippinesReadCount = 0;

  const mockWealthSheet = {
    name: "2026-Budgets",
    getRange(rangeStr) {
      if (rangeStr === "H30:J33") {
        return {
          getValues: () => {
            philippinesReadCount++;
            return [30, 31, 32, 33].map(row => ["H", "I", "J"].map(col => cellValues[col + row]));
          },
          getFormulas: () => [30, 31, 32, 33].map(row => ["H", "I", "J"].map(col => cellFormulas[col + row] || ""))
        };
      }
      if (rangeStr === "H14:P14") {
        return { getValues: () => [row14] };
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
            if (lockAcquired && !lockReleased) {
              wasLockedDuringWrite = true;
            }
            setValueCount++;
            writtenCells.push(rangeStr);
            if (failDuringWrite) {
              throw new Error("Simulated disk error during setValue");
            }
            cellValues[rangeStr] = newVal;
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
      flush: () => { if (customData.afterFlush) customData.afterFlush(cellValues); }
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => {
          if (lockBusy) return false;
          lockAcquired = true;
          lockReleased = false;
          if (customData.onLock) customData.onLock(cellValues, cellFormulas);
          return true;
        },
        releaseLock: () => {
          lockReleased = true;
          return true;
        }
      })
    },
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput: (content) => ({
        content,
        setMimeType: function(m) { this.mimeType = m; return this; }
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
    _getLockState: () => ({ lockAcquired, lockReleased, wasLockedDuringWrite }),
    _getCellValues: () => cellValues,
    _getSetValueCount: () => setValueCount,
    _getWrittenCells: () => writtenCells,
    _getCellFormulas: () => cellFormulas,
    _getPhilippinesReadCount: () => philippinesReadCount
  };

  const vm = require("node:vm");
  vm.createContext(context);
  vm.runInContext(code, context);
  return context;
}

/* ============================================================
   1. CONTRACT TESTS
============================================================ */

test("1. exactly sixteen approved account IDs exist", () => {
  const ctx = loadBackendContext();
  const keys = Object.keys(ctx.WEALTH_EDITABLE_WHITELIST);
  assert.equal(keys.length, 16);
});

test("2. each approved ID maps to its exact expected H/I cells and expected name", () => {
  const ctx = loadBackendContext();
  const expectedMap = {
    eq_tfsa: { nameCell: "H17", balanceCell: "I17", expectedName: "EQ-TFSA" },
    wealthsimple_tfsa: { nameCell: "H18", balanceCell: "I18", expectedName: "WEALTHSIMPLE- TFSA" },
    national_bank_tfsa: { nameCell: "H19", balanceCell: "I19", expectedName: "National Bank TFSA" },
    national_bank_fhsa: { nameCell: "H20", balanceCell: "I20", expectedName: "National Bank FHSA" },
    national_bank_tfsa_usd: { nameCell: "H21", balanceCell: "I21", expectedName: "National Bank TFSA-USD" },
    national_bank_rrsp: { nameCell: "H22", balanceCell: "I22", expectedName: "National Bank RRSP" },
    simplii_chequing: { nameCell: "H23", balanceCell: "I23", expectedName: "Simplii - Che" },
    simplii_savings: { nameCell: "H24", balanceCell: "I24", expectedName: "Simplii - Sav" },
    eq_savings: { nameCell: "H25", balanceCell: "I25", expectedName: "EQ - Sav" },
    eq_bank_card: { nameCell: "H26", balanceCell: "I26", expectedName: "EQ Bank Card" },
    eq_geng_cash: { nameCell: "H27", balanceCell: "I27", expectedName: "EQ - Geng-Cash" },
    td_savings: { nameCell: "H28", balanceCell: "I28", expectedName: "TD - Sav" }
  };
  for (const [id, expected] of Object.entries(expectedMap)) {
    const entry = ctx.WEALTH_EDITABLE_WHITELIST[id];
    assert.ok(entry, `Missing whitelist entry for ${id}`);
    assert.equal(entry.id, id);
    assert.equal(entry.nameCell, expected.nameCell);
    assert.equal(entry.balanceCell, expected.balanceCell);
    assert.equal(entry.expectedName, expected.expectedName);
  }
});

test("3. each approved account is returned by getWealth() with isEditable: true when its state is valid", () => {
  const ctx = loadBackendContext();
  const wealth = ctx.getWealth();
  const approvedIds = [
    "eq_tfsa", "wealthsimple_tfsa", "national_bank_tfsa",
    "simplii_chequing", "simplii_savings", "eq_savings",
    "eq_bank_card", "eq_geng_cash", "td_savings"
  ];
  for (const id of approvedIds) {
    const acc = wealth.accounts.find(a => a.id === id);
    assert.ok(acc, `Account ${id} not found in getWealth()`);
    assert.equal(acc.isEditable, true, `Account ${id} should have isEditable: true`);
    assert.equal(acc.isFormula, false, `Account ${id} should have isFormula: false`);
  }
});

test("4. I20 / national_bank_fhsa is read-only and denied when summary formula is missing", () => {
  const ctx = loadBackendContext();
  const wealth = ctx.getWealth();
  const fhsa = wealth.accounts.find(a => a.id === "national_bank_fhsa");
  assert.ok(fhsa);
  assert.equal(fhsa.isEditable, false);
  assert.equal(fhsa.isFormula, false);

  assert.throws(() => {
    ctx.updateWealthAccountBalance({ accountId: "national_bank_fhsa", balance: 35000 });
  }, /Account formula changed/);
  assert.equal(ctx._getSetValueCount(), 0);
});

test("5. I21 / national_bank_tfsa_usd is formula-driven, read-only and denied when GOOGLEFINANCE formula is missing", () => {
  const ctx = loadBackendContext();
  const wealth = ctx.getWealth();
  const tfsaUsd = wealth.accounts.find(a => a.id === "national_bank_tfsa_usd");
  assert.ok(tfsaUsd);
  assert.equal(tfsaUsd.isEditable, false);
  assert.equal(tfsaUsd.isFormula, true);

  assert.throws(() => {
    ctx.updateWealthAccountBalance({ accountId: "national_bank_tfsa_usd", balance: 3000 });
  }, /Account formula changed/);
  assert.equal(ctx._getSetValueCount(), 0);
});

test("6. I22 / national_bank_rrsp is read-only and denied when summary formula is missing", () => {
  const ctx = loadBackendContext();
  const wealth = ctx.getWealth();
  const rrsp = wealth.accounts.find(a => a.id === "national_bank_rrsp");
  assert.ok(rrsp);
  assert.equal(rrsp.isEditable, false);
  assert.equal(rrsp.isFormula, false);

  assert.throws(() => {
    ctx.updateWealthAccountBalance({ accountId: "national_bank_rrsp", balance: 16000 });
  }, /Account formula changed/);
  assert.equal(ctx._getSetValueCount(), 0);
});

test("7. arbitrary unknown accountId is denied", () => {
  const ctx = loadBackendContext();
  assert.throws(() => {
    ctx.updateWealthAccountBalance({ accountId: "randomUnknownBank", balance: 100 });
  }, /Invalid or non-editable account/);
  assert.equal(ctx._getSetValueCount(), 0);
});

/* ============================================================
   2. AUTHENTICATION AND TRANSPORT TESTS
============================================================ */

test("8. authenticated update required via doPost with updateWealthAccountBalance", () => {
  const ctx = loadBackendContext();
  const validKey = "a".repeat(64);
  const res = ctx.doPost({
    postData: {
      contents: JSON.stringify({
        deviceKey: validKey,
        action: "updateWealthAccountBalance",
        payload: { accountId: "eq_tfsa", balance: 24000 }
      })
    }
  });
  const parsed = JSON.parse(res.content);
  assert.equal(parsed.ok, true);
  assert.ok(parsed.wealth);
  assert.equal(ctx._getCellValues().I17, 24000);
});

test("9. missing device key denied with Unauthorized", () => {
  const ctx = loadBackendContext();
  const res = ctx.doPost({
    postData: {
      contents: JSON.stringify({
        action: "updateWealthAccountBalance",
        payload: { accountId: "eq_tfsa", balance: 24000 }
      })
    }
  });
  const parsed = JSON.parse(res.content);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.error, "Unauthorized");
});

test("10. invalid device key denied with Unauthorized", () => {
  const ctx = loadBackendContext();
  const res = ctx.doPost({
    postData: {
      contents: JSON.stringify({
        deviceKey: "f".repeat(64),
        action: "updateWealthAccountBalance",
        payload: { accountId: "eq_tfsa", balance: 24000 }
      })
    }
  });
  const parsed = JSON.parse(res.content);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.error, "Unauthorized");
});

test("11. GET write attempt denied with Unauthorized", () => {
  const ctx = loadBackendContext();
  const res = ctx.doGet({
    parameter: { action: "updateWealthAccountBalance", accountId: "eq_tfsa", balance: "24000" }
  });
  const parsed = JSON.parse(res.content);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.error, "Unauthorized");
});

test("12. old updateWealthBalance action denied with Unsupported API action", () => {
  const code = read("apps-script/Code.js");
  const apiCode = read("api.js");
  assert.doesNotMatch(code, /case "updateWealthBalance":/);
  assert.doesNotMatch(apiCode, /"updateWealthBalance"/);

  const ctx = loadBackendContext();
  assert.throws(() => {
    ctx.apiRequest({ action: "updateWealthBalance", payload: { accountId: "eq_tfsa", balance: 100 } });
  }, /Unsupported API action/);
});

test("13. updateWealthAccountBalance remains active in apiRequest and api.js", () => {
  const code = read("apps-script/Code.js");
  const apiCode = read("api.js");
  assert.match(code, /case "updateWealthAccountBalance":/);
  assert.match(apiCode, /"updateWealthAccountBalance"/);
  assert.match(apiCode, /async function updateWealthAccountBalance/);
});

/* ============================================================
   3. SHEET-BOUNDARY SECURITY TESTS
============================================================ */

test("14. payload attempts containing sheet are explicitly rejected and do not alter target", () => {
  const ctx = loadBackendContext();
  assert.throws(() => {
    ctx.updateWealthAccountBalance({ sheet: "Spending_Master2026", accountId: "eq_tfsa", balance: 100 });
  }, /Arbitrary sheet or cell coordinates are not permitted/);
  assert.equal(ctx._getSetValueCount(), 0);
});

test("15. payload attempts containing spreadsheetId are explicitly rejected and do not alter target", () => {
  const ctx = loadBackendContext();
  assert.throws(() => {
    ctx.updateWealthAccountBalance({ spreadsheetId: "other-id", accountId: "eq_tfsa", balance: 100 });
  }, /Arbitrary sheet or cell coordinates are not permitted/);
  assert.equal(ctx._getSetValueCount(), 0);
});

test("16. payload attempts containing range are explicitly rejected and do not alter target", () => {
  const ctx = loadBackendContext();
  assert.throws(() => {
    ctx.updateWealthAccountBalance({ range: "A1:B10", accountId: "eq_tfsa", balance: 100 });
  }, /Arbitrary sheet or cell coordinates are not permitted/);
  assert.equal(ctx._getSetValueCount(), 0);
});

test("17. payload attempts containing cell are explicitly rejected and do not alter target", () => {
  const ctx = loadBackendContext();
  assert.throws(() => {
    ctx.updateWealthAccountBalance({ cell: "I17", accountId: "eq_tfsa", balance: 100 });
  }, /Arbitrary sheet or cell coordinates are not permitted/);
  assert.equal(ctx._getSetValueCount(), 0);
});

test("18. payload attempts containing row are explicitly rejected and do not alter target", () => {
  const ctx = loadBackendContext();
  assert.throws(() => {
    ctx.updateWealthAccountBalance({ row: 17, accountId: "eq_tfsa", balance: 100 });
  }, /Arbitrary sheet or cell coordinates are not permitted/);
  assert.equal(ctx._getSetValueCount(), 0);
});

test("19. payload attempts containing formula are explicitly rejected and do not alter target", () => {
  const ctx = loadBackendContext();
  assert.throws(() => {
    ctx.updateWealthAccountBalance({ formula: "=1+1", accountId: "eq_tfsa", balance: 100 });
  }, /Arbitrary sheet or cell coordinates are not permitted/);
  assert.equal(ctx._getSetValueCount(), 0);
});

test("20. summary and reserve targets H14, I14, J14, K14, I29, N14, O14 and P14 remain impossible", () => {
  const ctx = loadBackendContext();
  const summaryIds = [
    "H14", "I14", "J14", "K14", "I29", "N14", "O14", "P14",
    "availableCash", "tfsa", "fhsa", "rrsp", "totalCash",
    "taxReserve", "incomeTaxCppReserve", "emergencyFund"
  ];
  for (const id of summaryIds) {
    assert.throws(() => {
      ctx.updateWealthAccountBalance({ accountId: id, balance: 50000 });
    }, /Invalid or non-editable account/);
  }
  assert.equal(ctx._getSetValueCount(), 0);
});

/* ============================================================
   4. IDENTITY / FORMULA SAFETY TESTS
============================================================ */

test("21. reordered rows become non-editable in getWealth()", () => {
  const reorderedRows = [
    ["EQ-TFSA", 23222.82],
    ["WEALTHSIMPLE- TFSA", 81141.10],
    ["National Bank TFSA", 30985.47],
    ["National Bank FHSA ", 33488.20],
    ["National Bank TFSA-USD", 2448.78],
    ["National Bank RRSP", 15527.88],
    ["Simplii - Che", 400.00],
    ["Simplii - Sav", 1000.00],
    ["EQ - Sav", 30000.00],
    ["EQ Bank Card", 205.00],
    ["TD - Sav", 197.00], // Row 27 (H27)
    ["EQ - Geng-Cash", 100.24] // Row 28 (H28)
  ];

  const ctx = loadBackendContext({ accountRows: reorderedRows });
  const wealth = ctx.getWealth();
  const tdAccount = wealth.accounts.find(a => a.id === "td_savings");
  const gengCashAccount = wealth.accounts.find(a => a.id === "eq_geng_cash");

  assert.ok(tdAccount);
  assert.ok(gengCashAccount);
  assert.equal(tdAccount.isEditable, false);
  assert.equal(gengCashAccount.isEditable, false);
});

test("22. reordered rows cannot cause wrong-cell writes", () => {
  const reorderedRows = [
    ["EQ-TFSA", 23222.82],
    ["WEALTHSIMPLE- TFSA", 81141.10],
    ["National Bank TFSA", 30985.47],
    ["National Bank FHSA ", 33488.20],
    ["National Bank TFSA-USD", 2448.78],
    ["National Bank RRSP", 15527.88],
    ["Simplii - Che", 400.00],
    ["Simplii - Sav", 1000.00],
    ["EQ - Sav", 30000.00],
    ["EQ Bank Card", 205.00],
    ["TD - Sav", 197.00],
    ["EQ - Geng-Cash", 100.24]
  ];

  const ctx = loadBackendContext({ accountRows: reorderedRows });
  assert.throws(() => {
    ctx.updateWealthAccountBalance({ accountId: "td_savings", balance: 250.00 });
  }, /Account mapping changed\. Balance was not updated\./);
  assert.equal(ctx._getCellValues().I28, 197.00); // Unchanged
});

test("23. expected-name mismatch performs zero setValue() calls", () => {
  const reorderedRows = [
    ["EQ-TFSA", 23222.82],
    ["WEALTHSIMPLE- TFSA", 81141.10],
    ["National Bank TFSA", 30985.47],
    ["National Bank FHSA ", 33488.20],
    ["National Bank TFSA-USD", 2448.78],
    ["National Bank RRSP", 15527.88],
    ["Simplii - Che", 400.00],
    ["Simplii - Sav", 1000.00],
    ["EQ - Sav", 30000.00],
    ["EQ Bank Card", 205.00],
    ["TD - Sav", 197.00],
    ["EQ - Geng-Cash", 100.24]
  ];

  const ctx = loadBackendContext({ accountRows: reorderedRows });
  assert.equal(ctx._getSetValueCount(), 0);
  try {
    ctx.updateWealthAccountBalance({ accountId: "td_savings", balance: 250.00 });
  } catch (_) {}
  assert.equal(ctx._getSetValueCount(), 0);
});

test("24. formula conversion after configuration causes rejection", () => {
  const ctx = loadBackendContext({ cellFormulas: { I28: "=SUM(A1:A5)" } });
  const wealth = ctx.getWealth();
  const tdAccount = wealth.accounts.find(a => a.id === "td_savings");
  assert.ok(tdAccount);
  assert.equal(tdAccount.isEditable, false);
  assert.equal(tdAccount.isFormula, true);

  assert.throws(() => {
    ctx.updateWealthAccountBalance({ accountId: "td_savings", balance: 250 });
  }, /This value is calculated automatically and cannot be edited\./);
});

test("25. formula rejection performs zero setValue() calls", () => {
  const ctx = loadBackendContext({ cellFormulas: { I28: "=SUM(A1:A5)" } });
  assert.equal(ctx._getSetValueCount(), 0);
  try {
    ctx.updateWealthAccountBalance({ accountId: "td_savings", balance: 250 });
  } catch (_) {}
  assert.equal(ctx._getSetValueCount(), 0);
});

/* ============================================================
   5. LOCKING TESTS
============================================================ */

test("26. successful write acquires and releases LockService inside critical section", () => {
  const ctx = loadBackendContext();
  const res = ctx.updateWealthAccountBalance({ accountId: "td_savings", balance: 350.00 });
  assert.equal(res.ok, true);
  const lock = ctx._getLockState();
  assert.equal(lock.lockAcquired, true);
  assert.equal(lock.lockReleased, true);
  assert.equal(lock.wasLockedDuringWrite, true);
});

test("27. failed writes after lock acquisition still release LockService", () => {
  const ctx = loadBackendContext({ failDuringWrite: true });
  assert.throws(() => {
    ctx.updateWealthAccountBalance({ accountId: "td_savings", balance: 350.00 });
  }, /Simulated disk error during setValue/);
  const lock = ctx._getLockState();
  assert.equal(lock.lockAcquired, true);
  assert.equal(lock.lockReleased, true);
});

test("28. busy lock throws Server is busy error", () => {
  const ctx = loadBackendContext({ lockBusy: true });
  assert.throws(() => {
    ctx.updateWealthAccountBalance({ accountId: "td_savings", balance: 350.00 });
  }, /Server is busy\. Please try again\./);
  assert.equal(ctx._getSetValueCount(), 0);
});

/* ============================================================
   6. BALANCE POLICY AND PRECISION TESTS
============================================================ */

test("29. valid balances accepted (integer, one decimal, two decimals, and minimum 0.00)", () => {
  const ctx = loadBackendContext();

  // 0.00 minimum
  const res0 = ctx.updateWealthAccountBalance({ accountId: "td_savings", balance: 0.00 });
  assert.equal(res0.ok, true);
  assert.equal(ctx._getCellValues().I28, 0);

  // integer
  const resInt = ctx.updateWealthAccountBalance({ accountId: "td_savings", balance: 150 });
  assert.equal(resInt.ok, true);
  assert.equal(ctx._getCellValues().I28, 150);

  // one decimal
  const resOneDec = ctx.updateWealthAccountBalance({ accountId: "td_savings", balance: 150.5 });
  assert.equal(resOneDec.ok, true);
  assert.equal(ctx._getCellValues().I28, 150.5);

  // two decimals
  const resTwoDec = ctx.updateWealthAccountBalance({ accountId: "td_savings", balance: 150.55 });
  assert.equal(resTwoDec.ok, true);
  assert.equal(ctx._getCellValues().I28, 150.55);

  // string with currency and commas
  const resStr = ctx.updateWealthAccountBalance({ accountId: "td_savings", balance: "$1,234.56" });
  assert.equal(resStr.ok, true);
  assert.equal(ctx._getCellValues().I28, 1234.56);

  // maximum allowed (1,000,000,000.00)
  const resMax = ctx.updateWealthAccountBalance({ accountId: "td_savings", balance: 1000000000.00 });
  assert.equal(resMax.ok, true);
  assert.equal(ctx._getCellValues().I28, 1000000000.00);
});

test("30. values with more than two decimal places rejected without silent rounding", () => {
  const ctx = loadBackendContext();

  // Number with 3 decimals
  assert.throws(() => {
    ctx.updateWealthAccountBalance({ accountId: "td_savings", balance: 100.123 });
  }, /Balance cannot have more than 2 decimal places\./);

  // Number with 4 decimals
  assert.throws(() => {
    ctx.updateWealthAccountBalance({ accountId: "td_savings", balance: 0.0001 });
  }, /Balance cannot have more than 2 decimal places\./);

  // String with 3 decimals
  assert.throws(() => {
    ctx.updateWealthAccountBalance({ accountId: "td_savings", balance: "100.555" });
  }, /Balance cannot have more than 2 decimal places\./);

  assert.equal(ctx._getSetValueCount(), 0);
});

test("31. negative values rejected", () => {
  const ctx = loadBackendContext();
  assert.throws(() => {
    ctx.updateWealthAccountBalance({ accountId: "td_savings", balance: -0.01 });
  }, /Asset balance cannot be negative\./);

  assert.throws(() => {
    ctx.updateWealthAccountBalance({ accountId: "td_savings", balance: -500 });
  }, /Asset balance cannot be negative\./);

  assert.equal(ctx._getSetValueCount(), 0);
});

test("32. values above maximum rejected", () => {
  const ctx = loadBackendContext();
  assert.throws(() => {
    ctx.updateWealthAccountBalance({ accountId: "td_savings", balance: 1000000000.01 });
  }, /Balance exceeds maximum allowed limit\./);

  assert.throws(() => {
    ctx.updateWealthAccountBalance({ accountId: "td_savings", balance: 2000000000 });
  }, /Balance exceeds maximum allowed limit\./);

  assert.equal(ctx._getSetValueCount(), 0);
});

test("33. NaN, Infinity, and malformed strings rejected", () => {
  const ctx = loadBackendContext();
  assert.throws(() => {
    ctx.updateWealthAccountBalance({ accountId: "td_savings", balance: NaN });
  }, /Invalid balance/);

  assert.throws(() => {
    ctx.updateWealthAccountBalance({ accountId: "td_savings", balance: Infinity });
  }, /Invalid balance/);

  assert.throws(() => {
    ctx.updateWealthAccountBalance({ accountId: "td_savings", balance: "abc" });
  }, /Invalid balance/);

  assert.throws(() => {
    ctx.updateWealthAccountBalance({ accountId: "td_savings", balance: "12.34.56" });
  }, /Invalid balance/);

  assert.equal(ctx._getSetValueCount(), 0);
});

/* ============================================================
   7. AUTHORITATIVE RESPONSE SHAPE TESTS
============================================================ */

test("34. complete authoritative Wealth response shape returned after successful write", () => {
  const ctx = loadBackendContext();
  const res = ctx.updateWealthAccountBalance({ accountId: "simplii_chequing", balance: 850.50 });
  assert.equal(res.ok, true);
  assert.ok(res.wealth, "Response must include wealth property");

  const w = res.wealth;
  assert.equal(typeof w.availableCash, "number", "availableCash must be a number");
  assert.equal(typeof w.tfsa, "number", "tfsa must be a number");
  assert.equal(typeof w.fhsa, "number", "fhsa must be a number");
  assert.equal(typeof w.rrsp, "number", "rrsp must be a number");
  assert.equal(typeof w.crypto, "number", "crypto must be a number");
  assert.equal(typeof w.totalInvested, "number", "totalInvested must be a number");
  assert.equal(typeof w.taxReserve, "number", "taxReserve must be a number");
  assert.equal(typeof w.incomeTaxCppReserve, "number", "incomeTaxCppReserve must be a number");
  assert.equal(typeof w.emergencyFund, "number", "emergencyFund must be a number");
  assert.equal(typeof w.totalCash, "number", "totalCash must be a number");
  assert.ok(Array.isArray(w.accounts), "accounts must be an array");
  assert.equal(typeof w.updatedAt, "string", "updatedAt must be a string");
  assert.ok(!isNaN(Date.parse(w.updatedAt)), "updatedAt must be valid ISO date string");

  assert.equal(w.availableCash, 18925.64);
  assert.equal(w.tfsa, 137798.17);
  assert.equal(w.fhsa, 33488.20);
  assert.equal(w.rrsp, 15527.88);
  assert.equal(w.crypto, 27653.19);
  assert.equal(w.totalInvested, 186814.25);
  assert.equal(w.taxReserve, 2408.83);
  assert.equal(w.incomeTaxCppReserve, 4567.77);
  assert.equal(w.emergencyFund, 6000.00);
  assert.equal(w.totalCash, 31902.24);
  assert.equal(w.accounts.length, 12);
});

/* ============================================================
   8. FRONTEND / CACHE BEHAVIOR TESTS
============================================================ */

test("35. no optimistic Wealth state mutation occurs before server response", () => {
  const appCode = read("app.js");
  // Ensure that currentWealthData and saveWealthToCache are only called after await financeApi.updateWealthAccountBalance
  const saveIdx = appCode.indexOf("await financeApi.updateWealthAccountBalance");
  const cacheIdx = appCode.indexOf("saveWealthToCache(updatedWealth)");
  const renderIdx = appCode.indexOf("renderWealthView(updatedWealth)");
  assert.ok(saveIdx > 0);
  assert.ok(cacheIdx > saveIdx, "saveWealthToCache must be called after await");
  assert.ok(renderIdx > saveIdx, "renderWealthView must be called after await");
});

test("36. failed update leaves previously confirmed Wealth state and cache unchanged", () => {
  const appCode = read("app.js");
  const funcStart = appCode.indexOf("async function handleSaveWealthBalance()");
  assert.ok(funcStart > 0, "handleSaveWealthBalance must exist");
  const catchStart = appCode.indexOf("} catch (err) {", funcStart);
  assert.ok(catchStart > funcStart, "catch block must follow handleSaveWealthBalance");
  const catchEnd = appCode.indexOf("let selectedReserveMode", catchStart);
  const catchBlock = appCode.substring(catchStart, catchEnd);
  assert.doesNotMatch(catchBlock, /currentWealthData\s*=/);
  assert.doesNotMatch(catchBlock, /saveWealthToCache/);
});

test("37. failed update retains the safe message without rendering raw exception text", () => {
  const appCode = read("app.js");
  assert.match(appCode, /elError\.textContent = "Balance wasn't updated\. Your previous value is unchanged\.";/);
  assert.doesNotMatch(appCode, /elError\.textContent = \(err && err\.message\)/);
  assert.doesNotMatch(appCode, /elError\.textContent = err\.message/);
});

test("38. successful response updates currentWealthData and calls saveWealthToCache", () => {
  const appCode = read("app.js");
  assert.match(appCode, /currentWealthData = updatedWealth;/);
  assert.match(appCode, /saveWealthToCache\(updatedWealth\);/);
  assert.match(appCode, /renderWealthView\(updatedWealth\);/);
});

test("39. Remove This Device clears Wealth snapshot and auth state", () => {
  const appCode = read("app.js");
  assert.match(appCode, /removeWealthCache/);
  assert.match(appCode, /personalFinance\.wealthSnapshot/);
});

// Execute the actual editor and API against doPost with in-memory Sheets only.
function loadBalanceEditor(backend, options = {}) {
  const vm = require("node:vm");
  const elements = Object.fromEntries(["wealthEditInput", "wealthEditError", "saveWealthEditButton"].map(id => {
    const classes = new Set(["hidden"]);
    return [id, {
      value: "850.50", textContent: "", disabled: false,
      classList: {
        add: name => classes.add(name), remove: name => classes.delete(name),
        contains: name => classes.has(name)
      }
    }];
  }));
  const calls = [];
  const previousWealth = { availableCash: 123, accounts: [] };
  const storage = new Map([["personalFinance.deviceKey", "a".repeat(64)]]);
  let responseBody;
  const context = vm.createContext({
    window: {
      localStorage: {
        getItem: key => storage.get(key), removeItem: key => storage.delete(key)
      },
      FINANCE_APP_CONFIG: { webAppEndpointUrl: "https://script.google.com/macros/s/TEST/exec" },
      fetch: async (url, request) => {
        calls.push(["request", JSON.parse(request.body), request.method]);
        if (options.fetchError) throw options.fetchError;
        responseBody = JSON.parse(backend.doPost({ postData: { contents: request.body } }).content);
        return { ok: options.httpOk !== false, status: 500, json: async () => responseBody };
      }
    },
    document: { getElementById: id => elements[id] },
    editingWealthAccountId: options.accountId || "simplii_chequing",
    isSavingWealthBalance: false,
    currentWealthData: previousWealth,
    saveWealthToCache: value => calls.push(["cache", value]),
    renderWealthView: value => calls.push(["render", value]),
    closeWealthBalanceEditor: () => calls.push(["close"]),
    updateSyncStatus: (...args) => calls.push(["sync", ...args])
  });
  vm.runInContext(read("api.js"), context);
  const app = read("app.js");
  const start = app.indexOf("  function getWealthBalanceFailureReason(");
  const end = app.indexOf("  let selectedReserveMode", start);
  assert.ok(start >= 0 && end > start);
  vm.runInContext(app.slice(start, end), context);
  return { context, elements, calls, previousWealth, storage, getResponse: () => responseBody };
}

const SAFE_BALANCE_FAILURE = "Balance wasn't updated. Your previous value is unchanged.";

test("40. authenticated backend errors reach the editor through api.js for cash and investment accounts", async () => {
  for (const accountId of ["simplii_chequing", "wealthsimple_tfsa"]) {
    const backend = loadBackendContext({ cellFormulas: { I23: "=1", I18: "=1" } });
    const editor = loadBalanceEditor(backend, { accountId });
    await editor.context.handleSaveWealthBalance();
    assert.equal(editor.getResponse().error, "This value is calculated automatically and cannot be edited.");
    assert.equal(editor.elements.wealthEditError.textContent,
      SAFE_BALANCE_FAILURE + " Reason: This value is calculated automatically and cannot be edited.");
    assert.equal(editor.elements.wealthEditError.classList.contains("hidden"), false);
    assert.equal(editor.elements.saveWealthEditButton.disabled, false);
    assert.equal(editor.elements.saveWealthEditButton.textContent, "Save Balance");
    assert.equal(editor.context.isSavingWealthBalance, false);
    assert.equal(editor.context.currentWealthData, editor.previousWealth);
    assert.deepEqual(editor.calls.map(call => call[0]), ["request"]);
    assert.equal(editor.calls[0][2], "POST");
    assert.equal(editor.calls[0][1].action, "updateWealthAccountBalance");
    assert.equal(editor.calls[0][1].deviceKey, "a".repeat(64));
    assert.equal(backend._getSetValueCount(), 0);
  }
});

test("41. runtime and HTTP errors display only fixed sanitized reasons, never sensitive details", async () => {
  const sensitive = ["a".repeat(64), "private-sheet-id", "private-deployment-token", "private-device-secret",
    '{"accountId":"private-account","balance":98765}', "https://private.example/credential", "at Code.js:123"];
  const cases = [
    ["Unsupported API action: updateWealthAccountBalance", "The deployed backend does not support Wealth balance updates."],
    ["Account mapping changed. Balance was not updated.", "Account mapping changed. Balance was not updated."],
    ["Server is busy. Please try again.", "Server is busy. Please try again."],
    ["You do not have permission to call setValue. " + sensitive.join(" "), "The server reported a permission or protected-range error."],
    ["LockService.getScriptLock is not a function " + sensitive.join(" "), "The server reported a lock-service error."],
    ["Number.isFinite is not a function " + sensitive.join(" "), "A required runtime function is unavailable."],
    ["privateName is not defined " + sensitive.join(" "), "A required runtime name is undefined."],
    ["Cannot read properties of undefined " + sensitive.join(" "), "The runtime encountered a missing value."],
    ["Service invoked too many times " + sensitive.join(" "), "The server reported a service limit or quota error."],
    ["Maximum execution time exceeded " + sensitive.join(" "), "The request timed out."],
    ["Account mapping changed. Balance was not updated. " + sensitive.join(" "), "Unrecognized server/runtime error; details withheld for privacy."],
    [sensitive.join(" "), "Unrecognized server/runtime error; details withheld for privacy."]
  ];
  for (const httpOk of [true, false]) {
    for (const [raw, reason] of cases) {
      const backend = loadBackendContext();
      backend.LockService.getScriptLock = () => { throw new Error(raw); };
      const editor = loadBalanceEditor(backend, { httpOk });
      await editor.context.handleSaveWealthBalance();
      assert.equal(editor.getResponse().error, raw);
      assert.equal(editor.elements.wealthEditError.textContent, SAFE_BALANCE_FAILURE + " Reason: " + reason);
      for (const secret of sensitive) assert.ok(!editor.elements.wealthEditError.textContent.includes(secret));
      assert.equal(editor.context.currentWealthData, editor.previousWealth);
      assert.equal(backend._getSetValueCount(), 0);
    }
  }
});

test("42. missing errors retain the safe message and network failures get a safe reason", async () => {
  for (const [fetchError, suffix] of [
    [{}, ""],
    [new Error("Failed to fetch https://private.example/" + "a".repeat(64)), " Reason: The network request failed."]
  ]) {
    const editor = loadBalanceEditor(loadBackendContext(), { fetchError });
    await editor.context.handleSaveWealthBalance();
    assert.equal(editor.elements.wealthEditError.textContent, SAFE_BALANCE_FAILURE + suffix);
    assert.equal(editor.context.currentWealthData, editor.previousWealth);
  }
});

test("43. successful update still uses the authoritative response for state, cache and rendering", async () => {
  const backend = loadBackendContext();
  const editor = loadBalanceEditor(backend);
  await editor.context.handleSaveWealthBalance();
  assert.equal(backend._getCellValues().I23, 850.5);
  assert.equal(backend._getSetValueCount(), 1);
  assert.equal(editor.context.currentWealthData, editor.getResponse().wealth);
  assert.deepEqual(editor.calls.map(call => call[0]), ["request", "cache", "render", "close", "sync"]);
  assert.equal(editor.calls[1][1], editor.getResponse().wealth);
  assert.equal(editor.calls[2][1], editor.getResponse().wealth);
  assert.deepEqual(editor.calls[4], ["sync", "live", "Balance updated"]);
  assert.deepEqual(editor.calls[0][1].payload, { accountId: "simplii_chequing", balance: 850.5 });
  assert.equal(editor.elements.wealthEditError.textContent, "");
  assert.equal(editor.elements.wealthEditError.classList.contains("hidden"), true);
  assert.equal(editor.context.isSavingWealthBalance, false);
});

test("44. root and frontend Wealth editor/API mirrors remain identical", () => {
  for (const file of ["app.js", "api.js"]) assert.equal(read(file), read("frontend/" + file));
});

const PH_ACCOUNTS = [
  ["ph_cash_cad", 30, "cash (Cad)", "Cash — CAD", "CAD"],
  ["ph_cash_php", 31, "Cash (php)", "Cash — PHP", "PHP"],
  ["gotyme_php", 32, "GoTyme (Php)", "GoTyme", "PHP"],
  ["gcash_php", 33, "Gcash(Php)", "GCash", "PHP"]
];

test("PH contract: four explicit IDs, trimmed identity, native amounts and only Sheet-derived CAD values", () => {
  const ctx = loadBackendContext();
  const wealth = ctx.getWealth();
  assert.equal(wealth.accounts.length, 12);
  assert.deepEqual(Array.from(wealth.philippinesAccounts, a => a.id), PH_ACCOUNTS.map(a => a[0]));
  for (const [id, row, expectedName, name, currency] of PH_ACCOUNTS) {
    const target = ctx.WEALTH_EDITABLE_WHITELIST[id];
    assert.equal(target.nameCell, "H" + row);
    assert.equal(target.balanceCell, "I" + row);
    assert.equal(target.writeCell, "I" + row);
    assert.equal(target.expectedName, expectedName);
    assert.equal(target.editCurrency, currency);
    const a = wealth.philippinesAccounts.find(a => a.id === id);
    assert.equal(a.name, name);
    assert.equal(a.balance, ctx._getCellValues()["I" + row]);
    assert.equal(a.currency, currency);
    assert.equal(a.editCurrency, currency);
    assert.equal(a.isEditable, true);
    assert.equal(a.isFormula, false);
    const keys = ["id", "name", "balance", "currency", "editCurrency", "isEditable", "isFormula"];
    if (currency === "PHP") {
      keys.push("cadEquivalent");
      assert.equal(a.cadEquivalent, ctx._getCellValues()["J" + row]);
    }
    assert.deepEqual(Object.keys(a).sort(), keys.sort());
  }
  assert.doesNotMatch(JSON.stringify(wealth.philippinesAccounts), /2026-Budgets|[HIJ]3[0-3]|GOOGLEFINANCE|mock-prod-id/);
});

test("PH writes target only I30:I33 under lock, preserve all formulas and return a complete reread", () => {
  for (const [id, row] of PH_ACCOUNTS) {
    const ctx = loadBackendContext({ afterFlush: values => { values.J31 = 17.91; values.J32 = 21.56; values.J33 = 94.82; } });
    const before = { ...ctx._getCellValues() };
    const formulas = { ...ctx._getCellFormulas() };
    ctx.getWealth();
    const result = ctx.updateWealthAccountBalance({ accountId: id, balance: 999.87 });
    assert.deepEqual(ctx._getWrittenCells(), ["I" + row]);
    assert.deepEqual(ctx._getLockState(), { lockAcquired: true, lockReleased: true, wasLockedDuringWrite: true });
    assert.deepEqual(ctx._getCellFormulas(), formulas);
    for (const cell of Object.keys(before).filter(cell => !["I" + row, "J31", "J32", "J33"].includes(cell))) {
      assert.equal(ctx._getCellValues()[cell], before[cell], cell + " must remain unchanged");
    }
    assert.equal(ctx._getPhilippinesReadCount(), 2);
    assert.equal(result.wealth.philippinesAccounts.find(a => a.id === id).balance, 999.87);
    assert.equal(result.wealth.philippinesAccounts[2].cadEquivalent, 21.56);
    assert.equal(result.wealth.accounts.length, 12);
    assert.ok(result.wealth.reserveManagement);
    assert.equal(result.wealth.availableCash, 18925.64);
  }
});

test("PH formula drift, missing conversion and formulas in native cells fail closed on read and write", () => {
  for (const [id, row, , , currency] of PH_ACCOUNTS) {
    const cases = [{ ["I" + row]: "=123" }];
    if (currency === "PHP") {
      for (const formula of ["", "=123", '=I30*GOOGLEFINANCE("CURRENCY:PHPCAD")',
        '=I' + row + '*GOOGLEFINANCE("CURRENCY:CADPHP")',
        '=I' + row + '*GOOGLEFINANCE("CURRENCY:PHP CAD")',
        '=I' + row + '*GOOGLEFINANCE("CURRENCY:PHPCAD")+1']) cases.push({ ["J" + row]: formula });
    }
    for (const cellFormulas of cases) {
      const ctx = loadBackendContext({ cellFormulas });
      assert.equal(ctx.getWealth().philippinesAccounts.find(a => a.id === id).isEditable, false);
      assert.throws(() => ctx.updateWealthAccountBalance({ accountId: id, balance: 20 }), /calculated automatically|Account formula changed/);
      assert.equal(ctx._getSetValueCount(), 0);
      assert.equal(ctx._getLockState().lockReleased, true);
    }
  }
});

test("PH identity mismatch and row swaps fail closed; identity and formulas are rechecked after acquiring the lock", () => {
  for (const [id, row] of PH_ACCOUNTS) {
    const ctx = loadBackendContext({ cellValues: { ["H" + row]: "different account" } });
    assert.equal(ctx.getWealth().philippinesAccounts.find(a => a.id === id).isEditable, false);
    assert.throws(() => ctx.updateWealthAccountBalance({ accountId: id, balance: 20 }), /Account mapping changed/);
    assert.equal(ctx._getSetValueCount(), 0);
  }
  const swapped = loadBackendContext({ cellValues: { H32: "Gcash(Php)", H33: "GoTyme (Php)" } });
  for (const id of ["gotyme_php", "gcash_php"]) {
    assert.throws(() => swapped.updateWealthAccountBalance({ accountId: id, balance: 20 }), /Account mapping changed/);
  }
  for (const onLock of [values => { values.H32 = "Changed"; }, (values, formulas) => { formulas.J32 = "=1"; }]) {
    const ctx = loadBackendContext({ onLock });
    assert.equal(ctx.getWealth().philippinesAccounts[2].isEditable, true);
    assert.throws(() => ctx.updateWealthAccountBalance({ accountId: "gotyme_php", balance: 20 }), /Account .* changed/);
    assert.equal(ctx._getSetValueCount(), 0);
  }
});

test("PH whitespace outside formula literals is accepted; busy locks and write exceptions preserve existing state", () => {
  const ctx = loadBackendContext({ cellFormulas: { J32: ' = I32 * GOOGLEFINANCE( "CURRENCY:PHPCAD" ) ' } });
  assert.equal(ctx.getWealth().philippinesAccounts[2].isEditable, true);
  assert.equal(ctx.updateWealthAccountBalance({ accountId: "gotyme_php", balance: 0 }).ok, true);
  for (const customData of [{ lockBusy: true }, { failDuringWrite: true }]) {
    const backend = loadBackendContext(customData);
    assert.throws(() => backend.updateWealthAccountBalance({ accountId: "gotyme_php", balance: 50 }), /busy|Simulated disk error/);
    assert.equal(backend._getCellValues().I32, 123);
    assert.equal(backend._getLockState().lockReleased, !customData.lockBusy);
  }
});

test("PH browser topology, conversion overrides, invalid IDs and invalid native money cannot write", () => {
  const ctx = loadBackendContext();
  for (const [id] of PH_ACCOUNTS) {
    for (const key of ["sheet", "sheetName", "spreadsheetId", "cell", "range", "row", "formula", "currency", "editCurrency", "cadEquivalent", "exchangeRate", "writeCell", "__proto__"]) {
      assert.throws(() => ctx.updateWealthAccountBalance({ accountId: id, balance: 20, [key]: "J31" }), /Arbitrary sheet or cell coordinates/);
    }
    for (const balance of [-1, 1e9 + 1, 1.001, NaN, Infinity, "abc", "=1+1", "", null, true, {}, []]) {
      assert.throws(() => ctx.updateWealthAccountBalance({ accountId: id, balance }));
    }
  }
  for (const accountId of ["I30", "I31", "I32", "I33", "J31", "J32", "J33", "cash_php", "__proto__", "constructor", "hasOwnProperty", ""]) {
    assert.throws(() => ctx.updateWealthAccountBalance({ accountId, balance: 20 }), /Invalid or non-editable/);
  }
  assert.equal(ctx._getSetValueCount(), 0);
});

test("PH authenticated POST is required and PHP failures retain sanitized editor errors", async () => {
  for (const deviceKey of [undefined, "f".repeat(64)]) {
    const ctx = loadBackendContext();
    const result = JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ deviceKey,
      action: "updateWealthAccountBalance", payload: { accountId: "gotyme_php", balance: 10 } }) } }).content);
    assert.equal(result.error, "Unauthorized");
    assert.equal(ctx._getSetValueCount(), 0);
  }
  const ctx = loadBackendContext({ cellFormulas: { J32: "" } });
  const editor = loadBalanceEditor(ctx, { accountId: "gotyme_php" });
  await editor.context.handleSaveWealthBalance();
  assert.equal(editor.elements.wealthEditError.textContent, SAFE_BALANCE_FAILURE + " Reason: Account formula changed. Balance was not updated.");
  assert.equal(editor.context.currentWealthData, editor.previousWealth);
  assert.equal(ctx._getSetValueCount(), 0);
});

function loadPhilippinesView(wealth) {
  const vm = require("node:vm");
  const elements = {};
  const context = vm.createContext({
    currentWealthData: wealth,
    document: {
      getElementById: id => elements[id] ||= { textContent: "", innerHTML: "", value: "", dataset: {},
        classList: { add() {}, remove() {} }, addEventListener(type, listener) { this[type] = listener; } },
      querySelector: () => null
    },
    formatCurrency: value => "$" + Number(value || 0).toFixed(2),
    escapeHtml: value => String(value).replace(/[&<>"']/g, "_"),
    requestAnimationFrame: fn => fn(), setTimeout: () => {}
  });
  const app = read("app.js");
  vm.runInContext(app.slice(app.indexOf("  function formatPhilippinesCurrency("), app.indexOf("  function getWealthBalanceFailureReason(")), context);
  return { context, elements };
}

test("PH UI renders native PHP, Sheet CAD secondary values and count; CAD cash and Canada retain their formats", () => {
  const wealth = loadBackendContext().getWealth();
  const { context, elements } = loadPhilippinesView(wealth);
  context.renderWealthView(wealth);
  const html = elements.wealthPhilippinesAccountsList.innerHTML;
  assert.match(html, /Cash — CAD[\s\S]*C\$375\.00/);
  assert.match(html, /Cash — PHP[\s\S]*₱0\.00[\s\S]*≈ C\$0\.00/);
  assert.match(html, /GoTyme[\s\S]*₱123\.00[\s\S]*≈ C\$3\.47/);
  assert.match(html, /GCash[\s\S]*₱2,345\.00[\s\S]*≈ C\$61\.23/);
  assert.equal((html.match(/wealth-account-conversion/g) || []).length, 3);
  assert.equal(elements.wealthAccountsCount.textContent, "16 accounts");
  assert.match(elements.wealthCashAccountsList.innerHTML, /\$400\.00/);
  assert.doesNotMatch(elements.wealthCashAccountsList.innerHTML, /C\$|₱|≈/);
  assert.match(read("index.html"), /PHILIPPINES[\s\S]*id="wealthPhilippinesAccountsList"/);
  // Deliberately unrelated native/CAD fixtures detect frontend FX calculations.
  wealth.philippinesAccounts[2].balance = 999999;
  wealth.philippinesAccounts[2].cadEquivalent = 0.13;
  context.renderWealthView(wealth);
  assert.match(elements.wealthPhilippinesAccountsList.innerHTML, /₱999,999\.00[\s\S]*≈ C\$0\.13/);
  assert.doesNotMatch(read("app.js"), /GOOGLEFINANCE|PHPCAD|exchangeRate|cadEquivalent\s*[*/]|balance\s*[*/].*(?:rate|cadEquivalent)/i);
});

test("PH conversion failures render unavailable instead of fake zero; old snapshots are supported", () => {
  for (const value of ["#N/A", "", null, NaN]) {
    const wealth = loadBackendContext({ cellValues: { J32: value } }).getWealth();
    assert.equal(wealth.philippinesAccounts[2].cadEquivalent, null);
    const { context, elements } = loadPhilippinesView(wealth);
    context.renderWealthView(wealth);
    assert.match(elements.wealthPhilippinesAccountsList.innerHTML, /₱123\.00[\s\S]*CAD equivalent unavailable/);
  }
  const wealth = { accounts: [] };
  const { context, elements } = loadPhilippinesView(wealth);
  context.renderWealthView(wealth);
  assert.equal(elements.wealthAccountsCount.textContent, "0 accounts");
  assert.match(elements.wealthPhilippinesAccountsList.innerHTML, /unavailable/);
});

test("PH click opens existing native editor, PHP label and symbol reset for CAD and Canada", () => {
  const wealth = loadBackendContext().getWealth();
  const { context, elements } = loadPhilippinesView(wealth);
  context.renderWealthView(wealth);
  elements.wealthPhilippinesAccountsList.click({ target: { closest: () => ({ getAttribute: () => "gotyme_php" }) } });
  assert.equal(elements.wealthEditInputLabel.textContent, "PHP Balance");
  assert.equal(elements.wealthEditCurrencySymbol.textContent, "₱");
  assert.equal(elements.wealthEditInput.value, "123.00");
  assert.equal(elements.wealthEditCurrentBalance.textContent, "₱123.00");
  assert.equal(elements.wealthEditSheet.dataset.accountId, "gotyme_php");
  for (const id of ["ph_cash_cad", "simplii_chequing"]) {
    context.openWealthBalanceEditor(id);
    assert.equal(elements.wealthEditInputLabel.textContent, "New balance");
    assert.equal(elements.wealthEditCurrencySymbol.textContent, "$");
    assert.equal(elements.wealthEditInput.value, id === "ph_cash_cad" ? "375.00" : "400.00");
  }
});

test("PH save sends only native money, then replaces state/cache and renders the full authoritative response", async () => {
  for (const [accountId] of PH_ACCOUNTS) {
    const backend = loadBackendContext({ afterFlush: values => { values.J32 = 98.76; } });
    const editor = loadBalanceEditor(backend, { accountId });
    await editor.context.handleSaveWealthBalance();
    const authoritative = editor.getResponse().wealth;
    assert.equal(editor.context.currentWealthData, authoritative);
    assert.deepEqual(editor.calls[0][1].payload, { accountId, balance: 850.5 });
    assert.deepEqual(editor.calls.map(call => call[0]), ["request", "cache", "render", "close", "sync"]);
    assert.equal(editor.calls[1][1], authoritative);
    assert.equal(editor.calls[2][1], authoritative);
    assert.equal(authoritative.philippinesAccounts.find(a => a.id === accountId).balance, 850.5);
    const view = loadPhilippinesView(authoritative);
    view.context.renderWealthView(authoritative);
    assert.match(view.elements.wealthPhilippinesAccountsList.innerHTML, /≈ C\$98\.76/);
  }
});
