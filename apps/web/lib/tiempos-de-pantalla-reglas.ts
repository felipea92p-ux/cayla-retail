// ADR-0654 · «El cronómetro del clic» (cambiar-de-modulo#6, Felipe 2026-11-13).
//
// EL PROBLEMA. «El sistema está lento» un sábado a las 7 p. m. en AQP no dice si es Existencias, el wifi de la tienda o la base. Hasta hoy
// nadie medía cuánto tarda de verdad cambiar de módulo desde la silla de la vendedora: las cifras de ADR-0628 (0,8 s Historial, 1,4 s Caja,
// 3 s Existencias) se tomaron a mano, una vez. Sin el número por módulo y por sede, lo siguiente que se arregle se elige a ojo.
//
// QUÉ MIDE. Desde que Next empieza la navegación (`onRouterTransitionStart`, en `instrumentation-client.ts`) hasta el primer cuadro en que
// la pantalla nueva está a la vista SIN esqueleto: ni el del marco (ADR-0628, el que sale en el mismo clic) ni el del `loading.tsx`
// (`EsqueletoPantalla`, que llevan `data-esqueleto-pantalla`). Una pantalla que llega sin esqueleto (la copia del router, ADR-0013) también
// se mide, y lo dice (`sinEsqueleto`). Lo que pasa los 15 s de ADR-0628 no se cuenta: es una navegación que no llegó, no una lenta.
//
// QUÉ NO LLEVA (ADR-0424): ni nombres, ni la sesión, ni lo que se buscó, ni la dirección con su `?…`. Solo el PATRÓN de la ruta
// (`/productos/[id]`, nunca el id), los milisegundos, la sede y la versión del ERP que lo midió.
//
// Aquí vive solo lo puro (qué cuenta como cambiar de pantalla, cuándo llegó, el patrón, el lote y su lectura en el servidor). Lo que mira
// el navegador está en `tiempos-de-pantalla-cliente.ts`; lo que escribe la línea en los registros, en `app/api/tiempos/route.ts`.

/** Lo que tarda como máximo una pantalla en llegar para contarse: el mismo tope que el esqueleto del marco (`MS_TOPE_DESTINO`, ADR-0628). */
const MS_TOPE = 15_000;
/** Cuántas mediciones viajan juntas: de sobra para 30 s de clics, y un cuerpo de pocos KB. */
const MAX_POR_LOTE = 50;
/** El cuerpo más grande que el servidor acepta leer: 50 mediciones caben en ~8 KB; lo que pasa de esto no es nuestro. */
const MAX_BYTES_LOTE = 16_384;
const MAX_LARGO_RUTA = 120;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Un patrón de ruta como lo arma `patronDeRuta`: letras, números, guiones, puntos y los corchetes de un parámetro. */
const FORMA_DE_RUTA = /^\/[A-Za-z0-9\-_.[\]/]*$/;
const FORMA_DE_VERSION = /^[A-Za-z0-9_-]{1,12}$/;

export type TipoDeNavegacion = "push" | "replace" | "traverse";
export type ParametrosDeRuta = Readonly<Record<string, string | readonly string[] | undefined>>;

/** Una medición lista para viajar. `sedeId` es el id de la sede activa o `"global"` (CAYLA Global, ADR-0275). */
export type TiempoDePantalla = { ruta: string; ms: number; sedeId: string; sinEsqueleto: boolean; version: string };

/** Una navegación que se está midiendo. `inicio` y `ahora` van en el reloj de `performance.now()`. */
export type CronometroEnCurso = { inicio: number; desde: string; vioEsqueleto: boolean };

/** Lo que el navegador ve en un cuadro mientras se mide. */
export type VistaDelCuadro = {
  ahora: number;
  /** La dirección que muestra la pestaña (`location.pathname`): cambia cuando Next monta la pantalla nueva o su esqueleto. */
  pathname: string;
  /** ¿Hay un esqueleto de pantalla en la página (`[data-esqueleto-pantalla]`), a la vista o escondido detrás del del marco? */
  hayEsqueleto: boolean;
  /** La ruta que el marco del ERP ya anotó (`CronometroDelClic`), o `null` fuera del ERP. */
  pathnameDelMarco: string | null;
};

export type PasoDelCronometro =
  | { estado: "sigue"; cronometro: CronometroEnCurso }
  | { estado: "descarta" }
  | { estado: "llego"; ms: number; sinEsqueleto: boolean };

/**
 * ¿Esta navegación es cambiar de pantalla? Devuelve el `pathname` de destino, o `null` si no se mide:
 * - «Atrás» y «adelante» (`traverse`): el router dibuja la copia que guardó, siempre al instante (ver `staleTimes` en `next.config.ts`);
 *   contarlas bajaría el p75 sin decir nada de lo lento.
 * - La MISMA pantalla con otro `?…` (un filtro, una búsqueda, el mes): no es entrar a un módulo, y una búsqueda que se escribe dispararía
 *   decenas de mediciones.
 * - Otro sitio, o una dirección que no se entiende.
 */
export function destinoDeLaNavegacion(url: string, tipo: TipoDeNavegacion, actual: { pathname: string; origin: string }): string | null {
  if (tipo === "traverse") return null;
  let destino: URL;
  try {
    destino = new URL(url, actual.origin);
  } catch {
    return null;
  }
  if (destino.origin !== actual.origin || destino.pathname === actual.pathname) return null;
  return destino.pathname;
}

