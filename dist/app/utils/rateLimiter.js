const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
export class TokenBucket {
    capacity;
    perMinute;
    tokens;
    last = Date.now();
    constructor(capacity, perMinute) {
        this.capacity = capacity;
        this.perMinute = perMinute;
        this.tokens = capacity;
    }
    refill() {
        const now = Date.now();
        this.tokens = Math.min(this.capacity, this.tokens + ((now - this.last) / 60000) * this.perMinute);
        this.last = now;
    }
    tryTake(reserve = 0) {
        this.refill();
        if (this.tokens - 1 < reserve)
            return false;
        this.tokens -= 1;
        return true;
    }
    async take(reserve = 0) {
        while (!this.tryTake(reserve))
            await sleep(1000);
    }
}
//# sourceMappingURL=rateLimiter.js.map