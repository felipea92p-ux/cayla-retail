import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DIAS_LEIDOS,
  DIAS_SOSTENIDOS,
  UMBRAL_IDENTIFICADA,
  diaAntes,
  faltasDe,
  fechaCorta,
  fraseDelMotor,
  identificadaEnVentana,
  leerPreparacion,
  preparacionDeSede,
  rachaIdentificada,
  type DiaVenta,
  type FilaPreparacion,
} from "./motor-demanda-reglas";

const HOY = "2026-10-20";
/** Días con venta de ayer hacia atrás: `n` días, cada uno con `u` unidades e `i` identificadas. */
const dias = (n: number, u: number, i: number, desde = 1): DiaVenta[] =>
  Array.from({ length: n }, (_, k) => ({ dia: diaAntes(HOY, desde + k), unidades: u, identificadas: i })).reverse();

const fila = (o: Partial<FilaPreparacion> = {}): FilaPreparacion => ({
  ubicacionId: "u1",
  nombre: "Tienda TRU",
  hoy: HOY,
  primeraVenta: "2026-09-30",
  cuadradoEn: "2026-10-04T15:00:00+00:00",
  almacenContado: true,
  dias: dias(20, 10, 10),
  ...o,
});

describe("las decisiones de Felipe (2026-10-05)", () => {
  it("90 % durante 14 días", () => {
    expect(UMBRAL_IDENTIFICADA).toBe(0.9);
    expect(DIAS_SOSTENIDOS).toBe(14);
  });
  it("la ventana que se lee es la de la migración", () => {
    const sql = readFileSync(
      join(__dirname, "..", "..", "..", "supabase", "migrations", "20261005223000_motor_demanda_preparacion_sin_sede.sql"),
      "utf8"
    );
    expect(sql).toMatch(new RegExp(`c_dias constant integer := ${DIAS_LEIDOS};`));
  });
});

describe("diaAntes y fechaCorta", () => {
  it("cruza meses y años sin moverse por el huso horario", () => {
    expect(diaAntes("2026-10-01", 1)).toBe("2026-09-30");
    expect(diaAntes("2027-01-01", 1)).toBe("2026-12-31");
    expect(diaAntes("2026-10-05", 0)).toBe("2026-10-05");
  });
  it("se lee en tienda", () => {
    expect(fechaCorta("2026-10-05")).toBe("5 oct.");
    expect(fechaCorta("2026-09-30")).toBe("30 set.");
  });
});

describe("rachaIdentificada", () => {
  it("cuenta de ayer hacia atrás y hoy no cuenta (aunque hoy vaya mal)", () => {
    const d = [...dias(20, 10, 10), { dia: HOY, unidades: 10, identificadas: 0 }];
    expect(rachaIdentificada(d, HOY, "2026-09-30").dias).toBe(20);
  });
  it("corta en el primer día bajo el 90 %, y dice cuál fue", () => {
    const d = dias(20, 10, 10).map((x) => (x.dia === diaAntes(HOY, 6) ? { ...x, identificadas: 8 } : x));
    expect(rachaIdentificada(d, HOY, "2026-09-30")).toEqual({ dias: 5, ultimoDiaBajo: diaAntes(HOY, 6) });
  });
  it("exactamente 90 % no corta; 89 % sí", () => {
    expect(rachaIdentificada(dias(15, 10, 9), HOY, "2026-09-30").dias).toBe(20);
    const d = dias(15, 100, 89);
    expect(rachaIdentificada(d, HOY, "2026-09-30")).toEqual({ dias: 0, ultimoDiaBajo: diaAntes(HOY, 1) });
  });
  it("un día sin ventas no corta la racha", () => {
    const d = dias(20, 10, 10).filter((x) => x.dia !== diaAntes(HOY, 3));
    expect(rachaIdentificada(d, HOY, "2026-09-30").dias).toBe(20);
  });
  it("no empieza antes de la primera venta", () => {
    expect(rachaIdentificada(dias(5, 10, 10), HOY, diaAntes(HOY, 5)).dias).toBe(5);
    expect(rachaIdentificada([], HOY, null).dias).toBe(0);
    expect(rachaIdentificada([], HOY, HOY).dias).toBe(0);
  });
  it("no pasa de lo que se leyó", () => {
    expect(rachaIdentificada(dias(40, 10, 10), HOY, "2025-01-01").dias).toBe(DIAS_LEIDOS - 1);
  });
});

describe("identificadaEnVentana", () => {
  it("suma unidades, no promedia días: un día grande pesa más", () => {
    const d: DiaVenta[] = [
      { dia: diaAntes(HOY, 1), unidades: 90, identificadas: 90 },
      { dia: diaAntes(HOY, 2), unidades: 10, identificadas: 0 },
    ];
    expect(identificadaEnVentana(d, HOY, 14)).toBe(0.9);
  });
  it("deja fuera hoy y lo de antes de la ventana; sin ventas, null", () => {
    const d: DiaVenta[] = [
      { dia: HOY, unidades: 10, identificadas: 0 },
      { dia: diaAntes(HOY, 15), unidades: 10, identificadas: 0 },
      { dia: diaAntes(HOY, 14), unidades: 10, identificadas: 10 },
    ];
    expect(identificadaEnVentana(d, HOY, 14)).toBe(1);
    expect(identificadaEnVentana([], HOY, 14)).toBeNull();
  });
});

