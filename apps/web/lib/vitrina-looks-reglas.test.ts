import { describe, expect, it } from "vitest";
import { sePuedeConfirmar } from "./guia-campos";
import { camposDeLook, camposDeMostrarLook } from "./vitrina-looks-guia";
import {
  categoriasParaLook,
  avisoDelLook,
  chipsDeLook,
  cifrasLooks,
  colorInicial,
  errorDeLook,
  estadoDeLook,
  filtrarLooks,
  fraseLimpia,
  leerLooks,
  hayModeloEnTienda,
  hayPrendaEnTienda,
  leerPorTienda,
  leerPrendasPorTienda,
  lookDeJson,
  lookSinCambios,
  loQueImpideMostrar,
  lugarParaGuardar,
  nombreCortoDeTienda,
  MAX_NOMBRE_LOOK,
  modelosParaElegir,
  nombreLimpio,
  opcionesDeLugar,
  piezasElegidasDe,
  piezasParaGuardar,
  porQueNoSeVe,
  prendasQueNoSeVen,
  resumenLook,
  salidaDelLook,
  solesLook,
  type Look,
  type ModeloParaLook,
} from "./vitrina-looks-reglas";

// Un look tal como lo devuelve `retail.fn_vitrina_looks()` (20261015031000).
const pieza = (posicion: number, nombre: string, codigo: string, seVe = true) => ({
  posicion,
  producto_id: `p-${nombre}`,
  nombre,
  categoria: "Camisas y Blusas",
  prefijo: "CMS",
  familia: "indumentaria",
  color: { codigo, nombre: codigo === "NEG" ? "Negro" : "Beige", hex: "#2D2C2F" },
  foto: null,
  se_ve: seVe,
});
const JSON_LOOK = {
  id: "l1",
  nombre: "Fin de semana en la ciudad",
  frase: "Denim liviano y un básico blanco",
  publicado: true,
  lugar: 2,
  version: 3,
  piezas_del_look: 3,
  faltan: 0,
  se_ve: true,
  total: 304.7,
  desde: false,
  actualizado_en: "2026-10-15T01:00:00Z",
  actualizado_por: "Felipe Pereyra",
  piezas: [pieza(3, "Vestido Sofía", "NEG"), pieza(1, "Blusa Emma", "BEI"), pieza(2, "Falda Renata", "NEG")],
};
const look = lookDeJson(JSON_LOOK)!;
const conCambios = (c: Partial<Look>): Look => ({ ...look, ...c });

const MODELOS: ModeloParaLook[] = [
  {
    id: "p-Blusa Emma",
    nombre: "Blusa Emma",
    categoria: "Camisas y Blusas",
    prefijo: "CMS",
    familia: "indumentaria",
    foto: null,
    colores: [
      { codigo: "BEI", nombre: "Beige", hex: "#D5BA98", foto: null },
      { codigo: "NEG", nombre: "Negro", hex: "#2D2C2F", foto: "https://x/neg.jpg" },
    ],
  },
  { id: "p-Falda Renata", nombre: "Falda Renata", categoria: "Faldas", prefijo: "FAL", familia: "indumentaria", foto: null, colores: [{ codigo: "NEG", nombre: "Negro", hex: null, foto: null }] },
];

