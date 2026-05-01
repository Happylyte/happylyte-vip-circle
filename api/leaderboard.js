export default async function handler(req, res) {
// CORS headers first — before anything else
res.setHeader("Access-Control-Allow-Origin", "*");
res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
res.setHeader("Access-Control-Allow-Headers", "*");
res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate");

// Handle preflight
if (req.method === "OPTIONS") {
return res.status(200).end();
}

const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
const CAMPAIGN_START = "2026-04-28T23:00:00Z";
const CAMPAIGN_END = "2026-05-06T22:59:59Z";

try {
if (!SHOPIFY_STORE || !SHOPIFY_ADMIN_TOKEN) {
return res.status(500).json({ success: false, error: "Missing credentials" });
}

const params = new URLSearchParams({
status: "any",
limit: "250",
order: "created_at desc",
created_at_min: CAMPAIGN_START,
created_at_max: CAMPAIGN_END,
financial_status: "paid,partially_paid,authorized"
});

let url = `https://${SHOPIFY_STORE}/admin/api/2024-10/orders.json?${params}`;
let all = [];

while (url) {
const r = await fetch(url, {
headers: {
"X-Shopify-Access-Token": SHOPIFY_ADMIN_TOKEN,
"Content-Type": "application/json"
}
});

if (!r.ok) {
const t = await r.text();
throw new Error(`Shopify ${r.status}: ${t}`);
}

const data = await r.json();
all = all.concat(data.orders || []);

const link = r.headers.get("link");
const next = link && link.match(/<([^>]+)>;\s*rel="next"/);
url = next ? next[1] : null;
}

const totals = new Map();

for (const order of all) {
if (order.cancelled_at || order.test) continue;
if (!["paid","partially_paid","authorized"].includes(order.financial_status)) continue;
const amount = Number(order.current_total_price || 0);
if (amount <= 0) continue;

const key = order?.customer?.id
? `c_${order.customer.id}`
: `e_${(order?.email || "").toLowerCase()}`;

const first = order?.customer?.first_name || "";
const last = order?.customer?.last_name || "";
const initials = (first || last)
? `${first.charAt(0).toUpperCase()}.${last.charAt(0).toUpperCase()}`
: (order?.email || "H").charAt(0).toUpperCase() + ".";

if (!totals.has(key)) totals.set(key, { initials, total: 0 });
totals.get(key).total += amount;
}

const leaderboard = Array.from(totals.values())
.map(x => ({ initials: x.initials, total: Number(x.total.toFixed(0)) }))
.sort((a, b) => b.total - a.total)
.slice(0, 9);

return res.status(200).json({
success: true,
updatedAt: new Date().toISOString(),
refreshSeconds: 300,
currencySymbol: "₦",
leaderboard
});

} catch (err) {
return res.status(500).json({ success: false, error: err.message });
}
}

