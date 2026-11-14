const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repositoryRoot = path.resolve(__dirname, "..");

function createFakeSheetHarness(initialRows = []) {
  const code = fs.readFileSync(
    path.join(repositoryRoot, "apps-script", "Code.js"),
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
    "Payment Method",
    "Grant Tag"
  ];

  const rows = [headers.slice(), ...initialRows.map(r => r.slice())];
  const cacheStore = {};
  const propertiesStore = {
    PRODUCTION_SPREADSHEET_ID: "mock-prod-sheet-id",
    PERSONAL_APP_DEVICE_KEY: "a".repeat(64)
  };
  let uuidCounter = 1;

  class FakeRange {
    constructor(row, column, rowCount, columnCount) {
      this.row = row;
      this.column = column;
      this.rowCount = rowCount;
      this.columnCount = columnCount;
    }

    getValues() {
      return Array.from({ length: this.rowCount }, (_, rowOffset) =>
        Array.from({ length: this.columnCount }, (_, colOffset) => {
          const r = rows[this.row - 1 + rowOffset] || [];
          return r[this.column - 1 + colOffset] ?? "";
        })
      );
    }

    setValues(values) {
      assert.equal(values.length, this.rowCount);
      values.forEach((valueRow, rowOffset) => {
        assert.equal(valueRow.length, this.columnCount);
        const targetIndex = this.row - 1 + rowOffset;
        rows[targetIndex] = rows[targetIndex] || [];
        valueRow.forEach((value, colOffset) => {
          rows[targetIndex][this.column - 1 + colOffset] = value;
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
    getSpreadsheetTimeZone() {
      return "America/Toronto";
    },
    getSheetByName(name) {
      return name === "Spending_Master2026" ? sheet : null;
    }
  };

  const context = {
    console,
    Date,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key) => propertiesStore[key] || null
      })
    },
    SpreadsheetApp: {
      openById: () => spreadsheet
    },
    LockService: {
      getScriptLock: () => ({
        waitLock: () => true,
        tryLock: () => true,
        releaseLock: () => true
      })
    },
    CacheService: {
      getScriptCache: () => ({
        get: (key) => (key in cacheStore ? cacheStore[key] : null),
        put: (key, val) => { cacheStore[key] = val; },
        remove: (key) => { delete cacheStore[key]; }
      })
    },
    Utilities: {
      formatDate: (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
      },
      getUuid: () => `test-${String(uuidCounter++).padStart(4, "0")}-0000-0000-000000000000`,
      newBlob: (str) => ({
        getBytes: () => Buffer.from(str, "utf8")
      })
    },
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput: (content) => ({
        content,
        getContent() { return this.content; },
        setMimeType(m) { this.mimeType = m; return this; }
      })
    }
  };

  vm.createContext(context);
  vm.runInContext(code, context, { filename: "apps-script/Code.js" });
  return { context, rows };
}

