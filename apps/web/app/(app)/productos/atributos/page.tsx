import { puede, requirePersonaActualV2, veModulo } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
import { exigir, leerTodas } from "@/lib/resultado";
import { getCostosVariantes } from "@/lib/catalogo-v2";
import { Ayuda } from "@/components/Ayuda";
import { AtributosHub } from "@/components/AtributosHub";
import type { EventoCalendario, Temporada, TemporadaEfectiva } from "@/lib/temporada-reglas";
import {
  anioHoyLima,
  armarCategorias,
  armarSinTemporada,
  motivoSinTemporadas,
  nombresDeCategorias,
  prendasPorTemporada,
  type DatosPestanaTemporadas,
  type ProductoParaTemporadas,
} from "@/lib/temporadas-pantalla";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * La pestaña «Temporadas» (ADR-0246): se lee SOLO al abrirla, y todo por funciones de la base (las tablas nuevas no se
 * leen directo: RLS sin privilegios). La web puede llegar a producción antes que su SQL (20260928100000): si falta algo,
 * la pestaña muestra una nota en vez de caerse, y las otras pestañas ni se enteran.
 */
async function cargarTemporadas(supabase: Supabase): Promise<{ datos: DatosPestanaTemporadas } | { nota: string }> {
  try {
    return await leerTemporadas(supabase);
  } catch (e) {
    // Ni una excepción inesperada tumba Atributos: la pestaña lo dice y las demás siguen.
    console.error("Temporadas (Atributos):", e);
    return { nota: motivoSinTemporadas(null) };
  }
}

async function leerTemporadas(supabase: Supabase): Promise<{ datos: DatosPestanaTemporadas } | { nota: string }> {
  const [resTemporadas, resCalendario, resEfectiva, resCategorias, resProductos, resColores] = await Promise.all([
    supabase.rpc("fn_temporadas"),
    supabase.rpc("fn_calendario_estaciones"),
    // Una fila por modelo+color: pasa de 1.000 con el catálogo completo, así que se pide por páginas (`leerTodas`), en
    // serie porque cada página recalcula la función entera.
    leerTodas((desde, hasta) => supabase.rpc("fn_temporada_efectiva", {}).order("producto_id").order("color_codigo").range(desde, hasta), { enParalelo: 1 }),
    // Todas (no solo las activas): el nombre de la categoría de una prenda de «Sin temporada» puede ser de una desactivada.
    supabase.from("categorias").select("id, nombre, temporada, categoria_padre_id, activo").order("nombre"),
    leerTodas((desde, hasta) =>
      supabase.from("productos").select("id, referencia, codigo, categoria_id").eq("estado", "activo").order("id").range(desde, hasta)
    ),
    // Los nombres de color de la lista «Sin temporada» (con los desactivados: una prenda vieja puede tener uno).
    supabase.from("colores").select("codigo, nombre"),
  ]);
  const error = resTemporadas.error ?? resCalendario.error ?? resEfectiva.error ?? resCategorias.error ?? resProductos.error ?? resColores.error;
  if (error || !resTemporadas.data || !resCalendario.data || !resEfectiva.data || !resCategorias.data || !resProductos.data || !resColores.data) {
    if (error) console.error("Temporadas (Atributos):", error.message);
    return { nota: motivoSinTemporadas(error) };
  }

  const filas = resEfectiva.data as TemporadaEfectiva[];
  const categorias = resCategorias.data.map((c) => ({ id: c.id, nombre: c.nombre, temporada: c.temporada, padreId: c.categoria_padre_id, activo: c.activo }));
  const productos: ProductoParaTemporadas[] = resProductos.data.map((p) => ({ id: p.id, nombre: p.referencia, codigo: p.codigo, categoriaId: p.categoria_id }));
  return {
    datos: {
      temporadas: resTemporadas.data as Temporada[],
      calendario: resCalendario.data as EventoCalendario[],
      categorias: armarCategorias(categorias.filter((c) => c.activo), productos, filas),
      sinTemporada: armarSinTemporada(
        filas,
        new Map(productos.map((p) => [p.id, p])),
        new Map(resColores.data.map((c) => [c.codigo, c.nombre])),
        nombresDeCategorias(categorias),
      ),
      porTemporada: prendasPorTemporada(filas),
      prendasActivas: productos.length,
      anioHoy: anioHoyLima(new Date()),
    },
  };
}

