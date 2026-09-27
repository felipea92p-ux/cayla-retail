import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Candado de la velocidad de los combos dentro de un modal (2026-09-26). Felipe: «hay combos que demoran en desplegarse;
// que todos abran como el selector de sede». Medido en el navegador: el de sede se ve en 5 ms y entero a los 334 ms; un
// combo de «Registrar gasto» quedaba invisible 508 ms y entero a los 1008 ms. La causa no era el combo: `useDestinoFlotante`
// colgaba su lista como hija DIRECTA de la hoja, y la cascada de entrada del modal (`.cascada-modal > *`, ADR-0136) la
// animaba como a una pieza más del contenido, con el retraso del último turno. Ahora cuelga de la capa de listas que monta
// `<Modal>`, que está fuera de la cascada. Si algo de esta cadena se rompe, el combo vuelve a tardar un segundo.
//
// Contrato (3 líneas). PROMETE: que la lista de un combo dentro de un `<Modal>` no es hija directa de la hoja y que todo
// combo entra con `anim-revelar` (la entrada del selector de sede). ASUME: los combos cuelgan su lista con
// `useDestinoFlotante` y la cascada se escribe `.cascada-modal > :not(form):not([data-sin-cascada])`. NO PROMETE: los
// milisegundos exactos (se miden en el navegador con `getAnimations()` de la lista, ver BITACORA 2026-09-26).

const leer = (ruta: string) => readFileSync(new URL(`../${ruta}`, import.meta.url), "utf8");

const MODAL = leer("components/ui/Modal.tsx");
const ANCLAJE = leer("components/ui/useAnclaje.ts");
const CSS = leer("app/globals.css");

// Los combos con lista flotante (ADR-0209) y cómo llama cada uno a su portal.
const COMBOS = [
  { ruta: "components/ui/campos.tsx", portal: "maybePortal(" },
  { ruta: "components/ui/ComboBuscable.tsx", portal: "createPortal(" },
  { ruta: "components/ComboResponsable.tsx", portal: "createPortal(" },
  { ruta: "components/ui/FiltrosPildora.tsx", portal: "createPortal(" },
].map((c) => ({ ...c, fuente: leer(c.ruta) }));

describe("la lista de un combo dentro de un modal no entra en la cascada", () => {
  it("<Modal> monta la capa de listas, fuera de la cascada y al final de la hoja", () => {
    // Al final: así la capa no corre el turno (`--k`) de ninguna pieza del contenido.
    expect(MODAL).toMatch(/<div data-capa-flotante data-sin-cascada\s*\/>\s*<\/Dialog\.Content>/);
  });

  it("useDestinoFlotante cuelga la lista en la capa; en la hoja solo si esa hoja no tiene capa", () => {
    expect(ANCLAJE).toContain('hoja?.querySelector<HTMLElement>(":scope > [data-capa-flotante]")');
    expect(ANCLAJE).toContain("setDestino(capa ?? hoja ?? document.body)");
  });

  it("la cascada deja fuera lo marcado con data-sin-cascada (la capa)", () => {
    expect(CSS).toContain(".cascada-modal > :not(form):not([data-sin-cascada])");
  });

  it.each(COMBOS.map((c) => [c.ruta, c] as const))("%s cuelga su lista con useDestinoFlotante", (ruta, c) => {
    expect(c.fuente, `${ruta}: la lista flotante se cuelga donde dice useDestinoFlotante`).toContain("useDestinoFlotante(");
  });

  it.each(COMBOS.map((c) => [c.ruta, c] as const))("%s entra con la misma animación que el selector de sede", (ruta, c) => {
    const desde = c.fuente.indexOf(c.portal);
    expect(desde, `${ruta}: no encontré el portal (${c.portal})`).toBeGreaterThan(-1);
    // La primera clase después del portal es la de la caja que flota: ahí va `anim-revelar` (240 ms, sin espera).
    const clase = c.fuente.slice(desde).match(/className=\{?[`"]([^`"]*)/)?.[1] ?? "";
    expect(clase, `${ruta}: la lista entra con anim-revelar`).toMatch(/(^|\s)anim-revelar(\s|$)/);
  });
});
