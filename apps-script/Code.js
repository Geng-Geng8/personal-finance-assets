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

function doGet(e) {
  if (e && e.parameter && (e.parameter.action || e.parameter.function)) {
    return jsonResponse_({
      ok: false,
      error: "Unauthorized"
    });
  }

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

var EXPECTED_FHSA_FORMULA = "=I20";
var EXPECTED_RRSP_FORMULA = "=I22";
var EXPECTED_TFSA_USD_FORMULA = '=J21*GOOGLEFINANCE("CURRENCY:USDCAD")';

var WEALTH_EDITABLE_WHITELIST = Object.freeze({
  eq_tfsa: {
    id: "eq_tfsa",
    expectedName: "EQ-TFSA",
    nameCell: "H17",
    balanceCell: "I17",
    displayBalanceCell: "I17",
    writeCell: "I17",
    editCurrency: "CAD"
  },
  wealthsimple_tfsa: {
    id: "wealthsimple_tfsa",
    expectedName: "WEALTHSIMPLE- TFSA",
    nameCell: "H18",
    balanceCell: "I18",
    displayBalanceCell: "I18",
    writeCell: "I18",
    editCurrency: "CAD"
  },
  national_bank_tfsa: {
    id: "national_bank_tfsa",
    expectedName: "National Bank TFSA",
    nameCell: "H19",
    balanceCell: "I19",
    displayBalanceCell: "I19",
    writeCell: "I19",
    editCurrency: "CAD"
  },
  national_bank_fhsa: {
    id: "national_bank_fhsa",
    expectedName: "National Bank FHSA",
    nameCell: "H20",
    balanceCell: "I20",
    displayBalanceCell: "I20",
    writeCell: "I20",
    requiredFormulaCell: "J14",
    expectedFormula: EXPECTED_FHSA_FORMULA,
    editCurrency: "CAD"
  },
  national_bank_tfsa_usd: {
    id: "national_bank_tfsa_usd",
    expectedName: "National Bank TFSA-USD",
    nameCell: "H21",
    balanceCell: "I21",
    displayBalanceCell: "I21",
    writeCell: "J21",
    requiredFormulaCell: "I21",
    expectedFormula: EXPECTED_TFSA_USD_FORMULA,
    editCurrency: "USD"
  },
  national_bank_rrsp: {
    id: "national_bank_rrsp",
    expectedName: "National Bank RRSP",
    nameCell: "H22",
    balanceCell: "I22",
    displayBalanceCell: "I22",
    writeCell: "I22",
    requiredFormulaCell: "K14",
    expectedFormula: EXPECTED_RRSP_FORMULA,
    editCurrency: "CAD"
  },
  simplii_chequing: {
    id: "simplii_chequing",
    expectedName: "Simplii - Che",
    nameCell: "H23",
    balanceCell: "I23",
    displayBalanceCell: "I23",
    writeCell: "I23",
    editCurrency: "CAD"
  },
  simplii_savings: {
    id: "simplii_savings",
    expectedName: "Simplii - Sav",
    nameCell: "H24",
    balanceCell: "I24",
    displayBalanceCell: "I24",
    writeCell: "I24",
    editCurrency: "CAD"
  },
  eq_savings: {
    id: "eq_savings",
    expectedName: "EQ - Sav",
    nameCell: "H25",
    balanceCell: "I25",
    displayBalanceCell: "I25",
    writeCell: "I25",
    editCurrency: "CAD"
  },
  eq_bank_card: {
    id: "eq_bank_card",
    expectedName: "EQ Bank Card",
    nameCell: "H26",
    balanceCell: "I26",
    displayBalanceCell: "I26",
    writeCell: "I26",
    editCurrency: "CAD"
  },
  eq_geng_cash: {
    id: "eq_geng_cash",
    expectedName: "EQ - Geng-Cash",
    nameCell: "H27",
    balanceCell: "I27",
    displayBalanceCell: "I27",
    writeCell: "I27",
    editCurrency: "CAD"
  },
  td_savings: {
    id: "td_savings",
    expectedName: "TD - Sav",
    nameCell: "H28",
    balanceCell: "I28",
    displayBalanceCell: "I28",
    writeCell: "I28",
    editCurrency: "CAD"
  }
});

var WEALTH_RESERVE_EDITABLE_WHITELIST = Object.freeze({
  tax_reserve_2026_09: {
    id: "tax_reserve_2026_09",
    name: "Tax Reserve",
    sourceCell: "N10",
    summaryCell: "N14",
    expectedSummaryFormula: "=SUM(N2:N13)",
    allowedOperations: Object.freeze(["add", "pay", "replace"])
  },
  income_tax_cpp_reserve_2026_09: {
    id: "income_tax_cpp_reserve_2026_09",
    name: "Income Tax / CPP",
    sourceCell: "O10",
    summaryCell: "O14",
    expectedSummaryFormula: "=SUM(O2:O13)",
    allowedOperations: Object.freeze(["add", "pay", "replace"])
  },
  emergency_fund: {
    id: "emergency_fund",
    name: "Emergency Fund",
    sourceCell: "P14",
    summaryCell: null,
    expectedSummaryFormula: null,
    allowedOperations: Object.freeze(["replace"])
  }
});

var WEALTH_RESERVE_PERIOD = Object.freeze({
  id: "2026-09",
  label: "September 2026"
});

var EXPECTED_AVAILABLE_CASH_FORMULA = "=I29-P14-N14-O14";
var WEALTH_MAX_MONEY_CENTS = 100000000000;

function normalizeWealthFormula_(formula) {
  return String(formula || "").replace(/\s+/g, "").toUpperCase();
}

function hasApprovedWealthFormula_(range, expectedFormula) {
  return normalizeWealthFormula_(range.getFormula()) === normalizeWealthFormula_(expectedFormula);
}

function parseMoneyCents_(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    throw new Error(fieldName + " is required.");
  }

  let num;
  if (typeof value === "number") {
    num = value;
  } else if (typeof value === "string") {
    const cleaned = value.replace(/[\$,\s]/g, "");
    if (!/^[+-]?(?:\d+|\d*\.\d{1,2})$/.test(cleaned)) {
      throw new Error(fieldName + " must be a finite money value with at most 2 decimal places.");
    }
    num = Number(cleaned);
  } else {
    throw new Error(fieldName + " must be a finite money value.");
  }

  if (!Number.isFinite(num) || Number.isNaN(num)) {
    throw new Error(fieldName + " must be a finite money value.");
  }
  if (Math.abs(num * 100 - Math.round(num * 100)) > 1e-6) {
    throw new Error(fieldName + " cannot have more than 2 decimal places.");
  }

  const cents = Math.round(num * 100);
  if (Math.abs(cents) > WEALTH_MAX_MONEY_CENTS) {
    throw new Error(fieldName + " exceeds the maximum allowed limit.");
  }
  return cents;
}

