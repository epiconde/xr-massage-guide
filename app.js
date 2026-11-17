// Guía de masaje en realidad mixta (WebXR, Meta Quest 3).
// Flujo: colocar un dibujo de espalda sobre la persona (mover, girar, escalar, ajustar vértices)
//        -> rutina con zonas, movimientos animados y temporizador.
// Atajos para volver a Ajustar: botón X/Y del control izquierdo, o mirar la palma izquierda.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { POSES, fraccion, poseDelPaso } from './manos_poses.js';
import { PARTES } from './cuerpo.js';
import { crearPantallaGuia } from './pantalla_guia.js';
import { idioma, tr, vozIdioma, cargarIdioma, traducirDatos, traducirPagina, cambiarIdioma } from './i18n.js';
traducirPagina();

// ---------- Anatomía ----------
// Cada parte del cuerpo (espalda, brazo, pierna, mano, pie) está descrita en cuerpo.js.
// u: -1 borde izquierdo, 0 centro, +1 borde derecho.  v: sube a lo largo de la parte (ver cuerpo.js).
let parte = PARTES[0];
let ZONAS, CONTORNO, VERTICES, NOMBRE_VERTICE, FORMA_BASE;
function tomarParte(p) {
  parte = p;
  ZONAS = p.zonas; CONTORNO = p.contorno; FORMA_BASE = p.formaBase;
  VERTICES = p.secciones.flatMap(sec => [sec.id + 'I', sec.id + 'D']);
  NOMBRE_VERTICE = Object.fromEntries(p.secciones.map(sec => [sec.id + 'I', sec.nombre]));
}
tomarParte(parte);
const ALTURA = 0.012;  // separación sobre la piel (m)
const RADIO_AGARRE = 0.05;

// ---------- Escena ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const FONDO = new THREE.Color(0x10141c);
scene.background = FONDO;
scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2.2));
{ const luz = new THREE.DirectionalLight(0xffffff, 1.4); luz.position.set(0.5, 3, 1); scene.add(luz); } // relieve de la mano 3D

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 50);
camera.position.set(0.9, 1.55, 0.55);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.76, -0.05);
controls.update();
window.app = { camera, controls, renderer }; // para depurar desde la consola

// Maniquí de prueba (solo en el PC): camilla y una espalda boca abajo, cabeza hacia -z.
const maniqui = new THREE.Group();
const camilla = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 1.9), new THREE.MeshStandardMaterial({ color: 0x3a4250 }));
camilla.position.set(0, 0.35, 0.2);
const matPiel = new THREE.MeshStandardMaterial({ color: 0xd9a989 });
const cuerpoPrueba = new THREE.Group();
maniqui.add(camilla, cuerpoPrueba);
scene.add(maniqui);
// la parte del cuerpo que se está masajeando, hecha con formas sencillas (en los lentes se ve a la persona de verdad)
function actualizarManiqui() {
  for (const h of [...cuerpoPrueba.children]) { cuerpoPrueba.remove(h); h.geometry.dispose(); }
  const capsula = (r, largo, ancho, alto, x, y, z) => {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, largo, 8, 24), matPiel);
    m.rotation.x = Math.PI / 2; m.scale.set(ancho, 1, alto); m.position.set(x, y, z); cuerpoPrueba.add(m); return m;
  };
  if (parte.id === 'espalda') {
    capsula(0.2, 0.32, 1.15, 0.42, 0, 0.77, -0.05);
    const cabeza = new THREE.Mesh(new THREE.SphereGeometry(0.1, 24, 16), matPiel); cabeza.position.set(0, 0.78, -0.47); cuerpoPrueba.add(cabeza);
  } else if (parte.id === 'brazo') capsula(0.048, 0.5, 1, 0.9, 0, 0.795, -0.05);
  else if (parte.id === 'pierna') capsula(0.075, 0.72, 1, 0.9, 0, 0.77, -0.05);
  else if (parte.id === 'mano') capsula(0.045, 0.12, 1, 0.35, 0, 0.83, -0.05);
  else capsula(0.048, 0.16, 1, 0.6, 0, 0.815, -0.05);
}
actualizarManiqui();

// ---------- El dibujo de la espalda ----------
// plantilla: posición y giro en el mundo.  lienzo: plano acostado (x lateral, y hacia la cabeza, z hacia arriba).
const plantilla = new THREE.Group(); scene.add(plantilla);
const lienzo = new THREE.Group(); lienzo.rotation.x = -Math.PI / 2; plantilla.add(lienzo);
const capaFigura = new THREE.Group(), capaZonas = new THREE.Group(), capaMov = new THREE.Group(), capaAsas = new THREE.Group();
lienzo.add(capaFigura, capaZonas, capaMov, capaAsas);

let forma = {}, volteado = false; // volteado: el dibujo en espejo (pulgar o dedo gordo del otro lado)
const claveForma = () => parte.id === 'espalda' ? 'masaje_forma' : 'masaje_forma_' + parte.id;
function ponerForma(f) { forma = {}; for (const id of VERTICES) forma[id] = new THREE.Vector2(...f[id]); }
function guardarForma() {
  try {
    localStorage.setItem(claveForma(), JSON.stringify(Object.fromEntries(VERTICES.map(id => [id, forma[id].toArray()]))));
    localStorage.setItem('masaje_volteado_' + parte.id, volteado ? '1' : '');
  } catch (e) {}
}
function cargarForma() {
  try { volteado = !!localStorage.getItem('masaje_volteado_' + parte.id); } catch (e) { volteado = false; }
  try { const f = JSON.parse(localStorage.getItem(claveForma())); if (f && VERTICES.every(id => Array.isArray(f[id]))) { ponerForma(f); return; } } catch (e) {}
  ponerForma(FORMA_BASE);
}
cargarForma();

// bordes izquierdo y derecho del cuerpo a la altura v (entre secciones se interpola; más allá se continúa)
function bordes(v) {
  const S = parte.secciones, n = S.length;
  const L = k => forma[S[k].id + 'I'], R = k => forma[S[k].id + 'D'];
  if (v > S[n - 1].v) {
    // más allá de la última sección: mismo ancho, sigue derecho
    const a = n - 2, b = n - 1;
    const k = ((L(b).y + R(b).y) / 2 - (L(a).y + R(a).y) / 2) / (S[b].v - S[a].v);
    const eje = new THREE.Vector2(-(R(b).y - L(b).y), R(b).x - L(b).x).normalize();
    const d = (v - S[b].v) * Math.max(0.2, k);
    return [L(b).clone().addScaledVector(eje, d), R(b).clone().addScaledVector(eje, d)];
  }
  let a = 0; while (a < n - 2 && v > S[a + 1].v) a++;
  const t = (v - S[a].v) / (S[a + 1].v - S[a].v);
  return [L(a).clone().lerp(L(a + 1), t), R(a).clone().lerp(R(a + 1), t)];
}
// (u, v) del cuerpo -> punto en el lienzo (metros)
function W(u, v, h = ALTURA) {
  const [L, R] = bordes(v), s = ((volteado ? -u : u) + 1) / 2;
  return new THREE.Vector3(L.x + (R.x - L.x) * s, L.y + (R.y - L.y) * s, h);
}

// ---------- Estado ----------
let rutina = null;
let datos = null;              // contenido de rutinas.json (tipos de masaje y duraciones)
let colocado = {};             // parte -> dónde quedó su dibujo en esta sesión (si ya se acomodó)
const tipoPorParte = {};       // el masaje elegido en cada parte
const tipos = () => datos.modulos[estado.parte].tipos;
const estado = { modo: 'elegir', parte: 0, tipo: 0, largo: 'mediano', paso: 0, transcurrido: 0, corriendo: false, voz: true, terminado: false, enCurso: false, volverCorriendo: false,
  nivelTransp: 0, sinPassthrough: false };
// Transparencia de lo que se dibuja sobre la persona (zonas, dibujo, movimientos) y del panel
const NIVELES_TRANSP = [1, 0.55, 0.25];
try { const n = +localStorage.getItem('masaje_transp'); if (n >= 0 && n < NIVELES_TRANSP.length) estado.nivelTransp = n; } catch (e) {}
const kTransp = () => NIVELES_TRANSP[estado.nivelTransp];
const textoTransp = () => ['◐ Opaco', '◐ Medio', '◐ Tenue'][estado.nivelTransp];
function aplicarTranspPanel() {
  const k = kTransp();
  panel.material.opacity = Math.max(0.45, k);
}
// Antes de dibujar cada cuadro se multiplica la opacidad; después se restaura (las animaciones la cambian cada cuadro)
const capasTransp = [capaFigura, capaZonas, capaMov];
function aplicarTransp() {
  const k = kTransp(); if (k === 1) return;
  for (const capa of capasTransp) capa.traverse(o => {
    const m = o.material; if (!m || !m.transparent || m.userData.base !== undefined) return;
    m.userData.base = m.opacity; m.opacity *= k;
  });
}
function restaurarTransp() {
  for (const capa of capasTransp) capa.traverse(o => {
    const m = o.material; if (m && m.userData.base !== undefined) { m.opacity = m.userData.base; delete m.userData.base; }
  });
}
let zonaMallas = {};
let animador = null;
let contornoPts = [];
let agarre = null;      // asa que se está arrastrando
let asaHover = null;    // asa resaltada

// ---------- Utilidades de dibujo ----------
function redondo(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function envolver(g, texto, x, y, ancho, alto) {
  const palabras = tr(texto).split(' '); let linea = '';
  for (const p of palabras) {
    const prueba = linea ? linea + ' ' + p : p;
    if (g.measureText(prueba).width > ancho && linea) { g.fillText(linea, x, y); linea = p; y += alto; }
    else linea = prueba;
  }
  if (linea) g.fillText(linea, x, y);
  return y;
}
// cuántos renglones ocupa un texto con la letra actual
function renglones(g, texto, ancho) {
  let n = 1, linea = '';
  for (const p of texto.split(' ')) {
    const prueba = linea ? linea + ' ' + p : p;
    if (g.measureText(prueba).width > ancho && linea) { n++; linea = p; } else linea = prueba;
  }
  return n;
}
// las letras se ven nítidas aunque el letrero esté inclinado o lejos
function texturaTexto(lienzoTexto) {
  const tex = new THREE.CanvasTexture(lienzoTexto); tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}
function etiqueta(texto, color = '#ffffff', ancho = 0.16) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(8,11,18,0.88)'; redondo(g, 0, 0, 512, 96, 30); g.fill();
  g.strokeStyle = color; g.lineWidth = 4; redondo(g, 3, 3, 506, 90, 28); g.stroke();
  g.fillStyle = color; g.font = 'bold 48px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(tr(texto), 256, 50, 480);
  const tex = texturaTexto(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(ancho, ancho * 96 / 512),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false }));
  m.renderOrder = 10;
  return m;
}
const mmss = s => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// Botones: normal / puntero encima / recién pulsado
const ultimoToque = {};
let hoverId = null;
function colorBoton(id, primario) {
  if (ultimoToque[id] !== undefined && performance.now() - ultimoToque[id] < 250) return '#8db0ff';
  if (hoverId === id) return primario ? '#5b8fff' : '#46577a';
  return primario ? '#2f6fed' : '#2a3242';
}
function dibujarBoton(g, id, texto, x, y, w, h, primario, tamFuente = 32, alinear = 'center') {
  g.fillStyle = colorBoton(id, primario); redondo(g, x, y, w, h, 18); g.fill();
  if (hoverId === id) { g.strokeStyle = '#ffffff'; g.lineWidth = 5; redondo(g, x + 2.5, y + 2.5, w - 5, h - 5, 16); g.stroke(); }
  g.fillStyle = '#fff'; g.font = `600 ${tamFuente}px system-ui`; g.textAlign = alinear; g.textBaseline = 'middle';
  g.fillText(texto, alinear === 'center' ? x + w / 2 : x + 34, y + h / 2 + 2, w - 30);
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
}

// ---------- Panel flotante ----------
const panelCanvas = document.createElement('canvas'); panelCanvas.width = 1024; panelCanvas.height = 640;
const pg = panelCanvas.getContext('2d');
{ const escribir = pg.fillText.bind(pg); pg.fillText = (texto, ...resto) => escribir(tr(texto), ...resto); } // textos en el idioma de la app
const panelTex = texturaTexto(panelCanvas);
const PANEL_W = 0.5, PANEL_H = PANEL_W * 640 / 1024;
const panel = new THREE.Mesh(new THREE.PlaneGeometry(PANEL_W, PANEL_H),
  new THREE.MeshBasicMaterial({ map: panelTex, transparent: true, depthTest: false }));
panel.renderOrder = 20;
scene.add(panel);
// pantallita con el maniquí y las manos (arriba a la derecha del panel)
const guia = crearPantallaGuia({ renderer, scene, lienzo, capaMov, ocultar: [capaFigura, capaZonas, capaAsas], panel, anchoPanel: PANEL_W, altoPanel: PANEL_H });
let botones = [];

