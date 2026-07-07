"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { LicenseDetail } from "@/lib/api";
import { fetchLicenses } from "@/lib/api";
import IssueLicenseModal from "./issue-modal";

export default function LicensesPage() {
  const [licenses, setLicenses] = useState<LicenseDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showIssueModal, setShowIssueModal] = useState(false);

  useEffect(() => {
    fetchLicenses()
      .then(setLicenses)
      .finally(() => setLoading(false));
  }, []);

  const filtered = licenses.filter((l) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      l.org_id.toLowerCase().includes(q) ||
      (l.customer_email ?? "").toLowerCase().includes(q) ||
      l.id.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-100">Licenses</h2>
        <button
          onClick={() => setShowIssueModal(true)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
        >
          Issue License
        </button>
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by org, email, or license ID..."
        className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
      />

      {loading && <p className="text-gray-500">Loading...</p>}

      {!loading && (
        <div className="overflow-x-auto rounded-xl border border-gray-800 bg-gray-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left text-gray-500">
                <th className="px-5 py-3 font-medium">Org</th>
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Seats</th>
                <th className="px-5 py-3 font-medium">Modules</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Issued</th>
                <th className="px-5 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-gray-500">
                    {search ? "No matching licenses" : "No licenses yet"}
                  </td>
                </tr>
              )}
              {filtered.map((l) => (
                <tr key={l.id} className="border-b border-gray-800 text-gray-300">
                  <td className="px-5 py-3 font-medium">{l.org_id}</td>
                  <td className="px-5 py-3 text-gray-400">{l.customer_email ?? "—"}</td>
                  <td className="px-5 py-3">{l.seats}</td>
                  <td className="px-5 py-3 text-gray-400">{l.modules.join(", ")}</td>
                  <td className="px-5 py-3">
                    {l.revoked_at ? (
                      <span className="rounded-full bg-red-900/50 px-2 py-0.5 text-xs text-red-300">Revoked</span>
                    ) : l.expires_at && new Date(l.expires_at) < new Date() ? (
                      <span className="rounded-full bg-yellow-900/50 px-2 py-0.5 text-xs text-yellow-300">Expired</span>
                    ) : (
                      <span className="rounded-full bg-green-900/50 px-2 py-0.5 text-xs text-green-300">Active</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-gray-500">{new Date(l.issued_at).toLocaleDateString()}</td>
                  <td className="px-5 py-3">
                    <Link
                      href={`/licenses/${l.id}`}
                      className="text-blue-400 hover:text-blue-300"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showIssueModal && (
        <IssueLicenseModal
          onClose={(refresh) => {
            setShowIssueModal(false);
            if (refresh) {
              fetchLicenses().then(setLicenses);
            }
          }}
        />
      )}
    </div>
  );
}
