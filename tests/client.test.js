const test = require("node:test");
const assert = require("node:assert/strict");
const { loadClient } = require("./helpers/load-app-source");

const client = loadClient();

test("currency values normalize through integer cents", () => {
  assert.equal(client.moneyToCents(10.075), 1008);
  assert.equal(client.normalizeMoney(10.075), 10.08);
  assert.equal(client.normalizeMoney("19.99"), 19.99);
});

test("total calculations avoid floating-point drift", () => {
  const total = client.calculateTotal([
    { cost: 0.1 },
    { cost: 0.2 },
    { cost: "19.99" }
  ]);

  assert.equal(total, 20.29);
});

test("grouped financial totals use normalized cents", () => {
  const grouped = client.aggregateExpenses(
    [
      { bucket: "Play", cost: 0.1 },
      { bucket: "Play", cost: 0.2 }
    ],
    expense => expense.bucket
  );

  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].label, "Play");
  assert.equal(grouped[0].value, 0.3);
});

test("custom date-range filtering is inclusive", () => {
  const state = {
    dateRange: "custom",
    startDate: "2026-02-01",
    endDate: "2026-02-28"
  };

  assert.equal(
    client.matchesDateRange({ date: "2026-02-01" }, state),
    true
  );
  assert.equal(
    client.matchesDateRange({ date: "2026-02-28" }, state),
    true
  );
  assert.equal(
    client.matchesDateRange({ date: "2026-03-01" }, state),
    false
  );
});

test("month filtering compares the transaction month", () => {
  assert.equal(client.matchesMonth({ date: "2026-03-15" }, "3"), true);
  assert.equal(client.matchesMonth({ date: "2026-04-15" }, "3"), false);
  assert.equal(client.matchesMonth({ date: "2026-04-15" }, ""), true);
});

test("year filtering compares the transaction year", () => {
  assert.equal(client.matchesYear({ date: "2026-03-15" }, "2026"), true);
  assert.equal(client.matchesYear({ date: "2025-03-15" }, "2026"), false);
  assert.equal(client.matchesYear({ date: "2025-03-15" }, ""), true);
});

test("sorting orders expenses newest date first", () => {
  const expenses = [
    { id: "older", date: "2025-12-31" },
    { id: "newest", date: "2026-09-02" },
    { id: "middle", date: "2026-01-01" }
  ];

  const sortedIds = expenses
    .slice()
    .sort(client.compareExpensesNewestFirst)
    .map(expense => expense.id);

  assert.deepEqual(sortedIds, ["newest", "middle", "older"]);
});
