const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repositoryRoot = path.resolve(__dirname, "..");

function createMockDom() {
  function createElement(tag) {
    const el = {
      tagName: tag.toUpperCase(),
      className: "",
      textContent: "",
      innerHTML: "",
      attributes: {},
      children: [],
      listeners: {},
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

  return {
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
    getElementById() {
      return createElement("div");
    },
    body: createElement("body")
  };
}

function loadAppContext(mockDom, overrides = {}) {
  let source = fs.readFileSync(path.join(repositoryRoot, "app.js"), "utf8");
  // Don't auto-run initializeApp at the very end during unit loading
  source = source.replace(/\s*initializeApp\(\);\s*$/, "");

  const openedEditIds = [];

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
      FINANCE_APP_CONFIG: {
        environment: "test"
      }
    },
    setTimeout(fn) { fn(); return 1; },
    openEditExpense(id) {
      openedEditIds.push(id);
    },
    ...overrides
  };

  vm.createContext(context);
  vm.runInContext(source, context, { filename: "app.js" });
  context._openedEditIds = openedEditIds;
  return context;
}

test("createExpenseCard creates accessible tap-to-edit card without visible edit/trash controls", () => {
  const dom = createMockDom();
  const ctx = loadAppContext(dom);

  const testExpense = {
    id: "exp-test-101",
    item: "Blueberry Matcha",
    cost: 7.25,
    bucket: "Play",
    category: "Eating Out",
    date: "2026-09-02",
    paymentMethod: "Credit Card"
  };

  const card = ctx.createExpenseCard(testExpense);

  // Accessible role and tabindex
  assert.equal(card.getAttribute("role"), "button");
  assert.equal(card.getAttribute("tabindex"), "0");
  assert.match(card.getAttribute("aria-label"), /Edit Blueberry Matcha, \$7\.25/);

  // Semantic class and bucket styling
  assert.ok(card.classList.contains("expense-card"));
  assert.ok(card.classList.contains("bucket-play"));

  // Permanently visible pencil/trash controls are removed
  const hasCardActions = card.children.some(c =>
    (c.className && c.className.includes("card-actions")) ||
    (c.children && c.children.some(cc => cc.className && cc.className.includes("card-actions")))
  );
  assert.equal(hasCardActions, false, "Individual cards must not contain persistent card-action buttons");

  // Category glyph squircle exists and contains SVG
  const glyphContainer = card.children.find(c => c.className && c.className.includes("expense-glyph-container"));
  assert.ok(glyphContainer, "Expense card must include expense-glyph-container");
  assert.ok(glyphContainer.classList.contains("glyph-bucket-play"));
  assert.match(glyphContainer.innerHTML, /<svg/);

  // Hierarchy: Merchant / item and amount, then category / bucket / date
  const content = card.children.find(c => c.className && c.className.includes("expense-card-content"));
  assert.ok(content, "Expense card must include expense-card-content");
  const topRow = content.children.find(c => c.className === "expense-row-top");
  assert.ok(topRow, "Top row must exist");
  assert.equal(topRow.children[0].textContent, "Blueberry Matcha");
  assert.equal(topRow.children[1].textContent, "$7.25");

  const subRow = content.children.find(c => c.className === "expense-row-sub");
  assert.ok(subRow, "Sub row must exist");
  assert.match(subRow.children[0].textContent, /Eating Out · Play/);

  // Click triggers edit sheet
  let clickedId = null;
  ctx.openEditExpense = function(id) {
    clickedId = id;
  };
  card.dispatchEvent({ type: "click" });
  assert.equal(clickedId, "exp-test-101", "Tapping card opens edit sheet with expense id");

  // Enter keydown triggers edit sheet
  let keyTriggeredId = null;
  ctx.openEditExpense = function(id) {
    keyTriggeredId = id;
  };
  card.dispatchEvent({ type: "keydown", key: "Enter", preventDefault() {} });
  assert.equal(keyTriggeredId, "exp-test-101", "Enter key triggers edit sheet");
});

test("SVG glyph registry returns valid SVGs for all buckets and categories", () => {
  const dom = createMockDom();
  const ctx = loadAppContext(dom);

  const buckets = ["Play", "Necessity", "Small Business", "Education", "Giving"];
  for (const bucket of buckets) {
    const bucketSvg = ctx.getBucketSvg(bucket);
    assert.match(bucketSvg, /<svg[^>]+viewBox="0 0 24 24"/, `Bucket ${bucket} must have valid SVG`);
    const slug = ctx.getBucketSlug(bucket);
    assert.ok(slug && !slug.includes(" "), `Slug for ${bucket} must be valid: ${slug}`);
  }

  const sampleCategories = [
    { cat: "Fitness", bucket: "Play" },
    { cat: "Eating Out", bucket: "Play" },
    { cat: "Health", bucket: "Necessity" },
    { cat: "Grocery", bucket: "Necessity" },
    { cat: "Subscription", bucket: "Small Business" },
    { cat: "Courses", bucket: "Education" },
    { cat: "Gifts", bucket: "Giving" }
  ];

  for (const { cat, bucket } of sampleCategories) {
    const svg = ctx.getCategorySvg(cat, bucket);
    assert.match(svg, /<svg[^>]+viewBox="0 0 24 24"/, `Category ${cat} must return valid SVG`);
  }

  const paymentMethods = ["Cash", "E-Transfer", "Credit Card", "Other"];
  for (const method of paymentMethods) {
    const svg = ctx.getPaymentSvg(method);
    assert.match(svg, /<svg[^>]+viewBox="0 0 24 24"/, `Payment ${method} must return valid SVG`);
  }
});
