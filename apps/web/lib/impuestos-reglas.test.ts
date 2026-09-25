import { describe, expect, it } from "vitest";
import {
  COLUMNAS_COMPRAS,
  COLUMNAS_VENTAS,
  aniosDeRegimen,
  csvRegistroCompras,
  csvRegistroVentas,
  csvResumenIgv,
  delAnio,
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
  });
});

describe("parámetros (Configuración ▸ Impuestos)", () => {
  const fila = (nombre: string, vigente_desde: string, valor: number | null, extra: Record<string, unknown> = {}) =>
    leerParametro({ nombre, vigente_desde, valor, texto: null, provisional: false, correcciones: 0, ...extra });

  it("la casilla muestra la tasa en % y la UIT en soles", () => {
    expect(valorEnCasilla(fila("igv", "2011-03-01", 0.18))).toBe("18");
    expect(valorEnCasilla(fila("renta_pago_cuenta", "2026-01-01", 0.015))).toBe("1.5");
    expect(valorEnCasilla(fila("uit", "2026-01-01", 5500))).toBe("5500");
  });

  it("lo tipeado se guarda como la base lo pide: la tasa como fracción", () => {
    expect(parsearParametro("igv", "18")).toEqual({ ok: true, valor: 0.18 });
    expect(parsearParametro("igv", "18 %")).toEqual({ ok: true, valor: 0.18 });
    expect(parsearParametro("renta_pago_cuenta", "1,5")).toEqual({ ok: true, valor: 0.015 });
    expect(parsearParametro("uit", "S/ 5,500")).toEqual({ ok: true, valor: 5500 });
    expect(parsearParametro("umbral_uit", "300")).toEqual({ ok: true, valor: 300 });
  });

  it("y rechaza lo que la base rechazaría, con palabras de la tienda", () => {
    expect(parsearParametro("igv", "0.18").ok).toBe(false);
    expect(parsearParametro("uit", "5.5").ok).toBe(false);
    expect(parsearParametro("umbral_uit", "1650000").ok).toBe(false);
    expect(parsearParametro("uit", "").ok).toBe(false);
    expect(parsearParametro("uit", "cinco mil").ok).toBe(false);
  });

  it("el de un año y el que rige ese año (si no tiene, el último de antes)", () => {
    const ps = [fila("umbral_uit", "2026-01-01", 300), fila("uit", "2025-01-01", 5350), fila("uit", "2026-01-01", 5500)];
    expect(delAnio(ps, "umbral_uit", 2027)).toBeNull();
    expect(vigenteEnAnio(ps, "umbral_uit", 2027)?.valor).toBe(300);
    expect(vigenteEnAnio(ps, "uit", 2025)?.valor).toBe(5350);
    expect(vigenteEnAnio(ps, "uit", 2024)).toBeNull();
    expect(aniosDeRegimen(ps, 2026, [2027])).toEqual([2027, 2026]);
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
