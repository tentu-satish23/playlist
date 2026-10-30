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

import { LANGUAGES, FEATURED_LANGUAGE_CODES, type Lang, type Language } from './languages';
type SavedTrack = Omit<JamendoTrack, 'streamUrl'> & { streamUrl?: string };
type Playlist = { id: string; name: string; tracks: SavedTrack[] };
type LibraryData = { saved: SavedTrack[]; recent: SavedTrack[]; playlists: Playlist[] };
const FEATURED_LANGS = LANGUAGES.filter(l => FEATURED_LANGUAGE_CODES.has(l.code));
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
function usePointerTilt() {
  const [style, setStyle] = useState<Record<string, string>>({});
  const onMove = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === 'touch') return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - .5;
    const y = (event.clientY - bounds.top) / bounds.height - .5;
    setStyle({ transform: `perspective(1100px) rotateY(${x * 3.5}deg) rotateX(${-y * 3.5}deg)` });
  };
  const onLeave = () => setStyle({ transform: 'perspective(1100px) rotateY(0deg) rotateX(0deg)' });
  return { style, onMove, onLeave };
}

function App() {
  const [location, navigate] = useLocation();
  const [library, setLibrary] = useState<LibraryData>(readLibrary);
  const [queue, setQueue] = useState<JamendoTrack[]>([]);
  const [queueSaved, setQueueSaved] = useState(false);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [playingTrack, setPlayingTrack] = useState<JamendoTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(.78);
  const [pendingTrackId, setPendingTrackId] = useState('');
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(library)); }, [library]);
  useEffect(() => {
    if (!toast) return;
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, [toast]);

  const showToast = (text: string, error = false) => setToast({ text, error });

  const toggleSave = (track: JamendoTrack | SavedTrack) => {
    const saved = toSaved(track as JamendoTrack);
    setLibrary(current => {
      const exists = current.saved.some(t => t.id === saved.id);
      return {
        ...current,
        saved: exists ? current.saved.filter(t => t.id !== saved.id) : [saved, ...current.saved],
      };
    });
    showToast(library.saved.some(t => t.id === track.id) ? 'Removed from library' : 'Saved to library');
  };

  const playSelection = (track: JamendoTrack, tracks: JamendoTrack[]) => {
    setQueue(tracks);
    setQueueSaved(false);
    const idx = tracks.findIndex(t => t.id === track.id);
    setQueueIndex(idx >= 0 ? idx : 0);
    setPlayingTrack(track);
    setIsPlaying(true);
    setLibrary(current => ({
      ...current,
      recent: [toSaved(track), ...current.recent.filter(t => t.id !== track.id)].slice(0, 40),
    }));
  };

  const playSavedSelection = (track: SavedTrack, tracks: SavedTrack[]) => {
    setPendingTrackId(track.id);
    setQueue(tracks as unknown as JamendoTrack[]);
    setQueueSaved(true);
    const idx = tracks.findIndex(t => t.id === track.id);
    setQueueIndex(idx >= 0 ? idx : 0);
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !playingTrack?.streamUrl) return;
    audio.src = playingTrack.streamUrl;
    audio.volume = volume;
    if (isPlaying) void audio.play().catch(() => showToast('Could not start playback', true));
    else audio.pause();
  }, [playingTrack, isPlaying]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  const onEnded = () => {
    if (queueIndex < queue.length - 1) {
      const next = queue[queueIndex + 1];
      setQueueIndex(queueIndex + 1);
      if (queueSaved) setPendingTrackId(next.id);
      else { setPlayingTrack(next); setIsPlaying(true); }
    } else setIsPlaying(false);
  };

  const playNext = () => {
    if (queueIndex < queue.length - 1) {
      const next = queue[queueIndex + 1];
      setQueueIndex(queueIndex + 1);
      if (queueSaved) setPendingTrackId(next.id);
      else { setPlayingTrack(next); setIsPlaying(true); }
    }
  };
  const playPrev = () => {
    if (queueIndex > 0) {
      const prev = queue[queueIndex - 1];
      setQueueIndex(queueIndex - 1);
      if (queueSaved) setPendingTrackId(prev.id);
      else { setPlayingTrack(prev); setIsPlaying(true); }
    }
  };

  return (
    <div className="app-shell">
      <aside className="side-nav" aria-label="Main">
        <Link href="/" className="brand" data-testid="link-home">
          <span className="brand-mark"><Sparkles size={16} /></span>
          <span>Aurora</span>
        </Link>
        <nav className="nav-list">
          {[ { href: '/', label: 'Discover', icon: Radio }, { href: '/search', label: 'Search', icon: Search }, { href: '/library', label: 'Your library', icon: Library } ].map(item => (
            <Link key={item.href} href={item.href} className={`nav-item${location === item.href || (item.href !== '/' && location.startsWith(item.href)) ? ' active' : ''}`}>
              <item.icon size={16} /> {item.label}
            </Link>
          ))}
        </nav>
        <p className="side-note">Full tracks from Jamendo · Independent catalog</p>
      </aside>
      <div className="main-column">
        <header className="top-bar">
          <div className="top-links">
            <Link href="/" className="top-link">Discover</Link>
            <Link href="/search" className="top-link">Search catalog</Link>
            <Link href="/library" className="top-link">Library</Link>
          </div>
        </header>
        <main className="page-body">
          <Switch>
            <Route path="/"><DiscoverPage playTrack={playSelection} saved={library.saved} toggleSave={toggleSave} /></Route>
            <Route path="/search"><SearchPage playTrack={playSelection} saved={library.saved} toggleSave={toggleSave} /></Route>
            <Route path="/library"><LibraryPage library={library} setLibrary={setLibrary} playTrack={playSavedSelection} toggleSave={toggleSave} /></Route>
            <Route><NotFound onHome={() => navigate('/')} /></Route>
          </Switch>
        </main>
      </div>
      {pendingTrackId && (
        <ResolveSavedTrack
          id={pendingTrackId}
          onResolved={(track) => { setPlayingTrack(track); setIsPlaying(true); setPendingTrackId(''); }}
          onError={(msg) => { showToast(msg, true); setPendingTrackId(''); }}
        />
      )}
      <Player
        track={playingTrack}
        playing={isPlaying}
        setPlaying={setIsPlaying}
        volume={volume}
        setVolume={setVolume}
        onPrevious={playPrev}
        onNext={playNext}
        audioRef={audioRef}
        onEnded={onEnded}
      />
      {toast && <div className={`toast${toast.error ? ' error' : ''}`} role="status">{toast.text}</div>}
      <audio ref={audioRef} onEnded={onEnded} preload="metadata" />
    </div>
  );
}

