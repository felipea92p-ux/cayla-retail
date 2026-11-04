import { describe, expect, it } from "vitest";
import {
  asignacionDeVista,
  repartoEnPalabras,
  avance,
  columnaDePersona,
  leerSoles,
  lecturaDeRitmo,
  minutosDeHora,
  minutosEnLima,
  primerDiaDelMes,
  puedeEditarMeta,
  etiquetaDeHora,
  prendasPorVentaEnDias,
  proyectarMes,
  ventasPorHoraEnDias,
  rangoDeLectura,
  repartePorHoras,
  resumenDeSede,
  ritmoDelTurno,
  turnoDeHoy,
  ultimoDiaDelMes,
  validarCambioMeta,
  ventanaDeVista,
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

describe("repartoEnPalabras", () => {
  const con = (tipo: "cuadra" | "faltan" | "pasa", diferencia: number) => ({ tipo, asignado: 1000, metaSede: 1000, diferencia });
  it("dice cuánto suman las metas contra la de la tienda, en los tres casos", () => {
    expect(repartoEnPalabras(con("pasa", -800), 6).replace(/\s/g, " ")).toBe("Las metas de las 6 personas suman S/ 800 más que la meta de la tienda: el equipo apunta más alto.");
    expect(repartoEnPalabras(con("faltan", 800), 6).replace(/\s/g, " ")).toBe("Las metas de las 6 personas suman S/ 800 menos que la meta de la tienda: falta repartir.");
    expect(repartoEnPalabras(con("cuadra", 0), 6)).toBe("Las metas de las 6 personas suman lo mismo que la meta de la tienda.");
  });
  it("habla de una persona, y de lo que todavía no se guarda", () => {
    expect(repartoEnPalabras(con("cuadra", 0), 1)).toBe("La meta de 1 persona suma lo mismo que la meta de la tienda.");
    expect(repartoEnPalabras(con("pasa", -800), 6, true).replace(/\s/g, " ")).toContain("sumarían S/ 800 más");
  });
  it("sin meta de la tienda no hay qué repartir", () => {
    expect(repartoEnPalabras({ tipo: "sin_meta" }, 6)).toBe("Sin meta de la tienda no hay qué repartir.");
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

describe("ritmo esperado (D-159): cuánto del turno ya pasó y cómo va contra eso", () => {
  const turno = { entradaHoy: "09:00", salidaHoy: "18:00" };

  it("lee las horas «09:00» y «09:00:00» y no inventa las que no entiende", () => {
    expect(minutosDeHora("09:00")).toBe(540);
    expect(minutosDeHora("18:30:00")).toBe(1110);
    expect(minutosDeHora("25:00")).toBeNull();
    expect(minutosDeHora("abc")).toBeNull();
    expect(minutosDeHora(null)).toBeNull();
  });

  it("los minutos de Lima: 16:00 UTC son las 11:00 de Lima (UTC−5, todo el año)", () => {
    expect(minutosEnLima(new Date("2026-09-29T16:00:00Z"))).toBe(660);
    // Pasada la medianoche UTC todavía es de tarde en Lima: el corte no se equivoca de día.
    expect(minutosEnLima(new Date("2026-09-30T02:30:00Z"))).toBe(21 * 60 + 30);
  });

  it("a mitad del turno el ritmo es 0.5; antes de empezar 0; después de terminar 1", () => {
    expect(ritmoDelTurno(turno, 13 * 60 + 30)).toBe(0.5);
    expect(ritmoDelTurno(turno, 8 * 60)).toBe(0);
    expect(ritmoDelTurno(turno, 19 * 60)).toBe(1);
  });

  it("sin turno cargado, o con un turno al revés, no hay ritmo (nunca un 0 que mienta)", () => {
    expect(ritmoDelTurno({ entradaHoy: null, salidaHoy: null }, 600)).toBeNull();
    expect(ritmoDelTurno({ entradaHoy: "18:00", salidaHoy: "09:00" }, 600)).toBeNull();
  });

  it("dice Adelante, En ritmo o Por debajo con 10 puntos de margen", () => {
    expect(lecturaDeRitmo(350, 500, 0.5)).toBe("Adelante"); // 70 % contra 50 %
    expect(lecturaDeRitmo(250, 500, 0.5)).toBe("En ritmo"); // 50 % contra 50 %
    expect(lecturaDeRitmo(150, 500, 0.5)).toBe("Por debajo"); // 30 % contra 50 %
    expect(lecturaDeRitmo(300, 500, 0.5)).toBe("Adelante"); // justo 10 puntos arriba (60 % contra 50 %)
    expect(lecturaDeRitmo(200, 500, 0.5)).toBe("Por debajo"); // justo 10 puntos abajo (40 % contra 50 %)
    expect(lecturaDeRitmo(275, 500, 0.5)).toBe("En ritmo"); // 5 puntos arriba todavía es «en ritmo»
    expect(lecturaDeRitmo(225, 500, 0.5)).toBe("En ritmo"); // 5 puntos abajo también
  });

  it("no dice nada si el turno no empezó, no hay turno o no hay meta de hoy", () => {
    expect(lecturaDeRitmo(0, 500, 0)).toBeNull();
    expect(lecturaDeRitmo(0, 500, null)).toBeNull();
    expect(lecturaDeRitmo(100, null, 0.5)).toBeNull();
    expect(lecturaDeRitmo(100, 0, 0.5)).toBeNull();
  });
});

// ── Proyección del mes ────────────────────────────────────────────────────────────────────────────

describe("proyectarMes", () => {
  /** Setiembre 2026: [día, vendido, meta]. Los días que no se listan no existen en la serie. */
  const dia = (n: number, total: number, meta: number | null) => ({
    fecha: `2026-09-${String(n).padStart(2, "0")}`,
    total,
    ventas: total > 0 ? 3 : 0,
    metaSede: meta,
    metaAsignada: null,
  });
  const MES = (vendidos: Record<number, number>, meta: number | null = 500) =>
    Array.from({ length: 30 }, (_, i) => dia(i + 1, vendidos[i + 1] ?? 0, meta));

  it("lo vendido + el promedio de los días cerrados × los días que quedan", () => {
    // Del 1 al 9 vendió 400 por día (3.600); hoy es el 10 y lleva 100; quedan 20 días de trabajo.
    const p = proyectarMes(MES({ 1: 400, 2: 400, 3: 400, 4: 400, 5: 400, 6: 400, 7: 400, 8: 400, 9: 400, 10: 100 }), "2026-09-10")!;
    expect(p.vendido).toBe(3700);
    expect(p.ritmoPorDia).toBe(400);
    expect(p.diasQueQuedan).toBe(20);
    expect(p.proyeccion).toBe(3700 + 400 * 20);
    expect(p.metaMes).toBe(15000);
    expect(p.pctDeMeta).toBe(Math.round(((3700 + 8000) / 15000) * 100));
  });

  it("hoy no entra al promedio: un día a medias no lo baja", () => {
    const serie = MES({ 1: 400, 2: 400, 3: 400, 10: 0 });
    expect(proyectarMes(serie, "2026-09-10")!.ritmoPorDia).toBeCloseTo((400 * 3) / 9, 5);
  });

  it("con menos de 3 días cerrados con ventas no proyecta (no se inventa)", () => {
    expect(proyectarMes(MES({ 1: 400, 2: 400 }), "2026-09-10")).toBeNull();
    expect(proyectarMes(MES({}), "2026-09-10")).toBeNull();
  });

  it("los días sin parte de la meta (cerrado) no cuentan: ni bajan el promedio ni suman días", () => {
    const serie = MES({ 1: 400, 2: 400, 3: 400 }).map((d) => (d.fecha.endsWith("-07") || d.fecha.endsWith("-14") ? { ...d, metaSede: null } : d));
    const p = proyectarMes(serie, "2026-09-10")!;
    expect(p.ritmoPorDia).toBeCloseTo(1200 / 8, 5); // del 1 al 9 son 9 días, menos el 7 cerrado
    expect(p.diasQueQuedan).toBe(19); // del 11 al 30 son 20, menos el 14 cerrado
  });

  it("sin ninguna meta cargada proyecta igual (con todos los días) y no dice porcentaje", () => {
    const p = proyectarMes(MES({ 1: 400, 2: 400, 3: 400 }, null), "2026-09-10")!;
    expect(p.metaMes).toBeNull();
    expect(p.pctDeMeta).toBeNull();
    expect(p.diasQueQuedan).toBe(20);
  });

  it("el último día del mes proyecta exactamente lo vendido", () => {
    const p = proyectarMes(MES({ 1: 400, 2: 400, 3: 400, 30: 100 }), "2026-09-30")!;
    expect(p.diasQueQuedan).toBe(0);
    expect(p.proyeccion).toBe(p.vendido);
  });
});

// ── Ventas por hora y prendas por venta ──────────────────────────────────────────────────────────

describe("ventasPorHoraEnDias / prendasPorVentaEnDias", () => {
  const f = (fecha: string, hora: number, ventas: number, total: number, prendas: number) => ({ fecha, hora, ventas, total, prendas });
  const DETALLE = [
    f("2026-09-29", 10, 2, 180, 3),
    f("2026-09-29", 17, 3, 420, 5),
    f("2026-09-28", 17, 1, 100, 1),
    f("2026-09-10", 12, 4, 300, 6),
  ];
  const HOY = "2026-09-29";

  it("en «hoy» suma solo las horas de hoy y rellena con 0 las que no vendieron", () => {
    const r = ventasPorHoraEnDias(DETALLE, ventanaDeVista("hoy", HOY));
    expect(r.ventas).toBe(5);
    expect(r.horas[0].hora).toBe(9);
    expect(r.horas.at(-1)!.hora).toBe(20);
    expect(r.horas.find((h) => h.hora === 17)).toEqual({ hora: 17, ventas: 3, total: 420 });
    expect(r.horas.find((h) => h.hora === 11)).toEqual({ hora: 11, ventas: 0, total: 0 });
  });

  it("la mejor franja es la hora con más soles", () => {
    expect(ventasPorHoraEnDias(DETALLE, ventanaDeVista("hoy", HOY)).mejor).toEqual({ hora: 17, total: 420, ventas: 3 });
  });

  it("en «mes» junta todos los días del mes, hora por hora", () => {
    const r = ventasPorHoraEnDias(DETALLE, ventanaDeVista("mes", HOY));
    expect(r.horas.find((h) => h.hora === 17)).toEqual({ hora: 17, ventas: 4, total: 520 });
    expect(r.ventas).toBe(10);
  });

  it("sin ventas en la ventana no hay mejor franja y las barras van en 0", () => {
    const r = ventasPorHoraEnDias([], ventanaDeVista("hoy", HOY));
    expect(r.mejor).toBeNull();
    expect(r.ventas).toBe(0);
    expect(r.horas.every((h) => h.total === 0)).toBe(true);
  });

  it("una venta fuera del horario de siempre estira el tramo en vez de perderse", () => {
    const r = ventasPorHoraEnDias([f(HOY, 22, 1, 50, 1), f(HOY, 7, 1, 30, 1)], ventanaDeVista("hoy", HOY));
    expect(r.horas[0].hora).toBe(7);
    expect(r.horas.at(-1)!.hora).toBe(22);
    expect(r.horas.map((h) => h.hora)).toEqual(Array.from({ length: 16 }, (_, i) => 7 + i)); // sin huecos
  });

  it("en un empate gana la hora más temprana", () => {
    expect(ventasPorHoraEnDias([f(HOY, 15, 1, 100, 1), f(HOY, 11, 1, 100, 1)], ventanaDeVista("hoy", HOY)).mejor?.hora).toBe(11);
  });

  it("prendas por venta: prendas ÷ ventas de la ventana", () => {
    expect(prendasPorVentaEnDias(DETALLE, ventanaDeVista("hoy", HOY))).toEqual({ prendas: 8, ventas: 5, porVenta: 1.6 });
    expect(prendasPorVentaEnDias(DETALLE, ventanaDeVista("mes", HOY)).porVenta).toBeCloseTo(15 / 10, 5);
  });

  it("sin ventas no divide por cero", () => {
    expect(prendasPorVentaEnDias([], ventanaDeVista("hoy", HOY))).toEqual({ prendas: 0, ventas: 0, porVenta: null });
  });

  it("etiquetaDeHora: «9 a. m.», «12 p. m.», «5 p. m.»", () => {
    expect([9, 12, 17, 20].map(etiquetaDeHora)).toEqual(["9 a. m.", "12 p. m.", "5 p. m.", "8 p. m."]);
  });
});
