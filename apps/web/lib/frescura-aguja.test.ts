import { describe, expect, it } from "vitest";
import type { EstadoFrescura, FrescuraPrenda, RitmoCategoria } from "./frescura-reglas";
import { acogidas, cuantilGamma, enlaceBajar, loQueMueveLaAguja, loQueSeLlevan } from "./frescura-aguja";

// Lo que mueve la aguja (ADR-0208, act. 2026-10-10 (b)): la edad (un hecho) y la acogida (contraída, con su cota prudente), con lo anotado en
// caja como control y sin veredictos si el piso no está cuadrado.

const D = 86_400;
const POLOS = { cortes: { p50: 9 * D, p75: 11 * D, p90: 13 * D }, tMax: 20 * D, vendidas: 24 };
const SEMAFORO: EstadoFrescura = { tipo: "semaforo", tramo: "vigente", alMenos: false, temporadaPasada: false, sinTemporada: false, quieta: false, sugerencias: [] };

/** Una prenda de `categoria` con `piso` unidades colgadas hace `dias` días y, si se pide, una talla guardada sin colgar. */
function prenda(id: string, categoriaId: string, nombre: string, piso: number, dias: number, o: { guardada?: number; almacen?: number } = {}): FrescuraPrenda {
  const tallas = [{ varianteId: `${id}-m`, talla: "M", pisoHoy: piso, almacenHoy: o.almacen ?? 0, apartadasHoy: 0, apartadasPisoHoy: 0, colgadas: [{ segundos: dias * D, unidades: piso, edadDesconocida: false }] }];
  if (o.guardada) tallas.push({ varianteId: `${id}-l`, talla: "L", pisoHoy: 0, almacenHoy: o.guardada, apartadasHoy: 0, apartadasPisoHoy: 0, colgadas: [] });
  return {
    clave: `${id}|NEG`, productoId: id, productoNombre: id, codigo: null, colorCodigo: "NEG", colorNombre: "Negro", categoriaId, categoriaNombre: nombre, tallas,
    pisoHoy: piso, almacenHoy: tallas.reduce((s, t) => s + t.almacenHoy, 0), apartadasHoy: 0, apartadasPisoHoy: 0,
    reloj: { segundos: dias * D, alMenos: false }, relojUnidad: { segundos: dias * D, alMenos: false },
    primeraExhibicion: null, ultimaLlegada: null, ultimaLlegadaCayla: null, temporada: "verano", temporadaOrigen: "producto", esClasico: false, finEstacion: null,
    rapidez: null, ventasRecientes: 0, categoriaSinElla: POLOS, juzgadaContra: "sede", varaDelMes: true, estado: SEMAFORO, porDecidir: false, decision: null,
  };
}

const ritmo = (filas: [string, number, number][], dias = 14): RitmoCategoria[] => filas.map(([categoriaId, unidadDias, vendidas]) => ({ categoriaId, dias, unidadDias, vendidas }));

describe("cuantilGamma (Wilson-Hilferty)", () => {
  it("coincide con la normal cuando la Gamma ya es angosta", () => {
    // Gamma(50, 50): media 1, desvío 0,141: cuantiles 10 y 90 cerca de 0,82 y 1,18.
    expect(cuantilGamma(50, 50, -1.2816)).toBeCloseTo(0.82, 1);
    expect(cuantilGamma(50, 50, 1.2816)).toBeCloseTo(1.18, 1);
  });
});

describe("acogidas: lo que vende contra lo que ocupa, contra el resto de la tienda", () => {
  it("Jeans vende la mitad de lo que ocupa; Polos casi el triple; la contracción los acerca a 1 sin borrarlos", () => {
    const a = acogidas(ritmo([["jea", 100, 5], ["pol", 100, 30], ["cam", 100, 20]]));
    const jea = a.get("jea")!;
    const pol = a.get("pol")!;
    expect(jea.partePiso).toBeCloseTo(1 / 3, 6);
    expect(jea.parteVentas).toBeCloseTo(5 / 55, 6);
    // Contra el resto (50 ventas en 200 unidad·días), Jeans esperaba 25 y vendió 5.
    expect(jea.esperadas).toBeCloseTo(25, 6);
    expect(jea.indice).toBeGreaterThan(5 / 25);
    expect(jea.alto).toBeLessThan(0.75);
    expect(pol.bajo).toBeGreaterThan(1.33);
  });

  it("con pocas esperadas en 14 días se mira 28", () => {
    const a = acogidas([...ritmo([["jea", 10, 0], ["pol", 10, 1]], 14), ...ritmo([["jea", 60, 2], ["pol", 60, 20]], 28)]);
    expect(a.get("jea")?.dias).toBe(28);
  });
});