function readSheetMoneyCents_(range, allowBlank) {
  const value = range.getValue();
  if (allowBlank && (value === "" || value === null)) return 0;
  if (typeof value !== "number" || !Number.isFinite(value) || Number.isNaN(value)) {
    throw new Error("Reserve data is not a valid numeric value. Nothing was updated.");
  }
  return Math.round(value * 100);
}

function getReserveManagement_(sheet) {
  const availableCashFormulaIsValid = hasApprovedWealthFormula_(
    sheet.getRange("H14"),
    EXPECTED_AVAILABLE_CASH_FORMULA
  );

  function reserveMetadata(id) {
    const target = WEALTH_RESERVE_EDITABLE_WHITELIST[id];
    const sourceRange = sheet.getRange(target.sourceCell);
    const sourceIsManual = !String(sourceRange.getFormula() || "").trim();
    const summaryIsValid = !target.summaryCell || hasApprovedWealthFormula_(
      sheet.getRange(target.summaryCell),
      target.expectedSummaryFormula
    );

    return {
      reserveId: target.id,
      name: target.name,
      currentValue: parseSheetNumber_(sourceRange.getValue()),
      allowedOperations: target.allowedOperations.slice(),
      isEditable: sourceIsManual && summaryIsValid && availableCashFormulaIsValid
    };
  }

  return {
    periodId: WEALTH_RESERVE_PERIOD.id,
    periodLabel: WEALTH_RESERVE_PERIOD.label,
    reserves: [
      reserveMetadata("tax_reserve_2026_09"),
      reserveMetadata("income_tax_cpp_reserve_2026_09"),
      reserveMetadata("emergency_fund")
    ]
  };
}

