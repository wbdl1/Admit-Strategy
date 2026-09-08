// Each immutable operation keeps the same id across ambiguous network retries.
// Only a confirmed persistence response may transition to "saved".
export class MutationQueue {
  constructor({ send, optimistic, confirm, onState = () => {}, wait = ms => new Promise(r => setTimeout(r, ms)), maxAttempts = 3 }) {
    Object.assign(this, { send, optimistic, confirm, onState, wait, maxAttempts });
    this.jobs = new Map();
    this.tails = new Map();
  }
  enqueue(values, { id = crypto.randomUUID(), key = values.recordId || id } = {}) {
    if (this.jobs.has(id)) return this.jobs.get(id);
    const job = { id, key, values: structuredClone(values), state: "queued", attempts: 0 };
    // A corrected submission can replace a proven rejection. An uncertain write
    // remains a blocker: it may already exist on the server.
    for (const earlier of this.jobs.values()) {
      if (earlier.key === key && earlier.state === "failed" && earlier.error?.rejected === true) earlier.state = "superseded";
    }
    this.jobs.set(id, job);
    this.optimistic(job);
    this.onState(job);
    this.schedule(job);
    return job;
  }
  schedule(job) {
    const previous = this.tails.get(job.key) || Promise.resolve();
    const promise = previous.catch(() => {}).then(() => this.run(job));
    this.tails.set(job.key, promise);
    job.done = promise.finally(() => {
      if (this.tails.get(job.key) === promise) this.tails.delete(job.key);
    });
  }
  async run(job) {
    // A failed earlier edit must be resolved before a later edit of the same record.
    const blocker = [...this.jobs.values()].find(other => other !== job && other.key === job.key &&
      ["failed", "blocked"].includes(other.state) && other.error?.rejected !== true && [...this.jobs.keys()].indexOf(other.id) < [...this.jobs.keys()].indexOf(job.id));
    if (blocker) { job.state = "blocked"; this.onState(job); return; }
    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      job.attempts++;
      job.state = attempt ? "retrying" : "saving";
      this.onState(job);
      try {
        const response = await this.send(structuredClone(job.values), job.id);
        if (!response || response.ok !== true) throw Object.assign(new Error(response?.error || "Save was not confirmed."), { retryable: response?.retryable === true, rejected: response?.rejected === true });
        await this.confirm(job, response);
        job.state = "saved";
        this.onState(job);
        return;
      } catch (error) {
        job.error = error;
        if (error.retryable === false || attempt === this.maxAttempts - 1) {
          job.state = "failed";
          this.onState(job);
          return;
        }
        job.state = "retrying";
        this.onState(job);
        await this.wait(500 * 2 ** attempt);
      }
    }
  }
  retry(id) {
    const job = this.jobs.get(id);
    if (!job || job.state !== "failed" || job.error?.retryable === false) return false;
    job.state = "queued";
    this.schedule(job);
    for (const later of this.jobs.values()) {
      if (later.key === job.key && later.state === "blocked") { later.state = "queued"; this.schedule(later); }
    }
    return true;
  }
  laterPending(job) {
    const jobs = [...this.jobs.values()];
    return jobs.slice(jobs.indexOf(job) + 1).filter(other => other.key === job.key && !["saved", "superseded"].includes(other.state) && other.error?.rejected !== true);
  }
  get unsaved() { return [...this.jobs.values()].filter(job => !["saved", "superseded"].includes(job.state)); }
}
