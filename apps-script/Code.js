/* =========================================
   PERSONAL FINANCE WEB APP
   V2 COMPLETE BACKEND
========================================= */


/* =========================================
   SHEET
========================================= */

const SHEET_NAME =
  'Spending_Master2026';


/* =========================================
   BUCKETS / CATEGORIES
========================================= */

const BUCKET_CATEGORIES = {

  'Play': [
    'Fitness',
    'Eating Out',
    'Travel',
    'Entertainment',
    'Amazon',
    'Clothing'
  ],

  'Necessity': [
    'Health',
    'Household',
    'Grocery',
    'Car & Transportation',
    'Personal Care',
    'Taxes'
  ],

  'Small Business': [
    'Subscription',
    'Websites',
    'Marketing',
    'Business',
    'Ai Subscriptions',
    'Travel and Transportation'
  ],

  'Education': [
    'Courses',
    'Tech',
    'Books'
  ],

  'Giving': [
    'Gifts',
    'Charity',
    'Misc'
  ]

};


/* =========================================
   PAYMENT METHODS
========================================= */

const PAYMENT_METHODS = [
  'Cash',
  'E-Transfer',
  'Credit Card',
  'Other'
];


/* =========================================
   V2 BRICK 4
   SERVER CACHE
========================================= */

const EXPENSE_SERVER_CACHE_VERSION =
  1;


const EXPENSE_SERVER_CACHE_KEY =
  'personalFinance.expenses.server.v' +
  EXPENSE_SERVER_CACHE_VERSION;


/*
 * Keep server caching short.
 *
 * Google Sheets remains authoritative.
 */
const EXPENSE_SERVER_CACHE_TTL_SECONDS =
  30;


/*
 * Apps Script CacheService values have
 * size limits.
 *
 * Stay safely below the maximum.
 */
const EXPENSE_SERVER_CACHE_MAX_BYTES =
  95000;


/* =========================================
   WEB APP
========================================= */

function doGet() {

  return HtmlService
    .createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Personal Finance')
    .setFaviconUrl(
      'https://geng-geng8.github.io/personal-finance-assets/finance-icon.png'
    )
    .addMetaTag(
      'viewport',
      'width=device-width, initial-scale=1'
    );

}


/* =========================================
   INCLUDE HTML FILE
========================================= */

function include(filename) {

  return HtmlService
    .createHtmlOutputFromFile(filename)
    .getContent();

}


/* =========================================
   GET EXPENSES
========================================= */

/*
 * forceRefresh:
 *
 * false:
 * Apps Script may use its short server cache.
 *
 * true:
 * Skip the server cache and read directly
 * from Google Sheets.
 *
 * Brick 5 JavaScript uses true for manual
 * refreshes and authoritative syncs.
 */

function getExpenses(forceRefresh) {

  const shouldForceRefresh =
    forceRefresh === true;


  if (!shouldForceRefresh) {

    const cachedExpenses =
      getExpensesFromServerCache_();


    if (
      cachedExpenses !== null
    ) {

      return cachedExpenses;

    }

  }


  const expenses =
    readExpensesFromSheet_();


  saveExpensesToServerCache_(
    expenses
  );


  return expenses;

}


/* =========================================
   READ EXPENSES FROM GOOGLE SHEET
========================================= */

