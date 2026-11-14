import { describe, expect, it } from "vitest";
import { coloresDeLaPrenda, galeriaDePrendas, leerRecibidasDelProveedor, parecidoPorPlata, porQueArriba, referenciaComun, referenciaDe } from "./recepcion-galeria-reglas";
import type { PrendaRecepcion, VarianteRecepcion } from "./recepcion-envio-reglas";

const variante = (color: string | null, hex: string | null = null, codigo: string | null = null): VarianteRecepcion => ({
  id: `${color}-${codigo}`,
  tallaId: null,
  talla: "M",
  colorCodigo: null,
  color,
  colorHex: hex,
  codigo,
  costo: null,
  precio: null,
});

const prenda = (nombre: string, marca: string | null, colores: (string | null)[] = [], codigo: string | null = null): PrendaRecepcion => ({
  productoId: nombre,
  nombre,
  codigo,
  fotoUrl: null,
  variantes: colores.map((c) => variante(c)),
  nueva: false,
  estadoAlta: null,
  marca: marca ? { id: marca, nombre: marca.toUpperCase() } : null,
});

// Treinta blusas de tres marcas, como una categoría real de Recibir.
const treinta = Array.from({ length: 30 }, (_, i) => prenda(`Blusa ${String(i + 1).padStart(2, "0")}`, ["claure", "miramhe", null][i % 3], i % 2 ? ["Rojo"] : ["Azul"]));

describe("galeriaDePrendas", () => {
  it("sin escribir quedan todas", () => {
    expect(galeriaDePrendas(treinta, { busqueda: "" })).toHaveLength(30);
    expect(galeriaDePrendas(treinta, { busqueda: "   " })).toHaveLength(30);
  });

  it("al escribir quedan SOLO las que coinciden, no solo se ordenan", () => {
    const halladas = galeriaDePrendas(treinta, { busqueda: "blusa 07" });
    expect(halladas.map((p) => p.nombre)).toEqual(["Blusa 07"]);
  });

  it("busca sin tildes ni mayúsculas y en cualquier orden", () => {
    const p = [prenda("Camisón Ébano", "x"), prenda("Polo", "x")];
    expect(galeriaDePrendas(p, { busqueda: "EBANO camison" }).map((x) => x.nombre)).toEqual(["Camisón Ébano"]);
  });

  it("encuentra por color, marca y código de variante", () => {
    const p = [
      { ...prenda("Aurora", "claure"), variantes: [variante("Rojo", "#c00", "AUR-R-M")] },
      prenda("Brisa", "miramhe", ["Azul"]),
    ];
    expect(galeriaDePrendas(p, { busqueda: "rojo" }).map((x) => x.nombre)).toEqual(["Aurora"]);
    expect(galeriaDePrendas(p, { busqueda: "miramhe" }).map((x) => x.nombre)).toEqual(["Brisa"]);
    expect(galeriaDePrendas(p, { busqueda: "aur-r" }).map((x) => x.nombre)).toEqual(["Aurora"]);
  });

  it("todas las palabras tienen que estar", () => {
    expect(galeriaDePrendas(treinta, { busqueda: "blusa verde" })).toEqual([]);
  });

  it("primero las marcas de este envío, después las demás, cada grupo por nombre", () => {
    const p = [prenda("Zeta", "claure"), prenda("Alfa", "otra"), prenda("Beta", "claure"), prenda("Gama", null)];
    expect(galeriaDePrendas(p, { busqueda: "", marcasDelEnvio: ["claure", null] }).map((x) => x.nombre)).toEqual(["Beta", "Zeta", "Alfa", "Gama"]);
  });

  it("sin marcas del envío, solo por nombre, y estable ante el orden de la base", () => {
    const p = [prenda("Brisa", "a"), prenda("aurora", "b"), prenda("Coral", "c")];
    const al = galeriaDePrendas(p, { busqueda: "" }).map((x) => x.nombre);
    expect(al).toEqual(["aurora", "Brisa", "Coral"]);
    expect(galeriaDePrendas([...p].reverse(), { busqueda: "" }).map((x) => x.nombre)).toEqual(al);
  });

  it("no muta la lista que recibe", () => {
    const copia = [...treinta];
    galeriaDePrendas(treinta, { busqueda: "rojo", marcasDelEnvio: ["miramhe"] });
    expect(treinta).toEqual(copia);
  });
});

describe("coloresDeLaPrenda", () => {
  it("sin repetir, sin «Sin color», con su hex", () => {
    const p = { variantes: [variante("Rojo", "#c00"), variante("rojo"), variante(null), variante("Azul", "#00c")] };
    expect(coloresDeLaPrenda(p)).toEqual([
      { nombre: "Rojo", hex: "#c00" },
      { nombre: "Azul", hex: "#00c" },
    ]);
  });
});

// Una prenda con su costo y su precio en todas sus variantes.
const conPlata = (nombre: string, marca: string | null, costo: number | null, precio: number | null): PrendaRecepcion => ({
  ...prenda(nombre, marca, ["Azul", "Rojo"]),
  variantes: ["Azul", "Rojo"].map((c) => ({ ...variante(c), costo, precio })),
});