function leyenda(g, y, color, texto) {
  g.fillStyle = color; g.beginPath(); g.arc(68, y - 11, 13, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#dfe6f2'; g.font = '30px system-ui'; g.fillText(texto, 96, y, 880);
}
function dibujarPanel() {
  const g = pg; g.clearRect(0, 0, 1024, 640);
  g.fillStyle = 'rgba(14,19,30,0.9)'; redondo(g, 0, 0, 1024, 640, 40); g.fill();
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  botones = [];

  if (estado.modo === 'elegir' && datos) {
    // partes del cuerpo (módulos)
    const wp = (924 - 10 * (PARTES.length - 1)) / PARTES.length;
    PARTES.forEach((p, k) => {
      const x = 50 + k * (wp + 10), sel = k === estado.parte;
      dibujarBoton(g, 'parte_' + k, p.nombre, x, 22, wp, 62, sel, 30);
      botones.push({ id: 'parte_' + k, x, y: 22, w: wp, h: 62 });
    });
    // masajes de esa parte, en 2 columnas
    const colW = 452, h = 70, sep = 10, lista = tipos();
    lista.forEach((t, k) => {
      const x = 50 + (k % 2) * (colW + 20), y = 100 + Math.floor(k / 2) * (h + sep);
      const sel = k === estado.tipo;
      dibujarBoton(g, 'tipo_' + k, (sel ? '✓ ' : '') + t.nombre, x, y, colW, h, sel, 31, 'left');
      botones.push({ id: 'tipo_' + k, x, y, w: colW, h });
    });
    g.fillStyle = '#dfe6f2'; g.font = '28px system-ui';
    envolver(g, lista[estado.tipo].descripcion, 50, 376, 924, 34);
    g.fillStyle = '#8fb4ff'; g.font = '600 28px system-ui'; g.fillText('¿Cuánto tiempo?', 50, 472);
    const fila = datos.duraciones.map(d => ['largo_' + d.id, `${estado.largo === d.id ? '✓ ' : ''}${d.nombre} · ${minutos(estado.tipo, d.id)} min`]);
    fila.push(['empezar', '▶ Empezar']);
    const y = 490, hh = 100, w = (924 - 12 * 3) / 4;
    fila.forEach(([id, texto], k) => {
      const x = 50 + k * (w + 12);
      const sel = id === 'largo_' + estado.largo;
      dibujarBoton(g, id, texto, x, y, w, hh, id === 'empezar' || sel, 26);
      botones.push({ id, x, y, w, h: hh });
    });
  } else if (estado.modo === 'menu') {
    g.fillStyle = '#8fb4ff'; g.font = '600 32px system-ui';
    g.fillText(estado.terminado ? '¡Rutina terminada!' : 'Menú', 50, 70);
    g.fillStyle = '#fff'; g.font = 'bold 54px system-ui';
    g.fillText(rutina ? rutina.nombre : 'Guía de masaje', 50, 135, 924);
    const ops = [];
    if (estado.terminado && parte.otroLado) ops.push(['otrolado', `↻ Repetir en ${parte.otroLado}`]);
    if (estado.enCurso) ops.push(['continuar', `▶ Continuar (paso ${estado.paso + 1}: ${rutina.pasos[estado.paso].nombre})`]);
    ops.push(['elegir', '✚ Elegir otro masaje o duración']);
    ops.push(['repetir', '↻ Repetir este masaje desde el inicio']);
    ops.push(['ajustar', `⟲ Ajustar el dibujo (${parte.nombre.toLowerCase()})`]);
    ops.push(['zonas', `◍ Zonas: ${NOMBRE_ESTILO[estiloZonas]} (tocar para cambiar)`]);
    ops.push(['voz', estado.voz ? '🔊 Voz: sí (tocar para apagar)' : '🔇 Voz: no (tocar para prender)']);
    if (Object.keys(MODELOS_MANO).length > 1) ops.push(['mano', `✋ Mano guía: ${MODELOS_MANO[modeloMano]} (tocar para cambiar)`]);
    ops.push(['idioma', '🌐 Idioma: español (tocar para cambiar a inglés)']);
    if (renderer.xr.isPresenting) ops.push(['salir', '✕ Salir de 3D']);
    const paso_ = Math.min(76, 470 / ops.length), alto = paso_ - 10;
    ops.forEach(([id, t], k) => {
      const y = 160 + k * paso_;
      dibujarBoton(g, id, t, 50, y, 924, alto, k === 0, alto < 60 ? 27 : 31, 'left');
      botones.push({ id, x: 50, y, w: 924, h: alto });
    });
  } else if (estado.modo === 'ajustar') {
    g.fillStyle = '#8fb4ff'; g.font = '600 32px system-ui'; g.fillText('Ajustar el dibujo', 50, 66);
    g.fillStyle = '#fff'; g.font = 'bold 44px system-ui'; g.fillText('Ponlo encima de ' + parte.sobre, 50, 124, 924);
    leyenda(g, 195, '#3f8cff', 'Centro azul: agárralo para mover (también sube y baja)');
    leyenda(g, 250, '#ffffff', 'Esquinas blancas: más grande o más chico');
    leyenda(g, 305, '#ffe066', parte.ayuda[0]);
    leyenda(g, 360, '#46e08a', 'Aro verde: girar');
    g.fillStyle = '#c5cfdf'; g.font = '27px system-ui';
    g.fillText('Pellizca cerca de un asa, o apúntale con el rayo y pellizca/gatillo.', 50, 420, 924);
    g.fillText(parte.ayuda[1], 50, 455, 924);
    if (estado.sinPassthrough) { g.fillStyle = '#ff8a8a'; g.font = '600 26px system-ui'; g.fillText('No se ve el cuarto: activa el passthrough del Quest y vuelve a entrar.', 50, 492, 924); }
    else g.fillText('Para volver aquí durante el masaje: botón X o Y, o mira tu palma izquierda.', 50, 492, 924);
    filaBotones([['listo', '✓ Listo'], ['subir', '▲ Subir'], ['bajar', '▼ Bajar'], ...(parte.voltear ? [['voltear', '⇋ Voltear']] : []),
      ['restablecer', '↺ Reiniciar'], ['transp', textoTransp()], ['menu', '☰ Menú']], 'listo');
  } else if (rutina) {
    const paso = rutina.pasos[estado.paso];
    const resta = paso.duracion - estado.transcurrido;
    g.fillStyle = '#8fb4ff'; g.font = '600 30px system-ui';
    g.fillText(`Paso ${estado.paso + 1} de ${rutina.pasos.length} · ${paso.tecnica}`, 50, 66);
    g.fillStyle = '#fff'; g.font = 'bold 52px system-ui'; g.fillText(paso.nombre, 50, 128, 640);
    g.font = 'bold 106px system-ui'; g.textAlign = 'right';
    g.fillStyle = estado.corriendo ? '#7dffb2' : '#ffd36b';
    g.fillText(mmss(resta), 974, 132);
    g.textAlign = 'left';
    g.fillStyle = '#2a3242'; redondo(g, 50, 158, 924, 16, 8); g.fill();
    g.fillStyle = '#7dffb2'; redondo(g, 50, 158, Math.max(16, 924 * Math.min(1, estado.transcurrido / paso.duracion)), 16, 8); g.fill();
    // medidor de presión (el mismo color que los movimientos y la mano guía)
    const pr = presionDe(paso);
    g.fillStyle = '#c5cfdf'; g.font = '600 28px system-ui'; g.fillText('Presión:', 50, 222);
    for (let k = 0; k < 3; k++) {
      g.fillStyle = k < pr.nivel ? pr.css : '#2a3242';
      redondo(g, 172 + k * 66, 198, 56, 30, 10); g.fill();
    }
    g.fillStyle = pr.css; g.font = 'bold 32px system-ui'; g.fillText(pr.nombre, 384, 224);
    g.fillStyle = '#c5cfdf'; g.font = '28px system-ui';
    g.fillText(CON_MANO[poseDelPaso(paso.movimiento, tipoManoDe(paso))] || 'con la palma', 500, 223, 474);
    // la instrucción, lo más grande que quepa en 4 renglones
    g.fillStyle = '#eef2f8';
    let tam = 38;
    for (; tam > 28; tam -= 2) { g.font = `${tam}px system-ui`; if (renglones(g, paso.instruccion, 924) <= 4) break; }
    g.font = `${tam}px system-ui`;
    envolver(g, paso.instruccion, 50, 276, 924, Math.round(tam * 1.22));
    const sig = rutina.pasos[estado.paso + 1];
    g.fillStyle = '#a9b5c9'; g.font = '28px system-ui';
    g.fillText(sig ? `Sigue: ${sig.nombre} (${mmss(sig.duracion)})` : 'Último paso', 50, 506, 700);
    if (!estado.corriendo) { g.fillStyle = '#ffd36b'; g.font = '600 28px system-ui'; g.textAlign = 'right'; g.fillText('En pausa', 974, 506); g.textAlign = 'left'; }
    filaBotones([['anterior', '◀'], ['pausa', estado.corriendo ? '❚❚ Pausa' : '▶ Iniciar'], ['siguiente', '▶▶'],
      ['manos', '✋ Manos'], ['transp', textoTransp()], ['ajustar', '⟲ Ajustar'], ['menu', '☰ Menú']], 'pausa');
  }
  panelTex.needsUpdate = true;
}
function filaBotones(lista, primario = null) {
  const y = 532, h = 84, sep = 12, w = (924 - sep * (lista.length - 1)) / lista.length;
  lista.forEach(([id, texto], k) => {
    const x = 50 + k * (w + sep);
    dibujarBoton(pg, id, texto, x, y, w, h, id === primario, lista.length > 6 ? 26 : lista.length > 4 ? 28 : 32);
    botones.push({ id, x, y, w, h });
  });
}
function botonEnUV(uv) {
  const px = uv.x * 1024, py = (1 - uv.y) * 640;
  return botones.find(b => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h)?.id ?? null;
}
const REPETIBLES = { subir: 180, bajar: 180 }; // se repiten si mantienes el dedo
function pulsar(id) {
  if (!id) return false;
  const ahora = performance.now();
  if (ahora - (ultimoToque[id] || 0) < (REPETIBLES[id] || 700)) return true; // antirrebote
  ultimoToque[id] = ahora;
  accion(id);
  return true;
}
function ponerHover(id) {
  if (id === hoverId) return;
  hoverId = id; dibujarPanel(); dibujarMuneca();
}

function accion(id) {
  sonido(660, 0.05);
  if (id.startsWith('parte_')) { cambiarParte(+id.slice(6)); guardarEleccion(); dibujarPanel(); return; }
  if (id.startsWith('tipo_')) { estado.tipo = tipoPorParte[parte.id] = +id.slice(5); guardarEleccion(); dibujarPanel(); return; }
  if (id.startsWith('largo_')) { estado.largo = id.slice(6); guardarEleccion(); dibujarPanel(); return; }
  switch (id) {
    case 'elegir': irAElegir(); return;
    case 'empezar': empezar(); return;
    case 'menu': case 'm_menu': irAMenu(); return;
    case 'ajustar': entrarAjuste(); return;
    case 'm_ajustar': alternarAjuste(); dibujarMuneca(); return;
    case 'listo': salirAjuste(); return;
    case 'subir': plantilla.position.y += 0.01; return;
    case 'bajar': plantilla.position.y -= 0.01; return;
    case 'restablecer': volteado = false; ponerForma(FORMA_BASE); guardarForma(); colocarPlantillaInicial(); actualizarFigura(); return;
    case 'voltear': volteado = !volteado; guardarForma(); actualizarFigura(); return;
    case 'otrolado': // el otro brazo / pierna / mano / pie: se vuelve a acomodar el dibujo y el masaje empieza de nuevo
      if (parte.voltear) { volteado = !volteado; guardarForma(); }
      estado.enCurso = false; estado.terminado = false; irAPaso(0); actualizarFigura(); entrarAjuste();
      hablar(`Acomoda el dibujo sobre ${parte.otroLado} y toca Listo.`);
      dibujarPanel(); return;
    case 'continuar': mostrarRutina(); estado.corriendo = true; break;
    case 'repetir': irAPaso(0); mostrarRutina(); estado.corriendo = true; anunciar(); break;
    case 'salir': renderer.xr.getSession()?.end(); return;
    case 'idioma': cambiarIdioma(); return; // vuelve a cargar la página en el otro idioma
    case 'pausa':
      estado.corriendo = !estado.corriendo;
      if (estado.corriendo) { reverManos(); if (estado.transcurrido < 0.5) anunciar(); } // al reanudar, las manos vuelven a enseñar el movimiento
      break;
    case 'anterior': irAPaso(Math.max(0, estado.paso - 1)); if (estado.corriendo) anunciar(); break;
    case 'siguiente': if (estado.paso < rutina.pasos.length - 1) { irAPaso(estado.paso + 1); if (estado.corriendo) anunciar(); } break;
    case 'voz': estado.voz = !estado.voz; if (!estado.voz) window.speechSynthesis?.cancel(); break;
    case 'mano': cambiarModeloMano(); break;
    case 'zonas':
      estiloZonas = ESTILOS_ZONA[(ESTILOS_ZONA.indexOf(estiloZonas) + 1) % ESTILOS_ZONA.length];
      try { localStorage.setItem('masaje_zonas', estiloZonas); } catch (e) {}
      construirZonas();
      break;
    case 'manos': reverManos(); break;
    case 'transp':
      estado.nivelTransp = (estado.nivelTransp + 1) % NIVELES_TRANSP.length;
      try { localStorage.setItem('masaje_transp', estado.nivelTransp); } catch (e) {}
      aplicarTranspPanel();
      break;
  }
  dibujarPanel();
}

// ---------- Modos ----------
function irAMenu() {
  if (estado.modo === 'rutina') estado.volverCorriendo = false;
  estado.modo = 'menu'; estado.corriendo = false; agarre = null;
  window.speechSynthesis?.cancel();
  plantilla.visible = false;
  colocarPanelFrente();
}
function mostrarRutina() {
  estado.modo = 'rutina'; estado.terminado = false; estado.enCurso = true; agarre = null;
  plantilla.visible = true; capaAsas.visible = false;
  colocarPanelEspalda(); dibujarPanel();
}
function entrarAjuste() {
  if (estado.modo === 'rutina') estado.volverCorriendo = estado.corriendo;
  estado.corriendo = false; estado.modo = 'ajustar';
  plantilla.visible = true; capaAsas.visible = true;
  colocarPanelLado();
  sonido(520, 0.08);
}
function salirAjuste() {
  agarre = null; guardarForma(); guardarColocacion();
  const nueva = !estado.enCurso;
  if (nueva) { estado.paso = 0; estado.transcurrido = 0; tAnim = 0; }
  estado.modo = 'rutina';
  actualizarFigura(); // con la forma final: zonas, manos y movimientos
  mostrarRutina();
  if (nueva) { estado.corriendo = true; anunciar(); } // el masaje arranca solo
  else if (estado.volverCorriendo) estado.corriendo = true;
  estado.volverCorriendo = false;
  dibujarPanel();
}
// ---------- Elegir tipo de masaje y duración ----------
const redondear15 = s => Math.max(30, Math.round(s / 15) * 15);
function factorDe(largo) { return datos.duraciones.find(d => d.id === largo)?.factor ?? 1; }
function minutos(tipo, largo) {
  const f = factorDe(largo);
  return Math.round(tipos()[tipo].pasos.reduce((a, p) => a + redondear15(p.duracion * f), 0) / 60);
}
function armarRutina() {
  const t = tipos()[estado.tipo], d = datos.duraciones.find(x => x.id === estado.largo);
  rutina = { nombre: `${parte.nombre} · ${t.nombre} · ${d.nombre}`, pasos: t.pasos.map(p => ({ ...p, duracion: redondear15(p.duracion * d.factor) })) };
}
function guardarEleccion() { try { localStorage.setItem('masaje_eleccion', JSON.stringify({ parte: parte.id, tipos: tipoPorParte, largo: estado.largo })); } catch (e) {} }
// cambiar de parte del cuerpo: su dibujo, sus zonas y sus masajes
function guardarColocacion() { colocado[parte.id] = { pos: plantilla.position.clone(), rot: plantilla.rotation.y }; }
function cambiarParte(k) {
  if (!PARTES[k] || !datos.modulos[k].tipos.length) return;
  estado.parte = k; tomarParte(PARTES[k]); cargarForma(); rehacerAsasVertice(); actualizarManiqui();
  estado.tipo = Math.min(tipoPorParte[parte.id] ?? 0, tipos().length - 1);
  estado.enCurso = false; estado.terminado = false;
  const ya = colocado[parte.id];
  if (ya) { plantilla.position.copy(ya.pos); plantilla.rotation.set(0, ya.rot, 0); } else colocarPlantillaInicial();
  armarRutina(); estado.paso = 0; estado.transcurrido = 0;
  actualizarFigura(); rehacerAnimador();
}
function cargarEleccion() {
  try {
    const e = JSON.parse(localStorage.getItem('masaje_eleccion'));
    if (e?.tipos) Object.assign(tipoPorParte, e.tipos);
    else if (e && Number.isInteger(e.tipo)) tipoPorParte.espalda = e.tipo; // elección guardada antes de que hubiera más partes
    const k = PARTES.findIndex(p => p.id === e?.parte);
    cambiarParte(k >= 0 ? k : 0);
    if (e && datos.duraciones.some(d => d.id === e.largo)) estado.largo = e.largo;
  } catch (e) {}
}
function irAElegir() {
  estado.modo = 'elegir'; estado.corriendo = false; agarre = null;
  window.speechSynthesis?.cancel();
  plantilla.visible = false;
  colocarPanelFrente();
}
function empezar() {
  armarRutina();
  estado.enCurso = false; estado.terminado = false;
  irAPaso(0);
  const ya = colocado[parte.id];
  if (!ya) { // primera vez con esta parte: acomodar el dibujo sobre la persona; al tocar Listo arranca
    colocarPlantillaInicial(); guardarColocacion(); actualizarFigura(); entrarAjuste();
    hablar(`Acomoda el dibujo sobre ${parte.sobre} y toca Listo.`);
  } else {
    plantilla.position.copy(ya.pos); plantilla.rotation.set(0, ya.rot, 0);
    actualizarFigura(); mostrarRutina(); estado.corriendo = true; anunciar();
  }
}
function alternarAjuste() { if (estado.modo === 'ajustar') salirAjuste(); else entrarAjuste(); }

function posCamara(out = new THREE.Vector3()) {
  return (renderer.xr.isPresenting ? renderer.xr.getCamera() : camera).getWorldPosition(out);
}
function direccionMirada() {
  const cam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.getWorldQuaternion(new THREE.Quaternion()));
  dir.y = 0; if (dir.lengthSq() < 1e-4) dir.set(0, 0, -1);
  return dir.normalize();
}
function colocarPlantillaInicial() {
  if (renderer.xr.isPresenting) {
    const cab = posCamara(), dir = direccionMirada();
    plantilla.position.copy(cab).addScaledVector(dir, 0.6);
    plantilla.position.y = Math.max(0.5, cab.y - 0.65);
    plantilla.rotation.set(0, Math.atan2(-dir.x, -dir.z), 0); // la cabeza del dibujo queda lejos de ti
  } else {
    plantilla.position.set(0, 0.85, -0.05); plantilla.rotation.set(0, 0, 0);
  }
}

