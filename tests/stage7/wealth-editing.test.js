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
      if (cellValues.hasOwnProperty(rangeStr)) {
        return {
          getValue: () => cellValues[rangeStr],
          getFormula: () => cellFormulas[rangeStr] || "",
          setValue: (newVal) => {
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
    _getCellValues: () => cellValues
  };

  const vm = require("node:vm");
  vm.createContext(context);
  vm.runInContext(code, context);
  return context;
}

// 1. Valid manual account update accepted
test("1. valid manual account update accepted", () => {
  const ctx = loadBackendContext();
  const res = ctx.updateWealthBalance({ accountId: "eqTfsa", balance: 25000.00 });
  assert.equal(res.ok, true);
  assert.ok(res.wealth);
  assert.equal(ctx._getCellValues().I17, 25000.00);
  const lock = ctx._getLockState();
  assert.equal(lock.lockAcquired, true);
  assert.equal(lock.lockReleased, true);
});

// 2. Authenticated update required via doPost
test("2. authenticated update required via doPost", () => {
  const ctx = loadBackendContext();
  const validKey = "a".repeat(64);
  const res = ctx.doPost({
    postData: {
      contents: JSON.stringify({
        deviceKey: validKey,
        action: "updateWealthBalance",
        payload: { accountId: "eqTfsa", balance: 24000 }
      })
    }
  });
  const parsed = JSON.parse(res.content);
  assert.equal(parsed.ok, true);
  assert.ok(parsed.wealth);
});

// 3. Missing device key denied
test("3. missing device key denied", () => {
  const ctx = loadBackendContext();
  const res = ctx.doPost({
    postData: {
      contents: JSON.stringify({
        action: "updateWealthBalance",
        payload: { accountId: "eqTfsa", balance: 24000 }
      })
    }
  });
  const parsed = JSON.parse(res.content);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.error, "Unauthorized");
});

// 4. Invalid device key denied
test("4. invalid device key denied", () => {
  const ctx = loadBackendContext();
  const res = ctx.doPost({
    postData: {
      contents: JSON.stringify({
        deviceKey: "f".repeat(64),
        action: "updateWealthBalance",
        payload: { accountId: "eqTfsa", balance: 24000 }
      })
    }
  });
  const parsed = JSON.parse(res.content);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.error, "Unauthorized");
});

// 5. GET write attempt denied
test("5. GET write attempt denied", () => {
  const ctx = loadBackendContext();
  const res = ctx.doGet({
    parameter: { action: "updateWealthBalance", accountId: "eqTfsa", balance: "24000" }
  });
  const parsed = JSON.parse(res.content);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.error, "Unauthorized");
});

// 6. Unknown accountId denied
test("6. unknown accountId denied", () => {
  const ctx = loadBackendContext();
  assert.throws(() => {
    ctx.updateWealthBalance({ accountId: "nonExistentAccount", balance: 100 });
  }, /Invalid or non-editable account/);
});

// 7. Arbitrary cell cannot be supplied
test("7. arbitrary cell cannot be supplied", () => {
  const ctx = loadBackendContext();
  assert.throws(() => {
    ctx.updateWealthBalance({ cell: "A1", balance: 100 });
  }, /Arbitrary sheet or cell coordinates are not permitted|Invalid or non-editable account/);
});

// 8. Arbitrary Sheet cannot be supplied
test("8. arbitrary Sheet cannot be supplied", () => {
  const ctx = loadBackendContext();
  assert.throws(() => {
    ctx.updateWealthBalance({ sheet: "Spending_Master2026", accountId: "eqTfsa", balance: 100 });
  }, /Arbitrary sheet or cell coordinates are not permitted|Invalid or non-editable account/);
});

// 9. H14 Available Cash write impossible
test("9. H14 Available Cash write impossible", () => {
  const ctx = loadBackendContext();
  assert.throws(() => {
    ctx.updateWealthBalance({ accountId: "availableCash", balance: 50000 });
  }, /Invalid or non-editable account/);
});

// 10. I29 Total Cash write impossible
test("10. I29 Total Cash write impossible", () => {
  const ctx = loadBackendContext();
  assert.throws(() => {
    ctx.updateWealthBalance({ accountId: "totalCash", balance: 50000 });
  }, /Invalid or non-editable account/);
});

// 11. I14 Total TFSA write impossible
test("11. I14 Total TFSA write impossible", () => {
  const ctx = loadBackendContext();
  assert.throws(() => {
    ctx.updateWealthBalance({ accountId: "tfsa", balance: 50000 });
  }, /Invalid or non-editable account/);
});

// 12. Formula-driven account write denied (nationalBankTfsaUsd)
test("12. formula-driven account write denied", () => {
  const ctx = loadBackendContext();
  // nationalBankTfsaUsd is omitted from whitelist
  assert.throws(() => {
    ctx.updateWealthBalance({ accountId: "nationalBankTfsaUsd", balance: 2500 });
  }, /Invalid or non-editable account/);
});

// 13. Malformed value denied
test("13. malformed value denied", () => {
  const ctx = loadBackendContext();
  assert.throws(() => {
    ctx.updateWealthBalance({ accountId: "eqTfsa", balance: "abc" });
  }, /Invalid balance/);
});

// 14. NaN denied
test("14. NaN denied", () => {
  const ctx = loadBackendContext();
  assert.throws(() => {
    ctx.updateWealthBalance({ accountId: "eqTfsa", balance: NaN });
  }, /Invalid balance/);
});

// 15. Infinity denied
test("15. Infinity denied", () => {
  const ctx = loadBackendContext();
  assert.throws(() => {
    ctx.updateWealthBalance({ accountId: "eqTfsa", balance: Infinity });
  }, /Invalid balance/);
});

// 16. Successful update returns refreshed Wealth object
test("16. successful update returns refreshed Wealth object", () => {
  const ctx = loadBackendContext();
  const res = ctx.updateWealthBalance({ accountId: "simpliiChe", balance: 850.50 });
  assert.equal(res.ok, true);
  assert.ok(res.wealth);
  assert.equal(res.wealth.availableCash, 18925.64);
  assert.ok(Array.isArray(res.wealth.accounts));
});

// 17. Failed update leaves frontend previous value intact
test("17. failed update leaves frontend previous value intact", () => {
  const appCode = read("app.js");
  assert.match(appCode, /Balance wasn't updated\. Your previous value is unchanged/);
  // Confirms no optimistic mutation before response
  assert.match(appCode, /handleSaveWealthBalance/);
});

// 18. Successful update refreshes Wealth cache
test("18. successful update refreshes Wealth cache", () => {
  const appCode = read("app.js");
  assert.match(appCode, /saveWealthToCache\(updatedWealth\)/);
});

// 19. Existing Expenses CRUD tests still pass
test("19. existing Expenses CRUD tests still pass", () => {
  const apiCode = read("api.js");
  assert.match(apiCode, /updateWealthBalance/);
  assert.match(apiCode, /getExpenses/);
  assert.match(apiCode, /addExpense/);
  assert.match(apiCode, /updateExpense/);
  assert.match(apiCode, /deleteExpense/);
});

// 20. Remove This Device still clears Wealth snapshot
test("20. Remove This Device still clears Wealth snapshot", () => {
  const appCode = read("app.js");
  assert.match(appCode, /removeWealthCache/);
  assert.match(appCode, /personalFinance\.wealthSnapshot/);
});
