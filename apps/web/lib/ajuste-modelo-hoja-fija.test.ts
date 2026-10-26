import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Regresión de /chaos 2026-10-26 (H1, semilla 1026) sobre «Ajustar stock» en el modal de la prenda de Existencias (ADR-0494, «Planilla
// rápida»): si la persona bajaba la hoja de la talla (a 1024 × 768 las tallas quedan bajo el pliegue) y tocaba «Ajustar stock», la planilla
// llegaba con la hoja corrida y aplastada. `<PaginaEstable>` (ADR-0185) veía el contenido acortarse bajo el clic y reservaba ese alto como
// relleno (862 px) DENTRO de la hoja, que en la planilla es de alto fijo (`<Modal altoFijo>`): la planilla quedaba en su mínimo, el pie
// encima de «Dónde» y no había forma de volver. Pasar a la planilla es un cambio de VISTA, no un bloque que se encogió.

const leer = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");

describe("la planilla de Existencias no hereda la hoja corrida (H1)", () => {
  it("al entrar a la planilla se suelta <PaginaEstable>, antes de pintar", () => {
    const panel = leer("components/existencias/PanelTalla.tsx");
    expect(panel).toMatch(/import \{ soltarPaginaEstable \} from "@\/components\/ui\/PaginaEstable"/);
    const efecto = panel.match(/useLayoutEffect\(\(\) => \{[\s\S]*?\}, \[planillaFija\]\);/)?.[0] ?? "";
    expect(efecto, "falta el useLayoutEffect que suelta PaginaEstable al entrar a la planilla").toContain("soltarPaginaEstable()");
  });

  it("la hoja de alto fijo no se deja desplazar ni por código (`overflow: clip`, no `hidden`)", () => {
    const modal = leer("components/ui/Modal.tsx");
    expect(modal).toMatch(/altoFijo \? "flex flex-col overflow-clip"/);
  });
});