function createInteractiveMockDom() {
  const elementsById = {};

  function matchesSelector(el, selector) {
    if (!el || !selector) return false;
    if (selector.startsWith("#")) return el.id === selector.slice(1);
    if (selector.startsWith(".")) return el.classList.contains(selector.slice(1));
    return el.tagName === selector.toUpperCase();
  }

  function findAll(root, selector, acc = []) {
    if (!root || !Array.isArray(root.children)) return acc;
    for (const child of root.children) {
      if (matchesSelector(child, selector)) acc.push(child);
      findAll(child, selector, acc);
    }
    return acc;
  }

  function createElement(tag) {
    const el = {
      tagName: tag.toUpperCase(),
      id: "",
      className: "",
      textContent: "",
      innerHTML: "",
      value: "",
      type: "",
      disabled: false,
      attributes: {},
      children: [],
      listeners: {},
      style: {},
      reset() {
        el.value = "";
      },
      classList: {
        add(c) {
          const classes = (el.className || "").split(/\s+/).filter(Boolean);
          if (!classes.includes(c)) classes.push(c);
          el.className = classes.join(" ");
        },
        remove(c) {
          const classes = (el.className || "").split(/\s+/).filter(Boolean);
          el.className = classes.filter(cls => cls !== c).join(" ");
        },
        contains(c) {
          return (el.className || "").split(/\s+/).includes(c);
        },
        toggle(c, force) {
          const has = this.contains(c);
          const shouldAdd = force !== undefined ? Boolean(force) : !has;
          if (shouldAdd) this.add(c);
          else this.remove(c);
          return shouldAdd;
        }
      },
      setAttribute(name, val) {
        el.attributes[name] = String(val);
        if (name === "id") {
          el.id = String(val);
          elementsById[el.id] = el;
        }
        if (name === "disabled") {
          el.disabled = true;
        }
      },
      removeAttribute(name) {
        delete el.attributes[name];
        if (name === "disabled") {
          el.disabled = false;
        }
      },
      getAttribute(name) {
        return name in el.attributes ? el.attributes[name] : null;
      },
      appendChild(child) {
        el.children.push(child);
        if (child.id) elementsById[child.id] = child;
        return child;
      },
      addEventListener(event, handler) {
        if (!el.listeners[event]) el.listeners[event] = [];
        el.listeners[event].push(handler);
      },
      dispatchEvent(event) {
        const list = el.listeners[event.type] || [];
        for (const handler of list) {
          handler(event);
        }
      },
      click() {
        el.dispatchEvent({ type: "click", preventDefault() {} });
      },
      querySelectorAll(selector) {
        return findAll(el, selector, []);
      }
    };
    return el;
  }

  function getOrCreate(id) {
    if (!elementsById[id]) {
      const el = createElement("div");
      el.id = id;
      elementsById[id] = el;
    }
    return elementsById[id];
  }

  const body = createElement("body");
  const documentElement = createElement("html");

  const grantTagSection = getOrCreate("grantTagSection");
  grantTagSection.className = "entry-card entry-choice-card grant-tag-section hidden";
  grantTagSection.setAttribute("aria-hidden", "true");
  const grantTagChoices = getOrCreate("grantTagChoices");
  grantTagSection.appendChild(grantTagChoices);

  const bucketChoices = getOrCreate("bucketChoices");
  const categoryChoices = getOrCreate("categoryChoices");
  const paymentChoices = getOrCreate("paymentChoices");
  const editorSheet = getOrCreate("editorSheet");
  editorSheet.classList.add("hidden");
  editorSheet.appendChild(bucketChoices);
  editorSheet.appendChild(grantTagSection);
  editorSheet.appendChild(categoryChoices);
  editorSheet.appendChild(paymentChoices);
  body.appendChild(editorSheet);

  return {
    body,
    documentElement,
    createElement,
    createDocumentFragment() {
      return {
        children: [],
        appendChild(c) {
          this.children.push(c);
          return c;
        }
      };
    },
    getElementById: getOrCreate,
    querySelectorAll(selector) {
      if (selector.startsWith("#")) {
        const id = selector.slice(1);
        return elementsById[id] ? [elementsById[id]] : [];
      }
      return findAll(body, selector, []);
    }
  };
}

function loadFrontendApp(mockDom, overrides = {}) {
  let source = fs.readFileSync(
    path.join(repositoryRoot, "frontend", "app.js"),
    "utf8"
  );
  source = source.replace(/\s*initializeApp\(\);\s*$/, "");

  const storageMap = { ...(overrides.initialStorage || {}) };
  const context = {
    console,
    Date,
    Math,
    document: mockDom,
    window: {
      localStorage: {
        getItem(k) { return k in storageMap ? storageMap[k] : null; },
        setItem(k, v) { storageMap[k] = String(v); },
        removeItem(k) { delete storageMap[k]; }
      },
      confirm() { return true; },
      addEventListener() {},
      removeEventListener() {},
      requestAnimationFrame(cb) { return setTimeout(cb, 0); },
      cancelAnimationFrame() {},
      FINANCE_APP_CONFIG: { environment: "test" }
    },
    requestAnimationFrame(cb) { return setTimeout(cb, 0); },
    cancelAnimationFrame() {},
    setTimeout(fn) { fn(); return 1; },
    clearTimeout() {},
    ...overrides.globals
  };

  vm.createContext(context);
  vm.runInContext(source, context, { filename: "frontend/app.js" });
  return context;
}

