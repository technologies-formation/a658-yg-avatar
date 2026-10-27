// Présentation locale uniquement : aucune requête métier, aucun accès aux critères de recherche.
export function createAssistantAvatar(document, expression = 'ready') {
  const avatar = document.createElement('span')
  avatar.className = 'avatar assistant-robot'
  avatar.dataset.expression = expression
  avatar.setAttribute('aria-hidden', 'true')
  return avatar
}

// Icône d’onglet dérivée du visage existant, sans nouvel asset ni appel extérieur.
function installAssistantFavicon(document) {
  const image = new document.defaultView.Image()
  image.onload = () => {
    try {
      const canvas = document.createElement('canvas')
      canvas.width = 64; canvas.height = 64
      const context = canvas.getContext('2d')
      const tile = image.naturalWidth / 3
      context.drawImage(image, tile * .035, image.naturalHeight * .175,
        tile * .93, image.naturalHeight * .565, 1, 11, 62, 42)
      const icon = document.createElement('link')
      icon.rel = 'icon'; icon.type = 'image/png'; icon.sizes = '64x64'
      icon.href = canvas.toDataURL('image/png'); icon.dataset.assistantIcon = 'true'
      document.head.querySelectorAll('link[rel="icon"]').forEach(previous => previous.remove())
      document.head.append(icon)
    } catch { /* L’icône ne doit jamais bloquer la discussion. */ }
  }
  image.src = '/private/assistant-robot.webp'
}

export function initAssistantPresentation(document) {
  installAssistantFavicon(document)
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

// Tous les critères restent dans la page ; seul leur volet est replié au départ.
export function createResearchCriteria(document, snapshot, appendProfile, open = false) {
  const details = document.createElement('details')
  details.className = 'need-summary research-criteria'
  details.dataset.criteriaResearchNumber = String(snapshot.number)
  details.open = open
  const summary = document.createElement('summary')
  const title = document.createElement('span'); title.className = 'criteria-title'; title.textContent = 'Les critères de ma recherche'
  const hint = document.createElement('span'); hint.className = 'criteria-hint'
  hint.textContent = [snapshot.profile.timeAvailable, snapshot.modality].filter(Boolean).join(' · ') || 'Critères confirmés'
  summary.append(title, hint)
  const content = document.createElement('div'); content.className = 'criteria-content'
  appendProfile(snapshot.profile, content)
  details.append(summary, content)
  return details
}
