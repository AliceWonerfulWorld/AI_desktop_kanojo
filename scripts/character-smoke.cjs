const assert = require('node:assert/strict')
const { app, BrowserWindow } = require('electron')
const { join } = require('node:path')

const timeout = setTimeout(() => {
  console.error('Character smoke timed out')
  app.exit(1)
}, 45000)

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
    const { testCharacterAssets: characterAssets } = await import('/src/character/test-assets.ts')
    const { characterAssets: koharuAssets } = await import('/src/character/assets.ts')
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
    let stage = 'familiar';
    const staged = new InteractionRenderer({
      setState(state) { const task = renderer.setState(state); reactionTasks.push(task); return task },
      hitTest: (x,y) => renderer.hitTest(x,y), dispose: () => {},
    }, reactionBubble, clock, () => stage === 'close' ? 0 : 0.4, () => {}, () => stage);
    const relationshipFrames = [];
    for (const current of ['familiar', 'close']) {
      stage = current;
      await staged.setState({action:'reading',expression:'neutral'});
      const event = staged.react();
      await Promise.all(reactionTasks.splice(0));
      relationshipFrames.push({event, result: applied.at(-1), pixels: host.querySelector('canvas').toDataURL()});
      clock.advance(3000);
      await Promise.all(reactionTasks.splice(0));
    }
    staged.dispose();
    interactive.dispose(); reactionBubble.dispose(); reactionView.remove();

    const koharuHost = document.createElement('div');
    koharuHost.style.cssText = 'position:fixed;left:0;top:0;width:340px;height:520px';
    document.body.append(koharuHost);
    const koharuApplied = [];
    const koharuRenderer = new PngCharacterRenderer(koharuHost, koharuAssets, result => koharuApplied.push(result));
    const koharuFrames = [];
    for (const expression of ['neutral','shy','sleepy','surprised','affectionate','smile']) {
      const result = await koharuRenderer.setState({action:'idle',expression});
      const canvas = koharuHost.querySelector('canvas');
      const data = canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
      const bounds = [canvas.width,canvas.height,0,0];
      for (let y=0;y<canvas.height;y++) for(let x=0;x<canvas.width;x++) if(data[(y*canvas.width+x)*4+3]>0) {
        bounds[0]=Math.min(bounds[0],x);bounds[1]=Math.min(bounds[1],y);
        bounds[2]=Math.max(bounds[2],x);bounds[3]=Math.max(bounds[3],y);
      }
      koharuFrames.push({result,pixels:canvas.toDataURL(),bounds,
        visible:koharuRenderer.hitTest(170,260), margin:koharuRenderer.hitTest(10,10),gap:koharuRenderer.hitTest(170,416)});
    }
    const koharuActions = [];
    for (const action of ['idle','reading','resting','sleeping']) for (const expression of ['neutral','smile','sleepy','surprised','shy','affectionate'])
      koharuActions.push(await koharuRenderer.setState({action,expression}));
    const koharuCache = koharuRenderer.getCacheStats();
    const loungeFrames=[];
    await koharuRenderer.setOutfit('loungewear');
    for(const action of ['idle','reading','resting','sleeping']) for(const expression of ['neutral','smile','sleepy','surprised','shy','affectionate']) {
      const result=await koharuRenderer.setState({action,expression});
      const canvas=koharuHost.querySelector('canvas');
      loungeFrames.push({result,pixels:action==='idle'?canvas.toDataURL():null,visible:koharuRenderer.hitTest(170,260),margin:koharuRenderer.hitTest(0,0),gap:koharuRenderer.hitTest(170,416)});
    }
    const loungeCache=koharuRenderer.getCacheStats();
    const neutralOnly = new PngCharacterRenderer(koharuHost,koharuAssets.filter(a=>a.outfitId==='loungewear' && a.expression==='neutral'));
    const neutralOnlyFrames=[];
    for(const expression of ['neutral','smile','sleepy','surprised','shy','affectionate']) neutralOnlyFrames.push(await neutralOnly.setState({action:'reading',expression,outfitId:'loungewear'}));
    neutralOnly.dispose();
    const brokenLounge = new PngCharacterRenderer(koharuHost,koharuAssets.map(a=>a.outfitId==='loungewear' && a.expression==='shy'?{...a,url:'/missing-production-lounge-shy.png'}:a));
    const loungeRecovered=await brokenLounge.setState({action:'idle',expression:'shy',outfitId:'loungewear'});
    brokenLounge.dispose();
    await koharuRenderer.setOutfit('default');

    // Synthetic outfit mappings use test-only art; no substitute is registered in production.
    const outfitAssets = [...characterAssets,
      {...characterAssets.find(a=>a.expression==='neutral'),id:'lounge-neutral-test',outfitId:'loungewear'},
      {...characterAssets.find(a=>a.expression==='smile'),id:'lounge-shy-test',outfitId:'loungewear',expression:'shy',url:'/missing-outfit-shy.png'},
    ];
    const outfitHost = document.createElement('div');
    outfitHost.style.cssText='position:fixed;left:0;top:0;width:340px;height:520px';
    document.body.append(outfitHost);
    const outfitRenderer = new PngCharacterRenderer(outfitHost,outfitAssets);
    await outfitRenderer.setState({action:'reading',expression:'smile'});
    const beforeOutfit = outfitHost.querySelector('canvas').toDataURL();
    const prepared = await outfitRenderer.prepareOutfit('loungewear');
    const prepareUnchanged=beforeOutfit===outfitHost.querySelector('canvas').toDataURL();
    await outfitRenderer.setOutfit('loungewear');
    const outfitFrames=[];
    for(const action of ['idle','reading','resting','sleeping']) for(const expression of ['neutral','smile','sleepy','surprised','shy','affectionate'])
      outfitFrames.push(await outfitRenderer.setState({action,expression}));
    const outfitHits = [outfitRenderer.hitTest(170,312),outfitRenderer.hitTest(170,480)];
    const outfitCache=outfitRenderer.getCacheStats();
    const outfitRaces=await Promise.all([outfitRenderer.setOutfit('default'),outfitRenderer.setOutfit('loungewear')]);
    const outfitAfterRace=await outfitRenderer.setState({action:'resting',expression:'smile'});
    await outfitRenderer.setState({action:'idle',expression:'smile',outfitId:'loungewear'});
    const explicitSwitchBack=await outfitRenderer.setOutfit('default');
    const afterSwitchBack=await outfitRenderer.setState({action:'idle',expression:'smile'});
    const defaultAgain=outfitHost.querySelector('canvas').toDataURL();
    const failedOutfit = new PngCharacterRenderer(outfitHost,characterAssets);
    await failedOutfit.setState({action:'idle',expression:'smile'});
    const failureCanvas=outfitHost.querySelectorAll('canvas')[1];
    const beforeFailedSwitch=failureCanvas.toDataURL();
    const failedSwitch=await failedOutfit.setOutfit('loungewear');
    const failureBox=failureCanvas.getBoundingClientRect();
    const failurePreserved=beforeFailedSwitch===failureCanvas.toDataURL() && failedOutfit.hitTest(failureBox.left+170,failureBox.top+312);
    failedOutfit.dispose();outfitRenderer.dispose();outfitHost.remove();
    const brokenSmile = new PngCharacterRenderer(koharuHost, koharuAssets.map(asset =>
      asset.expression === 'smile' ? {...asset,url:'/missing-smile.png'} : asset));
    const koharuRecovered = await brokenSmile.setState({action:'idle',expression:'smile'});
    brokenSmile.dispose();
    const koharuView = document.createElement('p'); koharuHost.append(koharuView);
    const koharuBubble = new GreetingPresenter(koharuView,clock);
    const koharuTasks = [];
    const koharuInteraction = new InteractionRenderer({
      setState(state) {const task=koharuRenderer.setState(state);koharuTasks.push(task);return task},
      hitTest:(x,y)=>koharuRenderer.hitTest(x,y),dispose:()=>{},
    },koharuBubble,clock,()=>0,()=>{},()=> 'stranger');
    await koharuInteraction.setState({action:'reading',expression:'neutral'});
    koharuInteraction.react(); await Promise.all(koharuTasks.splice(0));
    const koharuReaction={during:koharuApplied.at(-1),text:koharuView.textContent};
    clock.advance(3000); await Promise.all(koharuTasks.splice(0));
    koharuReaction.after=koharuApplied.at(-1); koharuReaction.hidden=koharuView.hidden;
    koharuInteraction.dispose(); koharuBubble.dispose(); koharuRenderer.dispose(); koharuHost.remove();

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
    return {loungeFrames,loungeCache,neutralOnlyFrames,loungeRecovered,explicitSwitchBack,koharuCache,prepared,prepareUnchanged,outfitFrames,outfitHits,outfitCache,outfitRaces,outfitAfterRace,afterSwitchBack,defaultAgain,failedSwitch,failurePreserved,koharuRecovered,koharuFrames,koharuActions,koharuReaction,relationshipFrames,beforeReaction,duringReaction,afterReaction,textDuringReaction,acceptedReactions,hiddenAfterReaction,periods,beforeTimeJump,afterTimeJump,rejectedBadTime,validPeriodAfterBadTime,greetingExpired,resetLiveTime,timeCleanedUp,behaviorFrames,notifications,pausedTimers,resumedTimers,disposedTimers,behaviorPreviewAfter,disposedDuringLoad,snapshots,actionStates,simultaneous,current,rejectsInvalid,scaledHits,recovered,allFailed,failedHit,disposedHit,afterDispose,canvasCount:host.querySelectorAll('canvas').length,previewAfter:typeof window.characterPreview}
  })()`)
  for (const frame of results.loungeFrames) {
    const expression = frame.result.state.expression
    const expected = ['neutral', 'smile', 'shy'].includes(expression)
      ? expression
      : 'neutral'
    assert.equal(frame.result.assetId, 'koharu-loungewear-' + expected)
    assert.equal(frame.result.state.outfitId, 'loungewear')
    assert.equal(frame.visible, true)
    assert.equal(frame.margin, false)
    assert.equal(frame.gap, false)
  }
  assert.equal(
    new Set(
      results.loungeFrames
        .filter((f) => f.result.state.action === 'idle')
        .map((f) => f.pixels),
    ).size,
    3,
  )
  assert.ok(
    results.neutralOnlyFrames.every(
      (r) => r.assetId === 'koharu-loungewear-neutral',
    ),
  )
  assert.equal(results.loungeRecovered.assetId, 'koharu-loungewear-neutral')
  assert.deepEqual(results.loungeRecovered.unavailable, [
    'koharu-loungewear-shy',
  ])
  assert.ok(results.loungeCache.entries <= 2)
  assert.ok(results.loungeCache.alphaBytes <= 2 * 937 * 1678)
  assert.equal(results.koharuCache.entries, 2)
  assert.equal(results.koharuCache.alphaBytes, 3072 * 5500 + 1143 * 2047)
  console.log(
    'PNG retained alpha cache:',
    JSON.stringify(results.koharuCache),
    'bytes; decoded image storage is additional',
  )
  assert.equal(results.prepared, true)
  assert.equal(results.prepareUnchanged, true)
  assert.ok(
    results.outfitFrames.every(
      (result) =>
        result.assetId === 'lounge-neutral-test' &&
        result.state.outfitId === 'loungewear',
    ),
  )
  assert.deepEqual(results.outfitHits, [true, false])
  assert.equal(results.outfitCache.alphaBytes, 340 * 520)
  assert.equal(results.outfitRaces[0].applied, false)
  assert.equal(results.outfitRaces[1].applied, true)
  assert.equal(results.outfitAfterRace.assetId, 'lounge-neutral-test')
  assert.equal(results.explicitSwitchBack.assetId, 'test-smile')
  assert.equal(results.afterSwitchBack.assetId, 'test-smile')
  assert.equal(results.failedSwitch.applied, false)
  assert.equal(results.failurePreserved, true)
  assert.equal(
    new Set(results.koharuFrames.map((frame) => frame.pixels)).size,
    6,
  )
  for (const frame of results.koharuFrames) {
    assert.equal(frame.result.applied, true)
    assert.equal(
      frame.result.assetId,
      `koharu-${frame.result.state.expression}`,
    )
    assert.deepEqual(frame.result.unavailable, [])
    assert.equal(frame.visible, true)
    assert.equal(frame.margin, false)
    assert.equal(frame.gap, false)
    frame.bounds.forEach((value, index) =>
      assert.ok(
        Math.abs(value - results.koharuFrames[0].bounds[index]) <= 2,
        'standing envelope should stay aligned within 2 canvas pixels',
      ),
    )
  }
  for (const result of results.koharuActions)
    assert.ok(result.assetId.startsWith('koharu-'))
  assert.equal(results.koharuRecovered.assetId, 'koharu-neutral')
  assert.deepEqual(results.koharuRecovered.unavailable, ['koharu-smile'])
  assert.equal(results.koharuRecovered.fallback, true)
  assert.equal(results.koharuReaction.during.assetId, 'koharu-smile')
  assert.ok(results.koharuReaction.text.length > 0)
  assert.equal(results.koharuReaction.after.assetId, 'koharu-neutral')
  assert.equal(results.koharuReaction.after.state.action, 'reading')
  assert.equal(results.koharuReaction.hidden, true)
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
  for (const [index, frame] of results.relationshipFrames.entries()) {
    assert.equal(frame.event.stage, index === 0 ? 'familiar' : 'close')
    assert.equal(frame.event.expression, index === 0 ? 'shy' : 'affectionate')
    assert.equal(frame.result.assetId, 'test-smile')
    assert.equal(frame.result.state.action, 'reading')
    assert.equal(frame.result.state.expression, frame.event.expression)
    assert.equal(frame.pixels, results.snapshots[1].pixels)
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
  // Sample a separate renderer before/after six real PNGs, without test art or IPC hooks.
  const memoryWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })
  await memoryWindow.loadURL(`${server.resolvedUrls.local[0]}character-test`)
  const rendererMemory = () =>
    app
      .getAppMetrics()
      .find(
        (metric) => metric.pid === memoryWindow.webContents.getOSProcessId(),
      )?.memory
  const memoryBefore = rendererMemory()
  const retained = await memoryWindow.webContents.executeJavaScript(`(async()=>{
    const { PngCharacterRenderer }=await import('/src/character/png-renderer.ts');
    const { characterAssets }=await import('/src/character/assets.ts');
    const host=document.createElement('div');host.style.cssText='width:340px;height:520px';document.body.append(host);
    window.memoryRenderer=new PngCharacterRenderer(host,characterAssets);
    for(const expression of ['neutral','smile','sleepy','surprised','shy','affectionate']) await window.memoryRenderer.setState({action:'idle',expression});
    return window.memoryRenderer.getCacheStats();
  })()`)
  const memoryAfter = rendererMemory()
  console.log(
    'PNG memory sample (OS metrics in KiB):',
    JSON.stringify({ before: memoryBefore, afterSix: memoryAfter, retained }),
  )
  const loungeRetained = await memoryWindow.webContents
    .executeJavaScript(`(async()=>{
    await window.memoryRenderer.setOutfit('loungewear');
    for(const expression of ['neutral','shy','smile']) await window.memoryRenderer.setState({action:'idle',expression});
    return window.memoryRenderer.getCacheStats();
  })()`)
  assert.equal(loungeRetained.entries, 2)
  assert.equal(loungeRetained.alphaBytes, 2 * 937 * 1678)
  console.log(
    'Loungewear memory after switching (OS metrics in KiB):',
    JSON.stringify({ memory: rendererMemory(), retained: loungeRetained }),
  )
  await memoryWindow.webContents.executeJavaScript(
    'window.memoryRenderer.dispose();delete window.memoryRenderer',
  )
  memoryWindow.destroy()
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
