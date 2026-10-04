import { describe, it, expect } from "vitest";
import {
  armarEtiquetas,
  campanaSaleEnLaFila,
  cantidadDeTexto,
  encabezadoDeEtiquetas,
  etiquetasDelAlta,
  expandir,
  fechaDeAlcance,
  fechaEtiqueta,
  fechaVigencia,
  iconosDelPapel,
  iconosPorVariante,
  mejorCampanaPorVariante,
  idsDeParam,
  precioEtiqueta,
  sumarEntradas,
  tallasDelModelo,
  unidadesDeParam,
  urlEtiquetasDePrecio,
  volverDeEtiquetas,
  type EtiquetaDeLaPrenda,
  type HermanaEtiqueta,
  type VarianteEtiqueta,
} from "./etiqueta-precio-reglas";

const blusa = (id: string, talla: string | null, extra: Partial<VarianteEtiqueta> = {}): VarianteEtiqueta => ({
  id,
  productoId: "blusa",
  prenda: "Blusa Lino Manga Globo",
  codigo: `BLU-0042-AZM-${talla ?? "X"}`,
  sku: null,
  precio: 89.9,
  colorCodigo: "AZM",
  color: "Azul marino",
  talla,
  ...extra,
});
const hermana = (talla: string | null, colorCodigo: string | null = "AZM", activo = true): HermanaEtiqueta => ({ productoId: "blusa", colorCodigo, talla, activo });

describe("sumarEntradas", () => {
  it("junta las entradas de la misma prenda (un envío puede traerla de dos proveedores)", () => {
    const s = sumarEntradas([
      { variante_id: "a", cantidad: 3 },
      { variante_id: "b", cantidad: 1 },
      { variante_id: "a", cantidad: 2 },
    ]);
    expect(Object.fromEntries(s)).toEqual({ a: 5, b: 1 });
  });
});

describe("tallasDelModelo", () => {
  it("las del mismo modelo y color, ordenadas como en tienda (XS antes que S)", () => {
    const run = tallasDelModelo(blusa("m", "M"), [hermana("XL"), hermana("S"), hermana("M"), hermana("XS"), hermana("L")]);
    expect(run).toEqual(["XS", "S", "M", "L", "XL"]);
  });

  it("no mezcla las tallas de otro color ni las apagadas, pero siempre incluye la propia", () => {
    const run = tallasDelModelo(blusa("m", "M"), [hermana("S", "NEG"), hermana("L", "AZM", false), hermana("XL")]);
    expect(run).toEqual(["M", "XL"]);
  });

  it("las numéricas van por valor", () => {
    const run = tallasDelModelo(blusa("p", "30"), [hermana("34"), hermana("26"), hermana("30"), hermana("28")]);
    expect(run).toEqual(["26", "28", "30", "34"]);
  });

  it("sin talla no hay fila", () => {
    expect(tallasDelModelo(blusa("x", null), [hermana(null)])).toEqual([]);
  });
});

describe("armarEtiquetas · la marca de la prenda (Felipe, 2026-09-29)", () => {
  it("lleva la marca de la variante a la etiqueta, sin espacios de más", () => {
    const { etiquetas } = armarEtiquetas(new Map([["m", 1]]), [blusa("m", "M", { marca: "  La Femme 21 " })], [hermana("M")]);
    expect(etiquetas[0].marca).toBe("La Femme 21");
  });
  it("sin marca (dato viejo, prueba) la etiqueta sale como antes: marca en null, sin romper nada", () => {
    const { etiquetas } = armarEtiquetas(new Map([["m", 1], ["s", 1]]), [blusa("m", "M"), blusa("s", "S", { marca: "   " })], [hermana("M"), hermana("S")]);
    expect(etiquetas.map((e) => e.marca)).toEqual([null, null]);
  });
  it("la marca no cambia lo demás: el mismo código, el mismo precio y las mismas tallas con y sin ella", () => {
    const con = armarEtiquetas(new Map([["m", 2]]), [blusa("m", "M", { marca: "CAYLA" })], [hermana("M"), hermana("L")]).etiquetas[0];
    const sin = armarEtiquetas(new Map([["m", 2]]), [blusa("m", "M")], [hermana("M"), hermana("L")]).etiquetas[0];
    expect({ ...con, marca: undefined }).toEqual({ ...sin, marca: undefined });
  });
});

