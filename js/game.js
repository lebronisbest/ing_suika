const Game = {
    canvas: null,
    ctx: null,
    renderDpr: 1,
    lowPowerMode: false,
    bgLayer: null,
    frameCount: 0,
    gameOverCheckEvery: 2,
    perfEnabled: false,
    perfNode: null,
    perfLastTs: 0,
    perfFrameCount: 0,
    perfFrameMsEma: 16.7,
    perfWindowStart: 0,
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
        this.lowPowerMode = this._detectLowPowerMode();
        this.perfEnabled = new URLSearchParams(window.location.search).has('perf');

        this.renderDpr = Math.max(1, window.devicePixelRatio || 1);
        this.canvas.width = Math.floor(Physics.CANVAS_WIDTH * this.renderDpr);
        this.canvas.height = Math.floor(Physics.CANVAS_HEIGHT * this.renderDpr);

        this.ctx = this.canvas.getContext('2d');
        this.ctx.scale(this.renderDpr, this.renderDpr);
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';

        this._buildBackgroundLayer();
        this._initPerfOverlay();

        await ItemManager.preload();

        UI.init();
        AudioManager.init();
        UI.onRestart(() => this.restart());

        this._bindInput();
        this.start();
    },

    start() {
        Physics.configure({ lowPower: this.lowPowerMode });
        Physics.init();
        Effects.configure({ lowPower: false });
        Effects.clear();
        this.frameCount = 0;
        this.perfWindowStart = 0;
        this.perfFrameCount = 0;
        this.perfLastTs = 0;
        this.perfFrameMsEma = 16.7;
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
        let isPressing = false;

        const getClientX = (e) => {
            if (typeof e.clientX === 'number') return e.clientX;

            const touch =
                (e.targetTouches && e.targetTouches.length > 0 && e.targetTouches[0]) ||
                (e.touches && e.touches.length > 0 && e.touches[0]) ||
                (e.changedTouches && e.changedTouches.length > 0 && e.changedTouches[0]);
            return touch ? touch.clientX : null;
        };

        const getX = (e) => {
            const clientX = getClientX(e);
            if (clientX == null) return this.dropX;

            const rect = this.canvas.getBoundingClientRect();
            const ratio = (clientX - rect.left) / rect.width;
            const clamped = Math.max(0, Math.min(1, ratio));
            return clamped * Physics.CANVAS_WIDTH;
        };

        const onMove = (e) => {
            if (this.state !== 'playing') return;
            if (e.cancelable) e.preventDefault();

            const x = getX(e);
            const r = ITEMS[this.currentTier].radius;
            this.dropX = Math.max(r + 2, Math.min(Physics.CANVAS_WIDTH - r - 2, x));
        };

        const onDown = (e) => {
            if (this.state !== 'playing') return;
            if (typeof e.button === 'number' && e.button !== 0) return;
            if (e.cancelable) e.preventDefault();

            isPressing = true;
            AudioManager.unlock();
            onMove(e);
        };

        const onUp = (e) => {
            if (!isPressing) return;
            isPressing = false;
            if (e && e.cancelable) e.preventDefault();
            if (this.state !== 'playing') return;

            onMove(e);
            this._drop();
        };

        const onCancel = (e) => {
            isPressing = false;
            if (e && e.cancelable) e.preventDefault();
        };

        if (window.PointerEvent) {
            this.canvas.addEventListener('pointermove', onMove, { passive: false });
            this.canvas.addEventListener('pointerdown', onDown, { passive: false });
            this.canvas.addEventListener('pointerup', onUp, { passive: false });
            this.canvas.addEventListener('pointercancel', onCancel, { passive: false });
        } else {
            this.canvas.addEventListener('mousemove', onMove);
            this.canvas.addEventListener('mousedown', onDown);
            this.canvas.addEventListener('mouseup', onUp);
            this.canvas.addEventListener('touchmove', onMove, { passive: false });
            this.canvas.addEventListener('touchstart', onDown, { passive: false });
            this.canvas.addEventListener('touchend', onUp, { passive: false });
            this.canvas.addEventListener('touchcancel', onCancel, { passive: false });
        }
    },

    _drop() {
        if (!this.canDrop || this.state !== 'playing') return;

        this.canDrop = false;
        Physics.createCircle(this.dropX, 40, this.currentTier);

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
            const scaleX = canvasRect.width / Physics.CANVAS_WIDTH;
            const scaleY = canvasRect.height / Physics.CANVAS_HEIGHT;
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

    _checkGameOver(now) {
        if (this.state !== 'playing') return;

        if (Physics.isAboveDeadline(now)) {
            this.state = 'gameover';
            this.canDrop = false;

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

        const now = performance.now();
        if (this.perfLastTs > 0) {
            const frameMs = now - this.perfLastTs;
            this.perfFrameMsEma = this.perfFrameMsEma * 0.9 + frameMs * 0.1;
        }
        this.perfLastTs = now;
        this.frameCount++;
        this.perfFrameCount++;

        Physics.update();
        Effects.update();

        if (this.state === 'playing' && this.frameCount % this.gameOverCheckEvery === 0) {
            this._checkGameOver(now);
        }

        this._render();
        this._updatePerfOverlay(now);

        this.animFrame = requestAnimationFrame(() => this._gameLoop());
    },

    _render() {
        const ctx = this.ctx;
        const w = Physics.CANVAS_WIDTH;
        const h = Physics.CANVAS_HEIGHT;

        ctx.save();

        const shake = Effects.getShakeOffset();
        ctx.translate(shake.x, shake.y);

        ctx.clearRect(-10, -10, w + 20, h + 20);

        if (this.bgLayer) {
            ctx.drawImage(this.bgLayer, 0, 0);
        }

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

        const bodies = Physics.bodies;
        for (let i = 0; i < bodies.length; i++) {
            const body = bodies[i];
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
    },

    _detectLowPowerMode() {
        const isTouchDevice = navigator.maxTouchPoints > 0;
        const mobileUA = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
        return isTouchDevice || mobileUA;
    },

    _buildBackgroundLayer() {
        const c = document.createElement('canvas');
        c.width = Physics.CANVAS_WIDTH;
        c.height = Physics.CANVAS_HEIGHT;
        const g = c.getContext('2d');

        const bgGrad = g.createLinearGradient(0, 0, 0, Physics.CANVAS_HEIGHT);
        bgGrad.addColorStop(0, '#e8f4fd');
        bgGrad.addColorStop(1, '#d4ecf9');
        g.fillStyle = bgGrad;
        g.fillRect(0, 0, Physics.CANVAS_WIDTH, Physics.CANVAS_HEIGHT);

        g.strokeStyle = 'rgba(66, 165, 245, 0.35)';
        g.lineWidth = 2;
        g.setLineDash([6, 6]);
        g.beginPath();
        g.moveTo(0, Physics.DEADLINE_Y);
        g.lineTo(Physics.CANVAS_WIDTH, Physics.DEADLINE_Y);
        g.stroke();
        g.setLineDash([]);

        this.bgLayer = c;
    },

    _initPerfOverlay() {
        if (!this.perfEnabled) return;
        const node = document.createElement('div');
        node.style.position = 'fixed';
        node.style.top = '8px';
        node.style.left = '8px';
        node.style.zIndex = '9999';
        node.style.padding = '4px 6px';
        node.style.borderRadius = '6px';
        node.style.background = 'rgba(0,0,0,0.55)';
        node.style.color = '#fff';
        node.style.font = '12px monospace';
        node.style.pointerEvents = 'none';
        node.textContent = 'fps: -- ms: --';
        document.body.appendChild(node);
        this.perfNode = node;
    },

    _updatePerfOverlay(now) {
        if (!this.perfNode) return;
        if (!this.perfWindowStart) this.perfWindowStart = now;

        const elapsed = now - this.perfWindowStart;
        if (elapsed < 400) return;

        const fps = (this.perfFrameCount * 1000) / elapsed;
        this.perfNode.textContent = `fps:${fps.toFixed(1)} ms:${this.perfFrameMsEma.toFixed(1)} bodies:${Physics.bodies.length} fx:${Effects.particles.length}`;
        this.perfWindowStart = now;
        this.perfFrameCount = 0;
    },
};

window.addEventListener('DOMContentLoaded', () => Game.init());
