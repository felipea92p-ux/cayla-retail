import Link from "next/link";
import { requirePersonaActual } from "@/lib/persona";
import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { Ayuda } from "@/components/Ayuda";
import { InventarioNav } from "@/components/InventarioNav";
import { CategoriasLista } from "@/components/CategoriasLista";
import { FAMILIAS, type Familia } from "@cayla-retail/shared";

// Separada de "Modelos": antes las 6 familias y sus categorías vivían mezcladas
// con 7 flujos operativos en una sola fila de 9 pestañas (InventarioNav.tsx),
// y esta pantalla ni existía — las 37 categorías de hoy solo entraron por
// migración (0009, 0030, 0036).
export default async function CategoriasPage() {
  const persona = await requirePersonaActual();
  const supabase = await createClient();

  const res = await supabase.from("categorias").select("id, familia, nombre, prefijo").order("familia").order("nombre");
  const filas = exigir(res, "las categorías del catálogo");

  const porFamilia = Object.fromEntries(FAMILIAS.map((f) => [f, [] as { id: string; nombre: string; prefijo: string }[]])) as Record<
    Familia,
    { id: string; nombre: string; prefijo: string }[]
  >;
  for (const c of filas) {
    porFamilia[c.familia as Familia]?.push({ id: c.id, nombre: c.nombre, prefijo: c.prefijo ?? "—" });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="label-cayla text-[11px] text-tinta/65">Inventario · Catálogo</p>
          <h1 className="font-display mt-1 text-2xl text-tinta">
            Categorías
            <Ayuda titulo="Categorías">
              Las 6 familias del negocio son fijas; dentro de cada una, las categorías (con su
              prefijo de 3 letras, como BLU de Blusas) sí crecen. El prefijo es lo que hace que el
              código de una prenda (BLU-0042) se pueda leer de un vistazo.
            </Ayuda>
          </h1>
        </div>
        <Link href="/inventario/taxonomia" className="label-cayla text-[11px] text-tinta/55 hover:text-rojo">
          Anclar al estándar universal →
        </Link>
      </div>

      <InventarioNav />

      <CategoriasLista porFamiliaInicial={porFamilia} puedeEditar={persona.rol === "lider"} />
    </div>
  );
}
