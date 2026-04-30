const SETTINGS = {
  SHOPIFY_STORE: process.env.SHOPIFY_STORE,
  SHOPIFY_ADMIN_TOKEN: process.env.SHOPIFY_ADMIN_TOKEN,

  CAMPAIGN_START: "2026-04-28T23:00:00Z",
  CAMPAIGN_END: "2026-05-06T22:59:59Z",

  MAX_LEADERS: 9,
  REFRESH_SECONDS: 300,
  CURRENCY_SYMBOL: "₦"
};

// Get initials safely
function getInitials(order) {
  const first = order?.customer?.first_name || "";
  const last = order?.customer?.last_name || "";

  if (first || last) {
    return `${first.charAt(0).toUpperCase() || ""}.${last.charAt(0).toUpperCase() || ""}.`;
  }

  const email = order?.email || order?.customer?.email || "";
  if (email.includes("@")) {
    const name = email.split("@")[0];
    return `${name.charAt(0).toUpperCase()}.`;
  }

  return "H.";
}

// Unique customer key
function getCustomerKey(order) {
  if (order?.customer?.id) return `c_${order.customer.id}`;

  const email = (order?.email || "").toLowerCase();
  if (email) return `e_${email}`;

  return `g_${order.id}`;
}

// Validate order
function isValid(order, start, end) {
  const created = new Date(order.created_at);

return (
created >= start &&
created <= end &&
["paid", "partially_paid", "authorized"].includes(order.financial_status) &&
!order.cancelled_at &&
!order.test &&
Number(order.current_total_price || 0) > 0
);
}

// Fetch all orders (handles pagination)
async function fetchOrders() {
let all = [];

let url =
`https://${SETTINGS.SHOPIFY_STORE}/admin/api/2024-10/orders.json` +
`?status=any` +
`&limit=250` +
`&order=created_at desc`;

while (url) {
const res = await fetch(url, {
headers: {
"X-Shopify-Access-Token": SETTINGS.SHOPIFY_ADMIN_TOKEN,
"Content-Type": "application/json"
}
});

if (!res.ok) {
const text = await res.text();
throw new Error(`Shopify error ${res.status}: ${text}`);
}

const text = await res.text();

if (!res.ok) {
throw new Error(`Shopify error ${res.status}: ${text}`);
}

let data;
try {
data = JSON.parse(text);
} catch (e) {
throw new Error(`Invalid JSON from Shopify: ${text}`);
}
all = all.concat(data.orders || []);

const link = res.headers.get("link");
const next = link && link.match(/<([^>]+)>;\s*rel="next"/);
url = next ? next[1] : null;
}

return all;
}

// Main handler
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    if (!SETTINGS.SHOPIFY_STORE || !SETTINGS.SHOPIFY_ADMIN_TOKEN) {
      return res.status(500).json({
        success: false,
        error: "Missing Shopify credentials"
      });
    }

    const start = new Date(SETTINGS.CAMPAIGN_START);
    const end = new Date(SETTINGS.CAMPAIGN_END);

    const orders = await fetchOrders();
    const totals = new Map();

    for (const order of orders) {
      if (!isValid(order, start, end)) continue;

      const key = getCustomerKey(order);
      const initials = getInitials(order);
      const amount = Number(order.current_total_price || 0);

      if (!totals.has(key)) {
        totals.set(key, { initials, total: 0 });
      }

      totals.get(key).total += amount;
    }

    const leaderboard = Array.from(totals.values())
      .map(x => ({
        initials: x.initials,
        total: Number(x.total.toFixed(0))
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, SETTINGS.MAX_LEADERS);

    return res.status(200).json({
      success: true,
      updatedAt: new Date().toISOString(),
      refreshSeconds: SETTINGS.REFRESH_SECONDS,
      currencySymbol: SETTINGS.CURRENCY_SYMBOL,
      leaderboard
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
}
