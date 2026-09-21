import { createClient } from "@/lib/supabase/server";
import { exigir, exigirOpcional } from "@/lib/resultado";
import { ETIQUETA_TIPO, type TipoComprobante } from "@/lib/comprobantes-reglas";
import { clasificarBusqueda, DIAS_PLAZO_CAMBIO, type Busqueda } from "@/lib/cambios-reglas";
import { diaLima, inicioDeDiaLima } from "@/lib/panel-serie";

// Prioridad 1 (2026-09-12) — historial mínimo de ventas, necesario para que
// la pantalla de Cambios pueda encontrar QUÉ línea de QUÉ venta se está
// cambiando. No es la pantalla de "historial de ventas" completa (esa sigue
// diferida) — solo lo suficiente para elegir una línea.

/**
 * Encuentra la(s) venta(s) de una boleta o factura escrita a mano (2026-09-15) — lo que
 * Devoluciones y Cambios necesitan cuando la venta ya no está entre las últimas de la
 * sede. Sin `serie`, el número puede calzar con boleta, factura o nota — cada tipo tiene
 * su propio correlativo (`series_comprobantes`, único por `ubicacion_id, tipo`), así que
 * se devuelven TODAS las que calcen: rara vez es más de una, y si lo es, la Encargada ve
 * las prendas de cada una y elige.
 *
 * `todasLasSedes` (2026-09-17): el candado de negocio no existe — `registrar_cambio` y
 * `crear_devolucion` nunca comparan contra la sede de la venta original, solo contra la
 * sede DONDE se está parada la Encargada. Ojo (2026-09-18): la RLS de `ventas`,
 * `venta_items` y `comprobantes` (`fn_puede_operar_ubicacion` = líder o su propia sede)
 * sí deja a una integrante sin ver otras sedes — por eso Cambios solo le ofrece "todas
 * las tiendas" a un líder.
 */
export async function buscarVentaIdsPorComprobante(
  ubicacionId: string,
  serie: string | null,
  numero: number,
  todasLasSedes = false
): Promise<string[]> {
  const supabase = await createClient();
  let query = supabase.from("comprobantes").select("venta_id").eq("numero", numero).not("venta_id", "is", null);
  if (!todasLasSedes) query = query.eq("ubicacion_id", ubicacionId);
  if (serie) query = query.eq("serie", serie);
  const filas = exigir(await query, "el comprobante buscado");
  return [...new Set(filas.map((f) => f.venta_id as string))];
}

/** `ilike` interpreta `%`, `_` y `\`: se escapan para que el texto de la colaboradora
 *  se lea tal cual. */
