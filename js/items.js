const ITEMS = [
    { tier: 0, radius: 17, score: 1, color: '#FF6B9D', accent: '#E8557F', highlight: '#FFB3CF', name: 'item_0' },
    { tier: 1, radius: 25, score: 3, color: '#FF8A80', accent: '#E57373', highlight: '#FFCDD2', name: 'item_1' },
    { tier: 2, radius: 32, score: 6, color: '#B39DDB', accent: '#9575CD', highlight: '#D1C4E9', name: 'item_2' },
    { tier: 3, radius: 38, score: 10, color: '#FFB74D', accent: '#FFA726', highlight: '#FFE0B2', name: 'item_3' },
    { tier: 4, radius: 45, score: 15, color: '#FF8A65', accent: '#FF7043', highlight: '#FFCCBC', name: 'item_4' },
    { tier: 5, radius: 52, score: 21, color: '#EF5350', accent: '#E53935', highlight: '#FFCDD2', name: 'item_5' },
    { tier: 6, radius: 60, score: 28, color: '#AED581', accent: '#8BC34A', highlight: '#DCEDC8', name: 'item_6' },
    { tier: 7, radius: 69, score: 36, color: '#F48FB1', accent: '#EC407A', highlight: '#F8BBD0', name: 'item_7' },
    { tier: 8, radius: 78, score: 45, color: '#FFD54F', accent: '#FFC107', highlight: '#FFF9C4', name: 'item_8' },
    { tier: 9, radius: 89, score: 55, color: '#4DB6AC', accent: '#26A69A', highlight: '#B2DFDB', name: 'item_9' },
    { tier: 10, radius: 100, score: 66, color: '#42A5F5', accent: '#1E88E5', highlight: '#BBDEFB', name: 'item_10' },
];

const MAX_DROP_TIER = 4;

