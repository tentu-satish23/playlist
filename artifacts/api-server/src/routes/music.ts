import { Router, type IRouter, type Request, type Response } from "express";
import {
  GetJamendoTrackParams,
  GetJamendoTrackResponse,
  PrepareJamendoDownloadParams,
  PrepareJamendoDownloadResponse,
  SearchJamendoTracksQueryParams,
  SearchJamendoTracksResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const JAMENDO_TRACKS_URL = "https://api.jamendo.com/v3.0/tracks/";
const ALLOWED_IMAGE_HOSTS = new Set(["usercontent.jamendo.com", "images.jamendo.com"]);
const ALLOWED_TRACK_HOSTS = new Set(["www.jamendo.com", "jamendo.com"]);
const ALLOWED_LICENSE_HOSTS = new Set(["creativecommons.org"]);

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
  musicinfo?: {
    lang?: string;
    tags?: { genres?: string[] };
  };
};

type JamendoPayload = {
  headers?: {
    status?: string;
    code?: number;
  };
  results?: JamendoRawTrack[];
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

async function fetchJamendo(
  params: Record<string, string>,
  req: Request,
): Promise<CatalogResult> {
  const clientId = process.env["JAMENDO_CLIENT_ID"];
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
    if (!response.ok) {
      req.log.warn({ status: response.status }, "Jamendo catalog request failed");
      return { kind: "unavailable" };
    }

    const payload = (await response.json()) as JamendoPayload;
    if (payload.headers?.status !== "success" || !Array.isArray(payload.results)) {
      req.log.warn({ apiCode: payload.headers?.code }, "Jamendo returned an unsuccessful response");
      return { kind: "unavailable" };
    }
    return { kind: "ok", tracks: payload.results };
  } catch (error) {
    req.log.warn(
      { errorName: error instanceof Error ? error.name : "UnknownError" },
      "Jamendo catalog request failed",
    );
    return { kind: "unavailable" };
  }
}

function sendCatalogError(res: Response, result: CatalogResult): void {
  res.setHeader("Cache-Control", "no-store");
  if (result.kind === "missing-secret") {
    res.status(503).json({ error: "Jamendo is not configured. Add JAMENDO_CLIENT_ID in Replit Secrets." });
    return;
  }
  res.status(502).json({ error: "Jamendo is temporarily unavailable. Please try again." });
}

function returnTrackNotFound(res: Response): void {
  res.setHeader("Cache-Control", "no-store");
  res.status(404).json({ error: "This track is no longer available from Jamendo." });
}

router.get("/music/tracks", async (req, res) => {
  const parsed = SearchJamendoTracksQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose Telugu, Hindi, or English and check the search details." });
    return;
  }

  const { language, term, limit } = parsed.data;
  const result = await fetchJamendo(
    {
      lang: language,
      limit: String(limit),
      order: "popularity_total",
      ...(term?.trim() ? { search: term.trim() } : {}),
    },
    req,
  );
  if (result.kind !== "ok") {
    sendCatalogError(res, result);
    return;
  }

  const tracks = result.tracks
    .map(mapTrack)
    .filter((track) => track.id && track.streamUrl);
  const validated = SearchJamendoTracksResponse.parse(tracks);
  res.setHeader("Cache-Control", "no-store");
  res.json(validated);
});

router.get("/music/tracks/:id", async (req, res) => {
  const parsed = GetJamendoTrackParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid Jamendo track ID." });
    return;
  }

  const result = await fetchJamendo({ id: parsed.data.id, limit: "1" }, req);
  if (result.kind !== "ok") {
    sendCatalogError(res, result);
    return;
  }

  const raw = result.tracks[0];
  const track = raw ? mapTrack(raw) : null;
  if (!track?.id || !track.streamUrl) {
    returnTrackNotFound(res);
    return;
  }

  res.setHeader("Cache-Control", "no-store");
  res.json(GetJamendoTrackResponse.parse(track));
});

router.post("/music/download/:id", async (req, res) => {
  const parsed = PrepareJamendoDownloadParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid Jamendo track ID." });
    return;
  }

  const result = await fetchJamendo({ id: parsed.data.id, limit: "1" }, req);
  if (result.kind !== "ok") {
    sendCatalogError(res, result);
    return;
  }

  const raw = result.tracks[0];
  if (!raw?.id) {
    returnTrackNotFound(res);
    return;
  }
  if (!isAllowed(raw.audiodownload_allowed)) {
    res.status(403).json({ error: "Jamendo does not permit downloading this track." });
    return;
  }

  const downloadUrl = safeJamendoStorageUrl(raw.audiodownload);
  if (!downloadUrl) {
    res.status(403).json({ error: "Jamendo has not provided a permitted download for this track." });
    return;
  }

  const validated = PrepareJamendoDownloadResponse.parse({ downloadUrl });
  res.setHeader("Cache-Control", "no-store");
  res.json(validated);
});

export default router;
