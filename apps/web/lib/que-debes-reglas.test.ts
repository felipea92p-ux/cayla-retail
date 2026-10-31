import { describe, expect, it } from "vitest";
import type { FilaPorPagar } from "./por-pagar-consolidado-reglas";
import {
  DIAS_CALENDARIO,
  DIAS_DE_AVISO,
  ORDEN_DEUDA_INICIAL,
  RADIO_PUNTO_MAX,
  RADIO_PUNTO_MIN,
  atencionDeDeudas,
  carrilesDeDeudas,
  columnaDeCarril,
  diaMas,
  filtrarDeudas,
  filtrarPorUnidad,
  filtrosPuestosDeuda,
  leerFiltrosDeuda,
  ordenarDeudas,
  proveedoresMayores,
  repartoPorTipo,
  radioPunto,
} from "./que-debes-reglas";
import { paginar } from "./paginacion";

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

describe("los carriles", () => {
  it("el radio crece con la raíz del saldo, entre su mínimo y su máximo", () => {
    expect(radioPunto(0)).toBe(RADIO_PUNTO_MIN);
    expect(radioPunto(1_000_000)).toBe(RADIO_PUNTO_MAX);
    expect(radioPunto(14400)).toBeLessThan(radioPunto(3600) * 2); // el doble de plata no se ve del doble de ancho
  });
  it("la columna: −1 lo vencido, el día desde hoy, y 31 lo que pasa de 30 días", () => {
    expect(columnaDeCarril("2026-10-10", HOY)).toBe(-1);
    expect(columnaDeCarril(HOY, HOY)).toBe(0);
    expect(columnaDeCarril("2026-10-19", HOY)).toBe(4);
    expect(columnaDeCarril("2026-11-14", HOY)).toBe(DIAS_CALENDARIO);
    expect(columnaDeCarril("2026-11-30", HOY)).toBe(DIAS_CALENDARIO + 1);
  });
  it("un carril por unidad, en el orden de la barra; la empresa al final; un punto por factura", () => {
    const filas = [
      fila({ id: "e", vence: "2026-10-20", saldo: 1800, ubicacionId: null }),
      fila({ id: "l", vence: "2026-10-19", saldo: 5400, ubicacionId: "lim" }),
      fila({ id: "t", vence: "2026-10-10", saldo: 3800, ubicacionId: "tru" }),
      fila({ id: "t2", vence: "2026-10-18", saldo: 200, ubicacionId: "tru" }),
      fila({ id: "x", vence: "2026-10-21", saldo: 100, ubicacionId: "otra" }),
    ];
    const c = carrilesDeDeudas(filas, HOY, ["tru", "aqp", "lim"]);
    expect(c.map((k) => k.clave)).toEqual(["tru", "lim", "otra", null]);
    expect(c[0].puntos.map((p) => p.id)).toEqual(["t", "t2"]); // por fecha
    expect(c[0].total).toBe(4000);
    expect(c[0].puntos[0]).toMatchObject({ columna: -1, vencida: true });
    expect(c.flatMap((k) => k.puntos)).toHaveLength(filas.length);
  });
  it("sin facturas, sin carriles", () => expect(carrilesDeDeudas([], HOY, ["tru"])).toEqual([]));
});

describe("diaMas", () => {
  it("cuenta días desde hoy, también al cruzar de mes", () => {
    expect(diaMas(HOY, 0)).toBe("15 oct");
    expect(diaMas(HOY, 7)).toBe("22 oct");
    expect(diaMas(HOY, 30)).toBe("14 nov");
  });
});

describe("atencionDeDeudas", () => {
  it(`vencidas en rojo y las de hoy a ${DIAS_DE_AVISO} días en ámbar, la más urgente primero; las demás, no`, () => {
    const a = atencionDeDeudas(
      [
        fila({ id: "a", vence: "2026-10-18", saldo: 640 }),
        fila({ id: "b", vence: "2026-10-12", saldo: 100 }),
        fila({ id: "c", vence: "2026-10-10", saldo: 5000 }),
        fila({ id: "d", vence: "2026-10-19", saldo: 900 }), // a 4 días: todavía no
        fila({ id: "e", vence: HOY, saldo: 300 }),
        fila({ id: "f", vence: "2026-10-09", saldo: 0 }), // ya pagada: no
      ],
      HOY,
    );
    expect(a.map((x) => [x.id, x.tono])).toEqual([["c", "rojo"], ["b", "rojo"], ["e", "ambar"], ["a", "ambar"]]);
  });
});

