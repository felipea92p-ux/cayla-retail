import { describe, expect, it } from "vitest";
import {
  cabeceraDeLista,
  campanasDe,
  categoriasDe,
  colorDeDibujo,
  conteoDeLista,
  deFavoritos,
  filtrarYOrdenar,
  formaDe,
  fotoOptimizable,
  fotosDeTarjeta,
  hrefDePrenda,
  hrefLista,
  insigniaOferta,
  interpretarCatalogo,
  leerCampana,
  leerCategoria,
  leerLista,
  leerOrden,
  muestras,
  nombreOrden,
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

  it("lee el nivel de cada tienda (actividad 4); uno raro —o una cifra de 4 o más— deja la prenda sin dato de stock, pero visible", () => {
    const conStock = leer({ ...EMMA, stock: { total: "hay", sedes: { [TRUJILLO]: 2 } } });
    expect(conStock.stock).toEqual({ total: "hay", sedes: { [TRUJILLO]: 2 } });
    expect(emma.stock).toBeNull();
    for (const raro of [{ total: 7, sedes: {} }, { total: "hay", sedes: { [TRUJILLO]: 4 } }, { total: "Hay", sedes: {} }, "hay"]) {
      const p = leer({ ...EMMA, stock: raro });
      expect(p.nombre).toBe("Blusa Emma");
      expect(p.stock).toBeNull();
    }
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

  it("lee «Lo nuevo» (sus días) y «Más vendidos» (su puesto) (actividad 5); uno raro deja la prenda visible y sin ese dato", () => {
    const p = leer({ ...EMMA, nuevo: { dias: 4 }, vendidos: 2 });
    expect(p.nuevo).toEqual({ dias: 4 });
    expect(p.vendidos).toBe(2);
    expect(leer({ ...EMMA, nuevo: { dias: null } }).nuevo).toEqual({ dias: null });
    expect(emma.nuevo).toBeNull();
    expect(emma.vendidos).toBeNull();
    // Más de 30 días no es «nuevo»; un puesto fuera de 1 a 20, o una cifra en vez del puesto, no se cree.
    for (const raro of [{ ...EMMA, nuevo: { dias: 31 } }, { ...EMMA, nuevo: { dias: -1 } }, { ...EMMA, nuevo: true }]) {
      expect(leer(raro)).toMatchObject({ nombre: "Blusa Emma", nuevo: null });
    }
    for (const raro of [0, 21, 2.5, "3", 7193]) expect(leer({ ...EMMA, vendidos: raro })).toMatchObject({ nombre: "Blusa Emma", vendidos: null });
  });

  it("la campaña trae su id y su último día; sin ellos (o raros) se lee igual, con null", () => {
    const ID = "8a6f1c1e-3b55-4c8e-9a55-222222222222";
    expect(leer({ ...EMMA, precio_final: 63.9, campana: { id: ID, nombre: "Aniversario", pct: 20, hasta: "2026-10-21" } }).campana).toEqual({
      id: ID,
      nombre: "Aniversario",
      pct: 20,
      hasta: "2026-10-21",
    });
    expect(leer({ ...EMMA, precio_final: 63.9, campana: { id: "x", nombre: "Aniversario", pct: 20, hasta: "21/10" } }).campana).toEqual({
      id: null,
      nombre: "Aniversario",
      pct: 20,
      hasta: null,
    });
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
    // La foto del fondo de una campaña (ADR-0436, actividad 8): solo de su almacén, y una de prenda no pasa por él.
    const FONDO = "https://x.supabase.co/storage/v1/object/public/retail-campanas-fotos/fondos/0f0f0f0f-1111-4222-8333-444455556666.jpg";
    expect(fotoOptimizable(FONDO, "https://x.supabase.co", "retail-campanas-fotos")).toBe(true);
    expect(fotoOptimizable(FONDO, "https://x.supabase.co")).toBe(false);
    expect(fotoOptimizable(FOTO, "https://x.supabase.co", "retail-campanas-fotos")).toBe(false);
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
    // Un grupo de categorías (lib/grupos.ts); con una categoría elegida no va: ella ya dice el grupo.
    expect(hrefLista({ sede: "trujillo", categoria: null, orden: "destacado", grupo: "arriba" })).toBe("/catalogo?sede=trujillo&grupo=arriba");
    expect(hrefLista({ categoria: "CMS", orden: "destacado", grupo: "arriba" })).toBe("/catalogo?categoria=CMS");
    expect(hrefLista({ categoria: "CMS", orden: "precio-asc" })).toBe("/catalogo?categoria=CMS&orden=precio-asc");
    // Un menú de la cabecera («Ropa»): toda la ropa junta; se queda al elegir un grupo o una categoría de adentro.
    expect(hrefLista({ categoria: null, orden: "destacado", menu: "ropa" })).toBe("/catalogo?menu=ropa");
    expect(hrefLista({ sede: "trujillo", categoria: null, orden: "destacado", menu: "ropa" })).toBe("/catalogo?sede=trujillo&menu=ropa");
    expect(hrefLista({ categoria: null, orden: "destacado", grupo: "arriba", menu: "ropa" })).toBe("/catalogo?menu=ropa&grupo=arriba");
    expect(hrefLista({ categoria: "CMS", orden: "precio-asc", menu: "ropa" })).toBe("/catalogo?menu=ropa&categoria=CMS&orden=precio-asc");
    expect(hrefLista({ categoria: "Ropa & más", orden: "destacado" })).toBe("/catalogo?categoria=Ropa+%26+m%C3%A1s");
  });

  it("cuántas hay: en singular y plural, con la categoría, la tienda elegida y lo que hay en las otras", () => {
    const sin = { categoria: null, tienda: null, enOtras: 0 };
    expect(conteoDeLista(1, sin)).toBe("1 prenda");
    expect(conteoDeLista(12, sin)).toBe("12 prendas");
    expect(conteoDeLista(12, { ...sin, categoria: "Faldas" })).toBe("12 prendas en Faldas");
    expect(conteoDeLista(5, { ...sin, tienda: "Trujillo", enOtras: 3 })).toBe("5 prendas en Trujillo · 3 más en otras tiendas");
    expect(conteoDeLista(2, { categoria: "Faldas", tienda: "Trujillo", enOtras: 0 })).toBe("2 prendas de Faldas en Trujillo");
    // Sin tienda elegida no hay «otras tiendas».
    expect(conteoDeLista(4, { ...sin, enOtras: 3 })).toBe("4 prendas");
  });
});

describe("las listas: Lo nuevo, las ofertas y Más vendidos (actividad 5)", () => {
  const ANIV = "8a6f1c1e-3b55-4c8e-9a55-222222222222";
  const LIQ = "8a6f1c1e-3b55-4c8e-9a55-333333333333";
  const prenda = (nombre: string, extra: Partial<Prenda> = {}): Prenda => ({ ...emma, id: nombre, nombre, ...extra });
  const oferta = (id: string | null, nombre: string, pct: number, hasta: string | null) => ({
    precioFinal: 59.9,
    campana: { id, nombre, pct, hasta },
  });
  const lista = [
    prenda("Blusa A", { nuevo: { dias: 12 }, vendidos: 3 }),
    prenda("Blusa B", { nuevo: { dias: null } }),
    prenda("Blusa C", { nuevo: { dias: 2 }, vendidos: 1, ...oferta(ANIV, "Aniversario", 20, "2026-10-21") }),
    prenda("Blusa D", { vendidos: 2, ...oferta(LIQ, "Liquidación", 30, "2026-10-31") }),
    prenda("Blusa E", { ...oferta(ANIV, "Aniversario", 20, "2026-10-21") }),
    // Una campaña que no baja nada no es oferta.
    prenda("Blusa F", { campana: { id: LIQ, nombre: "Liquidación", pct: 30, hasta: "2026-10-31" } }),
  ];
  const nombres = (ps: Prenda[]) => ps.map((p) => p.nombre);

  it("lee la lista y la campaña de la URL; lo raro vuelve a toda la tienda y a todas las campañas", () => {
    expect(leerLista("nuevo")).toBe("nuevo");
    expect(leerLista(["vendidos", "x"])).toBe("vendidos");
    expect(leerLista("ofertas")).toBe("ofertas");
    expect(leerLista("todo")).toBe("todo");
    expect(leerLista("rebajas")).toBe("todo");
    expect(leerLista(undefined)).toBe("todo");
    expect(leerCampana(ANIV.toUpperCase())).toBe(ANIV);
    expect(leerCampana(" no-es-un-id ")).toBeNull();
    expect(leerCampana(undefined)).toBeNull();
  });

  it("cada lista deja lo suyo, con su orden propio: Lo nuevo por llegada (lo fijado al final), Más vendidos por puesto", () => {
    expect(nombres(filtrarYOrdenar(lista, { categoria: null, orden: "destacado", lista: "nuevo" }))).toEqual(["Blusa C", "Blusa A", "Blusa B"]);
    expect(nombres(filtrarYOrdenar(lista, { categoria: null, orden: "destacado", lista: "vendidos" }))).toEqual(["Blusa C", "Blusa D", "Blusa A"]);
    expect(nombres(filtrarYOrdenar(lista, { categoria: null, orden: "destacado", lista: "ofertas" }))).toEqual(["Blusa C", "Blusa D", "Blusa E"]);
    expect(nombres(filtrarYOrdenar(lista, { categoria: null, orden: "destacado", lista: "ofertas", campana: ANIV }))).toEqual(["Blusa C", "Blusa E"]);
    // La campaña elegida solo filtra las ofertas.
    expect(nombres(filtrarYOrdenar(lista, { categoria: null, orden: "destacado", lista: "nuevo", campana: ANIV }))).toHaveLength(3);
    expect(filtrarYOrdenar(lista, { categoria: null, orden: "destacado" })).toHaveLength(6);
    // Por precio, el precio manda también dentro de una lista.
    expect(nombres(filtrarYOrdenar(lista, { categoria: null, orden: "precio-asc", lista: "vendidos" }))).toEqual(["Blusa C", "Blusa D", "Blusa A"]);
    expect(nombres(filtrarYOrdenar(lista, { categoria: null, orden: "precio-desc", lista: "vendidos" }))).toEqual(["Blusa A", "Blusa C", "Blusa D"]);
  });

  it("las campañas con algo en oferta, cuántas tiene cada una, la que termina primero adelante", () => {
    expect(campanasDe(lista)).toEqual([
      { id: ANIV, nombre: "Aniversario", pct: 20, hasta: "2026-10-21", cuantas: 2 },
      { id: LIQ, nombre: "Liquidación", pct: 30, hasta: "2026-10-31", cuantas: 1 },
    ]);
    // Sin fecha de término, al final; con la misma fecha, el mayor descuento primero; sin id no se puede elegir.
    const otras = [
      prenda("X", oferta("8a6f1c1e-3b55-4c8e-9a55-444444444444", "Sin fin", 10, null)),
      prenda("Y", oferta("8a6f1c1e-3b55-4c8e-9a55-555555555555", "Chica", 10, "2026-10-21")),
      prenda("Z", oferta(null, "Sin id", 50, "2026-10-01")),
    ];
    expect(campanasDe([...lista, ...otras]).map((c) => c.nombre)).toEqual(["Aniversario", "Chica", "Liquidación", "Sin fin"]);
    expect(campanasDe([])).toEqual([]);
  });

  it("cada lista dice su nombre: la ceja, el título y la frase; el orden «destacado» se llama como el de su lista", () => {
    expect(cabeceraDeLista("nuevo").titulo).toEqual(["Lo", "nuevo"]);
    expect(cabeceraDeLista("ofertas").titulo).toEqual(["Las", "ofertas"]);
    expect(cabeceraDeLista("vendidos")).toMatchObject({ titulo: ["Más", "vendidos"], ceja: "Lo que más se llevan" });
    expect(cabeceraDeLista("todo")).toEqual({ ceja: "Catálogo", titulo: ["Toda la", "tienda"], frase: null, vacio: null });
    // Vacía, cada lista dice qué aparecería ahí (no «no hay prendas» a secas).
    expect(cabeceraDeLista("ofertas").vacio?.titulo).toBe("Por ahora no hay ofertas");
    expect(cabeceraDeLista("nuevo").vacio?.titulo).toBe("Por ahora no hay nada nuevo");
    expect(cabeceraDeLista("vendidos").vacio?.titulo).toBe("Todavía no hay más vendidos");
    expect(nombreOrden("destacado")).toBe("Destacado");
    expect(nombreOrden("destacado", "nuevo")).toBe("Más reciente");
    expect(nombreOrden("destacado", "vendidos")).toBe("Ranking");
    expect(nombreOrden("precio-asc", "vendidos")).toBe("Menor precio");
    expect(nombreOrden("precio-desc", "nuevo")).toBe("Mayor precio");
  });

  it("la dirección lleva la lista y, solo en las ofertas, la campaña", () => {
    expect(hrefLista({ lista: "nuevo", categoria: null, orden: "destacado" })).toBe("/catalogo?lista=nuevo");
    expect(hrefLista({ lista: "vendidos", sede: "trujillo", categoria: "CMS", orden: "precio-asc" })).toBe(
      "/catalogo?lista=vendidos&sede=trujillo&categoria=CMS&orden=precio-asc",
    );
    expect(hrefLista({ lista: "ofertas", campana: ANIV, categoria: null, orden: "destacado" })).toBe(`/catalogo?lista=ofertas&campana=${ANIV}`);
    expect(hrefLista({ lista: "nuevo", campana: ANIV, categoria: null, orden: "destacado" })).toBe("/catalogo?lista=nuevo");
    expect(hrefLista({ lista: "todo", campana: ANIV, categoria: null, orden: "destacado" })).toBe("/catalogo");
  });

  it("«Tus favoritos»: su dirección exacta (la del corazón de la cabecera), su ceja, título, bajada y vacío", () => {
    expect(leerLista("favoritos")).toBe("favoritos");
    expect(hrefLista({ lista: "favoritos", categoria: null, orden: "destacado" })).toBe("/catalogo?lista=favoritos");
    expect(cabeceraDeLista("favoritos")).toEqual({
      ceja: "Guardado por ti",
      titulo: ["Tus", "favoritos"],
      frase: "Lo que marcaste con el corazón.",
      vacio: { titulo: "Aún no guardas nada", texto: "Toca el corazón de una prenda para guardarla." },
    });
    expect(nombreOrden("destacado", "favoritos")).toBe("Destacado");
  });

  it("«Destacado» abre con lo que tiene foto; dentro de cada parte, el orden propio de la lista (2026-10-16)", () => {
    const silueta = { colores: [{ codigo: "BEI", nombre: "Beige", hex: "#D5BA98", foto: null }], fotos: [] };
    const conFoto = { fotos: [FOTO] };
    const todas = [
      prenda("Aretes", { ...silueta, nuevo: { dias: 1 }, vendidos: 1 }),
      prenda("Blusa", { ...conFoto, nuevo: { dias: 9 }, vendidos: 3, ...oferta(ANIV, "Aniversario", 20, "2026-10-21") }),
      prenda("Collar", { ...silueta, nuevo: { dias: 4 }, ...oferta(ANIV, "Aniversario", 20, "2026-10-21") }),
      prenda("Falda", { ...conFoto, nuevo: { dias: 2 }, vendidos: 2 }),
      // Sin fotos del modelo, pero con la de un color: su tarjeta se ve con foto.
      prenda("Vestido", { nuevo: { dias: 6 } }),
    ];
    const ver = (l: Parameters<typeof filtrarYOrdenar>[1]) => nombres(filtrarYOrdenar(todas, l));
    // Toda la tienda: con foto primero, en el orden de la base; después las siluetas, en el mismo orden.
    expect(ver({ categoria: null, orden: "destacado" })).toEqual(["Blusa", "Falda", "Vestido", "Aretes", "Collar"]);
    // Lo nuevo: con foto primero y, en cada parte, lo más reciente primero.
    expect(ver({ categoria: null, orden: "destacado", lista: "nuevo" })).toEqual(["Falda", "Vestido", "Blusa", "Aretes", "Collar"]);
    expect(ver({ categoria: null, orden: "destacado", lista: "ofertas" })).toEqual(["Blusa", "Collar"]);
    // Más vendidos se queda en su puesto (la tarjeta dice «N.º 1»), aunque el primero no tenga foto.
    expect(ver({ categoria: null, orden: "destacado", lista: "vendidos" })).toEqual(["Aretes", "Falda", "Blusa"]);
    // Tus favoritos, en lo que guardaste (lo último primero).
    expect(nombres(filtrarYOrdenar(deFavoritos(todas, ["Collar", "Blusa"]), { categoria: null, orden: "destacado", lista: "favoritos" }))).toEqual([
      "Collar",
      "Blusa",
    ]);
    // Por precio manda el precio: la persona pidió ese orden.
    const precios = todas.map((p, i) => ({ ...p, precioFinal: [10, 50, 20, 40, 30][i] }));
    expect(nombres(filtrarYOrdenar(precios, { categoria: null, orden: "precio-asc" }))).toEqual(["Aretes", "Collar", "Vestido", "Falda", "Blusa"]);
    // No toca la lista de entrada.
    expect(nombres(todas)).toEqual(["Aretes", "Blusa", "Collar", "Falda", "Vestido"]);
  });

  it("los favoritos: lo guardado en su orden (lo último primero), sin lo que ya no está en la tienda online, y todos van en su lista", () => {
    const [a, b, c] = lista;
    expect(nombres(deFavoritos(lista, [c.id, "ya-no-se-ve", a.id]))).toEqual(["Blusa C", "Blusa A"]);
    expect(deFavoritos(lista, new Set<string>())).toEqual([]);
    expect(deFavoritos([], [a.id, b.id])).toEqual([]);
    // Ya vienen elegidos: la lista no deja a nadie fuera, y por precio se ordenan igual que las demás.
    expect(nombres(filtrarYOrdenar(deFavoritos(lista, [b.id, c.id, a.id]), { categoria: null, orden: "destacado", lista: "favoritos" }))).toEqual([
      "Blusa B",
      "Blusa C",
      "Blusa A",
    ]);
    expect(nombres(filtrarYOrdenar(deFavoritos(lista, [b.id, c.id]), { categoria: null, orden: "precio-asc", lista: "favoritos" }))).toEqual([
      "Blusa C",
      "Blusa B",
    ]);
  });
});

describe("la lista de una campaña sin descuento (ADR-0436, actividad 6a)", () => {
  it("sus prendas son sus modelos, aunque no bajen de precio; su dirección lleva la campaña", async () => {
    const { cabeceraDeLista, enLaLista, hrefLista } = await import("./catalogo");
    const modelos = new Set(["a"]);
    const p = (id: string) => ({ id, nuevo: null, vendidos: null, precio: 50, precioFinal: 50, campana: null }) as unknown as Parameters<typeof enLaLista>[0];
    expect(enLaLista(p("a"), "campana", "x", modelos)).toBe(true);
    expect(enLaLista(p("b"), "campana", "x", modelos)).toBe(false);
    expect(enLaLista(p("a"), "campana", "x", null)).toBe(false);
    expect(hrefLista({ categoria: null, orden: "destacado", lista: "campana", campana: "x" })).toBe("/catalogo?lista=campana&campana=x");
    expect(cabeceraDeLista("campana", { nombre: "Navidad" })).toMatchObject({ ceja: "Campaña", titulo: ["Navidad", ""], frase: "Las prendas que elegimos para Navidad." });
  });
});
