import { describe, expect, it } from "vitest";
import {
  armarPropuesta,
  EFECTO_DE_DISENO,
  pesoDeLaVenta,
  PESO_DE_LA_INDUSTRIA,
  PESO_MAXIMO_DE_LA_VENTA,
  rangoDeWilson,
  repartirEnPrendas,
  type EntradaMix,
} from "./mix-piso";
import { codigoDeSede, META_DE_VENTA_FUERA_DEL_RIEL, PARTIDA_DEL_RIEL } from "./mix-piso-partida";
import type { LecturaDelPiso } from "./piso-plan";
import type { CategoriaMix, GrupoMix } from "./plan-piso-grupos";

// Los 8 grupos de la migración y una categoría de ejemplo por grupo.
const GRUPOS: GrupoMix[] = [
  { clave: "polos_tops_blusas", nombre: "Polos, tops y blusas", rol: "destino", enRiel: true, orden: 10 },
  { clave: "jeans", nombre: "Jeans", rol: "destino", enRiel: true, orden: 20 },
  { clave: "pantalones_faldas_shorts", nombre: "Pantalones, faldas y shorts", rol: "rutina", enRiel: true, orden: 30 },
  { clave: "vestidos_conjuntos", nombre: "Vestidos, conjuntos y enterizos", rol: "ocasional", enRiel: true, orden: 40 },
  { clave: "bodys_corsets_lenceria", nombre: "Bodys, corsets y lencería", rol: "ocasional", enRiel: true, orden: 50 },
  { clave: "abrigo_y_capas", nombre: "Abrigo y capas", rol: "estacional", enRiel: true, orden: 60 },
  { clave: "accesorios_de_impulso", nombre: "Accesorios de impulso y caja", rol: "conveniencia", enRiel: false, orden: 70 },
  { clave: "bolsos_y_calzado", nombre: "Bolsos y calzado", rol: "ocasional", enRiel: false, orden: 80 },
];
const CAT = {
  pol: ["c-pol", "polos_tops_blusas"], jea: ["c-jea", "jeans"], pan: ["c-pan", "pantalones_faldas_shorts"], ves: ["c-ves", "vestidos_conjuntos"],
  bod: ["c-bod", "bodys_corsets_lenceria"], aba: ["c-aba", "abrigo_y_capas"], acc: ["c-acc", "accesorios_de_impulso"], bol: ["c-bol", "bolsos_y_calzado"],
  sin: ["c-sin", null],
} as const;
const CATEGORIAS: CategoriaMix[] = Object.values(CAT).map(([categoriaId, grupoClave], i) => ({
  categoriaId, categoria: `Categoría ${i}`, prefijo: null, familia: "indumentaria", grupoClave, confirmada: true, confirmadaEn: null, version: 1,
}));

type Colgada = [keyof typeof CAT, number];
type Venta = [keyof typeof CAT, number, number?];
function lectura(colgadas: Colgada[], ventas: Venta[], extra: Partial<LecturaDelPiso> = {}): LecturaDelPiso {
  return {
    ubicacionId: "sede", separaPiso: true, cuadradoEn: "2026-10-01T15:00:00+00:00", hoy: "2026-10-05", dias: 14,
    tallas: colgadas.map(([c, n], i) => ({
      varianteId: `v${i}`, productoId: `p${i}`, referencia: "R", categoriaId: CAT[c][0], tallaId: null, talla: null, colorCodigo: null, color: null,
      colorHex: null, familiaColor: null, retirada: false, fotoUrl: null, pisoLibre: n, almacenLibre: 0, enCamino: 0, vendidasHoy: 0, vendidasAyer: 0, vendidas14: 0,
    })),
    ventas: ventas.map(([c, escaneadas, anotadas = 0]) => ({ categoriaId: CAT[c][0], tallaId: null, talla: null, familiaColor: null, escaneadas, anotadas })),
    anotadasRecientes: [],
    curvas: [],
    ...extra,
  };
}
const entrada = (l: LecturaDelPiso, extra: Partial<EntradaMix> = {}): EntradaMix => ({ grupos: GRUPOS, categorias: CATEGORIAS, lectura: l, capacidad: 600, codigoSede: "tru", ...extra });
const pct = (p: ReturnType<typeof armarPropuesta>) => Object.fromEntries(p.enRiel.map((f) => [f.grupo.clave, f.propuestaPct]));
const prendas = (p: ReturnType<typeof armarPropuesta>) => Object.fromEntries(p.enRiel.map((f) => [f.grupo.clave, f.propuestaPrendas]));
const suma = (xs: (number | null)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0);

