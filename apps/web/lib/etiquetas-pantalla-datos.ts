// Lo que leen las dos pantallas de `etiquetas`: Atributos ▸ Sellos y Catálogo ▸ Campañas (ADR-0473). Vivía dentro de
// `productos/atributos/page.tsx`; se sacó aquí para que las dos lean igual y una no se quede atrás cuando cambie la otra.
//
// PROMETE: las filas de la pantalla (ya filtradas por `esDelModo`), las categorías para elegir dónde rige, las prendas con su
//   precio más bajo entre tiendas y su costo (para el aviso «quedaría bajo su costo»), las prendas puestas a mano y, solo en
//   Sellos, la lectura de Rotación. Lanza si una lectura de la base falla (`exigir`), como lo hacía la página.
// ASUME: que quien llama ya pasó la puerta del módulo; `puedeEditar` decide si se leen las prendas y el costo.

import { createClient } from "@/lib/supabase/server";
import { exigir, leerTodas } from "@/lib/resultado";
import { getCostosVariantes } from "@/lib/catalogo-v2";
import { getLecturaRotacion } from "@/lib/etiqueta-rotacion-datos";
import { getPreciosDeLasTiendas } from "@/lib/precios-sede-datos";
import { precioMasBajoEnTiendas } from "@/lib/precio-sede-reglas";
import { estiloConocido } from "@/lib/etiqueta-grupos";
import { esDelModo, type ModoEtiquetas } from "@/lib/sellos-campanas";

/** «Ninguna tienda con precio propio»: lo que se usa cuando no hace falta leerlos (la forma de `getPreciosDeLasTiendas`). */
const sinPreciosDeTiendas = () => ({ nombres: new Map<string, string>(), porSede: {} as Record<string, Record<string, number>> });

export async function cargarEtiquetasPantalla({
  modo,
  puedeEditar,
  conRotacion,
  esLider,
}: {
  modo: ModoEtiquetas;
  /** Crear, editar y configurar (con o sin descuento, ADR-0293): lee las prendas, las puestas a mano y el costo. */
  puedeEditar: boolean;
  /** La línea de Rotación al lado de los sellos (ADR-0441): quien edita y puede analizar. Nunca en Campañas. */
  conRotacion: boolean;
  esLider: boolean;
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
  const cargaRotacion = modo === "sellos" && conRotacion ? getLecturaRotacion(esLider) : Promise.resolve(null);

  const [resEtiquetas, resCategorias, resEtiquetaCategorias, resFamilias, resPrendas, resManuales, preciosTiendas] = await Promise.all([
    supabase.from("etiquetas").select("id, nombre, activo, notas, estado, estilo, vigente_desde, vigente_hasta, descuento_pct").order("nombre"),
    supabase.from("categorias").select("id, nombre, familia").eq("activo", true).order("nombre"),
    supabase.from("etiqueta_categorias").select("etiqueta_id, categoria_id"),
    supabase.from("familias").select("codigo, nombre"),
    puedeEditar
      ? leerTodas((desde, hasta) =>
          supabase
            .from("variantes")
            .select("id, sku, precio, producto:productos!inner ( referencia, categoria_id )")
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
  ]);

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
      vigenteDesde: e.vigente_desde,
      vigenteHasta: e.vigente_hasta,
      descuentoPct: e.descuento_pct,
      categoriaIds: (etiquetaCategorias.get(e.id) ?? []) as string[],
    }))
    .filter((e) => esDelModo(e.estilo, modo));
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
  }));
  return { etiquetas, categorias, prendasConCosto, variantesManuales, rotacion: await cargaRotacion };
}
