import { describe, expect, it } from "vitest";
import {
  UMBRAL_COLOR_ANOTADO,
  categoriaEscritaDistinta,
  categoriasPorLoEscrito,
  colorPudoSerElAnotado,
  conCandidata,
  deducirForma,
  formaSugeridaPara,
  hechosConExactas,
  hechosPorVenta,
  ordenarCandidatas,
  palabrasEnComun,
  sugerenciaDeVenta,
  textoProbable,
  tramoDe,
  type ExactaDeVenta,
  type HechoCandidata,
  type PrendaParaRegularizar,
  type VentaPorRegularizar,
} from "./por-regularizar-candidatas";
import { sugerirDescripcion } from "./prenda-sin-registrar-reglas";
import { sugerenciaParaMostrar } from "./sugerir-categoria-sin-registrar";

// Lo que se prueba: (1) la respuesta deducida del libro —el sistema no tenía ninguna a la hora de la venta ⇒ llegó nueva; tenía y
// después no llegó ni se ajustó nada ⇒ ya estaba registrada; tenía y después llegó algo ⇒ no se sabe— y (2) el orden de las
// candidatas, criterio por criterio. Que contestar mal descuenta dos veces lo prueba la base
// (`scripts/pruebas/ventas_sin_registrar.mjs`): aquí solo se cuida que la sugerencia diga lo correcto.

const VENTA: VentaPorRegularizar = {
  descripcion: "Blusa Emma negra",
  precioCobrado: 80,
  vendidoEn: "2026-10-02T16:40:00.000Z", // 02/10 11:40 en Lima
  sede: "Tienda Trujillo",
  categoria: "Camisas y Blusas",
  talla: "M",
  color: "Negro",
};

const prenda = (id: string, nombre: string, extra: Partial<PrendaParaRegularizar> = {}): PrendaParaRegularizar => ({
  id,
  productoId: `prod-${id}`,
  nombre,
  codigo: `COD-${id}`,
  categoria: "Camisas y Blusas",
  talla: "M",
  color: "Negro",
  precio: 80,
  ...extra,
});
const hecho = (varianteId: string, extra: Partial<HechoCandidata> = {}): HechoCandidata => ({
  prendaId: "venta-1",
  varianteId,
  colorExacto: true,
  colorHex: null,
  colorHexAnotado: null,
  pisoLibre: 1,
  almacenLibre: 0,
  disponible: 1,
  primeraEntrada: "2026-10-01T15:00:00.000Z",
  primeraEntradaMotivo: "carga_inicial",
  saldoALaVenta: 1,
  cambioPosterior: null,
  cambioPosteriorMotivo: null,
  ...extra,
});
const catalogoDe = (...ps: PrendaParaRegularizar[]) => new Map(ps.map((p) => [p.id, p]));
const orden = (hechos: HechoCandidata[], catalogo: Map<string, PrendaParaRegularizar>, venta = VENTA) =>
  ordenarCandidatas(venta, hechos, catalogo).map((c) => c.prenda.id);

