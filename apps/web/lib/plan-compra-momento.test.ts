import { describe, expect, it } from "vitest";
import { avisoSinPlan, formaDeLaTabla, pildoraVisible, proximaCampana, queTocaHoy, subtituloDelPlan } from "./plan-compra-momento";
import type { CampanaPlan, EstadoCampana, EtiquetaCampana, FiltroPlan } from "./plan-compra-reglas";

const ESTADOS: EstadoCampana[] = ["antes", "durante", "despues"];

const campana = (id: string, desde: string, extra: Partial<CampanaPlan> = {}): CampanaPlan => ({
  id,
  nombre: `Campaña ${id}`,
  desde,
  hasta: desde,
  etiquetaId: null,
  conPlan: 0,
  archivado: false,
  conTope: false,
  ...extra,
});

describe("formaDeLaTabla", () => {
  it("con 0 planes no dibuja Comprar, Inversión ni la leyenda de la barra, en ningún momento", () => {
    for (const e of ESTADOS) expect(formaDeLaTabla(e, 0)).toMatchObject({ compra: false, leyenda: false });
  });
  it("con algún plan dibuja Comprar, Inversión, la barra y su leyenda, en todo momento", () => {
    for (const e of ESTADOS) expect(formaDeLaTabla(e, 3)).toMatchObject({ venta: true, compra: true, leyenda: true });
  });
  it("antes de la campaña, la columna de la venta esperada lleva «Armar plan» aunque nadie tenga plan", () => {
    expect(formaDeLaTabla("antes", 0).venta).toBe(true);
  });
  it("ya empezada o terminada sin plan, no hay venta esperada que mostrar", () => {
    expect(formaDeLaTabla("durante", 0).venta).toBe(false);
    expect(formaDeLaTabla("despues", 0).venta).toBe(false);
  });
  it("lo vendido de verdad sale desde que empieza, haya plan o no", () => {
    for (const n of [0, 2]) {
      expect(formaDeLaTabla("antes", n).real).toBe(false);
      expect(formaDeLaTabla("durante", n).real).toBe(true);
      expect(formaDeLaTabla("despues", n).real).toBe(true);
    }
  });
  it("solo existen las cuatro formas que FilaCategoria sabe dibujar", () => {
    const formas = new Set(ESTADOS.flatMap((e) => [0, 1].map((n) => JSON.stringify(formaDeLaTabla(e, n)))));
    expect(formas.size).toBe(4);
  });
});

describe("proximaCampana", () => {
  const hoy = "2026-10-13";
  const etiqueta = (id: string, desde: string, hasta: string, extra: Partial<EtiquetaCampana> = {}): EtiquetaCampana => ({
    id,
    nombre: `Etiqueta ${id}`,
    desde,
    hasta,
    planId: null,
    planes: [],
    ...extra,
  });
  const sinCalendario = (planes: CampanaPlan[]) => ({ planes, etiquetas: [] as EtiquetaCampana[] });

  it("elige el primer plan que todavía no empieza y lleva a él", () => {
    const p = proximaCampana(sinCalendario([campana("navidad", "2026-12-11"), campana("halloween", "2026-10-17"), campana("diciembre", "2025-12-01")]), hoy, "x");
    expect(p).toEqual({ nombre: "Campaña halloween", dias: 4, destino: { tipo: "plan", id: "halloween" } });
  });
  it("no cuenta la que se está mirando, las archivadas ni las que ya empezaron hoy", () => {
    const planes = [campana("actual", "2026-10-20"), campana("archivada", "2026-10-15", { archivado: true }), campana("hoy", hoy), campana("sigue", "2026-11-01")];
    expect(proximaCampana(sinCalendario(planes), hoy, "actual")?.destino).toEqual({ tipo: "plan", id: "sigue" });
  });
  it("una campaña del calendario sin plan que viene antes gana, y se arma desde su hoja", () => {
    const p = proximaCampana({ planes: [campana("navidad", "2026-12-11")], etiquetas: [etiqueta("halloween", "2026-10-17", "2026-10-31")] }, hoy, "x");
    expect(p?.dias).toBe(4);
    expect(p?.destino.tipo).toBe("calendario");
    expect(p?.destino.tipo === "calendario" && p.destino.ranura.etiquetaId).toBe("halloween");
  });
  it("una del calendario que ya empezó no es «la próxima»", () => {
    expect(proximaCampana({ planes: [], etiquetas: [etiqueta("aniv", "2026-10-01", "2026-10-21")] }, hoy, "x")?.dias).toBeGreaterThan(300);
  });
  it("sin campañas por venir, no hay próxima", () => {
    expect(proximaCampana(sinCalendario([campana("vieja", "2025-12-01")]), hoy, "x")).toBeNull();
    expect(proximaCampana(sinCalendario([]), hoy, "x")).toBeNull();
  });
});

