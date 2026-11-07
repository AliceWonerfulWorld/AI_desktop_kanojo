import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { LaunchInfo } from '../shared/desktop-api'

/** A presence marker only: no timestamps, interaction counters or offline-duration accounting. */
export async function loadLaunchInfo(
  directory: string,
  report: (error: unknown) => void = console.error,
): Promise<LaunchInfo> {
  try {
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'welcome-seen.marker'), '', {
      flag: 'wx',
      mode: 0o600,
    })
    return { firstLaunch: true }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') report(error)
    return { firstLaunch: false }
  }
}