describe("leer lo que devuelve la base", () => {
  it("lee un look completo, con sus prendas en su orden", () => {
    expect(look).toMatchObject({ id: "l1", lugar: 2, version: 3, piezasDelLook: 3, seVe: true, total: 304.7, actualizadoPor: "Felipe Pereyra" });
    expect(look.piezas.map((p) => `${p.posicion}:${p.nombre}`)).toEqual(["1:Blusa Emma", "2:Falda Renata", "3:Vestido Sofía"]);
  });

  it("los números que Postgres manda como texto también se leen", () => {
    expect(lookDeJson({ ...JSON_LOOK, version: "3", lugar: "2", total: "304.70" })).toMatchObject({ version: 3, lugar: 2, total: 304.7 });
  });

  it("un dato raro no tumba la pantalla: se descarta o queda vacío", () => {
    expect(lookDeJson(null)).toBeNull();
    expect(lookDeJson({ id: "x", nombre: "Sin versión" })).toBeNull();
    expect(lookDeJson({ ...JSON_LOOK, piezas: [{ nombre: "sin id" }, pieza(1, "Blusa Emma", "BEI")] })?.piezas).toHaveLength(1);
    expect(leerLooks("no")).toEqual({ looks: [], modelos: [] });
    expect(leerLooks({ looks: [JSON_LOOK, { id: "roto" }], modelos: [{ id: "m", nombre: "Sin colores", colores: [] }] })).toMatchObject({ looks: [{ id: "l1" }], modelos: [] });
  });

  it("los looks llegan ordenados por su lugar", () => {
    const leida = leerLooks({ looks: [{ ...JSON_LOOK, id: "b", lugar: 2 }, { ...JSON_LOOK, id: "a", lugar: 1 }], modelos: [] });
    expect(leida.looks.map((l) => l.id)).toEqual(["a", "b"]);
  });
});

describe("lo que dice cada fila", () => {
  it("«3 prendas · S/ 304.70», con «desde» si una campaña no toca todas las tallas, y sin total si una prenda no se ve", () => {
    expect(resumenLook(look)).toBe("3 prendas · S/ 304.70");
    expect(resumenLook(conCambios({ desde: true }))).toBe("3 prendas · desde S/ 304.70");
    expect(resumenLook(conCambios({ total: null }))).toBe("3 prendas");
    expect(solesLook(1250)).toBe("S/ 1,250.00");
  });

  it("por qué un look encendido no se ve: primero lo eliminado, después lo que ya no se ve", () => {
    expect(porQueNoSeVe(look)).toBeNull();
    const oculta = conCambios({ seVe: false, piezas: look.piezas.map((p) => (p.posicion === 2 ? { ...p, seVe: false } : p)) });
    expect(porQueNoSeVe(oculta)).toBe("Falda Renata ya no se ve en la web. Muéstralo en Modelos o cámbialo en el look.");
    const dos = conCambios({ seVe: false, piezas: look.piezas.map((p) => ({ ...p, seVe: p.posicion === 1 })) });
    expect(porQueNoSeVe(dos)).toBe("Falda Renata y Vestido Sofía ya no se ven en la web. Muéstralo en Modelos o cámbialo en el look.");
    expect(porQueNoSeVe(conCambios({ seVe: false, faltan: 1 }))).toMatch(/^Le falta una prenda: se eliminó del catálogo/);
    // Oculto: lo dice su interruptor, no hace falta explicarlo… pero mostrarlo sí lo impide.
    expect(porQueNoSeVe(conCambios({ publicado: false, seVe: false, faltan: 1 }))).toBeNull();
    expect(loQueImpideMostrar(conCambios({ publicado: false, seVe: false, faltan: 1 }))).toMatch(/^Le falta una prenda/);
    expect(loQueImpideMostrar(look)).toBeNull();
  });

  it("el estado de la insignia, las cifras y el filtro", () => {
    const oculto = conCambios({ id: "o", publicado: false, seVe: false });
    const roto = conCambios({ id: "r", seVe: false, faltan: 1 });
    expect([estadoDeLook(look), estadoDeLook(oculto), estadoDeLook(roto)]).toEqual(["se_ve", "oculto", "no_se_ve"]);
    expect(cifrasLooks([look, oculto, roto])).toEqual({ seVen: 1, total: 3, noSeVen: 1 });
    expect(filtrarLooks([look, oculto, roto], "en_la_web").map((l) => l.id)).toEqual(["l1"]);
    expect(filtrarLooks([look, oculto, roto], "no_se_ven").map((l) => l.id)).toEqual(["r"]);
    expect(filtrarLooks([look, oculto, roto], "todos")).toHaveLength(3);
  });
});

