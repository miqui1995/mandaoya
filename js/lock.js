// MandaoYa — candado local (PIN + huella/Face ID) sobre la sesión ya iniciada.
// La sesión de Firebase queda guardada en el teléfono; este candado solo protege la
// APERTURA de la app. No gasta SMS: el PIN y la huella se verifican en el propio
// dispositivo, sin internet. El candado se vuelve a pedir al reabrir la app (no entre
// pantallas), y se quita solo con "cerrar sesión".
import { $, esc, toast, sheet, closeSheet, ask } from './ui.js';
import { isNative } from './native.js';

const K = { salt: 'mandaoya_lock_salt', hash: 'mandaoya_lock_hash', bio: 'mandaoya_lock_bio', fails: 'mandaoya_lock_fails' };
const SS = 'mandaoya_unlocked';

const g = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const s = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } };
const d = k => { try { localStorage.removeItem(k); } catch (e) { } };

export const hasPin = () => !!g(K.hash);
export const isUnlocked = () => { try { return sessionStorage.getItem(SS) === '1'; } catch (e) { return true; } };
const markUnlocked = () => { try { sessionStorage.setItem(SS, '1'); } catch (e) { } d(K.fails); };
export const lockNow = () => { try { sessionStorage.removeItem(SS); } catch (e) { } };
export const clearLock = () => { [K.salt, K.hash, K.bio, K.fails].forEach(d); lockNow(); };

async function sha(pin, salt) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pin));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
const randSalt = () => { const a = new Uint8Array(16); crypto.getRandomValues(a); return [...a].map(b => b.toString(16).padStart(2, '0')).join(''); };

async function setPin(pin) { const salt = randSalt(); s(K.salt, salt); s(K.hash, await sha(pin, salt)); }
async function checkPin(pin) { const salt = g(K.salt); return salt ? (await sha(pin, salt)) === g(K.hash) : false; }

// ---- Biometría nativa (huella / Face ID). Funciona solo si el plugin está en la app. ----
function bioPlugin() { try { return (isNative && window.Capacitor?.registerPlugin) ? window.Capacitor.registerPlugin('NativeBiometric') : null; } catch (e) { return null; } }
export async function bioAvailable() {
  const p = bioPlugin(); if (!p) return false;
  try { const r = await p.isAvailable(); return !!(r && r.isAvailable); } catch (e) { return false; }
}
export const bioEnabled = () => g(K.bio) === '1';
async function bioVerify() {
  const p = bioPlugin(); if (!p) return false;
  try { await p.verifyIdentity({ reason: 'Entra a MandaoYa', title: 'MandaoYa', subtitle: 'Confirma tu identidad', description: 'Usa tu huella o rostro' }); return true; }
  catch (e) { return false; }
}

// ---- Pantalla de candado (se muestra sobre #app al abrir la app) ----
export function showLock(onUnlocked, onForgot) {
  const root = $('#app'); root.onclick = null;
  const useBio = bioEnabled();
  root.innerHTML = `<div class="pad center lockscreen">
    <div class="bigicon">🔒</div>
    <h2>MandaoYa</h2>
    <p class="note">Ingresa tu PIN para entrar</p>
    <input class="in" id="lkPin" inputmode="numeric" autocomplete="off" maxlength="4"
      style="max-width:180px;letter-spacing:14px;text-align:center;font-size:26px" placeholder="····">
    <button class="btn primary block" id="lkGo" style="max-width:260px;margin-inline:auto">Entrar</button>
    ${useBio ? '<button class="btn block" id="lkBio" style="max-width:260px;margin-inline:auto">👆 Usar huella / Face ID</button>' : ''}
    <button class="link block" id="lkForgot">Olvidé mi PIN</button>
  </div>`;
  const pin = $('#lkPin');
  const tryBio = async () => { if (await bioVerify()) { markUnlocked(); onUnlocked(); } };
  const submit = async () => {
    const v = pin.value.replace(/\D/g, '');
    if (v.length < 4) return toast('Escribe tu PIN de 4 dígitos');
    if (await checkPin(v)) { markUnlocked(); return onUnlocked(); }
    const f = (+(g(K.fails) || 0)) + 1; s(K.fails, String(f));
    pin.value = '';
    if (f >= 5) { toast('Muchos intentos. Si no recuerdas tu PIN, usa "Olvidé mi PIN".', 6000); }
    else toast('PIN incorrecto');
  };
  $('#lkGo').onclick = submit;
  pin.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  pin.focus();
  if (useBio) { $('#lkBio').onclick = tryBio; bioAvailable().then(ok => { if (ok) tryBio(); }); }
  $('#lkForgot').onclick = () => onForgot && onForgot();
}

