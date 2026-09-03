const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repositoryRoot = path.resolve(__dirname, "..");

function createMockDom() {
  const elements = {};

  function createElement(tag) {
    const el = {
      tagName: tag.toUpperCase(),
      className: "",
      textContent: "",
      innerHTML: "",
      value: "",
      disabled: false,
      attributes: {},
      children: [],
      listeners: {},
      style: {},
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
      },
      getAttribute(name) {
        return el.attributes[name] || null;
      },
      appendChild(child) {
        el.children.push(child);
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
      }
    };
    return el;
  }

  function getElementById(id) {
    if (!elements[id]) {
      elements[id] = createElement("div");
      elements[id].id = id;
    }
    return elements[id];
  }

  return {
    createElement,
    getElementById,
    elements,
    createDocumentFragment() {
      return {
        children: [],
        appendChild(c) {
          this.children.push(c);
          return c;
        }
      };
    },
    body: createElement("body")
  };
}

function loadAppContext(mockDom, overrides = {}) {
  let source = fs.readFileSync(path.join(repositoryRoot, "app.js"), "utf8");
  // Don't auto-run initializeApp at the very end during unit loading
  source = source.replace(/\s*initializeApp\(\);\s*$/, "");

  const context = {
    console,
    Date,
    Math,
    document: mockDom,
    window: {
      localStorage: {
        getItem() { return null; },
        setItem() {},
        removeItem() {}
      },
      confirm() { return true; },
      addEventListener() {},
      removeEventListener() {},
      requestAnimationFrame(cb) { return setTimeout(cb, 0); },
      cancelAnimationFrame() {},
      FINANCE_APP_CONFIG: {
        environment: "test"
      }
    },
    requestAnimationFrame(cb) { return setTimeout(cb, 0); },
    cancelAnimationFrame() {},
    setTimeout(fn) { fn(); return 1; },
    ...overrides
  };

  vm.createContext(context);
  vm.runInContext(source, context, { filename: "app.js" });
  context.eval = code => vm.runInContext(code, context);
  return context;
}

test("toggleInsightFilters toggles filter body visibility and updates button state", () => {
  const dom = createMockDom();

  const filterBody = dom.getElementById("insightFilterBody");
  filterBody.classList.add("hidden");

  const toggleBtn = dom.getElementById("toggleInsightFiltersButton");
  toggleBtn.setAttribute("aria-expanded", "false");

  const ctx = loadAppContext(dom);

  // 1. Expand filters
  ctx.eval("toggleInsightFilters()");
  assert.equal(filterBody.classList.contains("hidden"), false, "Filter body should be expanded");
  assert.ok(toggleBtn.classList.contains("is-open"), "Button should have is-open class");
  assert.equal(toggleBtn.getAttribute("aria-expanded"), "true", "aria-expanded should be true");

  // 2. Collapse filters
  ctx.eval("toggleInsightFilters()");
  assert.equal(filterBody.classList.contains("hidden"), true, "Filter body should be collapsed");
  assert.equal(toggleBtn.classList.contains("is-open"), false, "Button should not have is-open class");
  assert.equal(toggleBtn.getAttribute("aria-expanded"), "false", "aria-expanded should be false");
});

test("updateInsightPeriodLabel reflects active filters and reset button visibility", () => {
  const dom = createMockDom();

  const periodLabel = dom.getElementById("insightPeriodLabel");
  const rangePill = dom.getElementById("insightRangePill");
  const resetBtn = dom.getElementById("resetInsightFiltersButton");
  resetBtn.classList.add("hidden");

  const ctx = loadAppContext(dom);

  // Initial state
  ctx.eval("updateInsightPeriodLabel()");
  assert.equal(periodLabel.textContent, "All spending");
  assert.equal(rangePill.textContent, "All dates");
  assert.equal(rangePill.classList.contains("active-filter"), false);
  assert.equal(resetBtn.classList.contains("hidden"), true);

  // Set date range filter to '7' (Last 7 days)
  ctx.eval("insightFilters.dateRange = '7'; updateInsightPeriodLabel()");
  assert.equal(periodLabel.textContent, "Last 7 days");
  assert.equal(rangePill.textContent, "Last 7 days");
  assert.equal(rangePill.classList.contains("active-filter"), true);
  assert.equal(resetBtn.classList.contains("hidden"), false, "Reset button should be visible when filter is active");

  // Reset filters
  ctx.eval("resetInsightFilters()");
  assert.equal(periodLabel.textContent, "All spending");
  assert.equal(rangePill.textContent, "All dates");
  assert.equal(rangePill.classList.contains("active-filter"), false);
  assert.equal(resetBtn.classList.contains("hidden"), true, "Reset button should be hidden after reset");
});

test("Category defaults to top 8 and Show all / Show fewer toggle changes presentation only", () => {
  const dom = createMockDom();

  const listEl = dom.getElementById("categoryRankedList");
  const toggleBtn = dom.getElementById("toggleAllCategoriesButton");
  toggleBtn.classList.add("hidden");
  const toggleText = dom.getElementById("toggleAllCategoriesText");

  const ctx = loadAppContext(dom);

  const sampleCategories = [
    { label: "Business", value: 9000 },
    { label: "Taxes", value: 6500 },
    { label: "Grocery", value: 4000 },
    { label: "Health", value: 3000 },
    { label: "Fitness", value: 2000 },
    { label: "Travel", value: 1500 },
    { label: "Entertainment", value: 1200 },
    { label: "Courses", value: 1000 },
    { label: "Books", value: 800 },
    { label: "Gifts", value: 600 },
    { label: "Tech", value: 400 },
    { label: "Clothing", value: 200 }
  ];
  const total = sampleCategories.reduce((sum, c) => sum + c.value, 0);

  // 1. Initial render defaults to top 8
  ctx.eval(`
    showAllCategories = false;
    renderCategoryList(${JSON.stringify(sampleCategories)}, ${total});
  `);

  function countRows(html) {
    return (html.match(/class="category-rank-row"/g) || []).length;
  }

  assert.equal(countRows(listEl.innerHTML), 8, "Should display exactly 8 categories by default");
  assert.equal(toggleBtn.classList.contains("hidden"), false, "Toggle button should be visible when > 8 categories");
  assert.equal(toggleText.textContent, "Show all categories");
  assert.match(listEl.innerHTML, /Business/);
  assert.match(listEl.innerHTML, /Courses/);
  assert.equal(listEl.innerHTML.includes("Books"), false, "9th item should be hidden initially");

  // 2. Expand all categories
  ctx.eval(`
    showAllCategories = true;
    renderCategoryList(${JSON.stringify(sampleCategories)}, ${total});
  `);

  assert.equal(countRows(listEl.innerHTML), 12, "Should display all 12 categories when expanded");
  assert.equal(toggleText.textContent, "Show fewer categories");
  assert.match(listEl.innerHTML, /Books/);
  assert.match(listEl.innerHTML, /Clothing/);

  // 3. Collapse back to top 8
  ctx.eval(`
    showAllCategories = false;
    renderCategoryList(${JSON.stringify(sampleCategories)}, ${total});
  `);

  assert.equal(countRows(listEl.innerHTML), 8, "Should return to 8 categories when collapsed");
  assert.equal(toggleText.textContent, "Show all categories");
});
