"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { firmar } from "@/lib/responsable-reglas";
import { useResponsable } from "@/lib/useResponsable";
import { errorDeCorreccion } from "@/lib/corregir-prenda-sin-registrar-reglas";
import type { DatosPrendaSinRegistrar, ListasPrendaLibre } from "@/lib/prenda-sin-registrar-reglas";
import type { FilaPorRegularizar } from "@/lib/por-regularizar";
import { avisar } from "@/components/ui/Avisos";
import { PrendaSinRegistrarModal } from "@/components/PrendaSinRegistrarModal";

/**
 * «Corregir lo anotado» de una venta sin registrar (ADR-0369, Felipe 2026-10-09: «es muy relativo»). La caja anota a ojo categoría,
 * talla y color; aquí se cambian después de la venta, mientras está pendiente o cerrada sin prenda. Es la MISMA hoja con que la caja
 * anotó (`PrendaSinRegistrarModal` en modo `corregir`): las mismas listas, la misma guía y la misma etiqueta que se arma.
 *
 * Guarda `corregir_prenda_sin_registrar`, firmada por el «Responsable» (ADR-0162). No toca precio, stock, venta ni comprobante.
 */
export function CorregirPrendaSinRegistrarModal({ fila, listas, onClose }: { fila: FilaPorRegularizar; listas: ListasPrendaLibre; onClose: () => void }) {
  const router = useRouter();
  const responsable = useResponsable();
  const [guardando, setGuardando] = useState(false);

  async function guardar(d: DatosPrendaSinRegistrar) {
    if (guardando || !responsable.listo) return;
    setGuardando(true);
    const { error } = await firmar(
      createClient().rpc("corregir_prenda_sin_registrar", {
        p_id: fila.id,
        p_descripcion: d.descripcion,
        p_categoria_id: d.categoriaId,
        p_talla_id: d.tallaId,
        p_color_codigo: d.colorCodigo,
      }),
      responsable.firma(),
    );
    setGuardando(false);
    responsable.despues(error);
    if (error) {
      const mensaje = `${error.message ?? ""} ${error.hint ?? ""}`;
      // Un doble clic llega aquí con lo mismo que ya se guardó: está hecho.
      if (mensaje.includes("prenda_sin_cambios")) {
        onClose();
        router.refresh();
        return;
      }
      const propio = errorDeCorreccion(mensaje);
      if (propio) {
        avisar.error(propio.titulo, propio.detalle ? { detalle: propio.detalle } : undefined);
        if (propio.releer) {
          onClose();
          router.refresh();
        }
        return;
      }
      avisar.error(traducirError(error, "corregir lo anotado"));
      return;
    }
    avisar.exito("Corregido", { detalle: `Ahora dice «${d.descripcion}». El precio, el stock y el comprobante no cambiaron.` });
    onClose();
    router.refresh();
  }

  return (
    <PrendaSinRegistrarModal
      listas={listas}
      onClose={onClose}
      corregir={{
        inicial: { categoriaId: fila.categoriaId, tallaId: fila.tallaId, colorCodigo: fila.colorCodigo, descripcion: fila.descripcion, precio: fila.precioCobrado },
        responsable,
        guardando,
        onGuardar: (d) => void guardar(d),
      }}
    />
  );
}
