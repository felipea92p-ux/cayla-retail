import { describe, expect, it } from "vitest";
import {
  dejaMenosDelFondo,
  estadoCampana,
  explicarMeta,
  leerParametrosFinanzas,
  validarParametrosFinanzas,
  minutosDeHora,
  proyeccionAlCierre,
  leerParametrosCaja,
  leerConfiguracionMetas,
  validarMetaFecha,
  validarSemanaMes,
  ordenarCampanas,
  parsearMonto,
  parsearPorcentaje,
  textoEfecto,
  trasladoParaDejarFondo,
  validarTienda,
} from "./configuracion-reglas";

const soles = (n: number) => `S/\u00a0${n.toLocaleString("en-US")}`;

describe("montos y porcentajes", () => {
  it("lee montos con coma, con S/ y vacíos", () => {
    expect(parsearMonto("1,500")).toEqual({ ok: true, valor: 1500 });
    expect(parsearMonto("S/ 300.50")).toEqual({ ok: true, valor: 300.5 });
    expect(parsearMonto("")).toEqual({ ok: true, valor: null });
    expect(parsearMonto("-5").ok).toBe(false);
    expect(parsearMonto("abc").ok).toBe(false);
  });
  it("lee porcentajes con signo; vacío es 0; fuera de rango se rechaza como en la base", () => {
    expect(parsearPorcentaje("+25")).toEqual({ ok: true, valor: 25 });
    expect(parsearPorcentaje("-15 %")).toEqual({ ok: true, valor: -15 });
    expect(parsearPorcentaje("")).toEqual({ ok: true, valor: 0 });
    expect(parsearPorcentaje("-100").ok).toBe(false);
    expect(parsearPorcentaje("301").ok).toBe(false);
  });
});

