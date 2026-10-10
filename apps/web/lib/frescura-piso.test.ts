import { describe, expect, it } from "vitest";
import type { EstadoFrescura, FrescuraPrenda, UnidadColgada } from "./frescura-reglas";
import { pisoPorFamilia, porcentajes, respuestaDelPiso, solesEnteros, tramosDeLaPrenda, conteoVacio, type Familia } from "./frescura-piso";

// La barra de la tienda (ADR-0208, act. 2026-10-10 (b)): cada unidad colgada cae en Fresca, Vigente, Envejeciendo o «Aún no se sabe»
// con los dos relojes, la barra va por familia y nada sale del denominador.

const D = 86_400;
// Polos: la mitad se vende en 9 días, 3 de cada 4 en 11, 9 de cada 10 en 13.
const POLOS = { cortes: { p50: 9 * D, p75: 11 * D, p90: 13 * D }, tMax: 20 * D, vendidas: 24 };
const SEMAFORO: EstadoFrescura = { tipo: "semaforo", tramo: "vigente", alMenos: false, temporadaPasada: false, sinTemporada: false, quieta: false, sugerencias: [] };
const tanda = (dias: number, unidades = 1, edadDesconocida = false): UnidadColgada => ({ segundos: dias * D, unidades, edadDesconocida });

function prenda(o: { modelo: number; alMenos?: boolean; colgadas: UnidadColgada[]; piso?: number; estado?: EstadoFrescura; categoriaId?: string; varianteId?: string }): FrescuraPrenda {
  const piso = o.piso ?? o.colgadas.reduce((s, u) => s + u.unidades, 0);
  const varianteId = o.varianteId ?? "v1";
  return {
    clave: `${varianteId}|NEG`,
    productoId: varianteId,
    productoNombre: "Polo",
    codigo: null,
    colorCodigo: "NEG",
    colorNombre: "Negro",
    categoriaId: o.categoriaId ?? "polos",
    categoriaNombre: "Polos",
    tallas: [{ varianteId, talla: "M", pisoHoy: piso, almacenHoy: 0, apartadasHoy: 0, apartadasPisoHoy: 0, colgadas: o.colgadas }],
    pisoHoy: piso,
    almacenHoy: 0,
    apartadasHoy: 0,
    apartadasPisoHoy: 0,
    reloj: { segundos: o.modelo * D, alMenos: o.alMenos ?? false },
    relojUnidad: { segundos: Math.max(0, ...o.colgadas.map((u) => u.segundos)), alMenos: o.colgadas.some((u) => u.edadDesconocida) },
    primeraExhibicion: null,
    ultimaLlegada: null,
    ultimaLlegadaCayla: null,
    temporada: "verano",
    temporadaOrigen: "producto",
    esClasico: o.estado?.tipo === "clasico",
    finEstacion: null,
    rapidez: null,
    ventasRecientes: 0,
    categoriaSinElla: o.estado && o.estado.tipo !== "semaforo" && o.estado.tipo !== "sin_edad_conocida" ? null : POLOS,
    juzgadaContra: "sede",
    varaDelMes: true,
    estado: o.estado ?? SEMAFORO,
    porDecidir: false,
    decision: null,
  };
}

