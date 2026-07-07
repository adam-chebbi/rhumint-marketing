"use client";

import { FormEvent, useState } from "react";
import { issueLicense } from "@/lib/api";

const MODULE_OPTIONS = ["core", "hr", "payroll", "attendance", "leave"];

export default function IssueLicenseModal({
  onClose,
}: {
  onClose: (refresh: boolean) => void;
}) {
  const [orgId, setOrgId] = useState("");
  const [email, setEmail] = useState("");
  const [seats, setSeats] = useState("1");
  const [modules, setModules] = useState<string[]>(["core"]);
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ license_id: string; token: string } | null>(null);
  const [loading, setLoading] = useState(false);

  function toggleModule(m: string) {
    setModules((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const params: any = {
        org_id: orgId,
        seats: parseInt(seats, 10),
        modules,
      };
      if (email) params.customer_email = email;
      params.exp = expiresAt || null;

      const res = await issueLicense(params);
      setResult(res);
    } catch (err: any) {
      setError(err.message ?? "Failed to issue license");
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="w-full max-w-lg rounded-xl border border-gray-800 bg-gray-900 p-6">
          <h3 className="mb-4 text-lg font-bold text-green-400">License Issued</h3>
          <p className="mb-1 text-sm text-gray-400">License ID</p>
          <p className="mb-3 font-mono text-sm text-gray-100">{result.license_id}</p>
          <p className="mb-1 text-sm text-gray-400">Token</p>
          <textarea
            readOnly
            value={result.token}
            rows={4}
            className="mb-4 w-full rounded border border-gray-700 bg-gray-800 p-2 font-mono text-xs text-gray-100"
          />
          <div className="flex gap-2">
            <button
              onClick={() => navigator.clipboard.writeText(result.token)}
              className="rounded-lg bg-gray-700 px-4 py-2 text-sm text-gray-200 hover:bg-gray-600"
            >
              Copy Token
            </button>
            <button
              onClick={() => onClose(true)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg space-y-4 rounded-xl border border-gray-800 bg-gray-900 p-6"
      >
        <h3 className="text-lg font-bold text-gray-100">Issue License</h3>

        {error && <p className="rounded bg-red-900/50 px-3 py-2 text-sm text-red-300">{error}</p>}

        <div>
          <label className="mb-1 block text-sm text-gray-400">Org ID *</label>
          <input
            type="text"
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
            required
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100 focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-gray-400">Customer Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100 focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-gray-400">Seats *</label>
          <input
            type="number"
            value={seats}
            onChange={(e) => setSeats(e.target.value)}
            min={1}
            required
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100 focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-gray-400">Modules *</label>
          <div className="flex flex-wrap gap-2">
            {MODULE_OPTIONS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => toggleModule(m)}
                className={`rounded-lg px-3 py-1 text-sm ${
                  modules.includes(m)
                    ? "bg-blue-600 text-white"
                    : "border border-gray-700 text-gray-400 hover:border-gray-600"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm text-gray-400">
            Expires at <span className="text-gray-500">(leave blank for lifetime)</span>
          </label>
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100 focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={() => onClose(false)}
            className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {loading ? "Issuing..." : "Issue License"}
          </button>
        </div>
      </form>
    </div>
  );
}
