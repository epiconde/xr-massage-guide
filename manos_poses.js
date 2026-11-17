// Lista de manos (posturas) que se usan en los masajes. La usan el editor de manos y la app.
// Cada una se guarda en manos_rig/poses/<modelo><sufijo>.json
// "juntar": qué tanto se juntan los dedos (1 = tan juntos como en tu puño).
// "parte": cuánto se dobla cada dedo como fracción de TU puño cerrado (0 = como la palma abierta, 1 = como el puño).
//   dedos: [base, medio, punta]   pulgar: [hueso de la palma, base, punta]
// "abrir": grados de "Abrir" fijos para algunos huesos (en vez de sacarlos del puño)
export const POSES = [
  { id: 'abierta', nombre: 'Palma abierta', sufijo: '_abierta',
    uso: 'Deslizamientos, presión con las palmas, círculos con toda la mano, manos quietas' },
  { id: 'puno', nombre: 'Puño cerrado', sufijo: '',
    uso: 'Golpes con el puño (percusión)' },
  { id: 'pulgar', nombre: 'Pulgares afuera', sufijo: '_pulgar',
    uso: 'Presión y círculos con los pulgares' },
  { id: 'canto', nombre: 'Canto (karate)', sufijo: '_canto',
    uso: 'Golpecitos / hacheado con el borde del meñique: mano extendida y dedos juntos, pegados unos a otros',
    parte: { dedos: [0.02, 0.03, 0.02], pulgar: [0.35, 0.25, 0.1] },
    abrir: { indice_1: 10, anular_1: -13, menique_1: -34 } }, // medido en la mano humana para que los dedos queden pegados
  { id: 'karate_abierta', nombre: 'Karate (mano abierta)', sufijo: '_karate_abierta',
    uso: 'Golpe de canto con la mano abierta y los dedos separados (de ejemplo)',
    juntar: 0, parte: { dedos: [0.03, 0.04, 0.02], pulgar: [0.1, 0.05, 0] } },
  { id: 'ahuecada', nombre: 'Mano ahuecada', sufijo: '_ahuecada',
    uso: 'Palmoteo / ventosa: golpes con la mano en forma de cuenco',
    juntar: 0.6, parte: { dedos: [0.3, 0.22, 0.12], pulgar: [0.45, 0.3, 0.15] } },
  { id: 'amasar', nombre: 'Amasar (mano en C)', sufijo: '_amasar',
    uso: 'Amasado: agarrar el músculo entre los dedos y el pulgar',
    juntar: 0.8, parte: { dedos: [0.35, 0.45, 0.3], pulgar: [0.5, 0.2, 0.15] } },
  { id: 'yemas', nombre: 'Yemas de los dedos', sufijo: '_yemas',
    uso: 'Peinado, deslizamiento con yemas, fricción pequeña',
    juntar: 0.6, parte: { dedos: [0.12, 0.5, 0.4], pulgar: [0.3, 0.25, 0.2] } },
  { id: 'nudillos', nombre: 'Nudillos', sufijo: '_nudillos',
    uso: 'Presión o deslizamiento firme con los nudillos (puño suelto)',
    juntar: 1, parte: { dedos: [0.7, 1, 0.65], pulgar: [0.8, 0.7, 0.6] } },
  { id: 'pinza', nombre: 'Pinza (pulgar e índice)', sufijo: '_pinza',
    uso: 'Pellizcos suaves y rodar la piel',
    juntar: 1, parte: { dedos: [0.45, 0.5, 0.3], resto: [0.85, 0.9, 0.8], pulgar: [0.6, 0.3, 0.2] } },
];
export const POSE = Object.fromEntries(POSES.map(p => [p.id, p]));

// fracción del puño para un hueso (para las poses que tienen "parte")
export function fraccion(idPose, hueso) {
  const p = POSE[idPose]?.parte;
  if (!p) return null;
  const [dedo, parte] = hueso.split('_');
  if (dedo === 'pulgar') return p.pulgar[{ meta: 0, 1: 1, 2: 2 }[parte] ?? 0];
  if (!['indice', 'medio', 'anular', 'menique'].includes(dedo)) return 0;
  const k = { 1: 0, 2: 1, 3: 2 }[parte];
  if (k === undefined) return 0; // huesos de la palma
  const fila = p.resto && dedo !== 'indice' ? p.resto : p.dedos;
  return fila[k];
}

// pose del masaje según el paso: movimiento.pose manda; si no, se deduce del tipo de movimiento
export function poseDelPaso(mov, tipoMano) {
  if (mov.pose && POSE[mov.pose]) return mov.pose;
  // golpes: "golpe" puede ser cualquier mano de la lista (puno, canto, karate_abierta, ahuecada…)
  if (mov.tipo === 'percusion') return POSE[mov.golpe] ? mov.golpe : 'canto';
  if (mov.tipo === 'amasar') return 'amasar';
  if (tipoMano === 'pulgar') return 'pulgar';
  return 'abierta';
}
