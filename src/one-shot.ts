export interface OneShotSnapshot {
  targetId: string
  armGeneration: number
}

export class OneShotController {
  private armedTargetId: string | null = null
  private generation = 0
  private readonly pending = new Map<string, OneShotSnapshot>()

  arm(targetId: string): void {
    if (!targetId) throw new Error('one-shot target id is required')
    this.generation += 1
    this.armedTargetId = targetId
  }

  disarm(): void {
    this.generation += 1
    this.armedTargetId = null
  }

  current(): string | null {
    return this.armedTargetId
  }

  snapshot(turnId: string): OneShotSnapshot | null {
    const existing = this.pending.get(turnId)
    if (existing) return existing
    if (!this.armedTargetId) return null
    const snapshot = { targetId: this.armedTargetId, armGeneration: this.generation }
    this.pending.set(turnId, snapshot)
    return snapshot
  }

  accepted(turnId: string): boolean {
    const snapshot = this.pending.get(turnId)
    if (!snapshot) return false
    this.pending.delete(turnId)
    if (snapshot.armGeneration === this.generation && this.armedTargetId === snapshot.targetId) {
      this.armedTargetId = null
      return true
    }
    return false
  }

  rejected(turnId: string): void {
    this.pending.delete(turnId)
  }
}
