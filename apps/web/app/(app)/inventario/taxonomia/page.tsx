import { requirePersonaActual } from "@/lib/persona";
import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { InventarioNav } from "@/components/InventarioNav";
import { AnclarVocabulario } from "@/components/AnclarVocabulario";
import {
  getCategoriasPropias,
  getCategoriasUniversales,
  getColoresPropios,
  getColoresUniversales,
} from "@/lib/taxonomia/consultas";

/**
 * Anclaje del vocabulario de la marca al estándar universal (0052).
 *
 * POR QUÉ ESTA PANTALLA EXISTE. El importador de catálogos de clientes nuevos
 * traduce cualquier archivo al estándar universal, no al vocabulario de CAYLA —
 * si apuntara al vocabulario de CAYLA no serviría para una zapatería ni para
 * una marca deportiva. Para que ese puente funcione en las dos direcciones, el
 * vocabulario propio tiene que estar colgado del universal.
 *
 * Y CAYLA es el primer caso de prueba: si el anclaje automático se equivoca con
 * 30 colores que Felipe conoce de memoria, se ve acá y se arregla acá — antes de
 * que un cliente real dependa de él.
 */
export default async function TaxonomiaPage() {
  const persona = await requirePersonaActual();
  const supabase = await createClient();

  const [coloresPropios, categoriasPropias, coloresUniv, categoriasUniv, resVersion] = await Promise.all([
    getColoresPropios(),
    getCategoriasPropias(),
    getColoresUniversales(),
    getCategoriasUniversales(),
    supabase.from("taxonomia_versiones").select("version, cargada_en").eq("es_activa", true).maybeSingle(),
  ]);

  const version = exigir(resVersion, "la versión activa del estándar");

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">Inventario · {persona.sedeCodigo}</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Vocabulario</h1>
        <p className="mt-1 max-w-2xl text-xs text-tinta/65">
          Los colores y categorías de la marca se conservan tal cual — nadie los renombra. Acá solo se
          dice de qué término del estándar internacional cuelga cada uno, para que el sistema pueda
          entender el catálogo de cualquier otra marca y traducirlo al tuyo.
        </p>
      </div>

      <InventarioNav />

      {!version ? (
        // Sin estándar cargado la pantalla no puede hacer nada útil, y decirlo es
        // más honesto que mostrar dos listas vacías como si no hubiera vocabulario.
        <p className="card-cayla p-4 text-xs text-rojo">
          El estándar universal todavía no está cargado en esta base. Se carga con{" "}
          <code className="rounded bg-tinta/5 px-1">node scripts/taxonomia/cargar.mjs --aplicar</code>.
        </p>
      ) : (
        <>
          <p className="text-[11px] text-tinta/50">
            Estándar Shopify Product Taxonomy v{version.version} · {categoriasUniv.length} categorías y{" "}
            {coloresUniv.length} colores disponibles. La versión está fijada: no cambia sola.
          </p>


          <AnclarVocabulario
            que="colores"
            titulo="Colores"
            terminos={coloresPropios.map((c) => ({ ...c.termino, ancladoA: c.ancladoA }))}
            universales={coloresUniv}
            puedeEditar={persona.rol === "lider"}
          />

          <AnclarVocabulario
            que="categorias"
            titulo="Categorías"
            terminos={categoriasPropias.map((c) => ({ ...c.termino, ancladoA: c.ancladoA }))}
            universales={categoriasUniv}
            puedeEditar={persona.rol === "lider"}
          />
        </>
      )}
    </div>
  );
}
