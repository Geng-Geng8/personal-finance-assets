const test = require("node:test");
const assert = require("node:assert/strict");
const { loadBackend } = require("./helpers/load-app-source");

const backend = loadBackend();

test("parseExpenseDate accepts a valid calendar date", () => {
  const date = backend.parseExpenseDate("2026-09-02");

  assert.equal(date.getFullYear(), 2026);
  assert.equal(date.getMonth(), 8);
  assert.equal(date.getDate(), 2);
  assert.equal(date.getHours(), 12);
});

test("parseExpenseDate rejects impossible calendar dates", () => {
  assert.throws(
    () => backend.parseExpenseDate("2026-02-31"),
    /Invalid date\./
  );
  assert.throws(
    () => backend.parseExpenseDate("2026-13-01"),
    /Invalid date\./
  );
});

test("parseExpenseDate handles leap years", () => {
  const leapDay = backend.parseExpenseDate("2024-02-29");

  assert.equal(leapDay.getFullYear(), 2024);
  assert.equal(leapDay.getMonth(), 1);
  assert.equal(leapDay.getDate(), 29);
  assert.throws(
    () => backend.parseExpenseDate("2026-02-29"),
    /Invalid date\./
  );
});

test("server money normalization rounds to integer cents", () => {
  assert.equal(backend.moneyToCents_(10.075), 1008);
  assert.equal(backend.normalizeMoney_(10.075), 10.08);
  assert.equal(backend.normalizeMoney_("19.99"), 19.99);
});
