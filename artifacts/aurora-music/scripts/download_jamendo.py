#!/usr/bin/env python3
"""Download Jamendo tracks only when audiodownload_allowed is true.

The API client ID is read from the JAMENDO_CLIENT_ID environment variable.
Track language filters are Jamendo lyric-language metadata, not folder labels.
"""

import argparse
import csv
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


API = "https://api.jamendo.com/v3.0/tracks/"
LANGUAGES = {
    "Telugu": "te",
    "Hindi": "hi",
    "English": "en",
}
USER_AGENT = "AuroraMusic/1.0 (Jamendo permitted-track downloader)"


def safe_name(value):
    value = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", value or "track")
    return re.sub(r"\s+", " ", value).strip()[:120] or "track"


def allowed_to_download(value):
    return value is True or value == 1 or value == "1" or value == "true"


def get_json(url, params, timeout=30):
    request_url = f"{url}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(
        request_url,
        headers={"Accept": "application/json", "User-Agent": USER_AGENT},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def download_bytes(url):
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname or not parsed.hostname.endswith(
        ".storage.jamendo.com"
    ):
        raise ValueError("Jamendo returned an unexpected download host.")

    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=90) as response:
        content_type = response.headers.get("Content-Type", "").lower()
        content = response.read()
    if "text/html" in content_type or len(content) < 1024:
        raise ValueError("Jamendo returned an empty or non-audio response.")
    return content


def main():
    parser = argparse.ArgumentParser(
        description="Download only Jamendo tracks explicitly marked download-allowed."
    )
    parser.add_argument("--query", required=True, help="Search terms, e.g. acoustic or Telugu")
    parser.add_argument("--limit", type=int, default=5)
    parser.add_argument(
        "--language",
        choices=sorted(LANGUAGES),
        default="English",
        help="Jamendo lyric-language filter and output folder",
    )
    args = parser.parse_args()

    client_id = os.environ.get("JAMENDO_CLIENT_ID")
    if not client_id:
        sys.exit("Add JAMENDO_CLIENT_ID as a Replit Secret before using the downloader.")

    limit = max(1, min(args.limit, 50))
    params = {
        "client_id": client_id,
        "format": "json",
        "limit": str(limit),
        "search": args.query,
        "lang": LANGUAGES[args.language],
        "audioformat": "mp32",
        "include": "licenses,musicinfo",
        "order": "popularity_total",
        "type": "single albumtrack",
    }

    try:
        payload = get_json(API, params)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        sys.exit(f"Could not reach Jamendo: {type(exc).__name__}")

    if payload.get("headers", {}).get("status") != "success":
        sys.exit("Jamendo returned an unsuccessful API response.")

    project_dir = Path(__file__).resolve().parents[1]
    output_dir = project_dir / "music" / args.language
    credits_path = project_dir / "credits.csv"
    fields = [
        "language_folder",
        "title",
        "artist",
        "license_url",
        "track_page",
        "downloaded_file",
    ]
    rows = []

    for track in payload.get("results", []):
        if not allowed_to_download(track.get("audiodownload_allowed")):
            print("Skipping (Jamendo does not permit downloads):", track.get("name", "Unknown"))
            continue

        download_url = track.get("audiodownload")
        if not isinstance(download_url, str) or not download_url:
            print("Skipping (Jamendo supplied no download URL):", track.get("name", "Unknown"))
            continue

        title = safe_name(track.get("name"))
        artist = safe_name(track.get("artist_name"))
        filename = f"{artist} - {title}.mp3"
        destination = output_dir / filename
        temporary = destination.with_suffix(".mp3.part")

        try:
            content = download_bytes(download_url)
            output_dir.mkdir(parents=True, exist_ok=True)
            temporary.write_bytes(content)
            temporary.replace(destination)
            rows.append(
                {
                    "language_folder": args.language,
                    "title": track.get("name", ""),
                    "artist": track.get("artist_name", ""),
                    "license_url": track.get("license_ccurl", ""),
                    "track_page": track.get("shareurl", ""),
                    "downloaded_file": str(destination.relative_to(project_dir)),
                }
            )
            print("Downloaded permitted track:", destination.name)
        except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
            temporary.unlink(missing_ok=True)
            print("Download failed:", filename, "-", type(exc).__name__)

    if rows:
        write_header = not credits_path.exists()
        with credits_path.open("a", newline="", encoding="utf-8") as credits_file:
            writer = csv.DictWriter(credits_file, fieldnames=fields)
            if write_header:
                writer.writeheader()
            writer.writerows(rows)

    print(f"Finished. Downloaded {len(rows)} Jamendo-permitted track(s). Review credits.csv and licenses.")


if __name__ == "__main__":
    main()
