import { describe, it, expect } from "vitest";
import { cajaAntesDespues, etiquetaColgada, leerCodigo, mensajeLectura, otrasTallas, type ProductoEtiquetable } from "./etiquetar-prendas";

// Escanear para marcar (Felipe 2026-10-21): la lectura marca la talla y color que está en la mano, nunca alterna, y lo que no entra
// se dice con su porqué.
const blusa: ProductoEtiquetable = {
  id: "p1",
  referencia: "Blusa Emma",
  descripcion: null,
  categoriaId: "c-blusas",
  categoria: "Blusas",
  variantes: [
    { id: "a", talla: "S", color: "Negro", precio: 89.9, codigos: ["", "BLU-0012-NEG-S"] },
    { id: "b", talla: "M", color: "Negro", precio: 89.9, codigos: ["", "BLU-0012-NEG-M", "7750001112223"] },
    { id: "c", talla: "L", color: "Negro", precio: 99.9, codigos: ["", "BLU-0012-NEG-L"] },
  ],
};
const anillo: ProductoEtiquetable = {
  id: "p2",
  referencia: "Anillo Luna",
  descripcion: null,
  categoriaId: "c-anillos",
  categoria: "Anillos",
  variantes: [{ id: "d", talla: null, color: "Dorado", precio: 35, codigos: ["", "ANL-0003-DOR-STD"] }],
};
const productos = [blusa, anillo];
const sin = new Set<string>();

describe("leerCodigo — lo que hace una lectura", () => {
  it("pone la etiqueta SOLO a la talla y color leída", () => {
    const r = leerCodigo("BLU-0012-NEG-M", "poner", { productos, marcadas: sin, porCategoria: sin });
    expect(r.lectura.tipo).toBe("puesta");
    expect([...r.marcadas]).toEqual(["b"]);
  });
  it("reconoce el código de fábrica, sin mayúsculas y con el apóstrofo de la pistola", () => {
    expect(leerCodigo("7750001112223", "poner", { productos, marcadas: sin, porCategoria: sin }).lectura.tipo).toBe("puesta");
    expect(leerCodigo("blu'0012'neg'l", "poner", { productos, marcadas: sin, porCategoria: sin }).marcadas.has("c")).toBe(true);
  });
  it("leer dos veces no la quita: «Ya la llevaba»", () => {
    const primera = leerCodigo("BLU-0012-NEG-M", "poner", { productos, marcadas: sin, porCategoria: sin });
    const segunda = leerCodigo("BLU-0012-NEG-M", "poner", { productos, marcadas: primera.marcadas, porCategoria: sin });
    expect(segunda.lectura.tipo).toBe("ya-la-llevaba");
    expect(segunda.marcadas.has("b")).toBe(true);
  });
  it("en modo «quitar» se la quita, y si no la llevaba no pasa nada", () => {
    const quitada = leerCodigo("BLU-0012-NEG-S", "quitar", { productos, marcadas: new Set(["a", "b"]), porCategoria: sin });
    expect(quitada.lectura.tipo).toBe("quitada");
    expect([...quitada.marcadas]).toEqual(["b"]);
    const nada = leerCodigo("BLU-0012-NEG-L", "quitar", { productos, marcadas: new Set(["a"]), porCategoria: sin });
    expect(nada.lectura.tipo).toBe("no-la-llevaba");
    expect([...nada.marcadas]).toEqual(["a"]);
  });
  it("lo que entra por su categoría no se marca a mano", () => {
    const r = leerCodigo("ANL-0003-DOR-STD", "poner", { productos, marcadas: sin, porCategoria: new Set(["c-anillos"]) });
    expect(r.lectura.tipo).toBe("por-categoria");
    expect(r.marcadas.size).toBe(0);
  });
  it("una talla que ya no se vende se dice, no se marca", () => {
    const fueraDeVenta = [{ referencia: "Blusa Emma", talla: "XL", color: "Negro", codigos: ["", "BLU-0012-NEG-XL"] }];
    const r = leerCodigo("BLU-0012-NEG-XL", "poner", { productos, marcadas: sin, porCategoria: sin, fueraDeVenta });
    expect(r.lectura.tipo).toBe("fuera-de-venta");
    expect(r.marcadas.size).toBe(0);
  });
  it("un código que no es de ninguna prenda no toca nada", () => {
    const r = leerCodigo(" 123456789 ", "poner", { productos, marcadas: new Set(["a"]), porCategoria: sin });
    expect(r.lectura).toEqual({ tipo: "desconocido", codigo: "123456789" });
    expect([...r.marcadas]).toEqual(["a"]);
  });
  it("no muta lo que recibe", () => {
    const marcadas = new Set(["a"]);
    leerCodigo("BLU-0012-NEG-M", "poner", { productos, marcadas, porCategoria: sin });
    expect([...marcadas]).toEqual(["a"]);
  });
});