describe("la hoja de un look", () => {
  it("un modelo entra con su primer color con foto propia; si ninguno tiene, con el primero", () => {
    expect(colorInicial(MODELOS[0])).toBe("NEG");
    expect(colorInicial(MODELOS[1])).toBe("NEG");
  });

  it("las prendas que no se ven: un modelo que ya no está en la web o un color que ya no muestra", () => {
    const nombres = new Map([["p-Vestido Sofía", "Vestido Sofía"]]);
    expect(
      prendasQueNoSeVen(
        [
          { productoId: "p-Blusa Emma", color: "BEI" },
          { productoId: "p-Falda Renata", color: "BEI" },
          { productoId: "p-Vestido Sofía", color: "NEG" },
        ],
        MODELOS,
        nombres,
      ),
    ).toEqual(["Falda Renata", "Vestido Sofía"]);
  });

  it("los lugares: del primero al último, con el look incluido", () => {
    expect(opcionesDeLugar(1)).toEqual([{ valor: "1", texto: "1.º" }]);
    expect(opcionesDeLugar(3).map((o) => o.texto)).toEqual(["1.º (el primero)", "2.º", "3.º (el último)"]);
    // Solo se manda si la persona lo cambió: una hoja abierta hace rato no devuelve el look a un lugar viejo.
    expect(lugarParaGuardar(2, 2)).toBeNull();
    expect(lugarParaGuardar(1, 2)).toBe(1);
  });

  it("lo que se manda: nombre y frase limpios, y las prendas en su orden", () => {
    expect(nombreLimpio("  Café   con amigas ")).toBe("Café con amigas");
    expect(fraseLimpia("   ")).toBeNull();
    expect(piezasParaGuardar(piezasElegidasDe(look))).toEqual([
      { producto_id: "p-Blusa Emma", color: "BEI" },
      { producto_id: "p-Falda Renata", color: "NEG" },
      { producto_id: "p-Vestido Sofía", color: "NEG" },
    ]);
  });

  it("sin cambios: lo guardado tal cual (un espacio de más no cuenta); un color, el orden o el lugar sí", () => {
    const tal = { nombre: `${look.nombre} `, frase: look.frase ?? "", publicado: true, piezas: piezasElegidasDe(look), lugar: 2 };
    expect(lookSinCambios(look, tal)).toBe(true);
    expect(lookSinCambios(null, tal)).toBe(false);
    expect(lookSinCambios(look, { ...tal, lugar: 1 })).toBe(false);
    expect(lookSinCambios(look, { ...tal, piezas: [...tal.piezas].reverse() })).toBe(false);
    expect(lookSinCambios(look, { ...tal, piezas: tal.piezas.map((p, i) => (i === 0 ? { ...p, color: "NEG" } : p)) })).toBe(false);
  });
});

