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

type Lang = 'te' | 'hi' | 'en';
type Language = { code: Lang; label: string; descriptor: string; prompt: string };
type SavedTrack = Omit<JamendoTrack, 'streamUrl'> & { streamUrl?: string };
type Playlist = { id: string; name: string; tracks: SavedTrack[] };
type LibraryData = { saved: SavedTrack[]; recent: SavedTrack[]; playlists: Playlist[] };
const LANGUAGES: Language[] = [
  { code: 'te', label: 'Telugu', descriptor: 'A new current from South India', prompt: 'Find Telugu songs and artists' },
  { code: 'hi', label: 'Hindi', descriptor: 'Melody with a wide horizon', prompt: 'Find Hindi songs and artists' },
  { code: 'en', label: 'English', descriptor: 'Independent voices, everywhere', prompt: 'Find English songs and artists' },
];
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
    toastTimer.current = setTimeout(() => setToast(null), 3400);
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, [toast]);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    if (playingTrack?.streamUrl) {
      if (audio.src !== new URL(playingTrack.streamUrl, window.location.href).href) audio.src = playingTrack.streamUrl;
      if (isPlaying) void audio.play().catch(() => { setIsPlaying(false); setToast({ text: 'This stream could not start. Try another track.', error: true }); });
      else audio.pause();
    } else {
      audio.pause();
      audio.removeAttribute('src');
    }
  }, [playingTrack, isPlaying, volume]);

  const startTrack = (track: JamendoTrack, nextQueue: JamendoTrack[], index: number, savedQueue = false) => {
    if (!track.streamUrl) { setToast({ text: 'A full stream is not available for this track.', error: true }); return; }
    setQueue(nextQueue); setQueueIndex(index); setQueueSaved(savedQueue);
    setPlayingTrack(track); setIsPlaying(true);
    const metadata = toSaved(track);
    setLibrary(current => ({ ...current, recent: [metadata, ...current.recent.filter(item => item.id !== track.id)].slice(0, 50) }));
  };
  const playAt = (index: number) => {
    const item = queue[index];
    if (!item) return;
    if (queueSaved) setPendingTrackId(item.id);
    else startTrack(item, queue, index);
  };
  const playSelection = (track: JamendoTrack, list: JamendoTrack[]) => {
    const index = Math.max(0, list.findIndex(item => item.id === track.id));
    startTrack(track, list, index);
  };
  const playSavedSelection = (track: SavedTrack, list: SavedTrack[]) => {
    const items = list.map(item => ({ ...item, streamUrl: '' })) as JamendoTrack[];
    const index = Math.max(0, items.findIndex(item => item.id === track.id));
    setQueue(items); setQueueIndex(index); setQueueSaved(true); setPendingTrackId(track.id);
  };
  const toggleSave = (track: JamendoTrack | SavedTrack) => {
    const saved = toSaved(track as JamendoTrack);
    setLibrary(current => ({
      ...current,
      saved: current.saved.some(item => item.id === track.id)
        ? current.saved.filter(item => item.id !== track.id)
        : [saved, ...current.saved],
    }));
  };
  const resolveTrack = (fresh: JamendoTrack) => {
    setPendingTrackId('');
    startTrack(fresh, queue, queueIndex, true);
  };
  const navItems = [
    { href: '/', label: 'Discover', icon: Sparkles },
    { href: '/search', label: 'Search', icon: Search },
    { href: '/library', label: 'Your library', icon: Library },
  ];
  const advance = (direction: number) => {
    if (!queue.length) return;
    const next = (queueIndex + direction + queue.length) % queue.length;
    if (queueSaved) {
      setQueueIndex(next);
      setPendingTrackId(queue[next].id);
    } else playAt(next);
  };

  return <div className="app-shell">
    <div className="ambient" aria-hidden="true" />
    <div className="app-layout">
      <aside className="sidebar" aria-label="Main navigation">
        <Link href="/" className="brand"><span className="brand-mark"><AudioLines size={19} /></span><span>Aurora</span></Link>
        <div className="nav-caption">Your listening room</div>
        <nav className="nav-list">
          {navItems.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`nav-link ${location === href ? 'active' : ''}`} data-testid={`link-${label.toLowerCase().replaceAll(' ', '-')}`}>
            <Icon size={17} strokeWidth={1.8} /><span>{label}</span>
          </Link>)}
        </nav>
        <div className="side-bottom"><strong>Independent music has no borders.</strong>Full-length listening, shared with care. All discoveries are powered by Jamendo.</div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <div className="top-links"><Link href="/" className="top-link">Discover</Link><Link href="/search" className="top-link">Search catalog</Link><Link href="/library" className="top-link">Library</Link></div>
          <div className="top-meta"><span className="live-dot" /> INDEPENDENT · OPEN TO THE WORLD</div>
        </header>
        <Switch>
          <Route path="/"><DiscoverPage playTrack={playSelection} saved={library.saved} toggleSave={toggleSave} /></Route>
          <Route path="/search"><SearchPage playTrack={playSelection} saved={library.saved} toggleSave={toggleSave} /></Route>
          <Route path="/library"><LibraryPage library={library} setLibrary={setLibrary} playTrack={playSavedSelection} toggleSave={toggleSave} /></Route>
          <Route><NotFound onHome={() => navigate('/')} /></Route>
        </Switch>
      </main>
    </div>
    {pendingTrackId && <ResolveSavedTrack id={pendingTrackId} onResolved={resolveTrack} onError={message => { setPendingTrackId(''); setToast({ text: message, error: true }); }} />}
    <Player track={playingTrack} playing={isPlaying} setPlaying={setIsPlaying} volume={volume} setVolume={setVolume} audioRef={audioRef}
      onNext={() => advance(1)} onPrevious={() => advance(-1)} onEnded={() => advance(1)} onError={() => setToast({ text: 'The audio stream ended unexpectedly. Try replaying the track.', error: true })} />
    {toast && <div className={`toast ${toast.error ? 'error' : ''}`} role="status">{toast.text}</div>}
  </div>;
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
      <div className="section-head"><div><div className="section-kicker">Choose a language</div><h2>Three doors. No borders.</h2><p>Discover independent music through lyric-language tags.</p></div><span className="top-meta"><Globe2 size={13} /> JAMENDO CATALOG</span></div>
      <div className="language-grid">{LANGUAGES.map(language => <button className="language-tile" key={language.code} onClick={() => navigate(`/search?language=${language.code}`)} data-testid={`button-language-${language.code}`}><strong>{language.label}</strong><span>{language.descriptor}</span></button>)}</div>
    </section>
    {LANGUAGES.map(language => <LanguageShelf key={language.code} language={language} playTrack={playTrack} saved={saved} toggleSave={toggleSave} />)}
    <p className="notice" style={{ marginTop: 40 }}>Telugu, Hindi and English categories use Jamendo lyric-language tags; results depend on catalog coverage. Review each track’s license and Jamendo API commercial terms before publishing commercially.</p>
  </>;
}

