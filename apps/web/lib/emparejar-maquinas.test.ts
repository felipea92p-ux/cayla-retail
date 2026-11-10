import { describe, expect, it } from "vitest";
import type { LotePendiente } from "./cuentas-dinero-reglas";
import type { LineaExtracto } from "./extracto-interbank";
import { emparejarVendemas, lineasYaRegistradas, loteAnteriorDe } from "./emparejar-maquinas";

// Montos inventados (el repo es público). Vendemás: 2,30 % + IGV ≈ 2,71 %.
// Emparejar no mira con qué reconoce el banco cada línea: aquí van como en la tabla pegada de la web, sin nada.
const SIN_IDENTIDAD = { fechaProceso: null, correlativo: null, codigo: null, operacion: null, firme: false } as const;
const linea = (orden: number, fecha: string, centimos: number, tipo: LineaExtracto["tipo"] = "lote_vendemas"): LineaExtracto => ({
  orden,
  fecha,
  descripcion: "PAGO ESTABLECIMENTOS VISA",
  centimos,
  saldoCentimos: null,
  tipo,
  codigoComercio: null,
  ...SIN_IDENTIDAD,
});
const dia = (clave: string, fecha: string, bruto: number, sede = "Tienda TRU", esperado: number | null = Math.round(bruto * 2.714) / 100): LotePendiente => ({
  clave,
  fecha,
  ubicacionId: sede,
  ubicacionNombre: sede,
  medio: "tarjeta",
  bruto,
  dias: 1,
  nPagos: 1,
  esperado,
  diasHabiles: 1,
  atrasado: false,
  yaDepositado: 0,
});

describe("loteAnteriorDe", () => {
  it("el lote del lunes viene después del sábado; los demás, del día anterior", () => {
    expect(loteAnteriorDe("2026-11-09")).toBe("2026-11-07"); // lunes → sábado
    expect(loteAnteriorDe("2026-11-04")).toBe("2026-11-03"); // miércoles → martes
    expect(loteAnteriorDe("2026-11-07")).toBe("2026-11-06"); // sábado → viernes
  });
});

describe("emparejarVendemas", () => {
  it("el lote del día cubre lo cobrado el día anterior en las dos tiendas, y cuadra con la comisión normal", () => {
    // 1,000 cobrados el martes en dos tiendas; el miércoles llegan 972.86 (27.14 de comisión, la de la tarifa).
    const [p] = emparejarVendemas([linea(0, "2026-11-04", 97286)], [dia("tru", "2026-11-03", 600), dia("aqp", "2026-11-03", 400, "Tienda AQP")]);
    expect(p.estado).toBe("cuadra");
    expect(p.dias.map((d) => d.clave)).toEqual(["aqp", "tru"]);
    expect(p.brutoCentimos).toBe(100000);
    expect(p.comisionCentimos).toBe(2714);
    expect(p.motivo).toBeNull();
  });

  it("el lote del lunes junta el sábado y el domingo, no el viernes", () => {
    const [p] = emparejarVendemas([linea(0, "2026-11-09", 29186)], [dia("vie", "2026-11-06", 500), dia("sab", "2026-11-07", 100), dia("dom", "2026-11-08", 200)]);
    expect(p.dias.map((d) => d.clave)).toEqual(["sab", "dom"]);
    expect(p.estado).toBe("cuadra");
  });

  it("con el lote anterior en el extracto, la ventana empieza en su día (un feriado sin lote alarga el siguiente)", () => {
    // Lotes el lunes 2 y el miércoles 4 (el martes 3 fue feriado): el del miércoles cubre lunes y martes.
    const r = emparejarVendemas([linea(0, "2026-11-02", 9729), linea(1, "2026-11-04", 19457)], [dia("sab", "2026-10-31", 100), dia("lun", "2026-11-02", 100), dia("mar", "2026-11-03", 100)]);
    expect(r[0].dias.map((d) => d.clave)).toEqual(["sab"]);
    expect(r[1].dias.map((d) => d.clave)).toEqual(["lun", "mar"]);
  });

  it("un día se asigna a un solo lote, y un lote sin ventas pendientes lo dice (ya registrado u otra máquina)", () => {
    const r = emparejarVendemas([linea(0, "2026-11-04", 9729), linea(1, "2026-11-04", 9729)], [dia("mar", "2026-11-03", 100)]);
    expect(r[0].dias).toHaveLength(1);
    expect(r[1].estado).toBe("sin_ventas");
    expect(r[1].motivo).toContain("ya está registrado");
  });

  it("los días viejos fuera de la ventana no se cuelgan del primer lote", () => {
    const [p] = emparejarVendemas([linea(0, "2026-11-04", 9729)], [dia("viejo", "2026-10-28", 1000), dia("mar", "2026-11-03", 100)]);
    expect(p.dias.map((d) => d.clave)).toEqual(["mar"]);
  });

  it("si llegó más de lo cobrado, o la comisión se aleja de la tarifa, pide revisar (no lo da por bueno)", () => {
    const [mas] = emparejarVendemas([linea(0, "2026-11-04", 10500)], [dia("mar", "2026-11-03", 100)]);
    expect(mas.estado).toBe("revisar");
    expect(mas.motivo).toContain("más de lo que se cobró");
    // 100 cobrados y llegan 90: 10 % de comisión contra 2,7 % de la tarifa.
    const [rara] = emparejarVendemas([linea(0, "2026-11-04", 9000)], [dia("mar", "2026-11-03", 100)]);
    expect(rara.estado).toBe("revisar");
    expect(rara.motivo).toContain("la tarifa espera");
  });

  it("solo mira los lotes de Vendemás que entran", () => {
    expect(emparejarVendemas([linea(0, "2026-11-04", 9729, "qr_izipay"), linea(1, "2026-11-04", -9729)], [dia("mar", "2026-11-03", 100)])).toEqual([]);
  });
});

