const AudioManager = {
    muted: false,
    unlocked: false,
    unlockPromise: null,
    wantsBGM: false,
    bgmAudio: null,
    sfxPools: {},

    sfxConfig: {
        drop: { src: 'assets/audio/drop.wav', volume: 0.52, voices: 4 },
        merge: { src: 'assets/audio/merge.wav', volume: 0.56, voices: 4 },
        combo: { src: 'assets/audio/combo.wav', volume: 0.56, voices: 4 },
        gameover: { src: 'assets/audio/gameover.wav', volume: 0.62, voices: 2 },
    },

    init() {
        this.muted = localStorage.getItem('suika_muted') === 'true';
        this._createAudioObjects();
        this._updateMuteButton();

        const muteBtn = document.getElementById('mute-btn');
        if (muteBtn) {
            muteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleMute();
            });
        }

        const unlockEvents = ['pointerdown', 'touchstart', 'mousedown', 'keydown'];
        const unlockOnGesture = () => this.unlock();
        unlockEvents.forEach((evt) => {
            document.addEventListener(evt, unlockOnGesture, { capture: true, passive: false });
        });

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                if (this.bgmAudio) this.bgmAudio.pause();
                return;
            }

            if (!this.muted && this.wantsBGM) {
                this.unlock().then(() => this._playBGM());
            }
        });
    },

    _createAudioObjects() {
        this.bgmAudio = this._createAudio('assets/audio/bgm_loop.wav', true);
        this.sfxPools = {};

        for (const [name, cfg] of Object.entries(this.sfxConfig)) {
            const voices = Math.max(1, cfg.voices || 1);
            this.sfxPools[name] = {
                volume: cfg.volume,
                index: 0,
                items: Array.from({ length: voices }, () => this._createAudio(cfg.src, false)),
            };
        }
    },

    _createAudio(src, loop) {
        const audio = new Audio(src);
        audio.preload = 'auto';
        audio.loop = !!loop;
        audio.playsInline = true;
        audio.setAttribute('playsinline', '');
        audio.setAttribute('webkit-playsinline', '');
        audio.load();
        return audio;
    },

    unlock() {
        if (this.unlocked) {
            return Promise.resolve(true);
        }

        if (this.unlockPromise) {
            return this.unlockPromise;
        }

        const candidates = [];
        if (this.bgmAudio) candidates.push(this.bgmAudio);
        for (const pool of Object.values(this.sfxPools)) {
            if (pool.items && pool.items.length > 0) candidates.push(pool.items[0]);
        }

        this.unlockPromise = Promise.all(candidates.map((audio) => this._primeAudio(audio)))
            .then(() => {
                this.unlocked = true;
                if (!this.muted && this.wantsBGM) this._playBGM();
                return true;
            })
            .catch(() => false)
            .finally(() => {
                this.unlockPromise = null;
            });

        return this.unlockPromise;
    },

    _primeAudio(audio) {
        if (!audio) return Promise.resolve();

        const prevMuted = audio.muted;
        const prevVolume = audio.volume;
        audio.muted = true;
        audio.volume = 0;

        try {
            audio.currentTime = 0;
        } catch (e) {}

        const played = audio.play();

        const finalize = () => {
            try {
                audio.pause();
                audio.currentTime = 0;
            } catch (e) {}
            audio.muted = prevMuted;
            audio.volume = prevVolume;
        };

        if (played && typeof played.then === 'function') {
            return played.then(() => finalize()).catch(() => finalize());
        }

        finalize();
        return Promise.resolve();
    },

    startBGM() {
        this.wantsBGM = true;
        if (this.muted) return;

        if (this.unlocked) {
            this._playBGM();
        }
    },

    _playBGM() {
        if (!this.bgmAudio || this.muted) return;

        this.bgmAudio.volume = 0.4;
        const played = this.bgmAudio.play();
        if (played && typeof played.catch === 'function') {
            played.catch(() => {});
        }
    },

    stopBGM() {
        this.wantsBGM = false;
        if (!this.bgmAudio) return;

        this.bgmAudio.pause();
        try {
            this.bgmAudio.currentTime = 0;
        } catch (e) {}
    },

    play(name) {
        if (this.muted) return;

        const pool = this.sfxPools[name];
        if (!pool) return;

        const playNow = () => this._playFromPool(pool);

        if (this.unlocked) {
            playNow();
            return;
        }

        this.unlock().then((ok) => {
            if (!ok || this.muted) return;
            playNow();
        });
    },

    _playFromPool(pool) {
        const items = pool.items;
        if (!items || items.length === 0) return;

        const audio = items[pool.index];
        pool.index = (pool.index + 1) % items.length;

        audio.volume = pool.volume;
        try {
            audio.currentTime = 0;
        } catch (e) {}

        const played = audio.play();
        if (played && typeof played.catch === 'function') {
            played.catch(() => {});
        }
    },

    toggleMute() {
        this.muted = !this.muted;
        localStorage.setItem('suika_muted', this.muted);
        this._updateMuteButton();

        if (this.muted) {
            if (this.bgmAudio) this.bgmAudio.pause();
            return;
        }

        if (this.wantsBGM) {
            if (this.unlocked) {
                this._playBGM();
            } else {
                this.unlock().then(() => this._playBGM());
            }
        }
    },

    _updateMuteButton() {
        const btn = document.getElementById('mute-btn');
        if (!btn) return;

        btn.textContent = this.muted ? 'OFF' : 'ON';
        btn.title = this.muted ? 'Sound Off' : 'Sound On';
    },
};
