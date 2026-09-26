import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { hoyEnLima } from "@/lib/movimientos-reglas";
import { idsDeVentasBuscadas } from "@/lib/ventas-v2";
import {
  ESTADOS_POR_ENVIAR,
  TAMANO_PAGINA,
  TOPE_TOTALES,
  totalesEnLaBase,
  aFila,
  quienVendio,
  diaDeLima,
  limitesUTC,
  mezclaDePagos,
  resumir,
  serieDiaria,
  totalDeVenta,
  totalesDesdeLaBase,
  unidadesDeVenta,
  type CursorVentas,
  type DiaResumen,
  type FilaHistorial,
  type FiltrosHistorial,
  type ItemCrudo,
  type MetodoResumen,
  type ResumenHistorial,
  type TotalesDeLaBase,
  type VentaCruda,
} from "@/lib/ventas-historial-reglas";

// Las páginas (server) importan todo desde acá; los componentes cliente, SOLO `ventas-historial-reglas.ts`.
export * from "@/lib/ventas-historial-reglas";

// Historial de ventas (Ventas ▸ Historial, ADR-0147): solo LEE. La lista va con PostgREST sobre las tablas
// (`ventas`, `venta_items`, `venta_pagos`, `comprobantes`); los totales del rango, con
// `fn_totales_historial_ventas` (ADR-0191), que suma en la base sin el tope de 1.000 filas.
// Quién ve qué lo decide la RLS (el líder todas las tiendas, cada quien la suya) y la función aplica
// esa misma regla; aquí no se refuerza nada más.
//
// `ventas.created_at` es la única fecha de la venta y el cursor de paginado es
// (`created_at`, `id`): estable aunque dos ventas caigan en el mismo instante.
//
// El embed `cliente:clientas` (antes `clientes`) sigue la FK `ventas_clienta_fk`
// desde 20260922140000_ficha_de_clienta_v1_backend.sql — la ficha de clienta (D-76/D-77)
// retira la tabla vieja `clientes` (~0 filas, sin RLS de UPDATE) en favor de `clientas`.

type Supabase = Awaited<ReturnType<typeof createClient>>;

const CAMPOS_LISTA = "id, created_at, estado, nota, usuario_id, asesora_id, anulado_en";
/** Lo que se dibuja de cada venta. Las marcas de posventa (ADR-0230) salen de relaciones que ya existían:
 *  `cambios.venta_item_id`, `devoluciones.venta_id` y `separaciones.venta_id` (el apartado entregado). */
const embebidosLista = (conReferencia: boolean) => `ubicacion:ubicaciones ( id, nombre ),
  cliente:clientas ( nombre ),
  venta_items ( id, cantidad, precio_unitario, descuento_unitario, subtotal,
    variante:variantes ( color_codigo, talla:tallas ( valor ), color:colores ( nombre, hex ),
      producto:productos ( referencia, producto_fotos ( url, color_codigo ) ) ),
    cambios ( created_at ) ),
  venta_pagos ( metodo, monto${conReferencia ? ", referencia" : ""} ),
  comprobantes ( tipo, serie, numero, estado, created_at, enviado_at ),
  devoluciones ( estado, created_at ),
  separaciones ( codigo, created_at )`;
const selectLista = (o: Columnas) => `${CAMPOS_LISTA}${o.prueba ? ", es_prueba" : ""}, ${embebidosLista(o.referencia)}`;

/** Columnas aditivas que pueden no estar todavía en la base: `es_prueba` (D-54) y `venta_pagos.referencia` (ADR-0230). */
type Columnas = { prueba: boolean; referencia: boolean };
const TODAS: Columnas = { prueba: true, referencia: true };

/** Qué columna quitar tras un 42703: la que nombra el mensaje de Postgres. Si no nombra ninguna conocida, null (no se
 *  reintenta a ciegas: el error sale tal cual). */
function sinLaColumnaQueFalta(o: Columnas, mensaje: string | undefined): Columnas | null {
  if (o.referencia && mensaje?.includes("referencia")) return { ...o, referencia: false };
  if (o.prueba && mensaje?.includes("es_prueba")) return { ...o, prueba: false };
  return null;
}

// `42703` = undefined_column: PostgREST lo devuelve cuando el `select`/filtro nombra una columna
// que la base no tiene todavía. Mismo criterio que `getStockPorUbicacion` con `cantidad_apartada`
// (`inventario-v2.ts`): la migración de `es_prueba` (D-54, ADR-0159) es aditiva y puede tardar en
// pegarse en producción — sin este reintento, desplegar la web ANTES que la migración tumbaría
// todo el historial de ventas, no solo el filtro nuevo.
const COLUMNA_INEXISTENTE = "42703";

