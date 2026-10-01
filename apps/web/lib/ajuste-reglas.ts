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
import { diaMes } from "./fechas-lima";
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
export type PrendaAjuste = {
  color: string | null;
  /** El color en #hex, solo para el puntito junto al nombre de la prenda: no decide qué tallas se muestran. */
  colorHex?: string | null;
};

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

/** Qué pregunta cada talla (Felipe, 2026-09-28). Con «Conteo físico», CUÁNTAS HAY: quien contó 4 escribe 4 y el modal
 *  calcula la diferencia; antes el mismo 4 SUMABA 4 y el stock quedaba en el doble. Con los demás motivos (y sin motivo
 *  todavía), cuánto se suma o se resta. La base guarda siempre una diferencia, calculada contra el stock que la pantalla
 *  muestra: la misma regla que Conteo (`contado − foto`, aplicada sobre el stock del momento; ADR-0189). */
export type ModoAjuste = "diferencia" | "contado";

export function modoDeAjuste(motivo: MotivoAjuste | ""): ModoAjuste {
  return motivo === "conteo_fisico" ? "contado" : "diferencia";
}

/** Las tallas con un ajuste, en el orden del modal. Lo vacío y lo que no es entero no son un ajuste, y tampoco lo que no
 *  cambia nada (sumar 0, o contar lo mismo que dice el sistema): no viajan a la base. Al contar, vacío es «no la conté»,
 *  no «conté 0». */
export function lineasDeAjuste(
  variantes: readonly VarianteAjuste[],
  cantidades: Readonly<Record<string, string>>,
  lugar: LugarAjuste,
  modo: ModoAjuste
): LineaAjuste[] {
  return variantes.flatMap((v) => {
    const texto = (cantidades[v.varianteId] ?? "").trim();
    if (texto === "") return [];
    const n = Number(texto);
    if (!Number.isInteger(n)) return [];
    const actual = stockEn(v, lugar);
    const delta = modo === "contado" ? n - actual : n;
    if (delta === 0) return [];
    return [{ variante: v, delta, actual, resultado: actual + delta, apartado: apartadoEn(v, lugar) }];
  });
}

/** Al cambiar de motivo, lo escrito cambia de forma pero no de resultado: «+2» sobre 4 pasa a «6» contadas, y «3»
 *  contadas sobre 4 pasa a «−1». Así cambiar el motivo nunca cambia en silencio lo que se va a guardar (sin esto, un «+2»
 *  escrito antes de elegir «Conteo físico» pasaría a leerse «conté 2» y restaría 2). Lo que no era un ajuste queda vacío. */
export function pasarCantidades(
  variantes: readonly VarianteAjuste[],
  cantidades: Readonly<Record<string, string>>,
  lugar: LugarAjuste,
  de: ModoAjuste,
  a: ModoAjuste
): Record<string, string> {
  if (de === a) return { ...cantidades };
  return Object.fromEntries(
    lineasDeAjuste(variantes, cantidades, lugar, de).map((l) => [l.variante.varianteId, String(a === "contado" ? l.resultado : l.delta)])
  );
}

/** El rótulo sobre las cantidades. Al contar nombra el lugar: el modal arranca en el almacén, y contar el piso con el
 *  almacén elegido SUMARÍA al almacén lo que está colgado. */
export function etiquetaCantidad(modo: ModoAjuste, lugar: LugarAjuste): string {
  if (modo === "diferencia") return "Suma o resta";
  return lugar === "piso" ? "Contaste en el piso" : lugar === "almacen" ? "Contaste en el almacén" : "Contaste";
}

function conSigno(n: number): string {
  return n > 0 ? `+${n}` : `−${-n}`;
}

/** Lo que se ve bajo una talla cuando ya se escribió algo: cómo queda. Al contar, también la diferencia, que es lo que queda en
 *  Movimientos («Quedará en 3 (−1)»). */
export function textoQuedara(l: LineaAjuste | undefined, modo: ModoAjuste): string {
  if (!l) return "";
  return modo === "contado" ? `Quedará en ${l.resultado} (${conSigno(l.delta)})` : `Quedará en ${l.resultado}`;
}

/** Por qué una talla no se puede ajustar con lo escrito, en voz de tienda y SIN códigos: son las dos reglas que
 *  `fn_aplicar_movimiento` también exige (no dejar el stock en negativo ni por debajo de lo apartado para clientas), dichas
 *  antes de confirmar y en la fila de la talla. `null`: está bien. */