describe("mensajeLectura — lo que se dice, en palabras de tienda", () => {
  it("cada resultado tiene su tono, y solo lo que no entra es ámbar", () => {
    const puesta = leerCodigo("BLU-0012-NEG-M", "poner", { productos, marcadas: sin, porCategoria: sin }).lectura;
    expect(mensajeLectura(puesta)).toMatchObject({ tono: "verde", estado: "Lleva la etiqueta", titulo: "Blusa Emma", detalle: "M · Negro" });
    expect(mensajeLectura({ tipo: "desconocido", codigo: "X1" }).tono).toBe("ambar");
    expect(mensajeLectura({ tipo: "fuera-de-venta", prenda: { referencia: "R", talla: null, color: null, codigos: [] } }).detalle).toContain("Única");
  });
});

describe("otrasTallas — «Ponérsela a sus otras N tallas»", () => {
  it("las que faltan de la prenda; ninguna si entra por categoría", () => {
    expect(otrasTallas(blusa, new Set(["b"]), sin)).toEqual(["a", "c"]);
    expect(otrasTallas(anillo, sin, new Set(["c-anillos"]))).toEqual([]);
  });
});

describe("etiquetaColgada — la etiqueta y su mosaico", () => {
  it("lo último marcado va primero; lo que se quita no cuenta pero se ve", () => {
    const e = etiquetaColgada(productos, new Set(["a"]), new Set(["b", "c"]), sin, 12);
    expect(e.piezas.map((x) => [x.id, x.estado])).toEqual([["c", "nueva"], ["b", "nueva"], ["a", "sale"]]);
    expect(e).toMatchObject({ total: 2, agregar: 2, quitar: 1, mas: 0 });
  });
  it("lo de su categoría cuenta y se dibuja con su marca", () => {
    const e = etiquetaColgada(productos, sin, sin, new Set(["c-anillos"]), 12);
    expect(e.total).toBe(1);
    expect(e.piezas[0].estado).toBe("categoria");
  });
  it("con más piezas que lugares, la última es «+N»", () => {
    const e = etiquetaColgada(productos, sin, new Set(["a", "b", "c", "d"]), sin, 3);
    expect(e.piezas).toHaveLength(2);
    expect(e.mas).toBe(2);
    expect(etiquetaColgada(productos, sin, new Set(["a", "b", "c"]), sin, 3)).toMatchObject({ mas: 0 });
  });
});

describe("cajaAntesDespues — lo que cobra la caja", () => {
  it("una de cada talla y color, con la cuenta de la caja", () => {
    expect(cajaAntesDespues(productos, ["a", "c"], 100)).toEqual({ antes: 189.8, despues: 0 });
    expect(cajaAntesDespues(productos, ["a"], 30)).toEqual({ antes: 89.9, despues: 62.9 });
  });
  it("sin descuento o sin nada que poner, nada que mostrar", () => {
    expect(cajaAntesDespues(productos, ["a"], null)).toBeNull();
    expect(cajaAntesDespues(productos, [], 30)).toBeNull();
  });
});
