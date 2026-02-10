// ══════════════════════════════════════════
//  Ranking System (Supabase + localStorage fallback)
// ══════════════════════════════════════════
const Ranking = {
    _supabase: null,
    _cache: null, // 메모리 캐시
    _cacheTime: 0,
    _lastSubmitAt: 0,
    _sessionSubmitCount: 0,

    CACHE_TTL: 5000, // 5초 캐시
    MAX_NAME_LEN: 3,
    MAX_ENTRIES: 200,
    MIN_SCORE: 0,
    MAX_SCORE: 1000000,
    MIN_SUBMIT_INTERVAL_MS: 3000,
    MAX_SESSION_SUBMISSIONS: 5,
    BLOCKED_NAMES: [
        'ASS', 'BCH', 'CNT', 'CUM', 'DCK', 'DIK', 'FAG', 'FAP', 'FCK', 'FUC',
        'FUK', 'JIZ', 'KKK', 'KYS', 'NAZ', 'NIG', 'PNS', 'SEX', 'SHT', 'TIT',
        'VGN', 'XXX',
    ],

    init() {
        try {
            if (typeof supabase === 'undefined') {
                throw new Error('Supabase SDK not loaded');
            }
            this._supabase = supabase.createClient(
                'https://kcecwrcfifleboaikyaz.supabase.co',
                'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtjZWN3cmNmaWZsZWJvYWlreWF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3MjQ4MjgsImV4cCI6MjA4NjMwMDgyOH0.keWzcAyWoSgIR3XmHNHk34M4iP2gf6LBqxVo7kI10O8'
            );
        } catch (e) {
            console.warn('Supabase 초기화 실패, localStorage 사용:', e);
            this._supabase = null;
        }
    },

    _normalizeName(name) {
        if (typeof name !== 'string') return null;
        const cleaned = name.toUpperCase().replace(/[^A-Z]/g, '').slice(0, this.MAX_NAME_LEN);
        if (!new RegExp(`^[A-Z]{${this.MAX_NAME_LEN}}$`).test(cleaned)) return null;
        if (this.BLOCKED_NAMES.includes(cleaned)) return null;
        return cleaned;
    },

    _normalizeScore(score) {
        const parsed = Number(score);
        if (!Number.isFinite(parsed)) return null;
        const normalized = Math.floor(parsed);
        if (normalized < this.MIN_SCORE || normalized > this.MAX_SCORE) return null;
        return normalized;
    },

    _sanitizeEntry(entry) {
        if (!entry || typeof entry !== 'object') return null;
        const name = this._normalizeName(entry.name);
        const score = this._normalizeScore(entry.score);
        if (!name || score === null) return null;
        const createdAt = typeof entry.created_at === 'string' && entry.created_at
            ? entry.created_at
            : new Date().toISOString();
        return { name, score, created_at: createdAt };
    },

    _sanitizeEntries(entries) {
        if (!Array.isArray(entries)) return [];
        return entries
            .map((entry) => this._sanitizeEntry(entry))
            .filter((entry) => entry !== null)
            .sort((a, b) => b.score - a.score)
            .slice(0, this.MAX_ENTRIES);
    },

    _isRateLimited() {
        const now = Date.now();
        if (this._sessionSubmitCount >= this.MAX_SESSION_SUBMISSIONS) return true;
        if (this._lastSubmitAt > 0 && now - this._lastSubmitAt < this.MIN_SUBMIT_INTERVAL_MS) {
            return true;
        }
        return false;
    },

    _markSubmitted() {
        this._lastSubmitAt = Date.now();
        this._sessionSubmitCount += 1;
    },

    // ── 점수 등록 (RPC) ──
    async add(name, score) {
        const safeName = this._normalizeName(name);
        const safeScore = this._normalizeScore(score);

        if (!safeName || safeScore === null) {
            console.warn('잘못된 점수 등록 요청 차단:', { name, score });
            return false;
        }

        if (this._isRateLimited()) {
            console.warn('점수 등록 속도 제한');
            return false;
        }

        this._markSubmitted();

        if (this._supabase) {
            try {
                const { error } = await this._supabase.rpc('submit_score', {
                    p_name: safeName,
                    p_score: safeScore,
                });
                if (error) throw error;
                this._cache = null; // 캐시 무효화
                return true;
            } catch (e) {
                console.warn('Supabase 등록 실패, localStorage 폴백:', e);
            }
        }

        // localStorage 폴백
        this._addLocal(safeName, safeScore);
        this._cache = null;
        return true;
    },

    // ── 전체 랭킹 조회 ──
    async getAll() {
        // 캐시 확인
        if (this._cache && Date.now() - this._cacheTime < this.CACHE_TTL) {
            return this._cache;
        }

        if (this._supabase) {
            try {
                const { data, error } = await this._supabase
                    .from('rankings')
                    .select('name, score, created_at')
                    .order('score', { ascending: false })
                    .limit(this.MAX_ENTRIES);

                if (error) throw error;

                this._cache = this._sanitizeEntries(data || []);
                this._cacheTime = Date.now();
                return this._cache;
            } catch (e) {
                console.warn('Supabase 조회 실패, localStorage 폴백:', e);
            }
        }

        const local = this._getAllLocal();
        this._cache = local;
        this._cacheTime = Date.now();
        return local;
    },

    // ── 상위 N개 ──
    async getTop(n = 10) {
        const all = await this.getAll();
        const requested = Number(n);
        const limit = Number.isFinite(requested)
            ? Math.max(1, Math.min(this.MAX_ENTRIES, Math.floor(requested)))
            : 10;
        return all.slice(0, limit);
    },

    // ── 해당 점수의 순위 (1-based) ──
    async getRank(score) {
        const safeScore = this._normalizeScore(score);
        if (safeScore === null) {
            const total = await this.getTotal();
            return total + 1;
        }

        if (this._supabase) {
            try {
                const { count, error } = await this._supabase
                    .from('rankings')
                    .select('*', { count: 'exact', head: true })
                    .gt('score', safeScore);
                if (error) throw error;
                return (count || 0) + 1;
            } catch (e) {
                console.warn('Supabase 순위 조회 실패:', e);
            }
        }

        // 폴백
        const all = await this.getAll();
        let rank = 1;
        for (const r of all) {
            if (r.score > safeScore) rank += 1;
            else break;
        }
        return rank;
    },

    // ── 총 플레이 수 ──
    async getTotal() {
        if (this._supabase) {
            try {
                const { count, error } = await this._supabase
                    .from('rankings')
                    .select('*', { count: 'exact', head: true });
                if (error) throw error;
                return count || 0;
            } catch (e) {
                console.warn('Supabase 총수 조회 실패:', e);
            }
        }
        const all = await this.getAll();
        return all.length;
    },

    // ── 상위 몇 % ──
    async getTopPercent(score) {
        const safeScore = this._normalizeScore(score);
        if (safeScore === null) return 100;

        const [rank, total] = await Promise.all([
            this.getRank(safeScore),
            this.getTotal(),
        ]);

        if (total <= 1) return 1;
        return Math.max(1, Math.ceil((rank / total) * 100));
    },

    // ══ localStorage 폴백 ══
    _LOCAL_KEY: 'suika_rankings',

    _getAllLocal() {
        try {
            const raw = JSON.parse(localStorage.getItem(this._LOCAL_KEY) || '[]');
            return this._sanitizeEntries(raw);
        } catch (e) {
            return [];
        }
    },

    _addLocal(name, score) {
        const safeName = this._normalizeName(name);
        const safeScore = this._normalizeScore(score);
        if (!safeName || safeScore === null) return;

        const rankings = this._getAllLocal();
        rankings.push({
            name: safeName,
            score: safeScore,
            created_at: new Date().toISOString(),
        });

        const sanitized = this._sanitizeEntries(rankings);
        try {
            localStorage.setItem(this._LOCAL_KEY, JSON.stringify(sanitized));
        } catch (e) {
            console.warn('localStorage 저장 실패:', e);
        }
    },
};
