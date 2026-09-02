const FinanceApi_ = (() => {
  "use strict";

  const EXPECTED_SPREADSHEET_TITLE = "Stage 2 Auth POC - Personal Finance";
  const DEFAULT_SHEET_NAME = "Spending_Master2026";
  const HEADERS = [
    "ID",
    "Date",
    "Cost",
    "Bucket",
    "Category",
    "Item",
    "Notes",
    "Payment Method"
  ];
  const BUCKET_CATEGORIES = Object.freeze({
    Play: ["Fitness", "Eating Out", "Travel", "Entertainment", "Amazon", "Clothing"],
    Necessity: ["Health", "Household", "Grocery", "Car & Transportation", "Personal Care", "Taxes"],
    "Small Business": ["Subscription", "Websites", "Marketing", "Business", "Ai Subscriptions", "Travel and Transportation"],
    Education: ["Courses", "Tech", "Books"],
    Giving: ["Gifts", "Charity", "Misc"]
  });
  const PAYMENT_METHODS = Object.freeze(["Cash", "E-Transfer", "Credit Card", "Other"]);

  function handle(request) {
    requirePlainObject_(request, "Request must be an object.");

    const action = String(request.action || "");
    const payload = request.payload == null ? {} : request.payload;

    switch (action) {
      case "getExpenses":
        requirePlainObject_(payload, "Payload must be an object.");
        return { ok: true, expenses: getExpenses_() };
      case "addExpense":
        return { ok: true, result: addExpense_(payload) };
      case "updateExpense":
        return { ok: true, result: updateExpense_(payload) };
      case "deleteExpense":
        return { ok: true, result: deleteExpense_(payload) };
      default:
        throw new Error("Unsupported API action.");
    }
  }

  function getExpenses_() {
    const sheet = getExpenseSheet_();
    assertExpectedSchema_(sheet);
    const lastRow = sheet.getLastRow();

    if (lastRow < 2) {
      return [];
    }

    return sheet
      .getRange(2, 1, lastRow - 1, HEADERS.length)
      .getValues()
      .filter(row => row[0] !== "")
      .reverse()
      .map(row => ({
        id: String(row[0] || ""),
        date: row[1] instanceof Date
          ? Utilities.formatDate(row[1], "America/Toronto", "yyyy-MM-dd")
          : String(row[1] || ""),
        cost: normalizeMoney_(row[2]) || 0,
        bucket: String(row[3] || ""),
        category: String(row[4] || "").trim(),
        item: String(row[5] || "").trim(),
        notes: String(row[6] || "").trim(),
        paymentMethod: String(row[7] || "").trim()
      }))
      .sort((first, second) => second.date.localeCompare(first.date));
  }

  function addExpense_(expense) {
    const normalized = normalizeExpense_(expense, false);
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
      const sheet = getExpenseSheet_();
      assertExpectedSchema_(sheet);
      const id = createUniqueId_(sheet);

      sheet.appendRow(toSheetRow_(normalized, id));
      return { id, message: "Fake expense saved." };
    } finally {
      lock.releaseLock();
    }
  }

  function updateExpense_(expense) {
    const normalized = normalizeExpense_(expense, true);
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
      const sheet = getExpenseSheet_();
      assertExpectedSchema_(sheet);
      const rowNumber = findExpenseRowById_(sheet, normalized.id);

      if (!rowNumber) {
        throw new Error("Fake expense was not found.");
      }

      sheet
        .getRange(rowNumber, 2, 1, 7)
        .setValues([[...toSheetRow_(normalized, normalized.id).slice(1)]]);

      return { id: normalized.id, message: "Fake expense updated." };
    } finally {
      lock.releaseLock();
    }
  }

  function deleteExpense_(payload) {
    requirePlainObject_(payload, "Payload must be an object.");
    const id = String(payload.id || "").trim();

    if (!id) {
      throw new Error("Expense ID is required.");
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
      const sheet = getExpenseSheet_();
      assertExpectedSchema_(sheet);
      const rowNumber = findExpenseRowById_(sheet, id);

      if (!rowNumber) {
        throw new Error("Fake expense was not found.");
      }

      sheet.deleteRow(rowNumber);
      return { id, message: "Fake expense deleted." };
    } finally {
      lock.releaseLock();
    }
  }

  function normalizeExpense_(expense, requireId) {
    requirePlainObject_(expense, "Expense must be an object.");

    const id = String(expense.id || "").trim();
    const bucket = String(expense.bucket || "");
    const category = String(expense.category || "");
    const paymentMethod = String(expense.paymentMethod || "");
    const item = String(expense.item || "").trim();
    const notes = String(expense.notes || "").trim();
    const costInCents = moneyToCents_(expense.cost);

    if (requireId && !id) {
      throw new Error("Expense ID is required.");
    }
    if (!Number.isSafeInteger(costInCents) || costInCents <= 0) {
      throw new Error("Enter a valid cost.");
    }
    if (!BUCKET_CATEGORIES[bucket]) {
      throw new Error("Select a valid bucket.");
    }
    if (!BUCKET_CATEGORIES[bucket].includes(category)) {
      throw new Error("The selected category does not belong to this bucket.");
    }
    if (!PAYMENT_METHODS.includes(paymentMethod)) {
      throw new Error("Select a valid payment method.");
    }
    if (!item) {
      throw new Error("Item is required.");
    }

    return {
      id,
      date: parseExpenseDate_(expense.date),
      cost: costInCents / 100,
      bucket,
      category,
      item,
      notes,
      paymentMethod
    };
  }

  function parseExpenseDate_(dateString) {
    const parts = String(dateString || "").split("-");
    if (parts.length !== 3) {
      throw new Error("Invalid date.");
    }

    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]);
    const date = new Date(year, month - 1, day, 12, 0, 0);

    if (
      !Number.isInteger(year) ||
      !Number.isInteger(month) ||
      !Number.isInteger(day) ||
      Number.isNaN(date.getTime()) ||
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      throw new Error("Invalid date.");
    }

    return date;
  }

  function moneyToCents_(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) {
      return NaN;
    }

    const parts = String(amount).split("e");
    const cents = Math.round(Number(`${parts[0]}e${Number(parts[1] || 0) + 2}`));
    return Number.isSafeInteger(cents) ? cents : NaN;
  }

  function normalizeMoney_(value) {
    const cents = moneyToCents_(value);
    return Number.isSafeInteger(cents) ? cents / 100 : NaN;
  }

  function toSheetRow_(expense, id) {
    return [
      id,
      expense.date,
      expense.cost,
      expense.bucket,
      expense.category,
      expense.item,
      expense.notes,
      expense.paymentMethod
    ];
  }

  function createUniqueId_(sheet) {
    const lastRow = sheet.getLastRow();
    const ids = lastRow < 2
      ? new Set()
      : new Set(
          sheet
            .getRange(2, 1, lastRow - 1, 1)
            .getValues()
            .flat()
            .map(value => String(value))
        );
    let id;

    do {
      id = Utilities.getUuid().replace(/-/g, "").slice(0, 8);
    } while (ids.has(id));

    return id;
  }

  function findExpenseRowById_(sheet, id) {
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return null;
    }

    const target = String(id);
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
    const index = ids.findIndex(value => String(value) === target);
    return index === -1 ? null : index + 2;
  }

  function getExpenseSheet_() {
    const properties = PropertiesService.getScriptProperties();
    const spreadsheetId = String(properties.getProperty("TEST_SPREADSHEET_ID") || "").trim();
    const expectedTitle = String(
      properties.getProperty("TEST_SPREADSHEET_TITLE") || EXPECTED_SPREADSHEET_TITLE
    ).trim();
    const sheetName = String(
      properties.getProperty("TEST_SHEET_NAME") || DEFAULT_SHEET_NAME
    ).trim();

    if (!spreadsheetId) {
      throw new Error("TEST_SPREADSHEET_ID is not configured.");
    }
    if (expectedTitle !== EXPECTED_SPREADSHEET_TITLE) {
      throw new Error("The configured test spreadsheet title is not allowed.");
    }

    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    if (spreadsheet.getName() !== EXPECTED_SPREADSHEET_TITLE) {
      throw new Error("Refusing to access a spreadsheet outside the Stage 2 test boundary.");
    }

    const sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) {
      throw new Error("The fake expense sheet was not found.");
    }

    return sheet;
  }

  function assertExpectedSchema_(sheet) {
    const actualHeaders = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
    const matches = HEADERS.every((header, index) => String(actualHeaders[index]) === header);
    if (!matches) {
      throw new Error("The fake expense sheet schema does not match A:H.");
    }
  }

  function requirePlainObject_(value, message) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(message);
    }
  }

  return Object.freeze({ handle });
})();

function apiRequest(request) {
  return FinanceApi_.handle(request);
}
