import { describe, expect, it } from "vitest";
import { MAXIMO_DIAS_INGRESOS, conPreposicion, diaLargo, esFechaIso, hrefIngresos, leerResumenIngresos, modelosTexto, prendasTexto, rangoIngresos } from "./ingresos-reglas";

const HOY = "2026-10-29";

describe("rangoIngresos", () => {
  it("por defecto son los últimos 7 días, contando hoy", () => {
    expect(rangoIngresos({}, HOY)).toEqual({ periodo: "7", desde: "2026-10-23", hasta: HOY, texto: "los últimos 7 días" });
  });

  it("30 y 90 días; cualquier otro valor cae en 7", () => {
    expect(rangoIngresos({ p: "30" }, HOY)).toMatchObject({ periodo: "30", desde: "2026-09-30", hasta: HOY });
    expect(rangoIngresos({ p: "90" }, HOY)).toMatchObject({ periodo: "90", desde: "2026-08-01", hasta: HOY });
    expect(rangoIngresos({ p: "1000" }, HOY)).toMatchObject({ periodo: "7" });
    expect(rangoIngresos({ p: "'; drop" }, HOY)).toMatchObject({ periodo: "7" });
  });

  it("«desde el día que llegó el fardo hasta hoy»: con solo `desde`, el hasta es hoy", () => {
    const r = rangoIngresos({ desde: "2026-10-20" }, HOY);
    expect(r).toEqual({ periodo: "fechas", desde: "2026-10-20", hasta: HOY, texto: "del 20 de octubre al 29 de octubre" });
  });

  it("un solo día se dice «el …»", () => {
    expect(rangoIngresos({ desde: "2026-10-20", hasta: "2026-10-20" }, HOY).texto).toBe("el 20 de octubre");
  });

  it("nunca pasa de hoy ni se invierte", () => {
    expect(rangoIngresos({ desde: "2026-10-20", hasta: "2026-12-31" }, HOY)).toMatchObject({ desde: "2026-10-20", hasta: HOY });
    // Un desde en el futuro se queda en el hasta: un rango de un día, no uno al revés.
    expect(rangoIngresos({ desde: "2026-12-01" }, HOY)).toMatchObject({ desde: HOY, hasta: HOY });
    expect(rangoIngresos({ desde: "2026-10-25", hasta: "2026-10-20" }, HOY)).toMatchObject({ desde: "2026-10-20", hasta: "2026-10-20" });
  });

  it("recorta lo que pasa del tope de la base (400 días), no lo rechaza", () => {
    const r = rangoIngresos({ desde: "2020-01-01" }, HOY);
    expect(r.hasta).toBe(HOY);
    expect(r.desde).toBe("2025-09-24");
    // 400 días antes de hoy son 401 días contando ambos extremos; la base acepta p_hasta - p_desde <= 400.
    const dias = (Date.parse(r.hasta) - Date.parse(r.desde)) / 86_400_000;
    expect(dias).toBeLessThanOrEqual(MAXIMO_DIAS_INGRESOS);
  });

  it("una fecha que no existe se ignora y vuelve al período de fábrica", () => {
    expect(rangoIngresos({ desde: "2026-02-31" }, HOY)).toMatchObject({ periodo: "7" });
    expect(rangoIngresos({ desde: "ayer" }, HOY)).toMatchObject({ periodo: "7" });
  });
});

describe("esFechaIso y diaLargo", () => {
  it("solo acepta días que existen", () => {
    expect(esFechaIso("2028-02-29")).toBe(true);
    expect(esFechaIso("2026-02-29")).toBe(false);
    expect(esFechaIso("2026-2-1")).toBe(false);
    expect(esFechaIso(undefined)).toBe(false);
  });

  it("agrega el año solo si no es el de hoy", () => {
    expect(diaLargo("2026-03-10", HOY)).toBe("10 de marzo");
    expect(diaLargo("2025-12-31", HOY)).toBe("31 de diciembre de 2025");
  });
});

