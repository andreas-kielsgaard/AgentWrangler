import { requestJson } from "@agent-wrangler/http-transport";
import { runtimeById } from "./runtime-catalog.mjs";

export const defaultScanPorts = Object.freeze([4101, 4102, 4103, 4104, 4105, 4106, 4110]);

function normalizeHost(raw) {
  const host = String(raw ?? "").trim();
  if (!host || !/^[a-zA-Z0-9.:-]+$/.test(host)) throw new Error(`Invalid scan host '${raw}'.`);
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

export async function scanRuntimeEndpoints({
  hosts = ["127.0.0.1"],
  ports = defaultScanPorts,
  timeoutMs = 350,
  request = requestJson,
} = {}) {
  const candidates = [];
  for (const rawHost of hosts) {
    const host = normalizeHost(rawHost);
    for (const port of ports) candidates.push({ host, port, baseUrl: `http://${host}:${port}` });
  }

  const inspected = await Promise.all(candidates.map(async (candidate) => {
    try {
      const result = await request(`${candidate.baseUrl}/identity`, { timeoutMs });
      const runtime = runtimeById.get(result.body?.runtime?.id);
      if (result.statusCode < 200 || result.statusCode >= 300 || !runtime) return null;
      return {
        key: `${runtime.owner}@${candidate.baseUrl}`,
        owner: runtime.owner,
        runtimeId: runtime.runtimeId,
        name: result.body.runtime.name ?? runtime.name,
        baseUrl: candidate.baseUrl,
        processId: result.body.processId ?? null,
        host: result.body.host ?? candidate.host,
        port: result.body.port ?? candidate.port,
        startedAt: result.body.startedAt ?? null,
      };
    } catch {
      return null;
    }
  }));

  return inspected.filter(Boolean).sort((left, right) => left.baseUrl.localeCompare(right.baseUrl));
}

