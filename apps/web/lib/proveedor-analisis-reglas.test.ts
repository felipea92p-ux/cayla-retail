import { describe, expect, it } from "vitest";
import { hallazgosDeCartera, hallazgosDeProveedor, ritmoDe, DIAS_PARA_JUZGAR, MIN_COMPRADAS, SEMANAS_AGOTA, SEMANAS_STOCK_LARGO, type PrendaConProveedor } from "./proveedor-analisis-reglas";
import { totalesDePrendas, veredictoDe, type PrendaDeProveedor, type RendimientoProveedor } from "./proveedor-prendas-reglas";

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

describe("CASO JACARD (ficha)", () => {
  it("S/ 825 parados en 4 prendas con costo real y ≥ 21 días → avisa en plata (desde S/ 500)", () => {
    const paradas = [300, 225, 200, 100].map((plata, i) => prenda({ productoId: `j${i}`, referencia: `Top ${i}`, unidadesCompradas: 10, unidadesCompras: 10, gasto: plata, gastoCompras: plata, stockActual: 10, unidadesVendidas: 0, primeraEntrada: antes(24) }));
    const a = hallazgosDeProveedor(paradas, HOY).find((x) => x.id === "paradas");
    expect(a?.titulo).toContain("825.00");
  });
  it("con costo de la carga, los mismos 33 sin vender avisan en unidades (desde 30), no en plata", () => {
    const paradas = [12, 9, 7, 5].map((u, i) => carga({ productoId: `j${i}`, unidadesCompradas: u, unidadesCarga: u, unidadesEstimadas: u, gasto: u * 25, gastoCarga: u * 25, stockActual: u, unidadesVendidas: 0, primeraEntrada: antes(24) }));
    const a = hallazgosDeProveedor(paradas, HOY).find((x) => x.id === "paradas");
    expect(a?.titulo).toContain("33 unidades");
    expect(a?.titulo).not.toContain("S/");
  });
});