describe("loQueMueveLaAguja", () => {
  const prendas = [
    prenda("j1", "jea", "Jeans", 6, 20, { guardada: 2 }),
    prenda("p1", "pol", "Polos", 6, 3, { almacen: 10 }),
    prenda("c1", "cam", "Camisas y Blusas", 5, 3),
  ];
  const r = ritmo([["jea", 100, 5], ["pol", 100, 30], ["cam", 100, 20]]);

  it("Jeans se queda (envejece y vende menos de lo que ocupa) y pide completar tallas; Polos se lleva más y pide colgar más", () => {
    const s = loQueMueveLaAguja(prendas, r, { pisoCuadrado: true });
    expect(s.map((x) => [x.nombre, x.tipo, x.accion.tipo])).toEqual([
      ["Jeans", "se_queda", "completar_tallas"],
      ["Polos", "se_lleva", "colgar_mas"],
    ]);
    expect(s[0]).toMatchObject({ envejeciendo: 6, piso: 6, accion: { lineas: [{ varianteId: "j1-l", cantidad: 1 }] } });
    expect(s[1]).toMatchObject({ accion: { enAlmacen: 10 } });
  });

  it("sin el piso cuadrado no hay veredictos: el sistema no sabe qué cuelga", () => {
    expect(loQueMueveLaAguja(prendas, r, { pisoCuadrado: false })).toEqual([]);
  });

  it("lo anotado en caja es el control: si con él la acogida cruza 1, no habla; la edad sigue hablando", () => {
    const anotadas = (c: string) => (c === "jea" ? 40 : 0);
    const s = loQueMueveLaAguja(prendas, r, { pisoCuadrado: true, anotadas });
    const jea = s.find((x) => x.nombre === "Jeans")!;
    expect(jea).toMatchObject({ tipo: "se_queda", acogida: null, envejeciendo: 6 });
  });

  it("sin tallas guardadas, lo que se queda pide cambiar de lugar; lo que se lleva sin almacén, pedir", () => {
    const s = loQueMueveLaAguja([prenda("j1", "jea", "Jeans", 6, 20), prenda("p1", "pol", "Polos", 6, 3), prenda("c1", "cam", "Camisas y Blusas", 5, 3)], r, { pisoCuadrado: true });
    expect(s.map((x) => x.accion.tipo)).toEqual(["cambiar_lugar", "pedir"]);
  });

  it("una racha con pocas ventas no alcanza: la media pasa 1,33 pero la cota prudente no", () => {
    // Polos esperaba 6 (al ritmo del resto) y vendió 12: el doble, pero con 12 ventas. Contraída, su media es ~1,44 y su cota de 9 de cada 10, ~0,96.
    const a = acogidas(ritmo([["pol", 60, 12], ["cam", 100, 10]])).get("pol")!;
    expect(a.indice).toBeGreaterThan(1.33);
    expect(a.bajo).toBeLessThan(1.33);
    expect(loQueMueveLaAguja([prenda("p1", "pol", "Polos", 6, 3, { almacen: 4 }), prenda("c1", "cam", "Camisas y Blusas", 6, 3)], ritmo([["pol", 60, 12], ["cam", 100, 10]]), { pisoCuadrado: true })).toEqual([]);
  });

  it("con pocas esperadas (poco tiempo colgado), la acogida calla", () => {
    expect(loQueMueveLaAguja([prenda("p1", "pol", "Polos", 2, 3)], ritmo([["pol", 4, 3], ["cam", 4, 0]]), { pisoCuadrado: true })).toEqual([]);
  });
});

describe("loQueSeLlevan (sin piso cuadrado)", () => {
  it("registrado más anotado de 14 días, de mayor a menor", () => {
    const r = ritmo([["cam", 10, 3], ["pol", 10, 1]]);
    const anotadas = (c: string) => ({ cam: 56, bol: 50, pol: 26 })[c] ?? 0;
    expect(loQueSeLlevan(r, anotadas, ["cam", "bol", "pol"], (c) => ({ cam: "Camisas y Blusas", bol: "Bolsos y Carteras", pol: "Polos" })[c] ?? c)).toEqual([
      { categoriaId: "cam", nombre: "Camisas y Blusas", unidades: 59 },
      { categoriaId: "bol", nombre: "Bolsos y Carteras", unidades: 50 },
      { categoriaId: "pol", nombre: "Polos", unidades: 27 },
    ]);
  });
});

describe("enlaceBajar", () => {
  it("el formato de Bajar al piso", () => {
    expect(enlaceBajar([{ varianteId: "a", cantidad: 1 }, { varianteId: "b", cantidad: 2 }])).toBe("/inventario/bajar?lineas=a:1,b:2");
  });
});