function LanguageShelf({ language, playTrack, saved, toggleSave }: { language: Language; playTrack: (track: JamendoTrack, tracks: JamendoTrack[]) => void; saved: SavedTrack[]; toggleSave: (track: JamendoTrack) => void }) {
  const [, navigate] = useLocation();
  const params = useMemo(() => ({ language: language.code, limit: 10 }), [language.code]);
  const result = useSearchJamendoTracks(params);
  const tracks = result.data ?? [];
  return <section className="section">
      <div className="section-head"><div><div className="section-kicker">{language.label} listening room</div><h2>{language.descriptor}</h2><p>Full tracks, streamed from the Jamendo catalog.</p></div><button className="text-button" onClick={() => navigate(`/search?language=${language.code}`)}>Explore {language.label} <ArrowRight size={13} /></button></div>
    {result.isLoading ? <LoadingGrid /> : result.isError ? <ApiError error={result.error} retry={() => void result.refetch()} /> : tracks.length ? <TrackGrid tracks={tracks} playTrack={playTrack} saved={saved} toggleSave={toggleSave} /> : <EmptyState title={`No ${language.label} tracks returned`} message="The Jamendo catalog has no matching tracks for this lyric-language tag right now." />}
  </section>;
}

function SearchPage({ playTrack, saved, toggleSave }: { playTrack: (track: JamendoTrack, tracks: JamendoTrack[]) => void; saved: SavedTrack[]; toggleSave: (track: JamendoTrack) => void }) {
  const [location] = useLocation();
  const initial = new URLSearchParams(window.location.search);
  const [term, setTerm] = useState(initial.get('term') || '');
  const [language, setLanguage] = useState<Lang>((['te', 'hi', 'en'].includes(initial.get('language') || '') ? initial.get('language') : 'en') as Lang);
  const [submitted, setSubmitted] = useState(false);
  const [submittedTerm, setSubmittedTerm] = useState('');
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('term') !== null) setTerm(params.get('term') || '');
    if (['te', 'hi', 'en'].includes(params.get('language') || '')) setLanguage(params.get('language') as Lang);
  }, [location]);
  const query = useMemo(() => ({ language, term: submittedTerm || undefined, limit: 30 }), [language, submittedTerm]);
  const result = useSearchJamendoTracks(query, { query: { enabled: submitted, queryKey: getSearchJamendoTracksQueryKey(query) } });
  const search = (event?: FormEvent) => {
    event?.preventDefault();
    setSubmittedTerm(term.trim());
    setSubmitted(true);
  };
  const clearSearch = () => { setTerm(''); setSubmittedTerm(''); setSubmitted(false); };
  const tracks = result.data ?? [];
  return <>
    <div className="section-kicker">The world is in the search field</div>
    <h1 className="page-title">Find your next<br />favorite sound.</h1>
    <p className="page-intro">Search Jamendo by song title or artist, then narrow the room by lyric language. Every result can play in full.</p>
    <form className="search-panel" onSubmit={search}>
      <div className="search-field"><Search size={17} className="search-icon" /><input className="search-input" value={term} onChange={event => setTerm(event.target.value)} placeholder="Try a song title or artist" aria-label="Search songs and artists" data-testid="input-search" /></div>
      <select className="filter-select" value={language} onChange={event => setLanguage(event.target.value as Lang)} aria-label="Filter by language" data-testid="select-language-filter">
        {LANGUAGES.map(item => <option key={item.code} value={item.code}>{item.label}</option>)}
      </select>
      <button className="button-primary" type="submit" data-testid="button-search"><Search size={14} /> Search</button>
    </form>
    <p className="notice">Language filters use Jamendo lyric-language tags; catalog coverage varies by language.</p>
    <div className="search-results-head">{submitted ? `${tracks.length} TRACKS FOUND` : 'READY WHEN YOU ARE'}</div>
    {result.isLoading && submitted ? <LoadingGrid /> : result.isError && submitted ? <ApiError error={result.error} retry={() => void result.refetch()} /> :
      submitted && tracks.length > 0 ? <TrackGrid tracks={tracks} playTrack={playTrack} saved={saved} toggleSave={toggleSave} /> :
      submitted ? <EmptyState title="No tracks in this frequency" message="Try another spelling or choose a different language tag." action={<button className="text-button" onClick={clearSearch}>Clear search <X size={13} /></button>} /> :
      <div className="empty-state"><div className="empty-icon"><Globe2 size={20} /></div><h3>Somewhere new is one search away</h3><p>Search by title or artist. Start with a language that feels like home.</p><div className="language-grid" style={{ width: '100%', maxWidth: 700, marginTop: 14 }}>{LANGUAGES.map(item => <button key={item.code} className="language-tile" onClick={() => setLanguage(item.code)}><strong>{item.label}</strong><span>{item.prompt}</span></button>)}</div></div>}
  </>;
}

