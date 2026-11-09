import { describe, expect, it } from "vitest";
import { bolsilloDe, cuentaDeLibre, saldoEnBolsillos } from "./bolsillos-reglas";
import type { CajaCayla, CajaProxima } from "./caja-proxima-reglas";
import type { Proyeccion, SalidaProy } from "./flujo-caja-reglas";

const HOY = "2026-11-09";
const HASTA = "2026-11-23";

function caja(parcial: Partial<CajaCayla> = {}): CajaCayla {
  return {
    tipo: "cayla",
    hoy: HOY,
    hasta: HASTA,
    saldoHoy: 60_000,
    deClaudia: 4_000,
    porVolver: 1_000,
    minimo: 0,
    entra: 0,
    sale: 0,
    queda: 0,
    puntos: [],
    porSemana: false,
    mayores: [],
    bajaDelMinimo: null,
    sinPlata: null,
    masBajo: null,
    luego: null,
    titular: "",
    tono: "verde",
    provisional: false,
    faltan: [],
    sinPlanilla: false,
    ...parcial,
  };
}

let n = 0;
function salida(tipo: SalidaProy["tipo"], fecha: string, monto: number, extra: Partial<SalidaProy> = {}): SalidaProy {
  n += 1;
  return { tipo, id: `s${n}`, fecha, vence: fecha, titulo: `Pago ${n}`, detalle: "", clase: "", ubicacionId: null, unidad: null, monto, atrasada: false, ...extra };
}

function proyeccion(salidas: SalidaProy[]): Proyeccion {
  return { salidas } as unknown as Proyeccion;
}

const SALIDAS = [
  salida("planilla", "2026-11-15", 12_000),
  salida("aportes", "2026-11-15", 1_500),
  salida("impuesto", "2026-11-15", 3_000, { id: "igv:2026-10", titulo: "IGV de octubre" }),
  salida("impuesto", "2026-11-15", 500, { id: "renta:2026-10", titulo: "Renta de octubre" }),
  salida("vencimiento", "2026-11-10", 2_000, { titulo: "Textiles Andino", atrasada: true }),
  salida("vencimiento", "2026-11-20", 3_000, { titulo: "Confecciones del Sur" }),
  salida("fijo", "2026-11-12", 400, { titulo: "Luz" }),
  salida("nuevo", "2026-11-18", 100),
  // Fuera de la ventana: el IGV de noviembre se separa; el alquiler de diciembre no.
  salida("impuesto", "2026-12-15", 2_800, { id: "igv:2026-11", titulo: "IGV de noviembre" }),
  salida("fijo", "2026-12-01", 6_500, { titulo: "Alquiler" }),
];

describe("saldoEnBolsillos — Libre para usar (Felipe 2026-11-09: todo lo que tiene dueño)", () => {
  const s = saldoEnBolsillos({ caja: caja(), proyeccion: proyeccion(SALIDAS) });
  if (s.tipo !== "cayla") throw new Error("se esperaba la caja de CAYLA");

  it("«tienes» es lo que hay en las cuentas: el saldo más lo de CLAURE y el fondo de compras", () => {
    expect(s.tienes).toBe(65_000);
  });

  it("los bolsillos suman exactamente lo que no es libre", () => {
    const enBolsillos = s.bolsillos.reduce((a, b) => a + b.monto, 0);
    expect(Math.round((s.tienes - s.libre) * 100) / 100).toBe(Math.round(enBolsillos * 100) / 100);
  });

  it("resta los pagos de 14 días, CLAURE, el fondo de compras y el IGV que se va juntando; no lo que cae después", () => {
    // 65,000 − 4,000 − 1,000 − (12,000 + 1,500 + 3,000 + 500 + 2,000 + 3,000 + 400 + 100) − 2,800 = 34,700
    expect(s.libre).toBe(34_700);
    expect(s.bolsillos.flatMap((b) => b.pagos).some((p) => p.titulo === "Alquiler")).toBe(false);
  });

  it("cada pago cae en su bolsillo", () => {
    const de = (clave: string) => s.bolsillos.find((b) => b.clave === clave)?.monto;
    expect(de("equipo")).toBe(13_500);
    expect(de("sunat")).toBe(6_300);
    expect(de("proveedores")).toBe(5_000);
    expect(de("fijos")).toBe(400);
    expect(de("otros")).toBe(100);
    expect(de("compras")).toBe(1_000);
    expect(de("claure")).toBe(4_000);
  });

  it("SUNAT dice lo que vence ahora y lo que se junta para el mes que viene", () => {
    const sunat = s.bolsillos.find((b) => b.clave === "sunat")!;
    expect(sunat.detalle).toContain("vence el 15 de noviembre");
    expect(sunat.detalle).toContain("IGV de noviembre");
    expect(sunat.detalle).toContain("15 de diciembre");
  });

  it("lo vencido va primero y se dice", () => {
    const prov = s.bolsillos.find((b) => b.clave === "proveedores")!;
    expect(prov.pagos[0]!.titulo).toBe("Textiles Andino");
    expect(prov.detalle).toBe("2 facturas · 1 vencida");
  });

  it("la cuenta de la hoja empieza en lo que tienes y termina en lo libre", () => {
    const filas = cuentaDeLibre(s);
    expect(filas[0]!.monto).toBe(65_000);
    expect(filas.at(-1)).toMatchObject({ total: true, monto: 34_700 });
    expect(Math.round(filas.slice(0, -1).reduce((a, f) => a + f.monto, 0))).toBe(34_700);
  });
});

