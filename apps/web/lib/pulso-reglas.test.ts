import { describe, expect, it } from "vitest";
import fixture from "./resumen-finanzas.fixture.json";
import { filaDeVer, leerResumen, type ResumenFinanzas } from "./resumen-finanzas-reglas";
import type { FilaER } from "./resultados-reglas";
import { cascadaDeFila, respuestaDeFila } from "./pulso-reglas";

/** La cascada de lo que se mira (la que dibuja Reportes con `cascadaDeFila`), con la fila que elige el Resumen. */
const cascadaPulso = (r: ResumenFinanzas) => {
  if (r.resultadosMes.estado !== "ok") return [];
  const f = filaDeVer(r.resultadosMes.datos, r.ver);
  return f ? cascadaDeFila(f) : [];
};

const todas = leerResumen(fixture.todas);
const tru = leerResumen(fixture.tru);

/**
 * Un Resumen de CAYLA entera con un Estado de resultados escrito a mano: el 15 de octubre, con cifras redondas. Con la FORMA REAL de la
 * base: `gastos` (los gastos de operación) INCLUYE los sueldos (cuenta 62) y el desgaste (681), así que `resultado = margen − gastos`.
 */
function conMes(filas: Partial<FilaER>[], extra: Partial<ResumenFinanzas> = {}): ResumenFinanzas {
  const base: FilaER = {
    ubicacionId: null, unidad: "consolidado", nombre: "CAYLA", orden: 0,
    ventas: 0, costo: 0, fletes: 0, mermas: 0, margen: 0, planilla: 0, depreciacion: 0, gastos: 0, resultado: 0, igvVentas: 0,
    detalleGastos: [], detalleMermas: [], sinCosto: 0, mermasSinCosto: 0, descuadres: 0, planillaVisible: true, planillaNota: null,
    planillaEstimada: 0, planillaAlCierre: 0, planillaPersonas: 0,
  };
  return {
    ...todas,
    hoy: "2026-10-15",
    mes: "2026-10",
    resultadosMes: { estado: "ok", datos: filas.map((f) => ({ ...base, ...f })) },
    flujo: { estado: "no_aplica" },
    ...extra,
  };
}

describe("respuestaDeFila (Reportes)", () => {
  const fila = (p: Partial<FilaER>) => ({ ...filaDeVer((todas.resultadosMes.estado === "ok" ? todas.resultadosMes.datos : []), todas.ver)!, ...p });

  it("gana: «te quedan», con lo vendido y a quién se le pagó; pierde: «te faltan», en positivo", () => {
    const g = respuestaDeFila(fila({ ventas: 1000, costo: 400, planilla: 0, depreciacion: 0, gastos: 300, resultado: 300 }), { mes: "2026-10", vende: true, taller: false });
    expect(g).toMatchObject({ estado: "gana", monto: 300, verbo: "te quedan", corto: "Sí" });
    const p = respuestaDeFila(fila({ ventas: 720, costo: 218, planilla: 0, depreciacion: 0, gastos: 898, resultado: -396 }), { mes: "2026-10", vende: true, taller: false });
    expect(p).toMatchObject({ estado: "pierde", monto: 396, verbo: "te faltan", corto: "No" });
  });

  it("el Taller no vende: dice lo que costó; sin nada registrado, lo dice en vez de un cero", () => {
    const t = respuestaDeFila(fila({ ventas: 0, costo: 0, planilla: 500, depreciacion: 0, gastos: 620, resultado: -620 }), { mes: "2026-10", vende: false, taller: true });
    expect(t).toMatchObject({ verbo: "costó" });
    expect(t.estado !== "sin_datos" && t.explica).toMatch(/^El Taller no vende/);
    expect(respuestaDeFila(fila({ ventas: 0, gastos: 0, planilla: 0 }), { mes: "2026-10", vende: true, taller: false })).toEqual({ estado: "sin_datos", motivo: "Todavía no hay ventas ni gastos en octubre." });
  });
});