describe("preparacionDeSede", () => {
  it("con las tres condiciones, el motor habla y no falta nada", () => {
    const p = preparacionDeSede(fila());
    expect(p.puedeHablar).toBe(true);
    expect(faltasDe(p)).toEqual([]);
    expect(fraseDelMotor(p)).toBe("Ya puedo recomendar en Tienda TRU.");
  });
  it("TRU al 6-oct (sus ventas reales del 30-sep al 5-oct: 58 de 161 con su prenda), piso cuadrado y almacén sin contar", () => {
    const p = preparacionDeSede(
      fila({
        hoy: "2026-10-06",
        primeraVenta: "2026-09-30",
        almacenContado: false,
        dias: [
          { dia: "2026-09-30", unidades: 6, identificadas: 1 },
          { dia: "2026-10-01", unidades: 3, identificadas: 2 },
          { dia: "2026-10-02", unidades: 21, identificadas: 6 },
          { dia: "2026-10-03", unidades: 68, identificadas: 22 },
          { dia: "2026-10-04", unidades: 50, identificadas: 20 },
          { dia: "2026-10-05", unidades: 13, identificadas: 7 },
        ],
      })
    );
    expect(p.puedeHablar).toBe(false);
    expect(p.racha).toEqual({ dias: 0, ultimoDiaBajo: "2026-10-05" });
    expect(p.condiciones.map((c) => c.cumple)).toEqual([false, true, false]);
    expect(p.condiciones[0].detalle).toBe("36 % de lo vendido en los últimos 14 días tiene su prenda; lleva 0 días de 14.");
    expect(p.condiciones[0].falta).toContain("el último día por debajo fue el 5 oct.");
    expect(fraseDelMotor(p)).toBe("Aún no puedo recomendar en Tienda TRU. Falta: 14 días más de ventas con su prenda y contar el almacén.");
  });
  it("una sede que no vende en el ERP lo dice, sin porcentajes inventados", () => {
    const p = preparacionDeSede(fila({ primeraVenta: null, dias: [], cuadradoEn: null, almacenContado: false }));
    expect(p.identificada14).toBeNull();
    expect(p.condiciones[0].detalle).toBe("Todavía no hay ventas de esta tienda en el ERP.");
    expect(faltasDe(p)).toHaveLength(3);
    expect(fraseDelMotor(p)).toBe(
      "Aún no puedo recomendar en Tienda TRU. Falta: 14 días más de ventas con su prenda, cuadrar el piso y contar el almacén."
    );
  });
  it("a mitad de camino: lleva 9 días, le faltan 5", () => {
    const d = [...dias(9, 10, 10), { dia: diaAntes(HOY, 10), unidades: 10, identificadas: 5 }];
    const p = preparacionDeSede(fila({ dias: d }));
    expect(p.racha.dias).toBe(9);
    expect(p.condiciones[0].detalle).toContain("lleva 9 días de 14");
    expect(fraseDelMotor(p)).toBe("Aún no puedo recomendar en Tienda TRU. Falta: 5 días más de ventas con su prenda.");
  });
  it("hoy se informa aparte y no cambia el veredicto", () => {
    const p = preparacionDeSede(fila({ dias: [...dias(20, 10, 10), { dia: HOY, unidades: 4, identificadas: 1 }] }));
    expect(p.identificadaHoy).toBe(0.25);
    expect(p.puedeHablar).toBe(true);
  });
});

describe("leerPreparacion", () => {
  it("lee la fila de la base y ordena los días", () => {
    const [f] = leerPreparacion([
      {
        ubicacion_id: "u1",
        nombre: "Tienda AQP",
        hoy: "2026-10-05",
        primera_venta: "2026-09-30",
        cuadrado_en: null,
        almacen_contado: false,
        dias: [
          { dia: "2026-10-02", unidades: 48, identificadas: 0 },
          { dia: "2026-09-30", unidades: 27, identificadas: 1 },
        ],
      },
    ]);
    expect(f.dias.map((d) => d.dia)).toEqual(["2026-09-30", "2026-10-02"]);
    expect(f.cuadradoEn).toBeNull();
    expect(f.almacenContado).toBe(false);
  });
  it("descarta lo que no calza y nunca da más identificadas que unidades", () => {
    const filas = leerPreparacion([
      null,
      { nombre: "sin id", hoy: "2026-10-05" },
      { ubicacion_id: "u2", nombre: "X", hoy: "2026-10-05", almacen_contado: "sí", dias: [{ dia: "mal" }, { dia: "2026-10-01", unidades: 2, identificadas: 5 }] },
    ]);
    expect(filas).toHaveLength(1);
    expect(filas[0].almacenContado).toBe(false);
    expect(filas[0].dias).toEqual([{ dia: "2026-10-01", unidades: 2, identificadas: 2 }]);
    expect(leerPreparacion("nada")).toEqual([]);
  });
});
