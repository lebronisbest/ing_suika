const Physics = {
    engine: null,
    world: null,
    bodies: [],
    bodyIndex: new Map(),
    _deadlineSince: new Map(),
    _aliveIdsScratch: new Set(),
    _staleDeadlineIds: [],
    lowPower: false,

    CANVAS_WIDTH: 390,
    CANVAS_HEIGHT: 600,
    WALL_THICKNESS: 20,
    DEADLINE_Y: 80,
    DEADLINE_GRACE_MS: 1500,
    DEADLINE_HOLD_MS: 900,

    configure(options = {}) {
        this.lowPower = !!options.lowPower;
    },

    init() {
        this.engine = Matter.Engine.create({
            gravity: { x: 0, y: 1.5 },
            positionIterations: this.lowPower ? 4 : 6,
            velocityIterations: this.lowPower ? 3 : 4,
            constraintIterations: this.lowPower ? 1 : 2,
            enableSleeping: this.lowPower,
        });
        this.world = this.engine.world;
        this.bodies = [];
        this.bodyIndex.clear();
        this._deadlineSince.clear();
        this._aliveIdsScratch.clear();
        this._staleDeadlineIds.length = 0;
        this._createWalls();
    },

    _createWalls() {
        const w = this.CANVAS_WIDTH;
        const h = this.CANVAS_HEIGHT;
        const t = this.WALL_THICKNESS;

        const floor = Matter.Bodies.rectangle(w / 2, h + t / 2, w, t, {
            isStatic: true,
            friction: 0.5,
            restitution: 0.2,
            label: 'wall',
        });
        const leftWall = Matter.Bodies.rectangle(-t / 2, h / 2, t, h * 2, {
            isStatic: true,
            friction: 0.3,
            label: 'wall',
        });
        const rightWall = Matter.Bodies.rectangle(w + t / 2, h / 2, t, h * 2, {
            isStatic: true,
            friction: 0.3,
            label: 'wall',
        });

        Matter.Composite.add(this.world, [floor, leftWall, rightWall]);
    },

    createCircle(x, y, tier) {
        const item = ITEMS[tier];
        const body = Matter.Bodies.circle(x, y, item.radius, {
            restitution: 0.2,
            friction: 0.5,
            density: 0.001 + tier * 0.0003,
            label: 'item',
            tier: tier,
            isMerging: false,
            dropTime: performance.now(),
        });

        Matter.Composite.add(this.world, body);
        const idx = this.bodies.length;
        this.bodies.push(body);
        this.bodyIndex.set(body.id, idx);
        return body;
    },

    removeBody(body) {
        Matter.Composite.remove(this.world, body);
        const idx = this.bodyIndex.get(body.id);
        if (idx !== undefined) {
            const lastIdx = this.bodies.length - 1;
            const lastBody = this.bodies[lastIdx];

            if (idx !== lastIdx) {
                this.bodies[idx] = lastBody;
                this.bodyIndex.set(lastBody.id, idx);
            }

            this.bodies.pop();
            this.bodyIndex.delete(body.id);
        }
        this._deadlineSince.delete(body.id);
    },

    update() {
        Matter.Engine.update(this.engine, 1000 / 60);
    },

    onCollision(callback) {
        Matter.Events.on(this.engine, 'collisionStart', (event) => {
            for (const pair of event.pairs) {
                const bodyA = pair.bodyA;
                const bodyB = pair.bodyB;
                if (bodyA.label !== 'item' || bodyB.label !== 'item') continue;
                callback(bodyA, bodyB);
            }
        });
    },

    isAboveDeadline(now) {
        const current = Number.isFinite(now) ? now : performance.now();
        const aliveIds = this._aliveIdsScratch;
        const staleIds = this._staleDeadlineIds;
        aliveIds.clear();
        staleIds.length = 0;

        for (const body of this.bodies) {
            aliveIds.add(body.id);

            if (body.isMerging) {
                this._deadlineSince.delete(body.id);
                continue;
            }

            if (current - body.dropTime < this.DEADLINE_GRACE_MS) {
                this._deadlineSince.delete(body.id);
                continue;
            }

            const item = ITEMS[body.tier];
            if (!item) continue;

            const topY = body.position.y - item.radius;
            if (topY >= this.DEADLINE_Y) {
                this._deadlineSince.delete(body.id);
                continue;
            }

            // 위로 크게 튀는 순간만 예외 처리하고, 경계선 위 정체는 시간 누적으로 게임오버 처리
            const speed = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2);
            const risingFast = body.velocity.y < -2 && speed > 4;
            if (risingFast) {
                this._deadlineSince.delete(body.id);
                continue;
            }

            const startedAt = this._deadlineSince.get(body.id) || current;
            this._deadlineSince.set(body.id, startedAt);

            if (current - startedAt >= this.DEADLINE_HOLD_MS) {
                return true;
            }
        }

        for (const id of this._deadlineSince.keys()) {
            if (!aliveIds.has(id)) staleIds.push(id);
        }
        for (let i = 0; i < staleIds.length; i++) {
            this._deadlineSince.delete(staleIds[i]);
        }

        return false;
    },

    clear() {
        if (this.world) {
            Matter.Composite.clear(this.world, false);
        }
        this.bodies = [];
        this.bodyIndex.clear();
        this._deadlineSince.clear();
        this._aliveIdsScratch.clear();
        this._staleDeadlineIds.length = 0;
        if (this.engine) {
            Matter.Engine.clear(this.engine);
            Matter.Events.off(this.engine);
        }
        this.engine = null;
        this.world = null;
    },

    freeze() {
        // 모든 물체를 즉시 정지
        for (const body of this.bodies) {
            if (body.label === 'item') {
                Matter.Body.setVelocity(body, { x: 0, y: 0 });
                Matter.Body.setAngularVelocity(body, 0);
                Matter.Body.setStatic(body, true);
            }
        }
    }
};