function LibraryPage({ library, setLibrary, playTrack, toggleSave }: { library: LibraryData; setLibrary: (updater: (value: LibraryData) => LibraryData) => void; playTrack: (track: SavedTrack, tracks: SavedTrack[]) => void; toggleSave: (track: JamendoTrack | SavedTrack) => void }) {
  const [tab, setTab] = useState<'saved' | 'recent' | 'playlists'>('saved');
  const [name, setName] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const selectedPlaylist = library.playlists.find(item => item.id === selectedId);
  const tracks = tab === 'saved' ? library.saved : tab === 'recent' ? library.recent : (selectedPlaylist?.tracks ?? []);
  const createPlaylist = (event: FormEvent) => {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) return;
    const playlist = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: cleanName, tracks: [] };
    setLibrary(current => ({ ...current, playlists: [playlist, ...current.playlists] }));
    setSelectedId(playlist.id); setName(''); setTab('playlists');
  };
  const deletePlaylist = () => {
    if (!selectedPlaylist || !window.confirm(`Delete “${selectedPlaylist.name}”?`)) return;
    setLibrary(current => ({ ...current, playlists: current.playlists.filter(item => item.id !== selectedPlaylist.id) }));
    setSelectedId('');
  };
  const removeFromPlaylist = (id: string) => {
    if (!selectedPlaylist) return;
    setLibrary(current => ({ ...current, playlists: current.playlists.map(item => item.id === selectedPlaylist.id ? { ...item, tracks: item.tracks.filter(track => track.id !== id) } : item) }));
  };
  const addSavedToPlaylist = (track: SavedTrack) => {
    if (!selectedPlaylist || selectedPlaylist.tracks.some(item => item.id === track.id)) return;
    setLibrary(current => ({ ...current, playlists: current.playlists.map(item => item.id === selectedPlaylist.id ? { ...item, tracks: [track, ...item.tracks] } : item) }));
  };
  return <>
    <div className="section-kicker">Your listening, held close</div>
    <h1 className="page-title">A place for<br />what stays.</h1>
    <p className="page-intro">Favorites, recent spins, and playlists live only in this browser. No account, no database, no audio stored offline.</p>
    <div className="tabs" role="tablist" aria-label="Library views">
      <button className={`tab ${tab === 'saved' ? 'active' : ''}`} role="tab" aria-selected={tab === 'saved'} onClick={() => setTab('saved')} data-testid="tab-saved"><Bookmark size={13} /> Saved <span>({library.saved.length})</span></button>
      <button className={`tab ${tab === 'recent' ? 'active' : ''}`} role="tab" aria-selected={tab === 'recent'} onClick={() => setTab('recent')} data-testid="tab-recent"><Activity size={13} /> Recently played <span>({library.recent.length})</span></button>
      <button className={`tab ${tab === 'playlists' ? 'active' : ''}`} role="tab" aria-selected={tab === 'playlists'} onClick={() => setTab('playlists')} data-testid="tab-playlists"><ListMusic size={13} /> Playlists <span>({library.playlists.length})</span></button>
    </div>
    {tab === 'playlists' && <section className="playlist-panel">
      <form className="playlist-form" onSubmit={createPlaylist}><input value={name} onChange={event => setName(event.target.value)} placeholder="Name a new playlist" aria-label="New playlist name" maxLength={48} data-testid="input-playlist-name" /><button className="button-primary" type="submit" disabled={!name.trim()}><Plus size={14} /> Create</button></form>
      {library.playlists.length > 0 && <div className="playlist-head">
        <select aria-label="Choose a playlist" value={selectedId} onChange={event => setSelectedId(event.target.value)} data-testid="select-playlist">
          <option value="">Choose a playlist</option>{library.playlists.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        {selectedPlaylist && <><span className="tag-pill">{selectedPlaylist.tracks.length} tracks</span><div className="playlist-actions"><button onClick={deletePlaylist} data-testid="button-delete-playlist"><Trash2 size={13} /> Delete playlist</button></div></>}
      </div>}
      {selectedPlaylist && library.saved.length > 0 && <div className="playlist-head" style={{ marginTop: 15 }}><span className="notice">Add a favorite to this playlist</span><select aria-label="Add saved track to playlist" value="" onChange={event => { const found = library.saved.find(item => item.id === event.target.value); if (found) addSavedToPlaylist(found); }}><option value="">Choose saved track</option>{library.saved.filter(item => !selectedPlaylist.tracks.some(track => track.id === item.id)).map(item => <option key={item.id} value={item.id}>{item.title} — {item.artist}</option>)}</select></div>}
    </section>}
    {tracks.length ? <TrackRows tracks={tracks} playTrack={playTrack} saved={library.saved} toggleSave={toggleSave} onRemove={tab === 'playlists' ? removeFromPlaylist : undefined} onAdd={tab === 'saved' && selectedPlaylist ? addSavedToPlaylist : undefined} /> :
      <EmptyState title={tab === 'saved' ? 'Keep a song close' : tab === 'recent' ? 'Your first listen is waiting' : selectedPlaylist ? 'A playlist with room to grow' : 'Make a listening list'} message={tab === 'saved' ? 'Save tracks as you discover them and they’ll find a home here.' : tab === 'recent' ? 'Play a full track and your recent listening will appear here.' : selectedPlaylist ? 'Add saved tracks to build this playlist.' : 'Create a playlist to gather songs around a feeling, place, or moment.'} action={tab !== 'playlists' ? <Link href="/search" className="text-button">Explore the catalog <ArrowRight size={13} /></Link> : undefined} />}
    <p className="notice" style={{ marginTop: 24 }}>Saved song metadata only. Stream links are refreshed from the Jamendo app API whenever you play a saved track. Clearing site data removes this library.</p>
  </>;
}

