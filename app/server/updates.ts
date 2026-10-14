import installed from "./release.json";
import { readBody } from "./validation";

const RELEASE_URL = "https://raw.githubusercontent.com/rodrigoebeta/gpt-shoubox/main/app/server/release.json";
const CACHE_MS = 15 * 60 * 1000;
type Release = typeof installed;
let cached: { release: Release | null; expires: number } | undefined;
let checking: Promise<Release | null> | undefined;

export function releaseVersion(value: unknown): number[] {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})$/.test(value)) throw Error("Invalid release version");
  return value.split(".").map(Number);
}

export function newerRelease(latest: string, current: string): boolean {
  const left = releaseVersion(latest), right = releaseVersion(current);
  const index = left.findIndex((part, i) => part !== right[i]);
  return index !== -1 && left[index] > right[index];
}

async function fetchRelease(): Promise<Release | null> {
  try {
    const response = await fetch(RELEASE_URL, {
      headers: { Accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) { await response.body?.cancel(); return null; }
    const value = await readBody(response);
    if (!value || value.schema_version !== 1 || typeof value.summary !== "string" || value.summary.length > 500 ||
      Object.keys(value).some(key => !["schema_version", "version", "summary"].includes(key))) return null;
    releaseVersion(value.version);
    return { schema_version: 1, version: value.version, summary: value.summary };
  } catch { return null; }
}

export async function checkUpdates() {
  if (!cached || cached.expires <= Date.now()) {
    checking ??= fetchRelease().then(release => {
      cached = { release, expires: Date.now() + CACHE_MS };
      return release;
    }).finally(() => { checking = undefined; });
    await checking;
  }
  const release = cached!.release;
  return {
    installed_version: installed.version,
    status: !release ? "unavailable" : newerRelease(release.version, installed.version) ? "available" : "current",
    latest: release,
  };
}
