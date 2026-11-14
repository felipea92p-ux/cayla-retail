import { describe, expect, it } from "vitest";
import { coloresDeLaPrenda, galeriaDePrendas } from "./recepcion-galeria-reglas";
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
