import { describe, expect, it } from "vitest";
import {
  COLUMNAS_COMPRAS,
  COLUMNAS_VENTAS,
  aniosDeRegimen,
  avisoUmbral,
  csvRegistroCompras,
  csvRegistroVentas,
  csvResumenIgv,
  delAnio,
  diaDelRegistro,
  estadoMes,
  fechaPle,
  leerFilaCompras,
  leerFilaVentas,
  leerPanelImpuestos,
  leerParametro,
  mesCorto,
  parsearParametro,
  periodoPle,
  porcentaje,
  proyectarUmbral,
  sumarMeses,
  tipoDocProveedor,
  tonoAvance,
  valorEnCasilla,
  vigenteEnAnio,
} from "./impuestos-reglas";
import { crc32, crearZip } from "./zip-simple";
import { textoCsv } from "./exportar-csv";

// Finanzas ▸ Impuestos (ADR-0195 F8): lo que la pantalla decide sola. Lo que decide la base (débito, crédito, saldo a
// favor, permisos) lo prueba `pnpm pruebas:impuestos`.

const mesIgv = (mes: string, aPagar = 0, saldoAFavor = 0) => ({ mes, aPagar, saldoAFavor, debito: 0, credito: 0 });

describe("meses", () => {
  it("suma y resta meses cruzando el año", () => {
    expect(sumarMeses("2026-11", 2)).toBe("2027-01");
    expect(sumarMeses("2026-01", -1)).toBe("2025-12");
  });
  it("«Ago» como la tabla del spike", () => {
    expect(mesCorto("2026-08")).toBe("Ago");
    expect(mesCorto("2026-09")).toBe("Sep");
  });
});

describe("el estado de cada mes", () => {
  it("el mes en curso todavía cambia; el anterior es el que se declara, aunque quede a favor", () => {
    expect(estadoMes(mesIgv("2026-09", 500), "2026-09")).toBe("en_curso");
    expect(estadoMes(mesIgv("2026-08", 0, 300), "2026-09")).toBe("por_declarar");
  });
  it("de antes no se afirma «declarado»: se dice si dejó algo a pagar, a favor o nada", () => {
    expect(estadoMes(mesIgv("2026-06", 800), "2026-09")).toBe("sin_pago");
    expect(estadoMes(mesIgv("2026-06", 0, 120), "2026-09")).toBe("a_favor");
    expect(estadoMes(mesIgv("2026-06"), "2026-09")).toBe("sin_movimiento");
  });
});

describe("el límite del régimen", () => {
  const meses = (desde: string, bases: number[]) => bases.map((base, i) => ({ mes: sumarMeses(desde, i), base }));

  it("sin crecimiento inventado: el ritmo es el promedio de los últimos 3 meses completos", () => {
    // 24 meses hasta sep-2026; vende 100 mil al mes desde abr-2026.
    const v = meses("2024-10", [...Array(18).fill(0), 100_000, 100_000, 100_000, 100_000, 100_000, 40_000]);
    const p = proyectarUmbral(v, "2026-09-12", 1_650_000, "2026-04");
    expect(p.ritmoMensual).toBe(100_000);
    // A diciembre, los 12 meses son el año: 5 meses vendidos (abr–ago) + sep con el ritmo + oct–dic con el ritmo.
    expect(p.proyectadoDiciembre).toBe(900_000);
    // Al ritmo, 12 meses son 1.2 M: nunca llega a 1.65 M.
    expect(p.mesCruce).toBeNull();
  });

  it("no llega nunca si 12 meses al ritmo no alcanzan el límite… y lo dice", () => {
    const v = meses("2024-10", [...Array(21).fill(0), 50_000, 50_000, 10_000]);
    const p = proyectarUmbral(v, "2026-09-10", 1_650_000, "2026-07");
    expect(p.mesCruce).toBeNull();
    expect(p.yaCruzado).toBe(false);
  });

  it("encuentra el mes en que los 12 meses pasan el límite, cuando los meses flojos van saliendo", () => {
    // 50 mil al mes hasta nov-2025; 150 mil desde dic-2025; septiembre va en 60 mil.
    const v = meses("2024-10", [...Array(14).fill(50_000), ...Array(9).fill(150_000), 60_000]);
    const p = proyectarUmbral(v, "2026-09-12", 1_650_000, "2024-10");
    expect(p.ritmoMensual).toBe(150_000);
    expect(p.yaCruzado).toBe(false); // hoy: 2 × 50 + 9 × 150 + 60 = 1.51 M
    expect(p.mesCruce).toBe("2026-10"); // sale oct-2025 (50) y entra oct-2026 (150): 1.7 M
  });

  it("si ya se pasó, lo dice y no busca un mes", () => {
    const v = meses("2024-10", Array(24).fill(100_000));
    const q = proyectarUmbral(v, "2026-09-30", 1_150_000, "2024-10");
    expect(q.yaCruzado).toBe(true);
    expect(q.mesCruce).toBeNull();
  });

  it("si el sistema recién empieza, el ritmo es el mes en curso llevado a mes completo", () => {
    const v = meses("2024-10", [...Array(23).fill(0), 30_000]);
    const p = proyectarUmbral(v, "2026-09-10", 1_650_000, "2026-09");
    expect(p.ritmoMensual).toBe(90_000); // 30 mil en 10 días de 30
    expect(p.mesesConDatos).toBe(1);
  });

  it("el tono: verde lejos, ámbar desde el 60 %, rojo al cruzar", () => {
    expect(tonoAvance(0.3)).toBe("verde");
    expect(tonoAvance(0.736)).toBe("ambar");
    expect(tonoAvance(1)).toBe("rojo");
    expect(tonoAvance(null)).toBe("neutro");
    expect(porcentaje(0.736)).toBe("73.6 %"); // es-PE: punto decimal, como los soles
  });
});

