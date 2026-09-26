import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExistenciasVacio } from "../components/ExistenciasVacio";
import { crearIndiceBusquedaEspecial, filtrarConBusquedaEspecial, type CamposBuscables } from "./filtro-busqueda-especial";
import {
  distanciaConTope,
  explicarVacio,
  palabrasBuscables,
  sinStockQueCoincide,
  textoSinStock,
  type ClaveFiltro,
  type FiltroActivo,
  type ProductoSinStock,
} from "./existencias-vacio";

// Estado vacío de Existencias (2026-09-26). Las filas son las de Tienda TRU (mismas que la prueba de marca del
// buscador): «CAYLA» y «Cayla 2» son DOS marcas, y «Polos» es una categoría, no solo un nombre.

type Fila = { id: string; producto: string; marca: string | null; categoria: string | null; color: string; talla: string; codigo: string };

const FILAS: Fila[] = [
  { id: "aurora-negro-s", producto: "Top Aurora", marca: "Cayla 2", categoria: "Tops", color: "Negro", talla: "S", codigo: "TOP-0001-NEG-S" },
  { id: "aurora-negro-m", producto: "Top Aurora", marca: "Cayla 2", categoria: "Tops", color: "Negro", talla: "M", codigo: "TOP-0001-NEG-M" },
  { id: "carlita-dorado-m", producto: "Blusa Carlita", marca: "Doradas Chic", categoria: "Camisas y Blusas", color: "Dorado", talla: "M", codigo: "BLU-0002-DOR-M" },
  { id: "carlita-negro-m", producto: "Blusa Carlita", marca: "Doradas Chic", categoria: "Camisas y Blusas", color: "Negro", talla: "M", codigo: "BLU-0002-NEG-M" },
  { id: "xd-blanco-l", producto: "Blusa Xd", marca: "Artemisa", categoria: "Blazers", color: "Blanco", talla: "L", codigo: "BLU-0003-BLA-L" },
  { id: "basico-manga-larga-blanco-m", producto: "Básico Manga Larga", marca: "Miramhe", categoria: "Polos", color: "Blanco", talla: "M", codigo: "POL-0005-BLA-M" },
  { id: "polo-basico-blanco-m", producto: "Polo Básico M/corta", marca: "Miramhe", categoria: "Polos", color: "Blanco", talla: "M", codigo: "POL-0002-BLA-M" },
  { id: "jean-baggy-azul-30", producto: "Jean Baggy", marca: "Wayi", categoria: "Jeans", color: "Azul", talla: "30", codigo: "JEA-0004-AZU-30" },
];

const leer = (f: Fila): CamposBuscables => ({ nombre: f.producto, sku: f.codigo, codigosBarras: [], color: f.color, talla: f.talla, marca: f.marca, categoria: f.categoria });
const INDICE = crearIndiceBusquedaEspecial(FILAS, leer);
const PALABRAS = palabrasBuscables(FILAS.map((f) => ({ referencia: f.producto, marca: f.marca, categoria: f.categoria, color: f.color })));

/** Los filtros visuales que la pantalla simula con `otros`: marca y categoría por valor exacto. */
type Elegidos = { marca?: string; categoria?: string };
const filtrosDe = (elegidos: Elegidos): FiltroActivo[] => [
  ...(elegidos.categoria ? [{ clave: "categoria" as const, etiqueta: "Categoría", valor: elegidos.categoria }] : []),
  ...(elegidos.marca ? [{ clave: "marca" as const, etiqueta: "Marca", valor: elegidos.marca }] : []),
];
/** Igual que la pantalla: cuenta las prendas con esta consulta e ignora los filtros que le pidan omitir. */
const contarCon =
  (elegidos: Elegidos) =>
  (consulta: string, omitir: ReadonlySet<ClaveFiltro>): number =>
    filtrarConBusquedaEspecial(INDICE, consulta, {
      otros: (f) => (omitir.has("marca") || !elegidos.marca || f.marca === elegidos.marca) && (omitir.has("categoria") || !elegidos.categoria || f.categoria === elegidos.categoria),
    }).filas.length;

const SIN_STOCK: ProductoSinStock[] = [
  { id: "p1", referencia: "Pantalon Cayla", marca: "CAYLA", categoria: "Pantalones" },
  { id: "p2", referencia: "Pantalon Sastre", marca: "CAYLA", categoria: "Pantalones" },
  { id: "p3", referencia: "Vestido Aurora", marca: "Bella Aldama", categoria: "Vestidos" },
];