describe("la guía de foco pide lo MISMO que la base (vitrina_guardar_look / vitrina_mostrar_look)", () => {
  const listo = { responsableListo: true, responsableMotivo: null };
  const base = { nombre: "Café con amigas", frase: "", prendas: 2, publicado: true, noSeVen: [] as string[], ...listo };

  it("con nombre, 2 a 4 prendas que se ven y quién lo hace, se puede guardar; la frase es opcional", () => {
    expect(sePuedeConfirmar(camposDeLook(base))).toBe(true);
    expect(sePuedeConfirmar(camposDeLook({ ...base, prendas: 4 }))).toBe(true);
    expect(camposDeLook(base).find((c) => c.id === "frase")?.requerido).toBe(false);
  });

  it("sin nombre, con un nombre de más de 60 letras, con menos de 2 o más de 4 prendas, o sin quién: no", () => {
    for (const malo of [
      { nombre: "   " },
      { nombre: "Z".repeat(MAX_NOMBRE_LOOK + 1) },
      { prendas: 0 },
      { prendas: 1 },
      { prendas: 5 },
      { responsableListo: false, responsableMotivo: "Nadie marcó entrada." },
    ]) {
      expect(sePuedeConfirmar(camposDeLook({ ...base, ...malo })), JSON.stringify(malo)).toBe(false);
    }
  });

  it("una prenda que no se ve en la web impide MOSTRARLO, no guardarlo oculto", () => {
    expect(sePuedeConfirmar(camposDeLook({ ...base, noSeVen: ["Falda Renata"] }))).toBe(false);
    expect(camposDeLook({ ...base, noSeVen: ["Falda Renata"] }).find((c) => c.id === "mostrar")?.pendiente).toBe(
      "Falda Renata no se ve en la web: cámbiala o deja el look oculto.",
    );
    expect(sePuedeConfirmar(camposDeLook({ ...base, publicado: false, noSeVen: ["Falda Renata"] }))).toBe(true);
  });

  it("mostrar u ocultar: solo quién lo hace", () => {
    expect(camposDeMostrarLook(listo).map((c) => c.id)).toEqual(["responsable"]);
    expect(sePuedeConfirmar(camposDeMostrarLook({ responsableListo: false, responsableMotivo: null }))).toBe(false);
  });
});

describe("lo que dice la base, en palabras de tienda", () => {
  it("cada rechazo con su título, y los que piden releer", () => {
    expect(errorDeLook("vitrina_web_sin_modulo")?.titulo).toBe("Tu rol no tiene la Vitrina web");
    expect(errorDeLook("vitrina_look_cambio_otro Este look cambió mientras lo tenías abierto.")).toEqual({
      titulo: "Otra persona cambió este look",
      detalle: "Este look cambió mientras lo tenías abierto.",
      releer: true,
    });
    expect(errorDeLook("vitrina_look_nombre_repetido Ya hay un look que se llama «X».")?.releer).toBeUndefined();
    expect(errorDeLook("vitrina_look_prenda_no_se_ve Para mostrar el look, «Falda» tiene que verse.")?.titulo).toBe("Una prenda no se ve en la web");
    expect(errorDeLook("vitrina_look_incompleto")?.releer).toBe(true);
    expect(errorDeLook("vitrina_look_prenda_invalida")?.titulo).toBe("Una prenda ya no se puede usar");
    expect(errorDeLook("vitrina_look_datos_invalidos Un look lleva de 2 a 4 prendas.")?.detalle).toBe("Un look lleva de 2 a 4 prendas.");
    expect(errorDeLook("otra cosa")).toBeNull();
  });
});