/** La consulta base con los filtros de la pantalla. La lista y los totales pasan por acá para
 *  que filtren EXACTAMENTE igual: un total que no coincide con la lista es peor que ninguno.
 *
 *  Los filtros por pago y por comprobante usan un embed con alias (`pago_filtro`, `comp_filtro`)
 *  aparte del que se dibuja: `!inner` deja solo las ventas que lo cumplen, pero también recorta las
 *  líneas del embed donde se aplica — una venta pagada mitad efectivo y mitad Yape, filtrada por
 *  efectivo, mostraría solo la mitad. «Sin comprobante» es un anti-join (`is.null` sobre el embed
 *  con `!left`); los dos se probaron contra la base local y contados a mano.
 *
 *  `conPrueba = false` (el reintento de más abajo) quita `es_prueba` del `select` Y del filtro:
 *  pedirla en el `select` con la columna inexistente fallaría igual que filtrarla por ella. */
function consulta(supabase: Supabase, select: string, f: FiltrosHistorial, conPrueba = true, ids: string[] | null = null) {
  const conComprobante = f.comprobante === "con" || f.comprobante === "por_enviar" || f.comprobante === "factura";
  const extras = [
    f.pago ? "pago_filtro:venta_pagos!inner ( metodo )" : null,
    conComprobante ? "comp_filtro:comprobantes!inner ( tipo, estado )" : null,
    f.comprobante === "sin" ? "comp_filtro:comprobantes!left ( tipo )" : null,
  ].filter((e): e is string => e !== null);

  const { desdeISO, hastaISO } = limitesUTC(f.desde, f.hasta);
  let q = supabase.from("ventas").select([select, ...extras].join(", "));
  // Con el buscador (ADR-0230) la lista ignora el período: la clienta vuelve semanas después y su venta está fuera de
  // «30 días». Los ids ya vienen acotados por la búsqueda y por la RLS.
  if (ids) q = q.in("id", ids);
  if (!f.busqueda) {
    if (desdeISO) q = q.gte("created_at", desdeISO);
    if (hastaISO) q = q.lt("created_at", hastaISO);
  }
  // Buscando, la tienda solo limita si el líder la eligió; la de la cabecera por defecto no (la clienta pudo comprar en otra).
  if (f.sedeId && (!f.busqueda || f.sedeExplicita)) q = q.eq("ubicacion_id", f.sedeId);
  // «Vendedor X» = las que atendió X y, de las anteriores a la fila «Atendió» (sin vendedora), las que cobró su sesión.
  // `vendedorId` ya pasó por `esUuid` en `filtrosDesdeParams`, así que no trae nada que rompa el filtro.
  if (f.vendedorId) q = q.or(`asesora_id.eq.${f.vendedorId},and(asesora_id.is.null,usuario_id.eq.${f.vendedorId})`);
  if (f.estado !== "todas") q = q.eq("estado", f.estado);
  // D-54 (ADR-0159): dato ficticio de prueba, fuera de la vista por defecto — el toggle «Ver
  // datos de prueba» lo trae de vuelta.
  if (conPrueba && !f.incluirPrueba) q = q.eq("es_prueba", false);
  if (f.pago) q = q.eq("pago_filtro.metodo", f.pago);
  // Una nota de crédito corrige un comprobante, no ampara la venta: cuentan boleta, factura y nota de venta (ADR-0164).
  if (f.comprobante === "factura") q = q.eq("comp_filtro.tipo", "factura");
  else if (f.comprobante !== "todos") q = q.in("comp_filtro.tipo", ["boleta", "factura", "nota_venta"]);
  if (f.comprobante === "sin") q = q.is("comp_filtro", null);
  if (f.comprobante === "por_enviar") q = q.in("comp_filtro.estado", [...ESTADOS_POR_ENVIAR]);
  if (f.conClienta) q = q.not("cliente_id", "is", null);
  return q;
}

/** Los ids que acotan la consulta, o null si nada la acota. `busqueda`: las ventas que calzan con el buscador (en
 *  cualquier fecha); `posventa`: las que tuvieron un cambio o una devolución. La lista usa las dos (intersección); los
 *  totales del período, solo `posventa` (buscar no cambia las cifras del período). */
export type IdsHistorial = { busqueda: string[] | null; posventa: string[] | null };

export async function idsDeHistorial(f: FiltrosHistorial, ctx: { ubicacionId: string; esLider: boolean }): Promise<IdsHistorial> {
  const [busqueda, posventa] = await Promise.all([
    // Un líder busca en todas las tiendas salvo que haya elegido una; una integrante, en la suya (RLS).
    f.busqueda
      ? idsDeVentasBuscadas(f.sedeExplicita && f.sedeId ? f.sedeId : ctx.ubicacionId, f.busqueda, ctx.esLider && !f.sedeExplicita)
      : Promise.resolve(null),
    f.posventa ? idsConPosventa(f) : Promise.resolve(null),
  ]);
  return { busqueda, posventa };
}