describe("deducirForma — ¿ya estaba registrada o llegó nueva?", () => {
  const libro = (extra: Partial<HechoCandidata> = {}) => hecho("x", extra);

  it("vendida ANTES de su carga inicial en esa tienda (el sistema no tenía ninguna) → llegó nueva, y dice por qué con la carga", () => {
    const d = deducirForma(libro({ saldoALaVenta: 0, primeraEntrada: "2026-10-05T14:00:00.000Z", cambioPosterior: "2026-10-05T14:00:00.000Z", cambioPosteriorMotivo: "carga_inicial" }), "2026-10-02T16:40:00.000Z", "Tienda Trujillo");
    expect(d?.forma).toBe("llego_nueva");
    expect(d?.porque).toBe("Se vendió el 02/10 a las 11:40, antes de su carga inicial en Tienda Trujillo (05/10 a las 09:00): ese conteo ya no la incluyó.");
  });

  it("R7 · se agotó y volvió a llegar: la primera entrada es ANTERIOR, pero a esa hora el sistema tenía 0 → llegó nueva", () => {
    // Carga de 1 el 28/09, venta escaneada el 29/09 (queda en 0), venta «sin registrar» el 30/09, recepción de 2 el 02/10.
    const d = deducirForma(
      libro({ saldoALaVenta: 0, primeraEntrada: "2026-09-28T15:00:00.000Z", cambioPosterior: "2026-10-02T15:00:00.000Z", cambioPosteriorMotivo: "recepcion" }),
      "2026-09-30T20:00:00.000Z",
      "Tienda Trujillo",
    );
    expect(d?.forma).toBe("llego_nueva");
    expect(d?.porque).toBe("Cuando se vendió (30/09 a las 15:00), el sistema no tenía ninguna en Tienda Trujillo: no pudo estar contada.");
  });

  it("tenía, y después no llegó ni se ajustó nada → ya estaba registrada (estaba contada en el stock)", () => {
    const d = deducirForma(libro({ saldoALaVenta: 3 }), "2026-10-06T20:00:00.000Z", "Tienda Arequipa");
    expect(d?.forma).toBe("ya_registrada");
    expect(d?.porque).toBe("Cuando se vendió (06/10 a las 15:00), el sistema tenía 3 en Tienda Arequipa y después no llegó ni se ajustó ninguna: estaba contada en el stock.");
  });

  it("tenía, pero después llegó una recepción → no se sabe (forma null) y lo dice con la fecha, para que la persona mire", () => {
    const d = deducirForma(libro({ saldoALaVenta: 1, cambioPosterior: "2026-10-03T15:00:00.000Z", cambioPosteriorMotivo: "recepcion" }), "2026-10-02T16:40:00.000Z", "Tienda Trujillo");
    expect(d?.forma).toBeNull();
    expect(d?.porque).toBe(
      "Cuando se vendió (02/10 a las 11:40), el sistema tenía 1 en Tienda Trujillo, pero el 03/10 a las 10:00 llegó una recepción: pudo ser una de las que ya estaban contadas o una que llegó sin registrar. Mira tú si estaba contada.",
    );
  });

  it("un conteo que ajustó después también deja la respuesta abierta (pudo haber descontado ya la vendida)", () => {
    const d = deducirForma(libro({ saldoALaVenta: 2, cambioPosterior: "2026-10-03T15:00:00.000Z", cambioPosteriorMotivo: "conteo" }), "2026-10-02T16:40:00.000Z", "TRU");
    expect(d?.forma).toBeNull();
    expect(d?.porque).toContain("se ajustó en un conteo");
    expect(deducirForma(libro({ saldoALaVenta: 2, cambioPosterior: "2026-10-03T15:00:00.000Z", cambioPosteriorMotivo: "raro" }), "2026-10-02T16:40:00.000Z", "TRU")?.porque).toContain("cambió su stock");
  });

  it("el saldo manda sobre la primera entrada: con 0 a la hora de la venta, aunque después haya llegado algo, es llegó nueva", () => {
    expect(deducirForma(libro({ saldoALaVenta: 0, cambioPosterior: "2026-10-03T15:00:00.000Z", cambioPosteriorMotivo: "recepcion" }), "2026-10-02T16:40:00.000Z", "TRU")?.forma).toBe("llego_nueva");
    expect(deducirForma(libro({ saldoALaVenta: -1 }), "2026-10-02T16:40:00.000Z", "TRU")?.forma).toBe("llego_nueva");
  });

  it("vale para cualquier primera entrada, no solo la carga inicial, y dice cuál fue", () => {
    const antes = (motivo: string | null) =>
      deducirForma(libro({ saldoALaVenta: 0, primeraEntrada: "2026-10-03T15:00:00.000Z", primeraEntradaMotivo: motivo }), "2026-10-02T15:00:00.000Z", "TRU")?.porque;
    expect(antes("traslado_entrada")).toContain("el traslado que la trajo");
    expect(antes("recepcion")).toContain("su recepción");
    expect(antes("motivo_raro")).toContain("su primera entrada");
    expect(antes(null)).toContain("su primera entrada");
  });

  it("sin saldo conocido (sede apagada, o la lectura vieja) o con una fecha rota: nada que decir (null)", () => {
    expect(deducirForma(libro({ saldoALaVenta: null }), "2026-10-02T15:00:00.000Z", "TRU")).toBeNull();
    expect(deducirForma(libro({ saldoALaVenta: 2 }), "no es fecha", "TRU")).toBeNull();
  });
});

