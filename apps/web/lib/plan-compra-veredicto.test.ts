import { describe, expect, it } from "vitest";
import { leerCalendario } from "./plan-compra-calendario";
import { evidenciaDeCampana, resumenDeAnios, type EvidenciaDeCampana } from "./plan-compra-calendario-evidencia";
import { claveDeLaCampanaDelPlan } from "./plan-compra-calendario-vista";
import { frasesDelVeredicto, historiaDelPlan, UMBRAL_DE_COMPARACION, veredictoAlCerrar, type VeredictoMedido } from "./plan-compra-veredicto";
import { sumarDias, type LecturaHistorial, type TiendaHistorial } from "./plan-compra-historial";
import { conCalendario, leerCampanas } from "./plan-compra-reglas";

/** Una evidencia armada a mano: cada año con su multiplicador. */
const ev = (...xs: [number, number][]): EvidenciaDeCampana => {
  const porAnio = xs.map(([anio, multiplicador]) => ({ anio, multiplicador }));
  const r = resumenDeAnios(porAnio)!;
  const menor = porAnio.reduce((a, x) => (x.multiplicador < a.multiplicador ? x : a));
  const mayor = porAnio.reduce((a, x) => (x.multiplicador > a.multiplicador ? x : a));
  return { mediana: r.mediana, min: r.min, max: r.max, anioDelMin: menor.anio, anioDelMax: mayor.anio, porAnio };
};
const medido = (v: ReturnType<typeof veredictoAlCerrar>): VeredictoMedido => {
  if (v.estado !== "medida") throw new Error("se esperaba un veredicto medido");
  return v;
};

describe("la mediana, el menor y el mayor de un grupo de años", () => {
  it("con un año par o impar de años", () => {
    expect(resumenDeAnios([{ multiplicador: 2 }, { multiplicador: 1 }, { multiplicador: 3 }])).toEqual({ mediana: 2, min: 1, max: 3 });
    expect(resumenDeAnios([{ multiplicador: 1 }, { multiplicador: 3 }])).toEqual({ mediana: 2, min: 1, max: 3 });
  });
  it("sin años no hay nada que resumir", () => {
    expect(resumenDeAnios([])).toBeNull();
  });
});