/** Intersección de dos listas opcionales de ids: null = «sin acotar». */
export function combinarIds(a: string[] | null, b: string[] | null): string[] | null {
  if (!a) return b;
  if (!b) return a;
  const enB = new Set(b);
  return a.filter((id) => enB.has(id));
}

/** Las ventas que tuvieron un cambio o una devolución (no rechazada). Un cambio o una devolución siempre ocurre DESPUÉS
 *  de la venta, así que basta mirar desde el inicio del período: son pocos (3 tiendas), caben en un `in (...)`. */
async function idsConPosventa(f: FiltrosHistorial): Promise<string[]> {
  const supabase = await createClient();
  const { desdeISO } = limitesUTC(f.busqueda ? undefined : f.desde);
  let devoluciones = supabase.from("devoluciones").select("venta_id").neq("estado", "rechazada");
  let cambios = supabase.from("cambios").select("venta_item:venta_items!inner ( venta_id )");
  if (desdeISO) {
    devoluciones = devoluciones.gte("created_at", desdeISO);
    cambios = cambios.gte("created_at", desdeISO);
  }
  const [d, c] = await Promise.all([devoluciones.limit(TOPE_TOTALES), cambios.limit(TOPE_TOTALES)]);
  const deDevoluciones = exigir(d, "las devoluciones del período").map((x) => x.venta_id as string);
  const deCambios = (exigir(c, "los cambios del período") as unknown as { venta_item: { venta_id: string } | null }[]).map((x) => x.venta_item?.venta_id).filter((id): id is string => !!id);
  return [...new Set([...deDevoluciones, ...deCambios])];
}

/** Quién registró cada venta. `personas` vive en `public` (Dynamic) y PostgREST no embebe entre
 *  schemas: se resuelve aparte, con la misma función que ya usan Cambios y el detalle de caja. */
async function nombresDe(supabase: Supabase, ids: (string | null)[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((id): id is string => !!id))];
  if (unicos.length === 0) return new Map();
  const filas = exigir(await supabase.rpc("fn_nombres_personas", { p_ids: unicos }), "quién registró cada venta");
  return new Map(filas.map((n) => [n.id, n.nombre]));
}

export type PaginaHistorial = {
  filas: FilaHistorial[];
  /** Cursor para pedir la página siguiente; null si esta es la última. */
  siguiente: CursorVentas | null;
};

export async function listarVentasHistorial(
  f: FiltrosHistorial,
  opciones: { cursor?: CursorVentas | null; limite?: number; ids?: IdsHistorial } = {}
): Promise<PaginaHistorial> {
  const limite = opciones.limite ?? TAMANO_PAGINA;
  const supabase = await createClient();
  const c = opciones.cursor;
  const ids = combinarIds(opciones.ids?.busqueda ?? null, opciones.ids?.posventa ?? null);
  const pedir = (columnas: Columnas) => {
    let q = consulta(supabase, selectLista(columnas), f, columnas.prueba, ids);
    // «Las siguientes a ESTA»: más vieja, o del mismo instante con un id menor. Los valores ya pasaron por
    // `leerCursorVentas` (formato de fecha y de uuid), así que no traen nada que rompa el filtro.
    if (c) q = q.or(`created_at.lt."${c.creadoEn}",and(created_at.eq."${c.creadoEn}",id.lt.${c.id})`);
    // Una fila de más: si llega, hay página siguiente (sin un `count` aparte).
    return q.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limite + 1);
  };
  // Hasta dos reintentos, uno por cada columna aditiva que la base todavía no tenga.
  let columnas = TODAS;
  let res = await pedir(columnas);
  for (let i = 0; i < 2 && res.error?.code === COLUMNA_INEXISTENTE; i++) {
    const siguiente = sinLaColumnaQueFalta(columnas, res.error.message);
    if (!siguiente) break;
    columnas = siguiente;
    res = await pedir(columnas);
  }
  const crudas = exigir(res, "el historial de ventas") as unknown as VentaCruda[];

  const hayMas = crudas.length > limite;
  const pagina = hayMas ? crudas.slice(0, limite) : crudas;
  const nombres = await nombresDe(supabase, pagina.map(quienVendio));
  const ultima = pagina[pagina.length - 1];
  return {
    filas: pagina.map((v) => aFila(v, nombres)),
    siguiente: hayMas && ultima ? { creadoEn: ultima.created_at, id: ultima.id } : null,
  };
}

