const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repositoryRoot = path.resolve(__dirname, "..", "..");
const backendSource = fs.readFileSync(
  path.join(repositoryRoot, "test-apps-script", "Code.js"),
  "utf8"
);
const headers = [
  "ID",
  "Date",
  "Cost",
  "Bucket",
  "Category",
  "Item",
  "Notes",
  "Payment Method"
];

function createHarness(options = {}) {
  const rows = [
    headers.slice(),
    [
      "fake-001",
      "2026-01-15",
      12.34,
      "Play",
      "Eating Out",
      "POC lunch",
      "Synthetic test record",
      "Credit Card"
    ]
  ];
  const lockEvents = [];
  let generatedId = 1;

  class FakeRange {
    constructor(row, column, rowCount, columnCount) {
      this.row = row;
      this.column = column;
      this.rowCount = rowCount;
      this.columnCount = columnCount;
    }

    getValues() {
      return Array.from({ length: this.rowCount }, (_, rowOffset) =>
        Array.from({ length: this.columnCount }, (_, columnOffset) => {
          const sourceRow = rows[this.row - 1 + rowOffset] || [];
          return sourceRow[this.column - 1 + columnOffset] ?? "";
        })
      );
    }

    setValues(values) {
      assert.equal(values.length, this.rowCount);
      values.forEach((valueRow, rowOffset) => {
        assert.equal(valueRow.length, this.columnCount);
        const targetIndex = this.row - 1 + rowOffset;
        rows[targetIndex] = rows[targetIndex] || [];
        valueRow.forEach((value, columnOffset) => {
          rows[targetIndex][this.column - 1 + columnOffset] = value;
        });
      });
    }
  }

  const sheet = {
    getLastRow() {
      return rows.length;
    },
    getRange(row, column, rowCount, columnCount) {
      return new FakeRange(row, column, rowCount, columnCount);
    },
    appendRow(row) {
      rows.push(row.slice());
    },
    deleteRow(rowNumber) {
      rows.splice(rowNumber - 1, 1);
    }
  };

  const spreadsheet = {
    getName() {
      return options.spreadsheetTitle || "Stage 2 Auth POC - Personal Finance";
    },
    getSheetByName(name) {
      return name === "Spending_Master2026" ? sheet : null;
    }
  };

  const context = vm.createContext({
    LockService: {
      getScriptLock() {
        return {
          waitLock(timeout) {
            lockEvents.push(["wait", timeout]);
          },
          releaseLock() {
            lockEvents.push(["release"]);
          }
        };
      }
    },
    SpreadsheetApp: {
      openById(id) {
        assert.equal(id, "1hM8q7JhuZbUmQjJC5Mwx78vC5YBVSOVI6hTOlYmOyDc");
        return spreadsheet;
      }
    },
    Utilities: {
      formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
      },
      getUuid() {
        return `poc${String(generatedId++).padStart(5, "0")}-0000-0000-0000-000000000000`;
      }
    }
  });

  vm.runInContext(backendSource, context, {
    filename: "test-apps-script/Code.js"
  });

  return {
    apiRequest: context.apiRequest,
    lockEvents,
    rows
  };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function validExpense(overrides = {}) {
  return {
    date: "2026-02-15",
    cost: "12.34",
    bucket: "Play",
    category: "Eating Out",
    item: "POC test item",
    notes: "Synthetic test record",
    paymentMethod: "Credit Card",
    ...overrides
  };
}

test("apiRequest is the only top-level callable function", () => {
  const topLevelFunctions = Array.from(
    backendSource.matchAll(/^function\s+([A-Za-z0-9_$]+)\s*\(/gm),
    match => match[1]
  );

  assert.deepEqual(topLevelFunctions, ["apiRequest"]);
});

test("apiRequest rejects unsupported actions", () => {
  const harness = createHarness();
  assert.throws(
    () => harness.apiRequest({ action: "getScriptProperties", payload: {} }),
    /Unsupported API action\./
  );
});

test("fake-sheet CRUD preserves immutable IDs and uses locks", () => {
  const harness = createHarness();
  const initial = plain(harness.apiRequest({ action: "getExpenses", payload: {} }));
  assert.equal(initial.expenses.length, 1);

  const addResult = plain(harness.apiRequest({
    action: "addExpense",
    payload: validExpense()
  }));
  const addedId = addResult.result.id;
  assert.match(addedId, /^poc\d{5}$/);

  const afterAdd = plain(harness.apiRequest({ action: "getExpenses", payload: {} }));
  assert.equal(afterAdd.expenses.length, 2);
  assert.equal(afterAdd.expenses.find(expense => expense.id === addedId).cost, 12.34);

  harness.apiRequest({
    action: "updateExpense",
    payload: validExpense({ id: addedId, cost: "19.99", item: "Updated POC item" })
  });
  const updatedRow = harness.rows.find(row => row[0] === addedId);
  assert.equal(updatedRow[0], addedId);
  assert.equal(updatedRow[2], 19.99);
  assert.equal(updatedRow[5], "Updated POC item");

  harness.apiRequest({ action: "deleteExpense", payload: { id: addedId } });
  assert.equal(harness.rows.some(row => row[0] === addedId), false);
  assert.deepEqual(harness.lockEvents, [
    ["wait", 10000], ["release"],
    ["wait", 10000], ["release"],
    ["wait", 10000], ["release"]
  ]);
});

test("impossible dates are rejected before any write", () => {
  const harness = createHarness();
  const rowCount = harness.rows.length;

  assert.throws(
    () => harness.apiRequest({
      action: "addExpense",
      payload: validExpense({ date: "2026-02-31" })
    }),
    /Invalid date\./
  );
  assert.equal(harness.rows.length, rowCount);
  assert.deepEqual(harness.lockEvents, []);
});

test("invalid bucket and category pairs are rejected before any write", () => {
  const harness = createHarness();
  const rowCount = harness.rows.length;

  assert.throws(
    () => harness.apiRequest({
      action: "addExpense",
      payload: validExpense({ bucket: "Play", category: "Grocery" })
    }),
    /does not belong/
  );
  assert.equal(harness.rows.length, rowCount);
  assert.deepEqual(harness.lockEvents, []);
});

test("invalid and negative costs are rejected before any write", () => {
  const harness = createHarness();
  const rowCount = harness.rows.length;

  for (const cost of ["not-a-number", "-1", "0"]) {
    assert.throws(
      () => harness.apiRequest({
        action: "addExpense",
        payload: validExpense({ cost })
      }),
      /valid cost/
    );
  }
  assert.equal(harness.rows.length, rowCount);
  assert.deepEqual(harness.lockEvents, []);
});

test("backend refuses a spreadsheet outside the named test boundary", () => {
  const harness = createHarness({ spreadsheetTitle: "Personal Finance Production" });

  assert.throws(
    () => harness.apiRequest({ action: "getExpenses", payload: {} }),
    /Refusing to access a spreadsheet outside the Stage 2 test boundary\./
  );
});
