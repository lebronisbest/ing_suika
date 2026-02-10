// ╔════════════════════════════════════════════════════════════════╗
// ║  🎵 사운드폰트 설정 — 여기서 악기를 바꾸세요!               ║
// ╠════════════════════════════════════════════════════════════════╣
// ║  코드    GM#   악기 이름                                     ║
// ║  '0000'   0    Acoustic Grand Piano                          ║
// ║  '0080'   8    Celesta                                       ║
// ║  '0090'   9    Glockenspiel                                  ║
// ║  '0100'  10    Music Box            ← 기본 멜로디            ║
// ║  '0110'  11    Vibraphone                                    ║
// ║  '0120'  12    Marimba                                       ║
// ║  '0130'  13    Xylophone                                     ║
// ║  '0140'  14    Tubular Bells                                 ║
// ║  '0150'  15    Dulcimer                                      ║
// ║  '0240'  24    Nylon Guitar                                  ║
// ║  '0320'  32    Acoustic Bass        ← 기본 베이스            ║
// ║  '0330'  33    Electric Bass (Finger)                        ║
// ║  '0400'  40    Violin                                        ║
// ║  '0460'  46    Orchestral Harp                               ║
// ║  '0480'  48    String Ensemble      ← 기본 코드              ║
// ║  '0730'  73    Flute                                         ║
// ║  '0790'  79    Ocarina                                       ║
// ║  '0800'  80    Square Lead (8-bit Chiptune)                  ║
// ║  '0880'  88    New Age Pad                                   ║
// ║  '1120' 112    Tinkle Bell                                   ║
// ╚════════════════════════════════════════════════════════════════╝

const BGM_VOICES = {
    melody:   '0000',   // Acoustic Grand Piano
    bass:     '0320',   // Acoustic Bass
    chords:   '0880',   // New Age Pad
    arpeggio: '0080',   // Celesta
};

// 사운드폰트 이름 (다른 폰트: 'JCLive_sf2_file', 'SoundBlasterOld_sf2')
const SOUNDFONT = 'FluidR3_GM_sf2_file';
const FONT_URL  = 'https://surikov.github.io/webaudiofontdata/sound/';


// ─── helpers ───
function noteFreq(name) {
    const m = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 };
    return 440 * Math.pow(2, (m[name.slice(0,-1)] + (parseInt(name.slice(-1))+1)*12 - 69) / 12);
}
function noteToMidi(name) {
    const m = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 };
    return m[name.slice(0,-1)] + (parseInt(name.slice(-1))+1) * 12;
}


// ══════════════════════════════════════════
//  SoundFont Loader
// ══════════════════════════════════════════
const SF = {
    player: null,
    presets: {},
    ready: false,

    async load(ctx) {
        if (typeof WebAudioFontPlayer === 'undefined') return false;
        try {
            this.player = new WebAudioFontPlayer();
            const codes = [...new Set(Object.values(BGM_VOICES))];

            for (const code of codes) {
                const varName = '_tone_' + code + '_' + SOUNDFONT;
                const url = FONT_URL + code + '_' + SOUNDFONT + '.js';
                this.player.loader.startLoad(ctx, url, varName);
            }

            await new Promise((resolve) => {
                this.player.loader.waitLoad(resolve);
            });

            for (const [role, code] of Object.entries(BGM_VOICES)) {
                const varName = '_tone_' + code + '_' + SOUNDFONT;
                if (window[varName]) {
                    this.presets[role] = window[varName];
                }
            }
            this.ready = Object.keys(this.presets).length > 0;
        } catch (e) {
            this.ready = false;
        }
        return this.ready;
    },

    play(ctx, dest, role, when, pitch, duration, volume) {
        if (!this.ready || !this.player || !this.presets[role]) return false;
        this.player.queueWaveTable(ctx, dest, this.presets[role], when, pitch, duration, volume);
        return true;
    },
};


