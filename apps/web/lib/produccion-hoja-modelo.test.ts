import { describe, expect, it } from "vitest";
import { filasPorModelo, seVendioYYaNoHay, sugerenciaDeOrden, type FilaModelo } from "./produccion-decisiones";
import type { DemandaVariante } from "./produccion-decision-reglas";
import { fraseDeLaFalta, hojaDelModelo, SIN_COLOR, SIN_TALLA } from "./produccion-hoja-modelo";

// Una variante: [id, talla, color, hex, stockRed, ventasNetas, stockTaller]
type V = [string, string | null, string | null, string | null, number, number, number?];

const dem = (v: V): DemandaVariante => ({
  varianteId: v[0],
  productoId: "p1",
  stockRed: v[4],
  stockTaller: v[6] ?? 0,
  enCamino: 0,
  ritmoDia: v[5] > 0 ? v[5] / 30 : null,
  sedesConRitmo: v[5] > 0 ? 1 : 0,
  ventasNetas: v[5],
  ventasBase: v[5],
  cobertura: { tipo: "medida", dias: 10 },
  banda: "critica",
});

const fila = (vs: V[]): FilaModelo =>
  filasPorModelo(
    vs.map(dem),
    [{ productoId: "p1", referencia: "Blusa Encaje", variantesIds: vs.map((v) => v[0]), variantes: vs.map((v) => ({ varianteId: v[0], talla: v[1], color: v[2], colorHex: v[3] })) }],
    {}
  )[0];