const explicar = (consulta: string, elegidos: Elegidos = {}, sinStock: readonly ProductoSinStock[] = []) =>
  explicarVacio({
    consulta,
    sede: "Tienda TRU",
    filtros: filtrosDe(elegidos),
    vocabulario: INDICE.vocabulario,
    palabras: PALABRAS,
    contar: contarCon(elegidos),
    sinStock,
    filtroMarca: elegidos.marca ?? null,
    filtroCategoria: elegidos.categoria ?? null,
  });

describe("cómo se leyó lo escrito", () => {
  it("«blusa blanco m»: texto, color y talla, y el título dice qué se buscó y dónde", () => {
    const e = explicar("blusa blanco m");
    expect(e.titulo).toBe("Nada coincide con «blusa blanco m» en Tienda TRU");
    expect(e.comoSeLeyo).toEqual([
      { texto: "blusa", tipo: "texto" },
      { texto: "blanco", tipo: "color" },
      { texto: "m", tipo: "talla" },
    ]);
  });

  it("las palabras de compañía no aparecen: «blusa de talla m» se lee como «blusa» y «m»", () => {
    expect(explicar("blusa de talla m").comoSeLeyo.map((t) => t.texto)).toEqual(["blusa", "m"]);
  });

  it("muestra lo escrito como lo escribió la persona: en minúscula pero con tilde", () => {
    const e = explicar("  BÁSICO   Wayi ");
    expect(e.titulo).toBe("Nada coincide con «BÁSICO Wayi» en Tienda TRU");
    expect(e.comoSeLeyo.map((t) => t.texto)).toEqual(["básico", "wayi"]);
  });
});

