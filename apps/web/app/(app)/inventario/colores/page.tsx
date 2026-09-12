import Link from "next/link";
import { requirePersonaActual } from "@/lib/persona";
import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { Ayuda } from "@/components/Ayuda";
import { InventarioNav } from "@/components/InventarioNav";
import { ColoresLista } from "@/components/ColoresLista";

// Antes de esta pantalla, el vocabulario cerrado de colores (0046) no tenía
// dónde crecer: `0048_conteos.sql` y `0051_conteo_color_vacio.sql` le dicen a
// la persona "La Líder puede agregarlo en Catálogo → Colores" y esa ruta no
// existía. Esta es esa ruta.
export default async function ColoresPage() {
  const persona = await requirePersonaActual();
  const supabase = await createClient();

  const res = await supabase.from("colores").select("codigo, nombre, familia_color, hex").eq("activo", true).order("orden").order("nombre");
  const filas = exigir(res, "los colores del vocabulario");

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="label-cayla text-[11px] text-tinta/65">Inventario · Catálogo</p>
          <h1 className="font-display mt-1 text-2xl text-tinta">
            Colores
            <Ayuda titulo="Colores">
              El vocabulario cerrado de color: {filas.length} nombres para que cuatro personas
              capturando prendas en paralelo no inventen cinco formas de escribir &quot;azul
              marino&quot;. Un color de acá se puede usar en cualquier modelo, de cualquier
              categoría, desde ahora mismo.
            </Ayuda>
          </h1>
        </div>
        <Link href="/inventario/taxonomia" className="label-cayla text-[11px] text-tinta/55 hover:text-rojo">
          Anclar al estándar universal →
        </Link>
      </div>

      <InventarioNav />

      <ColoresLista
        coloresIniciales={filas.map((c) => ({ codigo: c.codigo, nombre: c.nombre, familiaColor: c.familia_color, hex: c.hex }))}
        puedeEditar={persona.rol === "lider"}
      />
    </div>
  );
}
