// Lo que leen las pantallas de `etiquetas`: Catálogo ▸ Insignias (con sus campañas, la billetera de pases) y la ficha de una campaña en
// Tienda web ▸ Campañas (ADR-0473). Vivía dentro de `productos/atributos/page.tsx`; se sacó aquí para que todas lean igual.
//
// PROMETE: las filas de la pantalla (las de su modo, por `esDelModo`, o todas), las categorías para elegir dónde rige, las prendas
//   con su precio más bajo entre tiendas y su costo (para el aviso «quedaría bajo su costo»), las prendas puestas a mano, la lectura
//   de Rotación si se pide y, con `conVitrina`, de qué modelo, color y categoría es cada prenda y su foto (la vitrina de cada pase).
//   Lanza si una lectura de la base falla (`exigir`), como lo hacía la página; las fotos, no: sin ellas la vitrina dibuja la prenda
//   sin foto (su categoría sobre su color).
// ASUME: que quien llama ya pasó la puerta del módulo; `puedeEditar` decide si se leen las prendas y el costo.

import { createClient } from "@/lib/supabase/server";
import { exigir, leerTodas } from "@/lib/resultado";
import { getCostosVariantes } from "@/lib/catalogo-v2";
import { getUbicaciones } from "@/lib/ubicaciones";
import { getLecturaRotacion } from "@/lib/etiqueta-rotacion-datos";
import { getPreciosDeLasTiendas } from "@/lib/precios-sede-datos";
import { precioMasBajoEnTiendas } from "@/lib/precio-sede-reglas";
import { dibujoElegido } from "@cayla-retail/shared/insignias-visual";
import { esRutaDeImagenDeInsignia } from "@cayla-retail/shared/insignia-imagen";
import { estiloConocido } from "@/lib/etiqueta-grupos";
import { esDelModo, type ModoEtiquetas } from "@/lib/sellos-campanas";
import { fotoDeVariante, type FotoCruda } from "@/lib/producto-fotos-reglas";
import type { TallaVitrina } from "@/lib/sellos-pases";

/** «Ninguna tienda con precio propio»: lo que se usa cuando no hace falta leerlos (la forma de `getPreciosDeLasTiendas`). */
const sinPreciosDeTiendas = () => ({ nombres: new Map<string, string>(), porSede: {} as Record<string, Record<string, number>> });

