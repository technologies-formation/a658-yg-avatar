// Présentation locale uniquement : aucune requête métier, aucun accès aux critères de recherche.
export function createAssistantAvatar(document, expression = 'ready') {
  const avatar = document.createElement('span')
  avatar.className = 'avatar assistant-robot'
  avatar.dataset.expression = expression
  avatar.setAttribute('aria-hidden', 'true')
  return avatar
}

export function initAssistantPresentation(document) {
  const root = document.documentElement
  const media = document.defaultView.matchMedia('(prefers-color-scheme: dark)')
  const toggle = document.getElementById('appearance-toggle')
  const label = document.getElementById('appearance-label')
  const storageKey = 'a658yg-appearance'
  let preference = null
  try {
    const saved = document.defaultView.localStorage.getItem(storageKey)
    if (saved === 'day' || saved === 'night') preference = saved
  } catch { /* La préférence système fonctionne aussi sans stockage. */ }
  const apply = () => {
    const night = (preference ?? (media.matches ? 'night' : 'day')) === 'night'
    root.dataset.appearance = night ? 'night' : 'day'
    root.style.colorScheme = night ? 'dark' : 'light'
    toggle.checked = night
    label.textContent = night ? 'Mode nuit' : 'Mode jour'
  }
  toggle.addEventListener('change', () => {
    preference = toggle.checked ? 'night' : 'day'
    try { document.defaultView.localStorage.setItem(storageKey, preference) } catch { /* Choix valable dans la page. */ }
    apply()
  })
  media.addEventListener('change', () => { if (!preference) apply() })
  apply()
  return {
    activity(text = '') {
      let pending = document.getElementById('assistant-working')
      if (!text) { pending?.remove(); return }
      if (!pending) {
        pending = document.createElement('section')
        pending.id = 'assistant-working'
        pending.className = 'message assistant-working'
        pending.append(createAssistantAvatar(document, 'thinking'))
        const status = document.createElement('p')
        status.className = 'working-label'
        status.setAttribute('role', 'status')
        status.setAttribute('aria-live', 'polite')
        pending.append(status)
        document.getElementById('thread').append(pending)
      }
      pending.querySelector('.working-label').textContent = text
    },
  }
}
