import { describe, expect, it } from "vitest";
import type { CuentaDinero, FilaMedio, MovimientoDinero } from "./cuentas-dinero-reglas";
import { cobrosParaVer, FILTRO_COBROS_INICIAL, filasDeCobros, filtrarCobros, graficoDelDueno, movimientosDelDueno } from "./dinero-dueno-cobros-reglas";

const mov = (p: Partial<MovimientoDinero> & Pick<MovimientoDinero, "tipo" | "monto">): MovimientoDinero => ({
  id: Math.random().toString(36).slice(2),
  fecha: "2026-10-12",
  origenId: null,
  origenNombre: null,
  origenTipo: null,
  destinoId: null,
  destinoNombre: null,
  destinoTipo: null,
  comision: 0,
  referencia: null,
  ubicacionId: null,
  estado: "vigente",
  motivoAnulacion: null,
  registradoPor: "Felipe Alvarez",
  anuladoPor: null,
  cajaMovimientoId: null,
  puedeAnular: false,
  ...p,
});

const MOVS = [
  mov({ tipo: "aporte", monto: 5000, fecha: "2026-09-03", destinoNombre: "BCP Empresa" }),
  mov({ tipo: "prestamo", monto: 10000, fecha: "2026-10-12", destinoNombre: "BCP Empresa" }),
  mov({ tipo: "retiro", monto: 2000, fecha: "2026-09-28", origenNombre: "BCP Empresa" }),
  mov({ tipo: "devolucion_prestamo", monto: 1500, fecha: "2026-10-14", origenNombre: "BCP Empresa" }),
  mov({ tipo: "retiro", monto: 600, fecha: "2026-10-09", origenNombre: "Caja fuerte · Tienda TRU", registradoPor: "Rosa Paredes" }),
  mov({ tipo: "deposito", monto: 999, origenNombre: "Caja fuerte", destinoNombre: "BCP Empresa" }),
  mov({ tipo: "aporte", monto: 777, estado: "anulado" }),
];

describe("movimientosDelDueno", () => {
  it("solo aportes, préstamos, retiros y devoluciones vigentes: ni un depósito ni algo anulado", () => {
    expect(movimientosDelDueno(MOVS)).toHaveLength(5);
  });
});

describe("graficoDelDueno", () => {
  it("por quién registró: lo que puso y sacó cada uno, de más a menos movimiento", () => {
    const g = graficoDelDueno(MOVS, "quien");
    expect(g.filas.map((f) => [f.titulo, f.puso, f.saco])).toEqual([
      ["Felipe Alvarez", 15000, 3500],
      ["Rosa Paredes", 0, 600],
    ]);
    expect([g.puso, g.saco, g.maximo]).toEqual([15000, 4100, 15000]);
  });
  it("por cuenta: donde entró lo que puso y de donde salió lo que sacó (sin el aviso largo del banco)", () => {
    const g = graficoDelDueno(MOVS, "cuenta");
    expect(g.filas.map((f) => f.titulo)).toEqual(["BCP Empresa", "Caja fuerte · Tienda TRU"]);
    expect(g.filas[0]).toMatchObject({ puso: 15000, saco: 3500 });
  });
  it("por mes: en orden del tiempo, con el mes escrito", () => {
    const g = graficoDelDueno(MOVS, "mes");
    expect(g.filas.map((f) => [f.titulo, f.puso, f.saco])).toEqual([
      ["septiembre 2026", 5000, 2000],
      ["octubre 2026", 10000, 2100],
    ]);
  });
  it("sin movimientos del dueño, un gráfico vacío y sin romper", () => {
    expect(graficoDelDueno([], "mes")).toEqual({ filas: [], puso: 0, saco: 0, maximo: 0 });
  });
  it("lo que puso menos lo que sacó es lo que queda en CAYLA (neto)", () => {
    const g = graficoDelDueno(MOVS, "quien");
    expect(g.puso - g.saco).toBe(10900);
  });
});

const cuenta = (p: Partial<CuentaDinero> & Pick<CuentaDinero, "id" | "nombre" | "tipo">): CuentaDinero => ({
  cuentaContable: "104", ubicacionId: null, ubicacionNombre: null, numero: null, saldo: 0, archivada: false, soloDestino: false,
  cajaId: null, cajaAbierta: false, saldoDesde: null, ultimaConciliacion: null, ultimoAbono: null, orden: 0, ...p,
});
const CUENTAS = [
  cuenta({ id: "bcp", nombre: "BCP Empresa", tipo: "banco" }),
  cuenta({ id: "izi", nombre: "Por depositar Izipay", tipo: "por_abonar" }),
  cuenta({ id: "cj-aqp", nombre: "Cajón · Tienda AQP", tipo: "cajon", ubicacionId: "aqp" }),
];
const medio = (ubicacionId: string, ubicacionNombre: string, m: FilaMedio["medio"], cuentaId: string | null, cuentaNombre: string | null): FilaMedio => ({ ubicacionId, ubicacionNombre, medio: m, cuentaId, cuentaNombre, vigenteDesde: null });
const MEDIOS: FilaMedio[] = [
  medio("tal", "Taller", "transferencia", null, null),
  medio("aqp", "Tienda AQP", "yape", "bcp", "BCP Empresa"),
  medio("aqp", "Tienda AQP", "plin", "bcp", "BCP Empresa"),
  medio("aqp", "Tienda AQP", "tarjeta", "izi", "Por depositar Izipay"),
  medio("aqp", "Tienda AQP", "qr", "izi", "Por depositar Izipay"),
  medio("aqp", "Tienda AQP", "transferencia", "bcp", "BCP Empresa"),
];

describe("filasDeCobros", () => {
  const filas = filasDeCobros(MEDIOS, CUENTAS);
  it("el Taller (solo transferencia) lleva una sola fila: sin cuenta; una tienda, efectivo y sus medios", () => {
    expect(filas.filter((f) => f.sede === "Taller")).toEqual([{ clave: "tal-transferencia", sede: "Taller", medio: "Transferencia", cuenta: null, tipo: "sin" }]);
    expect(filas.filter((f) => f.sede === "Tienda AQP")).toHaveLength(6);
  });
  it("el efectivo entra al cajón de la tienda; la tarjeta, a la máquina; el Yape, al banco", () => {
    const aqp = (m: string) => filas.find((f) => f.sede === "Tienda AQP" && f.medio === m)!;
    expect(aqp("Efectivo")).toMatchObject({ cuenta: "Cajón Tienda AQP", tipo: "caja" });
    expect(aqp("Tarjeta")).toMatchObject({ cuenta: "Por depositar Izipay", tipo: "maquina" });
    expect(aqp("Yape")).toMatchObject({ cuenta: "BCP Empresa", tipo: "banco" });
  });
  it("lo que falta elegir va primero en la lista corta", () => {
    const corta = cobrosParaVer(filas, 3);
    expect(corta[0].tipo).toBe("sin");
    expect(corta).toHaveLength(3);
  });
  it("filtra por sede, medio y estado, y sin filtros devuelve todo", () => {
    expect(filtrarCobros(filas, FILTRO_COBROS_INICIAL)).toHaveLength(filas.length);
    expect(filtrarCobros(filas, { sede: "Tienda AQP", medio: "todos", tipo: "maquina" })).toHaveLength(2);
    expect(filtrarCobros(filas, { sede: "todas", medio: "Yape", tipo: "todos" })).toHaveLength(1);
  });
});
