const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");

const repositoryRoot = path.resolve(__dirname, "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

function loadProductionBackendContext(scriptProperties = {}) {
  const code = read("apps-script/Code.js");
  const propertiesStore = { ...scriptProperties };

  const context = {
    PropertiesService: {
      getScriptProperties() {
        return {
          getProperty(key) {
            return propertiesStore[key] || null;
          }
        };
      }
    },
    SpreadsheetApp: {
      openById(id) {
        return {
          id,
          getSpreadsheetTimeZone() {
            return "America/Toronto";
          },
          getSheetByName(name) {
            return { name };
          }
        };
      }
    },
    LockService: {
      getScriptLock() {
        return {
          tryLock() {
            return true;
          },
          releaseLock() {}
        };
      }
    },
    CacheService: {
      getScriptCache() {
        return {
          get() {
            return null;
          },
          put() {},
          remove() {}
        };
      }
    },
    Utilities: {
      formatDate(date, tz, fmt) {
        return "2026-09-02";
      },
      getUuid() {
        return "mock-uuid-1234";
      }
    },
    Logger: console
  };

  vm.createContext(context);
  vm.runInContext(code, context, { filename: "apps-script/Code.js" });
  return context;
}

test("production backend reads spreadsheet ID only from Script Properties", () => {
  const code = read("apps-script/Code.js");

  assert.match(
    code,
    /PropertiesService\s*\.getScriptProperties\(\)\s*\.getProperty\(\s*["']PRODUCTION_SPREADSHEET_ID["']\s*\)/
  );
  assert.doesNotMatch(code, /SpreadsheetApp\.getActiveSpreadsheet\(\)/);
});

test("production Spreadsheet ID is not committed in git", () => {
  const trackedFiles = execFileSync("git", ["ls-files", "-z"], {
    cwd: repositoryRoot,
    encoding: "utf8"
  }).split("\0").filter(Boolean);

  for (const file of trackedFiles) {
    if (file.endsWith(".png") || file.endsWith(".jpg")) continue;
    const content = read(file);
    const matches = content.match(/PRODUCTION_SPREADSHEET_ID\s*[:=]\s*["']([^"']+)["']/g) || [];
    for (const match of matches) {
      assert.ok(
        match.includes("REPLACE"),
        `Real production Spreadsheet ID value must not be committed in ${file}: ${match}`
      );
    }
  }
});

test("missing PRODUCTION_SPREADSHEET_ID fails safely with clear error", () => {
  const ctx = loadProductionBackendContext({});

  assert.throws(
    () => ctx.getProductionSpreadsheet_(),
    /PRODUCTION_SPREADSHEET_ID is not configured\./
  );

  assert.throws(
    () => ctx.getExpenseSheet(),
    /PRODUCTION_SPREADSHEET_ID is not configured\./
  );
});

test("configured PRODUCTION_SPREADSHEET_ID binds to the target sheet", () => {
  const ctx = loadProductionBackendContext({
    PRODUCTION_SPREADSHEET_ID: "mock-production-sheet-id"
  });

  const spreadsheet = ctx.getProductionSpreadsheet_();
  assert.equal(spreadsheet.id, "mock-production-sheet-id");

  const sheet = ctx.getExpenseSheet();
  assert.equal(sheet.name, "Spending_Master2026");
});

test("apiRequest uses an explicit allowlist and rejects non-object requests", () => {
  const ctx = loadProductionBackendContext({
    PRODUCTION_SPREADSHEET_ID: "mock-production-sheet-id"
  });

  assert.throws(() => ctx.apiRequest(null), /Request must be an object\./);
  assert.throws(() => ctx.apiRequest([]), /Request must be an object\./);
  assert.throws(() => ctx.apiRequest("getExpenses"), /Request must be an object\./);
  assert.throws(
    () => ctx.apiRequest({ action: "unsupportedAction" }),
    /Unsupported API action: unsupportedAction/
  );
  assert.throws(
    () => ctx.apiRequest({ action: "adminDeleteAll" }),
    /Unsupported API action: adminDeleteAll/
  );
});

test("only getExpenses, addExpense, updateExpense, and deleteExpense actions are exposed", () => {
  const code = read("apps-script/Code.js");
  const actionMatches = [...code.matchAll(/case\s+["']([^"']+)["']\s*:/g)].map(m => m[1]);

  // The switch in apiRequest must expose exactly these actions
  assert.ok(actionMatches.includes("getExpenses"));
  assert.ok(actionMatches.includes("addExpense"));
  assert.ok(actionMatches.includes("updateExpense"));
  assert.ok(actionMatches.includes("deleteExpense"));
});

test("no doPost function exists in production Apps Script", () => {
  const code = read("apps-script/Code.js");
  assert.doesNotMatch(code, /\bfunction\s+doPost\b/);
});

test("executionApi access is MYSELF in production appsscript.json", () => {
  const manifest = JSON.parse(read("apps-script/appsscript.json"));

  assert.equal(manifest.executionApi?.access, "MYSELF");
  assert.equal(manifest.webapp?.access, "MYSELF");
});

test("oauthScopes in production appsscript.json are restricted to spreadsheets", () => {
  const manifest = JSON.parse(read("apps-script/appsscript.json"));

  assert.deepEqual(manifest.oauthScopes, [
    "https://www.googleapis.com/auth/spreadsheets"
  ]);
});

test("production frontend uses the verified production OAuth Client ID", () => {
  const prodClientId = "522582558662-a8vk7etqodg192sl68fe0rp1svo1jnkj.apps.googleusercontent.com";

  const rootConfig = read("config.js");
  const frontendConfig = read("frontend/config.js");

  assert.match(rootConfig, new RegExp(prodClientId));
  assert.match(frontendConfig, new RegExp(prodClientId));
});

test("production frontend uses deployment placeholder and cannot call test backend", () => {
  const testDeploymentId = "AKfycbwfJNXJmThqYxaO2DkekUhjO8K10VhePin3ZkFGS65UhhJ39DtW0YwCx0kVsNio6bZA";

  const rootConfig = read("config.js");
  const frontendConfig = read("frontend/config.js");

  assert.match(rootConfig, /REPLACE_WITH_PRODUCTION_API_DEPLOYMENT_ID/);
  assert.match(frontendConfig, /REPLACE_WITH_PRODUCTION_API_DEPLOYMENT_ID/);

  // Test deployment ID must not be present in production config
  assert.doesNotMatch(rootConfig, new RegExp(testDeploymentId));
  assert.doesNotMatch(frontendConfig, new RegExp(testDeploymentId));
});

test("OAuth tokens remain memory-only in frontend api.js", () => {
  for (const file of ["api.js", "frontend/api.js"]) {
    const content = read(file);
    for (const storage of ["localStorage", "sessionStorage", "indexedDB", "document.cookie"]) {
      assert.equal(content.includes(storage), false, `${file} must not reference ${storage}`);
    }
  }
});

test("no .clasp.json is tracked in git", () => {
  const trackedFiles = execFileSync("git", ["ls-files", "-z"], {
    cwd: repositoryRoot,
    encoding: "utf8"
  }).split("\0").filter(Boolean);

  const claspFiles = trackedFiles.filter(f => f.endsWith(".clasp.json"));
  assert.deepEqual(claspFiles, [], "No .clasp.json may be tracked");
});

test("no client secrets or credentials JSON are committed", () => {
  const trackedFiles = execFileSync("git", ["ls-files", "-z"], {
    cwd: repositoryRoot,
    encoding: "utf8"
  }).split("\0").filter(Boolean);

  const patterns = [
    /GOCSPX-[A-Za-z0-9_-]+/,
    /ya29\.[A-Za-z0-9_-]+/,
    /1\/[A-Za-z0-9_-]{30,}/,
    /-----BEGIN PRIVATE KEY-----/
  ];

  for (const file of trackedFiles) {
    if (file.endsWith(".png") || file.endsWith(".jpg")) continue;
    const content = read(file);
    for (const pattern of patterns) {
      assert.doesNotMatch(content, pattern, `Secret pattern matched in ${file}`);
    }
  }
});
