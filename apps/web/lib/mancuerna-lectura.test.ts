import { describe, expect, it } from "vitest";
import { armarPropuesta, type PropuestaMix } from "./mix-piso";
import type { LecturaDelPiso } from "./piso-plan";
import type { CategoriaMix, GrupoMix } from "./plan-piso-grupos";
import { etiquetasDeFila, lecturaDeFila, resumenDeFila, SEPARACION_MINIMA, TIPOS_DE_MARCA, type TipoMarca } from "./mancuerna-lectura";

// La propuesta real de AQP (la de la captura de Felipe): 78 colgadas de 1,800, 5 ventas confirmadas y 210 sin registrar, sin cuadrar.
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
const CLAVES = GRUPOS.map((g) => g.clave);
const CATEGORIAS: CategoriaMix[] = CLAVES.map((clave, i) => ({ categoriaId: `c-${clave}`, categoria: `Categoría ${i}`, prefijo: null, familia: "indumentaria", grupoClave: clave, confirmada: false, confirmadaEn: null, version: 1 }));
const COLGADAS: Record<string, number> = { polos_tops_blusas: 30, jeans: 3, pantalones_faldas_shorts: 14, vestidos_conjuntos: 9, bodys_corsets_lenceria: 6, abrigo_y_capas: 16 };
const CONFIRMADAS: Record<string, number> = { polos_tops_blusas: 2, pantalones_faldas_shorts: 1, vestidos_conjuntos: 1, abrigo_y_capas: 1 };

function aqp(extra: Partial<LecturaDelPiso> = {}): PropuestaMix {
  const lectura: LecturaDelPiso = {
    ubicacionId: "sede", separaPiso: true, cuadradoEn: null, hoy: "2026-10-10", dias: 14,
    tallas: CLAVES.map((clave, i) => ({ varianteId: `v${i}`, productoId: `p${i}`, referencia: "R", categoriaId: `c-${clave}`, tallaId: null, talla: null, colorCodigo: null, color: null, colorHex: null, familiaColor: null, retirada: false, fotoUrl: null, pisoLibre: COLGADAS[clave] ?? 0, almacenLibre: 0, enCamino: 0, vendidasHoy: 0, vendidasAyer: 0, vendidas14: 0 })),
    ventas: CLAVES.map((clave) => ({ categoriaId: `c-${clave}`, tallaId: null, talla: null, familiaColor: null, escaneadas: CONFIRMADAS[clave] ?? 0, anotadas: 0 })),
    anotadasRecientes: [],
    curvas: [],
    ...extra,
  };
  return armarPropuesta({ grupos: GRUPOS, categorias: CATEGORIAS, lectura, capacidad: 1800, codigoSede: "aqp" });
}

describe("las etiquetas sobre la pista de cada fila", () => {
  it("una etiqueta por marca cuando están lejos, alternando arriba y abajo, de izquierda a derecha", () => {
    const e = etiquetasDeFila({ hoy: 10, partida: 30, ventas: 50, propuesta: 70 }, 100);
    expect(e.map((x) => x.partes.map((p) => p.tipo))).toEqual([["hoy"], ["partida"], ["ventas"], ["propuesta"]]);
    expect(e.map((x) => x.carril)).toEqual(["arriba", "abajo", "arriba", "abajo"]);
    expect(e.map((x) => x.pos)).toEqual([10, 30, 50, 70]);
    expect(e[0]!.partes[0]!.texto).toBe("10");
  });

  it("las marcas que caen casi en el mismo punto comparten UNA etiqueta (el caso de Polos: hoy 47.6 y punto de partida 48)", () => {
    const e = etiquetasDeFila({ hoy: 47.6, partida: 48, ventas: 64.8, propuesta: 60.8 }, 80);
    expect(e).toHaveLength(2);
    expect(e[0]!.partes.map((p) => p.tipo)).toEqual(["hoy", "partida"]);
    expect(e[0]!.partes.map((p) => p.texto)).toEqual(["47.6", "48"]);
    expect(e[1]!.partes.map((p) => p.tipo)).toEqual(["propuesta", "ventas"]);
    expect(e[0]!.pos).toBeCloseTo(((47.6 + 48) / 2 / 80) * 100, 9);
  });

  it("una marca sin valor no tiene etiqueta, y sin ninguna valor no hay nada que mostrar", () => {
    expect(etiquetasDeFila({ hoy: null, partida: undefined, ventas: 12, propuesta: null }, 100).flatMap((x) => x.partes.map((p) => p.tipo))).toEqual(["ventas"]);
    expect(etiquetasDeFila({}, 100)).toEqual([]);
    expect(etiquetasDeFila({ hoy: Number.NaN, propuesta: Number.POSITIVE_INFINITY }, 100)).toEqual([]);
  });

  it("lo que se sale del eje queda en su borde, no fuera de la tarjeta", () => {
    const e = etiquetasDeFila({ propuesta: 140 }, 100);
    expect(e[0]!.pos).toBe(100);
    expect(e[0]!.partes[0]!.texto).toBe("140");
  });

  it("siempre: cada marca con valor sale exactamente una vez, dos etiquetas nunca están a menos de una separación y dos del mismo carril, a menos de dos", () => {
    const pasos = [0, 3, 8, 14, 15.5, 22, 40, 41, 49, 63, 80];
    let casos = 0;
    for (const a of pasos) for (const b of pasos) for (const c of pasos) for (const d of pasos) {
      const valores: Record<TipoMarca, number> = { hoy: a, partida: b, ventas: c, propuesta: d };
      const e = etiquetasDeFila(valores, 80);
      casos++;
      const vistos = e.flatMap((x) => x.partes.map((p) => p.tipo)).sort();
      expect(vistos, JSON.stringify(valores)).toEqual([...TIPOS_DE_MARCA].sort());
      for (let i = 1; i < e.length; i++) {
        const dist = e[i]!.pos - e[i - 1]!.pos;
        // el centro de una etiqueta que junta varias queda dentro del grupo: la distancia entre centros nunca baja de lo que separa a las marcas de los bordes
        expect(dist, JSON.stringify(valores)).toBeGreaterThan(0);
      }
      const carriles = { arriba: [] as number[], abajo: [] as number[] };
      for (const x of e) carriles[x.carril].push(x.pos);
      for (const lista of Object.values(carriles)) for (let i = 1; i < lista.length; i++) expect(lista[i]! - lista[i - 1]!, JSON.stringify(valores)).toBeGreaterThanOrEqual(SEPARACION_MINIMA);
    }
    expect(casos).toBe(pasos.length ** 4);
  });
});