describe("lo que ya está registrado no se propone otra vez", () => {
  it("una línea con su depósito en el ERP (mismo día y monto) sale «ya registrado» y no se lleva días", () => {
    const r = emparejarVendemas([linea(0, "2026-11-04", 9729), linea(1, "2026-11-05", 9729)], [dia("mar", "2026-11-03", 100), dia("mie", "2026-11-04", 100)], [{ fecha: "2026-11-04", centimos: 9729 }]);
    expect(r[0].estado).toBe("ya_registrado");
    expect(r[0].dias).toEqual([]);
    expect(r[1].estado).toBe("cuadra");
    expect(r[1].dias.map((d) => d.clave)).toEqual(["mie"]);
  });
  it("cada depósito registrado tapa UNA línea: dos lotes iguales el mismo día y un solo depósito dejan uno por registrar", () => {
    const l = [linea(0, "2026-11-04", 9729), linea(1, "2026-11-04", 9729)];
    expect([...lineasYaRegistradas(l, [{ fecha: "2026-11-04", centimos: 9729 }])]).toEqual([0]);
    expect([...lineasYaRegistradas(l, [])]).toEqual([]);
    expect([...lineasYaRegistradas(l, [{ fecha: "2026-11-05", centimos: 9729 }])]).toEqual([]);
  });
});

// ---- Izipay ----------------------------------------------------------------------------------------------------------------------
import { emparejarIzipay, loteAnteriorIzipay, type PagoMaquina } from "./emparejar-maquinas";

const lq = (orden: number, fecha: string, centimos: number, tipo: LineaExtracto["tipo"] = "qr_izipay", codigo: string | null = null): LineaExtracto => ({
  orden,
  fecha,
  descripcion: tipo === "qr_izipay" ? ". Abono QR IBK" : `PAGO IZIPAY ${codigo}`,
  centimos,
  saldoCentimos: null,
  tipo,
  codigoComercio: codigo,
  ...SIN_IDENTIDAD,
});
// Un pago con la regla de la máquina: QR gratis hasta el 10; tarjeta (y QR dentro de un lote) 2,38 % + IGV redondeados por separado.
const comision = (c: number) => {
  const base = Math.round(c * 0.0238);
  return base + Math.round(base * 0.18);
};
const pq = (id: string, fecha: string, hora: string, monto: number, o: Partial<PagoMaquina> = {}): PagoMaquina => {
  const c = Math.round(monto * 100);
  const medio = o.medio ?? "qr";
  const gratis = medio === "qr" && Number(fecha.slice(8)) <= 10;
  return {
    origen: "venta_pago",
    origenId: id,
    clave: `cobros:${fecha}:${o.ubicacionId ?? "tru"}:${medio}`,
    fecha,
    hora: `${fecha}T${hora}:00-05:00`,
    ubicacionId: "tru",
    ubicacionNombre: "Tienda TRU",
    medio,
    montoCentimos: c,
    netoCentimos: gratis ? c : c - comision(c),
    netoTarjetaCentimos: c - comision(c),
    depositado: false,
    diaSinDetalle: false,
    ...o,
  };
};

describe("loteAnteriorIzipay", () => {
  it("Izipay no abona el fin de semana: el lote del lunes viene después del viernes", () => {
    expect(loteAnteriorIzipay("2026-11-09")).toBe("2026-11-06");
    expect(loteAnteriorIzipay("2026-11-05")).toBe("2026-11-04");
  });
});