describe("quitar una cosa: relajaciones", () => {
  it("«cayla polo» no trae nada; quitar «cayla» o «polo» sí, cada uno con sus prendas", () => {
    expect(contarCon({})("cayla polo", new Set())).toBe(0);
    const { relajaciones } = explicar("cayla polo");
    // Empatan en 2 prendas: manda el orden en que se escribió.
    expect(relajaciones).toEqual([
      { texto: "Quitar «cayla»", prendas: 2, accion: { tipo: "termino", consulta: "polo" } },
      { texto: "Quitar «polo»", prendas: 2, accion: { tipo: "termino", consulta: "cayla" } },
    ]);
  });

  it("«blusa blanco m» (da 0): «Quitar «m»» deja ver 1 prenda, y se ofrecen las tres con más prendas primero", () => {
    expect(contarCon({})("blusa blanco m", new Set())).toBe(0);
    const { relajaciones } = explicar("blusa blanco m");
    expect(relajaciones.map((r) => [r.texto, r.prendas])).toEqual([
      ["Quitar «blusa»", 2], // «blanco m»: los dos polos blancos M
      ["Quitar «blanco»", 2], // «blusa m»: las dos Blusa Carlita M
      ["Quitar «m»", 1], // «blusa blanco»: Blusa Xd
    ]);
    expect(relajaciones[2].accion).toEqual({ tipo: "termino", consulta: "blusa blanco" });
  });

  it("las palabras de compañía no vuelven al quitar otro término: «blusa blanco de talla m» → quitar «blusa» deja «blanco m»", () => {
    const { relajaciones } = explicar("blusa blanco de talla m");
    expect(relajaciones[0].accion).toEqual({ tipo: "termino", consulta: "blanco m" });
  });

  it("devuelve la palabra con su tilde, no la del motor: quitar «wayi» deja «básico»", () => {
    const { relajaciones } = explicar("Básico wayi");
    expect(relajaciones.map((r) => r.texto)).toEqual(["Quitar «wayi»", "Quitar «básico»"]);
    expect(relajaciones[0].accion).toEqual({ tipo: "termino", consulta: "básico" });
    expect(relajaciones[1].accion).toEqual({ tipo: "termino", consulta: "wayi" });
  });

  it("filtro Marca = Miramhe + «wayi»: se ofrece quitar «wayi» (2 prendas) y quitar el filtro (1 prenda)", () => {
    const e = explicar("wayi", { marca: "Miramhe" });
    expect(e.relajaciones).toEqual([
      { texto: "Quitar «wayi»", prendas: 2, accion: { tipo: "termino", consulta: "" } },
      { texto: "Quitar el filtro Marca: Miramhe", prendas: 1, accion: { tipo: "filtro", clave: "marca" } },
    ]);
    expect(e.filtros).toEqual([{ clave: "marca", etiqueta: "Marca", valor: "Miramhe" }]);
  });

  it("un solo término y ningún filtro: no se ofrece «quitar» (eso es «Limpiar»)", () => {
    expect(explicar("xyzxyz").relajaciones).toEqual([]);
  });

  it("solo se ofrece lo que da prendas: nunca un botón que lleva a otro vacío", () => {
    // «jean» + categoría Polos + marca Miramhe: quitar solo la marca deja Jean + Polos (0), quitar solo la
    // categoría deja Jean + Miramhe (0): ninguno de los dos filtros se ofrece. Quitar «jean» deja los 2 polos.
    const e = explicar("jean", { marca: "Miramhe", categoria: "Polos" });
    expect(e.relajaciones).toEqual([{ texto: "Quitar «jean»", prendas: 2, accion: { tipo: "termino", consulta: "" } }]);
    // Y con «wayi» + categoría Jeans + marca Miramhe: quitar la marca sí deja Wayi + Jeans (1 prenda).
    const otra = explicar("wayi", { marca: "Miramhe", categoria: "Jeans" });
    expect(otra.relajaciones.map((r) => r.texto)).toEqual(["Quitar el filtro Marca: Miramhe"]);
    expect(otra.relajaciones.every((r) => r.prendas > 0)).toBe(true);
  });

  it("orden con números fijos: más prendas primero, a igualdad los términos antes que los filtros, y máximo 3", () => {
    const cifras: Record<string, number> = { "": 4, "a b": 0, a: 0, b: 7 };
    const filtros: FiltroActivo[] = [
      { clave: "marca", etiqueta: "Marca", valor: "X" },
      { clave: "estado", etiqueta: "Estado", valor: "Agotado" },
    ];
    const e = explicarVacio({
      consulta: "a b",
      sede: "Tienda TRU",
      filtros,
      // «a» y «b» no son tallas ni colores: los dos son texto.
      vocabulario: { tallas: new Set(), palabrasDeColor: new Set() },
      palabras: [],
      // Quitar «a» → «b» = 7; quitar «b» → «a» = 0 (no se ofrece); filtros: marca = 4 (igual que...), estado = 7 (empata con «b»).
      contar: (consulta, omitir) => (omitir.has("marca") ? 4 : omitir.has("estado") ? 7 : (cifras[consulta] ?? 0)),
      sinStock: [],
      filtroMarca: null,
      filtroCategoria: null,
    });
    expect(e.relajaciones.map((r) => [r.texto, r.prendas])).toEqual([
      ["Quitar «a»", 7],
      ["Quitar el filtro Estado: Agotado", 7],
      ["Quitar el filtro Marca: X", 4],
    ]);
    // Cuarta candidata: con un tercer filtro habría cuatro; se cortan en tres.
    const conCuatro = explicarVacio({
      consulta: "a b",
      sede: "Tienda TRU",
      filtros: [...filtros, { clave: "color", etiqueta: "Color", valor: "Rojo" }],
      vocabulario: { tallas: new Set(), palabrasDeColor: new Set() },
      palabras: [],
      contar: () => 3,
      sinStock: [],
      filtroMarca: null,
      filtroCategoria: null,
    });
    expect(conCuatro.relajaciones).toHaveLength(3);
    expect(conCuatro.relajaciones.map((r) => r.accion.tipo)).toEqual(["termino", "termino", "filtro"]);
  });

  it("dos términos iguales («polo polo») no generan dos botones iguales", () => {
    const e = explicar("polo polo jean");
    expect(e.relajaciones.map((r) => r.texto)).toEqual(["Quitar «jean»"]);
  });
});

describe("sin texto: solo filtros", () => {
  it("el título habla de los filtros y no hay «cómo se leyó»", () => {
    const e = explicar("", { marca: "Miramhe", categoria: "Jeans" });
    expect(e.titulo).toBe("Ninguna prenda cumple los filtros elegidos en Tienda TRU");
    expect(e.comoSeLeyo).toEqual([]);
    expect(e.filtros.map((f) => f.clave)).toEqual(["categoria", "marca"]);
    // Quitar la categoría deja Miramhe (2); quitar la marca deja Jeans (1).
    expect(e.relajaciones.map((r) => [r.texto, r.prendas])).toEqual([
      ["Quitar el filtro Categoría: Jeans", 2],
      ["Quitar el filtro Marca: Miramhe", 1],
    ]);
    expect(e.quisisteDecir).toBeNull();
  });

  it("sin texto ni filtros (no debería mostrarse): título neutro y nada que ofrecer", () => {
    const e = explicar("");
    expect(e.titulo).toBe("Ninguna prenda para mostrar en Tienda TRU");
    expect(e.relajaciones).toEqual([]);
    expect(e.sinStock).toEqual([]);
  });
});