// ---- Crear / cambiar el PIN (y ofrecer huella) ----
// Devuelve una promesa: true si quedó configurado, false si lo dejó para después.
export function setupPin({ force } = {}) {
  return new Promise(resolve => {
    const b = sheet(`<h2>Protege tu cuenta</h2>
      <p class="note">Crea un PIN de 4 dígitos. Te lo pedirá al abrir la app, para que nadie más entre a tu cuenta. No gasta SMS.</p>
      <label class="f">PIN nuevo</label>
      <input class="in" id="spA" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="4 dígitos" style="letter-spacing:10px;text-align:center">
      <label class="f">Repite el PIN</label>
      <input class="in" id="spB" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="4 dígitos" style="letter-spacing:10px;text-align:center">
      <button class="btn primary block" id="spOk">Guardar PIN</button>
      ${force ? '' : '<button class="link block" id="spSkip">Ahora no</button>'}`);
    const done = v => { closeSheet(); resolve(v); };
    if (!force) $('#spSkip', b).onclick = () => done(false);
    $('#spOk', b).onclick = async () => {
      const a = $('#spA', b).value.replace(/\D/g, ''), c = $('#spB', b).value.replace(/\D/g, '');
      if (a.length < 4) return toast('El PIN debe tener 4 dígitos');
      if (a !== c) return toast('Los dos PIN no coinciden');
      await setPin(a); markUnlocked();
      // Ofrecer huella/Face ID si el dispositivo lo soporta
      if (await bioAvailable()) {
        if (await ask('¿Usar huella o Face ID?', 'Podrás abrir la app con tu huella o tu rostro, sin escribir el PIN cada vez.', 'Sí, activar', false)) {
          if (await bioVerify()) { s(K.bio, '1'); toast('Huella / Face ID activada'); }
          else toast('No se activó la huella; puedes intentarlo luego en Seguridad');
        }
      }
      toast('PIN guardado');
      done(true);
    };
  });
}

// ---- Menú de seguridad (desde el perfil) ----
export function securityMenu() {
  const bio = bioEnabled();
  const b = sheet(`<h2>Seguridad</h2>
    <p class="note">Candado para abrir la app. Es local: no gasta SMS.</p>
    <button class="btn block" id="seChange">${hasPin() ? 'Cambiar PIN' : 'Crear PIN'}</button>
    <button class="btn block" id="seBio">${bio ? '✅ Huella / Face ID activada (tocar para desactivar)' : '👆 Activar huella / Face ID'}</button>
    ${hasPin() ? '<button class="btn block danger" id="seOff">Quitar el candado</button>' : ''}`);
  $('#seChange', b).onclick = async () => { closeSheet(); await setupPin({ force: true }); };
  $('#seBio', b).onclick = async () => {
    if (bio) { d(K.bio); closeSheet(); toast('Huella / Face ID desactivada'); return; }
    if (!hasPin()) { closeSheet(); return toast('Primero crea un PIN'); }
    if (!(await bioAvailable())) { closeSheet(); return toast('Este dispositivo no tiene huella/Face ID disponible en la app'); }
    if (await bioVerify()) { s(K.bio, '1'); closeSheet(); toast('Huella / Face ID activada'); }
    else toast('No se pudo activar');
  };
  if (hasPin()) $('#seOff', b).onclick = async () => {
    if (await ask('¿Quitar el candado?', 'La app se abrirá sin pedir PIN ni huella. Cualquiera que tome el teléfono podrá entrar a tu cuenta.', 'Quitar', true)) { clearLock(); closeSheet(); toast('Candado quitado'); }
  };
}
