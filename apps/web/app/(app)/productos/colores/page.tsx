import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { Ayuda } from "@/components/Ayuda";
import { ColoresLista } from "@/components/ColoresLista";

// Portado de `trix/catalogo-vocabulario` (V1) tras ADR-0095: el vocabulario
// cerrado de colores ya vive en `retail.colores`, esta es la pantalla que
// le faltaba para poder crecer sin pegar SQL a mano.
export default async function ColoresPage() {
  const persona = await requirePersonaActualV2();
  const supabase = await createClient();

  // Trae activos e inactivos: cualquiera con acceso a la pantalla ve el
  // directorio completo (igual que Proveedores) — solo Editar/Desactivar/
  // Reactivar quedan detrás de `puedeEditar`.
  const res = await supabase
    .from("colores")
    .select("codigo, nombre, familia_color, hex, orden, activo, tipo, imagen_muestra_url, notas, estado")
    .order("orden")
    .order("nombre");
  const filas = exigir(res, "los colores del vocabulario");
  const activos = filas.filter((c) => c.activo);

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">Productos · Catálogo</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">
          Colores
          <Ayuda titulo="Colores">
            El vocabulario cerrado de color: {activos.length} nombres para que cuatro personas
            capturando prendas en paralelo no inventen cinco formas de escribir &quot;azul
            marino&quot;. Un color de acá se puede usar en cualquier modelo desde ahora mismo.
          </Ayuda>
        </h1>
      </div>

      <ColoresLista
        coloresIniciales={filas.map((c) => ({
          codigo: c.codigo,
          nombre: c.nombre,
          familiaColor: c.familia_color,
          hex: c.hex,
          orden: c.orden,
          activo: c.activo,
          tipo: c.tipo,
          imagenMuestraUrl: c.imagen_muestra_url,
          notas: c.notas,
          estado: c.estado as "pendiente" | "aprobado",
        }))}
        puedeEditar={persona.rol === "lider"}
      />
    </div>
  );
}