function TrackGrid({ tracks, playTrack, saved, toggleSave }: { tracks: JamendoTrack[]; playTrack: (track: JamendoTrack, tracks: JamendoTrack[]) => void; saved: SavedTrack[]; toggleSave: (track: JamendoTrack) => void }) {
  const download = usePrepareJamendoDownload();
  const [downloadMessage, setDownloadMessage] = useState('');
  const prepareDownload = (id: string) => {
    setDownloadMessage('');
    download.mutate({ id }, {
      onSuccess: result => {
        const anchor = document.createElement('a');
        anchor.href = result.downloadUrl; anchor.rel = 'noreferrer'; anchor.download = '';
        document.body.appendChild(anchor); anchor.click(); anchor.remove();
      },
      onError: () => setDownloadMessage('Jamendo could not verify download permission for this track.'),
    });
  };
  return <>{downloadMessage && <div className="api-config" role="alert">{downloadMessage}</div>}<div className="track-grid">{tracks.map(track => {
    const isSaved = saved.some(item => item.id === track.id);
    return <article className="track-card" key={track.id} data-testid={`card-track-${track.id}`}>
      <div className="artwork">{track.artworkUrl ? <img src={track.artworkUrl} alt={`${track.album || track.title} artwork`} loading="lazy" /> : <div className="art-fallback"><Disc3 size={35} /></div>}
        <button className={`save-button ${isSaved ? 'saved' : ''}`} onClick={() => toggleSave(track)} aria-label={isSaved ? `Remove ${track.title} from favorites` : `Save ${track.title}`} title={isSaved ? 'Remove from favorites' : 'Save track'} data-testid={`button-save-${track.id}`}>{isSaved ? <Check size={14} /> : <Heart size={14} />}</button>
        <button className="art-play" onClick={() => playTrack(track, tracks)} aria-label={`Play ${track.title}`} title="Play full track" data-testid={`button-play-${track.id}`}><Play size={15} fill="currentColor" /></button>
        {track.downloadAllowed && <button className="card-download" onClick={() => prepareDownload(track.id)} disabled={download.isPending} aria-label={`Download ${track.title}`} title="Download permitted track"><Download size={14} /></button>}
      </div>
      <div className="track-info"><div className="track-title" title={track.title}>{track.title}</div><div className="track-artist" title={track.artist}>{track.artist}</div><div className="track-meta"><span>{track.genre || track.language || 'Jamendo'}</span><span>{formatTime(track.durationSeconds)}</span></div>
        <div className="track-card-links"><a href={track.trackUrl} target="_blank" rel="noreferrer">Track page <ExternalLink size={10} /></a><a href={track.licenseUrl} target="_blank" rel="noreferrer">License <ExternalLink size={10} /></a></div>
      </div>
    </article>;
  })}</div></>;
}

