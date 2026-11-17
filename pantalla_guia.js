// Pantalla guía: una pantallita junto al panel que muestra un maniquí acostado y las manos haciendo el movimiento del paso.
// El maniquí (maniqui/maniqui.glb, sin huesos, en pose de T) se acomoda aquí moviendo sus vértices por articulaciones,
// y se ajusta al dibujo que el usuario acomodó sobre la persona. Las manos son las mismas de la guía (no se duplican):
// se dibuja la misma escena otra vez, vista desde otra cámara, hacia una textura.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ---------- El maniquí (metros; de pie: y arriba, frente en +z, su lado derecho en -x) ----------
const BRAZO = { y: 1.357, z: -0.043, hombro: 0.20, codo: 0.54, muneca: 0.69, punta: 0.875 };
const PIERNA = { x: 0.09, z: -0.035, tobillo: 0.09, rodilla: 0.50, cadera: 0.90 };
const suave = (a, b, x) => { x = Math.min(1, Math.max(0, (x - a) / (b - a))); return x * x * (3 - 2 * x); };
const G = Math.PI / 180;

// Posturas: lista de giros. Cada giro: peso(x, y, z en reposo) -> 0..1, un punto del eje, el eje y el ángulo.
// Se aplican de la punta hacia el tronco (así los ejes valen en la pose de reposo).
function giros(id, lado) {
  const L = [];
  const brazoAbajo = (s, ang) => L.push({ // baja el brazo hacia el costado (ang = cuánto baja desde la T)
    peso: (x, y) => y > 1.2 && s * x > 0 ? suave(0.165, 0.225, s * x) : 0,
    p: [s * BRAZO.hombro, BRAZO.y, BRAZO.z], eje: [0, 0, 1], ang: -s * ang },
    { // y lo deja caer hasta descansar sobre la camilla (en la T queda unos 9 cm más alto que el pecho)
      peso: (x, y) => y > 1.2 && s * x > 0 ? suave(0.165, 0.225, s * x) : 0,
      p: [s * BRAZO.hombro, BRAZO.y, BRAZO.z], eje: [1, 0, 0], ang: -(ang > 60 * G ? 8 : 11) * G });
  const torcerBrazo = s => L.push({ // gira el brazo sobre su largo, poco a poco del hombro a la muñeca: la palma queda hacia la espalda
    peso: (x, y) => y > 1.2 && s * x > 0 ? suave(0.25, BRAZO.muneca, s * x) : 0,
    p: [0, BRAZO.y, BRAZO.z], eje: [1, 0, 0], ang: 90 * G });
  const doblarRodilla = s => L.push({ // boca abajo, la espinilla sube: la planta del pie queda hacia arriba
    peso: (x, y) => y < 0.62 && s * x > 0 ? 1 - suave(PIERNA.rodilla - 0.03, PIERNA.rodilla + 0.03, y) : 0,
    p: [0, PIERNA.rodilla, PIERNA.z], eje: [1, 0, 0], ang: 90 * G });
  if (id === 'mano') torcerBrazo(lado);
  if (id === 'pie') doblarRodilla(lado);
  for (const s of [1, -1]) brazoAbajo(s, (id === 'brazo' || id === 'mano') && s === lado ? 64 * G : 78 * G);
  return L;
}
// Qué parte del maniquí corresponde al dibujo: P0 = centro de la primera sección, P1 = centro de la última, N = hacia afuera de la piel
function referencias(id, s) {
  const N = [0, 0, -1];
  if (id === 'espalda') return { P0: [0, 0.93, -0.12], P1: [0, 1.385, -0.12], N };
  if (id === 'pierna') return { P0: [s * PIERNA.x, PIERNA.tobillo, -0.05], P1: [s * PIERNA.x, PIERNA.cadera, -0.05], N };
  if (id === 'brazo') return { P0: [s * BRAZO.muneca, BRAZO.y, BRAZO.z], P1: [s * BRAZO.hombro, BRAZO.y, BRAZO.z], N };
  if (id === 'mano') return { P0: [s * BRAZO.muneca, BRAZO.y, BRAZO.z], P1: [s * BRAZO.punta, BRAZO.y, BRAZO.z], N };
  return { P0: [s * 0.105, 0.0, -0.095], P1: [s * 0.105, 0.0, 0.15], N: [0, -1, 0] }; // pie: del talón a los dedos
}
const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _e = new THREE.Vector3();
function mover(L, x0, y0, z0, out) {
  out.set(x0, y0, z0);
  for (const g of L) {
    const w = g.peso(x0, y0, z0); if (w <= 0) continue;
    _q.setFromAxisAngle(_e.fromArray(g.eje), g.ang * w);
    out.sub(_v.fromArray(g.p)).applyQuaternion(_q).add(_v);
  }
  return out;
}

