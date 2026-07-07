"use client";

import { useEffect, useState } from "react";
import type { Ticket } from "@/lib/api";
import { fetchTickets, createTicket, closeTicket } from "@/lib/api";

const PRIORITY_COLORS: Record<string, string> = {
  high: "text-red-300 bg-red-900/50",
  normal: "text-blue-300 bg-blue-900/50",
  low: "text-gray-400 bg-gray-800",
};

export default function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<"all" | "open" | "closed">("all");

  // form state
  const [subject, setSubject] = useState("");
  const [orgId, setOrgId] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function load() {
    setLoading(true);
    fetchTickets()
      .then(setTickets)
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const filtered = tickets.filter((t) => {
    if (filter === "open") return t.status === "open";
    if (filter === "closed") return t.status === "closed";
    return true;
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!subject.trim()) return;
    setSaving(true);
    try {
      await createTicket({
        subject: subject.trim(),
        org_id: orgId || undefined,
        contact_email: contactEmail || undefined,
        description: description.trim() || undefined,
        priority,
      });
      setSubject("");
      setOrgId("");
      setContactEmail("");
      setDescription("");
      setPriority("normal");
      setShowForm(false);
      load();
    } catch (e: any) {
      setError(e.message ?? "Failed to create ticket");
    } finally {
      setSaving(false);
    }
  }

  async function handleClose(id: string) {
    try {
      await closeTicket(id);
      setTickets((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status: "closed", closed_at: new Date().toISOString() } : t)),
      );
    } catch {
      // silently fail for now
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-100">Tickets</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
        >
          {showForm ? "Cancel" : "New Ticket"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="space-y-4 rounded-xl border border-gray-800 bg-gray-900 p-6"
        >
          <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">New Inquiry</h3>

          {error && <p className="rounded bg-red-900/50 px-3 py-2 text-sm text-red-300">{error}</p>}

          <div>
            <label className="mb-1 block text-sm text-gray-400">Subject *</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm text-gray-400">Org ID</label>
              <input
                type="text"
                value={orgId}
                onChange={(e) => setOrgId(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-400">Contact Email</label>
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm text-gray-400">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-gray-400">Priority</label>
            <div className="flex gap-2">
              {["low", "normal", "high"].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`rounded-lg px-4 py-1.5 text-sm ${
                    priority === p
                      ? "bg-blue-600 text-white"
                      : "border border-gray-700 text-gray-400 hover:border-gray-600"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {saving ? "Creating..." : "Create Ticket"}
          </button>
        </form>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(["all", "open", "closed"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg px-4 py-1.5 text-sm ${
              filter === f
                ? "bg-gray-800 text-gray-100"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f === "all" && ` (${tickets.length})`}
            {f === "open" && ` (${tickets.filter((t) => t.status === "open").length})`}
            {f === "closed" && ` (${tickets.filter((t) => t.status === "closed").length})`}
          </button>
        ))}
      </div>

      {loading && <p className="text-gray-500">Loading...</p>}

      {!loading && (
        <div className="space-y-3">
          {filtered.length === 0 && (
            <p className="py-8 text-center text-gray-500">No tickets{filter !== "all" ? ` with status "${filter}"` : ""}</p>
          )}
          {filtered.map((t) => (
            <div
              key={t.id}
              className="rounded-xl border border-gray-800 bg-gray-900 p-5"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${PRIORITY_COLORS[t.priority] ?? ""}`}>
                      {t.priority}
                    </span>
                    <h4 className="font-medium text-gray-100">{t.subject}</h4>
                    {t.status === "closed" && (
                      <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-500">Closed</span>
                    )}
                  </div>
                  {t.org_id && <p className="mt-1 text-sm text-gray-500">Org: {t.org_id}</p>}
                  {t.contact_email && <p className="text-sm text-gray-500">{t.contact_email}</p>}
                  {t.description && <p className="mt-2 text-sm text-gray-400">{t.description}</p>}
                  <p className="mt-2 text-xs text-gray-600">
                    {new Date(t.created_at).toLocaleString()}
                    {t.closed_at && ` — closed ${new Date(t.closed_at).toLocaleString()}`}
                  </p>
                </div>
                {t.status === "open" && (
                  <button
                    onClick={() => handleClose(t.id)}
                    className="ml-4 rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-400 hover:border-gray-600 hover:text-gray-200"
                  >
                    Close
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