function TrackRows({ tracks, playTrack, saved, toggleSave, onRemove, onAdd }: { tracks: SavedTrack[]; playTrack: (track: SavedTrack, tracks: SavedTrack[]) => void; saved: SavedTrack[]; toggleSave: (track: JamendoTrack | SavedTrack) => void; onRemove?: (id: string) => void; onAdd?: (track: SavedTrack) => void }) {
  const download = usePrepareJamendoDownload();
  const [downloadError, setDownloadError] = useState('');
  const startDownload = (track: SavedTrack) => {
    setDownloadError('');
    download.mutate({ id: track.id }, {
      onSuccess: result => {
        const anchor = document.createElement('a');
        anchor.href = result.downloadUrl; anchor.rel = 'noreferrer'; anchor.download = '';
        document.body.appendChild(anchor); anchor.click(); anchor.remove();
      },
      onError: () => setDownloadError('Jamendo could not verify download permission for this track.'),
    });
  };
  return <div className="track-rows">
    {downloadError && <div className="api-config" role="alert">{downloadError}</div>}
    {tracks.map((track, index) => <article className="track-row" key={`${track.id}-${index}`} data-testid={`row-track-${track.id}`}>
      {track.artworkUrl ? <img src={track.artworkUrl} alt="" loading="lazy" /> : <div className="row-art art-fallback"><Disc3 size={20} /></div>}
      <div className="track-row-copy"><strong>{track.title}</strong><span>{track.artist}{track.album ? ` · ${track.album}` : ''} · {formatTime(track.durationSeconds)}</span><div className="track-detail-links"><a href={track.trackUrl} target="_blank" rel="noreferrer">Jamendo track page</a><a href={track.licenseUrl} target="_blank" rel="noreferrer">License details</a></div></div>
      <div className="row-actions">
        <button className="icon-button" onClick={() => playTrack(track, tracks)} aria-label={`Play ${track.title}`} title="Play full track"><Play size={15} /></button>
        <button className={`icon-button ${saved.some(item => item.id === track.id) ? 'saved' : ''}`} onClick={() => toggleSave(track)} aria-label="Toggle favorite" title="Toggle favorite"><Heart size={15} /></button>
        {track.downloadAllowed && <button className="icon-button" onClick={() => startDownload(track)} disabled={download.isPending} aria-label={`Download ${track.title}`} title={download.isPending ? 'Preparing download' : 'Download permitted track'}><Download size={15} /></button>}
        {onAdd && <button className="icon-button" onClick={() => onAdd(track)} aria-label="Add to selected playlist" title="Add to selected playlist"><Plus size={15} /></button>}
        {onRemove && <button className="icon-button" onClick={() => onRemove(track.id)} aria-label="Remove from playlist" title="Remove from playlist"><X size={15} /></button>}
      </div>
    </article>)}
    <div className="notice" style={{ marginTop: 13 }}>Jamendo attribution: verify each track’s license terms before reuse or redistribution.</div>
  </div>;
}

