import { describe, expect, it } from "vitest";
import { estadosDe, sePuedeConfirmar } from "./guia-campos";
import { camposDeConfig } from "./club-puntos-config-guia";
import {
  borradorDeConfig,
  cambioDelHistorial,
  cambiosDeConfig,
  configDelBorrador,
  configEnPalabras,
  fechaCorta,
  leerResumenDeBeneficios,
  lecturaDelRetorno,
  problemasDeConfig,
  retornoPct,
  sumarDias,
  vigenciaDelCambio,
  type ConfigDelClub,
} from "./club-puntos-config-reglas";

// La configuración de arranque decidida el 2026-10-19: 1 punto por S/ 1, 100 puntos = S/ 5, canje desde 200, cupón desde 3× su valor,
// 7 días, 100 puntos de cumpleaños y tope de costo del 2 %.
const ARRANQUE: ConfigDelClub = { puntosPorSol: 1, solesPor100: 5, canjeMinimo: 200, compraMinimaX: 3, vigenciaDias: 7, regaloCumple: 100, topeCostoPct: 2 };
const VERSION = { desde: "2026-01-01", puntos_por_sol: "1.00", soles_por_100: "5.00", canje_minimo: 200, compra_minima_x: "3.00", vigencia_dias: 7, regalo_cumple: 100, tope_costo_pct: "2.00" };
const RESUMEN = {
  vigente: VERSION,
  programada: null,
  cifras: { puntos_en_circulacion: 184300, miembros_con_puntos: 412, deuda_soles: 9215, cupones_vivos: 12, cupones_vivos_soles: 140, canjeado_mes_cupones: 61, canjeado_mes_soles: 1340, repartido_mes_puntos: 22000 },
  historial: [{ cuando: "2026-10-19T15:00:00Z", desde: "2026-11-03", quien: "Felipe Pereyra", antes: { soles_por_100: 5 }, despues: { soles_por_100: 4 } }],
};

describe("leerResumenDeBeneficios", () => {
  it("lee los números aunque lleguen como texto (numeric) y deja los cambios con su quién", () => {
    const r = leerResumenDeBeneficios(RESUMEN)!;
    expect(r.vigente).toEqual({ ...ARRANQUE, desde: "2026-01-01" });
    expect(r.programada).toBeNull();
    expect(r.cifras.deudaSoles).toBe(9215);
    expect(r.historial).toEqual([{ cuando: "2026-10-19T15:00:00Z", desde: "2026-11-03", quien: "Felipe Pereyra", antes: { solesPor100: 5 }, despues: { solesPor100: 4 } }]);
  });

  it("una versión programada se lee igual que la vigente", () => {
    const r = leerResumenDeBeneficios({ ...RESUMEN, programada: { ...VERSION, desde: "2026-11-03", soles_por_100: "4.00" } })!;
    expect(r.programada).toMatchObject({ solesPor100: 4, desde: "2026-11-03" });
  });

  it("sin la configuración o sin una cifra, no inventa: null (no se abre un formulario con valores falsos)", () => {
    expect(leerResumenDeBeneficios(null)).toBeNull();
    expect(leerResumenDeBeneficios({ ...RESUMEN, vigente: { ...VERSION, canje_minimo: null } })).toBeNull();
    expect(leerResumenDeBeneficios({ ...RESUMEN, cifras: { ...RESUMEN.cifras, deuda_soles: undefined } })).toBeNull();
    expect(leerResumenDeBeneficios({ ...RESUMEN, cifras: null })).toBeNull();
  });

  it("un cambio raro del historial se deja fuera, no tumba lo demás", () => {
    const r = leerResumenDeBeneficios({ ...RESUMEN, historial: [null, { sin: "cuando" }, ...RESUMEN.historial] })!;
    expect(r.historial).toHaveLength(1);
  });
});

