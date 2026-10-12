"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { navegacionSinEspera } from "@/components/ui/Espera";
import { cambioLaFirma, escribiendoEn, firmaDePrecios, type FilaCampana } from "@/lib/precios-en-vivo-firma";
import { hayPreciosPropios } from "@/lib/precios-en-vivo-registro";

const CADA_MS = 10_000;

/**
 * Todo lo que muestra un precio se pone al día solo (Felipe, 2026-10-08: «quiero que todo lo que muestre precios se
 * actualice en tiempo real»). Montado UNA vez en `app/(app)/layout.tsx`: una pantalla nueva no tiene que hacer nada.
 *
 * Cada 10 s, al volver a la pestaña y al volver la red, mira la firma de los precios (`firmaDePrecios`: la versión del
 * catálogo y las campañas de hoy; dos lecturas chicas, sin loader). Si cambió, rehace la pantalla abierta con
 * `router.refresh()`: los Server Components vuelven a leer y lo que la persona tiene en el navegador (lo tipeado, un
 * modal abierto, un ticket) se conserva. Ese refresco NO enciende el loader (`navegacionSinEspera`): no lo pidió nadie.
 *
 * · Con el foco en un campo de texto espera a que salga de él: no se rehace la pantalla bajo quien escribe.
 * · Pestaña oculta o sin red: no hace nada; al volver, mira enseguida.
 * · Vender con caja abierta relee precios por su cuenta y corrige su ticket (`usePreciosEnVivo`): mientras esté, no
 *   sondea (`hayPreciosPropios`).
 * Sondeo y no Supabase Realtime por la razón de ADR-0018 (la publicación vive en el proyecto compartido con Dynamic).
 */
export function PreciosEnVivo() {
  const router = useRouter();

  useEffect(() => {
    let firma: string | null = null;
    let pendiente = false;
    let enCurso = false;
    let cancelado = false;

    const refrescar = () => {
      if (escribiendoEn(document.activeElement)) return; // queda pendiente: se intenta al salir del campo
      pendiente = false;
      navegacionSinEspera(window.location.href);
      router.refresh();
    };

    const mirar = async () => {
      if (pendiente) return refrescar();
      if (hayPreciosPropios()) {
        firma = null; // al salir de esa pantalla se parte de cero: lo que ya aplicó ella no se refresca otra vez
        return;
      }
      // Sin mirar `navigator.onLine` (puede decir «sin red» con internet, 2026-10-10): sin red de verdad, falla y ya.
      if (enCurso || document.visibilityState !== "visible") return;
      enCurso = true;
      try {
        const supabase = createClient();
        const [resVersion, resCampanas] = await Promise.all([supabase.rpc("fn_catalogo_version"), supabase.rpc("campanas_vigentes")]);
        if (cancelado) return;
        const version = resVersion.error || resVersion.data === null ? null : Number(resVersion.data);
        // Sin la función de campañas en esa base (PGRST202) no hay campañas: lista vacía, como al cargar Vender.
        const campanas: FilaCampana[] | null = resCampanas.error ? (resCampanas.error.code === "PGRST202" ? [] : null) : (resCampanas.data ?? []);
        const nueva = firmaDePrecios(version, campanas);
        if (nueva === null) return;
        const anterior = firma;
        firma = nueva;
        // La primera lectura es la referencia: la pantalla acaba de cargar con esos precios.
        if (anterior !== null && cambioLaFirma(anterior, nueva)) {
          pendiente = true;
          refrescar();
        }
      } finally {
        enCurso = false;
      }
    };

    void mirar();
    const id = window.setInterval(mirar, CADA_MS);
    const alVolver = () => {
      if (document.visibilityState === "visible") void mirar();
    };
    // Al salir de un campo de texto, si quedó un refresco pendiente, se hace ya (después de que el foco se asentó).
    const alSalirDeCampo = () => {
      if (pendiente) window.setTimeout(() => !cancelado && pendiente && refrescar(), 0);
    };
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", alVolver);
    window.addEventListener("online", alVolver);
    document.addEventListener("focusout", alSalirDeCampo);
    return () => {
      cancelado = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", alVolver);
      window.removeEventListener("online", alVolver);
      document.removeEventListener("focusout", alSalirDeCampo);
    };
  }, [router]);

  return null;
}
