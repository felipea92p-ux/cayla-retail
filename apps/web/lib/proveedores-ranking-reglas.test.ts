import { describe, expect, it } from "vitest";
import { cambioDePuesto, claseDeRitmo, concentracion, paraHoy, contarPorRitmo, esAproximado, filasDelRanking, pasaFiltroRanking, semanasCortas, textoRitmo, totalesDelRanking, valorDe } from "./proveedores-ranking-reglas";
import { ritmoDeDatos } from "./proveedor-ritmo-reglas";
import type { RendimientoProveedor } from "./proveedor-prendas-reglas";

const HOY = "2026-10-26";
const antes = (dias: number) => new Date(Date.parse(`${HOY}T00:00:00Z`) - dias * 86_400_000).toISOString().slice(0, 10);

// Por defecto, de la carga inicial (costo por confirmar), como casi todo hoy en producción.
const prov = (id: string, o: Partial<RendimientoProveedor>): RendimientoProveedor => ({
  proveedorId: id, nombre: id, esTaller: false, prendas: 3,
  unidadesCompradas: 100, unidadesCompras: 0, unidadesSinFactura: 0, unidadesCarga: 100, unidadesEstimadas: 100,
  gasto: 3000, gastoCompras: 0, gastoCarga: 3000, unidadesVendidas: 30, ingresoVendido: 1800, costoVendido: 900,
  plataEnStock: 2100, prendasSinVenta: 0, plataSinVenta: 0, primeraEntrada: antes(25), unidadesEnEstantes: 70,
  ...o,
});

// Los casos reales del ADR-0502.
const deyner = prov("deyner", { nombre: "Confecciones Deyner", unidadesCompradas: 406, unidadesVendidas: 193, unidadesEnEstantes: 204, gasto: 9744, primeraEntrada: antes(21) });
const lasak = prov("lasak", { nombre: "Lasak Store", unidadesCompradas: 183, unidadesVendidas: 6, unidadesEnEstantes: 174, gasto: 5856, primeraEntrada: antes(24) });
const anqori = prov("anqori", { nombre: "Textil Anqori", unidadesCompradas: 138, unidadesVendidas: 19, unidadesEnEstantes: 115, gasto: 5244 });
const kero = prov("kero", { nombre: "Kero Moda", unidadesCompradas: 14, unidadesVendidas: 4, unidadesEnEstantes: 10, gasto: 420 });
const taller = prov("taller", { nombre: "CAYLA SAC", esTaller: true, unidadesCompradas: 520, gasto: 21400 });
const activos = new Set(["deyner", "lasak", "anqori", "kero", "taller"]);

