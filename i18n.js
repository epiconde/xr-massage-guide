// Idioma de la app: español (original) o inglés.
// Se elige con ?lang=en / ?lang=es en la dirección, o con el botón del Menú; si no, según el idioma del navegador.
// Los textos del programa se escriben en español en app.js y pasan por tr(); los de las rutinas y las partes del cuerpo
// se traducen al cargar con i18n/en_datos.json.
let elegido = null;
try { elegido = new URLSearchParams(location.search).get('lang') || localStorage.getItem('masaje_idioma'); } catch (e) {}
export const idioma = ['es', 'en'].includes(elegido) ? elegido : ((navigator.language || 'en').toLowerCase().startsWith('es') ? 'es' : 'en');
export function cambiarIdioma() {
  try { localStorage.setItem('masaje_idioma', idioma === 'es' ? 'en' : 'es'); } catch (e) {}
  const u = new URL(location.href); u.searchParams.delete('lang'); location.href = u.href;
}

const UI = {
  'Guía de masaje XR': 'XR Massage Guide', 'Guía de masaje': 'Massage Guide',
  'Entrar en 3D': 'Enter 3D', 'Reiniciar dibujo': 'Reset drawing', 'Cargando…': 'Loading…',
  'Vista previa en el PC: arrastra las asas del dibujo con el mouse. Tecla A = Ajustar / Listo.': 'PC preview: drag the drawing handles with the mouse. A key = Adjust / Done.',
  'Listo. Toca "Entrar en 3D".': 'Ready. Tap "Enter 3D".',
  '◐ Opaco': '◐ Solid', '◐ Medio': '◐ Medium', '◐ Tenue': '◐ Faint',
  '¿Cuánto tiempo?': 'How long?', '▶ Empezar': '▶ Start',
  '¡Rutina terminada!': 'Routine finished!', 'Menú': 'Menu',
  '✚ Elegir otro masaje o duración': '✚ Choose another massage or length',
  '↻ Repetir este masaje desde el inicio': '↻ Repeat this massage from the start',
  '🔊 Voz: sí (tocar para apagar)': '🔊 Voice: on (tap to turn off)', '🔇 Voz: no (tocar para prender)': '🔇 Voice: off (tap to turn on)',
  '✕ Salir de 3D': '✕ Exit 3D',
  '🌐 Idioma: español (tocar para cambiar a inglés)': '🌐 Language: English (tap to switch to Spanish)',
  'Ajustar el dibujo': 'Adjust the drawing',
  'Centro azul: agárralo para mover (también sube y baja)': 'Blue center: grab it to move (also up and down)',
  'Esquinas blancas: más grande o más chico': 'White corners: bigger or smaller',
  'Aro verde: girar': 'Green ring: rotate',
  'Pellizca cerca de un asa, o apúntale con el rayo y pellizca/gatillo.': 'Pinch near a handle, or point at it with the ray and pinch.',
  'No se ve el cuarto: activa el passthrough del Quest y vuelve a entrar.': "Can't see the room: turn on Quest passthrough and enter again.",
  'Para volver aquí durante el masaje: botón X o Y, o mira tu palma izquierda.': 'To come back here during the massage: look at your left palm.',
  '✓ Listo': '✓ Done', '▲ Subir': '▲ Up', '▼ Bajar': '▼ Down', '⇋ Voltear': '⇋ Flip', '↺ Reiniciar': '↺ Reset', '☰ Menú': '☰ Menu',
  'Presión:': 'Pressure:', 'Suave': 'Light', 'Media': 'Medium', 'Firme': 'Firm',
  'Último paso': 'Last step', 'En pausa': 'Paused', '❚❚ Pausa': '❚❚ Pause', '▶ Iniciar': '▶ Start',
  '✋ Manos': '✋ Hands', '⟲ Ajustar': '⟲ Adjust',
  'con la palma': 'with the palm', 'con el puño': 'with the fist', 'con el pulgar': 'with the thumb', 'con el canto de la mano': 'with the edge of the hand',
  'canto, mano abierta': 'edge of the open hand', 'con la mano ahuecada': 'with a cupped hand', 'con la mano en C': 'with a C-shaped hand',
  'con las yemas': 'with the fingertips', 'con los nudillos': 'with the knuckles', 'con pulgar e índice': 'with thumb and index finger',
  'manchas de calor': 'heat glow', 'músculos': 'muscles', 'cuadros': 'boxes',
  'Mover': 'Move', 'Girar': 'Rotate',
  'Rutina terminada. Muy bien.': 'Routine finished. Well done.',
};
const REGLAS = [
  [/^Paso (\d+) de (\d+) · (.*)$/, (m, a, b, c) => `Step ${a} of ${b} · ${tr(c)}`],
  [/^Sigue: (.*) \((.*)\)$/, (m, a, b) => `Next: ${a} (${b})`],
  [/^↻ Repetir en (.*)$/, (m, a) => `↻ Repeat on ${a}`],
  [/^▶ Continuar \(paso (\d+): (.*)\)$/, (m, a, b) => `▶ Continue (step ${a}: ${b})`],
  [/^⟲ Ajustar el dibujo \((.*)\)$/, (m, a) => `⟲ Adjust the drawing (${a})`],
  [/^◍ Zonas: (.*) \(tocar para cambiar\)$/, (m, a) => `◍ Zones: ${tr(a)} (tap to change)`],
  [/^✋ Mano guía: (.*) \(tocar para cambiar\)$/, (m, a) => `✋ Guide hand: ${a} (tap to change)`],
  [/^Ponlo encima de (.*)$/, (m, a) => `Place it over ${a}`],
  [/^Acomoda el dibujo sobre (.*) y toca Listo\.$/, (m, a) => `Place the drawing over ${a} and tap Done.`],
  [/^No se pudo iniciar: (.*)$/, (m, a) => `Could not start: ${a}`],
  [/^No se pudo cargar rutinas\.json: (.*)$/, (m, a) => `Could not load rutinas.json: ${a}`],
];
let DATOS = {};
// texto en español -> texto en el idioma de la app
export function tr(s) {
  if (idioma === 'es' || typeof s !== 'string') return s;
  if (UI[s] !== undefined) return UI[s];
  if (DATOS[s] !== undefined) return DATOS[s];
  for (const [re, f] of REGLAS) if (re.test(s)) return s.replace(re, f);
  return s;
}
export const vozIdioma = () => idioma === 'en' ? 'en-US' : 'es-MX';

