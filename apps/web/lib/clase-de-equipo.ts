// ADR-0674 · El ERP en teléfonos de gama baja (Felipe 2026-11-17).
//
// EL PROBLEMA. El ERP se diseñó y se mide en el Mac mini de la tienda. En Catálogo, Compras, Inventario y Ventas también se usa desde
// teléfonos de gama baja (2–3 GB de RAM, procesador y gráfica lentos), y nadie sabe cuánto tarda ahí una pantalla: el cronómetro del clic
// (ADR-0654) dice la ruta, la sede y los milisegundos, pero no desde qué clase de equipo. Un p75 de 2 s puede ser el wifi de AQP o un
// teléfono de S/ 350.
//
// QUÉ ES «LA CLASE DEL EQUIPO». Lo que el propio navegador ya expone, en los rangos gruesos con los que lo expone: la memoria aproximada
// (`navigator.deviceMemory`, solo Chrome y Edge, redondeada por el navegador a 0.25 · 0.5 · 1 · 2 · 4 · 8 GB), los núcleos del procesador
// (`hardwareConcurrency`, tope 16 aquí), el tipo de red que estima (`connection.effectiveType`) y si la persona pidió ahorrar datos
// (`connection.saveData`). Nada de eso dice QUIÉN es (ADR-0424): no se manda el modelo, el sistema ni la pantalla.
//
// Aquí vive solo lo puro: leer esos valores de un `navigator` (o de algo con su forma, para las pruebas) y validarlos al llegar.

/** Los únicos valores de memoria que da Chrome (la especificación de Device Memory redondea a una potencia de dos entre 0.25 y 8). */
const RAM_VALIDAS = [0.25, 0.5, 1, 2, 4, 8] as const;
/** Más núcleos que esto no cambia la clase del equipo y sí lo distingue de los demás: se anota como 16. */
const TOPE_NUCLEOS = 16;
const REDES = ["slow-2g", "2g", "3g", "4g"] as const;

export type RedEfectiva = (typeof REDES)[number];

/** La clase del equipo, con `null` en lo que el navegador no expone (Safari y Firefox no dan la memoria ni la red). */
export type Equipo = { ram: number | null; nucleos: number | null; red: RedEfectiva | null; ahorroDeDatos: boolean };

/** Lo que se lee del navegador: un `navigator` real o un objeto con su forma (las pruebas). */
export type NavegadorLike = {
  deviceMemory?: unknown;
  hardwareConcurrency?: unknown;
  connection?: { effectiveType?: unknown; saveData?: unknown } | null;
};

function ramValida(x: unknown): number | null {
  return typeof x === "number" && (RAM_VALIDAS as readonly number[]).includes(x) ? x : null;
}

function nucleosValidos(x: unknown, conTope: boolean): number | null {
  if (typeof x !== "number" || !Number.isInteger(x) || x < 1) return null;
  if (conTope) return Math.min(x, TOPE_NUCLEOS);
  return x <= TOPE_NUCLEOS ? x : null;
}

function redValida(x: unknown): RedEfectiva | null {
  return typeof x === "string" && (REDES as readonly string[]).includes(x) ? (x as RedEfectiva) : null;
}

/** La clase de ESTE equipo, leída del navegador. Nunca lanza: lo que no está o no tiene la forma esperada queda en `null`. */
export function leerEquipo(nav: NavegadorLike | undefined | null): Equipo {
  if (!nav) return { ram: null, nucleos: null, red: null, ahorroDeDatos: false };
  let conexion: NavegadorLike["connection"] = null;
  try {
    conexion = nav.connection ?? null;
  } catch {
    conexion = null;
  }
  return {
    ram: ramValida(nav.deviceMemory),
    nucleos: nucleosValidos(nav.hardwareConcurrency, true),
    red: redValida(conexion?.effectiveType),
    ahorroDeDatos: conexion?.saveData === true,
  };
}

/**
 * Lo que el servidor acepta como clase del equipo (`/api/tiempos`). Una medición de una pestaña abierta antes de este cambio llega sin
 * equipo: devuelve `null` y la medición vale igual. Una que trae equipo con algo fuera de forma también queda en `null` (no se tira la
 * medición por un dato del equipo raro).
 */
export function leerEquipoRecibido(x: unknown): Equipo | null {
  if (typeof x !== "object" || x === null) return null;
  const { ram, nucleos, red, ahorroDeDatos } = x as Record<string, unknown>;
  if (ram !== null && ramValida(ram) === null) return null;
  if (nucleos !== null && nucleosValidos(nucleos, false) === null) return null;
  if (red !== null && redValida(red) === null) return null;
  if (typeof ahorroDeDatos !== "boolean") return null;
  return { ram: ram as number | null, nucleos: nucleos as number | null, red: red as RedEfectiva | null, ahorroDeDatos };
}
