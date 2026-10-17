import { describe, expect, it } from "vitest";
import {
  CAMPANA_MAX_DIAS,
  cuentaHorizonte,
  despuesDeLaMeta,
  hastaLaMeta,
  horizonteDeCampana,
  horizonteDeRespaldo,
  metaDeTipo,
  notaDelRitmo,
  pideloAntes,
  plazoDeTipo,
  PLAZO_TALLER_DIAS,
  PLAZO_TERCEROS_DIAS,
  rotuloDelEje,
  semanasHasta,
  textoPidelo,
  textoPlazo,
  tiempoHasta,
  tipPidelo,
} from "./analisis-horizonte";

const HOY = "2026-10-17";

describe("plazo de un pedido (D4): 14 días si todos son del Taller, 30 si no", () => {
  it("todos del Taller: 14; uno de terceros o uno sin saber: 30 (lo conservador); sin modelos: 30", () => {
    expect(plazoDeTipo(["taller", "taller"])).toEqual({ dias: PLAZO_TALLER_DIAS, origen: "taller" });
    expect(plazoDeTipo(["taller", "terceros"])).toEqual({ dias: PLAZO_TERCEROS_DIAS, origen: "terceros" });
    expect(plazoDeTipo(["taller", null])).toEqual({ dias: PLAZO_TERCEROS_DIAS, origen: "terceros" });
    expect(plazoDeTipo([])).toEqual({ dias: PLAZO_TERCEROS_DIAS, origen: "terceros" });
  });

  it("el plazo es un supuesto y se dice", () => {
    expect(textoPlazo({ dias: 30, origen: "terceros" })).toBe("suponiendo 30 días");
    expect(textoPlazo({ dias: 14, origen: "taller" })).toBe("suponiendo 14 días, del Taller");
  });
});

describe("la meta de cada tipo", () => {
  it("con una campaña o el 25-dic, la misma para todos; en «plazo», el plazo propio del tipo más un mes", () => {
    expect(metaDeTipo({ modo: "campana", dias: 75 }, { dias: 14, origen: "taller" })).toBe(75);
    expect(metaDeTipo({ modo: "navidad", dias: 69 }, { dias: 30, origen: "terceros" })).toBe(69);
    expect(metaDeTipo({ modo: "plazo", dias: 60 }, { dias: 14, origen: "taller" })).toBe(44);
    expect(metaDeTipo({ modo: "plazo", dias: 60 }, { dias: 30, origen: "terceros" })).toBe(60);
  });
});

describe("una sola cifra para «cuánto falta»", () => {
  it("la tarjeta de arriba y el eje usan la misma cuenta de semanas (antes decían 9 y 10)", () => {
    // 69 días: 9,86 semanas → 10 en los dos lugares.
    const h = { modo: "navidad" as const, dias: 69, fecha: "2026-12-25", nombre: "Navidad" };
    expect(cuentaHorizonte(h).valor).toBe(10);
    expect(rotuloDelEje(h)).toBe("Navidad · 10 semanas");
    expect(semanasHasta(69)).toBe(10);
  });

  it("en la última semana, días; nunca «0 semanas»", () => {
    expect(tiempoHasta(5)).toBe("5 días");
    expect(tiempoHasta(1)).toBe("1 día");
    expect(tiempoHasta(7)).toBe("1 semana");
    expect(semanasHasta(2)).toBe(1);
  });

  it("dice a qué meta se llega y qué queda fuera, con palabras de tienda", () => {
    const c = horizonteDeCampana(HOY, { nombre: "Diciembre 2026", hasta: "2026-12-31" });
    expect(c).toMatchObject({ modo: "campana", dias: 75, nota: null });
    expect(cuentaHorizonte(c)).toEqual({ valor: 11, texto: "semanas para terminar Diciembre 2026" });
    expect(hastaLaMeta(c)).toBe("hasta el 31 dic.");
    expect(despuesDeLaMeta(c)).toBe("después del 31 dic.");
    expect(rotuloDelEje(c)).toBe("31 dic. · 11 semanas");
  });
});

