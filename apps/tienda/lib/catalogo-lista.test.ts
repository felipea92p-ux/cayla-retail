import { describe, expect, it } from "vitest";
import type { Prenda } from "./catalogo";
import { categoriasConLaElegida, dondeHay, gruposConLoElegido, paraSeguirMirando, queSeBusca, vacioEnTienda } from "./catalogo-lista";
import { GRUPOS, gruposDe, leerGrupo } from "./grupos";
import type { Nivel } from "./stock";

const LIMA = { id: "272c2b96-1d3e-4801-b92f-9271696ee415", nombre: "Lima" };
const TRUJILLO = { id: "0b522f0b-2739-42b8-98bf-b6bbc4cff5fb", nombre: "Trujillo" };
const AREQUIPA = { id: "5d1c2b96-1d3e-4801-b92f-9271696ee999", nombre: "Arequipa" };
const TIENDAS = [AREQUIPA, LIMA, TRUJILLO];

const prenda = (nombre: string, prefijo: string, sedes: Record<string, Nivel> | null): Prenda => ({
  empresa: null,
  insignias: [],
  id: nombre,
  codigo: null,
  nombre,
  categoria: { nombre: `Cat ${prefijo}`, prefijo },
  precio: 25,
  precioFinal: 25,
  desde: false,
  campana: null,
  colores: [],
  fotos: [],
  stock: sedes ? { total: "hay", sedes } : null,
  nuevo: null,
  vendidos: null,
});

describe("dónde hay lo que se pidió", () => {
  // Los cinturones del banco: hay en Trujillo, en Lima ninguno.
  const cinturones = [
    prenda("Cinturón dorado", "CIN", { [TRUJILLO.id]: "hay", [LIMA.id]: 0 }),
    prenda("Cinturón plateado", "CIN", { [TRUJILLO.id]: 2, [LIMA.id]: 0 }),
    prenda("Cinturón hebilla", "CIN", { [TRUJILLO.id]: 1 }),
  ];

  it("cuenta los modelos de cada tienda que tiene algo, la que más primero; las que no tienen no salen", () => {
    expect(dondeHay(cinturones, TIENDAS)).toEqual([{ ...TRUJILLO, cuantas: 3 }]);
    const mezcla = [...cinturones, prenda("Aretes", "ARE", { [AREQUIPA.id]: "hay", [LIMA.id]: 3 }), prenda("Collar", "COL", { [AREQUIPA.id]: 1 })];
    expect(dondeHay(mezcla, TIENDAS).map((t) => `${t.nombre}:${t.cuantas}`)).toEqual(["Trujillo:3", "Arequipa:2", "Lima:1"]);
  });

  it("empate: por nombre; una prenda sin dato de stock no cuenta en ninguna (no se afirma lo que no se sabe)", () => {
    const parejas = [prenda("A", "CIN", { [TRUJILLO.id]: 1 }), prenda("B", "CIN", { [AREQUIPA.id]: 2 }), prenda("Sin dato", "CIN", null)];
    expect(dondeHay(parejas, TIENDAS).map((t) => `${t.nombre}:${t.cuantas}`)).toEqual(["Arequipa:1", "Trujillo:1"]);
    expect(dondeHay([], TIENDAS)).toEqual([]);
  });

  it("lleva lo de cada tienda tal cual (el nombre que la página usa para su dirección)", () => {
    const conMas = [{ ...TRUJILLO, whatsapp: "987654321" }];
    expect(dondeHay(cinturones, conMas)[0]).toMatchObject({ whatsapp: "987654321", cuantas: 3 });
  });
});

describe("lo que dice la lista vacía en la tienda elegida", () => {
  it("lo pedido en minúsculas: la categoría o el grupo; sin ellos, lo propio de cada lista", () => {
    expect(queSeBusca("todo", "Cinturones")).toBe("cinturones");
    expect(queSeBusca("nuevo", "Bolsos y Carteras")).toBe("bolsos y carteras");
    expect(queSeBusca("todo", "Bisutería y belleza")).toBe("bisutería y belleza");
    expect(queSeBusca("todo", null)).toBe("prendas");
    expect(queSeBusca("nuevo", null)).toBe("nada nuevo");
    expect(queSeBusca("ofertas", null)).toBe("ofertas");
    expect(queSeBusca("vendidos", null)).toBe("más vendidos");
  });

  it("si otra tienda tiene, dice cuántas y dónde, y el botón lleva allá (nunca «Ver todas las tiendas», que sonaba a la página de las tiendas)", () => {
    expect(vacioEnTienda("cinturones", "Lima", [{ ...TRUJILLO, cuantas: 3 }])).toEqual({
      titulo: "No hay cinturones en Lima",
      texto: "Pero hay 3 prendas en Trujillo.",
      boton: { texto: "Ver en Trujillo", tienda: { ...TRUJILLO, cuantas: 3 } },
    });
    expect(vacioEnTienda("nada nuevo", "Lima", [{ ...TRUJILLO, cuantas: 1 }])?.texto).toBe("Pero hay 1 prenda en Trujillo.");
  });

  it("con varias tiendas que tienen, las nombra con cuántas y el botón muestra todas", () => {
    expect(vacioEnTienda("cinturones", "Lima", [{ ...TRUJILLO, cuantas: 3 }, { ...AREQUIPA, cuantas: 2 }])).toEqual({
      titulo: "No hay cinturones en Lima",
      texto: "Pero hay en Trujillo (3) y Arequipa (2).",
      boton: { texto: "Ver en todas las tiendas", tienda: null },
    });
    const tres = [{ ...TRUJILLO, cuantas: 3 }, { ...AREQUIPA, cuantas: 2 }, { id: "x", nombre: "Cusco", cuantas: 1 }];
    expect(vacioEnTienda("ofertas", "Lima", tres)?.texto).toBe("Pero hay en Trujillo (3), Arequipa (2) y Cusco (1).");
  });

  it("si ninguna otra tiene, null: lo que falta no es la tienda y la lista dice su propio vacío", () => {
    expect(vacioEnTienda("más vendidos", "Lima", [])).toBeNull();
  });
});

