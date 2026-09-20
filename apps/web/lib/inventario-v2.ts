import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { ID_CARGO_ESPECIAL } from "@/lib/cargo-especial";
import { calcularEstado, type EstadoStock } from "@/lib/inventario-reglas";
import { agruparStockPorSede, type SedeConStock } from "@/lib/stock-por-sede";

// Las páginas (server) importan todo desde acá; los componentes cliente
// importan SOLO `inventario-reglas.ts`.
export * from "@/lib/inventario-reglas";
import type { Cobertura } from "@/lib/resumen-reglas";

// Stock por ubicación para la pantalla de Inventario. `retail.stock` es un
// snapshot derivado de `movimientos` (nunca se edita a mano) — acá solo se
// LEE. Desde 20260914210000_inventario_piso_almacen.sql, `stock` tiene una
// fila por (variante, sububicación) cuando la ubicación separa piso de
// venta y almacén de tienda (las 2 tiendas) — Taller sigue con una sola
// fila por variante (`sububicacion_id` null), y `piso`/`almacen`/`estado`
// quedan en `null` para esa ubicación: "no aplica" nunca se disfraza de 0.
export type FilaStock = {
  varianteId: string;
  /** Para abrir `AjustarInventarioModal` desde la fila (es por producto). */
  productoId: string;
  sku: string;
  talla: string | null;
  color: string | null;
  /** `#rrggbb` de `colores.hex`; null en los colores que no son un color
   *  (Estampado, Multicolor, Animal print) — la pantalla los dibuja distinto. */
  colorHex: string | null;
  referencia: string;
  categoria: string | null;
  codigosBarras: string[];
  /** La foto principal del PRODUCTO (`producto_fotos.es_principal`; si
   *  ninguna está marcada, la de menor `orden`). Null si el producto no
   *  tiene fotos todavía — la fila dibuja un marcador, no un roto. */
  fotoUrl: string | null;
  /** NUNCA incluye lo que está en `cuarentena` (20260917100000): dañado no
   *  es stock vendible, no puede sumar acá. */
  total: number;
  piso: number | null;
  almacen: number | null;
  estado: EstadoStock | null;
  /** Unidades de esta variante hoy en `cuarentena`, pendientes de resolver
   *  (Liquidada/Se botó/Donada). `null` en ubicaciones que no separan piso
   *  de almacén (Taller) — mismo criterio que `piso`/`almacen`. */
  danado: number | null;
};

type FotoCruda = { url: string; orden: number; es_principal: boolean };

/** De las fotos de un producto (0 a N, en cualquier orden de llegada), la
 *  que se muestra como miniatura: la marcada `es_principal`, o si ninguna
 *  lo está, la de menor `orden` — mismo criterio que ya usan
 *  `catalogo_crear_producto`/`catalogo_actualizar_producto` en SQL al
 *  elegir cuál queda de `es_principal` por defecto. */
function fotoPrincipal(fotos: FotoCruda[] | null | undefined): string | null {
  if (!fotos || fotos.length === 0) return null;
  return (fotos.find((f) => f.es_principal) ?? [...fotos].sort((a, b) => a.orden - b.orden)[0]).url;
}

export type ResumenInventario = {
  total: number;
  piso: number | null;
  almacen: number | null;
  requierenReposicion: number;
  separaPisoAlmacen: boolean;
};

