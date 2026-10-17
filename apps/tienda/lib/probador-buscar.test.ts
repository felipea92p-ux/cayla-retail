import { describe, expect, it } from "vitest";
import { LOOK_VACIO, type ColorDelProbador, type PrendaDelProbador, type Zona } from "./probador";
import {
  AVISO_AL_PROBAR,
  busquedaConBuscar,
  buscarParaElLook,
  coincide,
  colorEnLaBusqueda,
  conteoDeBusqueda,
  estadoDeLaTarjeta,
  gruposDeResultados,
  leerFiltroDeZona,
  marcadorDeBusqueda,
  palabrasDe,
  portadaDeZona,
  sugerenciasDeBusqueda,
  tituloSinResultados,
} from "./probador-buscar";

const id = (n: number) => `bbbbbbbb-0000-4000-8000-${String(n).padStart(12, "0")}`;
function color(codigo: string, nombre: string, extra: Partial<ColorDelProbador> = {}): ColorDelProbador {
  return {
    codigo,
    nombre,
    hex: "#000000",
    precio: 50,
    precioFinal: 50,
    desde: false,
    pct: null,
    hay: true,
    nota: null,
    solo: null,
    foto: { url: `https://x/${codigo}.png`, proporcion: 1, optimizar: false, propia: true, de: null },
    ...extra,
  };
}
const prenda = (n: number, nombre: string, zona: Zona, categoria: string, colores: ColorDelProbador[]): PrendaDelProbador => ({
  id: id(n),
  codigo: `P-${n}`,
  nombre,
  categoria,
  zona,
  metida: false,
  largo: 60,
  colores,
});

const TOP = prenda(1, "Top Estela", "arriba", "Tops", [color("RPA", "Rosa pálido"), color("NEG", "Negro")]);
const BLUSA = prenda(2, "Blusa Encaje Aurora", "arriba", "Camisas y Blusas", [color("CRU", "Crudo")]);
const BODY = prenda(3, "Body Letty", "arriba", "Bodys", [color("AMM", "Amarillo mantequilla", { hay: false })]);
const PANTALON = prenda(4, "Pantalón Sastre Strend", "abajo", "Pantalones", [color("GRI", "Gris"), color("NEG", "Negro")]);
const VESTIDO = prenda(5, "Vestido Lazo Noche", "vestido", "Vestidos", [color("NEG", "Negro")]);
const CARTERA = prenda(6, "Cartera Crescent", "bolso", "Bolsos y Carteras", [color("NEG", "Negro")]);
const TODAS = [TOP, BLUSA, BODY, PANTALON, VESTIDO, CARTERA];

describe("la búsqueda abierta en la dirección", () => {
  it("lee el filtro de zona; uno que no existe o vacío, ninguno", () => {
    expect(leerFiltroDeZona("arriba")).toBe("arriba");
    expect(leerFiltroDeZona("todo")).toBe("todo");
    expect(leerFiltroDeZona("zapatos")).toBeNull();
    expect(leerFiltroDeZona(null)).toBeNull();
  });
  it("abrirla y cerrarla deja lo demás de la dirección como estaba, con el look legible", () => {
    expect(busquedaConBuscar("?sede=lima&p=P-1.NEG~P-2.GRI", "arriba")).toBe("?sede=lima&buscar=arriba&p=P-1.NEG~P-2.GRI");
    expect(busquedaConBuscar("?sede=lima&buscar=arriba&p=P-1.NEG", null)).toBe("?sede=lima&p=P-1.NEG");
    expect(busquedaConBuscar("", "todo")).toBe("?buscar=todo");
  });
});

describe("qué coincide: nombre, categoría, zona o color, sin tildes ni mayúsculas", () => {
  it("cada palabra tiene que estar", () => {
    expect(palabrasDe("  Pantalón  NEGRO ")).toEqual(["pantalon", "negro"]);
    expect(coincide(PANTALON, palabrasDe("pantalon negro"))).toBe(true);
    expect(coincide(PANTALON, palabrasDe("pantalon rosa"))).toBe(false);
    expect(coincide(TOP, palabrasDe("rosa"))).toBe(true);
    expect(coincide(BLUSA, palabrasDe("blusa"))).toBe(true);
    expect(coincide(VESTIDO, palabrasDe("vestidos"))).toBe(true);
    expect(coincide(CARTERA, palabrasDe("bolso"))).toBe(true);
    expect(coincide(TOP, [])).toBe(true);
  });
});

