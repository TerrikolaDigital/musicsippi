/**
 * Shell de Electron para Musicsippi.
 *
 * No reimplementa el backend: levanta el mismo servidor de Vite que ya usa
 * `npm run dev` (createServer(), la API programática de Vite — pensada
 * justo para esto) con el `vite.config.js` real del proyecto, plugin
 * `apiLocal` incluido. La ventana de Electron solo apunta a esa URL local,
 * como un navegador con chrome propio en vez de pestaña.
 *
 * EL DATO CLAVE que casi se pasa por alto: src/App.jsx importa
 * `../data/ejes.json` y `../data/biblioteca.json` de forma ESTÁTICA (son el
 * estado inicial de React, no solo un fallback — ver `useState(ejesIniciales.ejes)`).
 * Eso significa que NO alcanza con que el backend (`/api/*`, vía
 * resolverDataDir) escriba en la carpeta de usuario del SO: el frontend
 * siempre va a leer literalmente `<raíz de Vite>/data/*.json`, sin importar
 * ninguna variable de entorno. Si `data/` no está en el paquete, la app ni
 * arranca (probado: rompe con "Failed to resolve import"); si está pero el
 * backend escribe en otro lado, quedan desincronizados para siempre.
 *
 * La solución: en el primer arranque de la app EMPAQUETADA, se copia
 * `data/` semilla (de solo LECTURA, dentro de la carpeta de instalación) a
 * la carpeta de usuario, y el import estático se redirige ahí vía un alias
 * de Vite (`resolve.alias`) — nunca se toca ni se escribe nada dentro de la
 * carpeta de instalación, ni siquiera una vez. Es a propósito: un intento
 * anterior de esto reemplazaba `data/` por una junction de NTFS, pero eso
 * exige poder BORRAR y CREAR dentro de la carpeta de instalación — que es
 * exactamente lo que un usuario sin privilegios de administrador no puede
 * hacer en "Archivos de programa" (el problema entero que se quería
 * resolver). Copiar hacia AFUERA (leer de instalación, escribir en
 * %APPDATA%) no tiene ese problema: leer de "Archivos de programa" sí está
 * permitido para cualquier usuario, solo escribir ahí no. En modo
 * desarrollo (`electron .` sin empaquetar) nada de esto corre — sigue
 * leyendo `data/` del proyecto tal cual, como hasta ahora.
 */
const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

// Sin esto, Electron deriva el nombre de la app (y por lo tanto la carpeta
// de %APPDATA%) del campo "name" de package.json ("music-app-personal", el
// nombre técnico del paquete npm) en vez de la marca real. Tiene que llamarse
// ANTES de cualquier app.getPath('userData').
app.setName('Musicsippi');

// Devuelve la carpeta de datos de usuario, sembrándola desde `data/` de la
// instalación la primera vez que hace falta. Nunca escribe dentro de la
// carpeta de instalación — ver el comentario de arriba.
function prepararDatosDeUsuario() {
  const dataDirProyecto = path.join(__dirname, '..', 'data');
  const dataDirUsuario = path.join(app.getPath('userData'), 'data');

  if (!fs.existsSync(dataDirUsuario)) {
    console.log('[musicsippi] primer arranque: sembrando datos en', dataDirUsuario);
    fs.mkdirSync(dataDirUsuario, { recursive: true });
    for (const archivo of fs.readdirSync(dataDirProyecto)) {
      fs.cpSync(path.join(dataDirProyecto, archivo), path.join(dataDirUsuario, archivo), { recursive: true });
    }
    contarInstalacionNueva();
  }

  process.env.MUSICSIPPI_DATA_DIR = dataDirUsuario;
  return dataDirUsuario;
}

// Únicos dos nombres que el código realmente lee hoy vía env.YOUTUBE_API_KEY
// y env.GENIUS_ACCESS_TOKEN en vite.config.js (confirmado por grep, no de
// memoria) — ambas requieren cuenta propia (Google Cloud con cuota / cliente
// en genius.com), así que la app tiene que andar sin ellas para cualquiera
// que la instale (ya lo hace: YouTube resuelve lazy por track, Genius se
// auto-omite sin token, ver enriquecer-genius-core.mjs). Ojo: .env.local del
// checkout de git trae además SPOTIFY_CLIENT_ID/SECRET, LASTFM_API_KEY y
// OPENAI_API_KEY/MODEL — ninguna de esas cuatro aparece en ningún .mjs/.js
// real del proyecto (Spotify usa el embed público sin clave, OpenAI ya se
// sacó del código en su momento) — son variables muertas de ese archivo, no
// algo que la app necesite. No copiarlas de ahí sin volver a confirmar con
// grep si en algún momento se reintroduce alguna.
const CLAVES_OPCIONALES = ['YOUTUBE_API_KEY', 'GENIUS_ACCESS_TOKEN'];

