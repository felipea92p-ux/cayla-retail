import { describe, expect, it } from "vitest";
import { categoriasDe, interpretarCatalogo, type Prenda } from "./catalogo";
import { escribirElegido, leerElegido, NADA_ELEGIDO, type DatosDeFiltros, type Elegido } from "./filtros-color-talla";
import {
  categoriasConLaCuenta,
  coincidenciaDe,
  elegidoEnElDestino,
  esLaDireccionCanonica,
  filtrosDeLaLista,
  gruposConLaCuenta,
  prendasQuePasan,
} from "./filtros-lista";
import { delGrupo, gruposDe } from "./grupos";

// Cuatro prendas de tres categorías de dos grupos (Pantalones/Faldas, Blusas/Tops y Bolsos/Cinturones), con las variantes que hay:
//   falda Carla  (FAL): negro S, negro M, beige M        falda Luna (FAL): beige S
//   blusa Emma   (CMS): negro M, beige S                  bolso Ana  (CIN): negro, talla única
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CARLA = id(1);
const LUNA = id(2);
const EMMA = id(3);
const ANA = id(4);

const cruda = (n: number, nombre: string, prefijo: string, categoria: string) => ({
  id: id(n),
  codigo: null,
  nombre,
  categoria: { nombre: categoria, prefijo },
  precio: 79.9,
  precio_final: 79.9,
  desde: false,
  campana: null,
  colores: [],
  fotos: [],
});
const prendas = interpretarCatalogo({
  sede: null,
  prendas: [
    cruda(1, "Falda Carla", "FAL", "Faldas"),
    cruda(2, "Falda Luna", "FAL", "Faldas"),
    cruda(3, "Blusa Emma", "CMS", "Camisas y Blusas"),
    cruda(4, "Bolso Ana", "CIN", "Cinturones"),
  ],
})?.prendas as Prenda[];

const datos: DatosDeFiltros = {
  sede: null,
  variantes: [
    { prenda: CARLA, color: "NEG", talla: "S" },
    { prenda: CARLA, color: "NEG", talla: "M" },
    { prenda: CARLA, color: "BEI", talla: "M" },
    { prenda: LUNA, color: "BEI", talla: "S" },
    { prenda: EMMA, color: "NEG", talla: "M" },
    { prenda: EMMA, color: "BEI", talla: "S" },
    { prenda: ANA, color: "NEG", talla: "Única" },
  ],
  colores: {},
};
const ids = (ps: readonly Prenda[]) => ps.map((p) => p.id);
const negroM: Elegido = { color: ["negro"], talla: ["M"] };

describe("filtrosDeLaLista", () => {
  it("sin datos de la base, o sin nada pedido, no se filtra: la lista se ve entera", () => {
    expect(filtrosDeLaLista(null, negroM, prendas)).toEqual({ indice: null, elegido: NADA_ELEGIDO });
    expect(filtrosDeLaLista(datos, NADA_ELEGIDO, prendas)).toEqual({ indice: null, elegido: NADA_ELEGIDO });
    expect(ids(prendasQuePasan(filtrosDeLaLista(null, negroM, prendas), prendas))).toEqual(ids(prendas));
  });

  it("lo pedido se lleva al nivel que se ve: lo que ahí no existe se suelta", () => {
    // En todas las prendas, «negro y M» existe y no se toca.
    expect(filtrosDeLaLista(datos, negroM, prendas).elegido).toEqual(negroM);
    // Entre los bolsos no hay tallas que elegir (solo la única): la talla se suelta y el negro se queda.
    const bolsos = delGrupo(prendas, gruposDe(prendas).find((g) => g.clave === "bolsos")!);
    expect(filtrosDeLaLista(datos, negroM, bolsos).elegido).toEqual({ color: ["negro"], talla: [] });
    // Una lista sin prendas no deja nada elegido.
    expect(filtrosDeLaLista(datos, negroM, []).elegido).toEqual(NADA_ELEGIDO);
  });
});

describe("prendasQuePasan", () => {
  it("deja las prendas que tienen UNA variante con lo elegido, en su orden", () => {
    const f = filtrosDeLaLista(datos, negroM, prendas);
    expect(ids(prendasQuePasan(f, prendas))).toEqual([CARLA, EMMA]);
    // Solo el color: las tres con algún negro (el bolso también).
    expect(ids(prendasQuePasan(filtrosDeLaLista(datos, { color: ["negro"], talla: [] }, prendas), prendas))).toEqual([CARLA, EMMA, ANA]);
  });

  it("devuelve una copia: quien la ordene o recorte después no toca la lista de la página", () => {
    const todas = prendasQuePasan(filtrosDeLaLista(null, NADA_ELEGIDO, prendas), prendas);
    expect(todas).not.toBe(prendas);
    expect(todas).toEqual(prendas);
  });
});

