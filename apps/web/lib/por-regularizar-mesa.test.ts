import { describe, expect, it } from "vitest";
import {
  anotadoPorCaja,
  avanceDe,
  diferenciasDe,
  balanzaDe,
  buscarPrendas,
  calceDe,
  candidatasDe,
  diferenciaDe,
  disponibleDespues,
  fraseDeDiferencia,
  indexarPrendas,
  modoDeMesa,
  rotuloDeDiferencia,
  sugeridaDe,
  textoDeDiferencia,
  veredictoDe,
  visitosDe,
  type PrendaParaRegularizar,
} from "./por-regularizar-mesa";

const P = (id: string, nombre: string, categoria: string, talla: string, color: string, precio: number, codigo = id.toUpperCase()): PrendaParaRegularizar => ({ id, nombre, codigo, categoria, talla, color, precio });

const prendas = [
  P("c1", "Casaca Pampa", "Casacas", "S", "Celeste", 129, "CAS-014"),
  P("c2", "Casaca Andina", "Casacas", "S", "Celeste", 139, "CAS-021"),
  P("c3", "Casaca Pampa", "Casacas", "M", "Celeste", 129, "CAS-014"),
  P("l1", "Lentes Aviador", "Lentes de sol", "Única", "Negro", 39.9, "LEN-004"),
  P("l2", "Lentes Wayfarer", "Lentes de sol", "Única", "Carey", 49.9, "LEN-009"),
  P("v1", "Vestido Lúcuma", "Vestidos", "M", "Azul noche", 149, "VES-011"),
];
const stock = new Map([["c1", 3], ["c2", 1], ["l1", 6]]);
const casaca = { categoria: "Casacas", talla: "S", color: "Celeste", precioCobrado: 119 };
const lentes = { categoria: "Lentes de sol", talla: "Única", color: "Negro", precioCobrado: 39.9 };

describe("calceDe", () => {
  it("cuenta los tres datos", () => {
    expect(calceDe(casaca, prendas[0]).puntos).toBe(3);
    expect(calceDe(casaca, prendas[2])).toMatchObject({ categoria: true, talla: false, color: true, puntos: 2 });
    expect(calceDe(casaca, prendas[4]).puntos).toBe(0);
  });
  it("no distingue mayúsculas ni tildes", () => {
    expect(calceDe({ categoria: "vestidos", talla: "m", color: "AZUL NOCHE", precioCobrado: 1 }, prendas[5]).puntos).toBe(3);
    expect(calceDe({ categoria: "Vestídos", talla: "M", color: "azul noche", precioCobrado: 1 }, prendas[5]).puntos).toBe(3);
  });
});

describe("diferenciaDe y sus textos", () => {
  it("cobrado − oficial a céntimos", () => {
    expect(diferenciaDe(casaca, prendas[0])).toBe(-10);
    expect(diferenciaDe({ precioCobrado: 0.3 }, { precio: 0.1 })).toBe(0.2);
  });
  it("la frase y el rótulo dicen lo mismo que el modal de siempre", () => {
    expect(fraseDeDiferencia(-10)).toBe("Se cobró S/ 10.00 menos que el oficial");
    expect(fraseDeDiferencia(4)).toBe("Se cobró S/ 4.00 más que el oficial");
    expect(fraseDeDiferencia(0)).toBe("Se cobró el precio oficial");
    expect(rotuloDeDiferencia(-10)).toBe("−S/ 10.00");
    expect(rotuloDeDiferencia(4)).toBe("+S/ 4.00");
    expect(rotuloDeDiferencia(0)).toBe("Mismo precio");
    expect(textoDeDiferencia(-10)).toBe("Descuento no planificado: S/ 10.00");
    expect(textoDeDiferencia(4)).toBe("Sobreprecio: S/ 4.00");
    expect(textoDeDiferencia(0)).toBe("Se cobró el precio oficial");
  });
});

