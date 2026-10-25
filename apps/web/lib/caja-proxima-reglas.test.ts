import { describe, expect, it } from "vitest";
import type { CuentaDinero } from "./cuentas-dinero-reglas";
import type { CobroEsperado, Proyeccion, SalidaProy } from "./flujo-caja-reglas";
import { cajaProxima, DIAS_CAJA_PROXIMA, diasEntre, fechaEnPalabras, salidasGrandes, sumarDias } from "./caja-proxima-reglas";
import type { VerResumen } from "./resumen-finanzas-reglas";

// «Tu caja en las próximas dos semanas» (Resumen, spike 1): el saldo de cada día sale de las mismas piezas con que la base arma sus bloques.

const HOY = "2026-10-15";
const TODAS: VerResumen = { ubicacionId: null, soloEmpresa: false, todas: true, tipo: "todas", nombre: "Todas las sedes" };
const LIMA: VerResumen = { ubicacionId: "lim", soloEmpresa: false, todas: false, tipo: "tienda", nombre: "Tienda Lima" };
const TALLER: VerResumen = { ubicacionId: "tal", soloEmpresa: false, todas: false, tipo: "taller", nombre: "Taller" };
const EMPRESA: VerResumen = { ubicacionId: null, soloEmpresa: true, todas: false, tipo: "empresa", nombre: "Empresa" };

const cobro = (fecha: string, ubicacionId: string, monto: number): CobroEsperado => ({ fecha, ubicacionId, tienda: ubicacionId, monto, origen: "meta", metaPct: 100, campanas: [] });
const salida = (fecha: string, titulo: string, monto: number, extra: Partial<SalidaProy> = {}): SalidaProy => ({
  tipo: "vencimiento", id: `${fecha}-${titulo}`, fecha, vence: fecha, titulo, detalle: "", clase: "proveedor", ubicacionId: null, unidad: null, monto, atrasada: false, ...extra,
});

/** Una proyección como la arma la base: bloques de 7 días desde mañana, con el saldo al final de cada uno. */
function proyeccion(o: { saldoHoy?: number; minimo?: number; cobros?: CobroEsperado[]; salidas?: SalidaProy[]; nSemanas?: number } & Partial<Proyeccion> = {}): Proyeccion {
  const { saldoHoy = 28_000, minimo = 15_000, cobros = [], salidas = [], nSemanas = 6, ...resto } = o;
  const desde = sumarDias(HOY, 1);
  let saldo = saldoHoy;
  const bloques = [...Array(nSemanas)].map((_, i) => {
    const d = sumarDias(desde, 7 * i);
    const h = sumarDias(d, 6);
    const entra = cobros.filter((c) => c.fecha >= d && c.fecha <= h).reduce((a, c) => a + c.monto, 0);
    const sale = salidas.filter((s) => s.fecha >= d && s.fecha <= h).reduce((a, s) => a + s.monto, 0);
    saldo += entra - sale;
    return { desde: d, hasta: h, entra, sale, saldo, bajoMinimo: saldo < minimo };
  });
  return {
    hoy: HOY, desde, hasta: bloques.at(-1)!.hasta, saldoHoy, minimoCaja: minimo, salidasDiarias: 500, diasDeCaja: 40,
    salidas30: { conCuenta: 0, sinCuenta: 0, planilla: 0 }, planillaVisible: true, historiaDias: 60, saldoInicialDeclarado: true,
    hayFacturasDeProveedor: true, incluyeImpuestos: true, saldoFavorIgvDeclarado: true, diasDeCajaConfiable: true,
    semanas: bloques, cobros, salidas, ...resto,
  };
}
/** `soles()` deja un espacio que no se parte tras «S/»: para comparar frases se vuelve un espacio normal. */
const texto = (s: string) => s.replace(/\u00a0/g, " ");
const ok = (datos: Proyeccion) => ({ estado: "ok" as const, datos });
const caja = (p: Proyeccion, ver = TODAS, cuentas: CuentaDinero[] | null = null) => cajaProxima({ flujo: ok(p), cuentas, ver });
const cuenta = (tipo: CuentaDinero["tipo"], ubicacionId: string, saldo: number | null): CuentaDinero => ({
  id: `${tipo}-${ubicacionId}`, nombre: tipo, tipo, cuentaContable: "10", ubicacionId, ubicacionNombre: ubicacionId, numero: null, saldo, archivada: false,
  soloDestino: false, cajaId: null, cajaAbierta: false, saldoDesde: null, ultimaConciliacion: null, ultimoAbono: null, orden: 0,
});
function cayla(p: Proyeccion, ver = TODAS) {
  const c = caja(p, ver);
  if (c.tipo !== "cayla") throw new Error(`se esperaba CAYLA y salió ${c.tipo}`);
  return c;
}