function toAccountId_(name) {
  const map = {
    "EQ-TFSA": "eq_tfsa",
    "WEALTHSIMPLE- TFSA": "wealthsimple_tfsa",
    "National Bank TFSA": "national_bank_tfsa",
    "National Bank FHSA": "national_bank_fhsa",
    "National Bank FHSA ": "national_bank_fhsa",
    "National Bank TFSA-USD": "national_bank_tfsa_usd",
    "National Bank RRSP": "national_bank_rrsp",
    "Simplii - Che": "simplii_chequing",
    "Simplii - Sav": "simplii_savings",
    "EQ - Sav": "eq_savings",
    "EQ Bank Card": "eq_bank_card",
    "EQ - Geng-Cash": "eq_geng_cash",
    "TD - Sav": "td_savings"
  };
  const trimmed = String(name || "").trim();
  if (map[trimmed]) return map[trimmed];
  if (map[name]) return map[name];
  return trimmed
    .replace(/[^a-zA-Z0-9]/g, "_")
    .toLowerCase()
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
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
  const accountFormulas = sheet.getRange("H17:I28").getFormulas() || [];

  const accounts = accountRows
    .map(function(row, idx) {
      const rowNumber = 17 + idx;
      const currentNameCell = "H" + rowNumber;
      const currentBalanceCell = "I" + rowNumber;
      const rawName = String(row[0] || "");
      const trimmedName = rawName.trim();
      if (!trimmedName) return null;
      const balance = parseSheetNumber_(row[1]);
      const lower = trimmedName.toLowerCase();
      const isInvestment = lower.includes("tfsa") ||
                           lower.includes("fhsa") ||
                           lower.includes("rrsp") ||
                           lower.includes("invest") ||
                           lower.includes("crypto") ||
                           lower.includes("stock") ||
                           lower.includes("brokerage");
      const id = toAccountId_(trimmedName);
      const formula = String((accountFormulas[idx] && accountFormulas[idx][1]) || "").trim();
      const hasFormula = formula.length > 0 && formula.startsWith("=");

      const whitelistEntry = WEALTH_EDITABLE_WHITELIST[id];
      let isEditable = false;
      let editValue = balance;
      let editCurrency = "CAD";

      if (whitelistEntry &&
          currentNameCell === whitelistEntry.nameCell &&
          currentBalanceCell === (whitelistEntry.displayBalanceCell || whitelistEntry.balanceCell) &&
          trimmedName === whitelistEntry.expectedName) {

        editCurrency = whitelistEntry.editCurrency || "CAD";

        const requiredFormulaValid = !whitelistEntry.requiredFormulaCell ||
          hasApprovedWealthFormula_(
            sheet.getRange(whitelistEntry.requiredFormulaCell),
            whitelistEntry.expectedFormula
          );

        const writeCell = whitelistEntry.writeCell || whitelistEntry.balanceCell;
        let writeCellHasFormula = false;
        if (writeCell === currentBalanceCell) {
          writeCellHasFormula = hasFormula;
          editValue = balance;
        } else {
          const writeRange = sheet.getRange(writeCell);
          writeCellHasFormula = Boolean(String(writeRange.getFormula() || "").trim());
          editValue = parseSheetNumber_(writeRange.getValue());
        }

        isEditable = requiredFormulaValid && !writeCellHasFormula;
      }

      return {
        id: id,
        name: trimmedName,
        balance: balance,
        type: isInvestment ? "investment" : "cash",
        isEditable: isEditable,
        isFormula: hasFormula,
        editValue: editValue,
        editCurrency: editCurrency
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
    reserveManagement: getReserveManagement_(sheet),
    updatedAt: new Date().toISOString()
  };
}

function updateWealthReserve(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Payload must be an object.");
  }

  const allowedPayloadFields = Object.freeze({
    reserveId: true,
    operation: true,
    amount: true
  });
  const unexpectedField = Object.keys(payload).find(function(key) {
    return !allowedPayloadFields[key];
  });
  if (unexpectedField) {
    throw new Error("Arbitrary sheet or cell coordinates are not permitted.");
  }

  const reserveId = String(payload.reserveId || "").trim();
  if (!reserveId || !WEALTH_RESERVE_EDITABLE_WHITELIST.hasOwnProperty(reserveId)) {
    throw new Error("Invalid or non-editable reserve.");
  }

  const target = WEALTH_RESERVE_EDITABLE_WHITELIST[reserveId];
  const operation = String(payload.operation || "").trim().toLowerCase();
  if (target.allowedOperations.indexOf(operation) === -1) {
    throw new Error("Invalid operation for this reserve.");
  }

  const amountCents = parseMoneyCents_(payload.amount, "Amount");
  if ((operation === "add" || operation === "pay") && amountCents <= 0) {
    throw new Error("Add and pay amounts must be positive.");
  }
  if (reserveId === "emergency_fund" && amountCents < 0) {
    throw new Error("Emergency Fund cannot be negative.");
  }

  const lock = LockService.getScriptLock();
  const hasLock = lock.tryLock(30000);
  if (!hasLock) {
    throw new Error("Server is busy. Please try again.");
  }

  try {
    const sheet = getWealthSheet_();
    const sourceRange = sheet.getRange(target.sourceCell);

    if (String(sourceRange.getFormula() || "").trim()) {
      throw new Error("This reserve source is calculated automatically and cannot be edited.");
    }

    if (!hasApprovedWealthFormula_(sheet.getRange("H14"), EXPECTED_AVAILABLE_CASH_FORMULA)) {
      throw new Error("Available Cash formula changed. Reserve was not updated.");
    }

    let currentSummaryCents = null;
    let summaryRange = null;
    if (target.summaryCell) {
      summaryRange = sheet.getRange(target.summaryCell);
      if (!hasApprovedWealthFormula_(summaryRange, target.expectedSummaryFormula)) {
        throw new Error("Reserve summary formula changed. Reserve was not updated.");
      }
      currentSummaryCents = readSheetMoneyCents_(summaryRange, false);
    }

    const currentSourceCents = readSheetMoneyCents_(sourceRange, true);
    let proposedSourceCents;
    if (operation === "add") {
      proposedSourceCents = currentSourceCents + amountCents;
    } else if (operation === "pay") {
      proposedSourceCents = currentSourceCents - amountCents;
    } else {
      proposedSourceCents = amountCents;
    }

    if (Math.abs(proposedSourceCents) > WEALTH_MAX_MONEY_CENTS) {
      throw new Error("Resulting reserve movement exceeds the maximum allowed limit.");
    }

    if (target.summaryCell) {
      const projectedSummaryCents = currentSummaryCents - currentSourceCents + proposedSourceCents;
      if (projectedSummaryCents < 0) {
        throw new Error("This operation would make the authoritative reserve total negative.");
      }
      if (projectedSummaryCents > WEALTH_MAX_MONEY_CENTS) {
        throw new Error("Resulting reserve total exceeds the maximum allowed limit.");
      }
    } else if (proposedSourceCents < 0) {
      throw new Error("Emergency Fund cannot be negative.");
    }

    // Recheck the approved topology immediately before the financial write.
    if (String(sourceRange.getFormula() || "").trim()) {
      throw new Error("This reserve source is calculated automatically and cannot be edited.");
    }
    if (!hasApprovedWealthFormula_(sheet.getRange("H14"), EXPECTED_AVAILABLE_CASH_FORMULA)) {
      throw new Error("Available Cash formula changed. Reserve was not updated.");
    }
    if (summaryRange && !hasApprovedWealthFormula_(summaryRange, target.expectedSummaryFormula)) {
      throw new Error("Reserve summary formula changed. Reserve was not updated.");
    }

    sourceRange.setValue(proposedSourceCents / 100);
    SpreadsheetApp.flush();

    return {
      ok: true,
      wealth: getWealth()
    };
  } finally {
    lock.releaseLock();
  }
}

function updateWealthAccountBalance(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Payload must be an object.");
  }

  if (
    payload.sheet !== undefined ||
    payload.spreadsheetId !== undefined ||
    payload.range !== undefined ||
    payload.cell !== undefined ||
    payload.row !== undefined ||
    payload.formula !== undefined
  ) {
    throw new Error("Arbitrary sheet or cell coordinates are not permitted.");
  }

  const accountId = String(payload.accountId || "").trim();
  if (!accountId || !WEALTH_EDITABLE_WHITELIST.hasOwnProperty(accountId)) {
    throw new Error("Invalid or non-editable account.");
  }

  const target = WEALTH_EDITABLE_WHITELIST[accountId];

  if (payload.balance === undefined || payload.balance === null || payload.balance === "") {
    throw new Error("Balance is required.");
  }

  let num;
  if (typeof payload.balance === "number") {
    num = payload.balance;
  } else if (typeof payload.balance === "string") {
    const cleaned = payload.balance.replace(/[\$,\s]/g, "");
    if (!cleaned || isNaN(cleaned)) {
      throw new Error("Invalid balance: must be a finite number.");
    }
    const decIndex = cleaned.indexOf(".");
    if (decIndex !== -1 && (cleaned.length - decIndex - 1) > 2) {
      throw new Error("Balance cannot have more than 2 decimal places.");
    }
    num = parseFloat(cleaned);
  } else {
    throw new Error("Invalid balance format.");
  }

  if (!Number.isFinite(num) || Number.isNaN(num)) {
    throw new Error("Invalid balance: must be a finite number.");
  }
  if (num < 0) {
    throw new Error("Asset balance cannot be negative.");
  }
  if (num > 1000000000) {
    throw new Error("Balance exceeds maximum allowed limit.");
  }

  if (Math.abs(num * 100 - Math.round(num * 100)) > 1e-6) {
    throw new Error("Balance cannot have more than 2 decimal places.");
  }

  const normalizedBalance = Math.round(num * 100) / 100;

  const lock = LockService.getScriptLock();
  const hasLock = lock.tryLock(30000);
  if (!hasLock) {
    throw new Error("Server is busy. Please try again.");
  }

  try {
    const sheet = getWealthSheet_();

    // Identity check: verify the live Sheet account name matches the whitelist expected name at target nameCell
    const liveNameVal = sheet.getRange(target.nameCell).getValue();
    const liveName = String(liveNameVal || "").trim();
    if (liveName !== target.expectedName) {
      throw new Error("Account mapping changed. Balance was not updated.");
    }

    // Required formula check (if defined for this account, e.g. J14 for FHSA, K14 for RRSP, I21 for TFSA-USD)
    if (target.requiredFormulaCell && target.expectedFormula) {
      const reqRange = sheet.getRange(target.requiredFormulaCell);
      if (!hasApprovedWealthFormula_(reqRange, target.expectedFormula)) {
        throw new Error("Account formula changed. Balance was not updated.");
      }
    }

    // Formula protection check on target write cell
    const writeCellAddress = target.writeCell || target.balanceCell;
    const writeRange = sheet.getRange(writeCellAddress);
    const currentFormula = writeRange.getFormula();
    if (currentFormula && String(currentFormula).trim().length > 0) {
      throw new Error("This value is calculated automatically and cannot be edited.");
    }

    // Write normalized numeric value
    writeRange.setValue(normalizedBalance);
    SpreadsheetApp.flush();

    // Read authoritative refreshed Wealth data
    const freshWealth = getWealth();
    return {
      ok: true,
      wealth: freshWealth
    };
  } finally {
    lock.releaseLock();
  }
}