describe("armarEtiquetas · la muestra del color, para la lista (Felipe, 2026-10-03)", () => {
  it("cada fila lleva la muestra de SU color, aunque el modelo sea el mismo", () => {
    const { etiquetas } = armarEtiquetas(
      new Map([["a", 1], ["g", 1]]),
      [
        blusa("a", "U", { colorCodigo: "AZD", color: "Azul denim", colorMuestra: "#4A6C8C" }),
        blusa("g", "U", { colorCodigo: "GRA", color: "Gris antracita", colorMuestra: "#3B3D40" }),
      ],
      [hermana("U", "AZD"), hermana("U", "GRA")],
    );
    expect(etiquetas.map((e) => [e.color, e.colorMuestra])).toEqual([
      ["Azul denim", "#4A6C8C"],
      ["Gris antracita", "#3B3D40"],
    ]);
  });
  it("un color sin hex (Estampado) o una variante armada sin él quedan en null: la cápsula sale de varios tonos", () => {
    const { etiquetas } = armarEtiquetas(new Map([["e", 1], ["v", 1]]), [blusa("e", "M", { color: "Estampado", colorMuestra: null }), blusa("v", "S")], []);
    expect(etiquetas.map((e) => e.colorMuestra)).toEqual([null, null]);
  });
});

describe("armarEtiquetas", () => {
  it("una fila por prenda con lo que entró, ordenada por modelo, color y talla", () => {
    const entradas = new Map([
      ["l", 2],
      ["s", 4],
    ]);
    const { etiquetas, sinCodigo } = armarEtiquetas(entradas, [blusa("l", "L"), blusa("s", "S")], [hermana("S"), hermana("M"), hermana("L")]);
    expect(sinCodigo).toEqual([]);
    expect(etiquetas.map((e) => [e.talla, e.cantidad])).toEqual([
      ["S", 4],
      ["L", 2],
    ]);
    expect(etiquetas[0]).toMatchObject({ codigo: "BLU-0042-AZM-S", prenda: "Blusa Lino Manga Globo", color: "Azul marino", precio: 89.9, tallasDelModelo: ["S", "M", "L"] });
  });

  it("sin código corto usa el SKU viejo (la caja también lo resuelve); sin ninguno, avisa y no la imprime", () => {
    const entradas = new Map([
      ["viejo", 1],
      ["nada", 1],
    ]);
    const { etiquetas, sinCodigo } = armarEtiquetas(
      entradas,
      [blusa("viejo", "M", { codigo: null, sku: "BLUSA-LINO-M-AZUL" }), blusa("nada", "L", { codigo: "  ", sku: null })],
      [],
    );
    expect(etiquetas.map((e) => e.codigo)).toEqual(["BLUSA-LINO-M-AZUL"]);
    expect(sinCodigo).toEqual(["Blusa Lino Manga Globo · Azul marino · L"]);
  });

  it("una entrada cuya prenda no llegó en la lectura no se inventa", () => {
    const { etiquetas } = armarEtiquetas(new Map([["fantasma", 3]]), [], []);
    expect(etiquetas).toEqual([]);
  });
});

describe("expandir", () => {
  it("repite cada etiqueta tantas veces como se pidió, en orden", () => {
    const { etiquetas } = armarEtiquetas(new Map([["s", 2], ["m", 1]]), [blusa("s", "S"), blusa("m", "M")], []);
    const hoja = expandir(etiquetas, { s: 2, m: 0 });
    expect(hoja.map((e) => e.talla)).toEqual(["S", "S"]);
  });

  it("si no se tocó la cantidad, imprime lo que entró", () => {
    const { etiquetas } = armarEtiquetas(new Map([["s", 3]]), [blusa("s", "S")], []);
    expect(expandir(etiquetas, {}).length).toBe(3);
  });
});

describe("cantidadDeTexto", () => {
  it.each([
    ["3", 3],
    ["", 0],
    ["-2", 0],
    ["2.7", 2],
    ["abc", 0],
    ["5000", 999],
  ])("%j → %d", (texto, esperado) => {
    expect(cantidadDeTexto(texto)).toBe(esperado);
  });
});

describe("precioEtiqueta y fechaEtiqueta", () => {
  it("dos decimales con punto, y separador de miles", () => {
    expect(precioEtiqueta(89.9)).toBe("89.90");
    expect(precioEtiqueta(1299.9)).toBe("1,299.90");
    expect(precioEtiqueta(40)).toBe("40.00");
  });

  it("la fecha de impresión va corta: dd.mm.aa", () => {
    expect(fechaEtiqueta("2026-09-23")).toBe("23.09.26");
  });
});

describe("idsDeParam", () => {
  const A = "7f1c1e2a-3b4c-4d5e-8f60-718293a4b5c6";
  const B = "0a1b2c3d-4e5f-4a6b-9c7d-8e9f0a1b2c3d";
  it("acepta uno o varios separados por coma, sin repetir", () => {
    expect(idsDeParam(`${A},${B},${A}`)).toEqual([A, B]);
    expect(idsDeParam([A, B])).toEqual([A, B]);
  });

  it("descarta lo que no es un id (la URL la puede escribir cualquiera)", () => {
    expect(idsDeParam("1; drop table,abc")).toEqual([]);
    expect(idsDeParam(undefined)).toEqual([]);
  });
});

