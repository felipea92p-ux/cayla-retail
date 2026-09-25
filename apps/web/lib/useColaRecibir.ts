"use client";

import { useRouter } from "next/navigation";
import { avisar } from "@/components/ui/Avisos";
import { useColaOffline } from "@/lib/useColaOffline";

/** Las únicas RPC que la cola de Recibir puede ejecutar al subir (ADR-0207). Las dos llevan `p_token`: reintentar
 *  no duplica el stock (`envios.token_cliente`, `lotes.token_cliente`, ADR-0190). */
export const RPCS_RECIBIR = ["recibir_envio", "recibir_lote"] as const;

/**
 * La cola sin conexión de Recibir mercadería: UNA para `/recibir` y `/inventario/recibir`. Las pantallas la usan
 * para pintarla y encolar; `subir` lo pasa solo el sincronizador del layout (`ColasSinConexion`), que al subir
 * cada recepción lo dice y relee la pantalla en la que esté la persona (el stock ya cambió en la base).
 */
export function useColaRecibir({ subir = false }: { subir?: boolean } = {}) {
  const router = useRouter();
  return useColaOffline("recibir", RPCS_RECIBIR, {
    subir,
    alSubir: (op) => {
      avisar.exito("Subió una recepción guardada sin conexión", { detalle: op.resumen });
      router.refresh();
    },
  });
}