/* =========================================
   STAGE 3 SPENDING BUCKETS (AVAILABLE TO SPEND)
========================================= */

function getSpendingBuckets() {
  const sheet = getWealthSheet_();

  // Read B14:F14 (Row 14, Cols B to F)
  // B14 = Necessity (formula-driven remainder)
  // C14 = Small Business (manual input)
  // D14 = Education (manual input)
  // E14 = Giving (manual input)
  // F14 = Play (manual input)
  const row14 = sheet.getRange("B14:F14").getValues()[0] || [];

  return {
    necessity: parseSheetNumber_(row14[0]),
    smallBusiness: parseSheetNumber_(row14[1]),
    education: parseSheetNumber_(row14[2]),
    giving: parseSheetNumber_(row14[3]),
    play: parseSheetNumber_(row14[4]),
    updatedAt: new Date().toISOString()
  };
}

function updateSpendingBuckets(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Payload must be an object.");
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    throw new Error("Server is busy. Please try again.");
  }

  try {
    const sheet = getWealthSheet_();

    // Verify targets do not contain formulas
    // Targets: C14 (Small Business), D14 (Education), E14 (Giving), F14 (Play)
    const formulas = sheet.getRange("C14:F14").getFormulas()[0] || [];
    if (formulas.some(f => f && String(f).trim() !== "")) {
      throw new Error("Target allocation cell contains a formula. Write blocked.");
    }

    if (payload.smallBusiness !== undefined) {
      const val = parseSheetNumber_(payload.smallBusiness);
      sheet.getRange("C14").setValue(val);
    }
    if (payload.education !== undefined) {
      const val = parseSheetNumber_(payload.education);
      sheet.getRange("D14").setValue(val);
    }
    if (payload.giving !== undefined) {
      const val = parseSheetNumber_(payload.giving);
      sheet.getRange("E14").setValue(val);
    }
    if (payload.play !== undefined) {
      const val = parseSheetNumber_(payload.play);
      sheet.getRange("F14").setValue(val);
    }

    SpreadsheetApp.flush();

    return {
      ok: true,
      buckets: getSpendingBuckets()
    };
  } finally {
    lock.releaseLock();
  }
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

    case "getSpendingBuckets":
      return {
        ok: true,
        buckets: getSpendingBuckets()
      };

    case "updateSpendingBuckets":
      return updateSpendingBuckets(payload);

    case "updateWealthAccountBalance":
      return updateWealthAccountBalance(payload);

    case "updateWealthReserve":
      return updateWealthReserve(payload);

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
