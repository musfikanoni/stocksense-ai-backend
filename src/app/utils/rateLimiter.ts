
const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

export class TokenBucket {
  private tokens: number;
  private last = Date.now();
  constructor(private capacity: number, private perMinute: number) { this.tokens = capacity; }

  private refill() {
    const now = Date.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.last) / 60000) * this.perMinute);
    this.last = now;
  }

  tryTake(reserve = 0): boolean {
    this.refill();
    if (this.tokens - 1 < reserve) return false;
    this.tokens -= 1;
    return true;
  }
  
  async take(reserve = 0): Promise<void> {
    while (!this.tryTake(reserve)) await sleep(1000);
  }
}
