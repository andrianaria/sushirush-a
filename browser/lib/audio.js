const BPM = 108;
const STEP_SECONDS = 60 / BPM / 2;
const LOOKAHEAD_SECONDS = 0.12;
const SCHEDULER_MS = 25;
// Eight original bars; rests give the plucked melody room above the bass.
const MELODY = [
    74, null, 78, 81, null, 78, 76, null,
    74, null, 76, 78, 81, null, 78, null,
    78, null, 81, 83, null, 81, 78, null,
    76, 78, null, 74, null, 71, 74, null,
    74, null, 78, 81, null, 83, 81, null,
    78, null, 76, 74, null, 76, 78, null,
    76, null, 78, 81, null, 78, 76, null,
    74, null, 71, 69, 71, null, 76, null,
];
const BASS_ROOTS = [50, 47, 43, 45];
let enabled = false;
let musicWanted = false;
let unlocked = false;
let context;
let master;
let musicBus;
let effectsBus;
let noise;
let scheduler;
let resumeAttempt = 0;
let lifecycle = 0;
let nextStepAt = 0;
let stepIndex = 0;
const voices = new Set();
function canPlay() {
    return enabled && unlocked && context?.state === 'running';
}
function disconnectVoice(voice, stop = false) {
    if (!voices.delete(voice))
        return;
    voice.source.onended = null;
    if (stop) {
        try {
            voice.source.stop(context?.currentTime ?? 0);
        }
        catch { /* Already ended. */ }
    }
    for (const node of voice.nodes) {
        try {
            node.disconnect();
        }
        catch { /* A partial browser teardown is harmless. */ }
    }
}
function stopVoices(bus) {
    for (const voice of [...voices])
        if (!bus || voice.bus === bus)
            disconnectVoice(voice, true);
}
function track(source, nodes, bus) {
    const voice = { source, nodes, bus };
    voices.add(voice);
    source.onended = () => disconnectVoice(voice);
}
function stopMusic() {
    if (scheduler !== undefined)
        clearInterval(scheduler);
    scheduler = undefined;
    stopVoices('music');
    nextStepAt = 0;
    stepIndex = 0;
}
function frequency(midi) { return 440 * 2 ** ((midi - 69) / 12); }
function tone(midi, at, duration, volume, bus, shape = 'triangle', cutoff = 2400) {
    const ctx = context;
    const oscillator = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const envelope = ctx.createGain();
    oscillator.type = shape;
    oscillator.frequency.setValueAtTime(frequency(midi), at);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, at);
    filter.Q.setValueAtTime(0.45, at);
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.linearRampToValueAtTime(volume, at + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(filter);
    filter.connect(envelope);
    envelope.connect(bus === 'music' ? musicBus : effectsBus);
    track(oscillator, [oscillator, filter, envelope], bus);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.025);
}
function percussion(at, strong) {
    const ctx = context;
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const envelope = ctx.createGain();
    source.buffer = noise;
    filter.type = strong ? 'bandpass' : 'highpass';
    filter.frequency.setValueAtTime(strong ? 1700 : 6200, at);
    filter.Q.setValueAtTime(0.6, at);
    envelope.gain.setValueAtTime(strong ? 0.016 : 0.008, at);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + (strong ? 0.065 : 0.035));
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(musicBus);
    track(source, [source, filter, envelope], 'music');
    source.start(at);
    source.stop(at + 0.08);
}
function scheduleStep(index, at) {
    const melody = MELODY[index % MELODY.length];
    if (melody !== null)
        tone(melody, at, 0.24, 0.047, 'music');
    const root = BASS_ROOTS[Math.floor(index / 16) % BASS_ROOTS.length];
    if (index % 4 === 0)
        tone(root, at, 0.37, 0.043, 'music', 'sine', 850);
    if (index % 8 === 0)
        tone(root + 19, at, 0.48, 0.013, 'music', 'sine', 1600);
    if (index % 4 === 0)
        tone(31, at, 0.075, 0.028, 'music', 'sine', 350);
    percussion(at + (index % 2 ? 0.012 : 0), index % 8 === 4);
}
function pump() {
    if (!musicWanted || !canPlay()) {
        stopMusic();
        return;
    }
    const now = context.currentTime;
    // A delayed tab/frame never causes a burst of old notes on recovery.
    if (nextStepAt < now - 0.025) {
        const skipped = Math.ceil((now + 0.02 - nextStepAt) / STEP_SECONDS);
        stepIndex += skipped;
        nextStepAt += skipped * STEP_SECONDS;
    }
    try {
        while (nextStepAt < now + LOOKAHEAD_SECONDS) {
            scheduleStep(stepIndex, nextStepAt);
            stepIndex = (stepIndex + 1) % MELODY.length;
            nextStepAt += STEP_SECONDS;
        }
    }
    catch {
        stopMusic();
    }
}
function reconcileMusic() {
    if (!musicWanted || !canPlay()) {
        stopMusic();
        return;
    }
    if (scheduler !== undefined)
        return;
    nextStepAt = context.currentTime + 0.035;
    stepIndex = 0;
    scheduler = setInterval(pump, SCHEDULER_MS);
    pump();
}
function createContext() {
    if (context && context.state !== 'closed')
        return context;
    if (context)
        context.onstatechange = null;
    const Constructor = globalThis.AudioContext
        ?? globalThis.webkitAudioContext;
    if (!Constructor)
        return undefined;
    const ctx = new Constructor();
    context = ctx;
    master = ctx.createGain();
    musicBus = ctx.createGain();
    effectsBus = ctx.createGain();
    master.gain.setValueAtTime(enabled ? 1 : 0, ctx.currentTime);
    musicBus.gain.setValueAtTime(0.32, ctx.currentTime);
    effectsBus.gain.setValueAtTime(0.8, ctx.currentTime);
    musicBus.connect(master);
    effectsBus.connect(master);
    master.connect(ctx.destination);
    noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.08), ctx.sampleRate);
    const samples = noise.getChannelData(0);
    let noiseSeed = 731;
    for (let index = 0; index < samples.length; index++) {
        noiseSeed = (Math.imul(noiseSeed, 1664525) + 1013904223) >>> 0;
        samples[index] = noiseSeed / 2147483648 - 1;
    }
    const token = lifecycle;
    ctx.onstatechange = () => {
        if (token !== lifecycle || context !== ctx)
            return;
        if (ctx.state === 'running') {
            // A previously unlocked device can recover without a new UI transition.
            // reconcileMusic still enforces the master gate and current play intent.
            reconcileMusic();
        }
        else {
            stopMusic();
            // Effects queued before an interruption must not play seconds later.
            stopVoices();
            if (ctx.state === 'closed') {
                unlocked = false;
                resumeAttempt++;
            }
        }
    };
    return ctx;
}
/** Call directly from a user gesture, before async work; never called on import. */
export function unlockAudio() {
    try {
        const ctx = createContext();
        if (!ctx)
            return;
        if (ctx.state === 'running') {
            resumeAttempt++;
            unlocked = true;
            reconcileMusic();
            return;
        }
        const token = lifecycle;
        const attempt = ++resumeAttempt;
        // resume() itself must run synchronously in the gesture, not in a promise.
        // A native resume may remain pending until a later eligible gesture. Each
        // new gesture can retry. Any successful native transition may unlock this
        // context; a redundant or older rejection cannot revoke running audio.
        const resumed = ctx.resume();
        void Promise.resolve(resumed).then(() => {
            if (token !== lifecycle || context !== ctx || ctx.state !== 'running')
                return;
            unlocked = true;
            reconcileMusic();
        }).catch(() => {
            if (token !== lifecycle || context !== ctx || attempt !== resumeAttempt || ctx.state === 'running')
                return;
            unlocked = false;
            stopMusic();
            stopVoices();
        });
        if (ctx.state === 'running') {
            unlocked = true;
            reconcileMusic();
        }
    }
    catch {
        unlocked = false;
        stopMusic();
        stopVoices();
    }
}
/** The master gate silences currently playing and already scheduled voices. */
export function setAudioEnabled(value) {
    enabled = value;
    if (master && context) {
        try {
            master.gain.cancelScheduledValues(context.currentTime);
            master.gain.setValueAtTime(enabled ? 1 : 0, context.currentTime);
        }
        catch { /* The browser may have closed the context. */ }
    }
    if (!enabled) {
        stopMusic();
        stopVoices();
    }
    else
        reconcileMusic();
}
/** Stops only the backing track; a finish jingle can ring out afterward. */
export function setMusicPlaying(value) {
    musicWanted = value;
    reconcileMusic();
}
export function playEffect(kind) {
    if (!canPlay())
        return;
    const at = context.currentTime + 0.005;
    const notes = (pitches, gap, duration, volume = 0.06) => {
        pitches.forEach((midi, index) => tone(midi, at + index * gap, duration, volume, 'effects', 'triangle', 2000));
    };
    try {
        switch (kind) {
            case 'move':
                tone(67, at, 0.045, 0.018, 'effects', 'triangle', 800);
                break;
            case 'ingredient':
                notes([74, 78], 0.045, 0.16, 0.05);
                break;
            case 'ready':
                notes([74, 78, 81], 0.065, 0.22);
                break;
            case 'serve':
                notes([74, 81, 83, 86], 0.06, 0.25, 0.065);
                break;
            case 'mistake':
                notes([65, 62], 0.075, 0.14, 0.045);
                break;
            case 'select':
                tone(69, at, 0.09, 0.03, 'effects', 'sine', 1200);
                break;
            case 'start':
                notes([62, 66, 69, 74], 0.08, 0.22, 0.055);
                break;
            case 'finish':
                notes([74, 71, 69, 66, 62], 0.12, 0.3, 0.065);
                break;
            case 'countdown':
                tone(69, at, 0.075, 0.03, 'effects', 'sine', 1000);
                break;
            case 'timeout':
                notes([69, 66, 62], 0.09, 0.18, 0.045);
                break;
        }
    }
    catch { /* Audio is optional; a browser/device error never interrupts play. */ }
}
/** Safe on repeated StrictMode cleanup and on a later remount. */
export function disposeAudio() {
    lifecycle++;
    enabled = false;
    musicWanted = false;
    unlocked = false;
    resumeAttempt++;
    stopMusic();
    stopVoices();
    for (const bus of [musicBus, effectsBus, master]) {
        try {
            bus?.disconnect();
        }
        catch { /* Already disconnected. */ }
    }
    const previous = context;
    if (previous)
        previous.onstatechange = null;
    context = undefined;
    master = undefined;
    musicBus = undefined;
    effectsBus = undefined;
    noise = undefined;
    if (previous) {
        try {
            void Promise.resolve(previous.close()).catch(() => { });
        }
        catch { /* Unsupported close. */ }
    }
}
