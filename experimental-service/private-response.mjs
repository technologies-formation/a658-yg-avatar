// Ne jamais présenter le corps brut d'une erreur de proxy ou de serveur.
export const SECURE_TRANSPORT_MESSAGE = 'La connexion sécurisée n’a pas pu être vérifiée pour cet échange. Vos critères enregistrés sont conservés. Vous pouvez les vérifier dans « Ma demande ». Aucune relance automatique.'
const unavailable = 'La réponse du serveur n’a pas pu être lue. Vos critères enregistrés sont conservés. Aucune relance automatique.'
function failure(message, code) { return Object.assign(Error(message), { code }) }
export async function readPrivateResponse(response) {
  if (response.status === 401) throw failure('Votre accès privé doit être vérifié. Rechargez la page pour vous reconnecter. Aucune relance automatique.', 'private_auth_required')
  const json = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase() === 'application/json'
  if (!json) {
    if (response.status === 403) throw failure(SECURE_TRANSPORT_MESSAGE, 'secure_transport_required')
    throw failure(unavailable, 'private_response_unavailable')
  }
  let value
  try { value = await response.json() } catch { throw failure(unavailable, 'private_response_unavailable') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw failure(unavailable, 'private_response_unavailable')
  if (response.status === 403 && value.code === 'secure_transport_required') throw failure(SECURE_TRANSPORT_MESSAGE, 'secure_transport_required')
  return value
}