describe("proveedoresMayores", () => {
  it("suma por proveedor, dice cuánto ya venció y ordena por lo que se le debe", () => {
    const p = proveedoresMayores(
      [
        fila({ id: "1", vence: "2026-10-10", saldo: 6800, proveedorId: "tn", proveedor: "Textiles del Norte" }),
        fila({ id: "2", vence: "2026-10-30", saldo: 4200, proveedorId: "tn", proveedor: "Textiles del Norte" }),
        fila({ id: "3", vence: "2026-10-20", saldo: 7200, proveedorId: "cp", proveedor: "Calzado Piura" }),
        fila({ id: "4", vence: "2026-10-20", saldo: 10, proveedorId: "x", proveedor: "Otro" }),
      ],
      HOY,
      2,
    );
    expect(p).toHaveLength(2);
    expect(p[0]).toMatchObject({ proveedor: "Textiles del Norte", saldo: 11000, n: 2, vencido: 6800 });
    expect(p[1]).toMatchObject({ proveedor: "Calzado Piura", vencido: 0 });
  });
});

describe("la ventana de todas las facturas", () => {
  it("ordena por fecha de entrada, y al invertir o cambiar de columna no toca la lista original", () => {
    const copia = [...FILAS];
    expect(ordenarDeudas(FILAS, ORDEN_DEUDA_INICIAL).map((f) => f.id)).toEqual(["ven", "tex", "hil", "bot"]);
    expect(ordenarDeudas(FILAS, { campo: "saldo", dir: "desc" })[0].id).toBe("tex");
    expect(ordenarDeudas(FILAS, { campo: "proveedor", dir: "asc" })[0].proveedor).toBe("Botones y Avíos Lima");
    expect(FILAS).toEqual(copia);
  });
  it("filtra por unidad: una tienda, la empresa o todas", () => {
    const f = [fila({ id: "a", vence: HOY, saldo: 1, ubicacionId: "tru" }), fila({ id: "b", vence: HOY, saldo: 1, ubicacionId: null })];
    expect(filtrarPorUnidad(f, "tru").map((x) => x.id)).toEqual(["a"]);
    expect(filtrarPorUnidad(f, "empresa").map((x) => x.id)).toEqual(["b"]);
    expect(filtrarPorUnidad(f, "todas")).toHaveLength(2);
  });
  it("30 por página: con 73 facturas son 3 páginas, la última con 13; 40 por página, 2", () => {
    const lista = Array.from({ length: 73 }, (_, i) => i);
    const p = paginar(lista, 3, 30);
    expect([p.totalPaginas, p.filas.length, p.desde, p.hasta]).toEqual([3, 13, 61, 73]);
    expect(paginar(lista, 1, 40).totalPaginas).toBe(2);
  });
});

describe("repartoPorTipo", () => {
  it("parte lo que se debe por tipo, en el orden de siempre y sin los tipos vacíos", () => {
    const r = repartoPorTipo([
      fila({ id: "1", vence: HOY, saldo: 29000, naturaleza: "mercaderia" }),
      fila({ id: "2", vence: HOY, saldo: 8020, naturaleza: "gasto" }),
      fila({ id: "3", vence: HOY, saldo: 11200, naturaleza: "activo" }),
      fila({ id: "4", vence: HOY, saldo: 18500, naturaleza: "insumo" }),
    ]);
    expect(r.map((p) => p.tipo)).toEqual(["mercaderia", "gasto", "activo", "insumo"]);
    expect(r.map((p) => p.porcentaje)).toEqual([43, 12, 17, 28]); // 29000, 8020, 11200, 18500 de 66720
    expect(repartoPorTipo([fila({ id: "5", vence: HOY, saldo: 100, naturaleza: "gasto" })]).map((p) => p.tipo)).toEqual(["gasto"]);
  });
  it("los porcentajes siempre suman 100", () => {
    const tres = ["mercaderia", "gasto", "activo"] as const;
    const r = repartoPorTipo(tres.map((t, i) => fila({ id: String(i), vence: HOY, saldo: 100, naturaleza: t })));
    expect(r.reduce((a, p) => a + p.porcentaje, 0)).toBe(100);
  });
  it("sin facturas, nada; con saldo cero, 0 %", () => {
    expect(repartoPorTipo([])).toEqual([]);
    expect(repartoPorTipo([fila({ id: "z", vence: HOY, saldo: 0 })])[0].porcentaje).toBe(0);
  });
});
