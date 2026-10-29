# Aurora Music

Aurora Music is a responsive music discovery player for Jamendo's independent catalog. It has separate Telugu, Hindi, and English lyric-language categories, song/artist search, full-length playback, playlists, favorites, and track-level attribution.

## Configure Jamendo

1. Create a Jamendo API client for this app in the [Jamendo Developer Portal](https://devportal.jamendo.com/signup).
2. Add its client ID in Replit **Tools → Secrets** as `JAMENDO_CLIENT_ID`. Never put the value in frontend code or commit it.
3. Run the API Server and Aurora Music web workflows. Without the secret, the app displays a configuration message instead of invented tracks.

The browser calls the app API; only the API server calls Jamendo. Full-length playback uses Jamendo's `audio` stream URL. Download actions are shown only when the API reports `audiodownload_allowed`.

## Run and check

- Web app: `pnpm --filter @workspace/aurora-music run dev`
- API server: `pnpm --filter @workspace/api-server run dev`
- Typecheck: `pnpm run typecheck`

The Replit preview starts the configured web and API workflows automatically. Favorites, playlists, and recently played metadata are stored in the current browser; audio files are not cached for offline use.

## Download permitted tracks

The included `scripts/download_jamendo.py` uses the Replit secret from `JAMENDO_CLIENT_ID`, filters by Jamendo lyric-language metadata, and downloads only tracks whose API response has `audiodownload_allowed` set to true and supplies a download URL. It records artist, license, and track-page credits in `credits.csv`.

Example:

```bash
python3 artifacts/aurora-music/scripts/download_jamendo.py --query "acoustic" --language English --limit 5
```

Downloaded files go under `music/<language>/`. Review each track's license and credit requirements before redistributing it.

## Publish

Add the Jamendo secret to the deployment environment before publishing. Jamendo's published API terms describe non-commercial API use by default; obtain separate licensing for commercial use. Recheck the current Jamendo terms, the app's rights, and each track's license before making the site public.
