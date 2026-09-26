import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Candado de la regla de Escape en las hojas (ADR-0136, «Actualización 2026-09-26»). Radix escucha Escape en la fase
// de captura del `document`, antes que el control enfocado: con la lista de un combo abierta dentro de un modal, el
// Escape que era para cerrar la lista cerraba la hoja entera y se perdía lo escrito. Toda hoja de Radix decide ahora
// con `useEscapeLibre` (components/ui/useEscapeLibre.ts): cierra solo con un Escape que ningún control de adentro usó.
// `<Modal>` ya lo hace; lo que esta prueba cuida es que un cajón o una hoja que arme su propio `Dialog.Content` (hoy
// las vistas rápidas, `OrdenPanel` y `ProveedorModal`) no se lo salte. Si se lo salta, el bug vuelve en esa pantalla.
//
// Contrato (3 líneas). PROMETE: que cada `<Dialog.Content>` de la web lleva `onEscapeKeyDown` y que su archivo usa
// `useEscapeLibre`. ASUME: las hojas son `.tsx` bajo `components/` o `app/` y usan el `Dialog` de
// `@radix-ui/react-dialog` con ese nombre. NO PROMETE: que cada control que usa el Escape corte su propagación (eso
// lo dice el comentario de `useEscapeLibre`); abrir el modal en el navegador sigue siendo la prueba final.

const RAICES = ["components", "app"];

const HOJAS = RAICES.flatMap((raiz) => {
  const dir = new URL(`../${raiz}/`, import.meta.url);
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .map((f) => f.replaceAll("\\", "/"))
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => ({ ruta: `${raiz}/${f}`, fuente: readFileSync(new URL(f, dir), "utf8") }));
}).filter(({ fuente }) => fuente.includes("<Dialog.Content"));

const veces = (texto: string, trozo: string) => texto.split(trozo).length - 1;

describe("toda hoja de Radix cierra con Escape solo si nadie de adentro lo usó", () => {
  it("encuentra las hojas (no mira una carpeta vacía)", () => {
    expect(HOJAS.map((h) => h.ruta)).toContain("components/ui/Modal.tsx");
  });

  it.each(HOJAS.map((h) => [h.ruta, h.fuente] as const))("%s pasa cada Dialog.Content por useEscapeLibre", (ruta, fuente) => {
    expect(fuente, `${ruta}: la hoja decide su Escape con useEscapeLibre`).toContain("useEscapeLibre(");
    expect(veces(fuente, "onEscapeKeyDown="), `${ruta}: cada <Dialog.Content> lleva onEscapeKeyDown`).toBe(veces(fuente, "<Dialog.Content"));
  });
});