describe("leer lo que devuelve la base", () => {
  it("el panel, con los meses en «AAAA-MM» y lo que falta en null", () => {
    const p = leerPanelImpuestos({
      hoy: "2026-09-24",
      mes: "2026-08-01",
      mes_actual: "2026-09-01",
      foco: { mes: "2026-08-01", debito: "63.00", credito: 297, saldo_a_favor: 234, a_pagar: 0 },
      historial: [{ mes: "2026-09-01", debito: 10 }],
      parametros: { uit: { valor: 5500, anio: 2026, provisional: true }, regimen: { texto: "rmt", provisional: true }, renta: null },
      umbral: { ventas_12m: 67.71, umbral_soles: "1650000.00", avance: 0, cruzado: false, primer_mes: "2026-09-01", ventas_meses: [{ mes: "2026-09-01", base: 67.71 }] },
      renta: { base: 0, tasa: null, monto: null },
      revisar: { boletas: { n: 1, total: 100, gastos: 1, proveedores: ["Bodega"] } },
    });
    expect(p.mes).toBe("2026-08");
    expect(p.foco?.debito).toBe(63);
    expect(p.foco?.saldoAFavor).toBe(234);
    expect(p.historial[0]!.mes).toBe("2026-09");
    expect(p.parametros.uit).toEqual({ valor: 5500, anio: 2026, provisional: true });
    expect(p.parametros.regimen).toEqual({ texto: "rmt", provisional: true });
    expect(p.parametros.renta).toBeNull();
    expect(p.umbral.umbralSoles).toBe(1_650_000);
    expect(p.umbral.primerMes).toBe("2026-09");
    expect(p.renta.tasa).toBeNull();
    expect(p.revisar.boletas.proveedores).toEqual(["Bodega"]);
    expect(p.revisar.sinComprobante).toEqual({ n: 0, total: 0, alegra: 0 });
    // Sin el aviso (una base de antes de la fase 6 · actividad 8), nada perdido.
    expect(p.revisar.igvPerdido).toEqual({ n: 0, igv: 0 });
  });

  it("el aviso anticipado: las ventas del año, el aviso en soles y lo cargado de antes del sistema", () => {
    const p = leerPanelImpuestos({
      mes: "2026-10-01",
      parametros: {
        aviso_umbral_uit: { valor: "250.0000", provisional: false },
        ventas_previas: { valor: "300000.0000", provisional: false, anio: 2026 },
      },
      umbral: {
        anio: 2026, ventas_anio_erp: "1100000.00", ventas_previas: "300000.0000", previas_confirmadas: true, ventas_anio: "1400000.0000",
        aviso_soles: "1375000.00", anio_avance: "0.8485", aviso_alcanzado: true, anio_cruzado: false,
      },
    });
    expect(p.parametros.avisoUmbralUit).toEqual({ valor: 250, provisional: false });
    expect(p.parametros.ventasPrevias).toEqual({ valor: 300000, provisional: false, anio: 2026 });
    expect(p.umbral).toMatchObject({ anio: 2026, ventasAnioErp: 1_100_000, ventasPrevias: 300_000, previasConfirmadas: true, ventasAnio: 1_400_000, avisoSoles: 1_375_000, avisoAlcanzado: true, anioCruzado: false });
  });

  it("una base más vieja que esta web no trae el aviso: llega como «sin datos» y no se cae", () => {
    const p = leerPanelImpuestos({ mes: "2026-10-01", umbral: { ventas_12m: 100, umbral_soles: 1650000, avance: 0.0001, cruzado: false } });
    expect(p.parametros.avisoUmbralUit).toBeNull();
    expect(p.parametros.ventasPrevias).toBeNull();
    expect(p.umbral.ventasAnio).toBeNull();
    expect(avisoUmbral(p)).toMatchObject({ nivel: "sin_datos", titulo: null, quedaCorto: null });
  });

  it("el IGV perdido por pagar sin banco (fase 6 · actividad 8): cuántos pagos y cuánto IGV, ya restado del crédito", () => {
    const p = leerPanelImpuestos({ mes: "2026-10-01", revisar: { igv_perdido: { n: 2, igv: "152.54" } } });
    expect(p.revisar.igvPerdido).toEqual({ n: 2, igv: 152.54 });
  });
});

