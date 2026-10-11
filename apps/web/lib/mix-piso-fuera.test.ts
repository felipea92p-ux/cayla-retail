import { describe, expect, it } from "vitest";
import { armarPropuesta, POCAS_PRENDAS, referenciaFueraDelRiel } from "./mix-piso";
import { SEDES_CON_MOSTRADOR_POR_CONFIRMAR, SEMANAS_DE_VENTA_FUERA_DEL_RIEL } from "./mix-piso-partida";
import type { LecturaDelPiso } from "./piso-plan";
import type { CategoriaMix, GrupoMix } from "./plan-piso-grupos";

// «Para empezar» de los grupos de fuera del riel (Felipe, 2026-10-11: «cuánto deberíamos incluir; asígname un estimado para empezar»). Las cifras de entrada son las de
// producción del 2026-10-11 (ventana 30-sep → 11-oct, 12 días): TRU 565 prendas vendidas, AQP 288 sin las bolsas de despacho.

const SEMANAS_ACC = SEMANAS_DE_VENTA_FUERA_DEL_RIEL.accesorios_de_impulso!;
const SEMANAS_BOL = SEMANAS_DE_VENTA_FUERA_DEL_RIEL.bolsos_y_calzado!;

describe("referenciaFueraDelRiel: lo que sostiene la venta, con el peso del riel", () => {
  it("TRU accesorios: 73 prendas en 12 días de 565 de la sede, meta 9–11 % → unas 115 a 190 con 3 a 5 semanas", () => {
    const r = referenciaFueraDelRiel({ ventas: 73, ventasDeLaSede: 565, dias: 12, meta: { desde: 9, hasta: 11 }, semanas: SEMANAS_ACC });
    expect(r).toMatchObject({ tipo: "rango", desde: 115, hasta: 190 });
    // la cuenta a mano: n_ef = 73 ÷ 1,5 = 48,7; peso = 48,7 ÷ 98,7 = 0,49; ritmo = 0,49 × 42,6 + 0,51 × 33,0 = 37,7 por semana
    if (r.tipo === "rango") {
      expect(r.peso).toBeCloseTo(0.49, 2);
      expect(r.porSemana).toBeCloseTo(37.7, 1);
    }
  });

  it("AQP accesorios: 54 de 288, meta 16–18 % → unas 90 a 150", () => {
    expect(referenciaFueraDelRiel({ ventas: 54, ventasDeLaSede: 288, dias: 12, meta: { desde: 16, hasta: 18 }, semanas: SEMANAS_ACC })).toMatchObject({ tipo: "rango", desde: 90, hasta: 150 });
  });

  it("bolsos y calzado (3 a 4 semanas): casi todo sale de la meta porque hay pocas ventas (11 en TRU, 12 en AQP)", () => {
    const tru = referenciaFueraDelRiel({ ventas: 11, ventasDeLaSede: 565, dias: 12, meta: { desde: 3, hasta: 5 }, semanas: SEMANAS_BOL });
    expect(tru).toMatchObject({ tipo: "rango", desde: 35, hasta: 50 });
    if (tru.tipo === "rango") expect(tru.peso).toBeLessThan(0.15);
    expect(referenciaFueraDelRiel({ ventas: 12, ventasDeLaSede: 288, dias: 12, meta: { desde: 6, hasta: 8 }, semanas: SEMANAS_BOL })).toMatchObject({ tipo: "rango", desde: 35, hasta: 45 });
  });

  it("sin ventas en la sede no hay ritmo: lo dice, nunca un número inventado (y LIM, además, no tiene confirmado el mostrador)", () => {
    expect(referenciaFueraDelRiel({ ventas: 0, ventasDeLaSede: 0, dias: 14, meta: { desde: 4, hasta: 6 }, semanas: SEMANAS_ACC })).toEqual({ tipo: "sin", motivo: "todavía sin ventas en esta sede" });
    const lim = referenciaFueraDelRiel({ ventas: 0, ventasDeLaSede: 0, dias: 14, meta: { desde: 4, hasta: 6 }, semanas: SEMANAS_ACC, mostradorPorConfirmar: true });
    expect(lim.tipo).toBe("sin");
    if (lim.tipo === "sin") expect(lim.motivo).toContain("mostrador");
    expect(referenciaFueraDelRiel({ ventas: 5, ventasDeLaSede: 100, dias: 0, meta: { desde: 4, hasta: 6 }, semanas: SEMANAS_ACC }).tipo).toBe("sin");
  });

  it("un grupo que no vendió nada pero la sede sí: la meta manda (peso 0) y el rango sale de la meta, no de un 0", () => {
    const r = referenciaFueraDelRiel({ ventas: 0, ventasDeLaSede: 280, dias: 14, meta: { desde: 9, hasta: 11 }, semanas: SEMANAS_ACC });
    expect(r).toMatchObject({ tipo: "rango", peso: 0, porSemana: 14 }); // 10 % de las 140 prendas por semana de la sede
    if (r.tipo === "rango") expect(r.desde).toBeGreaterThan(0);
  });

  it("lo vendido empuja el rango hacia su lado sin romperlo: por encima de lo que da la meta, más ventas suben el rango; por debajo, lo bajan, pero poco (la meta pesa)", () => {
    const con = (ventas: number) => referenciaFueraDelRiel({ ventas, ventasDeLaSede: 565, dias: 12, meta: { desde: 9, hasta: 11 }, semanas: SEMANAS_ACC });
    const rangos = [0, 5, 20, 40, 73, 150, 400, 5000].map(con);
    for (const r of rangos) {
      expect(r.tipo).toBe("rango");
      if (r.tipo !== "rango") continue;
      expect(r.desde).toBeLessThanOrEqual(r.hasta); // un rango siempre ordenado
      expect(r.peso).toBeLessThanOrEqual(0.75); // la venta nunca gobierna sola
    }
    const hastas = rangos.map((r) => (r.tipo === "rango" ? r.hasta : 0));
    // de 40 ventas hacia arriba (más que lo que da la meta: ≈ 33 por semana de 12 días = 56) cada tramo sube
    for (let i = 5; i < hastas.length; i++) expect(hastas[i]!).toBeGreaterThanOrEqual(hastas[i - 1]!);
    // por debajo de la meta, vender poco baja el rango menos de la mitad: con 5 ventas aún queda ≥ 60 % de lo que daría la meta sola
    expect(hastas[1]!).toBeGreaterThanOrEqual(hastas[0]! * 0.6);
    expect(hastas[1]!).toBeLessThanOrEqual(hastas[0]!);
  });

  it("los números se redondean a algo que se cuenta de cabeza: de a 5 desde 30, de a 1 por debajo", () => {
    const chico = referenciaFueraDelRiel({ ventas: 2, ventasDeLaSede: 50, dias: 14, meta: { desde: 4, hasta: 6 }, semanas: SEMANAS_ACC });
    if (chico.tipo === "rango") {
      expect(Number.isInteger(chico.desde)).toBe(true);
      expect(chico.hasta).toBeLessThan(30);
    }
    const grande = referenciaFueraDelRiel({ ventas: 73, ventasDeLaSede: 565, dias: 12, meta: { desde: 9, hasta: 11 }, semanas: SEMANAS_ACC });
    if (grande.tipo === "rango") {
      expect(grande.desde % 5).toBe(0);
      expect(grande.hasta % 5).toBe(0);
    }
  });

  it("una sede que vende muy poco no recibe «3 aretes»: con menos de 15 prendas se marca que manda el surtido", () => {
    const chica = referenciaFueraDelRiel({ ventas: 1, ventasDeLaSede: 40, dias: 14, meta: { desde: 4, hasta: 6 }, semanas: SEMANAS_ACC });
    expect(chica.tipo === "rango" && chica.pocas).toBe(true);
    const normal = referenciaFueraDelRiel({ ventas: 73, ventasDeLaSede: 565, dias: 12, meta: { desde: 9, hasta: 11 }, semanas: SEMANAS_ACC });
    expect(normal.tipo === "rango" && normal.pocas).toBe(false);
    expect(POCAS_PRENDAS).toBe(15);
  });

  it("las semanas de cobertura son criterio escrito: accesorios 3 a 5, bolsos y calzado 3 a 4 (un bolso inmoviliza cinco veces lo que un accesorio)", () => {
    expect(SEMANAS_ACC).toEqual({ desde: 3, hasta: 5 });
    expect(SEMANAS_BOL).toEqual({ desde: 3, hasta: 4 });
    expect(SEDES_CON_MOSTRADOR_POR_CONFIRMAR).toEqual(["lim"]);
  });
});

