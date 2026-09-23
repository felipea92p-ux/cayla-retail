import { puede, requirePersonaActualV2, veModulo } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
import { exigir, leerTodas } from "@/lib/resultado";
import { Ayuda } from "@/components/Ayuda";
import { AtributosHub } from "@/components/AtributosHub";

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
  const TIPOS = ["etiquetas", "colores", "tallas", "tejidos", "patrones"] as const;
  // Un rol con Etiquetas y sin Categorías/atributos (20260923130000) ve SOLO la pestaña de etiquetas; uno con Categorías/
  // atributos y sin Etiquetas, las otras cuatro. El líder, todas.
  const veEtiquetas = veModulo(persona, "etiquetas");
  const veAtributos = veModulo(persona, "atributos");
  const tipos = TIPOS.filter((t) => (t === "etiquetas" ? veEtiquetas : veAtributos));
  const tipo = tipos.find((t) => t === tipoParam) ?? tipos[0] ?? TIPOS[0];
  const puedeEditarEtiquetas = puede(persona, "editarEtiquetas");
  const puedeDarDescuento = persona.rol === "lider"; // fn_puede_dar_descuento_por_etiqueta: solo el líder

  const [resColores, resTallas, resTejidos, resPatrones, resEtiquetas, resCategorias, resEtiquetaCategorias, resFamilias, resPrendas, resManuales] = await Promise.all([
    supabase
      .from("colores")
      .select("codigo, nombre, familia_color, hex, orden, activo, notas, estado")
      .order("orden")
      .order("nombre"),
    supabase.from("tallas").select("id, valor, activo, notas, estado").order("valor"),
    supabase.from("tejidos").select("id, nombre, activo, notas, estado").order("nombre"),
    supabase.from("patrones").select("id, nombre, activo, notas, estado").order("nombre"),
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
          supabase.from("variantes").select("id, sku, precio, costo, producto:productos ( referencia, categoria_id )").eq("activo", true).order("id").range(desde, hasta)
        )
      : Promise.resolve({ data: [], error: null }),
    // Cuántas prendas lleva cada etiqueta «a mano»: para quien edita etiquetas (el líder o un rol con el módulo).
    // Las dos por páginas: más de 1.000 variantes desde sep-2026 y PostgREST corta en 1.000 (`leerTodas`).
    tipo === "etiquetas" && puedeEditarEtiquetas
      ? leerTodas((desde, hasta) =>
          supabase.from("variante_etiquetas").select("etiqueta_id, variante_id").order("variante_id").order("etiqueta_id").range(desde, hasta)
        )
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
  }));
  const patrones = exigir(resPatrones, "los patrones del vocabulario").map((p) => ({
    id: p.id,
    nombre: p.nombre,
    activo: p.activo,
    notas: p.notas,
    estado: p.estado as "pendiente" | "aprobado" | "rechazado",
  }));
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
  const prendasConCosto = exigir(resPrendas, "las prendas para el aviso de costo").map((v) => ({
    id: v.id,
    categoriaId: v.producto?.categoria_id ?? null,
    precio: Number(v.precio),
    costo: Number(v.costo ?? 0),
    nombre: `${v.producto?.referencia ?? "Prenda"} (${v.sku})`,
  }));
  const variantesManuales: Record<string, string[]> = {};
  for (const f of exigir(resManuales, "las prendas etiquetadas a mano")) {
    (variantesManuales[f.etiqueta_id] ??= []).push(f.variante_id);
  }
  const nombreFamilia = new Map(exigir(resFamilias, "las familias").map((f) => [f.codigo, f.nombre]));
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
            Los 5 vocabularios cerrados que describen una prenda además de su categoría: color,
            talla, tejido, patrón y etiqueta libre. Cualquiera con sesión propone un valor nuevo
            y lo puede usar de inmediato; un Líder lo aprueba o lo rechaza después.
          </Ayuda>
        </h1>
      </div>

      <AtributosHub
        tipo={tipo}
        colores={colores}
        tallas={tallas}
        tejidos={tejidos}
        patrones={patrones}
        etiquetas={etiquetas}
        categorias={categorias}
        prendasConCosto={prendasConCosto}
        variantesManuales={variantesManuales}
        puedeEditar={puede(persona, "editarCatalogo")}
        puedeEditarEtiquetas={puedeEditarEtiquetas}
        puedeDarDescuento={puedeDarDescuento}
        tipos={tipos}
      />
    </div>
  );
}
