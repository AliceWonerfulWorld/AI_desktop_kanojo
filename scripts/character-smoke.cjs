const assert = require('node:assert/strict')
const { app, BrowserWindow } = require('electron')
const { join } = require('node:path')

const timeout = setTimeout(() => {
  console.error('Character smoke timed out')
  app.exit(1)
}, 30000)

void (async () => {
  const { createServer } = await import('vite')
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
    remove()
    renderer.dispose()
    const disposedHit = renderer.hitTest(170,312)
    const pendingRenderer = new PngCharacterRenderer(host, characterAssets)
    const pending = pendingRenderer.setState({action:'idle',expression:'neutral'})
    pendingRenderer.dispose()
    const disposedDuringLoad = await pending
    const afterDispose = await renderer.setState({action:'idle',expression:'smile'})
    return {disposedDuringLoad,snapshots,actionStates,simultaneous,current,rejectsInvalid,scaledHits,recovered,allFailed,failedHit,disposedHit,afterDispose,canvasCount:host.querySelectorAll('canvas').length,previewAfter:typeof window.characterPreview}
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
    assert.equal(entry.result.assetId, 'test-neutral')
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