describe("urlEtiquetasDePrecio", () => {
  it("lleva los lotes del ingreso, o la producción del Taller, y la pantalla los lee de vuelta", () => {
    const A = "7f1c1e2a-3b4c-4d5e-8f60-718293a4b5c6";
    const B = "0a1b2c3d-4e5f-4a6b-9c7d-8e9f0a1b2c3d";
    const url = urlEtiquetasDePrecio({ lotes: [A, B] });
    expect(url).toBe(`/etiquetas-de-precio?lotes=${A},${B}`);
    expect(idsDeParam(new URL(url, "http://x").searchParams.get("lotes") ?? "")).toEqual([A, B]);
    expect(urlEtiquetasDePrecio({ produccion: A })).toBe(`/etiquetas-de-precio?produccion=${A}`);
  });

  it("las tallas de varias prendas marcadas en la Tabla de Productos (ADR-0254) van como `variantes`", () => {
    const A = "7f1c1e2a-3b4c-4d5e-8f60-718293a4b5c6";
    const B = "0a1b2c3d-4e5f-4a6b-9c7d-8e9f0a1b2c3d";
    const url = urlEtiquetasDePrecio({ variantes: [A, B] });
    expect(url).toBe(`/etiquetas-de-precio?variantes=${A},${B}`);
    expect(idsDeParam(new URL(url, "http://x").searchParams.get("variantes") ?? "")).toEqual([A, B]);
  });
});

describe("mejorCampanaPorVariante — la misma que elige la caja", () => {
  const fila = (variante_id: string, etiqueta_id: string, etiqueta_nombre: string, descuento_pct: number) => ({ variante_id, etiqueta_id, etiqueta_nombre, descuento_pct });
  it("de varias campañas sobre una prenda, la de mayor % (un solo descuento, el mayor)", () => {
    const m = mejorCampanaPorVariante(
      [fila("a", "e1", "Aniversario CAYLA", 20), fila("a", "e2", "Liquidación", 40), fila("b", "e1", "Aniversario CAYLA", 20)],
      new Map([["e1", "2026-09-30"], ["e2", null]]),
    );
    expect(m.get("a")).toEqual({ etiquetaId: "e2", nombre: "Liquidación", pct: 40, hasta: null });
    expect(m.get("b")).toEqual({ etiquetaId: "e1", nombre: "Aniversario CAYLA", pct: 20, hasta: "2026-09-30" });
  });
  it("el % llega como texto desde la base (numeric) y se lee como número", () => {
    const m = mejorCampanaPorVariante([{ variante_id: "a", etiqueta_id: "e1", etiqueta_nombre: "X", descuento_pct: "15.00" as unknown as number }], new Map());
    expect(m.get("a")?.pct).toBe(15);
  });
});

describe("armarEtiquetas con campaña (ADR-0180 paso 2)", () => {
  const campana = { etiquetaId: "e1", nombre: "Aniversario CAYLA", pct: 20, hasta: "2026-09-30" };
  it("la etiqueta lleva el descuento exacto de la caja: 79.90 con 20 % se cobra 63.92 (ADR-0302)", () => {
    const { etiquetas } = armarEtiquetas(new Map([["s", 1]]), [blusa("s", "S", { precio: 79.9 })], [], new Map([["s", campana]]));
    expect(etiquetas[0].campana).toEqual({ nombre: "Aniversario CAYLA", pct: 20, hasta: "2026-09-30", descuento: 15.98 });
  });
  it("el «−20 %» del papel es verdad: S/ 39.00 se cobra S/ 31.20, no S/ 30.90", () => {
    const { etiquetas } = armarEtiquetas(new Map([["s", 1]]), [blusa("s", "S", { precio: 39 })], [], new Map([["s", campana]]));
    const e = etiquetas[0];
    const enCentimos = (soles: number) => Math.round(soles * 100);
    expect(e.campana?.descuento).toBe(7.8);
    expect(enCentimos(e.precio) - enCentimos(e.campana?.descuento ?? 0)).toBe(3120);
    // descuento ÷ precio = % ÷ 100, en enteros: 780 × 100 = 20 × 3 900
    expect(enCentimos(e.campana?.descuento ?? 0) * 100).toBe(e.campana!.pct * enCentimos(e.precio));
  });
  it("sin campaña vigente la etiqueta sale con el precio de lista", () => {
    const { etiquetas } = armarEtiquetas(new Map([["s", 1]]), [blusa("s", "S")], [], new Map());
    expect(etiquetas[0].campana).toBeNull();
  });
});