function readExpensesFromSheet_() {

  const sheet =
    getExpenseSheet();


  const lastRow =
    sheet.getLastRow();


  if (
    lastRow < 2
  ) {

    return [];

  }


  /*
   * Read columns A:H in one batch.
   *
   * A = ID
   * B = Date
   * C = Cost
   * D = Buckets
   * E = Category
   * F = Item
   * G = Notes
   * H = Payment Method
   */

  const rows =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        8
      )
      .getValues();


  const timeZone =
    getProductionSpreadsheet_()
      .getSpreadsheetTimeZone();


  return rows

    /*
     * Ignore blank rows.
     */
    .filter(
      row =>
        row[0] !== ''
    )

    /*
     * SAME-DAY SORT FIX
     *
     * New expenses are normally added to
     * lower rows in Google Sheets.
     *
     * Reversing the Sheet order means that
     * when two transactions share the same
     * date, the newest/lower Sheet row wins.
     *
     * JavaScript still handles the main
     * newest-date-first sorting.
     */
    .reverse()

    .map(
      row => ({

        id:
          String(
            row[0] || ''
          ),

        date:
          row[1] instanceof Date
            ? Utilities.formatDate(
                row[1],
                timeZone,
                'yyyy-MM-dd'
              )
            : String(
                row[1] || ''
              ),

        cost:
          Number(
            row[2]
          ) || 0,

        bucket:
          String(
            row[3] || ''
          ),

        category:
          String(
            row[4] || ''
          ).trim(),

        item:
          String(
            row[5] || ''
          ).trim(),

        notes:
          String(
            row[6] || ''
          ).trim(),

        paymentMethod:
          String(
            row[7] || ''
          ).trim()

      })
    );

}


/* =========================================
   SERVER CACHE — READ
========================================= */

function getExpensesFromServerCache_() {

  try {

    const cache =
      CacheService
        .getScriptCache();


    const cachedJson =
      cache.get(
        EXPENSE_SERVER_CACHE_KEY
      );


    if (
      cachedJson === null
    ) {

      return null;

    }


    const parsed =
      JSON.parse(
        cachedJson
      );


    if (
      !Array.isArray(parsed)
    ) {

      cache.remove(
        EXPENSE_SERVER_CACHE_KEY
      );


      return null;

    }


    return parsed;

  } catch (error) {

    /*
     * Cache problems should never prevent
     * Google Sheets from loading.
     */

    clearExpenseServerCache_();


    return null;

  }

}


/* =========================================
   SERVER CACHE — SAVE
========================================= */

function saveExpensesToServerCache_(
  expenses
) {

  try {

    const json =
      JSON.stringify(
        expenses
      );


    /*
     * Check the real UTF-8 payload size.
     */

    const byteCount =
      Utilities
        .newBlob(json)
        .getBytes()
        .length;


    /*
     * If the dataset becomes too large,
     * skip CacheService entirely.
     *
     * The app will simply read Sheets
     * normally.
     */

    if (
      byteCount >
      EXPENSE_SERVER_CACHE_MAX_BYTES
    ) {

      clearExpenseServerCache_();


      return false;

    }


    CacheService
      .getScriptCache()
      .put(
        EXPENSE_SERVER_CACHE_KEY,
        json,
        EXPENSE_SERVER_CACHE_TTL_SECONDS
      );


    return true;

  } catch (error) {

    /*
     * Server caching is optional.
     */

    return false;

  }

}


/* =========================================
   SERVER CACHE — CLEAR
========================================= */

function clearExpenseServerCache_() {

  try {

    CacheService
      .getScriptCache()
      .remove(
        EXPENSE_SERVER_CACHE_KEY
      );


    return true;

  } catch (error) {

    return false;

  }

}


/* =========================================
   ADD EXPENSE
========================================= */

function addExpense(expense) {

  if (!expense) {

    throw new Error(
      'Expense information is missing.'
    );

  }


  validateExpense(
    expense
  );


  const sheet =
    getExpenseSheet();


  const lock =
    LockService
      .getScriptLock();


  lock.waitLock(
    10000
  );


  try {

    const id =
      createUniqueId(
        sheet
      );


    const date =
      parseExpenseDate(
        expense.date
      );


    const cost =
      normalizeMoney_(
        expense.cost
      );


    sheet.appendRow([

      id,

      date,

      cost,

      expense.bucket,

      expense.category,

      String(
        expense.item
      ).trim(),

      expense.notes
        ? String(
            expense.notes
          ).trim()
        : '',

      expense.paymentMethod

    ]);


    /*
     * The Sheet changed.
     * Cached server data is now outdated.
     */

    clearExpenseServerCache_();


    return {

      success: true,

      id: id,

      message:
        'Expense saved.'

    };

  } finally {

    lock.releaseLock();

  }

}


