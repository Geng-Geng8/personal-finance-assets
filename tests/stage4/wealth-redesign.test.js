const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

test("1. Available Cash hero has tight padding, restrained gradient, and authoritative typography", () => {
  const css = read("styles.css");
  assert.match(css, /\.wealth-hero-card\s*\{[^}]*background:\s*linear-gradient\(145deg,\s*#1e40af/);
  assert.match(css, /\.wealth-hero-amount\s*\{[^}]*font-size:\s*34px/);
  assert.match(css, /\.wealth-hero-amount\s*\{[^}]*font-variant-numeric:\s*tabular-nums/);
});

test("2. Cash Position uses a balance-sheet-style equation with whitespace and divider", () => {
  const html = read("index.html");
  assert.match(html, /class="[^"]*wealth-balance-table[^"]*"/);
  assert.match(html, /id="wealthTotalCash"/);
  assert.match(html, /id="wealthMathReserves"/);
  assert.match(html, /id="wealthMathAvailable"/);
  assert.match(html, /class="[^"]*wealth-balance-divider[^"]*"/);
});

test("3. Cash Position Protected Reserves is collapsed by default and integrates reserve management modal trigger", () => {
  const html = read("index.html");
  // Details accordion collapsed by default (no open attribute)
  assert.match(html, /<details\s+class="wealth-reserves-accordion"\s+id="wealthReservesAccordion">/);
  assert.match(html, /id="manageReservesButton"/);
  assert.match(html, /id="wealthTotalReserves"/);
  assert.match(html, /id="wealthTaxReserve"/);
  assert.match(html, /id="wealthIncomeTaxCpp"/);
  assert.match(html, /id="wealthEmergencyFund"/);

  const css = read("styles.css");
  assert.match(css, /\.wealth-reserves-accordion\[open\]\s*\.wealth-reserves-chevron\s*\{[^}]*transform:\s*rotate\(90deg\)/);
  assert.match(css, /@keyframes\s+reservesExpand/);
});

test("4. Portfolio is one cohesive section with vertical total hierarchy and authoritative TFSA/FHSA/RRSP rows", () => {
  const html = read("index.html");
  assert.match(html, /class="[^"]*wealth-portfolio-section[^"]*"/);
  assert.match(html, /id="wealthTotalInvested"/);
  assert.match(html, /id="wealthTfsa"/);
  assert.match(html, /id="wealthFhsa"/);
  assert.match(html, /id="wealthRrsp"/);

  const css = read("styles.css");
  assert.match(css, /\.wealth-portfolio-hero\s*\{[^}]*flex-direction:\s*column/);
  assert.match(css, /\.wealth-portfolio-hero\s*\{[^}]*align-items:\s*flex-start/);
  assert.match(css, /\.wealth-account-badge\.tfsa\s*\{[^}]*color:\s*#7c3aed/);
});

test("5. Digital Assets crypto section remains compact supporting section and retains editing affordance", () => {
  const html = read("index.html");
  assert.match(html, /class="[^"]*editable-crypto-card[^"]*"/);
  assert.match(html, /id="wealthCryptoCard"/);
  assert.match(html, /id="wealthCrypto"/);
});

test("6. Accounts ledger renders minimal chrome and thin separators without nested gray boxes", () => {
  const html = read("index.html");
  assert.match(html, /id="wealthAccountsAccordion"/);
  assert.match(html, /id="wealthCashAccountsList"/);
  assert.match(html, /id="wealthInvestAccountsList"/);
  assert.match(html, /id="wealthAccountsCount"/);

  const css = read("styles.css");
  assert.match(css, /\.wealth-accounts-table\s*\{[^}]*background:\s*transparent/);
});

test("7. Spacing between major Wealth sections is tightened to 10px", () => {
  const css = read("styles.css");
  assert.match(css, /\.wealth-hero-card\s*\{[^}]*margin-bottom:\s*10px/);
  assert.match(css, /\.wealth-sheet-section\s*\{[^}]*margin-bottom:\s*10px/);
});

test("8. Reduced motion accessibility query is provided for transitions", () => {
  const css = read("styles.css");
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /\.wealth-reserves-chevron/);
  assert.match(css, /\.wealth-reserves-breakdown/);
});

test("9. Strict parity between root and frontend/ directories is preserved across all files", () => {
  const files = ["index.html", "styles.css", "app.js", "api.js"];
  for (const f of files) {
    const rootContent = read(f);
    const frontendContent = read(path.join("frontend", f));
    assert.equal(rootContent, frontendContent, `Parity check failed for ${f}`);
  }
});
