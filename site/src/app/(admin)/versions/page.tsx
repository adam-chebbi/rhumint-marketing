"use client";

import { useEffect, useState } from "react";
import type { Heartbeat } from "@/lib/api";
import { fetchVersions } from "@/lib/api";

export default function VersionsPage() {
  const [heartbeats, setHeartbeats] = useState<Heartbeat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchVersions()
      .then(setHeartbeats)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-100">Client Versions</h2>
      <p className="text-sm text-gray-500">
        Latest product version reported by each org&apos;s client instance via heartbeat.
        Clients call <code className="rounded bg-gray-800 px-1.5 py-0.5 text-xs">POST /api/license/heartbeat</code> with
        their license token and current version.
      </p>

      {loading && <p className="text-gray-500">Loading...</p>}

      {!loading && (
        <div className="overflow-x-auto rounded-xl border border-gray-800 bg-gray-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left text-gray-500">
                <th className="px-5 py-3 font-medium">Org</th>
                <th className="px-5 py-3 font-medium">Version</th>
                <th className="px-5 py-3 font-medium">License ID</th>
                <th className="px-5 py-3 font-medium">Last Reported</th>
              </tr>
            </thead>
            <tbody>
              {heartbeats.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-gray-500">
                    No heartbeats received yet. Clients will appear here after their first check-in.
                  </td>
                </tr>
              )}
              {heartbeats.map((h) => (
                <tr key={h.id} className="border-b border-gray-800 text-gray-300">
                  <td className="px-5 py-3 font-medium">{h.org_id}</td>
                  <td className="px-5 py-3">
                    <span className="rounded-full bg-blue-900/50 px-2 py-0.5 text-xs text-blue-300">
                      {h.version}
                    </span>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-gray-500">{h.license_id}</td>
                  <td className="px-5 py-3 text-gray-500">{new Date(h.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