describe("fechas", () => {
  it("suma y resta días cruzando el mes y el año", () => {
    expect(sumarDias("2026-10-31", 1)).toBe("2026-11-01");
    expect(sumarDias("2026-12-30", 3)).toBe("2027-01-02");
    expect(diasEntre("2026-10-15", "2026-10-29")).toBe(14);
    expect(fechaEnPalabras("2026-10-31")).toBe("31 de octubre");
  });
});

describe("el saldo día por día", () => {
  const salidas = [salida("2026-10-18", "Factura de telas", 4_200), salida("2026-10-20", "IGV", 1_800), salida("2026-10-28", "Planilla", 11_000, { tipo: "planilla" })];
  const cobros = [cobro("2026-10-17", "tru", 3_100), cobro("2026-10-25", "aqp", 3_300)];

  it("empieza en lo que hay hoy y cada día suma lo que se espera cobrar y resta lo que vence", () => {
    const c = cayla(proyeccion({ salidas, cobros }));
    const saldo = (f: string) => c.puntos.find((x) => x.fecha === f)!.saldo;
    expect(c.puntos[0]).toEqual({ dia: 0, fecha: HOY, saldo: 28_000, entra: 0, sale: 0, principal: null });
    expect(saldo("2026-10-16")).toBe(28_000);
    expect(saldo("2026-10-17")).toBe(31_100);
    expect(saldo("2026-10-18")).toBe(26_900);
    expect(saldo("2026-10-20")).toBe(25_100);
    expect(saldo("2026-10-25")).toBe(28_400);
    expect(saldo("2026-10-28")).toBe(17_400);
    expect(c.puntos).toHaveLength(DIAS_CAJA_PROXIMA + 1);
  });

  it("el saldo al final de cada bloque es el que dice la base (una sola verdad con Dinero ▸ Flujo)", () => {
    const p = proyeccion({ salidas, cobros });
    const c = cayla(p);
    expect(c.porSemana).toBe(false);
    expect(c.queda).toBe(p.semanas[1]!.saldo);
    expect(c.puntos.find((x) => x.fecha === p.semanas[0]!.hasta)!.saldo).toBe(p.semanas[0]!.saldo);
  });

  it("lo que entra y lo que sale del horizonte suman lo que dicen los dos primeros bloques", () => {
    const p = proyeccion({ salidas, cobros });
    const c = cayla(p);
    expect(c.entra).toBe(p.semanas[0]!.entra + p.semanas[1]!.entra);
    expect(c.sale).toBe(p.semanas[0]!.sale + p.semanas[1]!.sale);
    expect(c.saldoHoy + c.entra - c.sale).toBe(c.queda);
  });

  it("cada día dice qué pasó ese día y cuál fue la salida que más pesó", () => {
    const c = cayla(proyeccion({ salidas, cobros }));
    expect(c.puntos.find((x) => x.fecha === "2026-10-17")).toMatchObject({ entra: 3_100, sale: 0, principal: null });
    expect(c.puntos.find((x) => x.fecha === "2026-10-28")).toMatchObject({ entra: 0, sale: 11_000, principal: "Planilla" });
  });

  it("lo vencido que la base cuenta «mañana» entra al primer día, no se pierde", () => {
    const c = cayla(proyeccion({ salidas: [salida(sumarDias(HOY, 1), "Factura vencida", 5_000, { atrasada: true })] }));
    expect(c.puntos[1]).toMatchObject({ dia: 1, saldo: 23_000 });
  });

  it("si el detalle no cuadra con los bloques (una base más vieja), usa solo los bloques y lo dice; nunca inventa el día", () => {
    const p = proyeccion({ salidas, cobros });
    p.cobros = []; // la base no mandó los cobros: el día por día quedaría de menos
    const c = cayla(p);
    expect(c.porSemana).toBe(true);
    expect(c.puntos.map((x) => x.dia)).toEqual([0, 7, 14]);
    expect(c.queda).toBe(p.semanas[1]!.saldo);
  });

  it("una proyección más corta que dos semanas no se estira", () => {
    const c = cayla(proyeccion({ nSemanas: 1, salidas }));
    expect(c.hasta).toBe(sumarDias(HOY, 7));
    expect(c.puntos).toHaveLength(8);
  });
});