export function crearPantallaGuia({ renderer, scene, lienzo, capaMov, ocultar, panel, anchoPanel, altoPanel }) {
  const TAM = 512, LADO = 0.3;
  const rt = new THREE.WebGLRenderTarget(TAM, TAM, { samples: 4 });
  const pantalla = new THREE.Mesh(new THREE.PlaneGeometry(LADO, LADO),
    new THREE.MeshBasicMaterial({ map: rt.texture, depthTest: false, transparent: true }));
  const marco = new THREE.Mesh(new THREE.PlaneGeometry(LADO + 0.012, LADO + 0.012),
    new THREE.MeshBasicMaterial({ color: 0x3fa9ff, depthTest: false, transparent: true, opacity: 0.85 }));
  marco.renderOrder = 19; pantalla.renderOrder = 20;
  pantalla.raycast = marco.raycast = () => {}; // que no estorbe a los botones del panel
  pantalla.add(marco); marco.position.z = -0.001;
  // arriba a la derecha del panel
  pantalla.position.set(anchoPanel / 2 + LADO / 2 + 0.02, altoPanel / 2 - LADO / 2, 0);
  pantalla.visible = false; panel.add(pantalla);

  const grupo = new THREE.Group(); grupo.visible = false; grupo.matrixAutoUpdate = false; lienzo.add(grupo);
  const piel = new THREE.MeshStandardMaterial({ color: 0xd2a684, roughness: 0.7, metalness: 0, side: THREE.DoubleSide });
  const camara = new THREE.PerspectiveCamera(28, 1, 0.05, 20);
  const FONDO = new THREE.Color(0x1a2230);
  let malla = null, reposo = null, clavePose = '', claveAjuste = '', mapa = null, minZ = 0;

  new GLTFLoader().load('./maniqui/maniqui.glb', gltf => {
    gltf.scene.traverse(o => { if (o.isMesh && !malla) malla = o; });
    malla.updateWorldMatrix(true, false);
    const geo = malla.geometry.clone().applyMatrix4(malla.matrixWorld);
    reposo = geo.attributes.position.array.slice();
    malla = new THREE.Mesh(geo, piel); malla.frustumCulled = false; grupo.add(malla, camilla());
  }, undefined, e => console.warn('No se pudo cargar el maniquí', e));

  // Camilla de masaje donde descansa el maniquí boca abajo (en sus mismas medidas: y = largo, z = hacia abajo de la camilla).
  // Los pies cuelgan del borde, como en una camilla de verdad.
  function camilla() {
    const c = new THREE.Group(), Z = 0.1, AN = 0.47, Y0 = 0.13, Y1 = 1.8, R = 0.07;
    const f = new THREE.Shape();
    f.moveTo(-AN + R, Y0); f.lineTo(AN - R, Y0); f.quadraticCurveTo(AN, Y0, AN, Y0 + R); f.lineTo(AN, Y1 - R); f.quadraticCurveTo(AN, Y1, AN - R, Y1);
    f.lineTo(-AN + R, Y1); f.quadraticCurveTo(-AN, Y1, -AN, Y1 - R); f.lineTo(-AN, Y0 + R); f.quadraticCurveTo(-AN, Y0, -AN + R, Y0);
    const cojin = new THREE.Mesh(new THREE.ExtrudeGeometry(f, { depth: 0.06, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 3, curveSegments: 8 }),
      new THREE.MeshStandardMaterial({ color: 0x2e6f86, roughness: 0.55 }));
    cojin.position.z = Z + 0.012;
    const madera = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.8 });
    const marco = new THREE.Mesh(new THREE.BoxGeometry(AN * 2 - 0.08, Y1 - Y0 - 0.08, 0.04), madera);
    marco.position.set(0, (Y0 + Y1) / 2, Z + 0.105);
    c.add(cojin, marco);
    for (const x of [-1, 1]) for (const y of [Y0 + 0.14, Y1 - 0.14]) {
      const pata = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.6), madera);
      pata.position.set(x * (AN - 0.09), y, Z + 0.42); c.add(pata);
    }
    const piso = new THREE.Mesh(new THREE.CircleGeometry(1.6, 48), new THREE.MeshStandardMaterial({ color: 0x232d3d, roughness: 1 }));
    piso.rotation.x = Math.PI; piso.position.set(0, (Y0 + Y1) / 2, Z + 0.725); c.add(piso);
    c.traverse(o => { o.frustumCulled = false; });
    return c;
  }
  // pone al maniquí en la postura de esa parte del cuerpo
  function posar(id, lado) {
    const L = giros(id, lado), pos = malla.geometry.attributes.position, a = pos.array, p = new THREE.Vector3();
    for (let i = 0; i < a.length; i += 3) { mover(L, reposo[i], reposo[i + 1], reposo[i + 2], p); a[i] = p.x; a[i + 1] = p.y; a[i + 2] = p.z; }
    pos.needsUpdate = true; malla.geometry.computeVertexNormals();
    return L;
  }
  // lo ajusta al dibujo: Q0 y Q1 son los centros de la primera y la última sección del dibujo (en el lienzo)
  function ajustar(id, L, lado, Q0, Q1, espejo, caja) {
    const r = referencias(id, lado);
    const P0 = mover(L, ...r.P0, new THREE.Vector3()), P1 = mover(L, ...r.P1, new THREE.Vector3());
    // el maniquí siempre queda bien acostado boca abajo: "arriba" es su espalda, sea cual sea la parte
    const n = new THREE.Vector3(0, 0, -1);
    const y = P1.clone().sub(P0); y.addScaledVector(n, -y.dot(n)); const largo = y.length(); y.normalize();
    const x = new THREE.Vector3().crossVectors(y, n);
    const d = new THREE.Vector2(Q1.x - Q0.x, Q1.y - Q0.y), k = d.length() / largo, giro = Math.atan2(-d.x, d.y);
    // maniquí -> ejes del dibujo (x a la derecha, y hacia donde sube v, z hacia afuera de la piel)
    const B = new THREE.Matrix4().makeBasis(x, y, n).transpose();
    const M = new THREE.Matrix4().makeTranslation(Q0.x, Q0.y, 0)
      .multiply(new THREE.Matrix4().makeRotationZ(giro))
      .multiply(new THREE.Matrix4().makeScale(espejo ? -k : k, k, k))
      .multiply(B).multiply(new THREE.Matrix4().makeTranslation(-P0.x, -P0.y, -P0.z));
    // relieve de la piel dentro del dibujo (para asentar las manos) y el punto más bajo del cuerpo (para la camilla de prueba)
    const N = 96, x0 = caja.min.x - 0.05, y0 = caja.min.y - 0.05, an = caja.max.x - caja.min.x + 0.1, al = caja.max.y - caja.min.y + 0.1;
    const h = new Float32Array(N * N).fill(-Infinity), a = malla.geometry.attributes.position.array, idx = malla.geometry.index.array;
    const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    minZ = Infinity;
    for (let t = 0; t < idx.length; t += 3) {
      for (let j = 0; j < 3; j++) { v[j].fromArray(a, idx[t + j] * 3).applyMatrix4(M); minZ = Math.min(minZ, v[j].z); }
      const [A, Bv, C] = v;
      const i0 = Math.max(0, Math.floor((Math.min(A.x, Bv.x, C.x) - x0) / an * N)), i1 = Math.min(N - 1, Math.floor((Math.max(A.x, Bv.x, C.x) - x0) / an * N));
      const j0 = Math.max(0, Math.floor((Math.min(A.y, Bv.y, C.y) - y0) / al * N)), j1 = Math.min(N - 1, Math.floor((Math.max(A.y, Bv.y, C.y) - y0) / al * N));
      if (i0 > i1 || j0 > j1) continue;
      const den = (Bv.y - C.y) * (A.x - C.x) + (C.x - Bv.x) * (A.y - C.y); if (Math.abs(den) < 1e-12) continue;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const px = x0 + (i + 0.5) / N * an, py = y0 + (j + 0.5) / N * al;
        const w1 = ((Bv.y - C.y) * (px - C.x) + (C.x - Bv.x) * (py - C.y)) / den, w2 = ((C.y - A.y) * (px - C.x) + (A.x - C.x) * (py - C.y)) / den, w3 = 1 - w1 - w2;
        if (w1 < -0.02 || w2 < -0.02 || w3 < -0.02) continue;
        const z = w1 * A.z + w2 * Bv.z + w3 * C.z; if (z > h[j * N + i]) h[j * N + i] = z;
      }
    }
    // la piel más alta dentro del dibujo queda al ras del lienzo (z = 0)
    let tope = -Infinity;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const px = x0 + (i + 0.5) / N * an, py = y0 + (j + 0.5) / N * al;
      if (px > caja.min.x + 0.03 && px < caja.max.x - 0.03 && py > caja.min.y + 0.03 && py < caja.max.y - 0.03) tope = Math.max(tope, h[j * N + i]);
    }
    if (!isFinite(tope)) tope = 0;
    for (let i = 0; i < h.length; i++) h[i] = isFinite(h[i]) ? h[i] - tope : NaN;
    minZ -= tope;
    grupo.matrix.copy(new THREE.Matrix4().makeTranslation(0, 0, -tope).multiply(M)); grupo.matrixWorldNeedsUpdate = true;
    mapa = { N, x0, y0, an, al, h };
  }
  // altura de la piel (≤ 0) en un punto del lienzo
  function altura(x, y) {
    if (!mapa) return 0;
    const { N, x0, y0, an, al, h } = mapa;
    let z = -Infinity, hay = false;
    for (const [dx, dy] of [[0, 0], [0.018, 0], [-0.018, 0], [0, 0.018], [0, -0.018]]) {
      const i = Math.floor((x + dx - x0) / an * N), j = Math.floor((y + dy - y0) / al * N);
      if (i < 0 || j < 0 || i >= N || j >= N) continue;
      const q = h[j * N + i]; if (q === q) { z = Math.max(z, q); hay = true; }
    }
    return hay ? Math.max(z, -0.12) : 0;
  }

  const guardados = [];
  let cuadros = 0;
  // info: { id, espejo, Q0, Q1, caja } de la parte que se está masajeando
  function dibujar(info, visible) {
    pantalla.visible = visible && !!malla;
    if (!malla) return;
    const lado = -1; // se usa su lado derecho; con el dibujo volteado se ve en espejo (el otro brazo, pierna, mano o pie)
    const cp = info.id + lado;
    if (cp !== clavePose) { clavePose = cp; claveAjuste = ''; grupo.userData.giros = posar(info.id, lado); }
    const ca = [cp, info.espejo, info.Q0.x, info.Q0.y, info.Q1.x, info.Q1.y, info.caja.min.x, info.caja.max.y].map(n => typeof n === 'number' ? n.toFixed(3) : n).join('|');
    if (ca !== claveAjuste) { claveAjuste = ca; ajustar(info.id, grupo.userData.giros, lado, info.Q0, info.Q1, info.espejo, info.caja); }
    if (!pantalla.visible || (cuadros++ & 1)) return; // un cuadro sí y uno no: basta para verse fluido y cuesta la mitad

    // --- se dibuja solo el maniquí y las manos, con todo lo demás apagado ---
    guardados.length = 0;
    const poner = (o, prop, val) => { guardados.push([o, prop, o[prop]]); o[prop] = val; };
    for (const o of scene.children) if (!o.isLight && o !== lienzo.parent && o.visible) poner(o, 'visible', false);
    for (const o of ocultar) poner(o, 'visible', false);
    poner(grupo, 'visible', true);
    for (const o of capaMov.children) {
      const ud = o.userData;
      if (ud.es3D) { // la mano se queda a la vista (en la guía grande se desvanece) y se asienta sobre la piel
        if (!ud.colocada) continue;
        poner(o, 'visible', true);
        for (const m of ud.materiales) { poner(m, 'opacity', 1); poner(m, 'depthWrite', true); }
        if (ud.rojo) poner(ud.rojo, 'value', 0.9); // aquí la parte que toca se ve en rojo todo el tiempo
        poner(o.position, 'z', o.position.z + altura(o.position.x, o.position.y));
      } else if (o.isLine || o.isLineSegments) { // las líneas de guía: a la altura media de la piel por donde pasan
        if (ud.zGuia === undefined || ud.claveGuia !== claveAjuste) {
          const p = o.geometry.attributes.position; let s = 0;
          for (let i = 0; i < p.count; i++) s += altura(p.getX(i) + o.position.x, p.getY(i) + o.position.y);
          ud.zGuia = p.count ? s / p.count : 0; ud.claveGuia = claveAjuste;
        }
        poner(o.position, 'z', o.position.z + ud.zGuia);
      } else poner(o.position, 'z', o.position.z + altura(o.position.x, o.position.y));
    }
    // cámara: desde un costado de la camilla (la camilla se ve derecha, a lo ancho de la pantalla), viendo toda la parte
    const c = info.caja, cx = (c.min.x + c.max.x) / 2, cy = (c.min.y + c.max.y) / 2;
    const radio = Math.max(0.2, Math.hypot(c.max.x - c.min.x, c.max.y - c.min.y) / 2 * 0.84); // en manos y pies se ve también algo del brazo o la pierna
    const dist = radio / Math.sin(camara.fov * G / 2);
    lienzo.updateWorldMatrix(true, false);
    const centro = lienzo.localToWorld(new THREE.Vector3(cx, cy, -0.03));
    // el costado de la camilla más cercano a la parte (en la espalda, el derecho de la persona)
    const lat = new THREE.Vector3(1, 0, 0).transformDirection(grupo.matrix); lat.z = 0; lat.normalize();
    const eje = new THREE.Vector3(0, 1, 0).applyMatrix4(grupo.matrix);
    const lejos = (cx - eje.x) * lat.x + (cy - eje.y) * lat.y;
    const sg = Math.abs(lejos) < 0.03 ? (info.espejo ? 1 : -1) * Math.sign(new THREE.Vector3(1, 0, 0).transformDirection(grupo.matrix).dot(lat) || 1) * (grupo.matrix.determinant() < 0 ? -1 : 1) : Math.sign(lejos);
    const mira = new THREE.Vector3(lat.x * sg * 0.62, lat.y * sg * 0.62, 0.78).normalize();
    const ojo = lienzo.localToWorld(new THREE.Vector3(cx, cy, -0.03).addScaledVector(mira, dist));
    camara.position.copy(ojo); camara.lookAt(centro); camara.updateMatrixWorld();
    camara.near = Math.max(0.02, dist - radio * 2.5); camara.far = dist + radio * 4; camara.updateProjectionMatrix();

    const xr = renderer.xr.enabled, destino = renderer.getRenderTarget(), fondo = scene.background;
    renderer.xr.enabled = false; scene.background = FONDO;
    renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, camara);
    renderer.setRenderTarget(destino); renderer.xr.enabled = xr; scene.background = fondo;
    for (let i = guardados.length - 1; i >= 0; i--) { const [o, prop, val] = guardados[i]; o[prop] = val; }
  }
  return { pantalla, grupo, dibujar, altura, get listo() { return !!malla && !!mapa; }, get minZ() { return minZ; }, camara, rt };
}