function ResolveSavedTrack({ id, onResolved, onError }: { id: string; onResolved: (track: JamendoTrack) => void; onError: (message: string) => void }) {
  const query = useGetJamendoTrack(id, { query: { enabled: Boolean(id), queryKey: getGetJamendoTrackQueryKey(id) } });
  const resolvedRef = useRef('');
  const successRef = useRef(onResolved); successRef.current = onResolved;
  const errorRef = useRef(onError); errorRef.current = onError;
  useEffect(() => {
    if (query.data && resolvedRef.current !== id) { resolvedRef.current = id; successRef.current(query.data); }
  }, [query.data, id]);
  useEffect(() => {
    if (query.isError) errorRef.current('Could not refresh this saved track. Check your connection and try again.');
  }, [query.isError, id]);
  return null;
}

function DiscoverPage({ playTrack, saved, toggleSave }: { playTrack: (track: JamendoTrack, tracks: JamendoTrack[]) => void; saved: SavedTrack[]; toggleSave: (track: JamendoTrack) => void }) {
  const tilt = usePointerTilt();
  const [, navigate] = useLocation();
  return <>
    <section className="hero" style={tilt.style} onPointerMove={tilt.onMove} onPointerLeave={tilt.onLeave} aria-label="Aurora music discovery">
      <div className="hero-copy">
        <div className="eyebrow">A wider world, in full</div>
        <h1>Hear the<br /><span>elsewhere.</span></h1>
        <p>Independent voices, full-length tracks. Wander through a living catalog and let the music find its way to you.</p>
        <Link href="/search" className="hero-button" data-testid="link-explore-songs"><Play size={14} fill="currentColor" /> Search the catalog <ArrowRight size={14} /></Link>
      </div>
      <div className="hero-visual" aria-hidden="true"><div className="orbit" /><div className="orbit" /><div className="orbit" /><div className="orb-core" /></div>
    </section>
    <section className="section">
      <div className="section-head"><div><div className="section-kicker">Choose a language</div><h2>Twenty-six doors. No borders.</h2><p>Discover independent music through lyric-language tags.</p></div><span className="top-meta"><Globe2 size={13} /> JAMENDO CATALOG</span></div>
      <div className="language-grid">{LANGUAGES.map(language => <button className="language-tile" key={language.code} onClick={() => navigate(`/search?language=${language.code}`)} data-testid={`button-language-${language.code}`}><strong>{language.label}</strong><span>{language.descriptor}</span></button>)}</div>
    </section>
    {FEATURED_LANGS.map(language => <LanguageShelf key={language.code} language={language} playTrack={playTrack} saved={saved} toggleSave={toggleSave} />)}
    <p className="notice" style={{ marginTop: 40 }}>All 26 languages use Jamendo lyric-language tags; coverage varies by language. Library and playlists are stored in this browser. Review each track’s license and Jamendo API terms before commercial use.</p>
  </>;
}

