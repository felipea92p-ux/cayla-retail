import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getUbicaciones } from "@/lib/ubicaciones";
import { getStockPorUbicacion } from "@/lib/inventario-v2";
import { MoverMercaderiaFormV2 } from "@/components/MoverMercaderiaFormV2";

// Fase UI 1.1 (2026-09-12): pantalla nueva sobre `transferir` (V2). Ver
// `MoverMercaderiaFormV2.tsx` para el porqué el origen no es un campo del
// formulario y el destino sale siempre de `retail.ubicaciones`.
export default async function MoverMercaderiaPage() {
  const persona = await requirePersonaActualV2();
  const [ubicaciones, stockOrigen] = await Promise.all([
    getUbicaciones(),
    getStockPorUbicacion(persona.ubicacionId),
  ]);

  const destinos = ubicaciones.filter((u) => u.id !== persona.ubicacionId);

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">Inventario · {persona.ubicacionEtiqueta}</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Mover mercadería</h1>
        <p className="mt-1 text-sm text-tinta/65">
          Cada traslado queda registrado como movimiento — no se edita el stock a mano.
        </p>
      </div>

      {destinos.length === 0 ? (
        <p className="card-cayla p-5 text-sm text-tinta/75">
          No hay otra ubicación registrada todavía — un traslado necesita al menos dos.
        </p>
      ) : (
        <MoverMercaderiaFormV2
          origenId={persona.ubicacionId}
          origenEtiqueta={persona.ubicacionEtiqueta}
          destinos={destinos}
          variantes={stockOrigen.map((f) => ({
            varianteId: f.varianteId,
            sku: f.sku,
            referencia: f.referencia,
            talla: f.talla,
            color: f.color,
            cantidad: f.cantidad,
          }))}
        />
      )}
    </div>
  );
}
