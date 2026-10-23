import { describe, expect, it } from "vitest";
import fixture from "./resumen-finanzas.fixture.json";
import { filaDeVer, leerResumen, type ResumenFinanzas } from "./resumen-finanzas-reglas";
import type { FilaER } from "./resultados-reglas";
import { cascadaDeFila, cascadaPulso, matizarRespuesta, nombreDia, respuestaDeFila, respuestaPulso, ritmoPulso } from "./pulso-reglas";

const todas = leerResumen(fixture.todas);
const tru = leerResumen(fixture.tru);
const taller = leerResumen(fixture.taller);
const empresa = leerResumen(fixture.empresa);

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
    const r = respuestaPulso(conMes([{ ventas: 46900, costo: 22500, margen: 24400, planilla: 12290, gastos: 20030, depreciacion: 440, resultado: 4370 }]));
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
  const r = ritmoPulso(conMes([{ ventas: 46900, costo: 22500, margen: 24400, planilla: 25400, gastos: 33140, depreciacion: 440, resultado: -8740 }]))!;

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
    const sinPlanilla = conMes([{ ventas: 46900, costo: 22500, margen: 24400, planilla: 0, gastos: 7740, depreciacion: 440, resultado: 16660 }], {
      flujo: { estado: "ok", datos: { ...(todas.flujo.estado === "ok" ? todas.flujo.datos : (null as never)), salidas: [{ tipo: "planilla", fecha: "2026-10-30", monto: 25400, texto: "Planilla", ubicacionId: null, ubicacionNombre: null } as never] } },
    });
    expect(ritmoPulso(sinPlanilla)!.fijoMes).toBe(41396);
  });

  it("a un ritmo corto, no llega: lo dice y el día de cubrir queda en nada", () => {
    const corto = ritmoPulso(conMes([{ ventas: 15000, costo: 8000, margen: 7000, planilla: 25400, gastos: 33140, depreciacion: 440, resultado: -26140 }]))!;
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

describe("respuestaDeFila y cascadaDeFila (la misma pieza para Reportes)", () => {
  it("dan lo mismo que el Resumen para la misma fila", () => {
    const r = conMes([{ ventas: 46900, costo: 22500, margen: 24400, planilla: 12290, gastos: 20030, depreciacion: 440, resultado: 4370 }]);
    const f = (r.resultadosMes.estado === "ok" ? r.resultadosMes.datos : [])[0]!;
    expect(respuestaDeFila(f, { mes: "2026-10", vende: true, taller: false })).toEqual(respuestaPulso(r));
    expect(cascadaDeFila(f)).toEqual(cascadaPulso(r));
  });
});

describe("matizarRespuesta (el «Sí» solo con confianza alta, ADR-0417)", () => {
  const gana = respuestaPulso(conMes([{ ventas: 10000, costo: 4000, margen: 6000, gastos: 1000, resultado: 5000 }]));
  const pierde = respuestaPulso(conMes([{ ventas: 10000, costo: 6000, margen: 4000, gastos: 7000, resultado: -3000 }]));
  if (gana.estado === "sin_datos" || pierde.estado === "sin_datos") throw new Error("la fixture debe dar respuesta");

  it("con confianza alta dice «Sí» a secas, con el mes y sin marcas de provisional", () => {
    const m = matizarRespuesta(gana, "2026-10", "alto");
    expect(m).toMatchObject({ chip: "Sí", tono: "verde", intro: "En lo que va de octubre,", aprox: "", provisional: false, aviso: "" });
  });

  it("con confianza baja NO dice «Sí»: «Con lo que hay registrado», cifra con ≈ y chip «Provisional»", () => {
    const m = matizarRespuesta(gana, "2026-10", "bajo");
    expect(m).toMatchObject({ chip: "Provisional", tono: "pizarra", intro: "Con lo que hay registrado,", aprox: "≈ ", provisional: true });
    expect(m.aviso).toContain("Qué tan seguro es este número");
    expect(m.chip).not.toMatch(/^Sí$/);
  });

  it("tampoco afirma un «No» pelado con confianza baja", () => {
    const m = matizarRespuesta(pierde, "2026-10", "bajo");
    expect(m.chip).toBe("Provisional");
    expect(m.provisional).toBe(true);
  });

  it("con confianza media dice «Sí, por ahora» y avisa, sin tapar la cifra", () => {
    const m = matizarRespuesta(gana, "2026-10", "medio");
    expect(m).toMatchObject({ chip: "Sí, por ahora", tono: "verde", provisional: false, aprox: "" });
    expect(m.aviso).not.toBe("");
  });

  it("sin medida de confianza (la base no respondió) tampoco afirma: lo que no se midió no es «alta»", () => {
    const m = matizarRespuesta(gana, "2026-10", null);
    expect(m).toMatchObject({ chip: "Provisional", intro: "Con lo que hay registrado,", aprox: "≈ ", provisional: true });
    expect(m.aviso).toContain("no se pudo medir");
  });

  it("no cambia la cifra ni el verbo: solo cómo se dice", () => {
    expect(gana.monto).toBe(5000);
    expect(gana.verbo).toBe("te quedan");
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

  it("lo fijo del mes cuenta los sueldos una sola vez: otros gastos y desgaste al mes, más la planilla entera", () => {
    // 24 de septiembre (30 días): (5,396 + 87) × 30/24 = 6,853.75, más la planilla asentada 7,800.
    expect(ritmoPulso(tru)!.fijoMes).toBe(14653.75);
  });
});

describe("la planilla estimada (ADR-0453): fuera del libro, marcada y al mes entero en «lo fijo»", () => {
  // 15 de octubre: lo asentado sería 0; Dynamic aún no pagó. Las boletas dicen 8,000 hasta hoy y 12,000 al cierre del período.
  const estimada = { planilla: 8000, planillaEstimada: 8000, planillaAlCierre: 12000, planillaPersonas: 12, gastos: 8000 + 440 + 7300, depreciacion: 440 };

  it("lo fijo del mes lleva los sueldos estimados al período entero, y lo demás al mes por regla de tres", () => {
    const r = ritmoPulso(conMes([{ ventas: 46900, costo: 22500, margen: 24400, resultado: 24400 - (8000 + 440 + 7300), ...estimada }]))!;
    // (7,300 + 440) × 31/15 = 15,996 + 12,000 al cierre = 27,996.
    expect(r.fijoMes).toBe(27996);
  });

  it("si una parte ya se pagó y otra es estimada, la pagada cuenta entera y la estimada, al cierre", () => {
    // 5,000 pagados (asentados) + 3,000 estimados que cerrarían en 4,500 → 9,500; lo demás igual.
    const r = ritmoPulso(conMes([{ ventas: 46900, costo: 22500, margen: 24400, planilla: 8000, planillaEstimada: 3000, planillaAlCierre: 4500, planillaPersonas: 3, gastos: 8000 + 440 + 7300, depreciacion: 440, resultado: 24400 - (8000 + 440 + 7300) }]))!;
    expect(r.fijoMes).toBe(15996 + 9500);
  });

  it("la cascada dice que los sueldos son un estimado y con cuántas personas", () => {
    const c = cascadaPulso(conMes([{ ventas: 46900, costo: 22500, margen: 24400, resultado: 24400 - (8000 + 440 + 7300), planillaNota: "Estimado hasta hoy con las boletas de Dynamic (12 personas); cuando Dynamic pague el período, entra lo pagado de verdad.", ...estimada }]));
    expect(c.find((t) => t.clave === "planilla")).toMatchObject({ monto: 8000, detalle: expect.stringContaining("Estimado hasta hoy") });
    expect(c.map((t) => t.clave)).not.toContain("ajustes");
  });
});