// ---------- Figura, zonas y asas ----------
function actualizarFigura() {
  // contorno suave
  const pts = CONTORNO.map(([u, v]) => W(u, v, 0));
  contornoPts = new THREE.CatmullRomCurve3(pts, true, 'centripetal').getPoints(140);
  vaciar(capaFigura);
  const sh = new THREE.Shape(contornoPts.map(p => new THREE.Vector2(p.x, p.y)));
  const relleno = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.06, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
  relleno.renderOrder = 0;
  const borde = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(contornoPts.map(p => p.clone().setZ(ALTURA * 0.4))),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, depthTest: false }));
  borde.renderOrder = 3;
  capaFigura.add(relleno, borde);
  construirZonas();
  if (rutina && estado.modo !== 'ajustar') animador = crearAnimador(rutina.pasos[estado.paso]);
  actualizarAsas();
}
let ultimaFigura = 0;
function actualizarFiguraSuave() { const t = performance.now(); if (t - ultimaFigura > 70) { ultimaFigura = t; actualizarFigura(); } }

// Letreros de las zonas: parados a un costado del cuerpo (fuera del área de masaje), de frente a ti,
// con una rayita hacia su zona. Se crean una sola vez.
const letrerosZona = {};
let ladoLetreros = -1; // de qué lado del cuerpo van (el contrario a donde estás parado)
function letreroZona(id) {
  if (letrerosZona[id]) return letrerosZona[id];
  const z = ZONAS[id], css = '#' + z.color.toString(16).padStart(6, '0');
  const cartel = etiqueta(z.etiqueta, css, 0.15);
  const raya = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineBasicMaterial({ color: z.color, transparent: true, opacity: 0.7, depthTest: false }));
  raya.renderOrder = 9;
  cartel.userData.fijo = raya.userData.fijo = true; // no se liberan al rehacer las zonas
  return (letrerosZona[id] = { cartel, raya, id });
}
function colocarLetreros() {
  for (const { cartel, raya, id } of Object.values(letrerosZona)) {
    if (!ZONAS[id]) continue; // letrero de otra parte del cuerpo
    const [u0, v0, u1, v1] = ZONAS[id].rect, s = ladoLetreros;
    let ancla, pos;
    if (ZONAS[id].arriba) { ancla = W(0, 1.0, ALTURA); pos = W(0, 1.22, 0.07); }  // en la nuca
    else {
      const cv = (v0 + v1) / 2, borde = W(s, cv, 0), centro = W(0, cv, 0);
      const afuera = borde.clone().sub(centro).normalize();
      ancla = W(Math.max(Math.abs(u0), Math.abs(u1)) * s, cv, ALTURA);
      pos = borde.clone().addScaledVector(afuera, 0.1); pos.z = 0.05;
    }
    cartel.position.copy(pos);
    raya.geometry.setFromPoints([ancla, pos.clone().setZ(pos.z - 0.012)]);
  }
}
// libera la memoria de video de lo que se quita de una capa (en el Quest se acumula si no)
function vaciar(capa) {
  for (const hijo of [...capa.children]) {
    capa.remove(hijo);
    if (hijo.userData.fijo) continue;
    hijo.traverse(o => {
      if (o.isSkinnedMesh) o.skeleton.dispose();           // su geometría es compartida: no se toca
      else if (o.geometry && o.geometry !== geoPunto) o.geometry.dispose();
      for (const m of [].concat(o.material || [])) m.dispose(); // las texturas son compartidas
    });
  }
}

// Cómo se ven las zonas: manchas de calor (difuminadas), formas de músculo o los cuadros de antes. Se cambia en el Menú.
const ESTILOS_ZONA = ['calor', 'musculos', 'cuadros'], NOMBRE_ESTILO = { calor: 'manchas de calor', musculos: 'músculos', cuadros: 'cuadros' };
let estiloZonas = 'calor';
try { const e = localStorage.getItem('masaje_zonas'); if (ESTILOS_ZONA.includes(e)) estiloZonas = e; } catch (e) {}
// mancha blanca que se desvanece hacia las orillas (el color lo pone cada zona)
const texCalor = (() => {
  const N = 128, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), im = g.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const px = Math.abs((x + 0.5) / N * 2 - 1), py = Math.abs((y + 0.5) / N * 2 - 1);
    const r = Math.pow(px ** 3 + py ** 3, 1 / 3), t = Math.min(1, Math.max(0, (1 - r) / 0.62)), i = (y * N + x) * 4;
    im.data[i] = im.data[i + 1] = im.data[i + 2] = 255; im.data[i + 3] = 255 * t * t * (3 - 2 * t);
  }
  g.putImageData(im, 0, 0);
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx;
})();
// mancha que sigue la forma del cuerpo: una rejilla sobre el rectángulo de la zona (un poco más grande, para que se difumine afuera)
function mallaCalor(a, b, v0, v1, color, crece, opacidad) {
  const du = (b - a) * crece, dv = (v1 - v0) * crece, N = 10, pos = [], uv = [], idx = [];
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const p = W(a - du + (b - a + 2 * du) * i / N, v0 - dv + (v1 - v0 + 2 * dv) * j / N, 0);
    pos.push(p.x, p.y, 0); uv.push(i / N, j / N);
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const k = j * (N + 1) + i; idx.push(k, k + 1, k + N + 2, k, k + N + 2, k + N + 1); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, map: texCalor, transparent: true, opacity: opacidad, depthWrite: false, depthTest: false, side: THREE.DoubleSide }));
  m.position.z = ALTURA * 0.5; m.renderOrder = 1;
  return m;
}
// contorno de la zona en (u, v). En "músculos": la forma dibujada en cuerpo.js ("forma"), suavizada; si no hay, un rectángulo redondeado
function contornoZona(z, s) {
  const [u0, v0, u1, v1] = z.rect, a = Math.min(u0 * s, u1 * s), b = Math.max(u0 * s, u1 * s);
  if (estiloZonas !== 'musculos') {
    const uv = [], N = 8;
    for (let k = 0; k < N; k++) uv.push([a + (b - a) * k / N, v0]);
    for (let k = 0; k < N; k++) uv.push([b, v0 + (v1 - v0) * k / N]);
    for (let k = 0; k < N; k++) uv.push([b - (b - a) * k / N, v1]);
    for (let k = 0; k < N; k++) uv.push([a, v1 - (v1 - v0) * k / N]);
    return uv;
  }
  if (Array.isArray(z.forma)) {
    const c = new THREE.CatmullRomCurve3(z.forma.map(([u, v]) => new THREE.Vector3(u * s, v, 0)), true, 'catmullrom', 0.5);
    return c.getSpacedPoints(56).slice(0, 56).map(p => [p.x, p.y]);
  }
  // formas hechas: "elipse", "huso" (ancho al centro y en punta en los extremos, como un músculo largo) o redondeado
  const uv = [], N = 56, cu = (a + b) / 2, cv = (v0 + v1) / 2, ru = (b - a) / 2, rv = (v1 - v0) / 2;
  const e = z.forma === 'elipse' || z.forma === 'huso' ? 1 : 0.45; // exponente: 1 = elipse, menos = más cuadrado
  for (let k = 0; k < N; k++) {
    const t = k / N * Math.PI * 2, co = Math.cos(t), si = Math.sin(t);
    let x = Math.sign(co) * Math.abs(co) ** e; const y = Math.sign(si) * Math.abs(si) ** e;
    if (z.forma === 'huso') x *= 0.55 + 0.45 * Math.cos(y * Math.PI / 2) ** 0.7;
    uv.push([cu + ru * x, cv + rv * y]);
  }
  return uv;
}
function construirZonas() {
  vaciar(capaZonas); zonaMallas = {};
  for (const [id, z] of Object.entries(ZONAS)) {
    zonaMallas[id] = [];
    for (const s of (z.espejo ? [1, -1] : [1])) {
      const pts = contornoZona(z, s).map(([u, v]) => W(u, v, 0));
      const borde = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: z.color, transparent: true, opacity: 0.5, depthTest: false }));
      borde.position.z = ALTURA * 0.6; borde.renderOrder = 2;
      let relleno, nucleo = null;
      if (estiloZonas === 'calor') {
        const [u0, v0, u1, v1] = z.rect, a = Math.min(u0 * s, u1 * s), b = Math.max(u0 * s, u1 * s);
        relleno = mallaCalor(a, b, v0, v1, z.color, 0.22, 0.3);
        // el centro, más claro y más chico: da la sensación de calor
        nucleo = mallaCalor(a, b, v0, v1, new THREE.Color(z.color).lerp(new THREE.Color(0xfff2c0), 0.6), -0.12, 0.2);
        capaZonas.add(relleno, nucleo, borde);
      } else {
        const forma2 = new THREE.Shape(pts.map(p => new THREE.Vector2(p.x, p.y)));
        relleno = new THREE.Mesh(new THREE.ShapeGeometry(forma2),
          new THREE.MeshBasicMaterial({ color: z.color, transparent: true, opacity: 0.1, depthWrite: false, depthTest: false, side: THREE.DoubleSide }));
        relleno.position.z = ALTURA * 0.5; relleno.renderOrder = 1;
        capaZonas.add(relleno, borde);
      }
      zonaMallas[id].push({ relleno, borde, nucleo });
    }
    const l = letreroZona(id);
    l.cartel.userData.zona = l.raya.userData.zona = id;
    capaZonas.add(l.cartel, l.raya);
  }
  colocarLetreros();
}
function resaltarZonas(t) {
  const conPaso = rutina && (estado.modo === 'rutina' || estado.modo === 'ajustar');
  const activas = (conPaso && rutina.pasos[estado.paso]?.zonas) || [];
  // los letreros van del lado contrario a donde estás parado (no los tapan tus brazos) y siempre te miran
  const cp = posCamara(), camL = lienzo.worldToLocal(cp.clone()), cx = camL.x - W(0, 0.5, 0).x;
  if (Math.abs(cx) > 0.12 && Math.sign(cx) === ladoLetreros) { ladoLetreros = -Math.sign(cx); colocarLetreros(); }
  for (const l of Object.values(letrerosZona)) l.cartel.lookAt(cp);
  const todas = estado.modo === 'ajustar';
  for (const [id, mallas] of Object.entries(zonaMallas)) {
    const z = ZONAS[id], activa = activas.includes(id);
    const op = todas ? 0.16 : activa ? 0.28 + 0.12 * Math.sin(t * 3) : (z.fija ? 0.22 : 0.05);
    for (const m of mallas) {
      if (m.nucleo) {
        // manchas: la zona del paso "respira"; las de cuidado se quedan a la vista con su orilla; las demás casi no se ven
        const k = todas ? 0.45 : activa ? 0.72 + 0.2 * Math.sin(t * 2.2) : (z.fija ? 0.5 : 0.07);
        m.relleno.material.opacity = k; m.nucleo.material.opacity = z.fija ? 0 : k * 0.55;
        m.borde.material.opacity = z.fija ? 0.8 : 0;
      } else { m.relleno.material.opacity = op; m.borde.material.opacity = todas || activa || z.fija ? 0.85 : 0.25; }
    }
  }
  capaZonas.children.forEach(c => { if (c.userData.zona) c.visible = !todas && !!ZONAS[c.userData.zona] && (ZONAS[c.userData.zona].fija || activas.includes(c.userData.zona)); });
  capaMov.visible = !todas;
}

// Asas para manipular el dibujo
const asas = [];
function nuevaAsa(tipo, id, geo, color, etiquetaTxt) {
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthTest: false }));
  m.renderOrder = 40; capaAsas.add(m);
  const asa = { tipo, id, mesh: m, color: new THREE.Color(color) };
  // zona invisible más grande para que sea fácil atinarle con el rayo o el mouse
  const zonaToque = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), new THREE.MeshBasicMaterial({ visible: false }));
  zonaToque.userData.asa = asa; m.add(zonaToque); asa.toque = zonaToque;
  if (etiquetaTxt) { asa.etiqueta = etiqueta(etiquetaTxt, '#' + asa.color.getHexString(), 0.09); capaAsas.add(asa.etiqueta); }
  m.userData.asa = asa; asas.push(asa);
  return asa;
}
// las bolitas amarillas cambian con la parte del cuerpo
function rehacerAsasVertice() {
  for (let k = asas.length - 1; k >= 0; k--) {
    const a = asas[k]; if (a.tipo !== 'vertice') continue;
    capaAsas.remove(a.mesh); a.mesh.geometry.dispose(); a.mesh.material.dispose();
    if (a.etiqueta) { capaAsas.remove(a.etiqueta); a.etiqueta.material.map?.dispose(); a.etiqueta.material.dispose(); }
    asas.splice(k, 1);
  }
  const chico = parte.id === 'mano' || parte.id === 'pie';
  for (const id of VERTICES) nuevaAsa('vertice', id, new THREE.SphereGeometry(chico ? 0.011 : 0.016, 20, 14), 0xffe066, NOMBRE_VERTICE[id]);
}
rehacerAsasVertice();
const asaCentro = nuevaAsa('centro', 0, new THREE.CylinderGeometry(0.035, 0.035, 0.008, 32), 0x3f8cff, 'Mover');
asaCentro.mesh.rotation.x = Math.PI / 2;
for (let k = 0; k < 4; k++) nuevaAsa('escala', k, new THREE.BoxGeometry(0.026, 0.026, 0.026), 0xffffff);
const asaGiro = nuevaAsa('girar', 0, new THREE.TorusGeometry(0.03, 0.007, 10, 32), 0x46e08a, 'Girar');
const marco = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.02, gapSize: 0.015, transparent: true, opacity: 0.6, depthTest: false }));
marco.renderOrder = 39; capaAsas.add(marco);

function centroide() {
  const c = new THREE.Vector2(); VERTICES.forEach(id => c.add(forma[id])); return c.multiplyScalar(1 / VERTICES.length);
}
function cajaContorno() {
  const min = new THREE.Vector2(Infinity, Infinity), max = new THREE.Vector2(-Infinity, -Infinity);
  contornoPts.forEach(p => { min.min(p); max.max(p); });
  return { min: min.subScalar(0.03), max: max.addScalar(0.03) };
}
function actualizarAsas() {
  const { min, max } = cajaContorno(), c = centroide(), h = ALTURA * 2;
  const esquinas = [[min.x, min.y], [max.x, min.y], [max.x, max.y], [min.x, max.y]];
  for (const a of asas) {
    if (a.tipo === 'vertice') a.mesh.position.set(forma[a.id].x, forma[a.id].y, h);
    else if (a.tipo === 'centro') a.mesh.position.set(c.x, c.y, h);
    else if (a.tipo === 'escala') a.mesh.position.set(...esquinas[a.id], h);
    else if (a.tipo === 'girar') a.mesh.position.set((min.x + max.x) / 2, max.y + 0.05, h);
    if (a.etiqueta) {
      const off = a.tipo === 'vertice' ? new THREE.Vector3(-0.075, 0, 0) : new THREE.Vector3(0, a.tipo === 'girar' ? 0.045 : -0.05, 0);
      a.etiqueta.position.copy(a.mesh.position).add(off);
    }
  }
  marco.geometry.dispose();
  marco.geometry = new THREE.BufferGeometry().setFromPoints(esquinas.map(([x, y]) => new THREE.Vector3(x, y, h)));
  marco.computeLineDistances();
}
function posMundoAsa(a, out = new THREE.Vector3()) { return a.mesh.getWorldPosition(out); }
function resaltarAsas() {
  for (const a of asas) {
    const activa = a === asaHover || a === agarre?.asa;
    // en manos y pies el dibujo es chico: las asas de mover, girar y tamaño también
    const chico = (parte.id === 'mano' || parte.id === 'pie') && a.tipo !== 'vertice' ? 0.5 : 1;
    a.mesh.scale.setScalar((activa ? 1.45 : 1) * chico);
    a.mesh.material.color.copy(activa ? new THREE.Color(0xff9a3c) : a.color);
  }
}

