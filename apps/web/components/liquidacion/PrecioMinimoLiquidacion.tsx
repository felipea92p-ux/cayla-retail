"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Boton, CampoMonto } from "@/components/ui/campos";
import { avisar } from "@/components/ui/Avisos";
import { createClient } from "@/lib/supabase/client";
import { firmar } from "@/lib/responsable-reglas";
import { useResponsable } from "@/lib/useResponsable";
import { traducirError } from "@/lib/error-escritura";
import { precioDeTexto, soles } from "@/lib/liquidacion-reglas";

/**
 * El precio mínimo de la liquidación (ADR-0371, Felipe 2026-10-10: S/ 10). Bajo él solo un líder etiqueta. Todos lo leen; solo el
 * líder lo cambia, aquí mismo (un solo dato: no merece su propia hoja). Firma el líder que está en la cuenta.
 */
export function PrecioMinimoLiquidacion({ minimo, esLider }: { minimo: number; esLider: boolean }) {
  const router = useRouter();
  const responsable = useResponsable();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(String(minimo));
  const [guardando, setGuardando] = useState(false);
  const enVuelo = useRef(false);
  const nuevo = precioDeTexto(valor);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (enVuelo.current || nuevo === null) return;
    if (nuevo === minimo) {
      setEditando(false);
      return;
    }
    enVuelo.current = true;
    setGuardando(true);
    const { error } = await firmar(createClient().rpc("guardar_precio_minimo_liquidacion", { p_minimo: nuevo }), responsable.firma());
    enVuelo.current = false;
    setGuardando(false);
    responsable.despues(error);
    if (error) {
      avisar.error(traducirError(error, "cambiar el precio mínimo"));
      return;
    }
    avisar.exito("Precio mínimo cambiado", { detalle: `Desde ahora, bajo S/ ${soles(nuevo)} solo un líder etiqueta.` });
    setEditando(false);
    router.refresh();
  }

  if (!esLider || !editando) {
    return (
      <p>
        El precio mínimo es <b>S/ {soles(minimo)}</b>: por debajo, la pieza la etiqueta un líder.{" "}
        {esLider && (
          <button type="button" className="btn-cayla btn-enlace" onClick={() => setEditando(true)}>
            Cambiarlo
          </button>
        )}
      </p>
    );
  }
  return (
    <form onSubmit={guardar} className="flex flex-wrap items-end gap-3">
      <div className="w-40">
        <CampoMonto etiqueta="Precio mínimo" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} autoFocus />
      </div>
      <Boton type="button" onClick={() => setEditando(false)}>
        Cancelar
      </Boton>
      <Boton type="submit" peso="primario" cargando={guardando} disabled={nuevo === null || !responsable.listo} title={responsable.motivo ?? undefined}>
        Guardar
      </Boton>
    </form>
  );
}
