import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from '../vendor/browser/jsx-runtime.js';
import { useCallback, useEffect, useRef, useState } from '../vendor/browser/react.js';
import { ArrowRight, Check, Clock3, Hand, HelpCircle, MapPin, Pause, Play, RotateCcw, Volume2, VolumeX } from '../vendor/browser/lucide-react.js';
import Brand from './components/Brand.js';
import ModalShell from './components/ModalShell.js';
import { menuImage, rupiah } from './lib/menu-assets.js';
import KitchenScene from './components/KitchenScene.js';
import { advanceGame, applyAction, BALANCE, createGame, replayGame, STATIONS } from './game/engine.js';
import { CATALOG_REVISION, RULES_VERSION } from './game/balance.js';
import { clearPractice, getSoundPreference, readPractice, setSoundPreference, writePractice } from './lib/storage.js';
import { disposeAudio, playEffect, setAudioEnabled, setMusicPlaying, unlockAudio } from './lib/audio.js';
function transitionSound(previous, next) {
    if (next.finished && !previous.finished)
        return 'finish';
    const events = next.events.filter(event => event.id > previous.lastEventId);
    if (events.some(event => event.type === 'serve'))
        return 'serve';
    if (events.some(event => event.type === 'timeout'))
        return 'timeout';
    if (events.some(event => event.type === 'mistake'))
        return 'mistake';
    if (events.some(event => event.type === 'step'))
        return next.stepIndex >= next.order.steps.length ? 'ready' : 'ingredient';
    if (events.some(event => event.type === 'select'))
        return 'select';
    const seconds = Math.ceil((BALANCE.durationMs - next.elapsedMs) / 1000);
    const previousSeconds = Math.ceil((BALANCE.durationMs - previous.elapsedMs) / 1000);
    if (seconds > 0 && seconds <= 5 && seconds < previousSeconds)
        return 'countdown';
    return next.lastMoveAt !== previous.lastMoveAt ? 'move' : null;
}
export default function App() {
    const [screen, setScreen] = useState('home');
    const [modal, setModal] = useState(null);
    const [pendingStart, setPendingStart] = useState(null);
    const [sound, setSound] = useState(getSoundPreference);
    const soundRef = useRef(sound);
    const musicActiveRef = useRef(false);
    const [pageVisible, setPageVisible] = useState(() => !document.hidden);
    const [game, setGame] = useState(() => createGame(60));
    const gameRef = useRef(game);
    const actionsRef = useRef([]);
    const [paused, setPaused] = useState(false);
    const pausedRef = useRef(false);
    const epochRef = useRef(0);
    const [savedPractice, setSavedPractice] = useState(readPractice);
    const recipeList = useRef(null);
    const [resultStatus, setResultStatus] = useState('');
    const screenRef = useRef(screen);
    const finishing = useRef(false);
    const [dragging, setDragging] = useState(false);
    const gamePanel = useRef(null);
    const closeModal = useCallback(() => {
        setPendingStart(null);
        setModal(null);
    }, []);
    const updateGame = useCallback((value, withSound = false) => {
        const cue = withSound ? transitionSound(gameRef.current, value) : null;
        gameRef.current = value;
        setGame(value);
        if (cue)
            playEffect(cue);
    }, []);
    const navigate = useCallback((next) => {
        setScreen(next);
        screenRef.current = next;
        if (next === 'play')
            requestAnimationFrame(() => gamePanel.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    }, []);
    useEffect(() => { soundRef.current = sound; setSoundPreference(sound); }, [sound]);
    useEffect(() => {
        const interaction = () => { if (soundRef.current && !document.hidden)
            unlockAudio(); };
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
        soundRef.current = next;
        setSound(next);
        setSoundPreference(next);
        setAudioEnabled(next && !document.hidden);
        if (next) {
            unlockAudio();
            playEffect('select');
        }
    }, []);
    const persistPractice = useCallback(() => {
        const current = gameRef.current;
        if (current.finished || !epochRef.current || screenRef.current !== 'play')
            return;
        const value = { version: RULES_VERSION, catalogRevision: CATALOG_REVISION, seed: current.seed, actions: actionsRef.current, elapsedMs: current.elapsedMs, savedAt: new Date().toISOString() };
        writePractice(value);
        setSavedPractice(value);
    }, []);
    const finish = useCallback((value) => {
        if (finishing.current)
            return;
        finishing.current = true;
        updateGame(value, true);
        navigate('results');
        clearPractice();
        setSavedPractice(null);
        setResultStatus('Latihan selesai. Siap untuk ronde berikutnya?');
    }, [navigate, updateGame]);
    useEffect(() => {
        if (screen !== 'play')
            return;
        const id = setInterval(() => {
            if (pausedRef.current)
                return;
            const value = advanceGame(gameRef.current, Date.now() - epochRef.current);
            if (value.finished) {
                void finish(value);
                return;
            }
            updateGame(value, true);
        }, 75);
        const saveId = setInterval(persistPractice, 2000);
        const visibility = () => {
            if (document.hidden && !pausedRef.current) {
                pausedRef.current = true;
                setPaused(true);
                persistPractice();
            }
        };
        const beforeUnload = () => persistPractice();
        document.addEventListener('visibilitychange', visibility);
        window.addEventListener('pagehide', beforeUnload);
        return () => { clearInterval(id); clearInterval(saveId); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', beforeUnload); };
    }, [screen, finish, persistPractice, updateGame]);
    const dispatch = useCallback((input) => {
        if (screenRef.current !== 'play' || pausedRef.current || gameRef.current.finished)
            return;
        const action = { ...input, at: Math.max(gameRef.current.elapsedMs, Math.floor(Date.now() - epochRef.current)) };
        const old = gameRef.current;
        const value = applyAction(old, action);
        if (value.finished) {
            void finish(value);
            return;
        }
        if (value.lastMoveAt === old.lastMoveAt && value.lastServeAt === old.lastServeAt && value.selectedSlot === old.selectedSlot)
            return;
        actionsRef.current = [...actionsRef.current, action];
        updateGame(value, true);
    }, [finish, updateGame]);
    const togglePause = useCallback(() => {
        const next = !pausedRef.current;
        if (!next) {
            unlockAudio();
            epochRef.current = Date.now() - gameRef.current.elapsedMs;
        }
        pausedRef.current = next;
        setPaused(next);
        if (next)
            persistPractice();
    }, [persistPractice]);
    useEffect(() => {
        if (screen !== 'play' || modal)
            return;
        const listener = (e) => {
            if (e.target?.matches('input,textarea,select'))
                return;
            if (['1', '2', '3'].includes(e.key))
                dispatch({ type: 'select', slot: (Number(e.key) - 1) });
            const keys = { ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down', ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right' };
            if (keys[e.key]) {
                e.preventDefault();
                dispatch({ type: 'move', direction: keys[e.key] });
            }
            if (e.key === 'Escape' || e.key === 'p')
                togglePause();
        };
        window.addEventListener('keydown', listener);
        return () => window.removeEventListener('keydown', listener);
    }, [screen, modal, dispatch, togglePause]);
    function startPractice(resume = false) {
        if (resume) {
            beginPractice(true);
            return;
        }
        setPendingStart('practice');
        openModal('tutorial');
    }
    function beginPractice(resume = false) {
        unlockAudio();
        const saved = resume ? readPractice() : null;
        const seed = saved?.seed ?? crypto.getRandomValues(new Uint32Array(1))[0];
        const state = saved ? replayGame(seed, saved.actions, saved.elapsedMs) : createGame(seed);
        actionsRef.current = saved?.actions ?? [];
        pausedRef.current = false;
        setPaused(false);
        epochRef.current = Date.now() - state.elapsedMs;
        finishing.current = false;
        updateGame(state);
        setPendingStart(null);
        setModal(null);
        navigate('play');
        if (!resume)
            playEffect('start');
        if (!resume) {
            clearPractice();
            setSavedPractice(null);
        }
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
    const move = useCallback((direction) => dispatch({ type: 'move', direction }), [dispatch]);
    const openModal = useCallback((next) => {
        if (screenRef.current === 'play' && !pausedRef.current) {
            pausedRef.current = true;
            setPaused(true);
            persistPractice();
        }
        setModal(next);
    }, [persistPractice]);
    useEffect(() => {
        const list = recipeList.current;
        const current = list?.querySelector('.current');
        if (!list || !current || list.scrollWidth <= list.clientWidth)
            return;
        const item = current.getBoundingClientRect(), container = list.getBoundingClientRect();
        if (item.right > container.right || item.left < container.left)
            list.scrollTo({ left: list.scrollLeft + item.left - container.left - (container.width - item.width) / 2, behavior: 'smooth' });
    }, [game.stepIndex, game.orderIndex]);
    return _jsxs("div", { className: `app phase-${screen}`, children: [_jsxs("div", { inert: Boolean(modal), children: [_jsx("header", { className: "site-header", children: _jsxs("div", { className: "header-inner", children: [_jsx("div", { className: "header-branding", children: _jsx("span", { className: "brand-link", "aria-label": "Sushi Rush 60", children: _jsx(Brand, {}) }) }), _jsx("nav", { "aria-label": "Menu game", children: _jsx("button", { onClick: () => openModal('tutorial'), children: "Cara main" }) }), _jsx("div", { className: "header-actions", children: screen !== 'play' && _jsx("button", { className: "icon-button", "aria-label": sound ? 'Matikan musik dan efek suara' : 'Aktifkan musik dan efek suara', title: sound ? 'Matikan musik dan efek suara' : 'Aktifkan musik dan efek suara', "aria-pressed": sound, onClick: toggleSound, children: sound ? _jsx(Volume2, { size: 19 }) : _jsx(VolumeX, { size: 19 }) }) })] }) }), _jsxs("main", { className: "page-shell", children: [_jsxs("section", { className: "game-intro", children: [_jsxs("div", { children: [_jsxs("h1", { children: ["Sushi Rush ", _jsx("em", { children: "60" }), _jsx("span", { className: "title-dot", children: "." })] }), _jsxs("p", { children: ["Layani pesanan dalam 60 detik.", _jsx("br", { className: "mobile-only" }), " Kumpulkan omzet paling banyak."] })] }), _jsx("div", { className: "intro-actions", children: _jsxs("button", { className: "help-link", onClick: () => openModal('tutorial'), children: [_jsx(HelpCircle, { size: 17 }), " Cara main"] }) })] }), _jsxs("section", { className: "game-panel", "aria-label": "Game Sushi Rush 60", ref: gamePanel, children: [_jsxs("div", { className: "cash-register", children: [_jsxs("div", { className: "revenue-display", children: [_jsx("span", { children: "OMZET KEDAI" }), _jsx("strong", { children: rupiah(revenue) })] }), _jsxs("div", { className: "register-stat", children: [_jsx("span", { children: "TERSAJI" }), _jsxs("strong", { children: [game.completedOrders, _jsx("small", { children: " pesanan" })] })] }), _jsxs("div", { className: `round-clock ${remaining <= 10 ? 'urgent' : ''}`, children: [_jsx(Clock3, { size: 20 }), _jsx("strong", { children: String(remaining).padStart(2, '0') }), _jsx("span", { children: "detik" })] }), _jsxs("div", { className: "round-tools", children: [_jsx("span", { className: "mode-tag", children: "LATIHAN" }), screen === 'play' && _jsx("button", { className: "icon-button", "aria-label": paused ? 'Lanjutkan latihan' : 'Jeda latihan', onClick: togglePause, children: paused ? _jsx(Play, { size: 18 }) : _jsx(Pause, { size: 18 }) })] })] }), _jsx("div", { className: "round-bar", children: _jsx("span", { style: { width: `${remaining / 60 * 100}%` } }) }), _jsxs("div", { className: "game-work", children: [_jsxs("div", { className: "kitchen-frame", children: [_jsx(KitchenScene, { position: game.position, playing: running, controlsEnabled: screen === 'play' && running, readyToServe: ready, onDirection: move, onDragStateChange: setDragging, activeStation: screen === 'play' ? currentStep?.station : undefined, celebration: game.completedOrders, className: "game-kitchen" }), screen === 'play' && _jsx("button", { className: "icon-button game-sound-button", "aria-label": sound ? 'Matikan musik dan efek suara' : 'Aktifkan musik dan efek suara', title: sound ? 'Matikan musik dan efek suara' : 'Aktifkan musik dan efek suara', "aria-pressed": sound, onClick: toggleSound, children: sound ? _jsx(Volume2, { size: 19 }) : _jsx(VolumeX, { size: 19 }) }), screen === 'play' && !paused && _jsx("div", { className: `kitchen-feedback ${latest?.type === 'mistake' || latest?.type === 'timeout' ? 'error' : ''}`, role: "status", children: ready ? _jsxs(_Fragment, { children: [_jsx(MapPin, { size: 15 }), "Bahan lengkap. Ikuti panah ke bar saji."] }) : latest && game.elapsedMs - latest.at < 1900 ? _jsxs(_Fragment, { children: [latest.type === 'serve' ? _jsx(Check, { size: 15 }) : null, latest.message, latest.points ? ` +${rupiah(latest.points)}` : ''] }) : dragging ? 'Lepaskan jari untuk berhenti.' : _jsxs(_Fragment, { children: [_jsx(Hand, { size: 15 }), _jsx("span", { className: "touch-copy", children: "Tahan & geser jari untuk bergerak" }), _jsx("span", { className: "keyboard-copy", children: "Panah / WASD untuk bergerak" })] }) }), screen === 'home' && _jsxs("div", { className: "start-card", children: [_jsx("h2", { children: "Siap terima pesanan?" }), _jsxs("p", { children: ["Pilih pesanan yang mau dibuat.", _jsx("br", { className: "desktop-only" }), " Ambil bahan berurutan, lalu antarkan ke bar saji."] }), _jsxs("button", { className: "button button-red", onClick: () => startPractice(), children: [_jsx(Play, { size: 16, fill: "currentColor" }), " Mulai latihan ", _jsx("span", { children: "60 dtk" })] }), savedPractice && _jsxs("button", { className: "text-button", onClick: () => startPractice(true), children: [_jsx(RotateCcw, { size: 13 }), " Lanjutkan latihan tersimpan"] })] }), paused && screen === 'play' && _jsxs("div", { className: "stage-overlay", children: [_jsx(Pause, { size: 27 }), _jsx("h2", { children: "Latihan dijeda." }), _jsx("p", { children: "Waktu berhenti. Sesi sudah disimpan." }), _jsxs("button", { className: "button button-red", onClick: togglePause, children: [_jsx(Play, { size: 16 }), " Lanjutkan"] }), _jsx("button", { className: "text-button", onClick: () => { persistPractice(); navigate('home'); }, children: "Simpan & tutup kedai" })] }), screen === 'results' && _jsxs("div", { className: "stage-overlay result-overlay", children: [_jsx("h2", { children: "Omzet ronde ini" }), _jsx("strong", { className: "result-total", children: rupiah(revenue) }), _jsxs("p", { children: [game.completedOrders, " pesanan tersaji \u00B7 ", game.bestCombo, " berturut-turut", _jsx("br", {}), resultStatus] }), _jsx("div", { className: "result-actions", children: _jsxs("button", { className: "button button-red", onClick: () => startPractice(), children: [_jsx(RotateCcw, { size: 15 }), " Latihan lagi"] }) })] })] }), _jsxs("div", { className: "order-queue", children: [_jsx("div", { className: "panel-heading", children: _jsx("h2", { children: "Pesanan masuk" }) }), _jsx("p", { className: "queue-caption", children: "Pilih pesanan yang mau kamu kerjakan." }), _jsx("div", { className: "order-options", children: game.offers.map((offer, i) => _jsxs("button", { "aria-label": `Pilih ${offer.name}, ${rupiah(offer.price ?? 0)}`, "aria-pressed": game.selectedSlot === i, className: `order-option ${game.selectedSlot === i ? 'selected' : ''}`, disabled: screen !== 'play' || paused, onClick: () => dispatch({ type: 'select', slot: i }), children: [_jsx("img", { src: menuImage(offer.id), alt: "", width: "64", height: "64" }), _jsxs("span", { className: "offer-copy", children: [_jsxs("span", { className: "offer-name", children: [offer.name.replace(' 4pcs', ''), _jsx("small", { children: offer.kind === 'roll' ? '4 pcs' : offer.kind === 'cake' ? 'Mini Sushi Cake' : '' })] }), _jsx("strong", { children: rupiah(offer.price ?? 0) })] }), _jsx("span", { className: "order-selector", children: game.selectedSlot === i ? _jsx(Check, { size: 13 }) : i + 1 })] }, `${i}-${offer.id}`)) }), _jsx("p", { className: "switch-note", children: "Ganti pesanan? Racikan yang belum selesai diulang." })] }), _jsxs("div", { className: "recipe-panel", children: [_jsxs("div", { className: "recipe-top", children: [_jsxs("span", { children: ["URUTAN BAHAN ", _jsxs("strong", { children: [game.stepIndex, "/", game.order.steps.length] })] }), _jsxs("span", { className: orderLeft < 4000 ? 'urgent' : '', children: [_jsx(Clock3, { size: 12 }), Math.ceil(orderLeft / 1000), " dtk"] })] }), _jsx("div", { className: "order-time-bar", children: _jsx("span", { style: { width: `${orderLeft / game.orderDeadlineMs * 100}%` } }) }), _jsx("div", { className: "active-ingredient", children: ready ? _jsxs(_Fragment, { children: [_jsx(Check, { size: 16 }), _jsx("strong", { children: "Bahan lengkap" })] }) : _jsxs(_Fragment, { children: [_jsx("span", { className: "station-dot", style: { background: currentStep ? STATIONS[currentStep.station].color : undefined } }), _jsxs("div", { children: [_jsx("small", { children: currentStep ? STATIONS[currentStep.station].name : '' }), _jsx("strong", { children: currentStep?.label })] })] }) }), _jsxs("ol", { className: "recipe-steps", ref: recipeList, children: [game.order.steps.map((step, i) => _jsxs("li", { className: i < game.stepIndex ? 'done' : i === game.stepIndex ? 'current' : '', title: step.label, children: [_jsx("span", { children: i < game.stepIndex ? _jsx(Check, { size: 11 }) : i + 1 }), _jsx("strong", { children: STATIONS[step.station].shortName })] }, i)), _jsxs("li", { className: ready ? 'current delivery-step' : 'delivery-step', title: "Antarkan ke bar saji", children: [_jsx("span", { children: game.order.steps.length + 1 }), _jsx("strong", { children: "Bar saji" })] })] }), _jsxs("div", { className: `delivery-card ${ready ? 'ready' : ''}`, role: "status", children: [_jsx("span", { children: ready ? 'Antarkan ke Bar saji' : 'Lengkapi bahan dulu' }), _jsxs("strong", { children: ["+", rupiah(game.order.price ?? 0)] }), _jsx(MapPin, { size: 17 })] }), _jsxs("div", { className: "recipe-foot", children: [_jsxs("span", { children: ["Kepuasan ", _jsxs("strong", { children: [game.satisfaction, "%"] })] }), _jsx("span", { className: "keyboard-copy", children: "Gerak: Panah / WASD" }), _jsx("span", { className: "touch-copy", children: "Gerak: geser jari di dapur" })] })] })] })] })] }), _jsxs("footer", { className: "site-footer", children: [_jsx("span", { children: "Sushi Rush 60" }), _jsx("button", { onClick: () => openModal('tutorial'), children: "Cara main" })] })] }), modal && _jsx(ModalShell, { title: "Cara bermain", onClose: closeModal, children: modal === 'tutorial' && _jsxs(_Fragment, { children: [_jsx("h2", { children: "Cara bermain" }), _jsx("div", { className: "play-controls preflight-desktop", children: _jsxs("div", { className: "control-row", children: [_jsx("strong", { children: "Bergerak" }), _jsxs("div", { className: "key-options", children: [_jsxs("span", { className: "key-group", "aria-label": "Tombol panah", children: [_jsx("kbd", { children: "\u2191" }), _jsx("kbd", { children: "\u2190" }), _jsx("kbd", { children: "\u2193" }), _jsx("kbd", { children: "\u2192" })] }), _jsx("span", { children: "atau" }), _jsxs("span", { className: "key-group", "aria-label": "W A S D", children: [_jsx("kbd", { children: "W" }), _jsx("kbd", { children: "A" }), _jsx("kbd", { children: "S" }), _jsx("kbd", { children: "D" })] })] })] }) }), _jsxs("div", { className: "play-controls preflight-touch", children: [_jsx(Hand, { size: 25 }), _jsxs("div", { children: [_jsx("strong", { children: "Tahan & geser jari di dapur." }), _jsx("p", { children: "Chef mengikuti arah jarimu. Lepaskan jari untuk berhenti." })] })] }), _jsxs("ol", { className: "help-steps", children: [_jsxs("li", { children: [_jsxs("strong", { children: [_jsx("span", { className: "keyboard-copy", children: "Pilih pesanan." }), _jsx("span", { className: "touch-copy", children: "Ketuk salah satu pesanan." })] }), " Perhatikan harga menu dan urutan bahannya."] }), _jsxs("li", { children: [_jsxs("strong", { children: [_jsx("span", { className: "keyboard-copy", children: "Ambil bahan sesuai urutan." }), _jsx("span", { className: "touch-copy", children: "Geser chef ke stasiun bahan." })] }), " Ikuti urutan bahan yang ditandai."] }), _jsxs("li", { children: [_jsx("strong", { children: "Antarkan ke bar saji." }), " Setelah bahan lengkap, ikuti panah ke bar. Pesanan otomatis tersaji dan menambah omzet saat chef tiba."] })] }), _jsx("p", { className: "play-goal", children: "Kumpulkan omzet sebanyak mungkin dalam 60 detik." }), _jsxs("button", { className: "button button-red full-width", onClick: () => {
                                if (pendingStart === 'practice' || screen !== 'play') {
                                    beginPractice();
                                    return;
                                }
                                closeModal();
                                if (paused)
                                    togglePause();
                            }, children: [pendingStart === 'practice' || screen !== 'play' ? 'Mulai latihan' : 'Kembali ke dapur', _jsx(ArrowRight, { size: 16 })] })] }) })] });
}
