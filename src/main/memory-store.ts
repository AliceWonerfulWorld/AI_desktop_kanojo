import {
  mkdir,
  readFile,
  rename,
  writeFile,
  readdir,
  unlink,
  open,
} from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  defaultMemory,
  validateMemory,
  type MemoryState,
} from '../shared/memory-state.ts'

/** All paths are fixed beneath Main's userData; renderer input never supplies a path. */
export class MemoryStore {
  private readonly directory: string
  private readonly report: (error: unknown) => void
  private queue: Promise<void> = Promise.resolve()
  private lastGood: string | undefined
  constructor(
    directory: string,
    report: (error: unknown) => void = console.error,
  ) {
    this.directory = directory
    this.report = report
  }

  private async read(name: string): Promise<MemoryState | undefined> {
    try {
      const text = await readFile(join(this.directory, name), 'utf8')
      if (text.length > 65536) throw new Error('Save exceeds size limit')
      return validateMemory(JSON.parse(text))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      this.report(error)
      // Preserve corrupt or future-version data before any new save can replace it.
      await rename(
        join(this.directory, name),
        join(this.directory, `${name}.invalid-${randomUUID()}`),
      )
      return undefined
    }
  }
  async load(): Promise<MemoryState> {
    await mkdir(this.directory, { recursive: true })
    const state =
      (await this.read('memory.json')) ??
      (await this.read('memory.json.bak')) ??
      defaultMemory()
    this.lastGood = JSON.stringify(state)
    return state
  }
  private async atomic(name: string, text: string): Promise<void> {
    const temporary = join(this.directory, `${name}.tmp`)
    await writeFile(temporary, text, { mode: 0o600 })
    const file = await open(temporary, 'r+')
    try {
      await file.sync()
    } finally {
      await file.close()
    }
    await rename(temporary, join(this.directory, name))
  }
  save(state: MemoryState): Promise<void> {
    const text = JSON.stringify(validateMemory(state))
    const task = this.queue.then(async () => {
      if (this.lastGood) await this.atomic('memory.json.bak', this.lastGood)
      await this.atomic('memory.json', text)
      this.lastGood = text
    })
    this.queue = task.catch(this.report)
    return task
  }
  async reset(): Promise<void> {
    await this.queue
    // Only application-owned memory files and the legacy greeting marker are removed.
    for (const name of await readdir(this.directory)) {
      if (
        [
          'memory.json',
          'memory.json.bak',
          'memory.json.tmp',
          'memory.json.bak.tmp',
          'welcome-seen.marker',
        ].includes(name) ||
        /^memory\.json(?:\.bak)?\.invalid-[\da-f-]+$/.test(name)
      )
        await unlink(join(this.directory, name))
    }
    this.lastGood = undefined
  }
}