// ══════════════════════════════════════════
//  BGM — 16-bar minimal emotional loop
// ══════════════════════════════════════════
const BGM = {
    playing: false,
    tempo: 76,
    beatDur: 60 / 76,
    totalBeats: 64,
    nextBeatTime: 0,
    currentBeat: 0,
    timerID: null,
    ctx: null,
    out: null,

    // ── Progression: C G Am Em | F C F G | Am Em F C | Dm G C C ──
    melody: [
        null,'G4',null,null,  null,null,'A4',null,
        null,'C5',null,'B4',  null,null,null,null,
        null,'A4',null,null,  'G4',null,null,'E4',
        'F4',null,null,null,  null,null,'G4',null,
        'A4',null,null,'C5',  'B4',null,null,null,
        'C5',null,'D5',null,  'E5',null,null,null,
        'D5',null,null,'C5',  'B4',null,null,'A4',
        'G4',null,null,null,  null,null,null,null,
    ],
    bass: ['C3','G2','A2','E2','F2','C3','F2','G2',
           'A2','E2','F2','C3','D3','G2','C3','C3'],
    chords: [
        ['C4','E4','G4'],['G3','B3','D4'],
        ['A3','C4','E4'],['E3','G3','B3'],
        ['F3','A3','C4'],['C4','E4','G4'],
        ['F3','A3','C4'],['G3','B3','D4'],
        ['A3','C4','E4'],['E3','G3','B3'],
        ['F3','A3','C4'],['C4','E4','G4'],
        ['D3','F3','A3'],['G3','B3','D4'],
        ['C3','E3','G3'],['C4','E4','G4'],
    ],

    start(ctx, dest) {
        if (this.playing) return;
        this.ctx = ctx; this.out = dest;
        this.currentBeat = 0;
        this.nextBeatTime = ctx.currentTime + 0.08;
        this.playing = true;
        this._schedule();
    },
    stop() {
        this.playing = false;
        if (this.timerID) { clearInterval(this.timerID); this.timerID = null; }
    },

    _schedule() {
        this.timerID = setInterval(() => {
            if (!this.playing) return;
            while (this.nextBeatTime < this.ctx.currentTime + 0.12) {
                this._beat(this.currentBeat, this.nextBeatTime);
                this.nextBeatTime += this.beatDur;
                this.currentBeat = (this.currentBeat + 1) % this.totalBeats;
            }
        }, 25);
    },

    _beat(beat, t) {
        const bar = Math.floor(beat / 4);
        const inBar = beat % 4;
        const d = this.beatDur;

        // melody — sparse piano, long sustain
        const mel = this.melody[beat];
        if (mel) this._note('melody', mel, t, d * 2.5, 0.4, 'triangle', 0.07);

        // bass — gentle, once per bar
        if (inBar === 0)
            this._note('bass', this.bass[bar], t, d * 3.8, 0.28, 'sine', 0.035);

        // chords — soft new-age pad, once per bar
        if (inBar === 0)
            this.chords[bar].forEach(n =>
                this._note('chords', n, t, d * 3.8, 0.08, 'sine', 0.010));

        // celesta shimmer — single gentle note on beat 2
        if (inBar === 2) {
            const ch = this.chords[bar];
            this._noteOctaveUp('arpeggio', ch[2], t, d * 1.8, 0.06, 'sine', 0.005);
        }
    },

    // try soundfont → fallback to oscillator
    _note(role, note, t, dur, sfVol, fbWave, fbVol) {
        const midi = noteToMidi(note);
        if (SF.play(this.ctx, this.out, role, t, midi, dur, sfVol)) return;
        this._osc(note, t, dur, fbWave, fbVol, role);
    },
    _noteOctaveUp(role, note, t, dur, sfVol, fbWave, fbVol) {
        const midi = noteToMidi(note) + 12;
        if (SF.play(this.ctx, this.out, role, t, midi, dur, sfVol)) return;
        this._osc(note, t, dur, fbWave, fbVol, role, true);
    },

    // oscillator fallback — emotional envelopes
    _osc(note, t, dur, wave, vol, role, octUp) {
        const c = this.ctx;
        const f = noteFreq(note) * (octUp ? 2 : 1);
        const o = c.createOscillator(), g = c.createGain();
        o.type = wave; o.frequency.value = f;

        if (role === 'melody') {
            // piano-like: quick attack, gentle decay to sustain, soft release
            g.gain.setValueAtTime(0, t);
            g.gain.linearRampToValueAtTime(vol, t + 0.01);
            g.gain.exponentialRampToValueAtTime(vol * 0.55, t + 0.18);
            g.gain.setValueAtTime(vol * 0.55, t + dur - 0.12);
            g.gain.linearRampToValueAtTime(0.001, t + dur);
        } else if (role === 'bass') {
            // warm, round bass
            g.gain.setValueAtTime(0, t);
            g.gain.linearRampToValueAtTime(vol, t + 0.05);
            g.gain.setValueAtTime(vol, t + dur - 0.15);
            g.gain.linearRampToValueAtTime(0.001, t + dur);
        } else if (role === 'chords') {
            // slow pad swell
            g.gain.setValueAtTime(0, t);
            g.gain.linearRampToValueAtTime(vol, t + 0.2);
            g.gain.setValueAtTime(vol, t + dur - 0.25);
            g.gain.linearRampToValueAtTime(0.001, t + dur);
        } else {
            // celesta bell-like: instant attack, gentle decay
            g.gain.setValueAtTime(0, t);
            g.gain.linearRampToValueAtTime(vol, t + 0.005);
            g.gain.exponentialRampToValueAtTime(vol * 0.12, t + dur * 0.6);
            g.gain.linearRampToValueAtTime(0.001, t + dur);
        }
        o.connect(g); g.connect(this.out);
        o.start(t); o.stop(t + dur + 0.01);
    },
};


