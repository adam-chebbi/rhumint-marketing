import { fetchStats, fetchPurchases } from "@/lib/api";

export default async function DashboardPage() {
  const [stats, purchases] = await Promise.all([fetchStats(), fetchPurchases()]);

  const maxRevenue = Math.max(...stats.revenue_series.map((r) => r.revenue), 1);

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold text-gray-100">Dashboard</h2>

      {/* Stats cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total Revenue" value={`$${stats.total_revenue.toFixed(2)}`} />
        <StatCard label="Active Licenses" value={String(stats.active_licenses)} />
        <StatCard label="Total Purchases" value={String(stats.total_purchases)} />
        <StatCard label="Refunded" value={String(stats.refunded_count)} />
      </div>

      {/* Revenue chart */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">Revenue by Month</h3>
        <div className="flex items-end gap-2" style={{ height: 120 }}>
          {stats.revenue_series.length === 0 && (
            <p className="self-center text-sm text-gray-500">No data yet</p>
          )}
          {stats.revenue_series.map((r) => (
            <div key={r.month} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-blue-500 transition-all"
                style={{ height: `${(r.revenue / maxRevenue) * 100}%` }}
              />
              <span className="text-xs text-gray-500">{r.month.slice(5)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent purchases */}
      <div className="rounded-xl border border-gray-800 bg-gray-900">
        <div className="border-b border-gray-800 px-6 py-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Recent Purchases</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left text-gray-500">
                <th className="px-6 py-3 font-medium">Email</th>
                <th className="px-6 py-3 font-medium">Product</th>
                <th className="px-6 py-3 font-medium">Amount</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {purchases.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    No purchases yet
                  </td>
                </tr>
              )}
              {purchases.slice(0, 20).map((p) => (
                <tr key={p.id} className="border-b border-gray-800 text-gray-300">
                  <td className="px-6 py-3">{p.email}</td>
                  <td className="px-6 py-3">{p.product_name}</td>
                  <td className="px-6 py-3">${(p.amount_cents / 100).toFixed(2)}</td>
                  <td className="px-6 py-3">
                    {p.refunded_at ? (
                      <span className="rounded-full bg-red-900/50 px-2 py-0.5 text-xs text-red-300">Refunded</span>
                    ) : p.disputed_at ? (
                      <span className="rounded-full bg-yellow-900/50 px-2 py-0.5 text-xs text-yellow-300">Disputed</span>
                    ) : (
                      <span className="rounded-full bg-green-900/50 px-2 py-0.5 text-xs text-green-300">Active</span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-gray-500">{new Date(p.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <p className="text-sm text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-100">{value}</p>
    </div>
  );
}
