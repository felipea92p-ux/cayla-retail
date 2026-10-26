import { describe, expect, it } from "vitest";
import {
  celdaDeFila,
  curvaDelProveedor,
  resumenTallasYSedes,
  hallazgosDeTallasYSedes,
  juntarHallazgos,
  MIN_TRASLADO,
  SEMANAS_COBERTURA_TRASLADO,
  sedesDelProveedor,
  trasladoSugerido,
  veredictoDeSede,
  type CeldaTallaSede,
} from "./proveedor-tallas-sedes-reglas";
import { MAX_AVISOS, MIN_VENDIDAS, type Hallazgo } from "./proveedor-analisis-reglas";
import { DIAS_PARA_JUZGAR } from "./proveedor-ritmo-reglas";

const HOY = "2026-11-30";
const antes = (dias: number) => new Date(Date.parse(`${HOY}T00:00:00Z`) - dias * 86_400_000).toISOString().slice(0, 10);

const LIMA = { ubicacionId: "lima", sede: "Tienda Lima", sedeTipo: "tienda" };
const TRU = { ubicacionId: "tru", sede: "Tienda Trujillo", sedeTipo: "tienda" };
const TALLER = { ubicacionId: "taller", sede: "Taller", sedeTipo: "taller" };

const celda = (o: Partial<CeldaTallaSede>): CeldaTallaSede => ({
  productoId: "emma", referencia: "Blusa Emma", categoria: "Blusas", talla: "M", ...LIMA, vendidas: 0, stock: 0, primeraLlegada: antes(56), ...o,
});

// Lima vende 40 en 8 semanas (5 por semana) y le quedan 10: se agota en 2 semanas. Trujillo vendió 2 y tiene 60: lenta. El Taller guarda 30.
const ESCENARIO: CeldaTallaSede[] = [
  celda({ talla: "M", vendidas: 30, stock: 4 }),
  celda({ talla: "S", vendidas: 10, stock: 6 }),
  celda({ ...TRU, talla: "M", vendidas: 2, stock: 20 }),
  celda({ ...TRU, talla: "S", stock: 15 }),
  celda({ ...TRU, talla: "XL", stock: 20 }),
  celda({ ...TRU, productoId: "falda", referencia: "Falda Ari", talla: "M", stock: 5 }), // Lima no vende la falda: no se sugiere llevarla
  celda({ ...TALLER, talla: "M", stock: 30 }),
];

describe("curvaDelProveedor", () => {
  it("dice qué talla pide más y cuál sobra, con la regla de Análisis", () => {
    const c = curvaDelProveedor(ESCENARIO);
    expect(c.tipo).toBe("tallas");
    if (c.tipo !== "tallas") return;
    expect(c.columnas.map((x) => x.talla)).toEqual(["S", "M", "XL"]);
    const xl = c.columnas.find((x) => x.talla === "XL")!;
    expect(xl.sobra).toBe(true);
    expect(xl.pideMas).toBe(false);
    const m = c.columnas.find((x) => x.talla === "M")!;
    expect(m.pideMas).toBe(true);
    expect(c.vendidas).toBe(42);
    expect(c.tiene).toBe(100); // tiendas y Taller: todo lo que tienes
  });

  it("con todo en talla única no hay curva que comparar", () => {
    expect(curvaDelProveedor([celda({ talla: "Única", vendidas: 20, stock: 5 })]).tipo).toBe("unica");
  });

  it("una devolución que deja la cuenta en negativo no resta lo vendido de otra talla", () => {
    const c = curvaDelProveedor([celda({ talla: "S", vendidas: -2, stock: 3 }), celda({ talla: "M", vendidas: 5, stock: 3 })]);
    if (c.tipo !== "tallas") throw new Error("debía haber curva");
    expect(c.vendidas).toBe(5);
  });
});