describe("iconosDelPapel — los íconos de las etiquetas de la prenda en el papel (Felipe, 2026-09-29)", () => {
  const HOY = "2026-09-29";
  const et = (etiquetaId: string, nombre: string, pct: number | null = null, desde: string | null = null, hasta: string | null = null): EtiquetaDeLaPrenda => ({
    etiquetaId,
    nombre,
    pct,
    desde,
    hasta,
  });
  const familias = (e: readonly EtiquetaDeLaPrenda[], ganadora: string | null = null, max?: number) => iconosDelPapel(e, HOY, ganadora, max).map((i) => i.icono);

  it("una etiqueta sin descuento (Nuevo, Hecho a mano…) también sale: identifica la prenda aunque no toque el precio", () => {
    expect(iconosDelPapel([et("n", "Nuevo")], HOY, null)).toEqual([{ icono: "nuevo", rotulo: "Nuevo", nombre: "Nuevo" }]);
    expect(familias([et("m", "Hecho a mano")])).toEqual(["manual"]);
  });

  it("dos etiquetas con descuento: salen los dos íconos, la ganadora primero (la de mayor %, la que cobra la caja)", () => {
    const liquidar = et("l", "Para liquidar", 20);
    const aniversario = et("a", "Aniversario CAYLA", 10);
    expect(familias([aniversario, liquidar], "l")).toEqual(["liquidar", "aniversario"]);
  });

  it("la ganadora va primero aunque su % no fuera el de arriba en la lista: manda lo que cobra la caja", () => {
    expect(familias([et("b", "Black Friday", 30), et("l", "Para liquidar", 20)], "l")).toEqual(["liquidar", "blackfriday"]);
  });

  it("con más de dos, entran solo dos: primero las de descuento (mayor % antes), luego las que no rebajan", () => {
    const e = [et("n", "Nuevo"), et("a", "Aniversario CAYLA", 10), et("l", "Para liquidar", 20), et("t", "Top ventas")];
    expect(familias(e, "l")).toEqual(["liquidar", "aniversario"]);
    expect(familias([et("n", "Nuevo"), et("t", "Top ventas"), et("m", "Hecho a mano")], null)).toEqual(["manual", "nuevo"]);
  });

  it("una etiqueta que todavía no empieza sale igual (para la colaboradora), pero detrás de las que ya rigen", () => {
    const proxima = et("b", "Black Friday", 30, "2026-11-27", "2026-11-30");
    expect(familias([proxima])).toEqual(["blackfriday"]);
    expect(familias([proxima, et("n", "Nuevo"), et("m", "Hecho a mano")])).toEqual(["manual", "nuevo"]);
    expect(familias([proxima, et("n", "Nuevo")])).toEqual(["nuevo", "blackfriday"]);
  });

  it("varias que no empiezan: la más cercana primero", () => {
    const navidad = et("n", "Navidad", 15, "2026-12-01", "2026-12-25");
    const black = et("b", "Black Friday", 30, "2026-11-27", "2026-11-30");
    expect(familias([navidad, black])).toEqual(["blackfriday", "navidad"]);
  });

  it("una etiqueta que ya terminó no sale", () => {
    expect(familias([et("v", "Cyber lunes", 25, "2026-08-01", "2026-08-31")])).toEqual([]);
    expect(familias([et("v", "Cyber lunes", 25, "2026-08-01", "2026-08-31"), et("n", "Nuevo")])).toEqual(["nuevo"]);
  });

  it("sin fechas la etiqueta rige siempre, y el último día de una campaña todavía cuenta", () => {
    expect(familias([et("n", "Nuevo", null, null, null)])).toEqual(["nuevo"]);
    expect(familias([et("b", "Black Friday", 30, "2026-09-01", HOY)])).toEqual(["blackfriday"]);
  });

  it("dos etiquetas de la misma familia comparten dibujo y ocupan un solo lugar", () => {
    const e = [et("a", "Para liquidar — Tienda AQP", 20), et("b", "Para liquidar — Taller", 15), et("n", "Nuevo")];
    expect(familias(e, "a")).toEqual(["liquidar", "nuevo"]);
  });

  it("un nombre que no se reconoce cae en el ícono genérico, como en la grilla de Atributos", () => {
    expect(iconosDelPapel([et("x", "Vitrina principal")], HOY, null)).toEqual([{ icono: "generico", rotulo: "Vitrina principal", nombre: "Vitrina principal" }]);
  });

  it("sin etiquetas, sin íconos", () => {
    expect(iconosDelPapel([], HOY, null)).toEqual([]);
  });

  it("el tope se puede cambiar, pero por defecto son dos", () => {
    const e = [et("n", "Nuevo"), et("t", "Top ventas"), et("m", "Hecho a mano")];
    expect(familias(e)).toHaveLength(2);
    expect(familias(e, null, 3)).toHaveLength(3);
  });
});