export async function cargarEtiquetasPantalla({
  modo,
  puedeEditar,
  conRotacion,
  esLider,
  conVitrina = false,
}: {
  /** Las filas de una pantalla (`esDelModo`) o, en Catálogo ▸ Insignias, todas. */
  modo: ModoEtiquetas | "todas";
  /** Crear, editar y configurar (con o sin descuento, ADR-0293): lee las prendas, las puestas a mano y el costo. */
  puedeEditar: boolean;
  /** Unidades y ventas de 30 días de cada talla (ADR-0441): solo quien puede analizar (la puerta de `fn_analisis_sede`). */
  conRotacion: boolean;
  esLider: boolean;
  /** Modelo, color, categoría y foto de cada prenda a la venta (la vitrina de cada pase de Catálogo ▸ Insignias). */
  conVitrina?: boolean;
}) {
  const supabase = await createClient();
  // El costo, por la puerta que revisa el permiso (20260923193700). Sin él (no ve el dinero), `costo` 0 nunca queda «por debajo».
  const cargaCostos = puedeEditar ? getCostosVariantes() : Promise.resolve(null);
  // Los precios propios de cada tienda (ADR-0370), para el aviso de costo: una campaña vale en TODAS las tiendas y la caja de
  // cada una cobra su precio, así que el peor caso es el más bajo. Solo si el aviso puede salir. Nunca lanza.
  const cargaPreciosTiendas = puedeEditar
    ? cargaCostos.then((c) => (c === null ? sinPreciosDeTiendas() : getPreciosDeLasTiendas()))
    : Promise.resolve(sinPreciosDeTiendas());
  // Rotación: nunca lanza ni hace esperar más de 4 s; sin lectura, las tarjetas se ven como antes.
  const cargaRotacion = modo !== "campanas" && conRotacion ? getLecturaRotacion(esLider) : Promise.resolve(null);
  const cargaVitrina = conVitrina && puedeEditar ? leerVitrina(supabase) : Promise.resolve(null);

  // Las tiendas donde rige cada campaña (ADR-0486; sin filas = todas) y las tiendas para elegir. Si la función aún no existe en esa base
  // (PGRST202, la migración sin pegar), ninguna campaña está limitada y la hoja de Configurar no ofrece sedes.
  const cargaSedes = supabase.rpc("campanas_sedes");
  const cargaTiendas = getUbicaciones().then((u) => u.filter((x) => x.tipo === "tienda").map((x) => ({ id: x.id, nombre: x.nombre })));

  const [resEtiquetas, resCategorias, resEtiquetaCategorias, resFamilias, resPrendas, resManuales, preciosTiendas, resSedes, tiendas] = await Promise.all([
    supabase.from("etiquetas").select("id, nombre, activo, notas, estado, estilo, icono, icono_imagen, vigente_desde, vigente_hasta, descuento_pct").order("nombre"),
    supabase.from("categorias").select("id, nombre, prefijo, familia").eq("activo", true).order("nombre"),
    supabase.from("etiqueta_categorias").select("etiqueta_id, categoria_id"),
    supabase.from("familias").select("codigo, nombre"),
    puedeEditar
      ? leerTodas((desde, hasta) =>
          supabase
            .from("variantes")
            .select("id, sku, precio, color_codigo, producto:productos!inner ( id, referencia, categoria_id )")
            .eq("activo", true)
            .eq("producto.estado", "activo")
            .order("id")
            .range(desde, hasta)
        )
      : Promise.resolve({ data: [], error: null }),
    puedeEditar
      ? leerTodas((desde, hasta) =>
          supabase.from("variante_etiquetas").select("etiqueta_id, variante_id").order("variante_id").order("etiqueta_id").range(desde, hasta)
        )
      : Promise.resolve({ data: [], error: null }),
    cargaPreciosTiendas,
    cargaSedes,
    cargaTiendas,
  ]);

  const sedesDeCampana = new Map<string, string[]>();
  // Una lectura que falla deja todas las campañas «en todas las sedes»: lo que se ve es lo de siempre, y guardar no pisa nada que no se vio.
  for (const f of resSedes.error ? [] : (resSedes.data ?? [])) {
    sedesDeCampana.set(f.etiqueta_id, [...(sedesDeCampana.get(f.etiqueta_id) ?? []), f.ubicacion_id]);
  }
  const sedesDisponibles = !resSedes.error;

  const etiquetaCategorias = new Map<string, string[]>();
  for (const f of exigir(resEtiquetaCategorias, "las categorías de cada etiqueta")) {
    etiquetaCategorias.set(f.etiqueta_id, [...(etiquetaCategorias.get(f.etiqueta_id) ?? []), f.categoria_id]);
  }
  const etiquetas = exigir(resEtiquetas, "las etiquetas del vocabulario")
    .map((e) => ({
      id: e.id,
      nombre: e.nombre,
      activo: e.activo,
      notas: e.notas,
      estado: e.estado as "pendiente" | "aprobado" | "rechazado",
      estilo: estiloConocido(e.estilo),
      icono: dibujoElegido(e.icono),
      imagen: esRutaDeImagenDeInsignia(e.icono_imagen) ? e.icono_imagen : null,
      vigenteDesde: e.vigente_desde,
      vigenteHasta: e.vigente_hasta,
      descuentoPct: e.descuento_pct,
      categoriaIds: (etiquetaCategorias.get(e.id) ?? []) as string[],
      sedeIds: sedesDeCampana.get(e.id) ?? [],
    }))
    .filter((e) => modo === "todas" || esDelModo(e.estilo, modo));
  const costos = await cargaCostos;
  const prendasConCosto = exigir(resPrendas, "las prendas para el aviso de costo").map((v) => {
    // El precio más bajo al que se cobra en cualquier tienda (el de la prenda o el propio de una), y cuál tienda lo fija.
    const bajo = precioMasBajoEnTiendas(Number(v.precio), v.id, preciosTiendas.porSede, preciosTiendas.nombres);
    return {
      id: v.id,
      categoriaId: v.producto?.categoria_id ?? null,
      precio: bajo.precio,
      enSede: bajo.sede,
      costo: costos?.get(v.id) ?? 0,
      nombre: `${v.producto?.referencia ?? "Prenda"} (${v.sku})`,
      // Una prenda es un modelo en un color, con la misma clave que el pase de Insignias (`prendasDelSello`): la hoja y el pase cuentan igual.
      modelo: `${v.producto?.id ?? v.id}·${v.color_codigo ?? ""}`,
    };
  });
  const variantesManuales: Record<string, string[]> = {};
  for (const f of exigir(resManuales, "las prendas puestas a mano")) {
    (variantesManuales[f.etiqueta_id] ??= []).push(f.variante_id);
  }
  const nombreFamilia = new Map(exigir(resFamilias, "las familias").map((f) => [f.codigo, f.nombre]));
  const categorias = exigir(resCategorias, "las categorías").map((c) => ({
    id: c.id,
    nombre: c.nombre,
    familia: (c.familia && nombreFamilia.get(c.familia)) || "Sin familia",
    // El ícono de la categoría en la etiqueta de la hoja «Configuración» (ADR-0488): `SinFoto` lo decide por el prefijo y el código de familia.
    prefijo: c.prefijo,
    familiaCodigo: c.familia,
  }));
  const vitrina = await cargaVitrina;
  const prendasVitrina: TallaVitrina[] | null = vitrina
    ? exigir(resPrendas, "las prendas para el aviso de costo").map((v) => {
        const categoria = v.producto?.categoria_id ? vitrina.categorias.get(v.producto.categoria_id) ?? null : null;
        const color = v.color_codigo ? vitrina.colores.get(v.color_codigo) : undefined;
        return {
          id: v.id,
          categoriaId: v.producto?.categoria_id ?? null,
          productoId: v.producto?.id ?? v.id,
          referencia: v.producto?.referencia ?? "Prenda",
          colorCodigo: v.color_codigo,
          colorNombre: color?.nombre ?? null,
          colorHex: color?.hex ?? null,
          categoria,
          fotoUrl: v.producto?.id ? fotoDeVariante(vitrina.fotos.get(v.producto.id) ?? [], v.color_codigo) : null,
        };
      })
    : null;
  return { etiquetas, categorias, prendasConCosto, variantesManuales, rotacion: await cargaRotacion, prendasVitrina, tiendas: sedesDisponibles ? tiendas : [] };
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Los nombres y tonos de colores, todas las categorías (con su prefijo, que decide el ícono) y las fotos de cada producto. Los colores
 *  y las categorías incluyen los desactivados: una prenda vieja puede tener uno. Las fotos no lanzan: sin ellas, la prenda sin foto. */
async function leerVitrina(supabase: Supabase) {
  const [resColores, resCategorias, resFotos] = await Promise.all([
    supabase.from("colores").select("codigo, nombre, hex"),
    supabase.from("categorias").select("id, nombre, prefijo, familia"),
    leerTodas((desde, hasta) => supabase.from("producto_fotos").select("producto_id, url, color_codigo, orden, es_principal").order("id").range(desde, hasta)),
  ]);
  const colores = new Map(exigir(resColores, "los colores").map((c) => [c.codigo, { nombre: c.nombre, hex: c.hex }]));
  const categorias = new Map(exigir(resCategorias, "las categorías de las prendas").map((c) => [c.id, { nombre: c.nombre, prefijo: c.prefijo, familia: c.familia }]));
  const fotos = new Map<string, FotoCruda[]>();
  if (resFotos.error) console.error("fotos de la vitrina de Insignias:", resFotos.error.message);
  for (const f of resFotos.data ?? []) {
    const lista = fotos.get(f.producto_id) ?? [];
    lista.push({ url: f.url, orden: f.orden, es_principal: f.es_principal, color_codigo: f.color_codigo });
    fotos.set(f.producto_id, lista);
  }
  return { colores, categorias, fotos };
}
