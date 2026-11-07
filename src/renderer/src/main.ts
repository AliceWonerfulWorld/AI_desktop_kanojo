import './style.css'

const status = document.querySelector<HTMLParagraphElement>('#status')!
const versions = document.querySelector<HTMLDListElement>('#versions')!

try {
  for (const [name, version] of Object.entries(window.desktop.versions)) {
    const term = document.createElement('dt')
    const description = document.createElement('dd')
    term.textContent = name
    description.textContent = version
    versions.append(term, description)
  }
  status.textContent = 'Main → Preload → Renderer の接続を確認しました。'
} catch (error) {
  status.textContent =
    '初期化に失敗しました。開発者ツールの Console を確認してください。'
  console.error('Renderer initialization failed', error)
}