// ── Cableado dentro de `armarPropuesta` ───────────────────────────────────────────────────────────────────────────────────────

const GRUPOS: GrupoMix[] = [
  { clave: "polos_tops_blusas", nombre: "Polos, tops y blusas", rol: "destino", enRiel: true, orden: 10 },
  { clave: "jeans", nombre: "Jeans", rol: "destino", enRiel: true, orden: 20 },
  { clave: "pantalones_faldas_shorts", nombre: "Pantalones, faldas y shorts", rol: "rutina", enRiel: true, orden: 30 },
  { clave: "accesorios_de_impulso", nombre: "Accesorios de impulso y caja", rol: "conveniencia", enRiel: false, orden: 70 },
  { clave: "bolsos_y_calzado", nombre: "Bolsos y calzado", rol: "ocasional", enRiel: false, orden: 80 },
];
const CATEGORIAS: CategoriaMix[] = [
  ...GRUPOS.map((g) => ({ categoriaId: `c-${g.clave}`, categoria: g.nombre, prefijo: null, familia: "indumentaria", grupoClave: g.clave, confirmada: false, confirmadaEn: null, version: 1 })),
  { categoriaId: "c-suelta", categoria: "Accesorios de moda", prefijo: null, familia: "indumentaria", grupoClave: null, confirmada: false, confirmadaEn: null, version: 1 },
];

