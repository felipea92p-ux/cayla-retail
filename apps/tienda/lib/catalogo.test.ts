import { describe, expect, it } from "vitest";
import {
  categoriasDe,
  colorDeDibujo,
  cuantasPrendas,
  filtrarYOrdenar,
  formaDe,
  fotoOptimizable,
  fotosDeTarjeta,
  hrefDePrenda,
  hrefLista,
  insigniaOferta,
  interpretarCatalogo,
  leerCategoria,
  leerOrden,
  muestras,
  precioTarjeta,
  siguienteOrden,
  soles,
  type Prenda,
} from "./catalogo";

const FOTO = "https://x.supabase.co/storage/v1/object/public/retail-productos-fotos/fotos/a.jpg";
// Una prenda tal como la devuelve `retail.tienda_catalogo()` (20261014225000).
const EMMA = {
  id: "3f0e8a8e-2f1b-4c3e-9a55-111111111111",
  codigo: "CMS-0001",
  nombre: "Blusa Emma",
  categoria: { nombre: "Camisas y Blusas", prefijo: "CMS" },
  precio_web: 74.9,
  precio: 74.9,
  precio_hasta: 74.9,
  campana: null,
  colores: [
    { codigo: "BEI", nombre: "Beige", hex: "#D5BA98", foto: null },
    { codigo: "NEG", nombre: "Negro", hex: "#2D2C2F", foto: FOTO },
  ],
  fotos: [],
};
const leer = (d: unknown) => interpretarCatalogo({ prendas: [d] })?.[0] as Prenda;
const emma = leer(EMMA);

describe("interpretarCatalogo", () => {
  it("lee lo que devuelve la base, en camelCase", () => {
    expect(emma).toMatchObject({ nombre: "Blusa Emma", precioWeb: 74.9, precio: 74.9, precioHasta: 74.9, campana: null });
    expect(emma.colores.map((c) => c.codigo)).toEqual(["BEI", "NEG"]);
    expect(interpretarCatalogo({ prendas: [] })).toEqual([]);
  });

  it("una prenda con un dato raro se descarta sola; las demás se ven", () => {
    const rara = [
      { ...EMMA, id: "no-es-un-uuid" },
      { ...EMMA, precio: 0 },
      { ...EMMA, colores: [{ codigo: "X", nombre: "X", hex: "rojo", foto: null }] },
      { ...EMMA, fotos: ["a", "b"] },
      { ...EMMA, fotos: [FOTO, FOTO, FOTO] },
      { ...EMMA, campana: { nombre: "", pct: 10 } },
    ];
    expect(interpretarCatalogo({ prendas: [...rara, EMMA] })?.map((p) => p.nombre)).toEqual(["Blusa Emma"]);
  });

  it("si la respuesta no es un catálogo, null (la página dice que no se pudo cargar)", () => {
    for (const raro of [null, undefined, "x", 3, {}, { prendas: "x" }]) expect(interpretarCatalogo(raro)).toBeNull();
  });
});

describe("la tarjeta", () => {
  it("sin campaña: el precio web, sin tachado ni insignia", () => {
    expect(precioTarjeta(emma)).toEqual({ principal: "S/ 74.90", anterior: null, oferta: false });
    expect(insigniaOferta(emma)).toBeNull();
  });

  it("con campaña en todas sus tallas: el precio de campaña y el web tachado, con su %", () => {
    const p = leer({ ...EMMA, precio: 65.9, precio_hasta: 65.9, campana: { nombre: "Aniversario", pct: 12 } });
    expect(precioTarjeta(p)).toEqual({ principal: "S/ 65.90", anterior: "S/ 74.90", oferta: true });
    expect(insigniaOferta(p)).toBe("−12 %");
  });

  it("con campaña en solo algunas tallas o colores: «Desde»", () => {
    const p = leer({ ...EMMA, precio: 65.9, precio_hasta: 74.9, campana: { nombre: "Negro", pct: 12.5 } });
    expect(precioTarjeta(p)).toEqual({ principal: "Desde S/ 65.90", anterior: "S/ 74.90", oferta: true });
    expect(insigniaOferta(p)).toBe("−12.5 %");
  });

  it("los soles como la caja, con miles", () => {
    expect(soles(1250)).toBe("S/ 1,250.00");
    expect(soles(9.9)).toBe("S/ 9.90");
  });

  it("hasta cinco muestras y cuántas más", () => {
    const colores = Array.from({ length: 7 }, (_, i) => ({ codigo: `C${i}`, nombre: `Color ${i}`, hex: "#111111", foto: null }));
    const p = leer({ ...EMMA, colores });
    expect(muestras(p).visibles).toHaveLength(5);
    expect(muestras(p).mas).toBe(2);
    expect(muestras(emma)).toEqual({ visibles: emma.colores, mas: 0 });
  });

  it("las fotos: las del modelo; sin ellas, la de su primer color con foto", () => {
    expect(fotosDeTarjeta(leer({ ...EMMA, fotos: [FOTO, `${FOTO}?2`] }))).toEqual([FOTO, `${FOTO}?2`]);
    expect(fotosDeTarjeta(emma)).toEqual([FOTO, null]);
    expect(fotosDeTarjeta(leer({ ...EMMA, colores: [] }))).toEqual([null, null]);
  });

  it("sin foto se dibuja con la silueta de su categoría y su color; lo que no es ropa, la percha", () => {
    expect(formaDe("CMS")).toBe("blusa");
    expect(formaDe("VES")).toBe("vestido");
    expect(formaDe("CAR")).toBe("bolso");
    expect(formaDe("ZAP")).toBe("percha");
    expect(formaDe(null)).toBe("percha");
    expect(colorDeDibujo(emma)).toBe("#D5BA98");
    expect(colorDeDibujo(leer({ ...EMMA, colores: [] }))).toBeNull();
  });

  it("la tarjeta lleva a la ficha de la prenda", () => {
    expect(hrefDePrenda(emma)).toBe("/catalogo/3f0e8a8e-2f1b-4c3e-9a55-111111111111");
  });

  it("solo se optimizan las fotos del almacén público de prendas del origen permitido", () => {
    expect(fotoOptimizable(FOTO, "https://x.supabase.co")).toBe(true);
    expect(fotoOptimizable(FOTO, "https://otro.supabase.co")).toBe(false);
    expect(fotoOptimizable("https://x.supabase.co/storage/v1/object/public/retail-colores-muestras/a.jpg", "https://x.supabase.co")).toBe(false);
    expect(fotoOptimizable(FOTO, undefined)).toBe(false);
    expect(fotoOptimizable("no es url", "https://x.supabase.co")).toBe(false);
  });
});

