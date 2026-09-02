const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repositoryRoot = path.resolve(__dirname, "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

function loadApiContext(overrides = {}) {
  const code = read("api.js");
  const moduleObj = { exports: {} };
  const mockStorageMap = new Map(overrides.initialStorage ? Object.entries(overrides.initialStorage) : []);
  const requestsMade = [];

  const mockStorage = {
    getItem(key) {
      return mockStorageMap.has(key) ? mockStorageMap.get(key) : null;
    },
    setItem(key, value) {
      mockStorageMap.set(key, String(value));
    },
    removeItem(key) {
      mockStorageMap.delete(key);
    },
    clear() {
      mockStorageMap.clear();
    }
  };

  const userFetch = overrides.fetch || (async () => ({
    status: 200,
    ok: true,
    json: async () => ({ ok: true, expenses: [], result: true })
  }));

  const instrumentedFetch = async (url, opts) => {
    requestsMade.push({ url, opts, body: opts && opts.body ? JSON.parse(opts.body) : null });
    return userFetch(url, opts);
  };

  const context = {
    module: moduleObj,
    exports: moduleObj.exports,
    window: {
      localStorage: mockStorage,
      FINANCE_APP_CONFIG: Object.freeze({
        environment: "production",
        webAppEndpointUrl: overrides.webAppEndpointUrl || "https://script.google.com/macros/s/TEST_DEPLOYMENT_ID/exec",
        oauthClientId: "522582558662-a8vk7etqodg192sl68fe0rp1svo1jnkj.apps.googleusercontent.com",
        apiExecutableDeploymentId: "AKfycbxKhDN9cPwe7sy_CD8FjUiEMWQdL0buAcxMgp4CaRSxL7sXbsDeIv0N8jusxeO8Vk1o"
      }),
      fetch: instrumentedFetch
    },
    fetch: instrumentedFetch,
    console,
    Date
  };


  vm.createContext(context);
  vm.runInContext(code, context);

  return {
    financeApi: moduleObj.exports.financeApi || moduleObj.exports,
    getRequests: () => requestsMade,
    storage: mockStorageMap
  };
}

const VALID_TEST_KEY = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";

// 1. no device key in Git/config
test("no device key in Git/config", () => {
  const config = read("config.js");
  const frontendConfig = read("frontend/config.js");
  assert.doesNotMatch(config, /[a-f0-9]{64}/i, "config.js must not contain any 64-char hex key");
  assert.doesNotMatch(frontendConfig, /[a-f0-9]{64}/i, "frontend/config.js must not contain any 64-char hex key");
});

// 2. no device key in manifest
test("no device key in manifest", () => {
  const manifest = read("manifest.webmanifest");
  assert.doesNotMatch(manifest, /[a-f0-9]{64}/i, "manifest.webmanifest must not contain any device key");
});

// 3. no device key in service worker
test("no device key in service worker", () => {
  const sw = read("sw.js");
  assert.doesNotMatch(sw, /[a-f0-9]{64}/i, "sw.js must not contain any device key");
  assert.doesNotMatch(sw, /deviceKey/i, "sw.js must not handle device key");
});

// 4. device key stored only through runtime localStorage API
test("device key stored only through runtime localStorage API", () => {
  const { financeApi, storage } = loadApiContext();
  assert.equal(financeApi.hasDeviceKey(), false);

  financeApi.setDeviceKey(VALID_TEST_KEY);
  assert.equal(financeApi.hasDeviceKey(), true);
  assert.equal(financeApi.getDeviceKey(), VALID_TEST_KEY.toLowerCase());
  assert.equal(storage.get("personalFinance.deviceKey"), VALID_TEST_KEY.toLowerCase());

  financeApi.clearDeviceKey();
  assert.equal(financeApi.hasDeviceKey(), false);
  assert.equal(storage.has("personalFinance.deviceKey"), false);
});

// 5. missing key shows setup screen
test("missing key prevents API calls with clear error", async () => {
  const { financeApi } = loadApiContext();
  assert.equal(financeApi.hasDeviceKey(), false);

  await assert.rejects(
    async () => await financeApi.getExpenses(),
    /Device is not configured/
  );
});

// 6. valid-format key can be saved
test("valid-format key can be saved successfully", () => {
  const { financeApi } = loadApiContext();
  const saved = financeApi.setDeviceKey(VALID_TEST_KEY);
  assert.equal(saved, true);
  assert.equal(financeApi.getDeviceKey(), VALID_TEST_KEY.toLowerCase());
});

// 7. invalid-format key rejected
test("invalid-format key rejected by setDeviceKey", () => {
  const { financeApi } = loadApiContext();
  assert.throws(
    () => financeApi.setDeviceKey("short-key"),
    /Invalid device key format/
  );
  assert.throws(
    () => financeApi.setDeviceKey("g".repeat(64)), // non-hex
    /Invalid device key format/
  );
  assert.throws(
    () => financeApi.setDeviceKey(""),
    /Invalid device key format/
  );
});

// 8. Unauthorized server response clears invalid key
test("Unauthorized server response clears invalid key locally", async () => {
  const { financeApi, storage } = loadApiContext({
    initialStorage: { "personalFinance.deviceKey": VALID_TEST_KEY },
    fetch: async () => ({
      status: 200,
      ok: true,
      json: async () => ({ ok: false, error: "Unauthorized" })
    })
  });

  assert.equal(financeApi.hasDeviceKey(), true);

  await assert.rejects(
    async () => await financeApi.getExpenses(),
    /Unauthorized: Invalid device key/
  );

  assert.equal(financeApi.hasDeviceKey(), false);
  assert.equal(storage.has("personalFinance.deviceKey"), false);
});

// 9. normal startup with stored key immediately calls getExpenses
test("normal startup with stored key immediately calls getExpenses", async () => {
  let endpointCalled = null;
  const { financeApi } = loadApiContext({
    initialStorage: { "personalFinance.deviceKey": VALID_TEST_KEY },
    fetch: async (url) => {
      endpointCalled = url;
      return {
        status: 200,
        ok: true,
        json: async () => ({ ok: true, expenses: [{ id: "test-1", item: "Coffee" }] })
      };
    }
  });

  const expenses = await financeApi.getExpenses();
  assert.ok(endpointCalled.startsWith("https://script.google.com/"));
  assert.equal(expenses.length, 1);
  assert.equal(expenses[0].item, "Coffee");
});

// 10. normal startup does not initialize GIS OAuth
test("normal startup does not initialize GIS OAuth", () => {
  const indexHtml = read("index.html");
  assert.doesNotMatch(indexHtml, /accounts\.google\.com\/gsi\/client/, "GIS client must not be in index.html");
});

// 11. all API actions use POST
test("all API actions use POST method", async () => {
  const methods = [];
  const { financeApi } = loadApiContext({
    initialStorage: { "personalFinance.deviceKey": VALID_TEST_KEY },
    fetch: async (url, opts) => {
      methods.push(opts.method);
      return {
        status: 200,
        ok: true,
        json: async () => ({ ok: true, expenses: [], result: true })
      };
    }
  });

  await financeApi.getExpenses();
  await financeApi.addExpense({ item: "A" });
  await financeApi.updateExpense({ id: "1", item: "B" });
  await financeApi.deleteExpense("1");

  assert.equal(methods.length, 4);
  assert.ok(methods.every(m => m === "POST"), "All requests must be POST");
});

// 12. Content-Type is text/plain;charset=utf-8
test("Content-Type is text/plain;charset=utf-8 to prevent CORS preflight", async () => {
  let usedContentType = null;
  const { financeApi } = loadApiContext({
    initialStorage: { "personalFinance.deviceKey": VALID_TEST_KEY },
    fetch: async (url, opts) => {
      usedContentType = opts.headers["Content-Type"];
      return {
        status: 200,
        ok: true,
        json: async () => ({ ok: true, expenses: [] })
      };
    }
  });

  await financeApi.getExpenses();
  assert.equal(usedContentType, "text/plain;charset=utf-8");
});

// 13. device key never appears in URL
test("device key never appears in URL", async () => {
  let calledUrl = null;
  const { financeApi } = loadApiContext({
    initialStorage: { "personalFinance.deviceKey": VALID_TEST_KEY },
    fetch: async (url) => {
      calledUrl = url;
      return {
        status: 200,
        ok: true,
        json: async () => ({ ok: true, expenses: [] })
      };
    }
  });

  await financeApi.getExpenses();
  assert.doesNotMatch(calledUrl, new RegExp(VALID_TEST_KEY, "i"));
  assert.equal(calledUrl.includes("?"), false, "URL must not contain query parameters");
});

// 14. device key never uses a custom header
test("device key never uses a custom header", async () => {
  let headersUsed = null;
  const { financeApi } = loadApiContext({
    initialStorage: { "personalFinance.deviceKey": VALID_TEST_KEY },
    fetch: async (url, opts) => {
      headersUsed = opts.headers;
      return {
        status: 200,
        ok: true,
        json: async () => ({ ok: true, expenses: [] })
      };
    }
  });

  await financeApi.getExpenses();
  assert.equal(headersUsed["X-Device-Key"], undefined);
  assert.equal(headersUsed["Authorization"], undefined);
});

// 15. service worker excludes API requests
test("service worker excludes API requests and external hosts", () => {
  const sw = read("sw.js");
  assert.match(sw, /url\.origin\s*!==\s*self\.location\.origin/);
  assert.match(sw, /event\.request\.method\s*!==\s*["']GET["']/);
});

// 16. getExpenses works through device-key transport
test("getExpenses returns parsed expense array through device-key transport", async () => {
  const mockList = [{ id: "exp-1", item: "Groceries", cost: 54.21 }];
  const { financeApi, getRequests } = loadApiContext({
    initialStorage: { "personalFinance.deviceKey": VALID_TEST_KEY },
    fetch: async () => ({
      status: 200,
      ok: true,
      json: async () => ({ ok: true, expenses: mockList })
    })
  });

  const res = await financeApi.getExpenses();
  assert.deepEqual(res, mockList);
  const requests = getRequests();
  assert.equal(requests[0].body.action, "getExpenses");
  assert.equal(requests[0].body.deviceKey, VALID_TEST_KEY.toLowerCase());
});

// 17. Add/Edit/Delete route to existing business functions
test("Add/Edit/Delete route to correct action and payload", async () => {
  const { financeApi, getRequests } = loadApiContext({
    initialStorage: { "personalFinance.deviceKey": VALID_TEST_KEY },
    fetch: async () => ({
      status: 200,
      ok: true,
      json: async () => ({ ok: true, result: true })
    })
  });

  await financeApi.addExpense({ item: "Milk", cost: 3.5 });
  await financeApi.updateExpense({ id: "10", item: "Oat Milk", cost: 4.5 });
  await financeApi.deleteExpense("10");

  const reqs = getRequests();
  assert.equal(reqs[0].body.action, "addExpense");
  assert.equal(reqs[0].body.payload.item, "Milk");

  assert.equal(reqs[1].body.action, "updateExpense");
  assert.equal(reqs[1].body.payload.item, "Oat Milk");

  assert.equal(reqs[2].body.action, "deleteExpense");
  assert.equal(reqs[2].body.payload.id, "10");
});

// 18. invalid key is rejected server-side
test("server doPost rejects missing or incorrect device key", () => {
  const backendCode = read("apps-script/Code.js");
  assert.match(backendCode, /PERSONAL_APP_DEVICE_KEY/);
  assert.match(backendCode, /suppliedKey.*!==.*configuredKey/i);
  assert.match(backendCode, /"Unauthorized"/);
});


// 19. unknown action rejected
test("unknown action rejected by runApi", async () => {
  const { financeApi } = loadApiContext({
    initialStorage: { "personalFinance.deviceKey": VALID_TEST_KEY }
  });

  await assert.rejects(
    async () => await financeApi.runApi("unsupportedAction", {}),
    /Unsupported API action/
  );
});

// 20. finance calculations remain unchanged
test("finance calculations remain unchanged", () => {
  const { loadClient } = require("../helpers/load-app-source");
  const client = loadClient();
  assert.equal(client.moneyToCents(10.075), 1008);
  assert.equal(client.normalizeMoney(10.075), 10.08);
  assert.equal(client.calculateTotal([ { cost: 0.1 }, { cost: 0.2 }, { cost: "19.99" } ]), 20.29);
});


// 21. PWA manifest remains standalone
test("PWA manifest remains standalone and configured", () => {
  const manifest = JSON.parse(read("manifest.webmanifest"));
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
});

// 22. existing production config contains no secrets
test("existing production config contains no secrets or device keys", () => {
  const config = read("config.js");
  assert.doesNotMatch(config, /PERSONAL_APP_DEVICE_KEY/);
  assert.doesNotMatch(config, /[a-f0-9]{64}/i);
});