describe("el punto de partida de la industria (la propuesta del 4 de octubre)", () => {
  it("cada sede suma 100 % del riel", () => {
    for (const sede of ["tru", "aqp", "lim"] as const) expect(suma(Object.values(PARTIDA_DEL_RIEL[sede]))).toBe(100);
  });

  it("solo las tres tiendas tienen punto de partida; cualquier otra no recibe uno inventado", () => {
    expect(codigoDeSede("TRU")).toBe("tru");
    expect(codigoDeSede("aqp")).toBe("aqp");
    expect(codigoDeSede("lim")).toBe("lim");
    expect(codigoDeSede("ten")).toBeNull();
    expect(codigoDeSede(null)).toBeNull();
    expect(codigoDeSede("")).toBeNull();
  });

  it("los grupos de fuera del riel tienen su meta de venta en cada sede (LIM no lleva bolsos ni calzado)", () => {
    expect(META_DE_VENTA_FUERA_DEL_RIEL.lim.bolsos_y_calzado).toBeNull();
    expect(META_DE_VENTA_FUERA_DEL_RIEL.tru.accesorios_de_impulso).toEqual({ desde: 9, hasta: 11 });
  });
});

describe("repartir las prendas con el método del resto mayor", () => {
  it("la suma sale EXACTA y ninguna parte difiere de su proporción en más de una prenda (200 repartos al azar)", () => {
    // Un generador fijo (LCG): la prueba no usa azar real, siempre recorre los mismos 200 casos.
    let semilla = 12345;
    const azar = () => ((semilla = (semilla * 1664525 + 1013904223) % 4294967296) / 4294967296);
    for (let caso = 0; caso < 200; caso++) {
      const k = 2 + Math.floor(azar() * 7);
      const crudas = Array.from({ length: k }, () => azar() + 0.01);
      const total = crudas.reduce((a, b) => a + b, 0);
      const fracciones = crudas.map((x) => x / total);
      const prendasTotales = 1 + Math.floor(azar() * 2000);
      const reparto = repartirEnPrendas(fracciones, prendasTotales);
      expect(reparto.reduce((a, b) => a + b, 0), `caso ${caso}`).toBe(prendasTotales);
      reparto.forEach((n, i) => expect(Math.abs(n - fracciones[i]! * prendasTotales), `caso ${caso} parte ${i}`).toBeLessThan(1));
    }
  });

  it("los empates los gana el primero de la lista y un grupo con 0 % recibe 0", () => {
    expect(repartirEnPrendas([1 / 3, 1 / 3, 1 / 3], 100)).toEqual([34, 33, 33]);
    expect(repartirEnPrendas([0.5, 0.5, 0], 7)).toEqual([4, 3, 0]);
  });
});

describe("cuánto pesa la venta propia", () => {
  it("sin ventas confirmadas pesa 0: la propuesta es la de la industria, tal cual", () => {
    expect(pesoDeLaVenta(0)).toEqual({ muestraEfectiva: 0, peso: 0 });
  });

  it("es n_ef ÷ (n_ef + n₀) con la muestra efectiva en prendas, y con techo", () => {
    expect(pesoDeLaVenta(75).muestraEfectiva).toBeCloseTo(75 / EFECTO_DE_DISENO, 10);
    expect(pesoDeLaVenta(EFECTO_DE_DISENO * PESO_DE_LA_INDUSTRIA).peso).toBeCloseTo(0.5, 10); // la venta vale lo mismo que la industria
    expect(pesoDeLaVenta(1_000_000).peso).toBe(PESO_MAXIMO_DE_LA_VENTA);
  });

  it("crece con las ventas pero nunca baja ni pasa del techo", () => {
    let anterior = 0;
    for (const n of [0, 1, 5, 20, 75, 200, 1000, 10_000]) {
      const { peso } = pesoDeLaVenta(n);
      expect(peso).toBeGreaterThanOrEqual(anterior);
      expect(peso).toBeLessThanOrEqual(PESO_MAXIMO_DE_LA_VENTA);
      anterior = peso;
    }
  });
});

