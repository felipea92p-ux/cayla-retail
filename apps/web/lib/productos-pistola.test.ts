import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { busquedaDeLaPistola } from "./productos-filtros";

// Catálogo ▸ Productos y la pistola (2026-11-20, Felipe: «cuando se escanea con la pistola no busca de manera correcta como
// Existencias o Punto de venta»). Medido en producción con `fn_productos_buscar_palabras`, la búsqueda de esta pantalla:
//   «ABR-0003-NEG-S» → 1 prenda · «ABR'0003'NEG'S» (lo que escribe la pistola en un teclado en español) → 0 ·
//   «blusaABR-0003-NEG-S» (el escaneo pegado detrás de lo que ya había en la caja) → 0.
// Existencias y Vender ya lo resuelven con `usePistola` (solo la ráfaga, nunca lo de antes) y `guionDeLaPistola`. Productos
// mandaba el texto tal cual a la base. Esta prueba vigila la regla y que la pantalla la use.

describe("busquedaDeLaPistola", () => {
  it("devuelve el guion que la pistola escribe como apóstrofo en un teclado en español", () => {
    expect(busquedaDeLaPistola("ABR'0003'NEG'S")).toBe("ABR-0003-NEG-S");
    expect(busquedaDeLaPistola("CMS'0011'ROS'STD")).toBe("CMS-0011-ROS-STD");
  });

  it("deja igual un código que ya llega bien y un código de barras de fábrica", () => {
    expect(busquedaDeLaPistola("ABR-0003-NEG-S")).toBe("ABR-0003-NEG-S");
    expect(busquedaDeLaPistola("7751234567890")).toBe("7751234567890");
  });

  it("quita los espacios de los bordes", () => {
    expect(busquedaDeLaPistola("  ABR'0003'NEG'S \n")).toBe("ABR-0003-NEG-S");
  });
});

const APP = join(__dirname, "..");

/** El fuente sin comentarios: una línea comentada no cuenta como cableada. */
function fuente(ruta: string): string {
  return readFileSync(join(APP, ruta), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("Productos escucha la pistola como Existencias y Vender", () => {
  const filtros = fuente("components/FiltrosProductos.tsx");

  it("el buscador entrega su campo a `usePistola`", () => {
    expect(filtros).toMatch(/usePistola\(\s*buscadorRef\s*,/);
    expect(filtros).toMatch(/<Buscador[\s\S]*?ref=\{buscadorRef\}/);
  });

  it("lo leído se busca con el guion en su sitio, sin lo que había escrito antes", () => {
    expect(filtros).toMatch(/busquedaDeLaPistola\(\s*codigo\s*\)/);
  });

  it("lee también con el cursor fuera del buscador, sin robarle el foco a nadie", () => {
    expect(filtros).toMatch(/fuera:\s*"leer"/);
  });
});
