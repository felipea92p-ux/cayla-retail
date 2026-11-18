// «Pregúntale a CAYLA» (ADR-0536): las pantallas que el asistente puede ofrecer a una cuenta. Son las entradas de su menú lateral y, además,
// las tres de la cabecera que tienen módulo (Colaboradores, Configuración y Actividad), que no son filas del lateral (ADR-0306). Sin
// ellas, «¿cómo le doy acceso a una colaboradora?» nunca llevaba a Colaboradores (lo encontró la evaluación fija, 2026-10-27). La usan
// el cajón (`AppShell`) y `/api/asistente`, para que los dos ofrezcan lo mismo.

/** Cada pantalla de la cabecera y los módulos que la abren (Colaboradores abre con su módulo o con Roles y accesos). */
const DE_LA_CABECERA: readonly { ruta: string; modulos: readonly string[] }[] = [
  { ruta: "/colaboradores", modulos: ["colaboradores", "roles"] },
  { ruta: "/configuracion", modulos: ["configuracion"] },
  { ruta: "/actividad", modulos: ["actividad"] },
];

export function pantallasDelAsistente({ delMenu, modulos }: { delMenu: readonly string[]; modulos: readonly string[] }): string[] {
  const tiene = new Set(modulos);
  const cabecera = DE_LA_CABECERA.filter((p) => p.modulos.some((m) => tiene.has(m))).map((p) => p.ruta);
  return [...new Set([...delMenu, ...cabecera])];
}
