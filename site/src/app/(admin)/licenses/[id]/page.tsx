"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { LicenseDetail } from "@/lib/api";
import { fetchLicense, revokeLicense, extendLicense } from "@/lib/api";

export default function LicenseDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [license, setLicense] = useState<LicenseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionMsg, setActionMsg] = useState("");
  const [showExtend, setShowExtend] = useState(false);
  const [extendDate, setExtendDate] = useState("");

  useEffect(() => {
    fetchLicense(params.id)
      .then(setLicense)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) return <p className="text-gray-500">Loading...</p>;
  if (error) return <p className="text-red-300">{error}</p>;
  if (!license) return <p className="text-gray-500">License not found</p>;

  const isActive = !license.revoked_at && (!license.expires_at || new Date(license.expires_at) > new Date());

  async function handleRevoke() {
    if (!confirm("Revoke this license? This cannot be undone.")) return;
    setActionMsg("");
    try {
      await revokeLicense(license.id);
      setLicense({ ...license, revoked_at: new Date().toISOString() });
      setActionMsg("License revoked successfully.");
    } catch (e: any) {
      setActionMsg(e.message ?? "Failed to revoke");
    }
  }

  async function handleExtend(e: React.FormEvent) {
    e.preventDefault();
    setActionMsg("");
    try {
      const res = await extendLicense(license.id, extendDate || null);
      setLicense({ ...license, expires_at: extendDate || null });
      setShowExtend(false);
      setActionMsg("License extended successfully. New token copied to clipboard.");
      navigator.clipboard.writeText(res.token);
    } catch (e: any) {
      setActionMsg(e.message ?? "Failed to extend");
    }
  }

  return (
    <div className="space-y-6">
      <button
        onClick={() => router.push("/licenses")}
        className="text-sm text-gray-500 hover:text-gray-300"
      >
        &larr; Back to Licenses
      </button>

      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-100">{license.org_id}</h2>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            isActive
              ? "bg-green-900/50 text-green-300"
              : "bg-red-900/50 text-red-300"
          }`}
        >
          {isActive ? "Active" : "Inactive"}
        </span>
      </div>

      {actionMsg && (
        <p className="rounded-lg bg-blue-900/50 px-4 py-2 text-sm text-blue-300">
          {actionMsg}
        </p>
      )}

      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-4 rounded-xl border border-gray-800 bg-gray-900 p-6">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Details</h3>

          <Field label="License ID" value={license.id} mono />
          <Field label="Org ID" value={license.org_id} />
          <Field label="Email" value={license.customer_email ?? "—"} />
          <Field label="Seats" value={String(license.seats)} />
          <Field label="Modules" value={license.modules.join(", ")} />
          <Field label="Issued" value={new Date(license.issued_at).toLocaleString()} />
          <Field
            label="Expires"
            value={license.expires_at ? new Date(license.expires_at).toLocaleString() : "Lifetime"}
          />
          <Field
            label="Revoked"
            value={license.revoked_at ? new Date(license.revoked_at).toLocaleString() : "—"}
          />
          {license.gumroad_sale_id && <Field label="Gumroad Sale" value={license.gumroad_sale_id} />}
        </div>

        <div className="space-y-4 rounded-xl border border-gray-800 bg-gray-900 p-6">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Actions</h3>

          {isActive && (
            <div className="space-y-3">
              <button
                onClick={() => setShowExtend(!showExtend)}
                className="w-full rounded-lg border border-blue-700 px-4 py-2 text-sm text-blue-400 hover:bg-blue-900/30"
              >
                {showExtend ? "Cancel" : "Extend License"}
              </button>

              {showExtend && (
                <form onSubmit={handleExtend} className="space-y-2">
                  <input
                    type="date"
                    value={extendDate}
                    onChange={(e) => setExtendDate(e.target.value)}
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100 focus:border-blue-500 focus:outline-none"
                  />
                  <p className="text-xs text-gray-500">Leave blank to make lifetime</p>
                  <button
                    type="submit"
                    className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500"
                  >
                    Extend & Issue New Token
                  </button>
                </form>
              )}

              <button
                onClick={handleRevoke}
                className="w-full rounded-lg border border-red-700 px-4 py-2 text-sm text-red-400 hover:bg-red-900/30"
              >
                Revoke License
              </button>
            </div>
          )}

          {!isActive && (
            <p className="text-sm text-gray-500">No actions available for inactive licenses.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="mb-0.5 text-xs text-gray-500">{label}</p>
      <p className={`text-sm text-gray-200 ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}
