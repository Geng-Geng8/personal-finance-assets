const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.resolve(__dirname, "../../apps-script/Code.js"), "utf8");
const TEST_DEVICE_KEY = "a".repeat(64);
const ACTIONS = [
  "getExpenses", "addExpense", "updateExpense", "deleteExpense",
  "getWealth", "updateWealthAccountBalance", "updateWealthReserve",
  "getSpendingBuckets", "updateSpendingBuckets"
];

function loadBackend() {
  const calls = [];
  const forbiddenService = new Proxy({}, {
    get() { throw new Error("GET must not access HTML or financial services"); }
  });
  const context = vm.createContext({
    HtmlService: forbiddenService,
    SpreadsheetApp: forbiddenService,
    LockService: forbiddenService,
    CacheService: forbiddenService,
    PropertiesService: forbiddenService,
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput(text) {
        return {
          text,
          setMimeType(mimeType) { this.mimeType = mimeType; return this; }
        };
      }
    }
  });
  vm.runInContext(source, context, { filename: "apps-script/Code.js" });
  for (const action of ACTIONS) {
    context[action] = payload => {
      calls.push({ action, payload });
      if (action === "getExpenses") return [];
      if (action === "getWealth") return { marker: "synthetic-wealth" };
      if (action === "getSpendingBuckets") return { marker: "synthetic-buckets" };
      if (action.startsWith("updateWealth")) return { ok: true, wealth: { marker: action } };
      if (action === "updateSpendingBuckets") return { ok: true, buckets: { marker: action } };
      return { success: true, id: "synthetic-expense" };
    };
  }
  return { context, calls };
}

function enableTestAuthentication(context) {
  context.PropertiesService = {
    getScriptProperties() {
      return {
        getProperty(name) {
          assert.equal(name, "PERSONAL_APP_DEVICE_KEY");
          return TEST_DEVICE_KEY;
        }
      };
    }
  };
}

function post(context, body) {
  return JSON.parse(context.doPost({ postData: { contents: JSON.stringify(body) } }).text);
}

function assertDeniedGet(context, event) {
  const response = context.doGet(event);
  assert.equal(response.mimeType, "application/json");
  assert.deepEqual(JSON.parse(response.text), { ok: false, error: "Unauthorized" });
}

test("ordinary GET returns non-financial JSON without rendering the legacy HTML UI", () => {
  const { context, calls } = loadBackend();
  for (const event of [undefined, null, {}, { parameter: {} }]) {
    assertDeniedGet(context, event);
  }
  assert.deepEqual(calls, []);
});

test("GET action and function parameters remain denied for every financial action", () => {
  const { context, calls } = loadBackend();
  for (const action of [...ACTIONS, "include", "unknown", ""]) {
    for (const field of ["action", "function"]) {
      assertDeniedGet(context, { parameter: { [field]: action } });
    }
  }
  assert.deepEqual(calls, []);
});

test("GET ignores credentials, payloads and path information without accessing financial services", () => {
  const { context, calls } = loadBackend();
  for (const action of ACTIONS) {
    const body = { deviceKey: TEST_DEVICE_KEY, action, payload: { id: "synthetic-expense" } };
    assertDeniedGet(context, {
      parameter: body,
      parameters: { action: [action], deviceKey: [TEST_DEVICE_KEY] },
      pathInfo: "Index",
      postData: { contents: JSON.stringify(body) }
    });
  }
  assert.deepEqual(calls, []);
});

test("authenticated POST still dispatches all existing financial actions and response envelopes", () => {
  const { context, calls } = loadBackend();
  enableTestAuthentication(context);
  for (const action of ACTIONS) {
    const payload = { id: "synthetic-expense", forceRefresh: true };
    const result = post(context, { deviceKey: TEST_DEVICE_KEY, action, payload });
    assert.equal(result.ok, true);
    const expected = action === "getExpenses" ? { expenses: [] }
      : action === "getWealth" ? { wealth: { marker: "synthetic-wealth" } }
      : action === "getSpendingBuckets" ? { buckets: { marker: "synthetic-buckets" } }
      : action.startsWith("updateWealth") ? { wealth: { marker: action } }
      : action === "updateSpendingBuckets" ? { buckets: { marker: action } }
      : { result: { success: true, id: "synthetic-expense" } };
    assert.deepEqual(result, { ok: true, ...expected });
    const call = calls.at(-1);
    assert.equal(call.action, action);
    if (action === "getExpenses") assert.equal(call.payload, true);
    else if (action === "deleteExpense") assert.equal(call.payload, payload.id);
    else if (!action.startsWith("get")) assert.deepEqual(JSON.parse(JSON.stringify(call.payload)), payload);
  }
  assert.equal(calls.length, ACTIONS.length);
});

test("POST with missing or invalid device keys never dispatches financial actions", () => {
  const { context, calls } = loadBackend();
  enableTestAuthentication(context);
  for (const action of ACTIONS) {
    for (const deviceKey of [undefined, null, "", "short", "b".repeat(64)]) {
      assert.deepEqual(post(context, { deviceKey, action, payload: {} }), {
        ok: false, error: "Unauthorized"
      });
    }
  }
  assert.deepEqual(calls, []);
});

test("financial POST allowlist is exactly unchanged and rejects non-allowlisted functions", () => {
  const { context, calls } = loadBackend();
  enableTestAuthentication(context);
  const routedActions = [...context.apiRequest.toString().matchAll(/case\s+["']([^"']+)["']\s*:/g)]
    .map(match => match[1]);
  assert.deepEqual(routedActions.sort(), [...ACTIONS].sort());
  for (const action of ["unknown", "include", "getProductionSpreadsheet_", "setValue", "doGet", ""]) {
    assert.deepEqual(post(context, { deviceKey: TEST_DEVICE_KEY, action, payload: {} }), {
      ok: false, error: "Unsupported API action: " + action
    });
  }
  assert.deepEqual(calls, []);
});
