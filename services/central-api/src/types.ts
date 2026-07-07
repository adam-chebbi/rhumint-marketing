export interface LicenseTokenPayload {
  license_id: string;
  org_id: string;
  issued_at: number;
  expires_at: number | null;
  seats: number;
  modules: string[];
}

export interface License {
  id: string;
  gumroad_sale_id: string | null;
  customer_email: string | null;
  org_id: string;
  seats: number;
  modules: string;
  issued_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface GumroadSale {
  sale_id: string;
  email: string;
  product_name: string;
  product_id: string;
  license_key: string | null;
  timestamp: string;
  amount_cents: number;
  currency: string;
  is_gift: boolean;
}

export interface UpdateManifest {
  latest_version: string;
  published_at: string;
  changelog: string;
  docker_tag: string;
  min_upgradable_version: string;
}
