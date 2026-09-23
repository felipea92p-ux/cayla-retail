import { createClient } from "@/lib/supabase/server";
import { exigir, leerTodas } from "@/lib/resultado";
import { ID_CARGO_ESPECIAL } from "@/lib/cargo-especial";
import { calcularEstado, fotoPrincipal, sumarCantidades, type Cantidades, type EstadoStock } from "@/lib/inventario-reglas";
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
  /** Unidades APARTADAS para clientas (`stock.cantidad_apartada`, ADR-0141). Siguen físicamente en
   *  la tienda — por eso cuentan en `total`/`piso`/`almacen`, y el conteo físico no cambia — pero NO
   *  se pueden vender ni mover: la base rechaza esas operaciones. */
  apartado: number;
  /** `total - apartado`: lo que de verdad se puede vender o mover ahora. */
  disponible: number;
  /** Lo mismo, por lugar (`piso - apartado del piso`). `null` donde no se separa piso/almacén. */
  pisoDisponible: number | null;
  almacenDisponible: number | null;
};

export type ResumenInventario = {
  total: number;
  /** Apartadas para clientas (incluidas en `total`) y lo que queda para vender: `total - apartado`. */
  apartado: number;
  disponible: number;
  piso: number | null;
  almacen: number | null;
  requierenReposicion: number;
  separaPisoAlmacen: boolean;
};

// `42703` = undefined_column: PostgREST lo devuelve cuando el `select` nombra una columna que la base no tiene.
const COLUMNA_INEXISTENTE = "42703";