describe("sedesDelProveedor", () => {
  it("mide cada tienda con el ritmo del ranking y deja aparte lo que no está en una tienda", () => {
    const s = sedesDelProveedor(ESCENARIO, HOY);
    expect(s.tiendas.map((t) => t.sede)).toEqual(["Tienda Lima", "Tienda Trujillo"]); // la que más vende primero
    const [lima, tru] = s.tiendas;
    expect(lima!.ritmo.porSemana).toBe(5);
    expect(veredictoDeSede(lima!)).toBe("se-agota");
    expect(veredictoDeSede(tru!)).toBe("lenta");
    expect(s.fuera).toEqual([{ sede: "Taller", stock: 30 }]);
  });

  it("cuenta los días de cada tienda desde que le llegó, no desde que llegó al proveedor", () => {
    const s = sedesDelProveedor([celda({ vendidas: 30, stock: 30, primeraLlegada: antes(10) }), celda({ ...TRU, vendidas: 1, stock: 40, primeraLlegada: antes(90) })], HOY);
    const lima = s.tiendas.find((t) => t.ubicacionId === "lima")!;
    expect(veredictoDeSede(lima)).toBe("sin-medir"); // llegó hace 10 días: todavía no se juzga
    expect(lima.ritmo.juzgable).toBe(false);
  });

  it("una tienda que no vendió nada en semanas va lenta", () => {
    const s = sedesDelProveedor([celda({ ...TRU, stock: 25, primeraLlegada: antes(DIAS_PARA_JUZGAR) })], HOY);
    expect(veredictoDeSede(s.tiendas[0]!)).toBe("lenta");
  });
});

describe("trasladoSugerido", () => {
  it("lleva lo que le falta a la tienda que se agota, desde la que va lenta, empezando por lo que más vende", () => {
    const t = trasladoSugerido(ESCENARIO, HOY)!;
    expect(t.origen.sede).toBe("Tienda Trujillo");
    expect(t.destino.sede).toBe("Tienda Lima");
    // A Lima le faltan 5 × 8 − 10 = 30; a Trujillo le sobran 37 − ⌈0,25 × 8⌉ = 35 de la blusa y la falda: se llevan 30.
    expect(SEMANAS_COBERTURA_TRASLADO).toBe(8);
    expect(t.cantidad).toBe(30);
    expect(t.lineas).toEqual([
      { productoId: "emma", referencia: "Blusa Emma", talla: "M", cantidad: 20 },
      { productoId: "emma", referencia: "Blusa Emma", talla: "S", cantidad: 10 },
    ]);
    expect(t.lineas.some((l) => l.productoId === "falda")).toBe(false);
  });

  it("no sugiere nada si la tienda rápida todavía no se puede medir", () => {
    const recien = ESCENARIO.map((c) => (c.ubicacionId === "lima" ? { ...c, primeraLlegada: antes(10) } : c));
    expect(trasladoSugerido(recien, HOY)).toBeNull();
  });

  it("no sugiere nada si no llega al mínimo", () => {
    // Lima solo necesita 2 más para cubrir sus 8 semanas.
    const poco = [celda({ talla: "M", vendidas: 24, stock: 22 }), celda({ ...TRU, talla: "M", vendidas: 1, stock: 40 })];
    expect(MIN_TRASLADO).toBe(3);
    expect(trasladoSugerido(poco, HOY)).toBeNull();
  });

  it("no deja a la tienda de origen sin lo que ella misma vende", () => {
    // Lima vende 5 por semana y no tiene nada: le faltan 40. Trujillo vende 1 por semana y tiene 18 (lenta: 18 semanas): se guarda 8 y le sobran 10.
    const justo = [celda({ talla: "M", vendidas: 40, stock: 0 }), celda({ ...TRU, talla: "M", vendidas: 8, stock: 10 }), celda({ ...TRU, talla: "S", stock: 8 })];
    const t = trasladoSugerido(justo, HOY)!;
    expect(t.origen.ritmo.lento).toBe(true);
    expect(veredictoDeSede(t.destino)).toBe("agotada");
    expect(t.cantidad).toBe(10);
  });
});