/**
 * Lee claves de API desde `.env.local` en la carpeta de usuario del SO (NUNCA
 * dentro de la instalación) y las vuelca a `process.env` antes de levantar el
 * servidor de Vite — mismo momento y mismo mecanismo que `MUSICSIPPI_DATA_DIR`
 * más arriba. Si el archivo no existe (primer arranque empaquetado), se crea
 * una plantilla vacía con instrucciones, para que la persona sepa que existe y
 * dónde completarla — nunca se pisa una plantilla ya completada.
 */
function cargarClavesDeUsuario() {
  // MUSICBRAINZ_CONTACT no es una credencial secreta ni pide cuenta — es un
  // identificador que su API pide por política (para poder avisar en caso de
  // abuso), no algo que haya que "crear". Va con un valor por defecto acá para
  // que la clasificación automática (el motor de género principal, MusicBrainz
  // + Deezer, éste último sin clave alguna) funcione para CUALQUIERA que
  // instale la app, sin que nadie tenga que registrarse en nada — pedido
  // explícito: una persona común no va a crear una cuenta de API para poder
  // usar la app. Si en `.env.local` se completa uno propio, gana ese (se lee
  // más abajo, después de este default).
  process.env.MUSICBRAINZ_CONTACT ||= 'https://github.com/musicsippi-app (contacto de proyecto, uso personal)';

  const rutaEnv = path.join(app.getPath('userData'), '.env.local');

  if (!fs.existsSync(rutaEnv)) {
    const plantilla =
      '# Claves de API OPCIONALES de Musicsippi — la clasificación automática\n' +
      '# (MusicBrainz + Deezer) ya funciona sin tocar nada acá. Esto es solo para:\n' +
      '#   YOUTUBE_API_KEY: resolver videoId por track en vez de buscarlo cada vez\n' +
      '#   (necesita una API key de Google Cloud con cuota).\n' +
      '#   GENIUS_ACCESS_TOKEN: guardar el id/URL de la página de cada track en\n' +
      '#   Genius, para uso futuro (no se muestra en la UI todavía; se consigue en\n' +
      '#   https://genius.com/api-clients, "Client Access Token").\n' +
      '# Dejalas vacías si no las tenés: la app sigue andando igual, sin romper nada.\n' +
      CLAVES_OPCIONALES.map((clave) => `${clave}=`).join('\n') +
      '\n';
    fs.writeFileSync(rutaEnv, plantilla, 'utf8');
    console.log('[musicsippi] plantilla de claves opcionales creada en', rutaEnv);
    return;
  }

  const contenido = fs.readFileSync(rutaEnv, 'utf8');
  for (const linea of contenido.split(/\r?\n/)) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith('#')) continue;
    const idx = limpia.indexOf('=');
    if (idx === -1) continue;
    const clave = limpia.slice(0, idx).trim();
    const valor = limpia.slice(idx + 1).trim();
    if ((clave === 'MUSICBRAINZ_CONTACT' || CLAVES_OPCIONALES.includes(clave)) && valor) process.env[clave] = valor;
  }
}

// Contador anónimo de instalaciones — nada de quién, nada de dónde, un solo
// número. Un GET a un contador público gratuito (abacus.jasoncameron.dev,
// sin cuenta ni clave), disparado UNA vez por instalación (mismo gate que
// el sembrado de datos: solo corre la primera vez que se detecta que
// dataDirUsuario no existe). Fire-and-forget a propósito: si no hay
// internet o el servicio está caído, no debe romper ni frenar el arranque
// de la app — es lo de menos comparado con que la app funcione.
function contarInstalacionNueva() {
  fetch('https://abacus.jasoncameron.dev/hit/musicsippi/instalaciones', { signal: AbortSignal.timeout(20000) })
    .then((r) => r.json())
    .then((j) => console.log('[musicsippi] contador de instalaciones:', j))
    .catch((e) => console.log('[musicsippi] fallo el contador (no crítico):', e.message));
}

