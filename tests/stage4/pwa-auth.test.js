const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repositoryRoot = path.resolve(__dirname, "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

function loadApiContext(overrides = {}) {
  const code = read("api.js");
  let mockTokenCallback = null;
  let mockErrorCallback = null;
  const requestsMade = [];
  const moduleObj = { exports: {} };

  const context = {
    module: moduleObj,
    exports: moduleObj.exports,
    window: {
      FINANCE_APP_CONFIG: Object.freeze({
        environment: "production",
        oauthClientId: "522582558662-a8vk7etqodg192sl68fe0rp1svo1jnkj.apps.googleusercontent.com",
        apiExecutableDeploymentId: "AKfycbxKhDN9cPwe7sy_CD8FjUiEMWQdL0buAcxMgp4CaRSxL7sXbsDeIv0N8jusxeO8Vk1o",
        oauthScope: "https://www.googleapis.com/auth/spreadsheets"
      }),
      google: {
        accounts: {
          oauth2: {
            initTokenClient(options) {
              mockTokenCallback = options.callback;
              mockErrorCallback = options.error_callback;
              return {
                requestAccessToken(params) {
                  requestsMade.push(params);
                  if (overrides.onTokenRequest) {
                    overrides.onTokenRequest(params, mockTokenCallback, mockErrorCallback);
                  }
                }
              };
            },
            revoke(token, cb) {
              if (cb) cb();
            }
          }
        }
      },
      fetch: overrides.fetch || (async () => ({
        status: 200,
        ok: true,
        json: async () => ({ response: { result: { expenses: [] } } })
      }))
    },
    fetch: overrides.fetch || (async () => ({
      status: 200,
      ok: true,
      json: async () => ({ response: { result: { expenses: [] } } })
    })),
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Date
  };

  vm.createContext(context);
  vm.runInContext(code, context);

  return {
    financeApi: moduleObj.exports.financeApi || moduleObj.exports,
    getRequests: () => requestsMade,
    triggerToken: (res) => mockTokenCallback && mockTokenCallback(res),
    triggerError: (err) => mockErrorCallback && mockErrorCallback(err)
  };
}


// 1. token remains memory-only
test("token remains memory-only in api.js and sw.js", () => {
  for (const file of ["api.js", "frontend/api.js", "sw.js", "frontend/sw.js"]) {
    const content = read(file);
    for (const storage of ["localStorage", "sessionStorage", "indexedDB", "document.cookie"]) {
      assert.equal(content.includes(storage), false, `${file} must not reference ${storage}`);
    }
  }
});

// 2. no OAuth token persistence anywhere
test("no OAuth token persistence in git-tracked assets", () => {
  const trackedFiles = ["index.html", "styles.css", "app.js", "api.js", "config.js", "manifest.webmanifest", "sw.js"];
  for (const file of trackedFiles) {
    const content = read(file);
    assert.doesNotMatch(content, /ya29\.[A-Za-z0-9_-]+/, `No access token pattern allowed in ${file}`);
    assert.doesNotMatch(content, /1\/[A-Za-z0-9_-]{30,}/, `No refresh token pattern allowed in ${file}`);
  }
});

// 3. automatic startup attempts silent authorization
test("automatic startup attempts silent authorization with prompt empty string", async () => {
  let requestedPrompt = null;
  const { financeApi } = loadApiContext({
    onTokenRequest: (params, tokenCb) => {
      requestedPrompt = params.prompt;
      tokenCb({ access_token: "mock-auto-token", expires_in: 3600 });
    }
  });

  const token = await financeApi.trySilentAuthorize();
  assert.equal(requestedPrompt, "");
  assert.equal(token, "mock-auto-token");
  assert.equal(financeApi.isAuthorized(), true);
});

// 4. silent success transitions to authorized state
test("silent success transitions to authorized state and notifies listeners", async () => {
  const notifications = [];
  const { financeApi } = loadApiContext({
    onTokenRequest: (params, tokenCb) => {
      tokenCb({ access_token: "mock-silent-token", expires_in: 3600 });
    }
  });

  financeApi.onAuthStateChanged((isAuth) => notifications.push(isAuth));
  await financeApi.trySilentAuthorize();

  assert.equal(financeApi.isAuthorized(), true);
  assert.deepEqual(notifications, [true]);
});

// 5. interaction-required failure shows manual auth fallback
test("interaction-required failure rejects silent auth without throwing uncaught errors", async () => {
  const { financeApi } = loadApiContext({
    onTokenRequest: (params, tokenCb, errorCb) => {
      errorCb({ type: "popup_failed" });
    }
  });

  await assert.rejects(
    async () => await financeApi.trySilentAuthorize(),
    /OAuth error|Google authorization was cancelled or failed/
  );
  assert.equal(financeApi.isAuthorized(), false);
});


// 6. no infinite silent-auth retry
test("no infinite silent-auth retry when already failed", async () => {
  let callCount = 0;
  const { financeApi } = loadApiContext({
    onTokenRequest: (params, tokenCb, errorCb) => {
      callCount++;
      errorCb({ type: "interaction_required" });
    }
  });

  await assert.rejects(async () => await financeApi.trySilentAuthorize());
  assert.equal(callCount, 1);
});

// 7. manual authorize remains functional
test("manual authorize uses consent prompt and resolves on token", async () => {
  let requestedPrompt = null;
  const { financeApi } = loadApiContext({
    onTokenRequest: (params, tokenCb) => {
      requestedPrompt = params.prompt;
      tokenCb({ access_token: "mock-manual-token", expires_in: 3600 });
    }
  });

  const token = await financeApi.authorize();
  assert.equal(requestedPrompt, "consent");
  assert.equal(token, "mock-manual-token");
  assert.equal(financeApi.isAuthorized(), true);
});

// 8. explicit Sign Out does not immediately auto-login
test("explicit Sign Out sets intent flag and prevents silent auto-login", async () => {
  let tokenRequested = false;
  const { financeApi } = loadApiContext({
    onTokenRequest: (params, tokenCb) => {
      tokenRequested = true;
      tokenCb({ access_token: "mock-token", expires_in: 3600 });
    }
  });

  await financeApi.authorize();
  assert.equal(financeApi.isAuthorized(), true);

  financeApi.signOut();
  assert.equal(financeApi.isAuthorized(), false);
  assert.equal(financeApi.hasExplicitlySignedOut(), true);

  // Now trySilentAuthorize must reject without making GIS request
  tokenRequested = false;
  await assert.rejects(
    async () => await financeApi.trySilentAuthorize(),
    /User explicitly signed out/
  );
  assert.equal(tokenRequested, false);
});

// 9. expired-token READ can attempt one safe renewal
test("expired-token READ can attempt one safe renewal", async () => {
  let tokenRenewed = false;
  let fetchCount = 0;

  const { financeApi } = loadApiContext({
    onTokenRequest: (params, tokenCb) => {
      tokenRenewed = true;
      tokenCb({ access_token: "renewed-token-123", expires_in: 3600 });
    },
    fetch: async (url, opts) => {
      fetchCount++;
      assert.equal(opts.headers.Authorization, "Bearer renewed-token-123");
      return {
        status: 200,
        ok: true,
        json: async () => ({ response: { result: { expenses: [{ id: "exp-1" }] } } })
      };
    }
  });

  // Start with no active token, call getExpenses
  const expenses = await financeApi.getExpenses(false);
  assert.equal(tokenRenewed, true);
  assert.equal(fetchCount, 1);
  assert.deepEqual(expenses, [{ id: "exp-1" }]);
});

// 10. mutation requests are not blindly replayed after uncertain auth failure
test("mutation requests are not blindly replayed without authorization", async () => {
  let tokenRequests = 0;
  const { financeApi } = loadApiContext({
    onTokenRequest: () => {
      tokenRequests++;
    }
  });

  // Calling addExpense with no token must fail immediately without auto-requesting silent token
  await assert.rejects(
    async () => await financeApi.addExpense({ cost: 10 }),
    /Authorization is missing or expired/
  );
  assert.equal(tokenRequests, 0);
});

// 11. manifest exists
test("manifest.webmanifest exists and is valid JSON", () => {
  const manifest = JSON.parse(read("manifest.webmanifest"));
  assert.equal(manifest.name, "Personal Finance");
  assert.equal(manifest.short_name, "Finance");
});

// 12. display = standalone
test("manifest specifies display standalone", () => {
  const manifest = JSON.parse(read("manifest.webmanifest"));
  assert.equal(manifest.display, "standalone");
});

// 13. start_url = ./
test("manifest specifies start_url ./", () => {
  const manifest = JSON.parse(read("manifest.webmanifest"));
  assert.equal(manifest.start_url, "./");
});

// 14. scope = ./
test("manifest specifies scope ./", () => {
  const manifest = JSON.parse(read("manifest.webmanifest"));
  assert.equal(manifest.scope, "./");
});

// 15. icons exist
test("required PWA icons exist on disk with non-zero size", () => {
  for (const icon of ["assets/icon-192.png", "assets/icon-512.png", "assets/apple-touch-icon.png", "assets/finance-icon.png"]) {
    const fullPath = path.join(repositoryRoot, icon);
    assert.ok(fs.existsSync(fullPath), `${icon} must exist`);
    const stat = fs.statSync(fullPath);
    assert.ok(stat.size > 1000, `${icon} must have valid content`);
  }
});

// 16. service worker exists
test("service worker sw.js exists", () => {
  const sw = read("sw.js");
  assert.match(sw, /CACHE_NAME/);
  assert.match(sw, /self\.addEventListener\("install"/);
  assert.match(sw, /self\.addEventListener\("fetch"/);
});

// 17. financial/API responses are excluded from SW cache
test("financial and Google API requests are strictly excluded from SW cache", () => {
  const sw = read("sw.js");
  assert.match(sw, /url\.origin\s*!==\s*self\.location\.origin/);
  assert.match(sw, /event\.request\.method\s*!==\s*["']GET["']/);
  assert.match(sw, /url\.pathname\.includes\(["']:run["']\)/);
});

// 18. tokens are excluded from SW/cache
test("tokens and credentials are completely excluded from service worker", () => {
  const sw = read("sw.js");
  assert.doesNotMatch(sw, /Authorization/);
  assert.doesNotMatch(sw, /Bearer/);
  assert.doesNotMatch(sw, /ya29/);
});

// 19. asset paths work beneath /personal-finance-assets/
test("asset paths in index.html and manifest are relative for subpath hosting", () => {
  const index = read("index.html");
  assert.match(index, /href="styles\.css"/);
  assert.match(index, /src="config\.js"/);
  assert.match(index, /src="api\.js"/);
  assert.match(index, /src="app\.js"/);
  assert.match(index, /href="manifest\.webmanifest"/);
  assert.match(index, /href="assets\/apple-touch-icon\.png"/);
});

// 20. production OAuth/API configuration remains correct
test("production OAuth and API configuration remains verified and untouched", () => {
  const config = read("config.js");
  assert.match(config, /522582558662-a8vk7etqodg192sl68fe0rp1svo1jnkj\.apps\.googleusercontent\.com/);
  assert.match(config, /AKfycbxKhDN9cPwe7sy_CD8FjUiEMWQdL0buAcxMgp4CaRSxL7sXbsDeIv0N8jusxeO8Vk1o/);
  assert.doesNotMatch(config, /AKfycbwfJNXJmThqYxaO2DkekUhjO8K10VhePin3ZkFGS65UhhJ39DtW0YwCx0kVsNio6bZA/);
});
