// ================================================================
// ShopManager — Google Apps Script Backend
// Deploy this as a Web App in Google Apps Script
// See README.md for step-by-step instructions
// ================================================================

const SHEET_ID = "YOUR_GOOGLE_SHEET_ID_HERE"; // replace after creating your sheet

function getSheet(name) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    // Write header row on first creation
    if (name === "Customers") {
      sheet.appendRow(["id","firstName","lastName","email","phone","city","address","status","notes","joined"]);
    } else if (name === "Orders") {
      sheet.appendRow(["id","customerName","product","qty","amount","status","payment","notes","date"]);
    }
  }
  return sheet;
}

function sheetToObjects(sheet) {
  const [headers, ...rows] = sheet.getDataRange().getValues();
  return rows.map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i] === "" ? "" : String(row[i]));
    return obj;
  });
}

function generateId() {
  return Date.now().toString(36).toUpperCase();
}

// ── Entry points ──────────────────────────────────────────────

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: "ShopManager API running" }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const { action } = body;
    let result;

    if      (action === "getCustomers")    result = getCustomers();
    else if (action === "addCustomer")     result = addCustomer(body.customer);
    else if (action === "updateCustomer")  result = updateCustomer(body.id, body.customer);
    else if (action === "deleteCustomer")  result = deleteCustomer(body.id);
    else if (action === "getOrders")       result = getOrders();
    else if (action === "addOrder")        result = addOrder(body.order);
    else if (action === "updateOrder")     result = updateOrder(body.id, body.order);
    else if (action === "deleteOrder")     result = deleteOrder(body.id);
    else throw new Error("Unknown action: " + action);

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── Customers CRUD ────────────────────────────────────────────

function getCustomers() {
  return { data: sheetToObjects(getSheet("Customers")) };
}

function addCustomer(customer) {
  const sheet = getSheet("Customers");
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  customer.id = generateId();
  sheet.appendRow(headers.map(h => customer[h] || ""));
  return { success: true, id: customer.id };
}

function updateCustomer(id, updates) {
  const sheet = getSheet("Customers");
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idCol = headers.indexOf("id");
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(id)) {
      headers.forEach((h, j) => {
        if (h !== "id" && updates[h] !== undefined) sheet.getRange(i + 1, j + 1).setValue(updates[h]);
      });
      return { success: true };
    }
  }
  throw new Error("Customer not found: " + id);
}

function deleteCustomer(id) {
  const sheet = getSheet("Customers");
  const data = sheet.getDataRange().getValues();
  const idCol = data[0].indexOf("id");
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(id)) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  throw new Error("Customer not found: " + id);
}

// ── Orders CRUD ───────────────────────────────────────────────

function getOrders() {
  return { data: sheetToObjects(getSheet("Orders")) };
}

function addOrder(order) {
  const sheet = getSheet("Orders");
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  order.id = generateId();
  sheet.appendRow(headers.map(h => order[h] || ""));
  return { success: true, id: order.id };
}

function updateOrder(id, updates) {
  const sheet = getSheet("Orders");
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idCol = headers.indexOf("id");
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(id)) {
      headers.forEach((h, j) => {
        if (h !== "id" && updates[h] !== undefined) sheet.getRange(i + 1, j + 1).setValue(updates[h]);
      });
      return { success: true };
    }
  }
  throw new Error("Order not found: " + id);
}

function deleteOrder(id) {
  const sheet = getSheet("Orders");
  const data = sheet.getDataRange().getValues();
  const idCol = data[0].indexOf("id");
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(id)) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  throw new Error("Order not found: " + id);
}
