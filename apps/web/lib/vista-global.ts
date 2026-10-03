// CAYLA Global (ADR-0275, Felipe 2026-09-28): la vista de toda la empresa, solo para quien ve el módulo `cayla_global`
// (al nacer, solo el Admin).
//
// PROMETE: qué es «estar en CAYLA Global» y qué se puede usar ahí, en UN solo lugar. De esta lista salen el menú (la
// cuenta solo «tiene», en esa vista, los módulos de acá), la barrera de rutas de `proxy.ts` (cualquier otra pantalla
// manda a elegir sede) y el alcance por defecto de Finanzas («todas» en vez de la sede donde trabaja).
// ASUME: la vista se guarda en la misma cookie que la sede elegida (`cayla_ubicacion_activa`), con el valor «global»; la
// escribe solo `cambiarUbicacionActiva`, después de preguntarle a la base (`fn_ve_modulo('cayla_global')`). Es la
// PERSPECTIVA de la app, no un permiso: cada lectura vuelve a preguntar a la base.
//
// Por qué una lista cerrada y no «todo el ERP sumando sedes»: la vista es para analizar y decidir, no para operar piso ni
// almacén (Felipe). Vender, Caja o un Conteo no tienen sentido sin una sede —el movimiento tiene que quedar anotado en
// alguna—, así que en esta vista no existen. Un módulo entra a la lista SOLO cuando sus pantallas ya saben leer CAYLA
// entera; si entrara antes, mostraría las cifras de la sede donde trabaja la persona bajo el título «CAYLA Global».
// Lógica pura: se importa desde el servidor, el cliente y `proxy.ts`, y se prueba en `vista-global.test.ts`.

import type { ClaveModulo } from "./modulos";

/** El valor de la cookie `cayla_ubicacion_activa` que significa «CAYLA Global» en vez de una sede. */
export const VALOR_VISTA_GLOBAL = "global";

/** El nombre de la vista donde la app muestra el de la sede (selector, cabeceras). */
export const NOMBRE_VISTA_GLOBAL = "CAYLA Global";

export type Vista = "sede" | "global";

/** Los módulos que funcionan en CAYLA Global: los que ya leen toda la empresa. El Inicio (para el Admin es el Observatorio,
 *  que mira todas las tiendas: ADR-0322), el tablero, Clientas (una sola lista para todas las sedes), las seis pantallas de
 *  Finanzas (ya tenían «todas» para el líder), Configuración (metas y presupuesto de cada tienda) y Actividad (la del líder
 *  ya es de todas las sedes). Existencias, Movimientos, Análisis, Traslados y Producción entran cuando aprendan a sumar la
 *  red (ADR-0275, fase 3). */
export const MODULOS_DE_LA_VISTA_GLOBAL = [
  "inicio",
  "cayla_global",
  "clientas",
  "reportes_financieros",
  "gastos",
  "cuentas_dinero",
  "impuestos",
  "cierre_mes",
  "configuracion",
  "actividad",
] as const satisfies readonly ClaveModulo[];

/** Los módulos que SOLO existen en CAYLA Global: parado en una sede no aparecen (el tablero no es de una sede). */
export const MODULOS_SOLO_DE_LA_VISTA_GLOBAL = ["cayla_global"] as const satisfies readonly ClaveModulo[];

/** Las rutas que se pueden abrir estando en CAYLA Global (y todo lo que cuelga de ellas). Tienen que coincidir con las
 *  pantallas de los módulos de arriba —lo vigila la prueba contra el árbol del menú—, más dos que no son de un módulo:
 *  «Sin acceso» y el panel comercial (`/comercial`, que ya compara todas las tiendas y es solo del líder). «/» es solo el
 *  Inicio (nada «cuelga» de la raíz): la página manda a `/global` a quien no es Admin. */
export const RUTAS_DE_LA_VISTA_GLOBAL = ["/", "/global", "/clientas", "/finanzas", "/configuracion", "/actividad", "/comercial", "/sin-acceso"] as const;

/** Las pantallas que cuelgan de una ruta de la lista de arriba pero trabajan en UNA sede: no se abren en CAYLA Global (mandan a
 *  elegir sede). Clientas ▸ Avisos (ADR-0288 act. g) manda los mensajes desde el WhatsApp de una tienda: sin tienda no hay desde
 *  dónde enviar, aunque las fichas sí sean de toda la empresa. */
export const RUTAS_DE_SEDE_DENTRO_DE_LA_VISTA_GLOBAL = ["/clientas/avisos"] as const;

/** Adónde se manda a quien abre, estando en CAYLA Global, una pantalla que trabaja en una sede. */
export const RUTA_ELEGIR_SEDE = "/global/elige-sede";

const DE_LA_VISTA_GLOBAL = new Set<string>(MODULOS_DE_LA_VISTA_GLOBAL);
const SOLO_DE_LA_VISTA_GLOBAL = new Set<string>(MODULOS_SOLO_DE_LA_VISTA_GLOBAL);

export function funcionaEnVistaGlobal(clave: ClaveModulo): boolean {
  return DE_LA_VISTA_GLOBAL.has(clave);
}

/** Lo que la cuenta usa en esta vista: en CAYLA Global, solo sus módulos que funcionan ahí; parado en una sede, todos
 *  menos los que solo existen en la global. Es lo que ven el menú y `exigirModulo`: no hay otra puerta que mantener. */
export function modulosEnLaVista<T extends { clave: ClaveModulo }>(vista: Vista, modulos: readonly T[]): T[] {
  return vista === "global"
    ? modulos.filter((m) => DE_LA_VISTA_GLOBAL.has(m.clave))
    : modulos.filter((m) => !SOLO_DE_LA_VISTA_GLOBAL.has(m.clave));
}

/** ¿Esta ruta se puede abrir en CAYLA Global? La propia ruta o cualquiera que cuelgue de ella (`/finanzas/gastos`), nunca
 *  una que solo empiece igual (`/finanzasx`) ni una de las de sede de adentro (`/clientas/avisos`). Las de API no son
 *  pantallas: las decide cada una. */
export function rutaDeLaVistaGlobal(pathname: string): boolean {
  if (pathname.startsWith("/api/")) return true;
  const cuelga = (r: string) => pathname === r || pathname.startsWith(`${r}/`);
  return RUTAS_DE_LA_VISTA_GLOBAL.some(cuelga) && !RUTAS_DE_SEDE_DENTRO_DE_LA_VISTA_GLOBAL.some(cuelga);
}

/** El alcance por defecto de una pantalla de Finanzas: en CAYLA Global, «todas» las sedes; parado en una sede, el de
 *  siempre (la sede donde trabaja, que decide cada pantalla). Lo que venga en la URL (`?ver=`) manda siempre. */
export function verDeLaVista(vista: Vista, ver: string | undefined): string | undefined {
  return ver ?? (vista === "global" ? "todas" : undefined);
}
