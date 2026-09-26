import { puede, requirePersonaActualV2 } from "@/lib/persona-actual";
import { getConteoAbierto, getConteosResumen, getPrevisualizacionCierre, getPrioridadConteo } from "@/lib/conteos";
import { codigosDeConteo, pendientesConCodigo, pendientesEnAlcance, pendientesSinCifras } from "@/lib/conteo-reglas";
import { codigoDeEtiqueta } from "@/lib/prenda-reglas";
import { getCatalogo, getCostosVariantes, getEjesPorCategoria } from "@/lib/catalogo-v2";
import { getSububicaciones } from "@/lib/sububicaciones";
import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { getCatalogoMarcas } from "@/lib/marcas-datos";
import { ConteoVista } from "@/components/ConteoVista";

// Conteos físicos (Felipe, 2026-09-14; rediseño 2026-09-22, ADR-0174). Esta página LEE; `ConteoVista` dibuja (ahí vive
// el porqué de cada pieza). Lo único que se decide acá es qué viaja al navegador: `pendientes` va SIN la cifra del
// sistema (`pendientesSinCifras`) y acotado al alcance del conteo — el conteo sigue a ciegas.
export default async function ConteoPage() {
  const persona = await requirePersonaActualV2();
  const supabase = await createClient();
  // El costo va aparte del catálogo y solo a quien ve el dinero (20260923193700): sin permiso, null y el conteo va en unidades.
  const [conteoAbierto, conteos, catalogo, sububicaciones, categorias, prioridad, colores, ejes, catalogoMarcas, costos] = await Promise.all([
    getConteoAbierto(persona.ubicacionId),
    getConteosResumen(persona.ubicacionId),
    getCatalogo(),
    getSububicaciones(persona.ubicacionId),
    supabase.from("categorias").select("id, nombre").eq("activo", true).order("nombre"),
    getPrioridadConteo(persona.ubicacionId),
    supabase.from("colores").select("codigo, nombre").eq("activo", true).order("orden"),
    getEjesPorCategoria(),
    getCatalogoMarcas(),
    getCostosVariantes(),
  ]);
  const categoriasOpciones = exigir(categorias, "las categorías").map((c) => ({ id: c.id, nombre: c.nombre }));
  const coloresOpciones = exigir(colores, "los colores").map((c) => ({ codigo: c.codigo, nombre: c.nombre }));

  // Lo que falta contar sale de la misma vista previa que usa «Revisar y cerrar», sin la cantidad del sistema y
  // acotado al alcance: en un conteo «Solo Blusas», la lista son blusas (la vista previa no conoce el alcance).
  const previsualizacion = conteoAbierto ? await getPrevisualizacionCierre(conteoAbierto.id) : [];
  const categoriaDe = new Map(catalogo.map((v) => [v.varianteId, v.categoria]));
  // La función de Postgres da «el primer código de barras»; el que se lee en la etiqueta lo trae el catálogo.
  const codigoDe = new Map(catalogo.map((v) => [v.varianteId, codigoDeEtiqueta(v)]));
  const pendientes = conteoAbierto
    ? pendientesConCodigo(
        pendientesEnAlcance(pendientesSinCifras(previsualizacion), categoriaDe, conteoAbierto.alcance === "categoria" ? conteoAbierto.alcanceCategoriaNombre : null),
        codigoDe
      )
    : [];
  return (
    <ConteoVista
      ubicacionEtiqueta={persona.ubicacionEtiqueta}
      ubicacionId={persona.ubicacionId}
      puedeCerrar={puede(persona, "ajustarInventario")}
      puedeCrearMarcas={puede(persona, "editarCatalogo")}
      conteoAbierto={conteoAbierto}
      conteos={conteos}
      pendientes={pendientes}
      sububicaciones={sububicaciones}
      categorias={categoriasOpciones}
      prioridad={prioridad}
      colores={coloresOpciones}
      tallasPorCategoria={ejes.tallas}
      marcas={catalogoMarcas}
      catalogo={catalogo
        .filter((v) => v.activo)
        .map((v) => ({
          varianteId: v.varianteId,
          referencia: v.referencia,
          talla: v.talla,
          color: v.color,
          costo: costos ? (costos.get(v.varianteId) ?? 0) : null,
          // `sku` es el código de la etiqueta (casi ninguna prenda tiene `sku`, ADR-0058) y `codigosBarras` conserva el
          // sku legado como opción de escaneo: lo que se teclea o se escanea sigue resolviendo la misma prenda.
          ...codigosDeConteo(v),
        }))}
    />
  );
}
