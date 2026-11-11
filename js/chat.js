// MandaoYa — chat dentro de un pedido (cliente ↔ tienda ↔ domiciliario).
// Los mensajes viven en la subcolección orders/<id>/messages y se ven en tiempo real.
import { $, esc, toast, hhmm } from './ui.js';

const ROLE_LABEL = { cliente: 'Cliente', tendero: 'Tienda', domiciliario: 'Domiciliario', admin: 'Admin' };

// Monta el chat en `container`. Devuelve una función para desuscribirse.
export function mountChat(container, ctx, orderId, order) {
  const { db } = ctx;
  const path = 'orders/' + orderId + '/messages';
  const uid = db.uid;

  // ¿Qué rol tengo YO en este pedido?
  let myRole = ctx.me?.role || 'cliente';
  if (order.storeId && order.storeId === uid) myRole = 'tendero';
  else if (order.courierUid && order.courierUid === uid) myRole = 'domiciliario';
  else if (order.clientUid && order.clientUid === uid) myRole = 'cliente';

  container.innerHTML = `<div class="chat">
    <div class="chatHead">💬 Chat del pedido</div>
    <div class="chatBody" id="chBody"><p class="note center">Cargando…</p></div>
    <div class="chatIn">
      <input class="in" id="chText" placeholder="Escribe un mensaje…" autocomplete="off" maxlength="500">
      <button class="btn primary" id="chSend">Enviar</button>
    </div>
  </div>`;
  const bodyEl = $('#chBody', container);
  const input = $('#chText', container);

  function render(msgs) {
    msgs.sort((a, b) => (a.at || 0) - (b.at || 0));
    if (!msgs.length) { bodyEl.innerHTML = '<p class="note center">Aún no hay mensajes. Escribe para coordinar el pedido (ej. "¿hay aceite Premier?").</p>'; return; }
    const atBottom = bodyEl.scrollHeight - bodyEl.scrollTop - bodyEl.clientHeight < 40;
    bodyEl.innerHTML = msgs.map(m => {
      const mine = m.by === uid;
      return `<div class="msg ${mine ? 'mine' : ''}">
        ${mine ? '' : `<div class="who">${esc(m.name || ROLE_LABEL[m.role] || '')}</div>`}
        <div class="bub">${esc(m.text)}</div>
        <div class="mt">${hhmm(m.at)}</div>
      </div>`;
    }).join('');
    if (atBottom) bodyEl.scrollTop = bodyEl.scrollHeight;
  }

  const unsub = db.watch(path, [], render);

  async function send() {
    const text = input.value.trim(); if (!text) return;
    input.value = '';
    try { await db.add(path, { by: uid, role: myRole, name: ctx.me?.name || ROLE_LABEL[myRole], text, at: Date.now() }); }
    catch (e) { toast('No se pudo enviar el mensaje'); input.value = text; }
  }
  $('#chSend', container).onclick = send;
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); send(); } });

  return unsub;
}