describe("elegidoEnElDestino", () => {
  it("el enlace a otro grupo o categoría sale ya sin lo que allá no existe, y dice qué se quita", () => {
    const f = filtrosDeLaLista(datos, negroM, prendas);
    const faldas = prendas.filter((p) => [CARLA, LUNA].includes(p.id));
    const bolsos = prendas.filter((p) => p.id === ANA);
    expect(elegidoEnElDestino(f, faldas, "Faldas")).toEqual({ elegido: negroM, quita: null });
    expect(elegidoEnElDestino(f, bolsos, "Bolsos/Cinturones")).toEqual({
      elegido: { color: ["negro"], talla: [] },
      quita: "En Bolsos/Cinturones no hay talla M: quitamos esa talla.",
    });
    expect(elegidoEnElDestino(f, [], null)).toEqual({ elegido: NADA_ELEGIDO, quita: "En esta lista no hay Negro ni talla M: quitamos ese color y esa talla." });
  });

  it("sin filtros no hay nada que llevar ni que decir", () => {
    expect(elegidoEnElDestino(filtrosDeLaLista(null, negroM, prendas), prendas, "Todo")).toEqual({ elegido: NADA_ELEGIDO, quita: null });
  });
});

describe("coincidenciaDe", () => {
  const f = (e: Elegido) => filtrosDeLaLista(datos, e, prendas);

  it("dice por qué está («En Negro · talla M»), con los colores y tallas ELEGIDOS que tiene, no todos los suyos", () => {
    const c = coincidenciaDe(f(negroM), { id: CARLA });
    expect(c).toEqual({ color: "NEG", talla: "M", texto: "En Negro · talla M", codigos: ["NEG"] });
    // Carla tiene negro y beige en M; si se eligen los dos colores, dice los dos y marca las dos muestras.
    const dos = coincidenciaDe(f({ color: ["negro", "beige"], talla: ["M"] }), { id: CARLA });
    expect(dos?.texto).toBe("En Negro / Beige y arena · talla M");
    expect(dos?.codigos).toEqual(["NEG", "BEI"]);
  });

  it("con varias tallas elegidas, solo las que esa prenda tiene (en el orden de la tienda)", () => {
    const c = coincidenciaDe(f({ color: ["negro"], talla: ["M", "S", "L"] }), { id: CARLA });
    expect(c?.texto).toBe("En Negro · tallas S y M");
    expect(c?.talla).toBe("S"); // la primera elegida que tiene la variante con la que abre
  });

  it("solo color, o solo talla: dice solo eso, y la ficha abre en una variante que de verdad lo cumple", () => {
    expect(coincidenciaDe(f({ color: ["negro"], talla: [] }), { id: EMMA })).toEqual({ color: "NEG", talla: null, texto: "En Negro", codigos: ["NEG"] });
    // Solo la talla S: Luna la tiene en beige, y abre en beige (no en un color que no la tenga).
    expect(coincidenciaDe(f({ color: [], talla: ["S"] }), { id: LUNA })).toEqual({ color: "BEI", talla: "S", texto: "En talla S", codigos: ["BEI"] });
  });

  it("la talla única se dice «estándar / única» y abre con la clave UNICA", () => {
    // El bolso Ana es de talla única; entre todas las prendas se piden tallas (hay S, M y las cinturas), así que la elección se queda.
    const c = coincidenciaDe(f({ color: [], talla: ["UNICA"] }), { id: ANA });
    expect(c).toEqual({ color: "NEG", talla: "UNICA", texto: "En talla estándar / única", codigos: ["NEG"] });
  });

  it("sin filtros, o si ninguna variante cumple, no hay nada que decir", () => {
    expect(coincidenciaDe(filtrosDeLaLista(null, negroM, prendas), { id: CARLA })).toBeNull();
    expect(coincidenciaDe(f(negroM), { id: LUNA })).toBeNull(); // Luna no tiene negro en M
    expect(coincidenciaDe(f(NADA_ELEGIDO), { id: CARLA })).toBeNull();
  });
});