// ══════════════════════════════════════════
//  AudioManager
// ══════════════════════════════════════════
const AudioManager = {
    sounds: {},
    muted: false,
    ctx: null,
    bgmGain: null,
    sfxGain: null,
    bgmStarted: false,
    sfLoading: false,
    sfLoaded: false,

    init() {
        this.muted = localStorage.getItem('suika_muted') === 'true';
        this._updateMuteButton();
        document.getElementById('mute-btn').addEventListener('click', () => this.toggleMute());

        const resume = () => {
            const c = this._getContext();
            if (c.state === 'suspended') c.resume();
            this._ensureBGM();
        };
        document.addEventListener('pointerdown', resume, { once: true });
        document.addEventListener('keydown', resume, { once: true });
    },

    _getContext() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.bgmGain = this.ctx.createGain();
            this.bgmGain.gain.value = this.muted ? 0 : 0.55;
            this.bgmGain.connect(this.ctx.destination);
            this.sfxGain = this.ctx.createGain();
            this.sfxGain.gain.value = this.muted ? 0 : 1;
            this.sfxGain.connect(this.ctx.destination);
        }
        return this.ctx;
    },

    async _loadSoundFonts() {
        if (this.sfLoaded || this.sfLoading) return;
        this.sfLoading = true;
        const ctx = this._getContext();
        this.sfLoaded = await SF.load(ctx);
        this.sfLoading = false;
        if (this.sfLoaded) console.log('SoundFont loaded ✓');
    },

    _ensureBGM() {
        if (this.bgmStarted || this.muted) return;
        const ctx = this._getContext();
        if (ctx.state === 'running') {
            this._loadSoundFonts();
            BGM.start(ctx, this.bgmGain);
            this.bgmStarted = true;
        }
    },

    startBGM() {
        if (this.muted) return;
        const ctx = this._getContext();
        if (!this.bgmStarted) {
            this._loadSoundFonts();
            BGM.start(ctx, this.bgmGain);
            this.bgmStarted = true;
        }
    },
    stopBGM() {
        BGM.stop();
        this.bgmStarted = false;
    },

    // ── SFX ──
    play(name) {
        if (this.muted) return;
        this._ensureBGM();
        this._playSynth(name);
    },

    _playSynth(name) {
        if (this.muted) return;
        try {
            const ctx = this._getContext();
            const now = ctx.currentTime;
            const dest = this.sfxGain;

            if (name === 'drop') {
                const o = ctx.createOscillator(), g = ctx.createGain();
                o.type = 'triangle';
                o.frequency.setValueAtTime(880, now);
                o.frequency.exponentialRampToValueAtTime(660, now + 0.08);
                g.gain.setValueAtTime(0.18, now);
                g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
                o.connect(g); g.connect(dest);
                o.start(now); o.stop(now + 0.13);

            } else if (name === 'merge') {
                [0, 0.06].forEach((delay, i) => {
                    const o = ctx.createOscillator(), g = ctx.createGain();
                    o.type = i === 0 ? 'sine' : 'triangle';
                    const base = i === 0 ? 520 : 780;
                    o.frequency.setValueAtTime(base, now + delay);
                    o.frequency.exponentialRampToValueAtTime(base * 1.5, now + delay + 0.12);
                    g.gain.setValueAtTime(i === 0 ? 0.18 : 0.08, now + delay);
                    g.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.18);
                    o.connect(g); g.connect(dest);
                    o.start(now + delay); o.stop(now + delay + 0.2);
                });

            } else if (name === 'combo') {
                [523, 659, 784, 1047].forEach((freq, i) => {
                    const o = ctx.createOscillator(), g = ctx.createGain();
                    o.type = 'triangle'; o.frequency.value = freq;
                    const t = now + i * 0.06;
                    g.gain.setValueAtTime(0.12, t);
                    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
                    o.connect(g); g.connect(dest);
                    o.start(t); o.stop(t + 0.16);
                });

            } else if (name === 'gameover') {
                [659, 523, 392].forEach((freq, i) => {
                    const o = ctx.createOscillator(), g = ctx.createGain();
                    o.type = 'triangle'; o.frequency.value = freq;
                    const t = now + i * 0.25;
                    g.gain.setValueAtTime(0.2, t);
                    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
                    o.connect(g); g.connect(dest);
                    o.start(t); o.stop(t + 0.42);
                });
                BGM.stop();
                this.bgmStarted = false;
            }
        } catch (e) {}
    },

    // ── Mute ──
    toggleMute() {
        this.muted = !this.muted;
        localStorage.setItem('suika_muted', this.muted);
        this._updateMuteButton();
        if (this.muted) {
            if (this.bgmGain) this.bgmGain.gain.value = 0;
            if (this.sfxGain) this.sfxGain.gain.value = 0;
            BGM.stop(); this.bgmStarted = false;
        } else {
            if (this.bgmGain) this.bgmGain.gain.value = 0.55;
            if (this.sfxGain) this.sfxGain.gain.value = 1;
            this.startBGM();
        }
    },
    _updateMuteButton() {
        const btn = document.getElementById('mute-btn');
        if (btn) btn.textContent = this.muted ? '🔇' : '🔊';
    }
};
