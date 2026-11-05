// MandaoYa – arranque, registro y enrutador
import { createLocalDB, createFirebaseDB } from './db.js';
import { CFG, HOME, $, esc, toast, sheet, closeSheet, ask, pickLocation, STORE_CATS, VEHICLES, waLink } from './ui.js';
import * as Cliente from './cliente.js';
import * as Tienda from './tienda.js';
import * as Domi from './domi.js';
import * as Admin from './admin.js';
import * as Seguir from './seguir.js';

const ctx = { db: null, me: null, settings: {}, zones: [], cleanup: null };
window.MandaoYa = ctx; // útil para depurar

// ---------- datos de demostración ----------
function seed(api, data) {
  const now = Date.now();
  const s = (c, id, o) => { (data[c] = data[c] || {})[id] = o; };
  s('config', 'general', { baseFee: 3000, commissionPct: 0, assignTimeoutMin: 5, adminWhatsApp: '', town: 'San José, Roberto Payán' });
  [['centro', 'Centro', 3000, 1], ['alto', 'Parte alta', 4000, 2], ['rio', 'Orilla del río', 4000, 3], ['afueras', 'Afueras / veredas cercanas', 7000, 4]]
    .forEach(([id, name, fee, order]) => s('zones', id, { name, fee, order, active: true }));
  const U = (id, o) => s('users', id, { createdAt: now, approved: true, ...o });
  U('demo_admin', { role: 'admin', name: 'Administrador', phone: '3000000000' });
  s('admins', 'demo_admin', { since: now });
  U('demo_t1', { role: 'tendero', name: 'Rosa', phone: '3001111111' });
  U('demo_t2', { role: 'tendero', name: 'Jairo', phone: '3002222222' });
  U('demo_t3', { role: 'tendero', name: 'Nelly', phone: '3003333333' });
  U('demo_d1', { role: 'domiciliario', name: 'Carlos', phone: '3004444444', vehicle: 'moto', plate: 'ABC12D', online: false });
  U('demo_d2', { role: 'domiciliario', name: 'Yesid', phone: '3005555555', vehicle: 'pie', online: false });
  U('demo_c1', { role: 'cliente', name: 'María', phone: '3006666666' });
  const S = (id, o) => s('stores', id, { ownerUid: id, approved: true, open: true, createdAt: now, ...o });
  S('demo_t1', { name: 'Tienda Doña Rosa', cat: 'tienda', phone: '3001111111', lat: 1.69660, lng: -78.24560, ref: 'Frente al parque', zoneId: 'centro', hours: '6am – 9pm' });
  S('demo_t2', { name: 'Droguería La Esperanza', cat: 'drogueria', phone: '3002222222', lat: 1.69710, lng: -78.24470, ref: 'Al lado de la iglesia', zoneId: 'centro', hours: '7am – 8pm' });
  S('demo_t3', { name: 'Asadero El Telembí', cat: 'restaurante', phone: '3003333333', lat: 1.69620, lng: -78.24420, ref: 'Bajando al muelle', zoneId: 'rio', hours: '11am – 10pm' });
}

// ---------- arranque ----------
async function boot() {
  try {
    ctx.db = CFG.firebase ? await createFirebaseDB(CFG.firebase) : createLocalDB(seed);
    await ctx.db.init();
  } catch (e) {
    console.error(e);
    $('#app').innerHTML = `<div class="pad"><h2>No se pudo conectar</h2><p class="note">${esc(e.message || e)}</p>
      <p class="note">Revisa la configuración de Firebase en config.js y que la autenticación anónima esté activada.</p>
      <button class="btn primary" onclick="location.reload()">Reintentar</button></div>`;
    return;
  }
  document.body.classList.toggle('demo', ctx.db.mode === 'demo');
  ctx.db.watchDoc('config', 'general', d => { ctx.settings = d || {}; });
  ctx.db.watch('zones', [], z => { ctx.zones = z.filter(x => x.active !== false).sort((a, b) => (a.order || 0) - (b.order || 0)); });
  window.addEventListener('hashchange', route);
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
  route();
}