describe("ordenarCandidatas — de la más a la menos probable, criterio por criterio", () => {
  it("1 · el nombre del modelo que escribió la caja gana a todo lo demás", () => {
    const cat = catalogoDe(prenda("emma", "Blusa Emma", { color: "Negro carbón" }), prenda("lina", "Blusa Lina"));
    // «Lina» tiene color exacto y está en el piso; «Emma» solo es de la familia y está en el almacén, pero la caja escribió «Emma».
    const hechos = [hecho("lina"), hecho("emma", { colorExacto: false, pisoLibre: 0, almacenLibre: 3, disponible: 3 })];
    expect(orden(hechos, cat)).toEqual(["emma", "lina"]);
  });

  it("2 · sin nombre en común, el color exacto antes que uno de la familia", () => {
    const cat = catalogoDe(prenda("a", "Blusa Aurora", { color: "Negro carbón" }), prenda("b", "Blusa Brisa"));
    expect(orden([hecho("a", { colorExacto: false }), hecho("b", { pisoLibre: 0, almacenLibre: 2 })], cat)).toEqual(["b", "a"]);
  });

  it("3 · con el mismo color, la que está en el piso antes que la que solo está en el almacén", () => {
    const cat = catalogoDe(prenda("a", "Blusa Aurora"), prenda("b", "Blusa Brisa"));
    expect(orden([hecho("a", { pisoLibre: 0, almacenLibre: 5, disponible: 5 }), hecho("b", { pisoLibre: 1 })], cat)).toEqual(["b", "a"]);
  });

  it("4 · después, el precio oficial más cercano a lo cobrado", () => {
    const cat = catalogoDe(prenda("cara", "Blusa Aurora", { precio: 129 }), prenda("cerca", "Blusa Brisa", { precio: 79.9 }));
    expect(orden([hecho("cara"), hecho("cerca")], cat)).toEqual(["cerca", "cara"]);
  });

  it("5 · después, la que tiene más unidades; 6 · y al final el código, para que el orden sea siempre el mismo", () => {
    const cat = catalogoDe(prenda("a", "Blusa Aurora"), prenda("b", "Blusa Brisa"), prenda("c", "Blusa Coral"));
    expect(orden([hecho("a"), hecho("b", { disponible: 4, pisoLibre: 4 }), hecho("c")], cat)).toEqual(["b", "a", "c"]);
    expect(orden([hecho("c"), hecho("a")], cat)).toEqual(["a", "c"]);
  });

  it("una variante que el catálogo de la pantalla ya no trae se omite (no se puede elegir)", () => {
    expect(orden([hecho("fantasma"), hecho("a")], catalogoDe(prenda("a", "Blusa Aurora")))).toEqual(["a"]);
  });

  it("cada candidata explica su lugar en palabras de tienda y trae la respuesta deducida", () => {
    const [c] = ordenarCandidatas(VENTA, [hecho("emma")], catalogoDe(prenda("emma", "Blusa Emma", { precio: 79.9 })));
    expect(c?.razones).toEqual(["el nombre dice «emma»", "mismo color", "está en el piso", "precio S/ 79.90"]);
    expect(c?.forma?.forma).toBe("ya_registrada");
    const [d] = ordenarCandidatas(VENTA, [hecho("x", { colorExacto: false, pisoLibre: 0 })], catalogoDe(prenda("x", "Blusa Brisa", { color: "Negro carbón" })));
    expect(d?.razones).toEqual(["color parecido (Negro carbón)", "solo en el almacén", "mismo precio"]);
  });
});

// Los hex de la paleta real (retail.colores con todas las migraciones, 2026-10-04): NEG, BLA y GRA, los tres de la familia «neutro».
const NEGRO = "#2D2C2F";
const BLANCO = "#F4F9FF";
const GRIS_ANTRACITA = "#48464A";

