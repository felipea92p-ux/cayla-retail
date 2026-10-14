import { createClient } from "@/lib/supabase/server";
import { exigir, exigirOpcional, leerTodas, opcional, type Tolerado } from "@/lib/resultado";
import { compararTallas } from "@/lib/tallas";
import { categoriasFueraDeMotores } from "@/lib/familias-motores";
import { armarVocabulario, type FilaCategoria, type VocabularioModeloNuevo } from "@/lib/modelo-nuevo-reglas";

// Producción del Taller (restaurada 2026-09-15 sobre V2). Solo lecturas: toda
// escritura pasa por las RPC de `20260915130000_produccion_del_taller.sql`
// (abrir / set_etapa / cerrar / anular / revertir), que son la única puerta —
// las tablas no tienen policy de insert/update/delete. Mismo patrón que
// `devoluciones.ts`: la pantalla lee con `exigir()` porque una orden que no
// se muestra es stock que nadie sabe que existe.

export type { EtapaClave, EstadoEtapa, EstadoOrden } from "@/lib/produccion-reglas";
import { datosDeVariante, esProducible, type EtapaClave, type EstadoEtapa, type EstadoOrden, type PrecioMasBajo } from "@/lib/produccion-reglas";

export type LineaOrden = {
  varianteId: string;
  /** El código de la etiqueta de la prenda (con respaldo al sku legado): `variantes.sku` es NULL en casi todas (ADR-0058). */
  sku: string;
  talla: string | null;
  color: string | null;
  colorHex: string | null;
  cantidadPlan: number;
  /** null mientras la orden está en proceso. */
  cantidadBuenas: number | null;
};

export type OrdenProduccion = {
  id: string;
  productoId: string;
  referencia: string;
  categoria: string | null;
  estado: EstadoOrden;
  esMuestra: boolean;
  etapas: Partial<Record<EtapaClave, EstadoEtapa>>;
  costoTela: number;
  costoAvios: number;
  costoMaquila: number;
  cantidadPlan: number;
  cantidadBuenas: number | null;
  /** Generado por la base: costos ÷ buenas (o ÷ plan mientras no cierre). */
  costoUnitario: number;
  /** Precio de venta del modelo (el mayor entre sus variantes), el de la grilla. 0 si el modelo aún no tiene precio. */
  precioVenta: number;
  /** Las tallas del modelo: con ellas se busca el precio propio más bajo de una tienda (ADR-0370). */
  varianteIdsDelModelo: string[];
  /** Solo el líder lo recibe (`conPreciosMasBajos` en la página): el precio propio más bajo que alguna tienda le pone al modelo, si queda bajo la grilla.
   *  Con él se mide el margen (`precioParaMargen`); `precioVenta` no cambia. */
  precioMasBajo?: PrecioMasBajo;
  fechaEntrega: string | null;
  nota: string | null;
  inventariadoEn: string | null;
  creadoEn: string;
  lineas: LineaOrden[];
};

export type Taller = { id: string; nombre: string };

/** El Taller: la única ubicación con `tipo = 'taller'`. `abrir_produccion`
 *  rechaza cualquier otra, así que sin Taller activo no hay módulo. */
export async function getTaller(): Promise<Taller | null> {
  const supabase = await createClient();
  return exigirOpcional(
    await supabase.from("ubicaciones").select("id, nombre").eq("tipo", "taller").eq("activo", true).limit(1).maybeSingle(),
    "el Taller"
  );
}

/** Órdenes del Taller, las más recientes primero. `limite` acota las
 *  terminadas/anuladas — las en proceso siempre vienen todas.
 *
 *  Los cuatro costos (tela, avíos, maquila y unitario) NO se leen de la tabla: desde F4e (D-G) `authenticated` no tiene SELECT sobre esas
 *  columnas (migración 20260921151000). Con `conCostos` (solo el líder) llegan por `fn_costos_producciones`; sin él quedan en 0 y la
 *  pantalla, que ya los oculta a quien no es líder, no los muestra. */
