const assert = require('node:assert/strict')
const { app, BrowserWindow } = require('electron')
const { join } = require('node:path')

const timeout = setTimeout(() => {
  console.error('Character smoke timed out')
  app.exit(1)
}, 30000)

void (async () => {
  const { createServer, normalizePath } = await import('vite')
  const server = await createServer({
    configFile: false,
    root: join(__dirname, '../src/renderer'),
    server: { host: '127.0.0.1', port: 0 },
    logLevel: 'error',
    plugins: [
      {
        name: 'character-test-page',
        configureServer(server) {
          server.middlewares.use('/character-test', (_request, response) => {
            response.setHeader('Content-Type', 'text/html')
            response.end(
              '<!doctype html><html><head><title>Character test</title></head><body></body></html>',
            )
          })
        },
      },
    ],
  })
  await server.listen()
  await app.whenReady()
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })
  // Test only the renderer in an isolated browser context. The production preload/main are
  // exercised separately in smoke.cjs; no privileged test hooks ship with the application.
  await window.loadURL(`${server.resolvedUrls.local[0]}character-test`)
  const results = await window.webContents.executeJavaScript(`(async () => {
    const { PngCharacterRenderer } = await import('/src/character/png-renderer.ts')
    const { characterAssets } = await import('/src/character/assets.ts')
    const { installCharacterPreview } = await import('/src/character/preview.ts')
    const { createBehaviorRuntime } = await import('/src/behavior/runtime.ts')
    const { installBehaviorPreview } = await import('/src/behavior/preview.ts')
    const { timeContextAt } = await import(${JSON.stringify('/@fs/' + normalizePath(join(__dirname, '../src/behavior/time-policy.ts')))})
    const { installTimePreview } = await import('/src/behavior/time-preview.ts')
    const { GreetingPresenter, greetingFor } = await import('/src/dialogue/greeting.ts')
    const { InteractionRenderer } = await import('/src/interaction/interaction-renderer.ts')
    const host = document.createElement('div')
    host.style.cssText = 'position:fixed;left:0;top:0;width:340px;height:520px'
    document.body.append(host)
    const applied = []
    const renderer = new PngCharacterRenderer(host, characterAssets, result => applied.push(result))
    const remove = installCharacterPreview(renderer)
    const snapshots = []
    for (const expression of ['neutral', 'smile', 'sleepy', 'surprised', 'shy', 'affectionate']) {
      const result = await window.characterPreview.setState({ action:'idle', expression })
      const canvas = host.querySelector('canvas')
      snapshots.push({ result, pixels: canvas.toDataURL(), visible: renderer.hitTest(170,312), hole: renderer.hitTest(170,480) })
    }
    const actionStates = []
    for (const action of ['reading','resting','sleeping']) actionStates.push(await window.characterPreview.setState({action,expression:'smile'}))
    const simultaneous = await Promise.all([
      renderer.setState({action:'idle',expression:'neutral'}),
      renderer.setState({action:'idle',expression:'surprised'})
    ])
    let rejectsInvalid = false
    try { await window.characterPreview.setState({action:'invalid',expression:'neutral'}) } catch { rejectsInvalid = true }
    const current = applied.at(-1)
    const scaledHost = document.createElement('div')
    scaledHost.style.cssText = 'position:fixed;left:0;top:0;width:680px;height:1040px'
    document.body.append(scaledHost)
    const scaled = new PngCharacterRenderer(scaledHost, characterAssets)
    await scaled.setState({action:'idle',expression:'neutral'})
    const scaledHits = [scaled.hitTest(340,624), scaled.hitTest(340,960), scaled.hitTest(286,960)]
    scaled.dispose()
    scaledHost.remove()
    const failed = new PngCharacterRenderer(host, [
      {id:'missing',url:'/missing-character.png',action:'reading',expression:'smile'},
      ...characterAssets
    ])
    const recovered = await failed.setState({action:'reading',expression:'smile'})
    failed.dispose()
    const empty = new PngCharacterRenderer(host, [{id:'broken',url:'/missing-character.png',action:'idle',expression:'neutral'}, characterAssets.find(asset => asset.expression === 'smile')])
    await empty.setState({action:'idle',expression:'smile'})
    const allFailed = await empty.setState({action:'idle',expression:'neutral'})
    const failedHit = empty.hitTest(170,312)
    empty.dispose()
    const clock = {
      time: 0, tasks: new Map(),
      now() { return this.time },
      schedule(callback, delay) {
        const token = {}; this.tasks.set(token, { callback, deadline: this.time + delay });
        return () => this.tasks.delete(token)
      },
      advance(ms) {
        this.time += ms;
        const due = [...this.tasks].filter(([, task]) => task.deadline <= this.time);
        for (const [token, task] of due) { this.tasks.delete(token); task.callback() }
      }
    }
    const samples = [0, 0, 0, 0.6, 0, 0.99, 0]
    const notifications = []
    const pendingFrames = []
    const behaviorFrames = []
    const runtime = createBehaviorRuntime({
      setState(state) { const task = renderer.setState(state); pendingFrames.push(task); return task },
      hitTest: (x,y) => renderer.hitTest(x,y), dispose: () => renderer.dispose(),
    }, event => notifications.push(event), { clock, random: () => samples.shift() })
    const removeBehavior = installBehaviorPreview(runtime)
    const captureBehaviorFrame = async () => {
      const frames = await Promise.all(pendingFrames.splice(0));
      behaviorFrames.push({ result: frames.at(-1), pixels: host.querySelector('canvas').toDataURL() })
    }
    runtime.start(); await captureBehaviorFrame();
    for (const elapsed of [20000, 60000, 30000]) { clock.advance(elapsed); await captureBehaviorFrame() }
    window.behaviorPreview.pause(); window.behaviorPreview.pause();
    const pausedTimers = clock.tasks.size;
    clock.advance(900000);
    window.behaviorPreview.resume(); window.behaviorPreview.resume();
    const resumedTimers = clock.tasks.size;
    removeBehavior(); runtime.dispose();
    const timeSource = { now: () => new Date() };
    const liveNow = timeSource.now;
    const greetingView = document.createElement('p');
    host.append(greetingView);
    const greeting = new GreetingPresenter(greetingView, clock);
    const removeTime = installTimePreview(timeSource, () => greeting.show(greetingFor(timeContextAt(timeSource.now()).period, false)));
    const timeRenders = [];
    const timedEngine = createBehaviorRuntime({
      setState(state) { const task = renderer.setState(state); timeRenders.push(task); return task },
      hitTest: (x,y) => renderer.hitTest(x,y), dispose: () => renderer.dispose(),
    }, () => {}, { clock, random: () => 0.4, selectionPolicy: () => timeContextAt(timeSource.now()) });
    const periods = [];
    for (const hour of ['08','12','20','01']) {
      window.timePreview.setLocalTime('2026-11-07T' + hour + ':00:00');
      timedEngine.stop(); timedEngine.start();
      const frames = await Promise.all(timeRenders.splice(0));
      periods.push({ period: window.timePreview.getState().period, greeting: greetingView.textContent, hidden:greetingView.hidden, action:frames.at(-1).state.action });
    }
    const beforeTimeJump = timedEngine.getSnapshot().remainingMs;
    window.timePreview.setLocalTime('2099-01-01T23:00:00');
    window.timePreview.setLocalTime('2000-01-01T01:00:00');
    const afterTimeJump = timedEngine.getSnapshot().remainingMs;
    let rejectedBadTime = false;
    try { window.timePreview.setLocalTime('invalid') } catch { rejectedBadTime = true }
    const validPeriodAfterBadTime = window.timePreview.getState().period;
    clock.advance(5000);
    const greetingExpired = greetingView.hidden;
    window.timePreview.reset();
    const resetLiveTime = timeSource.now === liveNow;
    removeTime(); greeting.dispose(); timedEngine.dispose();
    const timeCleanedUp = typeof window.timePreview === 'undefined' && clock.tasks.size === 0;
    greetingView.remove();
    const reactionView = document.createElement('p');
    host.append(reactionView);
    const reactionBubble = new GreetingPresenter(reactionView, clock);
    const reactionTasks = [];
    const reactionEvents = [];
    const interactive = new InteractionRenderer({
      setState(state) { const task = renderer.setState(state); reactionTasks.push(task); return task },
      hitTest: (x,y) => renderer.hitTest(x,y), dispose: () => {},
    }, reactionBubble, clock, () => 0, event => reactionEvents.push(event));
    await interactive.setState({action:'idle',expression:'neutral'});
    const beforeReaction = host.querySelector('canvas').toDataURL();
    interactive.react();
    await Promise.all(reactionTasks.splice(0));
    const duringReaction = host.querySelector('canvas').toDataURL();
    const textDuringReaction = reactionView.textContent;
    for (let i = 0; i < 20; i++) interactive.react();
    const acceptedReactions = reactionEvents.length;
    clock.advance(3000);
    await Promise.all(reactionTasks.splice(0));
    const afterReaction = host.querySelector('canvas').toDataURL();
    const hiddenAfterReaction = reactionView.hidden;
    interactive.dispose(); reactionBubble.dispose(); reactionView.remove();

    const disposedTimers = clock.tasks.size;
    const behaviorPreviewAfter = typeof window.behaviorPreview;
    remove()
    renderer.dispose()
    const disposedHit = renderer.hitTest(170,312)
    const pendingRenderer = new PngCharacterRenderer(host, characterAssets)
    const pending = pendingRenderer.setState({action:'idle',expression:'neutral'})
    pendingRenderer.dispose()
    const disposedDuringLoad = await pending
    const afterDispose = await renderer.setState({action:'idle',expression:'smile'})
    return {beforeReaction,duringReaction,afterReaction,textDuringReaction,acceptedReactions,hiddenAfterReaction,periods,beforeTimeJump,afterTimeJump,rejectedBadTime,validPeriodAfterBadTime,greetingExpired,resetLiveTime,timeCleanedUp,behaviorFrames,notifications,pausedTimers,resumedTimers,disposedTimers,behaviorPreviewAfter,disposedDuringLoad,snapshots,actionStates,simultaneous,current,rejectsInvalid,scaledHits,recovered,allFailed,failedHit,disposedHit,afterDispose,canvasCount:host.querySelectorAll('canvas').length,previewAfter:typeof window.characterPreview}
  })()`)
  assert.equal(
    new Set(results.snapshots.slice(0, 4).map((entry) => entry.pixels)).size,
    4,
    'four expressions must visibly differ',
  )
  for (const entry of results.snapshots) {
    assert.equal(entry.result.applied, true)
    assert.equal(entry.visible, true)
    assert.equal(entry.hole, false)
  }
  for (const entry of results.snapshots.slice(4)) {
    assert.equal(entry.result.assetId, 'test-smile')
    assert.equal(entry.result.fallback, true)
  }
  for (const result of results.actionStates) {
    assert.equal(result.assetId, 'test-smile')
    assert.equal(result.fallback, true)
    assert.equal(result.state.expression, 'smile')
  }
  assert.equal(results.simultaneous[0].applied, false)
  assert.equal(results.simultaneous[1].applied, true)
  assert.equal(results.current.assetId, 'test-surprised')
  assert.equal(results.rejectsInvalid, true)
  assert.deepEqual(results.scaledHits, [true, false, true])
  assert.equal(results.recovered.assetId, 'test-smile')
  assert.deepEqual(results.recovered.unavailable, ['missing'])
  assert.equal(results.allFailed.assetId, null)
  assert.equal(results.failedHit, false)
  assert.deepEqual(
    results.behaviorFrames.map((frame) => frame.result.state.action),
    ['idle', 'reading', 'resting', 'sleeping'],
  )
  assert.deepEqual(
    results.behaviorFrames.map((frame) => frame.result.state.expression),
    ['neutral', 'neutral', 'smile', 'sleepy'],
  )
  assert.equal(
    new Set(results.behaviorFrames.map((frame) => frame.pixels)).size,
    3,
  )
  assert.equal(
    results.notifications.filter((event) => event.reason === 'transition')
      .length,
    3,
  )
  assert.equal(results.pausedTimers, 0)
  assert.equal(results.resumedTimers, 1)
  assert.equal(results.disposedTimers, 0)
  assert.equal(results.behaviorPreviewAfter, 'undefined')
  assert.deepEqual(
    results.periods.map((entry) => entry.period),
    ['morning', 'daytime', 'evening', 'late-night'],
  )
  assert.equal(new Set(results.periods.map((entry) => entry.greeting)).size, 4)
  assert.ok(results.periods.every((entry) => !entry.hidden))
  assert.equal(results.periods.at(-1).action, 'sleeping')
  assert.equal(results.beforeTimeJump, results.afterTimeJump)
  assert.equal(results.rejectedBadTime, true)
  assert.equal(results.validPeriodAfterBadTime, 'late-night')
  assert.equal(results.greetingExpired, true)
  assert.equal(results.resetLiveTime, true)
  assert.equal(results.timeCleanedUp, true)
  assert.notEqual(results.beforeReaction, results.duringReaction)
  assert.equal(results.beforeReaction, results.afterReaction)
  assert.equal(results.acceptedReactions, 1)
  assert.equal(results.hiddenAfterReaction, true)
  assert.ok(results.textDuringReaction.length > 0)
  assert.equal(results.disposedDuringLoad.applied, false)
  assert.equal(results.disposedHit, false)
  assert.equal(results.afterDispose.applied, false)
  assert.equal(results.canvasCount, 0)
  assert.equal(results.previewAfter, 'undefined')
  clearTimeout(timeout)
  await server.close()
  window.destroy()
  console.log(
    'Character smoke passed: expressions, actions, fallback, alpha holes, scaling, races, disposal',
  )
  app.exit(0)
})().catch((error) => {
  console.error(error)
  app.exit(1)
})
