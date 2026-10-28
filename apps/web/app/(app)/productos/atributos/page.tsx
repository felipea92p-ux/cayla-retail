import { exigirModulo, puede, veModulo } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
import { exigir, leerTodas } from "@/lib/resultado";
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
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";

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
  const [resTemporadas, resCalendario, resEfectiva, resCategorias, resProductos, resColores, resMarcas, resProveedores] = await Promise.all([
    supabase.rpc("fn_temporadas"),
    supabase.rpc("fn_calendario_estaciones"),
    // Una fila por modelo+color: pasa de 1.000 con el catálogo completo, así que se pide por páginas (`leerTodas`), en
    // serie porque cada página recalcula la función entera.
    leerTodas((desde, hasta) => supabase.rpc("fn_temporada_efectiva", {}).order("producto_id").order("color_codigo").range(desde, hasta), { enParalelo: 1 }),
    // Todas (no solo las activas): el nombre de la categoría de una prenda de «Sin temporada» puede ser de una desactivada.
    supabase.from("categorias").select("id, nombre, temporada, categoria_padre_id, activo").order("nombre"),
    leerTodas((desde, hasta) =>
      supabase.from("productos").select("id, referencia, codigo, categoria_id, marca_id, proveedor_id").eq("estado", "activo").order("id").range(desde, hasta)
    ),
    // Los nombres de color de la lista «Sin temporada» (con los desactivados: una prenda vieja puede tener uno).
    supabase.from("colores").select("codigo, nombre"),
    // Marca y proveedor de cada prenda de esa lista (con los desactivados, igual que los colores). Se leen aparte y por
    // nombre, como los colores y las categorías: si alguna de las dos lecturas falla, la pestaña lo dice (nota) en vez de
    // mostrar «Sin marca», que afirma otra cosa: que nadie la registró (ADR-0283).
    supabase.from("marcas").select("id, nombre"),
    supabase.from("proveedores").select("id, nombre"),
  ]);
  const error =
    resTemporadas.error ?? resCalendario.error ?? resEfectiva.error ?? resCategorias.error ?? resProductos.error ?? resColores.error ?? resMarcas.error ?? resProveedores.error;
  if (
    error ||
    !resTemporadas.data ||
    !resCalendario.data ||
    !resEfectiva.data ||
    !resCategorias.data ||
    !resProductos.data ||
    !resColores.data ||
    !resMarcas.data ||
    !resProveedores.data
  ) {
    if (error) console.error("Temporadas (Atributos):", error.message);
    return { nota: motivoSinTemporadas(error) };
  }

  const filas = resEfectiva.data as TemporadaEfectiva[];
  const categorias = resCategorias.data.map((c) => ({ id: c.id, nombre: c.nombre, temporada: c.temporada, padreId: c.categoria_padre_id, activo: c.activo }));
  const nombreMarca = new Map(resMarcas.data.map((m) => [m.id, m.nombre]));
  const nombreProveedor = new Map(resProveedores.data.map((x) => [x.id, x.nombre]));
  const productos: ProductoParaTemporadas[] = resProductos.data.map((p) => ({
    id: p.id,
    nombre: p.referencia,
    codigo: p.codigo,
    categoriaId: p.categoria_id,
    marca: p.marca_id ? (nombreMarca.get(p.marca_id) ?? null) : null,
    proveedor: p.proveedor_id ? (nombreProveedor.get(p.proveedor_id) ?? null) : null,
  }));
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
  const { tipo: tipoParam } = await searchParams;
  // `?tipo=etiquetas` (los sellos, la primera pestaña hasta el 2026-10-22) lo redirige next.config.ts a Catálogo ▸ Insignias.
  // Se repite la puerta del layout: un layout no vuelve a correr al navegar entre sus hijas.
  const persona = await exigirModulo("atributos");
  const supabase = await createClient();
  // Mismo orden que las pestañas de `AtributosHub`; la primera es la que abre por defecto.
  const TIPOS = ["colores", "tallas", "tejidos", "patrones", "temporadas"] as const;
  const tipo = TIPOS.find((t) => t === tipoParam) ?? TIPOS[0];
  // Se lanza ya, en paralelo con el resto de la carga; se espera abajo.
  const cargaTemporadas = tipo === "temporadas" ? cargarTemporadas(supabase) : Promise.resolve(null);

  const [resColores, resTallas, resTejidos, resPatrones, resUsos] = await Promise.all([
    supabase
      .from("colores")
      .select("codigo, nombre, familia_color, tipo, hex, orden, activo, notas, estado, pantone_tcx, sinonimos, descripcion, combina_con")
      .order("orden")
      .order("nombre"),
    supabase.from("tallas").select("id, valor, activo, notas, estado").order("valor"),
    supabase.from("tejidos").select("id, nombre, activo, notas, estado, imagen_muestra_url, descripcion_dibujo").order("nombre"),
    supabase.from("patrones").select("id, nombre, activo, notas, estado, imagen_muestra_url, descripcion_dibujo").order("nombre"),
    tipo === "tejidos" || tipo === "patrones"
      ? leerTodas((desde, hasta) => supabase.from("productos").select("id, tejido_id, patron_id").order("id").range(desde, hasta))
      : Promise.resolve({ data: [], error: null }),
  ]);

  const colores = exigir(resColores, "los colores del vocabulario").map((c) => ({
    codigo: c.codigo,
    nombre: c.nombre,
    familiaColor: c.familia_color,
    tipo: c.tipo,
    hex: c.hex,
    orden: c.orden,
    activo: c.activo,
    notas: c.notas,
    estado: c.estado as "pendiente" | "aprobado",
    pantoneTcx: c.pantone_tcx,
    sinonimos: c.sinonimos ?? [],
    descripcion: c.descripcion ?? null,
    combinaCon: c.combina_con ?? [],
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
    descripcionDibujo: t.descripcion_dibujo,
  }));
  const patrones = exigir(resPatrones, "los patrones del vocabulario").map((p) => ({
    id: p.id,
    nombre: p.nombre,
    activo: p.activo,
    notas: p.notas,
    estado: p.estado as "pendiente" | "aprobado" | "rechazado",
    imagenUrl: p.imagen_muestra_url,
    descripcionDibujo: p.descripcion_dibujo,
  }));
  const prendasPorTejido: Record<string, number> = {};
  const prendasPorPatron: Record<string, number> = {};
  for (const u of exigir(resUsos, "las prendas de cada tejido y patrón")) {
    if (u.tejido_id) prendasPorTejido[u.tejido_id] = (prendasPorTejido[u.tejido_id] ?? 0) + 1;
    if (u.patron_id) prendasPorPatron[u.patron_id] = (prendasPorPatron[u.patron_id] ?? 0) + 1;
  }
  const temporadas = await cargaTemporadas;

  return (
    <div className="space-y-6">
      <div data-guia="atributos.cabecera">
        <EncabezadoPagina
          sede={persona.ubicacionEtiqueta}
          titulo={
            <>
              Atributos
              {/* Letra y altura de la frase dentro del título: el globo no hereda la serif de 46 px (como Marcas). */}
              <span className="ml-2.5 inline-block align-middle font-sans text-[15px] leading-normal tracking-normal">
                <Ayuda titulo="Atributos">
                  Los vocabularios cerrados que describen una prenda además de su categoría: color,
                  talla, tejido, patrón y temporada. En los cuatro primeros, cualquiera con sesión
                  agrega un valor nuevo y lo puede usar de inmediato. La temporada es una lista
                  fija de nueve: en su pestaña se ve el
                  calendario y se completan las prendas que todavía no la tienen. Las insignias (Nuevo,
                  Top ventas, las campañas) viven en Catálogo ▸ Insignias.
                </Ayuda>
              </span>
            </>
          }
        />
      </div>

      <AtributosHub
        tipo={tipo}
        colores={colores}
        tallas={tallas}
        tejidos={tejidos}
        patrones={patrones}
        prendasPorTejido={prendasPorTejido}
        prendasPorPatron={prendasPorPatron}
        puedeEditar={puede(persona, "editarCatalogo")}
        temporadas={temporadas}
        esLider={persona.rol === "lider"}
        veProductos={veModulo(persona, "productos")}
      />
    </div>
  );
}