describe("hallazgosDeCartera", () => {
  it("dice «frénate» al proveedor que tardaría una temporada en vender lo que le queda, y «vuelve» al que se agota rápido con buen margen", () => {
    const filas = [
      de("lento", prenda({ gasto: 5000, gastoCompras: 5000, unidadesVendidas: 5, stockActual: 95 })),
      de("bueno", prenda({ gasto: 3000, gastoCompras: 3000, stockActual: 20, unidadesVendidas: 80, ingresoVendido: 6000, costoVendido: 2400 })),
    ];
    const ids = hallazgosDeCartera(filas, HOY).map((h) => h.id);
    expect(ids).toContain("frenar-lento");
    expect(ids).toContain("volver-bueno");
  });

  it("CASO LASAK: 183 compradas, 6 vendidas, 11 de 12 modelos con 0–1 ventas, más de 21 días, carga inicial → avisa «frenar» (no exige 10 vendidas)", () => {
    const modelos = Array.from({ length: 12 }, (_, i) =>
      carga({ productoId: `m${i}`, unidadesCompradas: i < 11 ? 15 : 18, unidadesCarga: i < 11 ? 15 : 18, unidadesEstimadas: i < 11 ? 15 : 18, unidadesVendidas: i < 5 ? 1 : i === 11 ? 1 : 0, stockActual: i < 5 ? 14 : i === 11 ? 17 : 15, primeraEntrada: antes(30) }),
    );
    const total = modelos.reduce((a, m) => a + m.unidadesCompradas, 0);
    expect(total).toBeGreaterThanOrEqual(183 - 3);
    const h = hallazgosDeCartera(modelos.map((m) => de("lasak", m)), HOY).find((x) => x.id === "frenar-lasak");
    expect(h).toBeDefined();
    expect(h?.titulo).not.toContain("S/");
    expect(ritmoDe(modelos, HOY).lento).toBe(true);
  });

  it("si no vendió nada y lleva ≥ 21 días, cuenta como lento; si llegó hace poco, no se juzga", () => {
    expect(ritmoDe([carga({ unidadesVendidas: 0, stockActual: 100 })], HOY).lento).toBe(true);
    expect(ritmoDe([carga({ unidadesVendidas: 0, stockActual: 100, primeraEntrada: antes(DIAS_PARA_JUZGAR - 1) })], HOY).lento).toBe(false);
  });

  it("no habla de ritmo con menos de 20 unidades compradas", () => {
    expect(MIN_COMPRADAS).toBe(20);
    expect(ritmoDe([carga({ unidadesCompradas: 10, unidadesCarga: 10, stockActual: 10 })], HOY).lento).toBe(false);
  });

  it("la ficha y la lista usan el mismo ritmo y el mismo umbral (una temporada = 16 semanas)", () => {
    expect(SEMANAS_STOCK_LARGO).toBe(16);
    const ps = [carga({ unidadesVendidas: 20, stockActual: 80, primeraEntrada: antes(35) })];
    const enFicha = hallazgosDeProveedor(ps, HOY).some((x) => x.id === "ritmo");
    const enLista = hallazgosDeCartera(ps.map((p) => de("x", p)), HOY).some((x) => x.id === "frenar-x");
    expect(enFicha).toBe(ritmoDe(ps, HOY).lento);
    expect(enLista).toBe(ritmoDe(ps, HOY).lento);
  });

  it("CASO DEYNER: 406 compradas, 193 vendidas en ~3,5 semanas, 204 en estantes → agota en ≤ 6 semanas; con costo real y margen ≥ promedio dice «vuelve a comprarle»", () => {
    const base = { unidadesCompradas: 406, gasto: 9300, gastoCompras: 0, unidadesVendidas: 193, ingresoVendido: 8793, costoVendido: 4489, stockActual: 204, primeraEntrada: antes(25) };
    const conCarga = [de("deyner", carga({ ...base, unidadesCarga: 406, unidadesEstimadas: 406, gastoCarga: 9300 }))];
    const r = ritmoDe(conCarga, HOY);
    expect(r.semanasParaAgotar).toBeLessThanOrEqual(SEMANAS_AGOTA);
    // Con el costo por confirmar NO se recomienda comprar: sale «se agota pronto», con «margen por confirmar».
    const sinMargen = hallazgosDeCartera(conCarga, HOY).map((h) => h.id);
    expect(sinMargen).toContain("agota-deyner");
    expect(sinMargen).not.toContain("volver-deyner");
    // Con costo real y un margen mayor al de los demás: «vuelve a comprarle».
    const conReal = [
      de("deyner", prenda({ ...base, unidadesCompras: 406, gastoCompras: 9300, gasto: 9300 })),
      de("otro", prenda({ unidadesVendidas: 40, ingresoVendido: 2000, costoVendido: 1500, stockActual: 60, gasto: 3000, gastoCompras: 3000, primeraEntrada: antes(25) })),
    ];
    const ids = hallazgosDeCartera(conReal, HOY).map((h) => h.id);
    expect(ids).toContain("volver-deyner");
    expect(ids).not.toContain("agota-deyner");
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
    const ids = hallazgosDeCartera([de("taller", prenda({ gasto: 90000, gastoCompras: 90000 }), true), de("a", prenda({ gasto: 3000, gastoCompras: 3000 })), de("b", prenda({ gasto: 3000, gastoCompras: 3000 })), de("c", prenda({ gasto: 3000, gastoCompras: 3000 })), de("d", prenda({ gasto: 3000, gastoCompras: 3000 })), de("e", prenda({ gasto: 3000, gastoCompras: 3000 }))], HOY).map((h) => h.id);
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

describe("UNA SOLA REGLA: el aviso de frenar y el veredicto del ranking nunca se contradicen", () => {
  // El ranking recibe, de la base, lo mismo que se calcula con las prendas: así que el mismo conjunto de prendas debe dar el mismo ritmo.
  const comoRendimiento = (ps: PrendaDeProveedor[]): RendimientoProveedor => {
    const t = totalesDePrendas(ps);
    return {
      proveedorId: "x", nombre: "X", esTaller: false, prendas: ps.length, unidadesCompradas: t.unidadesCompradas, unidadesCompras: t.unidadesCompras, unidadesSinFactura: t.unidadesSinFactura,
      unidadesCarga: t.unidadesCarga, unidadesEstimadas: t.unidadesEstimadas, gasto: t.gasto, gastoCompras: t.gastoCompras, gastoCarga: t.gastoCarga, unidadesVendidas: t.unidadesVendidas,
      ingresoVendido: t.ingresoVendido, costoVendido: t.costoVendido, plataEnStock: t.plataEnStock, prendasSinVenta: t.prendasSinVenta, plataSinVenta: t.plataSinVenta,
      primeraEntrada: ps.map((p) => p.primeraEntrada).filter((d): d is string => !!d).sort()[0] ?? null, unidadesEnEstantes: t.unidadesEnEstantes,
    };
  };
  const CASOS: [string, PrendaDeProveedor[]][] = [
    ["Lasak: 183 compradas, 6 vendidas", [carga({ unidadesCompradas: 183, unidadesCarga: 183, unidadesEstimadas: 183, unidadesVendidas: 6, stockActual: 177 })]],
    ["no vendió nada, más de 21 días", [carga({ unidadesVendidas: 0, stockActual: 100 })]],
    ["llegó hace poco", [carga({ unidadesVendidas: 0, stockActual: 100, primeraEntrada: antes(5) })]],
    ["vende rápido", [prenda({ unidadesVendidas: 80, stockActual: 20, ingresoVendido: 6000, costoVendido: 2400 })]],
    ["ritmo justo en el umbral", [carga({ unidadesVendidas: 25, stockActual: 75, primeraEntrada: antes(42) })]],
    ["poca mercadería", [carga({ unidadesCompradas: 10, unidadesCarga: 10, unidadesEstimadas: 10, stockActual: 10 })]],
  ];
  for (const [nombre, ps] of CASOS) {
    it(`${nombre}: el aviso de la lista sale si y solo si el veredicto dice «Rota lento»`, () => {
      const enLista = hallazgosDeCartera(ps.map((p) => de("x", p)), HOY).some((h) => h.id === "frenar-x");
      const enRanking = veredictoDe(comoRendimiento(ps), HOY).texto === "Rota lento";
      expect(enRanking).toBe(enLista);
      expect(enRanking).toBe(ritmoDe(ps, HOY).lento);
    });
  }
});
