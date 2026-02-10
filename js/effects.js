const Effects = {
    particles: [],
    comboTexts: [],
    MAX_PARTICLES: 260,
    maxParticles: 260,
    lowPower: false,
    maxComboTexts: 3,
    _shakeOffset: { x: 0, y: 0 },
    maxMergeColors: ['#7EC8E3', '#AED6F1', '#FFD700', '#fff', '#42A5F5'],
    shakeAmount: 0,
    shakeDuration: 0,

    configure(options = {}) {
        this.lowPower = !!options.lowPower;
        this.maxParticles = this.lowPower ? 180 : this.MAX_PARTICLES;
    },

    setQuality(level) {
        if (level === 'low') {
            this.maxParticles = this.lowPower ? 120 : 180;
            return;
        }
        this.maxParticles = this.lowPower ? 180 : this.MAX_PARTICLES;
    },

    createMergeEffect(x, y, color, tier) {
        const count = 8 + tier * 2;
        const slots = Math.max(0, this.maxParticles - this.particles.length);
        const spawnCount = Math.min(count, slots);
        for (let i = 0; i < spawnCount; i++) {
            const angle = (Math.PI * 2 / count) * i + Math.random() * 0.5;
            const speed = 2 + Math.random() * 4 + tier * 0.5;
            this.particles.push({
                x,
                y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                radius: 2 + Math.random() * 4,
                color,
                alpha: 1,
                decay: 0.02 + Math.random() * 0.02,
            });
        }

        // sparkle stars for bigger merges
        if (tier >= 4) {
            const starCount = 3 + tier;
            const starSlots = Math.max(0, this.maxParticles - this.particles.length);
            const starSpawn = Math.min(starCount, starSlots);
            for (let i = 0; i < starSpawn; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 1.5 + Math.random() * 2.5;
                this.particles.push({
                    x,
                    y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed - 1,
                    radius: 3 + Math.random() * 4,
                    color: '#fff',
                    alpha: 0.9,
                    decay: 0.018,
                    isStar: true,
                });
            }
        }
    },

    createMaxMergeEffect(x, y) {
        for (let ring = 0; ring < 3; ring++) {
            const count = 16 + ring * 8;
            const slots = Math.max(0, this.maxParticles - this.particles.length);
            if (slots <= 0) break;
            const spawnCount = Math.min(count, slots);
            for (let i = 0; i < spawnCount; i++) {
                const angle = (Math.PI * 2 / count) * i;
                const speed = 3 + ring * 2 + Math.random() * 3;
                this.particles.push({
                    x,
                    y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    radius: 3 + Math.random() * 5,
                    color: this.maxMergeColors[Math.floor(Math.random() * this.maxMergeColors.length)],
                    alpha: 1,
                    decay: 0.01 + Math.random() * 0.01,
                });
            }
        }
        this.shake(12, 30);
    },

    showCombo(x, y, combo, container) {
        if (this.comboTexts.length >= this.maxComboTexts) {
            const oldest = this.comboTexts.shift();
            if (oldest) {
                clearTimeout(oldest.id);
                if (oldest.el) oldest.el.remove();
            }
        }

        const el = document.createElement('div');
        el.className = 'combo-text';
        el.textContent = `${combo} COMBO!`;
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        container.appendChild(el);

        const timeoutId = setTimeout(() => {
            el.remove();
            this.comboTexts = this.comboTexts.filter((entry) => entry.id !== timeoutId);
        }, 1000);
        this.comboTexts.push({ el, id: timeoutId });
    },

    shake(amount, duration) {
        this.shakeAmount = amount;
        this.shakeDuration = duration;
    },

    update() {
        let write = 0;
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.1;
            p.alpha -= p.decay;
            p.radius *= 0.98;

            if (p.alpha > 0 && p.radius >= 0.5) {
                this.particles[write++] = p;
            }
        }
        this.particles.length = write;

        if (this.shakeDuration > 0) {
            this.shakeDuration--;
            if (this.shakeDuration <= 0) {
                this.shakeAmount = 0;
            }
        }
    },

    draw(ctx) {
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            ctx.globalAlpha = p.alpha;

            if (p.isStar && !this.lowPower) {
                // draw a little star/sparkle
                ctx.save();
                ctx.fillStyle = p.color;
                ctx.translate(p.x, p.y);
                this._drawStar(ctx, 0, 0, 4, p.radius, p.radius * 0.4);
                ctx.fill();
                ctx.restore();
            } else {
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;
    },

    _drawStar(ctx, cx, cy, spikes, outerR, innerR) {
        let rot = Math.PI / 2 * 3;
        const step = Math.PI / spikes;
        ctx.beginPath();
        ctx.moveTo(cx, cy - outerR);
        for (let i = 0; i < spikes; i++) {
            ctx.lineTo(cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR);
            rot += step;
            ctx.lineTo(cx + Math.cos(rot) * innerR, cy + Math.sin(rot) * innerR);
            rot += step;
        }
        ctx.lineTo(cx, cy - outerR);
        ctx.closePath();
    },

    getShakeOffset() {
        if (this.shakeAmount <= 0) {
            this._shakeOffset.x = 0;
            this._shakeOffset.y = 0;
            return this._shakeOffset;
        }
        const decay = this.shakeDuration / 30;
        this._shakeOffset.x = (Math.random() - 0.5) * this.shakeAmount * decay;
        this._shakeOffset.y = (Math.random() - 0.5) * this.shakeAmount * decay;
        return this._shakeOffset;
    },

    clear() {
        this.particles = [];
        for (let i = 0; i < this.comboTexts.length; i++) {
            clearTimeout(this.comboTexts[i].id);
            if (this.comboTexts[i].el) this.comboTexts[i].el.remove();
        }
        this.comboTexts = [];
        this.shakeAmount = 0;
        this.shakeDuration = 0;
    }
};