export function textoProblemaTalla(l: LineaAjuste, modo: ModoAjuste): string | null {
  if (l.resultado < 0) {
    return modo === "contado" ? "Lo contado no puede ser negativo." : `Solo hay ${l.actual}: no se pueden restar ${-l.delta}.`;
  }
  if (l.resultado < l.apartado) {
    // Al contar, lo más probable es que la apartada esté guardada aparte y no se contó: se dice antes de mandar a liberar nada.
    return modo === "contado"
      ? `Contaste ${l.resultado} y hay ${apartadas(l.apartado)} para clientas. Cuéntalas también; si de verdad falta, libera ese apartado primero.`
      : `Quedarían ${l.resultado} y hay ${apartadas(l.apartado)} para clientas. Libera o resuelve esos apartados primero.`;
  }
  return null;
}

/** La pregunta sobre las tallas, en voz de tienda: lo que se escribe en cada una depende del motivo (`modoDeAjuste`). Al contar
 *  nombra el lugar: contar el piso con el almacén elegido SUMARÍA al almacén lo que está colgado. */
export function preguntaCantidades(modo: ModoAjuste, lugar: LugarAjuste): string {
  if (modo === "diferencia") return "¿Cuántas sumas o restas de cada talla?";
  const donde = lugar === "piso" ? " en el piso" : lugar === "almacen" ? " en el almacén" : "";
  return `¿Cuántas contaste${donde} de cada talla?`;
}

/** El piso de cada talla en los botones «−»: más abajo la base lo rechazaría. Una prenda nueva en la tienda no baja de cero y lo
 *  apartado para clientas no se puede dejar de contar. Al sumar o restar es un cambio (negativo o cero); al contar, una cantidad. */
export function minimoDeAjuste(v: VarianteAjuste, lugar: LugarAjuste, modo: ModoAjuste): number {
  if (v.sinHistoria) return 0;
  const apartado = apartadoEn(v, lugar);
  return modo === "contado" ? apartado : 0 - Math.max(0, stockEn(v, lugar) - apartado);
}

/** Lo que queda escrito en una talla al tocar «−» (paso −1) o «+» (paso +1); `null`: ya no se puede bajar más. Al sumar o
 *  restar, vacío es 0 y volver a 0 deja la talla sin ajuste (vacía). Al contar, vacío es «no la conté»: el primer toque parte de lo
 *  que dice el sistema, no de cero. */
export function textoTrasPaso(texto: string, paso: 1 | -1, modo: ModoAjuste, actual: number, minimo: number): string | null {
  const t = texto.trim();
  const escrito = t !== "" && Number.isInteger(Number(t)) ? Number(t) : null;
  const siguiente = (escrito ?? (modo === "contado" ? actual : 0)) + paso;
  if (siguiente < minimo) return null;
  if (modo === "diferencia" && siguiente === 0) return "";
  return String(siguiente);
}

/** Lo que se acepta al teclear en la cajita de una talla: al contar solo dígitos; al sumar o restar, un «−» al comienzo y dígitos. */
export function limpiarTextoAjuste(crudo: string, modo: ModoAjuste): string {
  const normal = crudo.replace(/[−–]/g, "-");
  const digitos = normal.replace(/\D/g, "");
  if (modo === "contado") return digitos;
  return normal.trimStart().startsWith("-") ? `-${digitos}` : digitos;
}

/** La primera línea de una talla: cuánto hay en el lugar que se ajusta («2 en el almacén», «Nada en el piso»). Si el modal muestra
 *  varios colores a la vez (sin prenda), el color va delante: sin él, dos «M» no se distinguen. */
export function textoStockTalla(v: VarianteAjuste, lugar: LugarAjuste, conColor: boolean): string {
  const n = stockEn(v, lugar);
  const donde = lugar === "piso" ? "el piso" : lugar === "almacen" ? "el almacén" : "la sede";
  const base = n > 0 ? `${n} en ${donde}` : `Nada en ${donde}`;
  return conColor && v.color ? `${v.color} · ${base}` : base;
}

/** La segunda línea de una talla: lo que pasa con ella y lo que hay que saber. Cómo queda (o que coincide con el sistema, al
 *  contar), lo apartado para clientas y, si nunca estuvo en la tienda, dónde entra su primera cantidad. */
export function detalleDeTalla(o: {
  variante: VarianteAjuste;
  linea: LineaAjuste | undefined;
  /** Lo escrito en la talla, tal cual. */
  texto: string;
  modo: ModoAjuste;
  lugar: LugarAjuste;
  ubicado: "piso" | "almacen";
  separaPisoAlmacen: boolean;
  puedeBajarAlPiso: boolean;
}): string {
  const { variante, linea, texto, modo, lugar } = o;
  const escrito = texto.trim();
  const coincide = !linea && modo === "contado" && escrito !== "" && Number.isInteger(Number(escrito)) && Number(escrito) === stockEn(variante, lugar);
  const partes = [
    textoQuedara(linea, modo),
    coincide ? "Coincide con el sistema" : "",
    textoApartadoTalla(apartadoEn(variante, lugar), modo).replace(/^ · /, ""),
    variante.sinHistoria ? textoPrendaNueva(o.ubicado, o.separaPisoAlmacen, o.puedeBajarAlPiso) : "",
  ];
  return partes.filter(Boolean).join(" · ");
}

