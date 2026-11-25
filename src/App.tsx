import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Clock3, Hand, HelpCircle, MapPin, Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import Brand from './components/Brand';
import ModalShell from './components/ModalShell';
import { menuImage, rupiah } from './lib/menu-assets';
import KitchenScene from './components/KitchenScene';
import { advanceGame, applyAction, BALANCE, createGame, replayGame, STATIONS } from './game/engine';
import type { Direction, GameAction, GameState } from './game/engine';
import { CATALOG_REVISION, RULES_VERSION } from './game/balance';
import { clearPractice, getSoundPreference, readPractice, setSoundPreference, writePractice } from './lib/storage';
import type { PracticeSave } from './lib/storage';
import { disposeAudio, playEffect, setAudioEnabled, setMusicPlaying, unlockAudio } from './lib/audio';
import type { SoundEffect } from './lib/audio';

type Screen = 'home' | 'play' | 'results';
type Modal = 'tutorial' | null;
type StartIntent = 'practice' | null;


function transitionSound(previous: GameState, next: GameState): SoundEffect | null {
  if (next.finished && !previous.finished) return 'finish';
  const events = next.events.filter(event => event.id > previous.lastEventId);
  if (events.some(event => event.type === 'serve')) return 'serve';
  if (events.some(event => event.type === 'timeout')) return 'timeout';
  if (events.some(event => event.type === 'mistake')) return 'mistake';
  if (events.some(event => event.type === 'step')) return next.stepIndex >= next.order.steps.length ? 'ready' : 'ingredient';
  if (events.some(event => event.type === 'select')) return 'select';
  const seconds = Math.ceil((BALANCE.durationMs - next.elapsedMs) / 1000);
  const previousSeconds = Math.ceil((BALANCE.durationMs - previous.elapsedMs) / 1000);
  if (seconds > 0 && seconds <= 5 && seconds < previousSeconds) return 'countdown';
  return next.lastMoveAt !== previous.lastMoveAt ? 'move' : null;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [modal, setModal] = useState<Modal>(null);
  const [pendingStart, setPendingStart] = useState<StartIntent>(null);
  const [sound, setSound] = useState(getSoundPreference);
  const soundRef = useRef(sound);
  const musicActiveRef = useRef(false);
  const [pageVisible, setPageVisible] = useState(() => !document.hidden);
  const [game, setGame] = useState<GameState>(() => createGame(60));
  const gameRef = useRef(game);
  const actionsRef = useRef<GameAction[]>([]);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const epochRef = useRef(0);
  const [savedPractice, setSavedPractice] = useState<PracticeSave | null>(readPractice);
  const recipeList = useRef<HTMLOListElement>(null);
  const [resultStatus, setResultStatus] = useState('');
  const screenRef = useRef(screen);
  const finishing = useRef(false);
  const [dragging, setDragging] = useState(false);
  const gamePanel = useRef<HTMLElement>(null);
  const closeModal = useCallback(() => {
    setPendingStart(null); setModal(null);
  }, []);


  const updateGame = useCallback((value: GameState, withSound = false) => {
    const cue = withSound ? transitionSound(gameRef.current, value) : null;
    gameRef.current = value; setGame(value);
    if (cue) playEffect(cue);
  }, []);
  const navigate = useCallback((next: Screen) => {
    setScreen(next); screenRef.current = next;
    if (next === 'play') requestAnimationFrame(() => gamePanel.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  }, []);

  useEffect(() => { soundRef.current = sound; setSoundPreference(sound); }, [sound]);
  useEffect(() => {
    const interaction = () => { if (soundRef.current && !document.hidden) unlockAudio(); };
    const visibility = () => {
      const visible = !document.hidden;
      setAudioEnabled(soundRef.current && visible);
      setMusicPlaying(musicActiveRef.current && visible);
      setPageVisible(visible);
    };
    const pageHide = () => { setAudioEnabled(false); setMusicPlaying(false); setPageVisible(false); };
    document.addEventListener('visibilitychange', visibility);
    document.addEventListener('pointerdown', interaction, { capture: true, passive: true });
    document.addEventListener('pointerup', interaction, { capture: true, passive: true });
    document.addEventListener('click', interaction, { capture: true, passive: true });
    document.addEventListener('keydown', interaction, { capture: true });
    window.addEventListener('pagehide', pageHide);
    window.addEventListener('pageshow', visibility);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('pointerdown', interaction, true);
      document.removeEventListener('pointerup', interaction, true);
      document.removeEventListener('click', interaction, true);
      document.removeEventListener('keydown', interaction, true);
      window.removeEventListener('pagehide', pageHide);
      window.removeEventListener('pageshow', visibility);
      disposeAudio();
    };
  }, []);
  const toggleSound = useCallback(() => {
    const next = !soundRef.current;
    soundRef.current = next; setSound(next); setSoundPreference(next);
    setAudioEnabled(next && !document.hidden);
    if (next) { unlockAudio(); playEffect('select'); }
  }, []);

  const persistPractice = useCallback(() => {
    const current = gameRef.current;
    if (current.finished || !epochRef.current || screenRef.current !== 'play') return;
    const value: PracticeSave = { version: RULES_VERSION, catalogRevision: CATALOG_REVISION, seed: current.seed, actions: actionsRef.current, elapsedMs: current.elapsedMs, savedAt: new Date().toISOString() };
    writePractice(value); setSavedPractice(value);
  }, []);

  const finish = useCallback((value: GameState) => {
    if (finishing.current) return;
    finishing.current = true;
    updateGame(value, true); navigate('results');
    clearPractice(); setSavedPractice(null);
    setResultStatus('Latihan selesai. Siap untuk ronde berikutnya?');
  }, [navigate, updateGame]);


  useEffect(() => {
    if (screen !== 'play') return;
    const id = setInterval(() => {
      if (pausedRef.current) return;
      const value = advanceGame(gameRef.current, Date.now() - epochRef.current);
      if (value.finished) { void finish(value); return; }
      updateGame(value, true);
    }, 75);
    const saveId = setInterval(persistPractice, 2000);
    const visibility = () => {
      if (document.hidden && !pausedRef.current) { pausedRef.current = true; setPaused(true); persistPractice(); }
    };
    const beforeUnload = () => persistPractice();
    document.addEventListener('visibilitychange', visibility); window.addEventListener('pagehide', beforeUnload);
    return () => { clearInterval(id); clearInterval(saveId); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', beforeUnload); };
  }, [screen, finish, persistPractice, updateGame]);

  const dispatch = useCallback((input: { type: 'move'; direction: Direction } | { type: 'select'; slot: 0 | 1 | 2 }) => {
    if (screenRef.current !== 'play' || pausedRef.current || gameRef.current.finished) return;
    const action: GameAction = { ...input, at: Math.max(gameRef.current.elapsedMs, Math.floor(Date.now() - epochRef.current)) };
    const old = gameRef.current;
    const value = applyAction(old, action);
    if (value.finished) { void finish(value); return; }
    if (value.lastMoveAt === old.lastMoveAt && value.lastServeAt === old.lastServeAt && value.selectedSlot === old.selectedSlot) return;
    actionsRef.current = [...actionsRef.current, action]; updateGame(value, true);
  }, [finish, updateGame]);

  const togglePause = useCallback(() => {
    const next = !pausedRef.current;
    if (!next) { unlockAudio(); epochRef.current = Date.now() - gameRef.current.elapsedMs; }
    pausedRef.current = next; setPaused(next);
    if (next) persistPractice();
  }, [persistPractice]);
  useEffect(() => {
    if (screen !== 'play' || modal) return;
    const listener = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.matches('input,textarea,select')) return;
      if (['1', '2', '3'].includes(e.key)) dispatch({ type: 'select', slot: (Number(e.key) - 1) as 0 | 1 | 2 });
      const keys: Record<string, Direction> = { ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down', ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right' };
      if (keys[e.key]) { e.preventDefault(); dispatch({ type: 'move', direction: keys[e.key] }); }
      if (e.key === 'Escape' || e.key === 'p') togglePause();
    };
    window.addEventListener('keydown', listener); return () => window.removeEventListener('keydown', listener);
  }, [screen, modal, dispatch, togglePause]);

  function startPractice(resume = false) {
    if (resume) { beginPractice(true); return; }
    setPendingStart('practice'); openModal('tutorial');
  }
  function beginPractice(resume = false) {
    unlockAudio();
    const saved = resume ? readPractice() : null;
    const seed = saved?.seed ?? crypto.getRandomValues(new Uint32Array(1))[0];
    const state = saved ? replayGame(seed, saved.actions, saved.elapsedMs) : createGame(seed);
    actionsRef.current = saved?.actions ?? [];
    pausedRef.current = false; setPaused(false); epochRef.current = Date.now() - state.elapsedMs;
    finishing.current = false;
    updateGame(state); setPendingStart(null); setModal(null); navigate('play');
    if (!resume) playEffect('start');
    if (!resume) { clearPractice(); setSavedPractice(null); }
  }


  const remaining = Math.max(0, Math.ceil((BALANCE.durationMs - game.elapsedMs) / 1000));
  const ready = game.stepIndex >= game.order.steps.length;
  const currentStep = game.order.steps[game.stepIndex];
  const latest = game.events.at(-1);
  const orderLeft = Math.max(0, game.orderStartedAt + game.orderDeadlineMs - game.elapsedMs);
  const revenue = game.revenue;
  const musicActive = !modal && (screen === 'home' || (screen === 'play' && !paused));
  const running = musicActive && pageVisible;
  useEffect(() => {
    musicActiveRef.current = musicActive;
    setAudioEnabled(sound && pageVisible);
    setMusicPlaying(running);
  }, [sound, pageVisible, running, musicActive]);
  const move = useCallback((direction: Direction) => dispatch({ type: 'move', direction }), [dispatch]);
  const openModal = useCallback((next: Modal) => {
    if (screenRef.current === 'play' && !pausedRef.current) { pausedRef.current = true; setPaused(true); persistPractice(); }
    setModal(next);
  }, [persistPractice]);
  useEffect(() => {
    const list = recipeList.current;
    const current = list?.querySelector<HTMLElement>('.current');
    if (!list || !current || list.scrollWidth <= list.clientWidth) return;
    const item = current.getBoundingClientRect(), container = list.getBoundingClientRect();
    if (item.right > container.right || item.left < container.left) list.scrollTo({ left: list.scrollLeft + item.left - container.left - (container.width - item.width) / 2, behavior: 'smooth' });
  }, [game.stepIndex, game.orderIndex]);

  return <div className={`app phase-${screen}`}>
    <div inert={Boolean(modal)}>
      <header className="site-header"><div className="header-inner">
        <div className="header-branding"><span className="brand-link" aria-label="Sushi Rush 60"><Brand/></span></div>

        <nav aria-label="Menu game"><button onClick={() => openModal('tutorial')}>Cara main</button></nav>
        <div className="header-actions">{screen !== 'play' && <button className="icon-button" aria-label={sound ? 'Matikan musik dan efek suara' : 'Aktifkan musik dan efek suara'} title={sound ? 'Matikan musik dan efek suara' : 'Aktifkan musik dan efek suara'} aria-pressed={sound} onClick={toggleSound}>{sound ? <Volume2 size={19}/> : <VolumeX size={19}/>}</button>}</div>
      </div></header>
      <main className="page-shell">
        <section className="game-intro"><div><h1>Sushi Rush <em>60</em><span className="title-dot">.</span></h1><p>Layani pesanan dalam 60 detik.<br className="mobile-only"/> Kumpulkan omzet paling banyak.</p></div><div className="intro-actions"><button className="help-link" onClick={() => openModal('tutorial')}><HelpCircle size={17}/> Cara main</button></div></section>


        <section className="game-panel" aria-label="Game Sushi Rush 60" ref={gamePanel}>
          <div className="cash-register"><div className="revenue-display"><span>OMZET KEDAI</span><strong>{rupiah(revenue)}</strong></div><div className="register-stat"><span>TERSAJI</span><strong>{game.completedOrders}<small> pesanan</small></strong></div><div className={`round-clock ${remaining <= 10 ? 'urgent' : ''}`}><Clock3 size={20}/><strong>{String(remaining).padStart(2, '0')}</strong><span>detik</span></div><div className="round-tools"><span className="mode-tag">LATIHAN</span>{screen === 'play' && <button className="icon-button" aria-label={paused ? 'Lanjutkan latihan' : 'Jeda latihan'} onClick={togglePause}>{paused ? <Play size={18}/> : <Pause size={18}/>}</button>}</div></div>
          <div className="round-bar"><span style={{ width: `${remaining / 60 * 100}%` }}/></div>
          <div className="game-work">
            <div className="kitchen-frame"><KitchenScene position={game.position} playing={running} controlsEnabled={screen === 'play' && running} readyToServe={ready} onDirection={move} onDragStateChange={setDragging} activeStation={screen === 'play' ? currentStep?.station : undefined} celebration={game.completedOrders} className="game-kitchen"/>
              {screen === 'play' && <button className="icon-button game-sound-button" aria-label={sound ? 'Matikan musik dan efek suara' : 'Aktifkan musik dan efek suara'} title={sound ? 'Matikan musik dan efek suara' : 'Aktifkan musik dan efek suara'} aria-pressed={sound} onClick={toggleSound}>{sound ? <Volume2 size={19}/> : <VolumeX size={19}/>}</button>}
              {screen === 'play' && !paused && <div className={`kitchen-feedback ${latest?.type === 'mistake' || latest?.type === 'timeout' ? 'error' : ''}`} role="status">{ready ? <><MapPin size={15}/>Bahan lengkap. Ikuti panah ke bar saji.</> : latest && game.elapsedMs - latest.at < 1900 ? <>{latest.type === 'serve' ? <Check size={15}/> : null}{latest.message}{latest.points ? ` +${rupiah(latest.points)}` : ''}</> : dragging ? 'Lepaskan jari untuk berhenti.' : <><Hand size={15}/><span className="touch-copy">Tahan & geser jari untuk bergerak</span><span className="keyboard-copy">Panah / WASD untuk bergerak</span></>}</div>}
              {screen === 'home' && <div className="start-card"><h2>Siap terima pesanan?</h2><p>Pilih pesanan yang mau dibuat.<br className="desktop-only"/> Ambil bahan berurutan, lalu antarkan ke bar saji.</p><button className="button button-red" onClick={() => startPractice()}><Play size={16} fill="currentColor"/> Mulai latihan <span>60 dtk</span></button>{savedPractice && <button className="text-button" onClick={() => startPractice(true)}><RotateCcw size={13}/> Lanjutkan latihan tersimpan</button>}</div>}
              {paused && screen === 'play' && <div className="stage-overlay"><Pause size={27}/><h2>Latihan dijeda.</h2><p>Waktu berhenti. Sesi sudah disimpan.</p><button className="button button-red" onClick={togglePause}><Play size={16}/> Lanjutkan</button><button className="text-button" onClick={() => { persistPractice(); navigate('home'); }}>Simpan & tutup kedai</button></div>}
              {screen === 'results' && <div className="stage-overlay result-overlay">
                <h2>Omzet ronde ini</h2>
                <strong className="result-total">{rupiah(revenue)}</strong>
                <p>{game.completedOrders} pesanan tersaji · {game.bestCombo} berturut-turut<br/>{resultStatus}</p>
                <div className="result-actions"><button className="button button-red" onClick={() => startPractice()}><RotateCcw size={15}/> Latihan lagi</button></div>
              </div>}
            </div>

            <div className="order-queue"><div className="panel-heading"><h2>Pesanan masuk</h2></div><p className="queue-caption">Pilih pesanan yang mau kamu kerjakan.</p><div className="order-options">{game.offers.map((offer, i) => <button key={`${i}-${offer.id}`} aria-label={`Pilih ${offer.name}, ${rupiah(offer.price ?? 0)}`} aria-pressed={game.selectedSlot === i} className={`order-option ${game.selectedSlot === i ? 'selected' : ''}`} disabled={screen !== 'play' || paused} onClick={() => dispatch({ type: 'select', slot: i as 0 | 1 | 2 })}><img src={menuImage(offer.id)} alt="" width="64" height="64"/><span className="offer-copy"><span className="offer-name">{offer.name.replace(' 4pcs', '')}<small>{offer.kind === 'roll' ? '4 pcs' : offer.kind === 'cake' ? 'Mini Sushi Cake' : ''}</small></span><strong>{rupiah(offer.price ?? 0)}</strong></span><span className="order-selector">{game.selectedSlot === i ? <Check size={13}/> : i + 1}</span></button>)}</div><p className="switch-note">Ganti pesanan? Racikan yang belum selesai diulang.</p></div>

            <div className="recipe-panel"><div className="recipe-top"><span>URUTAN BAHAN <strong>{game.stepIndex}/{game.order.steps.length}</strong></span><span className={orderLeft < 4000 ? 'urgent' : ''}><Clock3 size={12}/>{Math.ceil(orderLeft / 1000)} dtk</span></div><div className="order-time-bar"><span style={{ width: `${orderLeft / game.orderDeadlineMs * 100}%` }}/></div><div className="active-ingredient">{ready ? <><Check size={16}/><strong>Bahan lengkap</strong></> : <><span className="station-dot" style={{ background: currentStep ? STATIONS[currentStep.station].color : undefined }}/><div><small>{currentStep ? STATIONS[currentStep.station].name : ''}</small><strong>{currentStep?.label}</strong></div></>}</div><ol className="recipe-steps" ref={recipeList}>{game.order.steps.map((step, i) => <li key={i} className={i < game.stepIndex ? 'done' : i === game.stepIndex ? 'current' : ''} title={step.label}><span>{i < game.stepIndex ? <Check size={11}/> : i + 1}</span><strong>{STATIONS[step.station].shortName}</strong></li>)}<li className={ready ? 'current delivery-step' : 'delivery-step'} title="Antarkan ke bar saji"><span>{game.order.steps.length + 1}</span><strong>Bar saji</strong></li></ol><div className={`delivery-card ${ready ? 'ready' : ''}`} role="status"><span>{ready ? 'Antarkan ke Bar saji' : 'Lengkapi bahan dulu'}</span><strong>+{rupiah(game.order.price ?? 0)}</strong><MapPin size={17}/></div><div className="recipe-foot"><span>Kepuasan <strong>{game.satisfaction}%</strong></span><span className="keyboard-copy">Gerak: Panah / WASD</span><span className="touch-copy">Gerak: geser jari di dapur</span></div></div>
          </div>
        </section>

      </main>
      <footer className="site-footer"><span>Sushi Rush 60</span><button onClick={() => openModal('tutorial')}>Cara main</button></footer>
    </div>

    {modal && <ModalShell title="Cara bermain" onClose={closeModal}>
      {modal === 'tutorial' && <>
        <h2>Cara bermain</h2>
        <div className="play-controls preflight-desktop">
          <div className="control-row"><strong>Bergerak</strong><div className="key-options"><span className="key-group" aria-label="Tombol panah"><kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd></span><span>atau</span><span className="key-group" aria-label="W A S D"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span></div></div>
        </div>
        <div className="play-controls preflight-touch"><Hand size={25}/><div><strong>Tahan & geser jari di dapur.</strong><p>Chef mengikuti arah jarimu. Lepaskan jari untuk berhenti.</p></div></div>
        <ol className="help-steps">
          <li><strong><span className="keyboard-copy">Pilih pesanan.</span><span className="touch-copy">Ketuk salah satu pesanan.</span></strong> Perhatikan harga menu dan urutan bahannya.</li>
          <li><strong><span className="keyboard-copy">Ambil bahan sesuai urutan.</span><span className="touch-copy">Geser chef ke stasiun bahan.</span></strong> Ikuti urutan bahan yang ditandai.</li>
          <li><strong>Antarkan ke bar saji.</strong> Setelah bahan lengkap, ikuti panah ke bar. Pesanan otomatis tersaji dan menambah omzet saat chef tiba.</li>
        </ol>
        <p className="play-goal">Kumpulkan omzet sebanyak mungkin dalam 60 detik.</p>
        <button className="button button-red full-width" onClick={() => {
          if (pendingStart === 'practice' || screen !== 'play') { beginPractice(); return; }
          closeModal(); if (paused) togglePause();
        }}>{pendingStart === 'practice' || screen !== 'play' ? 'Mulai latihan' : 'Kembali ke dapur'}<ArrowRight size={16}/></button>
      </>}
    </ModalShell>}
  </div>;
}
