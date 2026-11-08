export interface PrivateModeState {
  readonly revision: number
  readonly session: number
  readonly phase: 'closed' | 'confirmation' | 'active'
  readonly paused: boolean
}
export type PrivateModeCommand =
  | { kind: 'confirm'; session: number; accepted: true }
  | { kind: 'resume'; session: number }
  | { kind: 'return' | 'hide'; session: number }
export interface PrivateModeAPI {
  getState(): Promise<PrivateModeState>
  command(command: PrivateModeCommand): Promise<void>
  onChange(listener: (state: PrivateModeState) => void): () => void
}

/** Ephemeral only: neither permission nor display state belongs in a save. */
export class PrivateModeSession {
  private state: PrivateModeState = {
    revision: 0,
    session: 0,
    phase: 'closed',
    paused: false,
  }
  snapshot(): PrivateModeState {
    return { ...this.state }
  }
  request(): void {
    if (this.state.phase !== 'closed') return
    this.state = {
      revision: this.state.revision + 1,
      session: this.state.session + 1,
      phase: 'confirmation',
      paused: false,
    }
  }
  confirm(accepted: unknown, session: number): boolean {
    if (
      accepted !== true ||
      session !== this.state.session ||
      this.state.phase !== 'confirmation'
    )
      return false
    this.state = {
      ...this.state,
      revision: this.state.revision + 1,
      phase: 'active',
    }
    return true
  }
  blur(hideOnBlur: boolean): void {
    if (this.state.phase === 'confirmation' || hideOnBlur) this.close()
    else if (this.state.phase === 'active')
      this.state = {
        ...this.state,
        revision: this.state.revision + 1,
        paused: true,
      }
  }
  resume(session: number): void {
    if (session === this.state.session && this.state.phase === 'active')
      this.state = {
        ...this.state,
        revision: this.state.revision + 1,
        paused: false,
      }
  }
  close(): void {
    this.state = {
      ...this.state,
      revision: this.state.revision + 1,
      phase: 'closed',
      paused: false,
    }
  }
}

export function isPrivateModeCommand(
  value: unknown,
): value is PrivateModeCommand {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  if (!Number.isSafeInteger(v.session) || (v.session as number) < 1)
    return false
  if (!['confirm', 'resume', 'return', 'hide'].includes(v.kind as string))
    return false
  return (
    Object.keys(v).every((key) =>
      [
        'kind',
        'session',
        ...(v.kind === 'confirm' ? ['accepted'] : []),
      ].includes(key),
    ) &&
    (v.kind !== 'confirm' || v.accepted === true)
  )
}
