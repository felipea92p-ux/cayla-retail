import { describe, expect, it } from "vitest";
import type { Prenda } from "./catalogo";
import { categoriasDelInicio, datosDeCabecera, heroDelInicio, hrefDelInicio } from "./inicio";

const FOTO = "https://x.supabase.co/storage/v1/object/public/retail-productos-fotos/fotos/a.jpg";
const ANIV = "8a6f1c1e-3b55-4c8e-9a55-222222222222";
const CAT = {
  CMS: { nombre: "Camisas y Blusas", prefijo: "CMS" },
  VES: { nombre: "Vestidos", prefijo: "VES" },
  FAL: { nombre: "Faldas", prefijo: "FAL" },
  CAR: { nombre: "Carteras", prefijo: "CAR" },
  ZAP: { nombre: "Zapatos", prefijo: "ZAP" },
};

const prenda = (nombre: string, extra: Partial<Prenda> = {}): Prenda => ({
  id: nombre,
  codigo: null,
  nombre,
  categoria: CAT.CMS,
  precio: 79.9,
  precioFinal: 79.9,
  desde: false,
  campana: null,
  colores: [{ codigo: "NEG", nombre: "Negro", hex: "#2D2C2F", foto: null }],
  fotos: [],
  stock: null,
  nuevo: null,
  vendidos: null,
  ...extra,
});
const enCampana = (nombre: string, extra: Partial<Prenda> = {}) =>
  prenda(nombre, { precioFinal: 63.9, campana: { id: ANIV, nombre: "Aniversario CAYLA", pct: 20, hasta: "2026-10-21" }, ...extra });
const nombres = (ps: Prenda[]) => ps.map((p) => p.nombre);

describe("el héroe del Inicio", () => {
  const campana = { nombre: "Aniversario CAYLA", pct: 20, hasta: "2026-10-21" };

  it("con campaña: hasta tres prendas suyas que bajan de precio, las que tienen foto primero", () => {
    const prendas = [
      enCampana("Sin foto 1"),
      enCampana("Con foto", { fotos: [FOTO] }),
      prenda("Otra campaña", { precioFinal: 59.9, campana: { id: null, nombre: "Liquidación", pct: 25, hasta: null } }),
      enCampana("Sin foto 2"),
      enCampana("Sin foto 3"),
      // De la campaña, pero sin descuento en esta tienda: no va.
      prenda("Sin descuento", { campana: { id: ANIV, nombre: "Aniversario CAYLA", pct: 20, hasta: "2026-10-21" } }),
    ];
    const hero = heroDelInicio(campana, prendas);
    expect(hero.tipo).toBe("campana");
    if (hero.tipo !== "campana") return;
    expect(nombres(hero.piezas)).toEqual(["Con foto", "Sin foto 1", "Sin foto 2"]);
    expect(hero.campanaId).toBe(ANIV);
  });

  it("con campaña pero nada suyo en lo que se ve: no se anuncia (Felipe 2026-10-15); sale Lo nuevo y, sin nada nuevo, la marca", () => {
    const hero = heroDelInicio(campana, [prenda("Blusa"), prenda("Nueva", { nuevo: { dias: 3 }, fotos: [FOTO] })]);
    expect(hero.tipo === "nuevo" && nombres(hero.piezas)).toEqual(["Nueva"]);
    expect(heroDelInicio(campana, [prenda("Blusa")])).toEqual({ tipo: "marca" });
    // De la campaña pero sin descuento en esta tienda tampoco cuenta: no es «suya» aquí.
    const sinDescuento = prenda("Sin descuento", { campana: { id: ANIV, nombre: "Aniversario CAYLA", pct: 20, hasta: "2026-10-21" } });
    expect(heroDelInicio(campana, [sinDescuento]).tipo).toBe("marca");
  });

  it("el nombre de la campaña se compara sin tildes ni mayúsculas", () => {
    const hero = heroDelInicio({ ...campana, nombre: "ANIVERSARIO cayla" }, [enCampana("Blusa")]);
    expect(hero.tipo === "campana" && nombres(hero.piezas)).toEqual(["Blusa"]);
  });

  it("sin campaña: lo nuevo (con foto primero, luego lo que llegó hace menos); sin nada nuevo, la frase de la marca", () => {
    const prendas = [
      prenda("Hace 9", { nuevo: { dias: 9 } }),
      prenda("Hace 1", { nuevo: { dias: 1 } }),
      prenda("Vieja"),
      prenda("Hace 5 con foto", { nuevo: { dias: 5 }, fotos: [FOTO] }),
      prenda("Fijada", { nuevo: { dias: null } }),
    ];
    const hero = heroDelInicio(null, prendas);
    expect(hero.tipo === "nuevo" && nombres(hero.piezas)).toEqual(["Hace 5 con foto", "Hace 1", "Hace 9"]);
    expect(heroDelInicio(null, [prenda("Vieja")])).toEqual({ tipo: "marca" });
    expect(heroDelInicio(null, [])).toEqual({ tipo: "marca" });
  });
});