function loadFrontendApi() {
  const source = fs.readFileSync(
    path.join(repositoryRoot, "frontend", "api.js"),
    "utf8"
  );
  const requests = [];
  const storageMap = {
    "personalFinance.deviceKey": "a".repeat(64)
  };
  const context = {
    console,
    URL,
    window: {
      localStorage: {
        getItem(k) { return k in storageMap ? storageMap[k] : null; },
        setItem(k, v) { storageMap[k] = String(v); },
        removeItem(k) { delete storageMap[k]; }
      },
      FINANCE_APP_CONFIG: {
        webAppEndpointUrl: "https://script.google.com/macros/s/test/exec"
      },
      fetch: async (url, opts) => {
        requests.push({ url, body: JSON.parse(opts.body) });
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, result: { success: true, id: "new-1" }, expenses: [] })
        };
      }
    }
  };

  vm.createContext(context);
  vm.runInContext(source, context, { filename: "frontend/api.js" });
  return { financeApi: context.window.financeApi, requests };
}

test("Backend: getExpenses reads A:I including grantTag and defaults blank/missing to ''", () => {
  const { context } = createFakeSheetHarness([
    ["exp-1", "2026-10-01", 45.5, "Small Business", "Websites", "Domain", "Renewal", "Credit Card", "OAC-Art-Glen"],
    ["exp-2", "2026-10-02", 12.0, "Small Business", "Subscription", "SaaS", "", "Credit Card", ""],
    ["exp-3", "2026-10-03", 8.25, "Play", "Eating Out", "Coffee", "", "Cash"]
  ]);

  const expenses = JSON.parse(JSON.stringify(context.getExpenses(true)));
  assert.equal(expenses.length, 3);

  const byId = Object.fromEntries(expenses.map(e => [e.id, e]));
  assert.equal(byId["exp-1"].grantTag, "OAC-Art-Glen");
  assert.equal(byId["exp-2"].grantTag, "");
  assert.equal(byId["exp-3"].grantTag, "");
});

test("Backend: addExpense writes Column I grantTag and allows omitted/empty grantTag without validation error", () => {
  const { context, rows } = createFakeSheetHarness();

  const withTag = context.addExpense({
    date: "2026-10-10",
    cost: "120.00",
    bucket: "Small Business",
    category: "Business",
    item: "Stage Lighting",
    notes: "Show prep",
    paymentMethod: "Credit Card",
    grantTag: "OAC-Prod-Equip"
  });
  assert.equal(withTag.success, true);

  const withoutTag = context.addExpense({
    date: "2026-10-11",
    cost: "25.00",
    bucket: "Small Business",
    category: "Subscription",
    item: "Cloud Storage",
    notes: "",
    paymentMethod: "Credit Card"
  });
  assert.equal(withoutTag.success, true);

  const blankTag = context.addExpense({
    date: "2026-10-12",
    cost: "15.00",
    bucket: "Play",
    category: "Fitness",
    item: "Drop-in",
    paymentMethod: "Cash",
    grantTag: "   "
  });
  assert.equal(blankTag.success, true);

  assert.equal(rows[1].length, 9);
  assert.equal(rows[1][8], "OAC-Prod-Equip");
  assert.equal(rows[2].length, 9);
  assert.equal(rows[2][8], "");
  assert.equal(rows[3].length, 9);
  assert.equal(rows[3][8], "");

  const readBack = JSON.parse(JSON.stringify(context.getExpenses(true)));
  const byId = Object.fromEntries(readBack.map(e => [e.id, e]));
  assert.equal(byId[withTag.id].grantTag, "OAC-Prod-Equip");
  assert.equal(byId[withoutTag.id].grantTag, "");
  assert.equal(byId[blankTag.id].grantTag, "");
});

