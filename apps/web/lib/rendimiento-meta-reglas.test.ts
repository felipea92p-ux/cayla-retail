import { describe, expect, it } from "vitest";
import {
  acumulado,
  asignacionDeVista,
  avance,
  columnaDePersona,
  leerSoles,
  ordenarPersonas,
  primerDiaDelMes,
  puedeEditarMeta,
  rangoDeLectura,
  repartePorHoras,
  resumenDeSede,
  serieParaGrafico,
  turnoDeHoy,
  ultimoDiaDelMes,
  validarCambioMeta,
  ventanaDeVista,
  vistaDeUrl,
  type DiaSerie,
  type PersonaMeta,
} from "./rendimiento-meta-reglas";

// Martes 29 de setiembre de 2026 (el día en que se decidió esto).
const HOY = "2026-09-29";

function persona(p: Partial<PersonaMeta> & { personaId: string }): PersonaMeta {
  return {
    nombre: p.personaId,
    esEncargada: false,
    base: "horas",
    entradaHoy: null,
    salidaHoy: null,
    horasHoy: null,
    metaAutoMes: 10000,
    metaAjustadaMes: null,
    metaMes: 10000,
    metaHoy: 350,
    meta7d: 2450,
    vendidoHoy: 0,
    ventasHoy: 0,
    vendido7d: 0,
    ventas7d: 0,
    vendidoMes: 0,
    ventasMes: 0,
    ...p,
  };
}

/** Un mes entero (setiembre 2026) con meta de la sede de 1.000 por día y las ventas que se le pasen por fecha. */
function serieDelMes(ventasPorFecha: Record<string, { total: number; ventas: number }> = {}, metaDia: number | null = 1000): DiaSerie[] {
  return Array.from({ length: 30 }, (_, i) => {
    const fecha = `2026-09-${String(i + 1).padStart(2, "0")}`;
    const v = ventasPorFecha[fecha];
    return { fecha, total: v?.total ?? 0, ventas: v?.ventas ?? 0, metaSede: metaDia, metaAsignada: metaDia };
  });
}

describe("vistaDeUrl (decisión 8: abre en Hoy)", () => {
  it("reconoce las tres vistas y cae a «hoy» con cualquier otra cosa", () => {
    expect(vistaDeUrl("semana")).toBe("semana");
    expect(vistaDeUrl("mes")).toBe("mes");
    expect(vistaDeUrl("hoy")).toBe("hoy");
    expect(vistaDeUrl(undefined)).toBe("hoy");
    expect(vistaDeUrl("año")).toBe("hoy");
    expect(vistaDeUrl(["mes", "semana"])).toBe("mes");
  });
});

describe("fechas de las ventanas", () => {
  it("el mes va del 1 al último día, también en diciembre", () => {
    expect(primerDiaDelMes(HOY)).toBe("2026-09-01");
    expect(ultimoDiaDelMes(HOY)).toBe("2026-09-30");
    expect(ultimoDiaDelMes("2026-12-15")).toBe("2026-12-31");
    expect(ultimoDiaDelMes("2028-02-10")).toBe("2028-02-29");
  });

  it("la semana son 7 días contando hoy", () => {
    expect(ventanaDeVista("semana", HOY)).toEqual({ desde: "2026-09-23", hasta: "2026-09-29" });
    expect(ventanaDeVista("hoy", HOY)).toEqual({ desde: HOY, hasta: HOY });
    expect(ventanaDeVista("mes", HOY)).toEqual({ desde: "2026-09-01", hasta: "2026-09-30" });
  });

  it("el rango de lectura cubre la semana aunque cruce el cambio de mes, y el mes completo", () => {
    expect(rangoDeLectura(HOY)).toEqual({ desde: "2026-09-01", hasta: "2026-09-30" });
    // 2 de octubre: la semana empieza el 26 de setiembre, antes del inicio del mes.
    expect(rangoDeLectura("2026-10-02")).toEqual({ desde: "2026-09-26", hasta: "2026-10-31" });
  });
});

describe("avance", () => {
  it("es un porcentaje entero y nunca inventa un 0 % sin meta", () => {
    expect(avance(175, 350)).toBe(50);
    expect(avance(0, 350)).toBe(0);
    expect(avance(500, 350)).toBe(143);
    expect(avance(100, null)).toBeNull();
    expect(avance(100, 0)).toBeNull();
  });
});