describe("las categorías del Inicio", () => {
  it("en el orden de la maqueta (por prefijo), con su nombre corto, cuántas tiene y si tiene algo nuevo", () => {
    const prendas = [
      prenda("Zapato", { categoria: CAT.ZAP }),
      prenda("Falda", { categoria: CAT.FAL }),
      prenda("Blusa vieja"),
      prenda("Blusa nueva", { nuevo: { dias: 3 } }),
      prenda("Vestido", { categoria: CAT.VES }),
      prenda("Cartera", { categoria: CAT.CAR }),
      prenda("Sin categoría", { categoria: null }),
    ];
    const cats = categoriasDelInicio(prendas);
    expect(cats.map((c) => [c.clave, c.corto, c.cuantas, c.nueva])).toEqual([
      ["CMS", "Blusas", 2, true],
      ["VES", "Vestidos", 1, false],
      ["FAL", "Faldas", 1, false],
      ["CAR", "Bolsos", 1, false],
      // Una categoría que la maqueta no ordena va después, con su nombre.
      ["ZAP", "Zapatos", 1, false],
    ]);
    // El círculo muestra una prenda de Lo nuevo si la categoría tiene una.
    expect(cats[0].prenda.nombre).toBe("Blusa nueva");
    expect(categoriasDelInicio([])).toEqual([]);
  });
});

describe("la cabecera con cuenta", () => {
  const prendas = [
    prenda("Blusa Emma", { nuevo: { dias: 6 }, vendidos: 2, colores: [{ codigo: "BEI", nombre: "Beige", hex: "#D5BA98", foto: FOTO }] }),
    prenda("Blusa Ruth", { nuevo: { dias: 1 } }),
    enCampana("Vestido Rosa", { categoria: CAT.VES, vendidos: 1 }),
    prenda("Falda Renata", { categoria: CAT.FAL }),
    prenda("Zapato", { categoria: CAT.ZAP }),
  ];

  it("los enlaces de las listas llevan la tienda elegida, con cuántas hay en cada una", () => {
    const d = datosDeCabecera(prendas, "trujillo", "https://x.supabase.co");
    expect(d.inicio).toBe("/inicio?sede=trujillo");
    expect(d.nuevo).toEqual({ href: "/catalogo?lista=nuevo&sede=trujillo", cuantas: 2 });
    expect(d.vendidos).toEqual({ href: "/catalogo?lista=vendidos&sede=trujillo", cuantas: 2 });
    expect(d.ofertas).toEqual({ href: "/catalogo?lista=ofertas&sede=trujillo", cuantas: 1 });
    const todas = datosDeCabecera(prendas, null, undefined);
    expect(todas.inicio).toBe("/inicio");
    expect(todas.nuevo.href).toBe("/catalogo?lista=nuevo");
  });

  it("«Arma tu look» lleva la tienda elegida; los favoritos, no (son de la persona, no de una tienda)", () => {
    const d = datosDeCabecera(prendas, "trujillo", undefined);
    expect(d.looks).toBe("/looks?sede=trujillo");
    expect(d.favoritos).toBe("/catalogo?lista=favoritos");
    const todas = datosDeCabecera([], null, undefined);
    expect(todas.looks).toBe("/looks");
    expect(todas.favoritos).toBe("/catalogo?lista=favoritos");
    expect(hrefDelInicio("san-isidro")).toBe("/inicio?sede=san-isidro");
    expect(hrefDelInicio(null)).toBe("/inicio");
  });

  it("el menú «Ropa»: solo las columnas con algo, y una categoría que nadie ordenó cae en la tercera", () => {
    const d = datosDeCabecera(prendas, null, undefined);
    expect(d.columnas.map((c) => [c.titulo, c.categorias.map((x) => x.clave)])).toEqual([
      ["Arriba", ["CMS"]],
      ["Completo y abajo", ["VES", "FAL"]],
      ["Encima y más", ["ZAP"]],
    ]);
    expect(d.columnas[0].categorias[0]).toEqual({ clave: "CMS", nombre: "Camisas y Blusas", cuantas: 2, href: "/catalogo?categoria=CMS" });
    expect(datosDeCabecera([prenda("Blusa")], null, undefined).columnas.map((c) => c.titulo)).toEqual(["Arriba"]);
    expect(d.categorias.map((c) => c.href)).toEqual(["/catalogo?categoria=CMS", "/catalogo?categoria=VES", "/catalogo?categoria=FAL", "/catalogo?categoria=ZAP"]);
  });

  it("la tarjeta de Lo nuevo del menú es la que llegó hace menos; sin nada nuevo, ninguna", () => {
    const d = datosDeCabecera(prendas, "trujillo", "https://x.supabase.co");
    expect(d.destacada).toMatchObject({ nombre: "Blusa Ruth", href: "/catalogo/Blusa Ruth?sede=trujillo", foto: null, forma: "blusa" });
    expect(datosDeCabecera([prenda("Vieja")], null, undefined).destacada).toBeNull();
  });

  it("el índice del buscador: lo que dice cada tarjeta (precio, oferta, foto) y nada más", () => {
    const d = datosDeCabecera(prendas, null, "https://x.supabase.co");
    expect(d.indice).toHaveLength(5);
    expect(d.indice[0]).toEqual({
      id: "Blusa Emma",
      nombre: "Blusa Emma",
      categoria: "Camisas y Blusas",
      colores: ["Beige"],
      precio: "S/ 79.90",
      oferta: null,
      href: "/catalogo/Blusa Emma",
      foto: FOTO,
      optimizar: true,
      forma: "blusa",
      color: "#D5BA98",
    });
    expect(d.indice[2]).toMatchObject({ nombre: "Vestido Rosa", precio: "S/ 63.90", oferta: "−20 %" });
    // Las sugerencias del buscador vacío: las categorías, con su nombre corto.
    expect(d.sugerencias).toEqual(["Blusas", "Vestidos", "Faldas", "Zapatos"]);
  });
});
