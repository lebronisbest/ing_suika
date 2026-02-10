const Game = {
    canvas: null,
    ctx: null,
    state: 'loading',
    score: 0,
    combo: 0,
    comboTimer: null,
    currentTier: 0,
    nextTier: 0,
    dropX: 195,
    canDrop: true,
    dropCooldown: 500,
    mergeQueue: [],
    gameOverCheckTimer: null,
    animFrame: null,

    async init() {
        this.canvas = document.getElementById('game-canvas');

        // 고해상도 디스플레이 대응 (Retina, 4K 등)
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = Physics.CANVAS_WIDTH * dpr;
        this.canvas.height = Physics.CANVAS_HEIGHT * dpr;

        this.ctx = this.canvas.getContext('2d');

        // 캔버스 스케일링으로 고해상도 렌더링
        this.ctx.scale(dpr, dpr);

        // 이미지 렌더링 품질 향상
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';

        await ItemManager.preload();

        UI.init();
        AudioManager.init();
        UI.onRestart(() => this.restart());

        this._bindInput();
        this.start();
    },

    start() {
        Physics.init();
        Effects.clear();
        this.score = 0;
        this.combo = 0;
        this.canDrop = true;
        this.mergeQueue = [];
        this.dropX = Physics.CANVAS_WIDTH / 2;
        this.currentTier = ItemManager.getRandomDropTier();
        this.nextTier = ItemManager.getRandomDropTier();
        this.state = 'playing';

        UI.updateScore(0);
        UI.hideGameOver();
        UI.drawNextItem(this.nextTier);

        Physics.onCollision((a, b) => this._onCollision(a, b));

        AudioManager.startBGM();

        this._gameLoop();
    },

    restart() {
        if (this.animFrame) cancelAnimationFrame(this.animFrame);
        if (this.comboTimer) clearTimeout(this.comboTimer);
        if (this.gameOverCheckTimer) clearTimeout(this.gameOverCheckTimer);
        Physics.clear();
        this.start();
    },

    _bindInput() {
        let isPointerDown = false;

        const getX = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const scaleX = this.canvas.width / rect.width;
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            return (clientX - rect.left) * scaleX;
        };

        const onMove = (e) => {
            if (this.state !== 'playing') return;
            e.preventDefault();
            const x = getX(e);
            const r = ITEMS[this.currentTier].radius;
            this.dropX = Math.max(r + 2, Math.min(Physics.CANVAS_WIDTH - r - 2, x));
        };

        const onDown = (e) => {
            if (this.state !== 'playing') return;
            onMove(e);
            this._drop();
        };

        const onUp = (e) => {
            if (this.state !== 'playing') return;
            // 이제 onDown에서 즉시 투하하므로 여기서는 아무것도 하지 않음
        };

        this.canvas.addEventListener('mousemove', onMove);
        this.canvas.addEventListener('mousedown', onDown);
        this.canvas.addEventListener('mouseup', onUp);
        this.canvas.addEventListener('touchmove', onMove, { passive: false });
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            onDown(e);
        }, { passive: false });
        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            onUp(e);
        }, { passive: false });
    },

    _drop() {
        if (!this.canDrop || this.state !== 'playing') return;

        this.canDrop = false;
        const body = Physics.createCircle(this.dropX, 40, this.currentTier);

        AudioManager.play('drop');

        this.currentTier = this.nextTier;
        this.nextTier = ItemManager.getRandomDropTier();
        UI.drawNextItem(this.nextTier);

        setTimeout(() => {
            this.canDrop = true;
        }, this.dropCooldown);
    },

    _onCollision(bodyA, bodyB) {
        if (this.state !== 'playing') return;
        if (bodyA.label !== 'item' || bodyB.label !== 'item') return;
        if (bodyA.isMerging || bodyB.isMerging) return;
        if (bodyA.tier !== bodyB.tier) return;

        const tier = bodyA.tier;
        if (tier >= ITEMS.length - 1) {
            this._handleMaxMerge(bodyA, bodyB);
            return;
        }

        bodyA.isMerging = true;
        bodyB.isMerging = true;

        const midX = (bodyA.position.x + bodyB.position.x) / 2;
        const midY = (bodyA.position.y + bodyB.position.y) / 2;

        Physics.removeBody(bodyA);
        Physics.removeBody(bodyB);

        const newTier = tier + 1;
        const newBody = Physics.createCircle(midX, midY, newTier);
        newBody.dropTime = 0;

        const points = ITEMS[newTier].score;
        this.score += points;
        UI.updateScore(this.score);

        Effects.createMergeEffect(midX, midY, ITEMS[newTier].color, newTier);

        if (newTier >= 5) {
            Effects.shake(4 + (newTier - 5) * 2, 15);
        }

        AudioManager.play('merge');

        this._handleCombo(midX, midY);
    },

    _handleMaxMerge(bodyA, bodyB) {
        bodyA.isMerging = true;
        bodyB.isMerging = true;

        const midX = (bodyA.position.x + bodyB.position.x) / 2;
        const midY = (bodyA.position.y + bodyB.position.y) / 2;

        Physics.removeBody(bodyA);
        Physics.removeBody(bodyB);

        this.score += 500;
        UI.updateScore(this.score);

        Effects.createMaxMergeEffect(midX, midY);
        AudioManager.play('combo');

        this._handleCombo(midX, midY);
    },

    _handleCombo(x, y) {
        this.combo++;

        if (this.comboTimer) clearTimeout(this.comboTimer);

        if (this.combo >= 2) {
            const bonus = this.combo * 5;
            this.score += bonus;
            UI.updateScore(this.score);

            const canvasRect = this.canvas.getBoundingClientRect();
            const scaleX = canvasRect.width / this.canvas.width;
            const scaleY = canvasRect.height / this.canvas.height;
            const container = document.getElementById('game-container');
            const containerRect = container.getBoundingClientRect();

            const screenX = canvasRect.left - containerRect.left + x * scaleX;
            const screenY = canvasRect.top - containerRect.top + y * scaleY;

            Effects.showCombo(screenX, screenY, this.combo, container);
            AudioManager.play('combo');
        }

        this.comboTimer = setTimeout(() => {
            this.combo = 0;
        }, 1200);
    },

    _checkGameOver() {
        if (this.state !== 'playing') return;

        if (Physics.isAboveDeadline()) {
            this.state = 'gameover';
            this.canDrop = false;

            // 물리 엔진 즉시 정지
            Physics.freeze();

            if (this.comboTimer) {
                clearTimeout(this.comboTimer);
                this.comboTimer = null;
            }
            AudioManager.play('gameover');
            UI.showGameOver(this.score);
        }
    },

    _gameLoop() {
        if (this.state === 'loading') return;

        Physics.update();
        Effects.update();

        if (this.state === 'playing') {
            this._checkGameOver();
        }

        this._render();

        this.animFrame = requestAnimationFrame(() => this._gameLoop());
    },

    _render() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        ctx.save();

        const shake = Effects.getShakeOffset();
        ctx.translate(shake.x, shake.y);

        ctx.clearRect(-10, -10, w + 20, h + 20);

        // sky blue background
        const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
        bgGrad.addColorStop(0, '#e8f4fd');
        bgGrad.addColorStop(1, '#d4ecf9');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);

        // deadline line (soft dashed)
        ctx.strokeStyle = 'rgba(66, 165, 245, 0.35)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(0, Physics.DEADLINE_Y);
        ctx.lineTo(w, Physics.DEADLINE_Y);
        ctx.stroke();
        ctx.setLineDash([]);

        // drop preview & guide
        if (this.state === 'playing' && this.canDrop) {
            ctx.strokeStyle = 'rgba(66, 165, 245, 0.18)';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 6]);
            ctx.beginPath();
            ctx.moveTo(this.dropX, 40);
            ctx.lineTo(this.dropX, h);
            ctx.stroke();
            ctx.setLineDash([]);

            ItemManager.drawItem(ctx, this.currentTier, this.dropX, 40, ITEMS[this.currentTier].radius, 0.65);
        }

        // items
        for (const body of Physics.bodies) {
            if (body.label !== 'item') continue;
            const tier = body.tier;
            const item = ITEMS[tier];
            if (!item) continue;

            ctx.save();
            ctx.translate(body.position.x, body.position.y);
            ctx.rotate(body.angle);
            ItemManager.drawItem(ctx, tier, 0, 0, item.radius, 1);
            ctx.restore();
        }

        Effects.draw(ctx);

        ctx.restore();
    }
};

window.addEventListener('DOMContentLoaded', () => Game.init());