describe("la lista: categorías y orden", () => {
  const prenda = (nombre: string, precio: number, prefijo: string, cat: string): Prenda => ({ ...emma, id: nombre, nombre, precio, precioHasta: precio, categoria: { nombre: cat, prefijo } });
  const lista = [prenda("Falda Renata", 74.9, "FAL", "Faldas"), prenda("Blusa Emma", 79.9, "CMS", "Camisas y Blusas"), prenda("Blusa Valentina", 69.9, "CMS", "Camisas y Blusas")];

  it("las categorías con lo publicado, de la que más tiene a la que menos", () => {
    expect(categoriasDe(lista)).toEqual([
      { clave: "CMS", nombre: "Camisas y Blusas", cuantas: 2 },
      { clave: "FAL", nombre: "Faldas", cuantas: 1 },
    ]);
  });

  it("filtra por categoría y ordena por precio; destacado es el orden de la base", () => {
    expect(filtrarYOrdenar(lista, { categoria: null, orden: "destacado" }).map((p) => p.nombre)).toEqual(["Falda Renata", "Blusa Emma", "Blusa Valentina"]);
    expect(filtrarYOrdenar(lista, { categoria: "CMS", orden: "destacado" }).map((p) => p.nombre)).toEqual(["Blusa Emma", "Blusa Valentina"]);
    expect(filtrarYOrdenar(lista, { categoria: null, orden: "precio-asc" }).map((p) => p.precio)).toEqual([69.9, 74.9, 79.9]);
    expect(filtrarYOrdenar(lista, { categoria: null, orden: "precio-desc" }).map((p) => p.precio)).toEqual([79.9, 74.9, 69.9]);
    expect(filtrarYOrdenar(lista, { categoria: "XYZ", orden: "destacado" })).toEqual([]);
    // No toca la lista de entrada.
    expect(lista.map((p) => p.nombre)).toEqual(["Falda Renata", "Blusa Emma", "Blusa Valentina"]);
  });

  it("lee el orden y la categoría de la URL; lo raro vuelve a lo de siempre", () => {
    expect(leerOrden("precio-asc")).toBe("precio-asc");
    expect(leerOrden(["precio-desc", "x"])).toBe("precio-desc");
    expect(leerOrden("barato")).toBe("destacado");
    expect(leerOrden(undefined)).toBe("destacado");
    expect(leerCategoria(" CMS ")).toBe("CMS");
    expect(leerCategoria("")).toBeNull();
    expect(leerCategoria(undefined)).toBeNull();
  });

  it("el botón de orden da la vuelta: destacado → menor precio → mayor precio", () => {
    expect(siguienteOrden("destacado")).toBe("precio-asc");
    expect(siguienteOrden("precio-asc")).toBe("precio-desc");
    expect(siguienteOrden("precio-desc")).toBe("destacado");
  });

  it("la dirección de la lista no repite lo de por defecto", () => {
    expect(hrefLista({ categoria: null, orden: "destacado" })).toBe("/catalogo");
    expect(hrefLista({ categoria: "CMS", orden: "destacado" })).toBe("/catalogo?categoria=CMS");
    expect(hrefLista({ categoria: "CMS", orden: "precio-asc" })).toBe("/catalogo?categoria=CMS&orden=precio-asc");
    expect(hrefLista({ categoria: "Ropa & más", orden: "destacado" })).toBe("/catalogo?categoria=Ropa+%26+m%C3%A1s");
  });

  it("cuántas prendas, en singular y plural", () => {
    expect(cuantasPrendas(1)).toBe("1 prenda");
    expect(cuantasPrendas(12)).toBe("12 prendas");
  });
});