// Sin esto, en máquinas/entornos sin aceleración gráfica real (sesiones
// remotas, VMs, algunos drivers) el proceso de GPU de Chromium se cae y
// reinicia en loop — la ventana puede tardar en aparecer o no renderizar
// bien. Deshabilitar la GPU acá es la salida estándar de Electron para
// ese caso; no afecta en una máquina de escritorio normal más que en
// perder aceleración por hardware (esta app es texto/imágenes, no
// necesita GPU para nada).
app.disableHardwareAcceleration();

let viteServer;
let ventana;

async function iniciarServidorVite(dataDirUsuario) {
  // Import dinámico: 'vite' es ESM-only, y este archivo corre en CommonJS
  // (más simple para el proceso principal de Electron, sin tocar el resto
  // del proyecto que sí es "type": "module").
  const { createServer } = await import('vite');

  const raiz = path.join(__dirname, '..');

  // NO se usa `configFile` acá — se importa vite.config.js directo (Node
  // ya sabe cargar ESM nativo, sin que Vite tenga que compilarlo). Motivo:
  // `configFile` hace que Vite escriba un archivo temporal en
  // `node_modules/.vite-temp` DENTRO de la carpeta de instalación para
  // poder cargarlo — probado en carpeta protegida (sin permiso de
  // escritura, como "Archivos de programa"): revienta con
  // EPERM/mkdir '.vite-temp' antes de llegar siquiera a arrancar el
  // servidor. Importándolo nosotros mismos, ese paso desaparece.
  const configModule = await import(`file://${raiz.replace(/\\/g, '/')}/vite.config.js`);
  const configFn = configModule.default;
  const configBase = typeof configFn === 'function' ? await configFn({ mode: 'development', command: 'serve' }) : configFn;

  // cacheDir por defecto es `<raíz>/node_modules/.vite` — mismo problema
  // que arriba (necesita escribir ahí para el pre-bundling de deps). En
  // empaquetado se manda a una carpeta de usuario escribible; en dev se
  // deja el default de Vite (no vale la pena tocarlo, ya funciona).
  const cacheDir = dataDirUsuario
    ? path.join(path.dirname(dataDirUsuario), 'vite-cache')
    : undefined;

  // El backend (/api/*, vía resolverDataDir) ya resuelve MUSICSIPPI_DATA_DIR
  // solo. Pero src/App.jsx importa `../data/ejes.json` y `../data/biblioteca.json`
  // de forma ESTÁTICA (es el estado inicial de React, no un fallback) — eso
  // NO pasa por resolverDataDir en absoluto, así que sin este alias el
  // frontend seguiría leyendo la copia de solo lectura de la instalación
  // para siempre, ignorando cualquier cambio guardado en %APPDATA%.
  // Nombres exactos (no regex): confirmado que son las ÚNICAS dos
  // apariciones de este patrón en todo src/.
  const server = await createServer({
    ...configBase,
    // false, no ausente: sin esto Vite igual sale a buscar y cargar
    // vite.config.js por su cuenta (auto-discovery), aunque ya le pasemos
    // la config resuelta a mano arriba — y ese auto-discovery es
    // justamente el que escribe en node_modules/.vite-temp y revienta en
    // una carpeta protegida.
    configFile: false,
    root: raiz,
    cacheDir,
    // port: 0 = puerto libre cualquiera. Fijar 5173 acá pisaría una
    // instancia de `npm run dev` que ya estuviera corriendo en la máquina
    // (uso normal durante desarrollo) en vez de convivir con ella.
    server: { ...configBase.server, port: 0, strictPort: false },
    resolve: dataDirUsuario
      ? {
          ...configBase.resolve,
          alias: [
            ...(configBase.resolve?.alias ?? []),
            // Regex y no texto exacto: src/escritorio/ los importa como ../../data/…
            { find: /^(?:\.\.\/)+data\/ejes\.json$/, replacement: path.join(dataDirUsuario, 'ejes.json') },
            { find: /^(?:\.\.\/)+data\/biblioteca\.json$/, replacement: path.join(dataDirUsuario, 'biblioteca.json') },
          ],
        }
      : configBase.resolve,
  });
  await server.listen();
  return server;
}

