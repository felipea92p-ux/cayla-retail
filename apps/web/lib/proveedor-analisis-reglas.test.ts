import { describe, expect, it } from "vitest";
import { hallazgosDeCartera, hallazgosDeProveedor, DIAS_PARA_JUZGAR, type PrendaConProveedor } from "./proveedor-analisis-reglas";
import type { PrendaDeProveedor } from "./proveedor-prendas-reglas";

const HOY = "2026-11-30";
const antes = (dias: number) => new Date(Date.parse(`${HOY}T00:00:00Z`) - dias * 86_400_000).toISOString().slice(0, 10);

// Por defecto, de origen Compras (costo real). `carga()` es la carga inicial (costo por confirmar).
const prenda = (o: Partial<PrendaDeProveedor>): PrendaDeProveedor => ({
  productoId: "p", referencia: "Blusa", codigo: null, marca: null, categoria: null,
  unidadesCompradas: 100, unidadesCompras: 100, unidadesSinFactura: 0, unidadesCarga: 0, unidadesEstimadas: 0,
  gasto: 3000, gastoCompras: 3000, gastoCarga: 0, costoPromedio: 30,
  unidadesVendidas: 0, ingresoVendido: 0, costoVendido: 0, stockActual: 100, primeraEntrada: antes(60), ultimaVenta: null, conFactura: true, ...o,
});
const carga = (o: Partial<PrendaDeProveedor> = {}) => prenda({ unidadesCompras: 0, unidadesCarga: 100, unidadesEstimadas: 100, gastoCompras: 0, gastoCarga: 3000, conFactura: false, ...o });
const de = (proveedorId: string, p: PrendaDeProveedor, esTaller = false): PrendaConProveedor => ({ ...p, proveedorId, proveedorNombre: `Prov ${proveedorId}`, esTaller });

describe("hallazgosDeProveedor", () => {
  it("avisa en plata las prendas que llevan semanas sin venderse, con sus números", () => {
    const a = hallazgosDeProveedor([prenda({ referencia: "Falda" })], HOY).find((x) => x.id === "paradas");
    expect(a?.tono).toBe("atencion");
    expect(a?.titulo).toContain("S/");
    expect(a?.numeros[0]).toContain("Falda");
  });

  it("con la carga inicial avisa en unidades, nunca en plata", () => {
    const a = hallazgosDeProveedor([carga()], HOY).find((x) => x.id === "paradas");
    expect(a).toBeDefined();
    expect(a?.titulo).toContain("unidades");
    expect(a?.titulo).not.toContain("S/");
  });

  it("no juzga una prenda que llegó hace poco", () => {
    expect(hallazgosDeProveedor([prenda({ primeraEntrada: antes(DIAS_PARA_JUZGAR - 1) })], HOY)).toEqual([]);
  });

  it("no avisa por poca plata ni por pocas unidades", () => {
    expect(hallazgosDeProveedor([prenda({ unidadesCompradas: 5, unidadesCompras: 5, stockActual: 5, gasto: 150, gastoCompras: 150 })], HOY)).toEqual([]);
  });

  it("detecta lo vendido por debajo del costo solo con costo real", () => {
    const v = { unidadesVendidas: 2, ingresoVendido: 40, costoVendido: 60 };
    expect(hallazgosDeProveedor([prenda(v)], HOY).some((x) => x.id === "a-perdida")).toBe(true);
    expect(hallazgosDeProveedor([carga(v)], HOY).some((x) => x.id === "a-perdida")).toBe(false);
  });

  it("señala la prenda estrella solo con margen, ventas y costo real", () => {
    const v = { referencia: "Polo", unidadesVendidas: 8, ingresoVendido: 400, costoVendido: 200, stockActual: 20 };
    expect(hallazgosDeProveedor([prenda(v)], HOY).find((x) => x.id === "estrella")?.titulo).toContain("Polo");
    expect(hallazgosDeProveedor([carga(v)], HOY).some((x) => x.id === "estrella")).toBe(false);
  });

  it("con muchas ventas y costo de carga dice «Costo por confirmar»", () => {
    const h = hallazgosDeProveedor([carga({ unidadesVendidas: 30, ingresoVendido: 900, costoVendido: 600, stockActual: 70 })], HOY);
    expect(h.some((x) => x.id === "costo-por-confirmar")).toBe(true);
  });

  it("es determinista: mismas filas, mismos avisos", () => {
    const f = [prenda({}), prenda({ referencia: "Otra", unidadesVendidas: 5, ingresoVendido: 300, costoVendido: 120 })];
    expect(hallazgosDeProveedor(f, HOY)).toEqual(hallazgosDeProveedor(f, HOY));
  });
});