describe("el veredicto al cerrar una campaña", () => {
  it("sin historia, o sin ESTE año medido, no hay veredicto (nunca un número inventado)", () => {
    expect(veredictoAlCerrar(null, 2026)).toEqual({ estado: "sin-medida" });
    expect(veredictoAlCerrar(ev([2024, 1.4], [2025, 1.5]), 2026)).toEqual({ estado: "sin-medida" });
  });

  it("este año es una fila de la historia y los otros años son las demás", () => {
    const v = medido(veredictoAlCerrar(ev([2023, 1.2], [2024, 1.4], [2025, 1.6], [2026, 2.4]), 2026));
    expect(v.anio).toBe(2026);
    expect(v.esteAnio).toBe(2.4);
    expect(v.otros).toEqual({ mediana: 1.4, min: 1.2, max: 1.6, anios: 3 });
  });

  it("con las palabras del Calendario: lo dice el número de ESTE año, no la mediana de los demás", () => {
    expect(medido(veredictoAlCerrar(ev([2025, 1.0], [2026, 2.1]), 2026)).veredicto).toEqual({ texto: "Pico claro", tono: "verde" });
    expect(medido(veredictoAlCerrar(ev([2025, 2.0], [2026, 1.2]), 2026)).veredicto).toEqual({ texto: "Sube un poco", tono: "verde" });
    expect(medido(veredictoAlCerrar(ev([2025, 2.0], [2026, 1.0]), 2026)).veredicto).toEqual({ texto: "No se nota", tono: "neutro" });
    expect(medido(veredictoAlCerrar(ev([2025, 2.0], [2026, 0.8]), 2026)).veredicto).toEqual({ texto: "No sube", tono: "ambar" });
  });

  it("la primera vez que se puede medir no tiene con qué compararse", () => {
    const v = medido(veredictoAlCerrar(ev([2026, 1.8]), 2026));
    expect(v.otros).toBeNull();
    expect(v.comparacion).toBeNull();
  });

  it("más, lo de siempre o menos: contra la MEDIANA de los otros, con una franja de 15 %", () => {
    const otros: [number, number][] = [[2023, 1.9], [2024, 2.0], [2025, 2.1]];
    expect(UMBRAL_DE_COMPARACION).toBe(0.15);
    expect(medido(veredictoAlCerrar(ev(...otros, [2026, 2.3]), 2026)).comparacion).toBe("mas"); // 2,3 = 2,0 × 1,15
    expect(medido(veredictoAlCerrar(ev(...otros, [2026, 2.29]), 2026)).comparacion).toBe("igual");
    expect(medido(veredictoAlCerrar(ev(...otros, [2026, 1.71]), 2026)).comparacion).toBe("igual");
    expect(medido(veredictoAlCerrar(ev(...otros, [2026, 1.7]), 2026)).comparacion).toBe("menos"); // 1,7 = 2,0 × 0,85
  });

  it("un año raro entre los otros no arrastra la cuenta (por eso la mediana y no el promedio)", () => {
    // Los otros: 1,9 · 2,0 · 2,1 · 0,1 (un año con las tiendas cerradas). La mediana sigue en 1,95 y este año 2,0 es «lo de siempre».
    const v = medido(veredictoAlCerrar(ev([2020, 0.1], [2023, 1.9], [2024, 2.0], [2025, 2.1], [2026, 2.0]), 2026));
    expect(v.otros!.mediana).toBeCloseTo(1.95, 9);
    expect(v.comparacion).toBe("igual");
  });

  it("mide con la misma cuenta del Historial: una historia armada a mano da el multiplicador esperado", () => {
    const TRU: TiendaHistorial = { id: "tru", nombre: "Tienda TRU", erpDesde: "2026-09-30", historiaDesde: "2022-01-01" };
    const hoy = "2026-10-26";
    const dias = new Map<string, number>();
    for (let f = "2022-01-01"; f < hoy; f = sumarDias(f, 1)) dias.set(f, 100);
    // La campaña (11 al 25 de diciembre) vende el doble en 2023, 2024 y 2025.
    for (const anio of [2023, 2024, 2025]) for (let f = `${anio}-12-11`; f <= `${anio}-12-25`; f = sumarDias(f, 1)) dias.set(f, 200);
    const l: Pick<LecturaHistorial, "hoy" | "dias"> = { hoy, dias: new Map([["tru", dias]]) };
    const e = evidenciaDeCampana(l, TRU, (a) => ({ desde: `${a}-12-11`, hasta: `${a}-12-25` }), [2022, 2023, 2024, 2025, 2026])!;
    expect(e.porAnio.map((x) => x.anio)).toEqual([2022, 2023, 2024, 2025]); // 2026 todavía no terminó: no se mide
    const v = medido(veredictoAlCerrar(e, 2025));
    expect(v.esteAnio).toBeCloseTo(2, 9);
    // Los otros años: 2022 (×1, sin campaña ese año), 2023 y 2024 (×2): la mediana es ×2 y este año, ×2, es «lo de siempre».
    expect(v.otros?.anios).toBe(3);
    expect(v.otros?.mediana).toBeCloseTo(2, 9);
    expect(v.comparacion).toBe("igual");
  });
});