export async function getOrdenesProduccion(tallerId: string, opciones: { conCostos: boolean; limite?: number } = { conCostos: false }): Promise<OrdenProduccion[]> {
  const limite = opciones.limite ?? 60;
  const supabase = await createClient();
  const costos = new Map(
    opciones.conCostos
      ? exigir(await supabase.rpc("fn_costos_producciones", { p_ubicacion_id: tallerId }), "los costos de las órdenes").map((c) => [c.produccion_id, c])
      : []
  );
  const filas = exigir(
    await supabase
      .from("producciones")
      .select(
        `id, producto_id, estado, es_muestra, etapas,
         cantidad_plan, cantidad_buenas, fecha_entrega, nota, inventariado_at, created_at,
         producto:productos ( referencia, categoria:categorias ( nombre ), variantes ( id, precio ) ),
         lineas:produccion_lineas (
           variante_id, cantidad_plan, cantidad_buenas,
           variante:variantes ( sku, codigo, talla:tallas ( valor ), color:colores ( nombre, hex ) )
         )`
      )
      .eq("ubicacion_id", tallerId)
      .order("created_at", { ascending: false })
      .limit(limite),
    "las órdenes de producción"
  );

  return filas.map((p) => ({
    id: p.id,
    productoId: p.producto_id,
    referencia: p.producto?.referencia ?? "(modelo)",
    categoria: p.producto?.categoria?.nombre ?? null,
    estado: p.estado as EstadoOrden,
    esMuestra: p.es_muestra,
    etapas: (p.etapas ?? {}) as OrdenProduccion["etapas"],
    costoTela: Number(costos.get(p.id)?.costo_tela ?? 0),
    costoAvios: Number(costos.get(p.id)?.costo_avios ?? 0),
    costoMaquila: Number(costos.get(p.id)?.costo_maquila ?? 0),
    cantidadPlan: p.cantidad_plan,
    cantidadBuenas: p.cantidad_buenas,
    costoUnitario: Number(costos.get(p.id)?.costo_unitario ?? 0),
    precioVenta: Math.max(0, ...(p.producto?.variantes ?? []).map((v) => Number(v.precio))),
    varianteIdsDelModelo: (p.producto?.variantes ?? []).map((v) => v.id),
    fechaEntrega: p.fecha_entrega,
    nota: p.nota,
    inventariadoEn: p.inventariado_at,
    creadoEn: p.created_at,
    lineas: (p.lineas ?? [])
      .map((l) => ({
        varianteId: l.variante_id,
        ...datosDeVariante(l.variante),
        cantidadPlan: l.cantidad_plan,
        cantidadBuenas: l.cantidad_buenas,
      }))
      .sort(compararLineas),
  }));
}

export type VarianteDeModelo = {
  varianteId: string;
  /** El código de la etiqueta de la prenda (con respaldo al sku legado), no la columna `sku` a secas. */
  sku: string;
  talla: string | null;
  color: string | null;
  colorHex: string | null;
  /** El código del color en el vocabulario (ADR-0400): la orden propone la tela de ese color. */
  colorCodigo: string | null;
  precio: number;
};

export type ModeloProducible = {
  productoId: string;
  referencia: string;
  categoria: string | null;
  /** Para leer lo que el motor de demanda dice de su categoría (ADR-0347). */
  categoriaId: string | null;
  /** Lo que su miniatura necesita cuando no hay foto (ADR-0333): el ícono sale del prefijo, nunca del nombre visible. Faltan en un modelo virtual (un borrador de «Modelo nuevo»). */
  categoriaPrefijo?: string | null;
  categoriaFamilia?: string | null;
  /** El tejido del modelo (ADR-0400): filtra las telas que la orden ofrece. Falta en un modelo virtual. */
  tejidoId?: string | null;
  tejidoNombre?: string | null;
  variantes: VarianteDeModelo[];
  /** Solo el líder (`conPreciosMasBajosDeModelos`): el precio propio más bajo de una tienda, si queda bajo la grilla (ADR-0370). */
  precioMasBajo?: PrecioMasBajo;
};