/* =========================================
   UPDATE EXPENSE
========================================= */

function updateExpense(expense) {

  if (
    !expense ||
    !expense.id
  ) {

    throw new Error(
      'Expense ID is missing.'
    );

  }


  validateExpense(
    expense
  );


  const sheet =
    getExpenseSheet();


  const lock =
    LockService
      .getScriptLock();


  lock.waitLock(
    10000
  );


  try {

    const rowNumber =
      findExpenseRowById(
        sheet,
        expense.id
      );


    if (
      !rowNumber
    ) {

      throw new Error(
        'Expense was not found.'
      );

    }


    const date =
      parseExpenseDate(
        expense.date
      );


    const cost =
      normalizeMoney_(
        expense.cost
      );


    /*
     * ID stays in column A.
     *
     * Replace columns B:H.
     */

    sheet
      .getRange(
        rowNumber,
        2,
        1,
        7
      )
      .setValues([[
        date,
        cost,
        expense.bucket,
        expense.category,
        String(
          expense.item
        ).trim(),
        expense.notes
          ? String(
              expense.notes
            ).trim()
          : '',
        expense.paymentMethod
      ]]);


    clearExpenseServerCache_();


    return {

      success: true,

      id:
        expense.id,

      message:
        'Expense updated.'

    };

  } finally {

    lock.releaseLock();

  }

}


/* =========================================
   DELETE EXPENSE
========================================= */

function deleteExpense(id) {

  if (!id) {

    throw new Error(
      'Expense ID is missing.'
    );

  }


  const sheet =
    getExpenseSheet();


  const lock =
    LockService
      .getScriptLock();


  lock.waitLock(
    10000
  );


  try {

    const rowNumber =
      findExpenseRowById(
        sheet,
        id
      );


    if (
      !rowNumber
    ) {

      throw new Error(
        'Expense was not found.'
      );

    }


    sheet.deleteRow(
      rowNumber
    );


    clearExpenseServerCache_();


    return {

      success: true,

      id: id,

      message:
        'Expense deleted.'

    };

  } finally {

    lock.releaseLock();

  }

}


/* =========================================
   FIND EXPENSE ROW BY ID
========================================= */

function findExpenseRowById(
  sheet,
  id
) {

  const lastRow =
    sheet.getLastRow();


  if (
    lastRow < 2
  ) {

    return null;

  }


  const ids =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        1
      )
      .getValues()
      .flat();


  const targetId =
    String(id);


  for (
    let i = 0;
    i < ids.length;
    i++
  ) {

    if (
      String(
        ids[i]
      ) === targetId
    ) {

      return i + 2;

    }

  }


  return null;

}


/* =========================================
   VALIDATE EXPENSE
========================================= */

function validateExpense(expense) {

  if (
    !expense.date
  ) {

    throw new Error(
      'Date is required.'
    );

  }


  const costInCents =
    moneyToCents_(
      expense.cost
    );


  if (
    !Number.isSafeInteger(
      costInCents
    ) ||
    costInCents <= 0
  ) {

    throw new Error(
      'Enter a valid cost.'
    );

  }


  if (
    !BUCKET_CATEGORIES[
      expense.bucket
    ]
  ) {

    throw new Error(
      'Select a valid bucket.'
    );

  }


  if (
    !BUCKET_CATEGORIES[
      expense.bucket
    ].includes(
      expense.category
    )
  ) {

    throw new Error(
      'The selected category does not belong to this bucket.'
    );

  }


  if (
    !PAYMENT_METHODS.includes(
      expense.paymentMethod
    )
  ) {

    throw new Error(
      'Select a valid payment method.'
    );

  }


  if (
    !expense.item ||
    !String(
      expense.item
    ).trim()
  ) {

    throw new Error(
      'Item is required.'
    );

  }

}


/* =========================================
   MONEY NORMALIZATION
========================================= */

