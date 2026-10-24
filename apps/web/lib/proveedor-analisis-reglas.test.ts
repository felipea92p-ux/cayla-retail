import { describe, expect, it } from "vitest";
import { hallazgosDeCartera, hallazgosDeProveedor, DIAS_PARA_JUZGAR, type PrendaConProveedor } from "./proveedor-analisis-reglas";
import type { PrendaDeProveedor } from "./proveedor-prendas-reglas";

const HOY = "2026-11-30";
const antes = (dias: number) => new Date(Date.parse(`${HOY}T00:00:00Z`) - dias * 86_400_000).toISOString().slice(0, 10);

const prenda = (o: Partial<PrendaDeProveedor>): PrendaDeProveedor => ({
  productoId: "p", referencia: "Blusa", codigo: null, marca: null, categoria: null,
  unidadesCompradas: 100, gasto: 3000, costoPromedio: 30, unidadesVendidas: 0, ingresoVendido: 0, costoVendido: 0,
  stockActual: 100, primeraEntrada: antes(60), ultimaVenta: null, conFactura: false, ...o,
});
const de = (proveedorId: string, o: Partial<PrendaDeProveedor>): PrendaConProveedor => ({ ...prenda(o), proveedorId, proveedorNombre: `Prov ${proveedorId}` });

describe("hallazgosDeProveedor", () => {
  it("avisa de las prendas que llevan semanas sin venderse, con sus números", () => {
    const h = hallazgosDeProveedor([prenda({ referencia: "Falda" })], HOY);
    const a = h.find((x) => x.id === "paradas");
    expect(a?.tono).toBe("atencion");
    expect(a?.numeros[0]).toContain("Falda");
  });

  it("no juzga una prenda que llegó hace poco", () => {
    expect(hallazgosDeProveedor([prenda({ primeraEntrada: antes(DIAS_PARA_JUZGAR - 1) })], HOY)).toEqual([]);
  });

  it("no avisa por poca plata", () => {
    expect(hallazgosDeProveedor([prenda({ unidadesCompradas: 5, stockActual: 5, gasto: 150 })], HOY)).toEqual([]);
  });

  it("detecta lo vendido por debajo del costo", () => {
    const h = hallazgosDeProveedor([prenda({ unidadesVendidas: 2, ingresoVendido: 40, costoVendido: 60, stockActual: 2, unidadesCompradas: 4, gasto: 120 })], HOY);
    expect(h.some((x) => x.id === "a-perdida")).toBe(true);
  });

  it("señala la prenda estrella solo con margen y ventas suficientes", () => {
    const h = hallazgosDeProveedor([prenda({ referencia: "Polo", unidadesVendidas: 8, ingresoVendido: 400, costoVendido: 200, stockActual: 20, unidadesCompradas: 28, gasto: 840 })], HOY);
    expect(h.find((x) => x.id === "estrella")?.titulo).toContain("Polo");
  });

  it("es determinista: mismas filas, mismos avisos", () => {
    const f = [prenda({}), prenda({ referencia: "Otra", unidadesVendidas: 5, ingresoVendido: 300, costoVendido: 120 })];
    expect(hallazgosDeProveedor(f, HOY)).toEqual(hallazgosDeProveedor(f, HOY));
  });
});

describe("hallazgosDeCartera", () => {
  it("dice «frénate» al proveedor con mucha plata parada y «vuelve» al que rinde", () => {
    const filas = [
      de("lento", { gasto: 5000, unidadesCompradas: 100, stockActual: 100 }),
      de("bueno", { gasto: 3000, unidadesCompradas: 100, stockActual: 20, unidadesVendidas: 80, ingresoVendido: 6000, costoVendido: 2400 }),
    ];
    const ids = hallazgosDeCartera(filas, HOY).map((h) => h.id);
    expect(ids).toContain("frenar-lento");
    expect(ids).toContain("volver-bueno");
  });

  it("avisa un margen muy por debajo del promedio, solo con ventas suficientes", () => {
    const filas = [
      de("caro", { unidadesVendidas: 20, ingresoVendido: 1000, costoVendido: 800, stockActual: 80, gasto: 3000 }),
      de("sano", { unidadesVendidas: 50, ingresoVendido: 5000, costoVendido: 2000, stockActual: 50, gasto: 3000 }),
      de("nuevo", { unidadesVendidas: 3, ingresoVendido: 100, costoVendido: 90, stockActual: 97, gasto: 3000 }),
    ];
    const ids = hallazgosDeCartera(filas, HOY).map((h) => h.id);
    expect(ids).toContain("margen-caro");
    expect(ids).not.toContain("margen-nuevo");
  });

  it("avisa la dependencia de un solo proveedor", () => {
    const ids = hallazgosDeCartera([de("a", { gasto: 9000 }), de("b", { gasto: 1000 })], HOY).map((h) => h.id);
    expect(ids).toContain("dependencia");
  });

  it("nunca pasa de 5 avisos y trae su regla en cada uno", () => {
    const filas = Array.from({ length: 12 }, (_, i) => de(`p${i}`, { gasto: 4000 + i }));
    const h = hallazgosDeCartera(filas, HOY);
    expect(h.length).toBeLessThanOrEqual(5);
    expect(h.every((x) => x.regla.length > 10 && x.numeros.length > 0)).toBe(true);
  });
});