describe("lo elegido siempre a la vista en los filtros", () => {
  const enLima = [prenda("Bolso", "CAR", { [LIMA.id]: 2 }), prenda("Gorro", "GOR", { [LIMA.id]: 1 }), prenda("Top", "TOP", { [LIMA.id]: 1 })];
  const bolsos = leerGrupo("bolsos")!;
  const cinturones = { clave: "CIN", nombre: "Cinturones", cuantas: 3 };

  it("la categoría elegida que aquí no tiene nada sale con 0, en su lugar dentro de su grupo", () => {
    const grupos = gruposConLoElegido(gruposDe(enLima), bolsos, cinturones);
    const suyo = grupos.find((g) => g.clave === "bolsos")!;
    // El orden del grupo: CAR, MOC, RIN, CIN.
    expect(suyo.categorias.map((c) => `${c.clave}:${c.cuantas}`)).toEqual(["CAR:1", "CIN:0"]);
    expect(suyo.cuantas).toBe(1);
    // Los demás grupos, tal cual y en su orden.
    expect(grupos.map((g) => g.clave)).toEqual(["arriba", "bolsos", "cabeza"]);
  });

  it("el grupo elegido que aquí no tiene nada también sale, con 0, en su lugar entre los grupos", () => {
    const grupos = gruposConLoElegido(gruposDe(enLima), leerGrupo("abajo"), null);
    expect(grupos.map((g) => `${g.clave}:${g.cuantas}`)).toEqual(["arriba:1", "abajo:0", "bolsos:1", "cabeza:1"]);
    expect(GRUPOS.findIndex((g) => g.clave === "abajo")).toBeGreaterThan(GRUPOS.findIndex((g) => g.clave === "arriba"));
  });

  it("sin nada elegido, o con lo elegido ya a la vista, los grupos quedan iguales", () => {
    const base = gruposDe(enLima);
    expect(gruposConLoElegido(base, null, null)).toEqual(base);
    expect(gruposConLoElegido(base, bolsos, { clave: "CAR", nombre: "Cat CAR", cuantas: 1 })).toEqual(base);
    // Una categoría de OTRO grupo no se cuela en el grupo elegido.
    expect(gruposConLoElegido(base, bolsos, { clave: "VES", nombre: "Vestidos", cuantas: 2 })).toEqual(base);
  });

  it("en una sola fila, la categoría elegida que aquí no tiene nada sale al final, con 0", () => {
    const fila = [{ clave: "CAR", nombre: "Bolsos", cuantas: 2 }];
    expect(categoriasConLaElegida(fila, cinturones)).toEqual([...fila, { clave: "CIN", nombre: "Cinturones", cuantas: 0 }]);
    expect(categoriasConLaElegida(fila, fila[0])).toEqual(fila);
    expect(categoriasConLaElegida(fila, null)).toEqual(fila);
  });
});

describe("lo que ofrece una lista vacía (2026-10-16)", () => {
  const FOTO = "https://x.supabase.co/storage/v1/object/public/retail-productos-fotos/fotos/x.jpg";
  const p = (id: string, { nuevo = null, foto = true }: { nuevo?: number | null; foto?: boolean } = {}) =>
    ({ id, nombre: id, categoria: null, colores: [], fotos: foto ? [FOTO] : [], nuevo: nuevo === null ? null : { dias: nuevo }, vendidos: null }) as unknown as Prenda;
  const prendas = [p("a", { nuevo: 9 }), p("b", { nuevo: 2, foto: false }), p("c"), p("d", { nuevo: 1 })];
  const ids = (r: ReturnType<typeof paraSeguirMirando>) => (r ? `${r.lista}: ${r.prendas.map((x) => x.id).join(",")}` : null);

  it("Lo nuevo (con foto primero, lo más reciente primero) para cualquier lista vacía que no sea Lo nuevo", () => {
    for (const lista of ["vendidos", "ofertas", "favoritos", "todo"] as const) expect(ids(paraSeguirMirando(prendas, lista))).toBe("nuevo: d,a,b");
  });

  it("si la vacía es Lo nuevo (o no hay nada nuevo), toda la tienda en su orden", () => {
    expect(ids(paraSeguirMirando(prendas, "nuevo"))).toBe("todo: a,c,d,b");
    expect(ids(paraSeguirMirando([p("c"), p("e", { foto: false })], "vendidos"))).toBe("todo: c,e");
  });

  it("sin lo que ya se muestra, hasta `cuantas`, y sin nada que ofrecer, null", () => {
    expect(ids(paraSeguirMirando(prendas, "vendidos", { fuera: ["d"] }))).toBe("nuevo: a,b");
    expect(ids(paraSeguirMirando(prendas, "vendidos", { cuantas: 1 }))).toBe("nuevo: d");
    expect(paraSeguirMirando([], "vendidos")).toBeNull();
    expect(paraSeguirMirando([p("a")], "nuevo", { fuera: ["a"] })).toBeNull();
  });
});
