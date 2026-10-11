import { describe, expect, it } from "vitest";
import type { EstadoFrescura, FrescuraPrenda, RitmoCategoria } from "./frescura-reglas";
import { acogidas, cuantilGamma, enlaceBajar, envejeceDeMas, loQueMueveLaAguja, loQueSeLlevan, parteViejaEsperada, sinEstrenar } from "./frescura-aguja";

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
    const s = loQueMueveLaAguja(prendas, r, { pisoCuadrado: true, varaDe: () => POLOS.cortes });
    expect(s.map((x) => [x.nombre, x.tipo, x.accion.tipo])).toEqual([
      ["Jeans", "se_queda", "completar_tallas"],
      ["Polos", "se_lleva", "colgar_mas"],
    ]);
    // La edad manda el nombre: sus 6 unidades pasaron la marca de 3 de cada 4 y su vara esperaba ~7 de cada 100 viejas.
    expect(s[0]).toMatchObject({ motivo: "edad", envejeciendo: 6, piso: 6, accion: { lineas: [{ varianteId: "j1-l", cantidad: 1 }] } });
    expect(s[1].motivo).toBeNull();
    expect(s[1]).toMatchObject({ accion: { enAlmacen: 10 } });
  });

  it("sin el piso cuadrado no hay veredictos: el sistema no sabe qué cuelga", () => {
    expect(loQueMueveLaAguja(prendas, r, { pisoCuadrado: false })).toEqual([]);
  });

  it("lo anotado en caja cuenta como venta de su categoría (Felipe, «rapidez sí, días no»): Jeans con 60 anotadas se lleva más", () => {
    const anotadas = (c: string) => (c === "jea" ? 60 : 0);
    const sin = loQueMueveLaAguja(prendas, r, { pisoCuadrado: true });
    expect(sin.find((x) => x.nombre === "Jeans")).toMatchObject({ tipo: "se_queda", motivo: "espacio" });
    const con = loQueMueveLaAguja(prendas, r, { pisoCuadrado: true, anotadas });
    expect(con.find((x) => x.nombre === "Jeans")).toMatchObject({ tipo: "se_lleva" });
  });

  it("sin su vara, la edad no habla (no se sabe cuánto viejo es normal): habla solo la acogida", () => {
    const s = loQueMueveLaAguja([prenda("j1", "jea", "Jeans", 6, 20), prenda("c1", "cam", "Camisas y Blusas", 6, 20)], ritmo([["jea", 100, 20], ["cam", 100, 20]]), { pisoCuadrado: true });
    expect(s).toEqual([]);
  });

  it("completa tallas solo si la talla rota es de la categoría: 1 de 4 modelos con talla guardada no alcanza, 2 de 4 sí", () => {
    const uno = [prenda("j1", "jea", "Jeans", 6, 20, { guardada: 1 }), prenda("j2", "jea", "Jeans", 6, 20), prenda("j3", "jea", "Jeans", 6, 20), prenda("j4", "jea", "Jeans", 6, 20)];
    const dos = [prenda("j1", "jea", "Jeans", 6, 20, { guardada: 1 }), prenda("j2", "jea", "Jeans", 6, 20, { guardada: 1 }), prenda("j3", "jea", "Jeans", 6, 20), prenda("j4", "jea", "Jeans", 6, 20)];
    const conVara = { pisoCuadrado: true, varaDe: () => POLOS.cortes };
    expect(loQueMueveLaAguja(uno, ritmo([["jea", 400, 5], ["cam", 100, 20]]), conVara)[0].accion.tipo).toBe("cambiar_lugar");
    expect(loQueMueveLaAguja(dos, ritmo([["jea", 400, 5], ["cam", 100, 20]]), conVara)[0].accion.tipo).toBe("completar_tallas");
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

describe("la edad contra lo que espera su vara (Formidable 2026-10-10 (c): sin el 30 % fijo)", () => {
  it("con una curva exponencial, 1 de cada 4 de lo colgado ya pasó P75: la vieja «normal»", () => {
    expect(parteViejaEsperada({ p50: Math.log(2) * D, p75: Math.log(4) * D, p90: Math.log(10) * D })).toBeCloseTo(0.25, 2);
  });

  it("una categoría que vende casi todo junto (P50 9, P75 11, P90 13 días) espera poca vieja; sin P75, no se sabe", () => {
    const q = parteViejaEsperada(POLOS.cortes)!;
    expect(q).toBeGreaterThan(0.05);
    expect(q).toBeLessThan(0.15);
    expect(parteViejaEsperada({ p50: 9 * D, p75: null, p90: null })).toBeNull();
    // Sin P90, la cola sale del ritmo de P50 a P75 y sigue siendo una parte (entre 0 y 1).
    const sinP90 = parteViejaEsperada({ p50: 9 * D, p75: 11 * D, p90: null })!;
    expect(sinP90).toBeGreaterThan(0);
    expect(sinP90).toBeLessThan(1);
  });

  it("con cortes pegados (escalones de Kaplan-Meier) no se desploma ni se anula: P90 = P75, P90 un segundo después y P75 = P50 dan cifras vecinas", () => {
    const base = { p50: 10 * D, p75: 20 * D, p90: 30 * D };
    const pegado = parteViejaEsperada({ ...base, p90: 20 * D })!;
    const unSegundo = parteViejaEsperada({ ...base, p90: 20 * D + 1 })!;
    // Antes: 0,24 con P90 = P75 y 0,0000003 con un segundo más. Ahora las dos cerca de 0,07 (el 15 % que se vendió justo a los 20 días).
    expect(pegado).toBeGreaterThan(0.05);
    expect(Math.abs(unSegundo - pegado)).toBeLessThan(0.01);
    const p75IgualP50 = parteViejaEsperada({ p50: 10 * D, p75: 10 * D, p90: 20 * D });
    expect(p75IgualP50).not.toBeNull();
    expect(p75IgualP50!).toBeGreaterThan(0.1);
  });

  it("6 viejas de 10 donde se esperan 1 de cada 4 envejecen de más; 4 de 10 todavía no; con menos de 3, nunca", () => {
    expect(envejeceDeMas(6, 10, 0.25)).toBe(true);
    expect(envejeceDeMas(4, 10, 0.25)).toBe(false);
    expect(envejeceDeMas(2, 2, 0.01)).toBe(false);
    expect(envejeceDeMas(6, 10, null)).toBe(false);
  });

  it("una categoría sana (1 de cada 4 vieja) casi nunca salta por azar: menos de 4 de cada 100 veces con 12 unidades", () => {
    // Binomial(12, 0,25): la probabilidad de las cuentas que dispararían el aviso.
    const comb = (n: number, k: number): number => (k === 0 ? 1 : (comb(n, k - 1) * (n - k + 1)) / k);
    let saltos = 0;
    for (let k = 0; k <= 12; k++) if (envejeceDeMas(k, 12, 0.25)) saltos += comb(12, k) * 0.25 ** k * 0.75 ** (12 - k);
    expect(saltos).toBeLessThan(0.04);
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

describe("sinEstrenar: lo que el cliente nunca vio colgado", () => {
  const guardada = (id: string, o: { almacen?: number; llegada?: string; temporadaPasada?: boolean; colgada?: boolean } = {}): FrescuraPrenda => {
    const p = prenda(id, "pol", "Polos", 0, 0, {});
    return {
      ...p,
      pisoHoy: o.colgada ? 1 : 0,
      almacenHoy: o.almacen ?? 2,
      primeraExhibicion: o.colgada ? "2026-09-01T00:00:00.000Z" : null,
      ultimaLlegada: o.llegada ?? null,
      tallas: [
        { varianteId: `${id}-s`, talla: "S", pisoHoy: 0, almacenHoy: 1, apartadasHoy: 0, apartadasPisoHoy: 0, colgadas: [] },
        { varianteId: `${id}-m`, talla: "M", pisoHoy: 0, almacenHoy: (o.almacen ?? 2) - 1, apartadasHoy: 0, apartadasPisoHoy: 0, colgadas: [] },
      ],
      estado: { ...SEMAFORO, temporadaPasada: o.temporadaPasada ?? false },
    };
  };

  it("las que nunca se colgaron y esperan en el almacén, las más recién llegadas primero, una por talla", () => {
    const s = sinEstrenar([guardada("vieja", { llegada: "2026-08-01" }), guardada("nueva", { llegada: "2026-10-01" }), guardada("ya", { colgada: true })]);
    expect(s).toMatchObject({ prendas: 2, unidades: 4 });
    expect(s.lineas.map((l) => l.varianteId)).toEqual(["nueva-s", "nueva-m", "vieja-s", "vieja-m"]);
  });

  it("no se estrena lo que ya pasó de temporada", () => {
    expect(sinEstrenar([guardada("pasada", { temporadaPasada: true })]).prendas).toBe(0);
  });
});
