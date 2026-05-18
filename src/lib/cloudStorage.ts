export type CloudStorageProvider = "disabled" | "http";

export type CloudStorageStatus = {
  provider: CloudStorageProvider;
  configured: boolean;
  ready: boolean;
  endpointConfigured: boolean;
  tokenConfigured: boolean;
  mode: "disabled" | "ready" | "misconfigured";
};

export type CloudSyncResult = {
  skipped: boolean;
  ok: boolean;
  status: CloudStorageStatus;
  error?: string;
};

export type CloudRecord = {
  key: string;
  value: unknown;
  updatedAt?: string;
};

function normalizeProvider(value: string | undefined): CloudStorageProvider {
  return value?.trim().toLowerCase() === "http" ? "http" : "disabled";
}

function cloudEndpoint(): string {
  return process.env.TIU_CLOUD_STORAGE_URL?.trim() ?? "";
}

function cloudToken(): string {
  return process.env.TIU_CLOUD_STORAGE_TOKEN?.trim() ?? "";
}

function timeoutMs(): number {
  const value = Number(process.env.TIU_CLOUD_SYNC_TIMEOUT_MS);
  if (!Number.isFinite(value)) return 2500;
  return Math.min(15000, Math.max(500, Math.round(value)));
}

export function getCloudStorageStatus(): CloudStorageStatus {
  const provider = normalizeProvider(process.env.TIU_CLOUD_STORAGE_PROVIDER);
  const endpointConfigured = Boolean(cloudEndpoint());
  const tokenConfigured = Boolean(cloudToken());
  const ready = provider === "http" && endpointConfigured;

  return {
    provider,
    configured: provider !== "disabled",
    ready,
    endpointConfigured,
    tokenConfigured,
    mode: provider === "disabled" ? "disabled" : ready ? "ready" : "misconfigured",
  };
}

export async function pushCloudRecord(record: CloudRecord): Promise<CloudSyncResult> {
  return pushCloudRecords([record]);
}

export async function pushCloudRecords(records: CloudRecord[]): Promise<CloudSyncResult> {
  const status = getCloudStorageStatus();
  if (status.provider === "disabled") {
    return { skipped: true, ok: true, status };
  }

  if (!status.ready) {
    return { skipped: true, ok: false, status, error: "Cloud storage is configured but no endpoint URL is set." };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const token = cloudToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(cloudEndpoint(), {
      method: "POST",
      headers,
      body: JSON.stringify({
        source: "tiu-worldgame",
        schemaVersion: 1,
        records: records.map((record) => ({
          ...record,
          updatedAt: record.updatedAt ?? new Date().toISOString(),
        })),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return { skipped: false, ok: false, status, error: `Cloud storage returned HTTP ${response.status}.` };
    }

    return { skipped: false, ok: true, status };
  } catch (err) {
    return {
      skipped: false,
      ok: false,
      status,
      error: err instanceof Error ? err.message : "Cloud storage sync failed.",
    };
  } finally {
    clearTimeout(timer);
  }
}
