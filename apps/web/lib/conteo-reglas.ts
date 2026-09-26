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
 *
 * Y una convención de nombres (2026-09-26): en los tipos del conteo el campo `sku` guarda el CÓDIGO DE LA ETIQUETA
 * (`variantes.codigo`, con el `sku` legado solo de respaldo — `codigoDeEtiqueta`). El nombre quedó del legado: en
 * producción 128 de 130 variantes tienen `sku` NULL (ADR-0058) y las que se dan de alta al vuelo nacen sin él. Ese
 * campo solo se MUESTRA y se busca; para saber de qué prenda se habla se compara `varianteId`, nunca el código.
 */

import type { FilaPrevisualizacion } from "@/lib/conteo-varianza";
import type { Apariencia } from "@/lib/apariencia-variantes";
import type { PrioridadConteo } from "@/lib/conteos";
import { codigoDeEtiqueta } from "./prenda-reglas";

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

// ---------------------------------------------------------------------------------------------------------------
// 5. El código de la etiqueta: qué se muestra y contra qué se busca
// ---------------------------------------------------------------------------------------------------------------

/** Una fila de `fn_prioridad_conteo` (la de «Conviene contar primero»). Su `sku` es `variantes.sku` a secas. */
export type FilaPrioridad = {
  variante_id: string;
  sku: string | null;
  referencia: string;
  talla: string | null;
  color: string | null;
  sububicacion_id: string | null;
  dias_sin_contar: number | null;
  valor_en_riesgo: number | string;
};

/**
 * De la fila de la base a la fila de la pantalla. La comparten el servidor (la lista que llega ya pintada) y el
 * navegador (al filtrar por categoría): dos copias del mismo mapeo es como una de las dos se queda sin el código.
 * `fn_prioridad_conteo` devuelve solo `variantes.sku`; el código de la etiqueta viene de `apariencia` (se lee de
 * `variantes` por id en la misma consulta que la foto). Sin `apariencia` —falló la lectura decorativa— se cae al
 * `sku` que trajo la función: vacío antes que inventado.
 */
export function prioridadDesdeFila(f: FilaPrioridad, apariencia?: Apariencia): PrioridadConteo {
  return {
    varianteId: f.variante_id,
    sku: codigoDeEtiqueta({ codigo: apariencia?.codigo, sku: f.sku }),
    referencia: f.referencia,
    talla: f.talla,
    color: f.color,
    sububicacionId: f.sububicacion_id,
    diasSinContar: f.dias_sin_contar,
    valorEnRiesgo: Number(f.valor_en_riesgo),
    apariencia,
  };
}

/**
 * Lo que el buscador del conteo lee de cada variante del catálogo. `sku` pasa a ser el código de la etiqueta (es lo
 * que se muestra y contra lo que se teclea a medias) y `codigosBarras` conserva los códigos de barras y suma el `sku`
 * legado cuando existe y no es el mismo texto: antes se buscaba por ese sku, y una prenda vieja no debe dejar de
 * resolverse al escanear su código de siempre. Solo agrega opciones de emparejamiento; no inventa ni escribe nada.
 */
export function codigosDeConteo(v: { sku: string; codigo: string | null; codigosBarras: readonly string[] }): { sku: string; codigosBarras: string[] } {
  const codigo = codigoDeEtiqueta(v);
  const yaEsta = (c: string) => c.toLowerCase() === codigo.toLowerCase() || v.codigosBarras.some((b) => b.toLowerCase() === c.toLowerCase());
  return { sku: codigo, codigosBarras: [...v.codigosBarras, ...(v.sku && !yaEsta(v.sku) ? [v.sku] : [])] };
}

/**
 * `previsualizar_cierre_conteo` no devuelve `variantes.codigo`: devuelve «el primer código de barras» (por fecha de
 * alta), y una prenda con varios códigos dados de alta en la misma transacción (etiqueta + fábrica, como en el alta al
 * vuelo) empata en esa fecha: puede salir cualquiera de los dos. Con el código de la etiqueta que ya conoce el
 * catálogo la lista dice siempre lo mismo que el resto de la pantalla; sin él (prenda que el catálogo no trae) se
 * queda el de la función. `codigoDe` es varianteId → `codigoDeEtiqueta`.
 */
export function pendientesConCodigo(pendientes: readonly PrendaPendiente[], codigoDe: ReadonlyMap<string, string>): PrendaPendiente[] {
  return pendientes.map((p) => ({ ...p, sku: codigoDe.get(p.varianteId) || p.sku }));
}

/**
 * La lista que se despliega bajo la caja de escanear: lo tecleado a medias contra el código de la etiqueta, o exacto
 * contra cualquier código de barras (el que lee la pistola). Es la misma regla de antes; lo que cambia es contra qué
 * `sku` se prueba (ver `codigosDeConteo`): con el `sku` legado, «POL-0004» no encontraba nada y la pantalla ofrecía
 * «Dar de alta esta prenda» para una que sí existía.
 */
export function coincidenciasPorCodigo<T extends { sku: string | null; codigosBarras: readonly string[] }>(texto: string, catalogo: readonly T[], max = 8): T[] {
  const q = texto.trim().toLowerCase();
  if (!q) return [];
  return catalogo.filter((v) => (v.sku ?? "").toLowerCase().includes(q) || v.codigosBarras.some((c) => c.toLowerCase() === q)).slice(0, max);
}

/**
 * El código con el que se dibuja una prenda recién dada de alta al vuelo. `censo_crear_variante` devuelve `v.sku`,
 * que en una prenda nueva es NULL (nace sin sku y el disparador solo acuña el `codigo`): sin esto la prenda entraba a
 * «Contadas» con la línea vacía. Si la función un día devuelve el `codigo`, se usa; mientras tanto se muestra el
 * código de barras que la colaboradora acaba de escanear —el que tiene en la mano—, que es un dato real y no se guarda.
 */
export function codigoDePrendaNueva(fila: { sku: string | null; codigo?: string | null; codigo_barras: string }): string {
  return codigoDeEtiqueta(fila) || fila.codigo_barras;
}