describe("colorPudoSerElAnotado — la familia sola es ancha: se mide a la vista (ΔE2000)", () => {
  it("el umbral es el medido sobre la paleta", () => {
    expect(UMBRAL_COLOR_ANOTADO).toBe(20);
  });

  it("Negro y Blanco son de la familia «neutro» pero nadie anota uno por otro: se descarta", () => {
    expect(colorPudoSerElAnotado({ colorExacto: false, colorHex: BLANCO, colorHexAnotado: NEGRO })).toBe(false);
    const cat = catalogoDe(prenda("blanca", "Blusa Brisa", { color: "Blanco" }));
    expect(orden([hecho("blanca", { colorExacto: false, colorHex: BLANCO, colorHexAnotado: NEGRO })], cat)).toEqual([]);
  });

  it("dos colores que se confunden a la vista sí quedan (Gris antracita por Negro)", () => {
    expect(colorPudoSerElAnotado({ colorExacto: false, colorHex: GRIS_ANTRACITA, colorHexAnotado: NEGRO })).toBe(true);
  });

  it("el color exacto siempre queda, y sin hex (estampado) basta la familia", () => {
    expect(colorPudoSerElAnotado({ colorExacto: true, colorHex: BLANCO, colorHexAnotado: NEGRO })).toBe(true);
    expect(colorPudoSerElAnotado({ colorExacto: false, colorHex: null, colorHexAnotado: NEGRO })).toBe(true);
    expect(colorPudoSerElAnotado({ colorExacto: false, colorHex: "sin-hex", colorHexAnotado: NEGRO })).toBe(true);
  });
});

describe("palabrasEnComun — solo lo que distingue un modelo de otro", () => {
  it("cuenta el nombre propio, no la prenda, el color, la talla ni los números", () => {
    expect(palabrasEnComun(VENTA, prenda("e", "Blusa Emma"))).toEqual(["emma"]);
    expect(palabrasEnComun({ ...VENTA, descripcion: "Camisas y Blusas · Negro · Talla M" }, prenda("e", "Blusa Emma"))).toEqual([]);
    expect(palabrasEnComun({ ...VENTA, descripcion: "Pantalón Carla negro 28", categoria: "Pantalones", talla: "28" }, prenda("c", "Pantalón Carla 28"))).toEqual(["carla"]);
    expect(palabrasEnComun({ ...VENTA, descripcion: "chaqueta azul" }, prenda("r", "Chaqueta Río", { color: "Azul" }))).toEqual([]);
  });
});

describe("las piezas de la lista", () => {
  it("agrupa los hechos por venta", () => {
    const g = hechosPorVenta([hecho("a"), hecho("b", { prendaId: "venta-2" }), hecho("c")]);
    expect([...g.keys()]).toEqual(["venta-1", "venta-2"]);
    expect(g.get("venta-1")?.map((h) => h.varianteId)).toEqual(["a", "c"]);
  });

  it("la frase corta de la lista dice cuál y de cuántas", () => {
    const cat = catalogoDe(prenda("a", "Blusa Aurora"), prenda("b", "Blusa Brisa"));
    const de = (hs: HechoCandidata[]) => textoProbable(sugerenciaDeVenta(VENTA, hs, [], cat, null));
    expect(de([hecho("a")])).toBe("Probable: Blusa Aurora · COD-a");
    expect(de([hecho("a"), hecho("b", { pisoLibre: 0 })])).toBe("Probable: Blusa Aurora · COD-a (1 de 2)");
    expect(de([])).toBeNull();
  });

  it("la respuesta sugerida es la de la prenda ELEGIDA, y nada si la elegida no es candidata", () => {
    const cat = catalogoDe(prenda("antes", "Blusa Aurora"), prenda("despues", "Blusa Brisa"));
    const cs = ordenarCandidatas(
      VENTA,
      [hecho("antes", { saldoALaVenta: 0, primeraEntrada: "2026-10-05T15:00:00.000Z", cambioPosterior: "2026-10-05T15:00:00.000Z" }), hecho("despues")],
      cat,
    );
    expect(formaSugeridaPara(cs, "antes")?.forma).toBe("llego_nueva");
    expect(formaSugeridaPara(cs, "despues")?.forma).toBe("ya_registrada");
    expect(formaSugeridaPara(cs, "otra")).toBeNull();
  });

  it("cuenta cuántas pendientes tienen una prenda probable (después de descartar los colores que no se confunden)", () => {
    const cat = catalogoDe(prenda("a", "Blusa Aurora"), prenda("b", "Blusa Brisa", { color: "Blanco" }));
    const g = hechosPorVenta([hecho("a"), hecho("b", { prendaId: "venta-3", colorExacto: false, colorHex: BLANCO, colorHexAnotado: NEGRO })]);
    const sugerenciaDe = new Map([...g].map(([id, hs]) => [id, sugerenciaDeVenta(VENTA, hs, [], cat, null)]));
    expect(conCandidata([{ id: "venta-1" }, { id: "venta-2" }, { id: "venta-3" }], sugerenciaDe)).toBe(1);
  });
});