describe("emparejarIzipay — QR sueltos", () => {
  it("cada línea con su QR, en orden de hora; lo que no llegó queda dicho y el depósito del día suma lo que llegó", () => {
    const r = emparejarIzipay(
      [lq(0, "2026-11-05", 4590), lq(1, "2026-11-05", 13980)],
      [pq("a", "2026-11-05", "10:15", 45.9), pq("b", "2026-11-05", "11:40", 89.9), pq("c", "2026-11-05", "18:55", 139.8)],
    );
    expect(r.propuestas).toHaveLength(1);
    expect(r.propuestas[0].pagos.map((p) => p.origenId)).toEqual(["a", "c"]);
    expect(r.propuestas[0].netoCentimos).toBe(18570);
    expect(r.propuestas[0].brutoCentimos).toBe(18570);
    expect(r.sinLlegar.map((p) => p.origenId)).toEqual(["b"]);
    expect(r.sinVenta).toEqual([]);
  });

  it("dos QR del mismo monto se emparejan en orden de hora (el empate se resuelve, no se adivina)", () => {
    const r = emparejarIzipay([lq(0, "2026-11-05", 4990)], [pq("tarde", "2026-11-05", "18:00", 49.9), pq("manana", "2026-11-05", "09:00", 49.9)]);
    expect(r.propuestas[0].pagos.map((p) => p.origenId)).toEqual(["manana"]);
    expect(r.sinLlegar.map((p) => p.origenId)).toEqual(["tarde"]);
  });

  it("pasado el día 10 llega neto: la línea calza con lo cobrado menos la comisión de ese pago", () => {
    const r = emparejarIzipay([lq(0, "2026-11-12", 9719)], [pq("a", "2026-11-12", "12:00", 100)]);
    expect(r.propuestas[0].pagos).toHaveLength(1);
    expect(r.propuestas[0].brutoCentimos - r.propuestas[0].netoCentimos).toBe(281);
  });

  it("un QR cobrado a medianoche puede llegar al día siguiente", () => {
    const r = emparejarIzipay([lq(0, "2026-11-06", 3500)], [pq("a", "2026-11-05", "23:58", 35)]);
    expect(r.propuestas[0].pagos.map((p) => p.origenId)).toEqual(["a"]);
    expect(r.propuestas[0].fecha).toBe("2026-11-06");
  });

  it("una línea sin venta se dice; una de un día ya depositado no se vuelve a ofrecer", () => {
    const r = emparejarIzipay(
      [lq(0, "2026-11-05", 2000), lq(1, "2026-11-04", 5500)],
      [pq("viejo", "2026-11-04", "12:00", 55, { diaSinDetalle: true }), pq("ya", "2026-11-05", "12:00", 20, { depositado: true })],
    );
    expect(r.propuestas).toEqual([]);
    expect(r.yaRegistradas.map((l) => l.orden)).toEqual([0, 1]);
    expect(r.sinVenta).toEqual([]);
    const s = emparejarIzipay([lq(0, "2026-11-05", 2000)], []);
    expect(s.sinVenta.map((l) => l.orden)).toEqual([0]);
  });
});

describe("emparejarIzipay — lotes de tarjeta", () => {
  it("el lote calza con la tarjeta de UNA tienda en su ventana (el del lunes junta viernes a domingo)", () => {
    const tarjetas = [pq("vie", "2026-11-06", "12:00", 200, { medio: "tarjeta" }), pq("dom", "2026-11-08", "12:00", 200, { medio: "tarjeta" }), pq("otra", "2026-11-08", "12:00", 200, { medio: "tarjeta", ubicacionId: "aqp", ubicacionNombre: "Tienda AQP" })];
    const neto = 2 * (20000 - comision(20000));
    const r = emparejarIzipay([lq(0, "2026-11-09", neto, "lote_izipay", "005800001")], tarjetas);
    const [p] = r.propuestas;
    expect(p.tipo).toBe("lote");
    expect(p.estado).toBe("cuadra");
    // Las dos tiendas suman lo mismo por separado: gana la primera que calza y la otra queda libre (sin emparejar a ciegas las dos).
    expect(p.pagos).toHaveLength(2);
    expect(new Set(p.pagos.map((x) => x.ubicacionId)).size).toBe(1);
  });

  it("un QR pagado con tarjeta llega en el lote, con la comisión de tarjeta aunque sea día gratis", () => {
    const r = emparejarIzipay([lq(0, "2026-11-06", 4590 - comision(4590), "lote_izipay", "005800001")], [pq("qr", "2026-11-05", "12:00", 45.9)]);
    expect(r.propuestas[0].pagos.map((p) => p.origenId)).toEqual(["qr"]);
    expect(r.sinLlegar).toEqual([]);
  });

  it("un lote que no calza al céntimo no se propone: dice qué revisar", () => {
    const r = emparejarIzipay([lq(0, "2026-11-06", 12345, "lote_izipay", "005800001")], [pq("t", "2026-11-05", "12:00", 200, { medio: "tarjeta" })]);
    expect(r.propuestas[0].estado).toBe("sin_ventas");
    expect(r.propuestas[0].pagos).toEqual([]);
    expect(r.propuestas[0].motivo).toContain("Ninguna tienda suma");
  });

  it("un QR que llegó suelto no se cuenta otra vez dentro de un lote", () => {
    const r = emparejarIzipay(
      [lq(0, "2026-11-05", 4590), lq(1, "2026-11-06", 4590 - comision(4590), "lote_izipay", "005800001")],
      [pq("qr", "2026-11-05", "12:00", 45.9)],
    );
    expect(r.propuestas.find((p) => p.tipo === "qr")?.pagos.map((p) => p.origenId)).toEqual(["qr"]);
    expect(r.propuestas.find((p) => p.tipo === "lote")?.estado).toBe("sin_ventas");
  });
});