function LanguageShelf({ language, playTrack, saved, toggleSave }: { language: Language; playTrack: (track: JamendoTrack, tracks: JamendoTrack[]) => void; saved: SavedTrack[]; toggleSave: (track: JamendoTrack) => void }) {
  const query = useSearchJamendoTracks({ language: language.code, limit: 8 }, { query: { queryKey: getSearchJamendoTracksQueryKey({ language: language.code, limit: 8 }) } });
  return (
    <section className="section">
      <div className="section-head">
        <div><div className="section-kicker">{language.label}</div><h2>{language.descriptor}</h2></div>
        <Link href={`/search?language=${language.code}`} className="text-link">See more <ArrowRight size={13} /></Link>
      </div>
      {query.isLoading && <LoadingGrid />}
      {query.isError && <ApiError message={(query.error as Error)?.message || 'Could not load tracks'} retry={() => query.refetch()} />}
      {query.data && <TrackGrid tracks={query.data} playTrack={playTrack} saved={saved} toggleSave={toggleSave} />}
    </section>
  );
}

function SearchPage({ playTrack, saved, toggleSave }: { playTrack: (track: JamendoTrack, tracks: JamendoTrack[]) => void; saved: SavedTrack[]; toggleSave: (track: JamendoTrack) => void }) {
  const [location] = useLocation();
  const initial = useMemo(() => new URLSearchParams(location.split('?')[1] || ''), [location]);
  const [term, setTerm] = useState(initial.get('q') || '');
  const [language, setLanguage] = useState<Lang>((LANGUAGES.some(l => l.code === (initial.get('language') || '')) ? initial.get('language') : 'en') as Lang);
  const [submitted, setSubmitted] = useState({ term: initial.get('q') || '', language: (initial.get('language') || 'en') as Lang });

  useEffect(() => {
    const params = new URLSearchParams(location.split('?')[1] || '');
    if (params.get('q') != null) setTerm(params.get('q') || '');
    if (LANGUAGES.some(l => l.code === (params.get('language') || ''))) setLanguage(params.get('language') as Lang);
  }, [location]);

  const query = useSearchJamendoTracks(
    { language: submitted.language, term: submitted.term || undefined, limit: 24 },
    { query: { enabled: true, queryKey: getSearchJamendoTracksQueryKey({ language: submitted.language, term: submitted.term || undefined, limit: 24 }) } },
  );

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted({ term: term.trim(), language });
  };

  return (
    <div className="search-page">
      <form className="search-bar" onSubmit={onSubmit}>
        <div className="search-field"><Search size={17} className="search-icon" /><input className="search-input" value={term} onChange={event => setTerm(event.target.value)} placeholder="Try a song title or artist" aria-label="Search songs and artists" data-testid="input-search" /></div>
        <select className="language-select" value={language} onChange={event => setLanguage(event.target.value)} aria-label="Language">
          {LANGUAGES.map(item => <option key={item.code} value={item.code}>{item.label}</option>)}
        </select>
        <button className="button-primary" type="submit" data-testid="button-search">Search</button>
      </form>
      {query.isLoading && <LoadingGrid />}
      {query.isError && <ApiError message={(query.error as Error)?.message || 'Search failed'} retry={() => query.refetch()} />}
      {query.data && query.data.length > 0 && <TrackGrid tracks={query.data} playTrack={playTrack} saved={saved} toggleSave={toggleSave} />}
      {query.data && query.data.length === 0 && !query.isLoading && (
        <div className="empty-state"><div className="empty-icon"><Globe2 size={20} /></div><h3>Somewhere new is one search away</h3><p>Search by title or artist. Start with a language that feels like home.</p><div className="language-grid" style={{ width: '100%', maxWidth: 700, marginTop: 14 }}>{LANGUAGES.map(item => <button key={item.code} className="language-tile" onClick={() => setLanguage(item.code)}><strong>{item.label}</strong><span>{item.prompt}</span></button>)}</div></div>
      )}
    </div>
  );
}