describe("la propuesta de TRU", () => {
  it("sin ventas confirmadas es EXACTAMENTE la partida de la industria, repartida en las 600 prendas", () => {
    const p = armarPropuesta(entrada(lectura([["pol", 100]], [])));
    expect(pct(p)).toEqual({ polos_tops_blusas: 48, jeans: 9, pantalones_faldas_shorts: 20, vestidos_conjuntos: 12, bodys_corsets_lenceria: 6, abrigo_y_capas: 5 });
    expect(prendas(p)).toEqual({ polos_tops_blusas: 288, jeans: 54, pantalones_faldas_shorts: 120, vestidos_conjuntos: 72, bodys_corsets_lenceria: 36, abrigo_y_capas: 30 });
    expect(p.pesoDeLaVenta).toBe(0);
    expect(p.motivoSinPropuesta).toBeNull();
  });

  it("con 75 ventas confirmadas (peso 50 %) la propuesta está a mitad de camino entre la industria y la venta", () => {
    // 60 de las 75 son de polos (80 %): 0,5 × 80 + 0,5 × 48 = 64 %; jeans no vendió: 0,5 × 0 + 0,5 × 9 = 4,5 %.
    const p = armarPropuesta(entrada(lectura([["pol", 100]], [["pol", 60], ["pan", 15]])));
    expect(p.pesoDeLaVenta).toBeCloseTo(0.5, 10);
    expect(pct(p).polos_tops_blusas).toBe(64);
    expect(pct(p).jeans).toBe(4.5);
    // Pantalones: 15 de 75 ventas = 20 % de la venta; 0,5 × 20 + 0,5 × 20 = 20 (la venta coincide con la industria).
    expect(pct(p).pantalones_faldas_shorts).toBe(20);
    expect(suma(Object.values(pct(p)))).toBeCloseTo(100, 5);
    expect(suma(Object.values(prendas(p)))).toBe(600);
  });

  it("las ventas «sin registrar» NO mueven la propuesta (la categoría la puso alguien a mano), pero se cuentan aparte", () => {
    const p = armarPropuesta(entrada(lectura([["pol", 100]], [["pol", 0, 70]])));
    expect(p.pesoDeLaVenta).toBe(0);
    expect(pct(p).polos_tops_blusas).toBe(48);
    expect(p.ventasAnotadasDelRiel).toBe(70);
    expect(p.enRiel.find((f) => f.grupo.clave === "polos_tops_blusas")?.ventasAnotadas).toBe(70);
  });

  it("la venta nunca gobierna sola: con miles de ventas el peso se queda en el techo", () => {
    const p = armarPropuesta(entrada(lectura([["pol", 100]], [["pol", 6000], ["pan", 4000]])));
    expect(p.pesoDeLaVenta).toBe(PESO_MAXIMO_DE_LA_VENTA);
    // polos: 0,75 × 60 + 0,25 × 48 = 57 %; jeans: 0,75 × 0 + 0,25 × 9 = 2,25 → 2,3 (redondeo a un decimal).
    expect(pct(p).polos_tops_blusas).toBe(57);
    expect(pct(p).jeans).toBeCloseTo(2.3, 1);
  });

  it("dice entre qué porcentajes estaría la venta real de cada grupo (Wilson al 95 % con la muestra efectiva)", () => {
    const p = armarPropuesta(entrada(lectura([["pol", 100]], [["pol", 60], ["pan", 15]])));
    const polos = p.enRiel.find((f) => f.grupo.clave === "polos_tops_blusas")!;
    expect(polos.ventaPct).toBe(80);
    // n_ef = 75 ÷ 1,5 = 50 y p = 0,8: el intervalo de Wilson es 67,0 a 88,8 (no es simétrico alrededor del 80).
    expect(polos.rangoDeVenta).toEqual({ desde: 67, hasta: 88.8 });
  });

  it("un grupo que no vendió NO sale «0 % ± 0»: su rango llega hasta ≈ 7 % (con tan pocas ventas, no se sabe que no se vende)", () => {
    const p = armarPropuesta(entrada(lectura([["pol", 100]], [["pol", 60], ["pan", 15]])));
    const jeans = p.enRiel.find((f) => f.grupo.clave === "jeans")!;
    expect(jeans.ventaPct).toBe(0);
    expect(jeans.rangoDeVenta).toEqual({ desde: 0, hasta: 7.1 });
  });

  it("el intervalo de Wilson nunca se sale de 0–100 y se ensancha cuando hay menos ventas", () => {
    for (const p of [0, 0.01, 0.5, 0.99, 1]) {
      for (const nEf of [1, 5, 50, 500]) {
        const r = rangoDeWilson(p, nEf);
        expect(r.desde).toBeGreaterThanOrEqual(0);
        expect(r.hasta).toBeLessThanOrEqual(100);
        expect(r.desde).toBeLessThanOrEqual(p * 100 + 0.1);
        expect(r.hasta).toBeGreaterThanOrEqual(p * 100 - 0.1);
      }
    }
    const ancho = (n: number) => { const r = rangoDeWilson(0.3, n); return r.hasta - r.desde; };
    expect(ancho(10)).toBeGreaterThan(ancho(100));
    expect(ancho(100)).toBeGreaterThan(ancho(1000));
  });

  it("sin ninguna venta confirmada no hay % de venta ni margen: se dice «sin datos», no 0", () => {
    const p = armarPropuesta(entrada(lectura([["pol", 100]], [])));
    for (const f of p.enRiel) {
      expect(f.ventaPct).toBeNull();
      expect(f.rangoDeVenta).toBeNull();
    }
  });
});