describe("lo que dice el titular", () => {
  it("baja del mínimo dentro de las dos semanas: el día, cuánto llega y cuánto es el mínimo, en rojo", () => {
    const c = cayla(proyeccion({ salidas: [salida("2026-10-28", "Planilla", 16_000, { tipo: "planilla" })] }));
    expect(c.tono).toBe("rojo");
    expect(c.bajaDelMinimo).toEqual({ fecha: "2026-10-28", saldo: 12_000 });
    expect(texto(c.titular)).toBe("Tu caja baja de tu mínimo el 28 de octubre: llegas a S/ 12,000 y tu mínimo es S/ 15,000.");
  });

  it("si se queda sin plata lo dice así, no como «bajo el mínimo»", () => {
    const c = cayla(proyeccion({ saldoHoy: 5_000, salidas: [salida("2026-10-20", "Factura", 8_000)] }));
    expect(texto(c.titular)).toBe("Tu caja se queda sin plata el 20 de octubre: llegas a −S/ 3,000.");
  });

  it("si hoy la caja ya está bajo el mínimo, lo dice así y no inventa un día de «baja»", () => {
    const c = cayla(proyeccion({ saldoHoy: 9_000, salidas: [salida("2026-10-20", "Factura", 1_000)] }));
    expect(c.tono).toBe("rojo");
    expect(c.sinPlata).toBeNull();
    expect(texto(c.titular)).toBe("Hoy tu caja ya está bajo tu mínimo: tienes S/ 9,000 y tu mínimo es S/ 15,000.");
  });

  it("no baja ahora pero sí después: ámbar, con la semana que baja", () => {
    const c = cayla(proyeccion({ salidas: [salida("2026-11-10", "Planilla", 20_000, { tipo: "planilla" })] }));
    expect(c.bajaDelMinimo).toBeNull();
    expect(c.luego).toEqual({ fecha: "2026-11-12", saldo: 8_000 });
    expect(c.tono).toBe("ambar");
    expect(c.titular).toContain("Después baja de tu mínimo");
  });

  it("todo sobre el mínimo: verde, con lo que queda", () => {
    const c = cayla(proyeccion({ salidas: [salida("2026-10-20", "Factura", 1_000)] }));
    expect(c.tono).toBe("verde");
    expect(texto(c.titular)).toBe("Tu caja aguanta las próximas dos semanas: el 29 de octubre te quedan S/ 27,000, sobre tu mínimo de S/ 15,000.");
  });

  it("sin mínimo puesto no habla de mínimo ni lo pinta de rojo aunque el saldo sea bajo", () => {
    const c = cayla(proyeccion({ minimo: 0, saldoHoy: 2_000, salidas: [salida("2026-10-20", "Factura", 1_000)] }));
    expect(c.bajaDelMinimo).toBeNull();
    expect(c.tono).toBe("pizarra");
    expect(c.titular).toContain("No tienes un mínimo de caja puesto");
  });
});

describe("lo que más pesa", () => {
  it("junta la planilla en una sola salida y ordena de mayor a menor, con un tope de tres", () => {
    const salidas = [
      salida("2026-10-31", "Sueldo A", 4_000, { tipo: "planilla" }), salida("2026-10-31", "Sueldo B", 7_000, { tipo: "planilla" }),
      salida("2026-10-18", "Factura de telas", 4_200), salida("2026-10-20", "IGV", 1_800), salida("2026-10-22", "Hilos", 600),
    ];
    const g = salidasGrandes(salidas, "2026-10-16", "2026-11-30");
    expect(g.map((x) => [x.titulo, x.monto])).toEqual([["Planilla", 11_000], ["Factura de telas", 4_200], ["IGV", 1_800]]);
  });

  it("no cuenta lo que cae fuera del horizonte", () => {
    const c = cayla(proyeccion({ salidas: [salida("2026-11-20", "Planilla", 11_000, { tipo: "planilla" })] }));
    expect(c.mayores).toEqual([]);
  });
});

