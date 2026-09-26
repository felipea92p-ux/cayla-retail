import { puede, requirePersonaActualV2 } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { Ayuda } from "@/components/Ayuda";
import { FamiliasLista, type Familia } from "@/components/FamiliasLista";

// Familias del negocio (Indumentaria, Calzado, Accesorios y Complementos...).
// Nace 2026-09-18 (20260918010000_familias_tabla_propia.sql) porque hasta
// ahora eran 6 valores fijos en el código — Felipe pidió poder agregar una
// nueva sin depender de una sesión de desarrollo (BACKLOG, ADR-0096).
export default async function FamiliasPage() {
  const persona = await requirePersonaActualV2();
  const supabase = await createClient();

  const [resFamilias, resCategorias] = await Promise.all([
    supabase.from("familias").select("codigo, nombre, activo, orden").order("orden"),
    supabase.from("categorias").select("familia").eq("activo", true),
  ]);
  const filas = exigir(resFamilias, "las familias del catálogo");
  const categorias = exigir(resCategorias, "las categorías del catálogo");

  const conteoPorFamilia = new Map<string, number>();
  for (const c of categorias) {
    if (!c.familia) continue;
    conteoPorFamilia.set(c.familia, (conteoPorFamilia.get(c.familia) ?? 0) + 1);
  }

  const familias: Familia[] = filas.map((f) => ({
    codigo: f.codigo,
    nombre: f.nombre,
    activo: f.activo,
    orden: f.orden,
    categoriasActivas: conteoPorFamilia.get(f.codigo) ?? 0,
  }));

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">Productos · Catálogo</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">
          Familias
          <Ayuda titulo="Familias">
            El agrupador grande del catálogo — Indumentaria, Calzado, Accesorios y Complementos...
            — cada categoría (Blusas, Jeans, Carteras) pertenece a exactamente una. A diferencia de
            Colores/Tallas/Tejidos/Patrones/Etiquetas: agregar una familia no es de un clic al
            catalogar una prenda, es una decisión de marca — solo un Líder la agrega, edita o
            desactiva. No se puede desactivar una con categorías activas colgando.
          </Ayuda>
        </h1>
      </div>

      <FamiliasLista familiasIniciales={familias} puedeEditar={puede(persona, "editarCatalogo")} />
    </div>
  );
}
