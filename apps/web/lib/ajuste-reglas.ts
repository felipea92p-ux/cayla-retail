// Armado de las filas del modal «Ajustar inventario» (AjustarInventarioModal.tsx),
// sin nada de servidor ni de React: lo importan el componente cliente y las pruebas.
//
// Contrato — PROMETE: una fila por variante, con la talla ya como texto («M», «32»),
// puestas en el orden en que se cuenta una curva (S · M · L, 28 · 30 · 32) y con el stock
// de la sede partido en piso y almacén. ASUME: `filas` son las variantes de UN producto
// con el stock ya acotado a UNA sede (el modal se lo pide así a la base).
//
// Por qué vive aparte del componente: `FilaAjuste` es la forma que el select del modal
// tiene que cumplir, y esa comprobación solo la hace el compilador si el resultado de la
// consulta se pasa SIN castear. El modal se rompió sin que nada avisara cuando dejó de
// existir `variantes.talla` (20260917100500, ADR-0095) justamente porque un
// `as unknown as` le tapaba el error a `tsc`: el select seguía pidiendo una columna que
// ya no estaba y solo lo supo la base, en vivo.

import { compararTallas } from "./tallas";
import { codigoDeEtiqueta } from "./prenda-reglas";

/** Lo mínimo que el modal lee de cada variante. La talla llega anidada porque la columna
 *  de texto ya no existe: hoy es `talla_id` → `tallas.valor` (select `talla:tallas ( valor )`). */
export type FilaAjuste = {
  id: string;
  sku: string | null;
  /** El código de la etiqueta: es el que casi todas las variantes tienen (el `sku` es NULL, ADR-0058). */
  codigo?: string | null;
  talla: { valor: string } | null;
  color: { nombre: string | null } | null;
  stock: { cantidad: number; sububicacion_id: string | null }[] | null;
};

export type VarianteAjuste = {
  varianteId: string;
  sku: string;
  talla: string | null;
  color: string | null;
  stockPiso: number;
  stockAlmacen: number;
  /** Suma de todas las sububicaciones: es el stock que se ve en una sede que no separa piso de almacén. */
  stockSinDividir: number;
  /** Nunca tuvo un movimiento en esta sede (ni una fila de stock): su primera cantidad es stock inicial, no un ajuste
   *  (ADR-0235; la base lo exige con `ajuste_sin_historia`). Toda fila de `stock` nace de un movimiento, así que «sin
   *  filas de stock» es «sin historia». */
  sinHistoria: boolean;
};

// Una variante sin talla va al final: en pantalla se rotula «Única», y `compararTallas`
// ya manda «Única» al final — así «qué se ve» y «dónde queda» no se contradicen.
function compararTallaOpcional(a: string | null, b: string | null): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  return compararTallas(a, b);
}

export function armarVariantesAjuste(
  filas: FilaAjuste[],
  sububicacionPisoId: string | undefined,
  sububicacionAlmacenId: string | undefined
): VarianteAjuste[] {
  return filas
    .map((v): VarianteAjuste => {
      const porSub = v.stock ?? [];
      return {
        varianteId: v.id,
        sku: codigoDeEtiqueta(v),
        talla: v.talla?.valor ?? null,
        color: v.color?.nombre ?? null,
        stockPiso: porSub.find((s) => s.sububicacion_id === sububicacionPisoId)?.cantidad ?? 0,
        stockAlmacen: porSub.find((s) => s.sububicacion_id === sububicacionAlmacenId)?.cantidad ?? 0,
        stockSinDividir: porSub.reduce((acc, s) => acc + s.cantidad, 0),
        sinHistoria: porSub.length === 0,
      };
    })
    // `sort` es estable: dentro de una misma talla queda el orden en que llegaron (por SKU,
    // lo pide el modal a la base), así que la lista no cambia de un refresco al siguiente.
    .sort((a, b) => compararTallaOpcional(a.talla, b.talla));
}

// Motivos del ajuste. «Reposición» no se ofrece en el PISO de una tienda que separa piso y almacén: lo que sube del
// almacén se baja (Bajar al piso / Reponer, en Existencias) para que salga del almacén y el reloj de piso de Frescura tenga
// hora de colgado. La base lo rechaza igual (20260926000400, hint reposicion_piso_cerrada); aquí solo se evita el viaje.
export const MOTIVOS_AJUSTE = [
  { valor: "reposicion", texto: "Reposición" },
  { valor: "merma", texto: "Merma" },
  { valor: "conteo_fisico", texto: "Conteo físico" },
  { valor: "otro", texto: "Otro" },
] as const;

export type MotivoAjuste = (typeof MOTIVOS_AJUSTE)[number]["valor"];

export function reposicionCerrada(ubicado: "piso" | "almacen", separaPisoAlmacen: boolean): boolean {
  return separaPisoAlmacen && ubicado === "piso";
}

export function motivosAjusteDisponibles(
  ubicado: "piso" | "almacen",
  separaPisoAlmacen: boolean
): readonly (typeof MOTIVOS_AJUSTE)[number][] {
  return reposicionCerrada(ubicado, separaPisoAlmacen) ? MOTIVOS_AJUSTE.filter((m) => m.valor !== "reposicion") : MOTIVOS_AJUSTE;
}

// Nombra el retiro: sin él, quien guarda prendas del piso lo arma aquí a mano («Otro» −N, «Reposición» +N) y sin rastro.
export const NOTA_REPOSICION_CERRADA =
  "Subir al piso: «Bajar al piso» o «Reponer». Guardar en el almacén: «⋯» ▸ «Retirar del piso». Todo en Existencias (si no ves «Bajar al piso», pídele al líder ese módulo). Prendas de más al contar: «Conteo físico».";