describe("hojaDelModelo (la hoja «Ver el modelo» de Producción, tarea #8)", () => {
  const modelo = fila([
    ["a", "M", "Negro", "#111111", 3, 5],
    ["b", "S", "Negro", "#111111", 0, 7],
    ["c", "L", "Negro", "#111111", 2, 1],
    ["d", "S", "Beige", "#d8c3a5", 4, 0],
    ["e", "M", "Beige", "#d8c3a5", 0, 2],
  ]);
  const h = hojaDelModelo(modelo);

  it("las tallas van en orden de curva (no en el orden en que llegaron) y los colores por nombre", () => {
    expect(h.tallas).toEqual(["S", "M", "L"]);
    expect(h.colores.map((c) => c.nombre)).toEqual(["Beige", "Negro"]);
  });
  it("cada celda dice lo vendido y lo que queda, alineada con su talla; donde ese color no se hace en esa talla es null", () => {
    expect(h.colores[1].celdas).toEqual([
      { ventas: 7, stock: 0 }, // Negro S: se vendió y ya no hay
      { ventas: 5, stock: 3 },
      { ventas: 1, stock: 2 },
    ]);
    expect(h.colores[0].celdas).toEqual([{ ventas: 0, stock: 4 }, { ventas: 2, stock: 0 }, null]);
  });
  it("«se vendió y ya no hay» pide MÁS ventas que el umbral de poca base: con 2 ventas y stock 0 no, con 3 sí (la misma regla que el aviso de la fila)", () => {
    // Beige M: 2 ventas y 0 en tiendas → ruido, no se marca (ADR-0346).
    expect(seVendioYYaNoHay(2, 0)).toBe(false);
    expect(seVendioYYaNoHay(3, 0)).toBe(true);
    expect(seVendioYYaNoHay(40, 1)).toBe(false); // con stock no es «ya no hay»
    const marcadas = h.colores.flatMap((c) => c.celdas.map((x) => x && seVendioYYaNoHay(x.ventas, x.stock)));
    expect(marcadas.filter(Boolean)).toHaveLength(1); // solo Negro S
  });
  it("los totales por color, por talla y del modelo suman lo mismo por cualquier camino", () => {
    expect(h.colores.map((c) => [c.nombre, c.ventas, c.stock])).toEqual([["Beige", 2, 4], ["Negro", 13, 5]]);
    expect(h.porTalla).toEqual([
      { ventas: 7, stock: 4 }, // S
      { ventas: 7, stock: 3 }, // M
      { ventas: 1, stock: 2 }, // L
    ]);
    expect(h.total).toEqual({ ventas: 15, stock: 9 });
    expect(h.porTalla.reduce((s, t) => s + t.ventas, 0)).toBe(h.total.ventas);
    expect(h.colores.reduce((s, c) => s + c.ventas, 0)).toBe(h.total.ventas);
  });
  it("el total de ventas de la hoja es la suma de las ventas netas de las variantes del modelo", () => {
    expect(h.total.ventas).toBe(modelo.variantes.reduce((s, v) => s + v.ventasNetas, 0));
    expect(h.total.stock).toBe(modelo.stockRed);
  });
  it("conserva lo que el Resumen ya sabía del modelo (estado, stock, ritmo, lo que falta) y quita las variantes: no se mandan dos veces", () => {
    expect(h).toMatchObject({ productoId: "p1", referencia: "Blusa Encaje", estado: modelo.estado, stockRed: 9, ritmoDia: modelo.ritmoDia, ventasBase: 15, producir: modelo.producir, trasladar: modelo.trasladar });
    expect("variantes" in h).toBe(false);
  });

  describe("color y foto", () => {
    it("la foto y el hex de cada color vienen del catálogo; sin catálogo, el hex de la variante y sin foto (se dibuja su mosaico, nunca un hueco)", () => {
      const conCatalogo = hojaDelModelo(modelo, [{ nombre: "Negro", hex: "#000000", fotoUrl: "https://x/negro.jpg" }]);
      expect(conCatalogo.colores.find((c) => c.nombre === "Negro")).toMatchObject({ hex: "#000000", fotoUrl: "https://x/negro.jpg" });
      expect(conCatalogo.colores.find((c) => c.nombre === "Beige")).toMatchObject({ hex: "#d8c3a5", fotoUrl: null });
      expect(h.colores.find((c) => c.nombre === "Negro")).toMatchObject({ hex: "#111111", fotoUrl: null });
    });
    it("una foto es de SU color: la de otro color del catálogo no se le pega", () => {
      const r = hojaDelModelo(modelo, [{ nombre: "Rojo", hex: "#aa0000", fotoUrl: "https://x/rojo.jpg" }]);
      expect(r.colores.every((c) => c.fotoUrl === null)).toBe(true);
    });
    it("sin color en la variante no inventa uno: «Sin color», al final, y sin hex", () => {
      const r = hojaDelModelo(fila([["a", "M", null, null, 1, 4], ["b", "M", "Azul", "#0000aa", 1, 1]]));
      expect(r.colores.map((c) => c.nombre)).toEqual(["Azul", SIN_COLOR]);
      expect(r.colores[1].hex).toBeNull();
    });
  });

  describe("tallas raras", () => {
    it("sin talla va al final y se dice «Sin talla»", () => {
      const r = hojaDelModelo(fila([["a", null, "Negro", null, 0, 1], ["b", "M", "Negro", null, 0, 1]]));
      expect(r.tallas).toEqual(["M", SIN_TALLA]);
    });
    it("las tallas numéricas van por número, no como texto (28, 30, 32, no 28, 30, 4)", () => {
      const r = hojaDelModelo(fila([["a", "32", "Azul", null, 0, 1], ["b", "28", "Azul", null, 0, 1], ["c", "30", "Azul", null, 0, 1]]));
      expect(r.tallas).toEqual(["28", "30", "32"]);
    });
    it("dos variantes de la misma talla y color suman, no se pisan", () => {
      const r = hojaDelModelo(fila([["a", "M", "Negro", null, 1, 2], ["b", "M", "Negro", null, 2, 3]]));
      expect(r.colores[0].celdas[0]).toEqual({ ventas: 5, stock: 3 });
    });
  });

  describe("sin datos de venta", () => {
    it("un modelo sin ventas ni stock arma su matriz en cero, sin romper ni dividir", () => {
      const r = hojaDelModelo(fila([["a", "M", "Negro", null, 0, 0], ["b", "L", "Negro", null, 0, 0]]));
      expect(r.total).toEqual({ ventas: 0, stock: 0 });
      expect(r.colores[0].celdas.every((c) => c && !seVendioYYaNoHay(c.ventas, c.stock))).toBe(true);
    });
    it("un modelo sin variantes tiene una hoja vacía pero válida", () => {
      const r = hojaDelModelo({ ...modelo, variantes: [] });
      expect(r).toMatchObject({ tallas: [], colores: [], porTalla: [], total: { ventas: 0, stock: 0 } });
    });
  });

  describe("el traslado", () => {
    const conTaller = fila([["a", "M", "Negro", null, 0, 30, 40]]);
    it("con prendas en el Taller que cubren lo que falta, la hoja lleva a Mover mercadería con el Taller y la cantidad puestos", () => {
      expect(hojaDelModelo(conTaller, [], "T1").hrefTrasladar).toBe("/inventario/mover?origen=T1&lineas=a:30");
    });
    it("sin Taller conocido o sin nada que trasladar no hay enlace", () => {
      expect(hojaDelModelo(conTaller, [], null).hrefTrasladar).toBeNull();
      expect(hojaDelModelo(modelo, [], "T1").hrefTrasladar).toBeNull();
    });
  });

  describe("«Abrir orden sugerida»", () => {
    it("con base y algo que fabricar la hoja ofrece la orden sugerida; con poca base o sin nada que fabricar, la orden vacía", () => {
      const conBase = fila([["a", "M", "Negro", null, 0, 6]]); // 6 ventas: hay base
      expect(hojaDelModelo(conBase).sugerida).toBe(true);
      expect(hojaDelModelo(fila([["a", "M", "Negro", null, 0, 2]])).sugerida).toBe(false); // 2 ventas: poca base
      expect(hojaDelModelo(fila([["a", "M", "Negro", null, 90, 6]])).sugerida).toBe(false); // el stock alcanza: nada que fabricar
    });
    it("coincide con lo que dice la tarjeta: el mismo modelo, la misma respuesta", () => {
      const m = fila([["a", "M", "Negro", null, 0, 6], ["b", "S", "Negro", null, 0, 4]]);
      expect(hojaDelModelo(m).sugerida).toBe(sugerenciaDeOrden(m) !== null);
    });
  });

  it("es serializable (va de la página al navegador): sin funciones, Map ni undefined", () => {
    const viaJson = JSON.parse(JSON.stringify(hojaDelModelo(modelo, [{ nombre: "Negro", hex: "#000000", fotoUrl: null }], "T1")));
    expect(viaJson).toEqual(JSON.parse(JSON.stringify(viaJson)));
    expect(JSON.stringify(hojaDelModelo(modelo, [], "T1"))).not.toContain("undefined");
  });
});