describe("hallazgosDeTallasYSedes", () => {
  it("avisa las tallas y el traslado, con sus números y su regla", () => {
    const h = hallazgosDeTallasYSedes(ESCENARIO, HOY);
    const tallas = h.find((x) => x.id === "tallas")!;
    expect(tallas.titulo).toBe("Le compras de más XL y de menos M");
    expect(tallas.numeros.length).toBeGreaterThan(0);
    const traslado = h.find((x) => x.id === "traslado")!;
    expect(traslado.titulo).toContain("Lleva 30 de Tienda Trujillo a Tienda Lima");
    expect(traslado.numeros.some((n) => n.includes("Blusa Emma talla M: 20"))).toBe(true);
  });

  it(`con menos de ${MIN_VENDIDAS} vendidas no concluye nada de tallas`, () => {
    const pocas = [celda({ talla: "M", vendidas: MIN_VENDIDAS - 1, stock: 1 }), celda({ talla: "XL", stock: 30 })];
    expect(hallazgosDeTallasYSedes(pocas, HOY).find((x) => x.id === "tallas")).toBeUndefined();
  });
});

describe("juntarHallazgos", () => {
  it("ordena por importancia y no pasa del máximo", () => {
    const h = (id: string, prioridad: number): Hallazgo => ({ id, tono: "info", titulo: id, texto: "", numeros: [], regla: "", prioridad });
    const r = juntarHallazgos([h("a", 10), h("b", 90), h("c", 50)], [h("d", 80), h("e", 20), h("f", 70)]);
    expect(r.map((x) => x.id)).toEqual(["b", "d", "f", "c", "e"].slice(0, MAX_AVISOS));
  });
});

describe("resumenTallasYSedes (la lista: vista rápida y comparación)", () => {
  it("dice en pocas palabras lo mismo que la ficha: la talla que sobra, la tienda que mejor vende y el traslado", () => {
    const r = resumenTallasYSedes(ESCENARIO, HOY);
    expect(r.tallas?.sobran).toContain("XL");
    expect(r.tallas?.mide).toBe(true);
    expect(r.tiendas.map((t) => t.sede)).toEqual(["Tienda Lima", "Tienda Trujillo"]);
    expect(r.mejor).toEqual({ sede: "Tienda Lima", veredicto: "se-agota" });
    expect(r.traslado).toMatchObject({ origen: "Tienda Trujillo", destino: "Tienda Lima" });
    expect(r.traslado!.cantidad).toBeGreaterThanOrEqual(MIN_TRASLADO);
  });

  it(`con menos de ${MIN_VENDIDAS} vendidas no dice qué tallas pide, y con todo en talla única no hay tallas`, () => {
    const pocas = resumenTallasYSedes([celda({ talla: "M", vendidas: 3, stock: 10 }), celda({ talla: "S", vendidas: 1, stock: 10 })], HOY);
    expect(pocas.tallas?.mide).toBe(false);
    expect(resumenTallasYSedes([celda({ talla: "Única", vendidas: 30, stock: 5 })], HOY).tallas).toBeNull();
  });

  it("una tienda recién llegada no es «la mejor»: aún no se mide", () => {
    const r = resumenTallasYSedes([celda({ vendidas: 5, stock: 5, primeraLlegada: antes(DIAS_PARA_JUZGAR - 5) })], HOY);
    expect(r.tiendas[0].veredicto).toBe("sin-medir");
    expect(r.mejor).toBeNull();
  });

  it("convierte una fila de la base (los números pueden venir como texto)", () => {
    expect(
      celdaDeFila({ producto_id: "p", referencia: "Blusa", categoria: null, talla: "M", ubicacion_id: "u", sede: "Lima", sede_tipo: "tienda", vendidas: "4", stock: 6, primera_llegada: "2026-10-01" }),
    ).toEqual({ productoId: "p", referencia: "Blusa", categoria: null, talla: "M", ubicacionId: "u", sede: "Lima", sedeTipo: "tienda", vendidas: 4, stock: 6, primeraLlegada: "2026-10-01" });
  });
});
