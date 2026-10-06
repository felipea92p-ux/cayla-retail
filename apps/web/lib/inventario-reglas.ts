// Reglas de Inventario sin nada de servidor: las importan los componentes
// cliente y las pruebas. Las lecturas contra Postgres viven en
// `inventario-v2.ts` (mismo reparto que compras-reglas / compras).

import { compararTallas } from "./tallas";

// «Por colgar» y lo que el piso pide hoy ya no se deciden aquí: los decide UN motor, `lib/piso-plan.ts` (ADR-0328 act. 7), y
// cada talla trae su decisión (`FilaExistencias.planPiso`). Lo que sigue en este archivo es cómo se ORDENA y se AGRUPA lo
// que ese motor pide, nunca si lo pide. Y cuántas tallas y unidades hay «por colgar» lo cuenta UNA función,
// `porColgarDeLaSede` (`existencias-para-hoy.ts`): la leen «Para hoy», el filtro «Hoy» y el Inicio de Almacén.

/** Orden de la lista «Por colgar»: modelo, color y talla en su curva (S · M · L, 36 · 38). La encargada
 *  cuelga por percha —un modelo en un color—, no talla por talla: si la M y la L de la misma casaca
 *  negra salen separadas por otras prendas, baja una y se olvida de la otra. El `productoId` desempata
 *  dos modelos con el mismo nombre para que sus tallas no se intercalen. Lo que no tiene color o talla
 *  va al final de su grupo, no se pierde. Devuelve un arreglo nuevo: no reordena el que recibe. */
export function ordenarPorModeloColorTalla<T extends { referencia: string; productoId: string; color: string | null; talla: string | null }>(filas: T[]): T[] {
  const alFinal = (a: string | null, b: string | null, comparar: (x: string, y: string) => number) =>
    a === b ? 0 : a === null ? 1 : b === null ? -1 : comparar(a, b);
  return [...filas].sort(
    (a, b) =>
      a.referencia.localeCompare(b.referencia, "es") ||
      a.productoId.localeCompare(b.productoId) ||
      alFinal(a.color, b.color, (x, y) => x.localeCompare(y, "es")) ||
      alFinal(a.talla, b.talla, compararTallas)
  );
}

/** La percha de una talla: el modelo (por `productoId`, no por nombre) en un color. Es el grupo que
 *  `ordenarPorModeloColorTalla` deja contiguo y que la paginación de «Por colgar» no parte entre páginas
 *  (`paginarSinPartirGrupos`). */
export function clavePercha(f: { productoId: string; color: string | null }): string {
  return JSON.stringify([f.productoId, f.color]);
}

// ============================================================================
// Umbrales de cobertura y de evidencia (nacieron con el Resumen, ADR-0101 y
// ADR-0121) — los usan `resumen-reglas.ts` (velocidad y bandas de cobertura) y
// Producción (`produccion-decisiones.ts`, `produccion-decision-reglas.ts`).
// Viven acá para que "cuánto es poco" tenga una sola casa: ningún componente ni
// ninguna función de reglas lleva un número suelto. Son el primer número
// razonable, NO ajustado todavía con meses de venta real: Felipe puede
// cambiarlos tocando UNA constante.
// ============================================================================

// --- Bandas de cobertura (días de stock al ritmo del período) ---------------

/** Cobertura en días o menos = «crítica»: se acaba en los próximos días. */
export const UMBRAL_COBERTURA_CRITICA_DIAS = 3;

/** Cobertura en días o menos = «atención». Producción lo usa como el corte de
 *  «producir ya» (`produccion-decisiones.ts`). */
export const UMBRAL_COBERTURA_RIESGO_DIAS = 7;

/** Más de esto es «30+ días» (la banda «alta» de `ETIQUETA_BANDA`). */
export const UMBRAL_COBERTURA_SALUDABLE_DIAS = 30;

/** Más de esto, Producción lo marca «sobrestock» (`produccion-decisiones.ts`).
 *  Reemplaza las 12 semanas del ADR-0101: la referencia de Felipe habla de
 *  «> 60 días». */
export const UMBRAL_COBERTURA_ALTA_DIAS = 60;

// --- Cuánta evidencia hace falta antes de afirmar algo ----------------------

/** Con menos días EN VENTA que esto no se calcula velocidad: «poco historial».
 *  Con 3 días ya hay ritmo (una prenda que vendió 10 en 5 días vende 2/día). */
export const MIN_DIAS_CON_STOCK_VELOCIDAD = 3;

/** Con menos días en venta que esto no se afirma «no se vende» ni «sobrestock»:
 *  quince días sin venta es una señal; cinco, una racha. */
export const MIN_DIAS_CON_STOCK_AFIRMAR = 14;

// --- Lectura de la demanda ---------------------------------------------------

/** «Ritmo reciente» de Existencias: los últimos N días de venta con que se mide cuánto dura el
 *  stock de hoy (cobertura). */