/**
 * Un cuadro del cronómetro: ¿sigue esperando, ya llegó o se descarta?
 * - Pasados los 15 s se descarta (como el esqueleto del marco: lo que no llegó ahí no llegó).
 * - Mientras la pestaña siga en la pantalla de antes, o haya un esqueleto, sigue.
 * - Llegó cuando la dirección es otra, no hay esqueleto y el marco ya anotó esa ruta (sin eso no habría patrón que mandar; fuera del ERP,
 *   como el login, nunca lo anota y la medición se descarta sola al tope).
 */
export function pasoDelCronometro(c: CronometroEnCurso, vista: VistaDelCuadro): PasoDelCronometro {
  const ms = Math.max(0, Math.round(vista.ahora - c.inicio));
  if (ms > MS_TOPE) return { estado: "descarta" };
  const cronometro = vista.hayEsqueleto && !c.vioEsqueleto ? { ...c, vioEsqueleto: true } : c;
  if (vista.pathname === c.desde || vista.hayEsqueleto || vista.pathnameDelMarco !== vista.pathname) return { estado: "sigue", cronometro };
  return { estado: "llego", ms, sinEsqueleto: !cronometro.vioEsqueleto };
}

function decodificar(segmento: string): string {
  try {
    return decodeURIComponent(segmento);
  } catch {
    return segmento;
  }
}

/**
 * El patrón de la ruta: cada parte que es un parámetro de Next (`useParams()`) pasa a su nombre entre corchetes
 * (`/productos/0b6e…` → `/productos/[id]`). Si aun así queda un id suelto (un uuid o solo números: los parámetros no llegaron), se tapa
 * como `[id]`: a los registros nunca va un id, va el módulo.
 *
 * Un «atrapa todo» (`[...x]`) NO se traduce: en el ERP solo existe en las ranuras `@modal/[...catchAll]` de Compras, Productos y Órdenes de
 * insumos, que atrapan cualquier ruta para cerrar la hoja, y `useParams()` mezcla sus valores con los de la pantalla (medido el
 * 2026-11-13: Proveedores salía como `/compras/[...catchAll]`).
 */
export function patronDeRuta(pathname: string, params: ParametrosDeRuta): string {
  const partes = pathname.split("/").filter(Boolean);
  const patron = partes.map((parte) => {
    const valor = decodificar(parte);
    const nombre = Object.keys(params).find((k) => params[k] === valor);
    if (nombre) return `[${nombre}]`;
    return UUID.test(valor) || /^\d+$/.test(valor) ? "[id]" : parte;
  });
  return `/${patron.join("/")}`.slice(0, MAX_LARGO_RUTA);
}

/** El próximo envío: hasta 50 mediciones de la cola, ya como texto. `null` si no hay nada que mandar (no se llama al servidor por nada). */
export function armarLote(cola: readonly TiempoDePantalla[]): { cuerpo: string; cuantas: number } | null {
  if (cola.length === 0) return null;
  const tiempos = cola.slice(0, MAX_POR_LOTE);
  return { cuerpo: JSON.stringify({ tiempos }), cuantas: tiempos.length };
}

function leerTiempo(x: unknown): TiempoDePantalla | null {
  if (typeof x !== "object" || x === null) return null;
  const { ruta, ms, sedeId, sinEsqueleto, version } = x as Record<string, unknown>;
  if (typeof ruta !== "string" || ruta.length > MAX_LARGO_RUTA || !FORMA_DE_RUTA.test(ruta)) return null;
  if (typeof ms !== "number" || !Number.isInteger(ms) || ms < 0 || ms > MS_TOPE) return null;
  if (typeof sedeId !== "string" || (sedeId !== "global" && !UUID.test(sedeId))) return null;
  if (typeof sinEsqueleto !== "boolean") return null;
  if (typeof version !== "string" || !FORMA_DE_VERSION.test(version)) return null;
  return { ruta, ms, sedeId: sedeId.toLowerCase(), sinEsqueleto, version };
}

/**
 * Lo que el servidor acepta de un lote: solo mediciones con la forma exacta (patrón de ruta, ms enteros dentro del tope, sede como id o
 * «global», versión corta). Lo demás se ignora sin error: un cuerpo raro no rompe nada ni llega a los registros. Nunca lanza.
 */
export function leerLote(texto: string): TiempoDePantalla[] {
  if (texto.length > MAX_BYTES_LOTE) return [];
  let cuerpo: unknown;
  try {
    cuerpo = JSON.parse(texto);
  } catch {
    return [];
  }
  const tiempos = (cuerpo as { tiempos?: unknown } | null)?.tiempos;
  if (!Array.isArray(tiempos)) return [];
  return tiempos
    .slice(0, MAX_POR_LOTE)
    .map(leerTiempo)
    .filter((t): t is TiempoDePantalla => t !== null);
}

/** La línea de los registros del servidor: UNA por medición, para que `vercel logs --query tiempo_de_pantalla` dé las filas del p75. */
export function lineaDeRegistro(t: TiempoDePantalla): string {
  return JSON.stringify({ evento: "tiempo_de_pantalla", ruta: t.ruta, ms: t.ms, sede_id: t.sedeId, sin_esqueleto: t.sinEsqueleto, version: t.version });
}