export async function getStockPorUbicacion(ubicacionId: string): Promise<FilaStock[]> {
  const supabase = await createClient();
  const filas = exigir(
    await supabase
      .from("stock")
      .select(
        `variante_id, cantidad,
         sububicacion:sububicaciones ( tipo ),
         variante:variantes!inner (
           sku, talla:tallas ( valor ),
           color:colores ( nombre, hex ),
           producto:productos ( id, referencia, categoria:categorias ( nombre ), producto_fotos ( url, orden, es_principal ) ),
           codigos_barras ( codigo )
         )`
      )
      .eq("ubicacion_id", ubicacionId)
      // La variante centinela del «Monto manual» tiene 999.999 unidades por
      // ubicación: sin esto, «Total tienda» mostraba 1.000.422 (visto en
      // producción el 2026-09-15). Ver `lib/cargo-especial.ts`.
      .neq("variante_id", ID_CARGO_ESPECIAL)
      // Una variante descontinuada (`variantes.activo = false`, el mismo
      // flag que ya la oculta de caja/catálogo/conteo) no debe reaparecer
      // acá con stock: 6 productos de prueba archivados el 2026-09-16
      // dejaron ~1.600 unidades fantasma en este reporte hasta que un
      // ajuste manual las llevó a 0 (BACKLOG). `!inner` para que el filtro
      // excluya la fila entera, no solo el embed de `variante`.
      .eq("variante.activo", true)
      .order("variante_id"),
    "el inventario de esta ubicación"
  );

  // Una sola ubicación es piso/almacén o no lo es — nunca "depende de la
  // variante". Se decide una vez sobre todas las filas, no por fila: una
  // prenda que todavía no tiene stock en ningún lado de la tienda igual
  // cuenta como "separa" (para mostrar SIN STOCK, no para desaparecer).
  const separaPisoAlmacen = filas.some((f) => f.sububicacion?.tipo === "piso_venta" || f.sububicacion?.tipo === "almacen_tienda");

  type Acumulado = Omit<FilaStock, "piso" | "almacen" | "estado" | "danado"> & { _piso: number; _almacen: number; _danado: number };
  const porVariante = new Map<string, Acumulado>();

  for (const f of filas) {
    let fila = porVariante.get(f.variante_id);
    if (!fila) {
      fila = {
        varianteId: f.variante_id,
        productoId: f.variante?.producto?.id ?? "",
        sku: f.variante?.sku ?? "",
        talla: f.variante?.talla?.valor ?? null,
        color: f.variante?.color?.nombre ?? null,
        colorHex: f.variante?.color?.hex ?? null,
        referencia: f.variante?.producto?.referencia ?? "",
        categoria: f.variante?.producto?.categoria?.nombre ?? null,
        codigosBarras: (f.variante?.codigos_barras ?? []).map((c) => c.codigo),
        fotoUrl: fotoPrincipal(f.variante?.producto?.producto_fotos),
        total: 0,
        _piso: 0,
        _almacen: 0,
        _danado: 0,
      };
      porVariante.set(f.variante_id, fila);
    }
    // Cuarentena (20260917100000) NUNCA suma a `total`: es stock dañado,
    // no vendible — mezclarlo con piso/almacén inflaría "Prendas
    // disponibles" con algo que, de hecho, no se puede vender.
    if (f.sububicacion?.tipo === "cuarentena") {
      fila._danado += f.cantidad;
      continue;
    }
    fila.total += f.cantidad;
    if (f.sububicacion?.tipo === "piso_venta") fila._piso += f.cantidad;
    else if (f.sububicacion?.tipo === "almacen_tienda") fila._almacen += f.cantidad;
  }

  return Array.from(porVariante.values())
    // Taller conserva su comportamiento de siempre (solo lo que tiene
    // stock); una tienda muestra también lo que llegó a 0 — es justo el
    // estado SIN STOCK que el pedido quiere ver, no un vacío silencioso.
    .filter((f) => separaPisoAlmacen || f.total > 0)
    .map(({ _piso, _almacen, _danado, ...resto }) => ({
      ...resto,
      danado: separaPisoAlmacen ? _danado : null,
      piso: separaPisoAlmacen ? _piso : null,
      almacen: separaPisoAlmacen ? _almacen : null,
      estado: separaPisoAlmacen ? calcularEstado(_piso, _almacen) : null,
    }))
    .sort((a, b) => a.referencia.localeCompare(b.referencia, "es") || (a.sku ?? "").localeCompare(b.sku ?? "", "es"));
}

export function resumirInventario(filas: FilaStock[]): ResumenInventario {
  const separaPisoAlmacen = filas.some((f) => f.piso !== null);
  return {
    total: filas.reduce((acc, f) => acc + f.total, 0),
    piso: separaPisoAlmacen ? filas.reduce((acc, f) => acc + (f.piso ?? 0), 0) : null,
    almacen: separaPisoAlmacen ? filas.reduce((acc, f) => acc + (f.almacen ?? 0), 0) : null,
    requierenReposicion: filas.filter((f) => f.estado === "reponer_piso").length,
    separaPisoAlmacen,
  };
}

