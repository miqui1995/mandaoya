// MandaoYa – interfaz del ADMINISTRADOR
import { $, esc, money, toast, ask, sheet, closeSheet, PAY, STATUS, statusBadge, dayKey, ago, hhmm, waLink, telLink, makeMap, ICONS, fitTo,
  VEHICLES, STORE_CATS, HOME } from './ui.js';

export function mount(root, ctx) {
  const { db } = ctx;
  let tab = 'vivo', active = [], pending = [], users = [], stores = [], dayOrders = [], day = dayKey(), map = null, layer = null, unsubDay = null;
  root.innerHTML = `<div class="tabs scroll"><button data-t="vivo" class="on">En vivo <span id="aCnt" class="cnt hidden"></span></button><button data-t="aprob">Aprobar <span id="aPend" class="cnt hidden"></span></button><button data-t="gente">Gente</button><button data-t="tarifas">Tarifas</button><button data-t="rep">Reportes</button></div>
    <div id="aBody"></div>`;
  const body = $('#aBody', root);
  root.querySelector('.tabs').onclick = e => { const b = e.target.closest('[data-t]'); if (b) setTab(b.dataset.t); };
  function setTab(t) {
    tab = t; root.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x.dataset.t === t));
    if (map) { map.remove(); map = null; layer = null; }
    render();
  }

  const u1 = db.watch('orders', [['active', '==', true]], o => {
    active = o.sort((a, b) => a.createdAt - b.createdAt);
    $('#aCnt', root).textContent = active.length; $('#aCnt', root).classList.toggle('hidden', !active.length);
    if (tab === 'vivo') renderVivo(true);
  });
  const u2 = db.watch('users', [], u => {
    users = u; pending = u.filter(x => !x.approved && x.role !== 'cliente' && !x.rejected);
    $('#aPend', root).textContent = pending.length; $('#aPend', root).classList.toggle('hidden', !pending.length);
    if (tab === 'aprob' || tab === 'gente') render();
    if (tab === 'vivo') renderVivo(true);
  });
  const u3 = db.watch('stores', [], s => { stores = s; if (tab === 'aprob' || tab === 'gente') render(); });
  function watchDay() { unsubDay && unsubDay(); unsubDay = db.watch('orders', [['day', '==', day]], o => { dayOrders = o; if (tab === 'rep') render(); }); }
  watchDay();

  function render() {
    if (tab === 'vivo') renderVivo(); else if (tab === 'aprob') renderAprob(); else if (tab === 'gente') renderGente();
    else if (tab === 'tarifas') renderTarifas(); else renderRep();
  }

  // ---------- En vivo ----------
  function renderVivo(update) {
    const couriers = users.filter(u => u.role === 'domiciliario' && u.approved && u.online);
    if (!update || !map) {
      body.innerHTML = `<div id="aMap" class="map mid"></div><div class="pad" id="aList"></div>`;
      map = makeMap($('#aMap', body)); layer = L.layerGroup().addTo(map);
    }
    layer.clearLayers();
    const pts = [];
    for (const c of couriers) if (c.loc) { L.marker([c.loc.lat, c.loc.lng], { icon: ICONS.courier() }).bindPopup(`<b>${esc(c.name)}</b><br>${esc(VEHICLES[c.vehicle]?.[0] || '')}<br>${ago(c.loc.at || Date.now())}`).addTo(layer); pts.push(c.loc); }
    for (const o of active) if (o.dest?.lat) { L.marker([o.dest.lat, o.dest.lng], { icon: ICONS.dest() }).bindPopup(`#${esc(o.code)} · ${esc(STATUS[o.status][0])}`).addTo(layer); pts.push(o.dest); }
    if (!update) fitTo(map, pts.length ? pts : [{ lat: HOME[0], lng: HOME[1] }]);
    const timeout = ctx.settings.assignTimeoutMin || 5;
    $('#aList', body).innerHTML = `<div class="stats"><div class="stat"><b>${active.length}</b><span>en curso</span></div><div class="stat"><b>${active.filter(o => o.status === 'buscando').length}</b><span>sin domiciliario</span></div><div class="stat"><b>${couriers.length}</b><span>domiciliarios en línea</span></div></div>
      ${active.map(o => {
        const late = o.status === 'buscando' && (Date.now() - (o.times?.buscando || o.createdAt)) / 60000 >= timeout;
        return `<div class="card order ${late || o.issue ? 'hot' : ''}" data-o="${o.id}">
          <div class="rowb"><b>#${esc(o.code)} · ${esc(o.type === 'mandado' ? 'Mandado' : o.storeName)}</b>${statusBadge(o.status)}</div>
          <small>${esc(o.clientName || '')} · ${esc(o.dest?.zoneName || '')} · ${ago(o.createdAt)} · ${o.total ? money(o.total) : 'sin valor'}</small>
          ${o.courierName ? `<small>🛵 ${esc(o.courierName)}</small>` : ''}
          ${late ? `<div class="warn">Lleva más de ${timeout} min sin domiciliario</div>` : ''}
          ${o.issue ? `<div class="warn">Problema reportado: ${esc(o.issue)}</div>` : ''}
          <div class="row"><a class="btn small" href="#/seguir/${o.id}">Ver</a>
            ${o.courierUid ? '<button class="btn small" data-a="unassign">Reasignar</button>' : ''}
            ${o.issue ? '<button class="btn small" data-a="clearIssue">Resuelto</button>' : ''}
            <button class="btn small danger" data-a="cancel">Cancelar</button></div></div>`;
      }).join('') || '<p class="note">No hay pedidos en curso.</p>'}
      ${couriers.length ? `<h3>Domiciliarios en línea</h3><ul class="list">${couriers.map(c => `<li><div class="meta"><b>${esc(c.name)}</b><small>${esc(VEHICLES[c.vehicle]?.[0] || '')} · ${active.filter(o => o.courierUid === c.id).length} pedido(s) · GPS ${c.loc ? ago(c.loc.at || 0) : 'sin datos'}</small></div><a class="btn small" href="${waLink(c.phone, '')}" target="_blank">WhatsApp</a></li>`).join('')}</ul>` : ''}`;
  }

  // ---------- Aprobaciones ----------
  function renderAprob() {
    body.innerHTML = `<div class="pad"><h2>Registros por aprobar</h2>${pending.map(u => {
      const s = stores.find(x => x.id === u.id);
      return `<div class="card" data-u="${u.id}"><div class="rowb"><b>${esc(u.name)}</b><span class="badge" style="background:#64748b">${u.role === 'tendero' ? 'Tienda' : 'Domiciliario'}</span></div>
        <small>${esc(u.phone)} · ${ago(u.createdAt)}</small>
        ${u.role === 'domiciliario' ? `<small>${esc(VEHICLES[u.vehicle]?.[0] || '')}${u.plate ? ' · placa ' + esc(u.plate) : ''}</small>` : ''}
        ${s ? `<small>🏪 <b>${esc(s.name)}</b> · ${esc(STORE_CATS[s.cat] || '')} · ${esc(s.ref || '')}</small>` : ''}
        <p class="note">Verifica en persona: cédula${u.role === 'domiciliario' ? ', vehículo y documentos' : ' y ubicación de la tienda'}.</p>
        <div class="row"><a class="btn" href="${waLink(u.phone, `Hola ${u.name}, soy el administrador de MandaoYa.`)}" target="_blank">WhatsApp</a><button class="btn danger" data-a="reject">Rechazar</button><button class="btn primary" data-a="approve">Aprobar</button></div></div>`;
    }).join('') || '<p class="note">No hay registros pendientes.</p>'}</div>`;
  }

  // ---------- Gente ----------
  function renderGente() {
    const doms = users.filter(u => u.role === 'domiciliario' && u.approved);
    const clients = users.filter(u => u.role === 'cliente');
    body.innerHTML = `<div class="pad"><h2>Tiendas (${stores.filter(s => s.approved).length})</h2><ul class="list">${stores.filter(s => s.approved).map(s => `<li data-s="${s.id}"><div class="meta"><b>${esc(s.name)}</b><small>${s.open ? '● Abierta' : '○ Cerrada'} · ${esc(s.phone || '')}</small></div>
        <button class="btn small" data-a="suspendStore">Suspender</button></li>`).join('') || '<li class="note">Sin tiendas</li>'}</ul>
      <h2>Domiciliarios (${doms.length})</h2><ul class="list">${doms.map(u => `<li data-u="${u.id}"><div class="meta"><b>${esc(u.name)}</b><small>${esc(VEHICLES[u.vehicle]?.[0] || '')} · ${u.online ? 'en línea' : 'fuera'} · ${esc(u.phone)}</small></div>
        <button class="btn small" data-a="suspend">Suspender</button></li>`).join('') || '<li class="note">Sin domiciliarios</li>'}</ul>
      <h2>Clientes (${clients.length})</h2><ul class="list">${clients.slice(0, 200).map(u => `<li><div class="meta"><b>${esc(u.name)}</b><small>${esc(u.phone)}</small></div></li>`).join('') || '<li class="note">Sin clientes</li>'}</ul></div>`;
  }

  // ---------- Tarifas ----------
  function renderTarifas() {
    const s = ctx.settings;
    body.innerHTML = `<div class="pad"><h2>Tarifas por sector</h2>
      <p class="note">El cliente elige su sector y se le cobra esa tarifa de domicilio.</p>
      <ul class="list">${ctx.zones.map(z => `<li data-z="${z.id}"><div class="meta"><input class="in" data-f="name" value="${esc(z.name)}"></div><input class="in money" data-f="fee" type="number" inputmode="numeric" value="${z.fee}"><button class="btn small danger" data-a="delZone">✕</button></li>`).join('')}</ul>
      <button class="btn block" data-a="addZone">+ Agregar sector</button>
      <h2>Ajustes</h2>
      <label class="f">Tarifa base (si no hay sector)</label><input class="in" id="tBase" type="number" inputmode="numeric" value="${s.baseFee ?? 3000}">
      <label class="f">Comisión de MandaoYa sobre cada domicilio (%)</label><input class="in" id="tComm" type="number" inputmode="numeric" value="${s.commissionPct ?? 0}">
      <label class="f">Minutos sin domiciliario antes de alertar</label><input class="in" id="tTime" type="number" inputmode="numeric" value="${s.assignTimeoutMin ?? 5}">
      <label class="f">WhatsApp del administrador (soporte)</label><input class="in" id="tWa" type="tel" inputmode="tel" value="${esc(s.adminWhatsApp || '')}">
      <label class="f">Nombre del pueblo</label><input class="in" id="tTown" value="${esc(s.town || 'San José, Roberto Payán')}">
      <button class="btn primary block" data-a="saveSettings">Guardar todo</button></div>`;
  }

  // ---------- Reportes ----------
  function renderRep() {
    const done = dayOrders.filter(o => o.status === 'entregado'), canc = dayOrders.filter(o => o.status === 'cancelado');
    const comm = (ctx.settings.commissionPct || 0) / 100;
    const fees = done.reduce((s, o) => s + (o.fee || 0), 0), sales = done.reduce((s, o) => s + (o.subtotal || 0), 0);
    const mins = done.filter(o => o.times?.entregado).map(o => (o.times.entregado - o.createdAt) / 60000);
    const avg = mins.length ? Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) : null;
    const group = (key, label) => {
      const g = {};
      for (const o of done) { const k = label(o); g[k] = g[k] || { n: 0, fee: 0, sub: 0 }; g[k].n++; g[k].fee += o.fee || 0; g[k].sub += o.subtotal || 0; }
      return Object.entries(g).sort((a, b) => b[1].n - a[1].n);
    };
    const ratings = done.filter(o => o.rating).map(o => o.rating);
    body.innerHTML = `<div class="pad"><div class="rowb"><h2>Reporte</h2><input type="date" class="in date" id="rDay" value="${day}"></div>
      <div class="stats"><div class="stat"><b>${done.length}</b><span>entregados</span></div><div class="stat"><b>${canc.length}</b><span>cancelados</span></div><div class="stat"><b>${avg ?? '—'}${avg != null ? ' min' : ''}</b><span>tiempo promedio</span></div></div>
      <div class="stats"><div class="stat"><b>${money(sales)}</b><span>ventas tiendas</span></div><div class="stat"><b>${money(fees)}</b><span>domicilios</span></div><div class="stat"><b>${money(fees * comm)}</b><span>comisión</span></div></div>
      ${ratings.length ? `<p class="note">Calificación promedio: ${(ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1)} ★ (${ratings.length})</p>` : ''}
      <h3>Por tienda</h3><ul class="list">${group('s', o => o.type === 'mandado' ? 'Mandados' : o.storeName).map(([k, v]) => `<li><div class="meta"><b>${esc(k)}</b><small>${v.n} pedidos</small></div><b>${money(v.sub)}</b></li>`).join('') || '<li class="note">—</li>'}</ul>
      <h3>Por domiciliario</h3><ul class="list">${group('c', o => o.courierName || '—').map(([k, v]) => `<li><div class="meta"><b>${esc(k)}</b><small>${v.n} entregas · comisión ${money(v.fee * comm)}</small></div><b>${money(v.fee)}</b></li>`).join('') || '<li class="note">—</li>'}</ul>
      ${canc.length ? `<h3>Cancelaciones</h3><ul class="list">${canc.map(o => `<li><div class="meta"><b>#${esc(o.code)} · ${esc(o.storeName || 'Mandado')}</b><small>${esc(o.cancelReason || '')} (${esc(o.cancelBy || '')})</small></div></li>`).join('')}</ul>` : ''}
      <button class="btn block" data-a="csv">Descargar CSV del día</button></div>`;
    $('#rDay', body).onchange = e => { day = e.target.value; watchDay(); };
  }

  // ---------- acciones ----------
  body.onclick = async e => {
    const a = e.target.closest('[data-a]'); if (!a) return;
    const act = a.dataset.a; const now = Date.now();
    try {
      if (act === 'approve' || act === 'reject') {
        const uid = e.target.closest('[data-u]').dataset.u; const u = users.find(x => x.id === uid);
        if (act === 'approve') {
          await db.update('users', uid, { approved: true, approvedAt: now });
          if (u.role === 'tendero' && stores.find(s => s.id === uid)) await db.update('stores', uid, { approved: true });
          toast(`${u.name} aprobado`);
        } else if (await ask('¿Rechazar registro?', esc(u.name), 'Rechazar', true)) await db.update('users', uid, { rejected: true });
      }
      if (act === 'suspend') { const uid = e.target.closest('[data-u]').dataset.u; if (await ask('¿Suspender domiciliario?', 'No podrá aceptar domicilios hasta que lo apruebes de nuevo.', 'Suspender', true)) await db.update('users', uid, { approved: false, online: false }); }
      if (act === 'suspendStore') { const sid = e.target.closest('[data-s]').dataset.s; if (await ask('¿Suspender tienda?', 'Dejará de aparecer para los clientes.', 'Suspender', true)) { await db.update('stores', sid, { approved: false, open: false }); await db.update('users', sid, { approved: false }).catch(() => { }); } }
      const oid = e.target.closest('[data-o]')?.dataset.o;
      if (act === 'cancel' && oid && await ask('¿Cancelar pedido?', 'Se avisará a la tienda, al cliente y al domiciliario en su pantalla.', 'Cancelar pedido', true))
        await db.update('orders', oid, { status: 'cancelado', active: false, cancelReason: 'Cancelado por el administrador', cancelBy: 'admin', 'times.cancelado': now });
      if (act === 'unassign' && oid && await ask('¿Reasignar?', 'El pedido vuelve a la lista de disponibles para otro domiciliario.', 'Reasignar'))
        await db.update('orders', oid, { status: 'buscando', courierUid: null, courierName: null, courierPhone: null, courierLoc: null, 'times.buscando': now });
      if (act === 'clearIssue' && oid) await db.update('orders', oid, { issue: null });
      if (act === 'addZone') { await db.add('zones', { name: 'Nuevo sector', fee: ctx.settings.baseFee || 3000, order: ctx.zones.length + 1, active: true }); setTimeout(renderTarifas, 200); }
      if (act === 'delZone') { const zid = e.target.closest('[data-z]').dataset.z; if (await ask('¿Quitar este sector?', '', 'Quitar', true)) { await db.update('zones', zid, { active: false }); setTimeout(renderTarifas, 200); } }
      if (act === 'saveSettings') {
        for (const li of body.querySelectorAll('[data-z]')) {
          await db.update('zones', li.dataset.z, { name: li.querySelector('[data-f="name"]').value.trim(), fee: +li.querySelector('[data-f="fee"]').value || 0 });
        }
        await db.set('config', 'general', { baseFee: +$('#tBase').value || 0, commissionPct: +$('#tComm').value || 0, assignTimeoutMin: +$('#tTime').value || 5,
          adminWhatsApp: $('#tWa').value.trim(), town: $('#tTown').value.trim() }, { merge: true });
        toast('Tarifas y ajustes guardados');
      }
      if (act === 'csv') {
        const cols = ['code', 'day', 'type', 'storeName', 'clientName', 'clientPhone', 'zone', 'courierName', 'status', 'pay', 'subtotal', 'fee', 'total', 'creado', 'entregado', 'cancelReason', 'rating'];
        const rows = dayOrders.map(o => [o.code, o.day, o.type, o.storeName, o.clientName, o.clientPhone, o.dest?.zoneName, o.courierName, o.status, o.pay, o.subtotal, o.fee, o.total, hhmm(o.createdAt), hhmm(o.times?.entregado), o.cancelReason, o.rating]);
        const csv = [cols, ...rows].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob(['﻿' + csv], { type: 'text/csv' });
        const f = new File([blob], `mandaoya_${day}.csv`, { type: 'text/csv' });
        if (navigator.canShare && navigator.canShare({ files: [f] })) await navigator.share({ files: [f] });
        else { const l = document.createElement('a'); l.href = URL.createObjectURL(blob); l.download = f.name; l.click(); }
      }
    } catch (err) { if (err.name !== 'AbortError') toast('Error: ' + (err.message || err)); }
  };

  render();
  return () => { u1(); u2(); u3(); unsubDay && unsubDay(); map && map.remove(); body.onclick = null; };
}