describe("lo que no se ve o no se pudo leer", () => {
  it("sin permiso o sin aplicar, la pieza no se dibuja (nunca un 0)", () => {
    expect(cajaProxima({ flujo: { estado: "sin_permiso" }, cuentas: null, ver: TODAS })).toEqual({ tipo: "oculta" });
    expect(cajaProxima({ flujo: { estado: "no_aplica" }, cuentas: null, ver: TODAS })).toEqual({ tipo: "oculta" });
  });

  it("si la lectura falla, lo dice y no trae cifras", () => {
    expect(cajaProxima({ flujo: { estado: "falla", mensaje: "no respondió" }, cuentas: null, ver: TODAS })).toEqual({ tipo: "falla", mensaje: "no respondió" });
  });

  it("con la proyección provisional el veredicto de alarma lleva la cautela del ADR-0417, y el verde no la necesita", () => {
    const p = { diasDeCajaConfiable: false, saldoInicialDeclarado: false };
    const alarma = cayla(proyeccion({ ...p, salidas: [salida("2026-10-28", "Planilla", 16_000, { tipo: "planilla" })] }));
    expect(texto(alarma.titular)).toBe("Con lo que hay registrado, tu caja baja de tu mínimo el 28 de octubre: llegas a S/ 12,000 y tu mínimo es S/ 15,000.");
    const bien = cayla(proyeccion({ ...p, salidas: [salida("2026-10-20", "Factura", 1_000)] }));
    expect(bien.titular.startsWith("Tu caja aguanta")).toBe(true);
  });

  it("la planilla que la cuenta no ve se anota; lo provisional lo dice la regla de Dinero", () => {
    const c = cayla(proyeccion({ planillaVisible: false, diasDeCajaConfiable: false, saldoInicialDeclarado: false }));
    expect(c.sinPlanilla).toBe(true);
    expect(c.provisional).toBe(true);
    expect(c.faltan.map((f) => f.clave)).toContain("saldos");
  });
});

describe("mirando una sede: solo lo que de verdad se separa", () => {
  const cobros = [cobro("2026-10-20", "lim", 2_000), cobro("2026-10-21", "tru", 9_000)];
  const salidas = [
    salida("2026-10-22", "Alquiler Lima", 1_350, { ubicacionId: "lim" }), salida("2026-10-22", "Alquiler Trujillo", 1_940, { ubicacionId: "tru" }),
    salida("2026-10-23", "Contador", 600), salida("2026-10-24", "Costura", 500, { ubicacionId: "tal" }),
  ];
  const cuentas = [cuenta("cajon", "lim", 700), cuenta("caja_fuerte", "lim", 1_500), cuenta("banco", "lim", 99_999), cuenta("cajon", "tru", 6_700)];

  it("una tienda: su efectivo (cajón y caja fuerte, sin banco), lo que se espera cobrar de ella y lo que sale de ella", () => {
    const c = caja(proyeccion({ cobros, salidas }), LIMA, cuentas);
    expect(c).toMatchObject({ tipo: "sede", nombre: "Lima", efectivo: 2_200, entra: 2_000, sale: 1_350 });
    expect(c.tipo === "sede" && texto(c.titular)).toBe("Lima espera cobrar S/ 2,000 y paga S/ 1,350 hasta el 29 de octubre.");
  });

  it("el efectivo que la cuenta no ve no se suma: sale «sin dato», no un número chico", () => {
    const c = caja(proyeccion({ cobros, salidas }), LIMA, [cuenta("cajon", "lim", null), cuenta("caja_fuerte", "lim", 1_500)]);
    expect(c.tipo === "sede" && c.efectivo).toBeNull();
  });

  it("el Taller no cobra: solo lo que sale de él", () => {
    const c = caja(proyeccion({ cobros, salidas }), TALLER, cuentas);
    expect(c).toMatchObject({ tipo: "sede", entra: 0, sale: 500 });
    expect(c.tipo === "sede" && c.titular).toContain("no cobra");
  });

  it("la empresa: lo que no es de ninguna sede", () => {
    const c = caja(proyeccion({ cobros, salidas }), EMPRESA, cuentas);
    expect(c).toMatchObject({ tipo: "sede", sale: 600 });
  });
});