describe("iconosPorVariante — etiquetas a mano y por categoría, con un solo descuento", () => {
  const HOY = "2026-09-29";
  const catalogo = new Map<string, Omit<EtiquetaDeLaPrenda, "etiquetaId">>([
    ["nuevo", { nombre: "Nuevo", pct: null, desde: null, hasta: null }],
    ["liq", { nombre: "Para liquidar", pct: 20, desde: null, hasta: null }],
    ["aniv", { nombre: "Aniversario CAYLA", pct: 10, desde: null, hasta: null }],
  ]);
  const variantes = [
    { id: "camisa", categoriaId: "camisas" },
    { id: "pantalon", categoriaId: "pantalones" },
  ];

  it("junta la etiqueta elegida a mano con la que la alcanza por su categoría", () => {
    const m = iconosPorVariante(variantes, new Map([["camisa", ["nuevo"]]]), new Map([["camisas", ["liq"]]]), catalogo, new Map(), HOY);
    expect(m.get("camisa")?.map((i) => i.icono)).toEqual(["liquidar", "nuevo"]);
    expect(m.get("pantalon")).toEqual([]);
  });

  it("la misma etiqueta por los dos caminos cuenta una vez", () => {
    const m = iconosPorVariante(variantes, new Map([["camisa", ["liq"]]]), new Map([["camisas", ["liq"]]]), catalogo, new Map(), HOY);
    expect(m.get("camisa")).toEqual([{ icono: "liquidar", rotulo: "Liquidar", nombre: "Para liquidar" }]);
  });

  it("una etiqueta que no está en el catálogo (pendiente, rechazada o apagada) no sale", () => {
    const m = iconosPorVariante(variantes, new Map([["camisa", ["pendiente"]]]), new Map(), catalogo, new Map(), HOY);
    expect(m.get("camisa")).toEqual([]);
  });

  it("dos descuentos, dos íconos, UN precio: el papel cobra el mayor y la etiqueta de menor % no lo rebaja", () => {
    // La ganadora sale de `mejorCampanaPorVariante` (la regla de la caja); acá se comprueba de punta a punta.
    const filas = [
      { variante_id: "camisa", etiqueta_id: "aniv", etiqueta_nombre: "Aniversario CAYLA", descuento_pct: 10 },
      { variante_id: "camisa", etiqueta_id: "liq", etiqueta_nombre: "Para liquidar", descuento_pct: 20 },
    ];
    const campanas = mejorCampanaPorVariante(filas, new Map());
    const iconos = iconosPorVariante(variantes, new Map([["camisa", ["aniv", "liq"]]]), new Map(), catalogo, campanas, HOY);
    const { etiquetas } = armarEtiquetas(new Map([["camisa", 1]]), [blusa("camisa", "M", { precio: 89.9 })], [], campanas, iconos);
    expect(etiquetas[0].iconos.map((i) => i.icono)).toEqual(["liquidar", "aniversario"]);
    // 20 %, no 30 % ni 10 %: 89.90 → 71.92, es decir, 17.98 de descuento (exacto, ADR-0302).
    expect(etiquetas[0].campana).toMatchObject({ nombre: "Para liquidar", pct: 20, descuento: 17.98 });
  });
});

describe("iconosDelPapel · la palabra que acompaña al ícono", () => {
  it("cada ícono lleva su palabra corta, no el nombre de la etiqueta: «Día Internacional del Gato» no cabe en 34 mm", () => {
    const iconos = iconosDelPapel(
      [
        { etiquetaId: "g", nombre: "Día Internacional del Gato", pct: null, desde: null, hasta: null },
        { etiquetaId: "u", nombre: "Últimas unidades", pct: null, desde: null, hasta: null },
      ],
      "2026-09-29",
      null,
    );
    expect(iconos.map((i) => i.rotulo)).toEqual(["Día gato", "Últimas"]);
    expect(iconos.map((i) => i.nombre)).toEqual(["Día Internacional del Gato", "Últimas unidades"]);
  });
});

describe("campanaSaleEnLaFila — el bloque de precio no repite lo que la fila ya dice", () => {
  const conCampana = { nombre: "Para liquidar", pct: 20, hasta: null, descuento: 18 };
  const fila = [{ icono: "liquidar" as const, rotulo: "Liquidar", nombre: "Para liquidar" }];
  it("con la campaña entre los íconos, sí", () => {
    expect(campanaSaleEnLaFila({ campana: conCampana, iconos: fila })).toBe(true);
  });
  it("sin íconos (etiqueta armada a mano) o con otros distintos, no: el bloque nombra la campaña como antes", () => {
    expect(campanaSaleEnLaFila({ campana: conCampana, iconos: [] })).toBe(false);
    expect(campanaSaleEnLaFila({ campana: conCampana, iconos: [{ icono: "nuevo", rotulo: "Nuevo", nombre: "Nuevo" }] })).toBe(false);
  });
  it("sin campaña, no hay nada que repetir", () => {
    expect(campanaSaleEnLaFila({ campana: null, iconos: fila })).toBe(false);
  });
});