describe("el aviso anticipado del límite (parámetro)", () => {
  // Lo que arma la base con los parámetros: UIT 5 500, límite 300 UIT (1 650 000) y aviso 250 UIT (1 375 000). Aquí no hay ninguna de esas cifras escrita en el código que se prueba.
  const panel = (umbral: Record<string, unknown>, parametros: Record<string, unknown> = {}) =>
    leerPanelImpuestos({
      mes: "2026-10-01",
      parametros: { umbral_uit: { valor: 300, provisional: false }, renta: { valor: 0.01, provisional: false }, ...parametros },
      umbral: {
        anio: 2026, primer_mes: "2025-10-01", ventas_previas: 0, previas_confirmadas: false, umbral_soles: 1_650_000, aviso_soles: 1_375_000,
        aviso_alcanzado: false, anio_cruzado: false, ...umbral,
      },
    });

  it("lejos del aviso no dice nada", () => {
    const a = avisoUmbral(panel({ ventas_anio_erp: 900_000, ventas_anio: 900_000 }));
    expect(a).toMatchObject({ nivel: "lejos", titulo: null, detalle: null, faltaSoles: 750_000 });
  });

  it("entre el aviso y el límite: lo que llevas, a cuánto estás del límite y que hables con tu contador", () => {
    const a = avisoUmbral(panel({ ventas_anio_erp: 1_400_000, ventas_anio: 1_400_000, aviso_alcanzado: true }));
    expect(a.nivel).toBe("aviso");
    expect(a.faltaSoles).toBe(250_000);
    expect(a.titulo).toBe("Llevas S/\u00a01,400,000 vendidos este año, a S/\u00a0250,000 de las 300 UIT: habla con tu contador.");
    // La tasa del pago a cuenta sale del parámetro de la renta; el código no la sabe.
    expect(a.detalle).toBe("Pasadas las 300 UIT, el pago a cuenta de renta deja de ser el 1 % de lo vendido. Mejor verlo antes de que pase.");
  });

  it("si cambian los parámetros, cambian las palabras: otro límite, otra tasa, sin tocar el código", () => {
    const a = avisoUmbral(panel({ ventas_anio_erp: 1_000_000, ventas_anio: 1_000_000, umbral_soles: 1_100_000, aviso_alcanzado: true }, { umbral_uit: { valor: 200, provisional: false }, renta: { valor: 0.015, provisional: false } }));
    expect(a.titulo).toBe("Llevas S/\u00a01,000,000 vendidos este año, a S/\u00a0100,000 de las 200 UIT: habla con tu contador.");
    expect(a.detalle).toContain("el 1.5 % de lo vendido");
  });

  it("sin la tasa del pago a cuenta ni el límite en UIT, igual se entiende", () => {
    const a = avisoUmbral(panel({ ventas_anio_erp: 1_400_000, ventas_anio: 1_400_000, aviso_alcanzado: true }, { umbral_uit: null, renta: null }));
    expect(a.titulo).toBe("Llevas S/\u00a01,400,000 vendidos este año, a S/\u00a0250,000 del límite del régimen: habla con tu contador.");
    expect(a.detalle).toBe("Pasado el límite del régimen, el pago a cuenta de renta deja de ser el de ahora. Mejor verlo antes de que pase.");
  });

  it("pasado el límite: dice que lo pasaste y que confirme desde qué mes cambia, y ya no hay «a cuánto estás»", () => {
    const a = avisoUmbral(panel({ ventas_anio_erp: 1_700_000, ventas_anio: 1_700_000, anio_cruzado: true }));
    expect(a.nivel).toBe("cruzado");
    expect(a.faltaSoles).toBe(0);
    expect(a.titulo).toBe("Pasaste las 300 UIT este año: llevas S/\u00a01,700,000 vendidos. Habla con tu contador.");
    expect(a.detalle).toContain("desde qué mes cambia el pago a cuenta de renta");
  });

  it("el sistema empezó en septiembre y lo de antes no está cargado: dice que puede quedarse corto, aunque estés lejos", () => {
    const a = avisoUmbral(panel({ primer_mes: "2026-09-01", ventas_anio_erp: 90_000, ventas_anio: 90_000 }));
    expect(a.nivel).toBe("lejos");
    expect(a.quedaCorto).toBe("El sistema tiene ventas desde septiembre 2026 y lo vendido antes no está cargado: este aviso puede quedarse corto. Cárgalo en Configuración ▸ Impuestos.");
  });

  it("lo de antes confirmado —aunque sea cero— o un sistema que cubre todo el año no advierten nada", () => {
    expect(avisoUmbral(panel({ primer_mes: "2026-09-01", ventas_anio: 90_000, previas_confirmadas: true })).quedaCorto).toBeNull();
    expect(avisoUmbral(panel({ primer_mes: "2026-01-01", ventas_anio: 90_000 })).quedaCorto).toBeNull();
    expect(avisoUmbral(panel({ primer_mes: "2025-03-01", ventas_anio: 90_000 })).quedaCorto).toBeNull();
  });

  it("sin ninguna venta en el sistema y lo de antes sin cargar, también puede quedarse corto", () => {
    const a = avisoUmbral(panel({ primer_mes: null, ventas_anio: 0 }));
    expect(a.quedaCorto).toBe("Todavía no hay ventas de este año en el sistema y lo vendido antes no está cargado: este aviso puede quedarse corto. Cárgalo en Configuración ▸ Impuestos.");
  });

  it("desglosa de dónde sale lo que llevas: el sistema y lo de antes", () => {
    const a = avisoUmbral(panel({ ventas_anio_erp: 1_100_000, ventas_previas: 300_000, previas_confirmadas: true, ventas_anio: 1_400_000, aviso_alcanzado: true }));
    expect(a).toMatchObject({ ventasAnio: 1_400_000, ventasSistema: 1_100_000, ventasPrevias: 300_000 });
  });

  it("sin el aviso configurado (nadie lo puso) no hay nivel «lejos» inventado", () => {
    expect(avisoUmbral(panel({ ventas_anio: 100, aviso_soles: null })).nivel).toBe("sin_datos");
  });
});