function crearVentana(url) {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 860,
    minHeight: 600,
    title: 'Musicsippi',
    icon: path.join(__dirname, '..', 'public', 'musicsippi-app-icon-512.png'),
    backgroundColor: '#0D0F16',
    autoHideMenuBar: true,
    // Sin esto, Windows dibuja su barra de título por defecto (gris claro,
    // tema del sistema) encima del contenido oscuro de la app — se ve como
    // una franja/pestaña aparte pegada arriba. 'hidden' + titleBarOverlay
    // mantiene los botones nativos de minimizar/maximizar/cerrar (no hay que
    // reimplementarlos) pero pintados sobre el mismo fondo oscuro de la app.
    // Solo tiene efecto en Windows/Linux; en mac no hace nada (se ignora).
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0D0F16',
      symbolColor: '#e8e8f0',
      height: 32,
    },
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // Expone window.musicsippi.getPathForFile — ver electron/preload.cjs.
      // Necesario para "Cargar música local" (CargarMusicaLocal, App.jsx):
      // File.path ya no existe en esta versión de Electron.
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });
  win.loadURL(url);
  return win;
}

/**
 * Reproductor miniatura: una ventanita sin marco, siempre encima, que
 * aparece al minimizar la app y desaparece al volver.
 *
 * No reproduce nada: el audio sigue sonando en la ventana grande (en
 * escritorio minimizar no la pausa, a diferencia de bloquear un móvil). Esto
 * es un control remoto — muestra qué suena y manda play/pausa, anterior y
 * siguiente. Por eso se crea una sola vez y se oculta en vez de destruirse:
 * recrearla en cada minimizado costaría cargar la página cada vez para algo
 * que se abre y se cierra seguido.
 *
 * `skipTaskbar` para que no aparezca como una segunda app en la barra de
 * tareas, y `show: false` porque arranca escondida.
 */
function crearMiniatura(url) {
  const mini = new BrowserWindow({
    width: 380,
    height: 78,
    show: false,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    // NO `transparent: true`. Se probó ese camino primero (dos rondas: sacar
    // `backgroundColor`, después `hasShadow: false`) y en las capturas de
    // ESTA sesión se veía arreglado — pero seguía mal en la pantalla real
    // del usuario. La causa de fondo, encontrada recién: `app.disableHardwareAcceleration()`
    // corre para TODA la app (ver más arriba, es deliberado — estabilidad en
    // sesiones remotas/VMs). Sin GPU, Chromium no puede componer
    // transparencia real con lo que hay detrás de la ventana: pinta esas
    // zonas como negro sólido pase lo que pase en el CSS. Perseguir
    // `transparent: true` en esta app es perseguir algo que la propia
    // configuración ya impide.
    //
    // La alternativa que SÍ es independiente de la GPU: `roundedCorners`
    // recorta la ventana a nivel de sistema operativo (DWM, en Windows 11),
    // no a nivel de Chromium — no le importa si el contenido de adentro se
    // renderizó por software o por GPU, porque DWM compone TODAS las
    // ventanas del sistema y siempre usa aceleración propia para eso. La
    // ventana queda opaca (un color sólido de verdad, sin alpha) y
    // simplemente más chica que su rectángulo, con las cuatro esquinas
    // recortadas — el escritorio se ve ahí porque la ventana literalmente no
    // ocupa ese pixel, no por transparencia.
    //
    // Solo Windows 11. En Windows 10 esto no hace nada (Electron lo ignora
    // en silencio) y la ventana queda cuadrada — aceptable, es el mismo
    // fallback que ya se había anotado como plan B.
    roundedCorners: true,
    backgroundColor: '#12132a', // mismo valor que --fondo en mini.html
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });
  mini.loadURL(`${url}/mini.html`);
  return mini;
}

/**
 * Conecta las dos ventanas. El estado que publica la principal se guarda acá
 * porque la miniatura puede estar oculta (o todavía cargando) cuando llega:
 * sin recordarlo, al minimizar aparecería en blanco hasta el siguiente
 * cambio de canción.
 */