describe("candidatasDe", () => {
  it("las que más calzan primero y, entre iguales, las que tienen unidades", () => {
    const ids = candidatasDe(casaca, prendas, stock).map((c) => c.prenda.id);
    expect(ids.slice(0, 3)).toEqual(["c2", "c1", "c3"]); // Andina y Pampa calzan en todo y tienen unidades (A antes que P); la M, que calza en dos, después
    expect(ids).toHaveLength(6);
  });
  it("entre dos que calzan igual, la que tiene stock va antes aunque su nombre vaya después", () => {
    expect(candidatasDe(casaca, [prendas[0], prendas[1]], new Map([["c1", 0], ["c2", 2]])).map((c) => c.prenda.id)).toEqual(["c2", "c1"]);
    expect(candidatasDe(casaca, [prendas[1], prendas[0]], new Map([["c1", 2]])).map((c) => c.prenda.id)).toEqual(["c1", "c2"]);
  });
  it("respeta el tope y trae la diferencia y las unidades de cada una", () => {
    const c = candidatasDe(casaca, prendas, stock, 2);
    expect(c).toHaveLength(2);
    expect(c[1]).toMatchObject({ prenda: { id: "c1" }, disponible: 3, diferencia: -10 });
  });
  it("sin poder leer el stock, no inventa cifras", () => {
    expect(candidatasDe(casaca, prendas, null).every((c) => c.disponible === null)).toBe(true);
  });
  it("una prenda que no está en el mapa tiene 0", () => {
    expect(candidatasDe(casaca, prendas, stock).find((c) => c.prenda.id === "c3")?.disponible).toBe(0);
  });
});

describe("sugeridaDe", () => {
  it("una sola que calza en los tres datos y tiene unidades: esa", () => {
    expect(sugeridaDe(lentes, prendas, stock)?.id).toBe("l1");
  });
  it("dos que calzan en todo: no se sugiere nada (sería adivinar)", () => {
    expect(sugeridaDe(casaca, prendas, new Map([["c1", 3], ["c2", 1]]))).toBeNull();
  });
  it("una que calza pero sin unidades libres: no se sugiere", () => {
    expect(sugeridaDe(lentes, prendas, new Map([["l1", 0]]))).toBeNull();
  });
  it("si de las dos que calzan solo una tiene unidades, esa es LA sugerida", () => {
    expect(sugeridaDe(casaca, prendas, new Map([["c2", 1]]))?.id).toBe("c2");
  });
  it("sin poder leer el stock, no se sugiere nada", () => {
    expect(sugeridaDe(lentes, prendas, null)).toBeNull();
  });
});

describe("buscarPrendas", () => {
  const indice = indexarPrendas(prendas);
  const buscar = (q: string, arriba: string[] = []) => buscarPrendas(indice, q, casaca, stock, new Set(arriba));
  it("por inicio de palabra, en cualquier orden, sin tildes ni mayúsculas", () => {
    expect(buscar("LUCUMA").lista.map((c) => c.prenda.id)).toEqual(["v1"]);
    expect(buscar("azul vestido").lista.map((c) => c.prenda.id)).toEqual(["v1"]);
    expect(buscar("casaca m").lista.map((c) => c.prenda.id)).toEqual(["c3"]);
  });
  it("no busca por trozo: «ampa» no es «Pampa»", () => {
    expect(buscar("ampa").lista).toEqual([]);
  });
  it("encuentra por código, con o sin el guion", () => {
    expect(buscar("cas-021").lista.map((c) => c.prenda.id)).toEqual(["c2"]);
    expect(buscar("cas 021").lista.map((c) => c.prenda.id)).toEqual(["c2"]);
    expect(buscar("021").lista.map((c) => c.prenda.id)).toEqual(["c2"]);
  });
  it("no repite las que ya están arriba, y dice cuántas eran", () => {
    const r = buscar("casaca", ["c1", "c2"]);
    expect(r.lista.map((c) => c.prenda.id)).toEqual(["c3"]);
    expect(r.enLasDeArriba).toBe(2);
  });
  it("una búsqueda vacía no trae nada", () => {
    expect(buscar("   ")).toEqual({ lista: [], enLasDeArriba: 0 });
  });
  it("respeta el tope", () => {
    expect(buscarPrendas(indice, "s", casaca, stock, new Set(), 2).lista).toHaveLength(2);
  });
});

