"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * En qué fecha cuenta un comprobante con esa fecha real (tarea 20 de «Las 36»): la misma, o hoy si su mes está cerrado. Solo sirve para avisar antes de guardar: lo decide la base al registrar.
 * `null` mientras no se sabe o si la lectura falla: sin aviso, y el guardado dirá lo mismo.
 */
export function useFechaContable(ubicacionId: string | null, fecha: string | null): string | null {
  const [entra, setEntra] = useState<string | null>(null);
  useEffect(() => {
    if (!fecha) return;
    let vigente = true;
    void createClient()
      .rpc("fn_fecha_contable" as never, { p_ubicacion_id: ubicacionId, p_fecha: fecha } as never)
      .then(({ data, error }) => {
        if (vigente) setEntra(error || !data ? null : String(data));
      });
    return () => {
      vigente = false;
    };
  }, [ubicacionId, fecha]);
  return fecha ? entra : null;
}