let meUnsub = null;
async function route() {
  ctx.cleanup && ctx.cleanup(); ctx.cleanup = null;
  const root = $('#app');
  const m = location.hash.match(/^#\/seguir\/([\w-]+)/);
  if (m) { setHeader('Seguimiento'); ctx.cleanup = Seguir.mount(root, ctx, m[1]); return; }
  if (!ctx.db.uid) { if (ctx.db.mode === 'demo') return showWelcome(); await ctx.db.init(); }
  meUnsub && meUnsub();
  let first = true, lastKey = '';
  meUnsub = ctx.db.watchDoc('users', ctx.db.uid, me => {
    ctx.me = me;
    const key = me ? me.role + '|' + !!me.approved : 'none';
    if (!first && key === lastKey) return; // solo re-dibuja si cambia el rol o la aprobación
    first = false; lastKey = key;
    ctx.cleanup && ctx.cleanup(); ctx.cleanup = null;
    if (location.hash.startsWith('#/seguir/')) return;
    if (!me) return showWelcome();
    if (!me.approved) return showPending(me);
    const R = { cliente: Cliente, tendero: Tienda, domiciliario: Domi, admin: Admin }[me.role];
    if (!R) return showWelcome();
    setHeader(me.name, me.role);
    root.onclick = null; root.innerHTML = '';
    ctx.cleanup = R.mount(root, ctx);
  });
}

const ROLE_LABEL = { cliente: 'Cliente', tendero: 'Tienda', domiciliario: 'Domiciliario', admin: 'Admin' };
function setHeader(name, role) {
  $('#hdrRole').textContent = role ? ROLE_LABEL[role] : name || '';
  $('#hdrRole').classList.toggle('hidden', !role && !name);
}
$('#hdrMenu').onclick = () => profileMenu();
$('#hdrBrand').onclick = () => { if (location.hash) location.hash = ''; };

function profileMenu() {
  const me = ctx.me;
  const b = sheet(`<h2>${me ? esc(me.name) : 'MandaoYa'}</h2>
    ${me ? `<p class="note">${esc(ROLE_LABEL[me.role] || '')} · ${esc(me.phone || '')}</p>` : ''}
    ${me && me.role !== 'admin' ? '<button class="btn block" id="pmEdit">Editar mis datos</button>' : ''}
    ${ctx.db.mode === 'demo' ? '<button class="btn block" id="pmSwitch">Cambiar de usuario (demo)</button><button class="btn block danger" id="pmReset">Reiniciar datos de demo</button>' : ''}
    ${me ? '<button class="btn block danger" id="pmOut">Cerrar sesión / cambiar de rol</button>' : ''}
    <p class="note center">MandaoYa · ${ctx.db.mode === 'demo' ? 'Modo demo (datos solo en este teléfono)' : 'Conectado'}<br>
    ${ctx.db.mode === 'firebase' ? `ID: <code>${esc(ctx.db.uid)}</code>` : ''}</p>`);
  b.onclick = async e => {
    const id = e.target.id;
    if (id === 'pmEdit') { closeSheet(); editProfile(); }
    if (id === 'pmSwitch') { closeSheet(); meUnsub && meUnsub(); meUnsub = null; ctx.me = null; await ctx.db.signOut(); location.hash = ''; showWelcome(); }
    if (id === 'pmReset') { if (await ask('¿Reiniciar la demo?', 'Se borran todos los pedidos y usuarios de prueba.', 'Reiniciar', true)) { await ctx.db.resetDemo(); location.reload(); } }
    if (id === 'pmOut') {
      closeSheet();
      if (ctx.db.mode === 'firebase') {
        if (!(await ask('¿Salir?', 'En este teléfono se borrará tu cuenta actual y podrás registrarte con otro rol. Tus pedidos anteriores no se pierden para la tienda ni el administrador.', 'Salir', true))) return;
        await ctx.db.del('users', ctx.db.uid).catch(() => { });
        await ctx.db.signOut(); location.hash = ''; location.reload();
      } else { meUnsub && meUnsub(); meUnsub = null; ctx.me = null; await ctx.db.signOut(); location.hash = ''; showWelcome(); }
    }
  };
}

function editProfile() {
  const me = ctx.me;
  const b = sheet(`<h2>Mis datos</h2>
    <label class="f">Nombre</label><input class="in" id="eName" value="${esc(me.name)}">
    <label class="f">Celular / WhatsApp</label><input class="in" id="ePhone" type="tel" inputmode="tel" value="${esc(me.phone)}">
    ${me.role === 'domiciliario' ? `<label class="f">Vehículo</label><select class="in" id="eVeh">${Object.entries(VEHICLES).map(([k, v]) => `<option value="${k}" ${me.vehicle === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select>
      <label class="f">Placa (si tiene)</label><input class="in" id="ePlate" value="${esc(me.plate)}">` : ''}
    <div class="row actions"><button class="btn" id="eNo">Cancelar</button><button class="btn primary" id="eOk">Guardar</button></div>`);
  $('#eNo', b).onclick = closeSheet;
  $('#eOk', b).onclick = async () => {
    const p = { name: $('#eName').value.trim(), phone: $('#ePhone').value.trim() };
    if ($('#eVeh')) { p.vehicle = $('#eVeh').value; p.plate = $('#ePlate').value.trim().toUpperCase(); }
    if (!p.name || !p.phone) return toast('Nombre y celular son obligatorios');
    await ctx.db.update('users', ctx.db.uid, p); closeSheet(); toast('Datos guardados');
  };
}

// ---------- bienvenida y registro ----------
function showWelcome() {
  ctx.cleanup && ctx.cleanup(); ctx.cleanup = null;
  if (!ctx.db.uid || !ctx.me) { meUnsub && meUnsub(); meUnsub = null; }
  setHeader('');
  const demo = ctx.db.mode === 'demo';
  $('#app').innerHTML = `<div class="pad welcome">
    <div class="hero"><img src="icons/icon-192.png" alt=""><h1>MandaoYa</h1><p>Domicilios en ${esc(ctx.settings.town || 'Roberto Payán')}</p></div>
    <div class="roles">
      <button class="role" data-r="cliente"><span>🛍️</span><b>Quiero pedir</b><small>Pide a las tiendas del pueblo y sigue tu domicilio</small></button>
      <button class="role" data-r="tendero"><span>🏪</span><b>Tengo una tienda</b><small>Recibe pedidos y solicita domiciliarios</small></button>
      <button class="role" data-r="domiciliario"><span>🛵</span><b>Soy domiciliario</b><small>Acepta domicilios y gana por cada entrega</small></button>
      <button class="role small" data-r="admin"><span>⚙️</span><b>Administrador</b></button>
    </div>
    ${demo ? `<div class="demoBox"><h3>Modo demo</h3>
      <p class="note">Los datos viven solo en este teléfono. Abre varias pestañas de Safari con roles distintos para probar el flujo completo.</p>
      <div class="chips">${[['demo_c1', '🛍️ María (cliente)'], ['demo_t1', '🏪 Tienda Doña Rosa'], ['demo_t2', '🏪 Droguería'], ['demo_d1', '🛵 Carlos (moto)'], ['demo_d2', '🛵 Yesid (a pie)'], ['demo_admin', '⚙️ Admin']]
        .map(([u, l]) => `<button class="chip" data-u="${u}">${l}</button>`).join('')}</div></div>` : ''}
  </div>`;
  $('#app').onclick = async e => {
    const u = e.target.closest('[data-u]'); const r = e.target.closest('[data-r]');
    if (u) { $('#app').onclick = null; await ctx.db.useIdentity(u.dataset.u); route(); }
    if (r) { if (demo && !ctx.db.uid) await ctx.db.newIdentity(); register(r.dataset.r); }
  };
}

async function register(role) {
  $('#app').onclick = null;
  if (role === 'admin') return registerAdmin();
  const zoneOpts = ctx.zones.map(z => `<option value="${z.id}">${esc(z.name)}</option>`).join('');
  $('#app').innerHTML = `<div class="pad"><button class="link" id="rBack">‹ Volver</button>
    <h2>${{ cliente: 'Crear mi cuenta', tendero: 'Registrar mi tienda', domiciliario: 'Registro de domiciliario' }[role]}</h2>
    <label class="f">Tu nombre</label><input class="in" id="rName" autocomplete="name" placeholder="Nombre y apellido">
    <label class="f">Celular / WhatsApp</label><input class="in" id="rPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="3xx xxx xxxx">
    ${role === 'domiciliario' ? `<label class="f">¿En qué haces los domicilios?</label>
      <select class="in" id="rVeh">${Object.entries(VEHICLES).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('')}</select>
      <label class="f">Placa (si tiene)</label><input class="in" id="rPlate" placeholder="Opcional">` : ''}
    ${role === 'tendero' ? `<h3>Datos de la tienda</h3>
      <label class="f">Nombre de la tienda</label><input class="in" id="rStore" placeholder="Ej: Tienda Doña Rosa">
      <label class="f">Tipo</label><select class="in" id="rCat">${Object.entries(STORE_CATS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
      <label class="f">Teléfono de la tienda</label><input class="in" id="rSPhone" type="tel" inputmode="tel" placeholder="Si es el mismo, déjalo vacío">
      <label class="f">Sector</label><select class="in" id="rZone">${zoneOpts}</select>
      <label class="f">Referencia</label><input class="in" id="rRef" placeholder="Ej: frente al parque">
      <label class="f">Horario</label><input class="in" id="rHours" placeholder="Ej: 6am – 9pm">
      <label class="f">Ubicación en el mapa</label><button class="btn block" id="rLoc">📍 Marcar ubicación de la tienda</button>` : ''}
    <label class="check"><input type="checkbox" id="rOk"> Acepto el tratamiento de mis datos (nombre, celular y ubicación) para prestar el servicio de domicilios, según la Ley 1581 de 2012.</label>
    <button class="btn primary block" id="rSave">${role === 'cliente' ? 'Empezar a pedir' : 'Enviar registro'}</button>
    ${role !== 'cliente' ? '<p class="note">El administrador revisará tu registro antes de activarlo.</p>' : ''}
  </div>`;
  let loc = null;
  $('#rBack').onclick = () => showWelcome();
  if ($('#rLoc')) $('#rLoc').onclick = async () => { const l = await pickLocation('Ubicación de la tienda', loc); if (l) { loc = l; $('#rLoc').textContent = '✅ Ubicación marcada (cambiar)'; } };
  $('#rSave').onclick = async () => {
    const name = $('#rName').value.trim(), phone = $('#rPhone').value.trim();
    if (!name || phone.replace(/\D/g, '').length < 7) return toast('Escribe tu nombre y un celular válido');
    if (!$('#rOk').checked) return toast('Debes aceptar el tratamiento de datos');
    const user = { role, name, phone, approved: role === 'cliente', createdAt: Date.now() };
    if (role === 'domiciliario') Object.assign(user, { vehicle: $('#rVeh').value, plate: $('#rPlate').value.trim().toUpperCase(), online: false });
    if (role === 'tendero') {
      const sname = $('#rStore').value.trim();
      if (!sname) return toast('Escribe el nombre de la tienda');
      if (!loc) return toast('Marca la ubicación de la tienda en el mapa');
      await ctx.db.set('stores', ctx.db.uid, {
        ownerUid: ctx.db.uid, name: sname, cat: $('#rCat').value, phone: $('#rSPhone').value.trim() || phone,
        zoneId: $('#rZone').value, ref: $('#rRef').value.trim(), hours: $('#rHours').value.trim(),
        lat: loc.lat, lng: loc.lng, open: false, approved: false, createdAt: Date.now(),
      });
    }
    $('#rSave').disabled = true;
    try { await ctx.db.set('users', ctx.db.uid, user); route(); }
    catch (e) { $('#rSave').disabled = false; toast('No se pudo guardar: ' + (e.message || e)); }
  };
}

async function registerAdmin() {
  const isAdm = await ctx.db.isAdmin();
  if (isAdm || ctx.db.mode === 'demo') {
    if (ctx.db.mode === 'demo') await ctx.db.set('admins', ctx.db.uid, { since: Date.now() });
    await ctx.db.set('users', ctx.db.uid, { role: 'admin', name: 'Administrador', phone: '', approved: true, createdAt: Date.now() });
    route();
    return;
  }
  $('#app').innerHTML = `<div class="pad"><button class="link" id="rBack">‹ Volver</button><h2>Activar administrador</h2>
    <p class="note">Por seguridad, el primer administrador se crea desde la consola de Firebase:</p>
    <ol class="note"><li>Firestore › Iniciar colección <b>admins</b></li><li>ID del documento: <code class="sel">${esc(ctx.db.uid)}</code></li><li>Agrega un campo cualquiera (ej. <code>nombre</code>) y guarda.</li></ol>
    <button class="btn block" id="aCopy">Copiar mi ID</button>
    <button class="btn primary block" id="aCheck">Ya lo hice, verificar</button></div>`;
  $('#rBack').onclick = () => showWelcome();
  $('#aCopy').onclick = () => navigator.clipboard.writeText(ctx.db.uid).then(() => toast('ID copiado'));
  $('#aCheck').onclick = () => registerAdmin();
}

function showPending(me) {
  setHeader(me.name, me.role);
  const wa = ctx.settings.adminWhatsApp;
  $('#app').innerHTML = `<div class="pad center">
    <div class="bigicon">⏳</div><h2>Registro en revisión</h2>
    <p class="note">Hola ${esc(me.name)}. El administrador de MandaoYa debe aprobar tu cuenta de ${me.role === 'tendero' ? 'tienda' : 'domiciliario'}. Esta pantalla se actualiza sola cuando te aprueben.</p>
    ${wa ? `<a class="btn primary block" href="${waLink(wa, `Hola, me registré en MandaoYa como ${me.role} (${me.name}). ¿Me ayudan con la aprobación?`)}" target="_blank">Escribir al administrador</a>` : ''}
  </div>`;
}

boot();
