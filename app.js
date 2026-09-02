
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
     LOCAL CACHE
  ========================================= */

  const EXPENSE_CACHE_VERSION = 1;


  const EXPENSE_CACHE_KEY =
    "personalFinance.expenses.v" +
    EXPENSE_CACHE_VERSION;


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

  function startAuthorizedSession() {
    if (appSessionStarted) {
      loadExpenses({
        showLoading: false,
        forceServerRefresh: true
      });
      return;
    }

    appSessionStarted = true;
    startExpenseSyncTimer();
    restoreExpensesFromCache();
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

    try {
      window.localStorage.removeItem(EXPENSE_CACHE_KEY);
    } catch (e) {}
  }

  function setupAuthGate() {
    const authGate = document.getElementById("authGate");
    const authLoadingState = document.getElementById("authLoadingState");
    const authActionState = document.getElementById("authActionState");
    const authAuthorizeButton = document.getElementById("authAuthorizeButton");
    const authStatus = document.getElementById("authStatus");
    const signOutButtons = document.querySelectorAll(".sign-out-button");

    function showLoading() {
      if (authLoadingState) authLoadingState.classList.remove("hidden");
      if (authActionState) authActionState.classList.add("hidden");
    }

    function showAction(statusText, state) {
      if (authLoadingState) authLoadingState.classList.add("hidden");
      if (authActionState) authActionState.classList.remove("hidden");
      if (authStatus) {
        authStatus.textContent = statusText;
        authStatus.dataset.state = state || "waiting";
      }
    }

    function updateAuthUI(isAuth) {
      if (isAuth) {
        if (authGate) {
          authGate.classList.add("hidden");
        }
        startAuthorizedSession();
      } else {
        if (authGate) {
          authGate.classList.remove("hidden");
        }
        const explicitlySignedOut = typeof financeApi.hasExplicitlySignedOut === "function" && financeApi.hasExplicitlySignedOut();
        if (explicitlySignedOut) {
          showAction("Signed out. Click Continue with Google to sign in again.", "waiting");
        } else {
          showAction("Sign in with your authorized Google account to access your finances.", "waiting");
        }
        clearAuthorizedSession();
      }
    }

    if (authAuthorizeButton) {
      authAuthorizeButton.addEventListener("click", async function() {
        showAction("Authorizing with Google...", "waiting");
        try {
          await financeApi.authorize();
        } catch (err) {
          showAction(
            err && err.message ? err.message : "Authorization failed.",
            "error"
          );
        }
      });
    }

    signOutButtons.forEach(function(btn) {
      btn.addEventListener("click", function() {
        financeApi.signOut();
        showToast("Signed out. Session data cleared.");
      });
    });

    financeApi.onAuthStateChanged(updateAuthUI);

    if (financeApi.isAuthorized()) {
      updateAuthUI(true);
    } else if (typeof financeApi.hasExplicitlySignedOut === "function" && financeApi.hasExplicitlySignedOut()) {
      updateAuthUI(false);
    } else {
      showLoading();
      if (typeof financeApi.trySilentAuthorize === "function") {
        financeApi.trySilentAuthorize()
          .then(function() {
            updateAuthUI(true);
          })
          .catch(function() {
            updateAuthUI(false);
          });
      } else {
        updateAuthUI(false);
      }
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

      const raw =
        window.localStorage.getItem(
          EXPENSE_CACHE_KEY
        );


      if (!raw) {

        return false;

      }


      const cached =
        JSON.parse(raw);


      if (
        !cached ||
        cached.version !==
          EXPENSE_CACHE_VERSION ||
        !Array.isArray(
          cached.expenses
        )
      ) {

        removeExpenseCache();

        return false;

      }


      currentExpenses =
        cached.expenses;


      lastSuccessfulSyncAt =
        typeof cached.lastSync ===
          "string"
          ? cached.lastSync
          : null;


      renderCurrentExpenseData({

        resetRenderWindow:
          true

      });


      loadingState.classList.add(
        "hidden"
      );


      return true;

    } catch (error) {

      return false;

    }

  }


  function saveExpensesToCache(
    expenses,
    syncTimestamp
  ) {

    try {

      const payload = {

        version:
          EXPENSE_CACHE_VERSION,

        lastSync:
          syncTimestamp,

        expenses:
          expenses

      };


      window.localStorage.setItem(
        EXPENSE_CACHE_KEY,
        JSON.stringify(payload)
      );

    } catch (error) {

      /*
       * Cache failure must never stop
       * the application.
       */

    }

  }


  function saveCurrentExpensesToCache() {

    lastSuccessfulSyncAt =
      new Date().toISOString();


    saveExpensesToCache(
      currentExpenses,
      lastSuccessfulSyncAt
    );

  }


  function removeExpenseCache() {

    try {

      window.localStorage.removeItem(
        EXPENSE_CACHE_KEY
      );

    } catch (error) {

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


    applyInsightFilters();


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
            hasRenderedExpenseData
          ) {

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


    document
      .getElementById(
        "resetInsightFiltersButton"
      )
      .addEventListener(
        "click",
        resetInsightFilters
      );

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


  function createExpenseCard(
    expense
  ) {

    const card =
      document.createElement(
        "article"
      );


    card.className =
      "expense-card";


    const main =
      document.createElement(
        "div"
      );


    main.className =
      "expense-card-main";


    const left =
      document.createElement(
        "div"
      );


    left.className =
      "expense-left";


    const icon =
      document.createElement(
        "div"
      );


    icon.className =
      "expense-icon";


    icon.textContent =
      getBucketInitial(
        expense.bucket
      );


    const copy =
      document.createElement(
        "div"
      );


    copy.className =
      "expense-copy";


    const title =
      document.createElement(
        "div"
      );


    title.className =
      "expense-title";


    title.textContent =
      expense.item ||
      "Untitled Expense";


    const meta =
      document.createElement(
        "div"
      );


    meta.className =
      "expense-meta";


    meta.textContent =
      [
        expense.bucket,
        expense.category
      ]
        .filter(Boolean)
        .join(" · ");


    copy.appendChild(title);

    copy.appendChild(meta);

    left.appendChild(icon);

    left.appendChild(copy);


    const right =
      document.createElement(
        "div"
      );


    right.className =
      "expense-right";


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


    const date =
      document.createElement(
        "div"
      );


    date.className =
      "expense-date";


    date.textContent =
      formatDisplayDate(
        expense.date
      );


    right.appendChild(amount);

    right.appendChild(date);

    main.appendChild(left);

    main.appendChild(right);


    const footer =
      document.createElement(
        "div"
      );


    footer.className =
      "expense-footer";


    const payment =
      document.createElement(
        "span"
      );


    payment.className =
      "payment-pill " +
      getPaymentClass(
        expense.paymentMethod
      );


    payment.textContent =
      expense.paymentMethod ||
      "Not set";


    const actions =
      document.createElement(
        "div"
      );


    actions.className =
      "card-actions";


    const editButton =
      createIconButton(
        "edit"
      );


    editButton.addEventListener(
      "click",
      function() {

        openEditExpense(
          expense.id
        );

      }
    );


    const deleteButton =
      createIconButton(
        "delete"
      );


    deleteButton.addEventListener(
      "click",
      function() {

        confirmAndDeleteExpense(
          expense.id,
          expense.item
        );

      }
    );


    actions.appendChild(
      editButton
    );


    actions.appendChild(
      deleteButton
    );


    footer.appendChild(
      payment
    );


    footer.appendChild(
      actions
    );


    card.appendChild(main);

    card.appendChild(footer);


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


    applyInsightFilters();

  }


  function updateInsightPeriodLabel() {

    let label =
      "All spending";


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

    } else if (
      insightFilters.year
    ) {

      label =
        insightFilters.year;

    } else if (
      insightFilters.dateRange !==
      "all"
    ) {

      label =
        getDateRangeLabel(
          insightFilters
        );

    }


    document
      .getElementById(
        "insightPeriodLabel"
      )
      .textContent =
        label;

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


    renderDonutChart(
      "categoryDonut",
      "categoryLegend",
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

    const height = 230;

    const left = 48;

    const right = 16;

    const top = 18;

    const bottom = 42;


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
            y="${height - 12}"
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


          button.className =
            "choice-button";


          button.textContent =
            name;


          if (
            name === selectedBucket
          ) {

            button.classList.add(
              "selected"
            );

          }


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


    categories.forEach(
      function(name) {

        const button =
          document.createElement(
            "button"
          );


        button.type =
          "button";


        button.className =
          "choice-button";


        button.textContent =
          name;


        if (
          name ===
          selectedCategory
        ) {

          button.classList.add(
            "selected"
          );

        }


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


        button.className =
          "payment-button";


        button.textContent =
          method;


        if (
          method ===
          selectedPaymentMethod
        ) {

          button.classList.add(
            "selected"
          );

        }


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
