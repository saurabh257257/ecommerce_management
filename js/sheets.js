// Sheets API — all calls go through the Apps Script web app
const Sheets = {
  async call(action, payload = {}) {
    if (APPS_SCRIPT_URL === "YOUR_APPS_SCRIPT_URL_HERE") {
      throw new Error("Please set your Apps Script URL in js/config.js");
    }
    const res = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  },

  getCustomers: () => Sheets.call("getCustomers"),
  addCustomer: (customer) => Sheets.call("addCustomer", { customer }),
  updateCustomer: (id, customer) => Sheets.call("updateCustomer", { id, customer }),
  deleteCustomer: (id) => Sheets.call("deleteCustomer", { id }),

  getOrders: () => Sheets.call("getOrders"),
  addOrder: (order) => Sheets.call("addOrder", { order }),
  updateOrder: (id, order) => Sheets.call("updateOrder", { id, order }),
  deleteOrder: (id) => Sheets.call("deleteOrder", { id }),
};