describe("cascadaPulso", () => {
  it("vendiste → costó → sueldos → gastos → desgaste → te queda, y los tramos vacíos no aparecen", () => {
    const c = cascadaPulso(conMes([{ ventas: 46900, costo: 22500, margen: 24400, planilla: 12290, gastos: 20030, depreciacion: 440, resultado: 4370, detalleGastos: [{ cuenta: "62", nombre: "Gastos de personal", monto: 12290 }, { cuenta: "635", nombre: "Alquileres", monto: 6050 }, { cuenta: "636", nombre: "Luz y agua", monto: 860 }, { cuenta: "631", nombre: "Transporte", monto: 390 }, { cuenta: "639", nombre: "Comisiones", monto: 0 }, { cuenta: "681", nombre: "Depreciación", monto: 440 }] }]));
    expect(c.map((t) => t.clave)).toEqual(["ventas", "costo", "planilla", "gastos", "depreciacion", "queda"]);
    // Los sueldos y el desgaste tienen su tramo: «otros gastos» no los repite (ni en el monto ni en el detalle), y no sobra ningún ajuste.
    expect(c.find((t) => t.clave === "gastos")!.monto).toBe(7300);
    expect(c[0]).toMatchObject({ tipo: "entra", monto: 46900 });
    expect(c.at(-1)).toMatchObject({ tipo: "queda", nombre: "Te queda", monto: 4370 });
    expect(c.find((t) => t.clave === "gastos")!.detalle).toBe("Alquileres S/ 6,050 · Luz y agua S/ 860 · Transporte S/ 390");
  });

  it("siempre cuadra: lo que la cascada no nombra (un gasto devuelto) entra como «otros ajustes»", () => {
    // Ventas 258, costo 126 y gastos −140 (una devolución): el resultado 272 no sale de 258 − 126; el tramo de ajustes lo cierra.
    const c = cascadaPulso(conMes([{ ventas: 258, costo: 126, margen: 132, gastos: -140, resultado: 272 }]));
    expect(c.map((t) => t.clave)).toEqual(["ventas", "costo", "ajustes", "queda"]);
    expect(c.find((t) => t.clave === "ajustes")).toMatchObject({ tipo: "entra", monto: 140, nombre: "Otros ajustes a favor" });
    const suma = c.filter((t) => t.tipo !== "queda").reduce((s, t) => s + (t.tipo === "entra" ? t.monto : -t.monto), 0);
    expect(suma).toBe(272);
    // Y cuando todo está nombrado, no aparece.
    expect(cascadaPulso(conMes([{ ventas: 100, costo: 40, margen: 60, gastos: 20, resultado: 40 }])).map((t) => t.clave)).toEqual(["ventas", "costo", "gastos", "queda"]);
    // Lo que queda a favor no se marca negativo: el color de la pérdida sale de esta marca (auditoría v3, hallazgo 3).
    expect(cascadaPulso(conMes([{ ventas: 100, costo: 40, margen: 60, gastos: 20, resultado: 40 }])).at(-1)!.negativo).toBeUndefined();
  });

  it("si falta plata, el último tramo dice «Te falta» en positivo, y las prendas sin costo se avisan", () => {
    const c = cascadaPulso(conMes([{ ventas: 10000, costo: 6000, margen: 4000, gastos: 7000, resultado: -3000, sinCosto: 12 }]));
    expect(c.at(-1)).toMatchObject({ nombre: "Te falta", monto: 3000, negativo: true });
    expect(c.find((t) => t.clave === "costo")!.detalle).toBe("12 prendas vendidas sin costo.");
  });
});


describe("la forma REAL de la base: `gastos` ya incluye los sueldos y el desgaste (ADR-0453)", () => {
  // Con el fixture de la base (TRU: sueldos 7,800, desgaste 87, gastos de operación 13,283) la cascada repetía los sueldos dentro de
  // «Alquileres y otros gastos» y una línea inventada de «Otros ajustes a favor» los compensaba; «lo fijo del mes» los contaba dos veces.
  it("la cascada de una tienda real no repite los sueldos ni inventa ajustes", () => {
    const c = cascadaPulso(tru);
    expect(c.find((t) => t.clave === "planilla")!.monto).toBe(7800);
    expect(c.find((t) => t.clave === "gastos")!.monto).toBe(5396); // 13,283 − 7,800 − 87
    expect(c.map((t) => t.clave)).not.toContain("ajustes");
    const suma = c.filter((t) => t.tipo !== "queda").reduce((s, t) => s + (t.tipo === "entra" ? t.monto : -t.monto), 0);
    expect(Math.round(suma * 100) / 100).toBe(5653);
  });

});

describe("la planilla estimada (ADR-0453): fuera del libro, marcada y al mes entero en «lo fijo»", () => {
  // 15 de octubre: lo asentado sería 0; Dynamic aún no pagó. Las boletas dicen 8,000 hasta hoy y 12,000 al cierre del período.
  const estimada = { planilla: 8000, planillaEstimada: 8000, planillaAlCierre: 12000, planillaPersonas: 12, gastos: 8000 + 440 + 7300, depreciacion: 440 };

  it("la cascada dice que los sueldos son un estimado y con cuántas personas", () => {
    const c = cascadaPulso(conMes([{ ventas: 46900, costo: 22500, margen: 24400, resultado: 24400 - (8000 + 440 + 7300), planillaNota: "Estimado hasta hoy con las boletas de Dynamic (12 personas); cuando Dynamic pague el período, entra lo pagado de verdad.", ...estimada }]));
    expect(c.find((t) => t.clave === "planilla")).toMatchObject({ monto: 8000, detalle: expect.stringContaining("Estimado hasta hoy") });
    expect(c.map((t) => t.clave)).not.toContain("ajustes");
  });
});