function LibraryPage({ library, setLibrary, playTrack, toggleSave }: { library: LibraryData; setLibrary: (fn: (c: LibraryData) => LibraryData) => void; playTrack: (track: SavedTrack, tracks: SavedTrack[]) => void; toggleSave: (track: JamendoTrack | SavedTrack) => void }) {
  const [tab, setTab] = useState<'saved' | 'recent' | 'playlists'>('saved');
  const [name, setName] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const selectedPlaylist = library.playlists.find(item => item.id === selectedId);
  const tracks = tab === 'saved' ? library.saved : tab === 'recent' ? library.recent : (selectedPlaylist?.tracks ?? []);

  const createPlaylist = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    const playlist = { id: `pl-${Date.now()}`, name: name.trim(), tracks: [] as SavedTrack[] };
    setLibrary(current => ({ ...current, playlists: [playlist, ...current.playlists] }));
    setSelectedId(playlist.id); setName(''); setTab('playlists');
  };

  const deletePlaylist = () => {
    if (!selectedPlaylist) return;
    setLibrary(current => ({ ...current, playlists: current.playlists.filter(item => item.id !== selectedPlaylist.id) }));
    setSelectedId('');
  };

  const removeFromPlaylist = (id: string) => {
    if (!selectedPlaylist) return;
    setLibrary(current => ({ ...current, playlists: current.playlists.map(item => item.id === selectedPlaylist.id ? { ...item, tracks: item.tracks.filter(track => track.id !== id) } : item) }));
  };

  return (
    <div className="library-page">
      <div className="library-tabs">
        {(['saved', 'recent', 'playlists'] as const).map(t => (
          <button key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t === 'saved' ? 'Saved' : t === 'recent' ? 'Recent' : 'Playlists'}</button>
        ))}
      </div>
      {tab === 'playlists' && (
        <form className="playlist-form" onSubmit={createPlaylist}><input value={name} onChange={event => setName(event.target.value)} placeholder="Name a new playlist" aria-label="New playlist name" maxLength={48} data-testid="input-playlist-name" /><button className="button-primary" type="submit" disabled={!name.trim()}><Plus size={14} /> Create</button></form>
      )}
      {tab === 'playlists' && library.playlists.length > 0 && (
        <div className="playlist-list">{library.playlists.map(pl => (
          <button key={pl.id} className={`playlist-chip${selectedId === pl.id ? ' active' : ''}`} onClick={() => setSelectedId(pl.id)}>{pl.name} <span>{pl.tracks.length}</span></button>
        ))}</div>
      )}
      {tab === 'playlists' && selectedPlaylist && (
        <div className="playlist-actions"><strong>{selectedPlaylist.name}</strong><button className="icon-button" onClick={deletePlaylist} aria-label="Delete playlist"><Trash2 size={14} /></button></div>
      )}
      {tracks.length === 0 && <EmptyState title={tab === 'saved' ? 'Nothing saved yet' : tab === 'recent' ? 'No recent plays' : 'Empty playlist'} body="Save tracks from Discover or Search to build your library." />}
      {tracks.length > 0 && <TrackRows tracks={tracks} playTrack={playTrack} toggleSave={toggleSave} onRemove={tab === 'playlists' ? removeFromPlaylist : undefined} />}
    </div>
  );
}

function TrackGrid({ tracks, playTrack, saved, toggleSave }: { tracks: JamendoTrack[]; playTrack: (track: JamendoTrack, tracks: JamendoTrack[]) => void; saved: SavedTrack[]; toggleSave: (track: JamendoTrack) => void }) {
  return <div className="track-grid">{tracks.map(track => <TrackCard key={track.id} track={track} tracks={tracks} playTrack={playTrack} saved={saved} toggleSave={toggleSave} />)}</div>;
}

