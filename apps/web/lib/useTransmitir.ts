"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { avisar } from "@/components/ui/Avisos";

/**
 * Transmitir un comprobante a SUNAT por Lucode (ADR-0005, ADR-0009): una sola implementación
 * para la fila de «Actividad de hoy» y la tabla de Comprobantes. `POST /api/lucode/emitir`, el
 * aviso de proceso y de resultado, y `router.refresh()` para que el estado, el hilo y los
 * contadores se actualicen solos.
 *
 * `transmitiendoId` va por fila y no como un estado global: transmitir la fila 3 no debe
 * deshabilitar el botón de la fila 1. Emitir y transmitir siguen separados a propósito (emitir no
 * puede depender de que un proveedor externo esté arriba, principio 9).
 */
export function useTransmitir() {
  const router = useRouter();
  const [transmitiendoId, setTransmitiendoId] = useState<string | null>(null);

  async function transmitir(comprobanteId: string) {
    setTransmitiendoId(comprobanteId);
    const cerrarProceso = avisar.proceso("Transmitiendo a SUNAT…");
    try {
      const respuesta = await fetch("/api/lucode/emitir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comprobante_id: comprobanteId }),
      });
      const datos = await respuesta.json();
      if (!respuesta.ok) {
        avisar.error("No se pudo transmitir el comprobante", { detalle: datos.error ?? undefined });
        return;
      }
      avisar.exito("Comprobante transmitido", { detalle: "SUNAT lo tiene; el estado se actualiza en la lista." });
      router.refresh();
    } catch {
      avisar.error("No se pudo transmitir el comprobante", { detalle: "No se pudo conectar con el servidor." });
    } finally {
      cerrarProceso();
      setTransmitiendoId(null);
    }
  }

  return { transmitiendoId, transmitir };
}