describe("fraseDeLaFalta", () => {
  const f = (trasladar: number, producir: number, enProduccion = 0) => fraseDeLaFalta({ trasladar, producir, enProduccion });
  it("lo que falta se reparte en lo que ya está en el Taller y lo que hay que fabricar", () => {
    expect(f(5, 24)).toBe("Para cubrir 30 días de venta faltan 29: 5 ya están en el Taller y se trasladan; 24 hay que fabricarlas.");
  });
  it("solo trasladar, o solo fabricar, no nombra la parte que no existe", () => {
    expect(f(31, 0)).toBe("Para cubrir 30 días de venta faltan 31: 31 ya están en el Taller y se trasladan.");
    expect(f(0, 20)).toBe("Para cubrir 30 días de venta faltan 20: 20 hay que fabricarlas.");
  });
  it("en singular cuando falta una", () => {
    expect(f(0, 1)).toBe("Para cubrir 30 días de venta falta 1: 1 hay que fabricarla.");
    expect(f(1, 0)).toBe("Para cubrir 30 días de venta falta 1: 1 ya está en el Taller y se traslada.");
  });
  it("con órdenes abiertas dice que ya las contó (para que no parezca que las ignora)", () => {
    expect(f(0, 29, 1)).toBe("Para cubrir 30 días de venta faltan 29: 29 hay que fabricarlas. Ya cuenta 1 de una orden abierta.");
    expect(f(0, 10, 20)).toBe("Para cubrir 30 días de venta faltan 10: 10 hay que fabricarlas. Ya cuentan las 20 de las órdenes abiertas.");
  });
  it("si no falta nada no hay frase", () => {
    expect(f(0, 0)).toBeNull();
    expect(f(0, 0, 40)).toBeNull();
  });
});