describe("tramosDeLaPrenda: dónde cae cada unidad colgada", () => {
  it("un modelo de 8 días (Polos vende la mitad en 9) es Fresco entero", () => {
    expect(tramosDeLaPrenda(prenda({ modelo: 8, colgadas: [tanda(8, 2)] })).unidades).toMatchObject({ fresca: 2, vigente: 0, envejeciendo: 0 });
  });

  it("un modelo de 40 días con una unidad de 20 y dos repuestas ayer: 1 Envejeciendo y 2 Vigentes", () => {
    expect(tramosDeLaPrenda(prenda({ modelo: 40, colgadas: [tanda(20), tanda(1, 2)] })).unidades).toMatchObject({ fresca: 0, vigente: 2, envejeciendo: 1, sin_saber: 0 });
  });

  it("lo que entró sin fecha: si sus días ya pasaron P75 envejece; si no, aún no se sabe", () => {
    expect(tramosDeLaPrenda(prenda({ modelo: 3, alMenos: true, colgadas: [tanda(3, 2, true)] })).unidades).toMatchObject({ sin_saber: 2, fresca: 0 });
    expect(tramosDeLaPrenda(prenda({ modelo: 15, alMenos: true, colgadas: [tanda(15, 1, true)] })).unidades).toMatchObject({ envejeciendo: 1 });
  });

  it("modelo sin fecha que no se sabe si pasó la mitad: lo colgado hace poco aún no se sabe; lo de 10 días ya es Vigente", () => {
    expect(tramosDeLaPrenda(prenda({ modelo: 3, alMenos: true, colgadas: [tanda(2)] })).unidades).toMatchObject({ sin_saber: 1 });
    expect(tramosDeLaPrenda(prenda({ modelo: 10, alMenos: true, colgadas: [tanda(10)] })).unidades).toMatchObject({ vigente: 1 });
  });

  it("el clásico va aparte; lo que no se juzga (sin ritmo, no cuadra) aún no se sabe", () => {
    expect(tramosDeLaPrenda(prenda({ modelo: 40, colgadas: [tanda(40)], estado: { ...SEMAFORO, tipo: "clasico", fueraDeSuEstacion: false } })).unidades).toMatchObject({ clasico: 1 });
    expect(tramosDeLaPrenda(prenda({ modelo: 40, colgadas: [tanda(40)], estado: { ...SEMAFORO, tipo: "sin_vara" } })).unidades).toMatchObject({ sin_saber: 1 });
    expect(tramosDeLaPrenda(prenda({ modelo: 40, colgadas: [], piso: 2, estado: { ...SEMAFORO, tipo: "dudosa" } })).unidades).toMatchObject({ sin_saber: 2 });
  });

  it("suma siempre lo que dice el stock: lo que el libro no trae aún no se sabe; lo que trae de más se corta por lo más viejo", () => {
    expect(tramosDeLaPrenda(prenda({ modelo: 40, colgadas: [tanda(20)], piso: 3 })).unidades).toMatchObject({ envejeciendo: 1, sin_saber: 2 });
    expect(tramosDeLaPrenda(prenda({ modelo: 40, colgadas: [tanda(1, 2), tanda(20, 2)], piso: 3 })).unidades).toMatchObject({ envejeciendo: 2, vigente: 1 });
  });

  it("los soles salen del precio de cada talla; lo que no tiene precio se cuenta aparte", () => {
    const t = tramosDeLaPrenda(prenda({ modelo: 40, colgadas: [tanda(20), tanda(1, 2)] }), () => 50);
    expect(t.soles).toMatchObject({ envejeciendo: 50, vigente: 100 });
    expect(tramosDeLaPrenda(prenda({ modelo: 8, colgadas: [tanda(8, 2)] }), () => null).sinPrecio).toBe(2);
  });
});

describe("pisoPorFamilia", () => {
  const FAMILIAS: Familia[] = [
    { codigo: "indumentaria", nombre: "Indumentaria", orden: 10 },
    { codigo: "accesorios", nombre: "Accesorios y Complementos", orden: 30 },
    { codigo: "bisuteria", nombre: "Bisutería", orden: 40 },
  ];
  const familiaDe = (cat: string) => ({ polos: "indumentaria", anillos: "bisuteria", raro: "ya_no_existe" })[cat] ?? null;
  const prendas = [
    prenda({ modelo: 8, colgadas: [tanda(8, 2)], varianteId: "a" }),
    prenda({ modelo: 40, colgadas: [tanda(20), tanda(1, 2)], varianteId: "b" }),
    prenda({ modelo: 3, alMenos: true, colgadas: [tanda(3, 5, true)], categoriaId: "anillos", varianteId: "c" }),
    prenda({ modelo: 40, colgadas: [tanda(40)], estado: { ...SEMAFORO, tipo: "clasico", fueraDeSuEstacion: false }, varianteId: "d" }),
    prenda({ modelo: 8, colgadas: [tanda(8)], categoriaId: "raro", varianteId: "e" }),
    prenda({ modelo: 8, colgadas: [], piso: 0, varianteId: "f" }),
  ];

  it("una barra por familia en su orden, Indumentaria arriba y lo que no tiene familia al final; los clásicos fuera del 100 %", () => {
    const piso = pisoPorFamilia(prendas, { familiaDe, familias: FAMILIAS });
    expect(piso.map((f) => f.nombre)).toEqual(["Indumentaria", "Bisutería", "Otras"]);
    expect(piso[0]).toMatchObject({ total: 5, prendas: 3, unidades: { fresca: 2, vigente: 2, envejeciendo: 1, sin_saber: 0, clasico: 1 } });
    expect(piso[1]).toMatchObject({ codigo: "bisuteria", total: 5, unidades: { sin_saber: 5 } });
    expect(piso[2]).toMatchObject({ codigo: null, total: 1 });
  });

  it("con precios, los soles por tramo; si a alguna unidad le falta el precio, la familia no dice soles", () => {
    const conPrecio = pisoPorFamilia(prendas, { familiaDe, familias: FAMILIAS, precioDe: () => 40 });
    expect(conPrecio[0].soles).toMatchObject({ fresca: 80, vigente: 80, envejeciendo: 40, clasico: 40 });
    const sinUno = pisoPorFamilia(prendas, { familiaDe, familias: FAMILIAS, precioDe: (v) => (v === "b" ? null : 40) });
    expect(sinUno[0].soles).toBeNull();
    expect(sinUno[1].soles).not.toBeNull();
    expect(pisoPorFamilia(prendas, { familiaDe, familias: FAMILIAS })[0].soles).toBeNull();
  });

  it("si no se pudo leer la familia, todo va en una sola barra", () => {
    const piso = pisoPorFamilia(prendas, { familiaDe: () => null, familias: [] });
    expect(piso).toHaveLength(1);
    expect(piso[0].total).toBe(11);
  });
});