// ---------- Arrastrar asas ----------
// obtener(): devuelve la posición actual de la mano / rayo en el mundo
function iniciarAgarre(asa, obtener, quien) {
  const p0 = obtener(); if (!p0) return;
  const base = {};
  VERTICES.forEach(id => base[id] = forma[id].clone());
  agarre = { asa, obtener, quien, p0: p0.clone(), pos0: plantilla.position.clone(), rot0: plantilla.rotation.y, base, c0: centroide() };
  if (asa.tipo === 'escala') { const l = lienzo.worldToLocal(p0.clone()); agarre.d0 = Math.max(0.02, new THREE.Vector2(l.x, l.y).distanceTo(agarre.c0)); }
  if (asa.tipo === 'girar') agarre.a0 = Math.atan2(p0.z - plantilla.position.z, p0.x - plantilla.position.x);
  sonido(760, 0.05);
}
function moverAgarre() {
  if (!agarre) return;
  const p = agarre.obtener(); if (!p) return;
  const a = agarre.asa;
  if (a.tipo === 'centro') {
    plantilla.position.copy(agarre.pos0).add(p.clone().sub(agarre.p0));
  } else if (a.tipo === 'girar') {
    const ang = Math.atan2(p.z - agarre.pos0.z, p.x - agarre.pos0.x);
    plantilla.rotation.y = agarre.rot0 - (ang - agarre.a0);
  } else {
    lienzo.updateWorldMatrix(true, false);
    const l = lienzo.worldToLocal(p.clone()), l2 = new THREE.Vector2(l.x, l.y);
    if (a.tipo === 'vertice') forma[a.id].copy(l2);
    else if (a.tipo === 'escala') {
      const f = THREE.MathUtils.clamp(l2.distanceTo(agarre.c0) / agarre.d0, 0.3, 3);
      VERTICES.forEach(id => forma[id].copy(agarre.base[id]).sub(agarre.c0).multiplyScalar(f).add(agarre.c0));
    }
    actualizarFiguraSuave();
  }
}
function soltar() {
  if (!agarre) return;
  agarre = null; actualizarFigura(); guardarForma(); sonido(600, 0.05);
}
const planoPlantilla = () => new THREE.Plane(new THREE.Vector3(0, 1, 0), -plantilla.position.y);
function asaCercana(pos) {
  let mejor = null, dMin = RADIO_AGARRE, tmp = new THREE.Vector3();
  for (const a of asas) { const d = posMundoAsa(a, tmp).distanceTo(pos); if (d < dMin) { dMin = d; mejor = a; } }
  return mejor;
}
function asaConRayo() {
  if (!capaAsas.visible || !plantilla.visible) return null;
  const hit = raycaster.intersectObjects(asas.map(a => a.toque), false)[0];
  return hit ? { asa: hit.object.userData.asa, dist: hit.distance } : null;
}

// ---------- Animación de movimientos ----------
const geoPunto = new THREE.SphereGeometry(1, 12, 8);
function punto(color, r) {
  const m = new THREE.Mesh(geoPunto, new THREE.MeshBasicMaterial({ color, transparent: true, depthTest: false }));
  m.scale.setScalar(r); m.renderOrder = 6; return m;
}
function linea(puntos, color, op = 0.45) {
  const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(puntos),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: op, depthTest: false }));
  l.renderOrder = 5; return l;
}
function flecha(desde, hasta, color) {
  const dir = hasta.clone().sub(desde).normalize();
  const c = new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.024, 12), new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.85 }));
  c.position.copy(hasta); c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); c.renderOrder = 6;
  return c;
}
function polilinea(pts) {
  const largos = [0]; for (let i = 1; i < pts.length; i++) largos.push(largos[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const total = largos[largos.length - 1];
  return f => {
    const d = ((f % 1) + 1) % 1 * total; let i = 1; while (i < largos.length - 1 && largos[i] < d) i++;
    const t = (d - largos[i - 1]) / (largos[i] - largos[i - 1] || 1);
    return pts[i - 1].clone().lerp(pts[i], t);
  };
}
const lados = mov => mov.espejo ? [1, -1] : [1];

// ---------- Presión: cada nivel tiene su color ----------
const PRESIONES = {
  suave: { color: 0x46d6ff, css: '#46d6ff', nombre: 'Suave', nivel: 1 },
  media: { color: 0xffd23f, css: '#ffd23f', nombre: 'Media', nivel: 2 },
  firme: { color: 0xff8a1f, css: '#ff8a1f', nombre: 'Firme', nivel: 3 },
};
const presionDe = paso => PRESIONES[paso?.presion] || PRESIONES.media;
// texto del panel: con qué parte de la mano se hace el paso
const CON_MANO = { abierta: 'con la palma', puno: 'con el puño', pulgar: 'con el pulgar', canto: 'con el canto de la mano',
  karate_abierta: 'canto, mano abierta', ahuecada: 'con la mano ahuecada', amasar: 'con la mano en C',
  yemas: 'con las yemas', nudillos: 'con los nudillos', pinza: 'con pulgar e índice' };
const tipoManoDe = paso => paso.movimiento.mano || (['circulos', 'presion'].includes(paso.movimiento.tipo) ? 'pulgar' : 'palma');

// ---------- Mano guía (silueta dibujada en un canvas; el color se pone con el material) ----------
const MANO_TAM = 0.26; // metros que mide el cuadro del dibujo
function crearTexMano(tipo) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = g.strokeStyle = '#ffffff'; g.lineCap = 'round';
  redondo(g, 82, 118, 94, 86, 32); g.fill();                       // palma
  [[96, 48], [118, 32], [140, 38], [160, 58]].forEach(([x, top]) => { // dedos
    g.lineWidth = 21; g.beginPath(); g.moveTo(x, 128); g.lineTo(x, top); g.stroke();
  });
  g.lineWidth = 23; g.beginPath(); g.moveTo(92, 178); g.lineTo(44, 124); g.stroke(); // pulgar
  // punto de contacto: dónde debe ir esa parte de tu mano
  const contacto = tipo === 'pulgar' ? [44, 124] : [129, 162];
  g.strokeStyle = 'rgba(20,24,34,0.85)'; g.lineWidth = 6;
  g.beginPath(); g.arc(contacto[0], contacto[1], 15, 0, Math.PI * 2); g.stroke();
  g.fillStyle = 'rgba(20,24,34,0.85)'; g.beginPath(); g.arc(contacto[0], contacto[1], 5, 0, Math.PI * 2); g.fill();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, contacto };
}
const TEX_MANO = { palma: crearTexMano('palma'), pulgar: crearTexMano('pulgar') };
function mano(tipo, color, opacidad) {
  const { tex, contacto } = TEX_MANO[tipo];
  const plano = new THREE.Mesh(new THREE.PlaneGeometry(MANO_TAM, MANO_TAM),
    new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, opacity: opacidad, depthTest: false, depthWrite: false }));
  // mover el dibujo para que el punto de contacto quede justo en el origen del grupo
  plano.position.set(-(contacto[0] / 256 - 0.5) * MANO_TAM, (contacto[1] / 256 - 0.5) * MANO_TAM, 0);
  plano.renderOrder = opacidad > 0.5 ? 8 : 7;
  const grupo = new THREE.Group(); grupo.add(plano); grupo.visible = false;
  capaMov.add(grupo);
  return grupo;
}

// ---------- Mano guía 3D (modelos con esqueleto de manos_rig; el puño sale del editor de manos) ----------
// todas comparten el mismo esqueleto y las mismas poses (copiadas de la mano humana con comparar_manos.html)
// De momento solo la mano humana. Los guantes ya funcionan; para volver a ofrecerlos, quita el comentario:
const MODELOS_MANO = { Abierta: 'Mano humana' /*, Midnight: 'Guante blanco', Olive: 'Guante táctico verde',
  Calavera: 'Guantelete calavera', Gilded: 'Guantelete dorado' */ };
let modeloMano = 'Abierta';
try { const m = localStorage.getItem('masaje_mano'); if (MODELOS_MANO[m]) modeloMano = m; } catch (e) {}
const LARGO_MANO = 0.19;  // metros de la muñeca a la punta del dedo medio
const manos3D = {};       // id -> datos del modelo ya cargado
const cargandoMano = {};

function cargarMano3D(id) {
  if (manos3D[id]) return Promise.resolve(manos3D[id]);
  return cargandoMano[id] ||= (async () => {
    const gltf = await new GLTFLoader().loadAsync(`./manos_rig/mano_${id}_puno.glb`);
    const esc = gltf.scene, huesos = {};
    esc.traverse(o => { if (o.isBone) huesos[o.name] = o; });
    const reposo = {}; for (const [n, b] of Object.entries(huesos)) reposo[n] = b.quaternion.clone();
    // puño: el que guardaste en el editor; si no hay, el de la animación
    const puno = {};
    for (const tr of gltf.animations[0]?.tracks || []) {
      const [n, p] = tr.name.split('.');
      if (p === 'quaternion') { const v = tr.values, k = v.length; puno[n] = new THREE.Quaternion(v[k - 4], v[k - 3], v[k - 2], v[k - 1]); }
    }
    // poses del editor de manos: <id>.json (puño), <id>_abierta.json, <id>_pulgar.json, <id>_canto.json… (manos_poses.js)
    const leerPose = async sufijo => {
      try {
        const r = await fetch(`./manos_rig/poses/${id}${sufijo}.json`);
        if (!r.ok) return null;
        const j = await r.json(), p = {};
        for (const n of Object.keys(huesos)) p[n] = j.huesos[n] ? new THREE.Quaternion(...j.huesos[n].cuaternion) : reposo[n].clone();
        return p;
      } catch (e) { return null; }
    };
    const [guardPuno, pAbierta, pPulgar] = await Promise.all([leerPose(''), leerPose('_abierta'), leerPose('_pulgar')]);
    if (guardPuno) Object.assign(puno, guardPuno);
    for (const n of Object.keys(huesos)) puno[n] ||= reposo[n].clone();
    const abierta = pAbierta || Object.fromEntries(Object.keys(huesos).map(n => [n, reposo[n].clone()]));
    // si no has guardado "pulgares afuera": dedos un tercio doblados y el pulgar como en la palma abierta
    const pulgar = pPulgar || Object.fromEntries(Object.keys(huesos).map(n =>
      [n, n.startsWith('pulgar') ? abierta[n].clone() : abierta[n].clone().slerp(puno[n], 0.32)]));
    // las demás manos (canto, ahuecada, amasar, yemas, nudillos, pinza): la guardada o, si no hay, una fracción del puño
    const otras = {};
    await Promise.all(POSES.filter(p => !['puno', 'abierta', 'pulgar'].includes(p.id)).map(async p => {
      otras[p.id] = await leerPose(p.sufijo) || Object.fromEntries(Object.keys(huesos).map(n =>
        [n, abierta[n].clone().slerp(puno[n], fraccion(p.id, n) || 0)]));
    }));
    // ejes de la mano (en el espacio del modelo, mano abierta)
    esc.updateMatrixWorld(true);
    const P = n => huesos[n].getWorldPosition(new THREE.Vector3());
    const puntaDe = (n, ant) => { const a = P(ant), b = P(n); return b.clone().add(b.clone().sub(a).multiplyScalar(0.9)); };
    const muneca = P('palma'), mcp = P('medio_1'), punta = puntaDe('medio_3', 'medio_2');
    const F = punta.clone().sub(muneca), largo = F.length(); F.normalize();
    const hacia = P('indice_1').sub(P('menique_1')); // hacia el pulgar
    // la palma es hacia donde se doblan los dedos al cerrar el puño
    const pRep = puntaDe('medio_3', 'medio_2');
    for (const n in huesos) huesos[n].quaternion.copy(puno[n]);
    esc.updateMatrixWorld(true);
    const pPuno = puntaDe('medio_3', 'medio_2');
    for (const n in huesos) huesos[n].quaternion.copy(reposo[n]);
    esc.updateMatrixWorld(true);
    const Np = pPuno.sub(pRep); Np.addScaledVector(F, -Np.dot(F)).normalize();
    const Z = Np.clone().negate(), Y = F, X = new THREE.Vector3().crossVectors(Y, Z);
    const base = new THREE.Matrix4().makeBasis(X, Y, Z).transpose(); // modelo -> mano canónica (dedos +Y, palma hacia -Z)
    const izquierda = hacia.dot(X) > 0; // la canónica es mano derecha (pulgar hacia -X)
    const ancho = P('indice_1').distanceTo(P('menique_1'));
    // la punta del pulgar se mide ya en la pose "pulgares afuera"
    for (const n in huesos) huesos[n].quaternion.copy(pulgar[n]);
    esc.updateMatrixWorld(true);
    const puntaPulgar = puntaDe('pulgar_2', 'pulgar_1');
    // la parte que toca la piel en cada mano se mide con esa mano puesta
    const enPose = (pose, f) => {
      for (const n in huesos) huesos[n].quaternion.copy(pose[n]);
      esc.updateMatrixWorld(true);
      const r = f();
      for (const n in huesos) huesos[n].quaternion.copy(reposo[n]);
      esc.updateMatrixWorld(true);
      return r;
    };
    const prom = (...v) => v.reduce((a, b) => a.add(b), new THREE.Vector3()).multiplyScalar(1 / v.length);
    const yemas = otras.yemas && enPose(otras.yemas, () => prom(puntaDe('indice_3', 'indice_2'), puntaDe('medio_3', 'medio_2'), puntaDe('anular_3', 'anular_2')));
    const nudillos = otras.nudillos && enPose(otras.nudillos, () => prom(P('indice_2'), P('medio_2'), P('anular_2')));
    const pinza = otras.pinza && enPose(otras.pinza, () => prom(puntaDe('pulgar_2', 'pulgar_1'), puntaDe('indice_3', 'indice_2')));
    const agarre = otras.amasar && enPose(otras.amasar, () => prom(puntaDe('pulgar_2', 'pulgar_1'), puntaDe('medio_3', 'medio_2')));
    for (const n in huesos) huesos[n].quaternion.copy(reposo[n]);
    esc.updateMatrixWorld(true);
    const contactos = {
      palma: muneca.clone().lerp(mcp, 0.55).addScaledVector(Np, 0.065 * largo),
      pulgar: puntaPulgar,
      canto: muneca.clone().lerp(P('menique_1'), 0.55).addScaledVector(hacia.clone().normalize(), -0.3 * ancho),
      yemas, nudillos, pinza, agarre,
    };
    // palma apoyada: en la palma abierta el pulgar cuelga por debajo de la palma; al apoyar la mano de verdad
    // el pulgar se acuesta sobre la piel junto al índice. Se busca el giro más chico del pulgar que lo logre.
    const apoyada = acostarPulgar(esc, huesos, reposo, abierta,
      new THREE.Matrix4().makeScale(LARGO_MANO / largo, LARGO_MANO / largo, LARGO_MANO / largo).multiply(base)
        .multiply(new THREE.Matrix4().makeTranslation(-contactos.palma.x, -contactos.palma.y, -contactos.palma.z)), izquierda);
    return (manos3D[id] = { esc, reposo, ...otras, puno, abierta, apoyada, pulgar, base, izquierda, escala: LARGO_MANO / largo, contactos });
  })();
}