describe("lo que se le dice a quien lo lee", () => {
  const dado = (porAnio: [number, number][], anio: number) => medido(veredictoAlCerrar(ev(...porAnio), anio));

  it("la primera vez que se mide lo dice, y no compara con nada", () => {
    const f = frasesDelVeredicto(dado([[2026, 1.8]], 2026), "Aniversario CAYLA 2026");
    expect(f.principal).toBe("Aniversario CAYLA 2026 vendió ×1.8 un día normal.");
    expect(f.comparada).toBe("Es la primera vez que se puede medir: todavía no hay con qué compararla.");
    expect(f.aviso).toBeNull();
  });

  it("con varios años dice la mediana, el menor y el mayor, y qué tal rindió esta vez", () => {
    const f = frasesDelVeredicto(dado([[2022, 1.2], [2023, 1.5], [2024, 1.4], [2025, 1.6], [2026, 2.4]], 2026), "Navidad 2026");
    expect(f.principal).toBe("Navidad 2026 vendió ×2.4 un día normal.");
    expect(f.comparada).toBe("En los otros 4 años subió ×1.5 de mediana (entre ×1.2 y ×1.6). Esta vez rindió más que de costumbre.");
    expect(f.aviso).toBeNull();
  });

  it("menos o lo de siempre", () => {
    expect(frasesDelVeredicto(dado([[2023, 2.0], [2024, 2.0], [2025, 2.0], [2026, 1.2]], 2026), "X").comparada).toContain("Esta vez rindió menos que de costumbre.");
    expect(frasesDelVeredicto(dado([[2023, 2.0], [2024, 2.0], [2025, 2.0], [2026, 2.1]], 2026), "X").comparada).toContain("Esta vez rindió lo de siempre.");
  });

  it("con un solo año para comparar no pone un «entre» de un solo número, y avisa que es poco", () => {
    const f = frasesDelVeredicto(dado([[2025, 1.9], [2026, 2.0]], 2026), "X");
    expect(f.comparada).toBe("En el otro año que se pudo medir subió ×1.9. Esta vez rindió lo de siempre.");
    expect(f.aviso).toBe("Con tan pocos años para comparar, tómalo con calma.");
  });

  it("con tres años o más no avisa", () => {
    expect(frasesDelVeredicto(dado([[2023, 1.9], [2024, 1.9], [2025, 1.9], [2026, 1.9]], 2026), "X").aviso).toBeNull();
    expect(frasesDelVeredicto(dado([[2024, 1.9], [2025, 1.9], [2026, 1.9]], 2026), "X").aviso).toBe("Con tan pocos años para comparar, tómalo con calma.");
  });

  it("un año de tiendas casi cerradas dice la verdad con dos decimales (no «×0.0»)", () => {
    const f = frasesDelVeredicto(dado([[2020, 0.04], [2021, 1.5], [2022, 1.6], [2023, 1.7], [2026, 1.6]], 2026), "X");
    expect(f.comparada).toContain("entre ×0.04 y ×1.7");
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// De qué campaña es un plan
// ---------------------------------------------------------------------------------------------------------------------

const HOY = "2026-10-26";
const plan = (id: string, nombre: string, desde: string, hasta: string, etiqueta_id: string | null) => ({ id, nombre, desde, hasta, etiqueta_id, con_plan: 3, archivado: false, con_tope: false });
const campanas = (planes: unknown[], etiquetas: unknown[], filas: unknown[] = []) =>
  conCalendario(leerCampanas({ planes, etiquetas }), leerCalendario({ soportado: true, hoy: HOY, filas }))!;
const propia = {
  id: "pp",
  etiqueta_id: null,
  nombre: "Día del Padre",
  desde_md: "06-07",
  hasta_md: "06-21",
  uso: "activa",
  pausa_hasta: null,
  repite: "anual",
  anio_unico: null,
  quitada: false,
  planes: [{ id: "pdp", nombre: "Día del Padre 2027", anio: 2027, archivado: false }],
  por: "Felipe",
};
const lectura = (evidencias: Record<string, EvidenciaDeCampana | null>, historiaFallo = false) => ({ evidencias, tienda: { id: "tru", nombre: "Tienda TRU" }, historiaFallo });

describe("de qué campaña es un plan", () => {
  const nav = { id: "nav", nombre: "Navidad", desde: "2026-12-11", hasta: "2026-12-25", plan_id: "pn", planes: [{ id: "pn", anio: 2026 }] };

  it("el plan de una campaña de Insignias es de su insignia", () => {
    const c = campanas([plan("pn", "Navidad 2026", "2026-12-11", "2026-12-25", "nav")], [nav]);
    expect(claveDeLaCampanaDelPlan(c, "pn")).toBe("e:nav");
  });
  it("el plan de una campaña propia es de su fila del calendario", () => {
    const c = campanas([plan("pdp", "Día del Padre 2027", "2027-06-07", "2027-06-21", null)], [], [propia]);
    expect(claveDeLaCampanaDelPlan(c, "pdp")).toBe("p:pp");
  });
  it("un plan sin campaña (uno viejo) o un plan que no existe no es de ninguna", () => {
    const c = campanas([plan("viejo", "Diciembre 2025", "2025-12-01", "2025-12-31", null)], [], [propia]);
    expect(claveDeLaCampanaDelPlan(c, "viejo")).toBeNull();
    expect(claveDeLaCampanaDelPlan(c, "no-existe")).toBeNull();
    expect(historiaDelPlan(c, "viejo", lectura({}))).toBeNull();
  });
});

describe("la historia de la campaña de un plan", () => {
  const nav = { id: "nav", nombre: "Navidad", desde: "2026-12-11", hasta: "2026-12-25", plan_id: "pn", planes: [{ id: "pn", anio: 2026 }] };

  it("trae su evidencia, el año en que termina, las fechas con que se midió y con qué tienda", () => {
    const c = campanas([plan("pn", "Navidad 2026", "2026-12-11", "2026-12-25", "nav")], [nav]);
    const e = ev([2025, 1.8]);
    expect(historiaDelPlan(c, "pn", lectura({ "e:nav": e }))).toEqual({ clave: "e:nav", anio: 2026, fechas: { desde: "2026-12-11", hasta: "2026-12-25" }, evidencia: e, tienda: { id: "tru", nombre: "Tienda TRU" }, fallo: false });
  });

  it("una campaña sin evidencia es «sin historia propia»; una lectura que falló lo dice aparte", () => {
    const c = campanas([plan("pn", "Navidad 2026", "2026-12-11", "2026-12-25", "nav")], [nav]);
    expect(historiaDelPlan(c, "pn", lectura({ "e:nav": null }))!.evidencia).toBeNull();
    expect(historiaDelPlan(c, "pn", lectura({ "e:nav": null }))!.fallo).toBe(false);
    expect(historiaDelPlan(c, "pn", lectura({}, true))!.fallo).toBe(true);
  });

  it("una campaña que cruza el año se mide en el año de la que se toca con el plan (no la Navidad pasada)", () => {
    // La insignia va del 1 de diciembre al 6 de enero; el plan acomodó su ventana al 11–25 de diciembre de 2026. La campaña de «2026» (que TERMINA el 6 de enero de 2026) no
    // toca esa ventana: la de «2027» (1 dic 2026 – 6 ene 2027) sí.
    const cruza = { id: "nav", nombre: "Navidad", desde: "2026-12-01", hasta: "2027-01-06", plan_id: "pn", planes: [{ id: "pn", anio: 2026 }] };
    const c = campanas([plan("pn", "Navidad 2026", "2026-12-11", "2026-12-25", "nav")], [cruza]);
    const h = historiaDelPlan(c, "pn", lectura({ "e:nav": ev([2025, 1.8]) }))!;
    expect(h.anio).toBe(2027);
    expect(h.fechas).toEqual({ desde: "2026-12-01", hasta: "2027-01-06" });
  });

  it("el plan de una campaña propia se mide con las fechas del calendario", () => {
    const c = campanas([plan("pdp", "Día del Padre 2027", "2027-06-07", "2027-06-21", null)], [], [propia]);
    const h = historiaDelPlan(c, "pdp", lectura({ "p:pp": ev([2026, 1.3]) }))!;
    expect(h.clave).toBe("p:pp");
    expect(h.anio).toBe(2027);
    expect(h.fechas).toEqual({ desde: "2027-06-07", hasta: "2027-06-21" });
  });
});
