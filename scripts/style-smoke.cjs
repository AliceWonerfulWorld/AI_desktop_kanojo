const assert = require('node:assert/strict')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { app } = require('electron')

const userData = mkdtempSync(join(tmpdir(), 'kanojo-style-'))
app.setPath('userData', userData)
let server
const timeout = setTimeout(() => app.exit(1), 30000)
app.on('quit', () => {
  clearTimeout(timeout)
  try {
    rmSync(userData, { recursive: true, force: true })
  } catch (error) {
    console.warn('Temporary userData cleanup deferred:', error.code)
  }
})

app.on('browser-window-created', (_event, window) => {
  window.webContents.once('did-finish-load', async () => {
    try {
      const styles = await window.webContents.executeJavaScript(`(() => {
        const bubble = document.querySelector('#greeting');
        bubble.textContent = 'クリック反応の表示確認';
        bubble.hidden = false;
        const style = getComputedStyle(bubble);
        const status = getComputedStyle(document.querySelector('#status'));
        return {
          position: style.position, background: style.backgroundColor,
          pointerEvents: style.pointerEvents, radius: style.borderRadius,
          statusWidth: status.width, overflow: getComputedStyle(document.body).overflow,
          top: bubble.getBoundingClientRect().top,
          bottom: bubble.getBoundingClientRect().bottom, height: innerHeight
        };
      })()`)
      assert.equal(styles.position, 'absolute')
      assert.equal(styles.background, 'rgb(247, 244, 240)')
      assert.equal(styles.pointerEvents, 'none')
      assert.equal(styles.radius, '14px')
      assert.equal(styles.statusWidth, '1px')
      assert.equal(styles.overflow, 'hidden')
      assert.ok(styles.top >= 0 && styles.bottom <= styles.height)
      console.log(`Styles verified (${server ? 'development' : 'production'})`)
      await server?.close()
      app.quit()
    } catch (error) {
      console.error(error)
      await server?.close()
      app.exit(1)
    }
  })
})

async function start() {
  if (process.argv.includes('--dev')) {
    const { createServer } = await import('vite')
    server = await createServer({
      configFile: false,
      root: join(__dirname, '../src/renderer'),
      server: { host: '127.0.0.1', port: 0 },
    })
    await server.listen()
    process.env.ELECTRON_RENDERER_URL = server.resolvedUrls.local[0]
  }
  require('../out/main/index.js')
}
start().catch((error) => {
  console.error(error)
  app.exit(1)
})