// Consolidación de Catálogo (2026-09-17, pedido de Felipe): reemplaza a
// `/productos/{colores,tallas,tejidos,patrones,etiquetas}` — 5 pantallas
// completas (sesión + persona/ubicación + AppShell cada una) que en el
// fondo mostraban el mismo tipo de dato: vocabulario cerrado, propone/
// aprueba/rechaza. Una sola carga de datos, una sola pantalla, 5 pestañas.
// Las rutas viejas siguen funcionando vía `redirects()` en next.config.ts.
export default async function AtributosPage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const persona = await requirePersonaActualV2();
  const supabase = await createClient();
  const { tipo: tipoParam } = await searchParams;
  // Mismo orden que las pestañas de `AtributosHub`; la primera es la que abre por defecto.
  const TIPOS = ["etiquetas", "colores", "tallas", "tejidos", "patrones", "temporadas"] as const;
  // Un rol con Etiquetas y sin Categorías/atributos (20260923130000) ve SOLO la pestaña de etiquetas; uno con Categorías/
  // atributos y sin Etiquetas, las otras cinco (Temporadas incluida, ADR-0246). El líder, todas.
  const veEtiquetas = veModulo(persona, "etiquetas");
  const veAtributos = veModulo(persona, "atributos");
  const tipos = TIPOS.filter((t) => (t === "etiquetas" ? veEtiquetas : veAtributos));
  const tipo = tipos.find((t) => t === tipoParam) ?? tipos[0] ?? TIPOS[0];
  const puedeEditarEtiquetas = puede(persona, "editarEtiquetas");
  const puedeDarDescuento = persona.rol === "lider"; // fn_puede_dar_descuento_por_etiqueta: solo el líder
  // Se lanza ya, en paralelo con el resto de la carga; se espera abajo.
  const cargaTemporadas = tipo === "temporadas" ? cargarTemporadas(supabase) : Promise.resolve(null);

  const [resColores, resTallas, resTejidos, resPatrones, resEtiquetas, resCategorias, resEtiquetaCategorias, resFamilias, resPrendas, resManuales, resUsos] = await Promise.all([
    supabase
      .from("colores")
      .select("codigo, nombre, familia_color, hex, orden, activo, notas, estado, pantone_tcx, sinonimos")
      .order("orden")
      .order("nombre"),
    supabase.from("tallas").select("id, valor, activo, notas, estado").order("valor"),
    supabase.from("tejidos").select("id, nombre, activo, notas, estado, imagen_muestra_url").order("nombre"),
    supabase.from("patrones").select("id, nombre, activo, notas, estado, imagen_muestra_url").order("nombre"),
    // Etiquetas (y lo que necesita su editor de campaña) solo se pide al abrir esa pestaña:
    // así un despliegue que llegue antes que el SQL de producción no tumba Colores/Tallas/etc.
    tipo === "etiquetas"
      ? supabase
          .from("etiquetas")
          .select("id, nombre, activo, notas, estado, estilo, vigente_desde, vigente_hasta, descuento_pct")
          .order("nombre")
      : Promise.resolve({ data: [], error: null }),
    tipo === "etiquetas"
      ? supabase.from("categorias").select("id, nombre, familia").eq("activo", true).order("nombre")
      : Promise.resolve({ data: [], error: null }),
    tipo === "etiquetas"
      ? supabase.from("etiqueta_categorias").select("etiqueta_id, categoria_id")
      : Promise.resolve({ data: [], error: null }),
    tipo === "etiquetas" ? supabase.from("familias").select("codigo, nombre") : Promise.resolve({ data: [], error: null }),
    // Costos y precios SOLO para un Líder, y solo para avisarle al configurar una campaña
    // qué prendas quedarían por debajo de su costo — el costo no viaja a otros roles.
    tipo === "etiquetas" && puedeDarDescuento
      ? leerTodas((desde, hasta) =>
          supabase.from("variantes").select("id, sku, precio, producto:productos ( referencia, categoria_id )").eq("activo", true).order("id").range(desde, hasta)
        )
      : Promise.resolve({ data: [], error: null }),
    // Cuántas prendas lleva cada etiqueta «a mano»: para quien edita etiquetas (el líder o un rol con el módulo).
    // Las dos por páginas: más de 1.000 variantes desde sep-2026 y PostgREST corta en 1.000 (`leerTodas`).
    tipo === "etiquetas" && puedeEditarEtiquetas
      ? leerTodas((desde, hasta) =>
          supabase.from("variante_etiquetas").select("etiqueta_id, variante_id").order("variante_id").order("etiqueta_id").range(desde, hasta)
        )
      : Promise.resolve({ data: [], error: null }),
    // Cuántas prendas usan cada tejido y cada patrón (ADR-0256): lo que dice cada tarjeta. Solo al abrir esas pestañas;
    // por páginas, porque el catálogo crece (`leerTodas`).
    tipo === "tejidos" || tipo === "patrones"
      ? leerTodas((desde, hasta) => supabase.from("productos").select("id, tejido_id, patron_id").order("id").range(desde, hasta))
      : Promise.resolve({ data: [], error: null }),
  ]);

  const colores = exigir(resColores, "los colores del vocabulario").map((c) => ({
    codigo: c.codigo,
    nombre: c.nombre,
    familiaColor: c.familia_color,
    hex: c.hex,
    orden: c.orden,
    activo: c.activo,
    notas: c.notas,
    estado: c.estado as "pendiente" | "aprobado",
    pantoneTcx: c.pantone_tcx,
    sinonimos: c.sinonimos ?? [],
  }));
  const tallas = exigir(resTallas, "las tallas del vocabulario").map((t) => ({
    id: t.id,
    valor: t.valor,
    activo: t.activo,
    notas: t.notas,
    estado: t.estado as "pendiente" | "aprobado" | "rechazado",
  }));
  const tejidos = exigir(resTejidos, "los tejidos del vocabulario").map((t) => ({
    id: t.id,
    nombre: t.nombre,
    activo: t.activo,
    notas: t.notas,
    estado: t.estado as "pendiente" | "aprobado" | "rechazado",
    imagenUrl: t.imagen_muestra_url,
  }));
  const patrones = exigir(resPatrones, "los patrones del vocabulario").map((p) => ({
    id: p.id,
    nombre: p.nombre,
    activo: p.activo,
    notas: p.notas,
    estado: p.estado as "pendiente" | "aprobado" | "rechazado",
    imagenUrl: p.imagen_muestra_url,
  }));
  const prendasPorTejido: Record<string, number> = {};
  const prendasPorPatron: Record<string, number> = {};
  for (const u of exigir(resUsos, "las prendas de cada tejido y patrón")) {
    if (u.tejido_id) prendasPorTejido[u.tejido_id] = (prendasPorTejido[u.tejido_id] ?? 0) + 1;
    if (u.patron_id) prendasPorPatron[u.patron_id] = (prendasPorPatron[u.patron_id] ?? 0) + 1;
  }
  const etiquetaCategorias = new Map<string, string[]>();
  for (const f of exigir(resEtiquetaCategorias, "las categorías de cada etiqueta")) {
    etiquetaCategorias.set(f.etiqueta_id, [...(etiquetaCategorias.get(f.etiqueta_id) ?? []), f.categoria_id]);
  }
  const etiquetas = exigir(resEtiquetas, "las etiquetas del vocabulario").map((e) => ({
    id: e.id,
    nombre: e.nombre,
    activo: e.activo,
    notas: e.notas,
    estado: e.estado as "pendiente" | "aprobado" | "rechazado",
    estilo: e.estilo as "neutral" | "urgencia" | "positivo" | "campana",
    vigenteDesde: e.vigente_desde,
    vigenteHasta: e.vigente_hasta,
    descuentoPct: e.descuento_pct,
    categoriaIds: (etiquetaCategorias.get(e.id) ?? []) as string[],
  }));
  // El costo, por la puerta que revisa el permiso (20260923193700). El líder lo tiene siempre.
  const costos = puedeDarDescuento ? await getCostosVariantes() : null;
  const prendasConCosto = exigir(resPrendas, "las prendas para el aviso de costo").map((v) => ({
    id: v.id,
    categoriaId: v.producto?.categoria_id ?? null,
    precio: Number(v.precio),
    costo: costos?.get(v.id) ?? 0,
    nombre: `${v.producto?.referencia ?? "Prenda"} (${v.sku})`,
  }));
  const variantesManuales: Record<string, string[]> = {};
  for (const f of exigir(resManuales, "las prendas etiquetadas a mano")) {
    (variantesManuales[f.etiqueta_id] ??= []).push(f.variante_id);
  }
  const nombreFamilia = new Map(exigir(resFamilias, "las familias").map((f) => [f.codigo, f.nombre]));
  const temporadas = await cargaTemporadas;
  const categorias = exigir(resCategorias, "las categorías").map((c) => ({
    id: c.id,
    nombre: c.nombre,
    familia: (c.familia && nombreFamilia.get(c.familia)) || "Sin familia",
  }));

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">Productos · Catálogo</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">
          Atributos
          <Ayuda titulo="Atributos">
            Los vocabularios cerrados que describen una prenda además de su categoría: color,
            talla, tejido, patrón, etiqueta libre y temporada. En los cinco primeros, cualquiera
            con sesión propone un valor nuevo y lo puede usar de inmediato; un Líder lo aprueba o
            lo rechaza después. La temporada es una lista fija de nueve: en su pestaña se ve el
            calendario y se completan las prendas que todavía no la tienen.
          </Ayuda>
        </h1>
      </div>

      <AtributosHub
        tipo={tipo}
        colores={colores}
        tallas={tallas}
        tejidos={tejidos}
        patrones={patrones}
        prendasPorTejido={prendasPorTejido}
        prendasPorPatron={prendasPorPatron}
        etiquetas={etiquetas}
        categorias={categorias}
        prendasConCosto={prendasConCosto}
        variantesManuales={variantesManuales}
        puedeEditar={puede(persona, "editarCatalogo")}
        puedeEditarEtiquetas={puedeEditarEtiquetas}
        puedeDarDescuento={puedeDarDescuento}
        temporadas={temporadas}
        esLider={persona.rol === "lider"}
        veProductos={veModulo(persona, "productos")}
        tipos={tipos}
      />
    </div>
  );
}