describe("el respaldo cuando no hay una campaña del Plan que sirva (D3)", () => {
  it("sin módulo, con fallo o sin campañas: el 25-dic mientras falte, y lo dice", () => {
    for (const motivo of ["sin_modulo", "fallo", "sin_campanas"] as const) {
      const h = horizonteDeRespaldo(HOY, motivo);
      expect(h).toMatchObject({ modo: "navidad", fecha: "2026-12-25", dias: 69, nombre: "Navidad" });
      expect(h.nota).toMatch(/se mide hasta Navidad/);
    }
    expect(horizonteDeRespaldo(HOY, "sin_modulo").nota).toMatch(/no ve el Plan/);
    expect(horizonteDeRespaldo(HOY, "fallo").nota).toMatch(/No se pudo leer/);
  });

  it("pasado el 25-dic no hay «próximo 25-dic»: plazo + 1 mes, no 364 días", () => {
    const h = horizonteDeRespaldo("2026-12-26", "sin_campanas");
    expect(h).toMatchObject({ modo: "plazo", dias: PLAZO_TERCEROS_DIAS + 30, nombre: "Plazo + 1 mes" });
    expect(h.nota).toMatch(/Navidad ya pasó/);
    expect(cuentaHorizonte(h)).toEqual({ valor: 9, texto: "semanas: un pedido y un mes de venta" });
    expect(hastaLaMeta(h)).toBe("hasta un mes después de que llegue un pedido");
    expect(despuesDeLaMeta(h)).toBe("más de un mes después de que llegue un pedido");
    expect(rotuloDelEje(h)).toBe("Plazo + 1 mes · 9 semanas");
  });

  it("el 25-dic cuenta hasta 120 días; más lejos es un año de espera, no una meta de compra", () => {
    expect(horizonteDeRespaldo("2026-08-27", "sin_campanas").modo).toBe("navidad");
    expect(horizonteDeRespaldo("2026-08-25", "sin_campanas")).toMatchObject({ modo: "plazo", dias: 60 });
    expect(CAMPANA_MAX_DIAS).toBe(120);
  });

  it("una campaña que SÍ existe pero está lejos manda plazo + 1 mes (no el 25-dic) y dice cuál era", () => {
    const h = horizonteDeRespaldo(HOY, { lejos: { nombre: "Día de la Madre", dias: 200 } });
    expect(h).toMatchObject({ modo: "plazo", dias: 60 });
    expect(h.nota).toBe("La próxima campaña del Plan (Día de la Madre) está a 200 días: se mide a lo que tarda un pedido más un mes.");
  });
});

describe("«pídelo antes del X» (D4): hoy + lo que te alcanza − lo que tarda el pedido", () => {
  it("casos en el límite del plazo: sobra 1 día, justo, falta 1 día", () => {
    expect(pideloAntes(31, 30, HOY)).toEqual({ fecha: "2026-10-18", ya: false });
    expect(pideloAntes(30, 30, HOY)).toEqual({ fecha: HOY, ya: true });
    expect(pideloAntes(29, 30, HOY)).toEqual({ fecha: HOY, ya: true });
  });

  it("con decimales, se queda del lado seguro (redondea para abajo)", () => {
    expect(pideloAntes(40.9, 30, HOY)).toEqual({ fecha: "2026-10-27", ya: false });
  });

  it("sin ritmo (no se vendió) no hay fecha que dar", () => {
    expect(pideloAntes(null, 30, HOY)).toBeNull();
    expect(pideloAntes(Number.NaN, 30, HOY)).toBeNull();
  });

  it("se dice como se habla en tienda y explica de dónde sale", () => {
    expect(textoPidelo({ fecha: HOY, ya: true })).toBe("pídelo ya");
    expect(textoPidelo({ fecha: "2026-11-12", ya: false })).toBe("pídelo antes del 12 nov.");
    expect(tipPidelo({ fecha: "2026-11-12", ya: false }, { dias: 30, origen: "terceros" })).toContain("unos 30 días");
    expect(tipPidelo({ fecha: HOY, ya: true }, { dias: 14, origen: "taller" })).toContain("piso vacío");
  });
});

describe("el ritmo que salió de una campaña (f)", () => {
  it("avisa que fue ritmo de campaña y que puede bajar", () => {
    expect(notaDelRitmo({ nombre: "Aniversario CAYLA 2026", desde: "2026-10-01", hasta: "2026-10-21", dias: 16, de: 17 }, HOY)).toBe(
      "Ojo: 16 de los últimos 17 días cayeron en Aniversario CAYLA 2026 (hasta el 21 oct.): fue ritmo de campaña y puede bajar al terminar.",
    );
  });

  it("si la campaña ya terminó, lo dice en pasado; si toda la ventana cayó dentro, «los N días»", () => {
    expect(notaDelRitmo({ nombre: "Aniversario", desde: "2026-10-01", hasta: "2026-10-10", dias: 10, de: 10 }, HOY)).toBe(
      "Ojo: los 10 días cayeron en Aniversario (terminó el 10 oct.): fue ritmo de campaña, no de un día normal.",
    );
  });
});
