// Partes del cuerpo (módulos) que se pueden masajear. Cada una es un dibujo plano que se acomoda sobre la persona.
//
// Coordenadas de cada dibujo:
//   u: -1 borde izquierdo, 0 centro, +1 borde derecho.
//   v: sube a lo largo de la parte (0 = primera sección, 1 ≈ última). En brazos y piernas sube HACIA EL CORAZÓN.
// secciones: los puntos que se acomodan con las bolitas amarillas (una bolita de cada lado), de v menor a mayor.
// formaBase: dónde quedan esas bolitas al empezar (metros; +y hacia donde sube v).
// contorno: la silueta, en (u, v).
// zonas: rectángulos (u0, v0, u1, v1). "espejo": se repite del otro lado. "fija": siempre se ve (zonas de cuidado).
//        "arriba": su letrero va en la punta del dibujo (para zonas del centro).
//        "forma": cómo se dibuja en el estilo "músculos": puntos (u, v) del contorno (lado derecho; el espejo se hace solo),
//                 o 'elipse' / 'huso' dentro de su rectángulo. Sin forma: rectángulo redondeado.
// voltear: el dibujo no es simétrico (pulgar, dedo gordo): en Ajustar aparece un botón para voltearlo.
// otroLado: al terminar se ofrece repetir en el otro brazo / pierna / mano / pie.
export const PARTES = [
  {
    id: 'espalda', nombre: 'Espalda', sobre: 'la espalda', emoji: '🧍',
    secciones: [{ id: 'g', v: 0, nombre: 'Glúteos' }, { id: 'c', v: 0.42, nombre: 'Costillas' }, { id: 'h', v: 0.95, nombre: 'Hombro' }],
    formaBase: { hI: [-0.21, 0.25], hD: [0.21, 0.25], cI: [-0.16, -0.02], cD: [0.16, -0.02], gI: [-0.18, -0.23], gD: [0.18, -0.23] },
    contorno: [[-0.22, 1.17], [-0.3, 1.04], [-0.75, 1.0], [-1, 0.95], [-1.02, 0.7], [-1, 0.42], [-1.03, 0.2], [-1, 0],
      [-0.7, -0.07], [0, -0.09], [0.7, -0.07], [1, 0], [1.03, 0.2], [1, 0.42], [1.02, 0.7], [1, 0.95], [0.75, 1.0], [0.3, 1.04], [0.22, 1.17]],
    zonas: {
      columna:         { color: 0xff3b3b, rect: [-0.06, -0.02, 0.06, 1.05], espejo: false, etiqueta: 'Columna: sin presión', fija: true, arriba: true },
      rinones:         { color: 0xff9a2e, rect: [0.3, 0.3, 0.65, 0.45], espejo: true, etiqueta: 'Riñones: suave', fija: true, forma: 'elipse' },
      paravertebrales: { color: 0x3fa9ff, rect: [0.09, 0.06, 0.25, 0.95], espejo: true, etiqueta: 'Paravertebrales', forma: [[0.08, 0.95], [0.2, 0.96], [0.27, 0.72], [0.28, 0.32], [0.23, 0.07], [0.09, 0.05]] },
      trapecios:       { color: 0xb07cff, rect: [0.12, 0.88, 0.85, 1.03], espejo: true, etiqueta: 'Trapecios', forma: [[0.1, 1.05], [0.32, 1.06], [0.86, 0.99], [0.8, 0.92], [0.42, 0.89], [0.12, 0.86]] },
      escapulas:       { color: 0x3fd99a, rect: [0.28, 0.55, 0.8, 0.86], espejo: true, etiqueta: 'Omóplatos', forma: [[0.3, 0.85], [0.6, 0.87], [0.8, 0.8], [0.72, 0.66], [0.5, 0.54], [0.32, 0.64]] },
      lumbar:          { color: 0xffd23f, rect: [0.1, 0.02, 0.65, 0.29], espejo: true, etiqueta: 'Lumbar', forma: [[0.1, 0.29], [0.48, 0.3], [0.68, 0.2], [0.62, 0.05], [0.3, 0.0], [0.1, 0.02]] },
    },
    ayuda: ['Bolitas amarillas: hombros, costillas y glúteos', 'Los glúteos marcan hasta dónde llega el masaje.'],
  },
  {
    id: 'brazo', nombre: 'Brazos', sobre: 'el brazo', emoji: '💪', otroLado: 'el otro brazo',
    secciones: [{ id: 'm', v: 0, nombre: 'Muñeca' }, { id: 'c', v: 0.47, nombre: 'Codo' }, { id: 'h', v: 1, nombre: 'Hombro' }],
    formaBase: { mI: [-0.03, -0.27], mD: [0.03, -0.27], cI: [-0.043, -0.02], cD: [0.043, -0.02], hI: [-0.055, 0.27], hD: [0.055, 0.27] },
    contorno: [[-0.8, -0.04], [-1, 0], [-1.1, 0.3], [-1, 0.47], [-1.08, 0.75], [-1, 1], [-0.6, 1.08], [0.6, 1.08], [1, 1], [1.08, 0.75], [1, 0.47], [1.1, 0.3], [1, 0], [0.8, -0.04]],
    zonas: {
      b_muneca:    { color: 0xffd23f, rect: [-0.9, -0.02, 0.9, 0.07], espejo: false, etiqueta: 'Muñeca' },
      b_antebrazo: { color: 0x3fa9ff, rect: [-0.9, 0.09, 0.9, 0.4], espejo: false, etiqueta: 'Antebrazo', forma: 'huso' },
      b_codo:      { color: 0xff3b3b, rect: [-0.9, 0.42, 0.9, 0.53], espejo: false, etiqueta: 'Codo: sin presión', fija: true, forma: 'elipse' },
      b_brazo:     { color: 0x3fd99a, rect: [-0.9, 0.56, 0.9, 0.87], espejo: false, etiqueta: 'Brazo', forma: 'huso' },
      b_hombro:    { color: 0xb07cff, rect: [-0.9, 0.89, 0.9, 1.05], espejo: false, etiqueta: 'Hombro', forma: 'elipse' },
    },
    ayuda: ['Bolitas amarillas: muñeca, codo y hombro', 'El dibujo va de la muñeca al hombro.'],
  },
  {
    id: 'pierna', nombre: 'Piernas', sobre: 'la pierna (boca abajo)', emoji: '🦵', otroLado: 'la otra pierna',
    secciones: [{ id: 't', v: 0, nombre: 'Tobillo' }, { id: 'r', v: 0.5, nombre: 'Rodilla' }, { id: 'g', v: 1, nombre: 'Glúteo' }],
    formaBase: { tI: [-0.04, -0.4], tD: [0.04, -0.4], rI: [-0.06, 0], rD: [0.06, 0], gI: [-0.09, 0.4], gD: [0.09, 0.4] },
    contorno: [[-0.8, -0.03], [-1, 0], [-1.18, 0.27], [-1, 0.5], [-1.06, 0.75], [-1, 1], [-0.6, 1.05], [0.6, 1.05], [1, 1], [1.06, 0.75], [1, 0.5], [1.18, 0.27], [1, 0], [0.8, -0.03]],
    zonas: {
      p_aquiles:     { color: 0xff9a2e, rect: [-0.7, -0.01, 0.7, 0.1], espejo: false, etiqueta: 'Aquiles: suave', fija: true },
      p_pantorrilla: { color: 0x3fa9ff, rect: [-0.95, 0.12, 0.95, 0.42], espejo: false, etiqueta: 'Pantorrilla', forma: 'huso' },
      p_corva:       { color: 0xff3b3b, rect: [-0.9, 0.44, 0.9, 0.56], espejo: false, etiqueta: 'Hueco de la rodilla: no', fija: true, forma: 'elipse' },
      p_muslo:       { color: 0x3fd99a, rect: [-0.9, 0.59, 0.9, 0.97], espejo: false, etiqueta: 'Muslo', forma: 'huso' },
    },
    ayuda: ['Bolitas amarillas: tobillo, rodilla y glúteo', 'La persona boca abajo. El dibujo va del tobillo al glúteo.'],
  },
  {
    id: 'mano', nombre: 'Manos', sobre: 'la mano (palma hacia arriba)', emoji: '🖐', otroLado: 'la otra mano', voltear: true,
    secciones: [{ id: 'm', v: 0, nombre: 'Muñeca' }, { id: 'n', v: 0.52, nombre: 'Base de los dedos' }, { id: 'p', v: 1, nombre: 'Puntas' }],
    formaBase: { mI: [-0.03, -0.095], mD: [0.03, -0.095], nI: [-0.042, 0.005], nD: [0.042, 0.005], pI: [-0.042, 0.095], pD: [0.042, 0.095] },
    contorno: [[-0.8, -0.04], [-1, 0.2], [-1, 0.5], [-1, 0.76], [-0.78, 0.83], [-0.57, 0.76], [-0.55, 0.56], [-0.52, 0.9], [-0.3, 0.97], [-0.08, 0.9],
      [-0.05, 0.57], [-0.03, 0.95], [0.2, 1.02], [0.43, 0.95], [0.45, 0.57], [0.47, 0.88], [0.68, 0.95], [0.9, 0.88], [0.95, 0.5],
      [1.3, 0.6], [1.6, 0.72], [1.72, 0.6], [1.35, 0.36], [1.02, 0.1], [0.8, -0.04]],
    zonas: {
      m_muneca: { color: 0xffd23f, rect: [-0.9, -0.02, 0.9, 0.1], espejo: false, etiqueta: 'Muñeca' },
      m_palma:  { color: 0x3fa9ff, rect: [-0.9, 0.13, 0.2, 0.48], espejo: false, etiqueta: 'Palma', forma: 'elipse' },
      m_pulgar: { color: 0xb07cff, rect: [0.25, 0.1, 0.98, 0.42], espejo: false, etiqueta: 'Base del pulgar', forma: 'elipse' },
      m_dedos:  { color: 0x3fd99a, rect: [-0.98, 0.54, 0.95, 1.0], espejo: false, etiqueta: 'Dedos' },
    },
    ayuda: ['Bolitas amarillas: muñeca, base de los dedos y puntas', 'Si el pulgar queda del otro lado, toca Voltear.'],
  },
  {
    id: 'pie', nombre: 'Pies', sobre: 'la planta del pie', emoji: '🦶', otroLado: 'el otro pie', voltear: true,
    secciones: [{ id: 't', v: 0, nombre: 'Talón' }, { id: 'a', v: 0.5, nombre: 'Arco' }, { id: 'd', v: 1, nombre: 'Dedos' }],
    formaBase: { tI: [-0.03, -0.12], tD: [0.03, -0.12], aI: [-0.04, 0], aD: [0.04, 0], dI: [-0.048, 0.12], dD: [0.048, 0.12] },
    contorno: [[-0.6, -0.04], [-1, 0.1], [-0.95, 0.4], [-1.02, 0.7], [-0.98, 0.88], [-0.62, 0.95], [-0.2, 1.0], [0.3, 1.04], [0.8, 1.09],
      [1.02, 0.96], [1, 0.7], [0.7, 0.42], [0.92, 0.12], [0.6, -0.04]],
    zonas: {
      f_talon:  { color: 0xffd23f, rect: [-0.8, 0.02, 0.8, 0.22], espejo: false, etiqueta: 'Talón', forma: 'elipse' },
      f_arco:   { color: 0x3fa9ff, rect: [-0.85, 0.27, 0.6, 0.6], espejo: false, etiqueta: 'Arco', forma: 'elipse' },
      f_bola:   { color: 0x3fd99a, rect: [-0.92, 0.64, 0.95, 0.83], espejo: false, etiqueta: 'Bola del pie', forma: 'elipse' },
      f_dedos:  { color: 0xb07cff, rect: [-0.95, 0.86, 0.98, 1.04], espejo: false, etiqueta: 'Dedos' },
    },
    ayuda: ['Bolitas amarillas: talón, arco y dedos', 'Si el dedo gordo queda del otro lado, toca Voltear.'],
  },
];
export const PARTE = Object.fromEntries(PARTES.map(p => [p.id, p]));