describe("el ranking de la lista de Proveedores", () => {
  it("ordena por prendas compradas, numera los puestos y deja al Taller aparte", () => {
    const { filas, taller: t } = filasDelRanking([kero, lasak, taller, anqori, deyner], activos, HOY);
    expect(filas.map((f) => f.proveedorId)).toEqual(["deyner", "lasak", "anqori", "kero"]);
    expect(filas.map((f) => f.puesto)).toEqual([1, 2, 3, 4]);
    expect(t?.proveedorId).toBe("taller");
  });

  it("deja fuera a los desactivados, a los de servicios y a los que no tienen prendas", () => {
    const sinPrendas = prov("vacio", { unidadesCompradas: 0, unidadesVendidas: 0, unidadesEnEstantes: 0 });
    const { filas } = filasDelRanking([deyner, lasak, sinPrendas], new Set(["deyner", "vacio"]), HOY);
    expect(filas.map((f) => f.proveedorId)).toEqual(["deyner"]);
  });

  it("si empatan en prendas, va primero el que más gastó", () => {
    const a = prov("a", { nombre: "A", unidadesCompradas: 50, gasto: 900 });
    const b = prov("b", { nombre: "B", unidadesCompradas: 50, gasto: 1500 });
    const { filas } = filasDelRanking([a, b], new Set(["a", "b"]), HOY);
    expect(filas.map((f) => f.proveedorId)).toEqual(["b", "a"]);
  });

  it("dice el ritmo con la regla única: Deyner repón, Lasak frena, Anqori frena, Kero poco para medir", () => {
    const { filas } = filasDelRanking([deyner, lasak, anqori, kero], activos, HOY);
    const de = (id: string) => filas.find((f) => f.proveedorId === id)!;
    expect(de("deyner").clase).toBe("rapido");
    expect(textoRitmo(de("deyner"))).toBe("3 sem · Repón");
    expect(de("lasak").clase).toBe("lento");
    expect(textoRitmo(de("lasak"))).toBe("99 sem · Frena");
    expect(textoRitmo(de("anqori"))).toBe("22 sem · Frena");
    expect(de("kero").clase).toBe("nomide");
    expect(textoRitmo(de("kero"))).toBe("Poco para medir");
  });

  it("las semanas cortas: sin ventas, 100 o más, y lo que ya se agotó", () => {
    const r = (o: Parameters<typeof ritmoDeDatos>[0]) => ritmoDeDatos(o, HOY);
    expect(semanasCortas(r({ unidadesVendidas: 0, unidadesCompradas: 40, unidadesEnEstantes: 40, primeraEntrada: antes(30) }))).toBe("Sin ventas");
    expect(semanasCortas(r({ unidadesVendidas: 1, unidadesCompradas: 200, unidadesEnEstantes: 199, primeraEntrada: antes(30) }))).toBe("100+ sem");
    const agotado = r({ unidadesVendidas: 40, unidadesCompradas: 40, unidadesEnEstantes: 0, primeraEntrada: antes(30) });
    expect(semanasCortas(agotado)).toBe("Agotado");
    expect(claseDeRitmo(agotado)).toBe("rapido");
    expect(semanasCortas(r({ unidadesVendidas: 5, unidadesCompradas: 10, unidadesEnEstantes: 5, primeraEntrada: antes(30) }))).toBeNull();
  });

  it("cuenta y filtra por ritmo y por deuda vencida", () => {
    const { filas } = filasDelRanking([deyner, lasak, anqori, kero], activos, HOY);
    expect(contarPorRitmo(filas)).toEqual({ rapido: 1, medio: 0, lento: 2, nomide: 1 });
    expect(filas.filter((f) => pasaFiltroRanking(f, "lento", false)).map((f) => f.proveedorId)).toEqual(["lasak", "anqori"]);
    expect(filas.filter((f) => pasaFiltroRanking(f, "vencido", f.proveedorId === "anqori")).map((f) => f.proveedorId)).toEqual(["anqori"]);
    expect(filas.filter((f) => pasaFiltroRanking(f, null, false))).toHaveLength(4);
  });

  it("por dinero gastado ordena por lo gastado, y dice cuántos puestos subió o bajó cada uno", () => {
    const caro = prov("caro", { nombre: "Caro", unidadesCompradas: 60, gasto: 8000 });
    const porPrendas = filasDelRanking([deyner, lasak, caro], new Set(["deyner", "lasak", "caro"]), HOY, "prendas");
    const porDinero = filasDelRanking([deyner, lasak, caro], new Set(["deyner", "lasak", "caro"]), HOY, "soles");
    expect(porPrendas.filas.map((f) => f.proveedorId)).toEqual(["deyner", "lasak", "caro"]);
    expect(porDinero.filas.map((f) => f.proveedorId)).toEqual(["deyner", "caro", "lasak"]);
    const antes = new Map(porPrendas.filas.map((f) => [f.proveedorId, f.puesto]));
    const de = (id: string) => porDinero.filas.find((f) => f.proveedorId === id)!;
    expect(cambioDePuesto(antes, de("caro"))).toBe(1);
    expect(cambioDePuesto(antes, de("lasak"))).toBe(-1);
    expect(cambioDePuesto(antes, de("deyner"))).toBe(0);
    expect(cambioDePuesto(null, de("caro"))).toBe(0);
    expect(valorDe(de("caro"), "soles")).toBe(8000);
    expect(valorDe(de("caro"), "prendas")).toBe(60);
  });

  it("el dinero es aproximado cuando la mitad o más vino por la carga inicial", () => {
    const { filas } = filasDelRanking([deyner, prov("real", { unidadesCompradas: 80, unidadesCompras: 60, unidadesCarga: 20 })], new Set(["deyner", "real"]), HOY);
    expect(esAproximado(filas.find((f) => f.proveedorId === "deyner")!)).toBe(true);
    expect(esAproximado(filas.find((f) => f.proveedorId === "real")!)).toBe(false);
    const t = totalesDelRanking(filas);
    expect(t.prendas).toBe(486);
    expect(Math.round(t.cargaPct)).toBe(88);
  });

  it("lo de hoy: lo vencido, las entregas atrasadas y lo que te deben, de mayor a menor", () => {
    const p = (id: string, v: number | null, a: number | null, f: number | null) => ({ id, nombre: id, saldo_vencido: v, facturas_atrasadas: a, saldo_favor: f });
    const h = paraHoy([p("a", 310, 0, null), p("b", 1150, 2, 0), p("c", null, 1, 180), p("d", 0, null, null)]);
    expect(h.vencidos.map((x) => x.id)).toEqual(["b", "a"]);
    expect(h.vencido).toBe(1460);
    expect(h.atrasados.map((x) => x.id)).toEqual(["b", "c"]);
    expect(h.atrasadas).toBe(3);
    expect(h.aFavor.map((x) => x.id)).toEqual(["c"]);
    expect(h.favor).toBe(180);
  });

  it("la concentración: qué parte de lo que compras es de tus primeros proveedores", () => {
    const filas = [100, 50, 30, 20].map((u, i) => ({ unidadesCompradas: u, gasto: [1000, 4000, 300, 200][i] }));
    expect(concentracion(filas, "prendas", 2)).toBe(75);
    expect(Math.round(concentracion(filas, "soles", 1))).toBe(73);
    expect(concentracion([], "prendas")).toBe(0);
  });
});
