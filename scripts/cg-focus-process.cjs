const assert = require('node:assert/strict')
const { readFileSync, writeFileSync } = require('node:fs')
const { join, dirname } = require('node:path')
const Module = require('node:module')
const { app, BrowserWindow, Tray, powerMonitor, ipcMain } = require('electron')
const [directory, phase] = process.argv.slice(2)
app.setPath('userData', directory)
let menu, desktop
const handlers = new Map()
const handle = ipcMain.handle.bind(ipcMain)
ipcMain.handle = (name, listener) => {
  handlers.set(name, listener)
  return handle(name, listener)
}
const setMenu = Tray.prototype.setContextMenu
Tray.prototype.setContextMenu = function (value) {
  menu = value
  return setMenu.call(this, value)
}
const timeout = setTimeout(() => {
  console.error('CG test timeout')
  app.exit(1)
}, 90000)
app.on('quit', () => clearTimeout(timeout))
async function waitFor(test, label) {
  for (let i = 0; i < 700; i++) {
    try {
      if (await test()) return
    } catch {
      /* window/load transitions */
    }
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw Error('CG test did not settle: ' + label)
}
app.on('browser-window-created', (_event, window) => {
  if (desktop) return
  desktop = window
  desktop.webContents.once('did-finish-load', async () => {
    try {
      await waitFor(
        () =>
          desktop.webContents.executeJavaScript(
            "document.body.dataset.lifecycleReady==='true'",
          ),
        'daily ready',
      )
      assert.equal(
        BrowserWindow.getAllWindows().length,
        1,
        'restart never opens story or fullscreen',
      )
      const settings = async () => {
        app.focus({ steal: true })
        menu.items.find((i) => i.label === '設定…').click()
        const target = BrowserWindow.getAllWindows().find(
          (w) => w.getTitle() === '小春の設定',
        )
        target.show()
        target.focus()
        await waitFor(() => target.isFocused(), 'settings focus')
        await waitFor(
          () =>
            target.webContents.executeJavaScript(
              "!document.querySelector('#controls').disabled",
            ),
          'settings ready',
        )
        return target
      }
      let events
      const isFullscreen = () =>
        events.isFullScreen() || events.isSimpleFullScreen()
      const evaluate = (code) => events.webContents.executeJavaScript(code)
      const view = () => evaluate('window.events.getView()')
      const click = (id) => evaluate(`document.querySelector('#${id}').click()`)
      const key = async (name) => {
        app.focus({ steal: true })
        events.focus()
        await waitFor(() => events.isFocused(), 'keyboard target focus')
        events.webContents.sendInputEvent({ type: 'keyDown', keyCode: name })
        events.webContents.sendInputEvent({ type: 'keyUp', keyCode: name })
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      const open = async (audience = 'general', hide = true) => {
        const prefs = await settings()
        if (audience === 'private') {
          await prefs.webContents.executeJavaScript(
            `window.settings.update({privateHideOnBlur:${hide}})`,
          )
          await prefs.webContents.executeJavaScript(
            "document.querySelector('#private-open').click()",
          )
        } else
          await prefs.webContents.executeJavaScript(
            "document.querySelector('#event-open').click()",
          )
        await waitFor(() => {
          events = BrowserWindow.getAllWindows().find(
            (w) => w !== desktop && w !== prefs,
          )
          return events?.isVisible()
        }, 'story window')
        events.focus()
        await waitFor(() => events.isFocused(), 'story focus')
        if (audience === 'private') {
          await waitFor(
            () => evaluate("document.body.dataset.phase==='confirmation'"),
            'confirmation',
          )
          assert.equal(
            await evaluate(
              "window.events.windowControl('fullscreen').then(()=>false,()=>true)",
            ),
            true,
          )
          await evaluate(
            "document.querySelector('#adult').checked=true;document.querySelector('#adult').dispatchEvent(new Event('change'));document.querySelector('#enter').click()",
          )
        }
        await waitFor(async () => (await view()).phase === 'list', 'list')
        assert.equal(isFullscreen(), false)
        assert.equal(events.isMaximized(), false)
      }
      const command = async (kind, extra = {}) => {
        const v = await view()
        await evaluate(
          `window.events.command(${JSON.stringify({ kind, revision: v.revision, ...extra })})`,
        )
      }
      const start = async (audience = 'general', resume = false) => {
        await command('start', {
          eventId: audience === 'general' ? 'cg-test' : 'cg-private-test',
          resume,
        })
        await waitFor(
          () =>
            evaluate("document.querySelector('[data-phase=playing]')!==null"),
          'playing',
        )
      }
      const node = (id) =>
        waitFor(
          async () =>
            (await view()).frame?.nodeId === id &&
            (await evaluate(
              "document.querySelector('#event-cg').complete && document.querySelector('[data-visual-ready=true]')!==null",
            )),
          id,
        )
      const hidden = (value) =>
        waitFor(
          () =>
            evaluate(
              `document.querySelector('[data-ui-hidden="${value}"]')!==null`,
            ),
          'UI ' + value,
        )
      const inspect = async () => {
        await click('event-inspect')
        await hidden(true)
      }
      const capture = async (name) => {
        await waitFor(
          () =>
            evaluate(
              "document.querySelector('[data-visual-ready=true]')!==null",
            ),
          'capture visual ready',
        )
        await evaluate(
          'document.fonts.ready.then(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})))).then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))',
        )
        writeFileSync(
          join(require('node:os').tmpdir(), name),
          (await events.webContents.capturePage()).toPNG(),
        )
      }
      const fullscreen = async () => {
        await click('event-fullscreen')
        await waitFor(
          () => events.isDestroyed() || isFullscreen(),
          'fullscreen',
        )
        assert.equal(
          events.isDestroyed(),
          false,
          'fullscreen must not bypass or trigger private exit without blur',
        )
        await waitFor(
          async () =>
            !(await evaluate("window.events.windowControl('get')"))
              .transitioning,
          'fullscreen settled',
        )
      }
      if (phase === 'resume') {
        await open()
        await start('general', true)
        await node('wide')
        assert.equal((await view()).frame.presentation, 'cg_focus')
        await hidden(false)
        assert.equal(isFullscreen(), false)
        await key('Escape')
        await waitFor(() => events.isDestroyed(), 'resume exit')
        // Test private focus without shipping any private sample or permitting direct entry.
        for (const hide of [true, false]) {
          await open('private', hide)
          await start('private')
          await command('advance')
          await node('wide')
          await fullscreen()
          await inspect()
          events.emit('blur')
          if (hide) await waitFor(() => events.isDestroyed(), 'private blur ON')
          else {
            await waitFor(async () => (await view()).paused, 'private blur OFF')
            await hidden(false)
            events.emit('focus')
            assert.equal((await view()).paused, true)
            await click('event-resume')
            await waitFor(
              async () => !(await view()).paused,
              'private explicit resume',
            )
            await inspect()
            powerMonitor.emit('suspend')
            await waitFor(
              () => events.isDestroyed(),
              'private fullscreen sleep',
            )
            powerMonitor.emit('resume')
          }
        }
        assert.equal(
          desktop.isVisible(),
          false,
          'private exits preserve hidden intent',
        )
        menu.items.find((i) => i.label === '表示').click()
        await open('private', false)
        await start('private', true)
        await node('wide')
        await fullscreen()
        await inspect()
        await key('Escape')
        await hidden(false)
        assert.equal(
          events.isDestroyed(),
          false,
          'first Escape only restores UI in embedded view',
        )
        await key('Escape')
        await waitFor(() => !isFullscreen(), 'second Escape exits fullscreen')
        assert.equal(
          events.isDestroyed(),
          false,
          'fullscreen Escape must not also invoke private return',
        )
        events.close()
        await waitFor(() => events.isDestroyed(), 'native close')
        await waitFor(() => desktop.isVisible(), 'daily restored')
      } else {
        await open()
        assert.throws(
          () =>
            handlers.get('events:window')(
              {
                sender: desktop.webContents,
                senderFrame: desktop.webContents.mainFrame,
              },
              'fullscreen',
            ),
          /Invalid/,
        )
        assert.equal(
          await evaluate(
            "window.events.windowControl('invalid').then(()=>false,()=>true)",
          ),
          true,
        )
        await start()
        assert.equal((await view()).frame.presentation, 'standard')
        await capture('kanojo-standard.png')
        await command('advance')
        await node('wide')
        const progress = (await view()).frame
        await inspect()
        await capture('kanojo-cg-only.png')
        await key('Enter')
        await key('Space')
        assert.deepEqual(
          (await view()).frame,
          progress,
          'inspection keys never advance',
        )
        await click('event-show-ui')
        await hidden(false)
        assert.deepEqual(
          (await view()).frame,
          progress,
          'restore click never advances',
        )
        await key('H')
        await hidden(true)
        await key('Escape')
        await hidden(false)
        assert.equal(events.isDestroyed(), false)
        await capture('kanojo-cg-focus.png')
        const bounds = events.getBounds()
        await click('event-maximize')
        await waitFor(() => events.isMaximized(), 'maximize')
        await fullscreen()
        await capture('kanojo-cg-fullscreen.png')
        await key('Escape')
        await waitFor(
          () => !isFullscreen() && events.isMaximized(),
          'restore maximized state',
        )
        await waitFor(
          async () =>
            !(await evaluate("window.events.windowControl('get')"))
              .transitioning,
          'restore settled',
        )
        await waitFor(
          () => evaluate("!document.querySelector('#event-maximize').disabled"),
          'maximize control restored',
        )
        await click('event-maximize')
        await waitFor(() => !events.isMaximized(), 'unmaximize')
        assert.deepEqual(events.getBounds(), bounds, 'normal bounds restored')
        await key('F11')
        await waitFor(() => isFullscreen(), 'F11 starts fullscreen')
        await waitFor(
          async () =>
            !(await evaluate("window.events.windowControl('get')"))
              .transitioning,
          'F11 settled',
        )
        await key('Escape')
        await waitFor(() => !isFullscreen(), 'Escape restores normal size')
        await waitFor(
          async () =>
            !(await evaluate("window.events.windowControl('get')"))
              .transitioning,
          'normal settled',
        )
        assert.deepEqual(events.getBounds(), bounds)
        events.setSize(640, 480)
        await waitFor(() => evaluate('innerWidth<=640'), 'small')
        await capture('kanojo-cg-small.png')
        assert.equal(
          await evaluate('document.documentElement.scrollWidth<=innerWidth'),
          true,
        )
        await command('advance') // long dialogue page 2
        assert.equal((await view()).frame.choices.length, 8)
        assert.equal(
          await evaluate(
            "document.querySelector('#event-choices').scrollHeight>0",
          ),
          true,
        )
        events.setSize(960, 640)
        await waitFor(() => evaluate('innerWidth>=940'), 'choice capture size')
        await evaluate(
          "document.querySelector('#event-choice-label').scrollIntoView({block:'start'})",
        )
        await capture('kanojo-cg-choices.png')
        events.setSize(640, 480)
        await waitFor(() => evaluate('innerWidth<=640'), 'choice minimum size')
        await evaluate(
          "document.querySelector('#event-choices button:last-child').scrollIntoView()",
        )
        assert.equal(
          await evaluate(
            "(()=>{const r=document.querySelector('#event-choices button:last-child').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})()",
          ),
          true,
          'last long choice reachable at minimum size',
        )
        await command('choose', { choiceId: 'option-0' })
        await node('variant')
        assert.equal(
          await evaluate(
            "document.querySelector('[data-presentation=cg_focus]')!==null",
          ),
          true,
        )
        assert.equal(await evaluate('document.activeElement.id'), 'event-text')
        for (const id of ['four', 'portrait']) {
          await command('advance')
          await node(id)
          assert.equal(
            await evaluate(
              "getComputedStyle(document.querySelector('#event-cg')).objectFit",
            ),
            'contain',
          )
          const ratio = await evaluate(
            "document.querySelector('#event-cg').naturalWidth/document.querySelector('#event-cg').naturalHeight",
          )
          assert.equal(ratio, id === 'four' ? 4 / 3 : 4 / 5)
        }
        for (const id of ['broken', 'missing']) {
          await command('advance')
          await waitFor(
            async () =>
              (await view()).frame.nodeId === id &&
              (await evaluate(
                "!document.querySelector('#event-image-fallback').hidden",
              )),
            id + ' fallback',
          )
          assert.equal(
            await evaluate(
              "document.querySelector('[data-presentation=standard]')!==null",
            ),
            true,
          )
          assert.equal(
            await evaluate("document.querySelector('#event-inspect').hidden"),
            true,
          )
        }
        await command('advance')
        assert.equal((await view()).frame.presentation, 'standard')
        // Re-open sample at focus, leave fullscreen+inspection via blur, preserve checkpoint.
        await command('list')
        await start()
        await command('advance')
        await node('wide')
        await fullscreen()
        await inspect()
        events.emit('blur')
        await waitFor(async () => (await view()).paused, 'general blur')
        await hidden(false)
        events.emit('focus')
        assert.equal((await view()).paused, true)
        await click('event-resume')
        await waitFor(async () => !(await view()).paused, 'resume')
        await inspect()
        // Native close exits immediately, even while inspection/fullscreen is active.
        events.close()
        await waitFor(() => events.isDestroyed(), 'fullscreen close')
      }
      const memory = await desktop.webContents.executeJavaScript(
        'window.desktop.getMemory()',
      )
      assert.equal(memory.affection, 0)
      assert.equal(memory.interactionCount, 0)
      console.log('CG focus process passed:', phase)
      app.quit()
    } catch (error) {
      console.error(error)
      app.exit(1)
    }
  })
})
// Inject all-ages fixture into the compiled test process only. No production private
// event, environment flag, consent bypass, or renderer API is added to the app.
const base = {
  speaker: '検証用',
  expression: 'neutral',
  effect: 'none',
  choices: [],
  end: false,
}
const nodes = [
  { id: 'hello', text: '通常会話', cgAssetId: null, next: 'wide' },
  {
    id: 'wide',
    text: '長文の確認。'.repeat(40),
    cgAssetId: 'wide-card',
    presentation: 'cg_focus',
    next: null,
    choices: Array.from({ length: 8 }, (_, i) => ({
      id: 'option-' + i,
      text: '複数行の選択肢を確認します。'.repeat(8),
      next: 'variant',
    })),
  },
  ...[
    ['variant', 'wide-smile-card', 'four'],
    ['four', 'four-card', 'portrait'],
    ['portrait', 'tea-card', 'broken'],
    ['broken', 'broken-card', 'missing'],
    ['missing', 'missing-card', 'end'],
  ].map(([id, cgAssetId, next]) => ({
    id,
    cgAssetId,
    next,
    presentation: 'cg_focus',
    text: '画像切替・比率・エラーの確認',
  })),
  { id: 'end', text: '通常会話へ復帰', cgAssetId: null, next: null, end: true },
].map((n) => ({ ...base, ...n }))
const fixture = {
  id: 'cg-test',
  version: 1,
  title: '全年齢CG検証',
  audience: 'general',
  condition: { minAffection: 0, requiredCompleted: [] },
  entry: 'hello',
  nodes,
}
const fixtures = [
  fixture,
  { ...fixture, id: 'cg-private-test', audience: 'private' },
]
const entry = require.resolve('../out/main/index.js')
const source = readFileSync(entry, 'utf8')
const marker = 'new EventPlayer(eventCatalog,'
assert.equal(
  source.split(marker).length,
  2,
  'fixture injection must match exactly once',
)
const compiled = new Module(entry)
compiled.filename = entry
compiled.paths = Module._nodeModulePaths(dirname(entry))
require.cache[entry] = compiled
compiled._compile(
  source.replace(
    marker,
    `new EventPlayer([...eventCatalog, ...${JSON.stringify(fixtures)}.map(validateEvent)],`,
  ),
  entry,
)