// ============================================================================
// Existencias (2026-09-16): la pantalla de stock con la estructura de los
// diseños de Felipe — cada prenda trae, además de lo que hay AQUÍ, lo que
// viene en camino hacia acá y lo que hay en las otras sedes. Las dos columnas
// nuevas salen de lo que ya existe: `transferencias`/`transferencia_items`
// (traslados en dos fases, ADR-0068) y `fn_stock_por_sede()` (la misma que
// usa Vender para «no hay tu talla aquí, pero sí en Trujillo»). Nada nuevo
// en la base para esto.
// ============================================================================

export type FilaExistencias = FilaStock & {
  /** Unidades de esta prenda en traslados que vienen HACIA esta ubicación y
   *  todavía no se confirmaron (en tránsito o con diferencia pendiente). */
  enTransito: number;
  /** Dónde más hay, de más a menos. Vacío si en ninguna otra sede. */
  enRed: SedeConStock[];
  /** Cuánto dura el stock de hoy al ritmo de venta reciente (`getCoberturaPorVariante`). Solo tiendas;
   *  ausente o null = «N/D» (no vende, no hay historial o el cálculo falló). */
  cobertura?: Cobertura | null;
};

export async function getExistencias(ubicacionId: string, ubicaciones: { id: string; nombre: string }[]): Promise<FilaExistencias[]> {
  const supabase = await createClient();
  const [stock, redRes, transitoRes] = await Promise.all([
    getStockPorUbicacion(ubicacionId),
    supabase.rpc("fn_stock_por_sede"),
    // Solo los traslados cuyo destino es ESTA ubicación: lo que sale de acá ya
    // se descontó del stock al enviarse y no es «en camino» para esta pantalla.
    // RLS (transferencia_items_select) es bilateral, así que una integrante
    // de la sede destino ve estas filas sin ser líder.
    supabase
      .from("transferencia_items")
      .select(
        `variante_id, cantidad,
         transferencia:transferencias!inner ( estado, ubicacion_destino_id ),
         variante:variantes (
           sku, talla:tallas ( valor ),
           color:colores ( nombre, hex ),
           producto:productos ( id, referencia, categoria:categorias ( nombre ), producto_fotos ( url, orden, es_principal ) ),
           codigos_barras ( codigo )
         )`
      )
      .eq("transferencia.ubicacion_destino_id", ubicacionId)
      .in("transferencia.estado", ["en_transito", "recibido_con_diferencia"]),
  ]);
  const red = agruparStockPorSede(exigir(redRes, "el stock de las otras sedes"), ubicaciones, ubicacionId);
  const enCamino = exigir(transitoRes, "lo que viene en camino");
  const transito = new Map<string, number>();
  for (const item of enCamino) transito.set(item.variante_id, (transito.get(item.variante_id) ?? 0) + item.cantidad);

  const filas: FilaExistencias[] = stock.map((f) => ({
    ...f,
    enTransito: transito.get(f.varianteId) ?? 0,
    enRed: red.get(f.varianteId)?.otrasSedes ?? [],
  }));

  // Una prenda que viene en camino y que ESTA tienda nunca tuvo no existe en
  // `stock` — y sin fila, la encargada no la vería llegar. Se le arma una
  // fila en cero con lo que trae el traslado (visto probando: Blusa Emma
  // viajando a Trujillo, que solo vendía Blusa Valentina, no aparecía).
  // En Taller (`separaPisoAlmacen` falso) piso/almacén/estado quedan null
  // como en cualquier fila suya.
  const separa = stock.some((f) => f.piso !== null);
  const yaListadas = new Set(filas.map((f) => f.varianteId));
  for (const item of enCamino) {
    if (yaListadas.has(item.variante_id) || item.variante_id === ID_CARGO_ESPECIAL) continue;
    yaListadas.add(item.variante_id);
    filas.push({
      varianteId: item.variante_id,
      productoId: item.variante?.producto?.id ?? "",
      sku: item.variante?.sku ?? "",
      talla: item.variante?.talla?.valor ?? null,
      color: item.variante?.color?.nombre ?? null,
      colorHex: item.variante?.color?.hex ?? null,
      referencia: item.variante?.producto?.referencia ?? "",
      categoria: item.variante?.producto?.categoria?.nombre ?? null,
      codigosBarras: (item.variante?.codigos_barras ?? []).map((c) => c.codigo),
      fotoUrl: fotoPrincipal(item.variante?.producto?.producto_fotos),
      total: 0,
      piso: separa ? 0 : null,
      almacen: separa ? 0 : null,
      danado: separa ? 0 : null,
      estado: separa ? calcularEstado(0, 0) : null,
      enTransito: transito.get(item.variante_id) ?? 0,
      enRed: red.get(item.variante_id)?.otrasSedes ?? [],
    });
  }
  return filas.sort((a, b) => a.referencia.localeCompare(b.referencia, "es") || (a.sku ?? "").localeCompare(b.sku ?? "", "es"));
}