test("Backend: updateExpense updates Column I in B:I and clears to '' when empty", () => {
  const { context, rows } = createFakeSheetHarness([
    ["exp-10", "2026-10-05", 60, "Small Business", "Marketing", "Flyers", "", "E-Transfer", "OAC-Art-Avery"]
  ]);

  context.updateExpense({
    id: "exp-10",
    date: "2026-10-05",
    cost: "65.50",
    bucket: "Small Business",
    category: "Marketing",
    item: "Flyers",
    notes: "Updated print run",
    paymentMethod: "E-Transfer",
    grantTag: "OAC-Mentor-Glen"
  });
  assert.equal(rows[1][8], "OAC-Mentor-Glen");
  assert.equal(rows[1][2], 65.5);

  context.updateExpense({
    id: "exp-10",
    date: "2026-10-05",
    cost: "65.50",
    bucket: "Small Business",
    category: "Marketing",
    item: "Flyers",
    notes: "Cleared grant tag",
    paymentMethod: "E-Transfer",
    grantTag: ""
  });
  assert.equal(rows[1][8], "");

  const expenses = JSON.parse(JSON.stringify(context.getExpenses(true)));
  assert.equal(expenses[0].grantTag, "");
});

test("API: addExpense and updateExpense forward grantTag and normalize omitted to ''", async () => {
  const { financeApi, requests } = loadFrontendApi();

  await financeApi.addExpense({
    date: "2026-10-12",
    cost: 50,
    bucket: "Small Business",
    category: "Business",
    item: "Mic cable",
    paymentMethod: "Credit Card",
    grantTag: "OAC-Prod-Tech"
  });

  await financeApi.updateExpense({
    id: "exp-1",
    date: "2026-10-12",
    cost: 50,
    bucket: "Play",
    category: "Fitness",
    item: "Gym",
    paymentMethod: "Cash"
  });

  assert.equal(requests[0].body.payload.grantTag, "OAC-Prod-Tech");
  assert.equal(requests[1].body.payload.grantTag, "");
});