describe("hrefIngresos", () => {
  it("el período de fábrica no va en la URL", () => {
    expect(hrefIngresos()).toBe("/inventario/movimientos?vista=ingresos");
    expect(hrefIngresos({ periodo: "7" })).toBe("/inventario/movimientos?vista=ingresos");
    expect(hrefIngresos({ periodo: "30" })).toBe("/inventario/movimientos?vista=ingresos&p=30");
  });

  it("un rango a medida lleva sus fechas y no el período", () => {
    expect(hrefIngresos({ periodo: "30", desde: "2026-10-20", hasta: "2026-10-25" })).toBe("/inventario/movimientos?vista=ingresos&desde=2026-10-20&hasta=2026-10-25");
    expect(hrefIngresos({ desde: "2026-10-20" })).toBe("/inventario/movimientos?vista=ingresos&desde=2026-10-20");
  });

  it("una fecha inválida no entra a la URL", () => {
    expect(hrefIngresos({ desde: "mañana", hasta: "2026-10-25" })).toBe("/inventario/movimientos?vista=ingresos");
  });
});

describe("leerResumenIngresos", () => {
  const bueno = {
    desde: "2026-10-23",
    hasta: "2026-10-29",
    modelos: [
      { producto_id: "p1", referencia: "Blusa Emma", codigo: "BLU-0042", categoria: "Blusas", unidades: 24, de_stock_inicial: 15, de_recepcion: 9, primer_dia: "2026-10-24", ultimo_dia: "2026-10-26" },
      { producto_id: "p2", referencia: "Casaca Lola", codigo: null, categoria: null, unidades: 4, de_stock_inicial: 0, de_recepcion: 4, primer_dia: "2026-10-25", ultimo_dia: "2026-10-25" },
    ],
    totales: { modelos: 2, unidades: 28, de_stock_inicial: 15, de_recepcion: 13 },
  };

  it("lee la respuesta de la base", () => {
    const r = leerResumenIngresos(bueno);
    expect(r?.totales).toEqual({ modelos: 2, unidades: 28, deStockInicial: 15, deRecepcion: 13 });
    expect(r?.modelos[0]).toEqual({
      productoId: "p1",
      referencia: "Blusa Emma",
      codigo: "BLU-0042",
      categoria: "Blusas",
      unidades: 24,
      deStockInicial: 15,
      deRecepcion: 9,
      primerDia: "2026-10-24",
      ultimoDia: "2026-10-26",
    });
    expect(r?.modelos[1]).toMatchObject({ codigo: null, categoria: null });
  });

  it("una respuesta que no tiene la forma es `null`, nunca un 0", () => {
    expect(leerResumenIngresos(null)).toBeNull();
    expect(leerResumenIngresos("hola")).toBeNull();
    expect(leerResumenIngresos({})).toBeNull();
    expect(leerResumenIngresos({ ...bueno, modelos: "x" })).toBeNull();
    expect(leerResumenIngresos({ ...bueno, totales: undefined })).toBeNull();
    expect(leerResumenIngresos({ ...bueno, desde: undefined })).toBeNull();
  });

  it("un modelo sin id o sin nombre se descarta; los demás se leen", () => {
    const r = leerResumenIngresos({ ...bueno, modelos: [{ unidades: 3 }, { producto_id: "p9", referencia: "  " }, bueno.modelos[0], 7, null] });
    expect(r?.modelos.map((m) => m.productoId)).toEqual(["p1"]);
  });

  it("una cantidad que viene como texto numérico se lee como número", () => {
    const r = leerResumenIngresos({ ...bueno, modelos: [{ ...bueno.modelos[0], unidades: "24" }] });
    expect(r?.modelos[0].unidades).toBe(24);
  });
});

describe("conPreposicion", () => {
  it("cada forma del rango se lee bien detrás de «nada entró»", () => {
    expect(conPreposicion(rangoIngresos({}, HOY).texto)).toBe("en los últimos 7 días");
    expect(conPreposicion(rangoIngresos({ desde: "2026-10-03", hasta: "2026-10-20" }, HOY).texto)).toBe("del 3 de octubre al 20 de octubre");
    expect(conPreposicion(rangoIngresos({ desde: "2026-10-20", hasta: "2026-10-20" }, HOY).texto)).toBe("el 20 de octubre");
  });
});

describe("textos", () => {
  it("singular y plural", () => {
    expect(prendasTexto(1)).toBe("1 prenda");
    expect(prendasTexto(28)).toBe("28 prendas");
    expect(modelosTexto(1)).toBe("1 modelo");
    expect(modelosTexto(2)).toBe("2 modelos");
  });
});
