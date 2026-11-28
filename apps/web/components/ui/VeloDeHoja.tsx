"use client";

import { useEffect, type Ref } from "react";
import { bloquearLoDeAtras } from "@/lib/candado-de-scroll";

/**
 * El velo de una hoja (`<Modal>`) y de un cajón con velo (`<Cajon>`): oscurece y desenfoca lo de atrás y, mientras está, la página de
 * atrás no se desplaza (ADR-0715). Es nuestro y no el `Dialog.Overlay` de Radix: el de Radix bloquea el desplazamiento agregando y
 * quitando una hoja de estilos, y en Safari cada hoja quedaba ~0,1 s congelada al cerrarse (`lib/candado-de-scroll.ts` lo explica).
 * Lo vigila `lib/hojas-velo.test.ts`: ninguna hoja vuelve a usar `Dialog.Overlay`.
 *
 * - `pointer-events: auto`: mientras la hoja es modal, Radix apaga los clics de todo el `<body>`; el velo los recibe para que tocarlo
 *   cierre la hoja, como hacía el de Radix.
 * - `touch-pinch-zoom`: con el dedo, desde el velo no se arrastra la página (un iPhone viejo no respeta el `overflow: hidden` de la
 *   página); pellizcar para acercar sigue andando.
 * - `data-state="open"`: la marca que ponía el de Radix. De ella cuelga el vidrio del velo (`vidrio/hoja.css`: su color y su desenfoque;
 *   `vidrio/dobla.css` y `perfil-vidrio.css`); sin ella el velo se ve casi transparente. La hoja y el cajón desmontan el velo al
 *   cerrarse, así que nunca está «closed».
 */
export function VeloDeHoja({ ref, className }: { ref?: Ref<HTMLDivElement>; className: string }) {
  useEffect(() => bloquearLoDeAtras(), []);
  return <div ref={ref} aria-hidden data-velo-hoja data-state="open" className={`touch-pinch-zoom ${className}`} style={{ pointerEvents: "auto" }} />;
}
