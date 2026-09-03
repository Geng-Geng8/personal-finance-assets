const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "../..");

function loadBackendContext(overrides = {}) {
  const code = fs.readFileSync(path.join(repoRoot, "apps-script/Code.js"), "utf8");

  const mockSheet = {
    getName() { return "2026-Budgets"; },
    getRange(rangeStr) {
      if (rangeStr === "B14:F14") {
        return {
          getValues() {
            return [[1420.50, 500, 1200, 250, 3530]];
          }
        };
      }
      if (rangeStr === "H14:P14") {
        return {
          getValues() {
            return [[10000, 5000, 8000, 12000, 1000, 26000, 2500, 1500, 20000]];
          }
        };
      }
      if (rangeStr === "I29") {
        return {
          getValue() { return 34000; }
        };
      }
      if (rangeStr === "H17:I28") {
        return {
          getValues() { return [["EQ-TFSA", 5000]]; },
          getFormulas() { return [["", ""]]; }
        };
      }
      return {
        getValues() { return [[]]; },
        getValue() { return 0; },
        getFormula() { return ""; },
        getFormulas() { return [[]]; }
      };
    }
  };

  const scriptProperties = {
    PRODUCTION_SPREADSHEET_ID: "mock-production-spreadsheet-id",
    PERSONAL_APP_DEVICE_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  };

  const mockSpreadsheet = {
    getSheetByName(name) {
      if (name === "2026-Budgets") return mockSheet;
      return null;
    }
  };

  const context = {
    console,
    Date,
    Math,
    String,
    Number,
    Boolean,
    parseFloat,
    isNaN,
    Array,
    Object,
    SpreadsheetApp: {
      getActiveSpreadsheet() { return mockSpreadsheet; },
      openById(id) { return mockSpreadsheet; },
      flush() {}
    },
    PropertiesService: {
      getScriptProperties() {
        return {
          getProperty(k) { return scriptProperties[k] || null; }
        };
      }
    },
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput(content) {
        return {
          content,
          mimeType: null,
          setMimeType(m) {
            this.mimeType = m;
            return this;
          },
          getContent() {
            return this.content;
          }
        };
      }
    },
    ...overrides
  };

  vm.createContext(context);
  vm.runInContext(code, context);
  return { context, mockSheet };
}

function createMockElement(tag = "div") {
  return {
    tagName: tag.toUpperCase(),
    className: "",
    textContent: "",
    innerHTML: "",
    value: "",
    attributes: {},
    children: [],
    style: {},
    classList: {
      classes: new Set(),
      add(c) { this.classes.add(c); },
      remove(c) { this.classes.delete(c); },
      contains(c) { return this.classes.has(c); },
      toggle(c, force) {
        if (force !== undefined) {
          if (force) this.classes.add(c);
          else this.classes.delete(c);
          return force;
        }
        if (this.classes.has(c)) {
          this.classes.delete(c);
          return false;
        }
        this.classes.add(c);
        return true;
      }
    },
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return this.attributes[k] || null; },
    appendChild(ch) { this.children.push(ch); return ch; },
    addEventListener() {},
    removeEventListener() {}
  };
}

