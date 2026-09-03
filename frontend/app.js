
  /* =========================================
     CONFIG
  ========================================= */

  const CATEGORY_MAP = {

    "Play": [
      "Fitness",
      "Eating Out",
      "Travel",
      "Entertainment",
      "Amazon",
      "Clothing"
    ],

    "Necessity": [
      "Health",
      "Household",
      "Grocery",
      "Car & Transportation",
      "Personal Care",
      "Taxes"
    ],

    "Small Business": [
      "Subscription",
      "Websites",
      "Marketing",
      "Business",
      "Ai Subscriptions",
      "Travel and Transportation"
    ],

    "Education": [
      "Courses",
      "Tech",
      "Books"
    ],

    "Giving": [
      "Gifts",
      "Charity",
      "Misc"
    ]

  };


  const PAYMENT_METHODS = [
    "Cash",
    "E-Transfer",
    "Credit Card",
    "Other"
  ];


  const CHART_COLORS = [
    "#2864dc",
    "#7557d8",
    "#2ea46f",
    "#f39a3c",
    "#e05d5d",
    "#15a1a1",
    "#5c7cfa",
    "#d16ba5",
    "#8f6c3e",
    "#74a832",
    "#e17835",
    "#697386"
  ];


  /* =========================================
     LOCAL CACHE & PERFORMANCE
  ========================================= */

  const SNAPSHOT_CACHE_KEY = "personalFinance.expenseSnapshot";
  const SNAPSHOT_UPDATED_AT_KEY = "personalFinance.expenseSnapshotUpdatedAt";
  const WEALTH_SNAPSHOT_KEY = "personalFinance.wealthSnapshot";
  const WEALTH_SNAPSHOT_UPDATED_AT_KEY = "personalFinance.wealthSnapshotUpdatedAt";
  const EXPENSE_CACHE_KEY = SNAPSHOT_CACHE_KEY;
  const EXPENSE_CACHE_VERSION = 1;

  let currentInsightsSubView = "spending";
  let currentWealthData = null;
  let isFetchingWealth = false;

  const APP_INIT_TIMESTAMP = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
  let startupTimingLogged = false;


  /* =========================================
     PROGRESSIVE RENDERING
  ========================================= */

  const INITIAL_EXPENSE_RENDER_COUNT = 40;

  const EXPENSE_RENDER_BATCH_SIZE = 40;

  const EXPENSE_SCROLL_TRIGGER_DISTANCE = 700;


  /* =========================================
     V2 BRICK 5
     SMART SYNC
  ========================================= */

  /*
   * If we have checked the real Sheet
   * within the last 60 seconds, returning
   * to the app does not need another call.
   */
  const SMART_SYNC_STALE_MS =
    60 * 1000;


  /*
   * Prevent rapid visibility/focus events
   * from repeatedly scheduling work.
   */
  const SMART_SYNC_DEBOUNCE_MS =
    300;


  /* =========================================
     STATE
  ========================================= */

  let currentExpenses = [];

  let filteredExpenses = [];

  let insightExpenses = [];

  let currentView = "expenses";

  let selectedBucket = "Play";

  let selectedCategory = "";

  let selectedPaymentMethod = "";

  let editingExpenseId = null;

  let toastTimer = null;

  let hasRenderedExpenseData = false;

  let lastSuccessfulSyncAt = null;


  /* =========================================
     OPTIMISTIC WRITE STATE
  ========================================= */

  let pendingWriteCount = 0;

  let localMutationVersion = 0;


  /* =========================================
     PROGRESSIVE RENDER STATE
  ========================================= */

  let expenseRenderLimit =
    INITIAL_EXPENSE_RENDER_COUNT;


  let expenseScrollFramePending = false;


  /* =========================================
     V2 BRICK 5
     NETWORK / SMART SYNC STATE
  ========================================= */

  let serverRefreshInFlight = false;


  /*
   * If another authoritative refresh is
   * requested while one is running,
   * remember only one.
   */
  let queuedForceServerRefresh = false;


  /*
   * Tracks when we last completed a
   * DIRECT Google Sheet read.
   */
  let lastAuthoritativeRefreshAt = 0;


  let smartSyncTimer = null;


  /* =========================================
     FILTER STATE
  ========================================= */

  let filters = {

    search: "",

    bucket: "",

    category: "",

    paymentMethod: "",

    dateRange: "all",

    startDate: "",

    endDate: "",

    month: "",

    year: ""

  };


  let insightFilters = {

    dateRange: "all",

    startDate: "",

    endDate: "",

    month: "",

    year: ""

  };


  /* =========================================
     ELEMENTS
  ========================================= */

  const expenseList =
    document.getElementById(
      "expenseList"
    );


  const loadingState =
    document.getElementById(
      "loadingState"
    );


  const emptyState =
    document.getElementById(
      "emptyState"
    );


  const searchInput =
    document.getElementById(
      "searchInput"
    );


  const clearSearchButton =
    document.getElementById(
      "clearSearchButton"
    );


  const editorSheet =
    document.getElementById(
      "editorSheet"
    );


  const editorBackdrop =
    document.getElementById(
      "editorBackdrop"
    );


  const expenseForm =
    document.getElementById(
      "expenseForm"
    );


  const formError =
    document.getElementById(
      "formError"
    );


  const saveButton =
    document.getElementById(
      "saveButton"
    );


  const filterSheet =
    document.getElementById(
      "filterSheet"
    );


  const filterBackdrop =
    document.getElementById(
      "filterBackdrop"
    );


  /* =========================================
     INITIALIZE
  ========================================= */

  function initializeApp() {

    setupNavigation();

    setupRefresh();

    setupExpenseSearch();

    setupExpenseFilters();

    setupInsightFilters();

    setupExpenseEditor();

    setupProgressiveExpenseRendering();

    setupSmartSync();


    renderBucketChoices();

    renderCategoryChoices();

    renderPaymentChoices();

    renderExpenseFilterBuckets();

    renderExpenseFilterCategories();

    renderExpenseFilterPayments();


    setupAuthGate();

    setupPwaInstall();

  }


  /* =========================================
     STAGE 4A AUTH GATE & SESSION RESTORE
  ========================================= */

  let appSessionStarted = false;

  /* =========================================
     STAGE 4B SYNC STATUS CONTROLLER
  ========================================= */

  function updateSyncStatus(status, label) {
    const livePill = document.getElementById("livePill");
    const liveStatusText = document.getElementById("liveStatusText");
    if (!livePill) return;

    livePill.classList.remove("updating", "error", "live");

    if (status === "updating") {
      livePill.classList.add("updating");
      if (liveStatusText) liveStatusText.textContent = label || "Updating…";
      livePill.title = "Syncing with Google Sheets…";
    } else if (status === "error") {
      livePill.classList.add("error");
      const timeStr = lastSuccessfulSyncAt
        ? new Date(lastSuccessfulSyncAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
        : "";
      if (liveStatusText) liveStatusText.textContent = label || (timeStr ? `Updated ${timeStr}` : "Saved data");
      livePill.title = "Could not refresh server data. Showing saved finances.";
    } else {
      livePill.classList.add("live");
      if (liveStatusText) liveStatusText.textContent = label || "Live";
      livePill.title = "Authoritative production data";
    }
  }

  function startAuthorizedSession(options) {
    const isBackgroundOnly = Boolean(options && options.backgroundOnly);

    if (appSessionStarted) {
      loadExpenses({
        showLoading: false,
        forceServerRefresh: true
      });
      return;
    }

    appSessionStarted = true;
    startExpenseSyncTimer();

    if (!isBackgroundOnly) {
      const restored = restoreExpensesFromCache();
      if (restored && hideAuthGateFn) {
        hideAuthGateFn();
        updateSyncStatus("updating");
      }
    }

    loadExpenses({
      showLoading: !hasRenderedExpenseData,
      forceServerRefresh: false
    });
  }

  function clearAuthorizedSession() {
    appSessionStarted = false;
    currentExpenses = [];
    hasRenderedExpenseData = false;

    const list = document.getElementById("expenseList");
    if (list) {
      list.innerHTML = "";
    }

    if (typeof document !== "undefined" && document.documentElement) {
      document.documentElement.classList.remove("fast-start");
    }

    removeExpenseCache();
  }

  let showDeviceSetupScreenFn = null;
  let hideAuthGateFn = null;

  function setupAuthGate() {
    const authGate = document.getElementById("authGate");
    const authLoadingState = document.getElementById("authLoadingState");
    const deviceSetupState = document.getElementById("deviceSetupState");
    const deviceKeyInput = document.getElementById("deviceKeyInput");
    const toggleKeyVisibility = document.getElementById("toggleKeyVisibility");
    const saveDeviceKeyButton = document.getElementById("saveDeviceKeyButton");
    const deviceSetupStatus = document.getElementById("deviceSetupStatus");
    const signOutButtons = document.querySelectorAll(".sign-out-button, .remove-device-button");

    function showLoading(text) {
      if (authGate) authGate.classList.remove("hidden");
      if (authLoadingState) authLoadingState.classList.remove("hidden");
      if (deviceSetupState) deviceSetupState.classList.add("hidden");
      const loadingText = document.querySelector(".auth-loading-text");
      if (loadingText && text) loadingText.textContent = text;
    }

    function showSetup(statusText, state) {
      if (authGate) authGate.classList.remove("hidden");
      if (authLoadingState) authLoadingState.classList.add("hidden");
      if (deviceSetupState) deviceSetupState.classList.remove("hidden");
      if (deviceKeyInput) deviceKeyInput.value = "";
      if (saveDeviceKeyButton) saveDeviceKeyButton.disabled = true;
      if (deviceSetupStatus) {
        deviceSetupStatus.textContent = statusText || "Enter your private key once to link this device.";
        deviceSetupStatus.dataset.state = state || "waiting";
      }
    }

    function hideAuthGate() {
      if (authGate) authGate.classList.add("hidden");
    }

    showDeviceSetupScreenFn = showSetup;
    hideAuthGateFn = hideAuthGate;

    function validateInputKey() {
      if (!deviceKeyInput) return;
      const val = deviceKeyInput.value.trim();
      if (financeApi.isValidKeyFormat(val)) {
        if (saveDeviceKeyButton) saveDeviceKeyButton.disabled = false;
        if (deviceSetupStatus) {
          deviceSetupStatus.textContent = "Valid key format. Click Set Up Device to link.";
          deviceSetupStatus.dataset.state = "authorized";
        }
      } else if (!val) {
        if (saveDeviceKeyButton) saveDeviceKeyButton.disabled = true;
        if (deviceSetupStatus) {
          deviceSetupStatus.textContent = "Enter your private key once to link this device.";
          deviceSetupStatus.dataset.state = "waiting";
        }
      } else {
        if (saveDeviceKeyButton) saveDeviceKeyButton.disabled = true;
        if (deviceSetupStatus) {
          deviceSetupStatus.textContent = "Key must be 64 hexadecimal characters.";
          deviceSetupStatus.dataset.state = "waiting";
        }
      }
    }

    if (deviceKeyInput) {
      deviceKeyInput.addEventListener("input", validateInputKey);
      deviceKeyInput.addEventListener("paste", function() {
        setTimeout(function() {
          if (deviceKeyInput) {
            deviceKeyInput.value = deviceKeyInput.value.trim();
            validateInputKey();
          }
        }, 0);
      });
    }

    if (toggleKeyVisibility && deviceKeyInput) {
      toggleKeyVisibility.addEventListener("click", function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (deviceKeyInput.type === "password") {
          deviceKeyInput.type = "text";
          toggleKeyVisibility.textContent = "Hide";
          toggleKeyVisibility.setAttribute("aria-label", "Hide key");
        } else {
          deviceKeyInput.type = "password";
          toggleKeyVisibility.textContent = "Show";
          toggleKeyVisibility.setAttribute("aria-label", "Show key");
        }
      });
    }


    if (saveDeviceKeyButton) {
      saveDeviceKeyButton.addEventListener("click", function() {
        const key = deviceKeyInput ? deviceKeyInput.value.trim() : "";
        try {
          financeApi.setDeviceKey(key);
          showLoading("Verifying device key and loading finances…");
          startAuthorizedSession();
        } catch (err) {
          showSetup(err && err.message ? err.message : "Invalid device key format.", "error");
        }
      });
    }

    const removeDeviceModal = document.getElementById("removeDeviceModal");
    const cancelRemoveDeviceBtn = document.getElementById("cancelRemoveDeviceBtn");
    const confirmRemoveDeviceBtn = document.getElementById("confirmRemoveDeviceBtn");

    function openRemoveDeviceModal() {
      if (removeDeviceModal) {
        removeDeviceModal.classList.remove("hidden");
        if (confirmRemoveDeviceBtn) confirmRemoveDeviceBtn.focus();
      } else {
        const confirmed = window.confirm(
          "Remove this device?\nYou will need your private device key to access your finances again on this device."
        );
        if (confirmed) {
          executeRemoveDevice();
        }
      }
    }

    function closeRemoveDeviceModal() {
      if (removeDeviceModal) {
        removeDeviceModal.classList.add("hidden");
      }
    }

    function executeRemoveDevice() {
      closeRemoveDeviceModal();
      financeApi.clearDeviceKey();
      removeExpenseCache();
      removeWealthCache();
      currentWealthData = null;
      clearAuthorizedSession();
      showSetup("Device access removed. Paste your key to set up again.", "waiting");
      showToast("Device access removed.");
    }

    if (cancelRemoveDeviceBtn) {
      cancelRemoveDeviceBtn.addEventListener("click", closeRemoveDeviceModal);
    }
    if (confirmRemoveDeviceBtn) {
      confirmRemoveDeviceBtn.addEventListener("click", executeRemoveDevice);
    }
    if (removeDeviceModal) {
      removeDeviceModal.addEventListener("click", function(e) {
        if (e.target === removeDeviceModal) {
          closeRemoveDeviceModal();
        }
      });
      window.addEventListener("keydown", function(e) {
        if (e.key === "Escape" && !removeDeviceModal.classList.contains("hidden")) {
          closeRemoveDeviceModal();
        }
      });
    }

    signOutButtons.forEach(function(btn) {
      btn.addEventListener("click", function() {
        openRemoveDeviceModal();
      });
    });

    if (financeApi.hasDeviceKey()) {
      const hasCache = restoreExpensesFromCache();
      if (hasCache) {
        hideAuthGate();
        updateSyncStatus("updating");
        startAuthorizedSession({ backgroundOnly: true });
      } else {
        if (typeof document !== "undefined" && document.documentElement) {
          document.documentElement.classList.remove("fast-start");
        }
        showLoading("Loading your finances…");
        startAuthorizedSession({ backgroundOnly: false });
      }
    } else {
      if (typeof document !== "undefined" && document.documentElement) {
        document.documentElement.classList.remove("fast-start");
      }
      showSetup();
    }
  }

  let pwaInstallDismissed = false;

  function setupPwaInstall() {
    const banner = document.getElementById("pwaInstallBanner");
    const installBtn = document.getElementById("pwaInstallButton");
    const dismissBtn = document.getElementById("pwaDismissButton");
    let deferredPrompt = null;

    const isStandalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
      window.navigator.standalone === true;

    if (isStandalone) {
      if (banner) banner.classList.add("hidden");
      return;
    }

    window.addEventListener("beforeinstallprompt", function(e) {
      e.preventDefault();
      deferredPrompt = e;
      if (banner && !pwaInstallDismissed) {
        banner.classList.remove("hidden");
      }
    });

    if (installBtn) {
      installBtn.addEventListener("click", async function() {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        try {
          const choice = await deferredPrompt.userChoice;
          if (choice && choice.outcome === "accepted") {
            deferredPrompt = null;
            if (banner) banner.classList.add("hidden");
          }
        } catch (_) {}
      });
    }

    if (dismissBtn) {
      dismissBtn.addEventListener("click", function() {
        if (banner) banner.classList.add("hidden");
        pwaInstallDismissed = true;
      });
    }

    window.addEventListener("appinstalled", function() {
      deferredPrompt = null;
      if (banner) banner.classList.add("hidden");
    });
  }



  /* =========================================
     LOCAL CACHE
  ========================================= */

  function restoreExpensesFromCache() {
    try {
      const raw = window.localStorage.getItem(SNAPSHOT_CACHE_KEY);
      if (!raw) return false;

      let expenses;
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          expenses = parsed;
        } else if (parsed && Array.isArray(parsed.expenses)) {
          expenses = parsed.expenses;
        } else {
          removeExpenseCache();
          return false;
        }
      } catch (_) {
        removeExpenseCache();
        return false;
      }

      if (!expenses || expenses.length === 0) return false;

      currentExpenses = expenses;
      lastSuccessfulSyncAt = window.localStorage.getItem(SNAPSHOT_UPDATED_AT_KEY) || null;

      const tRenderStart = (typeof performance !== "undefined" && performance.now) ? performance.now() : 0;
      renderCurrentExpenseData({ resetRenderWindow: true });
      const tRenderEnd = (typeof performance !== "undefined" && performance.now) ? performance.now() : 0;

      hasRenderedExpenseData = true;

      if (loadingState) {
        loadingState.classList.add("hidden");
      }

      if (!startupTimingLogged && typeof performance !== "undefined" && performance.now) {
        startupTimingLogged = true;
        const totalStartupMs = performance.now() - APP_INIT_TIMESTAMP;
        console.log(
          `[Startup Timing] CACHE-FIRST: Cached Expenses rendered in ${(tRenderEnd - tRenderStart).toFixed(1)}ms. Total startup: ${totalStartupMs.toFixed(1)}ms.`
        );
      }

      return true;
    } catch (_) {
      return false;
    }
  }

  function saveExpensesToCache(expenses, syncTimestamp) {
    try {
      if (!Array.isArray(expenses)) return;
      const ts = syncTimestamp || new Date().toISOString();
      window.localStorage.setItem(SNAPSHOT_CACHE_KEY, JSON.stringify(expenses));
      window.localStorage.setItem(SNAPSHOT_UPDATED_AT_KEY, ts);
    } catch (_) {}
  }

  function saveCurrentExpensesToCache() {
    lastSuccessfulSyncAt = new Date().toISOString();
    saveExpensesToCache(currentExpenses, lastSuccessfulSyncAt);
  }

  function removeExpenseCache() {
    try {
      window.localStorage.removeItem(SNAPSHOT_CACHE_KEY);
      window.localStorage.removeItem(SNAPSHOT_UPDATED_AT_KEY);
    } catch (_) {}
  }

  function restoreWealthFromCache() {
    try {
      if (typeof window === "undefined" || !window.localStorage) return false;
      const raw = window.localStorage.getItem(WEALTH_SNAPSHOT_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (data && typeof data === "object" && data.availableCash !== undefined) {
        currentWealthData = data;
        renderWealthView(data);
        return true;
      }
    } catch (_) {}
    return false;
  }

  function saveWealthToCache(data) {
    try {
      if (typeof window === "undefined" || !window.localStorage) return;
      window.localStorage.setItem(WEALTH_SNAPSHOT_KEY, JSON.stringify(data));
      window.localStorage.setItem(WEALTH_SNAPSHOT_UPDATED_AT_KEY, new Date().toISOString());
    } catch (_) {}
  }

  function removeWealthCache() {
    try {
      if (typeof window === "undefined" || !window.localStorage) return;
      window.localStorage.removeItem(WEALTH_SNAPSHOT_KEY);
      window.localStorage.removeItem(WEALTH_SNAPSHOT_UPDATED_AT_KEY);
    } catch (_) {}
  }

  async function fetchWealthData(forceRefresh) {
    if (isFetchingWealth) return;
    if (!financeApi.hasDeviceKey()) return;
    isFetchingWealth = true;

    try {
      updateSyncStatus("updating");
      const wealth = await financeApi.getWealth();
      if (wealth && typeof wealth === "object") {
        currentWealthData = wealth;
        saveWealthToCache(wealth);
        renderWealthView(wealth);
        updateSyncStatus("live");
      }
    } catch (err) {
      if (currentWealthData) {
        updateSyncStatus("error", "Saved data");
      } else {
        updateSyncStatus("error", "Sync error");
      }
    } finally {
      isFetchingWealth = false;
    }
  }

  function renderWealthView(data) {
    if (!data || typeof document === "undefined") return;

    // Available Cash (H14)
    const elAvailable = document.getElementById("wealthAvailableCash");
    if (elAvailable) elAvailable.textContent = formatCurrency(data.availableCash);

    // Section 1: Cash Position (I29)
    const elTotalCash = document.getElementById("wealthTotalCash");
    if (elTotalCash) elTotalCash.textContent = formatCurrency(data.totalCash);

    // Reserves
    const elTaxReserve = document.getElementById("wealthTaxReserve");
    if (elTaxReserve) elTaxReserve.textContent = formatCurrency(data.taxReserve);

    const elIncomeTaxCpp = document.getElementById("wealthIncomeTaxCpp");
    if (elIncomeTaxCpp) elIncomeTaxCpp.textContent = formatCurrency(data.incomeTaxCppReserve);

    const elEmergency = document.getElementById("wealthEmergencyFund");
    if (elEmergency) elEmergency.textContent = formatCurrency(data.emergencyFund);

    const totalReserves = (data.taxReserve || 0) + (data.incomeTaxCppReserve || 0) + (data.emergencyFund || 0);
    const elTotalReserves = document.getElementById("wealthTotalReserves");
    if (elTotalReserves) elTotalReserves.textContent = formatCurrency(totalReserves);

    const elManageReserves = document.getElementById("manageReservesButton");
    if (elManageReserves) {
      const reserveRows = data.reserveManagement && Array.isArray(data.reserveManagement.reserves)
        ? data.reserveManagement.reserves
        : [];
      elManageReserves.disabled = !reserveRows.some(function(reserve) {
        return reserve && reserve.isEditable;
      });
    }

    // Math Banner: Total Cash - Reserves = Available Cash
    const elMathTotal = document.getElementById("wealthMathTotalCash");
    if (elMathTotal) elMathTotal.textContent = formatCurrency(data.totalCash);

    const elMathReserves = document.getElementById("wealthMathReserves");
    if (elMathReserves) elMathReserves.textContent = formatCurrency(totalReserves);

    const elMathAvail = document.getElementById("wealthMathAvailable");
    if (elMathAvail) elMathAvail.textContent = formatCurrency(data.availableCash);

    // Section 2: Investments (M14, TFSA I14, FHSA J14, RRSP K14)
    const elInvested = document.getElementById("wealthTotalInvested");
    if (elInvested) elInvested.textContent = formatCurrency(data.totalInvested);

    const elTfsa = document.getElementById("wealthTfsa");
    if (elTfsa) elTfsa.textContent = formatCurrency(data.tfsa);

    const elFhsa = document.getElementById("wealthFhsa");
    if (elFhsa) elFhsa.textContent = formatCurrency(data.fhsa);

    const elRrsp = document.getElementById("wealthRrsp");
    if (elRrsp) elRrsp.textContent = formatCurrency(data.rrsp);

    // Section 3: Crypto (L14)
    const elCrypto = document.getElementById("wealthCrypto");
    if (elCrypto) elCrypto.textContent = formatCurrency(data.crypto !== undefined ? data.crypto : data.totalCrypto);

    // Section 4: Accounts (H17:I28)
    const accounts = Array.isArray(data.accounts) ? data.accounts : [];
    const elCount = document.getElementById("wealthAccountsCount");
    if (elCount) elCount.textContent = accounts.length + (accounts.length === 1 ? " account" : " accounts");

    function renderWealthAccountRow(a) {
      if (!a) return "";
      const isEditable = Boolean(a.isEditable);
      if (isEditable) {
        return '<button type="button" class="wealth-account-row wealth-account-row-editable" data-account-id="' + escapeHtml(a.id || "") + '" aria-label="Edit balance for ' + escapeHtml(a.name) + '">' +
          '<span class="wealth-account-name">' + escapeHtml(a.name) + '</span>' +
          '<span class="wealth-account-right">' +
            '<span class="wealth-account-balance">' + formatCurrency(a.balance) + '</span>' +
            '<svg class="wealth-account-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
              '<polyline points="9 18 15 12 9 6"></polyline>' +
            '</svg>' +
          '</span>' +
        '</button>';
      }

      return '<div class="wealth-account-row wealth-account-row-readonly">' +
        '<span class="wealth-account-name">' +
          escapeHtml(a.name) +
          (a.isFormula ? ' <span class="wealth-calc-badge">Calculated</span>' : '') +
        '</span>' +
        '<span class="wealth-account-balance">' + formatCurrency(a.balance) + '</span>' +
      '</div>';
    }

    const cashAccounts = accounts.filter(function(a) { return a && a.type === "cash"; });
    const investAccounts = accounts.filter(function(a) { return a && a.type !== "cash"; });

    const elCashList = document.getElementById("wealthCashAccountsList");
    if (elCashList) {
      if (cashAccounts.length === 0) {
        elCashList.innerHTML = '<div class="wealth-empty-row">No cash accounts found</div>';
      } else {
        elCashList.innerHTML = cashAccounts.map(renderWealthAccountRow).join("");
      }
    }

    const elInvestList = document.getElementById("wealthInvestAccountsList");
    if (elInvestList) {
      if (investAccounts.length === 0) {
        elInvestList.innerHTML = '<div class="wealth-empty-row">No investment accounts found</div>';
      } else {
        elInvestList.innerHTML = investAccounts.map(renderWealthAccountRow).join("");
      }
    }

    setupWealthAccountsDelegation();
  }

  let editingWealthAccountId = null;
  let isSavingWealthBalance = false;

  function setupWealthAccountsDelegation() {
    if (typeof document === "undefined") return;
    const elCash = document.getElementById("wealthCashAccountsList");
    const elInvest = document.getElementById("wealthInvestAccountsList");

    function handleAccountClick(e) {
      const btn = e.target.closest(".wealth-account-row-editable");
      if (!btn) return;
      const accountId = btn.getAttribute("data-account-id");
      if (accountId) {
        openWealthBalanceEditor(accountId);
      }
    }

    if (elCash && !elCash.dataset.hasWealthClick) {
      elCash.addEventListener("click", handleAccountClick);
      elCash.dataset.hasWealthClick = "true";
    }
    if (elInvest && !elInvest.dataset.hasWealthClick) {
      elInvest.addEventListener("click", handleAccountClick);
      elInvest.dataset.hasWealthClick = "true";
    }
  }

  function openWealthBalanceEditor(accountId) {
    if (typeof document === "undefined" || !currentWealthData || !Array.isArray(currentWealthData.accounts)) return;
    const account = currentWealthData.accounts.find(function(a) { return a && a.id === accountId; });
    if (!account || !account.isEditable) return;

    editingWealthAccountId = account.id;

    const elTitle = document.getElementById("wealthEditAccountName");
    if (elTitle) elTitle.textContent = account.name;

    const elCurrent = document.getElementById("wealthEditCurrentBalance");
    if (elCurrent) elCurrent.textContent = formatCurrency(account.balance);

    const isUsd = account.editCurrency === "USD";
    const editVal = (typeof account.editValue === "number" && !isNaN(account.editValue))
      ? account.editValue
      : account.balance;

    const elInputLabel = document.getElementById("wealthEditInputLabel");
    if (elInputLabel) {
      elInputLabel.textContent = isUsd ? "USD Balance" : "New balance";
    }

    const elHelper = document.getElementById("wealthEditHelperText");
    if (elHelper) {
      if (isUsd) {
        elHelper.textContent = "CAD value is calculated automatically using the current USD/CAD rate.";
        elHelper.classList.remove("hidden");
      } else {
        elHelper.textContent = "";
        elHelper.classList.add("hidden");
      }
    }

    const elInput = document.getElementById("wealthEditInput");
    if (elInput) {
      elInput.value = (typeof editVal === "number" && !isNaN(editVal)) ? editVal.toFixed(2) : "";
    }

    const elError = document.getElementById("wealthEditError");
    if (elError) {
      elError.textContent = "";
      elError.classList.add("hidden");
    }

    const elSaveBtn = document.getElementById("saveWealthEditButton");
    if (elSaveBtn) {
      elSaveBtn.disabled = false;
      elSaveBtn.textContent = "Save Balance";
    }

    const elBackdrop = document.getElementById("wealthEditBackdrop");
    const elSheet = document.getElementById("wealthEditSheet");
    if (elBackdrop) elBackdrop.classList.remove("hidden");
    if (elSheet) elSheet.classList.remove("hidden");

    if (elInput) {
      setTimeout(function() {
        elInput.focus();
        elInput.select();
      }, 80);
    }
  }

  function closeWealthBalanceEditor() {
    if (isSavingWealthBalance || typeof document === "undefined") return;
    editingWealthAccountId = null;

    const elBackdrop = document.getElementById("wealthEditBackdrop");
    const elSheet = document.getElementById("wealthEditSheet");
    if (elSheet) elSheet.classList.add("hidden");
    if (elBackdrop) elBackdrop.classList.add("hidden");

    const elHelper = document.getElementById("wealthEditHelperText");
    if (elHelper) {
      elHelper.textContent = "";
      elHelper.classList.add("hidden");
    }
    const elInputLabel = document.getElementById("wealthEditInputLabel");
    if (elInputLabel) {
      elInputLabel.textContent = "New balance";
    }
  }

  async function handleSaveWealthBalance() {
    if (isSavingWealthBalance || !editingWealthAccountId || typeof document === "undefined") return;

    const elInput = document.getElementById("wealthEditInput");
    const elError = document.getElementById("wealthEditError");
    const elSaveBtn = document.getElementById("saveWealthEditButton");

    const rawVal = elInput ? elInput.value.trim() : "";
    if (!rawVal) {
      if (elError) {
        elError.textContent = "Please enter a valid balance.";
        elError.classList.remove("hidden");
      }
      return;
    }

    const numVal = parseFloat(rawVal);
    if (!Number.isFinite(numVal) || Number.isNaN(numVal) || numVal < 0) {
      if (elError) {
        elError.textContent = "Please enter a positive numeric balance.";
        elError.classList.remove("hidden");
      }
      return;
    }

    isSavingWealthBalance = true;
    if (elSaveBtn) {
      elSaveBtn.disabled = true;
      elSaveBtn.textContent = "Saving…";
    }
    if (elError) {
      elError.textContent = "";
      elError.classList.add("hidden");
    }

    try {
      const updatedWealth = await financeApi.updateWealthAccountBalance({
        accountId: editingWealthAccountId,
        balance: Math.round(numVal * 100) / 100
      });

      if (updatedWealth && typeof updatedWealth === "object") {
        currentWealthData = updatedWealth;
        saveWealthToCache(updatedWealth);
        renderWealthView(updatedWealth);
        isSavingWealthBalance = false;
        closeWealthBalanceEditor();
        updateSyncStatus("live", "Balance updated");
      } else {
        throw new Error("Invalid response from server.");
      }
    } catch (err) {
      isSavingWealthBalance = false;
      if (elSaveBtn) {
        elSaveBtn.disabled = false;
        elSaveBtn.textContent = "Save Balance";
      }
      if (elError) {
        elError.textContent = "Balance wasn't updated. Your previous value is unchanged.";
        elError.classList.remove("hidden");
      }
    }
  }

  let selectedReserveMode = "add";
  let selectedReserveId = "tax_reserve_2026_09";
  let isSavingWealthReserve = false;

  function getReserveManagementEntry(reserveId) {
    const management = currentWealthData && currentWealthData.reserveManagement;
    const reserves = management && Array.isArray(management.reserves) ? management.reserves : [];
    return reserves.find(function(reserve) {
      return reserve && reserve.reserveId === reserveId;
    }) || null;
  }

  function renderReserveManagerSelection(clearInput) {
    if (typeof document === "undefined") return;

    const management = currentWealthData && currentWealthData.reserveManagement;
    const isEmergency = selectedReserveMode === "emergency";
    const activeReserveId = isEmergency ? "emergency_fund" : selectedReserveId;
    const activeReserve = getReserveManagementEntry(activeReserveId);

    const elPeriod = document.getElementById("wealthReservePeriod");
    if (elPeriod) {
      elPeriod.textContent = management && management.periodLabel
        ? management.periodLabel
        : "September 2026";
    }

    document.querySelectorAll("[data-reserve-mode]").forEach(function(button) {
      const selected = button.getAttribute("data-reserve-mode") === selectedReserveMode;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    });

    document.querySelectorAll("[data-reserve-id]").forEach(function(button) {
      const selected = button.getAttribute("data-reserve-id") === selectedReserveId;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    });

    const elTargetFieldset = document.getElementById("wealthReserveTargetFieldset");
    if (elTargetFieldset) elTargetFieldset.classList.toggle("hidden", isEmergency);

    const elCurrentLabel = document.getElementById("wealthReserveCurrentLabel");
    if (elCurrentLabel) {
      elCurrentLabel.textContent = isEmergency ? "Current balance" : "Current September movement";
    }

    const elCurrentValue = document.getElementById("wealthReserveCurrentValue");
    if (elCurrentValue) {
      elCurrentValue.textContent = formatCurrency(activeReserve ? activeReserve.currentValue : 0);
    }

    const copy = {
      add: {
        inputLabel: "Amount to add",
        help: "The entered amount will be added to September's current movement.",
        saveLabel: "Add Set-Aside"
      },
      pay: {
        inputLabel: "CRA payment amount",
        help: "The entered amount will be subtracted from September and will reduce the authoritative reserve total.",
        saveLabel: "Record CRA Payment"
      },
      replace: {
        inputLabel: "Correct September net value",
        help: "This replaces September's current net movement. A negative value is allowed when the full reserve remains non-negative.",
        saveLabel: "Correct September Total"
      },
      emergency: {
        inputLabel: "New Emergency Fund balance",
        help: "This replaces the current Emergency Fund balance.",
        saveLabel: "Set Emergency Fund Balance"
      }
    }[selectedReserveMode];

    const elInputLabel = document.getElementById("wealthReserveInputLabel");
    if (elInputLabel) elInputLabel.textContent = copy.inputLabel;

    const elHelp = document.getElementById("wealthReserveOperationHelp");
    if (elHelp) elHelp.textContent = copy.help;

    const elInput = document.getElementById("wealthReserveInput");
    if (elInput) {
      elInput.min = selectedReserveMode === "replace" ? "-1000000000" : (isEmergency ? "0" : "0.01");
      if (clearInput) elInput.value = "";
    }

    const elSave = document.getElementById("saveWealthReserveButton");
    if (elSave) {
      elSave.textContent = copy.saveLabel;
      elSave.disabled = !activeReserve || !activeReserve.isEditable;
    }

    const elError = document.getElementById("wealthReserveError");
    if (elError) {
      elError.textContent = "";
      elError.classList.add("hidden");
    }
  }

  function openWealthReserveManager() {
    if (typeof document === "undefined" || !currentWealthData || !currentWealthData.reserveManagement) return;

    selectedReserveMode = "add";
    selectedReserveId = "tax_reserve_2026_09";
    renderReserveManagerSelection(true);

    const elBackdrop = document.getElementById("wealthReserveBackdrop");
    const elSheet = document.getElementById("wealthReserveSheet");
    if (elBackdrop) elBackdrop.classList.remove("hidden");
    if (elSheet) elSheet.classList.remove("hidden");
  }

  function closeWealthReserveManager() {
    if (isSavingWealthReserve || typeof document === "undefined") return;
    const elBackdrop = document.getElementById("wealthReserveBackdrop");
    const elSheet = document.getElementById("wealthReserveSheet");
    if (elSheet) elSheet.classList.add("hidden");
    if (elBackdrop) elBackdrop.classList.add("hidden");
  }

  async function handleSaveWealthReserve() {
    if (isSavingWealthReserve || typeof document === "undefined") return;

    const isEmergency = selectedReserveMode === "emergency";
    const reserveId = isEmergency ? "emergency_fund" : selectedReserveId;
    const operation = isEmergency ? "replace" : selectedReserveMode;
    const reserve = getReserveManagementEntry(reserveId);
    const elInput = document.getElementById("wealthReserveInput");
    const elError = document.getElementById("wealthReserveError");
    const elSave = document.getElementById("saveWealthReserveButton");
    const rawValue = elInput ? elInput.value.trim() : "";

    function showReserveError(message) {
      if (elError) {
        elError.textContent = message;
        elError.classList.remove("hidden");
      }
    }

    if (!reserve || !reserve.isEditable) {
      showReserveError("This reserve is not currently editable.");
      return;
    }
    if (!/^-?(?:\d+|\d*\.\d{1,2})$/.test(rawValue)) {
      showReserveError("Enter a valid amount with no more than two decimal places.");
      return;
    }

    const amount = Number(rawValue);
    if (!Number.isFinite(amount) || Math.abs(amount) > 1000000000) {
      showReserveError("Enter a valid amount within the allowed limit.");
      return;
    }
    if ((operation === "add" || operation === "pay") && amount <= 0) {
      showReserveError("Add and Pay CRA amounts must be positive.");
      return;
    }
    if (reserveId === "emergency_fund" && amount < 0) {
      showReserveError("Emergency Fund cannot be negative.");
      return;
    }

    isSavingWealthReserve = true;
    if (elSave) {
      elSave.disabled = true;
      elSave.textContent = "Saving…";
    }
    if (elError) {
      elError.textContent = "";
      elError.classList.add("hidden");
    }

    try {
      const updatedWealth = await financeApi.updateWealthReserve({
        reserveId: reserveId,
        operation: operation,
        amount: Math.round(amount * 100) / 100
      });

      if (!updatedWealth || typeof updatedWealth !== "object") {
        throw new Error("Invalid response from server.");
      }

      currentWealthData = updatedWealth;
      saveWealthToCache(updatedWealth);
      renderWealthView(updatedWealth);
      isSavingWealthReserve = false;
      closeWealthReserveManager();
      updateSyncStatus("live", "Reserve updated");
      showToast("Reserve updated from the authoritative Sheet.");
    } catch (err) {
      isSavingWealthReserve = false;
      if (elSave) {
        elSave.disabled = false;
        renderReserveManagerSelection(false);
      }
      showReserveError("Reserve wasn't updated. Your previous values are unchanged.");
    }
  }

  function setInsightsSubView(subView) {
    currentInsightsSubView = subView;
    if (typeof document === "undefined") return;

    const tabSpending = document.getElementById("tabSpending");
    const tabWealth = document.getElementById("tabWealth");
    const spendingSubView = document.getElementById("spendingSubView");
    const wealthSubView = document.getElementById("wealthSubView");
    const insightsTitle = document.getElementById("insightsTitle");

    if (subView === "wealth") {
      if (tabSpending) {
        tabSpending.classList.remove("active");
        tabSpending.setAttribute("aria-selected", "false");
      }
      if (tabWealth) {
        tabWealth.classList.add("active");
        tabWealth.setAttribute("aria-selected", "true");
      }
      if (spendingSubView) spendingSubView.classList.add("hidden");
      if (wealthSubView) wealthSubView.classList.remove("hidden");
      if (insightsTitle) insightsTitle.textContent = "Wealth";

      if (!currentWealthData) {
        restoreWealthFromCache();
      }
      fetchWealthData();
    } else {
      if (tabSpending) {
        tabSpending.classList.add("active");
        tabSpending.setAttribute("aria-selected", "true");
      }
      if (tabWealth) {
        tabWealth.classList.remove("active");
        tabWealth.setAttribute("aria-selected", "false");
      }
      if (spendingSubView) spendingSubView.classList.remove("hidden");
      if (wealthSubView) wealthSubView.classList.add("hidden");
      if (insightsTitle) insightsTitle.textContent = "Insights";
    }
  }


  function areExpenseDatasetsEqual(
    first,
    second
  ) {

    try {

      return (
        JSON.stringify(first) ===
        JSON.stringify(second)
      );

    } catch (error) {

      return false;

    }

  }


  /* =========================================
     CENTRAL RENDER
  ========================================= */

  function renderCurrentExpenseData(
    options
  ) {

    options =
      options || {};


    if (
      options.resetRenderWindow !==
      false
    ) {

      resetExpenseRenderWindow();

    }


    buildYearOptions();

    renderExpenseFilterCategories();

    applyExpenseFilters();

    applyInsightFilters();


    hasRenderedExpenseData =
      true;

  }


  /* =========================================
     PROGRESSIVE EXPENSE RENDERING
  ========================================= */

  function setupProgressiveExpenseRendering() {

    window.addEventListener(
      "scroll",
      scheduleProgressiveExpenseCheck,
      {
        passive: true
      }
    );


    window.addEventListener(
      "resize",
      scheduleProgressiveExpenseCheck,
      {
        passive: true
      }
    );

  }


  function scheduleProgressiveExpenseCheck() {

    if (
      expenseScrollFramePending
    ) {

      return;

    }


    expenseScrollFramePending =
      true;


    window.requestAnimationFrame(
      function() {

        expenseScrollFramePending =
          false;


        maybeRenderMoreExpenses();

      }
    );

  }


  function maybeRenderMoreExpenses() {

    if (
      currentView !==
      "expenses"
    ) {

      return;

    }


    if (
      expenseRenderLimit >=
      filteredExpenses.length
    ) {

      return;

    }


    const documentHeight =
      document.documentElement
        .scrollHeight;


    const visibleBottom =
      window.scrollY +
      window.innerHeight;


    const distanceFromBottom =
      documentHeight -
      visibleBottom;


    if (
      distanceFromBottom >
      EXPENSE_SCROLL_TRIGGER_DISTANCE
    ) {

      return;

    }


    appendNextExpenseBatch();

  }


  function appendNextExpenseBatch() {

    const sortedExpenses =
      getSortedFilteredExpenses();


    const start =
      expenseRenderLimit;


    const end =
      Math.min(
        start +
          EXPENSE_RENDER_BATCH_SIZE,
        sortedExpenses.length
      );


    if (
      end <= start
    ) {

      return;

    }


    const fragment =
      document.createDocumentFragment();


    for (
      let index = start;
      index < end;
      index++
    ) {

      fragment.appendChild(
        createExpenseCard(
          sortedExpenses[index]
        )
      );

    }


    expenseList.appendChild(
      fragment
    );


    expenseRenderLimit =
      end;


    if (
      expenseRenderLimit <
      filteredExpenses.length
    ) {

      window.requestAnimationFrame(
        maybeRenderMoreExpenses
      );

    }

  }


  function resetExpenseRenderWindow() {

    expenseRenderLimit =
      INITIAL_EXPENSE_RENDER_COUNT;

  }


  function getSortedFilteredExpenses() {

    return filteredExpenses
      .slice()
      .sort(
        compareExpensesNewestFirst
      );

  }


  /* =========================================
     V2 BRICK 5
     SMART SYNC
  ========================================= */

  function setupSmartSync() {

    /*
     * Mobile browsers commonly fire both
     * visibilitychange and focus when the
     * user returns to an app.
     *
     * The debounce + in-flight guard prevents
     * duplicate Google Sheet requests.
     */

    document.addEventListener(
      "visibilitychange",
      function() {

        if (
          document.visibilityState ===
          "visible"
        ) {

          scheduleSmartSync();

        }

      }
    );


    window.addEventListener(
      "focus",
      scheduleSmartSync
    );

  }


  function scheduleSmartSync() {

    if (
      smartSyncTimer
    ) {

      clearTimeout(
        smartSyncTimer
      );

    }


    smartSyncTimer =
      setTimeout(
        function() {

          smartSyncTimer =
            null;


          maybeSmartSync();

        },
        SMART_SYNC_DEBOUNCE_MS
      );

  }


  function maybeSmartSync() {

    /*
     * Never race against an Add/Edit/Delete.
     */

    if (
      hasPendingWrite()
    ) {

      return;

    }


    /*
     * A request is already running.
     * No need to start another one.
     */

    if (
      serverRefreshInFlight
    ) {

      return;

    }


    const now =
      Date.now();


    /*
     * If we have never done an authoritative
     * direct read in this page session,
     * sync now.
     */

    if (
      !lastAuthoritativeRefreshAt
    ) {

      loadExpenses({

        showLoading:
          false,

        forceServerRefresh:
          true

      });


      return;

    }


    const age =
      now -
      lastAuthoritativeRefreshAt;


    /*
     * Recent data is still fresh.
     */

    if (
      age <
      SMART_SYNC_STALE_MS
    ) {

      return;

    }


    /*
     * The app has been away long enough.
     * Quietly check the real Sheet.
     */

    loadExpenses({

      showLoading:
        false,

      forceServerRefresh:
        true

    });

  }


  function runQueuedServerRefresh() {

    if (
      !queuedForceServerRefresh
    ) {

      return;

    }


    if (
      serverRefreshInFlight
    ) {

      return;

    }


    if (
      hasPendingWrite()
    ) {

      return;

    }


    queuedForceServerRefresh =
      false;


    loadExpenses({

      showLoading:
        false,

      forceServerRefresh:
        true

    });

  }


  /* =========================================
     OPTIMISTIC WRITE HELPERS
  ========================================= */

  function beginPendingWrite() {

    pendingWriteCount++;

  }


  function endPendingWrite() {

    pendingWriteCount =
      Math.max(
        0,
        pendingWriteCount - 1
      );


    /*
     * If a Refresh was requested during
     * the write, execute it after the
     * write has finished.
     */

    if (
      pendingWriteCount === 0 &&
      queuedForceServerRefresh
    ) {

      setTimeout(
        runQueuedServerRefresh,
        0
      );

    }

  }


  function markLocalMutation() {

    localMutationVersion++;

  }


  function hasPendingWrite() {

    return (
      pendingWriteCount > 0
    );

  }


  function blockWhileSaving() {

    if (
      !hasPendingWrite()
    ) {

      return false;

    }


    showToast(
      "Please wait for your current change to finish saving."
    );


    return true;

  }


  function createTemporaryExpenseId() {

    return (
      "temp_" +
      Date.now() +
      "_" +
      Math.random()
        .toString(36)
        .slice(2, 9)
    );

  }


  function normalizeClientExpense(
    expense,
    id
  ) {

    return {

      id:
        String(
          id ||
          expense.id ||
          ""
        ),

      date:
        expense.date,

      cost:
        normalizeMoney(
          expense.cost
        ),

      bucket:
        expense.bucket,

      category:
        expense.category,

      item:
        expense.item,

      notes:
        expense.notes || "",

      paymentMethod:
        expense.paymentMethod

    };

  }


  /* =========================================
     NAVIGATION
  ========================================= */

  function setupNavigation() {

    document
      .getElementById(
        "expensesNavButton"
      )
      .addEventListener(
        "click",
        showExpensesView
      );


    document
      .getElementById(
        "insightsButton"
      )
      .addEventListener(
        "click",
        showInsightsView
      );


    document
      .getElementById(
        "addExpenseButton"
      )
      .addEventListener(
        "click",
        openAddExpense
      );

    const tabSpending = document.getElementById("tabSpending");
    const tabWealth = document.getElementById("tabWealth");

    if (tabSpending) {
      tabSpending.addEventListener("click", function() {
        setInsightsSubView("spending");
      });
    }

    if (tabWealth) {
      tabWealth.addEventListener("click", function() {
        setInsightsSubView("wealth");
      });
    }

    const closeWealthEditBtn = document.getElementById("closeWealthEditButton");
    const cancelWealthEditBtn = document.getElementById("cancelWealthEditButton");
    const saveWealthEditBtn = document.getElementById("saveWealthEditButton");
    const wealthEditBackdrop = document.getElementById("wealthEditBackdrop");
    const wealthEditInput = document.getElementById("wealthEditInput");

    if (closeWealthEditBtn) closeWealthEditBtn.addEventListener("click", closeWealthBalanceEditor);
    if (cancelWealthEditBtn) cancelWealthEditBtn.addEventListener("click", closeWealthBalanceEditor);
    if (wealthEditBackdrop) wealthEditBackdrop.addEventListener("click", closeWealthBalanceEditor);
    if (saveWealthEditBtn) saveWealthEditBtn.addEventListener("click", handleSaveWealthBalance);
    if (wealthEditInput) {
      wealthEditInput.addEventListener("keydown", function(e) {
        if (e.key === "Enter") {
          e.preventDefault();
          handleSaveWealthBalance();
        } else if (e.key === "Escape") {
          e.preventDefault();
          closeWealthBalanceEditor();
        }
      });
    }

    const manageReservesBtn = document.getElementById("manageReservesButton");
    const closeWealthReserveBtn = document.getElementById("closeWealthReserveButton");
    const cancelWealthReserveBtn = document.getElementById("cancelWealthReserveButton");
    const saveWealthReserveBtn = document.getElementById("saveWealthReserveButton");
    const wealthReserveBackdrop = document.getElementById("wealthReserveBackdrop");
    const wealthReserveInput = document.getElementById("wealthReserveInput");
    const wealthReserveOperations = document.getElementById("wealthReserveOperations");
    const wealthReserveTargets = document.getElementById("wealthReserveTargets");

    if (manageReservesBtn) manageReservesBtn.addEventListener("click", openWealthReserveManager);
    if (closeWealthReserveBtn) closeWealthReserveBtn.addEventListener("click", closeWealthReserveManager);
    if (cancelWealthReserveBtn) cancelWealthReserveBtn.addEventListener("click", closeWealthReserveManager);
    if (wealthReserveBackdrop) wealthReserveBackdrop.addEventListener("click", closeWealthReserveManager);
    if (saveWealthReserveBtn) saveWealthReserveBtn.addEventListener("click", handleSaveWealthReserve);

    if (wealthReserveOperations) {
      wealthReserveOperations.addEventListener("click", function(e) {
        const button = e.target.closest("[data-reserve-mode]");
        if (!button || isSavingWealthReserve) return;
        selectedReserveMode = button.getAttribute("data-reserve-mode") || "add";
        renderReserveManagerSelection(true);
      });
    }

    if (wealthReserveTargets) {
      wealthReserveTargets.addEventListener("click", function(e) {
        const button = e.target.closest("[data-reserve-id]");
        if (!button || isSavingWealthReserve) return;
        selectedReserveId = button.getAttribute("data-reserve-id") || "tax_reserve_2026_09";
        renderReserveManagerSelection(true);
      });
    }

    if (wealthReserveInput) {
      wealthReserveInput.addEventListener("keydown", function(e) {
        if (e.key === "Enter") {
          e.preventDefault();
          handleSaveWealthReserve();
        } else if (e.key === "Escape") {
          e.preventDefault();
          closeWealthReserveManager();
        }
      });
    }

  }


  function showExpensesView() {

    currentView =
      "expenses";


    document
      .getElementById(
        "expensesView"
      )
      .classList.remove(
        "hidden"
      );


    document
      .getElementById(
        "insightsView"
      )
      .classList.add(
        "hidden"
      );


    document
      .getElementById(
        "expensesNavButton"
      )
      .classList.add(
        "active"
      );


    document
      .getElementById(
        "insightsButton"
      )
      .classList.remove(
        "active"
      );


    window.scrollTo(
      0,
      0
    );


    scheduleProgressiveExpenseCheck();

  }


  function showInsightsView() {

    currentView =
      "insights";


    document
      .getElementById(
        "expensesView"
      )
      .classList.add(
        "hidden"
      );


    document
      .getElementById(
        "insightsView"
      )
      .classList.remove(
        "hidden"
      );


    document
      .getElementById(
        "expensesNavButton"
      )
      .classList.remove(
        "active"
      );


    document
      .getElementById(
        "insightsButton"
      )
      .classList.add(
        "active"
      );

    if (currentInsightsSubView === "wealth") {
      setInsightsSubView("wealth");
    } else {
      setInsightsSubView("spending");
      applyInsightFilters();
    }


    window.scrollTo(
      0,
      0
    );

  }


  /* =========================================
     REFRESH
  ========================================= */

  function setupRefresh() {

    document
      .getElementById(
        "refreshButton"
      )
      .addEventListener(
        "click",
        manualRefresh
      );


    document
      .getElementById(
        "refreshInsightsButton"
      )
      .addEventListener(
        "click",
        manualRefresh
      );

  }


  function manualRefresh() {

    if (currentView === "insights" && currentInsightsSubView === "wealth") {
      fetchWealthData(true);
      return;
    }

    /*
     * If a write is currently saving,
     * remember that the user asked for
     * a real refresh and run it afterward.
     */

    if (
      hasPendingWrite()
    ) {

      queuedForceServerRefresh =
        true;


      showToast(
        "Refresh will run after saving finishes."
      );


      return;

    }


    /*
     * If another request is already running,
     * queue exactly one authoritative refresh.
     */

    if (
      serverRefreshInFlight
    ) {

      queuedForceServerRefresh =
        true;


      return;

    }


    /*
     * Manual Refresh always bypasses
     * the Apps Script server cache.
     */

    loadExpenses({

      showLoading:
        false,

      forceServerRefresh:
        true

    });

  }


  /* =========================================
     LOAD GOOGLE DATA
  ========================================= */

  function loadExpenses(
    options
  ) {

    options =
      options || {};


    const forceServerRefresh =
      options.forceServerRefresh ===
      true;


    /*
     * Brick 5:
     *
     * Never allow several getExpenses()
     * requests to run at once.
     */

    if (
      serverRefreshInFlight
    ) {

      if (
        forceServerRefresh
      ) {

        queuedForceServerRefresh =
          true;

      }


      return;

    }


    serverRefreshInFlight =
      true;


    const requestMutationVersion =
      localMutationVersion;


    const shouldShowLoading =
      Boolean(
        options.showLoading
      ) &&
      currentView ===
        "expenses";


    if (
      shouldShowLoading
    ) {

      loadingState
        .classList.remove(
          "hidden"
        );

    }


    financeApi
      .getExpenses(
        forceServerRefresh
      )
      .then(
        function(expenses) {

          serverRefreshInFlight =
            false;


          loadingState
            .classList.add(
              "hidden"
            );


          /*
           * A direct Sheet refresh has
           * completed successfully.
           */

          if (
            forceServerRefresh
          ) {

            lastAuthoritativeRefreshAt =
              Date.now();

          }


          /*
           * If an Add/Edit/Delete happened
           * after this request started,
           * this response is older than our
           * current local state.
           */

          if (
            requestMutationVersion !==
            localMutationVersion
          ) {

            runQueuedServerRefresh();

            return;

          }


          const freshExpenses =
            Array.isArray(expenses)
              ? expenses
              : [];


          const dataChanged =
            !areExpenseDatasetsEqual(
              currentExpenses,
              freshExpenses
            );


          currentExpenses =
            freshExpenses;


          lastSuccessfulSyncAt =
            new Date()
              .toISOString();


          saveExpensesToCache(
            freshExpenses,
            lastSuccessfulSyncAt
          );

          if (hideAuthGateFn) {
            hideAuthGateFn();
          }

          updateSyncStatus("live");

          if (!startupTimingLogged && typeof performance !== "undefined" && performance.now) {
            startupTimingLogged = true;
            const totalMs = performance.now() - APP_INIT_TIMESTAMP;
            console.log(`[Startup Timing] AUTHORITATIVE LOAD: Server fetch completed. Total startup: ${totalMs.toFixed(1)}ms.`);
          }


          if (
            !hasRenderedExpenseData
          ) {

            renderCurrentExpenseData({

              resetRenderWindow:
                true

            });

          } else if (
            dataChanged
          ) {

            /*
             * Keep the user's current
             * progressive-scroll depth.
             */

            renderCurrentExpenseData({

              resetRenderWindow:
                false

            });

          }


          runQueuedServerRefresh();

        }
      )
      .catch(
        function(error) {

          serverRefreshInFlight =
            false;


          loadingState
            .classList.add(
              "hidden"
            );


          /*
           * Ignore an old request failure
           * if newer local work happened.
           */

          if (
            requestMutationVersion !==
            localMutationVersion
          ) {

            runQueuedServerRefresh();

            return;

          }


          if (
            error &&
            error.message &&
            error.message.includes("Unauthorized")
          ) {
            clearAuthorizedSession();
            if (typeof financeApi.clearDeviceKey === "function") {
              financeApi.clearDeviceKey();
            }
            removeExpenseCache();
            if (showDeviceSetupScreenFn) {
              showDeviceSetupScreenFn(
                "Unauthorized: Invalid device key. Please re-enter your key.",
                "error"
              );
            }
            return;
          }

          if (
            hasRenderedExpenseData
          ) {
            updateSyncStatus("error", "Saved data");
            showToast(
              "Could not refresh. Showing saved data."
            );

            runQueuedServerRefresh();

            return;

          }


          showToast(
            "Could not load expenses: " +
            getErrorMessage(
              error
            )
          );


          runQueuedServerRefresh();

        }
      );

  }


  /* =========================================
     SEARCH
  ========================================= */

  function setupExpenseSearch() {

    searchInput
      .addEventListener(
        "input",
        function() {

          filters.search =
            searchInput.value
              .trim();


          clearSearchButton
            .classList.toggle(
              "hidden",
              !filters.search
            );


          resetExpenseRenderWindow();

          applyExpenseFilters();

        }
      );


    clearSearchButton
      .addEventListener(
        "click",
        function() {

          searchInput.value =
            "";

          filters.search =
            "";


          clearSearchButton
            .classList.add(
              "hidden"
            );


          resetExpenseRenderWindow();

          applyExpenseFilters();

        }
      );

  }


  /* =========================================
     EXPENSE FILTER SETUP
  ========================================= */

  function setupExpenseFilters() {

    document
      .getElementById(
        "openFiltersButton"
      )
      .addEventListener(
        "click",
        openFilters
      );


    document
      .getElementById(
        "closeFiltersButton"
      )
      .addEventListener(
        "click",
        closeFilters
      );


    document
      .getElementById(
        "doneFiltersButton"
      )
      .addEventListener(
        "click",
        closeFilters
      );


    filterBackdrop
      .addEventListener(
        "click",
        closeFilters
      );


    document
      .getElementById(
        "resetFiltersButton"
      )
      .addEventListener(
        "click",
        resetExpenseFilters
      );


    document
      .getElementById(
        "clearAllFiltersButton"
      )
      .addEventListener(
        "click",
        resetExpenseFilters
      );


    document
      .getElementById(
        "dateRangeFilter"
      )
      .addEventListener(
        "change",
        function(event) {

          filters.dateRange =
            event.target.value;


          document
            .getElementById(
              "customDateRange"
            )
            .classList.toggle(
              "hidden",
              filters.dateRange !==
                "custom"
            );


          resetExpenseRenderWindow();

          applyExpenseFilters();

        }
      );


    document
      .getElementById(
        "startDateFilter"
      )
      .addEventListener(
        "change",
        function(event) {

          filters.startDate =
            event.target.value;


          resetExpenseRenderWindow();

          applyExpenseFilters();

        }
      );


    document
      .getElementById(
        "endDateFilter"
      )
      .addEventListener(
        "change",
        function(event) {

          filters.endDate =
            event.target.value;


          resetExpenseRenderWindow();

          applyExpenseFilters();

        }
      );


    document
      .getElementById(
        "monthFilter"
      )
      .addEventListener(
        "change",
        function(event) {

          filters.month =
            event.target.value;


          resetExpenseRenderWindow();

          applyExpenseFilters();

        }
      );


    document
      .getElementById(
        "yearFilter"
      )
      .addEventListener(
        "change",
        function(event) {

          filters.year =
            event.target.value;


          resetExpenseRenderWindow();

          applyExpenseFilters();

        }
      );

  }


  /* =========================================
     INSIGHT FILTER SETUP
  ========================================= */

  function setupInsightFilters() {

    const dateRange =
      document.getElementById(
        "insightDateRange"
      );


    const year =
      document.getElementById(
        "insightYear"
      );


    const month =
      document.getElementById(
        "insightMonth"
      );


    dateRange
      .addEventListener(
        "change",
        function(event) {

          insightFilters.dateRange =
            event.target.value;


          if (
            insightFilters.dateRange !==
            "all"
          ) {

            insightFilters.year =
              "";

            insightFilters.month =
              "";

            year.value =
              "";

            month.value =
              "";

            month.disabled =
              true;

          }


          if (
            insightFilters.dateRange !==
            "custom"
          ) {

            insightFilters.startDate =
              "";

            insightFilters.endDate =
              "";


            document
              .getElementById(
                "insightStartDate"
              )
              .value =
                "";


            document
              .getElementById(
                "insightEndDate"
              )
              .value =
                "";

          }


          document
            .getElementById(
              "customInsightRange"
            )
            .classList.toggle(
              "hidden",
              insightFilters.dateRange !==
                "custom"
            );


          applyInsightFilters();

        }
      );


    year
      .addEventListener(
        "change",
        function(event) {

          insightFilters.year =
            event.target.value;


          if (
            insightFilters.year
          ) {

            insightFilters.dateRange =
              "all";

            insightFilters.startDate =
              "";

            insightFilters.endDate =
              "";


            dateRange.value =
              "all";


            month.disabled =
              false;


            document
              .getElementById(
                "customInsightRange"
              )
              .classList.add(
                "hidden"
              );


            document
              .getElementById(
                "insightStartDate"
              )
              .value =
                "";


            document
              .getElementById(
                "insightEndDate"
              )
              .value =
                "";

          } else {

            insightFilters.month =
              "";

            month.value =
              "";

            month.disabled =
              true;

          }


          applyInsightFilters();

        }
      );


    month
      .addEventListener(
        "change",
        function(event) {

          insightFilters.month =
            event.target.value;


          if (
            insightFilters.month &&
            insightFilters.year
          ) {

            insightFilters.dateRange =
              "all";

            dateRange.value =
              "all";

          }


          applyInsightFilters();

        }
      );


    document
      .getElementById(
        "insightStartDate"
      )
      .addEventListener(
        "change",
        function(event) {

          insightFilters.startDate =
            event.target.value;


          applyInsightFilters();

        }
      );


    document
      .getElementById(
        "insightEndDate"
      )
      .addEventListener(
        "change",
        function(event) {

          insightFilters.endDate =
            event.target.value;


          applyInsightFilters();

        }
      );


    const resetInsightFiltersBtn =
      document.getElementById(
        "resetInsightFiltersButton"
      );

    if (resetInsightFiltersBtn) {
      resetInsightFiltersBtn.addEventListener(
        "click",
        resetInsightFilters
      );
    }


    const toggleInsightFiltersBtn =
      document.getElementById(
        "toggleInsightFiltersButton"
      );

    if (toggleInsightFiltersBtn) {
      toggleInsightFiltersBtn.addEventListener(
        "click",
        toggleInsightFilters
      );
    }


    const toggleCategoriesBtn =
      document.getElementById(
        "toggleAllCategoriesButton"
      );

    if (toggleCategoriesBtn) {
      toggleCategoriesBtn.addEventListener(
        "click",
        function() {
          showAllCategories = !showAllCategories;
          renderCategoryList(
            currentCategoryData,
            currentCategoryTotal
          );
        }
      );
    }

  }


  /* =========================================
     APPLY EXPENSE FILTERS
  ========================================= */

  function applyExpenseFilters() {

    filteredExpenses =
      currentExpenses.filter(
        function(expense) {

          return (
            matchesSearch(expense) &&
            matchesBucket(expense) &&
            matchesCategory(expense) &&
            matchesPayment(expense) &&
            matchesDateRange(
              expense,
              filters
            ) &&
            matchesMonth(
              expense,
              filters.month
            ) &&
            matchesYear(
              expense,
              filters.year
            )
          );

        }
      );


    renderExpenses();

    updateExpenseSummary();

    renderActiveFilters();

    updateFilterCount();

  }


  function matchesSearch(expense) {

    if (
      !filters.search
    ) {

      return true;

    }


    return String(
      expense.item || ""
    )
      .toLowerCase()
      .includes(
        filters.search
          .toLowerCase()
      );

  }


  function matchesBucket(expense) {

    return (
      !filters.bucket ||
      expense.bucket ===
        filters.bucket
    );

  }


  function matchesCategory(expense) {

    return (
      !filters.category ||
      expense.category ===
        filters.category
    );

  }


  function matchesPayment(expense) {

    return (
      !filters.paymentMethod ||
      expense.paymentMethod ===
        filters.paymentMethod
    );

  }


  function matchesMonth(
    expense,
    month
  ) {

    if (!month) {

      return true;

    }


    const parts =
      parseDateParts(
        expense.date
      );


    return (
      parts &&
      parts.month ===
        Number(month)
    );

  }


  function matchesYear(
    expense,
    year
  ) {

    if (!year) {

      return true;

    }


    const parts =
      parseDateParts(
        expense.date
      );


    return (
      parts &&
      parts.year ===
        Number(year)
    );

  }


  function matchesDateRange(
    expense,
    state
  ) {

    if (
      state.dateRange ===
      "all"
    ) {

      return true;

    }


    const expenseDate =
      parseLocalDate(
        expense.date
      );


    if (!expenseDate) {

      return false;

    }


    const today =
      startOfDay(
        new Date()
      );


    if (
      state.dateRange ===
      "7"
    ) {

      const start =
        new Date(today);


      start.setDate(
        today.getDate() - 6
      );


      return (
        expenseDate >= start &&
        expenseDate <= today
      );

    }


    if (
      state.dateRange ===
      "30"
    ) {

      const start =
        new Date(today);


      start.setDate(
        today.getDate() - 29
      );


      return (
        expenseDate >= start &&
        expenseDate <= today
      );

    }


    if (
      state.dateRange ===
      "this_month"
    ) {

      return (
        expenseDate.getFullYear() ===
          today.getFullYear() &&
        expenseDate.getMonth() ===
          today.getMonth()
      );

    }


    if (
      state.dateRange ===
      "this_year"
    ) {

      return (
        expenseDate.getFullYear() ===
          today.getFullYear()
      );

    }


    if (
      state.dateRange ===
      "custom"
    ) {

      const start =
        state.startDate
          ? parseLocalDate(
              state.startDate
            )
          : null;


      const end =
        state.endDate
          ? parseLocalDate(
              state.endDate
            )
          : null;


      if (
        start &&
        expenseDate < start
      ) {

        return false;

      }


      if (
        end &&
        expenseDate > end
      ) {

        return false;

      }


      return true;

    }


    return true;

  }


  /* =========================================
     EXPENSE LIST
  ========================================= */

  function renderExpenses() {

    expenseList.innerHTML =
      "";


    const total =
      filteredExpenses.length;


    document
      .getElementById(
        "expenseCount"
      )
      .textContent =
        hasActiveExpenseFilters()
          ? total +
            " of " +
            currentExpenses.length +
            " transactions"
          : total +
            (
              total === 1
                ? " transaction"
                : " transactions"
            );


    if (
      total === 0
    ) {

      emptyState
        .classList.remove(
          "hidden"
        );


      document
        .getElementById(
          "emptyTitle"
        )
        .textContent =
          hasActiveExpenseFilters()
            ? "No matching expenses"
            : "No expenses yet";


      document
        .getElementById(
          "emptyMessage"
        )
        .textContent =
          hasActiveExpenseFilters()
            ? "Try changing or clearing your filters."
            : "Tap the + button to add an expense.";


      return;

    }


    emptyState
      .classList.add(
        "hidden"
      );


    const sortedExpenses =
      getSortedFilteredExpenses();


    const visibleCount =
      Math.min(
        expenseRenderLimit,
        sortedExpenses.length
      );


    const fragment =
      document.createDocumentFragment();


    for (
      let index = 0;
      index < visibleCount;
      index++
    ) {

      fragment.appendChild(
        createExpenseCard(
          sortedExpenses[index]
        )
      );

    }


    expenseList.appendChild(
      fragment
    );


    if (
      sortedExpenses.length <
      expenseRenderLimit
    ) {

      expenseRenderLimit =
        sortedExpenses.length;

    }


    scheduleProgressiveExpenseCheck();

  }


  /* =========================================
     CUSTOM SVG GLYPH REGISTRY
  ========================================= */

  function getBucketSlug(bucket) {
    if (!bucket) return "play";
    switch (bucket) {
      case "Play":
        return "play";
      case "Necessity":
        return "necessity";
      case "Small Business":
        return "business";
      case "Education":
        return "education";
      case "Giving":
        return "giving";
      default:
        return bucket.toLowerCase().replace(/\s+/g, "-");
    }
  }

  function getCategorySvg(category, bucket) {
    switch (category) {
      case "Fitness":
        return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 5v14M18 5v14M4 8v8M20 8v8M2 10v4M22 10v4M6 12h12"/></svg>';
      case "Eating Out":
        return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 2v6a3 3 0 0 1-3 3 3 3 0 0 1-3-3V2M15 2v10M15 16v6M6 2v18M9 2v4a3 3 0 0 1-3 3"/></svg>';
      case "Travel":
        return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3.5c-.5-.5-2.5 0-4 1.5L13.5 8.5 5.3 6.7c-.8-.2-1.6.2-2 .9l-.3.5 5 4-3.5 3.5-2.5-.5-.9.9 2.7 2.7 2.7 2.7.9-.9-.5-2.5 3.5-3.5 4 5 .5-.3c.7-.4 1.1-1.2.9-2Z"/></svg>';
      case "Entertainment":
        return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 12h.01M10 12h.01M14 12h.01M18 12h.01M2 10h20M2 14h20"/></svg>';
      case "Amazon":
        return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/></svg>';
      case "Clothing":
        return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/></svg>';
      case "Health":
        return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M12 9v6M9 12h6"/></svg>';
      case "Household":
        return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>';
      case "Grocery":
        return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>';
      case "Car & Transportation":
        return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.5 3c-.4.8-.1 1.8.6 2.4.4.4 1 .7 1.6.7H6"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="17.5" r="2.5"/></svg>';
      case "Personal Care":
        return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/></svg>';
      case "Taxes":
        return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/></svg>';
      case "Subscription":
        return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>';
      case "Websites":
        return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>';
      case "Marketing":
        return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>';
      case "Business":
        return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>';
      case "Ai Subscriptions":
        return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="15" x2="23" y2="15"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="15" x2="4" y2="15"/></svg>';
      case "Travel and Transportation":
        return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>';
      case "Courses":
        return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>';
      case "Tech":
        return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>';
      case "Books":
        return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>';
      case "Gifts":
        return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>';
      case "Charity":
        return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>';
      case "Misc":
        return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>';
      default:
        return getBucketSvg(bucket);
    }
  }

  function getBucketSvg(bucket) {
    switch (bucket) {
      case "Play":
        return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
      case "Necessity":
        return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';
      case "Small Business":
        return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>';
      case "Education":
        return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>';
      case "Giving":
        return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>';
      default:
        return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
    }
  }

  function getPaymentSvg(method) {
    switch (method) {
      case "Cash":
        return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>';
      case "E-Transfer":
        return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3 21 7l-4 4"/><path d="M3 7h18"/><path d="M7 21l-4-4 4-4"/><path d="M21 17H3"/></svg>';
      case "Credit Card":
        return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>';
      case "Other":
        return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><circle cx="18" cy="12" r="1"/></svg>';
      default:
        return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
    }
  }

  function createExpenseCard(
    expense
  ) {

    const card =
      document.createElement(
        "article"
      );

    const bucketSlug =
      getBucketSlug(
        expense.bucket
      );

    card.className =
      "expense-card bucket-" +
      bucketSlug;

    card.setAttribute(
      "role",
      "button"
    );

    card.setAttribute(
      "tabindex",
      "0"
    );

    card.setAttribute(
      "aria-label",
      "Edit " +
        (expense.item || "expense") +
        ", " +
        formatCurrency(expense.cost)
    );

    card.addEventListener(
      "click",
      function() {
        openEditExpense(
          expense.id
        );
      }
    );

    card.addEventListener(
      "keydown",
      function(e) {
        if (
          e.key === "Enter" ||
          e.key === " "
        ) {
          e.preventDefault();
          openEditExpense(
            expense.id
          );
        }
      }
    );

    const glyphContainer =
      document.createElement(
        "div"
      );

    glyphContainer.className =
      "expense-glyph-container glyph-bucket-" +
      bucketSlug;

    glyphContainer.innerHTML =
      getCategorySvg(
        expense.category,
        expense.bucket
      );

    const content =
      document.createElement(
        "div"
      );

    content.className =
      "expense-card-content";

    const topRow =
      document.createElement(
        "div"
      );

    topRow.className =
      "expense-row-top";

    const title =
      document.createElement(
        "div"
      );

    title.className =
      "expense-title";

    title.textContent =
      expense.item ||
      "Untitled Expense";

    const amount =
      document.createElement(
        "div"
      );

    amount.className =
      "expense-amount";

    amount.textContent =
      formatCurrency(
        expense.cost
      );

    topRow.appendChild(
      title
    );

    topRow.appendChild(
      amount
    );

    const subRow =
      document.createElement(
        "div"
      );

    subRow.className =
      "expense-row-sub";

    const meta =
      document.createElement(
        "div"
      );

    meta.className =
      "expense-meta";

    const metaParts = [
      expense.category,
      expense.bucket,
      formatDisplayDate(expense.date)
    ].filter(Boolean);

    meta.textContent =
      metaParts.join(" · ");

    subRow.appendChild(
      meta
    );

    content.appendChild(
      topRow
    );

    content.appendChild(
      subRow
    );

    card.appendChild(
      glyphContainer
    );

    card.appendChild(
      content
    );

    return card;

  }


  function createIconButton(type) {

    const button =
      document.createElement(
        "button"
      );


    button.type =
      "button";


    button.className =
      "card-action";


    if (
      type === "edit"
    ) {

      button.innerHTML = `
        <svg viewBox="0 0 24 24">
          <path d="M12 20h9"/>
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/>
        </svg>
      `;

    } else {

      button.innerHTML = `
        <svg viewBox="0 0 24 24">
          <path d="M3 6h18"/>
          <path d="M8 6V4h8v2"/>
          <path d="M19 6l-1 14H6L5 6"/>
          <path d="M10 11v5M14 11v5"/>
        </svg>
      `;

    }


    return button;

  }


  /* =========================================
     EXPENSE SUMMARY
  ========================================= */

  function updateExpenseSummary() {

    let data;

    let label;


    if (
      hasActiveExpenseFilters()
    ) {

      data =
        filteredExpenses;


      label =
        "Filtered view";

    } else {

      const now =
        new Date();


      label =
        now.toLocaleDateString(
          "en-CA",
          {
            month:
              "long",

            year:
              "numeric"
          }
        );


      data =
        currentExpenses.filter(
          function(expense) {

            const parts =
              parseDateParts(
                expense.date
              );


            return (
              parts &&
              parts.year ===
                now.getFullYear() &&
              parts.month ===
                now.getMonth() + 1
            );

          }
        );

    }


    const total =
      calculateTotal(
        data
      );


    const average =
      data.length
        ? total /
          data.length
        : 0;


    document
      .getElementById(
        "summaryPeriod"
      )
      .textContent =
        label;


    document
      .getElementById(
        "summaryTotal"
      )
      .textContent =
        formatCurrency(
          total
        );


    document
      .getElementById(
        "summaryTransactions"
      )
      .textContent =
        data.length;


    document
      .getElementById(
        "summaryAverage"
      )
      .textContent =
        formatCurrency(
          average
        );

  }


  /* =========================================
     INSIGHTS
  ========================================= */

  function applyInsightFilters() {

    insightExpenses =
      currentExpenses.filter(
        function(expense) {

          return (
            matchesDateRange(
              expense,
              insightFilters
            ) &&
            matchesMonth(
              expense,
              insightFilters.month
            ) &&
            matchesYear(
              expense,
              insightFilters.year
            )
          );

        }
      );


    updateInsightMonthAvailability();

    updateInsightMetrics();

    updateInsightPeriodLabel();


    /*
     * Do not build expensive charts
     * while Insights is hidden.
     */

    if (
      currentView ===
      "insights"
    ) {

      renderInsightCharts();

    }

  }


  function updateInsightMonthAvailability() {

    const monthSelect =
      document.getElementById(
        "insightMonth"
      );


    monthSelect.disabled =
      !insightFilters.year;


    if (
      !insightFilters.year
    ) {

      insightFilters.month =
        "";


      monthSelect.value =
        "";

    }

  }


  function resetInsightFilters() {

    insightFilters = {

      dateRange: "all",

      startDate: "",

      endDate: "",

      month: "",

      year: ""

    };


    document
      .getElementById(
        "insightDateRange"
      )
      .value =
        "all";


    document
      .getElementById(
        "insightYear"
      )
      .value =
        "";


    document
      .getElementById(
        "insightMonth"
      )
      .value =
        "";


    document
      .getElementById(
        "insightMonth"
      )
      .disabled =
        true;


    document
      .getElementById(
        "insightStartDate"
      )
      .value =
        "";


    document
      .getElementById(
        "insightEndDate"
      )
      .value =
        "";


    document
      .getElementById(
        "customInsightRange"
      )
      .classList.add(
        "hidden"
      );


    showAllCategories =
      false;


    applyInsightFilters();

  }


  function toggleInsightFilters() {

    const body =
      document.getElementById(
        "insightFilterBody"
      );

    const button =
      document.getElementById(
        "toggleInsightFiltersButton"
      );

    if (!body || !button) {
      return;
    }

    const isHidden =
      body.classList.contains(
        "hidden"
      );

    if (isHidden) {

      body.classList.remove(
        "hidden"
      );

      button.classList.add(
        "is-open"
      );

      button.setAttribute(
        "aria-expanded",
        "true"
      );

    } else {

      body.classList.add(
        "hidden"
      );

      button.classList.remove(
        "is-open"
      );

      button.setAttribute(
        "aria-expanded",
        "false"
      );

    }

  }


  function updateInsightPeriodLabel() {

    let label =
      "All spending";

    let rangePillText =
      "All dates";

    const hasActiveFilter = Boolean(
      (insightFilters.dateRange && insightFilters.dateRange !== "all") ||
      insightFilters.year ||
      insightFilters.month ||
      insightFilters.startDate ||
      insightFilters.endDate
    );

    if (
      insightFilters.year &&
      insightFilters.month
    ) {

      label =
        getMonthName(
          Number(
            insightFilters.month
          )
        ) +
        " " +
        insightFilters.year;

      rangePillText = "Monthly";

    } else if (
      insightFilters.year
    ) {

      label =
        insightFilters.year;

      rangePillText = "Yearly";

    } else if (
      insightFilters.dateRange !==
      "all"
    ) {

      label =
        getDateRangeLabel(
          insightFilters
        );

      rangePillText = label;

    }

    const periodLabelEl =
      document.getElementById(
        "insightPeriodLabel"
      );

    if (periodLabelEl) {
      periodLabelEl.textContent =
        label;
    }

    const rangePillEl =
      document.getElementById(
        "insightRangePill"
      );

    if (rangePillEl) {
      rangePillEl.textContent =
        rangePillText;

      rangePillEl.classList.toggle(
        "active-filter",
        hasActiveFilter
      );
    }

    const resetBtn =
      document.getElementById(
        "resetInsightFiltersButton"
      );

    if (resetBtn) {
      resetBtn.classList.toggle(
        "hidden",
        !hasActiveFilter
      );
    }

  }


  function updateInsightMetrics() {

    const total =
      calculateTotal(
        insightExpenses
      );


    const average =
      insightExpenses.length
        ? total /
          insightExpenses.length
        : 0;


    document
      .getElementById(
        "insightTotal"
      )
      .textContent =
        formatCurrency(
          total
        );


    document
      .getElementById(
        "insightTransactions"
      )
      .textContent =
        insightExpenses.length;


    document
      .getElementById(
        "insightAverage"
      )
      .textContent =
        formatCurrency(
          average
        );

  }


  function renderInsightCharts() {

    const total =
      calculateTotal(
        insightExpenses
      );


    const bucketData =
      aggregateExpenses(
        insightExpenses,
        function(expense) {

          return (
            expense.bucket ||
            "Not set"
          );

        }
      );


    const categoryData =
      aggregateExpenses(
        insightExpenses,
        function(expense) {

          return (
            expense.category ||
            "Not set"
          );

        }
      );


    const paymentData =
      aggregateExpenses(
        insightExpenses,
        function(expense) {

          return (
            expense.paymentMethod ||
            "Not set"
          );

        }
      );


    renderMonthlyTrend();


    renderDonutChart(
      "bucketDonut",
      "bucketLegend",
      bucketData,
      total
    );


    renderCategoryList(
      categoryData,
      total
    );


    renderDonutChart(
      "paymentDonut",
      "paymentLegend",
      paymentData,
      total
    );

  }


  function aggregateExpenses(
    expenses,
    labelFunction
  ) {

    const totals = {};


    expenses.forEach(
      function(expense) {

        const label =
          labelFunction(
            expense
          );


        if (
          !totals[label]
        ) {

          totals[label] =
            0;

        }


        totals[label] +=
          moneyToCents(
            expense.cost
          );

      }
    );


    return Object
      .keys(
        totals
      )
      .map(
        function(label) {

          return {

            label:
              label,

            value:
              centsToMoney(
                totals[label]
              )

          };

        }
      )
      .sort(
        function(a, b) {

          return (
            b.value -
            a.value
          );

        }
      );

  }


  /* =========================================
     MONTHLY TREND
  ========================================= */

  function renderMonthlyTrend() {

    const container =
      document.getElementById(
        "monthlyTrendChart"
      );


    container.innerHTML = "";


    const trendData =
      buildMonthlyTrendData(
        insightExpenses
      );


    if (
      trendData.length === 0
    ) {

      container.innerHTML = `
        <div class="chart-empty">
          No spending for this period.
        </div>
      `;


      return;

    }


    if (
      trendData.length === 1
    ) {

      const item =
        trendData[0];


      const fullLabel =
        getTrendMonthFullLabel(
          item.key
        );


      container.innerHTML = `
        <div class="single-month-trend">

          <div class="single-month-label">
            ${escapeHtml(fullLabel)}
          </div>

          <div class="single-month-value">
            ${escapeHtml(
              formatCurrency(
                item.value
              )
            )}
          </div>

          <div class="single-month-bar-track">
            <div class="single-month-bar"></div>
          </div>

          <div class="single-month-caption">
            One month selected · no trend comparison needed
          </div>

        </div>
      `;


      return;

    }


    renderMultiMonthTrend(
      container,
      trendData
    );

  }


  function renderMultiMonthTrend(
    container,
    trendData
  ) {

    const width = 640;

    const height = 175;

    const left = 48;

    const right = 16;

    const top = 14;

    const bottom = 30;


    const plotWidth =
      width -
      left -
      right;


    const plotHeight =
      height -
      top -
      bottom;


    const maxValue =
      Math.max(
        ...trendData.map(
          item =>
            item.value
        ),
        1
      );


    const pointGap =
      plotWidth /
      (
        trendData.length -
        1
      );


    const points =
      trendData.map(
        function(item, index) {

          const x =
            left +
            index *
            pointGap;


          const y =
            top +
            plotHeight -
            (
              item.value /
              maxValue
            ) *
            plotHeight;


          return {

            x: x,

            y: y,

            value:
              item.value,

            label:
              item.label,

            key:
              item.key

          };

        }
      );


    const pointString =
      points
        .map(
          point =>
            point.x +
            "," +
            point.y
        )
        .join(" ");


    const areaPoints =
      left +
      "," +
      (
        top +
        plotHeight
      ) +
      " " +
      pointString +
      " " +
      (
        left +
        plotWidth
      ) +
      "," +
      (
        top +
        plotHeight
      );


    const labelStep =
      Math.max(
        1,
        Math.ceil(
          trendData.length / 6
        )
      );


    let labels = "";


    points.forEach(
      function(point, index) {

        if (
          index % labelStep !== 0 &&
          index !==
            points.length - 1
        ) {

          return;

        }


        labels += `
          <text
            x="${point.x}"
            y="${height - 8}"
            text-anchor="middle"
            font-size="10"
            fill="#9197a3"
          >
            ${escapeHtml(point.label)}
          </text>
        `;

      }
    );


    const circles =
      points
        .map(
          point => `
            <circle
              cx="${point.x}"
              cy="${point.y}"
              r="4"
              fill="#2864dc"
              stroke="#ffffff"
              stroke-width="2"
            />
          `
        )
        .join("");


    container.innerHTML = `
      <svg
        viewBox="0 0 ${width} ${height}"
        role="img"
        aria-label="Monthly spending trend"
      >

        <defs>

          <linearGradient
            id="trendGradient"
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >

            <stop
              offset="0%"
              stop-color="#2864dc"
              stop-opacity="0.18"
            />

            <stop
              offset="100%"
              stop-color="#2864dc"
              stop-opacity="0"
            />

          </linearGradient>

        </defs>


        <line
          x1="${left}"
          y1="${top}"
          x2="${left + plotWidth}"
          y2="${top}"
          stroke="#edf0f5"
        />

        <line
          x1="${left}"
          y1="${top + plotHeight / 2}"
          x2="${left + plotWidth}"
          y2="${top + plotHeight / 2}"
          stroke="#edf0f5"
        />

        <line
          x1="${left}"
          y1="${top + plotHeight}"
          x2="${left + plotWidth}"
          y2="${top + plotHeight}"
          stroke="#edf0f5"
        />


        <text
          x="4"
          y="${top + 4}"
          font-size="10"
          fill="#9197a3"
        >
          ${escapeHtml(
            formatCompactCurrency(
              maxValue
            )
          )}
        </text>


        <text
          x="18"
          y="${top + plotHeight + 4}"
          font-size="10"
          fill="#9197a3"
        >
          $0
        </text>


        <polygon
          points="${areaPoints}"
          fill="url(#trendGradient)"
        />


        <polyline
          points="${pointString}"
          fill="none"
          stroke="#2864dc"
          stroke-width="3"
          stroke-linejoin="round"
          stroke-linecap="round"
        />


        ${circles}

        ${labels}

      </svg>
    `;

  }


  function buildMonthlyTrendData(
    expenses
  ) {

    if (
      expenses.length === 0
    ) {

      return [];

    }


    const totals = {};


    expenses.forEach(
      function(expense) {

        const parts =
          parseDateParts(
            expense.date
          );


        if (!parts) {

          return;

        }


        const key =
          parts.year +
          "-" +
          String(
            parts.month
          )
            .padStart(
              2,
              "0"
            );


        if (
          !totals[key]
        ) {

          totals[key] =
            0;

        }


        totals[key] +=
          moneyToCents(
            expense.cost
          );

      }
    );


    const existingKeys =
      Object
        .keys(totals)
        .sort();


    if (
      existingKeys.length === 0
    ) {

      return [];

    }


    if (
      insightFilters.year &&
      insightFilters.month
    ) {

      const key =
        insightFilters.year +
        "-" +
        String(
          insightFilters.month
        )
          .padStart(
            2,
            "0"
          );


      return [{

        key:
          key,

        label:
          getMonthShortName(
            Number(
              insightFilters.month
            )
          ),

        value:
          centsToMoney(
            totals[key] || 0
          )

      }];

    }


    const first =
      existingKeys[0]
        .split("-");


    const last =
      existingKeys[
        existingKeys.length - 1
      ]
        .split("-");


    let year =
      Number(
        first[0]
      );


    let month =
      Number(
        first[1]
      );


    const endYear =
      Number(
        last[0]
      );


    const endMonth =
      Number(
        last[1]
      );


    const result = [];

    let safety = 0;


    while (
      (
        year < endYear ||
        (
          year === endYear &&
          month <= endMonth
        )
      ) &&
      safety < 120
    ) {

      const key =
        year +
        "-" +
        String(
          month
        )
          .padStart(
            2,
            "0"
          );


      result.push({

        key:
          key,

        label:
          getMonthShortName(
            month
          ),

        value:
          centsToMoney(
            totals[key] || 0
          )

      });


      month++;


      if (
        month === 13
      ) {

        month = 1;

        year++;

      }


      safety++;

    }


    return result;

  }


  function getTrendMonthFullLabel(
    key
  ) {

    const parts =
      String(key)
        .split("-");


    if (
      parts.length !== 2
    ) {

      return key;

    }


    return (
      getMonthName(
        Number(
          parts[1]
        )
      ) +
      " " +
      parts[0]
    );

  }


  /* =========================================
     STAGE 2 POLISH: RANKED CATEGORY LIST
  ========================================= */

  let showAllCategories = false;
  let currentCategoryData = [];
  let currentCategoryTotal = 0;

  function getCategoryColor(categoryName, index) {

    for (const [bucket, cats] of Object.entries(CATEGORY_MAP)) {
      if (cats.includes(categoryName)) {
        if (bucket === "Play") return "#ec4899";
        if (bucket === "Necessity") return "#3b82f6";
        if (bucket === "Small Business") return "#8b5cf6";
        if (bucket === "Education") return "#f59e0b";
        if (bucket === "Giving") return "#10b981";
      }
    }

    return CHART_COLORS[index % CHART_COLORS.length];

  }


  function renderCategoryList(data, total) {

    currentCategoryData = data || [];
    currentCategoryTotal = total || 0;

    const listEl =
      document.getElementById(
        "categoryRankedList"
      );

    const toggleBtn =
      document.getElementById(
        "toggleAllCategoriesButton"
      );

    const toggleText =
      document.getElementById(
        "toggleAllCategoriesText"
      );

    if (!listEl) {
      return;
    }

    listEl.innerHTML = "";

    if (!currentCategoryData.length || currentCategoryTotal <= 0) {

      listEl.innerHTML = `
        <div class="chart-empty">
          No spending for this period.
        </div>
      `;

      if (toggleBtn) {
        toggleBtn.classList.add("hidden");
      }

      return;

    }

    const itemsToShow = showAllCategories
      ? currentCategoryData
      : currentCategoryData.slice(0, 8);

    let html = "";

    itemsToShow.forEach(function(item, index) {

      const pctNum = (
        (item.value / currentCategoryTotal) * 100
      );

      const percent = pctNum.toFixed(1);

      const barWidth = Math.min(
        100,
        Math.max(1, pctNum)
      ).toFixed(1);

      const color = getCategoryColor(
        item.label,
        index
      );

      html += `
        <div class="category-rank-row">
          <div class="category-rank-top">
            <div class="category-rank-name-wrap">
              <span class="category-rank-marker" style="background-color: ${color};"></span>
              <span class="category-rank-name">${escapeHtml(item.label)}</span>
            </div>
            <span class="category-rank-amount">${escapeHtml(formatCurrency(item.value))}</span>
          </div>
          <div class="category-rank-bar-wrap">
            <div class="category-rank-track">
              <div class="category-rank-bar" style="width: ${barWidth}%; background-color: ${color};"></div>
            </div>
            <span class="category-rank-pct">${percent}%</span>
          </div>
        </div>
      `;

    });

    listEl.innerHTML = html;

    if (toggleBtn) {

      if (currentCategoryData.length > 8) {

        toggleBtn.classList.remove("hidden");

        if (toggleText) {
          toggleText.textContent = showAllCategories
            ? "Show fewer categories"
            : "Show all categories";
        }

      } else {

        toggleBtn.classList.add("hidden");

      }

    }

  }


  /* =========================================
     DONUTS
  ========================================= */

  function renderDonutChart(
    donutId,
    legendId,
    data,
    total
  ) {

    const container =
      document.getElementById(
        donutId
      );


    const legend =
      document.getElementById(
        legendId
      );


    container.innerHTML = "";

    legend.innerHTML = "";


    if (
      !data.length ||
      total <= 0
    ) {

      const empty =
        document.createElement(
          "div"
        );


      empty.className =
        "chart-empty";


      empty.textContent =
        "No spending for this period.";


      container.appendChild(
        empty
      );


      return;

    }


    let currentPercent = 0;

    const gradientParts = [];


    data.forEach(
      function(item, index) {

        const percent =
          (
            item.value /
            total
          ) *
          100;


        const start =
          currentPercent;


        const end =
          currentPercent +
          percent;


        const color =
          CHART_COLORS[
            index %
            CHART_COLORS.length
          ];


        gradientParts.push(
          color +
          " " +
          start +
          "% " +
          end +
          "%"
        );


        currentPercent =
          end;

      }
    );


    const shell =
      document.createElement(
        "div"
      );


    shell.className =
      "donut-shell";


    const donut =
      document.createElement(
        "div"
      );


    donut.className =
      "donut";


    donut.style.background =
      "conic-gradient(" +
      gradientParts.join(",") +
      ")";


    const center =
      document.createElement(
        "div"
      );


    center.className =
      "donut-center";


    const centerLabel =
      document.createElement(
        "span"
      );


    centerLabel.textContent =
      "Total";


    const centerValue =
      document.createElement(
        "strong"
      );


    centerValue.textContent =
      formatCompactCurrency(
        total
      );


    center.appendChild(
      centerLabel
    );


    center.appendChild(
      centerValue
    );


    shell.appendChild(
      donut
    );


    shell.appendChild(
      center
    );


    container.appendChild(
      shell
    );


    data.forEach(
      function(item, index) {

        const row =
          document.createElement(
            "div"
          );


        row.className =
          "legend-row";


        const dot =
          document.createElement(
            "span"
          );


        dot.className =
          "legend-dot";


        dot.style.backgroundColor =
          CHART_COLORS[
            index %
            CHART_COLORS.length
          ];


        const copy =
          document.createElement(
            "div"
          );


        copy.className =
          "legend-copy";


        const name =
          document.createElement(
            "span"
          );


        name.className =
          "legend-name";


        name.textContent =
          item.label;


        const percent =
          document.createElement(
            "span"
          );


        percent.className =
          "legend-percent";


        percent.textContent =
          (
            (
              item.value /
              total
            ) *
            100
          )
            .toFixed(1) +
          "%";


        copy.appendChild(name);

        copy.appendChild(percent);


        const value =
          document.createElement(
            "span"
          );


        value.className =
          "legend-value";


        value.textContent =
          formatCurrency(
            item.value
          );


        row.appendChild(dot);

        row.appendChild(copy);

        row.appendChild(value);


        legend.appendChild(row);

      }
    );

  }


  /* =========================================
     FILTER UI
  ========================================= */

  function openFilters() {

    syncExpenseFilterControls();


    filterBackdrop
      .classList.remove(
        "hidden"
      );


    filterSheet
      .classList.remove(
        "hidden"
      );


    document.body.style.overflow =
      "hidden";

  }


  function closeFilters() {

    filterBackdrop
      .classList.add(
        "hidden"
      );


    filterSheet
      .classList.add(
        "hidden"
      );


    document.body.style.overflow =
      "";

  }


  function renderExpenseFilterBuckets() {

    const container =
      document.getElementById(
        "filterBucketChoices"
      );


    container.innerHTML = "";


    createFilterChoice(
      container,
      "All",
      "",
      filters.bucket,
      function(value) {

        filters.bucket =
          value;


        filters.category =
          "";


        renderExpenseFilterBuckets();

        renderExpenseFilterCategories();

        resetExpenseRenderWindow();

        applyExpenseFilters();

      }
    );


    Object
      .keys(CATEGORY_MAP)
      .forEach(
        function(name) {

          createFilterChoice(
            container,
            name,
            name,
            filters.bucket,
            function(value) {

              filters.bucket =
                value;


              filters.category =
                "";


              renderExpenseFilterBuckets();

              renderExpenseFilterCategories();

              resetExpenseRenderWindow();

              applyExpenseFilters();

            }
          );

        }
      );

  }


  function renderExpenseFilterCategories() {

    const container =
      document.getElementById(
        "filterCategoryChoices"
      );


    container.innerHTML = "";


    createFilterChoice(
      container,
      "All",
      "",
      filters.category,
      function(value) {

        filters.category =
          value;


        renderExpenseFilterCategories();

        resetExpenseRenderWindow();

        applyExpenseFilters();

      }
    );


    getAvailableCategories()
      .forEach(
        function(name) {

          createFilterChoice(
            container,
            name,
            name,
            filters.category,
            function(value) {

              filters.category =
                value;


              renderExpenseFilterCategories();

              resetExpenseRenderWindow();

              applyExpenseFilters();

            }
          );

        }
      );

  }


  function getAvailableCategories() {

    const values =
      new Set();


    if (
      filters.bucket &&
      CATEGORY_MAP[
        filters.bucket
      ]
    ) {

      CATEGORY_MAP[
        filters.bucket
      ]
        .forEach(
          value =>
            values.add(value)
        );

    }


    currentExpenses.forEach(
      function(expense) {

        if (
          filters.bucket &&
          expense.bucket !==
            filters.bucket
        ) {

          return;

        }


        if (
          expense.category
        ) {

          values.add(
            expense.category
          );

        }

      }
    );


    return Array
      .from(values)
      .sort(
        function(a, b) {

          return a.localeCompare(b);

        }
      );

  }


  function renderExpenseFilterPayments() {

    const container =
      document.getElementById(
        "filterPaymentChoices"
      );


    container.innerHTML = "";


    createFilterChoice(
      container,
      "All",
      "",
      filters.paymentMethod,
      function(value) {

        filters.paymentMethod =
          value;


        renderExpenseFilterPayments();

        resetExpenseRenderWindow();

        applyExpenseFilters();

      }
    );


    PAYMENT_METHODS.forEach(
      function(method) {

        createFilterChoice(
          container,
          method,
          method,
          filters.paymentMethod,
          function(value) {

            filters.paymentMethod =
              value;


            renderExpenseFilterPayments();

            resetExpenseRenderWindow();

            applyExpenseFilters();

          }
        );

      }
    );

  }


  function createFilterChoice(
    container,
    label,
    value,
    currentValue,
    callback
  ) {

    const button =
      document.createElement(
        "button"
      );


    button.type =
      "button";


    button.className =
      "choice-button";


    button.textContent =
      label;


    if (
      currentValue === value
    ) {

      button.classList.add(
        "selected"
      );

    }


    button.addEventListener(
      "click",
      function() {

        callback(value);

      }
    );


    container.appendChild(
      button
    );

  }


  function syncExpenseFilterControls() {

    document
      .getElementById(
        "dateRangeFilter"
      )
      .value =
        filters.dateRange;


    document
      .getElementById(
        "startDateFilter"
      )
      .value =
        filters.startDate;


    document
      .getElementById(
        "endDateFilter"
      )
      .value =
        filters.endDate;


    document
      .getElementById(
        "monthFilter"
      )
      .value =
        filters.month;


    document
      .getElementById(
        "yearFilter"
      )
      .value =
        filters.year;


    document
      .getElementById(
        "customDateRange"
      )
      .classList.toggle(
        "hidden",
        filters.dateRange !==
          "custom"
      );


    renderExpenseFilterBuckets();

    renderExpenseFilterCategories();

    renderExpenseFilterPayments();

  }


  function resetExpenseFilters() {

    filters = {

      search: "",

      bucket: "",

      category: "",

      paymentMethod: "",

      dateRange: "all",

      startDate: "",

      endDate: "",

      month: "",

      year: ""

    };


    searchInput.value = "";


    clearSearchButton
      .classList.add(
        "hidden"
      );


    resetExpenseRenderWindow();

    syncExpenseFilterControls();

    applyExpenseFilters();

  }


  function hasActiveExpenseFilters() {

    return (
      Boolean(
        filters.search
      ) ||
      Boolean(
        filters.bucket
      ) ||
      Boolean(
        filters.category
      ) ||
      Boolean(
        filters.paymentMethod
      ) ||
      filters.dateRange !==
        "all" ||
      Boolean(
        filters.month
      ) ||
      Boolean(
        filters.year
      )
    );

  }


  /* =========================================
     ACTIVE FILTERS
  ========================================= */

  function renderActiveFilters() {

    const container =
      document.getElementById(
        "activeFilters"
      );


    container.innerHTML = "";


    const chips = [];


    if (
      filters.search
    ) {

      chips.push({

        label:
          'Search: "' +
          filters.search +
          '"',

        clear:
          function() {

            filters.search = "";

            searchInput.value = "";


            clearSearchButton
              .classList.add(
                "hidden"
              );

          }

      });

    }


    if (
      filters.bucket
    ) {

      chips.push({

        label:
          filters.bucket,

        clear:
          function() {

            filters.bucket = "";

            filters.category = "";

          }

      });

    }


    if (
      filters.category
    ) {

      chips.push({

        label:
          filters.category,

        clear:
          function() {

            filters.category = "";

          }

      });

    }


    if (
      filters.paymentMethod
    ) {

      chips.push({

        label:
          filters.paymentMethod,

        clear:
          function() {

            filters.paymentMethod = "";

          }

      });

    }


    if (
      filters.dateRange !==
      "all"
    ) {

      chips.push({

        label:
          getDateRangeLabel(
            filters
          ),

        clear:
          function() {

            filters.dateRange =
              "all";

            filters.startDate =
              "";

            filters.endDate =
              "";

          }

      });

    }


    if (
      filters.month
    ) {

      chips.push({

        label:
          getMonthName(
            Number(
              filters.month
            )
          ),

        clear:
          function() {

            filters.month = "";

          }

      });

    }


    if (
      filters.year
    ) {

      chips.push({

        label:
          filters.year,

        clear:
          function() {

            filters.year = "";

          }

      });

    }


    if (
      chips.length === 0
    ) {

      container
        .classList.add(
          "hidden"
        );


      document
        .getElementById(
          "clearAllFiltersButton"
        )
        .classList.add(
          "hidden"
        );


      return;

    }


    container
      .classList.remove(
        "hidden"
      );


    document
      .getElementById(
        "clearAllFiltersButton"
      )
      .classList.remove(
        "hidden"
      );


    chips.forEach(
      function(chip) {

        const button =
          document.createElement(
            "button"
          );


        button.type =
          "button";


        button.className =
          "active-filter-chip";


        const text =
          document.createElement(
            "strong"
          );


        text.textContent =
          chip.label;


        const close =
          document.createElement(
            "span"
          );


        close.textContent =
          "×";


        button.appendChild(text);

        button.appendChild(close);


        button.addEventListener(
          "click",
          function() {

            chip.clear();


            resetExpenseRenderWindow();

            syncExpenseFilterControls();

            applyExpenseFilters();

          }
        );


        container.appendChild(
          button
        );

      }
    );

  }


  function updateFilterCount() {

    let count = 0;


    if (
      filters.bucket
    ) {
      count++;
    }


    if (
      filters.category
    ) {
      count++;
    }


    if (
      filters.paymentMethod
    ) {
      count++;
    }


    if (
      filters.dateRange !==
      "all"
    ) {
      count++;
    }


    if (
      filters.month
    ) {
      count++;
    }


    if (
      filters.year
    ) {
      count++;
    }


    const badge =
      document.getElementById(
        "filterCount"
      );


    badge.textContent =
      count;


    badge
      .classList.toggle(
        "hidden",
        count === 0
      );

  }


  /* =========================================
     YEAR OPTIONS
  ========================================= */

  function buildYearOptions() {

    const years =
      new Set();


    currentExpenses.forEach(
      function(expense) {

        const parts =
          parseDateParts(
            expense.date
          );


        if (
          parts
        ) {

          years.add(
            parts.year
          );

        }

      }
    );


    const sortedYears =
      Array
        .from(years)
        .sort(
          function(a, b) {

            return b - a;

          }
        );


    populateYearSelect(
      "yearFilter",
      filters.year,
      sortedYears
    );


    populateYearSelect(
      "insightYear",
      insightFilters.year,
      sortedYears
    );

  }


  function populateYearSelect(
    id,
    selected,
    years
  ) {

    const select =
      document.getElementById(
        id
      );


    select.innerHTML =
      '<option value="">All years</option>';


    years.forEach(
      function(year) {

        const option =
          document.createElement(
            "option"
          );


        option.value =
          String(year);


        option.textContent =
          String(year);


        select.appendChild(
          option
        );

      }
    );


    select.value =
      selected ||
      "";

  }


  /* =========================================
     EDITOR
  ========================================= */

  function setupExpenseEditor() {

    document
      .getElementById(
        "closeEditorButton"
      )
      .addEventListener(
        "click",
        closeEditor
      );


    editorBackdrop
      .addEventListener(
        "click",
        closeEditor
      );


    document
      .getElementById(
        "deleteEditorButton"
      )
      .addEventListener(
        "click",
        deleteExpenseFromEditor
      );


    expenseForm
      .addEventListener(
        "submit",
        saveExpense
      );

  }


  function openAddExpense() {

    if (
      blockWhileSaving()
    ) {

      return;

    }

    if (
      !editorSheet.classList.contains("hidden") &&
      !editingExpenseId
    ) {

      closeEditor();

      return;

    }


    editingExpenseId = null;


    expenseForm.reset();


    document
      .getElementById(
        "expenseId"
      )
      .value =
        "";


    document
      .getElementById(
        "editorTitle"
      )
      .textContent =
        "Add Expense";


    saveButton.textContent =
      "Save Expense";


    document
      .getElementById(
        "deleteEditorButton"
      )
      .classList.add(
        "hidden"
      );


    selectedBucket =
      "Play";


    selectedCategory =
      "";


    selectedPaymentMethod =
      "";


    renderBucketChoices();

    renderCategoryChoices();

    renderPaymentChoices();

    setToday();

    hideFormError();

    showEditor();

  }


  function openEditExpense(
    id
  ) {

    if (
      blockWhileSaving()
    ) {

      return;

    }


    const expense =
      currentExpenses.find(
        function(item) {

          return (
            item.id === id
          );

        }
      );


    if (
      !expense
    ) {

      showToast(
        "Expense could not be found."
      );


      return;

    }


    editingExpenseId =
      expense.id;


    document
      .getElementById(
        "expenseId"
      )
      .value =
        expense.id;


    document
      .getElementById(
        "editorTitle"
      )
      .textContent =
        "Edit Expense";


    saveButton.textContent =
      "Update Expense";


    document
      .getElementById(
        "deleteEditorButton"
      )
      .classList.remove(
        "hidden"
      );


    document
      .getElementById(
        "date"
      )
      .value =
        expense.date;


    document
      .getElementById(
        "cost"
      )
      .value =
        expense.cost;


    document
      .getElementById(
        "item"
      )
      .value =
        expense.item ||
        "";


    document
      .getElementById(
        "notes"
      )
      .value =
        expense.notes ||
        "";


    selectedBucket =
      expense.bucket;


    selectedCategory =
      expense.category;


    selectedPaymentMethod =
      expense.paymentMethod ||
      "";


    renderBucketChoices();

    renderCategoryChoices();

    renderPaymentChoices();

    hideFormError();

    showEditor();

  }


  function showEditor() {

    editorBackdrop
      .classList.remove(
        "hidden"
      );


    editorSheet
      .classList.remove(
        "hidden"
      );


    document.body.style.overflow =
      "hidden";

    const addFab =
      document.getElementById(
        "addExpenseButton"
      );

    if (addFab) {
      if (!editingExpenseId) {
        addFab.classList.add("is-open");
        addFab.setAttribute("aria-label", "Close expense editor");
      } else {
        addFab.classList.remove("is-open");
        addFab.setAttribute("aria-label", "Add expense");
      }
    }

  }


  function closeEditor() {

    editorBackdrop
      .classList.add(
        "hidden"
      );


    editorSheet
      .classList.add(
        "hidden"
      );


    document.body.style.overflow =
      "";


    editingExpenseId =
      null;


    setSavingState(
      false
    );

    const addFab =
      document.getElementById(
        "addExpenseButton"
      );

    if (addFab) {
      addFab.classList.remove("is-open");
      addFab.setAttribute("aria-label", "Add expense");
    }

  }


  function renderBucketChoices() {

    const container =
      document.getElementById(
        "bucketChoices"
      );


    container.innerHTML = "";


    Object
      .keys(CATEGORY_MAP)
      .forEach(
        function(name) {

          const button =
            document.createElement(
              "button"
            );


          button.type =
            "button";

          const slug =
            getBucketSlug(name);

          button.className =
            "choice-button bucket-choice-btn bucket-btn-" +
            slug;


          if (
            name === selectedBucket
          ) {

            button.classList.add(
              "selected"
            );

          }

          button.innerHTML =
            '<span class="choice-icon-wrap" aria-hidden="true">' +
            getBucketSvg(name) +
            '</span><span class="choice-text">' +
            name +
            '</span>';


          button.addEventListener(
            "click",
            function() {

              selectedBucket =
                name;


              selectedCategory =
                "";


              renderBucketChoices();

              renderCategoryChoices();

            }
          );


          container.appendChild(
            button
          );

        }
      );

  }


  function renderCategoryChoices() {

    const container =
      document.getElementById(
        "categoryChoices"
      );


    container.innerHTML = "";


    const categories =
      CATEGORY_MAP[
        selectedBucket
      ] ||
      [];

    const bucketSlug =
      getBucketSlug(
        selectedBucket
      );


    categories.forEach(
      function(name) {

        const button =
          document.createElement(
            "button"
          );


        button.type =
          "button";


        button.className =
          "choice-button category-choice-tile cat-bucket-" +
          bucketSlug;


        if (
          name ===
          selectedCategory
        ) {

          button.classList.add(
            "selected"
          );

        }

        button.innerHTML =
          '<span class="cat-tile-glyph" aria-hidden="true">' +
          getCategorySvg(name, selectedBucket) +
          '</span><span class="cat-tile-label">' +
          name +
          '</span>';


        button.addEventListener(
          "click",
          function() {

            selectedCategory =
              name;


            renderCategoryChoices();

          }
        );


        container.appendChild(
          button
        );

      }
    );

  }


  function renderPaymentChoices() {

    const container =
      document.getElementById(
        "paymentChoices"
      );


    container.innerHTML = "";


    PAYMENT_METHODS.forEach(
      function(method) {

        const button =
          document.createElement(
            "button"
          );


        button.type =
          "button";

        const isSelected =
          method ===
          selectedPaymentMethod;

        button.className =
          "payment-button";


        if (
          isSelected
        ) {

          button.classList.add(
            "selected"
          );

        }

        button.innerHTML =
          '<span class="choice-icon-wrap" aria-hidden="true">' +
          getPaymentSvg(method) +
          '</span><span class="choice-text">' +
          method +
          '</span>' +
          (isSelected
            ? '<span class="choice-check-badge" aria-hidden="true"><svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3.5 8.5 6.5 11.5 12.5 4.5"/></svg></span>'
            : '');


        button.addEventListener(
          "click",
          function() {

            selectedPaymentMethod =
              method;


            renderPaymentChoices();

          }
        );


        container.appendChild(
          button
        );

      }
    );

  }


  /* =========================================
     OPTIMISTIC ADD / EDIT
  ========================================= */

  function saveExpense(
    event
  ) {

    event.preventDefault();


    if (
      hasPendingWrite()
    ) {

      showFormError(
        "Please wait for your current change to finish saving."
      );


      return;

    }


    hideFormError();


    const expense = {

      id:
        editingExpenseId ||
        "",

      date:
        document
          .getElementById(
            "date"
          )
          .value,

      cost:
        document
          .getElementById(
            "cost"
          )
          .value,

      bucket:
        selectedBucket,

      category:
        selectedCategory,

      paymentMethod:
        selectedPaymentMethod,

      item:
        document
          .getElementById(
            "item"
          )
          .value
          .trim(),

      notes:
        document
          .getElementById(
            "notes"
          )
          .value
          .trim()

    };


    const error =
      validateForm(
        expense
      );


    if (
      error
    ) {

      showFormError(
        error
      );


      return;

    }


    setSavingState(
      true
    );


    if (
      editingExpenseId
    ) {

      optimisticUpdateExpense(
        expense
      );

    } else {

      optimisticAddExpense(
        expense
      );

    }

  }





  function optimisticAddExpense(
    expense
  ) {

    const temporaryId =
      createTemporaryExpenseId();


    const optimisticExpense =
      normalizeClientExpense(
        expense,
        temporaryId
      );


    currentExpenses.push(
      optimisticExpense
    );


    markLocalMutation();


    renderCurrentExpenseData({

      resetRenderWindow:
        true

    });


    beginPendingWrite();


    closeEditor();


    showToast(
      "Saving expense..."
    );


    financeApi
      .addExpense(
        expense
      )
      .then(
        function(result) {

          endPendingWrite();


          const serverId =
            result &&
            result.id
              ? String(
                  result.id
                )
              : "";


          const index =
            currentExpenses.findIndex(
              function(item) {

                return (
                  item.id ===
                  temporaryId
                );

              }
            );


          if (
            serverId &&
            index !== -1
          ) {

            currentExpenses[
              index
            ] = {

              ...currentExpenses[
                index
              ],

              id:
                serverId

            };


            markLocalMutation();


            renderCurrentExpenseData({

              resetRenderWindow:
                false

            });


            saveCurrentExpensesToCache();


            showToast(
              "Expense added."
            );


            return;

          }


          /*
           * Safety fallback.
           * Direct Sheet refresh.
           */

          showToast(
            "Expense saved. Refreshing data."
          );


          loadExpenses({

            showLoading:
              false,

            forceServerRefresh:
              true

          });

        }
      )
      .catch(
        function(error) {

          endPendingWrite();


          currentExpenses =
            currentExpenses.filter(
              function(item) {

                return (
                  item.id !==
                  temporaryId
                );

              }
            );


          markLocalMutation();


          renderCurrentExpenseData({

            resetRenderWindow:
              false

          });


          showToast(
            "Could not save expense: " +
            getErrorMessage(
              error
            )
          );

        }
      );

  }


  function optimisticUpdateExpense(
    expense
  ) {

    const targetId =
      String(
        editingExpenseId
      );


    const index =
      currentExpenses.findIndex(
        function(item) {

          return (
            item.id ===
            targetId
          );

        }
      );


    if (
      index === -1
    ) {

      setSavingState(
        false
      );


      showFormError(
        "Expense could not be found."
      );


      return;

    }


    const originalExpense = {

      ...currentExpenses[
        index
      ]

    };


    const optimisticExpense =
      normalizeClientExpense(
        expense,
        targetId
      );


    currentExpenses[
      index
    ] =
      optimisticExpense;


    markLocalMutation();


    renderCurrentExpenseData({

      resetRenderWindow:
        false

    });


    beginPendingWrite();


    closeEditor();


    showToast(
      "Updating expense..."
    );


    financeApi
      .updateExpense(
        expense
      )
      .then(
        function() {

          endPendingWrite();


          saveCurrentExpensesToCache();


          showToast(
            "Expense updated."
          );

        }
      )
      .catch(
        function(error) {

          endPendingWrite();


          const currentIndex =
            currentExpenses.findIndex(
              function(item) {

                return (
                  item.id ===
                  targetId
                );

              }
            );


          if (
            currentIndex !== -1
          ) {

            currentExpenses[
              currentIndex
            ] =
              originalExpense;

          } else {

            currentExpenses.push(
              originalExpense
            );

          }


          markLocalMutation();


          renderCurrentExpenseData({

            resetRenderWindow:
              false

          });


          showToast(
            "Update failed. Original expense restored."
          );


          console.error(
            getErrorMessage(
              error
            )
          );

        }
      );

  }


  function validateForm(
    expense
  ) {

    if (
      !expense.date
    ) {

      return (
        "Choose a date."
      );

    }


    if (
      !expense.cost ||
      Number(
        expense.cost
      ) <= 0
    ) {

      return (
        "Enter a valid cost."
      );

    }


    if (
      !expense.category
    ) {

      return (
        "Choose a category."
      );

    }


    if (
      !expense.paymentMethod
    ) {

      return (
        "Choose a payment method."
      );

    }


    if (
      !expense.item
    ) {

      return (
        "Enter what the expense was for."
      );

    }


    return "";

  }


  function showFormError(
    message
  ) {

    formError.textContent =
      message;


    formError
      .classList.remove(
        "hidden"
      );

  }


  function hideFormError() {

    formError.textContent =
      "";


    formError
      .classList.add(
        "hidden"
      );

  }


  function setSavingState(
    saving
  ) {

    saveButton.disabled =
      saving;


    saveButton.textContent =
      saving
        ? (
            editingExpenseId
              ? "Updating..."
              : "Saving..."
          )
        : (
            editingExpenseId
              ? "Update Expense"
              : "Save Expense"
          );

  }


  /* =========================================
     OPTIMISTIC DELETE
  ========================================= */

  function confirmAndDeleteExpense(
    id,
    item
  ) {

    if (
      blockWhileSaving()
    ) {

      return;

    }


    const confirmed =
      window.confirm(
        'Delete "' +
        (
          item ||
          "this expense"
        ) +
        '"?\n\nThis cannot be undone.'
      );


    if (
      !confirmed
    ) {

      return;

    }


    performDelete(
      id
    );

  }


  function deleteExpenseFromEditor() {

    if (
      blockWhileSaving()
    ) {

      return;

    }


    if (
      !editingExpenseId
    ) {

      return;

    }


    const expense =
      currentExpenses.find(
        function(item) {

          return (
            item.id ===
            editingExpenseId
          );

        }
      );


    const confirmed =
      window.confirm(
        'Delete "' +
        (
          expense &&
          expense.item
            ? expense.item
            : "this expense"
        ) +
        '"?\n\nThis cannot be undone.'
      );


    if (
      !confirmed
    ) {

      return;

    }


    performDelete(
      editingExpenseId,
      true
    );

  }


  function performDelete(
    id,
    closeAfterDelete = false
  ) {

    const targetId =
      String(id);


    const index =
      currentExpenses.findIndex(
        function(item) {

          return (
            item.id ===
            targetId
          );

        }
      );


    if (
      index === -1
    ) {

      showToast(
        "Expense could not be found."
      );


      return;

    }


    const deletedExpense = {

      ...currentExpenses[
        index
      ]

    };


    currentExpenses.splice(
      index,
      1
    );


    markLocalMutation();


    renderCurrentExpenseData({

      resetRenderWindow:
        false

    });


    beginPendingWrite();


    if (
      closeAfterDelete
    ) {

      closeEditor();

    }


    showToast(
      "Deleting expense..."
    );


    financeApi
      .deleteExpense(
        targetId
      )
      .then(
        function() {

          endPendingWrite();


          saveCurrentExpensesToCache();


          showToast(
            "Expense deleted."
          );

        }
      )
      .catch(
        function(error) {

          endPendingWrite();


          currentExpenses.splice(
            Math.min(
              index,
              currentExpenses.length
            ),
            0,
            deletedExpense
          );


          markLocalMutation();


          renderCurrentExpenseData({

            resetRenderWindow:
              false

          });


          showToast(
            "Delete failed. Expense restored."
          );


          console.error(
            getErrorMessage(
              error
            )
          );

        }
      );

  }


  /* =========================================
     HELPERS
  ========================================= */

  function moneyToCents(
    value
  ) {

    const amount =
      Number(value);


    if (
      !Number.isFinite(amount)
    ) {

      return 0;

    }


    const parts =
      String(amount)
        .split("e");


    const cents =
      Math.round(
        Number(
          parts[0] +
          "e" +
          (
            Number(parts[1] || 0) +
            2
          )
        )
      );


    return Number.isSafeInteger(cents)
      ? cents
      : 0;

  }


  function centsToMoney(
    cents
  ) {

    return Number.isSafeInteger(cents)
      ? cents / 100
      : 0;

  }


  function normalizeMoney(
    value
  ) {

    return centsToMoney(
      moneyToCents(value)
    );

  }


  function calculateTotal(
    expenses
  ) {

    const totalInCents =
      expenses.reduce(
        function(total, expense) {

          return (
            total +
            moneyToCents(
              expense.cost
            )
          );

        },
        0
      );


    return centsToMoney(
      totalInCents
    );

  }


  function parseDateParts(
    dateString
  ) {

    if (
      !dateString
    ) {

      return null;

    }


    const parts =
      String(
        dateString
      )
        .split("-");


    if (
      parts.length !== 3
    ) {

      return null;

    }


    return {

      year:
        Number(
          parts[0]
        ),

      month:
        Number(
          parts[1]
        ),

      day:
        Number(
          parts[2]
        )

    };

  }


  function parseLocalDate(
    dateString
  ) {

    const parts =
      parseDateParts(
        dateString
      );


    if (
      !parts
    ) {

      return null;

    }


    return new Date(
      parts.year,
      parts.month - 1,
      parts.day
    );

  }


  function startOfDay(
    date
  ) {

    return new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    );

  }


  function compareExpensesNewestFirst(
    a,
    b
  ) {

    return (
      dateToSortNumber(
        b.date
      ) -
      dateToSortNumber(
        a.date
      )
    );

  }


  function dateToSortNumber(
    dateString
  ) {

    const parts =
      parseDateParts(
        dateString
      );


    if (
      !parts
    ) {

      return 0;

    }


    return (
      parts.year *
        10000 +
      parts.month *
        100 +
      parts.day
    );

  }


  function formatDisplayDate(
    dateString
  ) {

    const date =
      parseLocalDate(
        dateString
      );


    if (
      !date
    ) {

      return (
        dateString ||
        ""
      );

    }


    return date
      .toLocaleDateString(
        "en-CA",
        {
          month:
            "short",

          day:
            "numeric",

          year:
            "numeric"
        }
      );

  }


  function formatCurrency(
    value
  ) {

    return new Intl
      .NumberFormat(
        "en-CA",
        {
          style:
            "currency",

          currency:
            "CAD"
        }
      )
      .format(
        Number(
          value ||
          0
        )
      );

  }


  function formatCompactCurrency(
    value
  ) {

    const number =
      Number(
        value ||
        0
      );


    if (
      number >=
      1000000
    ) {

      return (
        "$" +
        (
          number /
          1000000
        )
          .toFixed(1)
          .replace(
            ".0",
            ""
          ) +
        "M"
      );

    }


    if (
      number >=
      1000
    ) {

      return (
        "$" +
        (
          number /
          1000
        )
          .toFixed(1)
          .replace(
            ".0",
            ""
          ) +
        "K"
      );

    }


    return (
      "$" +
      Math.round(
        number
      )
    );

  }


  function getMonthName(
    month
  ) {

    return new Date(
      2026,
      month - 1,
      1
    )
      .toLocaleDateString(
        "en-CA",
        {
          month:
            "long"
        }
      );

  }


  function getMonthShortName(
    month
  ) {

    return new Date(
      2026,
      month - 1,
      1
    )
      .toLocaleDateString(
        "en-CA",
        {
          month:
            "short"
        }
      );

  }


  function getDateRangeLabel(
    state
  ) {

    switch (
      state.dateRange
    ) {

      case "7":
        return "Last 7 days";

      case "30":
        return "Last 30 days";

      case "this_month":
        return "This month";

      case "this_year":
        return "This year";

      case "custom":

        if (
          state.startDate &&
          state.endDate
        ) {

          return (
            formatDisplayDate(
              state.startDate
            ) +
            " – " +
            formatDisplayDate(
              state.endDate
            )
          );

        }


        return "Custom range";

      default:
        return "All spending";

    }

  }


  function getBucketInitial(
    bucket
  ) {

    switch (
      bucket
    ) {

      case "Play":
        return "P";

      case "Necessity":
        return "N";

      case "Small Business":
        return "B";

      case "Education":
        return "E";

      case "Giving":
        return "G";

      default:
        return "$";

    }

  }


  function getPaymentClass(
    method
  ) {

    switch (
      method
    ) {

      case "Cash":
        return "cash";

      case "E-Transfer":
        return "transfer";

      case "Credit Card":
        return "credit";

      default:
        return "";

    }

  }


  function setToday() {

    const now =
      new Date();


    const year =
      now.getFullYear();


    const month =
      String(
        now.getMonth() + 1
      )
        .padStart(
          2,
          "0"
        );


    const day =
      String(
        now.getDate()
      )
        .padStart(
          2,
          "0"
        );


    document
      .getElementById(
        "date"
      )
      .value =
        year +
        "-" +
        month +
        "-" +
        day;

  }


  function escapeHtml(
    value
  ) {

    return String(
      value
    )
      .replace(
        /&/g,
        "&amp;"
      )
      .replace(
        /</g,
        "&lt;"
      )
      .replace(
        />/g,
        "&gt;"
      )
      .replace(
        /"/g,
        "&quot;"
      )
      .replace(
        /'/g,
        "&#039;"
      );

  }


  /* =========================================
     TOAST
  ========================================= */

  function showToast(
    message
  ) {

    const toast =
      document.getElementById(
        "toast"
      );


    toast.textContent =
      message;


    toast
      .classList.remove(
        "hidden"
      );


    if (
      toastTimer
    ) {

      clearTimeout(
        toastTimer
      );

    }


    toastTimer =
      setTimeout(
        function() {

          toast
            .classList.add(
              "hidden"
            );

        },
        2200
      );

  }


  function getErrorMessage(
    error
  ) {

    if (
      error &&
      error.message
    ) {

      return (
        error.message
      );

    }


    return String(
      error ||
      "Unknown error"
    );

  }


  /* =========================================
     START
  ========================================= */

  initializeApp();