describe("armarEtiquetas · íconos", () => {
  it("lleva a la etiqueta los íconos de SU prenda; una prenda sin íconos sale con la lista vacía", () => {
    const iconos = new Map([["s", [{ icono: "nuevo" as const, rotulo: "Nuevo", nombre: "Nuevo" }]]]);
    const { etiquetas } = armarEtiquetas(new Map([["s", 1], ["m", 1]]), [blusa("s", "S"), blusa("m", "M")], [], new Map(), iconos);
    expect(etiquetas.find((e) => e.talla === "S")?.iconos).toEqual([{ icono: "nuevo", rotulo: "Nuevo", nombre: "Nuevo" }]);
    expect(etiquetas.find((e) => e.talla === "M")?.iconos).toEqual([]);
  });
  it("los íconos no cambian lo demás: el mismo código, el mismo precio y la misma campaña con y sin ellos", () => {
    const campana = new Map([["s", { etiquetaId: "e1", nombre: "Aniversario CAYLA", pct: 20, hasta: null }]]);
    const con = armarEtiquetas(new Map([["s", 1]]), [blusa("s", "S")], [], campana, new Map([["s", [{ icono: "aniversario" as const, rotulo: "Aniversario", nombre: "Aniversario CAYLA" }]]])).etiquetas[0];
    const sin = armarEtiquetas(new Map([["s", 1]]), [blusa("s", "S")], [], campana).etiquetas[0];
    expect({ ...con, iconos: [] }).toEqual(sin);
  });
});

describe("fechaDeAlcance — qué día mirar para saber qué prendas alcanza una campaña", () => {
  const HOY = "2026-09-23";
  it("vigente o sin fechas: hoy", () => {
    expect(fechaDeAlcance("2026-09-01", "2026-09-30", HOY)).toBe(HOY);
    expect(fechaDeAlcance(null, null, HOY)).toBe(HOY);
  });
  it("terminada: su último día (para volver al precio normal lo que alcanzó)", () => {
    expect(fechaDeAlcance("2026-08-12", "2026-08-26", HOY)).toBe("2026-08-26");
  });
  it("próxima: su primer día", () => {
    expect(fechaDeAlcance("2026-10-01", "2026-10-10", HOY)).toBe("2026-10-01");
  });
});

describe("fechaVigencia", () => {
  it("«válido hasta el 30.09»", () => {
    expect(fechaVigencia("2026-09-30")).toBe("30.09");
  });
});

describe("urlEtiquetasDePrecio — desde una campaña o un producto", () => {
  const A = "7f1c1e2a-3b4c-4d5e-8f60-718293a4b5c6";
  it("arma el enlace de cada origen", () => {
    expect(urlEtiquetasDePrecio({ campana: A })).toBe(`/etiquetas-de-precio?campana=${A}`);
    expect(urlEtiquetasDePrecio({ producto: A })).toBe(`/etiquetas-de-precio?producto=${A}`);
  });
});

describe("encabezadoDeEtiquetas — lo que dice la pantalla según el origen", () => {
  const n = { unidades: 24, modelos: 3 };
  it("un ingreso cuenta lo que entró", () => {
    const e = encabezadoDeEtiquetas({ tipo: "lotes" }, n, "Tienda Lima");
    expect(e.bajada).toContain("Entraron 24 prendas de 3 modelos");
    expect(e.columnaCantidad).toBe("Entraron");
  });
  it("una campaña vigente dice su % y que sale con el precio rebajado", () => {
    const e = encabezadoDeEtiquetas({ tipo: "campana", campana: { nombre: "Aniversario CAYLA", pct: 20, vigencia: { estado: "vigente", hasta: "2026-09-30" } } }, n, "Tienda Lima");
    expect(e.sobretitulo).toBe("Campaña · Aniversario CAYLA");
    expect(e.bajada).toContain("En Tienda Lima hay 24 prendas de 3 modelos con la campaña (−20 %)");
  });
  it("una campaña terminada no es un error: es volver al precio normal", () => {
    const e = encabezadoDeEtiquetas({ tipo: "campana", campana: { nombre: "Día del Perro", pct: 15, vigencia: { estado: "terminada", hasta: "2026-08-26" } } }, n, "Tienda Lima");
    expect(e.titulo).toBe("Volver al precio normal");
    expect(e.bajada).toContain("terminó el 26 ago");
  });
  it("una campaña que no empieza no imprime: la etiqueta diría el precio de hoy", () => {
    const e = encabezadoDeEtiquetas({ tipo: "campana", campana: { nombre: "Navidad", pct: 30, vigencia: { estado: "proxima", desde: "2026-12-01", enDias: 69 } } }, n, "Tienda Lima");
    expect(e.vacio).toContain("Empieza el 1 dic");
  });
  it("una etiqueta sin descuento no es una campaña", () => {
    expect(encabezadoDeEtiquetas({ tipo: "campana", campana: null }, n, "Tienda Lima").vacio).toContain("no tiene descuento");
  });
  it("tallas marcadas en Existencias: dice cuántas hay entre las marcadas", () => {
    const e = encabezadoDeEtiquetas({ tipo: "variantes" }, { unidades: 5, modelos: 2 }, "Tienda Trujillo");
    expect(e.sobretitulo).toBe("Existencias · Prendas marcadas");
    expect(e.bajada).toContain("5 prendas de 2 modelos");
    expect(e.vacio).toContain("Tienda Trujillo");
  });
  it("una sola talla impresa desde Productos no habla de «marcadas»", () => {
    const e = encabezadoDeEtiquetas({ tipo: "variantes", desdeProductos: true, tallas: 1 }, { unidades: 6, modelos: 1 }, "Tienda Lima");
    expect(e.sobretitulo).toBe("Productos · Una talla");
    expect(e.bajada).toContain("En Tienda Lima hay 6 prendas de esta talla y color");
    expect(e.bajada).not.toContain("marcaste");
    expect(e.vacio).toBe("En Tienda Lima no hay unidades de esta talla y color.");
  });
  it("varias prendas marcadas en la Tabla de Productos: marcadas, pero en Productos", () => {
    const e = encabezadoDeEtiquetas({ tipo: "variantes", desdeProductos: true, tallas: 8 }, { unidades: 5, modelos: 2 }, "Tienda Lima");
    expect(e.sobretitulo).toBe("Productos · Prendas marcadas");
    expect(e.bajada).toContain("entre las que marcaste");
  });
  it("una sola talla marcada en Existencias sigue siendo «marcada»", () => {
    expect(encabezadoDeEtiquetas({ tipo: "variantes", desdeProductos: false, tallas: 1 }, n, "Tienda Lima").sobretitulo).toBe(
      "Existencias · Prendas marcadas",
    );
  });
  it("un producto habla de lo que hay en la tienda", () => {
    const e = encabezadoDeEtiquetas({ tipo: "producto", nombre: "Blusa Emma" }, { unidades: 1, modelos: 1 }, "Tienda Trujillo");
    expect(e.sobretitulo).toBe("Productos · Blusa Emma");
    expect(e.bajada).toContain("En Tienda Trujillo hay 1 prenda de este modelo");
  });
});

