/**
 * Standalone Vercel serverless API for Aurora Music.
 * Plain JS so it is not blocked by the frontend tsconfig "noEmit": true.
 */

export const config = {
  maxDuration: 30,
};

const JAMENDO_TRACKS_URL = "https://api.jamendo.com/v3.0/tracks/";
const ALLOWED_IMAGE_HOSTS = new Set(["usercontent.jamendo.com", "images.jamendo.com"]);
const ALLOWED_TRACK_HOSTS = new Set(["www.jamendo.com", "jamendo.com"]);
const ALLOWED_LICENSE_HOSTS = new Set(["creativecommons.org"]);
const LANG_RE = /^[a-z]{2,8}$/i;

function isAllowed(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function safeHttpsUrl(value, hosts) {
  if (typeof value !== "string" || !value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !hosts.has(url.hostname)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function safeJamendoStorageUrl(value) {
  if (typeof value !== "string" || !value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".storage.jamendo.com")) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function mapTrack(raw) {
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

async function fetchJamendo(params) {
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

  let response;
  try {
    response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    });
  } catch {
    return { kind: "upstream" };
  }

  if (!response.ok) return { kind: "upstream" };

  let body;
  try {
    body = await response.json();
  } catch {
    return { kind: "upstream" };
  }

  if (body?.headers?.status !== "success") {
    return { kind: "upstream" };
  }

  return { kind: "ok", tracks: Array.isArray(body.results) ? body.results : [] };
}

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

function catalogError(res, result) {
  if (result.kind === "missing-secret") {
    json(res, 503, {
      error: "Jamendo is not configured. Set JAMENDO_CLIENT_ID in the project environment.",
    });
    return;
  }
  json(res, 502, { error: "Jamendo catalog is temporarily unavailable." });
}

export default async function handler(req, res) {
  const method = (req.method || "GET").toUpperCase();
  const rawPath = req.url ? req.url.split("?")[0] : "/";
  // Vercel catch-all: /api/foo/bar -> path = /foo/bar after stripping /api
  let path = rawPath;
  if (path.startsWith("/api")) path = path.slice(4) || "/";
  if (!path.startsWith("/")) path = "/" + path;

  if (method === "GET" && (path === "/healthz" || path === "/healthz/")) {
    json(res, 200, { status: "ok" });
    return;
  }

  if (method === "GET" && (path === "/music/tracks" || path === "/music/tracks/")) {
    const language = String(req.query.language ?? "");
    const term = req.query.term != null ? String(req.query.term) : undefined;
    const limitRaw = Number(req.query.limit ?? 20);
    const limit = Number.isFinite(limitRaw) ? Math.min(50, Math.max(1, Math.trunc(limitRaw))) : 20;

    if (!LANG_RE.test(language)) {
      json(res, 400, {
        error: "Choose a valid language code (2-8 letters).",
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
