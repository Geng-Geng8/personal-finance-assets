const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const repositoryRoot = path.resolve(__dirname, "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

test("POC frontend does not use persistent browser storage", () => {
  const frontend = [
    read("poc/auth/app.js"),
    read("poc/auth/config.js"),
    read("poc/auth/index.html")
  ].join("\n");

  for (const forbiddenApi of ["local" + "Storage", "session" + "Storage", "indexed" + "DB"]) {
    assert.equal(frontend.includes(forbiddenApi), false, `${forbiddenApi} must not be used`);
  }
});

test("test backend has no public web endpoint", () => {
  const backend = read("test-apps-script/Code.js");
  assert.doesNotMatch(backend, /^function\s+do(?:Get|Post)\s*\(/m);
});

test("test manifest pins MYSELF and only the required Sheets scope", () => {
  const manifest = JSON.parse(read("test-apps-script/appsscript.json"));
  assert.deepEqual(manifest.executionApi, { access: "MYSELF" });
  assert.deepEqual(manifest.oauthScopes, [
    "https://www.googleapis.com/auth/spreadsheets"
  ]);
  assert.equal(Object.hasOwn(manifest, "webapp"), false);
});

test("isolated configuration uses only the verified test identifiers", () => {
  const testClasp = JSON.parse(read("test-apps-script/.clasp.json"));
  const frontendConfig = read("poc/auth/config.js");
  const testBackend = read("test-apps-script/Code.js");
  const isolatedSource = `${frontendConfig}\n${testBackend}\n${read("test-apps-script/.clasp.json")}`;

  assert.equal(
    testClasp.scriptId,
    "16A04OwMthe5OgbYBZBWbLgLgvXAooDh05S5hXsIPA7bABlubBXLq66Gz"
  );
  assert.match(
    frontendConfig,
    /581273737574-c6tv8f8jf11ivub0k47d2o0ae0jv8pg7\.apps\.googleusercontent\.com/
  );
  assert.match(
    frontendConfig,
    /AKfycbwfJNXJmThqYxaO2DkekUhjO8K10VhePin3ZkFGS65UhhJ39DtW0YwCx0kVsNio6bZA/
  );
  assert.match(
    testBackend,
    /1hM8q7JhuZbUmQjJC5Mwx78vC5YBVSOVI6hTOlYmOyDc/
  );
  assert.doesNotMatch(
    isolatedSource,
    /1RHBFF7H5Vqnlh97Gt4KuIt_NdBRYgfGCCDTK2zmkMBNbgUtLybxwR4CF/
  );
});

test("tracked repository contains no known credential material", () => {
  const trackedFiles = execFileSync("git", ["ls-files", "-z"], {
    cwd: repositoryRoot,
    encoding: "utf8"
  }).split("\0").filter(Boolean);

  assert.equal(
    trackedFiles.some(file => /^\.clasprc(?:\..*)?\.json$/i.test(file)),
    false,
    "clasp credentials must not be tracked"
  );

  const textFiles = trackedFiles.filter(file =>
    /(?:\.js|\.json|\.html|\.md|\.csv|\.gitignore|\.clasp)$/i.test(file)
  );
  const credentialPatterns = [
    new RegExp("GOC" + "SPX-[A-Za-z0-9_-]+"),
    new RegExp("ya" + "29\\.[A-Za-z0-9_-]+"),
    new RegExp("1/" + "/[A-Za-z0-9_-]+"),
    new RegExp("-----BEGIN " + "PRIVATE KEY-----")
  ];

  for (const file of textFiles) {
    const content = read(file);
    for (const pattern of credentialPatterns) {
      assert.doesNotMatch(content, pattern, `credential-like value found in ${file}`);
    }
  }
});

test("seed data is explicitly synthetic", () => {
  const lines = read("test-apps-script/fake-transactions.csv").trim().split(/\r?\n/);
  assert.equal(lines[0], "ID,Date,Cost,Bucket,Category,Item,Notes,Payment Method");
  assert.ok(lines.length > 1);
  for (const line of lines.slice(1)) {
    assert.match(line, /^fake-/);
    assert.match(line, /Synthetic test record/);
  }
});

test("production UI files and assets are unchanged from the baseline branch point", () => {
  execFileSync(
    "git",
    [
      "diff",
      "--exit-code",
      "40cfc80db40dd59a15b5172f904e0373ffbd0394",
      "--",
      "apps-script/Index.html",
      "apps-script/Styles.html",
      "apps-script/JavaScript.html",
      "Personal Finance Tracker Icon.png",
      "finance-icon.png"
    ],
    { cwd: repositoryRoot, stdio: "pipe" }
  );
});