// M: del modelo a la mano canónica en metros (dedos +Y, palma hacia -Z, contacto de la palma en el origen)
function acostarPulgar(esc, huesos, reposo, pose, M, izquierda) {
  const res = Object.fromEntries(Object.entries(pose).map(([n, q]) => [n, q.clone()]));
  const meta = huesos.pulgar_meta;
  if (!meta) return res;
  // vértices que mueve el pulgar
  const muestras = [];
  esc.traverse(o => {
    if (!o.isSkinnedMesh) return;
    const nombres = o.skeleton.bones.map(b => b.name), si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight;
    for (let i = 0; i < si.count; i += 2) {
      let w = 0;
      for (let k = 0; k < 4; k++) if (nombres[si.getComponent(i, k)]?.startsWith('pulgar_')) w += sw.getComponent(i, k);
      if (w > 0.3) muestras.push([o, i]); // el pulgar y la parte carnosa de su base
    }
  });
  const v = new THREE.Vector3(), lado = izquierda ? -1 : 1;
  const medir = () => {
    esc.updateMatrixWorld(true);
    let z = 0, x = 0;
    for (const [o, i] of muestras) {
      o.getVertexPosition(i, v).applyMatrix4(o.matrixWorld).applyMatrix4(M);
      z = Math.min(z, v.z); x = Math.max(x, -v.x * lado); // x: cuánto sale el pulgar hacia su lado
    }
    return { z, x };
  };
  for (const n in huesos) huesos[n].quaternion.copy(pose[n]);
  const q0 = pose.pulgar_meta.clone(), e = new THREE.Euler(), r = new THREE.Quaternion();
  let mejor = null;
  const probar = (a, b, c) => {
    meta.quaternion.copy(q0).multiply(r.setFromEuler(e.set(a, b, c)));
    const { z, x } = medir(), ok = z >= -0.004;
    // giro chico, pulgar pegado a la mano, sin meterse en la piel ni quedar en el aire
    const costo = (a * a + b * b + c * c) + 15 * x + 60 * Math.max(0, z + 0.002 - 0.006) + (ok ? 0 : 1000 - z * 1000);
    if (!mejor || costo < mejor.costo) mejor = { a, b, c, costo };
  };
  const R = Math.PI / 180;
  for (let a = -60; a <= 60; a += 15) for (let b = -60; b <= 60; b += 15) for (let c = -60; c <= 60; c += 15) probar(a * R, b * R, c * R);
  const g = mejor; // afinar alrededor del mejor
  for (let a = -10; a <= 10; a += 5) for (let b = -10; b <= 10; b += 5) for (let c = -10; c <= 10; c += 5) probar(g.a + a * R, g.b + b * R, g.c + c * R);
  res.pulgar_meta = q0.clone().multiply(r.setFromEuler(e.set(mejor.a, mejor.b, mejor.c)));
  for (const n in huesos) huesos[n].quaternion.copy(reposo[n]);
  esc.updateMatrixWorld(true);
  return res;
}

// crea una mano 3D lista para usar; modo: palma | pulgar | canto (golpe con el borde, palma de lado)
function mano3D(id, color, modo, pose = '') {
  const d = manos3D[id];
  const geos = ((d.geos ||= {})[modo + '|' + pose] ||= []); let nMalla = 0, geoNueva = false;
  const copia = SkeletonUtils.clone(d.esc);
  const rojo = { value: 0 }; // 0 = normal, 1 = la parte que presiona en rojo
  const huesos = {};
  copia.traverse(o => {
    if (o.isBone) huesos[o.name] = o;
    if (o.isMesh) {
      o.frustumCulled = false; o.renderOrder = 8;
      // geometría propia (comparte los datos) para poder marcar en rojo la parte que presiona
      const k = nMalla++;
      if (!geos[k]) {
        const geo = geos[k] = new THREE.BufferGeometry(); geoNueva = true;
        for (const [n, at] of Object.entries(o.geometry.attributes)) geo.setAttribute(n, at);
        geo.setIndex(o.geometry.index); for (const gr of o.geometry.groups) geo.addGroup(gr.start, gr.count, gr.materialIndex);
        geo.setAttribute('presion', new THREE.BufferAttribute(new Float32Array(o.geometry.attributes.position.count), 1));
      }
      o.geometry = geos[k];
      o.material = [].concat(o.material).map(m => {
        const c = m.clone(); c.transparent = true; c.opacity = 0.92;
        if (c.emissive) { c.emissive = new THREE.Color(color); c.emissiveIntensity = 0.28; }
        c.onBeforeCompile = sh => {
          sh.uniforms.uRojo = rojo;
          sh.vertexShader = 'attribute float presion;\nvarying float vPresion;\n' +
            sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvPresion = presion;');
          sh.fragmentShader = 'uniform float uRojo;\nvarying float vPresion;\n' +
            sh.fragmentShader.replace('#include <dithering_fragment>',
              '#include <dithering_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.95, 0.07, 0.05), clamp(vPresion * uRojo, 0.0, 1.0));');
        };
        c.customProgramCacheKey = () => 'mano_presion';
        return c;
      });
      if (o.material.length === 1) o.material = o.material[0];
    }
  });
  const contacto = d.contactos[modo] || d.contactos.palma;
  const modelo = new THREE.Group(); modelo.matrixAutoUpdate = false;
  modelo.matrix.makeScale(d.izquierda ? -d.escala : d.escala, d.escala, d.escala)
    .multiply(d.base).multiply(new THREE.Matrix4().makeTranslation(-contacto.x, -contacto.y, -contacto.z));
  modelo.add(copia);
  const orient = new THREE.Group(); orient.add(modelo);
  if (modo === 'canto') orient.rotation.y = Math.PI / 2; // el meñique hacia abajo
  // inclina: ladea un poco la mano sobre su punto de contacto para que lo que toca sea lo más bajo
  const inclina = new THREE.Group(); inclina.add(orient);
  // voltea: después de 2 ciclos la mano se alza y se da la vuelta para enseñar con qué parte se presiona
  const voltea = new THREE.Group(); voltea.add(inclina);
  const grupo = new THREE.Group(); grupo.add(voltea); grupo.visible = false;
  // "objetivo" = la pose que pide el paso; los huesos la muestran (o van llegando a ella en una transición)
  const objetivo = Object.fromEntries(Object.keys(huesos).map(n => [n, new THREE.Quaternion()]));
  const materiales = []; copia.traverse(o => { if (o.isMesh) materiales.push(...[].concat(o.material)); });
  Object.assign(grupo.userData, { es3D: true, huesos, objetivo, orient, modelo, inclina, voltea, rojo, materiales, modo, geoNueva });
  const mostrar = () => { for (const [n, b] of Object.entries(huesos)) b.quaternion.copy(objetivo[n]); };
  // cerrar: 0 = tu palma abierta, 1 = tu puño (dedos y pulgar por separado)
  grupo.userData.cerrar = (dedos, pulgar = dedos) => {
    for (const n in huesos) objetivo[n].copy(d.abierta[n]).slerp(d.puno[n], escalon(n.startsWith('pulgar') ? pulgar : dedos, n));
    mostrar();
  };
  // pose guardada tal cual (por ejemplo "pulgar" = pulgares afuera)
  grupo.userData.pose = nombre => { for (const n in huesos) objetivo[n].copy(d[nombre][n]); mostrar(); };
  // de la palma abierta (0) a una pose guardada (1), dedo por dedo como el cierre del puño
  grupo.userData.hacia = (nombre, t) => {
    for (const n in huesos) objetivo[n].copy(d.abierta[n]).slerp(d[nombre][n], escalon(t, n));
    mostrar();
  };
  grupo.userData.cerrar(0);
  capaMov.add(grupo);
  return grupo;
}

// cierre poco a poco: cada dedo se enrolla de la punta a la base, y del meñique al índice (igual que en el editor)
function escalon(c, n) {
  const [dedo, parte] = n.split('_');
  const orden = { menique: 0, anular: 1, medio: 2, indice: 3, pulgar: 4 }[dedo];
  if (orden === undefined || c <= 0 || c >= 1) return c;
  const j = { 3: 0, 2: 1, 1: 2, meta: 2 }[parte] ?? 0;
  const k = dedo === 'pulgar' ? ({ 2: 0, 1: 1, meta: 2 }[parte] ?? 0) : j;
  const ini = orden * 0.06 + k * 0.08, x = Math.min(1, Math.max(0, (c - ini) / 0.6));
  return x * x * (3 - 2 * x);
}

// pose de la mano según el tipo de movimiento
// qué mano del editor se usa (manos_poses.js) y con qué parte toca
function poseDe(mov, tipoMano) {
  const pose = poseDelPaso(mov, tipoMano);
  // modo = con qué parte toca: ese punto va justo sobre la guía
  const modo = mov.tipo === 'percusion' && pose !== 'ahuecada' ? 'canto' // golpes: la mano de lado
    : { pulgar: 'pulgar', pinza: 'pinza', yemas: 'yemas', nudillos: 'nudillos', amasar: 'agarre' }[pose] || 'palma';
  return { modo, pose };
}
function manoGuia(mov, tipoMano, color) {
  if (!manos3D[modeloMano]) return mano(tipoMano, color, 0.85);
  const p = poseDe(mov, tipoMano);
  const g = mano3D(modeloMano, color, p.modo, p.pose);
  // la palma apoyada sobre la espalda lleva el pulgar acostado junto a la mano
  g.userData.pose(p.pose === 'abierta' && p.modo === 'palma' ? 'apoyada' : p.pose);
  if (g.userData.geoNueva) marcarPresion(g, p.modo); // se calcula una vez por cada forma de tocar
  return g;
}
// Qué parte de la mano presiona (se pinta de rojo al voltear la mano):
// palma = toda la mano; pulgar, yemas, pinza, agarre = esos dedos; canto y nudillos = lo que queda cerca del punto de contacto
const HUESOS_PRESION = {
  pulgar: ['pulgar_1', 'pulgar_2'],
  yemas: ['indice_3', 'medio_3', 'anular_3'],
  pinza: ['pulgar_2', 'indice_3'],
  agarre: ['pulgar_1', 'pulgar_2', 'indice_2', 'indice_3', 'medio_2', 'medio_3', 'anular_2', 'anular_3', 'menique_2', 'menique_3'],
};
const RADIO_PRESION = { canto: 0.045, nudillos: 0.03 };
function marcarPresion(g, modo) {
  const lista = HUESOS_PRESION[modo], radio = RADIO_PRESION[modo];
  const paso = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  g.updateMatrixWorld(true);
  const inv = g.matrixWorld.clone().invert(), v = new THREE.Vector3();
  g.traverse(o => {
    if (!o.isSkinnedMesh || !o.geometry.attributes.presion) return;
    const at = o.geometry.attributes.presion, arr = at.array, n = arr.length;
    const nombres = o.skeleton.bones.map(b => b.name), si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight;
    // palma: solo se pinta lo que mira hacia la piel (la palma y la cara de abajo de los dedos), no el dorso.
    // Se saca hacia dónde mira cada punto de la mano ya con su postura (z = hacia arriba de la piel).
    let abajo = null;
    if (!lista && !radio) {
      const P = new Float32Array(n * 3), Nz = new Float32Array(n), c = new THREE.Vector3();
      for (let i = 0; i < n; i++) { o.getVertexPosition(i, v).applyMatrix4(o.matrixWorld).applyMatrix4(inv); v.toArray(P, i * 3); c.add(v); }
      c.divideScalar(n);
      const ix = o.geometry.index, nt = ix ? ix.count : n, id = k => ix ? ix.getX(k) : k;
      const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3(), nn = new THREE.Vector3();
      let afuera = 0;
      for (let t = 0; t < nt; t += 3) {
        const i0 = id(t), i1 = id(t + 1), i2 = id(t + 2);
        a.fromArray(P, i0 * 3); b.fromArray(P, i1 * 3).sub(a); d.fromArray(P, i2 * 3).sub(a); nn.crossVectors(b, d);
        afuera += nn.dot(a.sub(c)); nn.normalize();
        Nz[i0] += nn.z; Nz[i1] += nn.z; Nz[i2] += nn.z;
      }
      // los puntos repetidos en las costuras comparten dirección (si no, quedan rayas)
      const porLugar = new Map(), claves = [], cuantas = new Float32Array(n);
      for (let t = 0; t < nt; t++) cuantas[id(t)]++;
      for (let i = 0; i < n; i++) {
        const k = Math.round(P[i * 3] * 2e4) + ',' + Math.round(P[i * 3 + 1] * 2e4) + ',' + Math.round(P[i * 3 + 2] * 2e4);
        const e = porLugar.get(k) || [0, 0]; e[0] += Nz[i]; e[1] += cuantas[i]; porLugar.set(k, e); claves.push(k);
      }
      const sg = afuera < 0 ? -1 : 1; // (la mano izquierda es la derecha en espejo: sus caras están al revés)
      abajo = i => { const e = porLugar.get(claves[i]); return e[1] ? paso(0.05, 0.45, -sg * e[0] / e[1]) : 0; };
    }
    for (let i = 0; i < n; i++) {
      if (lista) {
        let w = 0;
        for (let k = 0; k < 4; k++) if (lista.includes(nombres[si.getComponent(i, k)])) w += sw.getComponent(i, k);
        arr[i] = paso(0.15, 0.55, w);
      } else if (radio) {
        o.getVertexPosition(i, v).applyMatrix4(o.matrixWorld).applyMatrix4(inv);
        arr[i] = 1 - paso(radio * 0.6, radio, v.length());
      } else arr[i] = abajo(i); // palma: la cara de abajo de toda la mano
      // el antebrazo nunca se pinta
      let wa = 0; for (let k = 0; k < 4; k++) if (nombres[si.getComponent(i, k)] === 'antebrazo') wa += sw.getComponent(i, k);
      arr[i] *= 1 - paso(0.3, 0.7, wa);
    }
    at.needsUpdate = true;
  });
}
function cambiarModeloMano() {
  const ids = Object.keys(MODELOS_MANO);
  modeloMano = ids[(ids.indexOf(modeloMano) + 1) % ids.length];
  try { localStorage.setItem('masaje_mano', modeloMano); } catch (e) {}
  cargarMano3D(modeloMano).then(() => {
    rehacerAnimador();
    // solo se usa una mano a la vez: las demás se sueltan de la memoria de video (en el Quest es poca)
    for (const id of Object.keys(manos3D)) if (id !== modeloMano) liberarMano3D(id);
  }).catch(e => console.warn('mano 3D', e));
}
function liberarMano3D(id) {
  const d = manos3D[id]; if (!d) return;
  delete manos3D[id]; delete cargandoMano[id];
  const texturas = new Set();
  d.esc.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    for (const m of [].concat(o.material || [])) {
      for (const v of Object.values(m)) if (v && v.isTexture) texturas.add(v);
      m.dispose();
    }
  });
  for (const lista of Object.values(d.geos || {})) for (const g of lista) g?.dispose();
  texturas.forEach(t => t.dispose());
}
function rehacerAnimador() { if (rutina) animador = crearAnimador(rutina.pasos[estado.paso]); }