describe("resumenDeSede", () => {
  const serie = serieDelMes({ [HOY]: { total: 800, ventas: 4 }, "2026-09-28": { total: 1200, ventas: 6 }, "2026-09-10": { total: 500, ventas: 2 } });

  it("hoy: lo vendido hoy contra la meta de hoy", () => {
    const r = resumenDeSede(serie, "hoy", HOY);
    expect(r).toMatchObject({ soles: 800, ventas: 4, meta: 1000, tocabaPct: null });
    expect(r.ticket).toBe(200);
  });

  it("semana: los 7 días hasta hoy, con la meta de esos 7 días", () => {
    const r = resumenDeSede(serie, "semana", HOY);
    expect(r).toMatchObject({ soles: 2000, ventas: 10, meta: 7000 });
  });

  it("mes: todo el mes, y cuánto tocaba llevar hasta hoy (29 de 30 días)", () => {
    const r = resumenDeSede(serie, "mes", HOY);
    expect(r).toMatchObject({ soles: 2500, ventas: 12, meta: 30000 });
    expect(r.tocabaPct).toBe(97);
  });

  it("sin meta de la sede: meta nula (la pantalla lo dice), no cero", () => {
    const r = resumenDeSede(serieDelMes({ [HOY]: { total: 800, ventas: 4 } }, null), "mes", HOY);
    expect(r.meta).toBeNull();
    expect(r.tocabaPct).toBeNull();
    expect(r.soles).toBe(800);
  });

  it("sin ventas: ticket nulo, no NaN", () => {
    expect(resumenDeSede(serieDelMes(), "hoy", HOY).ticket).toBeNull();
  });
});

describe("tabla «Cómo va»", () => {
  const ana = persona({ personaId: "Ana", nombre: "Ana P.", vendidoHoy: 175, ventasHoy: 2, metaHoy: 350, vendido7d: 900, ventas7d: 5, meta7d: 2450, vendidoMes: 4000, ventasMes: 20, metaMes: 10000 });
  const beto = persona({ personaId: "Beto", nombre: "Beto P.", vendidoHoy: 400, ventasHoy: 1, metaHoy: 200, vendido7d: 300, ventas7d: 2, meta7d: 1400, vendidoMes: 1000, ventasMes: 4, metaMes: 6000 });
  const lidia = persona({ personaId: "Lidia", nombre: "Lidia E.", vendidoHoy: 0, metaHoy: null, meta7d: null, metaMes: null, vendidoMes: 0 });

  it("cada vista lee su propia columna de la misma persona", () => {
    expect(columnaDePersona(ana, "hoy")).toEqual({ vendido: 175, ventas: 2, meta: 350 });
    expect(columnaDePersona(ana, "semana")).toEqual({ vendido: 900, ventas: 5, meta: 2450 });
    expect(columnaDePersona(ana, "mes")).toEqual({ vendido: 4000, ventas: 20, meta: 10000 });
  });

  it("ordena por nombre, por lo vendido y por avance (sin meta al final)", () => {
    const todas = [beto, lidia, ana];
    expect(ordenarPersonas(todas, "hoy", "nombre").map((p) => p.personaId)).toEqual(["Ana", "Beto", "Lidia"]);
    expect(ordenarPersonas(todas, "hoy", "ventas").map((p) => p.personaId)).toEqual(["Beto", "Ana", "Lidia"]);
    // Beto 200 % · Ana 50 % · Lidia sin meta
    expect(ordenarPersonas(todas, "hoy", "avance").map((p) => p.personaId)).toEqual(["Beto", "Ana", "Lidia"]);
    expect(todas.map((p) => p.personaId)).toEqual(["Beto", "Lidia", "Ana"]); // no muta la lista original
  });

  it("el turno de hoy se lee «09:00–18:00» y sin turno no se inventa", () => {
    expect(turnoDeHoy({ entradaHoy: "09:00", salidaHoy: "18:00" })).toBe("09:00–18:00");
    expect(turnoDeHoy({ entradaHoy: "09:00:00", salidaHoy: "18:00:00" })).toBe("09:00–18:00");
    expect(turnoDeHoy({ entradaHoy: null, salidaHoy: null })).toBeNull();
  });

  it("la tienda reparte por horas si al menos una persona tiene base «horas»", () => {
    expect(repartePorHoras([ana])).toBe(true);
    expect(repartePorHoras([persona({ personaId: "X", base: "iguales" }), persona({ personaId: "Y", base: null })])).toBe(false);
  });
});