describe("parámetros (Configuración ▸ Impuestos)", () => {
  const fila = (nombre: string, vigente_desde: string, valor: number | null, extra: Record<string, unknown> = {}) =>
    leerParametro({ nombre, vigente_desde, valor, texto: null, provisional: false, correcciones: 0, ...extra });

  it("la casilla muestra la tasa en % y la UIT en soles", () => {
    expect(valorEnCasilla(fila("igv", "2011-03-01", 0.18))).toBe("18");
    expect(valorEnCasilla(fila("renta_pago_cuenta", "2026-01-01", 0.015))).toBe("1.5");
    expect(valorEnCasilla(fila("uit", "2026-01-01", 5500))).toBe("5500");
    expect(valorEnCasilla(fila("tope_planilla_movilidad", "2026-10-01", 45.2))).toBe("45.20");
    expect(valorEnCasilla(fila("saldo_favor_igv", "2026-10-01", 12345.6))).toBe("12345.60"); // soles, con sus céntimos (ADR-0433, act. 4b)
    expect(valorEnCasilla(fila("ventas_previas_erp", "2026-01-01", 300000))).toBe("300000.00"); // lo vendido antes del sistema, en soles
    expect(valorEnCasilla(fila("aviso_umbral_uit", "2026-01-01", 250))).toBe("250"); // en UIT, como el límite
  });

  it("lo vendido antes del sistema: soles sin IGV, con céntimos y miles con coma; el cero vale y se rechaza lo absurdo", () => {
    expect(parsearParametro("ventas_previas_erp", "S/ 1,234,567.89")).toEqual({ ok: true, valor: 1234567.89 });
    expect(parsearParametro("ventas_previas_erp", "850000,5")).toEqual({ ok: true, valor: 850000.5 });
    expect(parsearParametro("ventas_previas_erp", "0")).toEqual({ ok: true, valor: 0 });
    expect(parsearParametro("ventas_previas_erp", "-1").ok).toBe(false);
    expect(parsearParametro("ventas_previas_erp", "10000001").ok).toBe(false);
    expect(parsearParametro("ventas_previas_erp", "").ok).toBe(false);
    expect(parsearParametro("ventas_previas_erp", "casi un millón").ok).toBe(false);
  });

  it("el aviso va en UIT, no en soles", () => {
    expect(parsearParametro("aviso_umbral_uit", "250")).toEqual({ ok: true, valor: 250 });
    expect(parsearParametro("aviso_umbral_uit", "1375000").ok).toBe(false);
    expect(parsearParametro("aviso_umbral_uit", "0").ok).toBe(false);
    const e = parsearParametro("aviso_umbral_uit", "-3");
    expect(e.ok === false && e.error).toContain("UIT");
  });

  it("lo tipeado se guarda como la base lo pide: la tasa como fracción", () => {
    expect(parsearParametro("igv", "18")).toEqual({ ok: true, valor: 0.18 });
    expect(parsearParametro("igv", "18 %")).toEqual({ ok: true, valor: 0.18 });
    expect(parsearParametro("renta_pago_cuenta", "1,5")).toEqual({ ok: true, valor: 0.015 });
    expect(parsearParametro("uit", "S/ 5,500")).toEqual({ ok: true, valor: 5500 });
    expect(parsearParametro("umbral_uit", "300")).toEqual({ ok: true, valor: 300 });
    expect(parsearParametro("tope_planilla_movilidad", "S/ 45.20")).toEqual({ ok: true, valor: 45.2 });
    expect(parsearParametro("tope_planilla_movilidad", "45,2")).toEqual({ ok: true, valor: 45.2 });
  });

  it("el saldo a favor de IGV con que CAYLA arrancó (ADR-0433, act. 4b): soles, con céntimos, miles con coma, y el cero vale", () => {
    expect(parsearParametro("saldo_favor_igv", "S/ 12,345.67")).toEqual({ ok: true, valor: 12345.67 });
    expect(parsearParametro("saldo_favor_igv", "12345,5")).toEqual({ ok: true, valor: 12345.5 });
    expect(parsearParametro("saldo_favor_igv", "0")).toEqual({ ok: true, valor: 0 }); // declarar que no traía saldo es un dato
    expect(parsearParametro("saldo_favor_igv", "-5").ok).toBe(false);
    expect(parsearParametro("saldo_favor_igv", "10000001").ok).toBe(false);
    expect(parsearParametro("saldo_favor_igv", "").ok).toBe(false);
    expect(parsearParametro("saldo_favor_igv", "mucho").ok).toBe(false);
  });

  it("y rechaza lo que la base rechazaría, con palabras de la tienda", () => {
    expect(parsearParametro("igv", "0.18").ok).toBe(false);
    expect(parsearParametro("uit", "5.5").ok).toBe(false);
    expect(parsearParametro("umbral_uit", "1650000").ok).toBe(false);
    expect(parsearParametro("uit", "").ok).toBe(false);
    expect(parsearParametro("uit", "cinco mil").ok).toBe(false);
    expect(parsearParametro("tope_planilla_movilidad", "0").ok).toBe(false);
    expect(parsearParametro("tope_planilla_movilidad", "1500").ok).toBe(false);
  });

  it("el de un año y el que rige ese año (si no tiene, el último de antes)", () => {
    const ps = [fila("umbral_uit", "2026-01-01", 300), fila("uit", "2025-01-01", 5350), fila("uit", "2026-01-01", 5500)];
    expect(delAnio(ps, "umbral_uit", 2027)).toBeNull();
    expect(vigenteEnAnio(ps, "umbral_uit", 2027)?.valor).toBe(300);
    expect(vigenteEnAnio(ps, "uit", 2025)?.valor).toBe(5350);
    expect(vigenteEnAnio(ps, "uit", 2024)).toBeNull();
    expect(aniosDeRegimen(ps, 2026, [2027])).toEqual([2027, 2026]);
    // El tope de la planilla rige desde cualquier fecha: no suma años a la tabla del régimen. El saldo de IGV, tampoco (rige desde el día 1 de un mes).
    expect(aniosDeRegimen([...ps, fila("tope_planilla_movilidad", "2024-05-01", 45.2), fila("saldo_favor_igv", "2023-03-01", 100)], 2026)).toEqual([2026]);
    // El aviso y lo vendido antes del sistema SÍ rigen por año: suman su año a la tabla del régimen.
    expect(aniosDeRegimen([...ps, fila("aviso_umbral_uit", "2025-01-01", 250), fila("ventas_previas_erp", "2024-01-01", 0)], 2026)).toEqual([2026, 2025, 2024]);
    // Lo vendido antes del sistema NO se hereda al año siguiente (el de 2026 no dice nada de 2027); el aviso sí rige hasta que se cambie.
    const previas = [fila("ventas_previas_erp", "2026-01-01", 300000), fila("aviso_umbral_uit", "2026-01-01", 250)];
    expect(delAnio(previas, "ventas_previas_erp", 2027)).toBeNull();
    expect(vigenteEnAnio(previas, "aviso_umbral_uit", 2027)?.valor).toBe(250);
  });
});