describe("¿quisiste decir?", () => {
  it("«cayls» → «cayla»", () => {
    const e = explicar("cayls");
    expect(e.quisisteDecir).toEqual({ escrito: "cayls", sugerido: "cayla", consulta: "cayla" });
  });

  it("«poloo» → «polo» (no trae nada de verdad: no acaba en «s», así que no hay singular que lo salve)", () => {
    expect(contarCon({})("poloo", new Set())).toBe(0);
    expect(explicar("poloo").quisisteDecir).toEqual({ escrito: "poloo", sugerido: "polo", consulta: "polo" });
  });

  it("corrige solo el término con la errata y conserva los demás en su lugar: «negro poloo» → «negro polo»", () => {
    // «negro» es color, no texto: no se toca. Como quitar «negro» deja «poloo» (0) y quitar «poloo» deja «negro» (3 prendas), hay relajación y no se sugiere...
    expect(explicar("negro poloo").quisisteDecir).toBeNull();
    // ...pero con dos términos de texto sin salida (nada da prendas) sí, y se cambia solo el mal escrito.
    const e = explicarVacio({
      consulta: "cayla poloo",
      sede: "Tienda TRU",
      filtros: [],
      vocabulario: INDICE.vocabulario,
      palabras: PALABRAS,
      contar: () => 0,
      sinStock: [],
      filtroMarca: null,
      filtroCategoria: null,
    });
    expect(e.quisisteDecir).toEqual({ escrito: "poloo", sugerido: "polo", consulta: "cayla polo" });
  });

  it("mientras se teclea («cay», «mira», «pol») no hay sugerencia: empieza una palabra real", () => {
    for (const consulta of ["cay", "mira", "pol"]) {
      const e = explicarVacio({
        consulta,
        sede: "Tienda TRU",
        filtros: [],
        vocabulario: INDICE.vocabulario,
        palabras: PALABRAS,
        contar: () => 0, // aunque la pantalla estuviera vacía por otro motivo
        sinStock: [],
        filtroMarca: null,
        filtroCategoria: null,
      });
      expect(e.quisisteDecir, consulta).toBeNull();
    }
  });

  it("«xyzxyz» no se parece a nada: sin sugerencia", () => {
    expect(explicar("xyzxyz").quisisteDecir).toBeNull();
  });

  it("dos errores solo se toleran desde 7 letras: «camizass» → «camisas», pero «auxxra» (6) no → «aurora»", () => {
    expect(explicar("camizass").quisisteDecir?.sugerido).toBe("camisas");
    expect(explicar("auxxra").quisisteDecir).toBeNull();
    expect(explicar("auraraa").quisisteDecir?.sugerido).toBe("aurora");
  });

  it("un término de menos de 3 letras no se corrige", () => {
    expect(explicar("xz").quisisteDecir).toBeNull();
  });

  it("a igual distancia, la alfabéticamente primera; y nunca el mismo término", () => {
    const con = (consulta: string, palabras: string[]) =>
      explicarVacio({ consulta, sede: "S", filtros: [], vocabulario: INDICE.vocabulario, palabras, contar: () => 0, sinStock: [], filtroMarca: null, filtroCategoria: null }).quisisteDecir;
    expect(con("zella", ["cella", "bella"])?.sugerido).toBe("bella");
    expect(con("bella", ["bella"])).toBeNull();
  });

  it("solo cuando quitar una cosa no arregla nada: si quitar «polo» ya trae prendas, no se sugiere", () => {
    // «cayls polo»: quitar «polo» → «cayls» trae prendas (el motor lee «cayl» como singular): hay salida, no errata.
    const e = explicar("cayls polo");
    expect(e.relajaciones.length).toBeGreaterThan(0);
    expect(e.quisisteDecir).toBeNull();
  });

  it("los colores y tallas no se corrigen", () => {
    // «blancoo» no es color de la sede (solo «blanco»): es texto y se corrige; «m» sí es talla y se deja en paz.
    expect(explicar("blancoo").quisisteDecir?.sugerido).toBe("blanco");
    expect(explicar("m").quisisteDecir).toBeNull();
  });
});

