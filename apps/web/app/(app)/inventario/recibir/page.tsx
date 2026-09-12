import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { getCatalogo } from "@/lib/catalogo-v2";
import { RecepcionFormV2 } from "@/components/RecepcionFormV2";

// Fase UI 1 (2026-09-11): rediseño completo — ver `RecepcionFormV2.tsx` para
// el porqué no es una adaptación de la pantalla V1.
export default async function RecibirLotePage() {
  const persona = await requirePersonaActualV2();
  const supabase = await createClient();

  const [proveedoresRes, catalogo] = await Promise.all([
    supabase.from("proveedores").select("id, nombre").eq("activo", true).order("nombre"),
    getCatalogo(),
  ]);
  const proveedores = exigir(proveedoresRes, "el directorio de proveedores");

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">Inventario · {persona.ubicacionEtiqueta}</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Recibir mercadería</h1>
        <p className="mt-1 text-sm text-tinta/65">
          Cada prenda que entra queda registrada como movimiento — no se edita el stock a mano.
        </p>
      </div>

      {proveedores.length === 0 ? (
        <p className="card-cayla p-5 text-sm text-tinta/75">
          Todavía no hay proveedores registrados — no se puede recibir un lote sin uno.
        </p>
      ) : catalogo.length === 0 ? (
        <p className="card-cayla p-5 text-sm text-tinta/75">
          Todavía no hay productos en el catálogo — revisa Productos primero.
        </p>
      ) : (
        <RecepcionFormV2
          ubicacionId={persona.ubicacionId}
          ubicacionEtiqueta={persona.ubicacionEtiqueta}
          variantes={catalogo.map((v) => ({
            varianteId: v.varianteId,
            sku: v.sku,
            referencia: v.referencia,
            talla: v.talla,
            color: v.color,
          }))}
          proveedores={proveedores}
        />
      )}
    </div>
  );
}