describe("elegir las prendas mirándolas: categorías y filtro del selector", () => {
  const de = (id: string, nombre: string, categoria: string | null): ModeloParaLook => ({
    id,
    nombre,
    categoria,
    prefijo: null,
    familia: null,
    foto: null,
    colores: [{ codigo: "NEG", nombre: "Negro", hex: "#000000", foto: null }],
  });
  const todos = [de("1", "Blusa Emma", "Camisas y Blusas"), de("2", "Casaca Luciana", "Casacas"), de("3", "Blusa Alba", "Camisas y Blusas"), de("4", "Pulsera Sol", null), de("5", "Blazer Liz", "Casacas")];

  it("las categorías salen por nombre, con cuántos hay en cada una, y «Sin categoría» al final", () => {
    expect(categoriasParaLook(todos)).toEqual([
      { nombre: "Camisas y Blusas", modelos: 2 },
      { nombre: "Casacas", modelos: 2 },
      { nombre: "Sin categoría", modelos: 1 },
    ]);
    expect(categoriasParaLook([])).toEqual([]);
  });

  it("sin filtro salen todos, en su orden", () => {
    expect(modelosParaElegir(todos, { categoria: null, texto: "" }).map((m) => m.id)).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("por categoría salen solo los suyos; «Sin categoría» trae los que no tienen", () => {
    expect(modelosParaElegir(todos, { categoria: "Casacas", texto: "" }).map((m) => m.id)).toEqual(["2", "5"]);
    expect(modelosParaElegir(todos, { categoria: "Sin categoría", texto: "" }).map((m) => m.id)).toEqual(["4"]);
  });

  it("lo escrito busca en el nombre y en la categoría, sin tildes ni mayúsculas, y se suma a la categoría", () => {
    expect(modelosParaElegir(todos, { categoria: null, texto: "BLUSA" }).map((m) => m.id)).toEqual(["1", "3"]);
    expect(modelosParaElegir(todos, { categoria: null, texto: "casacas" }).map((m) => m.id)).toEqual(["2", "5"]);
    expect(modelosParaElegir(todos, { categoria: "Casacas", texto: "liz" }).map((m) => m.id)).toEqual(["5"]);
    expect(modelosParaElegir(todos, { categoria: "Casacas", texto: "emma" })).toEqual([]);
  });
});

// ---- En qué tiendas sale cada look (fn_vitrina_looks_por_tienda, 20261027204000) ----
describe("looks por tienda", () => {
  const CARTERA = "11111111-1111-4111-8111-111111111111";
  const BLUSA = "22222222-2222-4222-8222-222222222222";
  const dePrueba = {
    looks: [
      {
        id: "look-1",
        nombre: "Una idea para hoy",
        por_tienda: [
          { sede: "s-aqp", tienda: "Tienda AQP", completo: false, faltan: 1, piezas: [{ producto_id: BLUSA, color: "MOK", hay: true, motivo: null }, { producto_id: CARTERA, color: "NEG", hay: false, motivo: "no_ofrecida" }] },
          { sede: "s-tru", tienda: "Tienda TRU", completo: true, faltan: 0, piezas: [{ producto_id: BLUSA, color: "MOK", hay: true, motivo: null }, { producto_id: CARTERA, color: "NEG", hay: true, motivo: null }] },
        ],
      },
    ],
  };
  const look = { piezas: [
    { productoId: BLUSA, nombre: "Blusa Alba", color: { codigo: "MOK", nombre: "Mokka", hex: null } },
    { productoId: CARTERA, nombre: "Cartera Manuela", color: { codigo: "NEG", nombre: "Negro", hex: null } },
  ] } as unknown as Pick<Look, "piezas">;

  it("lee lo que devuelve la base y vuelve a sacar «completo» y «faltan» de las prendas", () => {
    const l = leerPorTienda(dePrueba)["look-1"];
    expect(l.map((t) => [t.tienda, t.completo, t.faltan])).toEqual([["Tienda AQP", false, 1], ["Tienda TRU", true, 0]]);
    // Si la base dijera «completo» con una prenda que falta, manda la prenda.
    const raro = leerPorTienda({ looks: [{ id: "x", por_tienda: [{ sede: "s", tienda: "Tienda X", completo: true, faltan: 0, piezas: [{ producto_id: BLUSA, color: "MOK", hay: false, motivo: "sin_stock" }] }] }] });
    expect(raro.x[0]).toMatchObject({ completo: false, faltan: 1 });
  });

  it("un dato raro no tumba la pantalla: queda sin tiendas", () => {
    for (const v of [null, undefined, 3, "x", [], {}, { looks: "no" }, { looks: [null, 5, { id: 3 }, { id: "a", por_tienda: "no" }] }]) expect(() => leerPorTienda(v)).not.toThrow();
    expect(leerPorTienda({ looks: [{ id: "a", por_tienda: "no" }] })).toEqual({ a: [] });
    expect(leerPorTienda(null)).toEqual({});
  });

  it("una prenda sin tienda completa no es «completo»: sin prendas no se dice que sale", () => {
    expect(leerPorTienda({ looks: [{ id: "a", por_tienda: [{ sede: "s", tienda: "Tienda X", piezas: [] }] }] }).a[0].completo).toBe(false);
  });

  it("un motivo desconocido se dice como «sin stock» y una prenda que hay no lleva motivo", () => {
    const l = leerPorTienda({ looks: [{ id: "a", por_tienda: [{ sede: "s", tienda: "T", piezas: [{ producto_id: BLUSA, color: "MOK", hay: false, motivo: "raro" }, { producto_id: CARTERA, color: "NEG", hay: true, motivo: "no_se_ve" }] }] }] }).a[0];
    expect(l.piezas.map((p) => p.motivo)).toEqual(["sin_stock", null]);
  });

  it("el nombre corto de la tienda cabe en un chip", () => {
    expect(nombreCortoDeTienda("Tienda AQP")).toBe("AQP");
    expect(nombreCortoDeTienda("  tienda   Trujillo ")).toBe("Trujillo");
    expect(nombreCortoDeTienda("Tienda")).toBe("Tienda");
    expect(nombreCortoDeTienda("Boutique Centro")).toBe("Boutique Centro");
  });

  it("los chips: verde donde sale, ámbar con cuántas faltan y, al pasar el mouse, cuáles y por qué", () => {
    const chips = chipsDeLook(look, leerPorTienda(dePrueba)["look-1"]);
    expect(chips.map((c) => [c.texto, c.tono, c.completo])).toEqual([["AQP · falta 1", "ambar", false], ["TRU", "verde", true]]);
    expect(chips[0].detalle).toBe("No sale en AQP. Falta: Cartera Manuela (hay stock, pero de una talla que la web no ofrece).");
    expect(chips[1].detalle).toBe("El look sale en TRU: todas sus prendas están ahí.");
  });

  it("una prenda que el look ya no tiene se dice sin nombre, no se cae", () => {
    const chips = chipsDeLook({ piezas: [] } as unknown as Pick<Look, "piezas">, leerPorTienda(dePrueba)["look-1"]);
    expect(chips[0].detalle).toContain("Una prenda");
  });
});

// ---- Qué hay en cada tienda, para armar un look (fn_vitrina_prendas_por_tienda, 20261027204000) ----
describe("armar un look: qué hay en cada tienda", () => {
  const BLUSA = "b1";
  const CARTERA = "c1";
  const FALDA = "f1";
  const datos = leerPrendasPorTienda({
    tiendas: [{ id: "s-aqp", nombre: "Tienda AQP" }, { id: "s-tru", nombre: "Tienda TRU" }],
    prendas: [
      { producto_id: BLUSA, color: "MOK", en: ["s-aqp", "s-tru"] },
      { producto_id: CARTERA, color: "NEG", en: ["s-aqp"] },
      { producto_id: FALDA, color: "BEI", en: ["s-tru"] },
    ],
  });
  const piezas = (...p: [string, string][]) => p.map(([productoId, color]) => ({ productoId, color }));
  const nombres: Record<string, string> = { [BLUSA]: "Blusa Alba", [CARTERA]: "Cartera Manuela", [FALDA]: "Falda Renata" };
  const nombreDe = (p: { productoId: string }) => nombres[p.productoId] ?? "Una prenda";

  it("lee lo que devuelve la base, y un dato raro lo deja vacío sin caerse", () => {
    expect(datos.tiendas.map((t) => t.nombre)).toEqual(["Tienda AQP", "Tienda TRU"]);
    expect(hayPrendaEnTienda(datos, CARTERA, "NEG", "s-aqp")).toBe(true);
    expect(hayPrendaEnTienda(datos, CARTERA, "NEG", "s-tru")).toBe(false);
    // Es por color: la blusa en otro color no está.
    expect(hayPrendaEnTienda(datos, BLUSA, "NEG", "s-aqp")).toBe(false);
    for (const v of [null, undefined, 3, "x", [], {}, { tiendas: "no", prendas: 5 }, { tiendas: [null, { id: 3 }], prendas: [null, { producto_id: "a" }, { producto_id: "a", color: "X", en: "no" }] }])
      expect(() => leerPrendasPorTienda(v)).not.toThrow();
    expect(leerPrendasPorTienda({ tiendas: [null], prendas: [{ producto_id: "a" }] })).toEqual({ tiendas: [], en: {} });
  });

  it("filtrar por tienda: un modelo cuenta si hay en algún color", () => {
    const m = { id: BLUSA, colores: [{ codigo: "NEG" }, { codigo: "MOK" }] } as unknown as ModeloParaLook;
    expect(hayModeloEnTienda(datos, m, "s-tru")).toBe(true);
    expect(hayModeloEnTienda(datos, { id: CARTERA, colores: [{ codigo: "NEG" }] } as unknown as ModeloParaLook, "s-tru")).toBe(false);
  });

  it("la salida del look: en qué tiendas sale y qué le falta a las otras", () => {
    const s = salidaDelLook(datos, piezas([BLUSA, "MOK"], [CARTERA, "NEG"]));
    expect(s.map((t) => [t.nombre, t.completo, t.faltan.length])).toEqual([["AQP", true, 0], ["TRU", false, 1]]);
    expect(s[1].faltan[0].productoId).toBe(CARTERA);
  });

  it("sin prendas elegidas o sin tiendas leídas, no se dice nada", () => {
    expect(salidaDelLook(datos, []).every((t) => !t.completo)).toBe(true);
    expect(salidaDelLook(leerPrendasPorTienda(null), piezas([BLUSA, "MOK"]))).toEqual([]);
    expect(avisoDelLook([], piezas([BLUSA, "MOK"], [CARTERA, "NEG"]), nombreDe)).toBeNull();
  });

  it("con una sola prenda no hay look: no se avisa todavía", () => {
    const p = piezas([BLUSA, "MOK"]);
    expect(avisoDelLook(salidaDelLook(datos, p), p, nombreDe)).toBeNull();
  });

  it("verde donde sale, y dice qué le falta a las demás", () => {
    const p = piezas([BLUSA, "MOK"], [CARTERA, "NEG"]);
    const a = avisoDelLook(salidaDelLook(datos, p), p, nombreDe);
    expect(a).toEqual({ tono: "exito", titulo: "Con estas prendas el look sale en AQP.", detalle: "No sale en TRU: falta Cartera Manuela." });
  });

  it("verde sin detalle si sale en todas", () => {
    const p = piezas([BLUSA, "MOK"], [BLUSA, "MOK"]);
    const a = avisoDelLook(salidaDelLook(datos, p), p, nombreDe);
    expect(a).toEqual({ tono: "exito", titulo: "Con estas prendas el look sale en AQP y TRU.", detalle: null });
  });

  it("ámbar si no saldría en ninguna, y qué le falta a cada tienda (prendas repartidas entre tiendas)", () => {
    const p = piezas([CARTERA, "NEG"], [FALDA, "BEI"]);
    const a = avisoDelLook(salidaDelLook(datos, p), p, nombreDe);
    expect(a).toEqual({ tono: "atencion", titulo: "Con estas prendas el look no saldría en ninguna tienda.", detalle: "AQP: falta Falda Renata; TRU: falta Cartera Manuela." });
  });

  it("una prenda que no hay en ninguna tienda hace que no salga en ninguna", () => {
    const p = piezas([BLUSA, "MOK"], [FALDA, "NEG"]);
    const a = avisoDelLook(salidaDelLook(datos, p), p, nombreDe);
    expect(a?.tono).toBe("atencion");
    expect(a?.detalle).toBe("AQP: falta Falda Renata; TRU: falta Falda Renata.");
  });
});