/** Lo apartado de una talla, al lado de su stock («stock 2 · 1 apartada»); vacío si no tiene. Al contar, pide contarlas:
 *  la prenda apartada sigue en la tienda y en el stock (ADR-0141: el conteo lee `cantidad`, no lo libre). */
export function textoApartadoTalla(apartado: number, modo: ModoAjuste): string {
  if (apartado === 0) return "";
  if (modo === "contado") return ` · ${apartadas(apartado)} (${apartado === 1 ? "cuéntala" : "cuéntalas"})`;
  return ` · ${apartadas(apartado)}`;
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

// Nombra los dos caminos: sin ellos, quien sube o guarda prendas lo arma aquí a mano («Otro» −N, «Reposición» +N) y sin rastro.
// «Subir a almacén» es el botón de la tarjeta de Existencias (ADR-0300); antes decía «⋯ ▸ Retirar del piso», un menú que ya no existe.
export const NOTA_REPOSICION_CERRADA =
  "Subir al piso: «Reponer». Guardar en el almacén: «Subir a almacén». Los dos, en Existencias (si no los ves, pídele al líder el módulo «Bajada al piso»). Prendas de más al contar: «Conteo físico».";

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

type LineaParaEnviar = { variante: Pick<VarianteAjuste, "varianteId">; delta: number; /** La línea de conteo donde esta prenda faltó y con la que este ajuste se enlaza (solo una suma). */ conteoItemId?: string | null };

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
  // `conteo_item_id` solo viaja cuando hay enlace: sin él el envío es idéntico al de siempre (misma huella del reintento).
  const aItems = (ls: readonly LineaParaEnviar[]) =>
    ls.map((l) => ({ variante_id: l.variante.varianteId, cantidad: l.delta, ...(l.conteoItemId ? { conteo_item_id: l.conteoItemId } : {}) }));
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
export function textoExitoAjuste(r: { ajustes: number; cargas: number; enlazados?: number; ya_registrado?: boolean }): string {
  const partes = [
    r.ajustes > 0 && `${r.ajustes} ${r.ajustes === 1 ? "variante ajustada" : "variantes ajustadas"}`,
    (r.enlazados ?? 0) > 0 && `${r.enlazados} ${r.enlazados === 1 ? "enlazada" : "enlazadas"} al conteo donde faltaba`,
    r.cargas > 0 && `${r.cargas} ${r.cargas === 1 ? "cargada" : "cargadas"} como stock inicial`,
  ].filter(Boolean);
  return `${r.ya_registrado ? "Ya estaba guardado: " : ""}${partes.join(" · ")}`;
}

/** Lee el jsonb que devuelve `ajustar_inventario`; si no calza, null (y el modal usa lo que envió). */
export function leerResultadoAjuste(data: unknown): { ajustes: number; cargas: number; enlazados: number; ya_registrado: boolean } | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (!Number.isInteger(d.ajustes) || !Number.isInteger(d.cargas) || typeof d.ya_registrado !== "boolean") return null;
  return { ajustes: d.ajustes as number, cargas: d.cargas as number, enlazados: Number.isInteger(d.enlazados) ? (d.enlazados as number) : 0, ya_registrado: d.ya_registrado };
}

// ---------------------------------------------------------------------------------------------------------------
// La prenda que faltó en un conteo y apareció (ADR-0291, Felipe 2026-09-30)
// ---------------------------------------------------------------------------------------------------------------
//
// Contrato — PROMETE: dado lo que la base dice que faltó en conteos cerrados (`fn_faltantes_de_conteo`) y las líneas de
// suma del modal, decide a cuáles hay que preguntarles «¿es la que faltó?», y con lo respondido arma los enlaces que
// viajan a `ajustar_inventario`. ASUME: la base vuelve a validar todo (`registrar_hallazgo_de_conteo`); esto solo evita
// el viaje para enterarse. NO decide qué es una falta: eso lo dijo el cierre del conteo.

/** Lo que faltó en un conteo cerrado y todavía no se recupera: una fila de `fn_faltantes_de_conteo`. */
export type FaltanteConteo = {
  varianteId: string;
  conteoItemId: string;
  conteoNumero: number;
  /** Cuándo se cerró ese conteo (ISO). */
  cerradoEn: string | null;
  faltaron: number;
  encontradas: number;
  /** Lo que aún se puede enlazar: faltaron − encontradas. */
  pendientes: number;
};

/** Lee lo que devuelve `fn_faltantes_de_conteo` (más reciente primero) y se queda con UN faltante por prenda: el del conteo
 *  más reciente. Una fila mal armada se ignora: sin pregunta, el ajuste sigue como cualquier otro. */
