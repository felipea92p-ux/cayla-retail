"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { vaciarColaSunat } from "@/lib/envio-sunat";

// Al abrir la pantalla, reintenta lo que quedó en la cola de SUNAT (D-60 paso 2, sin cron) y sigue pasada tras pasada
// mientras haya algo que hacer (ADR-0378). No pinta nada: tras cada pasada que movió algo, `router.refresh()` para que
// la lista, el contador y el aviso lo muestren. Si la persona se va de la pantalla, deja de pedir.
export function BarridoColaSunat({ ubicacionId }: { ubicacionId: string | null }) {
  const router = useRouter();
  useEffect(() => {
    let vivo = true;
    void vaciarColaSunat(ubicacionId, { alCambiar: () => router.refresh(), seguir: () => vivo });
    return () => {
      vivo = false;
    };
  }, [ubicacionId, router]);
  return null;
}
