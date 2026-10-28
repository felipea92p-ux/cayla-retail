import { describe, expect, it } from "vitest";
import {
  DIAS_PARA_LLEGAR_DE_FABRICA,
  argsGuardarPlazo,
  detalleDelNuevoPlazo,
  diasConQueSeCuenta,
  fraseDeLosDias,
  fraseDelConteoAntesDelPlazo,
  leerDiasParaLlegar,
  leerPlazoFijado,
  plazoDePedido,
  problemaDeLosDias,
} from "./plan-compra-plazo";
import { camposDelPlazo } from "./plan-compra-guia";
import { sePuedeConfirmar } from "./guia-campos";

// La fecha límite para pedir (ADR-0499): Navidad 2026 va del 11 al 25 de diciembre; con 14 días para llegar, el último día para pedir es el 27 de noviembre.
const DESDE = "2026-12-11";
const HASTA = "2026-12-25";

describe("plazoDePedido antes de la campaña", () => {
  it("a tiempo: faltan más de 7 días para el límite", () => {
    const p = plazoDePedido(DESDE, HASTA, "2026-10-24", 14);
    expect(p).toMatchObject({ estado: "a_tiempo", limite: "2026-11-27", diasParaElLimite: 34, texto: "Pedir antes del 27/11", diasTarde: 0 });
    expect(p.detalle).toContain("en 34 días");
  });
  it("justo: el límite está a 7 días o menos, y vale hoy y mañana con su palabra", () => {
    expect(plazoDePedido(DESDE, HASTA, "2026-11-20", 14).estado).toBe("justo");
    expect(plazoDePedido(DESDE, HASTA, "2026-11-26", 14).detalle).toContain("(mañana)");
    const hoy = plazoDePedido(DESDE, HASTA, "2026-11-27", 14);
    expect(hoy).toMatchObject({ estado: "justo", diasParaElLimite: 0 });
    expect(hoy.detalle).toContain("(hoy)");
  });
  it("el día 8 antes del límite todavía es a tiempo", () => {
    expect(plazoDePedido(DESDE, HASTA, "2026-11-19", 14).estado).toBe("a_tiempo");
  });
  it("tarde: el límite pasó y dice cuántos días después de empezar llegaría", () => {
    const p = plazoDePedido(DESDE, HASTA, "2026-12-01", 14);
    expect(p).toMatchObject({ estado: "tarde", limite: "2026-11-27", diasParaElLimite: -4, llegariaEl: "2026-12-15", diasTarde: 4, texto: "Llegaría 4 días tarde" });
    expect(plazoDePedido(DESDE, HASTA, "2026-11-28", 14).texto).toBe("Llegaría 1 día tarde");
  });
  it("cruza el fin de año sin zonas horarias", () => {
    const p = plazoDePedido("2027-01-05", "2027-01-20", "2026-12-01", 20);
    expect(p.limite).toBe("2026-12-16");
  });
});

describe("plazoDePedido durante y después", () => {
  it("el día que empieza ya no hay «antes de»: dice cuándo llegaría un pedido de hoy", () => {
    const p = plazoDePedido(DESDE, HASTA, DESDE, 14);
    expect(p).toMatchObject({ estado: "empezo", limite: null, diasParaElLimite: null, llegariaEl: "2026-12-25", texto: "Si pides hoy, llega el 25/12" });
  });
  it("en el último día de la campaña todavía cuenta como durante", () => {
    expect(plazoDePedido(DESDE, HASTA, HASTA, 14).estado).toBe("empezo");
  });
  it("terminada: sin plazo", () => {
    expect(plazoDePedido(DESDE, HASTA, "2026-12-26", 14)).toMatchObject({ estado: "termino", limite: null, texto: "La campaña terminó" });
  });
});

describe("los días para llegar", () => {
  it("de fábrica son 14 y es un supuesto", () => {
    expect(DIAS_PARA_LLEGAR_DE_FABRICA).toBe(14);
  });
  it("un entero de 1 a 365", () => {
    expect(leerDiasParaLlegar("14")).toBe(14);
    expect(leerDiasParaLlegar(" 30 ")).toBe(30);
    expect(leerDiasParaLlegar("365")).toBe(365);
    for (const malo of ["", "0", "366", "-3", "1,5", "dos", "1000"]) expect(leerDiasParaLlegar(malo)).toBeNull();
  });
  it("el problema dice qué hacer, o nada si está bien", () => {
    expect(problemaDeLosDias("14")).toBeNull();
    expect(problemaDeLosDias("0")).toMatch(/de 1 a 365/);
  });
});