function moneyToCents_(value) {

  const amount =
    Number(value);


  if (
    !Number.isFinite(amount)
  ) {

    return NaN;

  }


  const parts =
    String(amount)
      .split('e');


  const cents =
    Math.round(
      Number(
        parts[0] +
        'e' +
        (
          Number(parts[1] || 0) +
          2
        )
      )
    );


  return Number.isSafeInteger(cents)
    ? cents
    : NaN;

}


function normalizeMoney_(value) {

  const cents =
    moneyToCents_(value);


  return Number.isSafeInteger(cents)
    ? cents / 100
    : NaN;

}


/* =========================================
   PARSE EXPENSE DATE
========================================= */

function parseExpenseDate(
  dateString
) {

  const parts =
    String(
      dateString
    ).split('-');


  if (
    parts.length !== 3
  ) {

    throw new Error(
      'Invalid date.'
    );

  }


  const year =
    Number(
      parts[0]
    );


  const month =
    Number(
      parts[1]
    );


  const day =
    Number(
      parts[2]
    );


  if (
    !year ||
    !month ||
    !day
  ) {

    throw new Error(
      'Invalid date.'
    );

  }


  /*
   * Noon avoids timezone/date-shift problems.
   */

  const date =
    new Date(
      year,
      month - 1,
      day,
      12,
      0,
      0
    );


  if (
    isNaN(
      date.getTime()
    ) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {

    throw new Error(
      'Invalid date.'
    );

  }


  return date;

}


/* =========================================
   CREATE UNIQUE ID
========================================= */

function createUniqueId(
  sheet
) {

  const lastRow =
    sheet.getLastRow();


  let existingIds =
    new Set();


  if (
    lastRow >= 2
  ) {

    existingIds =
      new Set(
        sheet
          .getRange(
            2,
            1,
            lastRow - 1,
            1
          )
          .getValues()
          .flat()
          .map(
            value =>
              String(value)
          )
      );

  }


  let id;


  do {

    id =
      Utilities
        .getUuid()
        .replace(
          /-/g,
          ''
        )
        .substring(
          0,
          8
        );

  } while (
    existingIds.has(id)
  );


  return id;

}


/* =========================================
   GET EXPENSE SHEET
========================================= */

function getProductionSpreadsheet_() {
  const spreadsheetId = PropertiesService
    .getScriptProperties()
    .getProperty("PRODUCTION_SPREADSHEET_ID");

  if (!spreadsheetId) {
    throw new Error("PRODUCTION_SPREADSHEET_ID is not configured.");
  }

  return SpreadsheetApp.openById(spreadsheetId);
}

function getExpenseSheet() {

  const sheet =
    getProductionSpreadsheet_()
      .getSheetByName(
        SHEET_NAME
      );


  if (!sheet) {

    throw new Error(
      'Spending_Master2026 was not found.'
    );

  }


  return sheet;

}

const WEALTH_SHEET_NAME = "2026-Budgets";

function getWealthSheet_() {
  const sheet = getProductionSpreadsheet_().getSheetByName(WEALTH_SHEET_NAME);
  if (!sheet) {
    throw new Error(WEALTH_SHEET_NAME + " was not found.");
  }
  return sheet;
}

function parseSheetNumber_(val) {
  if (typeof val === "number") {
    return isNaN(val) ? 0 : val;
  }
  if (!val) return 0;
  const cleaned = String(val).replace(/[^0-9.-]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function getWealth() {
  const sheet = getWealthSheet_();

  // Read H14:P14 (Row 14, Cols H to P)
  // H14 = Available Cash
  // I14 = Total TFSA
  // J14 = Total FHSA
  // K14 = Total RRSP
  // L14 = Total Crypto
  // M14 = Total Invested
  // N14 = Tax Reserve
  // O14 = Income Tax / CPP Reserve
  // P14 = Emergency Fund
  const row14 = sheet.getRange("H14:P14").getValues()[0] || [];

  // Read I29 = Total Cash
  const totalCashVal = sheet.getRange("I29").getValue();

  // Read H17:I28 = Account names and balances
  const accountRows = sheet.getRange("H17:I28").getValues() || [];

  const accounts = accountRows
    .map(function(row) {
      const name = String(row[0] || "").trim();
      if (!name) return null;
      const balance = parseSheetNumber_(row[1]);
      const lower = name.toLowerCase();
      const isCash = lower.includes("cash") ||
                     lower.includes("cheq") ||
                     lower.includes("check") ||
                     lower.includes("saving") ||
                     lower.includes("hisa") ||
                     lower.includes("deposit") ||
                     lower.includes("bank");
      return {
        name: name,
        balance: balance,
        type: isCash ? "cash" : "investment"
      };
    })
    .filter(Boolean);

  return {
    availableCash: parseSheetNumber_(row14[0]),
    tfsa: parseSheetNumber_(row14[1]),
    fhsa: parseSheetNumber_(row14[2]),
    rrsp: parseSheetNumber_(row14[3]),
    crypto: parseSheetNumber_(row14[4]),
    totalInvested: parseSheetNumber_(row14[5]),
    taxReserve: parseSheetNumber_(row14[6]),
    incomeTaxCppReserve: parseSheetNumber_(row14[7]),
    emergencyFund: parseSheetNumber_(row14[8]),
    totalCash: parseSheetNumber_(totalCashVal),
    accounts: accounts,
    updatedAt: new Date().toISOString()
  };
}

/* =========================================
   AUTHENTICATED API ENTRY POINT (STAGE 3)
========================================= */

function apiRequest(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw new Error("Request must be an object.");
  }

  const action = String(request.action || "");
  const payload = request.payload == null ? {} : request.payload;

  switch (action) {
    case "getExpenses":
      return {
        ok: true,
        expenses: getExpenses(Boolean(payload && payload.forceRefresh))
      };

    case "getWealth":
      return {
        ok: true,
        wealth: getWealth()
      };

    case "addExpense":
      return {
        ok: true,
        result: addExpense(payload)
      };

    case "updateExpense":
      return {
        ok: true,
        result: updateExpense(payload)
      };

    case "deleteExpense":
      const id = typeof payload === "object" && payload !== null ? payload.id : payload;
      return {
        ok: true,
        result: deleteExpense(id)
      };

    default:
      throw new Error("Unsupported API action: " + action);
  }
}

/* =========================================
   STAGE 4B DEVICE-KEY WEB APP ENTRY POINT
========================================= */

function doPost(e) {
  try {
    const raw = (e && e.postData && e.postData.contents) ? e.postData.contents : "";
    if (!raw) {
      return jsonResponse_({ ok: false, error: "Empty request body" });
    }

    let body;
    try {
      body = JSON.parse(raw);
    } catch (parseErr) {
      return jsonResponse_({ ok: false, error: "Invalid JSON body" });
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonResponse_({ ok: false, error: "Request body must be an object" });
    }

    const suppliedKey = String(body.deviceKey || "").trim();
    if (!suppliedKey || suppliedKey.length !== 64) {
      return jsonResponse_({ ok: false, error: "Unauthorized" });
    }

    const configuredKey = PropertiesService.getScriptProperties().getProperty("PERSONAL_APP_DEVICE_KEY");
    if (!configuredKey || typeof configuredKey !== "string" || configuredKey.trim().length !== 64) {
      return jsonResponse_({ ok: false, error: "Server device key is not configured" });
    }

    if (suppliedKey.toLowerCase() !== configuredKey.trim().toLowerCase()) {
      return jsonResponse_({ ok: false, error: "Unauthorized" });
    }

    const action = String(body.action || "");
    const payload = body.payload == null ? {} : body.payload;

    const result = apiRequest({ action, payload });
    return jsonResponse_(result);
  } catch (err) {
    return jsonResponse_({
      ok: false,
      error: err && err.message ? err.message : "Request failed"
    });
  }
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