function TrackCard({ track, tracks, playTrack, saved, toggleSave }: { track: JamendoTrack; tracks: JamendoTrack[]; playTrack: (track: JamendoTrack, tracks: JamendoTrack[]) => void; saved: SavedTrack[]; toggleSave: (track: JamendoTrack) => void }) {
  const download = usePrepareJamendoDownload();
  const [downloadMessage, setDownloadMessage] = useState('');
  const prepareDownload = (id: string) => {
    setDownloadMessage('');
    download.mutate({ id }, {
      onSuccess: (data) => {
        if (data?.downloadUrl) { window.open(data.downloadUrl, '_blank', 'noopener,noreferrer'); setDownloadMessage('Download started'); }
        else setDownloadMessage('No download URL returned');
      },
      onError: () => setDownloadMessage('Download is not available for this track (Jamendo permission or network).'),
    });
  };
  const isSaved = saved.some(t => t.id === track.id);
  return (
    <article className="track-card">
      <button className="card-art" onClick={() => playTrack(track, tracks)} aria-label={`Play ${track.title}`}>
        {track.artworkUrl ? <img src={track.artworkUrl} alt="" /> : <div className="art-fallback"><Music2 size={28} /></div>}
        <span className="play-overlay"><Play size={18} fill="currentColor" /></span>
      </button>
      <div className="card-meta">
        <strong>{track.title}</strong>
        <span>{track.artist}</span>
        <div className="card-actions">
          <button className="icon-button" onClick={() => toggleSave(track)} aria-label={isSaved ? 'Remove from library' : 'Save to library'}><Heart size={14} fill={isSaved ? 'currentColor' : 'none'} /></button>
          <button className="card-download" onClick={() => prepareDownload(track.id)} disabled={download.isPending || !track.downloadAllowed} aria-label={track.downloadAllowed ? `Download ${track.title}` : `Download not permitted for ${track.title}`} title={track.downloadAllowed ? 'Download this track' : 'Jamendo does not allow download for this track'}><Download size={14} /></button>
        </div>
        {downloadMessage && <span className="download-hint">{downloadMessage}</span>}
      </div>
    </article>
  );
}

function TrackRows({ tracks, playTrack, toggleSave, onRemove }: { tracks: SavedTrack[]; playTrack: (track: SavedTrack, tracks: SavedTrack[]) => void; toggleSave: (track: JamendoTrack | SavedTrack) => void; onRemove?: (id: string) => void }) {
  const download = usePrepareJamendoDownload();
  const [downloadError, setDownloadError] = useState('');
  const startDownload = (track: SavedTrack) => {
    setDownloadError('');
    download.mutate({ id: track.id }, {
      onSuccess: (data) => { if (data?.downloadUrl) window.open(data.downloadUrl, '_blank', 'noopener,noreferrer'); else setDownloadError('No download URL'); },
      onError: () => setDownloadError('Download is not available for this track (Jamendo permission or network).'),
    });
  };
  return (
    <div className="track-rows">
      {downloadError && <p className="notice error">{downloadError}</p>}
      {tracks.map(track => (
        <div className="track-row" key={track.id}>
          <button className="row-main" onClick={() => playTrack(track, tracks)}>
            {track.artworkUrl ? <img src={track.artworkUrl} alt="" /> : <div className="art-fallback small"><Music2 size={16} /></div>}
            <div><strong>{track.title}</strong><span>{track.artist}</span></div>
          </button>
          <button className="icon-button" onClick={() => toggleSave(track)} aria-label="Toggle save"><Heart size={15} /></button>
          <button className="icon-button" onClick={() => startDownload(track)} disabled={download.isPending || !track.downloadAllowed} aria-label={track.downloadAllowed ? `Download ${track.title}` : `Download not permitted for ${track.title}`} title={track.downloadAllowed ? (download.isPending ? 'Preparing download' : 'Download this track') : 'Jamendo does not allow download for this track'}><Download size={15} /></button>
          {onRemove && <button className="icon-button" onClick={() => onRemove(track.id)} aria-label="Remove from playlist"><Trash2 size={15} /></button>}
        </div>
      ))}
    </div>
  );
}