function conectarMiniatura(ventanaPrincipal, mini) {
  let ultimoEstado = null;

  ipcMain.on('mini:estado', (_evento, estado) => {
    ultimoEstado = estado;
    if (!mini.isDestroyed()) mini.webContents.send('mini:estado', estado);
  });

  ipcMain.on('mini:comando', (_evento, comando) => {
    if (!ventanaPrincipal.isDestroyed()) ventanaPrincipal.webContents.send('mini:comando', comando);
  });

  ipcMain.on('mini:restaurar', () => {
    if (ventanaPrincipal.isDestroyed()) return;
    ventanaPrincipal.restore();
    ventanaPrincipal.focus();
  });

  ventanaPrincipal.on('minimize', () => {
    // Sin nada sonando la miniatura no tiene nada que mostrar ni que
    // controlar: minimizar y que aparezca una barra vacía flotando sería
    // ruido, no una función.
    if (!ultimoEstado?.hayTrack || mini.isDestroyed()) return;
    mini.webContents.send('mini:estado', ultimoEstado);
    mini.showInactive();
  });
  const esconder = () => {
    if (!mini.isDestroyed()) mini.hide();
  };
  ventanaPrincipal.on('restore', esconder);
  ventanaPrincipal.on('focus', esconder);
  // Si se cierra la app con la miniatura abierta, esa ventana suelta impediría
  // que Electron dispare 'window-all-closed' y el proceso quedaría vivo sin
  // ninguna ventana visible.
  ventanaPrincipal.on('closed', () => {
    if (!mini.isDestroyed()) mini.destroy();
  });
}

// Instancia única: sin esto, abrir la app una segunda vez (doble clic en el
// acceso directo mientras ya está corriendo, o arrancarla dos veces por
// error) levanta un SEGUNDO proceso de Electron completo, con su propio
// servidor de Vite, su propia ventana principal y su propia miniatura —
// verificado en pantalla: dos barras miniatura apiladas, cada una con su
// propia cola y su propio estado de reproducción, sin ninguna relación
// entre sí. `requestSingleInstanceLock` hace que el segundo lanzamiento no
// llegue a crear nada: se cierra solo, y en cambio el PRIMERO recibe el
// evento 'second-instance' y lleva su ventana ya existente al frente.
const tieneElLock = app.requestSingleInstanceLock();
if (!tieneElLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!ventana || ventana.isDestroyed()) return;
    if (ventana.isMinimized()) ventana.restore();
    ventana.show();
    ventana.focus();
  });

  app.whenReady().then(async () => {
    console.log('[musicsippi] app ready, iniciando servidor Vite...');
    // Sin menú de aplicación (Archivo/Editar/Ver...) — la app tiene su propia
    // navegación completa, ese menú por defecto de Electron no aporta nada acá
    // y rompe el look de "app propia" que se buscaba con Electron.
    Menu.setApplicationMenu(null);

    try {
      const dataDirUsuario = app.isPackaged ? prepararDatosDeUsuario() : null;
      if (app.isPackaged) cargarClavesDeUsuario();
      viteServer = await iniciarServidorVite(dataDirUsuario);
      const direccion = viteServer.httpServer.address();
      const url = `http://localhost:${direccion.port}`;
      console.log('[musicsippi] servidor Vite listo en', url);

      ventana = crearVentana(url);
      conectarMiniatura(ventana, crearMiniatura(url));

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          ventana = crearVentana(url);
          conectarMiniatura(ventana, crearMiniatura(url));
        }
      });
    } catch (e) {
      console.error('[musicsippi] fallo al iniciar:', e);
    }
  });
}

const esperar = (ms) => new Promise((res) => setTimeout(res, ms));

app.on('window-all-closed', async () => {
  if (viteServer) {
    // vite.config.js abre dos conexiones SSE de larga duración
    // (/api/canal-reproduccion, /api/canal-enriquecimiento) SIN res.end() a
    // propósito — quedan vivas hasta que la pestaña se cierra. http.Server#close()
    // (lo que hace ViteDevServer#close() por debajo) espera a que TODAS las
    // conexiones activas terminen antes de resolver: con cualquiera de esas
    // dos abierta, esa promesa nunca se resuelve. Confirmado en vivo, en
    // varias corridas de esta sesión: cerrar la ventana dejaba el proceso
    // Musicsippi.exe vivo de fondo, sin ninguna ventana, para siempre — y
    // esos zombies después bloqueaban el instalador de una actualización.
    // closeAllConnections() corta esos sockets a la fuerza antes de cerrar:
    // ya no queda nada por lo que esperar.
    viteServer.httpServer?.closeAllConnections();
    try {
      // Por si algo más (un watcher, un plugin) igual tarda en cerrar: un
      // timeout de respaldo para que salir de la app nunca dependa de que
      // el cierre de Vite termine prolijo. Preferible un server de Vite que
      // no llegó a cerrar del todo a un proceso zombie sin ventana.
      await Promise.race([viteServer.close(), esperar(2000)]);
    } catch (e) {
      console.error('[musicsippi] fallo al cerrar el servidor Vite:', e);
    }
  }
  if (process.platform !== 'darwin') app.quit();
});
