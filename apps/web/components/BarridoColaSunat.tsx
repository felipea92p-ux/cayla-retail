"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { barrerColaSunat } from "@/lib/envio-sunat";

// Al abrir la pantalla, reintenta lo que quedó en la cola de SUNAT (D-60 paso 2, sin cron). No pinta
// nada: si algo cambió de estado, `router.refresh()` para que la lista lo muestre.
export function BarridoColaSunat({ ubicacionId }: { ubicacionId: string | null }) {
  const router = useRouter();
  useEffect(() => {
    barrerColaSunat(ubicacionId).then((tomados) => {
      if (tomados > 0) router.refresh();
    });
  }, [ubicacionId, router]);
  return null;
}
