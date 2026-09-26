"use client";

import { useCallback, type KeyboardEvent } from "react";
import { pasoConFlecha } from "@/lib/vista-rapida-reglas";

/* ====================================================================
   useFlechasDelCajon · ↑ ↓ pasan de registro solo con teclas del cajón
   (2026-09-26, ADR-0128 «Actualización 2026-09-26»)

   El gemelo de `useEscapeLibre` para las flechas de las vistas rápidas. Va en el `onKeyDown` del `Dialog.Content`
   del cajón: traduce el evento a datos y la decisión la toma `pasoConFlecha` (lib/vista-rapida-reglas.ts, con sus
   pruebas), que explica por qué un ↓ dentro de «Registrar pago» cambiaba el cajón de comprobante y se llevaba el
   pago con lo escrito. Un cajón nuevo que pase de registro con flechas usa esto, no un `e.key === "ArrowDown"`
   propio (lo vigila lib/vista-rapida-reglas.test.ts).
   ==================================================================== */
export function useFlechasDelCajon(navegar: (delta: 1 | -1) => void): (e: KeyboardEvent<HTMLElement>) => void {
  return useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      const destino = e.target as HTMLElement;
      const paso = pasoConFlecha({
        key: e.key,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
        defaultPrevented: e.defaultPrevented,
        // Un modal abierto desde el cajón vive en otro portal: su destino queda fuera del DOM del cajón.
        nacioEnElCajon: e.currentTarget.contains(destino),
        destino,
      });
      if (paso === null) return;
      e.preventDefault();
      navegar(paso);
    },
    [navegar],
  );
}
