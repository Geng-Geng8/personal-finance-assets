const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const repositoryRoot = path.resolve(__dirname, "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

test("frontend does not require or contain google.script.run", () => {
  const frontendFiles = [
    "frontend/index.html",
    "frontend/app.js",
    "frontend/api.js",
    "frontend/config.js"
  ];

  for (const file of frontendFiles) {
    const content = read(file);
    assert.doesNotMatch(content, /google\.script\.run/, `${file} must not reference google.script.run`);
  }
});

test("OAuth token is never persisted in storage mechanisms", () => {
  const apiJs = read("frontend/api.js");

  for (const storageKey of ["sessionStorage", "indexedDB", "document.cookie"]) {
    assert.equal(apiJs.includes(storageKey), false, `api.js must not reference ${storageKey}`);
  }

});

test("frontend app.js uses localStorage ONLY for expense data caching, not auth tokens", () => {
  const appJs = read("frontend/app.js");

  assert.ok(appJs.includes("localStorage.getItem"), "app.js preserves existing expense cache read");
  assert.ok(appJs.includes("localStorage.setItem"), "app.js preserves existing expense cache write");

  // Verify that tokens or credentials are never stored in localStorage
  assert.doesNotMatch(appJs, /localStorage\.setItem\([^,]*token/i, "tokens must not be stored in localStorage");
  assert.doesNotMatch(appJs, /sessionStorage/, "sessionStorage must not be used");
  assert.doesNotMatch(appJs, /indexedDB/, "indexedDB must not be used");
  assert.doesNotMatch(appJs, /document\.cookie/, "cookies must not be used");
});

test("api.js rejects calls without active authorization", async () => {
  const { financeApi } = require(path.join(repositoryRoot, "frontend", "api.js"));

  assert.equal(financeApi.isAuthorized(), false);

  await assert.rejects(
    () => financeApi.getExpenses(),
    /Authorization is missing or expired/
  );

  await assert.rejects(
    () => financeApi.addExpense({ cost: 10 }),
    /Authorization is missing or expired/
  );

  await assert.rejects(
    () => financeApi.updateExpense({ id: "test", cost: 10 }),
    /Authorization is missing or expired/
  );

  await assert.rejects(
    () => financeApi.deleteExpense("test"),
    /Authorization is missing or expired/
  );
});

test("test environment config contains only verified test identifiers and no production IDs", () => {
  const config = read("frontend/config.test-env.js");

  assert.match(config, /581273737574-c6tv8f8jf11ivub0k47d2o0ae0jv8pg7\.apps\.googleusercontent\.com/);
  assert.match(config, /AKfycbwfJNXJmThqYxaO2DkekUhjO8K10VhePin3ZkFGS65UhhJ39DtW0YwCx0kVsNio6bZA/);
  assert.match(config, /https:\/\/www\.googleapis\.com\/auth\/spreadsheets/);

  // Strictly prohibited production IDs
  assert.doesNotMatch(config, /1RHBFF7H5Vqnlh97Gt4KuIt_NdBRYgfGCCDTK2zmkMBNbgUtLybxwR4CF/);
});

test("frontend index.html uses relative paths for subpath compatibility", () => {
  const html = read("frontend/index.html");

  // Must not have root-relative paths like src="/..." or href="/..."
  assert.doesNotMatch(html, /src="\/(?!\/)/, "Must not use root-relative src paths");
  assert.doesNotMatch(html, /href="\/(?!\/)/, "Must not use root-relative href paths");

  // Check required assets
  assert.match(html, /href="styles\.css"/);
  assert.match(html, /src="assets\/finance-icon\.png"/);
  assert.match(html, /src="config\.js"/);
  assert.match(html, /src="api\.js"/);
  assert.match(html, /src="app\.js"/);
  assert.match(html, /id="authGate"/);
  assert.match(html, /id="authAuthorizeButton"/);
  assert.match(html, /id="signOutButton"/);
});

test("git does not track any .clasp.json file", () => {
  const trackedFiles = execFileSync("git", ["ls-files", "-z"], {
    cwd: repositoryRoot,
    encoding: "utf8"
  }).split("\0").filter(Boolean);

  const trackedClaspFiles = trackedFiles.filter(file => file.endsWith(".clasp.json"));
  assert.deepEqual(trackedClaspFiles, [], "No .clasp.json file may be tracked in git");
});
