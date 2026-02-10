const UI = {
    scoreEl: null,
    bestScoreEl: null,
    finalScoreEl: null,
    newBestEl: null,
    gameOverOverlay: null,
    nextCanvas: null,
    nextCtx: null,
    nextDpr: 1,
    evoCanvas: null,
    evoCtx: null,
    pendingScore: 0,
    _isSubmitting: false,
    _submitNonce: null,

    init() {
        this.scoreEl = document.getElementById('score');
        this.bestScoreEl = document.getElementById('best-score');
        this.finalScoreEl = document.getElementById('final-score');
        this.newBestEl = document.getElementById('new-best');
        this.gameOverOverlay = document.getElementById('game-over-overlay');
        this.nextCanvas = document.getElementById('next-canvas');
        this.nextCtx = this.nextCanvas.getContext('2d');

        // 고해상도 디스플레이 대응 (모바일은 DPR 상한으로 렌더 비용 절감)
        const lowPower = navigator.maxTouchPoints > 0 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
        const dprCap = lowPower ? 1.5 : 2;
        const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
        this.nextDpr = dpr;
        const displayWidth = 80;
        const displayHeight = 80;
        this.nextCanvas.width = displayWidth * dpr;
        this.nextCanvas.height = displayHeight * dpr;
        this.nextCtx.scale(dpr, dpr);
        this.nextCtx.imageSmoothingEnabled = true;
        this.nextCtx.imageSmoothingQuality = lowPower ? 'medium' : 'high';

        this.evoCanvas = document.getElementById('evolution-canvas');
        if (this.evoCanvas) {
            this.evoCtx = this.evoCanvas.getContext('2d');
        } else {
            this.evoCtx = null;
        }

        const best = this.getBestScore();
        this.bestScoreEl.textContent = best;

        Ranking.init();

        this.drawEvolution();
        this._initNameInput();
    },

    updateScore(score) {
        this.scoreEl.textContent = score;
    },

    getBestScore() {
        const best = parseInt(localStorage.getItem('suika_best') || '0', 10);
        return Number.isFinite(best) && best >= 0 ? best : 0;
    },

    saveBestScore(score) {
        const normalized = this._normalizeScore(score);
        const safeScore = normalized === null ? 0 : normalized;
        localStorage.setItem('suika_best', safeScore);
        this.bestScoreEl.textContent = safeScore;
    },

    drawNextItem(tier) {
        const ctx = this.nextCtx;
        const canvas = this.nextCanvas;
        const dpr = this.nextDpr || 1;

        // DPR을 고려한 클리어
        ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

        const item = ITEMS[tier];
        const maxR = 28;
        const scale = Math.min(maxR, item.radius) / item.radius;
        const drawRadius = item.radius * scale;

        // DPR을 고려한 중심점 계산
        ItemManager.drawItem(ctx, tier, (canvas.width / dpr) / 2, (canvas.height / dpr) / 2, drawRadius, 1);
    },

    // ── Evolution Canvas: Now unused ──
    drawEvolution() {
        // No-op if sidebar removed
    },

    // ── Live Ranking: Now unused ──
    async updateLiveRanking() {
        // No-op
    },

    // ── 게임 오버 ──
    showGameOver(score) {
        const normalized = this._normalizeScore(score);
        const safeScore = normalized === null ? 0 : normalized;
        this.pendingScore = safeScore;
        this._submitNonce = this._createSubmitNonce();
        this._isSubmitting = false;

        this.finalScoreEl.textContent = safeScore;
        const best = this.getBestScore();
        if (safeScore > best) {
            this.saveBestScore(safeScore);
            this.newBestEl.classList.remove('hidden');
        } else {
            this.newBestEl.classList.add('hidden');
        }

        // 이름 입력 보이기, 랭킹 숨기기
        document.getElementById('name-entry').classList.remove('hidden');
        document.getElementById('ranking-result').classList.add('hidden');

        // 입력 초기화
        const chars = document.querySelectorAll('.name-char');
        chars.forEach(c => { c.value = ''; });
        this._setSubmitError('');

        this.gameOverOverlay.classList.remove('hidden');

        // 첫 번째 입력에 포커스
        setTimeout(() => chars[0].focus(), 350);
    },

    hideGameOver() {
        this.gameOverOverlay.classList.add('hidden');
        this._isSubmitting = false;
        this._setSubmitError('');

        const submitBtn = document.getElementById('submit-score-btn');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = '등록';
        }
    },

    onRestart(callback) {
        document.getElementById('restart-btn').addEventListener('click', callback);
    },

    // ── 이름 입력 (3자리 알파벳) ──
    _initNameInput() {
        const chars = document.querySelectorAll('.name-char');
        const submitBtn = document.getElementById('submit-score-btn');

        chars.forEach((input, idx) => {
            input.addEventListener('input', (e) => {
                // 알파벳만 허용
                input.value = input.value.replace(/[^a-zA-Z]/g, '').toUpperCase();
                // 다음 칸으로 자동 이동
                if (input.value.length === 1 && idx < chars.length - 1) {
                    chars[idx + 1].focus();
                }
            });

            input.addEventListener('keydown', (e) => {
                // 백스페이스로 이전 칸 이동
                if (e.key === 'Backspace' && input.value === '' && idx > 0) {
                    chars[idx - 1].focus();
                }
                // 엔터로 등록
                if (e.key === 'Enter') {
                    submitBtn.click();
                }
            });
        });

        submitBtn.addEventListener('click', () => {
            const rawName = Array.from(chars).map(c => c.value).join('');
            const name = this._sanitizePlayerName(rawName);

            if (!name) {
                // 빈 칸에 포커스
                const empty = Array.from(chars).find(c => c.value === '');
                if (empty) empty.focus();
                const errorMessage = this._isBlockedName(rawName)
                    ? '사용할 수 없는 이름입니다.'
                    : '영문 3글자를 입력해 주세요.';
                this._setSubmitError(errorMessage);
                return;
            }
            this._submitScore(name);
        });
    },

    _createSubmitNonce() {
        if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
            const buffer = new Uint32Array(2);
            window.crypto.getRandomValues(buffer);
            return `${Date.now()}-${buffer[0].toString(16)}${buffer[1].toString(16)}`;
        }
        return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    },

    _sanitizePlayerName(name) {
        if (typeof name !== 'string') return null;
        const cleaned = name.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
        if (!/^[A-Z]{3}$/.test(cleaned)) return null;
        if (this._isBlockedName(cleaned)) return null;
        return cleaned;
    },

    _isBlockedName(name) {
        if (typeof name !== 'string') return false;
        const cleaned = name.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
        if (cleaned.length !== 3) return false;

        const hasRanking = typeof Ranking !== 'undefined' && Ranking !== null;
        const blocked = hasRanking && Array.isArray(Ranking.BLOCKED_NAMES)
            ? Ranking.BLOCKED_NAMES
            : [
                'ASS', 'BCH', 'CNT', 'CUM', 'DCK', 'DIK', 'FAG', 'FAP', 'FCK', 'FUC',
                'FUK', 'JIZ', 'KKK', 'KYS', 'NAZ', 'NIG', 'PNS', 'SEX', 'SHT', 'TIT',
                'VGN', 'XXX',
            ];
        return blocked.includes(cleaned);
    },

    _normalizeScore(score) {
        const parsed = Number(score);
        if (!Number.isFinite(parsed)) return null;

        const normalized = Math.floor(parsed);
        const hasRanking = typeof Ranking !== 'undefined' && Ranking !== null;
        const minScore = hasRanking && typeof Ranking.MIN_SCORE === 'number' ? Ranking.MIN_SCORE : 0;
        const maxScore = hasRanking && typeof Ranking.MAX_SCORE === 'number' ? Ranking.MAX_SCORE : 1000000;
        if (normalized < minScore || normalized > maxScore) return null;
        return normalized;
    },

    _setSubmitError(message) {
        let errorEl = document.getElementById('submit-error');
        if (!errorEl) {
            const entryEl = document.getElementById('name-entry');
            if (!entryEl) return;
            errorEl = document.createElement('div');
            errorEl.id = 'submit-error';
            errorEl.classList.add('hidden');
            entryEl.appendChild(errorEl);
        }

        if (message) {
            errorEl.textContent = message;
            errorEl.classList.remove('hidden');
        } else {
            errorEl.textContent = '';
            errorEl.classList.add('hidden');
        }
    },

    _renderPercentileBadge(topPercent) {
        const safePercent = Number.isFinite(Number(topPercent))
            ? Math.max(1, Math.min(100, Math.floor(Number(topPercent))))
            : 100;

        const badgeEl = document.getElementById('percentile-badge');
        badgeEl.replaceChildren();

        const numEl = document.createElement('span');
        numEl.className = 'pct-num';
        numEl.textContent = `${safePercent}%`;

        const labelEl = document.createElement('span');
        labelEl.className = 'pct-label';
        labelEl.textContent = '상위';

        badgeEl.append(numEl, labelEl);
    },

    _renderRankingList(rankings, name, score) {
        const listEl = document.getElementById('ranking-list');
        listEl.replaceChildren();

        const titleEl = document.createElement('div');
        titleEl.className = 'rank-title';
        titleEl.textContent = 'RANKING';
        listEl.appendChild(titleEl);

        const safeRankings = Array.isArray(rankings) ? rankings : [];
        safeRankings.forEach((entry, i) => {
            const entryName = entry && typeof entry === 'object' ? entry.name : null;
            const entryScore = entry && typeof entry === 'object' ? entry.score : null;
            const safeName = this._sanitizePlayerName(entryName) || '---';
            const normalized = this._normalizeScore(entryScore);
            const safeScore = normalized === null ? 0 : normalized;
            const isMe = safeName === name && safeScore === score;

            const rowEl = document.createElement('div');
            rowEl.className = isMe ? 'rank-row rank-me' : 'rank-row';

            const posEl = document.createElement('span');
            posEl.className = 'rank-pos';
            posEl.textContent = `${i + 1}`;

            const nameEl = document.createElement('span');
            nameEl.className = 'rank-name';
            nameEl.textContent = safeName;

            const scoreEl = document.createElement('span');
            scoreEl.className = 'rank-score';
            scoreEl.textContent = safeScore.toLocaleString();

            rowEl.append(posEl, nameEl, scoreEl);
            listEl.appendChild(rowEl);
        });
    },

    async _submitScore(name) {
        if (this._isSubmitting) return;

        const safeName = this._sanitizePlayerName(name);
        const safeScore = this._normalizeScore(this.pendingScore);
        if (!safeName || safeScore === null || !this._submitNonce) {
            this._setSubmitError('점수 검증에 실패했습니다. 다시 시작해 주세요.');
            return;
        }

        const submitBtn = document.getElementById('submit-score-btn');

        // 중복 클릭 방지
        this._isSubmitting = true;
        submitBtn.disabled = true;
        submitBtn.textContent = '등록 중...';
        this._setSubmitError('');

        try {
            // 랭킹 저장
            const saved = await Ranking.add(safeName, safeScore);
            if (!saved) {
                this._setSubmitError('잠시 후 다시 시도해 주세요.');
                return;
            }

            this._submitNonce = null;

            // 이름 입력 숨기고 결과 표시
            document.getElementById('name-entry').classList.add('hidden');
            const resultEl = document.getElementById('ranking-result');
            resultEl.classList.remove('hidden');

            // 상위 % 뱃지
            const topPercent = await Ranking.getTopPercent(safeScore);
            this._renderPercentileBadge(topPercent);

            // 랭킹 리스트 (TOP 5)
            const top = await Ranking.getTop(5);
            this._renderRankingList(top, safeName, safeScore);
        } catch (e) {
            console.error('점수 등록 오류:', e);
            this._setSubmitError('점수 등록 중 오류가 발생했습니다.');
        } finally {
            this._isSubmitting = false;
            submitBtn.disabled = false;
            submitBtn.textContent = '등록';
        }
    },
};
