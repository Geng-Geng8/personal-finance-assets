const financeApi = (() => {
  "use strict";

  const STORAGE_KEY = "personalFinance.deviceKey";
  const PIN_STORAGE_KEY = "personalFinance.pin";
  const KEY_REGEX = /^[a-f0-9]{64}$/i;
  const ALLOWED_ACTIONS = Object.freeze(["getExpenses", "addExpense", "updateExpense", "deleteExpense", "getWealth", "updateWealthAccountBalance", "updateWealthReserve", "getSpendingBuckets", "updateSpendingBuckets"]);

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

  function getPin() {
    const storage = getStorage();
    if (!storage) return null;
    try {
      const stored = storage.getItem(PIN_STORAGE_KEY);
      if (stored && typeof stored === "string" && stored.trim().length > 0) {
        return stored.trim();
      }
    } catch (_) {}
    return null;
  }

  function hasPin() {
    return Boolean(getPin());
  }

  function setPin(rawPin) {
    if (!rawPin) return false;
    const storage = getStorage();
    if (!storage) {
      throw new Error("Local storage is not available on this device.");
    }
    const normalized = String(rawPin).trim();
    storage.setItem(PIN_STORAGE_KEY, normalized);
    return true;
  }

  function clearPin() {
    const storage = getStorage();
    if (storage) {
      try {
        storage.removeItem(PIN_STORAGE_KEY);
      } catch (_) {}
    }
  }

  function isGuest() {
    return getPin() === "8888";
  }

  function isMaster() {
    return getPin() === "1234";
  }

  async function fetchViaGet(action, params) {
    const pin = getPin();
    const config = getConfig();
    const endpoint = config.webAppEndpointUrl;
    let url;
    try {
      const urlObj = new URL(endpoint);
      urlObj.searchParams.set("action", action);
      if (pin) urlObj.searchParams.set("pin", pin);
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          urlObj.searchParams.set(k, String(v));
        }
      }
      url = urlObj.toString();
    } catch (_) {
      url = endpoint + (endpoint.indexOf("?") === -1 ? "?" : "&") + "action=" + encodeURIComponent(action);
      if (pin) url += "&pin=" + encodeURIComponent(pin);
    }
    const fetchFn = (typeof window !== "undefined" && window.fetch) ? window.fetch : (typeof fetch !== "undefined" ? fetch : null);
    const response = await fetchFn(url, { method: "GET" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok === false) {
      throw new Error(result.error || "GET request failed");
    }
    return result;
  }

  async function runApi(action, payload) {
    if (!ALLOWED_ACTIONS.includes(action)) {
      throw new Error("Unsupported API action: " + action);
    }

    const deviceKey = getDeviceKey();
    const pin = getPin();
    if (!deviceKey && !pin) {
      throw new Error("Device is not configured (Authorization is missing or expired). Please enter your device key.");
    }

    if (pin === "8888" && action !== "getExpenses" && action !== "getWealth" && action !== "getSpendingBuckets") {
      throw new Error("Read-only access");
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

    let fetchUrl = endpoint;
    if (pin) {
      try {
        const urlObj = new URL(endpoint);
        urlObj.searchParams.set("pin", pin);
        fetchUrl = urlObj.toString();
      } catch (_) {
        fetchUrl = endpoint + (endpoint.indexOf("?") === -1 ? "?" : "&") + "pin=" + encodeURIComponent(pin);
      }
    }

    const payloadWithPin = Object.assign({}, payload || {});
    if (pin) {
      payloadWithPin.pin = pin;
    }

    const requestBody = {
      action,
      payload: payloadWithPin
    };
    if (deviceKey) {
      requestBody.deviceKey = deviceKey;
    }
    if (pin) {
      requestBody.pin = pin;
    }

    const tFetchStart = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    const response = await fetchFn(fetchUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(requestBody)
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

    if (action === "getSpendingBuckets" || action === "updateSpendingBuckets") {
      return result.buckets !== undefined ? result.buckets : null;
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

  async function getSpendingBuckets() {
    return runApi("getSpendingBuckets", {});
  }

  async function updateSpendingBuckets(payload) {
    return runApi("updateSpendingBuckets", payload);
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
    getSpendingBuckets,
    updateSpendingBuckets,
    addExpense,
    updateExpense,
    deleteExpense,
    isAuthorized,
    onAuthStateChanged,
    getLastTimings,
    getPin,
    setPin,
    clearPin,
    hasPin,
    isGuest,
    isMaster,
    fetchViaGet,
    signOut: function() {
      clearDeviceKey();
      clearPin();
    }
  });
})();

if (typeof window !== "undefined") {
  window.financeApi = financeApi;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { financeApi };
}