describe("esLaDireccionCanonica", () => {
  const canon = (e: Elegido) => esLaDireccionCanonica(escribirElegido(e), e);

  it("una dirección sin color ni talla, con nada elegido, está bien", () => {
    expect(esLaDireccionCanonica({}, NADA_ELEGIDO)).toBe(true);
    expect(canon(negroM)).toBe(true);
    expect(canon({ color: ["negro", "blanco"], talla: ["S", "M", "UNICA"] })).toBe(true);
  });

  it("lo escrito de otra manera no: desordenado, repetido, en mayúsculas, vacío, repetido en la dirección o con lo que no existe", () => {
    const elegido = leerElegido({ color: "blanco,negro", talla: "M,S" }); // la tienda lo escribe «negro,blanco» y «S,M»
    expect(esLaDireccionCanonica({ color: "blanco,negro", talla: "M,S" }, elegido)).toBe(false);
    expect(esLaDireccionCanonica({ color: "negro,negro", talla: "M" }, leerElegido({ color: "negro", talla: "M" }))).toBe(false);
    expect(esLaDireccionCanonica({ color: "NEGRO", talla: "M" }, negroM)).toBe(false);
    expect(esLaDireccionCanonica({ color: "", talla: "M" }, { color: [], talla: ["M"] })).toBe(false);
    expect(esLaDireccionCanonica({ color: ["negro", "blanco"] }, { color: ["negro"], talla: [] })).toBe(false);
    expect(esLaDireccionCanonica({ color: "zzz" }, NADA_ELEGIDO)).toBe(false);
  });

  it("lo que pedía la dirección y ya se corrigió (se soltó una talla) deja de ser la dirección", () => {
    const pedido = leerElegido({ color: "negro", talla: "M" });
    const corregido: Elegido = { color: ["negro"], talla: [] };
    expect(esLaDireccionCanonica({ color: "negro", talla: "M" }, pedido)).toBe(true);
    expect(esLaDireccionCanonica({ color: "negro", talla: "M" }, corregido)).toBe(false);
    expect(esLaDireccionCanonica({ color: "negro" }, corregido)).toBe(true);
  });
});

describe("los números de grupos y categorías con lo elegido", () => {
  const f = filtrosDeLaLista(datos, negroM, prendas);
  const pasan = new Set(ids(prendasQuePasan(f, prendas)));
  const grupos = gruposDe(prendas);

  it("los grupos son los mismos y están en el mismo orden; solo cambia cuántas cumplen lo elegido", () => {
    const con = gruposConLaCuenta(grupos, pasan);
    expect(con.map((g) => g.clave)).toEqual(grupos.map((g) => g.clave));
    expect(con.map((g) => [g.clave, g.cuantas])).toEqual([
      ["arriba", 1], // la blusa Emma tiene negro en M
      ["abajo", 1], // de las dos faldas, solo Carla
      ["bolsos", 0], // el bolso no tiene talla M: se queda, con 0
    ]);
    // Lo de adentro cuadra: cada categoría dice cuántas prendas trae, y el grupo suma sus categorías.
    for (const g of con) {
      for (const c of g.categorias) expect(c.cuantas).toBe(c.prendas.length);
      expect(g.cuantas).toBe(g.categorias.reduce((n, c) => n + c.cuantas, 0));
    }
  });

  it("no toca lo que recibe (los grupos de la lista sin filtrar siguen iguales)", () => {
    const antes = JSON.stringify(grupos.map((g) => [g.clave, g.cuantas, g.categorias.map((c) => [c.clave, c.cuantas, c.prendas.length])]));
    gruposConLaCuenta(grupos, pasan);
    expect(JSON.stringify(grupos.map((g) => [g.clave, g.cuantas, g.categorias.map((c) => [c.clave, c.cuantas, c.prendas.length])]))).toBe(antes);
  });

  it("las categorías de la fila única: las mismas, en el mismo orden, y la que da 0 se queda", () => {
    const categorias = categoriasDe(prendas); // Faldas (2) primero, luego por nombre
    const con = categoriasConLaCuenta(categorias, prendasQuePasan(f, prendas));
    expect(con.map((c) => c.clave)).toEqual(categorias.map((c) => c.clave));
    expect(Object.fromEntries(con.map((c) => [c.clave, c.cuantas]))).toEqual({ FAL: 1, CMS: 1, CIN: 0 });
  });
});
