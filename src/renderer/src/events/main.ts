import { mountEventView } from './view'
const dispose = mountEventView(document.querySelector<HTMLElement>('#events')!)
window.addEventListener('pagehide', dispose)