function literalParaIlike(texto: string): string {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Las variantes cuyo código de etiqueta, sku o código de barras es exactamente `texto`
 * (sin mayúsculas) — lo que manda la pistola al escanear la prenda que trae la clienta
 * (2026-09-18). La boleta se pierde, o nunca se pidió (R-15), pero la prenda siempre
 * viene en la mano. Mismo criterio que `resolverCodigoV2` en Vender, más `codigo`.
 * Tres consultas y no un `.or()`: el texto viene del usuario y `.or()` lo interpolaría
 * dentro del filtro.
 */
async function buscarVarianteIdsPorCodigo(texto: string): Promise<string[]> {
  const supabase = await createClient();
  const exacto = literalParaIlike(texto);
  const [porCodigo, porSku, porBarras] = await Promise.all([
    supabase.from("variantes").select("id").ilike("codigo", exacto),
    supabase.from("variantes").select("id").ilike("sku", exacto),
    supabase.from("codigos_barras").select("variante_id").eq("codigo", texto),
  ]);
  return [
    ...new Set([
      ...exigir(porCodigo, "la prenda de ese código").map((v) => v.id),
      ...exigir(porSku, "la prenda de ese código").map((v) => v.id),
      ...exigir(porBarras, "la prenda de ese código de barras").map((c) => c.variante_id),
    ]),
  ];
}

/** Cuántas compras trae cada búsqueda — la más nueva primero. */
const LIMITE_BUSQUEDA = 20;
/** Cuántas compras muestra "Actividad reciente". */
const LIMITE_ACTIVIDAD = 30;

/** Ventas cuyo comprobante tiene ese DNI/RUC, o un nombre de clienta que contiene el
 *  texto. Solo existe para ventas con boleta o factura: una venta sin comprobante
 *  (R-15) no guarda quién compró. */
async function ventasPorClienta(ubicacionId: string, campo: "documento" | "nombre", texto: string, todasLasSedes: boolean): Promise<string[]> {
  const supabase = await createClient();
  let query = supabase.from("comprobantes").select("venta_id").not("venta_id", "is", null);
  query = campo === "documento" ? query.eq("cliente_num_doc", texto) : query.ilike("cliente_nombre", `%${literalParaIlike(texto)}%`);
  if (!todasLasSedes) query = query.eq("ubicacion_id", ubicacionId);
  const filas = exigir(await query.order("created_at", { ascending: false }).limit(LIMITE_BUSQUEDA), "las compras de esa clienta");
  return [...new Set(filas.map((f) => f.venta_id as string))];
}

/** Variantes de las prendas cuyo nombre contiene el texto ("blusa emma"). Tope de 10
 *  prendas: sus variantes viajan después en un `in (...)` dentro de la URL. */
async function variantesPorNombreDePrenda(texto: string): Promise<string[]> {
  const supabase = await createClient();
  const productos = exigir(
    await supabase.from("productos").select("id").ilike("referencia", `%${literalParaIlike(texto)}%`).limit(10),
    "las prendas con ese nombre"
  );
  if (productos.length === 0) return [];
  const variantes = exigir(
    await supabase.from("variantes").select("id").in("producto_id", productos.map((p) => p.id)),
    "las tallas y colores de esas prendas"
  );
  return variantes.map((v) => v.id);
}

async function ventasConVariantes(ubicacionId: string, varianteIds: string[], todasLasSedes: boolean): Promise<string[]> {
  const supabase = await createClient();
  let query = supabase
    .from("ventas")
    .select("id, venta_items!inner ( variante_id )")
    .in("venta_items.variante_id", varianteIds)
    .order("created_at", { ascending: false })
    .limit(LIMITE_BUSQUEDA);
  if (!todasLasSedes) query = query.eq("ubicacion_id", ubicacionId);
  return exigir(await query, "las ventas de esa prenda").map((v) => v.id);
}

/** Qué ventas muestra una búsqueda, y qué variantes calzaron (para resaltarlas). */
async function buscarVentas(
  ubicacionId: string,
  busqueda: Busqueda,
  todasLasSedes: boolean
): Promise<{ ventaIds: string[]; variantesQueCalzan: Set<string> }> {
  const supabase = await createClient();
  const candidatas = new Set<string>();
  let variantesQueCalzan: string[] = [];

  if (busqueda.tipo === "comprobante") {
    (await buscarVentaIdsPorComprobante(ubicacionId, busqueda.serie, busqueda.numero, todasLasSedes)).forEach((id) => candidatas.add(id));
  } else if (busqueda.tipo === "numero") {
    // "45879632" puede ser el N° de una boleta o el DNI de la clienta: se buscan los dos.
    const [porNumero, porDocumento] = await Promise.all([
      busqueda.numero !== null ? buscarVentaIdsPorComprobante(ubicacionId, null, busqueda.numero, todasLasSedes) : Promise.resolve([]),
      ventasPorClienta(ubicacionId, "documento", busqueda.texto, todasLasSedes),
    ]);
    [...porNumero, ...porDocumento].forEach((id) => candidatas.add(id));
  } else {
    // Una etiqueta exacta gana: si se escaneó una prenda, no hace falta adivinar más.
    variantesQueCalzan = await buscarVarianteIdsPorCodigo(busqueda.texto);
    if (variantesQueCalzan.length === 0) {
      const [porClienta, porPrenda] = await Promise.all([
        ventasPorClienta(ubicacionId, "nombre", busqueda.texto, todasLasSedes),
        variantesPorNombreDePrenda(busqueda.texto),
      ]);
      porClienta.forEach((id) => candidatas.add(id));
      variantesQueCalzan = porPrenda;
    }
    if (variantesQueCalzan.length > 0) {
      (await ventasConVariantes(ubicacionId, variantesQueCalzan, todasLasSedes)).forEach((id) => candidatas.add(id));
    }
  }

  if (candidatas.size === 0) return { ventaIds: [], variantesQueCalzan: new Set(variantesQueCalzan) };
  // Varias fuentes juntas: el orden y el tope finales los decide Postgres, sobre la
  // columna de la propia venta.
  const ventaIds = exigir(
    await supabase
      .from("ventas")
      .select("id")
      .in("id", [...candidatas])
      .order("created_at", { ascending: false })
      .limit(LIMITE_BUSQUEDA),
    "las ventas encontradas"
  ).map((v) => v.id);
  return { ventaIds, variantesQueCalzan: new Set(variantesQueCalzan) };
}

/** Un cambio ya hecho sobre una línea: lo que se le entregó a la clienta y cuándo. */
export type CambioHecho = {
  cantidad: number;
  creadoEn: string;
  productoId: string;
  referencia: string;
  talla: string | null;
  color: string | null;
};

/** Una devolución ya registrada sobre una línea — pendiente de aprobar o aprobada. Las
 *  rechazadas no cuentan: no movieron nada y la base tampoco las suma (`crear_devolucion`
 *  mira `estado <> 'rechazada'`). */
export type DevolucionHecha = {
  cantidad: number;
  estado: "pendiente" | "aprobada";
  creadoEn: string;
};

export type LineaVentaReciente = {
  ventaItemId: string;
  ventaId: string;
  /** La identidad de la prenda vendida — nunca el sku: las prendas del censo nacen sin
   *  él y "" calzaba con cualquier otra sin sku (ver `cambios-reglas.ts`). */
  varianteId: string;
  productoId: string;
  creadoEn: string;
  sku: string;
  /** Código de etiqueta (`variantes.codigo`); se muestra con `codigoPrenda`. */
  codigo: string | null;
  referencia: string;
  talla: string | null;
  color: string | null;
  colorHex: string | null;
  /** Foto del color vendido (mismo criterio que `getCatalogo`), o null. */
  fotoUrl: string | null;
  cantidad: number;
  precioUnitario: number;
  /** Lo que se le descontó a esta prenda al venderla (por unidad). Lo que la clienta
   *  pagó de verdad es `precioUnitario - descuentoUnitario`. */
  descuentoUnitario: number;
  yaCambiado: number;
  cambiosHechos: CambioHecho[];
  /** Unidades con una devolución pendiente o aprobada (la suma de `devolucionesHechas`). */
  yaDevuelto: number;
  devolucionesHechas: DevolucionHecha[];
  /** Quien registró la venta en caja — no necesariamente quien atendió a la clienta
   *  (R-17, docs/datos/15-COMO-OPERA-CAYLA.md), pero es el dato real que hay. */
  vendedorNombre: string | null;
  /** "Boleta B001-000010" — null si la venta no tiene boleta ni factura (R-15). */
  comprobante: string | null;
  /** SUNAT ya aceptó alguno de sus comprobantes: al aprobar una devolución de esta venta
   *  `aprobar_devolucion` emite sola la nota de crédito (ADR-0100). */
  comprobanteAceptado: boolean;
  /** Quién compró, si el comprobante lo guardó ("Ana Pérez · DNI 45879632"). */
  clienta: string | null;
  /** Nombre de la sede donde se vendió, solo si NO es la sede desde la que se mira
   *  (resultado de buscar en todas las tiendas). */
  sedeVenta: string | null;
  /** Una venta anulada ya devolvió sus prendas al stock: se muestra si se la busca,
   *  pero no se puede cambiar (`registrar_cambio` también lo rechaza). */
  anulada: boolean;
  /** Esta prenda es la que se buscó (por su etiqueta o su nombre): se resalta. */
  coincideConBusqueda: boolean;
};

/**
 * Las compras que muestran Cambios y Devoluciones, con sus prendas — un solo lector para
 * las dos pantallas (2026-09-18: `devoluciones.ts` tenía su propia copia, con el mismo
 * defecto de abajo):
 * - sin búsqueda: "Actividad reciente" — las de ESTA sede de los últimos 15 días (el plazo
 *   de R-38);
 * - con búsqueda: por boleta ("B001-10"), por DNI/RUC o nombre de la clienta, por la
 *   etiqueta de la prenda ("CMS-0001-NEG-M") o por su nombre ("blusa emma");
 * - con `ventaItemId`: la compra de esa prenda exacta, sea de la sede que sea — lo usa el
 *   salto entre pantallas ("Cambiar por otra prenda", "Pasar a devolución").
 *
 * Antes pedía TODAS las líneas de venta de la sede, sin `.order()`, y ordenaba y recortaba
 * en JS. PostgREST corta en 1000 filas y, sin orden, devuelve las que le toque — pasadas
 * las 1000 prendas vendidas en la sede, las ventas más nuevas podían quedar afuera. Ahora
 * se eligen primero las ventas (ordenadas y limitadas en Postgres) y después sus líneas:
 * además, una compra ya no aparece cortada.
 */
export async function getVentasRecientes(
  ubicacionId: string,
  opts: { busqueda?: string; todasLasSedes?: boolean; ventaItemId?: string } = {},
  ahora = new Date()
): Promise<LineaVentaReciente[]> {
  const { todasLasSedes = false, ventaItemId } = opts;
  const busqueda = clasificarBusqueda(opts.busqueda ?? "");
  const supabase = await createClient();

  let ventaIds: string[];
  let variantesQueCalzan = new Set<string>();
  if (ventaItemId) {
    const res = await supabase.from("venta_items").select("venta_id").eq("id", ventaItemId).maybeSingle();
    const item = exigirOpcional(res, "la prenda que venía de la otra pantalla");
    ventaIds = item ? [item.venta_id] : [];
  } else if (!busqueda) {
    const desde = inicioDeDiaLima(diaLima(ahora.getTime()) - DIAS_PLAZO_CAMBIO);
    ventaIds = exigir(
      await supabase
        .from("ventas")
        .select("id")
        .eq("ubicacion_id", ubicacionId)
        .eq("estado", "completada")
        .gte("created_at", desde.toISOString())
        .order("created_at", { ascending: false })
        .limit(LIMITE_ACTIVIDAD),
      "las ventas de los últimos 15 días"
    ).map((v) => v.id);
  } else {
    ({ ventaIds, variantesQueCalzan } = await buscarVentas(ubicacionId, busqueda, todasLasSedes));
  }
  if (ventaIds.length === 0) return [];

  const filas = exigir(
    await supabase
      .from("venta_items")
      .select(
        `id, venta_id, variante_id, cantidad, precio_unitario, descuento_unitario,
         venta:ventas!inner ( ubicacion_id, created_at, usuario_id, vendedora_id, estado, ubicacion:ubicaciones ( nombre ) ),
         variante:variantes ( sku, codigo, color_codigo, talla:tallas ( valor ), color:colores ( nombre, hex ),
           producto:productos ( id, referencia, producto_fotos ( url, color_codigo ) ) )`
      )
      .in("venta_id", ventaIds),
    "las prendas de esas ventas"
  )
    .slice()
    // Más nueva primero; dentro de una misma compra, orden estable por nombre.
    .sort(
      (a, b) =>
        (b.venta?.created_at ?? "").localeCompare(a.venta?.created_at ?? "") ||
        (a.variante?.producto?.referencia ?? "").localeCompare(b.variante?.producto?.referencia ?? "", "es")
    );

  // Quién vendió: quien atendió y, si no se eligió a nadie, la sesión que cobró.
  const quienVendio = (v: { vendedora_id: string | null; usuario_id: string | null } | null) => v?.vendedora_id ?? v?.usuario_id ?? null;
  const ids = filas.map((f) => f.id);
  const idsVendedores = Array.from(new Set(filas.map((f) => quienVendio(f.venta)).filter((v): v is string => !!v)));
  const [cambiosRes, devolucionesRes, comprobantesRes, nombresRes] = await Promise.all([
    supabase
      .from("cambios")
      .select(
        `venta_item_id, cantidad, created_at,
         variante_nueva:variantes ( talla:tallas ( valor ), color:colores ( nombre ), producto:productos ( id, referencia ) )`
      )
      .in("venta_item_id", ids)
      .order("created_at"),
    // Mismo filtro exacto que usa `crear_devolucion` para su propio "ya devuelto": lo
    // rechazado no cuenta. La pantalla nunca debe mostrar disponible algo que la base
    // va a negar.
    supabase
      .from("devolucion_items")
      .select("venta_item_id, cantidad, devolucion:devoluciones!inner ( estado, created_at )")
      .in("venta_item_id", ids)
      .neq("devolucion.estado", "rechazada"),
    supabase
      .from("comprobantes")
      .select("venta_id, tipo, serie, numero, estado, cliente_tipo_doc, cliente_num_doc, cliente_nombre, created_at")
      .in("venta_id", ventaIds)
      .in("tipo", ["boleta", "factura"])
      .order("created_at"),
    // Nombres de quién registró cada venta — mismo patrón que `getDetalleCierre()`
    // (personas vive en public/Dynamic, PostgREST no embebe entre schemas).
    idsVendedores.length === 0 ? null : supabase.rpc("fn_nombres_personas", { p_ids: idsVendedores }),
  ]);

  const cambiosPorItem = new Map<string, CambioHecho[]>();
  for (const c of exigir(cambiosRes, "los cambios ya hechos")) {
    const lista = cambiosPorItem.get(c.venta_item_id) ?? [];
    lista.push({
      cantidad: c.cantidad,
      creadoEn: c.created_at,
      productoId: c.variante_nueva?.producto?.id ?? "",
      referencia: c.variante_nueva?.producto?.referencia ?? "",
      talla: c.variante_nueva?.talla?.valor ?? null,
      color: c.variante_nueva?.color?.nombre ?? null,
    });
    cambiosPorItem.set(c.venta_item_id, lista);
  }

  const devolucionesPorItem = new Map<string, DevolucionHecha[]>();
  for (const d of exigir(devolucionesRes, "las devoluciones ya hechas")) {
    const lista = devolucionesPorItem.get(d.venta_item_id) ?? [];
    lista.push({
      cantidad: d.cantidad,
      estado: d.devolucion?.estado === "aprobada" ? "aprobada" : "pendiente",
      creadoEn: d.devolucion?.created_at ?? "",
    });
    devolucionesPorItem.set(d.venta_item_id, lista);
  }

  // Si una venta tiene más de un comprobante (uno rechazado y vuelto a emitir), queda el
  // último: vienen ordenados por fecha y cada uno pisa al anterior.
  const comprobantePorVenta = new Map<string, { texto: string; clienta: string | null }>();
  const ventasConComprobanteAceptado = new Set<string>();
  for (const c of exigir(comprobantesRes, "las boletas de esas ventas")) {
    if (!c.venta_id) continue;
    if (c.estado === "aceptado") ventasConComprobanteAceptado.add(c.venta_id);
    const documento =
      c.cliente_num_doc && c.cliente_tipo_doc !== "sin_documento" ? `${c.cliente_tipo_doc === "ruc" ? "RUC" : "DNI"} ${c.cliente_num_doc}` : null;
    const clienta = [c.cliente_nombre?.trim() || null, documento].filter(Boolean).join(" · ") || null;
    comprobantePorVenta.set(c.venta_id, {
      texto: `${ETIQUETA_TIPO[c.tipo as TipoComprobante] ?? c.tipo} ${c.serie}-${String(c.numero).padStart(6, "0")}`,
      clienta,
    });
  }

  const nombreVendedor = new Map((nombresRes ? exigir(nombresRes, "quién registró cada venta") : []).map((n) => [n.id, n.nombre]));

  return filas.map((f) => {
    const cambiosHechos = cambiosPorItem.get(f.id) ?? [];
    const devolucionesHechas = devolucionesPorItem.get(f.id) ?? [];
    const comprobante = comprobantePorVenta.get(f.venta_id);
    const referencia = f.variante?.producto?.referencia ?? "";
    return {
      ventaItemId: f.id,
      ventaId: f.venta_id,
      varianteId: f.variante_id,
      productoId: f.variante?.producto?.id ?? "",
      creadoEn: f.venta?.created_at ?? "",
      sku: f.variante?.sku ?? "",
      codigo: f.variante?.codigo ?? null,
      referencia,
      talla: f.variante?.talla?.valor ?? null,
      color: f.variante?.color?.nombre ?? null,
      colorHex: f.variante?.color?.hex ?? null,
      fotoUrl: f.variante?.producto?.producto_fotos.find((p) => p.color_codigo === f.variante?.color_codigo)?.url ?? null,
      cantidad: f.cantidad,
      precioUnitario: Number(f.precio_unitario),
      descuentoUnitario: Number(f.descuento_unitario ?? 0),
      yaCambiado: cambiosHechos.reduce((suma, c) => suma + c.cantidad, 0),
      cambiosHechos,
      yaDevuelto: devolucionesHechas.reduce((suma, d) => suma + d.cantidad, 0),
      devolucionesHechas,
      vendedorNombre: nombreVendedor.get(quienVendio(f.venta) ?? "") ?? null,
      comprobante: comprobante?.texto ?? null,
      comprobanteAceptado: ventasConComprobanteAceptado.has(f.venta_id),
      clienta: comprobante?.clienta ?? null,
      sedeVenta: f.venta && f.venta.ubicacion_id !== ubicacionId ? (f.venta.ubicacion?.nombre ?? null) : null,
      anulada: f.venta?.estado === "anulada",
      coincideConBusqueda: variantesQueCalzan.has(f.variante_id),
    };
  });
}
