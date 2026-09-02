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

  function onAuthStateChanged(listener) {
    if (typeof listener === "function") {
      authStateListeners.push(listener);
    }
  }

  function authorize() {
    return new Promise((resolve, reject) => {
      if (!initGoogleIdentity()) {
        if (!window.google || !window.google.accounts) {
          reject(new Error("Google Identity Services script is not loaded yet. Please try again."));
        } else {
          reject(new Error("Configuration invalid. Please verify config.js."));
        }
        return;
      }

      pendingAuthResolver = { resolve, reject };
      tokenClient.requestAccessToken({ prompt: "consent" });
    });
  }

  function signOut() {
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

  function requireUsableToken() {
    const remainingLifetime = accessTokenExpiresAt - Date.now();

    if (!accessToken || remainingLifetime <= minimumTokenLifetimeMs) {
      clearTokenState();
      notifyAuthState(false);
      throw new Error("Authorization is missing or expired. Please authorize again.");
    }

    return accessToken;
  }

  async function runApi(action, payload) {
    const token = requireUsableToken();
    const url = `https://script.googleapis.com/v1/scripts/${encodeURIComponent(config.apiExecutableDeploymentId)}:run`;

    const response = await fetch(url, {
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

    const operation = await response.json().catch(() => ({}));

    if (response.status === 401) {
      clearTokenState();
      notifyAuthState(false);
      throw new Error("Authorization expired or denied (HTTP 401). Please sign in again.");
    }

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
    const payload = typeof id === "object" && id !== null ? id : { id: String(id || "").trim() };
    const response = await runApi("deleteExpense", payload);
    return response && response.result ? response.result : response;
  }

  return Object.freeze({
    initGoogleIdentity,
    authorize,
    signOut,
    isAuthorized,
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