/** Modelos con sus variantes activas, para el formulario de nueva orden. Un
 *  modelo sin variantes activas no se puede producir (no habría a qué talla
 *  sumarle stock), así que no se lista.
 *
 *  `soloProducibles` (el Resumen de Producción): además deja fuera lo que no se le debe ofrecer a la líder para fabricar —un
 *  descontinuado, un alta pendiente o rechazada, un producto de prueba, una familia fuera de los motores (`esProducible`)—. «Nueva
 *  orden» NO lo pide: sigue ofreciendo todo el catálogo hasta que la base cierre la puerta (candado #6 del backlog). */
export async function getModelosProducibles(opciones: { soloProducibles?: boolean } = {}): Promise<ModeloProducible[]> {
  const supabase = await createClient();
  // Por páginas con orden único (ADR-0192): los modelos crecen con el catálogo y PostgREST corta en 1.000 sin avisar —
  // un modelo fuera de la página no se podría producir. Las variantes embebidas no cuentan para el tope.
  const [filasLeidas, apagadas] = await Promise.all([
    leerTodas((desde, hasta) =>
      supabase
        .from("productos")
        .select(
          `id, referencia, categoria_id, estado, estado_alta, es_prueba, tejido_id, categoria:categorias ( nombre, prefijo, familia ), tejido:tejidos ( nombre ),
           variantes ( id, sku, codigo, talla:tallas ( valor ), precio, activo, color:colores ( codigo, nombre, hex ) )`
        )
        .order("referencia")
        .order("id")
        .range(desde, hasta)
    ),
    // Nunca lanza: si no responde, devuelve vacío y todo cuenta como antes (ADR-0377).
    opciones.soloProducibles ? categoriasFueraDeMotores(supabase) : Promise.resolve(new Set<string>()),
  ]);
  const filas = exigir(filasLeidas, "los modelos del catálogo");

  return filas
    .filter((p) => !opciones.soloProducibles || esProducible(p, apagadas))
    .map((p) => ({
      productoId: p.id,
      referencia: p.referencia,
      categoria: p.categoria?.nombre ?? null,
      categoriaId: p.categoria_id ?? null,
      categoriaPrefijo: p.categoria?.prefijo ?? null,
      categoriaFamilia: p.categoria?.familia ?? null,
      tejidoId: p.tejido_id ?? null,
      tejidoNombre: p.tejido?.nombre ?? null,
      variantes: (p.variantes ?? [])
        .filter((v) => v.activo)
        .map((v) => ({
          varianteId: v.id,
          ...datosDeVariante(v),
          precio: Number(v.precio),
        }))
        .sort(compararLineas),
    }))
    .filter((m) => m.variantes.length > 0);
}

/** Color primero, talla en orden canónico (S · M · L) — como el Taller
 *  arma la curva sobre la mesa de corte. */
function compararLineas(a: { color: string | null; talla: string | null }, b: { color: string | null; talla: string | null }): number {
  const porColor = (a.color ?? "").localeCompare(b.color ?? "", "es");
  if (porColor !== 0) return porColor;
  return compararTallas(a.talla ?? "", b.talla ?? "");
}

/** Categorías (con sus tallas habilitadas), colores y familias que el formulario de «Modelo nuevo» ofrece (ADR-0361). Es un dato SECUNDARIO: si no se lee, la orden
 *  de siempre sigue abriéndose y solo «Modelo nuevo» avisa que no tiene con qué armarse (principio 9). Son tablas de vocabulario, de lectura abierta a toda sesión. */
export async function getVocabularioModeloNuevo(): Promise<Tolerado<VocabularioModeloNuevo>> {
  const fallo = "No se pudieron cargar las tallas y los colores. Lo demás de esta pantalla sí está al día.";
  const leido = await opcional(
    (async () => {
      const supabase = await createClient();
      const [categorias, colores, familias] = await Promise.all([
        supabase
          .from("categorias")
          .select("id, nombre, prefijo, familia, categoria_padre_id, categoria_tallas ( habitual, talla:tallas ( id, valor, activo ) )")
          .eq("activo", true)
          .order("nombre"),
        supabase.from("colores").select("codigo, nombre, hex, familia_color, tipo, sinonimos, pantone_tcx").eq("activo", true).order("orden").order("nombre"),
        supabase.from("familias").select("codigo, nombre").order("nombre"),
      ]);
      if (categorias.error || colores.error || familias.error) return null;
      return armarVocabulario(categorias.data as unknown as FilaCategoria[], colores.data, familias.data);
    })(),
    "las tallas y los colores del modelo nuevo",
  );
  return leido ? { datos: leido, fallo: null } : { datos: null, fallo };
}

