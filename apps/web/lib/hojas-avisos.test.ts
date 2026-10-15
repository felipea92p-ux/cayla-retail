import { createRequire } from "node:module";
import { readFileSync, realpathSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Candado del 2026-10-14 (ADR-0146, «Actualización 2026-10-14»): con un cajón o una hoja de Radix abierta, un clic en un
// aviso de arriba a la derecha contaba como «clic afuera» y cerraba la hoja; el «Deshacer» no llegaba a correr. En vez de
// que cada `<Dialog.Content>` se acuerde de ignorar ese destino (y de tocar las nueve hojas, Producción incluida), la pila
// de avisos se declara RAMA de toda capa de Radix (`DismissableLayer.Branch`): para Radix, un clic ahí está dentro de la
// hoja, hoy y en toda hoja que se construya. Lo único que puede romperlo en silencio es que `radix-ui/internal` y
// `@radix-ui/react-dialog` dejen de compartir la misma copia de `react-dismissable-layer` (dos copias = dos contextos, y la
// rama de una no la ve la otra). Esta prueba lo mira en el `node_modules` real.
//
// Contrato (3 líneas). PROMETE: que `Avisos.tsx` envuelve su pila en `DismissableLayer.Branch` de `radix-ui/internal` y que
// esa capa resuelve al MISMO archivo que la que usa `@radix-ui/react-dialog`. ASUME: pnpm y los paquetes instalados como
// en el lockfile. NO PROMETE: el clic en sí (eso se ve en el navegador: cajón de una orden de Producción + Deshacer).

const require = createRequire(import.meta.url);
const real = (modulo: string, desde?: string) => realpathSync((desde ? createRequire(desde) : require).resolve(modulo));

describe("la pila de avisos es rama de toda hoja de Radix", () => {
  const fuente = readFileSync(new URL("../components/ui/Avisos.tsx", import.meta.url), "utf8");

  it("Avisos.tsx envuelve la pila en DismissableLayer.Branch, y esa es la pila (lleva data-avisos)", () => {
    expect(fuente).toContain('import { DismissableLayer } from "radix-ui/internal"');
    expect(fuente).toMatch(/<DismissableLayer\.Branch[\s\S]*?data-avisos/);
  });

  it("radix-ui/internal y @radix-ui/react-dialog usan la MISMA copia de react-dismissable-layer", () => {
    const dialog = real("@radix-ui/react-dialog");
    const paraguas = real("radix-ui");
    const capaDelDialogo = real("@radix-ui/react-dismissable-layer", dialog);
    const capaDelParaguas = real("@radix-ui/react-dismissable-layer", paraguas);
    expect(capaDelParaguas, "dos copias = dos contextos: la rama de los avisos sería invisible para la hoja").toBe(capaDelDialogo);
  });
});