describe("lo que cuelga hoy frente a la propuesta", () => {
  it("el % de hoy es de lo colgado en el riel y la diferencia es propuesta − colgadas (positivo = faltan)", () => {
    const p = armarPropuesta(entrada(lectura([["pol", 200], ["jea", 50], ["aba", 50]], [])));
    const polos = p.enRiel.find((f) => f.grupo.clave === "polos_tops_blusas")!;
    expect(p.colgadasEnElRiel).toBe(300);
    expect(polos.colgadas).toBe(200);
    expect(polos.hoyPct).toBeCloseTo(66.7, 1);
    expect(polos.diferencia).toBe(288 - 200);
    expect(p.enRiel.find((f) => f.grupo.clave === "abrigo_y_capas")!.diferencia).toBe(30 - 50);
  });

  it("lo colgado de los grupos de fuera del riel no cuenta como riel (los accesorios no ocupan percha)", () => {
    const p = armarPropuesta(entrada(lectura([["pol", 100], ["acc", 40], ["bol", 20]], [])));
    expect(p.colgadasEnElRiel).toBe(100);
    expect(p.fueraDelRiel.find((f) => f.grupo.clave === "accesorios_de_impulso")?.colgadas).toBe(40);
  });

  it("una categoría sin grupo no entra al reparto, pero se dice cuánto cuelga y cuánto vendió", () => {
    const p = armarPropuesta(entrada(lectura([["pol", 100], ["sin", 30]], [["sin", 12], ["pol", 5]])));
    expect(p.colgadasEnElRiel).toBe(100);
    expect(p.sinGrupo).toEqual({ colgadas: 30, ventasConfirmadas: 12, categorias: 1 });
    expect(p.ventasConfirmadasDelRiel).toBe(5);
  });

  it("una categoría cuyo grupo ya no existe en la lista cuenta como sin grupo (no se esconde)", () => {
    const p = armarPropuesta(entrada(lectura([["pol", 100]], []), { categorias: CATEGORIAS.map((c) => (c.categoriaId === "c-pol" ? { ...c, grupoClave: "grupo_borrado" } : c)) }));
    expect(p.sinGrupo.colgadas).toBe(100);
    expect(p.colgadasEnElRiel).toBe(0);
    expect(p.enRiel.every((f) => f.hoyPct === null)).toBe(true);
  });

  it("lo que dice el sistema que cuelga es poco confiable hasta que la sede cuadre su piso", () => {
    expect(armarPropuesta(entrada(lectura([["pol", 100]], []))).cuadrado).toBe(true);
    expect(armarPropuesta(entrada(lectura([["pol", 100]], [], { cuadradoEn: null }))).cuadrado).toBe(false);
  });

  it("una cantidad negativa de piso (un descuadre) no resta: se cuenta como 0", () => {
    const p = armarPropuesta(entrada(lectura([["pol", 100], ["jea", -5]], [])));
    expect(p.colgadasEnElRiel).toBe(100);
  });
});

