# MandaoYa: domicilios para Roberto Payán

PWA con 4 interfaces en una sola app:

- **Cliente**: pide a una tienda o pide un "mandado", marca su casa en el mapa, elige cómo paga y sigue el pedido en vivo (estado, mapa, tiempo estimado, datos del domiciliario y código de entrega).
- **Tienda**: abre o cierra la tienda, recibe pedidos con alerta sonora, confirma el valor, pide domiciliario, crea domicilios de pedidos que le llegan por teléfono o WhatsApp, envía el enlace de seguimiento por WhatsApp y ve el cuadre del día.
- **Domiciliario**: se pone en línea, recibe alertas, acepta domicilios (gana el primero que acepta), ve la ruta y cuánto cobrar y de cuánto llevar cambio, comparte su GPS, entrega con el código del cliente y lleva su caja del día.
- **Administrador**: mapa en vivo, aprobación de tiendas y domiciliarios, cancelar o reasignar pedidos, tarifas por sector, comisión y reportes con descarga CSV.

## 1. Probar ya (modo demo)

Con `config.js` como viene (`firebase: null`) la app funciona en **modo demo**: los datos quedan solo en ese teléfono y aparece la etiqueta DEMO.

1. Sube **el contenido** de esta carpeta a un repositorio nuevo, por ejemplo `miqui1995/mandaoya`. Luego ve a *Settings › Pages*, elige *Deploy from a branch*, rama `main` y carpeta `/ (root)`.
2. Abre `https://miqui1995.github.io/mandaoya/` en Safari.
3. Abre 3 pestañas: en una entra como **María (cliente)**, en otra como **Tienda Doña Rosa** y en otra como **Carlos (moto)**. Haz un pedido y míralo pasar por las tres. Para cambiar de usuario, usa ☰ › *Cambiar de usuario (demo)*.

## 2. Modo real con Firebase (gratis para empezar)

1. Entra a **console.firebase.google.com**, toca *Agregar proyecto*, ponle de nombre `mandaoya` y desactiva Analytics si quieres.
2. Activa el inicio de sesión: *Authentication › Comenzar › Método de acceso › **Anónimo** › Habilitar*.
3. Autoriza tu dominio: *Authentication › Configuración › Dominios autorizados*, agrega `miqui1995.github.io`.
4. Crea la base de datos: *Firestore Database › Crear base de datos*. Elige ubicación `southamerica-east1` (São Paulo, la más cercana) y modo producción.
5. Publica las reglas: en *Firestore › Reglas* pega todo el contenido de `firestore.rules` y toca **Publicar**.
6. Registra la app web: *Configuración del proyecto (engranaje) › Tus apps › Web (</>)*, con el nombre `MandaoYa`. Copia el objeto `firebaseConfig`.
7. Pega esos datos en `config.js`, en el campo `firebase: { ... }`, y súbelo al repositorio.
8. **Crea tu administrador:**
   1. Abre la app y toca *Administrador*. Te muestra tu ID; cópialo.
   2. En *Firestore › Iniciar colección*, crea la colección `admins` con ese ID como ID del documento. Agrega un campo cualquiera, por ejemplo `nombre: Miguel`.
   3. Vuelve a la app y toca *Ya lo hice, verificar*.
9. **Configura**: en *Tarifas* crea los sectores reales del pueblo con su precio, tu WhatsApp de soporte y la comisión.
10. Comparte el enlace con tenderos y domiciliarios. Cuando se registren, los apruebas en *Aprobar*. Antes, verifica en persona su cédula y su vehículo.

**Costos:** el plan gratuito *Spark* de Firebase incluye 50.000 lecturas y 20.000 escrituras al día. Alcanza para un pueblo en arranque (cientos de pedidos al día). Configura una alerta de presupuesto si luego pasas al plan *Blaze*.

Si una consulta pide un índice, la consola del navegador muestra un enlace de Firebase que lo crea con un clic.

## 3. Instalar en el teléfono

- **iPhone:** abre en Safari, toca Compartir y luego "Agregar a inicio".
- **Android:** abre en Chrome, toca el menú y luego "Instalar app".

Siempre abre la app desde el ícono.

## 4. Cómo funciona el flujo

```
Cliente pide ─► SOLICITADO ─(tienda confirma valor)─► PREPARANDO ─(tienda pide domiciliario)─► BUSCANDO
Mandado del cliente / domicilio creado por la tienda ─────────────────────────────────────────► BUSCANDO
BUSCANDO ─(un domiciliario acepta)─► ASIGNADO ─(recoge)─► EN CAMINO ─(código del cliente)─► ENTREGADO
```

- **Tarifa:** según el sector que elige el cliente. Se configura en *Tarifas*.
- **Tiempo estimado:** distancia entre domiciliario, tienda y cliente, por 1,4 para aproximar las calles, según la velocidad del vehículo (moto 18 km/h, a pie 4,5 km/h, etc.).
- **Código de 4 dígitos:** el cliente lo ve en su seguimiento y se lo dice al domiciliario al recibir. Si el cliente pidió por teléfono y no tiene el enlace, el domiciliario puede marcar "entregado sin código" y queda registrado.
- **Caja:** el domiciliario ve cuánto efectivo recibió, cuánto debe entregar a cada tienda y cuánto le queda. La tienda ve cuánto le debe cada domiciliario.

## 5. Limitaciones de esta versión

- **Alertas:** suenan solo con la app abierta. Las notificaciones push con la app cerrada requieren Firebase Cloud Functions (plan Blaze). Es la siguiente fase.
- **Cuentas:** son anónimas y quedan atadas al teléfono. Si se borra la app o los datos de Safari, toca registrarse de nuevo. Más adelante se puede pasar a verificación por SMS o WhatsApp.
- **Pagos:** Nequi y Daviplata son manuales (el cliente muestra el comprobante). No hay pasarela de pagos.
- **Mapa:** las rutas son en línea recta hasta el destino, porque no hay un mapa de calles confiable para calcular rutas. Cuando completes el mapa del pueblo en OpenStreetMap con MapaPayán, se puede agregar un ruteo real.
- **Enlace de seguimiento:** quien tenga el enlace ve el pedido y el código. Compártelo solo con el cliente.

## Archivos

| Archivo | Qué es |
|---|---|
| `config.js` | **El único que debes editar**: datos de Firebase y centro del mapa |
| `firestore.rules` | Reglas de seguridad para pegar en la consola |
| `js/app.js` | Arranque, registro y enrutador |
| `js/cliente.js`, `tienda.js`, `domi.js`, `admin.js`, `seguir.js` | Una pantalla por rol |
| `js/db.js` | Capa de datos (demo local o Firestore) |
| `js/ui.js` | Utilidades, mapa, cálculos de tiempo y precios |

Versión 1 · MIQUITEC SAS