describe("saldoEnBolsillos — los bordes", () => {
  it("si lo que tiene dueño pasa lo que hay, lo libre es negativo y dice cuánto falta", () => {
    const s = saldoEnBolsillos({ caja: caja({ saldoHoy: 5_000 }), proyeccion: proyeccion(SALIDAS) });
    if (s.tipo !== "cayla") throw new Error();
    expect(s.libre).toBeLessThan(0);
    expect(s.dicho).toContain("faltan");
  });

  it("la planilla que Dynamic ya pagó también se resta: ya salió", () => {
    const s = saldoEnBolsillos({ caja: caja(), proyeccion: proyeccion([]), planillaSinSalida: 9_000 });
    if (s.tipo !== "cayla") throw new Error();
    expect(s.bolsillos.find((b) => b.clave === "planilla")?.monto).toBe(9_000);
    expect(s.libre).toBe(65_000 - 4_000 - 1_000 - 9_000);
  });

  it("un bolsillo vacío no se dibuja", () => {
    const s = saldoEnBolsillos({ caja: caja({ deClaudia: 0, porVolver: 0 }), proyeccion: proyeccion([]) });
    if (s.tipo !== "cayla") throw new Error();
    expect(s.bolsillos).toEqual([]);
    expect(s.libre).toBe(60_000);
  });

  it("el IGV del mes que ya cae dentro de los 14 días va con los pagos, sin contarse dos veces", () => {
    const s = saldoEnBolsillos({
      caja: caja({ deClaudia: 0, porVolver: 0, hasta: "2026-12-16" }),
      proyeccion: proyeccion([salida("impuesto", "2026-12-15", 2_800, { id: "igv:2026-11", titulo: "IGV de noviembre" })]),
    });
    if (s.tipo !== "cayla") throw new Error();
    expect(s.bolsillos).toHaveLength(1);
    expect(s.libre).toBe(60_000 - 2_800);
  });

  it("mirando una sede no se reparten los bancos: solo su efectivo", () => {
    const sede: CajaProxima = { tipo: "sede", nombre: "Trujillo", vende: true, hoy: HOY, hasta: HASTA, efectivo: 1_250, entra: 0, sale: 0, mayores: [], titular: "", sinPlanilla: false };
    const s = saldoEnBolsillos({ caja: sede, proyeccion: null });
    expect(s).toMatchObject({ tipo: "sede", efectivo: 1_250 });
  });

  it("sin la proyección o con la caja caída no inventa un número", () => {
    expect(saldoEnBolsillos({ caja: caja(), proyeccion: null }).tipo).toBe("sin_dato");
    expect(saldoEnBolsillos({ caja: { tipo: "falla", mensaje: "x" }, proyeccion: null })).toMatchObject({ tipo: "sin_dato", noSePudoLeer: true });
  });

  it("todo tipo de salida tiene bolsillo", () => {
    for (const t of ["vencimiento", "fijo", "planilla", "aportes", "impuesto", "nuevo"] as const) expect(bolsilloDe({ tipo: t })).toBeTruthy();
  });
});
