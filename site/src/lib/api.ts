export class CentralApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "CentralApiError";
    this.status = status;
  }
}

function baseUrl(): string {
  return process.env.CENTRAL_API_URL ?? "http://localhost:8787";
}

function apiKey(): string {
  return process.env.CENTRAL_API_KEY ?? "";
}

async function apiFetch(path: string, init?: RequestInit): Promise<any> {
  const url = `${baseUrl()}/api${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey()}`,
      ...init?.headers,
    },
  });
  const body = await res.json();
  if (!res.ok) {
    throw new CentralApiError(body.error ?? body.message ?? "Unknown error", res.status);
  }
  return body;
}

export interface AdminStats {
  total_revenue: number;
  total_purchases: number;
  refunded_count: number;
  disputed_count: number;
  active_licenses: number;
  revoked_licenses: number;
  revenue_series: { month: string; revenue: number }[];
}

export interface PurchaseWithLicense {
  id: string;
  gumroad_sale_id: string;
  email: string;
  product_name: string;
  product_id: string;
  amount_cents: number;
  currency: string;
  is_gift: number;
  event_type: string;
  license_id: string | null;
  refunded_at: string | null;
  disputed_at: string | null;
  created_at: string;
  org_id: string | null;
  seats: number | null;
  modules: string | null;
  license_revoked_at: string | null;
}

export interface LicenseDetail {
  id: string;
  org_id: string;
  seats: number;
  modules: string[];
  issued_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  gumroad_sale_id: string | null;
  customer_email: string | null;
  created_at: string;
}

export async function fetchStats(): Promise<AdminStats> {
  return apiFetch("/admin/stats");
}

export async function fetchPurchases(): Promise<PurchaseWithLicense[]> {
  const data = await apiFetch("/admin/purchases");
  return data.purchases;
}

export async function fetchLicenses(): Promise<LicenseDetail[]> {
  const data = await apiFetch("/license");
  return data.licenses;
}

export async function fetchLicense(id: string): Promise<LicenseDetail> {
  return apiFetch(`/license/${id}`);
}

export async function issueLicense(params: {
  org_id: string;
  seats: number;
  modules: string[];
  customer_email?: string;
  exp?: string | null;
}): Promise<{ license_id: string; token: string }> {
  return apiFetch("/license/issue", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function revokeLicense(id: string): Promise<void> {
  await apiFetch(`/license/${id}/revoke`, { method: "POST" });
}

export async function extendLicense(id: string, expiresAt: string | null): Promise<{ token: string }> {
  return apiFetch(`/license/${id}/extend`, {
    method: "POST",
    body: JSON.stringify({ expires_at: expiresAt }),
  });
}
