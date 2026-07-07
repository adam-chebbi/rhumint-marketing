export interface LicenseTokenPayload {
  license_id: string;
  org_id: string;
  iat: number;
  exp: number | null;
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

export interface Purchase {
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
}

export interface GumroadWebhookPayload {
  sale_id: string;
  email: string;
  product_name: string;
  product_id: string;
  license_key: string | null;
  timestamp: string;
  amount_cents: number;
  currency: string;
  is_gift: boolean;
  event: string;
}

export interface Release {
  id: string;
  version: string;
  published_at: string;
  changelog: string;
  docker_tag: string;
  min_upgradable_version: string;
  created_at: string;
}

export interface UpdateManifest {
  latest_version: string;
  current_version: string;
  update_available: boolean;
  published_at: string;
  changelog: string;
  docker_tag: string;
  min_upgradable_version: string;
}