function createMockDom() {
  const elements = new Map();

  function getOrCreate(id) {
    if (!elements.has(id)) {
      elements.set(id, createMockElement("div"));
    }
    return elements.get(id);
  }

  // Pre-seed known elements
  getOrCreate("playAvailableAmount").textContent = "—";
  getOrCreate("necessityAvailableAmount").textContent = "—";
  getOrCreate("smallBusinessAvailableAmount").textContent = "—";
  getOrCreate("educationAvailableAmount").textContent = "—";
  getOrCreate("givingAvailableAmount").textContent = "—";
  getOrCreate("playHeroCard");
  getOrCreate("availableSpendSection");
  getOrCreate("expenseList");
  getOrCreate("summaryPeriod");
  getOrCreate("livePill");
  getOrCreate("liveDot");
  getOrCreate("liveStatusText");
  getOrCreate("summaryTotal");
  getOrCreate("summaryTransactions");
  getOrCreate("summaryAverage");
  getOrCreate("searchInput");
  getOrCreate("clearSearchButton");

  return {
    getElementById(id) {
      return getOrCreate(id);
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement(tag) { return createMockElement(tag); },
    documentElement: createMockElement("html"),
    body: createMockElement("body"),
    _elements: elements
  };
}

test("1. authenticated bucket read succeeds via doPost", () => {
  const { context } = loadBackendContext();
  const validKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  const response = context.doPost({
    postData: {
      contents: JSON.stringify({
        deviceKey: validKey,
        action: "getSpendingBuckets",
        payload: {}
      })
    }
  });

  const parsed = JSON.parse(response.getContent());
  assert.equal(parsed.ok, true);
  assert.ok(parsed.buckets);
  assert.equal(parsed.buckets.play, 3530);
  assert.equal(parsed.buckets.necessity, 1420.50);
  assert.equal(parsed.buckets.smallBusiness, 500);
  assert.equal(parsed.buckets.education, 1200);
  assert.equal(parsed.buckets.giving, 250);
  assert.ok(parsed.buckets.updatedAt);
});

test("2. missing or invalid device key is denied", () => {
  const { context } = loadBackendContext();

  // Missing key
  const missingResp = context.doPost({
    postData: {
      contents: JSON.stringify({
        action: "getSpendingBuckets",
        payload: {}
      })
    }
  });
  const parsedMissing = JSON.parse(missingResp.getContent());
  assert.equal(parsedMissing.ok, false);
  assert.equal(parsedMissing.error, "Unauthorized");

  // Invalid key (wrong length)
  const shortResp = context.doPost({
    postData: {
      contents: JSON.stringify({
        deviceKey: "tooshort",
        action: "getSpendingBuckets",
        payload: {}
      })
    }
  });
  const parsedShort = JSON.parse(shortResp.getContent());
  assert.equal(parsedShort.ok, false);
  assert.equal(parsedShort.error, "Unauthorized");

  // Wrong key
  const wrongResp = context.doPost({
    postData: {
      contents: JSON.stringify({
        deviceKey: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        action: "getSpendingBuckets",
        payload: {}
      })
    }
  });
  const parsedWrong = JSON.parse(wrongResp.getContent());
  assert.equal(parsedWrong.ok, false);
  assert.equal(parsedWrong.error, "Unauthorized");
});

test("3. financial GET remains denied", () => {
  const { context } = loadBackendContext();
  assert.equal(typeof context.doGet, "function");

  // Requests with action or function must be rejected
  const getActionResp = context.doGet({ parameter: { action: "getSpendingBuckets" } });
  const parsedAction = JSON.parse(getActionResp.getContent());
  assert.equal(parsedAction.ok, false);

  const getFuncResp = context.doGet({ parameter: { function: "getSpendingBuckets" } });
  const parsedFunc = JSON.parse(getFuncResp.getContent());
  assert.equal(parsedFunc.ok, false);
});

test("4. exact server-owned mapping returns B14:F14", () => {
  let requestedRange = null;
  const mockSs = {
    getSheetByName(name) {
      assert.equal(name, "2026-Budgets");
      return {
        getRange(r) {
          requestedRange = r;
          return {
            getValues() { return [[100, 200, 300, 400, 500]]; }
          };
        }
      };
    }
  };

  const { context } = loadBackendContext({
    SpreadsheetApp: {
      getActiveSpreadsheet() { return mockSs; },
      openById() { return mockSs; },
      flush() {}
    }
  });

  const buckets = context.getSpendingBuckets();
  assert.equal(requestedRange, "B14:F14", "Backend must read exactly B14:F14");
  assert.equal(buckets.necessity, 100);
  assert.equal(buckets.smallBusiness, 200);
  assert.equal(buckets.education, 300);
  assert.equal(buckets.giving, 400);
  assert.equal(buckets.play, 500);
});

test("5. B14 is read directly, never recomputed", () => {
  const mockSs = {
    getSheetByName() {
      return {
        getRange() {
          return {
            // B14 has a specific remainder calculated by Sheet
            getValues() { return [[888.88, 10, 20, 30, 40]]; }
          };
        }
      };
    }
  };

  const { context } = loadBackendContext({
    SpreadsheetApp: {
      getActiveSpreadsheet() { return mockSs; },
      openById() { return mockSs; },
      flush() {}
    }
  });

  const buckets = context.getSpendingBuckets();
  assert.equal(buckets.necessity, 888.88, "Necessity must be read as raw sheet calculation without client/backend override");
});

test("6. browser cannot specify Sheet, range, or cell", () => {
  let requestedRange = null;
  const mockSs = {
    getSheetByName() {
      return {
        getRange(r) {
          requestedRange = r;
          return { getValues() { return [[1, 2, 3, 4, 5]]; } };
        }
      };
    }
  };

  const { context } = loadBackendContext({
    SpreadsheetApp: {
      getActiveSpreadsheet() { return mockSs; },
      openById() { return mockSs; },
      flush() {}
    }
  });

  const validKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  // Attempt to inject custom range/sheet in payload
  const resp = context.doPost({
    postData: {
      contents: JSON.stringify({
        deviceKey: validKey,
        action: "getSpendingBuckets",
        payload: {
          sheet: "Secret_Tab",
          range: "A1:Z100",
          cell: "Z99"
        }
      })
    }
  });

  const parsed = JSON.parse(resp.getContent());
  assert.equal(parsed.ok, true);
  assert.equal(requestedRange, "B14:F14", "Payload arguments must be completely ignored; server owns B14:F14 mapping");
});

test("7. Play renders as the dominant bucket in HTML & CSS", () => {
  const html = fs.readFileSync(path.join(repoRoot, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(repoRoot, "styles.css"), "utf8");

  // Play has its own prominent hero card
  assert.ok(html.includes('id="playHeroCard"'), "Must contain #playHeroCard");
  assert.ok(html.includes('id="playAvailableAmount"'), "Must contain #playAvailableAmount");
  assert.ok(html.includes('class="play-hero-amount"'), "Must have .play-hero-amount");

  // Check CSS typography dominance
  assert.ok(css.includes(".play-hero-card"), "CSS must style .play-hero-card");
  assert.ok(css.includes(".play-hero-amount"), "CSS must style .play-hero-amount");
  assert.ok(css.includes("font-size: 32px"), "Play hero amount must have prominent font size");
});

test("8. all five values render correctly in DOM", () => {
  const mockDom = createMockDom();
  const appContext = {
    document: mockDom,
    window: {
      localStorage: {
        getItem() { return null; },
        setItem() {},
        removeItem() {}
      }
    },
    financeApi: {
      hasDeviceKey() { return true; },
      async getSpendingBuckets() {
        return {
          play: 3530,
          necessity: 1420.50,
          smallBusiness: 500,
          education: 1200,
          giving: 250
        };
      }
    }
  };

  let appCode = fs.readFileSync(path.join(repoRoot, "app.js"), "utf8");
  appCode = appCode.replace(/\s*initializeApp\(\);\s*$/, "");

  const context = {
    console,
    Date,
    Math,
    String,
    Number,
    Boolean,
    parseFloat,
    isNaN,
    Intl,
    ...appContext
  };

  vm.createContext(context);
  vm.runInContext(appCode, context);

  // Directly call renderSpendingBuckets
  context.renderSpendingBuckets({
    play: 3530,
    necessity: 1420.50,
    smallBusiness: 500,
    education: 1200,
    giving: 250
  });

  const playText = mockDom.getElementById("playAvailableAmount").textContent;
  const necText = mockDom.getElementById("necessityAvailableAmount").textContent;
  const bizText = mockDom.getElementById("smallBusinessAvailableAmount").textContent;
  const eduText = mockDom.getElementById("educationAvailableAmount").textContent;
  const givText = mockDom.getElementById("givingAvailableAmount").textContent;

  assert.equal(playText, "$3,530", "Play formatted without cents when whole dollar");
  assert.equal(necText, "$1,420.50", "Necessity formatted with cents");
  assert.equal(bizText, "$500", "Small Business formatted without cents when whole dollar");
  assert.equal(eduText, "$1,200", "Education formatted without cents when whole dollar");
  assert.equal(givText, "$250", "Giving formatted without cents when whole dollar");
});

test("9. no percentages appear in Available to Spend component", () => {
  const html = fs.readFileSync(path.join(repoRoot, "index.html"), "utf8");
  const sectionStart = html.indexOf('id="availableSpendSection"');
  const sectionEnd = html.indexOf('</section>', sectionStart);
  const sectionMarkup = html.slice(sectionStart, sectionEnd);

  assert.ok(!sectionMarkup.includes("%"), "Available to Spend section must not contain percentage symbols");
  assert.ok(!sectionMarkup.toLowerCase().includes("percent"), "Available to Spend section must not contain percentage text");
  assert.ok(!sectionMarkup.toLowerCase().includes("share"), "Available to Spend section must not contain spending share text");
  assert.ok(!sectionMarkup.toLowerCase().includes("utilization"), "Available to Spend section must not contain utilization text");
});

test("10. no progress bars appear in Available to Spend component", () => {
  const html = fs.readFileSync(path.join(repoRoot, "index.html"), "utf8");
  const sectionStart = html.indexOf('id="availableSpendSection"');
  const sectionEnd = html.indexOf('</section>', sectionStart);
  const sectionMarkup = html.slice(sectionStart, sectionEnd);

  assert.ok(!sectionMarkup.includes("progress"), "Available to Spend section must not contain progress elements");
  assert.ok(!sectionMarkup.includes("meter"), "Available to Spend section must not contain meter elements");
  assert.ok(!sectionMarkup.includes("bar"), "Available to Spend section must not contain progress bars");
});

test("11. LTI / Savings does not appear in Available to Spend component", () => {
  const html = fs.readFileSync(path.join(repoRoot, "index.html"), "utf8");
  const sectionStart = html.indexOf('id="availableSpendSection"');
  const sectionEnd = html.indexOf('</section>', sectionStart);
  const sectionMarkup = html.slice(sectionStart, sectionEnd);

  assert.ok(!sectionMarkup.includes("LTI"), "Available to Spend must not contain LTI");
  assert.ok(!sectionMarkup.includes("Savings"), "Available to Spend must not contain Savings");
  assert.ok(!sectionMarkup.includes("G14"), "Available to Spend must not reference G14");
});

test("12. loading/error states do not display fabricated zero balances", () => {
  const mockDom = createMockDom();
  const appContext = {
    document: mockDom,
    window: {
      localStorage: {
        getItem() { return null; },
        setItem() {},
        removeItem() {}
      }
    },
    financeApi: {
      hasDeviceKey() { return true; },
      async getSpendingBuckets() {
        throw new Error("Network error");
      }
    }
  };

  let appCode = fs.readFileSync(path.join(repoRoot, "app.js"), "utf8");
  appCode = appCode.replace(/\s*initializeApp\(\);\s*$/, "");

  const context = {
    console,
    Date,
    Math,
    String,
    Number,
    Boolean,
    parseFloat,
    isNaN,
    Intl,
    ...appContext
  };

  vm.createContext(context);
  vm.runInContext(appCode, context);

  // Initial state before render
  assert.equal(mockDom.getElementById("playAvailableAmount").textContent, "—");
  assert.equal(mockDom.getElementById("necessityAvailableAmount").textContent, "—");

  // Trigger render with null/error
  context.renderSpendingBuckets(null);
  assert.equal(mockDom.getElementById("playAvailableAmount").textContent, "—");
  assert.equal(mockDom.getElementById("necessityAvailableAmount").textContent, "—");
  assert.notEqual(mockDom.getElementById("playAvailableAmount").textContent, "$0.00");
  assert.notEqual(mockDom.getElementById("playAvailableAmount").textContent, "$0");
});

test("13. existing Expenses/Add Expense behavior still works", () => {
  const html = fs.readFileSync(path.join(repoRoot, "index.html"), "utf8");

  // Verify core expenses view components exist
  assert.ok(html.includes('id="expensesView"'));
  assert.ok(html.includes('class="summary-card"'));
  assert.ok(html.includes('id="summaryTotal"'));
  assert.ok(html.includes('id="searchInput"'));
  assert.ok(html.includes('id="expenseList"'));

  // Verify UX placement order: summary-card -> availableSpendSection -> search-section
  const summaryPos = html.indexOf('class="summary-card"');
  const availablePos = html.indexOf('id="availableSpendSection"');
  const searchPos = html.indexOf('class="search-section"');

  assert.ok(summaryPos < availablePos, "Available to Spend must be placed after summary-card");
  assert.ok(availablePos < searchPos, "Available to Spend must be placed before search-section");
});

test("14. mobile layout works around 390px and 430px without overflow", () => {
  const css = fs.readFileSync(path.join(repoRoot, "styles.css"), "utf8");

  // Ensure grid template is responsive 2 columns
  assert.ok(css.includes(".secondary-buckets-grid"));
  assert.ok(css.includes("grid-template-columns: repeat(2, 1fr)"));
  assert.ok(css.includes("gap: 10px"));

  // Check text truncation / ellipsis for secondary bucket names
  assert.ok(css.includes("overflow: hidden"));
  assert.ok(css.includes("text-overflow: ellipsis"));
});

test("15. prefers-reduced-motion has a usable static state", () => {
  const css = fs.readFileSync(path.join(repoRoot, "styles.css"), "utf8");

  assert.ok(css.includes("@media (prefers-reduced-motion: reduce)"));
  assert.ok(css.includes(".play-hero-card"));
  assert.ok(css.includes("transition: none !important"));
  assert.ok(css.includes("transform: none !important"));
});

test("16. updateSpendingBuckets updates C14:F14 and returns updated buckets", () => {
  const writtenValues = {};
  const mockSs = {
    getSheetByName(name) {
      assert.equal(name, "2026-Budgets");
      return {
        getRange(r) {
          if (r === "C14:F14") {
            return {
              getFormulas() { return [["", "", "", ""]]; }
            };
          }
          if (r === "B14:F14") {
            return {
              getValues() {
                return [[
                  1000,
                  writtenValues["C14"] ?? 500,
                  writtenValues["D14"] ?? 1200,
                  writtenValues["E14"] ?? 250,
                  writtenValues["F14"] ?? 3530
                ]];
              }
            };
          }
          if (["C14", "D14", "E14", "F14"].includes(r)) {
            return {
              setValue(val) {
                writtenValues[r] = val;
              }
            };
          }
          return {
            getValues() { return [[]]; },
            getFormulas() { return [[]]; },
            setValue() {}
          };
        }
      };
    }
  };

  const { context } = loadBackendContext({
    SpreadsheetApp: {
      getActiveSpreadsheet() { return mockSs; },
      openById() { return mockSs; },
      flush() {}
    },
    LockService: {
      getScriptLock() {
        return {
          tryLock() { return true; },
          releaseLock() {}
        };
      }
    }
  });

  const validKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const resp = context.doPost({
    postData: {
      contents: JSON.stringify({
        deviceKey: validKey,
        action: "updateSpendingBuckets",
        payload: {
          play: 4000,
          smallBusiness: 600,
          education: 1500,
          giving: 300
        }
      })
    }
  });

  const parsed = JSON.parse(resp.getContent());
  assert.equal(parsed.ok, true);
  assert.equal(parsed.buckets.play, 4000);
  assert.equal(parsed.buckets.smallBusiness, 600);
  assert.equal(parsed.buckets.education, 1500);
  assert.equal(parsed.buckets.giving, 300);
  assert.equal(parsed.buckets.necessity, 1000);
  assert.equal(writtenValues["F14"], 4000);
  assert.equal(writtenValues["C14"], 600);
  assert.equal(writtenValues["D14"], 1500);
  assert.equal(writtenValues["E14"], 300);
});

test("17. HTML contains editAllocationsBtn and manageAllocationsModal", () => {
  const html = fs.readFileSync(path.join(repoRoot, "index.html"), "utf8");

  assert.ok(html.includes('id="editAllocationsBtn"'));
  assert.ok(html.includes('id="manageAllocationsModal"'));
  assert.ok(html.includes('id="allocPlayInput"'));
  assert.ok(html.includes('id="allocBusinessInput"'));
  assert.ok(html.includes('id="allocEducationInput"'));
  assert.ok(html.includes('id="allocGivingInput"'));
  assert.ok(html.includes('id="saveAllocationsButton"'));
});

test("18. HTML and CSS contain editSingleBucketModal and card pointer states", () => {
  const html = fs.readFileSync(path.join(repoRoot, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(repoRoot, "styles.css"), "utf8");

  assert.ok(html.includes('id="editSingleBucketModal"'));
  assert.ok(html.includes('id="singleBucketAmountInput"'));
  assert.ok(html.includes('id="saveSingleBucketButton"'));
  assert.ok(html.includes('id="cancelSingleBucketButton"'));

  // Play and secondary editable cards have pointer cursor
  assert.ok(css.includes(".play-hero-card") && css.includes("cursor: pointer"));
  assert.ok(css.includes(".bucket-card-business") && css.includes("cursor: pointer"));

  // Necessity card has cursor: default
  assert.ok(css.includes(".bucket-card-necessity"));
  assert.ok(css.includes("cursor: default"));
});

test("19. app.js wires single bucket modal and card click handlers", () => {
  const appJs = fs.readFileSync(path.join(repoRoot, "app.js"), "utf8");

  assert.ok(appJs.includes('openSingleBucketModal("play")'));
  assert.ok(appJs.includes('openSingleBucketModal("smallBusiness")'));
  assert.ok(appJs.includes('openSingleBucketModal("education")'));
  assert.ok(appJs.includes('openSingleBucketModal("giving")'));
  assert.ok(appJs.includes('saveSingleBucketAllocation'));
});

test("20. styles.css includes scrollbar-gutter: stable on html/body and wrapper sizing", () => {
  const css = fs.readFileSync(path.join(repoRoot, "styles.css"), "utf8");

  assert.ok(css.includes("scrollbar-gutter: stable"));
  assert.ok(css.includes("max-width: 680px"));
  assert.ok(css.includes("margin-left: auto"));
  assert.ok(css.includes("margin-right: auto"));
  assert.ok(css.includes("box-sizing: border-box"));
});

test("21. app.js loads spending buckets cache-first and only re-renders on live diff", () => {
  const appJs = fs.readFileSync(path.join(repoRoot, "app.js"), "utf8");

  assert.ok(appJs.includes("restoreSpendingBucketsFromCache();"));
  assert.ok(appJs.includes("const hasChanged = !prev ||"));
  assert.ok(appJs.includes("renderSpendingBuckets(buckets)"));
});

test("22. styles.css @keyframes sheetSlideUp preserves horizontal centering with translate(-50%, ...)", () => {
  const css = fs.readFileSync(path.join(repoRoot, "styles.css"), "utf8");

  assert.ok(css.includes("transform: translate(-50%, 100%)"));
  assert.ok(css.includes("transform: translate(-50%, 0)"));
});




