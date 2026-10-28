import { describe, expect, it } from "vitest";
import { insigniaDeTalla, queTocaConLaTalla } from "./existencias-panel-talla";
import type { FilaPrenda } from "./existencias-prendas";

// El aviso único junto al número grande del cajón (2026-10-07): elige UNA de las respuestas de «¿Hay? ¿Colgar? ¿Pedir?».
const talla = (x: Partial<FilaPrenda> & { enRed?: unknown }) =>
  ({ pisoDisponible: 0, almacenDisponible: 0, disponible: 0, apartado: 0, danado: 0, planPiso: null, talla: "M", ...x }) as FilaPrenda;
const PIDE = { accion: "por_colgar" } as never;

describe("insigniaDeTalla: UNA respuesta junto al número grande", () => {
  const O = { separa: true, tiendas: new Set(["lim"]), puedeColgar: true, puedePedir: true };
  const ins = (x: Parameters<typeof talla>[0]) => insigniaDeTalla(queTocaConLaTalla(talla({ enTransito: 0, ...x }) as never, O));

  it("se acabó: rojo, y la frase dice quién tiene", () => {
    const r = ins({ enRed: [{ sede: "Lima", ubicacionId: "lim", cantidad: 2 }] as never });
    expect(r).toMatchObject({ tono: "rojo", texto: "Se acabó" });
    expect(r.frase).toContain("2");
  });
  it("falta colgar: ámbar, con cuántas", () => {
    expect(ins({ pisoDisponible: 0, almacenDisponible: 3, disponible: 3, planPiso: PIDE })).toMatchObject({ tono: "ambar", texto: "Falta colgar" });
  });
  it("con el piso en pausa no manda a colgar", () => {
    expect(ins({ pisoDisponible: 0, almacenDisponible: 3, disponible: 3, planPiso: { accion: "pausa_sin_cuadre" } as never })).toMatchObject({ tono: "pizarra", texto: "Piso en pausa" });
  });
  it("queda 1 y otra tienda tiene: queda poco", () => {
    expect(ins({ pisoDisponible: 1, almacenDisponible: 0, disponible: 1, enRed: [{ sede: "Lima", ubicacionId: "lim", cantidad: 3 }] as never })).toMatchObject({ tono: "pizarra", texto: "Queda poco" });
  });
  it("lo demás: todo bien", () => {
    expect(ins({ pisoDisponible: 2, almacenDisponible: 2, disponible: 4 })).toMatchObject({ tono: "verde", texto: "Todo bien" });
  });
});
