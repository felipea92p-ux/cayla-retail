import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { hoyEnLima } from "@/lib/movimientos-reglas";
import {
  TAMANO_PAGINA,
  TOPE_TOTALES,
  aFila,
  diaDeLima,
  limitesUTC,
  mezclaDePagos,
  resumir,
  serieDiaria,
  totalDeVenta,
  unidadesDeVenta,
  type CursorVentas,
  type DiaResumen,
  type FilaHistorial,
  type FiltrosHistorial,
  type ItemCrudo,
  type MetodoResumen,
  type ResumenHistorial,
  type VentaCruda,
} from "@/lib/ventas-historial-reglas";

// Las páginas (server) importan todo desde acá; los componentes cliente, SOLO `ventas-historial-reglas.ts`.
export * from "@/lib/ventas-historial-reglas";

// Historial de ventas (Ventas ▸ Historial, ADR-0145): solo LEE, con PostgREST sobre las tablas que
// producción ya tiene idénticas a las locales (`ventas`, `venta_items`, `venta_pagos`,
// `comprobantes`) — sin función nueva en la base, así que nada de esto espera una migración.
// Quién ve qué lo decide la RLS (`fn_puede_operar_ubicacion`: el líder todas las tiendas, cada
// quien la suya); aquí no se refuerza nada más.
//
// `ventas.created_at` es la única fecha de la venta y el cursor de paginado es
// (`created_at`, `id`): estable aunque dos ventas caigan en el mismo instante.

type Supabase = Awaited<ReturnType<typeof createClient>>;

const SELECT_LISTA = `id, created_at, estado, nota, usuario_id,
  ubicacion:ubicaciones ( id, nombre ),
  cliente:clientes ( nombre ),
  venta_items ( cantidad, precio_unitario, descuento_unitario, subtotal,
    variante:variantes ( color_codigo, talla:tallas ( valor ), color:colores ( nombre, hex ),
      producto:productos ( referencia, producto_fotos ( url, color_codigo ) ) ) ),
  venta_pagos ( metodo, monto ),
  comprobantes ( tipo, serie, numero, estado, created_at )`;

// Para los totales del rango solo hacen falta los importes, el día y cómo se pagó: sin prendas ni comprobantes.
const SELECT_TOTALES = `id, created_at, estado,
  venta_items ( cantidad, precio_unitario, descuento_unitario, subtotal ),
  venta_pagos ( metodo, monto )`;

/** La consulta base con los filtros de la pantalla. La lista y los totales pasan por acá para
 *  que filtren EXACTAMENTE igual: un total que no coincide con la lista es peor que ninguno.
 *
 *  Los filtros por pago y por comprobante usan un embed con alias (`pago_filtro`, `comp_filtro`)
 *  aparte del que se dibuja: `!inner` deja solo las ventas que lo cumplen, pero también recorta las
 *  líneas del embed donde se aplica — una venta pagada mitad efectivo y mitad Yape, filtrada por
 *  efectivo, mostraría solo la mitad. «Sin comprobante» es un anti-join (`is.null` sobre el embed
 *  con `!left`); los dos se probaron contra la base local y contados a mano. */
function consulta(supabase: Supabase, select: string, f: FiltrosHistorial) {
  const extras = [
    f.pago ? "pago_filtro:venta_pagos!inner ( metodo )" : null,
    f.comprobante === "con" ? "comp_filtro:comprobantes!inner ( tipo )" : null,
    f.comprobante === "sin" ? "comp_filtro:comprobantes!left ( tipo )" : null,
  ].filter((e): e is string => e !== null);

  const { desdeISO, hastaISO } = limitesUTC(f.desde, f.hasta);
  let q = supabase.from("ventas").select([select, ...extras].join(", "));
  if (desdeISO) q = q.gte("created_at", desdeISO);
  if (hastaISO) q = q.lt("created_at", hastaISO);
  if (f.sedeId) q = q.eq("ubicacion_id", f.sedeId);
  if (f.vendedorId) q = q.eq("usuario_id", f.vendedorId);
  if (f.estado !== "todas") q = q.eq("estado", f.estado);
  if (f.pago) q = q.eq("pago_filtro.metodo", f.pago);
  // Una nota de crédito corrige un comprobante, no ampara la venta: solo boleta y factura cuentan.
  if (f.comprobante !== "todos") q = q.in("comp_filtro.tipo", ["boleta", "factura"]);
  if (f.comprobante === "sin") q = q.is("comp_filtro", null);
  return q;
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
  opciones: { cursor?: CursorVentas | null; limite?: number } = {}
): Promise<PaginaHistorial> {
  const limite = opciones.limite ?? TAMANO_PAGINA;
  const supabase = await createClient();
  let q = consulta(supabase, SELECT_LISTA, f);
  const c = opciones.cursor;
  // «Las siguientes a ESTA»: más vieja, o del mismo instante con un id menor. Los valores ya pasaron por
  // `leerCursorVentas` (formato de fecha y de uuid), así que no traen nada que rompa el filtro.
  if (c) q = q.or(`created_at.lt."${c.creadoEn}",and(created_at.eq."${c.creadoEn}",id.lt.${c.id})`);
  // Una fila de más: si llega, hay página siguiente (sin un `count` aparte).
  const res = await q.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limite + 1);
  const crudas = exigir(res, "el historial de ventas") as unknown as VentaCruda[];

  const hayMas = crudas.length > limite;
  const pagina = hayMas ? crudas.slice(0, limite) : crudas;
  const nombres = await nombresDe(supabase, pagina.map((v) => v.usuario_id));
  const ultima = pagina[pagina.length - 1];
  return {
    filas: pagina.map((v) => aFila(v, nombres)),
    siguiente: hayMas && ultima ? { creadoEn: ultima.created_at, id: ultima.id } : null,
  };
}

export type TotalesHistorial = {
  resumen: ResumenHistorial;
  /** Hay más ventas que `TOPE_TOTALES`: los números serían parciales, y la pantalla dice que no los muestra. */
  parcial: boolean;
  /** Lo vendido por día de Lima en todo el rango (trazo del período y total de cada día). Vacío si `parcial`. */
  porDia: DiaResumen[];
  /** Cuánto se cobró por cada forma de pago en el rango. Vacío si `parcial`. */
  porMetodo: MetodoResumen[];
};

/** Los totales de TODO el rango filtrado (no de la página): cuántas ventas, cuánto se vendió, ticket promedio,
 *  más lo vendido por día y por forma de pago. Todo sale de la misma consulta, con el mismo tope. */
export async function totalesVentasHistorial(f: FiltrosHistorial): Promise<TotalesHistorial> {
  const supabase = await createClient();
  const res = await consulta(supabase, SELECT_TOTALES, f)
    .order("created_at", { ascending: false })
    .limit(TOPE_TOTALES + 1);
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
