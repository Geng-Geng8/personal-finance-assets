const financeApi = (() => {
  "use strict";

  const STORAGE_KEY = "personalFinance.deviceKey";
  const KEY_REGEX = /^[a-f0-9]{64}$/i;
  const ALLOWED_ACTIONS = Object.freeze(["getExpenses", "addExpense", "updateExpense", "deleteExpense", "getWealth", "updateWealthAccountBalance", "updateWealthReserve"]);

  let lastApiTimings = {
    fetchDurationMs: 0,
    parseDurationMs: 0
  };

  function getLastTimings() {
    return Object.assign({}, lastApiTimings);
  }

  function getConfig() {
    return (typeof window !== "undefined" && window.FINANCE_APP_CONFIG)
      ? window.FINANCE_APP_CONFIG
      : {};
  }

  function getStorage() {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        return window.localStorage;
      }
    } catch (_) {}
    return null;
  }

  function isValidKeyFormat(key) {
    return typeof key === "string" && KEY_REGEX.test(key.trim());
  }

  function getDeviceKey() {
    const storage = getStorage();
    if (!storage) return null;
    try {
      const stored = storage.getItem(STORAGE_KEY);
      if (stored && isValidKeyFormat(stored)) {
        return stored.trim().toLowerCase();
      }
    } catch (_) {}
    return null;
  }

  function hasDeviceKey() {
    return Boolean(getDeviceKey());
  }

  function setDeviceKey(rawKey) {
    if (!isValidKeyFormat(rawKey)) {
      throw new Error("Invalid device key format. Expected a 64-character hexadecimal key.");
    }
    const storage = getStorage();
    if (!storage) {
      throw new Error("Local storage is not available on this device.");
    }
    const normalized = rawKey.trim().toLowerCase();
    storage.setItem(STORAGE_KEY, normalized);
    return true;
  }

  function clearDeviceKey() {
    const storage = getStorage();
    if (storage) {
      try {
        storage.removeItem(STORAGE_KEY);
      } catch (_) {}
    }
  }

  async function runApi(action, payload) {
    if (!ALLOWED_ACTIONS.includes(action)) {
      throw new Error("Unsupported API action: " + action);
    }

    const deviceKey = getDeviceKey();
    if (!deviceKey) {
      throw new Error("Device is not configured (Authorization is missing or expired). Please enter your device key.");
    }

    const config = getConfig();
    const endpoint = config.webAppEndpointUrl;
    if (!endpoint || typeof endpoint !== "string" || !endpoint.startsWith("https://script.google.com/")) {
      throw new Error("Web App endpoint URL is not configured in config.js.");
    }

    const fetchFn = (typeof window !== "undefined" && window.fetch)
      ? window.fetch
      : (typeof fetch !== "undefined" ? fetch : null);
    if (!fetchFn) {
      throw new Error("fetch is not available in current environment.");
    }

    const tFetchStart = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    const response = await fetchFn(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify({
        deviceKey,
        action,
        payload: payload || {}
      })
    });
    const tFetchEnd = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();

    const tParseStart = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    const result = await response.json().catch(() => ({}));
    const tParseEnd = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();

    lastApiTimings = {
      fetchDurationMs: tFetchEnd - tFetchStart,
      parseDurationMs: tParseEnd - tParseStart
    };

    if (!response.ok) {
      throw new Error(
        result.error || `Apps Script Web App request failed with HTTP ${response.status}.`
      );
    }

    if (result.ok === false) {
      if (result.error === "Unauthorized") {
        clearDeviceKey();
        throw new Error("Unauthorized: Invalid device key. Access cleared.");
      }
      throw new Error(result.error || "Request failed");
    }

    if (action === "getExpenses") {
      return Array.isArray(result.expenses) ? result.expenses : [];
    }

    if (action === "getWealth" || action === "updateWealthAccountBalance" || action === "updateWealthReserve") {
      return result.wealth !== undefined ? result.wealth : null;
    }

    return result.result !== undefined ? result.result : result;
  }

  async function getExpenses(forceRefresh) {
    return runApi("getExpenses", { forceRefresh: Boolean(forceRefresh) });
  }

  async function getWealth() {
    return runApi("getWealth", {});
  }

  async function updateWealthAccountBalance(payload) {
    return runApi("updateWealthAccountBalance", payload);
  }

  async function updateWealthReserve(payload) {
    return runApi("updateWealthReserve", payload);
  }

  async function addExpense(expense) {
    return runApi("addExpense", expense);
  }

  async function updateExpense(expense) {
    return runApi("updateExpense", expense);
  }

  async function deleteExpense(id) {
    const expenseId = typeof id === "object" && id !== null ? id.id : id;
    return runApi("deleteExpense", { id: expenseId });
  }

  // Compatibility helpers
  function isAuthorized() {
    return hasDeviceKey();
  }

  function onAuthStateChanged(cb) {
    // In device-key mode, auth state corresponds to presence of valid device key
    if (typeof cb === "function") {
      cb(hasDeviceKey());
    }
  }

  return Object.freeze({
    hasDeviceKey,
    getDeviceKey,
    setDeviceKey,
    clearDeviceKey,
    isValidKeyFormat,
    runApi,
    getExpenses,
    getWealth,
    updateWealthAccountBalance,
    updateWealthReserve,
    addExpense,
    updateExpense,
    deleteExpense,
    isAuthorized,
    onAuthStateChanged,
    getLastTimings,
    signOut: clearDeviceKey
  });
})();

if (typeof window !== "undefined") {
  window.financeApi = financeApi;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { financeApi };
}