describe("metas de una tienda", () => {
  it("7 metas y fondo; un 0 o vacío es «sin meta ese día»", () => {
    const r = validarTienda({ metas: ["1500", "1500", "", "0", "2000", "2,500", "2000"], fondo: "300" });
    expect(r).toEqual({ ok: true, valor: { metas: [1500, 1500, null, null, 2000, 2500, 2000], fondo: 300 } });
  });
  it("dice qué día está mal", () => {
    const r = validarTienda({ metas: ["1500", "x", "", "", "", "", ""], fondo: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/^Martes:/);
  });
});

describe("campañas", () => {
  const hoy = "2026-09-24";
  it("estado según las fechas", () => {
    expect(estadoCampana(null, null, hoy)).toBe("sin_fechas");
    expect(estadoCampana("2026-07-14", "2026-07-29", hoy)).toBe("paso");
    expect(estadoCampana("2026-09-23", "2026-10-01", hoy)).toBe("rige");
    expect(estadoCampana("2026-10-01", "2026-10-14", hoy)).toBe("viene");
  });
  it("orden: rigen y vienen por fecha, luego sin fechas, al final las pasadas", () => {
    const cs = [
      { nombre: "Fiestas Patrias", desde: "2026-07-14", hasta: "2026-07-29" },
      { nombre: "CyberWow", desde: null, hasta: null },
      { nombre: "Navidad", desde: "2026-12-11", hasta: "2026-12-25" },
      { nombre: "Aniversario CAYLA", desde: "2026-10-01", hasta: "2026-10-14" },
    ];
    expect(ordenarCampanas(cs, hoy).map((c) => c.nombre)).toEqual(["Aniversario CAYLA", "Navidad", "CyberWow", "Fiestas Patrias"]);
  });
  it("texto del efecto", () => {
    expect(textoEfecto({ meta_pct: 25, fondo: 400 }, soles)).toBe("+25 % · fondo S/\u00a0400");
    expect(textoEfecto({ meta_pct: -15, fondo: null }, soles)).toBe("−15 %");
    expect(textoEfecto(undefined, soles)).toBe("lo normal");
  });
});

describe("caja: meta de hoy y fondo al cerrar", () => {
  const fila = { meta: "1875", meta_base: "1500.00", meta_pct: "25.00", fondo: "400.00", fondo_base: "300.00",
    campanas: [{ id: "a", nombre: "Fiestas Patrias", meta_pct: "25.00", fondo: "400.00" }, { id: "b", nombre: "Día del Gato", meta_pct: "5.00", fondo: null }] };
  it("lee lo que devuelve fn_parametros_caja", () => {
    const p = leerParametrosCaja(fila)!;
    expect(p).toMatchObject({ meta: 1875, metaBase: 1500, metaPct: 25, fondo: 400, fondoBase: 300 });
    expect(p.campanas[1]).toEqual({ id: "b", nombre: "Día del Gato", meta_pct: 5, fondo: null });
  });
  it("explica la meta: lo normal, la campaña que manda y cuántas rigen", () => {
    expect(explicarMeta(leerParametrosCaja(fila)!, "Lunes", soles)).toBe(
      "Lo normal de un lunes es S/\u00a01,500; por Fiestas Patrias sube 25 %. Rigen 2 campañas: se usa la que más sube.",
    );
    expect(explicarMeta({ ...leerParametrosCaja(fila)!, campanas: [], metaPct: 0, meta: 1500 }, "Jueves", soles)).toBe("Lo normal de un jueves.");
    expect(explicarMeta({ ...leerParametrosCaja(fila)!, campanas: [], metaPct: 0, meta: 1500 }, "Jueves", soles, "Tienda TRU")).toBe(
      "Lo normal de un jueves en Tienda TRU. Hoy no rige ninguna campaña.",
    );
  });
  it("traslado propuesto = contado − fondo, nunca negativo; sin fondo, nada", () => {
    expect(trasladoParaDejarFondo(1030, 300)).toBe(730);
    expect(trasladoParaDejarFondo(200, 300)).toBe(0);
    expect(trasladoParaDejarFondo(500, null)).toBe(0);
  });
  it("deja menos del fondo: solo si hay fondo y queda menos", () => {
    expect(dejaMenosDelFondo(250, 300)).toBe(true);
    expect(dejaMenosDelFondo(300, 300)).toBe(false);
    expect(dejaMenosDelFondo(10, null)).toBe(false);
  });
  it("al ritmo de hoy: lo vendido por hora, por las horas que faltan hasta el cierre", () => {
    // Abrió 9:00, son las 17:40 (8 h 40 min), vendió S/ 1,120 y cierra a las 21:00 (faltan 3 h 20 min).
    expect(proyeccionAlCierre({ vendido: 1120, abrioMin: 540, ahoraMin: 1060, cierreMin: 1260 })).toBe(1551);
    expect(proyeccionAlCierre({ vendido: 1120, abrioMin: 540, ahoraMin: 1060, cierreMin: null })).toBeNull();
    expect(proyeccionAlCierre({ vendido: 80, abrioMin: 540, ahoraMin: 570, cierreMin: 1260 })).toBeNull(); // media hora abierta
    expect(proyeccionAlCierre({ vendido: 1500, abrioMin: 540, ahoraMin: 1270, cierreMin: 1260 })).toBeNull(); // ya cerró
    expect(minutosDeHora("21:00")).toBe(1260);
    expect(minutosDeHora("9:30")).toBe(570);
    expect(minutosDeHora("25:00")).toBeNull();
    expect(minutosDeHora(null)).toBeNull();
  });
  it("Caja y avisos: los mismos límites que la base", () => {
    expect(validarParametrosFinanzas({ minimoCaja: "15,000", avisoGastoPct: "25", avisoVenceDias: "7" })).toEqual({ ok: true, valor: { minimoCaja: 15000, avisoGastoPct: 25, avisoVenceDias: 7 } });
    expect(validarParametrosFinanzas({ minimoCaja: "-5", avisoGastoPct: "25", avisoVenceDias: "7" }).ok).toBe(false);
    expect(validarParametrosFinanzas({ minimoCaja: "0", avisoGastoPct: "0", avisoVenceDias: "7" }).ok).toBe(false);
    expect(validarParametrosFinanzas({ minimoCaja: "0", avisoGastoPct: "25", avisoVenceDias: "61" }).ok).toBe(false);
    expect(validarParametrosFinanzas({ minimoCaja: "", avisoGastoPct: "25 %", avisoVenceDias: "3" })).toEqual({ ok: true, valor: { minimoCaja: 0, avisoGastoPct: 25, avisoVenceDias: 3 } });
    expect(leerParametrosFinanzas({ minimo_caja: "15000.00", aviso_gasto_pct: "25.00", aviso_vence_dias: 7 })).toEqual({ minimoCaja: 15000, avisoGastoPct: 25, avisoVenceDias: 7 });
  });
});

describe("metas por mes y por fecha (ADR-0435)", () => {
  it("la semana de un mes: 7 montos, vacío y 0 usan la semana tipo", () => {
    expect(validarSemanaMes(["2,730", "", "S/ 2930", "0", "3470", "4660.50", "3040"])).toEqual({ ok: true, valor: [2730, null, 2930, null, 3470, 4660.5, 3040] });
    expect(validarSemanaMes(["", "", "", "", "", "", ""])).toEqual({ ok: true, valor: Array(7).fill(null) });
  });
  it("la semana de un mes rechaza lo que la base rechaza, diciendo qué día", () => {
    expect(validarSemanaMes(["1", "2"]).ok).toBe(false);
    expect(validarSemanaMes(["", "", "", "", "", "", "-5"])).toEqual({ ok: false, error: "Domingo: No puede ser negativo." });
    expect(validarSemanaMes(["", "mil", "", "", "", "", ""])).toEqual({ ok: false, error: "Martes: No se entiende el monto: escríbelo así, 1299.50 o 1299,50." }); // ADR-0433 act. 2: un texto que no es número dice «no se entiende», no «escribe un monto»
    expect(validarSemanaMes(["10000000", "", "", "", "", "", ""])).toEqual({ ok: false, error: "Lunes: Tiene que ser menor a 10 millones." });
    expect(validarSemanaMes(["9999999.99", "", "", "", "", "", ""]).ok).toBe(true);
  });
  it("la meta de una fecha: desde hoy, con meta (0 = no abre) y nota de hasta 140 letras", () => {
    const hoy = "2026-10-17";
    expect(validarMetaFecha({ fecha: "2026-12-24", meta: "12,280", nota: "  Nochebuena " }, hoy)).toEqual({ ok: true, valor: { fecha: "2026-12-24", meta: 12280, nota: "Nochebuena" } });
    expect(validarMetaFecha({ fecha: "2026-12-25", meta: "0", nota: "" }, hoy)).toEqual({ ok: true, valor: { fecha: "2026-12-25", meta: 0, nota: null } });
    expect(validarMetaFecha({ fecha: hoy, meta: "100", nota: "" }, hoy).ok).toBe(true);
    expect(validarMetaFecha({ fecha: "2026-10-16", meta: "100", nota: "" }, hoy)).toEqual({ ok: false, error: "Esa fecha ya pasó." });
    expect(validarMetaFecha({ fecha: "", meta: "100", nota: "" }, hoy)).toEqual({ ok: false, error: "Elige la fecha." });
    expect(validarMetaFecha({ fecha: "2026-12-24", meta: "", nota: "" }, hoy)).toEqual({ ok: false, error: "Escribe la meta de ese día (0 si la tienda no abre)." });
    expect(validarMetaFecha({ fecha: "2026-12-24", meta: "-1", nota: "" }, hoy).ok).toBe(false);
    expect(validarMetaFecha({ fecha: "2026-12-24", meta: "10000000", nota: "" }, hoy).ok).toBe(false);
    expect(validarMetaFecha({ fecha: "2026-12-24", meta: "100", nota: "a".repeat(141) }, hoy)).toEqual({ ok: false, error: "La nota puede tener hasta 140 letras." });
    expect(validarMetaFecha({ fecha: "2026-12-24", meta: "100", nota: "a".repeat(140) }, hoy).ok).toBe(true);
  });
  it("lee lo que devuelve fn_configuracion_metas, con los meses sin cargar vacíos", () => {
    const data = {
      hoy: "2026-10-17",
      meses: ["2026-10-01", "2026-11-01"],
      tiendas: [
        {
          id: "t1",
          nombre: "Tienda TRU",
          tipica: [2730, 2730, 2930, 3040, 3470, 4660, 3040],
          meses: { "2026-10-01": { metas: [2730, 2730, null, null, null, null, null], total: "101570.00" }, "2026-11-01": { metas: [null, null, null, null, null, null, null], total: "96066.00" } },
        },
      ],
      fechas: [{ ubicacion_id: "t1", fecha: "2026-12-24", meta: "12280.00", nota: "Nochebuena" }, { ubicacion_id: "t1", fecha: "2026-12-25", meta: "0.00", nota: null }],
    };
    const c = leerConfiguracionMetas(data)!;
    expect(c.hoy).toBe("2026-10-17");
    expect(c.tiendas[0]!.tipica[3]).toBe(3040);
    expect(c.tiendas[0]!.meses.map((m) => m.mes)).toEqual(["2026-10-01", "2026-11-01"]);
    expect(c.tiendas[0]!.meses[0]!.metas[0]).toBe(2730);
    expect(c.tiendas[0]!.meses[0]!.total).toBe(101570);
    expect(c.tiendas[0]!.meses[1]!.metas.every((m) => m === null)).toBe(true);
    expect(c.fechas).toEqual([
      { ubicacionId: "t1", fecha: "2026-12-24", meta: 12280, nota: "Nochebuena" },
      { ubicacionId: "t1", fecha: "2026-12-25", meta: 0, nota: null },
    ]);
  });
  it("sin la forma esperada (la base todavía no tiene la migración) no se cae: devuelve null", () => {
    expect(leerConfiguracionMetas(null)).toBeNull();
    expect(leerConfiguracionMetas({})).toBeNull();
    expect(leerConfiguracionMetas("x")).toBeNull();
  });
});