export type TotalesHistorial = {
  resumen: ResumenHistorial;
  /** Solo en el camino de respaldo (la base aún sin `fn_totales_historial_ventas`): había más ventas que
   *  `TOPE_TOTALES`, los números serían parciales y la pantalla dice que no los muestra. */
  parcial: boolean;
  /** Lo vendido por día de Lima en todo el rango (trazo del período y total de cada día). Vacío si `parcial`. */
  porDia: DiaResumen[];
  /** Cuánto se cobró por cada forma de pago en el rango. Vacío si `parcial`. */
  porMetodo: MetodoResumen[];
};

// La función todavía no existe en la base (web desplegada antes que la migración): PostgREST responde PGRST202;
// Postgres, 42883. Solo en ese caso se vuelve al cálculo fila por fila con su tope.
const FUNCION_INEXISTENTE = new Set(["PGRST202", "42883"]);

/** Los totales de TODO el rango filtrado (no de la página): cuántas ventas, cuánto se vendió, ticket promedio,
 *  más lo vendido por día y por forma de pago. Los suma la base (`fn_totales_historial_ventas`, ADR-0191) con los
 *  MISMOS filtros que `consulta()` y la misma regla de lectura que la RLS: sin tope de filas. */
export async function totalesVentasHistorial(f: FiltrosHistorial, ids: IdsHistorial = { busqueda: null, posventa: null }): Promise<TotalesHistorial> {
  const supabase = await createClient();
  // Las cifras son del PERÍODO: el buscador no las cambia (la lista dice aparte cuántas ventas encontró).
  const delPeriodo: FiltrosHistorial = { ...f, busqueda: undefined };
  if (!totalesEnLaBase(delPeriodo) || ids.posventa) return totalesConTope(supabase, delPeriodo, ids.posventa);
  f = delPeriodo;
  const { desdeISO, hastaISO } = limitesUTC(f.desde, f.hasta);
  const res = await supabase.rpc("fn_totales_historial_ventas", {
    p_desde: desdeISO,
    p_hasta: hastaISO,
    p_sede_id: f.sedeId,
    p_vendedor_id: f.vendedorId,
    p_estado: f.estado,
    p_pago: f.pago,
    p_comprobante: f.comprobante,
    p_incluir_prueba: f.incluirPrueba,
  });
  if (res.error && FUNCION_INEXISTENTE.has(res.error.code)) return totalesConTope(supabase, f);
  const t = exigir(res, "los totales del historial de ventas") as unknown as TotalesDeLaBase;
  return { parcial: false, ...totalesDesdeLaBase(t, { desde: f.desde, hasta: f.hasta, hoy: hoyEnLima() }) };
}

// Para los totales del rango solo hacen falta los importes, el día y cómo se pagó: sin prendas ni comprobantes.
const SELECT_TOTALES = "id, created_at, estado, venta_items ( cantidad, precio_unitario, descuento_unitario, subtotal ), venta_pagos ( metodo, monto )";

/** El cálculo fila por fila con el tope de PostgREST: el respaldo si la base aún no tuviera `fn_totales_historial_ventas`
 *  y, desde ADR-0230, el camino de los filtros que esa función no conoce (por enviar, factura, con clienta, posventa). */
async function totalesConTope(supabase: Supabase, f: FiltrosHistorial, ids: string[] | null = null): Promise<TotalesHistorial> {
  const pedir = (conPrueba: boolean) => consulta(supabase, SELECT_TOTALES, f, conPrueba, ids).order("created_at", { ascending: false }).limit(TOPE_TOTALES + 1);
  let res = await pedir(true);
  if (res.error?.code === COLUMNA_INEXISTENTE) res = await pedir(false);
  const crudas = exigir(res, "los totales del historial de ventas") as unknown as {
    id: string;
    created_at: string;
    estado: string;
    venta_items: ItemCrudo[];
    venta_pagos: VentaCruda["venta_pagos"];
  }[];
  const parcial = crudas.length > TOPE_TOTALES;
  const ventas = (parcial ? crudas.slice(0, TOPE_TOTALES) : crudas).map((v) => ({
    anulada: v.estado === "anulada",
    total: totalDeVenta(v.venta_items),
    unidades: unidadesDeVenta(v.venta_items),
    fecha: diaDeLima(v.created_at),
    pagos: v.venta_pagos,
  }));
  return {
    parcial,
    resumen: resumir(ventas),
    // Con el tope superado solo habría los días más recientes: un trazo así mentiría, y no se dibuja.
    porDia: parcial ? [] : serieDiaria(ventas, { desde: f.desde, hasta: f.hasta, hoy: hoyEnLima() }),
    porMetodo: parcial ? [] : mezclaDePagos(ventas),
  };
}