describe("problemasDeConfig: la regla del formulario", () => {
  const bien = borradorDeConfig(ARRANQUE);

  it("lo vigente no tiene problemas y se guarda tal cual", () => {
    expect(Object.values(problemasDeConfig(bien)).every((p) => p === null)).toBe(true);
    expect(configDelBorrador(bien)).toEqual(ARRANQUE);
  });

  it("acepta coma decimal", () => {
    expect(configDelBorrador({ ...bien, solesPor100: "4,5" })?.solesPor100).toBe(4.5);
  });

  it("cada campo dice qué tiene mal, con los límites de la base", () => {
    expect(problemasDeConfig({ ...bien, puntosPorSol: "0" }).puntosPorSol).toMatch(/0.01 a 100/);
    expect(problemasDeConfig({ ...bien, puntosPorSol: "101" }).puntosPorSol).toMatch(/0.01 a 100/);
    expect(problemasDeConfig({ ...bien, solesPor100: "1001" }).solesPor100).toMatch(/1 000/);
    expect(problemasDeConfig({ ...bien, solesPor100: "5.555" }).solesPor100).toMatch(/2 decimales/);
    expect(problemasDeConfig({ ...bien, canjeMinimo: "150" }).canjeMinimo).toMatch(/de 100 en 100/);
    expect(problemasDeConfig({ ...bien, canjeMinimo: "0" }).canjeMinimo).toMatch(/de 100 en 100/);
    expect(problemasDeConfig({ ...bien, compraMinimaX: "0.5" }).compraMinimaX).toMatch(/1 a 20/);
    expect(problemasDeConfig({ ...bien, compraMinimaX: "21" }).compraMinimaX).toMatch(/1 a 20/);
    expect(problemasDeConfig({ ...bien, vigenciaDias: "0" }).vigenciaDias).toMatch(/1 a 90/);
    expect(problemasDeConfig({ ...bien, vigenciaDias: "91" }).vigenciaDias).toMatch(/1 a 90/);
    expect(problemasDeConfig({ ...bien, regaloCumple: "10001" }).regaloCumple).toMatch(/0 a 10 000/);
    expect(problemasDeConfig({ ...bien, regaloCumple: "-1" }).regaloCumple).toMatch(/0 a 10 000/);
    expect(problemasDeConfig({ ...bien, topeCostoPct: "101" }).topeCostoPct).toMatch(/0 a 100/);
  });

  it("el regalo y el tope pueden ser 0 (sin regalo, sin tope)", () => {
    expect(problemasDeConfig({ ...bien, regaloCumple: "0", topeCostoPct: "0" })).toMatchObject({ regaloCumple: null, topeCostoPct: null });
  });

  it("un campo vacío dice qué escribir y no se guarda", () => {
    for (const campo of Object.keys(bien) as (keyof typeof bien)[]) {
      const b = { ...bien, [campo]: " " };
      expect(problemasDeConfig(b)[campo], campo).toMatch(/Escribe/);
      expect(configDelBorrador(b), campo).toBeNull();
    }
  });
});