test("Frontend UI: index.html has hidden #grantTagSection and root/frontend files are synced", () => {
  const html = fs.readFileSync(path.join(repositoryRoot, "frontend", "index.html"), "utf8");
  assert.match(html, /class="[^"]*\bhidden\b[^"]*"[\s\S]*?id="grantTagSection"/);
  assert.match(html, /id="grantTagChoices"/);

  const css = fs.readFileSync(path.join(repositoryRoot, "frontend", "styles.css"), "utf8");
  assert.match(css, /body\.guest-mode\s+#grantTagSection/);
  assert.match(css, /body\.guest-mode\s+\.grant-tag-btn/);

  for (const file of ["index.html", "styles.css", "api.js", "app.js"]) {
    const rootContent = fs.readFileSync(path.join(repositoryRoot, file), "utf8");
    const frontendContent = fs.readFileSync(path.join(repositoryRoot, "frontend", file), "utf8");
    assert.equal(rootContent, frontendContent, `${file} must match frontend/${file}`);
  }
});

test("Frontend Behavior: renders 10 grant tags in 3 rows, Business-only visibility, toggle deselect, bucket switch reset", () => {
  const dom = createInteractiveMockDom();
  const ctx = loadFrontendApp(dom);

  ctx.renderBucketChoices();
  ctx.renderGrantTagChoices();
  ctx.updateGrantTagSectionVisibility();

  const grantTagSection = dom.getElementById("grantTagSection");
  const grantTagChoices = dom.getElementById("grantTagChoices");
  const bucketChoices = dom.getElementById("bucketChoices");

  // Hidden by default (Play is default bucket)
  assert.ok(grantTagSection.classList.contains("hidden"));

  // Verify 3 groups and 10 exact tags
  assert.equal(grantTagChoices.children.length, 3);
  const tagButtons = grantTagChoices.querySelectorAll(".grant-tag-btn");
  assert.equal(tagButtons.length, 10);

  const expectedTags = [
    ["Glen", "OAC-Art-Glen"],
    ["Avery", "OAC-Art-Avery"],
    ["DKM/Switch", "OAC-Art-DKM/Switch"],
    ["Buffer", "OAC-Art-Buffer"],
    ["Judges", "OAC-Art-Judges"],
    ["Tech", "OAC-Prod-Tech"],
    ["Equip", "OAC-Prod-Equip"],
    ["Avery", "OAC-Mentor-Avery"],
    ["DKM/Switch", "OAC-Mentor-DKM/Switch"],
    ["Glen", "OAC-Mentor-Glen"]
  ];
  assert.deepEqual(
    tagButtons.map(b => [
      b.innerHTML.match(/class="grant-tag-label">([^<]+)</)[1],
      b.getAttribute("data-grant-tag")
    ]),
    expectedTags
  );

  // Switch to Small Business -> #grantTagSection becomes visible
  const businessBtn = bucketChoices.querySelectorAll(".bucket-choice-btn")
    .find(b => b.innerHTML.includes("Small Business"));
  assert.ok(businessBtn);
  businessBtn.click();
  assert.equal(grantTagSection.classList.contains("hidden"), false);

  // Tap OAC-Art-DKM/Switch -> selected
  const dkmBtn = grantTagChoices.querySelectorAll(".grant-tag-btn")
    .find(b => b.getAttribute("data-grant-tag") === "OAC-Art-DKM/Switch");
  dkmBtn.click();
  const dkmBtnAfterSelect = grantTagChoices.querySelectorAll(".grant-tag-btn")
    .find(b => b.getAttribute("data-grant-tag") === "OAC-Art-DKM/Switch");
  assert.ok(dkmBtnAfterSelect.classList.contains("selected"));
  assert.equal(dkmBtnAfterSelect.getAttribute("aria-pressed"), "true");

  // Tap active tag again -> deselects (resets to "")
  dkmBtnAfterSelect.click();
  const dkmBtnAfterDeselect = grantTagChoices.querySelectorAll(".grant-tag-btn")
    .find(b => b.getAttribute("data-grant-tag") === "OAC-Art-DKM/Switch");
  assert.equal(dkmBtnAfterDeselect.classList.contains("selected"), false);
  assert.equal(dkmBtnAfterDeselect.getAttribute("aria-pressed"), "false");

  // Select OAC-Prod-Tech, then switch away to Play -> hides and clears selection
  const techBtn = grantTagChoices.querySelectorAll(".grant-tag-btn")
    .find(b => b.getAttribute("data-grant-tag") === "OAC-Prod-Tech");
  techBtn.click();
  assert.ok(
    grantTagChoices.querySelectorAll(".grant-tag-btn")
      .find(b => b.getAttribute("data-grant-tag") === "OAC-Prod-Tech")
      .classList.contains("selected")
  );

  const playBtn = bucketChoices.querySelectorAll(".bucket-choice-btn")
    .find(b => b.innerHTML.includes("Play"));
  playBtn.click();
  assert.ok(grantTagSection.classList.contains("hidden"));

  // Switch back to Small Business -> previously selected tag was cleared
  const businessBtn2 = bucketChoices.querySelectorAll(".bucket-choice-btn")
    .find(b => b.innerHTML.includes("Small Business"));
  businessBtn2.click();
  assert.equal(grantTagSection.classList.contains("hidden"), false);
  const selectedAfterSwitch = grantTagChoices.querySelectorAll(".grant-tag-btn")
    .filter(b => b.classList.contains("selected"));
  assert.equal(selectedAfterSwitch.length, 0);
});

test("Frontend Behavior: saveExpense allows optional blank grantTag and sends selected grantTag; openEditExpense pre-selects tag", async () => {
  const dom = createInteractiveMockDom();
  const addedPayloads = [];
  const mockApi = {
    addExpense(expense) {
      addedPayloads.push(expense);
      return Promise.resolve({ success: true, id: "srv-1" });
    },
    updateExpense() {
      return Promise.resolve({ success: true });
    }
  };

  const ctx = loadFrontendApp(dom, {
    globals: { financeApi: mockApi }
  });

  // Seed one existing Business expense with a Grant Tag
  vm.runInContext(`
    currentExpenses = [{
      id: "exp-biz-1",
      date: "2026-10-15",
      cost: 88.5,
      bucket: "Small Business",
      category: "Websites",
      item: "Hosting",
      notes: "Annual",
      paymentMethod: "Credit Card",
      grantTag: "OAC-Mentor-Avery"
    }];
  `, ctx);

  // 1. Editing pre-selects OAC-Mentor-Avery and shows #grantTagSection
  ctx.openEditExpense("exp-biz-1");
  const grantTagSection = dom.getElementById("grantTagSection");
  const grantTagChoices = dom.getElementById("grantTagChoices");
  assert.equal(grantTagSection.classList.contains("hidden"), false);
  const preselected = grantTagChoices.querySelectorAll(".grant-tag-btn")
    .filter(b => b.classList.contains("selected"));
  assert.equal(preselected.length, 1);
  assert.equal(preselected[0].getAttribute("data-grant-tag"), "OAC-Mentor-Avery");
  ctx.closeEditor();

  // 2. Adding a Small Business expense WITHOUT selecting a grantTag saves without validation error
  ctx.openAddExpense();
  const businessBtn = dom.getElementById("bucketChoices").querySelectorAll(".bucket-choice-btn")
    .find(b => b.innerHTML.includes("Small Business"));
  businessBtn.click();

  const catBtn = dom.getElementById("categoryChoices").querySelectorAll(".category-choice-tile")[0];
  catBtn.click();
  const payBtn = dom.getElementById("paymentChoices").querySelectorAll(".payment-button")[0];
  payBtn.click();
  dom.getElementById("date").value = "2026-10-16";
  dom.getElementById("cost").value = "19.99";
  dom.getElementById("item").value = "USB Hub";
  dom.getElementById("notes").value = "";

  ctx.saveExpense({ preventDefault() {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(addedPayloads.length, 1);
  assert.equal(addedPayloads[0].bucket, "Small Business");
  assert.equal(addedPayloads[0].grantTag, "");
  assert.equal(dom.getElementById("formError").textContent, "");

  // 3. Adding a Small Business expense WITH a grantTag sends it
  ctx.openAddExpense();
  dom.getElementById("bucketChoices").querySelectorAll(".bucket-choice-btn")
    .find(b => b.innerHTML.includes("Small Business"))
    .click();
  dom.getElementById("categoryChoices").querySelectorAll(".category-choice-tile")[0].click();
  dom.getElementById("paymentChoices").querySelectorAll(".payment-button")[0].click();
  grantTagChoices.querySelectorAll(".grant-tag-btn")
    .find(b => b.getAttribute("data-grant-tag") === "OAC-Art-Judges")
    .click();
  dom.getElementById("date").value = "2026-10-17";
  dom.getElementById("cost").value = "150.00";
  dom.getElementById("item").value = "Honorarium";
  dom.getElementById("notes").value = "";

  ctx.saveExpense({ preventDefault() {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(addedPayloads.length, 2);
  assert.equal(addedPayloads[1].grantTag, "OAC-Art-Judges");
});

test("Frontend Behavior: guest-mode hides #grantTagSection and disables grant tag editing", () => {
  const dom = createInteractiveMockDom();
  const ctx = loadFrontendApp(dom, {
    initialStorage: { "personalFinance.pin": "8888" }
  });

  ctx.renderBucketChoices();
  ctx.renderGrantTagChoices();
  ctx.applyGuestModeRestrictions(true);

  const grantTagSection = dom.getElementById("grantTagSection");
  const grantTagChoices = dom.getElementById("grantTagChoices");

  assert.ok(dom.body.classList.contains("guest-mode"));
  assert.ok(grantTagSection.classList.contains("hidden"));
  assert.equal(grantTagSection.style.display, "none");

  const buttons = grantTagChoices.querySelectorAll(".grant-tag-btn");
  assert.equal(buttons.length, 10);
  for (const btn of buttons) {
    assert.equal(btn.disabled, true);
    assert.equal(btn.getAttribute("aria-hidden"), "true");
  }

  // Clicking a button in guest mode does not select it
  buttons[0].click();
  assert.equal(
    grantTagChoices.querySelectorAll(".grant-tag-btn").filter(b => b.classList.contains("selected")).length,
    0
  );
});
