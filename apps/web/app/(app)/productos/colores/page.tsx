import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { Ayuda } from "@/components/Ayuda";
import { ProductosNav } from "@/components/ProductosNav";
import { ColoresLista } from "@/components/ColoresLista";

// Portado de `trix/catalogo-vocabulario` (V1) tras ADR-0035: el vocabulario
// cerrado de colores ya vive en `retail.colores`, esta es la pantalla que
// le faltaba para poder crecer sin pegar SQL a mano.
export default async function ColoresPage() {
  const persona = await requirePersonaActualV2();
  const supabase = await createClient();

  const res = await supabase
    .from("colores")
    .select("codigo, nombre, familia_color, hex")
    .eq("activo", true)
    .order("orden")
    .order("nombre");
  const filas = exigir(res, "los colores del vocabulario");

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">Productos · Catálogo</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">
          Colores
          <Ayuda titulo="Colores">
            El vocabulario cerrado de color: {filas.length} nombres para que cuatro personas
            capturando prendas en paralelo no inventen cinco formas de escribir &quot;azul
            marino&quot;. Un color de acá se puede usar en cualquier modelo desde ahora mismo.
          </Ayuda>
        </h1>
      </div>

      <ProductosNav />

      <ColoresLista
        coloresIniciales={filas.map((c) => ({ codigo: c.codigo, nombre: c.nombre, familiaColor: c.familia_color, hex: c.hex }))}
        puedeEditar={persona.rol === "lider"}
      />
    </div>
  );
}