function LoadingGrid() {
  return <div className="loading-state" role="status" aria-label="Loading Jamendo tracks">{Array.from({ length: 5 }, (_, index) => <div className="skeleton" key={index}><div className="skeleton-line" /><div className="skeleton-line short" /></div>)}</div>;
}
function EmptyState({ title, message, action }: { title: string; message: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon"><Music2 size={20} /></div><h3>{title}</h3><p>{message}</p>{action}</div>;
}
function ApiError({ error, retry }: { error: unknown; retry: () => void }) {
  const message = error instanceof Error ? error.message : '';
  const configuration = /config|credential|client.?id|jamendo.*(key|id)|not configured/i.test(message);
  return configuration ? <div className="api-config" role="alert"><strong>Jamendo connection needs configuration.</strong> The app API could not provide catalog results. Check the Jamendo API setup on the server, then retry.</div> :
    <div className="error-state" role="alert"><div className="empty-icon"><Radio size={20} /></div><h3>Signal dropped</h3><p>The Jamendo service could not be reached. Your local library is safe; try the catalog again.</p><button className="text-button" onClick={retry} data-testid="button-retry"><RotateCcw size={13} /> Try again</button></div>;
}
function Player({ track, playing, setPlaying, volume, setVolume, audioRef, onNext, onPrevious, onEnded, onError }: { track: JamendoTrack | null; playing: boolean; setPlaying: (value: boolean) => void; volume: number; setVolume: (value: number) => void; audioRef: { current: HTMLAudioElement | null }; onNext: () => void; onPrevious: () => void; onEnded: () => void; onError: () => void }) {
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [muted, setMuted] = useState(false);
  const [audioError, setAudioError] = useState(false);
  useEffect(() => { setCurrent(0); setAudioError(false); setDuration(track?.durationSeconds || 0); }, [track]);
  return <>
    <audio ref={audioRef} preload="none" onTimeUpdate={event => setCurrent(event.currentTarget.currentTime)} onLoadedMetadata={event => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : track?.durationSeconds || 0)} onEnded={onEnded} onError={() => { setAudioError(true); setPlaying(false); onError(); }} />
    <footer className="player" aria-label="Full track audio player">
      <div className="player-track">
        {track?.artworkUrl ? <img className="player-cover" src={track.artworkUrl} alt="" /> : <div className="player-cover art-fallback"><Disc3 size={19} /></div>}
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
