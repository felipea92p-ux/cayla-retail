"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { botonPrimario } from "@/components/ui/Modal";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";

// Banner de revisión para una prenda con `estado_alta = 'pendiente'` —
// alguien que no es Líder la creó al vuelo mientras contaba (20260918,
// `censo_crear_variante`). Vive arriba de `ProductoForm`: el mismo lugar
// donde el Líder ya viene a corregir categoría/tejido/patrón, así que
// revisar y ajustar quedan en un solo viaje.
// Aprobar o rechazar es Catálogo: firma con su propio combo «Responsable»
// (ADR-0161), aparte del de «Guardar cambios» del formulario de abajo.
export function RevisarAltaBanner({ productoId }: { productoId: string }) {
  const router = useRouter();
  const [procesando, setProcesando] = useState<"aprobar" | "rechazar" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const responsable = useResponsable();

  async function revisar(aprobar: boolean) {
    if (!responsable.listo) return;
    setProcesando(aprobar ? "aprobar" : "rechazar");
    setError(null);
    const { error } = await firmar(
      createClient().rpc("revisar_producto_censo", { p_producto_id: productoId, p_aprobar: aprobar }),
      responsable.firma(),
    );
    setProcesando(null);
    responsable.despues(error);
    if (error) {
      setError(traducirError(error, aprobar ? "aprobar la prenda" : "rechazar la prenda"));
      return;
    }
    avisar.exito(aprobar ? "Prenda aprobada" : "Prenda rechazada", {
      detalle: aprobar ? undefined : "Queda descontinuada — ya no se vende ni se cuenta.",
    });
    router.refresh();
  }

  return (
    <div className="card-cayla flex flex-wrap items-center justify-between gap-3 border-l-2 border-l-rojo p-4">
      <div>
        <p className="text-sm font-semibold text-tinta">Pendiente de revisar</p>
        <p className="text-xs text-tinta/65">
          Se dio de alta al vuelo durante un conteo — revisa nombre, categoría, marca y proveedor, y el precio antes de aprobarla.
        </p>
        {error && <p className="mt-1 text-xs text-rojo">{error}</p>}
      </div>
      <ComboResponsable control={responsable} deshabilitado={procesando !== null} hacia="abajo" className="w-full sm:w-64" />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => revisar(false)}
          disabled={procesando !== null || !responsable.listo}
          title={responsable.motivo ?? undefined}
          className="rounded-lg border border-tinta/20 px-3 py-1.5 text-xs font-semibold text-tinta/75 hover:border-rojo hover:text-rojo disabled:opacity-50"
        >
          {procesando === "rechazar" ? "Rechazando…" : "Rechazar"}
        </button>
        <button type="button" onClick={() => revisar(true)} disabled={procesando !== null || !responsable.listo} title={responsable.motivo ?? undefined} className={`${botonPrimario} px-4 py-1.5 text-xs`}>
          {procesando === "aprobar" ? "Aprobando…" : "Aprobar"}
        </button>
      </div>
    </div>
  );
}
