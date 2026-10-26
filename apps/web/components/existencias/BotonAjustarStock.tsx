"use client";

import { useSyncExternalStore } from "react";
import { BotonEditar } from "@/components/ui/BotonEditar";
import { useSedeActiva } from "@/components/SedeActiva";

// «Ajustar stock» en la cabecera de Existencias (ADR-0494): la cabecera la dibuja el servidor y la lista de prendas vive en el navegador
// (`InventarioPanel`), así que el botón no abre nada por su cuenta: avisa que se pidió, y el panel abre «¿Qué prenda vas a ajustar?».
// Un aviso es un número que sube con cada toque (`usePedidoDeAjuste`); sin pantalla que escuche, no pasa nada.

let pedidos = 0;
const oyentes = new Set<() => void>();

function pedirAjusteDeStock() {
  pedidos += 1;
  for (const o of oyentes) o();
}

/** Cuántas veces se tocó «Ajustar stock» en la cabecera: la pantalla abre su buscador cada vez que cambia. */
export function usePedidoDeAjuste(): number {
  return useSyncExternalStore(
    (avisar) => {
      oyentes.add(avisar);
      return () => oyentes.delete(avisar);
    },
    () => pedidos,
    () => 0
  );
}

/** Solo para quien puede ajustar, y mirando su propia sede (lo que escribe, se escribe en la sede activa: `permisosDelDetalle`). */
export function BotonAjustarStock({ ubicacionId, puedeAjustar }: { ubicacionId: string; puedeAjustar: boolean }) {
  const activa = useSedeActiva();
  if (!puedeAjustar || activa?.ubicacionId !== ubicacionId) return null;
  return (
    <BotonEditar onClick={pedirAjusteDeStock} guia="existencias.ajustar-stock">
      Ajustar stock
    </BotonEditar>
  );
}
