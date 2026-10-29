import test from 'node:test'
import assert from 'node:assert/strict'
import { readPrivateResponse, SECURE_TRANSPORT_MESSAGE } from './private-response.mjs'

test('refus HTTPS JSON et ancien texte : message sûr, sans lecture de contenu brut', async () => {
  for (const [type, body] of [['application/json', JSON.stringify({code:'secure_transport_required',detail:'PRIVATE_SENTINEL'})], ['text/plain', 'Transport HTTPS PRIVATE_SENTINEL']]) {
    const response = new Response(body, {status:403,headers:{'Content-Type':type}})
    await assert.rejects(readPrivateResponse(response), error => error.code === 'secure_transport_required' && error.message === SECURE_TRANSPORT_MESSAGE)
  }
})

test('HTML, JSON malformé, réponse vide et accès expiré : aucune erreur brute exposée', async () => {
  for (const [status,type,body] of [[502,'text/html','<html>PRIVATE_SENTINEL</html>'],[200,'application/json','PRIVATE_SENTINEL'],[503,'application/json',''],[200,'application/json','null'],[200,'application/json','[]'],[401,'text/plain','PRIVATE_SENTINEL']]) {
    await assert.rejects(readPrivateResponse(new Response(body,{status,headers:{'Content-Type':type}})),error=>{
      assert.doesNotMatch(error.message,/PRIVATE_SENTINEL|JSON|Unexpected|<html>/)
      assert.match(error.message,/Aucune relance automatique/)
      return true
    })
  }
})

test('contrats métier JSON inchangés : succès et refus fonctionnels restent interprétés par le client', async () => {
  for (const [status,value] of [[200,{draft:{revision:4}}],[422,{code:'invalid_response'}],[403,{code:'origin'}]]) {
    assert.deepEqual(await readPrivateResponse(new Response(JSON.stringify(value),{status,headers:{'Content-Type':'Application/JSON; charset=utf-8'}})),value)
  }
})
