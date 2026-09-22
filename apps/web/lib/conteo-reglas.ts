/**
 * Las reglas de la pantalla de Conteo rediseñada (ADR-0174, 2026-09-22), sin red ni React: se importan desde el
 * servidor (la página) y desde el navegador (el panel de contar), y se prueban en `conteo-reglas.test.ts`.
 *
 * Tres decisiones de Felipe viven acá:
 *  1. Un conteo cerrado sin prendas es «Vacío»: no dice «Sin diferencias» (sería afirmar algo sobre cero prendas) ni
 *     cuenta para la exactitud. La base, desde `20260923120000_conteo_vacio_no_se_cierra.sql`, ya no deja cerrar uno.
 *  2. Mientras se cuenta, la lista «Faltan por contar» muestra QUÉ falta (prenda, talla, color) pero nunca CUÁNTAS
 *     dice el sistema: el conteo sigue siendo a ciegas (variante A de la demo).
 *  3. La cantidad se anota de dos formas: «Suma por escaneo» (cada lectura +1) o «Escribir cantidad». La base
 *     (`conteo_contar`) siempre recibe la cantidad TOTAL de esa prenda: la suma se resuelve acá, con lo ya anotado.
 */

import type { FilaPrevisualizacion } from "@/lib/conteo-varianza";

// ---------------------------------------------------------------------------------------------------------------
// 1. El resultado de un conteo, leído de un vistazo
// ---------------------------------------------------------------------------------------------------------------

export type ResultadoConteo = "en_curso" | "vacio" | "sin_diferencias" | "con_diferencia";

/** Qué insignia lleva un conteo en el historial. Un cerrado con 0 prendas es «vacío», nunca «sin diferencias». */
export function resultadoConteo(c: { estado: string; lineas: number; lineasConDiferencia: number }): ResultadoConteo {
  if (c.estado === "abierto") return "en_curso";
  if (c.lineas === 0) return "vacio";
  return c.lineasConDiferencia === 0 ? "sin_diferencias" : "con_diferencia";
}

/** El último conteo que de verdad contó algo — los vacíos no dicen nada del inventario y no se muestran como «último». */
export function ultimoConteoConPrendas<T extends { estado: string; lineas: number }>(conteos: readonly T[]): T | null {
  return conteos.find((c) => c.estado === "cerrado" && c.lineas > 0) ?? null;
}

// ---------------------------------------------------------------------------------------------------------------
// 2. «Faltan por contar», sin la cifra del sistema
// ---------------------------------------------------------------------------------------------------------------

/** Una prenda que falta contar. A propósito NO lleva `sistema`: esto viaja al navegador de quien cuenta. */
export type PrendaPendiente = {
  varianteId: string;
  sku: string;
  referencia: string;
  talla: string | null;
  color: string | null;
};

/**
 * De la vista previa del cierre (que sí trae lo que dice el sistema) se queda solo con lo que nadie tocó todavía, y le
 * quita la cantidad. Ordenada por nombre y talla: es la lista que se recorre con la prenda en la mano, rack por rack.
 * Una variante con stock en piso Y almacén (conteo de toda la ubicación) sale una sola vez.
 */
export function pendientesSinCifras(filas: readonly FilaPrevisualizacion[]): PrendaPendiente[] {
  const vistas = new Set<string>();
  const pendientes: PrendaPendiente[] = [];
  for (const f of filas) {
    if (f.origen !== "no_contado" || !f.variante_id || vistas.has(f.variante_id)) continue;
    vistas.add(f.variante_id);
    pendientes.push({
      varianteId: f.variante_id,
      sku: f.codigo ?? "",
      referencia: f.referencia ?? "(sin referencia)",
      talla: f.talla,
      color: f.color,
    });
  }
  return pendientes.sort(
    (a, b) =>
      a.referencia.localeCompare(b.referencia, "es") ||
      (a.color ?? "").localeCompare(b.color ?? "", "es") ||
      compararTallas(a.talla, b.talla) ||
      a.sku.localeCompare(b.sku)
  );
}

// Las tallas de letra van en el orden en que cuelgan en el rack (XS, S, M, L…), no alfabético (L, M, S). Las numéricas
// (28, 30, 36…) por número. Lo desconocido va al final, alfabético.
const ORDEN_TALLAS = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"];

export function compararTallas(a: string | null, b: string | null): number {
  const rango = (t: string | null): [number, number, string] => {
    const x = (t ?? "").trim().toUpperCase();
    const i = ORDEN_TALLAS.indexOf(x);
    if (i >= 0) return [0, i, x];
    const n = Number(x.replace(",", "."));
    if (x !== "" && Number.isFinite(n)) return [1, n, x];
    return [2, 0, x];
  };
  const [ga, na, ta] = rango(a);
  const [gb, nb, tb] = rango(b);
  return ga - gb || na - nb || ta.localeCompare(tb, "es");
}