describe("volverDeEtiquetas — la vuelta a la pantalla que abrió las etiquetas", () => {
  it("cada origen vuelve a su pantalla, con el nombre del menú", () => {
    expect(volverDeEtiquetas({ tipo: "lotes" })).toEqual({ href: "/recibir", a: "Recibir mercadería" });
    expect(volverDeEtiquetas({ tipo: "campana" })).toEqual({ href: "/productos/atributos?tipo=etiquetas", a: "Atributos" });
    expect(volverDeEtiquetas({ tipo: "producto" })).toEqual({ href: "/productos", a: "Productos" });
    expect(volverDeEtiquetas({ tipo: "variantes" })).toEqual({ href: "/inventario", a: "Existencias" });
  });
  it("desde una orden cerrada vuelve a ESA orden abierta, no al tablero vacío", () => {
    expect(volverDeEtiquetas({ tipo: "produccion", id: "abc" })).toEqual({ href: "/produccion/ordenes?orden=abc", a: "Órdenes" });
  });
  it("con la URL a secas (sin origen) vuelve a Inicio", () => {
    expect(volverDeEtiquetas(null)).toEqual({ href: "/", a: "Inicio" });
  });
});

describe("Volver a la misma vista de Productos (Tabla o Grilla)", () => {
  const A = "7f1c1e2a-3b4c-4d5e-8f60-718293a4b5c6";
  it("la URL de etiquetas lleva la pantalla de origen y «Volver» regresa a ella, con su vista y filtros", () => {
    const desde = "/productos?vista=tabla&q=polo&pagina=2";
    const url = urlEtiquetasDePrecio({ producto: A }, desde);
    const leido = new URL(url, "http://x").searchParams.get("desde");
    expect(leido).toBe(desde);
    expect(volverDeEtiquetas({ tipo: "producto" }, leido)).toEqual({ href: desde, a: "Productos" });
    expect(volverDeEtiquetas({ tipo: "variantes" }, leido)).toEqual({ href: desde, a: "Productos" });
  });
  it("sin origen, o con uno que no es de Productos, vuelve como siempre", () => {
    expect(urlEtiquetasDePrecio({ producto: A })).toBe(`/etiquetas-de-precio?producto=${A}`);
    expect(urlEtiquetasDePrecio({ producto: A }, "https://malo.com")).toBe(`/etiquetas-de-precio?producto=${A}`);
    expect(volverDeEtiquetas({ tipo: "producto" }, null)).toEqual({ href: "/productos", a: "Productos" });
    expect(volverDeEtiquetas({ tipo: "variantes" }, "/inventario")).toEqual({ href: "/inventario", a: "Existencias" });
  });
});