export function faltantesDesdeJson(data: unknown): Map<string, FaltanteConteo> {
  const salida = new Map<string, FaltanteConteo>();
  if (!Array.isArray(data)) return salida;
  for (const fila of data) {
    if (!fila || typeof fila !== "object") continue;
    const f = fila as Record<string, unknown>;
    if (typeof f.variante_id !== "string" || typeof f.conteo_item_id !== "string") continue;
    if (!Number.isInteger(f.conteo_numero) || !Number.isInteger(f.faltaron) || !Number.isInteger(f.pendientes)) continue;
    if ((f.pendientes as number) < 1 || salida.has(f.variante_id)) continue;
    salida.set(f.variante_id, {
      varianteId: f.variante_id,
      conteoItemId: f.conteo_item_id,
      conteoNumero: f.conteo_numero as number,
      cerradoEn: typeof f.cerrado_en === "string" ? f.cerrado_en : null,
      faltaron: f.faltaron as number,
      encontradas: Number.isInteger(f.encontradas) ? (f.encontradas as number) : 0,
      pendientes: f.pendientes as number,
    });
  }
  return salida;
}

export type EleccionHallazgo = "si" | "no";

/** Una línea que SUMA una prenda que faltó en un conteo: a ella se le pregunta. */
export type CandidataHallazgo<L> = { linea: L; faltante: FaltanteConteo };

/** Las líneas de suma cuya prenda faltó en un conteo cerrado. Una resta, una carga inicial o una prenda sin falta no preguntan. */
export function candidatasDeHallazgo<L extends { variante: Pick<VarianteAjuste, "varianteId">; delta: number }>(
  lineas: readonly L[],
  faltantes: ReadonlyMap<string, FaltanteConteo>
): CandidataHallazgo<L>[] {
  const salida: CandidataHallazgo<L>[] = [];
  for (const linea of lineas) {
    const faltante = faltantes.get(linea.variante.varianteId);
    if (faltante && linea.delta > 0) salida.push({ linea, faltante });
  }
  return salida;
}

/** Con lo respondido: qué líneas quedan enlazadas (y a qué línea de conteo), cuáles siguen sin respuesta y cuáles dijeron
 *  «sí» pero suman más de lo que faltó (la base no deja recuperar más de lo que faltó). */
export function resolverHallazgos<L extends { variante: Pick<VarianteAjuste, "varianteId">; delta: number }>(
  candidatas: readonly CandidataHallazgo<L>[],
  elecciones: Readonly<Record<string, EleccionHallazgo | undefined>>
): { enlaces: Map<string, string>; sinResponder: CandidataHallazgo<L>[]; conExceso: CandidataHallazgo<L>[] } {
  const enlaces = new Map<string, string>();
  const sinResponder: CandidataHallazgo<L>[] = [];
  const conExceso: CandidataHallazgo<L>[] = [];
  for (const c of candidatas) {
    const e = elecciones[c.linea.variante.varianteId];
    if (e === undefined) sinResponder.push(c);
    else if (e === "si") {
      if (c.linea.delta > c.faltante.pendientes) conExceso.push(c);
      else enlaces.set(c.linea.variante.varianteId, c.faltante.conteoItemId);
    }
  }
  return { enlaces, sinResponder, conExceso };
}

/** «Faltó 1 en el Conteo 13 (30/09).» — y, si ya se recuperó parte, cuánto queda. */
export function textoFaltanteConteo(f: Pick<FaltanteConteo, "conteoNumero" | "cerradoEn" | "faltaron" | "encontradas" | "pendientes">): string {
  const cuando = f.cerradoEn ? ` (${diaMes(f.cerradoEn)})` : "";
  const ya = f.encontradas > 0 ? ` Ya se encontró ${f.encontradas}: quedan ${f.pendientes} por encontrar.` : "";
  return `Faltó ${f.faltaron} en el Conteo ${f.conteoNumero}${cuando}.${ya}`;
}

/** El aviso al confirmar con una pregunta sin responder: nombra la prenda para que se encuentre en la lista. */
export function textoHallazgoSinResponder(nombre: string, f: Pick<FaltanteConteo, "conteoNumero">): string {
  return `Indica si ${nombre} es la prenda que faltó en el Conteo ${f.conteoNumero}.`;
}

/** El aviso cuando se enlaza más de lo que faltó. */
export function textoHallazgoConExceso(nombre: string, f: Pick<FaltanteConteo, "conteoNumero" | "pendientes">): string {
  return `En el Conteo ${f.conteoNumero} solo faltaron ${f.pendientes} de ${nombre}: suma ${f.pendientes} para enlazarla y registra el resto en otro ajuste.`;
}
