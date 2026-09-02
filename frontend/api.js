const financeApi = (() => {
  "use strict";

  const config = (typeof window !== "undefined" && window.FINANCE_APP_CONFIG)
    ? window.FINANCE_APP_CONFIG
    : {};
  const apiFunctionName = "apiRequest";
  const minimumTokenLifetimeMs = 60 * 1000;

  let tokenClient = null;
  let accessToken = null;
  let accessTokenExpiresAt = 0;
  let pendingAuthResolver = null;
  let hasExplicitlySignedOutState = false;
  const authStateListeners = [];

  function hasUsableConfiguration() {
    return (
      typeof config.oauthClientId === "string" &&
      config.oauthClientId.endsWith(".apps.googleusercontent.com") &&
      typeof config.apiExecutableDeploymentId === "string" &&
      config.apiExecutableDeploymentId.startsWith("AKfy") &&
      !config.apiExecutableDeploymentId.includes("REPLACE") &&
      config.oauthScope === "https://www.googleapis.com/auth/spreadsheets"
    );
  }

  function waitForGoogleIdentity(timeoutMs = 3000) {
    if (typeof window === "undefined") {
      return Promise.resolve(false);
    }
    if (window.google && window.google.accounts && window.google.accounts.oauth2) {
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      const startTime = Date.now();
      const interval = setInterval(() => {
        if (window.google && window.google.accounts && window.google.accounts.oauth2) {
          clearInterval(interval);
          resolve(true);
        } else if (Date.now() - startTime >= timeoutMs) {
          clearInterval(interval);
          resolve(false);
        }
      }, 50);
    });
  }

  function initGoogleIdentity() {
    if (!hasUsableConfiguration()) {
      console.error("Finance API: Invalid or missing configuration in config.js.");
      return false;
    }

    if (typeof window === "undefined" || !window.google || !window.google.accounts || !window.google.accounts.oauth2) {
      return false;
    }

    if (!tokenClient) {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: config.oauthClientId,
        scope: config.oauthScope,
        callback: handleTokenResponse,
        error_callback: handleOAuthError
      });
    }

    return true;
  }

  function handleTokenResponse(response) {
    if (!response || response.error || !response.access_token) {
      clearTokenState();
      const err = new Error(response && response.error ? response.error : "Google authorization failed.");
      if (pendingAuthResolver) {
        pendingAuthResolver.reject(err);
        pendingAuthResolver = null;
      }
      notifyAuthState(false);
      return;
    }

    const expiresInSeconds = Number(response.expires_in || 0);
    accessToken = response.access_token;
    accessTokenExpiresAt = Date.now() + (expiresInSeconds * 1000);
    hasExplicitlySignedOutState = false;

    if (pendingAuthResolver) {
      pendingAuthResolver.resolve(accessToken);
      pendingAuthResolver = null;
    }

    notifyAuthState(true);
  }

  function handleOAuthError(error) {
    clearTokenState();
    const err = new Error(error && error.type ? `OAuth error: ${error.type}` : "Google authorization was cancelled or failed.");
    if (pendingAuthResolver) {
      pendingAuthResolver.reject(err);
      pendingAuthResolver = null;
    }
    notifyAuthState(false);
  }

  function clearTokenState() {
    accessToken = null;
    accessTokenExpiresAt = 0;
  }

  function notifyAuthState(isAuth) {
    for (const listener of authStateListeners) {
      try {
        listener(isAuth);
      } catch (err) {
        console.error("Auth state listener error:", err);
      }
    }
  }

  function isAuthorized() {
    return Boolean(
      accessToken &&
      (accessTokenExpiresAt - Date.now() > minimumTokenLifetimeMs)
    );
  }

  function hasExplicitlySignedOut() {
    return hasExplicitlySignedOutState;
  }

  function onAuthStateChanged(listener) {
    if (typeof listener === "function") {
      authStateListeners.push(listener);
    }
  }

  function authorize() {
    hasExplicitlySignedOutState = false;

    return new Promise((resolve, reject) => {
      waitForGoogleIdentity(3000).then((ready) => {
        if (!ready || !initGoogleIdentity()) {
          if (typeof window === "undefined" || !window.google || !window.google.accounts) {
            reject(new Error("Google Identity Services script is not loaded yet. Please try again."));
          } else {
            reject(new Error("Configuration invalid. Please verify config.js."));
          }
          return;
        }

        pendingAuthResolver = { resolve, reject };
        tokenClient.requestAccessToken({ prompt: "consent" });
      }).catch(reject);
    });
  }

  function trySilentAuthorize() {
    if (hasExplicitlySignedOutState) {
      return Promise.reject(new Error("User explicitly signed out in this session."));
    }

    if (isAuthorized()) {
      return Promise.resolve(accessToken);
    }

    if (pendingAuthResolver) {
      return new Promise((resolve, reject) => {
        const checkDone = setInterval(() => {
          if (!pendingAuthResolver) {
            clearInterval(checkDone);
            if (isAuthorized()) {
              resolve(accessToken);
            } else {
              reject(new Error("Pending authorization finished without token."));
            }
          }
        }, 50);
      });
    }

    return new Promise((resolve, reject) => {
      waitForGoogleIdentity(3000).then((ready) => {
        if (!ready || !initGoogleIdentity()) {
          reject(new Error("Google Identity Services is not available."));
          return;
        }

        let timerId = null;
        pendingAuthResolver = {
          resolve: (token) => {
            if (timerId) clearTimeout(timerId);
            resolve(token);
          },
          reject: (err) => {
            if (timerId) clearTimeout(timerId);
            reject(err);
          }
        };

        timerId = setTimeout(() => {
          if (pendingAuthResolver) {
            pendingAuthResolver = null;
            reject(new Error("Silent authorization timed out."));
          }
        }, 6000);

        try {
          tokenClient.requestAccessToken({ prompt: "" });
        } catch (err) {
          if (timerId) clearTimeout(timerId);
          pendingAuthResolver = null;
          reject(err);
        }
      }).catch(reject);
    });
  }

  function signOut() {
    hasExplicitlySignedOutState = true;
    const tokenToRevoke = accessToken;
    clearTokenState();

    if (
      tokenToRevoke &&
      typeof window !== "undefined" &&
      window.google &&
      window.google.accounts &&
      window.google.accounts.oauth2 &&
      typeof window.google.accounts.oauth2.revoke === "function"
    ) {
      try {
        window.google.accounts.oauth2.revoke(tokenToRevoke, () => {});
      } catch (err) {
        console.warn("Could not revoke token with Google:", err);
      }
    }

    notifyAuthState(false);
  }

  async function runApi(action, payload, isRetry = false) {
    const isRead = action === "getExpenses";
    let token = accessToken;

    if (!isAuthorized()) {
      if (isRead && !hasExplicitlySignedOutState && !isRetry) {
        try {
          token = await trySilentAuthorize();
        } catch (silentErr) {
          clearTokenState();
          notifyAuthState(false);
          throw new Error("Authorization is missing or expired. Please sign in again.");
        }
      } else {
        clearTokenState();
        notifyAuthState(false);
        throw new Error(
          isRead
            ? "Authorization is missing or expired. Please sign in again."
            : "Authorization is missing or expired. Please authorize again before saving changes."
        );
      }
    }

    const fetchFn = (typeof window !== "undefined" && window.fetch)
      ? window.fetch
      : (typeof fetch !== "undefined" ? fetch : null);
    if (!fetchFn) {
      throw new Error("fetch is not available in current environment.");
    }

    const url = `https://script.googleapis.com/v1/scripts/${encodeURIComponent(config.apiExecutableDeploymentId)}:run`;

    const response = await fetchFn(url, {
      method: "POST",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        function: apiFunctionName,
        parameters: [{ action, payload: payload || {} }],
        devMode: false
      })
    });

    if (response.status === 401) {
      clearTokenState();
      if (isRead && !hasExplicitlySignedOutState && !isRetry) {
        try {
          await trySilentAuthorize();
          return await runApi(action, payload, true);
        } catch (retryErr) {
          notifyAuthState(false);
          throw new Error("Authorization expired or denied (HTTP 401). Please sign in again.");
        }
      } else {
        notifyAuthState(false);
        throw new Error("Authorization expired or denied (HTTP 401). Please sign in again.");
      }
    }

    const operation = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        operation.error && operation.error.message
          ? operation.error.message
          : `Apps Script API request failed with HTTP ${response.status}.`
      );
    }

    if (operation.error) {
      const detail = Array.isArray(operation.error.details)
        ? operation.error.details[0]
        : null;
      throw new Error(
        detail && detail.errorMessage
          ? detail.errorMessage
          : operation.error.message || "Apps Script execution failed."
      );
    }

    return operation.response ? operation.response.result : null;
  }

  async function getExpenses(forceRefresh) {
    const response = await runApi("getExpenses", { forceRefresh: Boolean(forceRefresh) });
    return response && Array.isArray(response.expenses) ? response.expenses : [];
  }

  async function addExpense(expense) {
    const response = await runApi("addExpense", expense);
    return response && response.result ? response.result : response;
  }

  async function updateExpense(expense) {
    const response = await runApi("updateExpense", expense);
    return response && response.result ? response.result : response;
  }

  async function deleteExpense(id) {
    const response = await runApi("deleteExpense", { id });
    return response && response.result ? response.result : response;
  }

  return Object.freeze({
    initGoogleIdentity,
    authorize,
    trySilentAuthorize,
    signOut,
    isAuthorized,
    hasExplicitlySignedOut,
    onAuthStateChanged,
    getExpenses,
    addExpense,
    updateExpense,
    deleteExpense
  });
})();

if (typeof window !== "undefined") {
  window.financeApi = financeApi;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { financeApi };
}
