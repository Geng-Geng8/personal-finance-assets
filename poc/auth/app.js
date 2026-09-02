(() => {
  "use strict";

  const config = window.STAGE2_AUTH_POC_CONFIG || {};
  const apiFunctionName = "apiRequest";
  const minimumTokenLifetimeMs = 6 * 60 * 1000;

  let tokenClient = null;
  let accessToken = null;
  let accessTokenExpiresAt = 0;

  const elements = {};

  function hasUsableConfiguration() {
    return (
      typeof config.oauthClientId === "string" &&
      config.oauthClientId.endsWith(".apps.googleusercontent.com") &&
      typeof config.apiExecutableDeploymentId === "string" &&
      config.apiExecutableDeploymentId.startsWith("AKfy") &&
      config.oauthScope === "https://www.googleapis.com/auth/spreadsheets"
    );
  }

  function initializeElements() {
    elements.authorizeButton = document.getElementById("authorizeButton");
    elements.clearTokenButton = document.getElementById("clearTokenButton");
    elements.readButton = document.getElementById("readButton");
    elements.expenseFields = document.getElementById("expenseFields");
    elements.status = document.getElementById("status");
    elements.messageOutput = document.getElementById("messageOutput");
    elements.expenseRows = document.getElementById("expenseRows");

    elements.authorizeButton.addEventListener("click", authorize);
    elements.clearTokenButton.addEventListener("click", clearAuthorization);
    elements.readButton.addEventListener("click", loadExpenses);
    document.getElementById("addButton").addEventListener("click", addExpense);
    document.getElementById("updateButton").addEventListener("click", updateExpense);
    document.getElementById("deleteButton").addEventListener("click", deleteExpense);
  }

  function initializeGoogle() {
    if (!elements.status) {
      return;
    }

    if (!hasUsableConfiguration()) {
      setStatus("Replace the test OAuth client and deployment placeholders in config.js.", "error");
      elements.authorizeButton.disabled = true;
      return;
    }

    if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
      setStatus("Waiting for Google Identity Services.", "waiting");
      return;
    }

    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: config.oauthClientId,
      scope: config.oauthScope,
      callback: handleTokenResponse,
      error_callback: handleOAuthError
    });

    elements.authorizeButton.disabled = false;
    setStatus("Ready to authorize. No token is stored.", "waiting");
  }

  function authorize() {
    if (!tokenClient) {
      setStatus("Google authorization is not ready.", "error");
      return;
    }

    tokenClient.requestAccessToken({ prompt: "consent" });
  }

  function handleTokenResponse(response) {
    if (!response || response.error || !response.access_token) {
      clearTokenState();
      setStatus("Google authorization was denied or failed.", "error");
      return;
    }

    const expiresInSeconds = Number(response.expires_in || 0);
    accessToken = response.access_token;
    accessTokenExpiresAt = Date.now() + expiresInSeconds * 1000;

    elements.clearTokenButton.disabled = false;
    elements.readButton.disabled = false;
    elements.expenseFields.disabled = false;
    setStatus("Authorized. The access token is held in memory only.", "authorized");
  }

  function handleOAuthError() {
    clearTokenState();
    setStatus("Google authorization did not complete.", "error");
  }

  function clearAuthorization() {
    const tokenToRevoke = accessToken;
    clearTokenState();

    if (
      tokenToRevoke &&
      window.google &&
      window.google.accounts &&
      window.google.accounts.oauth2
    ) {
      window.google.accounts.oauth2.revoke(tokenToRevoke, () => {
        setStatus("Authorization revoked and in-memory token cleared.", "waiting");
      });
      return;
    }

    setStatus("In-memory token cleared.", "waiting");
  }

  function clearTokenState() {
    accessToken = null;
    accessTokenExpiresAt = 0;

    if (elements.clearTokenButton) {
      elements.clearTokenButton.disabled = true;
      elements.readButton.disabled = true;
      elements.expenseFields.disabled = true;
    }
  }

  function requireUsableToken() {
    const remainingLifetime = accessTokenExpiresAt - Date.now();

    if (!accessToken || remainingLifetime <= minimumTokenLifetimeMs) {
      clearTokenState();
      throw new Error("Authorization is missing or too close to expiry. Authorize again.");
    }

    return accessToken;
  }

  async function runApi(action, payload) {
    const token = requireUsableToken();
    const response = await fetch(
      `https://script.googleapis.com/v1/scripts/${encodeURIComponent(config.apiExecutableDeploymentId)}:run`,
      {
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
      }
    );

    const operation = await response.json().catch(() => ({}));

    if (response.status === 401) {
      clearTokenState();
    }

    if (!response.ok) {
      throw new Error(operation.error && operation.error.message
        ? operation.error.message
        : `Apps Script API request failed with HTTP ${response.status}.`);
    }

    if (operation.error) {
      const detail = Array.isArray(operation.error.details)
        ? operation.error.details[0]
        : null;
      throw new Error(detail && detail.errorMessage
        ? detail.errorMessage
        : operation.error.message || "Apps Script execution failed.");
    }

    return operation.response ? operation.response.result : null;
  }

  function getExpensePayload() {
    return {
      id: document.getElementById("recordId").value.trim(),
      date: document.getElementById("date").value,
      cost: document.getElementById("cost").value,
      bucket: document.getElementById("bucket").value,
      category: document.getElementById("category").value.trim(),
      item: document.getElementById("item").value.trim(),
      notes: document.getElementById("notes").value.trim(),
      paymentMethod: document.getElementById("paymentMethod").value
    };
  }

  async function loadExpenses() {
    await runAction(async () => {
      const result = await runApi("getExpenses", {});
      renderExpenses(result && Array.isArray(result.expenses) ? result.expenses : []);
      return result;
    });
  }

  async function addExpense() {
    await runMutation("addExpense", getExpensePayload());
  }

  async function updateExpense() {
    const expense = getExpensePayload();
    if (!expense.id) {
      showMessage("Record ID is required for update.");
      return;
    }
    await runMutation("updateExpense", expense);
  }

  async function deleteExpense() {
    const id = document.getElementById("recordId").value.trim();
    if (!id) {
      showMessage("Record ID is required for delete.");
      return;
    }
    await runMutation("deleteExpense", { id });
  }

  async function runMutation(action, payload) {
    await runAction(async () => {
      const result = await runApi(action, payload);
      const refreshed = await runApi("getExpenses", {});
      renderExpenses(refreshed && Array.isArray(refreshed.expenses) ? refreshed.expenses : []);
      return result;
    });
  }

  async function runAction(action) {
    setControlsBusy(true);
    try {
      const result = await action();
      showMessage(JSON.stringify(result, null, 2));
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setControlsBusy(false);
    }
  }

  function setControlsBusy(isBusy) {
    const authorized = Boolean(accessToken);
    elements.authorizeButton.disabled = isBusy || !tokenClient;
    elements.clearTokenButton.disabled = isBusy || !authorized;
    elements.readButton.disabled = isBusy || !authorized;
    elements.expenseFields.disabled = isBusy || !authorized;
  }

  function setStatus(message, state) {
    elements.status.textContent = message;
    elements.status.dataset.state = state;
  }

  function showMessage(message) {
    elements.messageOutput.textContent = message;
  }

  function renderExpenses(expenses) {
    elements.expenseRows.replaceChildren();

    expenses.forEach(expense => {
      const row = document.createElement("tr");
      [
        expense.id,
        expense.date,
        expense.cost,
        expense.bucket,
        expense.category,
        expense.item,
        expense.notes,
        expense.paymentMethod
      ].forEach(value => {
        const cell = document.createElement("td");
        cell.textContent = value == null ? "" : String(value);
        row.appendChild(cell);
      });
      elements.expenseRows.appendChild(row);
    });
  }

  window.stage2AuthPoc = { initializeGoogle };

  document.addEventListener("DOMContentLoaded", () => {
    initializeElements();
    initializeGoogle();
  });
})();
