"use client";

import { useState } from "react";
import { AjustarInventarioModal } from "@/components/AjustarInventarioModal";
import { Boton } from "@/components/ui/campos";
import type { Sububicacion } from "@/lib/sububicaciones";

// TODO(B2): borrar este demo cuando se integre en la lista real.
export function ClienteDemo({
  productoId,
  ubicacionId,
  sububicaciones,
}: {
  productoId: string;
  ubicacionId: string;
  sububicaciones: Sububicacion[];
}) {
  const [abierto, setAbierto] = useState(true);

  return (
    <>
      {!abierto && (
        <Boton peso="primario" onClick={() => setAbierto(true)}>
          Ajustar inventario
        </Boton>
      )}
      {abierto && (
        <AjustarInventarioModal
          productoId={productoId}
          ubicacionId={ubicacionId}
          sububicaciones={sububicaciones}
          onClose={() => setAbierto(false)}
        />
      )}
    </>
  );
}