describe("quién puso cada vigencia, y qué día (Configuración ▸ Impuestos)", () => {
  it("el día es el de Lima: lo puesto a las 20:00 del 13 de octubre es del 13, aunque en UTC ya sea el 14", () => {
    // Como lo manda la base (timestamptz en UTC, con microsegundos): 2026-10-14 01:00 UTC = 2026-10-13 20:00 en Lima.
    const p = leerParametro({ nombre: "igv", vigente_desde: "2011-03-01", valor: 0.18, registrado_por: "Felipe Alvarez", registrado_en: "2026-10-14T01:00:00.123456+00:00", correcciones: 1 });
    expect(diaDelRegistro(p.registradoEn)).toBe("13 oct 2026");
    // Lo que se vio en la pantalla el 2026-10-13 a las 19:50 de Lima: decía «14 oct 2026».
    expect(diaDelRegistro("2026-10-14T00:50:00+00:00")).toBe("13 oct 2026");
  });

  it("el día cambia a la medianoche de Lima, no a la de UTC; el año también", () => {
    expect(diaDelRegistro("2026-10-14T04:59:00+00:00")).toBe("13 oct 2026"); // 23:59 en Lima
    expect(diaDelRegistro("2026-10-14T05:00:00+00:00")).toBe("14 oct 2026"); // 00:00 en Lima
    expect(diaDelRegistro("2027-01-01T01:00:00+00:00")).toBe("31 dic 2026"); // 20:00 del 31 de diciembre en Lima
    expect(diaDelRegistro("2026-10-13T20:00:00-05:00")).toBe("13 oct 2026"); // con la hora de Lima escrita
  });

  it("sin instante, o con uno que no se lee, no inventa un día", () => {
    expect(diaDelRegistro(null)).toBeNull();
    expect(diaDelRegistro("")).toBeNull();
    expect(diaDelRegistro("ayer")).toBeNull();
  });
});