describe("lo que cambia y desde cuándo rige", () => {
  it("lista solo lo que cambió, con su antes y su después", () => {
    expect(cambiosDeConfig(ARRANQUE, ARRANQUE)).toEqual([]);
    expect(cambiosDeConfig(ARRANQUE, { ...ARRANQUE, solesPor100: 4, regaloCumple: 150 })).toEqual([
      "Lo que valen 100 puntos: S/ 5 → S/ 4",
      "Regalo de cumpleaños: 100 puntos → 150 puntos",
    ]);
  });

  it("cambiar lo que valen los puntos o el canje rige con 15 días de aviso; lo demás, hoy (como la base)", () => {
    const hoy = "2026-10-19";
    expect(vigenciaDelCambio(ARRANQUE, { ...ARRANQUE, solesPor100: 4 }, hoy)).toMatchObject({ desde: "2026-11-03", conAviso: true });
    expect(vigenciaDelCambio(ARRANQUE, { ...ARRANQUE, canjeMinimo: 300 }, hoy)).toMatchObject({ desde: "2026-11-03", conAviso: true });
    expect(vigenciaDelCambio(ARRANQUE, { ...ARRANQUE, vigenciaDias: 10, regaloCumple: 200 }, hoy)).toEqual({ desde: hoy, conAviso: false, texto: "Rige desde hoy." });
    expect(vigenciaDelCambio(ARRANQUE, { ...ARRANQUE, solesPor100: 4 }, hoy).texto).toMatch(/3 de noviembre/);
  });

  it("los días se suman como calendario, cruzando mes y año", () => {
    expect(sumarDias("2026-12-25", 15)).toBe("2027-01-09");
    expect(sumarDias("2026-02-20", 15)).toBe("2026-03-07");
    expect(fechaCorta("2026-11-03")).toBe("3 de noviembre");
  });

  it("el historial dice qué cambió y salta lo que no", () => {
    expect(cambioDelHistorial({ cuando: "x", desde: null, quien: null, antes: { solesPor100: 5, regaloCumple: 100 }, despues: { solesPor100: 4, regaloCumple: 100 } })).toEqual([
      "Lo que valen 100 puntos: S/ 5 → S/ 4",
    ]);
    expect(cambioDelHistorial({ cuando: "x", desde: null, quien: null, antes: {}, despues: { solesPor100: 4 } })).toEqual([]);
  });

  it("la configuración en palabras", () => {
    expect(configEnPalabras(ARRANQUE)).toBe(
      "1 punto por cada S/\u00a01 · 100 puntos valen S/\u00a05 · canje desde 200 puntos · compra de 3 veces el cupón · el cupón dura 7 días · 100 puntos de cumpleaños · tope de costo 2 %"
    );
  });
});

describe("cuánto devuelve el programa", () => {
  it("puntos por sol × lo que vale cada punto, en %", () => {
    expect(retornoPct({ puntosPorSol: 1, solesPor100: 5 })).toBe(5);
    expect(retornoPct({ puntosPorSol: 1, solesPor100: 2 })).toBe(2);
    expect(retornoPct({ puntosPorSol: 2, solesPor100: 2.5 })).toBe(5);
  });

  it("avisa cuando supera el tope de costo, sin bloquear", () => {
    expect(lecturaDelRetorno(ARRANQUE)).toMatchObject({ pct: 5, superaElTope: true });
    expect(lecturaDelRetorno(ARRANQUE).texto).toMatch(/más que tu tope de costo \(2 %\)/);
    const dentro = lecturaDelRetorno({ ...ARRANQUE, solesPor100: 2 });
    expect(dentro).toMatchObject({ pct: 2, superaElTope: false });
    expect(dentro.texto).toMatch(/Dentro de tu tope/);
  });
});

describe("la guía de foco sigue a la misma regla", () => {
  const bien = borradorDeConfig(ARRANQUE);

  it("«se puede confirmar» es exactamente «la regla no tiene problemas» y quién hace el cambio", () => {
    const variantes = [bien, { ...bien, puntosPorSol: "" }, { ...bien, solesPor100: "x" }, { ...bien, canjeMinimo: "150" }, { ...bien, regaloCumple: "0" }, { ...bien, topeCostoPct: "100" }];
    for (const b of variantes) {
      const sinProblemas = Object.values(problemasDeConfig(b)).every((p) => p === null);
      expect(sePuedeConfirmar(camposDeConfig(b, true)), JSON.stringify(b)).toBe(sinProblemas);
      expect(sePuedeConfirmar(camposDeConfig(b, false))).toBe(false);
    }
  });

  it("la guía llega hecha con lo vigente (nada pendiente salvo quién firma) y dice qué falta al borrar", () => {
    expect(Object.values(estadosDe(camposDeConfig(bien, true))).every((e) => e !== "falta")).toBe(true);
    const roto = camposDeConfig({ ...bien, canjeMinimo: "" }, true);
    expect(roto.find((c) => c.id === "canjeMinimo")?.hecho).toBe(false);
    expect(roto.find((c) => c.id === "canjeMinimo")?.pendiente).toMatch(/Escribe desde cuántos puntos/);
  });
});