describe("las otras sedes y lo que se degrada", () => {
  it("LIM (un stand de 180 prendas) solo lleva destino y lo que llega al mínimo: los demás grupos reciben 0", () => {
    const p = armarPropuesta(entrada(lectura([["pol", 50]], []), { codigoSede: "lim", capacidad: 180 }));
    expect(prendas(p)).toEqual({ polos_tops_blusas: 99, jeans: 36, pantalones_faldas_shorts: 45, vestidos_conjuntos: 0, bodys_corsets_lenceria: 0, abrigo_y_capas: 0 });
    expect(p.fueraDelRiel.find((f) => f.grupo.clave === "bolsos_y_calzado")?.noLoLleva).toBe(true);
  });

  it("AQP lleva el doble de abrigo que TRU (el clima), y suma sus 1800 prendas", () => {
    const p = armarPropuesta(entrada(lectura([["pol", 50]], []), { codigoSede: "aqp", capacidad: 1800 }));
    expect(pct(p).abrigo_y_capas).toBe(12);
    expect(suma(Object.values(prendas(p)))).toBe(1800);
  });

  it("una sede sin punto de partida no recibe propuesta: dice por qué, y lo de hoy sigue a la vista", () => {
    const p = armarPropuesta(entrada(lectura([["pol", 80]], []), { codigoSede: "ten" }));
    expect(p.motivoSinPropuesta).toContain("punto de partida");
    expect(p.enRiel.every((f) => f.propuestaPct === null && f.propuestaPrendas === null && f.diferencia === null)).toBe(true);
    expect(p.enRiel.find((f) => f.grupo.clave === "polos_tops_blusas")?.colgadas).toBe(80);
  });

  it("el Taller (sin piso de venta) no tiene plan del piso", () => {
    const p = armarPropuesta(entrada(lectura([], [], { separaPiso: false })));
    expect(p.motivoSinPropuesta).toContain("no tiene piso de venta");
    expect(p.enRiel.every((f) => f.propuestaPct === null)).toBe(true);
  });

  it("sin capacidad conocida hay % pero no prendas (nunca una capacidad inventada)", () => {
    const p = armarPropuesta(entrada(lectura([["pol", 100]], []), { capacidad: null }));
    expect(pct(p).polos_tops_blusas).toBe(48);
    expect(p.enRiel.every((f) => f.propuestaPrendas === null && f.diferencia === null)).toBe(true);
    expect(p.capacidad).toBeNull();
  });

  it("los grupos de fuera del riel miden su % de la venta total confirmada y traen su meta", () => {
    const p = armarPropuesta(entrada(lectura([["pol", 100]], [["pol", 80], ["acc", 15], ["bol", 5]])));
    const acc = p.fueraDelRiel.find((f) => f.grupo.clave === "accesorios_de_impulso")!;
    expect(acc.ventaPct).toBe(15);
    expect(acc.meta).toEqual({ desde: 9, hasta: 11 });
    // Para la propuesta del riel solo cuentan las ventas del riel: 80 de 80.
    expect(p.ventasConfirmadasDelRiel).toBe(80);
  });
});
