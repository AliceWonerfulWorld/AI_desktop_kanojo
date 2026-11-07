export class FakeClock {
  time = 0
  pending = new Map()
  maximum = 0
  now = () => this.time
  schedule = (callback, delayMs) => {
    const token = {}
    this.pending.set(token, { callback, deadline: this.time + delayMs })
    this.maximum = Math.max(this.maximum, this.pending.size)
    return () => this.pending.delete(token)
  }
  advance(ms) {
    const target = this.time + ms
    while (this.pending.size) {
      const [token, next] = [...this.pending].sort(
        (a, b) => a[1].deadline - b[1].deadline,
      )[0]
      if (next.deadline > target) break
      this.time = next.deadline
      this.pending.delete(token)
      next.callback()
    }
    this.time = target
  }
  fireLate(ms) {
    this.time += ms
    const scheduled = [...this.pending]
    this.pending.clear()
    for (const [, task] of scheduled) task.callback()
  }
}
