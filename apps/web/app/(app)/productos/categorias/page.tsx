import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { Ayuda } from "@/components/Ayuda";
import { ProductosNav } from "@/components/ProductosNav";
import { CategoriasLista } from "@/components/CategoriasLista";
import { FAMILIAS, type Familia } from "@cayla-retail/shared";

// Portado de `trix/catalogo-vocabulario` (V1) tras ADR-0035: familia+prefijo
// ya viven en `retail.categorias`, esta es la pantalla que le faltaba.
export default async function CategoriasPage() {
  const persona = await requirePersonaActualV2();
  const supabase = await createClient();

  const res = await supabase
    .from("categorias")
    .select("id, familia, nombre, prefijo")
    .eq("activo", true)
    .order("familia")
    .order("nombre");
  const filas = exigir(res, "las categorías del catálogo");

  const porFamilia = Object.fromEntries(FAMILIAS.map((f) => [f, [] as { id: string; nombre: string; prefijo: string | null }[]])) as Record<
    Familia,
    { id: string; nombre: string; prefijo: string | null }[]
  >;
  for (const c of filas) {
    // Categorías creadas antes de este vocabulario cerrado pueden no tener
    // familia asignada todavía (0014: familia se agregó con ALTER, sin
    // backfill de lo que no calzaba con las 37 de CAYLA) — esas no entran
    // en ningún grupo de esta pantalla en vez de reventar.
    if (c.familia && c.familia in porFamilia) {
      porFamilia[c.familia as Familia].push({ id: c.id, nombre: c.nombre, prefijo: c.prefijo });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">Productos · Catálogo</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">
          Categorías
          <Ayuda titulo="Categorías">
            Las 6 familias del negocio son fijas; dentro de cada una, las categorías (con su
            prefijo de 3 letras, como BLU de Blusas) sí crecen. El prefijo es lo que hace que el
            código de una prenda se pueda leer de un vistazo.
          </Ayuda>
        </h1>
      </div>

      <ProductosNav />

      <CategoriasLista porFamiliaInicial={porFamilia} puedeEditar={persona.rol === "lider"} />
    </div>
  );
}
