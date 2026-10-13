import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Los dos candados de la casa que la orden de compra aprendió con /chaos (2026-10-10) y que la orden de insumos (ADR-0362, fase 7) trae
// de nacimiento:
//   1. Dos clics en el MISMO instante en un botón que guarda: el estado `guardando` de React se aplica después del clic, así que las dos
//      llamadas pasaban. El candado es una `ref` que se pone en el mismo tick, antes de llamar a la base, y se suelta al terminar.
//   2. Al cerrar la hoja «Anular orden» (Escape o Cancelar), el foco vuelve al botón que la abrió: la hoja no tiene «disparador» de Radix
//      y `<Modal>` solo devuelve el foco si se le dice adónde (`alCerrarEnfocar`).

const leer = (archivo: string) => readFileSync(join(__dirname, "..", archivo), "utf8");

function candadoAntesDe(fuente: string, llamada: string) {
  const declara = /const enVuelo = useRef\(false\)/.test(fuente);
  const revisa = fuente.indexOf("if (guardando || enVuelo.current) return;");
  const pone = fuente.indexOf("enVuelo.current = true;");
  const llama = fuente.indexOf(`await ${llamada}(`);
  const suelta = fuente.indexOf("enVuelo.current = false;");
  return { declara, revisaAntes: revisa >= 0 && revisa < pone, poneAntes: pone >= 0 && pone < llama, suelta: suelta > llama };
}

describe("órdenes de insumos: un segundo clic en el mismo instante no vuelve a guardar", () => {
  it("Nueva y Editar ponen el candado antes de crear y de guardar los cambios", () => {
    const f = leer("components/ordenes-insumo/NuevaOrdenInsumo.tsx");
    expect(candadoAntesDe(f, "crearOrdenInsumo")).toEqual({ declara: true, revisaAntes: true, poneAntes: true, suelta: true });
    expect(f.indexOf("enVuelo.current = true;")).toBeLessThan(f.indexOf("await editarOrdenInsumo("));
  });
  it("la hoja «Anular orden» pone el candado antes de anular", () => {
    expect(candadoAntesDe(leer("components/ordenes-insumo/AccionesOrdenInsumo.tsx"), "anularOrdenInsumo")).toEqual({
      declara: true,
      revisaAntes: true,
      poneAntes: true,
      suelta: true,
    });
  });
});

describe("órdenes de insumos: al cerrar «Anular orden», el foco vuelve al botón", () => {
  it("el botón se recuerda al pulsarlo y la hoja se lo pasa a <Modal>", () => {
    const f = leer("components/ordenes-insumo/AccionesOrdenInsumo.tsx");
    expect(f).toMatch(/origenAnular\.current = e\.currentTarget/);
    expect(f).toMatch(/alCerrarEnfocar=\{volverA\}/);
    expect(f).toMatch(/<AnularOrdenInsumoModal[\s\S]*?volverA=\{origenAnular\}/);
  });
});