describe("registros para el contador", () => {
  it("formatos del PLE: período AAAAMM00 y fechas DD/MM/AAAA", () => {
    expect(periodoPle("2026-08")).toBe("20260800");
    expect(fechaPle("2026-08-05")).toBe("05/08/2026");
    expect(fechaPle(null)).toBe("");
  });

  it("el tipo de documento del proveedor sale del largo: RUC 6, DNI 1, otro 0", () => {
    expect(tipoDocProveedor("20600000001")).toBe("6");
    expect(tipoDocProveedor("44556677")).toBe("1");
    expect(tipoDocProveedor(null)).toBe("0");
  });

  it("registro de ventas: 20 columnas; la nota de crédito va en negativo con lo que modifica; el anulado en cero", () => {
    const filas = [
      { fecha: "2024-01-15", tipo: "factura", serie: "F981", numero: 1, cliente_tipo_doc: "ruc", cliente_num_doc: "20600000001", cliente_nombre: "Clienta SAC", base: 200, igv: 36, total: 236, estado: "aceptado", anulado: false, tienda: "Tienda Trujillo" },
      { fecha: "2024-01-21", tipo: "boleta", serie: "B981", numero: 3, cliente_tipo_doc: "sin_documento", base: 0, igv: 0, total: 0, estado: "anulado", anulado: true, observacion: "Anulado: error" },
      { fecha: "2024-01-28", tipo: "nota_credito", serie: "FC98", numero: 1, cliente_tipo_doc: "ruc", base: -50, igv: -9, total: -59, estado: "aceptado", anulado: false, ref_fecha: "2024-01-15", ref_tipo: "factura", ref_serie: "F981", ref_numero: 1 },
    ].map(leerFilaVentas);
    const csv = csvRegistroVentas(filas, "2024-01");
    expect(csv.encabezados).toEqual([...COLUMNAS_VENTAS]);
    expect(csv.encabezados).toHaveLength(20);
    expect(csv.filas[0]!.slice(0, 13)).toEqual(["20240100", "15/01/2024", "01", "F981", 1, "6", "20600000001", "Clienta SAC", "200.00", "36.00", "236.00", "PEN", "1"]);
    expect(csv.filas[1]![5]).toBe("0");
    expect(csv.filas[1]![12]).toBe("2");
    expect(csv.filas[1]!.slice(8, 11)).toEqual(["0.00", "0.00", "0.00"]);
    expect(csv.filas[2]!.slice(2, 3)).toEqual(["07"]);
    expect(csv.filas[2]!.slice(8, 17)).toEqual(["-50.00", "-9.00", "-59.00", "PEN", "1", "15/01/2024", "01", "F981", 1]);
  });

  it("registro de ventas: una boleta a un carné de extranjería va con «4» y una a un pasaporte con «7» (tabla 2; ADR-0288 D-3)", () => {
    const filas = [
      { fecha: "2024-01-10", tipo: "boleta", serie: "B981", numero: 7, cliente_tipo_doc: "carne_extranjeria", cliente_num_doc: "001234567", cliente_nombre: "Ana", base: 100, igv: 18, total: 118, estado: "aceptado", anulado: false },
      { fecha: "2024-01-11", tipo: "boleta", serie: "B981", numero: 8, cliente_tipo_doc: "pasaporte", cliente_num_doc: "AB123456", cliente_nombre: "Eva", base: 100, igv: 18, total: 118, estado: "aceptado", anulado: false },
      { fecha: "2024-01-12", tipo: "boleta", serie: "B981", numero: 9, cliente_tipo_doc: "dni", cliente_num_doc: "71234482", cliente_nombre: "Luz", base: 100, igv: 18, total: 118, estado: "aceptado", anulado: false },
    ].map(leerFilaVentas);
    const csv = csvRegistroVentas(filas, "2024-01");
    expect(csv.filas.map((f) => [f[5], f[6]])).toEqual([["4", "001234567"], ["7", "AB123456"], ["1", "71234482"]]);
  });

  it("registro de compras: 21 columnas; la boleta va como no gravada y sin crédito; dice qué es", () => {
    const filas = [
      { origen: "compra", naturaleza: "gasto", fecha: "2024-01-09", vencimiento: "2024-02-09", tipo: "boleta", serie: "B300", numero: "1", proveedor_ruc: "10987650982", proveedor: "Bodega", base: 0, igv: 0, no_gravado: 100, total: 100, da_credito: false, tienda: "Tienda Trujillo" },
      { origen: "taller", naturaleza: "taller", fecha: "2024-01-14", tipo: "factura", serie: "F500", numero: "1", proveedor_ruc: "20987650983", proveedor: "Hilos", base: 50, igv: 9, no_gravado: 0, total: 59, da_credito: true, tienda: "Taller" },
      { origen: "nota_credito", naturaleza: "mercaderia", fecha: "2024-01-25", tipo: "nota_credito", serie: "FC01", numero: "7", proveedor_ruc: "20987650981", proveedor: "Textiles", base: -100, igv: -18, no_gravado: 0, total: -118, da_credito: true, ref_fecha: "2024-01-05", ref_tipo: "factura", ref_serie: "F100", ref_numero: "1" },
    ].map(leerFilaCompras);
    const csv = csvRegistroCompras(filas, "2024-01");
    expect(csv.encabezados).toEqual([...COLUMNAS_COMPRAS]);
    expect(csv.encabezados).toHaveLength(21);
    expect(csv.filas[0]).toEqual(["20240100", "09/01/2024", "09/02/2024", "03", "B300", "1", "6", "10987650982", "Bodega", "0.00", "0.00", "100.00", "100.00", "PEN", "No", "", "", "", "", "Gasto", "Tienda Trujillo"]);
    expect(csv.filas[1]!.slice(-2)).toEqual(["Insumos del Taller", "Taller"]);
    expect(csv.filas[1]![6]).toBe("6");
    expect(csv.filas[2]!.slice(3, 4)).toEqual(["07"]);
    expect(csv.filas[2]!.slice(9, 19)).toEqual(["-100.00", "-18.00", "0.00", "-118.00", "PEN", "Sí", "05/01/2024", "01", "F100", "1"]);
  });

  it("el resumen del mes dice lo que falta configurar en vez de inventarlo", () => {
    const panel = leerPanelImpuestos({ mes: "2024-01-01", foco: { mes: "2024-01-01", debito: 63, credito: 297, saldo_a_favor: 234 }, parametros: {}, renta: { base: 350 } });
    const r = csvResumenIgv(panel);
    expect(r.encabezados).toEqual(["Concepto", "Monto (S/)"]);
    expect(r.filas).toContainEqual(["IGV cobrado (débito)", "63.00"]);
    expect(r.filas).toContainEqual(["Saldo a favor que pasa al mes siguiente", "234.00"]);
    expect(r.filas).toContainEqual(["Régimen", "sin configurar"]);
    expect(r.filas).toContainEqual(["Pago a cuenta de renta", ""]);
    expect(r.filas).toContainEqual(["IGV perdido por bancarización: pagos en efectivo o desde un fondo (ya restado de las líneas de facturas)", "0.00"]);
  });

  it("el resumen dice cuánto IGV se perdió por pagar sin banco (ya restado de cada línea de facturas)", () => {
    const panel = leerPanelImpuestos({ mes: "2026-10-01", foco: { mes: "2026-10-01", credito_gastos: 30 }, revisar: { igv_perdido: { n: 1, igv: 152.54 } } });
    expect(csvResumenIgv(panel).filas).toContainEqual([
      "IGV perdido por bancarización: pagos en efectivo o desde un fondo (ya restado de las líneas de facturas)",
      "152.54",
    ]);
  });

  it("el CSV lleva BOM, comas y comillas escapadas", () => {
    const t = textoCsv(["A", "B"], [["Clienta, SAC", 'dijo "hola"']]);
    expect(t.charCodeAt(0)).toBe(0xfeff);
    expect(t.slice(1)).toBe('A,B\r\n"Clienta, SAC","dijo ""hola"""');
  });
});

describe("el paquete .zip para el contador", () => {
  it("CRC-32 correcto (el valor de control del estándar)", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("empieza y termina con las firmas de zip, con un archivo por CSV", () => {
    const zip = crearZip(
      [
        { nombre: "registro-ventas-2024-01.csv", contenido: "a,b\r\n1,2" },
        { nombre: "registro-compras-2024-01.csv", contenido: "c\r\n3" },
      ],
      new Date(2024, 0, 31, 10, 20, 30),
    );
    const dv = new DataView(zip.buffer);
    expect(dv.getUint32(0, true)).toBe(0x04034b50);
    const fin = zip.length - 22;
    expect(dv.getUint32(fin, true)).toBe(0x06054b50);
    expect(dv.getUint16(fin + 10, true)).toBe(2);
    // El índice apunta a la segunda cabecera local, justo después de la primera con sus datos.
    const offsetIndice = dv.getUint32(fin + 16, true);
    expect(dv.getUint32(offsetIndice, true)).toBe(0x02014b50);
    const segunda = 30 + "registro-ventas-2024-01.csv".length + 8;
    expect(dv.getUint32(segunda, true)).toBe(0x04034b50);
  });
});