// Bolita guía: marca hacia dónde sigue el movimiento
function bolitaGuia(color) {
  const g = new THREE.Group();
  const bola = new THREE.Mesh(new THREE.SphereGeometry(0.013, 16, 12), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, depthTest: false }));
  const aro = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.0025, 8, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, depthTest: false }));
  bola.renderOrder = aro.renderOrder = 7;
  g.add(bola, aro); g.visible = false; capaMov.add(g);
  return g;
}
// puntos de la mano 3D (con la pose que tiene ahora) medidos desde su punto de contacto, sin inclinar
function puntosMano(g) {
  const inc = g.userData.inclina, guard = inc.rotation.clone();
  inc.rotation.set(0, 0, 0);
  g.updateMatrixWorld(true);
  const inv = g.matrixWorld.clone().invert(), pts = [];
  g.traverse(o => {
    if (!o.isSkinnedMesh) return;
    const n = o.geometry.attributes.position.count;
    // denso: con menos puntos la silueta perdía la punta del pulgar y las manos se rozaban
    for (let i = 0; i < n; i += 6) { const p = new THREE.Vector3(); o.getVertexPosition(i, p); pts.push(p.applyMatrix4(o.matrixWorld).applyMatrix4(inv)); }
  });
  inc.rotation.copy(guard); g.updateMatrixWorld(true);
  return pts;
}
// Ladea la mano (hasta 35°) para que la parte que toca quede abajo y nada más se meta en la piel.
// Devuelve el rectángulo que ocupa sobre la espalda y cuánto baja lo más bajo (z0, debería ser ~0).
function acomodarMano(g, pts) {
  const m = new THREE.Matrix4(), e = new THREE.Euler(), v = new THREE.Vector3();
  // zc = la piel de la parte que toca (lo más bajo cerca del punto de contacto); z = lo más bajo de toda la mano
  const minZ = (a, b) => {
    m.makeRotationFromEuler(e.set(a, b, 0)); let z = Infinity, zc = Infinity;
    for (const p of pts) { v.copy(p).applyMatrix4(m); z = Math.min(z, v.z); if (v.x * v.x + v.y * v.y < 0.025 * 0.025) zc = Math.min(zc, v.z); }
    return { z, zc: Math.min(zc, 0) };
  };
  let mejor = null;
  for (let a = -35; a <= 35; a += 5) for (let b = -35; b <= 35; b += 5) {
    const { z, zc } = minZ(a * Math.PI / 180, b * Math.PI / 180), costo = a * a + b * b;
    const ok = z >= zc - 0.003, sobra = z - zc; // sobra < 0: algo baja más que la parte que toca
    if (!mejor || (ok && (!mejor.ok || costo < mejor.costo)) || (!ok && !mejor.ok && sobra > mejor.sobra)) mejor = { a, b, ok, costo, sobra };
  }
  g.userData.inclina.rotation.set(mejor.a * Math.PI / 180, mejor.b * Math.PI / 180, 0);
  m.makeRotationFromEuler(g.userData.inclina.rotation);
  const caja = { z0: Infinity, silueta: null }, xy = [];
  for (const p of pts) {
    v.copy(p).applyMatrix4(m);
    caja.z0 = Math.min(caja.z0, v.z); caja.z1 = Math.max(caja.z1 ?? -Infinity, v.z); xy.push([v.x, v.y]);
  }
  caja.silueta = envolvente(xy); // la mano vista desde arriba
  // al voltearse (giro sobre el largo de la mano) lo más bajo de la mano a cada ángulo, para alzarla lo justo
  // gira sobre el centro de la mano (no sobre el punto de contacto, que puede estar en la orilla, como el pulgar)
  let xa = Infinity, xb = -Infinity;
  for (const [x] of xy) { xa = Math.min(xa, x); xb = Math.max(xb, x); }
  const xc = (xa + xb) / 2, zc = (caja.z0 + caja.z1) / 2;
  caja.eje = { x: xc, z: zc };
  caja.bajoGiro = [];
  for (let k = 0; k <= 12; k++) {
    const th = Math.PI * k / 12, c = Math.cos(th), s = Math.sin(th);
    let z = Infinity;
    for (const p of pts) { v.copy(p).applyMatrix4(m); z = Math.min(z, -(v.x - xc) * s + (v.z - zc) * c + zc); }
    caja.bajoGiro.push(z);
  }
  return caja;
}
// envolvente convexa 2D (cadena monótona)
function envolvente(P) {
  P = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cruz = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const p of P) { while (lo.length > 1 && cruz(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (hi.length > 1 && cruz(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}
// silueta de la mano sobre la espalda (con su lugar, giro y espejo de ahora)
function esquinas(g, caja) {
  const c = Math.cos(g.rotation.z), s = Math.sin(g.rotation.z);
  return caja.silueta.map(([x, y]) => { const xs = x * g.scale.x; return [g.position.x + xs * c - y * s, g.position.y + xs * s + y * c]; });
}
// ¿se tocan (o quedan a menos de "margen") dos siluetas convexas?
function seTocan(A, B, margen = 0.008) {
  for (const P of [A, B]) for (let i = 0; i < P.length; i++) {
    const [x1, y1] = P[i], [x2, y2] = P[(i + 1) % P.length];
    let nx = y1 - y2, ny = x2 - x1; const l = Math.hypot(nx, ny); if (l < 1e-9) continue; nx /= l; ny /= l;
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const [x, y] of A) { const d = x * nx + y * ny; a0 = Math.min(a0, d); a1 = Math.max(a1, d); }
    for (const [x, y] of B) { const d = x * nx + y * ny; b0 = Math.min(b0, d); b1 = Math.max(b1, d); }
    if (a1 + margen < b0 || b1 + margen < a0) return false;
  }
  return true;
}
// Dos manos: si se enciman, se abren en V sobre su punto de contacto (como lo haría una persona), sin moverlas del punto
const V_MIN = 5 * Math.PI / 180, V_MAX = 40 * Math.PI / 180; // cuánto se abren las manos (como una persona)
function abrirManos(manos) {
  if (manos.length < 2 || !manos.every(h => h.g.visible)) return;
  const [h1, h2] = manos, g1 = h1.g, g2 = h2.g;
  const b1 = g1.userData.rotBase ?? g1.rotation.z, b2 = g2.userData.rotBase ?? g2.rotation.z;
  const x1 = g1.userData.xBase ?? g1.position.x, x2 = g2.userData.xBase ?? g2.position.x;
  // lado según cómo las ves: la mano derecha (sin espejo) a tu derecha
  const l1 = Math.sign(g1.scale.x) || 1, l2 = g1.scale.x * g2.scale.x < 0 ? -l1 : (h2.s === h1.s ? l1 : -l1);
  const poner = (a, k, d) => {
    g1.rotation.z = b1 + k * l1 * a; g2.rotation.z = b2 + k * l2 * a;
    g1.position.x = x1 + h1.s * d; g2.position.x = x2 + h2.s * d;
  };
  const libres = (a, k, d) => { poner(a, k, d); return !seTocan(esquinas(g1, h1.caja), esquinas(g2, h2.caja)); };
  // natural: las muñecas un poco hacia afuera (los antebrazos vienen de los hombros) y las puntas hacia adentro
  // Se elige la apertura que menos aleje las manos de la guía (si no caben, se recorren hacia afuera lo justo)
  const nat = 1;
  let meta = null;
  for (const k of [nat, -nat]) for (let gr = V_MIN; gr <= V_MAX + 1e-6; gr += 5 * Math.PI / 180) {
    let d = 0;
    if (!libres(gr, k, 0)) { // búsqueda binaria (a 2 mm) de lo mínimo que hay que recorrerlas
      let lo = 0, hi = 0.08;
      while (hi - lo > 0.002) { const md = (lo + hi) / 2; if (libres(gr, k, md)) hi = md; else lo = md; }
      d = hi;
    }
    // recorrerlas saca los dedos de la guía: se prefiere abrirlas en V sobre su punto de contacto
    const costo = d * 3000 + gr * 57.3 * 0.25 + (k === nat ? 0 : 2);
    if (!meta || costo < meta.costo) meta = { a: gr, k, d, costo };
  }
  // suave: sin saltos de un cuadro a otro (y sin brincar de dirección)
  const ant = h1.abre;
  if (ant && ant.k !== meta.k && ant.a > 0.02) meta = { ...meta, a: 0, k: ant.k };
  // abrir rápido (para no encimarse nunca), cerrar despacio
  const ir = (x, y) => y > x ? y : x + (y - x) * 0.12;
  let sig = ant ? { k: meta.k, a: ir(ant.a, meta.a), d: ir(ant.d, meta.d) } : meta;
  if (!libres(sig.a, sig.k, sig.d)) sig = meta; // lo suave nunca a costa de que se toquen
  h1.abre = sig;
  poner(sig.a, sig.k, sig.d);
}

// ---------- transiciones entre pasos: la mano pasa de la pose y el lugar anteriores a los nuevos ----------
const DUR_TRANSICION = 0.9; // segundos
function fotoManos() {
  // cómo se ven ahora las manos 3D (por lado), para arrancar la siguiente desde ahí
  const fotos = {};
  for (const g of capaMov.children) {
    if (!g.userData.es3D || !g.userData.colocada) continue; // aunque ya se haya desvanecido
    fotos[g.userData.lado] = {
      huesos: Object.fromEntries(Object.entries(g.userData.huesos).map(([n, b]) => [n, b.quaternion.clone()])),
      pos: g.position.clone(), rotZ: g.rotation.z, escX: g.scale.x,
      orientY: g.userData.orient.rotation.y, modelo: g.userData.modelo.matrix.clone(),
      inclina: g.userData.inclina.quaternion.clone(),
      volteaQ: g.userData.voltea.quaternion.clone(), volteaZ: g.userData.voltea.position.z, volteaX: g.userData.voltea.position.x,
    };
  }
  return fotos;
}
// Cada paso: la mano hace 2 ciclos del movimiento, se voltea y enseña en rojo con qué parte se presiona,
// y luego se desvanece para que queden solo las guías.
const DUR_VOLTEO = 0.8, MOSTRAR_ROJO = 2.5, DUR_DESVANECER = 0.8; // segundos
const suave = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
// false: la mano ya no se voltea al final; la parte que toca aparece en rojo durante la primera pasada
const VOLTEAR_MANO = false, ROJO_ESPERA = 0.5, ROJO_FUNDIDO = 0.8; // segundos
function aplicarTransiciones() {
  const ahora = performance.now() / 1000;
  for (const g of capaMov.children) {
    if (!g.userData.es3D) continue;
    const ud = g.userData, edad = ahora - ud.nace, T = ud.verAntes ?? 2;
    // voltear: primero se alza y luego gira sobre el largo de la mano (palma hacia arriba)
    const kv = (edad - T) / DUR_VOLTEO;
    const giro = VOLTEAR_MANO ? suave(kv * 1.25 - 0.25) : 0;
    // (los tres ángulos: si la mano anterior venía volteada, su giro deja x y z en ±180° y la mano quedaría al revés)
    ud.voltea.rotation.set(0, Math.PI * giro, 0);
    // se alza antes de girar, y a cada ángulo nunca menos de lo que necesita para no meterse en la piel
    let alza = 0;
    if (ud.alzarGiro) {
      const f = giro * 12, i = Math.min(11, Math.floor(f)), r = f - i;
      alza = (ud.alzarGiro[i] * (1 - r) + ud.alzarGiro[i + 1] * r) * (VOLTEAR_MANO ? suave(kv * 4) : 0);
    }
    // giro alrededor del centro de la mano: se compensa la posición para que el eje quede fijo
    const ej = ud.eje || { x: 0, z: 0 }, th = Math.PI * giro, cs = Math.cos(th), sn = Math.sin(th);
    ud.voltea.position.x = ej.x - (ej.x * cs + ej.z * sn);
    ud.voltea.position.z = ej.z - (-ej.x * sn + ej.z * cs) + alza;
    // rojo: aparece al voltear y late suave
    if (VOLTEAR_MANO) ud.rojo.value = suave(kv) * (0.78 + 0.17 * Math.sin(ahora * 5));
    else { // en la primera pasada, la parte que toca se pinta de rojo poco a poco y se despinta
      const D = ud.pasada ?? 2.5, e0 = edad - ROJO_ESPERA;
      ud.rojo.value = 0.9 * suave(e0 / ROJO_FUNDIDO) * (1 - suave((e0 - (D - ROJO_FUNDIDO)) / ROJO_FUNDIDO));
    }
    // al final se desvanece y quedan solo las guías
    const alfa = 1 - suave((edad - T - (VOLTEAR_MANO ? DUR_VOLTEO + MOSTRAR_ROJO : 0)) / DUR_DESVANECER);
    for (const mt of ud.materiales) { mt.opacity = 0.92 * alfa; mt.depthWrite = alfa > 0.9; }
    if (alfa <= 0) g.visible = false;
    const de = g.userData.desde;
    if (!de || !g.visible) continue;
    const k = Math.min(1, (ahora - g.userData.t0) / DUR_TRANSICION), e = k * k * (3 - 2 * k);
    // dedos: de la pose anterior a la que pide el paso (aunque esta se mueva, como al amasar)
    for (const [n, b] of Object.entries(g.userData.huesos)) if (de.huesos[n]) b.quaternion.copy(de.huesos[n]).slerp(g.userData.objetivo[n], e);
    // lugar y giro de la mano
    g.position.lerpVectors(de.pos, g.position, e);
    g.position.z += 0.03 * Math.sin(Math.PI * e); // un saltito: al cambiar de lugar y de postura los dedos no rozan la piel
    const dz = Math.atan2(Math.sin(g.rotation.z - de.rotZ), Math.cos(g.rotation.z - de.rotZ));
    g.rotation.z = de.rotZ + dz * e;
    if (de.escX !== g.scale.x) g.scale.x = de.escX + (g.scale.x - de.escX) * e; // si cambia de mano, se "voltea"
    const o = g.userData.orient; o.rotation.y = de.orientY + (g.userData.orientFin - de.orientY) * e;
    const m = g.userData.modelo.matrix.elements, a = de.modelo.elements, b = g.userData.modeloFin.elements;
    for (let i = 0; i < 16; i++) m[i] = a[i] + (b[i] - a[i]) * e; // mismo tamaño; solo cambia el punto de contacto
    g.userData.modelo.matrixWorldNeedsUpdate = true;
    g.userData.inclina.quaternion.copy(de.inclina).slerp(g.userData.inclinaFin, e);
    // si la mano anterior estaba volteada, regresa a su lugar
    if (de.volteaQ) {
      const vt = g.userData.voltea;
      // (q y -q son el mismo giro; se toma el que regresa por el mismo lado por el que se volteó)
      const q0 = de.volteaQ, qa = q0.y < 0 ? new THREE.Quaternion(-q0.x, -q0.y, -q0.z, -q0.w) : q0;
      vt.quaternion.slerpQuaternions(qa, vt.quaternion.clone(), e);
      vt.position.z += (de.volteaZ - vt.position.z) * (1 - e); vt.position.x += ((de.volteaX ?? 0) - vt.position.x) * (1 - e);
      // mientras regresa de volteada gira sobre el largo de la mano: se alza lo justo a cada ángulo (como al voltear)
      const ang = 2 * Math.atan2(vt.quaternion.y, vt.quaternion.w);
      if (ang > 0.01 && g.userData.alzarGiro) {
        const gi = Math.min(1, ang / Math.PI), ej = g.userData.eje || { x: 0, z: 0 }, cs = Math.cos(ang), sn = Math.sin(ang);
        const f = gi * 12, i = Math.min(11, Math.floor(f)), r = f - i;
        const alza = g.userData.alzarGiro[i] * (1 - r) + g.userData.alzarGiro[i + 1] * r;
        vt.position.x = ej.x - (ej.x * cs + ej.z * sn);
        vt.position.z = Math.max(vt.position.z, ej.z - (-ej.x * sn + ej.z * cs) + alza);
      }
    }
    if (k >= 1) {
      g.userData.desde = null; o.rotation.y = g.userData.orientFin; g.userData.modelo.matrix.copy(g.userData.modeloFin);
      g.userData.inclina.quaternion.copy(g.userData.inclinaFin);
    }
  }
}

const acomodos = {}; // modelo|modo|pose -> cómo se ladea la mano y cuánto ocupa
// repetir la demostración de las manos (2 ciclos, voltear, rojo)
function reverManos() {
  const ahora = performance.now() / 1000;
  for (const g of capaMov.children) if (g.userData.es3D) { g.userData.nace = ahora; g.visible = true; }
}
const MOV_APOYO = { tipo: 'apoyo', pose: 'abierta' };
function crearAnimador(paso) {
  const fotos = fotoManos(), t0 = performance.now() / 1000;
  vaciar(capaMov);
  const mov = paso.movimiento, items = [], per = mov.periodo || 3;
  const COL = presionDe(paso).color;
  const cCol = new THREE.Color(COL), cTenue = new THREE.Color(COL).lerp(new THREE.Color(0xffffff), 0.55);
  const TENUE = cTenue.getHex();
  const tipoMano = tipoManoDe(paso);
  const centro = W(0, 0.5, 0);

  const manos = []; // manos 3D de este paso (para abrirlas en V si se enciman)
  // "apoyo": [u, v] = la otra mano sostiene ahí la parte del cuerpo (quieta, con la palma) mientras una trabaja
  const conApoyo = !!mov.apoyo && !mov.espejo;
  for (const s of (conApoyo ? [1, -1] : lados(mov))) {
    const esApoyo = conApoyo && s === -1;
    const movM = esApoyo ? MOV_APOYO : mov, tipoManoM = esApoyo ? 'palma' : tipoMano;
    // mano = dónde va tu mano ahora; bolita clarita = hacia dónde sigue el movimiento
    const real = manoGuia(movM, tipoManoM, COL), fant = bolitaGuia(TENUE);
    const es3D = !!real.userData.es3D;
    // la parte que toca va justo sobre la guía; la mano se ladea para que nada más se meta en la piel.
    // si la pose cambia en el paso (amasar: abre y cierra), se mide abierta y cerrada
    let caja = null;
    if (es3D) {
      const pd = poseDe(movM, tipoManoM), clave = [modeloMano, pd.modo, pd.pose, movM.tipo === 'amasar'].join('|');
      let ac = acomodos[clave];
      if (!ac) { // se mide una vez por modelo y postura (es lo más pesado al cambiar de paso)
        let pts = puntosMano(real);
        if (movM.tipo === 'amasar') { real.userData.hacia(pd.pose, 0.35); pts = pts.concat(puntosMano(real)); real.userData.pose(pd.pose); }
        const c = acomodarMano(real, pts);
        ac = acomodos[clave] = { caja: c, giro: real.userData.inclina.rotation.clone() };
      }
      real.userData.inclina.rotation.copy(ac.giro);
      caja = ac.caja;
      manos.push({ g: real, caja, s });
      real.userData.lado = s; real.userData.nace = t0;
      // 2 ciclos completos del movimiento (al menos 2 s) y luego se voltea; se alza lo justo para que el dorso no toque la piel
      real.userData.pasada = Math.max(per, 2.5); // lo que dura la primera pasada (se ve el rojo)
      real.userData.verAntes = Math.max(2 * per, real.userData.pasada + ROJO_ESPERA + 0.5, 2);
      // cuánto hay que alzarla a cada ángulo del giro para que nada quede a menos de 1,5 cm de la piel
      real.userData.alzarGiro = caja.bajoGiro.map(z => Math.max(0, 0.015 - (0.003 - caja.z0) - z));
      real.userData.eje = caja.eje;
      const de = fotos[s] ?? Object.values(fotos)[0];
      if (de) Object.assign(real.userData, { desde: de, t0, orientFin: real.userData.orient.rotation.y,
        modeloFin: real.userData.modelo.matrix.clone(), inclinaFin: real.userData.inclina.quaternion.clone() });
    }
    const refLado = W(s * 0.5, 0.5, 0);
    const poner = (m, pos, vis = true) => {
      m.visible = vis; if (!vis) return;
      m.position.set(pos.x, pos.y, m === real && es3D ? 0.003 : ALTURA * 2.5);
      if (m === real) {
        // guía fija sobre la espalda (no gira según desde dónde la veas): dedos hacia la cabeza,
        // mano derecha del lado derecho de la espalda y mano izquierda del izquierdo (el dibujo base es una mano derecha)
        m.scale.x = refLado.x >= centro.x || mov.espejo === false ? 1 : -1;
        // "giro": grados que se gira la mano sobre la piel (90 = atravesada, como al abrazar un brazo o una pierna)
        m.rotation.z = m.userData.rotBase = ((esApoyo ? mov.apoyoGiro : mov.giro) || 0) * Math.PI / 180 * m.scale.x;
        // si aun ladeada algo baja más que el punto de contacto (mano ahuecada, puño), se sube lo justo
        if (caja) m.position.z = 0.003 - caja.z0;
        if (es3D) { m.userData.colocada = true; m.userData.xBase = m.position.x; }
      }
    };

    if (esApoyo) {
      const pa = W(mov.apoyo[0], mov.apoyo[1], ALTURA * 1.5);
      items.push(() => { poner(real, pa); fant.visible = false; });

    } else if (mov.tipo === 'deslizar') {
      const fs = mov.trayectos.map(tr => {
        const pts = tr.map(([u, v]) => W(u * s, v, ALTURA * 1.5));
        capaMov.add(linea(pts, TENUE, 0.4), flecha(pts[pts.length - 2], pts[pts.length - 1], COL));
        const f = polilinea(pts), cola = [];
        for (let k = 0; k < 10; k++) { const p = punto(COL, 0.011 * (1 - k * 0.08)); p.material.opacity = 1 - k * 0.09; cola.push(p); capaMov.add(p); }
        items.push(t => cola.forEach((p, k) => p.position.copy(f(t / per - k * 0.012))));
        return f;
      });
      items.push(t => {
        const ph = t / per, f = fs[Math.floor(ph) % fs.length];
        const p = f(ph), pg = f(ph + 0.22);
        poner(real, p);
        poner(fant, pg);
      });

    } else if (mov.tipo === 'circulos') {
      const r = mov.radio || 0.02, cs = mov.centros.map(([u, v]) => W(u * s, v, ALTURA * 1.5));
      cs.forEach((c, j) => {
        const anillo = []; for (let a = 0; a <= 32; a++) anillo.push(c.clone().add(new THREE.Vector3(Math.cos(a / 32 * Math.PI * 2) * r, Math.sin(a / 32 * Math.PI * 2) * r, 0)));
        capaMov.add(linea(anillo, TENUE, 0.35));
        const cola = []; for (let k = 0; k < 6; k++) { const p = punto(COL, 0.008 * (1 - k * 0.1)); cola.push(p); capaMov.add(p); }
        items.push(t => {
          const activo = Math.floor(t / (per * 3)) % cs.length === j; // los círculos "suben" uno a uno
          cola.forEach((p, k) => {
            const a = (t / per - k * 0.04) * Math.PI * 2 * s;
            p.position.set(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, c.z);
            p.material.opacity = (activo ? 1 : 0.3) * (1 - k * 0.15);
          });
        });
      });
      items.push(t => {
        const j = Math.floor(t / (per * 3)) % cs.length, a = t / per * Math.PI * 2 * s;
        poner(real, cs[j].clone().add(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0)));
        poner(fant, cs[(j + 1) % cs.length], cs.length > 1);
      });

    } else if (mov.tipo === 'amasar') {
      const cs = mov.centros.map(([u, v]) => W(u * s, v, ALTURA * 1.5));
      cs.forEach((c, j) => {
        const toro = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.003, 8, 32), new THREE.MeshBasicMaterial({ color: COL, transparent: true, depthTest: false }));
        toro.position.copy(c); toro.renderOrder = 6; capaMov.add(toro);
        const a = punto(COL, 0.008), b = punto(COL, 0.008); capaMov.add(a, b);
        items.push(t => {
          const fase = Math.sin((t / per + j * 0.33) * Math.PI * 2);
          toro.scale.setScalar(0.7 + 0.35 * fase); toro.material.opacity = 0.5 + 0.4 * fase;
          const d = 0.012 + 0.018 * (1 + fase) / 2;
          a.position.set(c.x - d, c.y, c.z); b.position.set(c.x + d, c.y, c.z);
        });
      });
      items.push(t => {
        const j = Math.floor(t / (per * 3)) % cs.length;
        const ciclo = Math.sin(t / per * Math.PI * 2);
        poner(real, cs[j]);
        if (es3D) { const f = (1 + ciclo) / 2; real.userData.hacia(poseDe(mov, tipoMano).pose, 0.35 + 0.65 * f); } // agarra y suelta
        else real.scale.y = 1 + 0.06 * ciclo;
        poner(fant, cs[(j + 1) % cs.length], cs.length > 1);
      });

    } else if (mov.tipo === 'friccion') {
      const segs = mov.segmentos.map(([p0, p1]) => [W(p0[0] * s, p0[1], ALTURA * 1.5), W(p1[0] * s, p1[1], ALTURA * 1.5)]);
      const posEn = (j, t) => { const [a, b] = segs[j]; return a.clone().lerp(b, 0.5 + 0.5 * Math.sin((t / per + j * 0.25) * Math.PI * 2)); };
      segs.forEach(([a, b], j) => {
        capaMov.add(linea([a, b], TENUE, 0.4), flecha(a, b, COL), flecha(b, a, COL));
        const cola = []; for (let k = 0; k < 6; k++) { const p = punto(COL, 0.01 * (1 - k * 0.1)); p.material.opacity = 1 - k * 0.15; cola.push(p); capaMov.add(p); }
        items.push(t => cola.forEach((p, k) => p.position.copy(posEn(j, t - k * 0.03))));
      });
      items.push(t => {
        const j = Math.floor(t / (per * 4)) % segs.length, n = (j + 1) % segs.length;
        poner(real, posEn(j, t));
        poner(fant, segs[n][0].clone().lerp(segs[n][1], 0.5), segs.length > 1);
      });

    } else if (mov.tipo === 'presion') {
      // un punto a la vez: el círculo crece (presionar), se queda (sostener) y se encoge (soltar)
      const cs = mov.centros.map(([u, v]) => W(u * s, v, ALTURA * 1.5));
      cs.forEach((c, j) => {
        const anillo = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.0025, 8, 32), new THREE.MeshBasicMaterial({ color: TENUE, transparent: true, opacity: 0.35, depthTest: false }));
        const disco = new THREE.Mesh(new THREE.CircleGeometry(0.03, 32), new THREE.MeshBasicMaterial({ color: COL, transparent: true, opacity: 0.6, depthTest: false }));
        anillo.position.copy(c); disco.position.copy(c); anillo.renderOrder = disco.renderOrder = 6;
        capaMov.add(anillo, disco);
        items.push(t => {
          const activo = Math.floor(t / per) % cs.length === j;
          const f = (t / per) % 1;
          const tam = !activo ? 0 : f < 0.3 ? f / 0.3 : f < 0.8 ? 1 : 1 - (f - 0.8) / 0.2;
          disco.scale.setScalar(Math.max(0.01, tam)); disco.material.opacity = 0.25 + 0.55 * tam;
          disco.material.color.copy(cTenue).lerp(cCol, tam); // más color = más presión
          anillo.material.opacity = activo ? 0.9 : 0.3;
        });
      });
      items.push(t => {
        const j = Math.floor(t / per) % cs.length;
        poner(real, cs[j]); poner(fant, cs[(j + 1) % cs.length], cs.length > 1);
      });

    } else if (mov.tipo === 'percusion') {
      // golpecitos rápidos: puntos que "rebotan" sobre la piel
      const cs = mov.centros.map(([u, v]) => W(u * s, v, ALTURA * 1.5));
      cs.forEach((c, j) => {
        const golpes = [-1, 0, 1].map(k => { const p = punto(COL, 0.009); capaMov.add(p); return { p, dx: k * 0.025, fase: k * 0.33 }; });
        const sombra = new THREE.Mesh(new THREE.CircleGeometry(0.045, 24), new THREE.MeshBasicMaterial({ color: COL, transparent: true, opacity: 0.18, depthTest: false }));
        sombra.position.copy(c); sombra.renderOrder = 5; capaMov.add(sombra);
        items.push(t => golpes.forEach(({ p, dx, fase }) => {
          const z = Math.abs(Math.sin((t / per + fase + j * 0.2) * Math.PI));
          p.position.set(c.x + dx, c.y, c.z + z * 0.03);
          p.scale.setScalar(0.007 + 0.005 * (1 - z));
        }));
      });
      items.push(t => {
        const j = Math.floor(t / (per * 12)) % cs.length;
        // las dos manos se alternan: una sube mientras la otra pega
        const rebote = Math.abs(Math.sin((t / per + (s > 0 ? 0 : 0.5)) * Math.PI));
        poner(real, cs[j]); real.position.z += rebote * (es3D ? 0.06 : 0.03);
        poner(fant, cs[(j + 1) % cs.length], cs.length > 1);
      });
    }
  }
  return t => { items.forEach(f => f(t)); abrirManos(manos); };
}