describe("leerPlazoFijado: lo que la base sabe del plazo", () => {
  it("sin la marca soportado (base vieja) o con basura, no hay lectura: el plan cuenta con el supuesto", () => {
    expect(leerPlazoFijado(null)).toBeNull();
    expect(leerPlazoFijado({ dias_para_llegar: 21 })).toBeNull();
    expect(leerPlazoFijado("x")).toBeNull();
    expect(diasConQueSeCuenta(null)).toBe(14);
  });
  it("sin fijar: soportado pero sin número ni autor; el supuesto manda", () => {
    const p = leerPlazoFijado({ soportado: true, dias_para_llegar: null, por: null, en: null });
    expect(p).toEqual({ dias: null, por: null, en: null });
    expect(diasConQueSeCuenta(p)).toBe(14);
  });
  it("fijado: el número, quién y cuándo; un número fuera de 1–365 no se cree", () => {
    const p = leerPlazoFijado({ soportado: true, dias_para_llegar: 21, por: "Felipe Alvarez", en: "2026-10-24T21:30:00+00:00" });
    expect(p).toEqual({ dias: 21, por: "Felipe Alvarez", en: "2026-10-24T21:30:00+00:00" });
    expect(diasConQueSeCuenta(p)).toBe(21);
    expect(leerPlazoFijado({ soportado: true, dias_para_llegar: 0 })?.dias).toBeNull();
    expect(leerPlazoFijado({ soportado: true, dias_para_llegar: 999 })?.dias).toBeNull();
    expect(leerPlazoFijado({ soportado: true, dias_para_llegar: "21" })?.dias).toBeNull();
  });
  it("la frase dice si es un supuesto o quién lo fijó, sin inventar un autor", () => {
    expect(fraseDeLosDias(null)).toMatch(/supuesto/);
    expect(fraseDeLosDias({ dias: null, por: null, en: null })).toMatch(/supuesto/);
    expect(fraseDeLosDias({ dias: 21, por: "Felipe Alvarez", en: "2026-10-24T21:30:00+00:00" })).toBe("Cuenta con 21 días para llegar a las tiendas (los fijó Felipe Alvarez el 24/10).");
    expect(fraseDeLosDias({ dias: 21, por: null, en: null })).toBe("Cuenta con 21 días para llegar a las tiendas (fijados a mano).");
  });
});

describe("guardar el plazo", () => {
  it("los argumentos van como los espera la base; null quita", () => {
    expect(argsGuardarPlazo("p", "21")).toEqual({ p_plan_id: "p", p_dias: 21 });
    expect(argsGuardarPlazo("p", null)).toEqual({ p_plan_id: "p", p_dias: null });
    expect(argsGuardarPlazo("p", "0").p_dias).toBeNull();
  });
  it("el aviso dice lo que cambió: subir el plazo puede dejar la campaña llegando tarde", () => {
    expect(detalleDelNuevoPlazo(DESDE, HASTA, "2026-10-24", 14)).toBe("Pedir antes del 27/11.");
    expect(detalleDelNuevoPlazo(DESDE, HASTA, "2026-10-24", 60)).toMatch(/^Llegaría 12 días tarde: El último día para pedir era el 12\/10/);
    expect(detalleDelNuevoPlazo(DESDE, HASTA, DESDE, 14)).toBe("Si pides hoy, llega el 25/12");
  });
  it("la guía deja confirmar exactamente cuando la base aceptaría", () => {
    for (const t of ["", "0", "14", "365", "366", "abc", "1,5"]) {
      for (const listo of [true, false]) {
        expect(sePuedeConfirmar(camposDelPlazo(t, { listo, motivo: null }))).toBe(problemaDeLosDias(t) === null && listo);
      }
    }
  });
});

describe("hasta cuándo contar el stock", () => {
  it("con tiempo o justo, dice el último día para pedir", () => {
    expect(fraseDelConteoAntesDelPlazo(plazoDePedido(DESDE, HASTA, "2026-10-24", 14))).toBe("Cuéntalo antes del 27/11: es el último día para pedir.");
    expect(fraseDelConteoAntesDelPlazo(plazoDePedido(DESDE, HASTA, "2026-11-27", 14))).toBe("Cuéntalo antes del 27/11: es el último día para pedir.");
  });
  it("si ya es tarde o la campaña empezó, no inventa una fecha que ya pasó", () => {
    expect(fraseDelConteoAntesDelPlazo(plazoDePedido(DESDE, HASTA, "2026-12-01", 14))).toBe("Cuéntalo antes de pedir.");
    expect(fraseDelConteoAntesDelPlazo(plazoDePedido(DESDE, HASTA, DESDE, 14))).toBe("Cuéntalo antes de pedir.");
  });
  it("terminada la campaña no hay nada que contar para ella", () => {
    expect(fraseDelConteoAntesDelPlazo(plazoDePedido(DESDE, HASTA, "2026-12-26", 14))).toBeNull();
  });
});
