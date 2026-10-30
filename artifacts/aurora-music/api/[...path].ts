/**
 * Standalone Vercel serverless API for Aurora Music.
 * Mirrors artifacts/api-server music + health routes using native fetch
 * so the frontend can call /api/* on the same origin without Express.
 */

export const config = {
  maxDuration: 30,
};

type Req = {
  method?: string;
  url?: string;
  query: Record<string, string | string[] | undefined>;
};

type Res = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => Res;
  json: (body: unknown) => void;
  end: () => void;
};

const JAMENDO_TRACKS_URL = "https://api.jamendo.com/v3.0/tracks/";
const ALLOWED_IMAGE_HOSTS = new Set(["usercontent.jamendo.com", "images.jamendo.com"]);
const ALLOWED_TRACK_HOSTS = new Set(["www.jamendo.com", "jamendo.com"]);
const ALLOWED_LICENSE_HOSTS = new Set(["creativecommons.org"]);
const LANGS = new Set(["te", "hi", "en"]);

type JamendoRawTrack = {
  id?: string;
  name?: string;
  artist_name?: string;
  album_name?: string;
  album_image?: string;
  image?: string;
  audio?: string;
  audiodownload?: string;
  audiodownload_allowed?: boolean | number | string;
  duration?: number;
  license_ccurl?: string;
  shareurl?: string;
  musicinfo?: { lang?: string; tags?: { genres?: string[] } };
};

type CatalogResult =
  | { kind: "ok"; tracks: JamendoRawTrack[] }
  | { kind: "missing-secret" }
  | { kind: "unavailable" };

function isAllowed(value: JamendoRawTrack["audiodownload_allowed"]): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}

function safeHttpsUrl(value: unknown, hosts: Set<string>): string {
  if (typeof value !== "string" || !value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !hosts.has(url.hostname)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function safeJamendoStorageUrl(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".storage.jamendo.com")) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function mapTrack(raw: JamendoRawTrack) {
  const id = String(raw.id ?? "");
  const licenseUrl =
    typeof raw.license_ccurl === "string" && raw.license_ccurl.startsWith("http://creativecommons.org/")
      ? raw.license_ccurl.replace(/^http:/, "https:")
      : safeHttpsUrl(raw.license_ccurl, ALLOWED_LICENSE_HOSTS);

  return {
    id,
    title: raw.name?.trim() || "Untitled",
    artist: raw.artist_name?.trim() || "Unknown artist",
    album: raw.album_name?.trim() || "Single",
    artworkUrl:
      safeHttpsUrl(raw.album_image, ALLOWED_IMAGE_HOSTS) ||
      safeHttpsUrl(raw.image, ALLOWED_IMAGE_HOSTS),
    streamUrl: safeJamendoStorageUrl(raw.audio),
    durationSeconds: Math.max(0, Math.trunc(raw.duration ?? 0)),
    genre: raw.musicinfo?.tags?.genres?.[0] || "Independent",
    language: raw.musicinfo?.lang || "",
    licenseUrl,
    trackUrl: safeHttpsUrl(raw.shareurl, ALLOWED_TRACK_HOSTS),
    downloadAllowed: isAllowed(raw.audiodownload_allowed),
  };
}

async function fetchJamendo(params: Record<string, string>): Promise<CatalogResult> {
  const clientId = process.env.JAMENDO_CLIENT_ID;
  if (!clientId) return { kind: "missing-secret" };

  const url = new URL(JAMENDO_TRACKS_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("format", "json");
  url.searchParams.set("audioformat", "mp32");
  url.searchParams.set("imagesize", "600");
  url.searchParams.set("include", "licenses,musicinfo");
  url.searchParams.set("type", "single albumtrack");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (!response.ok) return { kind: "unavailable" };
    const payload = (await response.json()) as {
      headers?: { status?: string; code?: number };
      results?: JamendoRawTrack[];
    };
    if (payload.headers?.status !== "success" || !Array.isArray(payload.results)) {
      return { kind: "unavailable" };
    }
    return { kind: "ok", tracks: payload.results };
  } catch {
    return { kind: "unavailable" };
  }
}

function json(res: Res, status: number, body: unknown) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json");
  res.status(status).json(body);
}

function catalogError(res: Res, result: CatalogResult) {
  if (result.kind === "missing-secret") {
    json(res, 503, {
      error: "Jamendo is not configured. Add JAMENDO_CLIENT_ID in Vercel Environment Variables.",
    });
    return;
  }
  json(res, 502, { error: "Jamendo is temporarily unavailable. Please try again." });
}

function apiPath(req: Req): string {
  const raw = (req.url ?? "/").split("?")[0] || "/";
  return raw.replace(/^\/api/, "") || "/";
}

export default async function handler(req: Req, res: Res) {
  const method = (req.method ?? "GET").toUpperCase();
  const path = apiPath(req);

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (method === "GET" && (path === "/healthz" || path === "/healthz/")) {
    json(res, 200, { status: "ok" });
    return;
  }

  if (method === "GET" && (path === "/music/tracks" || path === "/music/tracks/")) {
    const language = String(req.query.language ?? "");
    const term = req.query.term != null ? String(req.query.term) : undefined;
    const limitRaw = Number(req.query.limit ?? 20);
    const limit = Number.isFinite(limitRaw) ? Math.min(50, Math.max(1, Math.trunc(limitRaw))) : 20;

    if (!LANGS.has(language)) {
      json(res, 400, {
        error: "Choose Telugu, Hindi, or English and check the search details.",
      });
      return;
    }

    const result = await fetchJamendo({
      lang: language,
      limit: String(limit),
      order: "popularity_total",
      ...(term?.trim() ? { search: term.trim() } : {}),
    });
    if (result.kind !== "ok") {
      catalogError(res, result);
      return;
    }

    const tracks = result.tracks.map(mapTrack).filter((t) => t.id && t.streamUrl);
    json(res, 200, tracks);
    return;
  }

  const trackMatch = path.match(/^\/music\/tracks\/([^/]+)\/?$/);
  if (method === "GET" && trackMatch) {
    const id = decodeURIComponent(trackMatch[1]);
    const result = await fetchJamendo({ id, limit: "1" });
    if (result.kind !== "ok") {
      catalogError(res, result);
      return;
    }
    const raw = result.tracks[0];
    const track = raw ? mapTrack(raw) : null;
    if (!track?.id || !track.streamUrl) {
      json(res, 404, { error: "This track is no longer available from Jamendo." });
      return;
    }
    json(res, 200, track);
    return;
  }

  const downloadMatch = path.match(/^\/music\/download\/([^/]+)\/?$/);
  if (method === "POST" && downloadMatch) {
    const id = decodeURIComponent(downloadMatch[1]);
    const result = await fetchJamendo({ id, limit: "1" });
    if (result.kind !== "ok") {
      catalogError(res, result);
      return;
    }
    const raw = result.tracks[0];
    if (!raw?.id) {
      json(res, 404, { error: "This track is no longer available from Jamendo." });
      return;
    }
    if (!isAllowed(raw.audiodownload_allowed)) {
      json(res, 403, { error: "Jamendo does not permit downloading this track." });
      return;
    }
    const downloadUrl = safeJamendoStorageUrl(raw.audiodownload);
    if (!downloadUrl) {
      json(res, 403, {
        error: "Jamendo has not provided a permitted download for this track.",
      });
      return;
    }
    json(res, 200, { downloadUrl });
    return;
  }

  json(res, 404, { error: "Not found" });
}