const ItemManager = {
    images: {},
    loaded: false,
    spriteCache: Object.create(null),
    renderDpr: 1,
    lowPower: false,
    processedImages: Object.create(null), // 고품질 처리된 이미지 캐시

    configureRender(options = {}) {
        this.renderDpr = Math.max(1, Number(options.dpr) || 1);
        this.lowPower = !!options.lowPower;
        this.processedImages = Object.create(null);
        this.spriteCache = Object.create(null);
    },

    preload() {
        return new Promise((resolve) => {
            let loadedCount = 0;
            const totalToLoad = ITEMS.length;
            let anyLoaded = false;

            ITEMS.forEach((item) => {
                const img = new Image();
                img.onload = () => {
                    this.images[item.tier] = img;
                    anyLoaded = true;
                    loadedCount++;
                    if (loadedCount === totalToLoad) {
                        this.loaded = anyLoaded;
                        resolve();
                    }
                };
                img.onerror = () => {
                    // PNG 실패 시 JPG 시도
                    const imgJpg = new Image();
                    imgJpg.onload = () => {
                        this.images[item.tier] = imgJpg;
                        anyLoaded = true;
                        loadedCount++;
                        if (loadedCount === totalToLoad) {
                            this.loaded = anyLoaded;
                            resolve();
                        }
                    };
                    imgJpg.onerror = () => {
                        loadedCount++;
                        if (loadedCount === totalToLoad) {
                            this.loaded = anyLoaded;
                            resolve();
                        }
                    };
                    imgJpg.src = `assets/images/${item.name}.jpg`;
                };
                img.src = `assets/images/${item.name}.png`;
            });
        });
    },

    getItem(tier) {
        return ITEMS[tier];
    },

    getRandomDropTier() {
        const weights = [35, 28, 20, 12, 5];
        const total = weights.reduce((a, b) => a + b, 0);
        let r = Math.random() * total;
        for (let i = 0; i < weights.length; i++) {
            r -= weights[i];
            if (r <= 0) return i;
        }
        return 0;
    },

    // 고품질 이미지 전처리 (다운샘플링)
    _getProcessedImage(tier, targetSize) {
        const roundedSize = Math.max(1, Math.round(targetSize));
        const cacheKey = `${tier}_${roundedSize}_${this.renderDpr}_${this.lowPower ? 1 : 0}`;

        // 캐시된 이미지가 있으면 반환
        if (this.processedImages[cacheKey]) {
            return this.processedImages[cacheKey];
        }

        const img = this.images[tier];
        if (!img) return null;

        // 원본 이미지에서 정사각형 영역 추출
        const imgSize = Math.min(img.width, img.height);
        const sx = (img.width - imgSize) / 2;
        const sy = (img.height - imgSize) / 2;

        // 고해상도 오프스크린 캔버스 생성
        const dpr = Math.max(1, this.renderDpr);
        const canvas = document.createElement('canvas');
        const size = Math.max(1, Math.round(targetSize * dpr * 2));
        canvas.width = size;
        canvas.height = size;

        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // 고품질로 이미지 그리기
        ctx.drawImage(img, sx, sy, imgSize, imgSize, 0, 0, size, size);

        // 캐시에 저장
        this.processedImages[cacheKey] = canvas;
        return canvas;
    },

    _getSprite(tier, radius) {
        if (!this.images[tier]) return null;

        const roundedR = Math.max(1, Math.round(radius * 2) / 2);
        const cacheKey = `${tier}_${roundedR}_${this.renderDpr}_${this.lowPower ? 1 : 0}`;
        if (this.spriteCache[cacheKey]) {
            return this.spriteCache[cacheKey];
        }

        const pad = Math.ceil(roundedR * 0.95);
        const logicalSize = Math.ceil(roundedR * 2 + pad * 2);
        const scale = Math.max(1, this.renderDpr);

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.ceil(logicalSize * scale));
        canvas.height = Math.max(1, Math.ceil(logicalSize * scale));

        const sctx = canvas.getContext('2d');
        sctx.scale(scale, scale);
        sctx.imageSmoothingEnabled = true;
        sctx.imageSmoothingQuality = 'high';

        const center = pad + roundedR;
        this._draw3DSphere(sctx, ITEMS[tier], tier, center, center, roundedR);

        const sprite = { canvas, center, logicalSize };
        this.spriteCache[cacheKey] = sprite;
        return sprite;
    },

    _drawCachedSprite(ctx, tier, x, y, radius) {
        const sprite = this._getSprite(tier, radius);
        if (!sprite) return false;

        ctx.drawImage(
            sprite.canvas,
            x - sprite.center,
            y - sprite.center,
            sprite.logicalSize,
            sprite.logicalSize
        );
        return true;
    },

    drawItem(ctx, tier, x, y, radius, alpha) {
        const item = ITEMS[tier];
        if (!item) return;

        const drawAlpha = alpha === undefined ? 1 : alpha;
        const needsAlphaScope = drawAlpha !== 1;
        if (needsAlphaScope) {
            ctx.save();
            ctx.globalAlpha = drawAlpha;
        }

        if (this.images[tier]) {
            if (!this._drawCachedSprite(ctx, tier, x, y, radius)) {
                this._draw3DSphere(ctx, item, tier, x, y, radius);
            }
        } else {
            this._drawFallback(ctx, item, tier, x, y, radius);
        }

        if (needsAlphaScope) {
            ctx.restore();
        }
    },

    // ══════════════════════════════════════
    //  3D 구체 효과 (이미지 + 입체 쉐이딩)
    // ══════════════════════════════════════
    _draw3DSphere(ctx, item, tier, x, y, r) {
        const img = this.images[tier];
        const borderW = Math.max(2.5, r * 0.08);
        const innerR = r - borderW;

        // ▸ 바닥 그림자
        ctx.save();
        const shadowGrad = ctx.createRadialGradient(x, y + r * 0.88, 0, x, y + r * 0.88, r * 0.65);
        shadowGrad.addColorStop(0, 'rgba(0,0,0,0.18)');
        shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.beginPath();
        ctx.ellipse(x, y + r * 0.88, r * 0.6, r * 0.1, 0, 0, Math.PI * 2);
        ctx.fillStyle = shadowGrad;
        ctx.fill();
        ctx.restore();

        // ▸ 컬러 테두리 (3D 그라데이션 프레임)
        const borderGrad = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
        borderGrad.addColorStop(0, item.highlight);
        borderGrad.addColorStop(0.35, item.color);
        borderGrad.addColorStop(0.65, item.color);
        borderGrad.addColorStop(1, item.accent);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = borderGrad;
        ctx.fill();

        // ▸ 이미지 원형 클리핑
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, innerR, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();

        // 고품질 전처리된 이미지 사용
        const processedImg = this._getProcessedImage(tier, innerR * 2);
        if (processedImg) {
            ctx.drawImage(processedImg, x - innerR, y - innerR, innerR * 2, innerR * 2);
        } else {
            // 폴백: 원본 이미지 사용
            const imgSize = Math.min(img.width, img.height);
            const sx = (img.width - imgSize) / 2;
            const sy = (img.height - imgSize) / 2;
            ctx.drawImage(img, sx, sy, imgSize, imgSize,
                x - innerR, y - innerR, innerR * 2, innerR * 2);
        }


        // ▸ 구면 음영 — Ambient Occlusion (가장자리 어둡게)
        const aoGrad = ctx.createRadialGradient(x, y, innerR * 0.4, x, y, innerR);
        aoGrad.addColorStop(0, 'rgba(0,0,0,0)');
        aoGrad.addColorStop(0.6, 'rgba(0,0,0,0)');
        aoGrad.addColorStop(1, 'rgba(0,0,0,0.4)');
        ctx.fillStyle = aoGrad;
        ctx.fillRect(x - innerR, y - innerR, innerR * 2, innerR * 2);

        // ▸ 방향광 — 좌상단 밝음 / 우하단 어두움
        const lightGrad = ctx.createRadialGradient(
            x - innerR * 0.4, y - innerR * 0.4, innerR * 0.05,
            x + innerR * 0.15, y + innerR * 0.15, innerR * 1.15
        );
        lightGrad.addColorStop(0, 'rgba(255,255,255,0.22)');
        lightGrad.addColorStop(0.3, 'rgba(255,255,255,0.04)');
        lightGrad.addColorStop(0.6, 'rgba(0,0,0,0)');
        lightGrad.addColorStop(1, 'rgba(0,0,0,0.2)');
        ctx.fillStyle = lightGrad;
        ctx.fillRect(x - innerR, y - innerR, innerR * 2, innerR * 2);

        ctx.restore();

        // ▸ 스페큘러 하이라이트 (큰 타원)
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.clip();

        const specGrad = ctx.createRadialGradient(
            x - r * 0.28, y - r * 0.32, 0,
            x - r * 0.28, y - r * 0.32, r * 0.42
        );
        specGrad.addColorStop(0, 'rgba(255,255,255,0.55)');
        specGrad.addColorStop(0.4, 'rgba(255,255,255,0.12)');
        specGrad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.beginPath();
        ctx.ellipse(x - r * 0.25, y - r * 0.3, r * 0.4, r * 0.22, -0.35, 0, Math.PI * 2);
        ctx.fillStyle = specGrad;
        ctx.fill();

        // 작은 반짝임 점
        ctx.beginPath();
        ctx.arc(x - r * 0.15, y - r * 0.44, r * 0.05, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fill();

        ctx.restore();

        // ▸ 림 라이트 (하단 가장자리 반사)
        ctx.beginPath();
        ctx.arc(x, y, r - 1, Math.PI * 0.15, Math.PI * 0.85);
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = Math.max(1.5, r * 0.035);
        ctx.stroke();

        // ▸ 테두리 위쪽 하이라이트 아크
        ctx.beginPath();
        ctx.arc(x, y, r - borderW * 0.5, Math.PI * 1.2, Math.PI * 1.8);
        ctx.strokeStyle = item.highlight + 'AA';
        ctx.lineWidth = Math.max(1, borderW * 0.5);
        ctx.stroke();

        // ▸ 티어 뱃지
        if (r >= 20) {
            const badgeR = Math.max(8, r * 0.18);
            const bx = x + r * 0.62;
            const by = y - r * 0.62;

            // 뱃지 그림자
            ctx.beginPath();
            ctx.arc(bx + 1, by + 1, badgeR, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            ctx.fill();

            // 뱃지 본체
            const bGrad = ctx.createRadialGradient(
                bx - badgeR * 0.3, by - badgeR * 0.3, 0, bx, by, badgeR
            );
            bGrad.addColorStop(0, item.highlight);
            bGrad.addColorStop(1, item.color);
            ctx.beginPath();
            ctx.arc(bx, by, badgeR, 0, Math.PI * 2);
            ctx.fillStyle = bGrad;
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.9)';
            ctx.lineWidth = Math.max(1, badgeR * 0.13);
            ctx.stroke();

            // 뱃지 숫자
            ctx.fillStyle = '#fff';
            ctx.font = `bold ${Math.max(9, badgeR * 1.15)}px Nunito, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = 'rgba(0,0,0,0.3)';
            ctx.shadowBlur = 2;
            ctx.fillText(tier + 1, bx, by + 0.5);
            ctx.shadowBlur = 0;
        }
    },

    // ══════════════════════════════════════
    //  폴백 (이미지 없을 때 3D 컬러볼)
    // ══════════════════════════════════════
    _drawFallback(ctx, item, tier, x, y, r) {
        // 본체 그라데이션
        const grad = ctx.createRadialGradient(
            x - r * 0.3, y - r * 0.3, r * 0.05,
            x + r * 0.1, y + r * 0.1, r * 1.05
        );
        grad.addColorStop(0, item.highlight);
        grad.addColorStop(0.45, item.color);
        grad.addColorStop(1, item.accent);

        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        // 가장자리 음영
        const aoGrad = ctx.createRadialGradient(x, y, r * 0.4, x, y, r);
        aoGrad.addColorStop(0, 'rgba(0,0,0,0)');
        aoGrad.addColorStop(0.7, 'rgba(0,0,0,0)');
        aoGrad.addColorStop(1, 'rgba(0,0,0,0.22)');
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = aoGrad;
        ctx.fill();

        // 테두리
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.strokeStyle = item.accent;
        ctx.lineWidth = Math.max(1.5, r * 0.035);
        ctx.stroke();

        // 스페큘러
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.clip();

        ctx.beginPath();
        ctx.ellipse(x - r * 0.25, y - r * 0.3, r * 0.35, r * 0.18, -0.4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x - r * 0.12, y - r * 0.45, r * 0.05, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fill();
        ctx.restore();

        // 티어 숫자
        if (r >= 14) {
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.font = `bold ${Math.max(10, r * 0.5)}px Nunito, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = 'rgba(0,0,0,0.25)';
            ctx.shadowBlur = 3;
            ctx.fillText(tier + 1, x, y + 1);
            ctx.shadowBlur = 0;
        }
    },
};