// ---------- Rutina y temporizador ----------
let tAnim = 0; // segundos de animación del paso actual
function irAPaso(i) {
  estado.paso = i; estado.transcurrido = 0; estado.terminado = false; tAnim = 0;
  animador = crearAnimador(rutina.pasos[i]);
  dibujarPanel();
}
function anunciar() {
  const p = rutina.pasos[estado.paso];
  sonido(520, 0.12); setTimeout(() => sonido(780, 0.15), 160);
  const leer = () => hablar(`${p.nombre}. ${p.instruccion}`);
  if (p.audio && estado.voz) { try { new Audio(p.audio).play().catch(leer); return; } catch (e) {} }
  leer();
}
let segundoPrevio = -1;
function avanzarTiempo(dt) {
  if (estado.modo !== 'rutina' || !estado.corriendo) return;
  const paso = rutina.pasos[estado.paso];
  estado.transcurrido += dt;
  const resta = paso.duracion - estado.transcurrido;
  if (resta <= 3 && resta > 0 && Math.ceil(resta) !== segundoPrevio) sonido(440, 0.05);
  if (resta <= 0) {
    if (estado.paso < rutina.pasos.length - 1) { irAPaso(estado.paso + 1); anunciar(); }
    else {
      sonido(520, 0.3); hablar('Rutina terminada. Muy bien.');
      irAPaso(0); estado.enCurso = false; irAMenu(); estado.terminado = true; dibujarPanel();
      return;
    }
  }
  const s = Math.ceil(paso.duracion - estado.transcurrido);
  if (s !== segundoPrevio) { segundoPrevio = s; dibujarPanel(); }
}

// ---------- Sonido y voz ----------
let audioCtx = null;
function sonido(freq, dur) {
  try {
    audioCtx ??= new AudioContext();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.frequency.value = freq; g.gain.setValueAtTime(0.15, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    o.connect(g).connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + dur);
  } catch (e) {}
}
function hablar(texto) {
  if (!estado.voz || !('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(tr(texto)); u.lang = vozIdioma(); u.rate = 0.95;
    const v = speechSynthesis.getVoices().find(v => v.lang.startsWith(idioma)); if (v) u.voice = v;
    speechSynthesis.speak(u);
  } catch (e) {}
}

// ---------- Colocación del panel ----------
function mirarHorizontal(obj, objetivo) { const p = objetivo.clone(); p.y = obj.position.y; obj.lookAt(p); }
function colocarPanelFrente() {
  const pos = posCamara(), dir = direccionMirada();
  if (renderer.xr.isPresenting) { panel.position.copy(pos).addScaledVector(dir, 0.6); panel.position.y = pos.y - 0.12; }
  else panel.position.set(-0.05, 1.12, -0.6);
  panel.scale.setScalar(1);
  panel.rotation.set(0, 0, 0);
  mirarHorizontal(panel, pos);
  dibujarPanel();
}
function colocarPanelLado() { // para Ajustar: a un lado, para que no tape el dibujo
  const pos = posCamara(), dir = direccionMirada();
  if (renderer.xr.isPresenting) {
    const izq = new THREE.Vector3(dir.z, 0, -dir.x);
    panel.position.copy(pos).addScaledVector(dir, 0.6).addScaledVector(izq, 0.45); panel.position.y = pos.y - 0.1;
  } else panel.position.set(-0.55, 1.12, -0.35);
  panel.scale.setScalar(1);
  panel.rotation.set(0, 0, 0);
  mirarHorizontal(panel, pos);
  dibujarPanel();
}
function colocarPanelEspalda() {
  lienzo.updateWorldMatrix(true, false);
  const { max } = cajaContorno();
  const p = lienzo.localToWorld(new THREE.Vector3(0, max.y + 0.15, 0));
  panel.position.copy(p); panel.position.y += 0.36;
  panel.scale.setScalar(1.35); // queda más lejos que los otros paneles: más grande para leerlo desde la cadera
  encararPanel();
}
function encararPanel() { // de frente a ti aunque camines alrededor de la camilla
  panel.rotation.set(0, 0, 0);
  mirarHorizontal(panel, posCamara());
  panel.rotateX(-0.25);
}

// ---------- Menú de muñeca (mano izquierda, palma hacia ti) ----------
const muneca = new THREE.Group(); muneca.visible = false; scene.add(muneca);
const munecaCanvas = document.createElement('canvas'); munecaCanvas.width = 512; munecaCanvas.height = 160;
const munecaTex = texturaTexto(munecaCanvas);
const MUN_W = 0.13, MUN_H = MUN_W * 160 / 512;
const munecaPlano = new THREE.Mesh(new THREE.PlaneGeometry(MUN_W, MUN_H),
  new THREE.MeshBasicMaterial({ map: munecaTex, transparent: true, depthTest: false }));
munecaPlano.renderOrder = 25; muneca.add(munecaPlano);
const BOTONES_MUNECA = [{ id: 'ajustar', t: '⟲ Ajustar', x: 8, y: 8, w: 244, h: 144 }, { id: 'menu', t: '☰ Menú', x: 260, y: 8, w: 244, h: 144 }];
function dibujarMuneca() {
  const g = munecaCanvas.getContext('2d'); g.clearRect(0, 0, 512, 160);
  if (!g.traducido) { const escribir = g.fillText.bind(g); g.fillText = (texto, ...resto) => escribir(tr(texto), ...resto); g.traducido = true; }
  for (const b of BOTONES_MUNECA) {
    const t = b.id === 'ajustar' && estado.modo === 'ajustar' ? '✓ Listo' : b.t;
    dibujarBoton(g, 'm_' + b.id, t, b.x, b.y, b.w, b.h, b.id === 'ajustar', 46);
  }
  munecaTex.needsUpdate = true;
}
dibujarMuneca();
function botonMunecaEn(p) {
  const px = (p.x / MUN_W + 0.5) * 512, py = (0.5 - p.y / MUN_H) * 160;
  return BOTONES_MUNECA.find(b => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) ?? null;
}

// ---------- Entrada XR ----------
const raycaster = new THREE.Raycaster();
const tmpMat = new THREE.Matrix4();
const controladores = [0, 1].map(i => {
  const c = renderer.xr.getController(i);
  const rayo = linea([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)], 0xffffff, 0.6);
  rayo.visible = false; c.add(rayo); c.userData.rayo = rayo;
  c.addEventListener('connected', ev => { c.userData.fuente = ev.data; });
  c.addEventListener('disconnected', () => { c.userData.fuente = null; rayo.visible = false; });
  c.addEventListener('selectstart', () => alSeleccionar(i));
  c.addEventListener('selectend', () => { if (agarre?.quien === i) soltar(); });
  scene.add(c);
  return c;
});
const manos = [0, 1].map(i => { const h = renderer.xr.getHand(i); scene.add(h); return h; });
const miras = [0, 1].map(() => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.006, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
  m.renderOrder = 31; m.visible = false; scene.add(m); return m;
});