describe("asignacionDeVista: lo que suman las personas contra la meta de la sede", () => {
  const dos = [persona({ personaId: "A", metaHoy: 900 }), persona({ personaId: "B", metaHoy: 900 })];

  it("cuadra cuando suman la meta de la sede", () => {
    expect(asignacionDeVista(dos, "hoy", 1800)).toMatchObject({ tipo: "cuadra", asignado: 1800, diferencia: 0 });
  });

  it("faltan cuando la líder bajó una meta, y se pasa cuando subió otra", () => {
    expect(asignacionDeVista([persona({ personaId: "A", metaHoy: 900 }), persona({ personaId: "B", metaHoy: 500 })], "hoy", 1800)).toMatchObject({ tipo: "faltan", diferencia: 400 });
    expect(asignacionDeVista([persona({ personaId: "A", metaHoy: 900 }), persona({ personaId: "B", metaHoy: 1200 })], "hoy", 1800)).toMatchObject({ tipo: "pasa", diferencia: -300 });
  });

  it("una persona sin parte cuenta cero (no rompe la suma)", () => {
    expect(asignacionDeVista([persona({ personaId: "A", metaHoy: 900 }), persona({ personaId: "B", metaHoy: null })], "hoy", 1800)).toMatchObject({ tipo: "faltan", diferencia: 900 });
  });

  it("sin meta de la sede no hay nada que comparar", () => {
    expect(asignacionDeVista(dos, "hoy", null)).toEqual({ tipo: "sin_meta" });
    expect(asignacionDeVista(dos, "hoy", 0)).toEqual({ tipo: "sin_meta" });
  });
});

describe("serieParaGrafico", () => {
  const serie = serieDelMes({ [HOY]: { total: 800, ventas: 4 }, "2026-09-28": { total: 1200, ventas: 6 } });
  const g = serieParaGrafico(serie, HOY);

  it("la semana son 7 barras con los nombres cortos del día y hoy marcado", () => {
    expect(g.semana).toHaveLength(7);
    expect(g.semana.map((d) => d.etiqueta)).toEqual(["Mié", "Jue", "Vie", "Sáb", "Dom", "Lun", "Mar"]);
    expect(g.semana.at(-1)).toMatchObject({ fecha: HOY, hoy: true, valor: 800, meta: 1000, titulo: "martes 29" });
    expect(g.semana.filter((d) => d.hoy)).toHaveLength(1);
  });

  it("el mes trae todos los días; los que faltan por venir no tienen valor (no son un cero)", () => {
    expect(g.mes).toHaveLength(30);
    expect(g.mes[0]).toMatchObject({ fecha: "2026-09-01", etiqueta: "1", valor: 0 });
    expect(g.mes.find((d) => d.fecha === "2026-09-30")).toMatchObject({ valor: null, etiqueta: "30", meta: 1000 });
    expect(g.mes.find((d) => d.fecha === "2026-09-30")?.hoy).toBe(false);
  });

  it("rotula pocos días del mes para que no se amontonen", () => {
    expect(g.mes.map((d) => d.etiqueta).filter(Boolean)).toEqual(["1", "5", "10", "15", "20", "25", "30"]);
  });

  it("un día sin fila en la serie es un cero de un día ya pasado, no un hueco", () => {
    const g2 = serieParaGrafico([], HOY);
    expect(g2.semana[0].valor).toBe(0);
    expect(g2.semana[0].meta).toBeNull();
  });

  it("acumulado: las ventas se cortan en hoy y la meta sigue hasta fin de mes", () => {
    const a = acumulado(g.mes);
    expect(a.ventas[0]).toBe(0);
    expect(a.ventas[28]).toBe(2000); // hasta el 29
    expect(a.ventas[29]).toBeNull();
    expect(a.meta[29]).toBe(30000);
  });
});