// Lo escrito contra lo anotado (revisión adversarial): las ventas «Jean…» de AQP anotadas como Pantalones. Las categorías son las de
// la base (prefijo de 20260912235500); los ids, inventados.
const CATEGORIAS = [
  { id: "cat-pan", nombre: "Pantalones", prefijo: "PAN" },
  { id: "cat-jea", nombre: "Jeans", prefijo: "JEA" },
  { id: "cat-cas", nombre: "Casacas", prefijo: "CAS" },
  { id: "cat-cms", nombre: "Camisas y Blusas", prefijo: "CMS" },
];
const JEAN_COMO_PANTALON = {
  ...VENTA,
  descripcion: "Jean azul tiro alto",
  categoria: "Pantalones",
  categoriaId: "cat-pan",
  talla: "28",
  color: "Azul",
};

describe("categoriaEscritaDistinta — ¿lo que ESCRIBIÓ la caja nombra otra categoría que la anotada?", () => {
  it("«Jean azul tiro alto» anotado como Pantalones → Jeans, por la palabra «Jean»", () => {
    expect(categoriaEscritaDistinta(JEAN_COMO_PANTALON, CATEGORIAS)).toEqual({ categoriaId: "cat-jea", nombre: "Jeans", palabra: "Jean" });
  });
  it("si dicen lo mismo, o lo escrito no nombra ninguna prenda, no hay nada que decir", () => {
    expect(categoriaEscritaDistinta({ ...JEAN_COMO_PANTALON, descripcion: "Pantalón palazzo azul" }, CATEGORIAS)).toBeNull();
    expect(categoriaEscritaDistinta({ ...JEAN_COMO_PANTALON, descripcion: "azul talla 28 sin etiqueta" }, CATEGORIAS)).toBeNull();
  });
  it("la prenda va primero: «chaqueta jean» anotada como Pantalones es una Casaca", () => {
    expect(categoriaEscritaDistinta({ ...JEAN_COMO_PANTALON, descripcion: "chaqueta jean" }, CATEGORIAS)?.nombre).toBe("Casacas");
  });
  it("la descripción que armó el sistema con la categoría anotada no es evidencia", () => {
    expect(categoriaEscritaDistinta({ ...JEAN_COMO_PANTALON, descripcion: "Pantalones · Azul · Talla 28" }, CATEGORIAS)).toBeNull();
  });
  it("…ni cuando el COLOR de la paleta nombra otra prenda: «Azul denim» (revisión 2026-10-05, el caso donde la guarda decide)", () => {
    // Sin la guarda, «Pantalones · Azul denim · Talla 28» se lee como Jeans (PAN seguido de «denim»): la cola pediría una segunda
    // lectura en Jeans y diría «Caja escribió «denim»» aunque nadie escribió nada. Con «Azul» a secas la guarda no se nota.
    const venta = { ...JEAN_COMO_PANTALON, color: "Azul denim" };
    const armada = sugerirDescripcion(venta.categoria, venta.color, venta.talla) ?? "";
    expect(armada).toBe("Pantalones · Azul denim · Talla 28");
    expect(sugerenciaParaMostrar(armada, "cat-pan", CATEGORIAS)?.nombre).toBe("Jeans");
    expect(categoriaEscritaDistinta({ ...venta, descripcion: armada }, CATEGORIAS)).toBeNull();
    // Lo que SÍ escribió una persona sigue contando, con el mismo color.
    expect(categoriaEscritaDistinta({ ...venta, descripcion: "jean azul denim" }, CATEGORIAS)?.nombre).toBe("Jeans");
  });
  it("categoriasPorLoEscrito: solo las pendientes, cada una con su categoría escrita", () => {
    const filas = [
      { ...JEAN_COMO_PANTALON, id: "v1", estado: "pendiente" },
      { ...JEAN_COMO_PANTALON, id: "v2", estado: "regularizada" },
      { ...JEAN_COMO_PANTALON, id: "v3", estado: "pendiente", descripcion: "Pantalón palazzo" },
    ];
    expect(Object.keys(categoriasPorLoEscrito(filas, CATEGORIAS))).toEqual(["v1"]);
  });
});