describe("lo que se ve", () => {
  it("sin nada escrito y con «Todo», nada (se ve «¿Qué buscas?»)", () => {
    expect(buscarParaElLook(TODAS, { texto: " ", zona: "todo" })).toEqual([]);
  });
  it("en una zona, todas las suyas; lo agotado, al final", () => {
    expect(buscarParaElLook(TODAS, { texto: "", zona: "arriba" }).map((p) => p.nombre)).toEqual(["Top Estela", "Blusa Encaje Aurora", "Body Letty"]);
    expect(buscarParaElLook([BODY, TOP], { texto: "", zona: "arriba" }).map((p) => p.nombre)).toEqual(["Top Estela", "Body Letty"]);
  });
  it("lo escrito, en toda la tienda o en una zona", () => {
    expect(buscarParaElLook(TODAS, { texto: "negro", zona: "todo" }).map((p) => p.nombre)).toEqual([
      "Top Estela",
      "Pantalón Sastre Strend",
      "Vestido Lazo Noche",
      "Cartera Crescent",
    ]);
    expect(buscarParaElLook(TODAS, { texto: "negro", zona: "abajo" }).map((p) => p.nombre)).toEqual(["Pantalón Sastre Strend"]);
  });
  it("con «Todo», un grupo por zona en el orden de las píldoras, y los vestidos dicen que ocupan arriba y abajo", () => {
    const grupos = gruposDeResultados(buscarParaElLook(TODAS, { texto: "negro", zona: "todo" }));
    expect(grupos.map((g) => [g.nombre, g.prendas.length, g.nota])).toEqual([
      ["Arriba", 1, null],
      ["Vestidos", 1, "ocupan arriba y abajo"],
      ["Abajo", 1, null],
      ["Bolsos", 1, null],
    ]);
  });
});

describe("el color de cada tarjeta", () => {
  it("el que tocó el cliente; si no, el que nombra lo escrito; si no, el del look o el que entra solo", () => {
    expect(colorEnLaBusqueda(TOP, [], { [TOP.id]: "NEG" }, {}).codigo).toBe("NEG");
    expect(colorEnLaBusqueda(TOP, palabrasDe("negro"), {}, {}).codigo).toBe("NEG");
    expect(colorEnLaBusqueda(TOP, palabrasDe("rosa"), {}, { [TOP.id]: "NEG" }).codigo).toBe("RPA");
    expect(colorEnLaBusqueda(TOP, palabrasDe("top"), {}, { [TOP.id]: "NEG" }).codigo).toBe("NEG");
    expect(colorEnLaBusqueda(TOP, [], {}, {}).codigo).toBe("RPA");
  });
  it("el botón: probarla, ponerle este color, ya está en tu look, o agotada", () => {
    const look = { ...LOOK_VACIO, arriba: { id: TOP.id, color: "RPA" } };
    expect(estadoDeLaTarjeta(BLUSA, BLUSA.colores[0], look)).toBe("probar");
    expect(estadoDeLaTarjeta(TOP, TOP.colores[0], look)).toBe("en-tu-look");
    expect(estadoDeLaTarjeta(TOP, TOP.colores[1], look)).toBe("este-color");
    expect(estadoDeLaTarjeta(BODY, BODY.colores[0], look)).toBe("agotada");
  });
});

describe("lo que dice la pantalla", () => {
  it("el conteo, la caja y el vacío", () => {
    expect(conteoDeBusqueda(3, "rosa", "arriba")).toBe("3 prendas para «rosa» en arriba");
    expect(conteoDeBusqueda(1, "", "vestido")).toBe("1 prenda en vestidos");
    expect(conteoDeBusqueda(0, "", "todo")).toBe("Busca en toda la tienda");
    expect(marcadorDeBusqueda("todo")).toBe("Nombre, color o tipo de prenda");
    expect(marcadorDeBusqueda("bolso")).toBe("Busca en bolsos: nombre o color");
    expect(tituloSinResultados(" verde ", "abajo")).toBe("No encontramos «verde» en abajo");
  });
  it("«Todo lo de arriba», con lo que hay en esa zona", () => {
    expect(portadaDeZona(TODAS, "arriba")).toEqual({ titulo: "Todo lo de arriba", texto: "Tops, camisas y blusas y bodys" });
    expect(portadaDeZona(TODAS, "bolso")).toEqual({ titulo: "Todo lo de bolsos", texto: "Bolsos y carteras" });
    expect(portadaDeZona(TODAS, "encima")).toEqual({ titulo: "Todo lo de encima", texto: null });
  });
  it("las sugerencias salen de lo que hay: los dos colores y las tres categorías con más prendas", () => {
    expect(sugerenciasDeBusqueda(TODAS)).toEqual(["negro", "amarillo mantequilla", "bodys", "bolsos y carteras", "camisas y blusas"]);
    // Cada sugerencia encuentra algo.
    for (const s of sugerenciasDeBusqueda(TODAS)) expect(buscarParaElLook(TODAS, { texto: s, zona: "todo" }).length).toBeGreaterThan(0);
    expect(sugerenciasDeBusqueda([])).toEqual([]);
  });
  it("el aviso dice dónde quedó la prenda", () => {
    expect(AVISO_AL_PROBAR.vestido).toBe("Ocupa arriba y abajo en tu probador.");
  });
});
