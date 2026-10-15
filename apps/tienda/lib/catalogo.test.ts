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
// Una prenda tal como la devuelve `retail.tienda_catalogo(p_sede)` (20261014225000): el precio de la tienda elegida (o el mayor, con
// «Todas»), lo que se paga con la campaña y si la campaña no toca a todas las tallas por igual.
const EMMA = {
  id: "3f0e8a8e-2f1b-4c3e-9a55-111111111111",
  codigo: "CMS-0001",
  nombre: "Blusa Emma",
  categoria: { nombre: "Camisas y Blusas", prefijo: "CMS" },
  precio: 79.9,
  precio_final: 79.9,
  desde: false,
  campana: null,
  colores: [
    { codigo: "BEI", nombre: "Beige", hex: "#D5BA98", foto: null },
    { codigo: "NEG", nombre: "Negro", hex: "#2D2C2F", foto: FOTO },
  ],
  fotos: [],
};
const TRUJILLO = "f775651f-62c8-4ff4-a414-b5614026d0cd";
const leer = (d: unknown) => interpretarCatalogo({ sede: null, prendas: [d] })?.prendas[0] as Prenda;
const emma = leer(EMMA);

describe("interpretarCatalogo", () => {
  it("lee lo que devuelve la base, en camelCase, con la tienda cuyo precio usó", () => {
    expect(emma).toMatchObject({ nombre: "Blusa Emma", precio: 79.9, precioFinal: 79.9, desde: false, campana: null });
    expect(emma.colores.map((c) => c.codigo)).toEqual(["BEI", "NEG"]);
    expect(interpretarCatalogo({ sede: null, prendas: [] })).toEqual({ sede: null, prendas: [] });
    expect(interpretarCatalogo({ sede: TRUJILLO, prendas: [EMMA] })?.sede).toBe(TRUJILLO);
    // Una tienda que llega rara se lee como «Todas» (la lista se ve igual).
    expect(interpretarCatalogo({ sede: "trujillo", prendas: [EMMA] })).toMatchObject({ sede: null, prendas: [{ nombre: "Blusa Emma" }] });
  });

  it("una prenda con un dato raro se descarta sola; las demás se ven", () => {
    const rara = [
      { ...EMMA, id: "no-es-un-uuid" },
      { ...EMMA, precio: 0 },
      { ...EMMA, precio_final: 89.9 },
      { ...EMMA, desde: "no" },
      { ...EMMA, colores: [{ codigo: "X", nombre: "X", hex: "rojo", foto: null }] },
      { ...EMMA, fotos: ["a", "b"] },
      { ...EMMA, fotos: [FOTO, FOTO, FOTO] },
      { ...EMMA, campana: { nombre: "", pct: 10 } },
    ];
    expect(interpretarCatalogo({ sede: null, prendas: [...rara, EMMA] })?.prendas.map((p) => p.nombre)).toEqual(["Blusa Emma"]);
  });

  it("si la respuesta no es un catálogo, null (la página dice que no se pudo cargar)", () => {
    for (const raro of [null, undefined, "x", 3, {}, { prendas: "x" }]) expect(interpretarCatalogo(raro)).toBeNull();
  });
});

describe("la tarjeta", () => {
  it("sin campaña: el precio de la tienda, sin tachado ni insignia", () => {
    expect(precioTarjeta(emma)).toEqual({ principal: "S/ 79.90", anterior: null, oferta: false });
    expect(insigniaOferta(emma)).toBeNull();
  });

  it("con campaña en todas sus tallas: el precio de campaña y el del modelo tachado, con su %", () => {
    const p = leer({ ...EMMA, precio_final: 63.9, campana: { nombre: "Aniversario", pct: 20 } });
    expect(precioTarjeta(p)).toEqual({ principal: "S/ 63.90", anterior: "S/ 79.90", oferta: true });
    expect(insigniaOferta(p)).toBe("−20 %");
  });

  it("con campaña en solo algunas tallas o colores: «Desde»", () => {
    const p = leer({ ...EMMA, precio_final: 69.9, desde: true, campana: { nombre: "Negro", pct: 12.5 } });
    expect(precioTarjeta(p)).toEqual({ principal: "Desde S/ 69.90", anterior: "S/ 79.90", oferta: true });
    expect(insigniaOferta(p)).toBe("−12.5 %");
  });

  it("precios distintos entre tiendas no dicen «Desde»: con «Todas» llega el mayor, sin campaña no hay tachado", () => {
    expect(precioTarjeta(leer({ ...EMMA, precio: 89.9, precio_final: 89.9 }))).toEqual({ principal: "S/ 89.90", anterior: null, oferta: false });
    // Un «desde» sin descuento no se muestra (no hay oferta que anunciar).
    expect(precioTarjeta(leer({ ...EMMA, desde: true }))).toEqual({ principal: "S/ 79.90", anterior: null, oferta: false });
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

  it("la tarjeta lleva a la ficha de la prenda, con la tienda elegida", () => {
    expect(hrefDePrenda(emma)).toBe("/catalogo/3f0e8a8e-2f1b-4c3e-9a55-111111111111");
    expect(hrefDePrenda(emma, "trujillo")).toBe("/catalogo/3f0e8a8e-2f1b-4c3e-9a55-111111111111?sede=trujillo");
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
  const prenda = (nombre: string, precio: number, prefijo: string, cat: string): Prenda => ({ ...emma, id: nombre, nombre, precio, precioFinal: precio, categoria: { nombre: cat, prefijo } });
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
    // Por precio manda lo que paga el cliente: con la campaña, la Falda pasa a ser la más barata.
    const conCampana = lista.map((p) => (p.nombre === "Falda Renata" ? { ...p, precioFinal: 59.9 } : p));
    expect(filtrarYOrdenar(conCampana, { categoria: null, orden: "precio-asc" }).map((p) => p.nombre)).toEqual(["Falda Renata", "Blusa Valentina", "Blusa Emma"]);
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

  it("la dirección de la lista no repite lo de por defecto, y lleva la tienda elegida", () => {
    expect(hrefLista({ categoria: null, orden: "destacado" })).toBe("/catalogo");
    expect(hrefLista({ sede: "trujillo", categoria: null, orden: "destacado" })).toBe("/catalogo?sede=trujillo");
    expect(hrefLista({ sede: "san-isidro", categoria: "CMS", orden: "precio-asc" })).toBe("/catalogo?sede=san-isidro&categoria=CMS&orden=precio-asc");
    expect(hrefLista({ categoria: "CMS", orden: "destacado" })).toBe("/catalogo?categoria=CMS");
    expect(hrefLista({ categoria: "CMS", orden: "precio-asc" })).toBe("/catalogo?categoria=CMS&orden=precio-asc");
    expect(hrefLista({ categoria: "Ropa & más", orden: "destacado" })).toBe("/catalogo?categoria=Ropa+%26+m%C3%A1s");
  });

  it("cuántas prendas, en singular y plural", () => {
    expect(cuantasPrendas(1)).toBe("1 prenda");
    expect(cuantasPrendas(12)).toBe("12 prendas");
  });
});