function LoadingGrid() {
  return <div className="track-grid">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="track-card skeleton" />)}</div>;
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return <div className="empty-state"><div className="empty-icon"><Library size={20} /></div><h3>{title}</h3><p>{body}</p></div>;
}

function ApiError({ message, retry }: { message: string; retry: () => void }) {
  const needsKey = /JAMENDO_CLIENT_ID|not configured/i.test(message);
  return <div className="empty-state error">
    <div className="empty-icon"><Activity size={20} /></div>
    <h3>{needsKey ? 'Catalog not connected' : 'Something went wrong'}</h3>
    <p>{needsKey ? 'Add JAMENDO_CLIENT_ID in Vercel Environment Variables, then redeploy.' : message}</p>
    <button className="button-primary" type="button" onClick={retry}>Try again</button>
  </div>;
}

function Player({ track, playing, setPlaying, volume, setVolume, onPrevious, onNext, audioRef, onEnded }: {
  track: JamendoTrack | null; playing: boolean; setPlaying: (v: boolean) => void; volume: number; setVolume: (v: number) => void;
  onPrevious: () => void; onNext: () => void; audioRef: React.RefObject<HTMLAudioElement | null>; onEnded: () => void;
}) {
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [audioError, setAudioError] = useState(false);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrent(audio.currentTime);
    const onMeta = () => setDuration(audio.duration || 0);
    const onErr = () => setAudioError(true);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('error', onErr);
    return () => { audio.removeEventListener('timeupdate', onTime); audio.removeEventListener('loadedmetadata', onMeta); audio.removeEventListener('error', onErr); };
  }, [audioRef, track]);
  useEffect(() => { setAudioError(false); setCurrent(0); }, [track?.id]);
  return <>
    <footer className="player-bar">
      <div className="player-track">
        {track?.artworkUrl ? <img src={track.artworkUrl} alt="" /> : <div className="art-fallback small"><Disc3 size={18} /></div>}
        <div className="player-track-text">{track ? <><strong>{track.title}</strong><span>{track.artist}{track.album ? ` · ${track.album}` : ''}</span></> : <><strong>Choose a frequency</strong><span>Full tracks from Jamendo</span></>}</div>
      </div>
      <div className="player-main">
        <div className="player-controls">
          <button className="icon-button skip-control" onClick={onPrevious} disabled={!track} aria-label="Previous track" data-testid="button-previous"><SkipBack size={15} /></button>
          <button className="play-main" onClick={() => setPlaying(!playing)} disabled={!track} aria-label={playing ? 'Pause track' : 'Play track'} data-testid="button-player-toggle">{playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}</button>
          <button className="icon-button skip-control" onClick={onNext} disabled={!track} aria-label="Next track" data-testid="button-next"><SkipForward size={15} /></button>
        </div>
        <div className="progress-row"><span>{formatTime(current)}</span><input className="progress-range" type="range" min="0" max={duration || 1} step=".1" value={Math.min(current, duration || 1)} aria-label="Track position" onChange={event => { if (audioRef.current) audioRef.current.currentTime = Number(event.target.value); }} disabled={!track} /><span>{formatTime(duration)}</span></div>
      </div>
      <div className="player-volume">
        <button className="icon-button" aria-label={muted ? 'Unmute' : 'Mute'} onClick={() => { setMuted(!muted); if (audioRef.current) audioRef.current.muted = !muted; }}><Volume2 size={16} /></button>
        <input type="range" min="0" max="1" step=".01" value={volume} aria-label="Volume" onChange={event => setVolume(Number(event.target.value))} />
        {track && <div className="player-links"><a href={track.trackUrl} target="_blank" rel="noreferrer">Jamendo track</a><a href={track.licenseUrl} target="_blank" rel="noreferrer">CC license</a></div>}
      </div>
      {audioError && <span className="player-error">Stream unavailable</span>}
    </footer>
  </>;
}

function NotFound({ onHome }: { onHome: () => void }) {
  return <div className="empty-state" style={{ marginTop: 70 }}><div className="empty-icon"><Headphones size={20} /></div><h3>This track isn’t on the map</h3><p>That page drifted out of range. Let’s tune back in.</p><button className="button-primary" onClick={onHome}><ArrowLeft size={14} /> Back to discovery</button></div>;
}

export default App;