export const DIAS_RITMO_RECIENTE = 30;

// --- La miniatura de una prenda ------------------------------------------------
// Vivía en `inventario-v2.ts` (solo servidor). Se mudó acá, sin cambiar su lógica,
// cuando Conteo empezó a dibujar la prenda igual que Existencias: la regla de
// cuál foto es LA foto de un producto tiene que ser una sola, y `inventario-v2`
// no se puede importar desde un componente cliente.

export type FotoCruda = { url: string; orden: number; es_principal: boolean };

/** De las fotos de un producto (0 a N, en cualquier orden de llegada), la
 *  que se muestra como miniatura: la marcada `es_principal`, o si ninguna
 *  lo está, la de menor `orden` — mismo criterio que ya usan
 *  `catalogo_crear_producto`/`catalogo_actualizar_producto` en SQL al
 *  elegir cuál queda de `es_principal` por defecto. */
export function fotoPrincipal(fotos: FotoCruda[] | null | undefined): string | null {
  if (!fotos || fotos.length === 0) return null;
  return (fotos.find((f) => f.es_principal) ?? [...fotos].sort((a, b) => a.orden - b.orden)[0]).url;
}

/** Las cantidades de una prenda en una sede. */
export type Cantidades = {
  total: number;
  piso: number | null;
  almacen: number | null;
  danado: number | null;
  apartado: number;
  disponible: number;
  pisoDisponible: number | null;
  almacenDisponible: number | null;
};
export type FilaCantidadCruda = { variante_id: string; cantidad: number; cantidad_apartada: number; sububicacion: { tipo: string | null } | null };

/**
 * Las reglas de cantidades en UN solo lugar (cuarentena no suma, lo apartado no se vende, piso vs. almacén): las
 * usan Existencias (`getStockPorUbicacion`, con el detalle de cada prenda) y la caja (`getDisponibleEnSede`, solo
 * números). Por variante; las filas de piso y almacén de una misma prenda se suman.
 */
export function sumarCantidades(filas: FilaCantidadCruda[]): Map<string, Cantidades> {
  // Una sola ubicación es piso/almacén o no lo es — nunca "depende de la
  // variante". Se decide una vez sobre todas las filas, no por fila: una
  // prenda que todavía no tiene stock en ningún lado de la tienda igual
  // cuenta como "separa" (para mostrar SIN STOCK, no para desaparecer).
  const separaPisoAlmacen = filas.some((f) => f.sububicacion?.tipo === "piso_venta" || f.sububicacion?.tipo === "almacen_tienda");

  const acumulado = new Map<string, { total: number; piso: number; almacen: number; danado: number; apartado: number; apartadoPiso: number; apartadoAlmacen: number }>();
  for (const f of filas) {
    let a = acumulado.get(f.variante_id);
    if (!a) {
      a = { total: 0, piso: 0, almacen: 0, danado: 0, apartado: 0, apartadoPiso: 0, apartadoAlmacen: 0 };
      acumulado.set(f.variante_id, a);
    }
    // Cuarentena (20260917100000) NUNCA suma a `total`: es stock dañado,
    // no vendible — mezclarlo con piso/almacén inflaría "Prendas
    // disponibles" con algo que, de hecho, no se puede vender.
    if (f.sububicacion?.tipo === "cuarentena") {
      a.danado += f.cantidad;
      continue;
    }
    a.total += f.cantidad;
    a.apartado += f.cantidad_apartada;
    if (f.sububicacion?.tipo === "piso_venta") {
      a.piso += f.cantidad;
      a.apartadoPiso += f.cantidad_apartada;
    } else if (f.sububicacion?.tipo === "almacen_tienda") {
      a.almacen += f.cantidad;
      a.apartadoAlmacen += f.cantidad_apartada;
    }
  }

  const cantidades = new Map<string, Cantidades>();
  for (const [varianteId, a] of acumulado) {
    cantidades.set(varianteId, {
      total: a.total,
      danado: separaPisoAlmacen ? a.danado : null,
      piso: separaPisoAlmacen ? a.piso : null,
      almacen: separaPisoAlmacen ? a.almacen : null,
      apartado: a.apartado,
      disponible: a.total - a.apartado,
      pisoDisponible: separaPisoAlmacen ? a.piso - a.apartadoPiso : null,
      almacenDisponible: separaPisoAlmacen ? a.almacen - a.apartadoAlmacen : null,
    });
  }
  return cantidades;
}

/** El recordatorio del retiro cuando la talla no va a pedir nada: «retirar» se lee fácil como «dar de baja», y no lo es. */
// Lo del almacén no se cobra (la venta descuenta del piso): «siguen disponibles para vender» sería falso.
export const RETIRO_NO_ES_BAJA = "Pasan al almacén de la tienda: siguen siendo stock de la tienda (no es una baja), pero la caja no las cobra hasta que vuelvan al piso.";
