"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { navegacionSinEspera } from "@/components/ui/Espera";
import { decidirRefresco, escrituraPendiente, msHastaOtroSondeo, olvidarEscritura, suscribirEscritura } from "@/lib/refresco-tras-corte";
import { sondearLaBase } from "@/lib/sondear-la-base";

/**
 * Una escritura se quedó sin respuesta: la pantalla se vuelve a leer sola, para que «revisa si ya aparece registrado»
 * (ADR-0410) mire datos de ahora y no la foto de cuando se abrió (ADR-0411). Montado UNA vez en `app/(app)/layout.tsx`:
 * una pantalla nueva no tiene que hacer nada. La anotación la hace el interceptor de `fetch` del loader (`Espera.tsx`).
 *
 * El refresco es `router.refresh()` sin loader (`navegacionSinEspera`), como `<PreciosEnVivo />`: la hoja abierta, lo
 * escrito y su marca se conservan. Las reglas (cuándo se espera, cuándo se olvida) viven en `lib/refresco-tras-corte.ts`;
 * aquí solo se escucha: la anotación, el regreso de la red, el regreso a la pestaña y las teclas.
 */
export function RefrescoTrasCorte() {
  const router = useRouter();

  useEffect(() => {
    let reloj: number | undefined;
    let fallidos = 0;
    let preguntando = false;
    let cancelado = false;
    let ultimaTeclaMs: number | null = null;

    const programar = (ms: number) => {
      window.clearTimeout(reloj);
      reloj = window.setTimeout(mirar, ms);
    };

    const decidir = () => {
      const pendiente = escrituraPendiente();
      return {
        pendiente,
        plan: decidirRefresco({
          pendienteEn: pendiente?.ruta ?? null,
          ruta: window.location.pathname,
          visible: document.visibilityState === "visible",
          msDesdeUltimaTecla: ultimaTeclaMs === null ? null : Date.now() - ultimaTeclaMs,
        }),
      };
    };

    async function mirar() {
      window.clearTimeout(reloj);
      if (cancelado || preguntando) return;
      const { pendiente, plan } = decidir();
      if (!pendiente || plan.paso === "nada") return;
      if (plan.paso === "olvidar") {
        olvidarEscritura(pendiente.n);
        fallidos = 0;
        return;
      }
      if (plan.paso === "dormir") return; // al volver a la pestaña se mira otra vez
      if (plan.paso === "esperar") return programar(plan.ms);

      // Antes de refrescar, ¿responde la base? Sin red, la lectura de Next fallaría y Next pediría la página entera.
      preguntando = true;
      const responde = await sondearLaBase();
      preguntando = false;
      if (cancelado) return;
      if (!responde) return programar(msHastaOtroSondeo(fallidos++));
      fallidos = 0;

      // Mientras se preguntaba, la persona pudo irse, ocultar la pestaña o ponerse a escribir: manda lo de ahora.
      const ahora = decidir();
      if (ahora.pendiente?.n !== pendiente.n || ahora.plan.paso !== "sondear") return mirar();
      olvidarEscritura(pendiente.n);
      navegacionSinEspera(window.location.href);
      router.refresh();
      // Si durante la pregunta llegó otra anotación, sigue en pie y se atiende enseguida.
      if (escrituraPendiente()) void mirar();
    }

    const alAnotar = () => {
      fallidos = 0;
      void mirar();
    };
    const alVolverLaRed = () => {
      fallidos = 0;
      void mirar();
    };
    const alVolverALaPestana = () => {
      if (document.visibilityState === "visible") void mirar();
    };
    const alTeclear = () => {
      ultimaTeclaMs = Date.now();
    };

    const quitar = suscribirEscritura(alAnotar);
    window.addEventListener("online", alVolverLaRed);
    document.addEventListener("visibilitychange", alVolverALaPestana);
    document.addEventListener("keydown", alTeclear, true);
    document.addEventListener("input", alTeclear, true);
    void mirar(); // por si quedó algo anotado antes de montar
    return () => {
      cancelado = true;
      window.clearTimeout(reloj);
      quitar();
      window.removeEventListener("online", alVolverLaRed);
      document.removeEventListener("visibilitychange", alVolverALaPestana);
      document.removeEventListener("keydown", alTeclear, true);
      document.removeEventListener("input", alTeclear, true);
    };
  }, [router]);

  return null;
}