describe("etiquetasDelAlta — «Imprimir etiquetas» en la pantalla de éxito de Nuevo producto", () => {
  const A = "7f1c1e2a-3b4c-4d5e-8f60-718293a4b5c6";
  it("un producto creado con stock ofrece imprimir una etiqueta por unidad, del propio producto", () => {
    expect(etiquetasDelAlta({ id: A, stock: { unidades: 5 } })).toEqual({ href: `/etiquetas-de-precio?producto=${A}`, unidades: 5 });
    // El enlace es el mismo que arma Productos: la pantalla de etiquetas lo lee con `?producto=`, no con otro camino.
    expect(etiquetasDelAlta({ id: A, stock: { unidades: 1 } })?.href).toBe(urlEtiquetasDePrecio({ producto: A }));
  });
  it("vale igual si el stock quedó en el piso o en el almacén: la etiqueta cuelga de la prenda, esté donde esté la tienda", () => {
    const enPiso = { unidades: 5, donde: "piso de venta de Tienda TRU" };
    const enAlmacen = { unidades: 5, donde: "almacén de Tienda TRU" };
    expect(etiquetasDelAlta({ id: A, stock: enPiso })).toEqual(etiquetasDelAlta({ id: A, stock: enAlmacen }));
    expect(etiquetasDelAlta({ id: A, stock: enPiso })?.unidades).toBe(5);
  });
  it("sin stock no ofrece nada: no hay prenda que etiquetar todavía", () => {
    expect(etiquetasDelAlta({ id: A, stock: null })).toBeNull();
    expect(etiquetasDelAlta({ id: A, stock: { unidades: 0 } })).toBeNull();
    expect(etiquetasDelAlta({ id: A, stock: { unidades: Number.NaN } })).toBeNull();
  });
  it("guardado sin conexión (todavía sin id ni código) no ofrece nada, aunque traiga unidades", () => {
    expect(etiquetasDelAlta({ id: null, stock: { unidades: 5 } })).toBeNull();
  });
});

describe("unidadesDeParam (lo que entró desde Editar producto, ADR-0313)", () => {
  const A = "11111111-1111-4111-8111-111111111111";
  const B = "22222222-2222-4222-8222-222222222222";
  it("lee id:n, suma los repetidos y descarta lo mal formado", () => {
    expect([...unidadesDeParam(`${A}:2,${B}:3,${A}:1`)]).toEqual([[A, 3], [B, 3]]);
    expect([...unidadesDeParam(`${A}:0,${B}:-1,x:4,${A}:1.5,${B}`)]).toEqual([]);
    expect([...unidadesDeParam([`${A}:2`, `${B}:1`])]).toEqual([[A, 2], [B, 1]]);
    expect(unidadesDeParam(undefined).size).toBe(0);
  });
  it("no pasa del tope por prenda", () => {
    expect(unidadesDeParam(`${A}:5000`).get(A)).toBe(999);
  });
});

describe("encabezadoDeEtiquetas: lo que entró desde Editar producto (?unidades=)", () => {
  it("habla de lo que entró y la columna dice «Entraron», no «En tienda»", () => {
    const e = encabezadoDeEtiquetas({ tipo: "variantes", desdeProductos: true, tallas: 2, entraron: true }, { unidades: 4, modelos: 1 }, "Tienda Lima");
    expect(e.sobretitulo).toBe("Productos · Lo que entró");
    expect(e.columnaCantidad).toBe("Entraron");
    expect(e.bajada).toBe("Entraron 4 prendas de 1 modelo al guardar la ficha. Sale una etiqueta por cada prenda nueva.");
  });
});

describe("Etiquetas desde un traslado (?unidades= con ?traslado=, «Lo siguiente» del detalle, ADR-0242 D-6.1)", () => {
  const n = { unidades: 3, modelos: 1 };
  const ID = "ec84230c-0814-4669-82e9-de9d8132cc27";

  it("dice «Traslados · Lo que llegó», sin hablar de «guardar la ficha» (no hay ficha) y como en Recibir", () => {
    const e = encabezadoDeEtiquetas({ tipo: "variantes", entraron: true, desdeTraslado: true }, n, "Tienda Lima");
    expect(e.sobretitulo).toBe("Traslados · Lo que llegó");
    expect(e.bajada).toBe("Entraron 3 prendas de 1 modelo. Sale una etiqueta por prenda; si alguna ya venía etiquetada, baja su número.");
    expect(e.bajada).not.toMatch(/ficha/i);
    expect(e.columnaCantidad).toBe("Entraron");
  });

  it("sin traslado, lo que entró desde Editar producto sigue diciendo lo de siempre", () => {
    const e = encabezadoDeEtiquetas({ tipo: "variantes", entraron: true }, n, "Tienda Lima");
    expect(e.sobretitulo).toBe("Productos · Lo que entró");
    expect(e.bajada).toMatch(/al guardar la ficha/);
  });

  it("«Volver» regresa al detalle de ESE traslado, no a Existencias (que quien recibió quizá ni ve)", () => {
    expect(volverDeEtiquetas({ tipo: "variantes" }, null, ID)).toEqual({ href: `/inventario/traslados/${ID}`, a: "Traslado" });
    expect(volverDeEtiquetas({ tipo: "variantes" }, null, null)).toEqual({ href: "/inventario", a: "Existencias" });
  });

  it("el traslado solo manda sobre las tallas sueltas: lotes, producción y campaña vuelven a lo suyo", () => {
    expect(volverDeEtiquetas({ tipo: "lotes" }, null, ID).href).toBe("/recibir");
    expect(volverDeEtiquetas({ tipo: "producto" }, null, ID).href).toBe("/productos");
  });
});