export async function getStockPorUbicacion(ubicacionId: string): Promise<FilaStock[]> {
  const supabase = await createClient();

  // Pide también `cantidad_apartada` (ADR-0141). TEMPORAL — mientras `20260920160000_apartar_stock.sql` no esté
  // pegada en producción: esta misma lectura alimenta la CAJA (Vender), Cambios y Traslados, y una web que sale
  // antes que el SQL no puede tumbarlas («nunca perder una venta»). Sin la columna se reintenta sin ella y todo
  // queda como antes (apartado = 0): la base seguiría rechazando lo no disponible. Mismo patrón que Vender con
  // `campanas_vigentes`. Retirar el reintento cuando la migración esté aplicada (BACKLOG).
  // Por páginas (`leerTodas`): TRU pasa de 2.300 filas de stock (piso + almacén) y PostgREST corta en 1.000.
  // `sububicacion_id` desempata: la fila es única por (variante, ubicación, sububicación).
  const conColumna = await leerTodas((desde, hasta) => supabase
    .from("stock")
    .select(
      `variante_id, cantidad, cantidad_apartada,
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
    .order("variante_id")
    .order("sububicacion_id")
    .range(desde, hasta));

  const filas =
    conColumna.error?.code === COLUMNA_INEXISTENTE
      ? exigir(
          await leerTodas((desde, hasta) => supabase
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
            .neq("variante_id", ID_CARGO_ESPECIAL)
            .eq("variante.activo", true)
            .order("variante_id")
            .order("sububicacion_id")
            .range(desde, hasta)),
          "el inventario de esta ubicación"
        ).map((f) => ({ ...f, cantidad_apartada: 0 }))
      : exigir(conColumna, "el inventario de esta ubicación");

  const cantidades = sumarCantidades(filas);
  const porVariante = new Map<string, Omit<FilaStock, keyof Cantidades>>();
  for (const f of filas) {
    if (porVariante.has(f.variante_id)) continue;
    porVariante.set(f.variante_id, {
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
    });
  }
  const separaPisoAlmacen = [...cantidades.values()].some((c) => c.piso !== null);

  return Array.from(porVariante.values(), (detalle) => ({ ...detalle, ...cantidades.get(detalle.varianteId)! }))
    // Taller conserva su comportamiento de siempre (solo lo que tiene
    // stock); una tienda muestra también lo que llegó a 0 — es justo el
    // estado SIN STOCK que el pedido quiere ver, no un vacío silencioso.
    .filter((f) => separaPisoAlmacen || f.total > 0)
    .sort((a, b) => a.referencia.localeCompare(b.referencia, "es") || (a.sku ?? "").localeCompare(b.sku ?? "", "es"));
}

/**
 * Solo las cantidades de cada prenda en una sede, para la caja (Vender, Apartados, Cambios): el detalle (foto,
 * talla, códigos) ya lo trae el catálogo. Sin los 5 joins de `getStockPorUbicacion` la lectura de TRU (2.348
 * filas) baja de ~0,9 s a ~0,2 s (medido 2026-09-23). Mismas reglas: `sumarCantidades`.
 */
export async function getDisponibleEnSede(ubicacionId: string): Promise<Map<string, Cantidades>> {
  const supabase = await createClient();
  const filas = exigir(
    await leerTodas((desde, hasta) =>
      supabase
        .from("stock")
        .select("variante_id, cantidad, cantidad_apartada, sububicacion:sububicaciones ( tipo ), variante:variantes!inner ( activo )")
        .eq("ubicacion_id", ubicacionId)
        .neq("variante_id", ID_CARGO_ESPECIAL)
        .eq("variante.activo", true)
        .order("variante_id")
        .order("sububicacion_id")
        .range(desde, hasta)
    ),
    "el stock de esta ubicación"
  );
  return sumarCantidades(filas);
}

export function resumirInventario(filas: FilaStock[]): ResumenInventario {
  const separaPisoAlmacen = filas.some((f) => f.piso !== null);
  return {
    total: filas.reduce((acc, f) => acc + f.total, 0),
    apartado: filas.reduce((acc, f) => acc + f.apartado, 0),
    disponible: filas.reduce((acc, f) => acc + f.disponible, 0),
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
  /** Producto marcado `es_prueba` (D-54, ADR-0159): solo llega con `incluirPrueba`. */
  esPrueba?: boolean;
};

/** `fn_stock_por_sede()` entera, por páginas: son ~2.900 filas (variante × sede) y PostgREST corta en 1.000 —
 *  «¿dónde más hay?» decía «en ninguna otra sede» para las que quedaban fuera (medido 2026-09-23). La usan
 *  Vender, Apartados, Cambios y Existencias. Devuelve la forma de supabase-js: cada pantalla elige exigir o tolerar. */
export async function leerStockDeLasSedes() {
  const supabase = await createClient();
  return leerTodas((desde, hasta) => supabase.rpc("fn_stock_por_sede").order("variante_id").order("ubicacion_id").range(desde, hasta));
}

export async function getExistencias(
  ubicacionId: string,
  ubicaciones: { id: string; nombre: string }[],
  opciones: { incluirPrueba?: boolean } = {}
): Promise<FilaExistencias[]> {
  const supabase = await createClient();
  const [stock, redRes, transitoRes, pruebaRes] = await Promise.all([
    getStockPorUbicacion(ubicacionId),
    leerStockDeLasSedes(),
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
    // D-54 (ADR-0159): qué productos están marcados `es_prueba`, para sacarlos de la lista por
    // defecto (Existencias no llama `getStockPorUbicacion` con un filtro propio — Vender, Cambios
    // y Traslados comparten esa misma función y NO estaban en el alcance de D-54, así que se
    // filtra acá, después, solo para esta pantalla). Aparte del `stock` para no tocar el `select`
    // que comparten esas otras pantallas: si la columna todavía no existe en producción, esta
    // consulta es la única que falla (código `42703`) y se trata como "ningún producto de prueba
    // conocido" en vez de tumbar toda la pantalla.
    supabase.from("productos").select("id").eq("es_prueba", true),
  ]);
  const red = agruparStockPorSede(exigir(redRes, "el stock de las otras sedes"), ubicaciones, ubicacionId);
  const enCamino = exigir(transitoRes, "lo que viene en camino");
  const transito = new Map<string, number>();
  for (const item of enCamino) transito.set(item.variante_id, (transito.get(item.variante_id) ?? 0) + item.cantidad);
  const idsPrueba = new Set((pruebaRes.error ? [] : (pruebaRes.data ?? [])).map((p) => p.id as string));

  const incluirPrueba = opciones.incluirPrueba ?? false;
  const filas: FilaExistencias[] = stock
    .filter((f) => incluirPrueba || !idsPrueba.has(f.productoId))
    .map((f) => ({
      ...f,
      enTransito: transito.get(f.varianteId) ?? 0,
      enRed: red.get(f.varianteId)?.otrasSedes ?? [],
      esPrueba: idsPrueba.has(f.productoId),
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
    const productoEsPrueba = !!item.variante?.producto?.id && idsPrueba.has(item.variante.producto.id);
    if (productoEsPrueba && !incluirPrueba) continue;
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
      apartado: 0,
      disponible: 0,
      pisoDisponible: separa ? 0 : null,
      almacenDisponible: separa ? 0 : null,
      estado: separa ? calcularEstado(0, 0) : null,
      enTransito: transito.get(item.variante_id) ?? 0,
      enRed: red.get(item.variante_id)?.otrasSedes ?? [],
      esPrueba: productoEsPrueba,
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
