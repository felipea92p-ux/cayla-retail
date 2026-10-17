import { describe, expect, it } from "vitest";
import { leerQuienEs, lineaDelCliente, type QuienEs } from "./recomendaciones-cliente";

const BASE: QuienEs = { clubDesde: null, suSede: null, compras12m: 0, esFrecuente: false, ultimaCompra: null };
const HOY = "2026-10-17";

describe("quién es el cliente, en una línea", () => {
  it("del club, con compras, su tienda y la última", () => {
    expect(
      lineaDelCliente(
        { clubDesde: "2026-03-10T15:00:00Z", suSede: "Tienda Trujillo", compras12m: 4, esFrecuente: false, ultimaCompra: "2026-10-05T18:00:00Z" },
        HOY,
      ),
    ).toBe("Del club desde marzo de 2026 · 4 compras en el último año, casi siempre en Tienda Trujillo · la última, hace 12 días");
  });

  it("sin club ni compras lo dice, sin inventar tienda ni fecha", () => {
    expect(lineaDelCliente(BASE, HOY)).toBe("No es del club · sin compras en el último año");
  });

  it("una compra en singular; frecuente cuando lo es; sin tienda habitual no la nombra", () => {
    expect(lineaDelCliente({ ...BASE, compras12m: 1, ultimaCompra: "2026-10-16T20:00:00Z" }, HOY)).toBe(
      "No es del club · 1 compra en el último año · la última, ayer",
    );
    expect(lineaDelCliente({ ...BASE, compras12m: 9, esFrecuente: true, suSede: "Tienda Lima" }, HOY)).toBe(
      "No es del club · 9 compras en el último año (frecuente), casi siempre en Tienda Lima",
    );
  });

  it("la última compra cuenta días de Lima: la noche del 16 en Lima (madrugada UTC del 17) fue «ayer»", () => {
    expect(lineaDelCliente({ ...BASE, compras12m: 2, ultimaCompra: "2026-10-17T03:00:00Z" }, HOY)).toContain("la última, ayer");
    expect(lineaDelCliente({ ...BASE, compras12m: 2, ultimaCompra: "2026-10-17T15:00:00Z" }, HOY)).toContain("la última, hoy");
    expect(lineaDelCliente({ ...BASE, compras12m: 2, ultimaCompra: "2026-06-17T15:00:00Z" }, HOY)).toContain("hace 4 meses");
    expect(lineaDelCliente({ ...BASE, compras12m: 2, ultimaCompra: "2025-01-10T15:00:00Z" }, HOY)).toContain("hace más de un año");
  });

  it("lo que devuelven las lecturas: la ficha con su club y la fila de su sede; sin ficha, nada", () => {
    expect(
      leerQuienEs({ club_desde: "2026-03-10T15:00:00Z" }, [
        { su_sede: "Tienda Trujillo", compras_12m: 4, es_frecuente: true, ultima_compra: "2026-10-05T18:00:00Z", compras_sede: 3 },
      ]),
    ).toEqual({ clubDesde: "2026-03-10T15:00:00Z", suSede: "Tienda Trujillo", compras12m: 4, esFrecuente: true, ultimaCompra: "2026-10-05T18:00:00Z" });
    expect(leerQuienEs({ club_desde: null }, [])).toEqual(BASE);
    expect(leerQuienEs({ club_desde: null }, null)).toEqual(BASE);
    expect(leerQuienEs(null, [])).toBeNull();
  });
});