describe("distanciaConTope", () => {
  it("cuenta ediciones: igual 0, una letra 1, dos letras 2", () => {
    expect(distanciaConTope("cayla", "cayla", 2)).toBe(0);
    expect(distanciaConTope("cayls", "cayla", 2)).toBe(1); // cambio
    expect(distanciaConTope("poloo", "polo", 2)).toBe(1); // sobra una
    expect(distanciaConTope("pol", "polo", 2)).toBe(1); // falta una
    expect(distanciaConTope("camizass", "camisas", 2)).toBe(2);
    expect(distanciaConTope("kitten", "sitting", 3)).toBe(3);
  });

  it("si supera el tope devuelve algo mayor que el tope (tope + 1), sin importar cuánto", () => {
    expect(distanciaConTope("cayla", "polo", 1)).toBeGreaterThan(1);
    expect(distanciaConTope("camizass", "camisas", 1)).toBe(2);
    expect(distanciaConTope("abc", "xyz", 2)).toBe(3);
    expect(distanciaConTope("a", "abcdefgh", 2)).toBe(3); // el largo ya lo descarta
  });

  it("vacío contra algo: el largo de lo otro (si cabe en el tope)", () => {
    expect(distanciaConTope("", "ab", 2)).toBe(2);
    expect(distanciaConTope("", "abcd", 2)).toBe(3);
    expect(distanciaConTope("", "", 0)).toBe(0);
  });

  it("es simétrica", () => {
    for (const [a, b] of [["cayla", "cayle"], ["blusa", "blsa"], ["jean", "wayi"]]) {
      expect(distanciaConTope(a, b, 3)).toBe(distanciaConTope(b, a, 3));
    }
  });
});

describe("palabrasBuscables", () => {
  it("nombres, marcas, categorías y colores: sin tildes, en minúscula, de 3+ letras, únicas y ordenadas", () => {
    expect(
      palabrasBuscables([
        { referencia: "Polo Básico M/corta", marca: "Miramhe", categoria: "Polos", color: "Blanco" },
        { referencia: "Básico Manga Larga", marca: "Miramhe", categoria: "Polos", color: "Azul marino" },
        { referencia: "Top Aurora", marca: "Cayla 2", categoria: null, color: null },
      ])
    ).toEqual(["aurora", "azul", "basico", "blanco", "cayla", "corta", "larga", "manga", "marino", "miramhe", "polo", "polos", "top"]);
  });

  it("descarta lo corto y lo que es solo número (códigos y tallas no se «escriben mal»)", () => {
    expect(palabrasBuscables([{ referencia: "Jean 30 XL de la", marca: "A&B", categoria: "0001" }])).toEqual(["jean"]);
  });

  it("sin filas, sin palabras; con campos opcionales ausentes, no falla", () => {
    expect(palabrasBuscables([])).toEqual([]);
    expect(palabrasBuscables([{ referencia: "Vestido" }])).toEqual(["vestido"]);
  });
});