describe("porcentajes", () => {
  it("enteros que suman exactamente 100, sin contar los clásicos", () => {
    const p = porcentajes({ ...conteoVacio(), fresca: 1, vigente: 1, envejeciendo: 1, clasico: 7 });
    expect(p.fresca + p.vigente + p.envejeciendo + p.sin_saber).toBe(100);
    expect(porcentajes({ ...conteoVacio(), fresca: 58, vigente: 22, envejeciendo: 20 })).toMatchObject({ fresca: 58, vigente: 22, envejeciendo: 20 });
    expect(porcentajes(conteoVacio()).fresca).toBe(0);
  });
});

describe("respuestaDelPiso: la frase de la cabecera", () => {
  const familia = (u: Partial<ReturnType<typeof conteoVacio>>) => {
    const unidades = { ...conteoVacio(), ...u };
    return { codigo: "indumentaria", nombre: "Indumentaria", unidades, total: unidades.fresca + unidades.vigente + unidades.envejeciendo + unidades.sin_saber, prendas: 1, soles: null };
  };
  const LISTA = { puedeHablar: true, aviso: "" };

  it("afirma solo si la tienda registra lo que vende y casi todo se sabe", () => {
    expect(respuestaDelPiso(familia({ fresca: 58, vigente: 22, envejeciendo: 20 }), LISTA)).toEqual({ pregunta: "¿Tu piso está fresco?", respuesta: "58 de cada 100 prendas colgadas están frescas.", afirma: true });
  });

  it("si la tienda no registra lo que vende, todavía no se puede saber (lo vendido sigue «colgado» y envejece en falso)", () => {
    expect(respuestaDelPiso(familia({ fresca: 58, vigente: 22, envejeciendo: 20 }), { puedeHablar: false, aviso: "Solo 2 de cada 100 ventas tienen su prenda" })).toMatchObject({ respuesta: "Todavía no se puede saber.", afirma: false });
    expect(respuestaDelPiso(familia({ fresca: 58 }), null).afirma).toBe(false);
  });

  it("con mucho «aún no se sabe» no afirma un porcentaje que podría ser otro", () => {
    expect(respuestaDelPiso(familia({ fresca: 50, sin_saber: 50 }), LISTA)).toMatchObject({ respuesta: "Todavía no se puede decir: aún no se sabe de 50 de cada 100 prendas colgadas.", afirma: false });
  });

  it("sin nada colgado lo dice", () => {
    expect(respuestaDelPiso(null, LISTA).respuesta).toBe("Todavía no hay nada colgado.");
  });
});

describe("solesEnteros", () => {
  it("como el resto del ERP", () => {
    expect(solesEnteros(20222.4)).toBe("S/ 20,222");
  });
});