describe("sugerenciaDeVenta — un pantalón nunca es la «Más probable» de una venta escrita «Jean…»", () => {
  const palazzo = prenda("palazzo", "Pantalón Palazzo", { categoria: "Pantalones", talla: "28", color: "Azul" });
  const mom = prenda("mom", "Jean Mom", { categoria: "Jeans", talla: "28", color: "Azul" });
  const cat = catalogoDe(palazzo, mom);
  const escrita = categoriaEscritaDistinta(JEAN_COMO_PANTALON, CATEGORIAS);

  it("sin candidatas de Jeans: no hay sugerida; la frase dice dónde buscarla, y el palazzo queda solo como «posible»", () => {
    const s = sugerenciaDeVenta(JEAN_COMO_PANTALON, [hecho("palazzo")], [], cat, escrita);
    expect(s.probable).toBeNull();
    expect(s.candidatas.map((c) => c.prenda.id)).toEqual(["palazzo"]);
    expect(textoProbable(s)).toBe("Caja escribió «Jean»: búscala entre Jeans");
    expect(conCandidata([{ id: "venta-1" }], new Map([["venta-1", s]]))).toBe(0);
  });

  it("con candidatas de Jeans (la segunda lectura): la sugerida sale de ahí, dice por qué y va antes que el palazzo", () => {
    const s = sugerenciaDeVenta(JEAN_COMO_PANTALON, [hecho("palazzo")], [hecho("mom")], cat, escrita);
    expect(s.probable?.prenda.id).toBe("mom");
    expect(s.probable?.porLoEscrito).toBe(true);
    expect(s.probable?.razones[0]).toBe("caja escribió «Jean»");
    expect(s.candidatas.map((c) => c.prenda.id)).toEqual(["mom", "palazzo"]);
    expect(textoProbable(s)).toBe("Probable: Jean Mom · COD-mom (1 de 2)");
  });

  it("sin conflicto entre lo escrito y lo anotado, todo sigue como antes", () => {
    const s = sugerenciaDeVenta(JEAN_COMO_PANTALON, [hecho("palazzo")], [], cat, null);
    expect(s.probable?.prenda.id).toBe("palazzo");
    expect(s.probable?.porLoEscrito).toBe(false);
  });
});