describe("queTocaHoy", () => {
  const proxima = { nombre: "Halloween", dias: 4, destino: { tipo: "plan" as const, id: "h" } };
  it("antes de la campaña siempre toca llenar, con o sin planes", () => {
    expect(queTocaHoy("antes", 0, proxima)).toEqual({ tipo: "llenar" });
    expect(queTocaHoy("antes", 5, proxima)).toEqual({ tipo: "llenar" });
  });
  it("empezada o terminada sin plan: ver cómo va y la próxima", () => {
    expect(queTocaHoy("durante", 0, proxima)).toEqual({ tipo: "sin-plan", estado: "durante", proxima });
    expect(queTocaHoy("despues", 0, null)).toEqual({ tipo: "sin-plan", estado: "despues", proxima: null });
  });
  it("empezada o terminada con plan: la tabla ya compara", () => {
    expect(queTocaHoy("durante", 1, proxima)).toEqual({ tipo: "mirar" });
    expect(queTocaHoy("despues", 1, null)).toEqual({ tipo: "mirar" });
  });
});

describe("subtituloDelPlan", () => {
  it("nunca repite las fechas (ya están en el selector y en el chip)", () => {
    for (const e of ESTADOS) for (const n of [0, 2]) expect(subtituloDelPlan(e, n, "Aniversario")).not.toMatch(/\d/);
  });
  it("sin plan no dice «lo que planificaste»", () => {
    for (const e of ESTADOS) expect(subtituloDelPlan(e, 0, "Aniversario")).not.toMatch(/planificaste/);
  });
  it("nombra la campaña en todos los casos", () => {
    for (const e of ESTADOS) for (const n of [0, 2]) expect(subtituloDelPlan(e, n, "Aniversario")).toContain("Aniversario");
  });
});

describe("avisoSinPlan", () => {
  it("durante: lleva a ver cómo va", () => {
    const a = avisoSinPlan({ tipo: "sin-plan", estado: "durante", proxima: null });
    expect(a.verResultados).toBe("Ver cómo va");
    expect(a.texto).toMatch(/reponer o impulsar/);
    expect(a.texto).not.toMatch(/próxima/);
  });
  it("con próxima, dice cuándo empieza en palabras", () => {
    expect(avisoSinPlan({ tipo: "sin-plan", estado: "durante", proxima: { nombre: "Halloween", dias: 4, destino: { tipo: "plan", id: "h" } } }).texto).toContain("Halloween, empieza en 4 días");
    expect(avisoSinPlan({ tipo: "sin-plan", estado: "despues", proxima: { nombre: "Halloween", dias: 1, destino: { tipo: "plan", id: "h" } } }).texto).toContain("empieza mañana");
  });
  it("terminada: no invita a planificarla (ya pasó)", () => {
    const a = avisoSinPlan({ tipo: "sin-plan", estado: "despues", proxima: null });
    expect(a.titulo).toMatch(/terminó/);
    expect(a.texto).not.toMatch(/reponer/);
  });
});

describe("pildoraVisible", () => {
  const CLAVES: FiltroPlan[] = ["todas", "sin", "con", "top", "agotadas"];
  const sinPlanes = { todas: 42, sin: 42, con: 0, top: 5, agotadas: 0 };
  it("con 0 planes quedan «Todas» y las que recortan sin vaciar", () => {
    expect(CLAVES.filter((c) => pildoraVisible(c, sinPlanes, "todas"))).toEqual(["todas", "top"]);
  });
  it("la píldora puesta no se esconde aunque ya no recorte", () => {
    expect(pildoraVisible("con", sinPlanes, "con")).toBe(true);
  });
  it("con planes a medias, «Sin plan» y «Con plan» vuelven", () => {
    const aMedias = { todas: 42, sin: 30, con: 12, top: 5, agotadas: 2 };
    expect(CLAVES.every((c) => pildoraVisible(c, aMedias, "todas"))).toBe(true);
  });
  it("con todo planificado, «Con plan» filtra lo mismo que «Todas» y se esconde", () => {
    expect(pildoraVisible("con", { todas: 10, sin: 0, con: 10, top: 5, agotadas: 0 }, "todas")).toBe(false);
  });
});