describe("sinStockQueCoincide", () => {
  const V = INDICE.vocabulario; // tallas s, m, l, 30 · colores negro, blanco, dorado, azul
  const nombres = (r: { productos: ProductoSinStock[] }) => r.productos.map((p) => p.referencia);

  it("«cayla» → los dos pantalones (uno por el nombre y la marca, otro solo por la marca), no el vestido", () => {
    const r = sinStockQueCoincide("cayla", V, SIN_STOCK);
    expect(nombres(r)).toEqual(["Pantalon Cayla", "Pantalon Sastre"]);
    expect(r.total).toBe(2);
  });

  it("«pantalon negro»: «negro» es color de la sede y no aplica a un producto sin variantes → solo cuenta «pantalon»", () => {
    expect(nombres(sinStockQueCoincide("pantalon negro", V, SIN_STOCK))).toEqual(["Pantalon Cayla", "Pantalon Sastre"]);
  });

  it("«m» (talla) o solo color: sin términos de texto → nada", () => {
    expect(sinStockQueCoincide("m", V, SIN_STOCK)).toEqual({ productos: [], total: 0 });
    expect(sinStockQueCoincide("negro m", V, SIN_STOCK)).toEqual({ productos: [], total: 0 });
    expect(sinStockQueCoincide("", V, SIN_STOCK)).toEqual({ productos: [], total: 0 });
  });

  it("todos los términos de texto deben cumplirse: «pantalon aldama» no trae nada", () => {
    expect(sinStockQueCoincide("pantalon aldama", V, SIN_STOCK).total).toBe(0);
    expect(nombres(sinStockQueCoincide("vestido aldama", V, SIN_STOCK))).toEqual(["Vestido Aurora"]);
  });

  it("marca y categoría por inicio de palabra, no desde la mitad: «ayla» solo halla al que lo trae en el NOMBRE", () => {
    // «Pantalon Cayla» lo tiene dentro de su nombre (el nombre sí se busca en cualquier parte); «Pantalon Sastre» solo en la marca CAYLA.
    expect(nombres(sinStockQueCoincide("ayla", V, SIN_STOCK))).toEqual(["Pantalon Cayla"]);
    expect(nombres(sinStockQueCoincide("pantalones", V, SIN_STOCK))).toEqual(["Pantalon Cayla", "Pantalon Sastre"]);
    expect(nombres(sinStockQueCoincide("bella", V, SIN_STOCK))).toEqual(["Vestido Aurora"]);
  });

  it("respeta el filtro de marca (sin tildes ni mayúsculas) y el de categoría", () => {
    const mezcla: ProductoSinStock[] = [
      ...SIN_STOCK,
      { id: "p4", referencia: "Blusa Aurora", marca: "Bella Aldama", categoria: "Blusas" },
      { id: "p5", referencia: "Aurora sin marca", marca: null, categoria: null },
    ];
    expect(nombres(sinStockQueCoincide("aurora", V, mezcla))).toEqual(["Aurora sin marca", "Blusa Aurora", "Vestido Aurora"]);
    expect(nombres(sinStockQueCoincide("aurora", V, mezcla, { filtroMarca: "BELLA aldama" }))).toEqual(["Blusa Aurora", "Vestido Aurora"]);
    expect(nombres(sinStockQueCoincide("aurora", V, mezcla, { filtroMarca: "bella aldama", filtroCategoria: "vestidos" }))).toEqual(["Vestido Aurora"]);
    // Con filtro de marca, un producto sin marca no pasa.
    expect(nombres(sinStockQueCoincide("aurora", V, mezcla, { filtroMarca: "Miramhe" }))).toEqual([]);
    expect(nombres(sinStockQueCoincide("aurora", V, mezcla, { filtroCategoria: "Blusas" }))).toEqual(["Blusa Aurora"]);
  });

  it("primero los que el nombre empieza con lo escrito, luego alfabético", () => {
    const productos: ProductoSinStock[] = [
      { id: "1", referencia: "Bermuda Cayla", marca: "CAYLA", categoria: null }, // solo por la marca
      { id: "2", referencia: "Cayla Sastre", marca: "CAYLA", categoria: null },
      { id: "3", referencia: "Abrigo", marca: "CAYLA", categoria: null }, // solo por la marca; alfabéticamente primero
      { id: "4", referencia: "Cayla Corto", marca: "CAYLA", categoria: null },
    ];
    expect(nombres(sinStockQueCoincide("cayla", V, productos))).toEqual(["Cayla Corto", "Cayla Sastre", "Abrigo", "Bermuda Cayla"]);
  });

  it("máximo 5 por defecto, pero el total cuenta todos; `limite` lo cambia", () => {
    const muchos: ProductoSinStock[] = Array.from({ length: 8 }, (_, i) => ({ id: `m${i}`, referencia: `Pantalon ${String.fromCharCode(65 + i)}`, marca: "CAYLA", categoria: null }));
    const r = sinStockQueCoincide("cayla", V, muchos);
    expect(r.productos).toHaveLength(5);
    expect(r.total).toBe(8);
    expect(nombres(r)).toEqual(["Pantalon A", "Pantalon B", "Pantalon C", "Pantalon D", "Pantalon E"]);
    expect(sinStockQueCoincide("cayla", V, muchos, { limite: 2 }).productos).toHaveLength(2);
    expect(sinStockQueCoincide("cayla", V, muchos, { limite: 0 })).toEqual({ productos: [], total: 8 });
    expect(sinStockQueCoincide("cayla", V, muchos, { limite: 50 }).productos).toHaveLength(8);
  });

  it("sin tildes ni mayúsculas: «BÁSICO» encuentra «Basico»", () => {
    const productos: ProductoSinStock[] = [{ id: "1", referencia: "Basico Largo", marca: null, categoria: null }];
    expect(nombres(sinStockQueCoincide("BÁSICO", V, productos))).toEqual(["Basico Largo"]);
  });
});