describe("leerSoles", () => {
  it("entiende cómo se tipea en Perú", () => {
    expect(leerSoles("12500")).toBe(12500);
    expect(leerSoles("12,500")).toBe(12500);
    expect(leerSoles("1,234,567")).toBe(1234567);
    expect(leerSoles("12500.5")).toBe(12500.5);
    expect(leerSoles("S/ 12 500")).toBe(12500);
    expect(leerSoles("12,5")).toBe(12.5);
  });

  it("lo que no se entiende es NaN, no cero", () => {
    expect(leerSoles("")).toBeNaN();
    expect(leerSoles("abc")).toBeNaN();
  });
});

describe("validarCambioMeta: las mismas reglas que la base, dichas antes de enviar", () => {
  const base = { metaTexto: "9000", volverAutomatica: false, motivo: "cambia_horario" as const, detalle: "", metaSedeMes: 30000 };

  it("un cambio completo pasa", () => {
    expect(validarCambioMeta(base)).toEqual({ ok: true, meta: 9000, motivo: "cambia_horario", detalle: null });
  });

  it("no acepta cero, negativos ni algo que no es número", () => {
    for (const t of ["0", "-5", "", "abc"]) expect(validarCambioMeta({ ...base, metaTexto: t })).toMatchObject({ ok: false, campo: "meta" });
  });

  it("no deja pasar de la meta de la sede (guarda contra un error de tipeo)", () => {
    expect(validarCambioMeta({ ...base, metaTexto: "30001" })).toMatchObject({ ok: false, campo: "meta" });
    expect(validarCambioMeta({ ...base, metaTexto: "30000" })).toMatchObject({ ok: true });
  });

  it("pide motivo, y «otro» pide contar cuál (hasta 80 letras)", () => {
    expect(validarCambioMeta({ ...base, motivo: "" })).toMatchObject({ ok: false, campo: "motivo" });
    expect(validarCambioMeta({ ...base, motivo: "otro" })).toMatchObject({ ok: false, campo: "detalle" });
    expect(validarCambioMeta({ ...base, motivo: "otro", detalle: "   " })).toMatchObject({ ok: false, campo: "detalle" });
    expect(validarCambioMeta({ ...base, motivo: "otro", detalle: "vuelve de licencia" })).toMatchObject({ ok: true, detalle: "vuelve de licencia" });
    expect(validarCambioMeta({ ...base, motivo: "otro", detalle: "x".repeat(81) })).toMatchObject({ ok: false, campo: "detalle" });
  });

  it("volver a la automática no pide motivo ni cifra", () => {
    expect(validarCambioMeta({ ...base, volverAutomatica: true, metaTexto: "", motivo: "" })).toEqual({ ok: true, meta: null, motivo: null, detalle: null });
  });

  it("sin meta de la sede no hay tope que comparar", () => {
    expect(validarCambioMeta({ ...base, metaSedeMes: null, metaTexto: "999999" })).toMatchObject({ ok: true });
  });
});

describe("puedeEditarMeta: quién puede tocar qué fila", () => {
  const ok = { personaFilaId: "ana", personaCuentaId: "lidia", esAdmin: false, metaSedeMes: 30000, metaAutoMes: 8000 };

  it("la líder de la sede edita a otra persona", () => {
    expect(puedeEditarMeta(ok)).toEqual({ puede: true });
  });

  it("nadie cambia la suya salvo un Admin (D-147)", () => {
    expect(puedeEditarMeta({ ...ok, personaFilaId: "lidia" })).toMatchObject({ puede: false, motivo: "Tu propia meta la cambia un Admin" });
    expect(puedeEditarMeta({ ...ok, personaFilaId: "lidia", esAdmin: true })).toEqual({ puede: true });
  });

  it("sin meta de la sede, o sin horas, no hay meta que ajustar", () => {
    expect(puedeEditarMeta({ ...ok, metaSedeMes: null })).toMatchObject({ puede: false });
    expect(puedeEditarMeta({ ...ok, metaAutoMes: null })).toMatchObject({ puede: false });
  });

  it("una cuenta sin persona (Admin de terminal) no se confunde con la fila", () => {
    expect(puedeEditarMeta({ ...ok, personaCuentaId: null })).toEqual({ puede: true });
  });
});
