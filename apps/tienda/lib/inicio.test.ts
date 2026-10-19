import { describe, expect, it } from "vitest";
import type { Prenda } from "./catalogo";
import { categoriasDelInicio, datosDeCabecera, heroDelInicio, hrefDelInicio, indiceDelBuscador } from "./inicio";

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

  it("«Arma el tuyo» sale solo si el probador tiene algo que probar, con la tienda elegida", () => {
    expect(datosDeCabecera(prendas, "trujillo", undefined).probador).toBeNull();
    expect(datosDeCabecera(prendas, "trujillo", undefined, true).probador).toBe("/looks/arma?sede=trujillo");
    expect(datosDeCabecera(prendas, null, undefined, true).probador).toBe("/looks/arma");
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

  it("los menús «Ropa» y «Accesorios»: solo los grupos con algo, cada categoría en el suyo, y un menú vacío no sale", () => {
    const d = datosDeCabecera(prendas, null, undefined);
    expect(d.menus.map((m) => [m.nombre, m.grupos.map((g) => [g.nombre, g.categorias.map((c) => c.clave)])])).toEqual([
      ["Ropa", [["Blusas/Tops", ["CMS"]], ["Vestidos/Conjuntos", ["VES"]], ["Pantalones/Faldas", ["FAL"]]]],
      ["Accesorios", [["Calzado", ["ZAP"]]]],
    ]);
    // El título del grupo lleva a todo el grupo; la categoría, a la suya (las dos con la tienda elegida).
    expect(d.menus[0].grupos[0].href).toBe("/catalogo?grupo=arriba");
    expect(d.menus[0].grupos[0].categorias[0]).toMatchObject({ clave: "CMS", nombre: "Camisas y Blusas", cuantas: 2, href: "/catalogo?categoria=CMS" });
    expect(datosDeCabecera(prendas, "trujillo", undefined).menus[0].grupos[0].href).toBe("/catalogo?sede=trujillo&grupo=arriba");
    // El botón del menú lleva a TODO el menú (antes «Ropa» no tenía destino y el cliente no podía ver toda la ropa junta).
    expect(d.menus.map((m) => [m.href, m.todo])).toEqual([["/catalogo?menu=ropa", "Toda la ropa"], ["/catalogo?menu=accesorios", "Todos los accesorios"]]);
    expect(datosDeCabecera(prendas, "trujillo", undefined).menus[0].href).toBe("/catalogo?sede=trujillo&menu=ropa");
    // Solo ropa: no hay menú «Accesorios»; sin nada, ningún menú.
    expect(datosDeCabecera([prenda("Blusa")], null, undefined).menus.map((m) => m.nombre)).toEqual(["Ropa"]);
    expect(datosDeCabecera([], null, undefined).menus).toEqual([]);
  });

  it("la foto de cada categoría: la que llegó hace menos ENTRE las que tienen foto; sin ninguna, la silueta de la que llegó hace menos", () => {
    const d = datosDeCabecera(prendas, null, "https://x.supabase.co");
    // Blusa Ruth llegó después, pero no tiene foto: la cara de «Camisas y Blusas» es Blusa Emma.
    expect(d.menus[0].grupos[0].categorias[0].foto).toEqual({ foto: FOTO, optimizar: true, forma: "blusa", color: "#D5BA98", nombre: "Blusa Emma" });
    // Sin fotos en la categoría, su silueta en su color.
    expect(d.menus[0].grupos[2].categorias[0].foto).toMatchObject({ foto: null, forma: "falda", nombre: "Falda Renata" });
  });

  it("la vitrina de cada menú: lo último que llegó con foto, hasta 5, lo más reciente primero; lo que no es nuevo no va", () => {
    const d = datosDeCabecera(prendas, "trujillo", "https://x.supabase.co");
    expect(d.menus[0].recien).toEqual([
      {
        id: "Blusa Emma",
        href: "/catalogo/Blusa Emma?sede=trujillo",
        nombre: "Blusa Emma",
        precio: "S/ 79.90",
        oferta: false,
        foto: { foto: FOTO, optimizar: true, forma: "blusa", color: "#D5BA98", nombre: "Blusa Emma" },
      },
    ]);
    expect(d.menus[1].recien).toEqual([]);
    const muchas = Array.from({ length: 7 }, (_, i) => prenda(`Nueva ${i}`, { nuevo: { dias: 7 - i }, fotos: [FOTO] }));
    const vitrina = datosDeCabecera([...muchas, prenda("Vieja con foto", { fotos: [FOTO] })], null, undefined).menus[0].recien;
    expect(vitrina.map((p) => p.nombre)).toEqual(["Nueva 6", "Nueva 5", "Nueva 4", "Nueva 3", "Nueva 2"]);
    // Una en oferta lo dice (el precio sale en rojo).
    const enOferta = datosDeCabecera([enCampana("Rebajada", { nuevo: { dias: 1 }, fotos: [FOTO] })], null, undefined).menus[0].recien[0];
    expect(enOferta).toMatchObject({ precio: "S/ 63.90", oferta: true });
  });

  it("el índice del buscador: lo que dice cada tarjeta (precio, oferta, foto) y nada más; no viaja con la cabecera", () => {
    const d = datosDeCabecera(prendas, null, "https://x.supabase.co");
    // La cabecera ya no lleva la lista (2026-10-17): la pide el buscador al abrirse, para la tienda que dice `sede`.
    expect("indice" in d).toBe(false);
    expect(d.sede).toBeNull();
    expect(datosDeCabecera(prendas, "lima", undefined).sede).toBe("lima");
    const indice = indiceDelBuscador(prendas, null, "https://x.supabase.co");
    expect(indice).toHaveLength(5);
    expect(indice[0]).toEqual({
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
    expect(indice[2]).toMatchObject({ nombre: "Vestido Rosa", precio: "S/ 63.90", oferta: "−20 %" });
    // Con una tienda elegida, cada resultado lleva a la ficha en esa tienda.
    expect(indiceDelBuscador(prendas, "lima", undefined)[0].href).toBe("/catalogo/Blusa Emma?sede=lima");
    // Las sugerencias del buscador vacío: las categorías, con su nombre corto.
    expect(d.sugerencias).toEqual(["Blusas", "Vestidos", "Faldas", "Zapatos"]);
  });
});