describe("el orden de lo más parecido (Felipe 2026-11-14)", () => {
  const recibidas = new Map([
    ["Viejo", "2026-06-01T15:00:00Z"],
    ["Reciente", "2026-11-02T15:00:00Z"],
  ]);

  it("primero lo que este proveedor ya mandó, lo más reciente arriba", () => {
    const p = [conPlata("Alfa", "x", null, null), conPlata("Viejo", "x", null, null), conPlata("Reciente", "x", null, null)];
    expect(galeriaDePrendas(p, { busqueda: "", recibidas }).map((x) => x.nombre)).toEqual(["Reciente", "Viejo", "Alfa"]);
  });

  it("después, mismo costo y precio; luego parecidos; luego el resto", () => {
    const ref = { costo: 35, precio: 79 };
    const p = [conPlata("Lejana", "x", 80, 150), conPlata("Parecida", "x", 38, 85), conPlata("Igual", "x", 35, 79), conPlata("SinDato", "x", null, null)];
    expect(galeriaDePrendas(p, { busqueda: "", referencia: ref }).map((x) => x.nombre)).toEqual(["Igual", "Parecida", "Lejana", "SinDato"]);
  });

  it("el parecido por plata gana a la marca del envío; la marca, al nombre", () => {
    const ref = { costo: 35, precio: 79 };
    const p = [conPlata("A-envio", "claure", 90, 200), conPlata("B-otra", "otra", 35, 79), conPlata("C-envio", "claure", null, null), conPlata("D-otra", "otra", null, null)];
    expect(galeriaDePrendas(p, { busqueda: "", referencia: ref, marcasDelEnvio: ["claure"] }).map((x) => x.nombre)).toEqual(["B-otra", "A-envio", "C-envio", "D-otra"]);
  });

  it("lo del proveedor va antes aunque cueste distinto", () => {
    const ref = { costo: 35, precio: 79 };
    const p = [conPlata("Igual", "x", 35, 79), conPlata("Reciente", "x", 60, 120)];
    expect(galeriaDePrendas(p, { busqueda: "", referencia: ref, recibidas }).map((x) => x.nombre)).toEqual(["Reciente", "Igual"]);
  });

  it("el orden nunca esconde: con o sin contexto quedan las mismas", () => {
    const p = [conPlata("Uno", "x", 35, 79), conPlata("Dos", "y", 10, 20), conPlata("Reciente", "z", null, null)];
    expect(galeriaDePrendas(p, { busqueda: "", referencia: { costo: 35, precio: 79 }, recibidas })).toHaveLength(3);
  });
});

describe("parecidoPorPlata", () => {
  it("mismo, parecido o nada; sin referencia o sin dato, nada", () => {
    expect(parecidoPorPlata(conPlata("a", null, 35, 79), { costo: 35, precio: 79 })).toBe("mismo");
    expect(parecidoPorPlata(conPlata("a", null, 35.5, 79), { costo: 35, precio: 79 })).toBe("mismo");
    expect(parecidoPorPlata(conPlata("a", null, 38, 85), { costo: 35, precio: 79 })).toBe("parecido");
    expect(parecidoPorPlata(conPlata("a", null, 60, 140), { costo: 35, precio: 79 })).toBeNull();
    expect(parecidoPorPlata(conPlata("a", null, 35, 79), null)).toBeNull();
    expect(parecidoPorPlata(conPlata("a", null, null, null), { costo: 35, precio: 79 })).toBeNull();
  });

  it("compara solo lo que hay: sin el costo del modelo, solo el precio", () => {
    expect(parecidoPorPlata(conPlata("a", null, 99, 79), { costo: null, precio: 79 })).toBe("mismo");
  });
});

describe("porQueArriba", () => {
  it("dice la fecha de Lima y lo que se comparó, en una línea", () => {
    const recibidas = new Map([["Reciente", "2026-11-02T03:00:00Z"]]); // 1 nov a las 22:00 en Lima
    expect(porQueArriba(conPlata("Reciente", null, 35, 79), { recibidas, referencia: { costo: 35, precio: 79 } })).toBe("Llegó el 1 nov · mismo costo y precio");
    expect(porQueArriba(conPlata("Otra", null, 35, 79), { referencia: { costo: null, precio: 79 } })).toBe("Mismo precio");
    expect(porQueArriba(conPlata("Otra", null, 38, 85), { referencia: { costo: 35, precio: 79 } })).toBe("Costo y precio parecidos");
    expect(porQueArriba(conPlata("Otra", null, null, null), {})).toBeNull();
  });
});

describe("leerRecibidasDelProveedor", () => {
  it("lee la respuesta de la base e ignora lo roto", () => {
    const m = leerRecibidasDelProveedor([{ producto_id: "p1", ultima_vez: "2026-11-02T15:00:00Z" }, { producto_id: 3 }, null, { producto_id: "p2", ultima_vez: "ayer" }]);
    expect([...m.keys()]).toEqual(["p1"]);
    expect(leerRecibidasDelProveedor(null).size).toBe(0);
  });
});

describe("referenciaDe y referenciaComun", () => {
  it("lee el costo escrito y el precio; nada, si no hay", () => {
    expect(referenciaDe("35,50", 79)).toEqual({ costo: 35.5, precio: 79 });
    expect(referenciaDe("", null)).toBeNull();
    expect(referenciaDe("abc", 0)).toBeNull();
    expect(referenciaDe(null, 79)).toEqual({ costo: null, precio: 79 });
  });

  it("solo lo que comparten todas las líneas", () => {
    expect(referenciaComun([{ costo: 35, precio: 79 }, { costo: 35, precio: 89 }])).toEqual({ costo: 35, precio: null });
    expect(referenciaComun([{ costo: 35, precio: 79 }, { costo: 40, precio: 89 }])).toBeNull();
    expect(referenciaComun([])).toBeNull();
  });
});