/** ADR-0235: las líneas del modal, repartidas en lo que se AJUSTA (prendas con historia en la tienda) y lo que se CARGA
 *  como stock inicial (prendas nuevas en ella, que la base ya no deja ajustar). Una prenda nueva con una cantidad
 *  negativa no es stock inicial: el modal la frena antes (dejaría el stock en negativo). */
export function repartirLineasAjuste<L extends { variante: Pick<VarianteAjuste, "sinHistoria">; delta: number }>(lineas: readonly L[]): { ajustes: L[]; cargaInicial: L[] } {
  return {
    ajustes: lineas.filter((l) => !l.variante.sinHistoria),
    cargaInicial: lineas.filter((l) => l.variante.sinHistoria && l.delta > 0),
  };
}

/** ¿El stock inicial de las prendas nuevas queda colgado en el piso? Una prenda «colgada» entra al almacén y se BAJA en
 *  la misma operación (`cargar_stock_inicial` → `bajar_al_piso`), y bajar pide el módulo «Bajada al piso» (ADR-0212,
 *  decidido para el alta de producto). Quien no lo tiene no queda trabado con un error al confirmar: sus prendas nuevas
 *  entran al almacén, igual que en «Nuevo producto», y la fila lo dice antes (`textoPrendaNueva`). */
export function cargaInicialAlPiso(ubicado: "piso" | "almacen", separaPisoAlmacen: boolean, puedeBajarAlPiso: boolean): boolean {
  return separaPisoAlmacen && ubicado === "piso" && puedeBajarAlPiso;
}

/** La línea bajo una prenda nueva en la tienda: dónde va a quedar su stock inicial. */
export function textoPrendaNueva(ubicado: "piso" | "almacen", separaPisoAlmacen: boolean, puedeBajarAlPiso: boolean): string {
  if (separaPisoAlmacen && ubicado === "piso" && !puedeBajarAlPiso) {
    return "Nueva en esta tienda · entra al almacén: tu rol no baja prendas al piso";
  }
  return "Nueva en esta tienda · entra como stock inicial";
}

/** Lo que recibe `retail.ajustar_inventario` (ADR-0240): todo el ajuste en UNA llamada, con la marca del intento. */
export type ArgumentosDeAjuste = {
  p_ubicacion_id: string;
  p_sububicacion_id: string | null;
  p_ajustes: { variante_id: string; cantidad: number }[];
  p_motivo: string | null;
  p_cargas: { variante_id: string; cantidad: number }[];
  p_al_piso: boolean;
  p_nota: string | null;
  p_token: string;
};

type LineaParaEnviar = { variante: Pick<VarianteAjuste, "varianteId">; delta: number };

/** Arma la llamada con las dos listas del modal (`repartirLineasAjuste`). El motivo solo viaja si hay ajustes (las prendas
 *  nuevas entran como stock inicial y no lo llevan) y la nota vacía viaja como null: así el reintento con lo mismo da la
 *  misma huella en la base, que es lo que evita ajustar dos veces. */
export function argumentosDeAjuste(o: {
  ubicacionId: string;
  sububicacionId: string | null;
  ajustes: readonly LineaParaEnviar[];
  cargaInicial: readonly LineaParaEnviar[];
  motivo: string;
  alPiso: boolean;
  nota: string;
  token: string;
}): ArgumentosDeAjuste {
  const aItems = (ls: readonly LineaParaEnviar[]) => ls.map((l) => ({ variante_id: l.variante.varianteId, cantidad: l.delta }));
  return {
    p_ubicacion_id: o.ubicacionId,
    p_sububicacion_id: o.sububicacionId,
    p_ajustes: aItems(o.ajustes),
    p_motivo: o.ajustes.length > 0 ? o.motivo || null : null,
    p_cargas: aItems(o.cargaInicial),
    p_al_piso: o.alPiso,
    p_nota: o.nota.trim() || null,
    p_token: o.token,
  };
}

/** Cuando la respuesta no llegó (corte de red, tiempo agotado): la base pudo haber guardado igual. Se dice la verdad y el
 *  camino seguro, que es reenviar LO MISMO con la misma marca. */
export const TEXTO_AJUSTE_INCIERTO =
  "Se cortó la conexión y no sabemos si el ajuste llegó a guardarse. Vuelve a tocar «Confirmar»: con la misma marca, si ya se guardó no se repite.";

/** El aviso de éxito: «2 variantes ajustadas · 1 cargada como stock inicial»; si era un reintento de algo ya guardado, lo dice. */
export function textoExitoAjuste(r: { ajustes: number; cargas: number; ya_registrado?: boolean }): string {
  const partes = [
    r.ajustes > 0 && `${r.ajustes} ${r.ajustes === 1 ? "variante ajustada" : "variantes ajustadas"}`,
    r.cargas > 0 && `${r.cargas} ${r.cargas === 1 ? "cargada" : "cargadas"} como stock inicial`,
  ].filter(Boolean);
  return `${r.ya_registrado ? "Ya estaba guardado: " : ""}${partes.join(" · ")}`;
}

/** Lee el jsonb que devuelve `ajustar_inventario`; si no calza, null (y el modal usa lo que envió). */
export function leerResultadoAjuste(data: unknown): { ajustes: number; cargas: number; ya_registrado: boolean } | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (!Number.isInteger(d.ajustes) || !Number.isInteger(d.cargas) || typeof d.ya_registrado !== "boolean") return null;
  return { ajustes: d.ajustes as number, cargas: d.cargas as number, ya_registrado: d.ya_registrado };
}