describe("balanzaDe", () => {
  it("el descuento deja lo cobrado a la izquierda del oficial", () => {
    const b = balanzaDe(119, 129);
    expect(b.tipo).toBe("descuento");
    expect(b.cobrado).toBeLessThan(b.oficial);
    expect(b.desde).toBe(b.cobrado);
    expect(b.ancho).toBeCloseTo(b.oficial - b.cobrado, 5);
  });
  it("el sobreprecio, a la derecha", () => {
    const b = balanzaDe(135, 129);
    expect(b.tipo).toBe("sobreprecio");
    expect(b.cobrado).toBeGreaterThan(b.oficial);
  });
  it("sin diferencia: las dos marcas juntas y un tramo mínimo visible", () => {
    const b = balanzaDe(129, 129);
    expect(b.tipo).toBe("exacto");
    expect(b.cobrado).toBe(b.oficial);
    expect(b.ancho).toBe(1.2);
  });
  it("las marcas nunca se salen de la regla", () => {
    for (const [c, o] of [[0.5, 300], [300, 0.5], [49.9, 45.9], [10, 10]]) {
      const b = balanzaDe(c, o);
      for (const p of [b.cobrado, b.oficial]) {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe("veredictoDe", () => {
  it("calza en los tres datos", () => expect(veredictoDe(calceDe(casaca, prendas[0]))).toEqual({ texto: "Calza en todo", tono: "ok" }));
  it("dice qué cambia cuando es la misma prenda", () => {
    expect(veredictoDe(calceDe(casaca, prendas[2]))).toEqual({ texto: "Cambia la talla", tono: "casi" }); // M Celeste vs S Celeste
    expect(veredictoDe(calceDe(casaca, P("x", "Casaca", "Casacas", "S", "Rojo", 1)))).toEqual({ texto: "Cambia el color", tono: "casi" });
    expect(veredictoDe(calceDe(casaca, P("y", "Casaca", "Casacas", "L", "Rojo", 1)))).toEqual({ texto: "Cambian talla y color", tono: "casi" });
  });
  it("otra categoría es otra prenda, aunque coincidan talla y color", () => {
    expect(veredictoDe(calceDe(casaca, P("z", "Polo", "Polos", "S", "Celeste", 1)))).toEqual({ texto: "Es otra prenda", tono: "otra" });
  });
});

describe("lo que anotó caja y contra qué no coincide", () => {
  it("«Talla S · Beige», sin lo que falte", () => {
    expect(anotadoPorCaja(casaca)).toBe("Talla S · Celeste");
    expect(anotadoPorCaja({ talla: "", color: "Negro" })).toBe("Negro");
    expect(anotadoPorCaja({ talla: "Única", color: "" })).toBe("Talla Única");
  });
  it("dice contra qué no coincide cada dato", () => {
    expect(diferenciasDe(casaca, prendas[2])).toEqual(["Caja anotó talla S; esta es talla M"]);
    expect(diferenciasDe(casaca, prendas[4])).toEqual(["Caja anotó Casacas; esta es Lentes de sol", "Caja anotó talla S; esta es talla Única", "Caja anotó Celeste; esta es Carey"]);
  });
  it("si coincide todo, no hay nada que decir", () => {
    expect(diferenciasDe(casaca, prendas[0])).toEqual([]);
  });
});

describe("visitosDe, formas y avance", () => {
  it("los tres visitos dicen cuál no coincide", () => {
    expect(visitosDe(calceDe(casaca, prendas[2]))).toEqual([
      { etiqueta: "Prenda", coincide: true },
      { etiqueta: "Talla", coincide: false },
      { etiqueta: "Color", coincide: true },
    ]);
  });
  it("«Perdió la etiqueta» baja 1 y nunca deja negativo; «Llegó nueva» deja igual", () => {
    expect(disponibleDespues(3, "ya_registrada")).toBe(2);
    expect(disponibleDespues(0, "ya_registrada")).toBe(0);
    expect(disponibleDespues(3, "llego_nueva")).toBe(3);
  });
  it("el avance cuenta lo hecho en esta visita y no retrocede si llegan ventas nuevas", () => {
    expect(avanceDe(13, 13)).toEqual({ hechas: 0, proporcion: 0 });
    expect(avanceDe(13, 10)).toEqual({ hechas: 3, proporcion: 3 / 13 });
    expect(avanceDe(13, 0)).toEqual({ hechas: 13, proporcion: 1 });
    expect(avanceDe(13, 15)).toEqual({ hechas: 0, proporcion: 0 });
    expect(avanceDe(0, 0)).toEqual({ hechas: 0, proporcion: 0 });
  });
});

describe("modoDeMesa", () => {
  it("tres columnas desde 1000, dos desde 700, y una hoja por debajo", () => {
    expect(modoDeMesa(1400)).toBe("tres");
    expect(modoDeMesa(1000)).toBe("tres");
    expect(modoDeMesa(999)).toBe("dos");
    expect(modoDeMesa(700)).toBe("dos");
    expect(modoDeMesa(699)).toBe("hoja");
    expect(modoDeMesa(375)).toBe("hoja");
  });
});
