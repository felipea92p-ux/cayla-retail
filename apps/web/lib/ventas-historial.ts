import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { hoyEnLima } from "@/lib/movimientos-reglas";
import { clasificarBusqueda } from "@/lib/cambios-reglas";
import { literalParaIlike } from "@/lib/ventas-v2";
import {
  TAMANO_PAGINA,
  TOPE_TOTALES,
  aFila,
  contarPendientesDeComprobante,
  diaDeLima,
  elegirComprobante,
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

// Historial de ventas (Ventas ▸ Historial, ADR-0147): solo LEE, con PostgREST sobre las tablas que
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

// Para los totales del rango hacen falta los importes, el día, cómo se pagó y el estado del
// comprobante (para contar «pendientes de enviar»): sin prendas, sin el detalle de cada línea.
const SELECT_TOTALES = `id, created_at, estado,
  venta_items ( cantidad, precio_unitario, descuento_unitario, subtotal ),
  venta_pagos ( metodo, monto ),
  comprobantes ( tipo, serie, numero, estado, created_at )`;

/** La consulta base con los filtros de la pantalla. La lista y los totales pasan por acá para
 *  que filtren EXACTAMENTE igual: un total que no coincide con la lista es peor que ninguno.
 *
 *  Los filtros por pago y por comprobante usan un embed con alias (`pago_filtro`, `comp_filtro`)
 *  aparte del que se dibuja: `!inner` deja solo las ventas que lo cumplen, pero también recorta las
 *  líneas del embed donde se aplica — una venta pagada mitad efectivo y mitad Yape, filtrada por
 *  efectivo, mostraría solo la mitad. «Sin comprobante» es un anti-join (`is.null` sobre el embed
 *  con `!left`); los dos se probaron contra la base local y contados a mano. */
// Un id imposible: fuerza cero filas cuando la búsqueda no encontró nada, sin que `.in("id", [])`
// (que algunos motores tratan distinto de "sin filtro") tenga que resolverlo por su cuenta.
const ID_IMPOSIBLE = "00000000-0000-0000-0000-000000000000";

function consulta(supabase: Supabase, select: string, f: FiltrosHistorial) {
  const extras = [
    f.pago ? "pago_filtro:venta_pagos!inner ( metodo )" : null,
    // «pendiente» necesita el estado además del tipo; «con» lo pide igual, es barato y así
    // los dos casos comparten el mismo embed en vez de bifurcar la consulta.
    f.comprobante === "con" || f.comprobante === "pendiente" ? "comp_filtro:comprobantes!inner ( tipo, estado )" : null,
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
  if (f.comprobante === "pendiente") q = q.eq("comp_filtro.estado", "pendiente");
  // La búsqueda ya se resolvió a ids en `resolverBusqueda` (ver la página): acá solo se
  // intersecta. `idsBusqueda` viene `undefined` sin búsqueda, `null` explícito tampoco filtra.
  if (f.idsBusqueda) q = q.in("id", f.idsBusqueda.length > 0 ? f.idsBusqueda : [ID_IMPOSIBLE]);
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
  /** Ventas completadas con boleta o factura «pendiente de enviar» — cifra del encabezado y del
   *  atajo «Pendientes de comprobante». 0 (no "desconocido") si `parcial`, como el resto de acá. */
  pendientesComprobante: number;
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
    comprobantes: VentaCruda["comprobantes"];
  }[];
  const parcial = crudas.length > TOPE_TOTALES;
  const ventas = (parcial ? crudas.slice(0, TOPE_TOTALES) : crudas).map((v) => ({
    anulada: v.estado === "anulada",
    total: totalDeVenta(v.venta_items),
    unidades: unidadesDeVenta(v.venta_items),
    fecha: diaDeLima(v.created_at),
    pagos: v.venta_pagos,
    comprobante: elegirComprobante(v.comprobantes),
  }));
  return {
    parcial,
    resumen: resumir(ventas),
    // Con el tope superado solo habría los días más recientes: un trazo así mentiría, y no se dibuja.
    porDia: parcial ? [] : serieDiaria(ventas, { desde: f.desde, hasta: f.hasta, hoy: hoyEnLima() }),
    porMetodo: parcial ? [] : mezclaDePagos(ventas),
    pendientesComprobante: parcial ? 0 : contarPendientesDeComprobante(ventas),
  };
}

// ---------------------------------------------------------------------------
// Búsqueda única (Ventas ▸ Historial, 2026-09-22): «boleta, clienta o prenda» en una sola
// barra (H7 de la auditoría). Mismo patrón que `buscarVentas` de `ventas-v2.ts` (Cambios):
// varias consultas chicas por fuente, nunca un `.or()` entre tablas embebidas — el propio
// comentario de `consulta()` ya explica por qué eso recorta filas donde no se quiere.
// ---------------------------------------------------------------------------

/** Hasta cuántas ventas trae cada fuente de la búsqueda: de sobra para reconocer «la venta»
 *  entre resultados, sin acercarse al tope de PostgREST. */
const LIMITE_BUSQUEDA = 30;

async function idsPorComprobante(serie: string | null, numero: number): Promise<string[]> {
  const supabase = await createClient();
  let q = supabase.from("comprobantes").select("venta_id").eq("numero", numero).not("venta_id", "is", null);
  if (serie) q = q.eq("serie", serie);
  const filas = exigir(await q, "el comprobante buscado");
  return [...new Set(filas.map((f) => f.venta_id as string))];
}

async function idsPorClienta(campo: "documento" | "nombre", texto: string): Promise<string[]> {
  const supabase = await createClient();
  let q = supabase.from("clientes").select("id");
  q = campo === "documento" ? q.eq("num_doc", texto) : q.ilike("nombre", `%${literalParaIlike(texto)}%`);
  const clientes = exigir(await q.limit(LIMITE_BUSQUEDA), "las clientas buscadas");
  if (clientes.length === 0) return [];
  const ventas = exigir(
    await supabase
      .from("ventas")
      .select("id")
      .in(
        "cliente_id",
        clientes.map((c) => c.id)
      )
      .limit(LIMITE_BUSQUEDA),
    "las ventas de esa clienta"
  );
  return ventas.map((v) => v.id);
}

async function idsPorPrenda(texto: string): Promise<string[]> {
  const supabase = await createClient();
  const productos = exigir(await supabase.from("productos").select("id").ilike("referencia", `%${literalParaIlike(texto)}%`).limit(10), "las prendas con ese nombre");
  if (productos.length === 0) return [];
  const variantes = exigir(
    await supabase.from("variantes").select("id").in(
      "producto_id",
      productos.map((p) => p.id)
    ),
    "las tallas y colores de esas prendas"
  );
  if (variantes.length === 0) return [];
  const filas = exigir(
    await supabase
      .from("venta_items")
      .select("venta_id")
      .in(
        "variante_id",
        variantes.map((v) => v.id)
      )
      .limit(LIMITE_BUSQUEDA),
    "las ventas de esa prenda"
  );
  return [...new Set(filas.map((f) => f.venta_id as string))];
}

/** Traduce lo escrito en la barra a los ids de venta que califican, o `null` si la barra está
 *  vacía (no hay búsqueda que resolver). Los filtros normales (tienda, período…) se aplican
 *  después, en `consulta()`, sobre este mismo conjunto — buscar «Emilia» en Lima solo muestra
 *  las de Lima aunque la búsqueda haya encontrado ventas de otra tienda. */
export async function resolverBusqueda(q?: string): Promise<string[] | null> {
  const busqueda = q ? clasificarBusqueda(q) : null;
  if (!busqueda) return null;

  const candidatas = new Set<string>();
  if (busqueda.tipo === "comprobante") {
    (await idsPorComprobante(busqueda.serie, busqueda.numero)).forEach((id) => candidatas.add(id));
  } else if (busqueda.tipo === "numero") {
    // Una racha de dígitos puede ser el N° de una boleta o el DNI/RUC de la clienta: se buscan los dos.
    const [porNumero, porDocumento] = await Promise.all([
      busqueda.numero !== null ? idsPorComprobante(null, busqueda.numero) : Promise.resolve([]),
      idsPorClienta("documento", busqueda.texto),
    ]);
    [...porNumero, ...porDocumento].forEach((id) => candidatas.add(id));
  } else {
    const [porClienta, porPrenda] = await Promise.all([idsPorClienta("nombre", busqueda.texto), idsPorPrenda(busqueda.texto)]);
    [...porClienta, ...porPrenda].forEach((id) => candidatas.add(id));
  }
  return [...candidatas];
}