describe("explicarVacio · lo que el catálogo tiene y la sede no", () => {
  it("«pantalon cayla»: nada en la sede, pero el catálogo tiene dos pantalones que la sede no ha recibido", () => {
    const e = explicar("pantalon cayla", {}, SIN_STOCK);
    expect(e.sinStock.map((p) => p.referencia)).toEqual(["Pantalon Cayla", "Pantalon Sastre"]);
    expect(e.sinStockTotal).toBe(2);
    // Quitar «pantalon» deja «cayla» (2 prendas de «Cayla 2»); quitar «cayla» deja «pantalon» (0): solo una salida.
    expect(e.relajaciones.map((r) => r.texto)).toEqual(["Quitar «pantalon»"]);
    expect(e.quisisteDecir).toBeNull();
  });

  it("respeta el filtro de marca de la pantalla: con Marca = Bella Aldama, «cayla» no muestra los pantalones", () => {
    const e = explicar("aurora", { marca: "Bella Aldama" }, SIN_STOCK);
    expect(e.sinStock.map((p) => p.referencia)).toEqual(["Vestido Aurora"]);
    const otra = explicar("cayla", { marca: "Bella Aldama" }, SIN_STOCK);
    expect(otra.sinStock).toEqual([]);
    expect(otra.sinStockTotal).toBe(0);
  });

  it("con un texto de talla o de color no hay bloque de «sin stock en la sede»", () => {
    expect(explicar("m", {}, SIN_STOCK).sinStock).toEqual([]);
  });

  it("máximo 5 en la lista, total completo", () => {
    const muchos: ProductoSinStock[] = Array.from({ length: 7 }, (_, i) => ({ id: `m${i}`, referencia: `Pantalon ${i}`, marca: "CAYLA", categoria: null }));
    const e = explicar("pantalon", {}, muchos);
    expect(e.sinStock).toHaveLength(5);
    expect(e.sinStockTotal).toBe(7);
  });

  it("no revela nada que no se le dé: sin `sinStock`, no hay bloque", () => {
    const e = explicar("pantalon cayla");
    expect(e.sinStock).toEqual([]);
    expect(e.sinStockTotal).toBe(0);
  });
});

describe("ExistenciasVacio (render)", () => {
  const props = (consulta: string, elegidos: Elegidos, sinStock: readonly ProductoSinStock[], extra: { hrefCatalogo?: (r: string) => string; hayTexto?: boolean } = {}) => ({
    explicacion: explicar(consulta, elegidos, sinStock),
    sede: "Tienda TRU",
    hayTexto: extra.hayTexto ?? consulta.trim() !== "",
    onQuitarTermino: () => {},
    onQuitarFiltro: () => {},
    onLimpiarTodo: () => {},
    hrefCatalogo: extra.hrefCatalogo,
  });
  const pintar = (p: ReturnType<typeof props>) => renderToStaticMarkup(createElement(ExistenciasVacio, p));

  it("título, cómo se leyó, salidas con su cifra y el botón de limpiar; es un aviso de estado accesible", () => {
    const html = pintar(props("blusa blanco m", {}, []));
    expect(html).toContain('role="status"');
    expect(html).toContain("Nada coincide con «blusa blanco m» en Tienda TRU");
    expect(html).toContain("Se leyó así:");
    expect(html).toContain("«blanco»");
    expect(html).toContain("(color)");
    expect(html).toContain("Prueba con:");
    expect(html).toContain("Quitar «m»");
    expect(html).toContain("1 prenda</button>"); // singular
    expect(html).toContain("2 prendas");
    expect(html).toContain("Limpiar la búsqueda"); // solo texto: no dice «filtros»
    expect(html).not.toContain("En el catálogo, pero");
    expect(html).not.toContain("Filtros activos");
  });

  it("los filtros activos son botones reales que se pueden quitar, con nombre accesible completo", () => {
    const html = pintar(props("wayi", { marca: "Miramhe" }, []));
    expect(html).toContain("Filtros activos:");
    expect(html).toContain('aria-label="Quitar el filtro Marca: Miramhe"');
    expect(html).toContain("Marca: Miramhe");
    expect(html).toContain("Quitar el filtro Marca: Miramhe · 1 prenda");
    expect(html).toContain("Limpiar búsqueda y filtros");
  });

  it("sin texto y con filtros: el título habla de los filtros y el botón dice «Quitar todos los filtros»", () => {
    const html = pintar(props("", { categoria: "Jeans", marca: "Miramhe" }, []));
    expect(html).toContain("Ninguna prenda cumple los filtros elegidos en Tienda TRU");
    expect(html).not.toContain("Se leyó así");
    expect(html).toContain("Quitar todos los filtros");
  });

  it("«¿Quisiste decir «cayla»?» es un botón enlace", () => {
    const html = pintar(props("cayls", {}, []));
    expect(html).toContain("¿Quisiste decir");
    expect(html).toContain('class="btn-enlace"');
    expect(html).toContain("«cayla»");
    expect(html).toContain("Buscar «cayla» en lugar de «cayls»");
    expect(html).not.toContain("Prueba con:");
  });

  it("el bloque «En el catálogo, pero sin stock en la sede» lista los productos, con marca, y «y N más»", () => {
    const muchos: ProductoSinStock[] = [
      { id: "1", referencia: "Pantalon Cayla", marca: "CAYLA", categoria: "Pantalones" },
      { id: "2", referencia: "Pantalon Sastre", marca: "CAYLA", categoria: "Pantalones" },
      { id: "3", referencia: "Pantalon Lino", marca: null, categoria: "Pantalones" },
      { id: "4", referencia: "Pantalon Denim", marca: "CAYLA", categoria: null },
      { id: "5", referencia: "Pantalon Bota", marca: "CAYLA", categoria: null },
      { id: "6", referencia: "Pantalon Ancho", marca: "CAYLA", categoria: null },
      { id: "7", referencia: "Pantalon Recto", marca: "CAYLA", categoria: null },
    ];
    const html = pintar(props("pantalon", {}, muchos));
    expect(html).toContain("nota-cayla");
    expect(html).toContain("En el catálogo, pero sin stock en Tienda TRU:");
    expect(html).toContain("Pantalon Ancho");
    expect(html).toContain(" · marca CAYLA");
    expect(html).toContain(" · categoría Pantalones"); // el que no tiene marca enseña su categoría
    expect(html).toContain("y 2 más");
    expect(html).not.toContain("Ver en Productos"); // sin hrefCatalogo no hay enlace
  });

  it("con hrefCatalogo, cada producto lleva su enlace «Ver en Productos»", () => {
    const html = pintar(props("pantalon cayla", {}, SIN_STOCK, { hrefCatalogo: (r) => `/productos?q=${encodeURIComponent(r)}` }));
    expect(html).toContain('href="/productos?q=Pantalon%20Cayla"');
    expect(html).toContain('aria-label="Ver «Pantalon Sastre» en Productos"');
    expect(html.match(/Ver en Productos/g)).toHaveLength(2);
    expect(html).not.toContain("y 0 más");
  });

  it("no usa colores sueltos ni el rojo: solo las piezas del sistema", () => {
    const html = pintar(props("pantalon cayla", { marca: "Miramhe" }, SIN_STOCK, { hrefCatalogo: (r) => `/p/${r}` }));
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(html).not.toMatch(/text-rojo|bg-rojo|border-rojo|btn-primario|btn-peligro/);
    expect(html).not.toContain("animate-");
  });
});