/** Lo que la hoja «Nueva orden» ofrece elegir (ADR-0400, actividad 2): los proveedores que hacen servicios con su lista de precios, cuánta tela lleva cada modelo
 *  (declarado desde Audaces o medido al cerrar) y los metros de cada tela ya comprometidos por las órdenes en proceso. Una sola RPC (`fn_nueva_orden_opciones`),
 *  que responde a quien puede leer Producción en ese Taller. Es dato SECUNDARIO: si no se lee, la orden se abre igual con sus fases en el Taller y sin tela. */
export type OpcionesNuevaOrden = {
  proveedores: { id: string; nombre: string; rubro: string; activo: boolean; tarifas: { faseClave: string; tarifa: number; minimo: number | null; fijo: number; vigenteDesde: string }[] }[];
  /** Por modelo: metros de tela por prenda y de dónde sale el número. */
  consumos: Record<string, { telaPorPrenda: number; fuente: "declarado" | "medido" }>;
  /** Por tela: metros que las órdenes en proceso ya tienen comprometidos (plan − descontado). */
  comprometido: Record<string, number>;
};

type OpcionesLeidas = {
  proveedores?: { id: string; nombre: string; rubro: string; activo: boolean; tarifas?: { fase_clave: string; tarifa_prenda: number | string; cantidad_minima: number | null; fijo_orden: number | string; vigente_desde: string }[] }[];
  consumos?: { producto_id: string; tela_por_prenda: number | string; fuente: "declarado" | "medido" }[];
  comprometido?: { insumo_id: string; cantidad: number | string }[];
};

export const RPC_NUEVA_ORDEN_OPCIONES = "fn_nueva_orden_opciones";

export async function getOpcionesNuevaOrden(tallerId: string): Promise<Tolerado<OpcionesNuevaOrden>> {
  const fallo = "No se pudieron cargar los servicios ni las telas para la orden. La orden igual se puede abrir con sus fases en el Taller.";
  const leido = await opcional(
    (async () => {
      const supabase = await createClient();
      // La RPC es nueva (migración 20261014154000) y los tipos generados todavía no la conocen: se llama por su nombre, como las de Órdenes de insumos.
      const { data, error } = await (supabase.rpc(RPC_NUEVA_ORDEN_OPCIONES as never, { p_ubicacion_id: tallerId } as never) as unknown as PromiseLike<{
        data: OpcionesLeidas | null;
        error: { message: string } | null;
      }>);
      if (error || !data) return null;
      const o = data;
      return {
        proveedores: (o.proveedores ?? []).map((p) => ({
          id: p.id,
          nombre: p.nombre,
          rubro: p.rubro,
          activo: p.activo,
          tarifas: (p.tarifas ?? []).map((t) => ({
            faseClave: t.fase_clave,
            tarifa: Number(t.tarifa_prenda),
            minimo: t.cantidad_minima === null ? null : Number(t.cantidad_minima),
            fijo: Number(t.fijo_orden),
            vigenteDesde: t.vigente_desde,
          })),
        })),
        consumos: Object.fromEntries((o.consumos ?? []).map((c) => [c.producto_id, { telaPorPrenda: Number(c.tela_por_prenda), fuente: c.fuente }])),
        comprometido: Object.fromEntries((o.comprometido ?? []).map((c) => [c.insumo_id, Number(c.cantidad)])),
      } satisfies OpcionesNuevaOrden;
    })(),
    "los servicios y las telas de la orden",
  );
  return leido ? { datos: leido, fallo: null } : { datos: null, fallo };
}
