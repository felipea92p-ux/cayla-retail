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
  /** `cantidad_apartada` es opcional solo para las pruebas: el modal siempre la pide. */
  stock: { cantidad: number; cantidad_apartada?: number; sububicacion_id: string | null }[] | null;
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
  /** Lo apartado para clientas en cada lugar (ADR-0141). Sigue en la tienda y cuenta en el stock, pero Existencias muestra
   *  el stock SIN ello (lo libre): el modal lo muestra para que sus cifras calcen con la fila de la que se abrió. */
  apartadoPiso: number;
  apartadoAlmacen: number;
  apartadoSinDividir: number;
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
      const piso = porSub.find((s) => s.sububicacion_id === sububicacionPisoId);
      const almacen = porSub.find((s) => s.sububicacion_id === sububicacionAlmacenId);
      return {
        varianteId: v.id,
        sku: codigoDeEtiqueta(v),
        talla: v.talla?.valor ?? null,
        color: v.color?.nombre ?? null,
        stockPiso: piso?.cantidad ?? 0,
        stockAlmacen: almacen?.cantidad ?? 0,
        stockSinDividir: porSub.reduce((acc, s) => acc + s.cantidad, 0),
        apartadoPiso: piso?.cantidad_apartada ?? 0,
        apartadoAlmacen: almacen?.cantidad_apartada ?? 0,
        apartadoSinDividir: porSub.reduce((acc, s) => acc + (s.cantidad_apartada ?? 0), 0),
        sinHistoria: porSub.length === 0,
      };
    })
    // `sort` es estable: dentro de una misma talla queda el orden en que llegaron (por SKU,
    // lo pide el modal a la base), así que la lista no cambia de un refresco al siguiente.
    .sort((a, b) => compararTallaOpcional(a.talla, b.talla));
}

/** La prenda desde la que se abre el modal. En Existencias y Movimientos cada fila es UNA prenda: un modelo en un color
 *  (`clavePercha`). Si el modal cargaba el modelo entero, la fila decía «12 en el piso» y adentro aparecían los cuatro
 *  colores con 78 (Felipe, 2026-09-28). Productos lo abre sin prenda: su fila es el modelo con todos sus colores. */
export type PrendaAjuste = { color: string | null };

/** Solo las variantes del color de la prenda; sin prenda, todas. Compara por NOMBRE porque es lo que trae la fila de
 *  Existencias, y en la base es único (`colores_clave_unica`). Deja pasar las tallas del color que nunca estuvieron en la
 *  tienda: se cargan aquí como stock inicial (ADR-0235), por eso no se filtra por las tallas que la fila ya conoce. */
export function soloDeLaPrenda<F extends FilaAjuste>(filas: readonly F[], prenda: PrendaAjuste | undefined): F[] {
  if (!prenda) return [...filas];
  return filas.filter((f) => (f.color?.nombre ?? null) === prenda.color);
}

/** Dónde se ajusta: el piso o el almacén de una tienda que los separa, o la sede entera donde no (Taller). */
export type LugarAjuste = "piso" | "almacen" | "sede";

export function lugarDeAjuste(ubicado: "piso" | "almacen", separaPisoAlmacen: boolean): LugarAjuste {
  return separaPisoAlmacen ? ubicado : "sede";
}

export function stockEn(v: VarianteAjuste, lugar: LugarAjuste): number {
  return lugar === "piso" ? v.stockPiso : lugar === "almacen" ? v.stockAlmacen : v.stockSinDividir;
}

export function apartadoEn(v: VarianteAjuste, lugar: LugarAjuste): number {
  return lugar === "piso" ? v.apartadoPiso : lugar === "almacen" ? v.apartadoAlmacen : v.apartadoSinDividir;
}

function apartadas(n: number): string {
  return `${n} ${n === 1 ? "apartada" : "apartadas"}`;
}

/** La línea sobre las tallas: cuánto hay en el lugar y, si hay apartados, cuánto queda libre. Lo libre es la cifra de la
 *  fila de Existencias (`agruparPorPrenda` suma `pisoDisponible`): sin esta línea, «8» afuera y «9» adentro parecen dos
 *  inventarios distintos cuando la diferencia es una prenda apartada para una clienta. */
export function textoTotalAjuste(variantes: readonly VarianteAjuste[], lugar: LugarAjuste): string {
  const total = variantes.reduce((acc, v) => acc + stockEn(v, lugar), 0);
  const apartado = variantes.reduce((acc, v) => acc + apartadoEn(v, lugar), 0);
  const donde = lugar === "piso" ? "en el piso" : lugar === "almacen" ? "en el almacén" : "en la sede";
  if (apartado === 0) return `${total} ${donde}`;
  const libre = total - apartado;
  return `${total} ${donde} · ${apartadas(apartado)} · ${libre} ${libre === 1 ? "libre" : "libres"}`;
}

/** Una talla con un ajuste escrito: cuánto hay en el lugar, cuánto cambia, cómo queda y cuánto hay apartado. */
export type LineaAjuste = {
  variante: VarianteAjuste;
  delta: number;
  actual: number;
  resultado: number;
  apartado: number;
};

/** Las tallas con un ajuste entero distinto de cero, en el orden del modal. Lo vacío, el 0 y lo que no es entero no son
 *  un ajuste: no viajan a la base. */
export function lineasDeAjuste(
  variantes: readonly VarianteAjuste[],
  cantidades: Readonly<Record<string, string>>,
  lugar: LugarAjuste
): LineaAjuste[] {
  return variantes.flatMap((v) => {
    const texto = (cantidades[v.varianteId] ?? "").trim();
    if (texto === "") return [];
    const delta = Number(texto);
    if (!Number.isInteger(delta) || delta === 0) return [];
    const actual = stockEn(v, lugar);
    return [{ variante: v, delta, actual, resultado: actual + delta, apartado: apartadoEn(v, lugar) }];
  });
}

/** Las tallas que quedarían en negativo: `fn_aplicar_movimiento` las rechaza; el modal lo dice antes, con los números de
 *  la primera. */
export function textoNegativas(negativas: readonly LineaAjuste[]): string {
  const [primera] = negativas;
  return `${negativas.map((l) => l.variante.sku).join(", ")}: el ajuste dejaría el stock en negativo — hay ${primera.actual} y se pide ${primera.delta}.`;
}

/** Lo apartado de una talla, al lado de su stock («stock 2 · 1 apartada»); vacío si no tiene. */
export function textoApartadoTalla(apartado: number): string {
  return apartado > 0 ? ` · ${apartadas(apartado)}` : "";
}

/** Un ajuste no puede dejar menos prendas que las apartadas: `fn_aplicar_movimiento` lo rechaza. El modal lo dice antes, con
 *  el código de la etiqueta (el error de la base usa el `sku`, que casi siempre es NULL, ADR-0058). */
export function textoBajoApartado(l: { variante: Pick<VarianteAjuste, "sku">; resultado: number; apartado: number }): string {
  return `${l.variante.sku}: quedarían ${l.resultado} y hay ${apartadas(l.apartado)} para clientas. Libera o resuelve esos apartados primero.`;
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
