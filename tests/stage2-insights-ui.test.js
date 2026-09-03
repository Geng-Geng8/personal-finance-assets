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