function lectura(ventas: Record<string, [number, number]>, extra: Partial<LecturaDelPiso> = {}): LecturaDelPiso {
  return {
    ubicacionId: "sede", separaPiso: true, cuadradoEn: null, hoy: "2026-10-11", dias: 12,
    tallas: [],
    ventas: Object.entries(ventas).map(([categoriaId, [escaneadas, anotadas]]) => ({ categoriaId, tallaId: null, talla: null, familiaColor: null, escaneadas, anotadas })),
    anotadasRecientes: [],
    curvas: [],
    ...extra,
  };
}
// TRU (cifras de producción, redondeadas): lo vendido por grupo = [confirmadas, sin registrar]
const TRU_VENTAS: Record<string, [number, number]> = {
  "c-polos_tops_blusas": [146, 108],
  "c-jeans": [7, 6],
  "c-pantalones_faldas_shorts": [21, 51],
  "c-accesorios_de_impulso": [6, 67],
  "c-bolsos_y_calzado": [4, 7],
  "c-suelta": [2, 3], // «Accesorios de moda»: no está en ningún grupo, pero es venta de la sede
};

describe("«Para empezar» dentro de la propuesta de una sede", () => {
  const tru = armarPropuesta({ grupos: GRUPOS, categorias: CATEGORIAS, lectura: lectura(TRU_VENTAS), capacidad: 600, codigoSede: "tru" });
  const acc = tru.fueraDelRiel.find((f) => f.grupo.clave === "accesorios_de_impulso")!;
  const bol = tru.fueraDelRiel.find((f) => f.grupo.clave === "bolsos_y_calzado")!;

  it("cuenta las ventas sin registrar de los grupos de fuera del riel (el riel sigue contando solo las confirmadas)", () => {
    expect(acc.ventasConfirmadas).toBe(6);
    expect(acc.ventasAnotadas).toBe(67);
    expect(bol.ventasAnotadas).toBe(7);
    expect(tru.ventasConfirmadasDelRiel).toBe(146 + 7 + 21);
    expect(tru.ventasAnotadasDelRiel).toBe(108 + 6 + 51);
  });

  it("las prendas vendidas de la sede suman TODO: riel, fuera del riel y categorías sin grupo", () => {
    expect(tru.ventasDeLaSede).toBe(146 + 108 + 7 + 6 + 21 + 51 + 6 + 67 + 4 + 7 + 2 + 3);
  });

  it("el % de venta de un grupo de fuera del riel es de las prendas vendidas de la sede, confirmadas y sin registrar (lo que se compara con la meta)", () => {
    expect(acc.ventaPctTotal).toBeCloseTo((73 / tru.ventasDeLaSede) * 100, 1);
    expect(acc.ventaPct).not.toBe(acc.ventaPctTotal); // el % de solo confirmadas no cambia
  });

  it("la referencia sale de la función pura con esos datos y la meta de la sede", () => {
    const esperada = referenciaFueraDelRiel({ ventas: 73, ventasDeLaSede: tru.ventasDeLaSede, dias: 12, meta: { desde: 9, hasta: 11 }, semanas: SEMANAS_ACC });
    expect(acc.referencia).toEqual(esperada);
    expect(acc.referencia?.tipo).toBe("rango");
  });

  it("LIM no lleva bolsos (sin referencia: la ficha dice «no lo lleva») y sus accesorios, sin ventas, dicen que falta confirmar el mostrador", () => {
    const lim = armarPropuesta({ grupos: GRUPOS, categorias: CATEGORIAS, lectura: lectura({}, { dias: 14 }), capacidad: 180, codigoSede: "lim" });
    const bolsos = lim.fueraDelRiel.find((f) => f.grupo.clave === "bolsos_y_calzado")!;
    expect(bolsos.noLoLleva).toBe(true);
    expect(bolsos.referencia).toBeNull();
    const accLim = lim.fueraDelRiel.find((f) => f.grupo.clave === "accesorios_de_impulso")!;
    expect(accLim.referencia?.tipo).toBe("sin");
    if (accLim.referencia?.tipo === "sin") expect(accLim.referencia.motivo).toContain("mostrador");
  });

  it("una sede sin punto de partida no recibe una referencia inventada", () => {
    const otra = armarPropuesta({ grupos: GRUPOS, categorias: CATEGORIAS, lectura: lectura(TRU_VENTAS), capacidad: 600, codigoSede: "xyz" });
    for (const f of otra.fueraDelRiel) expect(f.referencia).toBeNull();
  });

  it("no cambia nada de lo que ya calculaba: el reparto del riel sigue usando solo las confirmadas", () => {
    const sinAnotadas = armarPropuesta({ grupos: GRUPOS, categorias: CATEGORIAS, lectura: lectura(Object.fromEntries(Object.entries(TRU_VENTAS).map(([k, [c]]) => [k, [c, 0] as [number, number]]))), capacidad: 600, codigoSede: "tru" });
    expect(tru.enRiel.map((f) => f.propuestaPrendas)).toEqual(sinAnotadas.enRiel.map((f) => f.propuestaPrendas));
    expect(tru.pesoDeLaVenta).toBe(sinAnotadas.pesoDeLaVenta);
  });
});