describe("la lectura de un grupo al pasar el cursor", () => {
  const p = aqp();
  const polos = p.enRiel[0]!;

  it("trae las cuatro cifras de AQP, en el orden en que se leen, con lo que las respalda", () => {
    const l = lecturaDeFila(polos, p);
    expect(l.nombre).toBe("Polos, tops y blusas");
    expect(l.cifras.map((c) => c.tipo)).toEqual(["hoy", "partida", "ventas", "propuesta"]);
    expect(l.cifras.map((c) => c.titulo)).toEqual(["Hoy", "Punto de partida", "Tus ventas", "Propuesta"]);
    expect(l.cifras[0]).toMatchObject({ valor: "38.5 %", detalle: "30 prendas según el sistema" });
    expect(l.cifras[1]).toMatchObject({ valor: "44 %", detalle: "unas 792 prendas" });
    expect(l.cifras[2]!.valor).toBe("40 %");
    expect(l.cifras[2]!.detalle).toBe("entre 9.1 y 81.6 · 2 ventas");
    expect(l.cifras[3]).toMatchObject({ valor: "43.8 %", detalle: "788 prendas" });
  });

  it("sin cuadrar la frase dice «por cuadrar» y «hoy» lo dice; cuadrada, dice qué falta", () => {
    expect(lecturaDeFila(polos, p).frase?.texto).toContain("Por cuadrar");
    const cuadrada = aqp({ cuadradoEn: "2026-10-01T15:00:00+00:00" });
    const l = lecturaDeFila(cuadrada.enRiel[0]!, cuadrada);
    expect(l.cifras[0]!.detalle).toBe("30 prendas");
    expect(l.frase?.texto).toMatch(/^Faltan 758/);
  });

  it("una cifra que no se puede calcular se dice («—» y su motivo), nunca un 0 inventado", () => {
    const sinVentas = aqp({ ventas: [] });
    const f = sinVentas.enRiel[1]!;
    const l = lecturaDeFila(f, sinVentas);
    expect(l.cifras[2]).toMatchObject({ valor: "—", detalle: "todavía sin ventas confirmadas" });
    const sinCap = lecturaDeFila(polos, { cuadrado: false, capacidad: null });
    expect(sinCap.cifras[1]!.detalle).toBeNull();
    expect(lecturaDeFila({ ...polos, partidaPct: null, propuestaPct: null, propuestaPrendas: null }, p).cifras.map((c) => c.valor)).toEqual(["38.5 %", "—", "40 %", "—"]);
  });

  it("el resumen para el lector de pantalla trae las cuatro cifras y la frase", () => {
    const r = resumenDeFila(lecturaDeFila(polos, p));
    expect(r).toContain("Polos, tops y blusas: hoy 38.5 % (30 prendas según el sistema); punto de partida 44 %");
    expect(r).toContain("tus ventas 40 % (entre 9.1 y 81.6 · 2 ventas); propuesta 43.8 % (788 prendas).");
    expect(r).toContain("Por cuadrar");
  });
});
