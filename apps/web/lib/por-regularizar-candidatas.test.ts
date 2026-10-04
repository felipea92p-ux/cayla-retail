import { describe, expect, it } from "vitest";
import {
  UMBRAL_COLOR_ANOTADO,
  colorPudoSerElAnotado,
  conCandidata,
  deducirForma,
  formaSugeridaPara,
  hechosPorVenta,
  ordenarCandidatas,
  palabrasEnComun,
  textoProbable,
  type HechoCandidata,
  type PrendaParaRegularizar,
  type VentaPorRegularizar,
} from "./por-regularizar-candidatas";

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
    expect(textoProbable(ordenarCandidatas(VENTA, [hecho("a")], cat))).toBe("Probable: Blusa Aurora · COD-a");
    expect(textoProbable(ordenarCandidatas(VENTA, [hecho("a"), hecho("b", { pisoLibre: 0 })], cat))).toBe("Probable: Blusa Aurora · COD-a (1 de 2)");
    expect(textoProbable([])).toBeNull();
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

  it("cuenta cuántas pendientes tienen alguna candidata (después de descartar los colores que no se confunden)", () => {
    const cat = catalogoDe(prenda("a", "Blusa Aurora"), prenda("b", "Blusa Brisa", { color: "Blanco" }));
    const g = hechosPorVenta([hecho("a"), hecho("b", { prendaId: "venta-3", colorExacto: false, colorHex: BLANCO, colorHexAnotado: NEGRO })]);
    const candidatasDe = new Map([...g].map(([id, hs]) => [id, ordenarCandidatas(VENTA, hs, cat)]));
    expect(conCandidata([{ id: "venta-1" }, { id: "venta-2" }, { id: "venta-3" }], candidatasDe)).toBe(1);
  });
});
