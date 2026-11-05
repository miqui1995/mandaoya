// MandaoYa – interfaz del DOMICILIARIO
import { $, esc, money, toast, ask, prompt4, sheet, closeSheet, PAY, statusBadge, dayKey, ago, hhmm, waLink, telLink, beep,
  haversine, fdist, travelMin, makeMap, ICONS, fitTo, keepAwake, VEHICLES } from './ui.js';

const MAX_ACTIVE = 2;

export function mount(root, ctx) {
  const { db } = ctx;
  let tab = 'disp', avail = [], mine = [], today = [], seen = null, myLoc = ctx.me.loc || null;
  let watchId = null, lastWrite = 0, lastWritten = null, map = null, mk = {}, shown = '';

  root.innerHTML = `<div class="storeBar" id="dBar"></div>
    <div class="tabs"><button data-t="disp" class="on">Disponibles <span id="dCnt" class="cnt hidden"></span></button><button data-t="mio">Mi pedido <span id="dMine" class="cnt hidden"></span></button><button data-t="caja">Mi caja</button></div>
    <div id="dBody" class="pad"></div>`;
  const body = $('#dBody', root);
  root.querySelector('.tabs').onclick = e => { const b = e.target.closest('[data-t]'); if (b) setTab(b.dataset.t); };
  function setTab(t) {
    tab = t; root.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x.dataset.t === t));
    if (map) { map.remove(); map = null; mk = {}; }
    render();
  }

  const online = () => !!ctx.me?.online;
  function renderBar() {
    const on = online();
    $('#dBar', root).innerHTML = `<div><b>${on ? 'Disponible' : 'Desconectado'}</b><small>${on ? (myLoc ? 'Compartiendo ubicación' : 'Buscando GPS…') : 'Conéctate para recibir domicilios'}</small></div>
      <button class="toggle ${on ? 'on' : ''}" id="dOn"><span></span>${on ? 'En línea' : 'Fuera'}</button>`;
    $('#dOn', root).onclick = async () => {
      if (online() && mine.length) return toast('Termina tus pedidos antes de desconectarte');
      const v = !online();
      await db.update('users', db.uid, { online: v, onlineAt: Date.now() });
      ctx.me.online = v; v ? startGps() : stopGps(); renderBar(); render();
    };
  }

  // ---------- GPS ----------
  function startGps() {
    keepAwake(true);
    if (watchId != null || !navigator.geolocation) return;
    watchId = navigator.geolocation.watchPosition(p => {
      myLoc = { lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), acc: Math.round(p.coords.accuracy), at: Date.now() };
      const moved = lastWritten ? haversine(lastWritten, myLoc) : 999;
      if (Date.now() - lastWrite > 15000 || moved > 30) {
        lastWrite = Date.now(); lastWritten = myLoc;
        db.update('users', db.uid, { loc: myLoc }).catch(() => { });
        for (const o of mine) db.update('orders', o.id, { courierLoc: myLoc }).catch(() => { });
      }
      if (mk.me) mk.me.setLatLng([myLoc.lat, myLoc.lng]);
      renderBar();
    }, e => { if (e.code === 1) toast('Activa la ubicación para MandaoYa en Ajustes del iPhone', 6000); },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
  }
  function stopGps() { if (watchId != null) navigator.geolocation.clearWatch(watchId); watchId = null; keepAwake(false); }
  document.addEventListener('visibilitychange', onVis);
  function onVis() { if (document.visibilityState === 'visible' && online()) keepAwake(true); }
  if (online()) startGps();

  // ---------- datos ----------
  const u1 = db.watch('orders', [['status', '==', 'buscando']], o => {
    avail = o.sort((a, b) => (a.times?.buscando || a.createdAt) - (b.times?.buscando || b.createdAt));
    if (seen && online() && avail.some(x => !seen.has(x.id))) { beep(4); toast('¡Nuevo domicilio disponible!'); }
    seen = new Set(avail.map(x => x.id));
    $('#dCnt', root).textContent = avail.length; $('#dCnt', root).classList.toggle('hidden', !avail.length);
    if (tab === 'disp') render();
  });
  const u2 = db.watch('orders', [['courierUid', '==', db.uid], ['active', '==', true]], o => {
    const had = mine.length; mine = o.sort((a, b) => a.createdAt - b.createdAt);
    $('#dMine', root).textContent = mine.length; $('#dMine', root).classList.toggle('hidden', !mine.length);
    if (mine.length < had) toast('Un pedido salió de tu lista (entregado o cancelado)');
    if (tab === 'mio') {
      const o = mine[0];
      if (!(map && o && shown === o.id + o.status)) { if (map) { map.remove(); map = null; mk = {}; } render(); }
    } else if (mine.length > had && tab === 'disp') setTab('mio');
  });
  const u3 = db.watch('orders', [['courierUid', '==', db.uid], ['day', '==', dayKey()]], o => { today = o; if (tab === 'caja') render(); });

  function render() {
    renderBar();
    if (tab === 'disp') renderAvail(); else if (tab === 'mio') renderMine(); else renderCaja();
  }

  function renderAvail() {
    if (!online()) { body.innerHTML = `<div class="empty"><div class="bigicon">🛵</div><p>Estás desconectado.</p><p class="note">Toca “Fuera” arriba para ponerte en línea y ver los domicilios.</p></div>`; return; }
    if (!avail.length) { body.innerHTML = `<div class="empty"><div class="bigicon">⏳</div><p>No hay domicilios por ahora.</p><p class="note">Te sonará una alerta cuando llegue uno. Mantén la app abierta.</p></div>`; return; }
    const veh = ctx.me.vehicle || 'moto';
    const comm = (ctx.settings.commissionPct || 0) / 100;
    body.innerHTML = avail.map(o => {
      const dPick = o.pickup?.lat ? haversine(myLoc, o.pickup) : null;
      const dTrip = o.pickup?.lat && o.dest?.lat ? haversine(o.pickup, o.dest) : null;
      return `<div class="card order" data-o="${o.id}">
        <div class="rowb"><b>${o.type === 'mandado' ? '🛵 Mandado' : '🏪 ' + esc(o.storeName)}</b><b class="earn">${money(o.fee * (1 - comm))}</b></div>
        <small>Recoger: ${esc(o.pickup?.ref || '—')}${dPick != null ? ` · a ${fdist(dPick)} de ti` : ''}</small>
        <small>Entregar: ${esc(o.dest?.zoneName || '')} · ${esc(o.dest?.ref || '')}${dTrip != null ? ` · ${fdist(dTrip)} (~${travelMin(dTrip, veh)} min)` : ''}</small>
        <small>${PAY[o.pay]}${o.total ? ' · cobrar ' + money(o.total) : ''}${o.type === 'mandado' && o.subtotal ? ' · compra aprox. ' + money(o.subtotal) : ''} · ${ago(o.times?.buscando || o.createdAt)}</small>
        ${o.type === 'mandado' ? `<div class="items">${esc(o.items)}</div>` : ''}
        <button class="btn primary block" data-a="take">Aceptar domicilio</button></div>`;
    }).join('');
  }

  function renderMine() {
    if (map) { map.remove(); map = null; mk = {}; }
    if (!mine.length) { shown = ''; body.innerHTML = `<div class="empty"><div class="bigicon">✅</div><p>No tienes pedidos en curso.</p></div>`; return; }
    const o = mine[0]; shown = o.id + o.status;
    const toCollect = o.pay === 'efectivo' ? (o.total || 0) : 0;
    const change = o.payWith && toCollect ? o.payWith - toCollect : 0;
    const next = o.status === 'asignado' ? o.pickup : o.dest;
    body.innerHTML = `${mine.length > 1 ? `<div class="chips">${mine.map((x, i) => `<button class="chip ${i ? '' : 'on'}" data-pick="${x.id}">#${esc(x.code)}</button>`).join('')}</div>` : ''}
      <div class="rowb"><h2>#${esc(o.code)}</h2>${statusBadge(o.status)}</div>
      <div id="dMap" class="map mid"></div>
      <div class="card">
        <small class="lbl">${o.status === 'asignado' ? '1. Recoger en' : '2. Entregar a'}</small>
        ${o.status === 'asignado'
          ? `<b>${esc(o.type === 'mandado' ? 'Mandado' : o.storeName)}</b><small>${esc(o.pickup?.ref || '')}</small>
             ${o.storePhone ? `<div class="row"><a class="btn" href="${telLink(o.storePhone)}">Llamar tienda</a><a class="btn" target="_blank" href="${waLink(o.storePhone, `Hola, soy ${ctx.me.name} de MandaoYa, voy por el pedido #${o.code}`)}">WhatsApp</a></div>` : ''}`
          : `<b>${esc(o.clientName || 'Cliente')}</b><small>${esc(o.dest?.zoneName || '')} · ${esc(o.dest?.ref || '')}</small>`}
        ${o.clientPhone ? `<div class="row"><a class="btn" href="${telLink(o.clientPhone)}">Llamar cliente</a><a class="btn" target="_blank" href="${waLink(o.clientPhone, `Hola ${o.clientName || ''}, soy ${ctx.me.name}, tu domiciliario de MandaoYa. ${o.status === 'recogido' ? 'Ya voy en camino con tu pedido.' : 'Voy por tu pedido.'}`)}">WhatsApp</a></div>` : ''}
        ${next?.lat ? `<a class="btn block" target="_blank" href="https://www.google.com/maps/dir/?api=1&destination=${next.lat},${next.lng}">Abrir ruta en Google Maps</a>` : ''}
      </div>
      <div class="card"><small class="lbl">Pedido</small><div class="items">${esc(o.items)}</div>${o.note ? `<small>Nota: ${esc(o.note)}</small>` : ''}
        <div class="sum">
          ${o.subtotal ? `<div class="rowb"><span>${o.type === 'mandado' ? 'Compra aprox.' : 'Productos'}</span><span>${money(o.subtotal)}</span></div>` : ''}
          <div class="rowb"><span>Domicilio</span><span>${money(o.fee)}</span></div>
          <div class="rowb"><b>${o.pay === 'efectivo' ? 'Cobrar en efectivo' : 'Pagado por ' + PAY[o.pay]}</b><b>${o.pay === 'efectivo' ? money(toCollect) : '—'}</b></div>
          ${change > 0 ? `<div class="rowb warnrow"><span>Paga con ${money(o.payWith)} · lleva cambio</span><b>${money(change)}</b></div>` : ''}
        </div></div>
      ${o.status === 'asignado' ? `<button class="btn primary block big" data-a="picked" data-id="${o.id}">Ya recogí el pedido</button>` : ''}
      ${o.status === 'recogido' ? `<button class="btn primary block big" data-a="deliver" data-id="${o.id}">Entregado</button>` : ''}
      <button class="btn block" data-a="issue" data-id="${o.id}">Reportar un problema</button>`;
    // mapa
    map = makeMap($('#dMap', body));
    mk = {};
    if (o.pickup?.lat) mk.store = L.marker([o.pickup.lat, o.pickup.lng], { icon: ICONS.store() }).addTo(map);
    if (o.dest?.lat) mk.dest = L.marker([o.dest.lat, o.dest.lng], { icon: ICONS.dest() }).addTo(map);
    if (myLoc) mk.me = L.marker([myLoc.lat, myLoc.lng], { icon: ICONS.courier() }).addTo(map);
    fitTo(map, [o.pickup?.lat ? o.pickup : null, o.dest?.lat ? o.dest : null, myLoc]);
  }

  function renderCaja() {
    const done = today.filter(o => o.status === 'entregado');
    const comm = (ctx.settings.commissionPct || 0) / 100;
    const fees = done.reduce((s, o) => s + (o.fee || 0), 0);
    const cash = done.filter(o => o.pay === 'efectivo');
    const cashIn = cash.reduce((s, o) => s + (o.total || 0), 0);
    const oweStores = cash.filter(o => o.type === 'tienda').reduce((s, o) => s + (o.subtotal || 0), 0);
    const digitalFees = done.filter(o => o.pay !== 'efectivo').reduce((s, o) => s + (o.fee || 0), 0);
    const byStore = {};
    for (const o of cash.filter(o => o.type === 'tienda')) { byStore[o.storeName] = (byStore[o.storeName] || 0) + (o.subtotal || 0); }
    body.innerHTML = `<h2>Mi caja de hoy</h2>
      <div class="stats"><div class="stat"><b>${done.length}</b><span>entregas</span></div><div class="stat"><b>${money(fees * (1 - comm))}</b><span>ganancia</span></div><div class="stat"><b>${money(cashIn)}</b><span>efectivo recibido</span></div></div>
      <div class="card sum">
        <div class="rowb"><span>Efectivo recibido de clientes</span><b>${money(cashIn)}</b></div>
        <div class="rowb"><span>Debes entregar a las tiendas</span><b>− ${money(oweStores)}</b></div>
        ${comm ? `<div class="rowb"><span>Comisión MandaoYa (${ctx.settings.commissionPct}%)</span><b>− ${money(fees * comm)}</b></div>` : ''}
        ${digitalFees ? `<div class="rowb"><span>Domicilios pagados por Nequi/Daviplata (te los debe la tienda)</span><b>+ ${money(digitalFees)}</b></div>` : ''}
        <div class="rowb total"><span>Te queda</span><b>${money(cashIn - oweStores - fees * comm + digitalFees)}</b></div>
      </div>
      ${Object.keys(byStore).length ? `<h3>Entregar a cada tienda</h3><ul class="list">${Object.entries(byStore).map(([k, v]) => `<li><div class="meta"><b>${esc(k)}</b></div><b>${money(v)}</b></li>`).join('')}</ul>` : ''}
      <h3>Entregas</h3><ul class="list">${today.sort((a, b) => b.createdAt - a.createdAt).map(o => `<li><div class="meta"><b>#${esc(o.code)} · ${esc(o.type === 'mandado' ? 'Mandado' : o.storeName)}</b><small>${hhmm(o.times?.entregado || o.createdAt)} · ${PAY[o.pay]} · ${money(o.fee)}</small></div>${statusBadge(o.status)}</li>`).join('') || '<li class="note">Aún no has hecho entregas hoy.</li>'}</ul>`;
  }

  body.onclick = async e => {
    const pk = e.target.closest('[data-pick]');
    if (pk) { const i = mine.findIndex(x => x.id === pk.dataset.pick); if (i > 0) { mine.unshift(mine.splice(i, 1)[0]); setTab('mio'); } return; }
    const a = e.target.closest('[data-a]'); if (!a) return;
    const now = Date.now();
    try {
      if (a.dataset.a === 'take') {
        if (mine.length >= MAX_ACTIVE) return toast(`Máximo ${MAX_ACTIVE} pedidos a la vez`);
        const id = e.target.closest('[data-o]').dataset.o;
        a.disabled = true; a.textContent = 'Asignando…';
        await db.tx('orders', id, cur => {
          if (!cur || cur.status !== 'buscando' || cur.courierUid) throw new Error('TOMADO');
          return { status: 'asignado', courierUid: db.uid, courierName: ctx.me.name, courierPhone: ctx.me.phone, courierVehicle: ctx.me.vehicle || 'moto',
            courierPlate: ctx.me.plate || '', courierLoc: myLoc || null, 'times.asignado': now };
        });
        toast('¡Domicilio asignado! Ve a recogerlo.'); setTab('mio');
      }
      if (a.dataset.a === 'picked') await db.update('orders', a.dataset.id, { status: 'recogido', courierLoc: myLoc || null, 'times.recogido': now });
      if (a.dataset.a === 'deliver') {
        const o = mine.find(x => x.id === a.dataset.id);
        const pin = await prompt4('Código de entrega', 'Pídele al cliente el código de 4 dígitos que le aparece en su seguimiento.');
        if (pin == null) return;
        if (pin !== o.pin) {
          if (!(await ask('Código incorrecto', 'El código no coincide. Si el cliente no tiene el código (por ejemplo, pidió por teléfono), puedes marcarlo entregado igual y quedará registrado.', 'Entregado sin código', true))) return;
        }
        await db.update('orders', o.id, { status: 'entregado', active: false, pinOk: pin === o.pin, 'times.entregado': now, courierLoc: myLoc || null });
        toast('¡Entrega registrada!'); beep(1);
      }
      if (a.dataset.a === 'issue') {
        const o = mine.find(x => x.id === a.dataset.id);
        const b = sheet(`<h2>Reportar problema</h2>${['El cliente no contesta', 'No encuentro la dirección', 'La tienda no tiene listo el pedido', 'Problema con el pago', 'Tuve un percance en la vía'].map(r => `<button class="btn block" data-r="${esc(r)}">${esc(r)}</button>`).join('')}
          ${ctx.settings.adminWhatsApp ? `<a class="btn block" target="_blank" href="${waLink(ctx.settings.adminWhatsApp, `Pedido #${o.code}: necesito ayuda`)}">Escribir al administrador</a>` : ''}`);
        b.onclick = async ev => { const r = ev.target.closest('[data-r]'); if (!r) return; closeSheet(); await db.update('orders', o.id, { issue: r.dataset.r, issueAt: Date.now() }); toast('Reportado al administrador'); };
      }
    } catch (err) {
      if (err.message === 'TOMADO' || /TOMADO/.test(String(err))) toast('Otro domiciliario lo tomó primero');
      else toast('Error: ' + (err.message || err));
      render();
    }
  };

  render();
  return () => { u1(); u2(); u3(); document.removeEventListener('visibilitychange', onVis); if (map) map.remove(); stopGps(); body.onclick = null; };
}