describe("hallazgosDeCartera", () => {
  it("dice «frénate» al proveedor con mucha plata parada y «vuelve» al que rinde", () => {
    const filas = [
      de("lento", prenda({ gasto: 5000, gastoCompras: 5000 })),
      de("bueno", prenda({ gasto: 3000, gastoCompras: 3000, stockActual: 20, unidadesVendidas: 80, ingresoVendido: 6000, costoVendido: 2400 })),
    ];
    const ids = hallazgosDeCartera(filas, HOY).map((h) => h.id);
    expect(ids).toContain("frenar-lento");
    expect(ids).toContain("volver-bueno");
  });

  it("con carga inicial no dice nada de dinero: avisa rotación lenta en unidades", () => {
    const ids = hallazgosDeCartera([de("carga", carga({ unidadesVendidas: 2, stockActual: 98 }))], HOY).map((h) => h.id);
    expect(ids).toContain("lento-carga");
    expect(ids.some((i) => i.startsWith("frenar") || i.startsWith("margen") || i.startsWith("volver"))).toBe(false);
  });

  it("avisa un margen muy por debajo del promedio, solo con ventas suficientes y costo real", () => {
    const filas = [
      de("caro", prenda({ unidadesVendidas: 20, ingresoVendido: 1000, costoVendido: 800, stockActual: 80 })),
      de("sano", prenda({ unidadesVendidas: 50, ingresoVendido: 5000, costoVendido: 2000, stockActual: 50 })),
      de("nuevo", prenda({ unidadesVendidas: 3, ingresoVendido: 100, costoVendido: 90, stockActual: 97 })),
    ];
    const ids = hallazgosDeCartera(filas, HOY).map((h) => h.id);
    expect(ids).toContain("margen-caro");
    expect(ids).not.toContain("margen-nuevo");
  });

  it("deja fuera al Taller: ni lo compara ni cuenta en la dependencia", () => {
    const ids = hallazgosDeCartera([de("taller", prenda({ gasto: 90000, gastoCompras: 90000 }), true), de("a", prenda({ gasto: 3000, gastoCompras: 3000 })), de("b", prenda({ gasto: 3000, gastoCompras: 3000 })), de("c", prenda({ gasto: 3000, gastoCompras: 3000 }))], HOY).map((h) => h.id);
    expect(ids.some((i) => i.endsWith("taller"))).toBe(false);
    expect(ids).not.toContain("dependencia");
  });

  it("avisa la dependencia de un solo proveedor", () => {
    const ids = hallazgosDeCartera([de("a", prenda({ gasto: 9000, gastoCompras: 9000 })), de("b", prenda({ gasto: 1000, gastoCompras: 1000 }))], HOY).map((h) => h.id);
    expect(ids).toContain("dependencia");
  });

  it("nunca pasa de 5 avisos y trae su regla en cada uno", () => {
    const filas = Array.from({ length: 12 }, (_, i) => de(`p${i}`, prenda({ gasto: 4000 + i, gastoCompras: 4000 + i })));
    const h = hallazgosDeCartera(filas, HOY);
    expect(h.length).toBeLessThanOrEqual(5);
    expect(h.every((x) => x.regla.length > 10 && x.numeros.length > 0)).toBe(true);
  });
});
