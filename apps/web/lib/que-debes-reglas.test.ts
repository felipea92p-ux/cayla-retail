import { describe, expect, it } from "vitest";
import type { FilaPorPagar } from "./por-pagar-consolidado-reglas";
import {
  DIAS_CALENDARIO,
  RADIO_MAX,
  RADIO_MIN,
  burbujasDeDeudas,
  columnaBurbuja,
  filtrarDeudas,
  filtrosPuestosDeuda,
  leerFiltrosDeuda,
  radioBurbuja,
} from "./que-debes-reglas";

const HOY = "2026-10-15";
const fila = (p: Partial<FilaPorPagar> & Pick<FilaPorPagar, "id" | "vence" | "saldo">): FilaPorPagar => ({
  origen: "compras", naturaleza: "mercaderia", proveedorId: "p", proveedor: "Proveedor", documento: "F001-1", tipo: "factura", concepto: null,
  fechaEmision: HOY, condicion: "credito", fechaVencimiento: p.vence, ubicacionId: null, unidades: null, total: p.saldo, pagado: 0, ...p,
});
// La historia de la maqueta (jueves 15 de octubre): una vencida, una de esta semana, dos más adelante.
const FILAS = [
  fila({ id: "ven", vence: "2026-10-10", saldo: 5133.6, proveedor: "Textiles Andina SAC", documento: "F001-000198" }),
  fila({ id: "tex", vence: "2026-10-19", saldo: 6800, proveedor: "Textiles del Norte", documento: "F001-2231", naturaleza: "insumo", origen: "produccion" }),
  fila({ id: "hil", vence: "2026-10-28", saldo: 4600, proveedor: "Hilandería Andina", documento: "F002-0871", naturaleza: "insumo" }),
  fila({ id: "bot", vence: "2026-11-30", saldo: 3200, proveedor: "Botones y Avíos Lima", documento: "E001-339", naturaleza: "gasto", concepto: "Perchas y avíos para la apertura" }),
];
const sp = (o: Record<string, string>) => new URLSearchParams(o);

describe("leerFiltrosDeuda", () => {
  it("lee tramo, tipo y búsqueda; lo que no existe se ignora", () => {
    expect(leerFiltrosDeuda(sp({ tramo: "semana", tipo: "insumo", q: "  hilos " }))).toEqual({ tramo: "semana", tipo: "insumo", q: "hilos" });
    expect(leerFiltrosDeuda(sp({ tramo: "mañana", tipo: "ropa" }))).toEqual({ tramo: null, tipo: null, q: "" });
  });
});

describe("filtrarDeudas", () => {
  const ids = (f: Parameters<typeof filtrarDeudas>[1]) => filtrarDeudas(FILAS, f, HOY).map((x) => x.id);
  it("sin filtros, todas", () => expect(ids({ tramo: null, tipo: null, q: "" })).toEqual(["ven", "tex", "hil", "bot"]));
  it("por tramo: lo vencido, esta semana (7 días), la próxima, más adelante", () => {
    expect(ids({ tramo: "vencidas", tipo: null, q: "" })).toEqual(["ven"]);
    expect(ids({ tramo: "semana", tipo: null, q: "" })).toEqual(["tex"]);
    expect(ids({ tramo: "proxima", tipo: null, q: "" })).toEqual(["hil"]);
    expect(ids({ tramo: "despues", tipo: null, q: "" })).toEqual(["bot"]);
  });
  it("por tipo, y los filtros se suman", () => {
    expect(ids({ tramo: null, tipo: "insumo", q: "" })).toEqual(["tex", "hil"]);
    expect(ids({ tramo: "semana", tipo: "insumo", q: "" })).toEqual(["tex"]);
    expect(ids({ tramo: "vencidas", tipo: "insumo", q: "" })).toEqual([]);
  });
  it("busca en proveedor, comprobante y concepto, sin tildes ni mayúsculas", () => {
    expect(ids({ tramo: null, tipo: null, q: "hilanderia" })).toEqual(["hil"]);
    expect(ids({ tramo: null, tipo: null, q: "e001" })).toEqual(["bot"]);
    expect(ids({ tramo: null, tipo: null, q: "APERTURA" })).toEqual(["bot"]);
    expect(ids({ tramo: null, tipo: null, q: "textiles" })).toEqual(["ven", "tex"]);
  });
});

describe("filtrosPuestosDeuda", () => {
  it("dice cada filtro en palabras, con su clave para quitarlo", () => {
    expect(filtrosPuestosDeuda({ tramo: "semana", tipo: "insumo", q: "hilos" })).toEqual([
      { clave: "tramo", texto: "Vence: esta semana" },
      { clave: "tipo", texto: "Tipo: insumo del taller" },
      { clave: "q", texto: "Busca: «hilos»" },
    ]);
    expect(filtrosPuestosDeuda({ tramo: null, tipo: null, q: "" })).toEqual([]);
  });
});

describe("las burbujas", () => {
  it("el radio crece con la raíz del saldo, entre su mínimo y su máximo", () => {
    expect(radioBurbuja(0)).toBe(RADIO_MIN);
    expect(radioBurbuja(3600)).toBe(18); // 8 + 60/6
    expect(radioBurbuja(1_000_000)).toBe(RADIO_MAX);
    expect(radioBurbuja(14400)).toBeLessThan(radioBurbuja(3600) * 2); // el doble de plata no se ve del doble de ancho
  });
  it("la columna: −1 lo vencido, el día desde hoy, y 31 lo que pasa de 30 días", () => {
    expect(columnaBurbuja("2026-10-10", HOY)).toBe(-1);
    expect(columnaBurbuja(HOY, HOY)).toBe(0);
    expect(columnaBurbuja("2026-10-19", HOY)).toBe(4);
    expect(columnaBurbuja("2026-11-14", HOY)).toBe(DIAS_CALENDARIO);
    expect(columnaBurbuja("2026-11-30", HOY)).toBe(DIAS_CALENDARIO + 1);
  });
  it("una burbuja por factura; las del mismo día se apilan, la de mayor saldo abajo", () => {
    const b = burbujasDeDeudas(
      [fila({ id: "a", vence: "2026-10-19", saldo: 900 }), fila({ id: "b", vence: "2026-10-19", saldo: 6800 }), fila({ id: "c", vence: "2026-10-20", saldo: 100 })],
      HOY,
    );
    const de = (id: string) => b.find((x) => x.id === id)!;
    expect(b).toHaveLength(3);
    expect(de("b").alto).toBe(de("b").r); // la grande, apoyada en la línea
    expect(de("a").alto).toBe(de("b").r * 2 + 4 + de("a").r); // la chica, encima, con 4 de aire
    expect(de("c").alto).toBe(de("c").r); // otro día, otra pila
  });
});
