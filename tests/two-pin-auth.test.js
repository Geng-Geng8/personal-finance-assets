const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repositoryRoot = path.resolve(__dirname, "..");

function loadBackendContext() {
  const code = fs.readFileSync(path.join(repositoryRoot, "apps-script", "Code.js"), "utf8");
  const propertiesStore = {
    PERSONAL_APP_DEVICE_KEY: "a".repeat(64)
  };

  const context = {
    console,
    Date,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key) => propertiesStore[key] || null
      })
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => true,
        waitLock: () => true,
        releaseLock: () => true
      })
    },
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput: (content) => ({
        content,
        getContent: function() { return this.content; },
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
    }
  };

  vm.createContext(context);
  vm.runInContext(code, context);
  return context;
}

test("Two-PIN: MASTER_PIN and GUEST_PIN constants are defined in Code.js", () => {
  const context = loadBackendContext();
  const masterPin = vm.runInContext("MASTER_PIN", context);
  const guestPin = vm.runInContext("GUEST_PIN", context);
  assert.equal(masterPin, "1234");
  assert.equal(guestPin, "8888");
});

test("Two-PIN: doGet rejects missing or invalid PIN", () => {
  const context = loadBackendContext();

  // Missing pin with action getExpenses
  const resMissing = context.doGet({ parameter: { action: "getExpenses" } });
  const parsedMissing = JSON.parse(resMissing.content);
  assert.equal(parsedMissing.ok, false);
  assert.equal(parsedMissing.error, "Unauthorized");

  // Invalid pin with action getExpenses
  const resInvalid = context.doGet({ parameter: { action: "getExpenses", pin: "0000" } });
  const parsedInvalid = JSON.parse(resInvalid.content);
  assert.equal(parsedInvalid.ok, false);
  assert.equal(parsedInvalid.error, "Unauthorized");

  // Missing pin with action getWealth
  const resWealthMissing = context.doGet({ parameter: { action: "getWealth" } });
  const parsedWealthMissing = JSON.parse(resWealthMissing.content);
  assert.equal(parsedWealthMissing.ok, false);
  assert.equal(parsedWealthMissing.error, "Unauthorized");
});

test("Two-PIN: doGet allows both Master and Guest PINs for getExpenses and getWealth", () => {
  const context = loadBackendContext();

  // Mock getExpenses and getWealth on context
  context.getExpenses = () => [{ id: "exp-1", item: "Test expense" }];
  context.getWealth = () => ({ netWorth: 100000, accounts: [] });

  // Master PIN getExpenses
  const resMasterExp = context.doGet({ parameter: { action: "getExpenses", pin: "1234" } });
  const parsedMasterExp = JSON.parse(resMasterExp.content);
  assert.equal(parsedMasterExp.ok, true);
  assert.equal(parsedMasterExp.expenses.length, 1);

  // Guest PIN getExpenses
  const resGuestExp = context.doGet({ parameter: { action: "getExpenses", pin: "8888" } });
  const parsedGuestExp = JSON.parse(resGuestExp.content);
  assert.equal(parsedGuestExp.ok, true);
  assert.equal(parsedGuestExp.expenses.length, 1);

  // Master PIN getWealth
  const resMasterWealth = context.doGet({ parameter: { action: "getWealth", pin: "1234" } });
  const parsedMasterWealth = JSON.parse(resMasterWealth.content);
  assert.equal(parsedMasterWealth.ok, true);
  assert.equal(parsedMasterWealth.wealth.netWorth, 100000);

  // Guest PIN getWealth
  const resGuestWealth = context.doGet({ parameter: { action: "getWealth", pin: "8888" } });
  const parsedGuestWealth = JSON.parse(resGuestWealth.content);
  assert.equal(parsedGuestWealth.ok, true);
  assert.equal(parsedGuestWealth.wealth.netWorth, 100000);

  // Verify PIN endpoint
  const resVerifyGuest = context.doGet({ parameter: { pin: "8888" } });
  const parsedVerifyGuest = JSON.parse(resVerifyGuest.content);
  assert.equal(parsedVerifyGuest.ok, true);
  assert.equal(parsedVerifyGuest.role, "guest");

  const resVerifyMaster = context.doGet({ parameter: { pin: "1234" } });
  const parsedVerifyMaster = JSON.parse(resVerifyMaster.content);
  assert.equal(parsedVerifyMaster.ok, true);
  assert.equal(parsedVerifyMaster.role, "master");
});

test("Two-PIN: doGet rejects mutating actions even with valid PIN", () => {
  const context = loadBackendContext();
  const res = context.doGet({ parameter: { action: "addExpense", pin: "1234" } });
  const parsed = JSON.parse(res.content);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.error, "Unauthorized");
});

test("Two-PIN: doPost strictly blocks Guest PIN for mutating actions with 'Read-only access'", () => {
  const context = loadBackendContext();

  // Guest attempting updateWealthAccountBalance
  const resWealth = context.doPost({
    postData: {
      contents: JSON.stringify({
        pin: "8888",
        action: "updateWealthAccountBalance",
        payload: { accountId: "simplii_chequing", balance: 100 }
      })
    }
  });
  const parsedWealth = JSON.parse(resWealth.content);
  assert.equal(parsedWealth.ok, false);
  assert.equal(parsedWealth.error, "Read-only access");

  // Guest attempting addExpense
  const resAdd = context.doPost({
    postData: {
      contents: JSON.stringify({
        pin: "8888",
        action: "addExpense",
        payload: { item: "Coffee", cost: 5 }
      })
    }
  });
  const parsedAdd = JSON.parse(resAdd.content);
  assert.equal(parsedAdd.ok, false);
  assert.equal(parsedAdd.error, "Read-only access");

  // Guest attempting deleteExpense
  const resDelete = context.doPost({
    postData: {
      contents: JSON.stringify({
        pin: "8888",
        action: "deleteExpense",
        payload: { id: "exp-101" }
      })
    }
  });
  const parsedDelete = JSON.parse(resDelete.content);
  assert.equal(parsedDelete.ok, false);
  assert.equal(parsedDelete.error, "Read-only access");
});

test("Two-PIN: doPost allows Guest PIN for read-only actions (getExpenses, getWealth)", () => {
  const context = loadBackendContext();
  context.getExpenses = () => [{ id: "exp-1" }];
  context.getWealth = () => ({ netWorth: 50000 });

  const resExp = context.doPost({
    postData: {
      contents: JSON.stringify({
        pin: "8888",
        action: "getExpenses",
        payload: {}
      })
    }
  });
  const parsedExp = JSON.parse(resExp.content);
  assert.equal(parsedExp.ok, true);
  assert.equal(parsedExp.expenses.length, 1);

  const resWealth = context.doPost({
    postData: {
      contents: JSON.stringify({
        pin: "8888",
        action: "getWealth",
        payload: {}
      })
    }
  });
  const parsedWealth = JSON.parse(resWealth.content);
  assert.equal(parsedWealth.ok, true);
  assert.equal(parsedWealth.wealth.netWorth, 50000);
});

test("Two-PIN: direct call to updateWealthAccountBalance with Guest PIN throws 'Read-only access'", () => {
  const context = loadBackendContext();
  assert.throws(
    () => context.updateWealthAccountBalance({ pin: "8888", accountId: "simplii_chequing", balance: 100 }),
    /Read-only access/
  );
});