function posPellizco(i, out = new THREE.Vector3()) {
  const ctrl = controladores[i], fuente = ctrl.userData.fuente;
  if (!fuente) return null;
  if (fuente.hand) {
    const j = manos[i].joints, ind = j['index-finger-tip'], pul = j['thumb-tip'];
    if (!ind || !pul || !ind.visible) return null;
    return ind.getWorldPosition(out).add(pul.getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5);
  }
  return ctrl.getWorldPosition(out);
}
function rayoDesde(ctrl) {
  tmpMat.identity().extractRotation(ctrl.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(ctrl.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tmpMat);
}
function alSeleccionar(i) {
  const ctrl = controladores[i];
  rayoDesde(ctrl);
  if (panel.visible) {
    const hit = raycaster.intersectObject(panel)[0];
    if (hit && pulsar(botonEnUV(hit.uv))) return;
  }
  if (estado.modo !== 'ajustar') return;
  // 1) agarrar con la mano/punta del control si hay un asa cerca
  const pp = posPellizco(i);
  const cerca = pp && asaCercana(pp);
  if (cerca) { iniciarAgarre(cerca, () => posPellizco(i), i); return; }
  // 2) agarrar a distancia con el rayo
  const r = asaConRayo();
  if (r) {
    const dist = r.dist;
    iniciarAgarre(r.asa, () => {
      rayoDesde(controladores[i]);
      if (r.asa.tipo === 'centro') return raycaster.ray.at(dist, new THREE.Vector3());
      return raycaster.ray.intersectPlane(planoPlantilla(), new THREE.Vector3());
    }, i);
  }
}

const local = new THREE.Vector3();
const botonesPrevios = [[], []];
const dedoEn = {}; // qué botón está tocando cada dedo (para no repetir la pulsación mientras no se retire)
function procesarEntradaXR() {
  const cab = posCamara();
  let hover = null, nuevaAsaHover = null;
  let manoIzq = -1, manoDer = -1;
  controladores.forEach((ctrl, i) => {
    const f = ctrl.userData.fuente;
    miras[i].visible = false; ctrl.userData.rayo.visible = false;
    if (!f) return;
    if (f.hand) { if (f.handedness === 'left') manoIzq = i; else manoDer = i; }

    // Botones físicos: X / Y del control izquierdo = Ajustar;  A del derecho = pausa
    if (f.gamepad && !f.hand) {
      const ahora = f.gamepad.buttons.map(b => b.pressed);
      ahora.forEach((p, b) => {
        if (p && !botonesPrevios[i][b]) {
          if (f.handedness === 'left' && b >= 4) alternarAjuste();
          if (f.handedness === 'right' && b === 4 && estado.modo === 'rutina') accion('pausa');
        }
      });
      botonesPrevios[i] = ahora;
    }

    rayoDesde(ctrl);
    const hit = panel.visible ? raycaster.intersectObject(panel)[0] : null;
    let largo = f.hand ? 0 : 1.5;
    if (hit) {
      miras[i].position.copy(hit.point); miras[i].visible = true;
      const id = botonEnUV(hit.uv); if (id) hover = id;
      largo = hit.distance;
    } else if (estado.modo === 'ajustar' && capaAsas.visible && !agarre) {
      const pp = posPellizco(i);
      const cerca = pp && asaCercana(pp);
      if (cerca) nuevaAsaHover = cerca;
      else { const r = asaConRayo(); if (r) { nuevaAsaHover = r.asa; largo = r.dist; miras[i].position.copy(raycaster.ray.at(r.dist, new THREE.Vector3())); miras[i].visible = true; } }
    }
    if (largo > 0) { ctrl.userData.rayo.scale.z = largo; ctrl.userData.rayo.visible = true; }
  });

  // Toque directo del panel con la yema del índice
  // (un toque = una pulsación: hay que retirar el dedo para volver a pulsar, salvo Subir/Bajar que se repiten)
  manos.forEach((h, hi) => {
    const tip = h.joints?.['index-finger-tip'];
    let tocando = null;
    if (tip && tip.visible && panel.visible) {
      panel.worldToLocal(tip.getWorldPosition(local));
      if (Math.abs(local.x) < PANEL_W / 2 && Math.abs(local.y) < PANEL_H / 2 && local.z > -0.02 && local.z < 0.06) {
        const id = botonEnUV(new THREE.Vector2(local.x / PANEL_W + 0.5, local.y / PANEL_H + 0.5));
        if (id) { hover = id; if (Math.abs(local.z) < 0.015) tocando = id; }
      }
    }
    if (tocando && (dedoEn[hi] !== tocando || REPETIBLES[tocando])) pulsar(tocando);
    dedoEn[hi] = tocando;
  });

  // Menú de muñeca: aparece cuando miras la palma izquierda
  muneca.visible = false;
  let tocaMuneca = null;
  if (manoIzq >= 0 && !agarre) {
    const j = manos[manoIzq].joints;
    const w = j['wrist'], im = j['index-finger-metacarpal'], pm = j['pinky-finger-metacarpal'];
    if (w && im && pm && w.visible) {
      const pw = w.getWorldPosition(new THREE.Vector3());
      const a = im.getWorldPosition(new THREE.Vector3()).sub(pw), b = pm.getWorldPosition(new THREE.Vector3()).sub(pw);
      const normalPalma = new THREE.Vector3().crossVectors(b, a).normalize();
      if (normalPalma.dot(cab.clone().sub(pw).normalize()) > 0.65) {
        muneca.position.copy(pw).addScaledVector(a, 0.5).addScaledVector(b, 0.5).addScaledVector(normalPalma, 0.07);
        muneca.lookAt(cab); muneca.visible = true; muneca.updateMatrixWorld(true);
        const tip = manoDer >= 0 ? manos[manoDer].joints['index-finger-tip'] : null;
        if (tip && tip.visible) {
          munecaPlano.worldToLocal(tip.getWorldPosition(local));
          const b2 = botonMunecaEn(local);
          if (b2 && local.z > -0.02 && local.z < 0.05) { hover = 'm_' + b2.id; if (Math.abs(local.z) < 0.015) tocaMuneca = 'm_' + b2.id; }
        }
      }
    }
  }
  if (tocaMuneca && dedoEn.muneca !== tocaMuneca) pulsar(tocaMuneca);
  dedoEn.muneca = tocaMuneca;
  ponerHover(hover);
  asaHover = nuevaAsaHover;
  moverAgarre();
}

// ---------- Entrada en PC (ratón) ----------
const mouse = new THREE.Vector2(); let abajo = null;
function rayoRaton(e) {
  mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(mouse, camera);
}
renderer.domElement.addEventListener('pointerdown', e => {
  abajo = [e.clientX, e.clientY];
  if (estado.modo !== 'ajustar' || renderer.xr.isPresenting) return;
  rayoRaton(e);
  if (panel.visible && raycaster.intersectObject(panel)[0]) return;
  const r = asaConRayo();
  if (r) {
    controls.enabled = false;
    // en el PC el centro se mueve sobre el plano (la altura con ▲ ▼)
    iniciarAgarre(r.asa, () => raycaster.ray.intersectPlane(planoPlantilla(), new THREE.Vector3()), 'raton');
  }
});
renderer.domElement.addEventListener('pointermove', e => {
  rayoRaton(e);
  if (agarre?.quien === 'raton') { moverAgarre(); return; }
  const hp = panel.visible ? raycaster.intersectObject(panel)[0] : null;
  const id = hp ? botonEnUV(hp.uv) : null;
  ponerHover(id);
  asaHover = !hp && estado.modo === 'ajustar' ? asaConRayo()?.asa ?? null : null;
  renderer.domElement.style.cursor = id ? 'pointer' : asaHover ? 'grab' : '';
});
renderer.domElement.addEventListener('pointerup', e => {
  if (agarre?.quien === 'raton') { soltar(); controls.enabled = true; return; }
  if (!abajo || Math.hypot(e.clientX - abajo[0], e.clientY - abajo[1]) > 5) return;
  rayoRaton(e);
  const hp = raycaster.intersectObject(panel)[0];
  if (hp) pulsar(botonEnUV(hp.uv));
});
addEventListener('keydown', e => { if (e.key === 'a' || e.key === 'A') alternarAjuste(); });
document.getElementById('btnDemo').onclick = () => accion('restablecer');

// ---------- Botón de realidad mixta ----------
const btnAR = document.getElementById('btnAR'), txtEstado = document.getElementById('estado');
function mostrarAviso() {
  // en la red de casa, la dirección la da el servidor; publicada en internet, es la de la propia página
  fetch('./direccion.json').then(r => r.json()).then(d => { document.getElementById('url').textContent = d.url; })
    .catch(() => { document.getElementById('url').textContent = location.origin + location.pathname; });
  document.getElementById('aviso').hidden = false;
  txtEstado.textContent = tr('Vista previa en el PC: arrastra las asas del dibujo con el mouse. Tecla A = Ajustar / Listo.');
}
async function prepararXR() {
  if (!navigator.xr) { mostrarAviso(); return; }
  const ok = await navigator.xr.isSessionSupported('immersive-ar').catch(() => false);
  if (!ok) { mostrarAviso(); return; }
  btnAR.disabled = false; btnAR.classList.add('grande');
  txtEstado.textContent = tr('Listo. Toca "Entrar en 3D".');
  btnAR.onclick = async () => {
    try {
      const sesion = await navigator.xr.requestSession('immersive-ar', { optionalFeatures: ['local-floor', 'hand-tracking'] });
      await renderer.xr.setSession(sesion);
    } catch (e) { txtEstado.textContent = tr('No se pudo iniciar: ' + e.message); }
  };
}
let iniciarEnXR = false;
renderer.xr.addEventListener('sessionstart', () => {
  // Fondo 100% transparente: se ve el cuarto real (passthrough) y encima solo lo que dibuja la app
  maniqui.visible = false; scene.background = null;
  renderer.setClearColor(0x000000, 0);
  const modo = renderer.xr.getSession()?.environmentBlendMode;
  estado.sinPassthrough = modo === 'opaque';
  audioCtx?.resume?.();
  iniciarEnXR = true;
});
renderer.xr.addEventListener('sessionend', () => {
  maniqui.visible = true; scene.background = FONDO;
  estado.enCurso = false; estado.terminado = false; agarre = null;
  muneca.visible = false; miras.forEach(m => m.visible = false);
  colocado = {}; colocarPlantillaInicial(); actualizarFigura(); irAElegir();
});

// ---------- Bucle ----------
const reloj = new THREE.Clock();
function cuadro() {
  const dt = Math.min(reloj.getDelta(), 0.1), t = reloj.elapsedTime;
  if (iniciarEnXR && renderer.xr.isPresenting) { // al entrar: elegir masaje; luego aparece el dibujo
    iniciarEnXR = false; colocado = {}; estado.enCurso = false; irAElegir();
  }
  avanzarTiempo(dt);
  if (renderer.xr.isPresenting) procesarEntradaXR();
  if (plantilla.visible) {
    tAnim += dt;
    resaltarZonas(t);
    if (estado.modo !== 'ajustar') { animador?.(tAnim); aplicarTransiciones(); } // en Ajustar no se ven: no se calculan
    if (estado.modo === 'rutina') encararPanel();
  }
  resaltarAsas();
  const cp = posCamara();
  asas.forEach(a => { if (a.etiqueta) { a.etiqueta.lookAt(cp); } });
  if (Object.values(ultimoToque).some(v => { const d = performance.now() - v; return d > 250 && d < 300; })) { dibujarPanel(); dibujarMuneca(); }
  const enPC = !renderer.xr.isPresenting;
  if (plantilla.visible || enPC) {
    const S = parte.secciones;
    guia.dibujar({ id: parte.id, espejo: volteado, Q0: W(0, S[0].v, 0), Q1: W(0, S[S.length - 1].v, 0), caja: cajaContorno() }, plantilla.visible && estado.modo === 'rutina');
  } else guia.pantalla.visible = false;
  // en el PC, el mismo maniquí hace de persona acostada (en los lentes se ve a la persona de verdad).
  // Se ve siempre, también al elegir masaje o en el menú, cuando el dibujo está guardado.
  const verManiqui = enPC && guia.listo;
  guia.grupo.visible = verManiqui; cuerpoPrueba.visible = camilla.visible = !verManiqui; // el maniquí trae su propia camilla
  const soloManiqui = verManiqui && !plantilla.visible, capas = [capaFigura, capaZonas, capaMov, capaAsas];
  if (soloManiqui) { plantilla.visible = true; for (const c of capas) { c.userData.seVeia = c.visible; c.visible = false; } }
  aplicarTransp();
  renderer.render(scene, camera);
  if (soloManiqui) { plantilla.visible = false; for (const c of capas) c.visible = c.userData.seVeia; }
  restaurarTransp();
}
renderer.setAnimationLoop(cuadro);
window.app.cuadro = cuadro; // para pruebas: avanzar un cuadro a mano cuando la pestaña está oculta
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight);
});

// ---------- Inicio ----------
Promise.all([fetch('./rutinas.json').then(r => r.json()),
  fetch('./rutinas_cuerpo.json').then(r => r.json()).catch(() => ({})), cargarIdioma()]).then(([r, extra]) => {
  // en inglés: se traducen los textos de las rutinas y de las partes del cuerpo, y se rehacen los letreros ya hechos
  traducirDatos(r); traducirDatos(extra); traducirDatos(PARTES);
  if (idioma === 'en') { // en español "dedos" sirve para manos y pies; en inglés los del pie son "toes"
    const pie = PARTES.find(p => p.id === 'pie');
    for (const sec of pie.secciones) if (sec.nombre === 'Fingers') sec.nombre = 'Toes';
    for (const z of Object.values(pie.zonas)) if (z.etiqueta === 'Fingers') z.etiqueta = 'Toes';
  }
  tomarParte(parte); rehacerAsasVertice();
  datos = r;
  datos.modulos = PARTES.map(p => ({ parte: p, tipos: p.id === 'espalda' ? r.tipos : (extra.modulos?.[p.id] || []) }));
  cargarEleccion();
  armarRutina();
  colocarPlantillaInicial();
  irAPaso(0);
  actualizarFigura();
  aplicarTranspPanel();
  irAElegir();
  prepararXR();
  cargarMano3D(modeloMano).then(rehacerAnimador).catch(e => console.warn('No se pudo cargar la mano 3D', e));
  Object.assign(window.app, { guia, estado, irAPaso, mostrarRutina, accion, armarRutina, manos3D, scene, capaMov, cambiarParte, PARTES, W });
  Object.defineProperty(window.app, 'datos', { get: () => datos, configurable: true });
  Object.defineProperty(window.app, 'rutina', { get: () => rutina, configurable: true });
}).catch(e => txtEstado.textContent = tr('No se pudo cargar rutinas.json: ' + e.message));