// ---------------------------------------------------------------------------------------------------------------
// 3. Anotar cantidades: suma por escaneo o escribir
// ---------------------------------------------------------------------------------------------------------------

export type ModoConteo = "suma" | "escribir";

export const MODOS_CONTEO: readonly ModoConteo[] = ["suma", "escribir"];

/** Lee el modo guardado (localStorage) sin confiar en él: cualquier otra cosa vuelve a «suma», el modo por defecto. */
export function modoConteoValido(valor: string | null | undefined): ModoConteo {
  return valor === "escribir" ? "escribir" : "suma";
}

/**
 * La cantidad a guardar para una prenda. «suma» agrega `paso` a lo ya anotado (un escaneo = +1, el botón − = −1) y
 * nunca baja de 0; «fijar» reemplaza por lo escrito. Devuelve `null` si lo escrito no es un entero ≥ 0 — la base lo
 * rechazaría igual, pero conviene decirlo antes de mandarlo.
 */
export function nuevaCantidad(actual: number | undefined, accion: { tipo: "suma"; paso: number } | { tipo: "fijar"; valor: string | number }): number | null {
  if (accion.tipo === "suma") return Math.max(0, (actual ?? 0) + accion.paso);
  const texto = String(accion.valor).trim();
  if (texto === "") return null;
  const n = Number(texto);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/** El orden de «Contadas»: lo último tocado arriba. `orden` son los ids en el orden en que se tocaron. */
export function tocar(orden: readonly string[], varianteId: string): string[] {
  return [...orden.filter((id) => id !== varianteId), varianteId];
}

/**
 * Cola de guardado en serie. Con «suma por escaneo» llegan lecturas más rápido de lo que la base contesta, y cada
 * una manda el TOTAL (1, 2, 3…). Si dos salieran en paralelo y la respuesta del «2» llegara después que la del «3»,
 * la prenda quedaría en 2. En fila, la última en salir es la última en escribirse.
 */
export function crearColaEnSerie() {
  let cola: Promise<unknown> = Promise.resolve();
  let pendientes = 0;
  return {
    /** Encola `tarea`; se ejecuta cuando terminen las anteriores (aunque alguna haya fallado). */
    agregar<T>(tarea: () => Promise<T>): Promise<T> {
      pendientes += 1;
      const turno = cola.then(tarea, tarea);
      cola = turno.then(
        () => {
          pendientes -= 1;
        },
        () => {
          pendientes -= 1;
        }
      );
      return turno;
    },
    /** Se resuelve cuando no queda nada por guardar (para revisar el cierre con todo ya escrito). */
    vaciar(): Promise<void> {
      return cola.then(() => undefined);
    },
    get pendientes() {
      return pendientes;
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// 4. El alcance y el avance, en vivo
// ---------------------------------------------------------------------------------------------------------------

/**
 * `previsualizar_cierre_conteo` no conoce el alcance: devuelve todo lo que tiene stock en la sububicación. En un conteo
 * «Solo Blusas», «Faltan por contar» tiene que listar solo blusas — si no, quien cuenta ve 180 prendas que nadie le
 * pidió contar y el avance nunca llega al 100 %. `categoriaDe` es la categoría (por nombre) de cada variante; sin
 * categoría de alcance (`null`) no se filtra.
 */
export function pendientesEnAlcance(
  pendientes: readonly PrendaPendiente[],
  categoriaDe: ReadonlyMap<string, string | null>,
  categoriaAlcance: string | null
): PrendaPendiente[] {
  if (!categoriaAlcance) return [...pendientes];
  return pendientes.filter((p) => categoriaDe.get(p.varianteId) === categoriaAlcance);
}

/**
 * El avance mientras se cuenta, sin volver a la base en cada escaneo: lo contado (lo que ya tiene cantidad, esté o no
 * en el alcance: si se contó, es una línea real del conteo) más lo que sigue pendiente. Mismo criterio que
 * `avanceConteo` sobre la vista previa: una prenda contada sale de «pendientes» y entra en «contadas».
 */
export function avanceEnVivo(
  contadas: ReadonlySet<string>,
  pendientes: readonly PrendaPendiente[]
): { contadas: number; total: number; porcentaje: number; pendientes: PrendaPendiente[] } {
  const siguen = pendientes.filter((p) => !contadas.has(p.varianteId));
  const total = contadas.size + siguen.length;
  return { contadas: contadas.size, total, porcentaje: total === 0 ? 0 : Math.round((contadas.size / total) * 100), pendientes: siguen };
}