export type ResumenExistencias = ResumenInventario & {
  /** Prendas (variantes) en cada estado — para la tarjeta «Piden atención»
   *  y su desglose. Solo tiene sentido si `separaPisoAlmacen`. */
  porEstado: Record<EstadoStock, number>;
  /** Unidades en camino hacia esta ubicación, sumando todas las prendas. */
  enTransito: number;
};

export function resumirExistencias(filas: FilaExistencias[]): ResumenExistencias {
  const base = resumirInventario(filas);
  const porEstado: Record<EstadoStock, number> = { normal: 0, reponer_piso: 0, stock_bajo: 0, sin_stock: 0 };
  for (const f of filas) if (f.estado) porEstado[f.estado] += 1;
  return {
    ...base,
    porEstado,
    enTransito: filas.reduce((acc, f) => acc + f.enTransito, 0),
  };
}

// ============================================================================
// "Dañado" (2026-09-17, ADR-0071): la cola de prendas en cuarentena
// esperando que un líder decida Liquidada / Se botó / Donada
// (`retail.resolver_prenda_danada`). Consulta aparte de `getStockPorUbicacion`
// porque acá SÍ hace falta historial (desde cuándo, resuelta por quién) —
// `retail.stock` (de donde sale `FilaStock.danado`) es solo el snapshot de
// cuánto hay ahora, sin esos datos.
// ============================================================================

export type PrendaDanada = {
  id: string;
  varianteId: string;
  sku: string;
  talla: string | null;
  color: string | null;
  referencia: string;
  cantidad: number;
  creadoEn: string;
  /** Precio de catálogo (`variantes.precio`) — solo un punto de partida para
   *  que el líder no escriba el precio de liquidación desde cero; el precio
   *  final es el que él decide, `liquidar_prenda_danada` no aplica ningún
   *  piso ni lo valida contra este número. */
  precioReferencia: number;
};

export async function getPrendasDanadasPendientes(ubicacionId: string): Promise<PrendaDanada[]> {
  const supabase = await createClient();
  const filas = exigir(
    await supabase
      .from("prendas_danadas")
      .select(
        `id, cantidad, created_at,
         variante:variantes ( id, sku, talla:tallas ( valor ), precio, color:colores ( nombre ), producto:productos ( referencia ) )`
      )
      .eq("ubicacion_id", ubicacionId)
      .eq("estado", "en_cuarentena")
      .order("created_at"),
    "las prendas dañadas pendientes"
  );
  return filas.map((f) => ({
    id: f.id,
    varianteId: f.variante?.id ?? "",
    sku: f.variante?.sku ?? "",
    talla: f.variante?.talla?.valor ?? null,
    color: f.variante?.color?.nombre ?? null,
    referencia: f.variante?.producto?.referencia ?? "",
    cantidad: f.cantidad,
    creadoEn: f.created_at,
    precioReferencia: f.variante?.precio ?? 0,
  }));
}
