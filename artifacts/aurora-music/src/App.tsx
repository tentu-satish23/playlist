import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent, type ReactNode } from 'react';
import { Link, Route, Switch, useLocation } from 'wouter';
import {
  Activity, ArrowLeft, ArrowRight, AudioLines, Bookmark, Check, Disc3,
  Download, ExternalLink, Globe2, Headphones, Heart, Library, ListMusic, Music2,
  Pause, Play, Plus, Radio, RotateCcw, Search, SkipBack, SkipForward, Sparkles,
  Trash2, Volume2, X,
} from 'lucide-react';
import {
  getGetJamendoTrackQueryKey, getSearchJamendoTracksQueryKey,
  useGetJamendoTrack, usePrepareJamendoDownload, useSearchJamendoTracks,
} from '@workspace/api-client-react';
import type { JamendoTrack } from '@workspace/api-client-react';

import { LANGUAGES, FEATURED, type Lang, type Language } from './languages';
type SavedTrack = Omit<JamendoTrack, 'streamUrl'> & { streamUrl?: string };
type Playlist = { id: string; name: string; tracks: SavedTrack[] };
type LibraryData = { saved: SavedTrack[]; recent: SavedTrack[]; playlists: Playlist[] };
const STORAGE_KEY = 'aurora-jamendo-library-v2';
const EMPTY_LIBRARY: LibraryData = { saved: [], recent: [], playlists: [] };

function readLibrary(): LibraryData {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Partial<LibraryData>;
    return {
      saved: Array.isArray(value.saved) ? value.saved : [],
      recent: Array.isArray(value.recent) ? value.recent : [],
      playlists: Array.isArray(value.playlists) ? value.playlists : [],
    };
  } catch { return EMPTY_LIBRARY; }
}
function toSaved(track: JamendoTrack): SavedTrack {
  const { streamUrl: _streamUrl, ...metadata } = track;
  return metadata;
}
function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

export { readLibrary, toSaved, formatTime, STORAGE_KEY, EMPTY_LIBRARY };
export type { SavedTrack, Playlist, LibraryData };
export default function Placeholder() { return null; }
