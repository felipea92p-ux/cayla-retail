import { describe, expect, it } from "vitest";
import type { EventoPiso } from "./inventario-exposicion";
import { analizarSede, inicioDelMesLima, lecturaAl, type EstadoFrescura, type FrescuraPrenda, type LecturaFrescuraConPiso, type TallaFrescuraCruda, type UnidadColgada } from "./frescura-reglas";
import {
  avisoDeLaPuerta,
  CAUSAS_SIN_SABER,
  conteoDeFamilia,
  conteoVacio,
  pasoDeLaPuerta,
  pisoAnterior,
  pisoPorFamilia,
  porcentajes,
  respuestaDelPiso,
  solesEnteros,
  tendenciaDe,
  tramosDeLaPrenda,
  type Familia,
} from "./frescura-piso";

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

  it("«Aún no se sabe» dice por qué: sin ritmo de su categoría, sin fecha o porque no cuadra (Formidable 2026-10-10 (c))", () => {
    // Sin ritmo: su categoría no tiene vara.
    expect(tramosDeLaPrenda(prenda({ modelo: 40, colgadas: [tanda(40)], estado: { ...SEMAFORO, tipo: "sin_vara" } })).sinSaberPor).toEqual({ ritmo: 1, fecha: 0, dudosa: 0 });
    // No cuadra: hay que contarla.
    expect(tramosDeLaPrenda(prenda({ modelo: 40, colgadas: [], piso: 2, estado: { ...SEMAFORO, tipo: "dudosa" } })).sinSaberPor).toEqual({ ritmo: 0, fecha: 0, dudosa: 2 });
    // Sin fecha: la tanda entró sin fecha y no pasó P75, el modelo no se sabe si pasó la mitad, o el stock no tiene tanda en el libro.
    expect(tramosDeLaPrenda(prenda({ modelo: 3, alMenos: true, colgadas: [tanda(3, 2, true)] })).sinSaberPor).toEqual({ ritmo: 0, fecha: 2, dudosa: 0 });
    expect(tramosDeLaPrenda(prenda({ modelo: 3, alMenos: true, colgadas: [tanda(2)] })).sinSaberPor).toEqual({ ritmo: 0, fecha: 1, dudosa: 0 });
    expect(tramosDeLaPrenda(prenda({ modelo: 40, colgadas: [tanda(20)], piso: 3 })).sinSaberPor).toEqual({ ritmo: 0, fecha: 2, dudosa: 0 });
  });

  it("las causas suman exactamente «Aún no se sabe», en cualquier mezcla", () => {
    const casos = [
      prenda({ modelo: 3, alMenos: true, colgadas: [tanda(3, 2, true), tanda(15, 1, true), tanda(2)], piso: 6 }),
      prenda({ modelo: 40, colgadas: [tanda(1, 2), tanda(20, 2)], piso: 5 }),
      prenda({ modelo: 40, colgadas: [tanda(40)], estado: { ...SEMAFORO, tipo: "sin_ventas_sede" } }),
      prenda({ modelo: 8, colgadas: [tanda(8, 3)] }),
    ];
    for (const p of casos) {
      const t = tramosDeLaPrenda(p);
      expect(CAUSAS_SIN_SABER.reduce((s, c) => s + t.sinSaberPor[c], 0)).toBe(t.unidades.sin_saber);
    }
    const [familia] = pisoPorFamilia(casos, { familiaDe: () => null, familias: [] });
    expect(CAUSAS_SIN_SABER.reduce((s, c) => s + familia.sinSaberPor[c], 0)).toBe(familia.unidades.sin_saber);
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
    return { codigo: "indumentaria", nombre: "Indumentaria", unidades, total: unidades.fresca + unidades.vigente + unidades.envejeciendo + unidades.sin_saber, prendas: 1, soles: null, sinSaberPor: { ritmo: unidades.sin_saber, fecha: 0, dudosa: 0 } };
  };
  const LISTA = { puedeHablar: true, aviso: "" };

  it("afirma solo si la tienda registra lo que vende y casi todo se sabe", () => {
    expect(respuestaDelPiso(familia({ fresca: 58, vigente: 22, envejeciendo: 20 }), LISTA)).toEqual({ pregunta: "¿Tu piso está fresco?", respuesta: "58 de cada 100 prendas colgadas están frescas.", afirma: true, tendencia: null, antes: null });
  });

  it("si la tienda no registra lo que vende, todavía no se puede saber (lo vendido sigue «colgado» y envejece en falso)", () => {
    expect(respuestaDelPiso(familia({ fresca: 58, vigente: 22, envejeciendo: 20 }), { puedeHablar: false, aviso: "Solo 2 de cada 100 ventas tienen su prenda" })).toMatchObject({ respuesta: "Todavía no se puede saber.", afirma: false });
    expect(respuestaDelPiso(familia({ fresca: 58 }), null).afirma).toBe(false);
  });

  it("si sabe qué le falta, la frase lo dice (Felipe, Formidable 2026-10-10 (c): «% con aviso + el paso»)", () => {
    const u = familia({ fresca: 58, vigente: 22, envejeciendo: 20 });
    expect(respuestaDelPiso(u, { puedeHablar: false, aviso: "", falta: "piso_cuadrado" }).respuesta).toBe("Todavía no se puede saber: falta cuadrar el piso.");
    expect(respuestaDelPiso(u, { puedeHablar: false, aviso: "", falta: "almacen_contado" }).respuesta).toBe("Todavía no se puede saber: falta contar el almacén.");
    expect(respuestaDelPiso(u, { puedeHablar: false, aviso: "", falta: "venta_identificada" }).respuesta).toBe(
      "Todavía no se puede saber: todavía no todas las ventas llevan su prenda.",
    );
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

// ---------------------------------------------------------------------------
// Contra el mes anterior (actividad 3): el piso de hace 4 semanas, del mismo libro
// ---------------------------------------------------------------------------

const BASE = Date.UTC(2026, 5, 1); // 1 de junio de 2026: hoy es el día 120 (29 de septiembre)
const ts = (dia: number) => new Date(BASE + dia * D * 1000).toISOString();
const bajada = (dia: number, n: number): EventoPiso => ({ ts: ts(dia), delta: n, esVenta: false, esMovimientoInterno: true });
const venta = (dia: number, n: number): EventoPiso => ({ ts: ts(dia), delta: -n, esVenta: true, esMovimientoInterno: false });
const tallaCruda = (varianteId: string, primeraExhibicion: string | null, pisoHoy: number): TallaFrescuraCruda => ({
  varianteId,
  productoId: varianteId,
  productoNombre: varianteId,
  codigo: null,
  colorCodigo: "NEG",
  colorNombre: "Negro",
  talla: "M",
  categoriaId: "polos",
  categoriaNombre: "Polos",
  temporada: "primavera_verano",
  temporadaOrigen: "producto",
  esClasico: false,
  finEstacion: null,
  enEstacionAhora: true,
  primeraExhibicion,
  ultimaLlegada: null,
  ultimaLlegadaCayla: null,
  pisoHoy,
  almacenHoy: 0,
  apartadasHoy: 0,
  apartadasPisoHoy: 0,
});

/** 24 polos vendidos a los 5, 7, 9, 9, 11 y 13 días (P50 9, P75 11, P90 13), todos antes del día 40; A colgado el día 85; B, el 110. */
function lecturaDosMeses(): LecturaFrescuraConPiso {
  const tallas: TallaFrescuraCruda[] = [];
  const eventos: Record<string, EventoPiso[]> = {};
  const dias = [5, 7, 9, 9, 11, 13];
  for (let i = 0; i < 24; i++) {
    const id = `fondo-${i}`;
    tallas.push(tallaCruda(id, ts(3 + i), 0));
    eventos[id] = [bajada(3 + i, 1), venta(3 + i + dias[i % 6], 1)];
  }
  tallas.push(tallaCruda("A", ts(85), 1), tallaCruda("B", ts(110), 1));
  eventos.A = [bajada(85, 1)];
  eventos.B = [bajada(110, 1)];
  return { separaPiso: true, desde: ts(0), ahora: ts(120), tallas, eventos, tardias: [], dudosas: [] };
}

describe("lecturaAl: la sede como era", () => {
  it("el libro hasta ese instante, lo libre en el piso que salía de él y la primera exhibición solo si ya había pasado", () => {
    const l = lecturaDosMeses();
    l.apartados = { A: [{ ts: ts(90), delta: -1 }] };
    const antes = lecturaAl(l, ts(80));
    expect(antes.ahora).toBe(ts(80));
    expect(antes.eventos.A).toEqual([]);
    expect(antes.tallas.find((t) => t.varianteId === "A")).toMatchObject({ pisoHoy: 0, primeraExhibicion: null });
    // El día 95, A estaba colgada pero apartada para un cliente: no está libre.
    expect(lecturaAl(l, ts(95)).tallas.find((t) => t.varianteId === "A")).toMatchObject({ pisoHoy: 0, apartadasPisoHoy: 1, primeraExhibicion: ts(85) });
  });
});

describe("pisoAnterior: el piso de hace 4 semanas", () => {
  it("se reconstruye del mismo libro: hace 4 semanas A era Fresca (7 días) y B no estaba", () => {
    const anterior = pisoAnterior(lecturaDosMeses());
    expect(anterior?.fecha).toBe(ts(92));
    expect(anterior?.porCategoria).toEqual([{ categoriaId: "polos", unidades: { ...conteoVacio(), fresca: 1 } }]);
  });

  it("hoy A lleva 35 días (Envejeciendo) y B 10 (Vigente): el mismo cálculo que la barra", () => {
    const l = lecturaDosMeses();
    const { sede } = analizarSede(l, undefined, { corteDelMes: inicioDelMesLima(l.ahora) });
    const hoy = pisoPorFamilia(sede.prendas, { familiaDe: () => null, familias: [] })[0];
    expect(hoy.unidades).toMatchObject({ envejeciendo: 1, vigente: 1, fresca: 0 });
  });

  it("si la lectura no llega tan atrás, no hay con qué comparar", () => {
    expect(pisoAnterior({ ...lecturaDosMeses(), desde: ts(100) })).toBeNull();
  });

  it("conteoDeFamilia junta las categorías de la misma familia, con la misma regla que la barra", () => {
    const anterior = { fecha: ts(92), porCategoria: [
      { categoriaId: "polos", unidades: { ...conteoVacio(), fresca: 3 } },
      { categoriaId: "anillos", unidades: { ...conteoVacio(), sin_saber: 5 } },
    ] };
    const o = { familiaDe: (c: string) => (c === "polos" ? "indumentaria" : "bisuteria"), familias: [{ codigo: "indumentaria", nombre: "Indumentaria", orden: 10 }] };
    expect(conteoDeFamilia(anterior, "indumentaria", o).fresca).toBe(3);
    // Bisutería no está en el catálogo leído: va en «Otras» (null), como en la barra de hoy.
    expect(conteoDeFamilia(anterior, null, o).sin_saber).toBe(5);
  });
});

describe("la frase contra hace 4 semanas", () => {
  const LISTA = { puedeHablar: true, aviso: "" };
  const fam = (u: Partial<ReturnType<typeof conteoVacio>>) => {
    const unidades = { ...conteoVacio(), ...u };
    return { codigo: "indumentaria", nombre: "Indumentaria", unidades, total: unidades.fresca + unidades.vigente + unidades.envejeciendo + unidades.sin_saber, prendas: 1, soles: null, sinSaberPor: { ritmo: unidades.sin_saber, fecha: 0, dudosa: 0 } };
  };

  it("envejeciendo sube 7 puntos o más: ojo, más viejo", () => {
    const r = respuestaDelPiso(fam({ fresca: 58, vigente: 22, envejeciendo: 20 }), LISTA, { ...conteoVacio(), fresca: 60, vigente: 28, envejeciendo: 12 });
    expect(r).toMatchObject({ tendencia: "mas_viejo", respuesta: "58 de cada 100 prendas colgadas están frescas: ojo, tu piso está más viejo que hace 4 semanas.", antes: { envejeciendo: 12 } });
  });

  it("baja lo que envejece o sube lo fresco: más fresco; poco cambio: igual", () => {
    expect(respuestaDelPiso(fam({ fresca: 70, vigente: 20, envejeciendo: 10 }), LISTA, { ...conteoVacio(), fresca: 55, vigente: 25, envejeciendo: 20 }).tendencia).toBe("mas_fresco");
    expect(respuestaDelPiso(fam({ fresca: 58, vigente: 22, envejeciendo: 20 }), LISTA, { ...conteoVacio(), fresca: 55, vigente: 27, envejeciendo: 18 })).toMatchObject({
      tendencia: "igual",
      respuesta: "58 de cada 100 prendas colgadas están frescas, igual que hace 4 semanas.",
    });
  });

  it("si hace 4 semanas casi nada se sabía (la carga inicial), no compara", () => {
    expect(respuestaDelPiso(fam({ fresca: 58, vigente: 22, envejeciendo: 20 }), LISTA, { ...conteoVacio(), fresca: 5, sin_saber: 95 })).toMatchObject({ tendencia: null, antes: null, respuesta: "58 de cada 100 prendas colgadas están frescas." });
  });

  it("tendenciaDe: envejeciendo manda aunque lo fresco también suba", () => {
    expect(tendenciaDe({ ...conteoVacio(), fresca: 60, envejeciendo: 40 }, { ...conteoVacio(), fresca: 50, vigente: 30, envejeciendo: 20 })).toBe("mas_viejo");
  });
});

describe("la puerta cerrada: por qué son aproximados y el botón que lo arregla", () => {
  const TODO = { existencias: true, conteos: true };
  const NADA = { existencias: false, conteos: false };

  it("cada falta lleva a la pantalla que la hace, con la misma regla que «Todavía no» de Análisis", () => {
    expect(pasoDeLaPuerta({ puedeHablar: false, aviso: "", falta: "piso_cuadrado" }, TODO)).toEqual({ texto: "Cuadrar el piso", href: "/inventario/cuadrar" });
    expect(pasoDeLaPuerta({ puedeHablar: false, aviso: "", falta: "almacen_contado" }, TODO)).toEqual({ texto: "Contar el almacén", href: "/inventario/conteo" });
    expect(pasoDeLaPuerta({ puedeHablar: false, aviso: "", falta: "venta_identificada", sinPrenda: 7 }, TODO)).toEqual({
      texto: "Registrar 7 sin prenda",
      href: "/inventario/por-regularizar",
    });
  });

  it("nunca un botón que termina en «Sin acceso», ni uno sin nada que registrar, ni cuando la tienda pasa", () => {
    for (const falta of ["piso_cuadrado", "almacen_contado", "venta_identificada"] as const) {
      expect(pasoDeLaPuerta({ puedeHablar: false, aviso: "", falta, sinPrenda: 3 }, NADA)).toBeNull();
    }
    expect(pasoDeLaPuerta({ puedeHablar: false, aviso: "", falta: "venta_identificada", sinPrenda: 0 }, TODO)).toBeNull();
    expect(pasoDeLaPuerta({ puedeHablar: true, aviso: "", falta: null }, TODO)).toBeNull();
    expect(pasoDeLaPuerta(null, TODO)).toBeNull();
  });

  it("el aviso dice por qué los porcentajes son aproximados; sin saber qué falta, el aviso compartido con Análisis", () => {
    expect(avisoDeLaPuerta({ puedeHablar: false, aviso: "x", falta: "piso_cuadrado" })).toMatch(/^Mientras el piso no esté cuadrado.*aproximados\.$/);
    expect(avisoDeLaPuerta({ puedeHablar: false, aviso: "x", falta: "venta_identificada" })).toMatch(/lo vendido sigue contando como colgado/);
    expect(avisoDeLaPuerta({ puedeHablar: false, aviso: "Falta algo: estas cifras pueden fallar.", falta: null })).toBe("Falta algo: estas cifras pueden fallar.");
    expect(avisoDeLaPuerta(null)).toMatch(/No se pudo saber/);
  });
});