describe("textoSinStock", () => {
  it("dice «sin stock en {sede}»: vale para uno o varios productos y para una tienda o el Taller, sin concordancia ni «recibido»", () => {
    expect(textoSinStock("Tienda TRU")).toBe("En el catálogo, pero sin stock en Tienda TRU:");
    expect(textoSinStock("Taller")).toBe("En el catálogo, pero sin stock en Taller:");
  });
});

describe("«Se leyó así» solo cuando aporta", () => {
  const pintarConsulta = (consulta: string) =>
    renderToStaticMarkup(
      createElement(ExistenciasVacio, {
        explicacion: explicar(consulta),
        sede: "Tienda TRU",
        hayTexto: true,
        onQuitarTermino: () => {},
        onQuitarFiltro: () => {},
        onLimpiarTodo: () => {},
      }),
    );

  it("con una sola palabra de texto no aparece: «poloo» leído como «texto» era ruido puro", () => {
    expect(pintarConsulta("poloo")).not.toContain("Se leyó así");
    expect(pintarConsulta("cayla polo")).not.toContain("Se leyó así");
  });

  it("aparece si algún término se leyó como color o talla, sin decir «texto»: «blusa» · «blanco» (color) · «m» (talla)", () => {
    const html = pintarConsulta("blusa blanco m");
    expect(html).toContain("Se leyó así:");
    expect(html).toContain("(color)");
    expect(html).toContain("(talla)");
    expect(html).not.toContain(" texto");
  });

  it("el bloque de productos del catálogo sin stock sale ANTES de «Prueba con» (la respuesta real primero)", () => {
    const html = renderToStaticMarkup(
      createElement(ExistenciasVacio, {
        explicacion: explicar("pantalon cayla", {}, SIN_STOCK),
        sede: "Tienda TRU",
        hayTexto: true,
        onQuitarTermino: () => {},
        onQuitarFiltro: () => {},
        onLimpiarTodo: () => {},
      }),
    );
    expect(html.indexOf("sin stock en Tienda TRU")).toBeGreaterThan(-1);
    expect(html.indexOf("sin stock en Tienda TRU")).toBeLessThan(html.indexOf("Prueba con:"));
  });
});
