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
    18925.64, // H14
    137798.17, // I14
    33488.20, // J14
    15527.88, // K14
    27653.19, // L14
    186814.25, // M14
    2408.83, // N14
    4567.77, // O14
    6000.00 // P14
  ];

  const cellValues = Object.assign({
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
    I29: 31902.24
  }, customData.cellValues || {});

  const cellFormulas = Object.assign({
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
    I28: ""
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
  let setValueCount = 0;

  const mockWealthSheet = {
    name: "2026-Budgets",
    getRange(rangeStr) {
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
            setValueCount++;
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
      flush: () => {}
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => {
          lockAcquired = true;
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
    _getLockState: () => ({ lockAcquired, lockReleased }),
    _getCellValues: () => cellValues,
    _getSetValueCount: () => setValueCount
  };

  const vm = require("node:vm");
  vm.createContext(context);
  vm.runInContext(code, context);
  return context;
}

// 1. Exactly nine whitelist entries exist
test("1. exactly nine whitelist entries exist", () => {
  const ctx = loadBackendContext();
  const keys = Object.keys(ctx.WEALTH_EDITABLE_WHITELIST);
  assert.equal(keys.length, 9);
});

// 2. Every one of the nine approved stable IDs maps to its exact expected H/I cells
test("2. every one of the nine approved stable IDs maps to its exact expected H/I cells", () => {
  const ctx = loadBackendContext();
  const expectedMap = {
    eq_tfsa: { nameCell: "H17", balanceCell: "I17", expectedName: "EQ-TFSA" },
    wealthsimple_tfsa: { nameCell: "H18", balanceCell: "I18", expectedName: "WEALTHSIMPLE- TFSA" },
    national_bank_tfsa: { nameCell: "H19", balanceCell: "I19", expectedName: "National Bank TFSA" },
    simplii_chequing: { nameCell: "H23", balanceCell: "I23", expectedName: "Simplii - Che" },
    simplii_savings: { nameCell: "H24", balanceCell: "I24", expectedName: "Simplii - Sav" },
    eq_savings: { nameCell: "H25", balanceCell: "I25", expectedName: "EQ - Sav" },
    eq_bank_card: { nameCell: "H26", balanceCell: "I26", expectedName: "EQ Bank Card" },
    eq_geng_cash: { nameCell: "H27", balanceCell: "I27", expectedName: "EQ - Geng-Cash" },
    td_savings: { nameCell: "H28", balanceCell: "I28", expectedName: "TD - Sav" }
  };
  for (const [id, expected] of Object.entries(expectedMap)) {
    const entry = ctx.WEALTH_EDITABLE_WHITELIST[id];
    assert.ok(entry, `Missing entry for ${id}`);
    assert.equal(entry.id, id);
    assert.equal(entry.nameCell, expected.nameCell);
    assert.equal(entry.balanceCell, expected.balanceCell);
    assert.equal(entry.expectedName, expected.expectedName);
  }
});

// 3. Every approved ID can pass the backend mutation contract in mocks
test("3. every approved ID can pass the backend mutation contract in mocks", () => {
  const ctx = loadBackendContext();
  const keys = Object.keys(ctx.WEALTH_EDITABLE_WHITELIST);
  for (const accountId of keys) {
    const res = ctx.updateWealthAccountBalance({ accountId, balance: 1234.56 });
    assert.equal(res.ok, true);
    assert.ok(res.wealth);
  }
  assert.equal(ctx._getSetValueCount(), 9);
});

// 4. national_bank_fhsa is denied
test("4. national_bank_fhsa is denied", () => {
  const ctx = loadBackendContext();
  assert.throws(() => {
    ctx.updateWealthAccountBalance({ accountId: "national_bank_fhsa", balance: 35000 });
  }, /Invalid or non-editable account/);
  assert.equal(ctx._getSetValueCount(), 0);
});

// 5. national_bank_tfsa_usd is denied
test("5. national_bank_tfsa_usd is denied", () => {
  const ctx = loadBackendContext();
  assert.throws(() => {
    ctx.updateWealthAccountBalance({ accountId: "national_bank_tfsa_usd", balance: 3000 });
  }, /Invalid or non-editable account/);
  assert.equal(ctx._getSetValueCount(), 0);
});

// 6. national_bank_rrsp is denied
test("6. national_bank_rrsp is denied", () => {
  const ctx = loadBackendContext();
  assert.throws(() => {
    ctx.updateWealthAccountBalance({ accountId: "national_bank_rrsp", balance: 16000 });
  }, /Invalid or non-editable account/);
  assert.equal(ctx._getSetValueCount(), 0);
});

// 7. H14, I14, J14, K14, I29, N14, O14 and P14 remain impossible targets
test("7. H14, I14, J14, K14, I29, N14, O14 and P14 remain impossible targets", () => {
  const ctx = loadBackendContext();
  const blockedIds = [
    "availableCash", "tfsa", "fhsa", "rrsp", "totalCash",
    "taxReserve", "incomeTaxCppReserve", "emergencyFund",
    "H14", "I14", "J14", "K14", "I29", "N14", "O14", "P14"
  ];
  for (const blockedId of blockedIds) {
    assert.throws(() => {
      ctx.updateWealthAccountBalance({ accountId: blockedId, balance: 50000 });
    }, /Invalid or non-editable account/);
  }
  assert.equal(ctx._getSetValueCount(), 0);
});

// 8. Row-reorder identity tests still pass
test("8. row-reorder identity tests still pass", () => {
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
    ["TD - Sav", 197.00], // Swapped into row 27 (H27)
    ["EQ - Geng-Cash", 100.24] // Swapped into row 28 (H28)
  ];

  const ctx = loadBackendContext({ accountRows: reorderedRows });
  const wealth = ctx.getWealth();

  const tdAccount = wealth.accounts.find(a => a.id === "td_savings");
  const gengCashAccount = wealth.accounts.find(a => a.id === "eq_geng_cash");

  assert.ok(tdAccount);
  assert.ok(gengCashAccount);

  // Both must be marked read-only because their cells do not match whitelist coordinates
  assert.equal(tdAccount.isEditable, false);
  assert.equal(gengCashAccount.isEditable, false);

  assert.throws(() => {
    ctx.updateWealthAccountBalance({ accountId: "td_savings", balance: 250.00 });
  }, /Account mapping changed\. Balance was not updated\./);
  assert.equal(ctx._getSetValueCount(), 0);
});

// 9. Formula-conversion protection still passes
test("9. formula-conversion protection still passes", () => {
  const ctx = loadBackendContext({ cellFormulas: { I28: "=SUM(A1:A5)" } });
  const wealth = ctx.getWealth();
  const tdAccount = wealth.accounts.find(a => a.id === "td_savings");
  assert.ok(tdAccount);
  assert.equal(tdAccount.isEditable, false);
  assert.equal(tdAccount.isFormula, true);

  assert.throws(() => {
    ctx.updateWealthAccountBalance({ accountId: "td_savings", balance: 250 });
  }, /This value is calculated automatically and cannot be edited\./);
  assert.equal(ctx._getSetValueCount(), 0);
});

// 10. Failed identity validation performs zero writes
test("10. failed identity validation performs zero writes", () => {
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

// 11. Action is named only updateWealthAccountBalance
test("11. action is named only updateWealthAccountBalance", () => {
  const code = read("apps-script/Code.js");
  const apiCode = read("api.js");
  assert.match(code, /case "updateWealthAccountBalance":/);
  assert.match(apiCode, /"updateWealthAccountBalance"/);
  assert.match(apiCode, /async function updateWealthAccountBalance/);
});

// 12. Old provisional action updateWealthBalance is not allowlisted
test("12. old provisional action updateWealthBalance is not allowlisted", () => {
  const code = read("apps-script/Code.js");
  const apiCode = read("api.js");
  assert.doesNotMatch(code, /case "updateWealthBalance":/);
  assert.doesNotMatch(apiCode, /"updateWealthBalance"/);

  const ctx = loadBackendContext();
  assert.throws(() => {
    ctx.apiRequest({ action: "updateWealthBalance", payload: { accountId: "eq_tfsa", balance: 100 } });
  }, /Unsupported API action/);
});

// 13. Frontend renders I20/I21/I22 without edit affordances
test("13. frontend renders I20/I21/I22 without edit affordances", () => {
  const ctx = loadBackendContext();
  const wealth = ctx.getWealth();
  const fhsa = wealth.accounts.find(a => a.id === "national_bank_fhsa");
  const tfsaUsd = wealth.accounts.find(a => a.id === "national_bank_tfsa_usd");
  const rrsp = wealth.accounts.find(a => a.id === "national_bank_rrsp");

  assert.ok(fhsa);
  assert.ok(tfsaUsd);
  assert.ok(rrsp);

  assert.equal(fhsa.isEditable, false);
  assert.equal(tfsaUsd.isEditable, false);
  assert.equal(rrsp.isEditable, false);

  const appCode = read("app.js");
  assert.match(appCode, /renderWealthAccountRow/);
  assert.match(appCode, /const isEditable = Boolean\(a\.isEditable\);/);
});

// 14. Authenticated update required via doPost with updateWealthAccountBalance
test("14. authenticated update required via doPost with updateWealthAccountBalance", () => {
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
});

// 15. Missing device key denied
test("15. missing device key denied", () => {
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

// 16. Invalid device key denied
test("16. invalid device key denied", () => {
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

// 17. GET write attempt denied
test("17. GET write attempt denied", () => {
  const ctx = loadBackendContext();
  const res = ctx.doGet({
    parameter: { action: "updateWealthAccountBalance", accountId: "eq_tfsa", balance: "24000" }
  });
  const parsed = JSON.parse(res.content);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.error, "Unauthorized");
});

// 18. Arbitrary cell or sheet cannot be supplied
test("18. arbitrary cell or sheet cannot be supplied", () => {
  const ctx = loadBackendContext();
  assert.throws(() => {
    ctx.updateWealthAccountBalance({ cell: "A1", balance: 100 });
  }, /Arbitrary sheet or cell coordinates are not permitted|Invalid or non-editable account/);

  assert.throws(() => {
    ctx.updateWealthAccountBalance({ sheet: "Spending_Master2026", accountId: "eq_tfsa", balance: 100 });
  }, /Arbitrary sheet or cell coordinates are not permitted|Invalid or non-editable account/);
});

// 19. Malformed value, NaN, and Infinity denied
test("19. malformed value, NaN, and Infinity denied", () => {
  const ctx = loadBackendContext();
  assert.throws(() => {
    ctx.updateWealthAccountBalance({ accountId: "eq_tfsa", balance: "abc" });
  }, /Invalid balance/);

  assert.throws(() => {
    ctx.updateWealthAccountBalance({ accountId: "eq_tfsa", balance: NaN });
  }, /Invalid balance/);

  assert.throws(() => {
    ctx.updateWealthAccountBalance({ accountId: "eq_tfsa", balance: Infinity });
  }, /Invalid balance/);
});

// 20. Exact safe frontend failure message enforced
test("20. exact safe frontend failure message enforced", () => {
  const appCode = read("app.js");
  assert.match(appCode, /elError\.textContent = "Balance wasn't updated\. Your previous value is unchanged\.";/);
  assert.doesNotMatch(appCode, /elError\.textContent = \(err && err\.message\)/);
});
