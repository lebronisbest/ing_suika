const Physics = {
    engine: null,
    world: null,
    bodies: [],
    _deadlineSince: new Map(),

    CANVAS_WIDTH: 390,
    CANVAS_HEIGHT: 600,
    WALL_THICKNESS: 20,
    DEADLINE_Y: 80,
    DEADLINE_GRACE_MS: 1500,
    DEADLINE_HOLD_MS: 900,

    init() {
        this.engine = Matter.Engine.create({
            gravity: { x: 0, y: 1.5 },
        });
        this.world = this.engine.world;
        this.bodies = [];
        this._deadlineSince.clear();
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
            dropTime: Date.now(),
        });

        Matter.Composite.add(this.world, body);
        this.bodies.push(body);
        return body;
    },

    removeBody(body) {
        Matter.Composite.remove(this.world, body);
        const idx = this.bodies.indexOf(body);
        if (idx > -1) this.bodies.splice(idx, 1);
        this._deadlineSince.delete(body.id);
    },

    update() {
        Matter.Engine.update(this.engine, 1000 / 60);
    },

    onCollision(callback) {
        Matter.Events.on(this.engine, 'collisionStart', (event) => {
            for (const pair of event.pairs) {
                callback(pair.bodyA, pair.bodyB);
            }
        });
    },

    isAboveDeadline() {
        const now = Date.now();
        const aliveIds = new Set();

        for (const body of this.bodies) {
            if (body.label !== 'item') continue;
            aliveIds.add(body.id);

            if (body.isMerging) {
                this._deadlineSince.delete(body.id);
                continue;
            }

            if (now - body.dropTime < this.DEADLINE_GRACE_MS) {
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

            const startedAt = this._deadlineSince.get(body.id) || now;
            this._deadlineSince.set(body.id, startedAt);

            if (now - startedAt >= this.DEADLINE_HOLD_MS) {
                return true;
            }
        }

        for (const id of Array.from(this._deadlineSince.keys())) {
            if (!aliveIds.has(id)) this._deadlineSince.delete(id);
        }

        return false;
    },

    clear() {
        if (this.world) {
            Matter.Composite.clear(this.world, false);
        }
        this.bodies = [];
        this._deadlineSince.clear();
        if (this.engine) {
            Matter.Engine.clear(this.engine);
            Matter.Events.off(this.engine);
        }
        this.engine = null;
        this.world = null;
    }
};
