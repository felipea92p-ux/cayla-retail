"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { navegacionSinEspera } from "@/components/ui/Espera";
import { ESPERA_JUNTAR_PAGINA_MS, queHacerConUnCambio, REINTENTO_CON_HOJA_MS } from "@/lib/cambios-en-vivo-reglas";
import { useCambiosEnVivo } from "@/lib/useCambiosEnVivo";

/** ¿Hay una hoja o un cajón abierto? Las de Radix (`<Modal>`, `<Cajon>`) se dibujan como `role="dialog"`. */
function hayHojaAbierta(): boolean {
  return document.querySelector('[role="dialog"][data-state="open"]') !== null;
}

/**
 * Existencias en vivo (ADR-0603): cuando otra caja vende, repone o ajusta en esta sede, la pantalla vuelve a leerse sola
 * (`router.refresh()`, sin loader y sin perder lo que la persona tiene escrito).
 *
 * Con la pestaña oculta no gasta nada y refresca al volver. Con una hoja abierta (alguien contando o ajustando una talla)
 * NO le cambia las cifras debajo de la mano: espera a que se cierre.
 */
export function useRefrescoEnVivo(ubicacionId: string) {
  const router = useRouter();
  const pendiente = useRef(false);
  const reintento = useRef<ReturnType<typeof setTimeout> | null>(null);

  const alCambiarRef = useRef<() => void>(() => {});
  useEffect(() => {
    alCambiarRef.current = () => {
      switch (queHacerConUnCambio({ oculta: document.visibilityState !== "visible", hojaAbierta: hayHojaAbierta() })) {
        case "refrescar":
          pendiente.current = false;
          // Nadie pidió este refresco: se anuncia al loader para que no tape la pantalla (`navegacionSinEspera`, ADR-0149). Sin esto, el
          // `router.refresh()` cuenta como «cargar una pantalla» y cada venta ajena dejaba Existencias bajo «Cargando».
          navegacionSinEspera(window.location.href);
          router.refresh();
          return;
        case "guardar-para-despues":
          pendiente.current = true;
          return;
        case "reintentar":
          pendiente.current = true;
          if (reintento.current === null) {
            reintento.current = setTimeout(() => {
              reintento.current = null;
              alCambiarRef.current();
            }, REINTENTO_CON_HOJA_MS);
          }
          return;
      }
    };
  }, [router]);

  useCambiosEnVivo({ tabla: "stock", ubicacionId, esperaMs: ESPERA_JUNTAR_PAGINA_MS, alCambiar: () => alCambiarRef.current() });

  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState === "visible" && pendiente.current) alCambiarRef.current();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      document.removeEventListener("visibilitychange", alVolver);
      if (reintento.current !== null) clearTimeout(reintento.current);
      reintento.current = null;
    };
  }, []);
}
