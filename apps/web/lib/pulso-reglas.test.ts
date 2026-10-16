import { describe, expect, it } from "vitest";
import fixture from "./resumen-finanzas.fixture.json";
import { filaDeVer, leerResumen, type ResumenFinanzas } from "./resumen-finanzas-reglas";
import type { FilaER } from "./resultados-reglas";
import { cascadaDeFila, cascadaPulso, lugaresPulso, nombreDia, respuestaDeFila, respuestaPulso, ritmoPulso } from "./pulso-reglas";

const todas = leerResumen(fixture.todas);
const tru = leerResumen(fixture.tru);
const taller = leerResumen(fixture.taller);
const empresa = leerResumen(fixture.empresa);

/** Un Resumen de CAYLA entera con un Estado de resultados escrito a mano: el 15 de octubre, con cifras redondas. */
function conMes(filas: Partial<FilaER>[], extra: Partial<ResumenFinanzas> = {}): ResumenFinanzas {
  const base: FilaER = {
    ubicacionId: null, unidad: "consolidado", nombre: "CAYLA", orden: 0,
    ventas: 0, costo: 0, fletes: 0, mermas: 0, margen: 0, planilla: 0, depreciacion: 0, gastos: 0, resultado: 0, igvVentas: 0,
    detalleGastos: [], detalleMermas: [], sinCosto: 0, mermasSinCosto: 0, descuadres: 0, planillaVisible: true, planillaNota: null,
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

describe("nombreDia", () => {
  it("dice el día con su nombre: el 15 de octubre de 2026 es jueves", () => {
    expect(nombreDia("2026-10", 15)).toBe("el jueves 15");
    expect(nombreDia("2026-10", 27)).toBe("el martes 27");
  });
});

describe("respuestaPulso", () => {
  it("con el fixture, dice lo que el Estado de resultados dice: ni más ni menos", () => {
    const f = filaDeVer(todas.resultadosMes.estado === "ok" ? todas.resultadosMes.datos : [], todas.ver)!;
    const r = respuestaPulso(todas);
    expect(r.estado).toBe(f.resultado > 0 ? "gana" : f.resultado < 0 ? "pierde" : "empata");
    if (r.estado === "sin_datos") throw new Error("tendría que haber datos");
    expect(r.monto).toBe(Math.abs(Math.round(f.resultado * 100) / 100));
    expect(r.vendido).toBe(f.ventas);
  });

  it("gana: «te quedan», con lo vendido y a quién se le pagó", () => {
    const r = respuestaPulso(conMes([{ ventas: 46900, costo: 22500, margen: 24400, planilla: 12290, gastos: 7300, depreciacion: 440, resultado: 4370 }]));
    expect(r).toMatchObject({ estado: "gana", monto: 4370, vendido: 46900, verbo: "te quedan", corto: "Sí" });
    if (r.estado === "sin_datos") return;
    expect(r.explica).toBe("De los S/ 46,900 que vendiste (sin IGV), esto es lo que queda tuyo después de pagar la ropa, los sueldos, los alquileres y los servicios y el desgaste de máquinas y muebles.");
  });

  it("pierde: «te faltan», en positivo", () => {
    const r = respuestaPulso(conMes([{ ventas: 10000, costo: 6000, margen: 4000, gastos: 7000, resultado: -3000 }]));
    expect(r).toMatchObject({ estado: "pierde", monto: 3000, verbo: "te faltan", corto: "No" });
  });

  it("sin nada registrado en el mes, lo dice en vez de mostrar un cero", () => {
    const r = respuestaPulso(conMes([{ ventas: 0, resultado: 0 }]));
    expect(r.estado).toBe("sin_datos");
    if (r.estado === "sin_datos") expect(r.motivo).toContain("octubre");
  });

  it("si el Estado de resultados no se pudo leer, trae el motivo", () => {
    const r = respuestaPulso({ ...todas, resultadosMes: { estado: "sin_permiso", mensaje: "necesita el módulo" } });
    expect(r.estado).toBe("sin_datos");
  });

  it("el Taller y la empresa no venden: la respuesta es lo que costó", () => {
    const t = respuestaPulso(taller);
    if (t.estado !== "sin_datos") expect(t.verbo).toBe("costó");
    const e = respuestaPulso(empresa);
    if (e.estado !== "sin_datos") expect(e.verbo).toBe("costó");
  });
});

describe("ritmoPulso", () => {
  // 15 de octubre (31 días): vendido 46,900 → 3,126.67 al día; margen 24,400/46,900 = 52.03 %; gastos 7,300 + desgaste 440 a la
  // fecha, llevados al mes (× 31/15) = 15,996; planilla asentada 25,400 → fijo del mes 41,396; necesario 79,568.7 al mes = 2,566.73 al día.
  const r = ritmoPulso(conMes([{ ventas: 46900, costo: 22500, margen: 24400, planilla: 25400, gastos: 7300, depreciacion: 440, resultado: -8740 }]))!;

  it("lo vendido por día y lo que hace falta por día para cubrir lo fijo del mes", () => {
    expect(r.porDia).toBe(3126.67);
    expect(r.fijoMes).toBe(41396);
    expect(r.necesarioPorDia).toBe(2566.73);
    expect(r.tono).toBe("verde");
    expect(r.frase).toBe("Vas en S/ 3,127 al día; necesitas S/ 2,567 para cubrir octubre. Te sobran S/ 560 al día.");
  });

  it("con qué cerrarías y qué día cubres lo fijo", () => {
    // 3,126.67 × 31 × 0.5203 − 41,396 ≈ 9,032; cubre el día ⌈79,568.7 ÷ 3,126.67⌉ = 26.
    expect(r.cierre).toBeCloseTo(9032, -1);
    expect(r.diaCubre).toBe(26);
    expect(r.cierreFrase).toMatch(/^Si sigues así, cierras octubre con ≈ S\/ 9,0\d\d\. El lunes 26 habrás cubierto todo lo fijo de octubre/);
  });

  it("si la planilla todavía no se asentó, toma la que el Flujo proyecta para el mes", () => {
    const sinPlanilla = conMes([{ ventas: 46900, costo: 22500, margen: 24400, planilla: 0, gastos: 7300, depreciacion: 440, resultado: 16660 }], {
      flujo: { estado: "ok", datos: { ...(todas.flujo.estado === "ok" ? todas.flujo.datos : (null as never)), salidas: [{ tipo: "planilla", fecha: "2026-10-30", monto: 25400, texto: "Planilla", ubicacionId: null, ubicacionNombre: null } as never] } },
    });
    expect(ritmoPulso(sinPlanilla)!.fijoMes).toBe(41396);
  });

  it("a un ritmo corto, no llega: lo dice y el día de cubrir queda en nada", () => {
    const corto = ritmoPulso(conMes([{ ventas: 15000, costo: 8000, margen: 7000, planilla: 25400, gastos: 7300, depreciacion: 440, resultado: -25700 }]))!;
    expect(corto.tono).toBe("rojo");
    expect(corto.diaCubre).toBeNull();
    expect(corto.cierreFrase).toContain("no llegas a cubrir lo fijo del mes");
  });

  it("sin ventas o sin margen, no hay ritmo que medir", () => {
    expect(ritmoPulso(conMes([{ ventas: 0 }]))!.necesarioPorDia).toBeNull();
    expect(ritmoPulso(conMes([{ ventas: 1000, costo: 1200, margen: -200 }]))!.tono).toBe("pizarra");
  });

  it("mirando el Taller o la empresa no hay ritmo: no venden", () => {
    expect(ritmoPulso(taller)).toBeNull();
    expect(ritmoPulso(empresa)).toBeNull();
    expect(ritmoPulso(tru)).not.toBeNull();
  });
});

describe("cascadaPulso", () => {
  it("vendiste → costó → sueldos → gastos → desgaste → te queda, y los tramos vacíos no aparecen", () => {
    const c = cascadaPulso(conMes([{ ventas: 46900, costo: 22500, margen: 24400, planilla: 12290, gastos: 7300, depreciacion: 440, resultado: 4370, detalleGastos: [{ cuenta: "635", nombre: "Alquileres", monto: 6050 }, { cuenta: "636", nombre: "Luz y agua", monto: 860 }, { cuenta: "631", nombre: "Transporte", monto: 390 }, { cuenta: "639", nombre: "Comisiones", monto: 0 }] }]));
    expect(c.map((t) => t.clave)).toEqual(["ventas", "costo", "planilla", "gastos", "depreciacion", "queda"]);
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
  });

  it("si falta plata, el último tramo dice «Te falta» en positivo, y las prendas sin costo se avisan", () => {
    const c = cascadaPulso(conMes([{ ventas: 10000, costo: 6000, margen: 4000, gastos: 7000, resultado: -3000, sinCosto: 12 }]));
    expect(c.at(-1)).toMatchObject({ nombre: "Te falta", monto: 3000 });
    expect(c.find((t) => t.clave === "costo")!.detalle).toBe("12 prendas vendidas sin costo.");
  });
});

describe("lugaresPulso", () => {
  it("cada tienda, el Taller y lo de toda la empresa, sin repartir, y el total es el de CAYLA", () => {
    const l = lugaresPulso(todas)!;
    expect(l.lugares.map((x) => x.tipo)).toEqual(["tienda", "tienda", "tienda", "taller", "empresa"]);
    expect(l.lugares.at(-1)!.nombre).toBe("Lo de toda la empresa");
    const consolidado = (todas.resultadosMes.estado === "ok" ? todas.resultadosMes.datos : []).find((f) => f.unidad === "consolidado")!;
    expect(l.total).toBe(Math.round(consolidado.resultado * 100) / 100);
    expect(l.mayor).toBeGreaterThan(0);
  });

  it("solo mirando CAYLA entera", () => {
    expect(lugaresPulso(tru)).toBeNull();
  });
});

describe("respuestaDeFila y cascadaDeFila (la misma pieza para Reportes)", () => {
  it("dan lo mismo que el Resumen para la misma fila", () => {
    const r = conMes([{ ventas: 46900, costo: 22500, margen: 24400, planilla: 12290, gastos: 7300, depreciacion: 440, resultado: 4370 }]);
    const f = (r.resultadosMes.estado === "ok" ? r.resultadosMes.datos : [])[0]!;
    expect(respuestaDeFila(f, { mes: "2026-10", vende: true, taller: false })).toEqual(respuestaPulso(r));
    expect(cascadaDeFila(f)).toEqual(cascadaPulso(r));
  });
});