// carga las traducciones de rutinas y partes (solo en inglés)
export async function cargarIdioma() {
  if (idioma === 'es') return;
  try { DATOS = await (await fetch('./i18n/en_datos.json')).json(); } catch (e) { console.warn('Sin traducción de las rutinas', e); }
}
const CAMPOS = ['nombre', 'descripcion', 'tecnica', 'instruccion', 'etiqueta', 'sobre', 'otroLado'];
// traduce en su lugar los textos de un objeto de datos (rutinas.json, PARTES…)
export function traducirDatos(o) {
  if (idioma === 'es' || !o || typeof o !== 'object') return o;
  if (Array.isArray(o)) { o.forEach((x, i) => { if (typeof x === 'object') traducirDatos(x); }); return o; }
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === 'string') { if (CAMPOS.includes(k)) o[k] = tr(v); }
    else if (k === 'ayuda' && Array.isArray(v)) o[k] = v.map(tr);
    else if (v && typeof v === 'object') traducirDatos(v);
  }
  return o;
}
// los textos fijos de la página (fuera del 3D)
export function traducirPagina() {
  if (idioma === 'es') return;
  document.documentElement.lang = 'en';
  document.title = tr(document.title);
  for (const sel of ['#ui h1', '#btnAR', '#btnDemo', '#estado']) { const e = document.querySelector(sel); if (e) e.textContent = tr(e.textContent.trim()); }
  const a = document.getElementById('aviso');
  if (a) {
    const url = document.getElementById('url')?.textContent || '';
    a.innerHTML = `<h2>This is the PC preview, not the 3D view</h2>
  To see it in 3D, open this page <b>inside the headset</b>, not in the PC browser:
  <ol>
    <li>If you are using Link or Air Link, leave it (go back to the normal Quest menu).</li>
    <li>In the Quest bar open the <b>Browser</b> app.</li>
    <li>Go to: <code id="url"></code></li>
    <li>Tap the blue <b>Enter 3D</b> button and accept the permission.</li>
  </ol>
  Tip: bookmark it in the Quest browser so you don't have to type it again.`;
    document.getElementById('url').textContent = url;
  }
}