describe("hechosConExactas — D1: «igual a lo que anotó caja» es EXACTAMENTE fn_candidatas_de_venta (la del lote del líder)", () => {
  // `fn_candidatas_de_venta` (ADR-0334) y `fn_candidatas_por_regularizar` (este PR) no definen igual «calza exacto»: la segunda deja
  // fuera las prendas de prueba y corta en 20 por venta; la primera no. Lo que la pantalla llama exacto sale SOLO de la primera.
  const exacta = (prendaId: string, varianteId: string, disponible = 1): ExactaDeVenta => ({ prendaId, varianteId, disponible });
  const claves = (hs: readonly HechoCandidata[]) => hs.map((h) => `${h.prendaId}|${h.varianteId}`).sort();
  const exactosDe = (hs: readonly HechoCandidata[]) => hs.filter((h) => h.colorExacto);

  it("el tramo exacto tiene las MISMAS parejas que fn_candidatas_de_venta: ni una más, ni una menos", () => {
    const exactas = [exacta("v1", "a"), exacta("v1", "prueba"), exacta("v2", "b")];
    const hechos = [
      hecho("a", { prendaId: "v1" }),
      hecho("b", { prendaId: "v2" }),
      // Una exacta que la base común no reconoce (p. ej. con lo único apartado dentro de Cuarentena): se cae.
      hecho("fantasma", { prendaId: "v1" }),
      // Un color parecido: tramo aparte, pasa tal cual.
      hecho("gris", { prendaId: "v1", colorExacto: false }),
    ];
    const r = hechosConExactas(exactas, hechos);
    expect(claves(exactosDe(r))).toEqual(claves(exactas.map((e) => hecho(e.varianteId, { prendaId: e.prendaId }))));
    expect(r.filter((h) => !h.colorExacto).map((h) => h.varianteId)).toEqual(["gris"]);
  });

  it("una exacta sin hechos (la base común sí, la de hechos no: una prenda de prueba, o pasada de las 20) entra sin respuesta deducida y sin decir dónde está", () => {
    const [h] = hechosConExactas([exacta("v1", "prueba", 2)], []);
    expect(h).toMatchObject({ varianteId: "prueba", colorExacto: true, disponible: 2, pisoLibre: null, saldoALaVenta: null });
    const [c] = ordenarCandidatas(VENTA, [h!], catalogoDe(prenda("prueba", "Blusa Prueba")));
    expect(c?.forma).toBeNull();
    expect(c?.razones).toEqual(["mismo color", "mismo precio"]);
  });

  it("con hechos, conserva los hechos y toma el disponible de la base común", () => {
    const [h] = hechosConExactas([exacta("v1", "a", 3)], [hecho("a", { prendaId: "v1", disponible: 2, saldoALaVenta: 4 })]);
    expect(h).toMatchObject({ disponible: 3, saldoALaVenta: 4, pisoLibre: 1 });
  });

  it("sin la lectura de la base común (null) no hay tramo exacto ni parecidas: una parecida no pasa por la más probable", () => {
    expect(hechosConExactas(null, [hecho("a"), hecho("gris", { colorExacto: false })])).toEqual([]);
  });

  it("de punta a punta: el tramo exacto que arma la sugerencia es el de la base común, también con los hechos cortados o caídos", () => {
    const cat = catalogoDe(
      prenda("a", "Blusa A"),
      prenda("b", "Blusa B"),
      prenda("c", "Blusa C"),
      prenda("gris", "Blusa Gris", { color: "Gris antracita" }),
      // Está en el catálogo de la pantalla: si se colara, el tramo la mostraría.
      prenda("otra-exacta-de-mas", "Blusa De Más"),
    );
    const exactas = [exacta("venta-1", "a"), exacta("venta-1", "b"), exacta("venta-1", "c")];
    for (const hechos of [
      [hecho("a"), hecho("b"), hecho("c")],
      [hecho("a")], // la lectura de hechos cortó (o no trajo dos)
      [], // la lectura de hechos falló entera
      [hecho("a"), hecho("gris", { colorExacto: false }), hecho("otra-exacta-de-mas")],
    ]) {
      const s = sugerenciaDeVenta(VENTA, hechosConExactas(exactas, hechos), [], cat, null);
      const exactasDelTramo = s.candidatas.filter((c) => tramoDe(c) === "exacta").map((c) => c.prenda.id).sort();
      expect(exactasDelTramo).toEqual(["a", "b", "c"]);
    }
  });

  it("tramoDe: lo escrito, igual a lo anotado o color parecido", () => {
    expect(tramoDe({ porLoEscrito: true, hecho: hecho("a") })).toBe("escrita");
    expect(tramoDe({ porLoEscrito: false, hecho: hecho("a") })).toBe("exacta");
    expect(tramoDe({ porLoEscrito: false, hecho: hecho("a", { colorExacto: false }) })).toBe("parecida");
  });
});
