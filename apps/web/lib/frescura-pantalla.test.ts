import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  FILTROS_ESTADO,
  FRASE_SIN_ELLA,
  NOMBRE_TRAMO,
  llevaTexto,
  SIN_FILTROS,
  TONO_TRAMO,
  cifrasVista,
  claveRapidez,
  consultaDe,
  decimal,
  detalleVista,
  diasDe,
  enLaTabla,
  TRAMOS_BARRA,
  estadoVista,
  fechaCorta,
  filaVista,
  filtrosDeUrl,
  fraseEncabezado,
  grupoVista,
  hayFiltros,
  nombreMes,
  pasaEstado,
  pasaFiltros,
  pieVista,
  porcentajeEntero,
  presenciaDe,
  rapidezVista,
  reglaVista,
  registroCorto,
  textoDias,
  textoOtrasConPregunta,
  textoRegistro,
  textoSugerencia,
  trozosRicos,
  vistaDeEntrada,
  accionDeFila,
  textoRespaldoCayla,
  textoSinTemporada,
  segmentosDe,
  tableroVista,
  tramoBarraDe,
  varaTablero,
  avisoPocasVentas,
  esAproximada,
  resumenPie,
  textoConsecuenciaFila,
  type AccesoFrescura,
  type ContextoFrescura,
  type NombresDeTemporadas,
} from "./frescura-pantalla";
import {
  analizarSede,
  leerFrescuraSede,
  tramoDe,
  type Cortes,
  type EstadoFrescura,
  type Sugerencia,
  type FrescuraPrenda,
  type FrescuraSede,
  type VaraCategoria,
} from "./frescura-reglas";
import { pisoPorFamilia, respuestaDelPiso } from "./frescura-piso";

// Frescura del piso, paso 4 (ADR-0208): lo que DICE la pantalla. Las reglas (qué estado tiene cada prenda) las prueban
// `frescura-reglas.test.ts` y `frescura-contrato.test.ts`; aquí se prueba que la pantalla diga lo que Felipe eligió en la
// maqueta (colores A, frases C), que nunca pinte rojo una fila, que las palabras técnicas no lleguen a la pantalla, y que
// los filtros, el pie y los botones del detalle cuenten lo que dicen.

const DIA = 86_400;
const AHORA = "2026-09-28T15:40:00.000Z";
const DESDE = "2026-05-31T15:40:00.000Z";
const TODO: AccesoFrescura = { existencias: true, historial: true, traslados: true, conteos: true, atributos: true };

function vara(categoriaId: string, p: Partial<VaraCategoria> = {}): VaraCategoria {
  return {
    categoriaId,
    respaldo: null,
    delMes: null,
    categoriaNombre: "Blusas",
    ventanaDias: 60,
    cortes: { p50: 18 * DIA, p75: 34 * DIA, p90: 52 * DIA },
    tMax: 60 * DIA,
    vendidoAlFinal: 0.96,
    vendidas: 37,
    unidades: 60,
    nivel: "solido",
    ...p,
  };
}

/** El catálogo de temporadas de PRODUCCIÓN (`select * from retail.fn_temporadas()`, solo lectura, 2026-09-28): los clásicos
 *  se llaman «Clásico · verano», no «Clásico». Con nombres inventados, «Es de clásico · verano» pasaba las pruebas. */
const TEMPORADAS: NombresDeTemporadas = {
  primavera_verano: { nombre: "Primavera-Verano", estacionDesde: "primavera" },
  primavera: { nombre: "Primavera", estacionDesde: "primavera" },
  verano: { nombre: "Verano", estacionDesde: "verano" },
  otono_invierno: { nombre: "Otoño-Invierno", estacionDesde: "otono" },
  otono: { nombre: "Otoño", estacionDesde: "otono" },
  invierno: { nombre: "Invierno", estacionDesde: "invierno" },
  clasico: { nombre: "Clásico · todo el año", estacionDesde: null },
  clasico_verano: { nombre: "Clásico · verano", estacionDesde: "verano" },
  clasico_invierno: { nombre: "Clásico · invierno", estacionDesde: "invierno" },
};

function ctx(p: Partial<ContextoFrescura> = {}): ContextoFrescura {
  return {
    sede: "Tienda Trujillo",
    desde: DESDE,
    ahora: AHORA,
    categorias: new Map([["blu", vara("blu")]]),
    cayla: null,
    caylaFallo: null,
    temporadas: TEMPORADAS,
    acceso: TODO,
    ...p,
  };
}

const ESTADO_BASE: { temporadaPasada: boolean; sinTemporada: boolean; quieta: boolean; sugerencias: Sugerencia[] } = {
  temporadaPasada: false,
  sinTemporada: false,
  quieta: false,
  sugerencias: [],
};

function prenda(p: Partial<FrescuraPrenda> & { estado?: EstadoFrescura } = {}): FrescuraPrenda {
  return {
    clave: "prod-1|NEG",
    productoId: "prod-1",
    productoNombre: "Blusa Wayra",
    codigo: "BLU-0087-M",
    colorCodigo: "NEG",
    colorNombre: "Negro",
    categoriaId: "blu",
    categoriaNombre: "Blusas",
    tallas: [
      { varianteId: "v-s", talla: "S", pisoHoy: 1, almacenHoy: 2, apartadasHoy: 0, apartadasPisoHoy: 0, colgadas: [{ segundos: 61 * DIA, unidades: 1, edadDesconocida: false }] },
      { varianteId: "v-m", talla: "M", pisoHoy: 1, almacenHoy: 2, apartadasHoy: 0, apartadasPisoHoy: 0, colgadas: [{ segundos: 61 * DIA, unidades: 1, edadDesconocida: false }] },
    ],
    pisoHoy: 2,
    almacenHoy: 4,
    apartadasHoy: 0,
    apartadasPisoHoy: 0,
    reloj: { segundos: 61 * DIA, alMenos: false },
    relojUnidad: { segundos: 61 * DIA, alMenos: false },
    primeraExhibicion: "2026-07-29T15:00:00.000Z",
    ultimaLlegada: "2026-07-24T15:00:00.000Z",
    ultimaLlegadaCayla: "2026-07-24T15:00:00.000Z",
    temporada: "verano",
    temporadaOrigen: "producto",
    esClasico: false,
    finEstacion: null,
    rapidez: { indice: 23, vendidas: 1, esperadas: 4.3, referencia: 36 },
    ventasRecientes: 0,
    categoriaSinElla: { cortes: { p50: 18 * DIA, p75: 33 * DIA, p90: 51 * DIA }, tMax: 60 * DIA, vendidas: 36 },
    juzgadaContra: "sede",
    varaDelMes: false,
    estado: { ...ESTADO_BASE, tipo: "semaforo", tramo: "critica", alMenos: false, quieta: true, sugerencias: ["cambiar_lugar", "trasladar"] },
    // Quieta y sin nada anotado: «Por decidir» (paso 4b: el campo lo decide `aplicarDecisiones`).
    porDecidir: true,
    decision: null,
    ...p,
  };
}

// La salida REAL de la base (la misma que usa frescura-contrato.test.ts), analizada como en el servidor.
const CRUDO = JSON.parse(readFileSync(new URL("./__fixtures__/frescura-sede.json", import.meta.url), "utf8")) as { fn_frescura_sede: unknown };
const LECTURA = leerFrescuraSede(CRUDO.fn_frescura_sede);
if (!LECTURA || !LECTURA.separaPiso) throw new Error("el archivo de la lectura real no se pudo leer");
const SEDE: FrescuraSede = analizarSede(LECTURA).sede;
const CTX_REAL = ctx({ desde: SEDE.desde, ahora: SEDE.ahora, categorias: new Map(SEDE.categorias.map((c) => [c.categoriaId, c])) });
const CTX_LIDER = { ...CTX_REAL, cayla: new Map(SEDE.categorias.map((c) => [c.categoriaId, c])) };

/** Todo lo que la pantalla puede escribir de la sede real: filas, cabeceras y hojas de detalle. */
function todoElTexto(c: ContextoFrescura): string {
  const piso = pisoPorFamilia(SEDE.prendas, { familiaDe: () => null, familias: [] })[0] ?? null;
  const partes: string[] = [
    fraseEncabezado(null),
    fraseEncabezado(respuestaDelPiso(piso, { puedeHablar: true, aviso: "" })),
    fraseEncabezado(respuestaDelPiso(piso, { puedeHablar: false, aviso: "" })),
    FRASE_SIN_ELLA,
  ];
  for (const p of SEDE.prendas) {
    partes.push(JSON.stringify(filaVista(p, c)), JSON.stringify(detalleVista(p, c)));
  }
  for (const v of SEDE.categorias) partes.push(JSON.stringify(grupoVista(v.categoriaId, v.categoriaNombre, c)));
  // Los nombres y códigos de las prendas sembradas («Zz Fx Blusa Vara 01», «ZZ-FX-VARA-01-M») son datos, no palabras
  // de la pantalla.
  let texto = partes.join("\n");
  for (const p of SEDE.prendas) texto = texto.split(p.productoNombre).join("«prenda»").split(p.codigo ?? "\u0000").join("«código»");
  return texto;
}

describe("colores A (Felipe, 2026-09-28): ninguna fila en rojo", () => {
  it("Nueva verde, Vigente neutro, Envejecida ámbar, Crítica contorno de tinta", () => {
    expect(TONO_TRAMO).toEqual({ nueva: "verde", vigente: "neutro", envejecida: "ambar", critica: "tinta" });
  });

  it("en la sede real, ningún estado de fila, chip de rapidez ni de nivel es rojo", () => {
    for (const p of SEDE.prendas) {
      const e = estadoVista(p);
      expect(e.tono, p.productoNombre).not.toBe("rojo");
    }
  });

  it("la Crítica es `tinta` también cuando es «al menos» (y no lleva nada debajo: no hay nada después)", () => {
    const e = estadoVista(prenda({ estado: { ...ESTADO_BASE, tipo: "semaforo", tramo: "critica", alMenos: true } }));
    expect(e).toMatchObject({ texto: "Hay que moverla", tono: "tinta" });
    expect(e.debajo).toEqual([]);
  });

  it("«aproximado» (las demás sin ella vendieron menos de 10) va debajo del chip; el «o más» lo dice la línea de días, no el chip", () => {
    const pocas = { cortes: { p50: 18 * DIA, p75: 33 * DIA, p90: 51 * DIA }, tMax: 60 * DIA, vendidas: 7 };
    const e = estadoVista(prenda({ categoriaSinElla: pocas, estado: { ...ESTADO_BASE, tipo: "semaforo", tramo: "vigente", alMenos: true } }));
    expect(e).toMatchObject({ texto: "En su tiempo", tono: "neutro", debajo: ["aproximado"] });
  });

  it("los estados especiales dicen su porqué (frases C) en pizarra, la que no cuadra apagada y con ícono, la apartada en neutro", () => {
    expect(estadoVista(prenda({ estado: { ...ESTADO_BASE, tipo: "sin_ventas_sede" } }))).toMatchObject({ texto: "Aún no se sabe", tono: "pizarra" });
    expect(estadoVista(prenda({ estado: { ...ESTADO_BASE, tipo: "sin_vara" } }))).toMatchObject({ texto: "Aún no se sabe", tono: "pizarra" });
    expect(estadoVista(prenda({ estado: { ...ESTADO_BASE, tipo: "sin_edad_conocida" } }))).toMatchObject({ texto: "No se sabe cuándo llegó", tono: "pizarra" });
    expect(estadoVista(prenda({ estado: { ...ESTADO_BASE, tipo: "clasico", fueraDeSuEstacion: true } }))).toMatchObject({ texto: "Clásico, espera su estación", tono: "pizarra" });
    expect(estadoVista(prenda({ estado: { ...ESTADO_BASE, tipo: "dudosa" } }))).toMatchObject({ texto: "Su stock no cuadra", tono: "apagado", icono: true });
    const apartada = prenda({ pisoHoy: 0, apartadasHoy: 3, apartadasPisoHoy: 3, estado: { ...ESTADO_BASE, tipo: "semaforo", tramo: "vigente", alMenos: false } });
    expect(estadoVista(apartada)).toMatchObject({ texto: "Apartada para clientes", tono: "neutro", previo: "iba como «En su tiempo» · 3 apartadas" });
  });
});

describe("las palabras: nada técnico llega a la pantalla (maqueta, «Palabras»)", () => {
  it.each([
    ["el líder", CTX_LIDER],
    ["quien tiene el módulo sin ser líder", CTX_REAL],
  ])("ninguna fila, cabecera ni hoja de la sede real dice «tramo», «P50», «percentil», «vara», «Kaplan» ni «≥» (%s)", (_q, c) => {
    const texto = todoElTexto(c);
    expect(texto.length).toBeGreaterThan(1000);
    for (const prohibida of [/\btramo/i, /\bP[579]0\b/, /percentil/i, /\bvara\b/i, /kaplan/i, /≥/]) expect(texto).not.toMatch(prohibida);
  });

  it("la frase de la comparación sin la propia prenda (D5) es la de las frases C", () => {
    expect(FRASE_SIN_ELLA).toBe(
      "Cada prenda se compara con las demás de su categoría, nunca consigo misma: así la que no se vende no hace parecer normal su propia lentitud.",
    );
  });

  it("decimales con punto, fechas de Lima y meses como en el Perú («setiembre»)", () => {
    expect(decimal(4.8)).toBe("4.8");
    expect(decimal(4.25)).toBe("4.3");
    expect(decimal(3)).toBe("3");
    // 23-set a las 03:00 UTC es todavía 22 de setiembre en Lima.
    expect(fechaCorta("2026-09-23T03:00:00Z")).toBe("22 set");
    expect(fechaCorta(null)).toBe("—");
    expect(nombreMes("2026-09-01")).toBe("setiembre");
    expect(diasDe(5.6 * DIA)).toBe(6);
  });
});

describe("dónde está cada prenda: la tabla es lo colgado (o apartado desde el piso); lo demás, al pie", () => {
  it("en el piso, apartada, guardada, nunca colgada y agotada", () => {
    expect(presenciaDe({ pisoHoy: 1, almacenHoy: 0, apartadasHoy: 0, apartadasPisoHoy: 0, primeraExhibicion: null })).toBe("en_piso");
    expect(presenciaDe({ pisoHoy: 0, almacenHoy: 0, apartadasHoy: 2, apartadasPisoHoy: 2, primeraExhibicion: AHORA })).toBe("apartada");
    expect(presenciaDe({ pisoHoy: 0, almacenHoy: 3, apartadasHoy: 0, apartadasPisoHoy: 0, primeraExhibicion: AHORA })).toBe("guardada");
    expect(presenciaDe({ pisoHoy: 0, almacenHoy: 3, apartadasHoy: 0, apartadasPisoHoy: 0, primeraExhibicion: null })).toBe("nunca_colgada");
    // El pedido de otra sede separado al instante: nunca estuvo libre en el piso (revisión 9, N3).
    expect(presenciaDe({ pisoHoy: 0, almacenHoy: 0, apartadasHoy: 1, apartadasPisoHoy: 1, primeraExhibicion: null })).toBe("nunca_colgada");
    expect(presenciaDe({ pisoHoy: 0, almacenHoy: 0, apartadasHoy: 0, apartadasPisoHoy: 0, primeraExhibicion: AHORA })).toBe("agotada");
  });

  it("corrección del paso 4 · lo apartado en el ALMACÉN no es «apartada»: la prenda está guardada (Apartar toma del almacén cuando el piso está vacío)", () => {
    const iba = { ...ESTADO_BASE, tipo: "semaforo" as const, tramo: "vigente" as const, alMenos: false };
    // Colgada antes, 0 en el piso, 2 libres en el almacén y 1 apartada del almacén.
    const delAlmacen = prenda({ pisoHoy: 0, almacenHoy: 2, apartadasHoy: 1, apartadasPisoHoy: 0, estado: iba });
    expect(presenciaDe(delAlmacen)).toBe("guardada");
    expect(enLaTabla(delAlmacen)).toBe(false);
    expect(pieVista([delAlmacen]).guardadas).toEqual(["Blusa Wayra Negro (3, 1 apartada), iba como «En su tiempo»"]);
    // Sin nada libre en el almacén y 1 apartada ahí: guardada, no agotada.
    expect(presenciaDe(prenda({ pisoHoy: 0, almacenHoy: 0, apartadasHoy: 1, apartadasPisoHoy: 0 }))).toBe("guardada");
    // 1 apartada del piso y 2 libres en el almacén: apartada, y lo que se dice es lo del PISO (1), no el total.
    const delPiso = prenda({ pisoHoy: 0, almacenHoy: 2, apartadasHoy: 3, apartadasPisoHoy: 1, estado: iba });
    expect(presenciaDe(delPiso)).toBe("apartada");
    expect(estadoVista(delPiso).previo).toBe("iba como «En su tiempo» · 1 apartada");
    expect(detalleVista(delPiso, ctx()).porque).toContain("está apartado para clientes (1)");
  });

  it("en la sede real, la que solo está en el almacén no entra a la tabla y se nombra al pie", () => {
    const soloAlmacen = SEDE.prendas.find((p) => p.productoNombre.includes("Almacen"));
    expect(soloAlmacen).toBeDefined();
    expect(enLaTabla(soloAlmacen!)).toBe(false);
    expect(pieVista(SEDE.prendas).nuncaColgadas.some((x) => x.includes("Almacen"))).toBe(true);
  });

  it("el pie dice en qué iba la guardada y cuántas se agotaron", () => {
    const guardada = prenda({ pisoHoy: 0, almacenHoy: 4, estado: { ...ESTADO_BASE, tipo: "semaforo", tramo: "critica", alMenos: false } });
    const agotada = prenda({ clave: "x|y", pisoHoy: 0, almacenHoy: 0 });
    expect(pieVista([guardada, agotada])).toEqual({ guardadas: ["Blusa Wayra Negro (4), iba como «Hay que moverla»"], nuncaColgadas: [], agotadas: 1 });
  });

  it("sin temporada: UNA línea en «¿Cómo se lee esto?» con cuántas son (act. 2026-10-07; antes un cartel y un chip por fila); null si todas la tienen", () => {
    const sin = (n: number, total: number) =>
      Array.from({ length: total }, (_, i) => prenda({ clave: `p${i}`, estado: { ...ESTADO_BASE, tipo: "semaforo", tramo: "nueva", alMenos: false, sinTemporada: i < n } }));
    expect(textoSinTemporada(sin(3, 4))).toBe("3 de 4 prendas no tienen temporada: se miden igual, pero nunca van a avisar que pasó su estación.");
    expect(textoSinTemporada(sin(1, 1))).toBe("1 de 1 prenda no tiene temporada: se miden igual, pero nunca van a avisar que pasó su estación.");
    // El sujeto es «1», no «4 prendas».
    expect(textoSinTemporada(sin(1, 4))).toBe("1 de 4 prendas no tiene temporada: se miden igual, pero nunca van a avisar que pasó su estación.");
    expect(textoSinTemporada(sin(0, 4))).toBeNull();
    expect(textoSinTemporada([])).toBeNull();
  });

  it("la vara de CAYLA en «¿Cómo se lee esto?»: de cuándo es, o por qué no hay", () => {
    expect(textoRespaldoCayla({ calculadaEn: "2026-10-08T08:20:00Z", fallo: null })).toBe(
      "La vara de CAYLA es del 8 oct: se calcula cada madrugada con las tres tiendas juntas y respalda a las categorías que aquí no llegan a 10 ventas.",
    );
    expect(textoRespaldoCayla({ calculadaEn: null, fallo: null })).toBe("Todavía no hay una vara de CAYLA calculada: cada categoría se juzga con lo vendido en esta tienda.");
    expect(textoRespaldoCayla({ calculadaEn: null, fallo: "No se pudo leer la vara de CAYLA: se juzga contra la tienda." })).toBe("No se pudo leer la vara de CAYLA: se juzga contra la tienda.");
  });

  it("por categoría: si se juzga contra CAYLA, y si no, por qué", () => {
    const base = vara("blu");
    const respaldo = { ...base, respaldo: undefined, ventanaDias: 120, vendidas: 30, unidades: 40, nivel: "solido" as const, calculadaEn: AHORA, enUso: true };
    const con = (v: Partial<VaraCategoria>) => grupoVista("blu", "Blusas", ctx({ categorias: new Map([["blu", vara("blu", v)]]) })).respaldo;
    expect(con({ vendidas: 3, nivel: "pocos_datos", respaldo })).toBe("Se juzga contra lo que vende CAYLA: 30 ventas de los últimos 120 días en las tres tiendas; aquí, 3 ventas.");
    expect(con({ vendidas: 0, nivel: null, respaldo })).toBe("Se juzga contra lo que vende CAYLA: 30 ventas de los últimos 120 días en las tres tiendas; aquí, ninguna venta todavía.");
    expect(con({ vendidas: 12, nivel: "aceptable", respaldo: { ...respaldo, enUso: false } })).toBe("Aquí ya hay 12 ventas: se juzga sola; la vara de CAYLA (30 ventas) queda de apoyo.");
    expect(con({ vendidas: 3, nivel: "pocos_datos", respaldo: { ...respaldo, vendidas: 5, nivel: "pocos_datos", enUso: false } })).toBe("La vara de CAYLA tampoco alcanza (5 ventas): se juzga con lo de aquí.");
    // CAYLA alcanza y aquí no, pero nada se juzgó contra ella (puros clásicos, o prendas que no cuadran).
    expect(con({ vendidas: 0, nivel: null, respaldo: { ...respaldo, enUso: false } })).toBe("Aquí no hay prendas que medir (clásicos, o prendas que no cuadran): la vara de CAYLA (30 ventas) queda de apoyo.");
    expect(con({ respaldo: null })).toBeNull();
  });
});

describe("la rapidez: UNA escala para la fila y el detalle, con el corte en 100", () => {
  const conIndice = (indice: number, p: Partial<FrescuraPrenda> = {}) => prenda({ rapidez: { indice, vendidas: 5, esperadas: 4.8, referencia: 32 }, ventasRecientes: 2, ...p });
  it.each([
    [59, "muy_lenta", "Mucho más lenta que las demás"],
    [60, "lenta", "Más lenta que las demás"],
    [99, "lenta", "Más lenta que las demás"],
    [100, "ritmo", "Como las demás"],
    [119, "ritmo", "Como las demás"],
    [120, "rapida", "Más rápida que las demás"],
  ])("índice %i → %s («%s»)", (indice, clave, texto) => {
    const p = conIndice(indice);
    expect(claveRapidez(p)).toBe(clave);
    expect(rapidezVista(p)).toMatchObject({ texto, detalle: "vendió 5, se esperaban 4.8" });
  });

  it("con 100 o más y 30 días en el piso sin vender, dejó de venderse (la definición de estaQuieta)", () => {
    expect(claveRapidez(conIndice(130, { ventasRecientes: 0, reloj: { segundos: 58 * DIA, alMenos: false } }))).toBe("dejo");
    // Con menos de 30 días colgada todavía no se sabe: no «dejó».
    expect(claveRapidez(conIndice(130, { ventasRecientes: 0, reloj: { segundos: 20 * DIA, alMenos: false } }))).toBe("rapida");
  });

  it("con la categoría aún sin referencia, la fila no dice si es rápida", () => {
    const p = conIndice(312, { estado: { ...ESTADO_BASE, tipo: "sin_vara" }, rapidez: { indice: 312, vendidas: 5, esperadas: 1.6, referencia: 2 } });
    expect(rapidezVista(p)).toEqual({ texto: "Vendió 5; las demás, solo 2", detalle: null, porque: null, nivel: "pocos_datos" });
  });

  it("sin dato: dice por qué (clásico, no cuadra, sin comparación, llegó sin fecha, todavía no alcanza)", () => {
    const sin = (p: Partial<FrescuraPrenda>) => rapidezVista(prenda({ rapidez: null, ...p })).porque;
    expect(sin({ estado: { ...ESTADO_BASE, tipo: "clasico", fueraDeSuEstacion: false } })).toBe("los clásicos no se miden");
    expect(sin({ estado: { ...ESTADO_BASE, tipo: "dudosa" } })).toBe("no se mide mientras no cuadre");
    expect(sin({ estado: { ...ESTADO_BASE, tipo: "sin_ventas_sede" } })).toBe("su categoría no tiene ventas aquí con qué compararla");
    expect(sin({ reloj: { segundos: 10 * DIA, alMenos: true } })).toBe("no se sabe cuándo llegó lo que vendió");
    expect(sin({ reloj: { segundos: 2 * DIA, alMenos: false } })).toBe("todavía no alcanza para compararla");
  });

  it("«Aceptable» y «Pocos datos» según las ventas de las demás contra las que se midió; sólida no dice nada", () => {
    expect(rapidezVista(conIndice(80, { rapidez: { indice: 80, vendidas: 2, esperadas: 2.5, referencia: 12 } })).nivel).toBe("aceptable");
    expect(rapidezVista(conIndice(80, { rapidez: { indice: 80, vendidas: 2, esperadas: 2.5, referencia: 25 } })).nivel).toBe("solido");
  });

  it("con menos de 2 esperadas el índice no decide (act. 2026-10-07): ni la fila ni la hoja dicen «más lenta», y «revisa sus ventas» no se contradice", () => {
    // El caso de la captura de TRU: 0 vendidas con 1 esperada, 4 días colgada.
    const poca = conIndice(0, { rapidez: { indice: 0, vendidas: 0, esperadas: 1, referencia: 3 }, ventasRecientes: 0, reloj: { segundos: 4 * DIA, alMenos: false } });
    expect(claveRapidez(poca)).toBe("poca_evidencia");
    expect(rapidezVista(poca)).toMatchObject({ texto: "Todavía no alcanza para decir si es lenta", detalle: "vendió 0, se esperaba 1" });
    expect(detalleVista(poca, ctx()).rapidez).toContain("no se puede decir que sea lenta");
    expect(detalleVista(poca, ctx()).rapidez).not.toContain("más lento");
    expect(textoSugerencia("revisar_ventas", poca, ctx())).toBe("Parece lenta, pero hay pocas ventas para decirlo: mira sus ventas");
    // Con 2 esperadas ya decide, como siempre.
    expect(claveRapidez(conIndice(0, { rapidez: { indice: 0, vendidas: 0, esperadas: 2, referencia: 6 } }))).toBe("muy_lenta");
  });
});

describe("frases C: cada sugerencia trae su causa", () => {
  const c = ctx();
  it("«revisa sus ventas»: la callada (30 días sin vender) y la que no tiene dato dicen cosas distintas", () => {
    const callada = prenda({ ventasRecientes: 0, reloj: { segundos: 34 * DIA, alMenos: true }, estado: { ...ESTADO_BASE, tipo: "semaforo", tramo: "vigente", alMenos: true } });
    const sinDato = prenda({ ventasRecientes: 1, rapidez: null });
    expect(textoSugerencia("revisar_ventas", callada, c)).toBe("30 días sin vender: mira qué le pasa");
    expect(textoSugerencia("revisar_ventas", sinDato, c)).toBe("No se sabe qué tan rápido se vende: mira sus ventas");
  });

  it("«cambiar de lugar»: la de temporada pasada, la que dejó de venderse y la vieja y lenta", () => {
    const temporada = prenda({ estado: { ...ESTADO_BASE, tipo: "semaforo", tramo: "vigente", alMenos: false, temporadaPasada: true } });
    const dejo = prenda({ rapidez: { indice: 130, vendidas: 9, esperadas: 6.9, referencia: 28 }, ventasRecientes: 0, reloj: { segundos: 58 * DIA, alMenos: false } });
    expect(textoSugerencia("cambiar_lugar", temporada, c)).toBe("Pasó su estación: pruébala 7 días en otro lugar");
    expect(textoSugerencia("cambiar_lugar", dejo, c)).toBe("Ya no se vende: pruébala 7 días en otro lugar");
    expect(textoSugerencia("cambiar_lugar", prenda(), c)).toBe("No se mueve: pruébala 7 días en otro lugar");
  });

  it("«trasladar» dice de dónde son las ventas con que se comparó: de aquí, o de las tres tiendas si se juzgó contra CAYLA (act. 2026-10-07)", () => {
    const traslado = (juzgadaContra: "sede" | "cayla") =>
      detalleVista(
        prenda({
          juzgadaContra,
          almacenHoy: 3,
          rapidez: { indice: 40, vendidas: 1, esperadas: 2.5, referencia: 29 },
          estado: { ...ESTADO_BASE, tipo: "semaforo", tramo: "critica", alMenos: false, quieta: true, sugerencias: ["trasladar"] },
        }),
        c,
      ).acciones[0]!.texto;
    expect(traslado("sede")).toContain("29 ventas de las demás aquí");
    expect(traslado("cayla")).toContain("29 ventas de las demás en las tres tiendas");
  });

  it("las otras cuatro, con sus datos", () => {
    expect(textoSugerencia("trasladar", prenda(), c)).toBe("Hay 4 en el almacén: ¿otra sede la vende antes?");
    expect(textoSugerencia("retirar", prenda(), c)).toBe("Ya pasó su temporada: ¿la sacas del piso?");
    expect(textoSugerencia("sigue_vendiendo", prenda(), c)).toBe("Pasó su temporada y se sigue vendiendo: ¿hasta agotar o la sacas?");
    expect(textoSugerencia("guardar_hasta_su_estacion", prenda({ temporada: "clasico_verano" }), c)).toBe("Es de verano: ¿la guardas hasta su estación?");
  });

  it("la temporada pasada dice cuándo terminó y cuándo llegó a CAYLA (D1), con el nombre de la temporada", () => {
    const p = prenda({
      temporada: "invierno",
      finEstacion: "2026-09-22T19:44:00Z",
      ultimaLlegadaCayla: "2026-05-14T15:00:00Z",
      estado: { ...ESTADO_BASE, tipo: "semaforo", tramo: "envejecida", alMenos: false, temporadaPasada: true, quieta: true, sugerencias: ["sigue_vendiendo"] },
    });
    expect(filaVista(p, c)).toMatchObject({ temporada: null, temporadaPasada: "su invierno terminó el 22 set · llegó a CAYLA el 14 may" });
  });
});

describe("los filtros viven en la URL", () => {
  it("lo que no se entiende se ignora; lo de siempre no se escribe", () => {
    const leer = (q: string) => {
      const u = new URLSearchParams(q);
      return filtrosDeUrl((k) => u.get(k));
    };
    expect(leer("")).toEqual(SIN_FILTROS);
    expect(leer("estado=inventado&pordecidir=si")).toEqual(SIN_FILTROS);
    expect(leer("cat=blu&estado=critica&pordecidir=1&q=wayra")).toEqual({ cat: "blu", estado: "critica", porDecidir: true, decididas: false, q: "wayra", todas: false });
    expect(consultaDe(SIN_FILTROS, null)).toBe("");
    expect(consultaDe({ cat: "blu", estado: "critica", porDecidir: true, decididas: false, q: " wayra ", todas: false }, "prod-1|NEG")).toBe("cat=blu&estado=critica&pordecidir=1&q=wayra&prenda=prod-1%7CNEG");
    expect(hayFiltros(SIN_FILTROS)).toBe(false);
    expect(hayFiltros({ ...SIN_FILTROS, q: "x" })).toBe(true);
  });

  it("Estado: 11 opciones (con buscador, ADR-0209); las «al menos» cuentan en su edad; «Temporada» se cruza con las demás", () => {
    expect(FILTROS_ESTADO).toHaveLength(11);
    const alMenos = prenda({ estado: { ...ESTADO_BASE, tipo: "semaforo", tramo: "vigente", alMenos: true, temporadaPasada: true } });
    expect(pasaEstado(alMenos, "vigente")).toBe(true);
    expect(pasaEstado(alMenos, "temporada_pasada")).toBe(true);
    expect(pasaEstado(alMenos, "sin_comparar")).toBe(false);
    const apartada = prenda({ pisoHoy: 0, apartadasHoy: 2, apartadasPisoHoy: 2, estado: { ...ESTADO_BASE, tipo: "semaforo", tramo: "vigente", alMenos: false } });
    expect(pasaEstado(apartada, "vigente")).toBe(false);
    expect(pasaEstado(apartada, "apartada")).toBe(true);
    for (const tipo of ["sin_ventas_sede", "sin_vara", "sin_edad_conocida"] as const) expect(pasaEstado(prenda({ estado: { ...ESTADO_BASE, tipo } }), "sin_comparar")).toBe(true);
  });

  it("buscar sin tildes ni mayúsculas, por nombre, color o código; categoría y «Por decidir»", () => {
    const p = prenda({ productoNombre: "Blusa Wiñay", colorNombre: "Azul noche" });
    expect(pasaFiltros(p, { ...SIN_FILTROS, q: "WIÑAY" })).toBe(true);
    expect(pasaFiltros(p, { ...SIN_FILTROS, q: "winay" })).toBe(true); // la misma clave de búsqueda del ERP (buscar-prenda-v2): sin marcas
    expect(pasaFiltros(p, { ...SIN_FILTROS, q: "wayra" })).toBe(false);
    expect(pasaFiltros(p, { ...SIN_FILTROS, q: "azul" })).toBe(true);
    expect(pasaFiltros(p, { ...SIN_FILTROS, q: "bLu-0087" })).toBe(true);
    expect(pasaFiltros(p, { ...SIN_FILTROS, cat: "otra" })).toBe(false);
    expect(pasaFiltros(p, { ...SIN_FILTROS, porDecidir: true })).toBe(true);
    expect(pasaFiltros(prenda({ porDecidir: false, estado: { ...ESTADO_BASE, tipo: "semaforo", tramo: "nueva", alMenos: false } }), { ...SIN_FILTROS, porDecidir: true })).toBe(false);
  });
});

describe("la cabecera de cada categoría", () => {
  it("con la curva completa: la mitad, 3 de cada 4, casi todas; la escala y la base", () => {
    const g = grupoVista("blu", "Blusas", ctx());
    expect(g.comparacion).toBe("A los 18 días ya se vendió la mitad de las prendas de Blusas en Tienda Trujillo; a los 34, 3 de cada 4; a los 52, casi todas.");
    expect(g.escala).toEqual([
      { nombre: "Recién llegada", rango: "antes de 18 d" },
      { nombre: "En su tiempo", rango: "18–34 d" },
      { nombre: "Se está quedando", rango: "34–52 d" },
      { nombre: "Hay que moverla", rango: "más de 52 d" },
    ]);
    expect(g.base).toBe("con 37 ventas de los últimos 60 días");
    expect(g.cayla).toBeNull(); // quien no es líder no ve la referencia de CAYLA
  });

  it("sin la mitad todavía: el % vendido a los días más largos (decisión 6), hacia abajo; sin ventas: no hay con qué comparar", () => {
    const sinMitad = ctx({ categorias: new Map([["blu", vara("blu", { cortes: { p50: null, p75: null, p90: null }, tMax: 42 * DIA, vendidoAlFinal: 0.25, vendidas: 1 })]]) });
    expect(grupoVista("blu", "Chompas", sinMitad).comparacion).toBe(
      "A los 42 días ya se vendieron 2 de cada 10 de las prendas de Chompas en Tienda Trujillo: todavía no se sabe cuánto tarda la mitad.",
    );
    expect(grupoVista("otra", "Enterizos", ctx()).comparacion).toBe(
      "Todavía no se vendió ninguna prenda de Enterizos en Tienda Trujillo con fecha de llegada conocida: no hay con qué comparar.",
    );
  });

  it("el líder ve la referencia de CAYLA (o por qué falta)", () => {
    const cayla = new Map([["blu", vara("blu", { cortes: { p50: 16 * DIA, p75: 30 * DIA, p90: 47 * DIA } })]]);
    expect(grupoVista("blu", "Blusas", ctx({ cayla })).cayla).toBe("todas las tiendas juntas, la mitad se vende antes de 16 días, 3 de cada 4 antes de 30.");
    expect(grupoVista("blu", "Blusas", ctx({ cayla, caylaFallo: "La referencia de CAYLA necesita todas las tiendas y falta Tienda Lima." })).cayla).toBe(
      "La referencia de CAYLA necesita todas las tiendas y falta Tienda Lima.",
    );
  });
});

describe("el registro al colgar (solo el líder) y «Las N tiendas»", () => {
  const filas = [
    { ubicacionId: "tru", sede: "Tienda Trujillo", mes: "2026-08-01", filas: 17, unidades: 34, tardias: 0, confianza: 1, nivel: "aceptable" as const },
    { ubicacionId: "tru", sede: "Tienda Trujillo", mes: "2026-09-01", filas: 25, unidades: 104, tardias: 1, confianza: 0.99, nivel: "solido" as const },
    { ubicacionId: "lim", sede: "Tienda Lima", mes: "2026-09-01", filas: 0, unidades: 0, tardias: 0, confianza: null, nivel: null },
  ];
  it("el mes más reciente de ESA sede, con singular y plural", () => {
    expect(textoRegistro(filas, "tru")).toEqual({ texto: "En setiembre se registraron al colgarlas 103 de 104 unidades (1 recién al venderla).", nivel: "solido" });
    expect(textoRegistro(filas, "lim")).toEqual({ texto: "En setiembre todavía no hay bajadas al piso que cuenten.", nivel: null });
    expect(textoRegistro(filas, "otra")).toBeNull();
  });
  it("«Las N tiendas»: cada tienda, este mes y el anterior", () => {
    expect(registroCorto(filas, "tru")).toEqual([
      { mes: "setiembre", texto: "103 de 104 al colgarlas", nivel: "solido" },
      { mes: "agosto", texto: "34 de 34 al colgarlas", nivel: "aceptable" },
    ]);
  });
  it("las cifras de cabecera se redondean a días y a porcentaje entero", () => {
    expect(
      cifrasVista({ unidadesEnPiso: 45, edadDelPisoDias: 23.6, edadDelPisoAlMenos: true, unidadesNuevas: 7, unidadesConTramo: 29, pctNuevas: 24.1, porDecidir: 6, decididas: 0 }),
    ).toEqual({ edad: 24, edadQuizaMas: true, pctNuevas: 24, nuevas: 7, conTramo: 29, porDecidir: 6, decididas: 0, unidades: 45 });
  });
});

describe("la regla del detalle: dónde cae entre las demás (el único rojo de la pantalla es su zona Crítica)", () => {
  it("cuatro zonas con su nombre, anchos que suman 100, las marcas de la mitad, 3 de 4 y 9 de 10", () => {
    const r = reglaVista(prenda())!;
    expect(r.zonas.map((z) => z.nombre)).toEqual(["Recién llegada", "En su tiempo", "Se está quedando", "Hay que moverla"]);
    expect(r.zonas.reduce((s, z) => s + z.ancho, 0)).toBeCloseTo(100, 6);
    expect(r.marcas.map((m) => m.abajo)).toEqual(["", "la mitad", "3 de 4", "9 de 10"]);
    expect(r.marcas.map((m) => m.arriba)).toEqual(["0", "18 d", "33 d", "51 d"]);
    expect(r.ella.texto).toBe("61 d");
    expect(r.ella.pos).toBeGreaterThan(r.marcas[3]!.pos);
  });

  it("sin el 9 de 10: la última zona es «no se sabe» (no Crítica) y la marca es lo más largo visto", () => {
    const r = reglaVista(prenda({ categoriaSinElla: { cortes: { p50: 22 * DIA, p75: 41 * DIA, p90: null }, tMax: 57 * DIA, vendidas: 12 }, reloj: { segundos: 63 * DIA, alMenos: true } }))!;
    expect(r.zonas.map((z) => z.clave)).toEqual(["nueva", "vigente", "envejecida", "nada"]);
    expect(r.marcas.at(-1)).toMatchObject({ arriba: "57 d", abajo: "lo más largo visto" });
    expect(r.ella.texto).toBe("63 d quizá más");
  });

  it("sin comparación, clásico o que no cuadra: no hay regla", () => {
    expect(reglaVista(prenda({ categoriaSinElla: { cortes: { p50: null, p75: null, p90: null }, tMax: 20 * DIA, vendidas: 2 } }))).toBeNull();
    expect(reglaVista(prenda({ estado: { ...ESTADO_BASE, tipo: "clasico", fueraDeSuEstacion: false } }))).toBeNull();
    expect(reglaVista(prenda({ estado: { ...ESTADO_BASE, tipo: "dudosa" } }))).toBeNull();
  });
});

describe("la hoja de detalle", () => {
  it("cada botón lleva a la pantalla que lo hace, y solo si quien mira la ve (ninguno termina en «Sin acceso»)", () => {
    const d = detalleVista(prenda(), ctx());
    expect(d.acciones.map((a) => a.clave)).toEqual(["cambiar_lugar", "trasladar"]);
    expect(d.acciones[0]!.botones).toEqual([{ texto: "Verla en Existencias", href: "/inventario?variante=v-s" }]);
    expect(d.acciones[1]!.botones).toEqual([{ texto: "Armar un traslado", href: "/inventario/mover?lineas=v-s:2,v-m:2" }]);
    const sinNada = detalleVista(prenda(), ctx({ acceso: { existencias: false, historial: false, traslados: false, conteos: false, atributos: false } }));
    expect(sinNada.acciones.flatMap((a) => a.botones)).toEqual([]);
  });

  it("la que no cuadra ofrece contarla; la apartada no ofrece nada", () => {
    const dudosa = detalleVista(prenda({ rapidez: null, estado: { ...ESTADO_BASE, tipo: "dudosa" } }), ctx());
    expect(dudosa.acciones.map((a) => a.clave)).toEqual(["contar"]);
    expect(dudosa.dias).toBeNull();
    const apartada = detalleVista(prenda({ pisoHoy: 0, apartadasHoy: 2, apartadasPisoHoy: 2, estado: { ...ESTADO_BASE, tipo: "semaforo", tramo: "vigente", alMenos: false } }), ctx());
    expect(apartada.acciones).toEqual([]);
    expect(apartada.sinAcciones).toBe("Nada: tiene dueño. Vuelve a medirse si alguna se libera.");
    expect(apartada.pausa).toBe(true);
  });

  it("el porqué de una Crítica: los días de las demás SIN ella (D5) y los días que no cuentan", () => {
    const d = detalleVista(prenda({ primeraExhibicion: "2026-07-01T15:00:00.000Z" }), ctx());
    expect(d.porque).toContain("Lleva **61 días**: pasó los 51 en que ya se vendieron 9 de cada 10 de las demás de Tienda Trujillo.");
    expect(d.porque).toContain("De los 89 días desde que se colgó por primera vez, 28 estuvo sin nada libre en el piso");
    expect(d.sinContarla).toBe("Sin contarla, las demás: la mitad se vende antes de 18 días, 3 de cada 4 antes de 33, 9 de cada 10 antes de 51 (la cabecera de Blusas, con todas: 18, 34, 52).");
  });

  it("«al menos»: la causa que la pantalla puede saber (llegó sin fecha, o se colgó antes de lo que mira)", () => {
    const sinFecha = detalleVista(prenda({ reloj: { segundos: 56 * DIA, alMenos: true }, estado: { ...ESTADO_BASE, tipo: "semaforo", tramo: "vigente", alMenos: true } }), ctx());
    expect(sinFecha.porque).toContain("Lo primero que se colgó llegó sin fecha");
    expect(sinFecha.porque).toContain("Por eso es «En su tiempo, o más» y nunca «Recién llegada».");
    const antes = detalleVista(
      prenda({ primeraExhibicion: "2026-04-01T15:00:00Z", reloj: { segundos: 90 * DIA, alMenos: true }, estado: { ...ESTADO_BASE, tipo: "semaforo", tramo: "critica", alMenos: true } }),
      ctx(),
    );
    expect(antes.porque).toContain("Se colgó por primera vez antes del 31 may, más atrás de lo que mira esta pantalla (120 días)");
    expect(antes.porque).toContain("Aunque lleve más, ya es «Hay que moverla».");
  });

  it("la referencia de CAYLA en los datos de apoyo, solo para el líder", () => {
    expect(detalleVista(prenda(), ctx()).apoyo.map((a) => a.que)).not.toContain("Referencia de CAYLA");
    const cayla = new Map([["blu", vara("blu", { cortes: { p50: 16 * DIA, p75: null, p90: null } })]]);
    expect(detalleVista(prenda(), ctx({ cayla })).apoyo.find((a) => a.que === "Referencia de CAYLA")?.dato).toBe("Todas las tiendas juntas, la mitad se vende antes de 16 días.");
  });

  it("negritas: `**así**` se parte en trozos", () => {
    expect(trozosRicos("Lleva **61 días**: pasó")).toEqual([
      { texto: "Lleva ", negrita: false },
      { texto: "61 días", negrita: true },
      { texto: ": pasó", negrita: false },
    ]);
  });
});

describe("la sede real (la salida de la base de T13)", () => {
  it("cada prenda de la tabla tiene su fila y su hoja sin romperse, y los nombres de estado son los de la maqueta", () => {
    const enTabla = SEDE.prendas.filter(enLaTabla);
    expect(enTabla.length).toBeGreaterThan(10);
    for (const p of enTabla) {
      const f = filaVista(p, CTX_LIDER);
      const d = detalleVista(p, CTX_LIDER);
      expect(f.estado.texto.length, p.productoNombre).toBeGreaterThan(0);
      expect(d.titulo).toContain(p.productoNombre);
      if (p.estado.tipo === "semaforo") expect(Object.values(NOMBRE_TRAMO)).toContain(f.estado.texto);
    }
  });

  it("las que están «Por decidir» tienen alguna sugerencia (ninguna queda sin pista)", () => {
    for (const p of SEDE.prendas.filter((x) => x.estado.quieta)) expect(filaVista(p, CTX_REAL).sugerencias.length, p.productoNombre).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Correcciones del paso 4 (revisión del escéptico, 2026-09-28): lo que la pantalla decía mal con datos que existen.
// ---------------------------------------------------------------------------

describe("corrección del paso 4 · la cabecera no dice más de lo que se sabe", () => {
  const conVara = (v: Partial<VaraCategoria>) => ctx({ categorias: new Map([["blu", vara("blu", v)]]) });
  it("sin la mitad, lo vendido va hacia abajo: 8 de 17 (47 %) son «4 de cada 10», no «5» junto a «no se sabe cuánto tarda la mitad»", () => {
    const g = grupoVista("blu", "Blusas", conVara({ cortes: { p50: null, p75: null, p90: null }, tMax: 40 * DIA, vendidoAlFinal: 8 / 17, vendidas: 8 }));
    expect(g.comparacion).toBe("A los 40 días ya se vendieron 4 de cada 10 de las prendas de Blusas en Tienda Trujillo: todavía no se sabe cuánto tarda la mitad.");
  });
  it("sin el 9 de 10, un 87 % vendido son «8 de cada 10», no «9»; y 1 − 0.9 sigue siendo «1 de cada 10»", () => {
    const sinP90 = conVara({ cortes: { p50: 18 * DIA, p75: 34 * DIA, p90: null }, tMax: 50 * DIA, vendidoAlFinal: 0.87 });
    expect(grupoVista("blu", "Blusas", sinP90).comparacion).toContain("; a los 50, 8 de cada 10; más allá todavía no se sabe.");
    const uno = conVara({ cortes: { p50: null, p75: null, p90: null }, tMax: 20 * DIA, vendidoAlFinal: 1 - 0.9, vendidas: 2 });
    expect(grupoVista("blu", "Blusas", uno).comparacion).toContain("ya se vendieron 1 de cada 10");
  });
  it("el % de Nuevas no redondea a 100 ni a 0 cuando no lo es", () => {
    expect(porcentajeEntero(99.6, 249, 250)).toBe(99);
    expect(porcentajeEntero(0.4, 1, 250)).toBe(1);
    expect(porcentajeEntero(100, 250, 250)).toBe(100);
    expect(porcentajeEntero(0, 0, 250)).toBe(0);
    expect(cifrasVista({ unidadesEnPiso: 250, edadDelPisoDias: 3, edadDelPisoAlMenos: false, unidadesNuevas: 249, unidadesConTramo: 250, pctNuevas: 99.6, porDecidir: 0, decididas: 0 }).pctNuevas).toBe(99);
  });
});

describe("corrección del paso 4 · el redondeo de los días no choca en la misma frase", () => {
  /** Una prenda del semáforo con su reloj y los cortes de las demás SIN ella; el tramo lo decide la regla real. */
  const conReloj = (dias: number, c: Cortes) => {
    const t = tramoDe(dias * DIA, c, 60 * DIA)!;
    return prenda({
      reloj: { segundos: dias * DIA, alMenos: false },
      primeraExhibicion: null,
      categoriaSinElla: { cortes: c, tMax: 60 * DIA, vendidas: 36 },
      estado: { ...ESTADO_BASE, tipo: "semaforo", tramo: t.tramo, alMenos: t.alMenos },
    });
  };
  const cortes = (p50: number, p75: number, p90: number): Cortes => ({ p50: p50 * DIA, p75: p75 * DIA, p90: p90 * DIA });

  it("17.6 días contra la mitad a los 17.8: «está por llegar a los 18», no «todavía no llega a los 18»", () => {
    const p = conReloj(17.6, cortes(17.8, 34, 52));
    expect(p.estado).toMatchObject({ tramo: "nueva" });
    expect(detalleVista(p, ctx()).porque).toContain("Lleva **18 días**: está por llegar a los 18 en que ya se vendió la mitad de las demás.");
  });
  it("18.3 días contra la mitad a los 17.9: «justo en los 18», no «pasó los 18»", () => {
    const p = conReloj(18.3, cortes(17.9, 34, 52));
    expect(p.estado).toMatchObject({ tramo: "vigente" });
    expect(detalleVista(p, ctx()).porque).toContain("Lleva **18 días**: justo en los 18 en que se vende la mitad de las demás, pero no los 34");
  });
  it("a ±0.4 días de cada corte, ninguna frase dice «N días» junto a «todavía no llega a los N» ni a «pasó los N»", () => {
    for (const c of [cortes(17.8, 34.2, 51.9), cortes(18.2, 33.8, 52.1)]) {
      for (const corte of [c.p50!, c.p75!, c.p90!].map((x) => x / DIA)) {
        for (const delta of [-0.4, -0.2, 0.2, 0.4]) {
          const texto = detalleVista(conReloj(corte + delta, c), ctx()).porque;
          expect(texto, `${corte + delta} días`).not.toMatch(/Lleva \*\*(\d+) días?\*\*: (todavía no llega a|pasó) los \1 /);
          expect(texto, `${corte + delta} días`).not.toMatch(/Lleva \*\*(\d+) días?\*\*: .*pero no los \1 /);
        }
      }
    }
  });
  it("la escala junta dos cortes que caen en el mismo día: «En su tiempo 18 d», nunca «18–18 d»", () => {
    const g = grupoVista("blu", "Blusas", ctx({ categorias: new Map([["blu", vara("blu", { cortes: { p50: 17.6 * DIA, p75: 18.3 * DIA, p90: 52 * DIA } })]]) }));
    expect(g.escala.map((e) => `${e.nombre} ${e.rango}`)).toEqual(["Recién llegada antes de 18 d", "En su tiempo 18 d", "Se está quedando 18–52 d", "Hay que moverla más de 52 d"]);
  });
});

describe("corrección del paso 4 · «1 día», nunca «1 días»", () => {
  it("la prenda colgada ayer: la fila, la hoja y lo vendido en sus días", () => {
    const ayer = prenda({
      reloj: { segundos: 1.2 * DIA, alMenos: false },
      primeraExhibicion: null,
      rapidez: null,
      ventasRecientes: 0,
      estado: { ...ESTADO_BASE, tipo: "semaforo", tramo: "nueva", alMenos: false },
    });
    expect(filaVista(ayer, ctx()).dias).toBe(1);
    expect(filaVista(ayer, ctx()).vendioTexto).toBe("vendió 0 desde que se colgó");
    const d = detalleVista(ayer, ctx());
    expect(d.porque).toContain("Lleva **1 día**:");
    expect(d.recientes).toContain("Desde que se colgó vendió **0**");
    expect(JSON.stringify(d)).not.toMatch(/\b1 días\b|sus 1 día/);
    expect(textoDias(1)).toBe("1 día");
    expect(textoDias(2)).toBe("2 días");
  });
  it("en la sede real, ningún texto dice «1 días»", () => {
    expect(todoElTexto(CTX_LIDER)).not.toMatch(/\b1 días\b|sus [01] días?\b/);
  });
});

describe("corrección del paso 4 · «sin contarla» solo cuando hay algo que comparar", () => {
  it("sin ventas en la sede no hay caja; sin ventas de las demás, «ninguna se vendió todavía» y no «solo 0»", () => {
    expect(detalleVista(prenda({ rapidez: null, estado: { ...ESTADO_BASE, tipo: "sin_ventas_sede" } }), ctx()).sinContarla).toBeNull();
    const sinDemas = prenda({
      rapidez: null,
      categoriaSinElla: { cortes: { p50: null, p75: null, p90: null }, tMax: 10 * DIA, vendidas: 0 },
      estado: { ...ESTADO_BASE, tipo: "sin_vara" },
    });
    const c = ctx({ categorias: new Map([["blu", vara("blu", { vendidas: 3, nivel: "pocos_datos" })]]) });
    const d = detalleVista(sinDemas, c);
    expect(d.sinContarla).toBe("Sin contarla, ninguna de las demás se vendió todavía.");
    expect(d.porque).toContain("Sin ella, ninguna de las demás se vendió todavía (lo más largo que se vio: 10 días)");
    expect(d.porque).toContain("**las 3 ventas son suyas**");
  });
  it("en la sede real, nada dice «solo 0»", () => {
    for (const c of [CTX_REAL, CTX_LIDER]) expect(todoElTexto(c)).not.toMatch(/solo 0\b/);
  });
});

describe("corrección del paso 4 · «aproximado» se mide con las demás SIN ella (D5)", () => {
  const semaforo = { ...ESTADO_BASE, tipo: "semaforo" as const, tramo: "critica" as const, alMenos: false };
  it("categoría sólida (21) hecha de 14 ventas suyas: la comparación sale de 7, y lo dice debajo del chip, en el porqué y en la caja", () => {
    const c = ctx({ categorias: new Map([["blu", vara("blu", { vendidas: 21, nivel: "solido" })]]) });
    const p = prenda({ categoriaSinElla: { cortes: { p50: 18 * DIA, p75: 33 * DIA, p90: 51 * DIA }, tMax: 60 * DIA, vendidas: 7 }, estado: semaforo });
    expect(estadoVista(p).debajo).toContain("aproximado");
    const d = detalleVista(p, c);
    expect(d.porque).toContain("La comparación sale de solo 7 ventas de las demás");
    expect(d.confianzaSinElla).toEqual({ texto: "Salen de 7 ventas de las demás en Tienda Trujillo:", nivel: "pocos_datos" });
  });
  it("categoría de 8 ventas, 5 suyas: «solo 3», no «solo 8»; con 1, «1 venta»", () => {
    const c = ctx({ categorias: new Map([["blu", vara("blu", { vendidas: 8, nivel: "pocos_datos" })]]) });
    const p = prenda({ categoriaSinElla: { cortes: { p50: 18 * DIA, p75: 33 * DIA, p90: 51 * DIA }, tMax: 60 * DIA, vendidas: 3 }, estado: semaforo });
    expect(detalleVista(p, c).porque).toContain("La comparación sale de solo 3 ventas de las demás");
    expect(detalleVista(p, c).porque).not.toContain("solo 8");
    const una = prenda({ categoriaSinElla: { cortes: { p50: 18 * DIA, p75: null, p90: null }, tMax: 60 * DIA, vendidas: 1 }, estado: { ...semaforo, tramo: "vigente" } });
    expect(detalleVista(una, c).confianzaSinElla?.texto).toBe("Salen de 1 venta de las demás en Tienda Trujillo:");
  });
  it("sólida sin ella: nada debajo del chip ni en la caja", () => {
    const p = prenda({ estado: semaforo });
    expect(estadoVista(p).debajo).toEqual([]);
    expect(detalleVista(p, ctx()).confianzaSinElla).toBeNull();
  });
});

describe("corrección del paso 4 · los clásicos se nombran por su estación, con los nombres de producción", () => {
  const clasico = (temporada: string, fuera: boolean, sugerencias: Sugerencia[] = []) =>
    prenda({ temporada, esClasico: true, rapidez: null, estado: { ...ESTADO_BASE, tipo: "clasico", fueraDeSuEstacion: fuera, sugerencias } });
  it("«Es de verano», «Es un clásico de verano», «de invierno», «de todo el año»; nunca «clásico · verano» en una frase", () => {
    const p = clasico("clasico_verano", true, ["guardar_hasta_su_estacion"]);
    expect(textoSugerencia("guardar_hasta_su_estacion", p, ctx())).toBe("Es de verano: ¿la guardas hasta su estación?");
    const d = detalleVista(p, ctx());
    expect(d.porque).toMatch(/^Es un clásico de verano: no pasa de moda/);
    expect(d.acciones[0]!.texto).toMatch(/^Es un clásico de verano: no envejece/);
    expect(detalleVista(clasico("clasico_invierno", false), ctx()).porque).toMatch(/^Es un clásico de invierno:/);
    expect(detalleVista(clasico("clasico", false), ctx()).porque).toMatch(/^Es un clásico de todo el año:/);
    for (const t of [d.porque, d.acciones[0]!.texto, textoSugerencia("guardar_hasta_su_estacion", p, ctx())]) expect(t).not.toMatch(/clásico ·|clasico_/i);
    // Junto al color y en la cabecera de la hoja sí va el nombre de la temporada tal cual.
    expect(filaVista(p, ctx()).temporada).toBe("Clásico · verano");
  });
  it("si el catálogo de temporadas no se pudo leer: la frase genérica, nunca la clave cruda", () => {
    const sinCatalogo = ctx({ temporadas: {} });
    const p = clasico("clasico_verano", true, ["guardar_hasta_su_estacion"]);
    expect(textoSugerencia("guardar_hasta_su_estacion", p, sinCatalogo)).toBe("¿La guardas hasta su estación?");
    expect(detalleVista(p, sinCatalogo).porque).toMatch(/^Es un clásico: no pasa de moda/);
    const pasada = prenda({ temporada: "otono_invierno", finEstacion: "2026-09-22T19:44:00Z", estado: { ...ESTADO_BASE, tipo: "semaforo", tramo: "vigente", alMenos: false, temporadaPasada: true } });
    expect(filaVista(pasada, sinCatalogo).temporadaPasada).toMatch(/^su estación terminó el 22 set/);
  });
});

describe("corrección del paso 4 · concordancias y el mismo lapso en la acción y en «Cómo se vende»", () => {
  it("«se esperaba 1», «1 venta», «Otra tiene»", () => {
    const p = prenda({ rapidez: { indice: 104, vendidas: 1, esperadas: 0.96, referencia: 36 }, ventasRecientes: 1 });
    expect(rapidezVista(p).detalle).toBe("vendió 1, se esperaba 1");
    expect(detalleVista(p, ctx()).rapidez).toContain("se esperaba **1**");
    expect(textoOtrasConPregunta(1)).toBe("**Otra** tiene una pregunta en «Qué hacer» sin estar por decidir.");
    expect(textoOtrasConPregunta(3)).toBe("**Otras 3** tienen una pregunta en «Qué hacer» sin estar por decidir.");
  });
  it("«sigue vendiendo» de una prenda con 12 días en el piso dice «en sus 12 días», como «Cómo se vende» (no «últimos 30»)", () => {
    const p = prenda({
      reloj: { segundos: 12 * DIA, alMenos: false },
      primeraExhibicion: null,
      temporada: "invierno",
      finEstacion: "2026-09-22T19:44:00Z",
      ventasRecientes: 3,
      estado: { ...ESTADO_BASE, tipo: "semaforo", tramo: "nueva", alMenos: false, temporadaPasada: true, quieta: true, sugerencias: ["sigue_vendiendo"] },
    });
    const d = detalleVista(p, ctx());
    expect(d.acciones[0]!.texto).toContain("sigue vendiendo: 3 en sus 12 días en el piso.");
    expect(d.acciones[0]!.texto).not.toContain("últimos 30");
    expect(d.recientes).toContain("En sus 12 días en el piso vendió **3**");
  });
});

describe("corrección del paso 4 · filtros", () => {
  it("«Sin categoría» (id vacío) va y vuelve por la URL: no se confunde con «todas»", () => {
    const qs = consultaDe({ ...SIN_FILTROS, cat: "" }, null);
    expect(qs).toBe("cat=");
    const u = new URLSearchParams(qs);
    expect(filtrosDeUrl((k) => u.get(k)).cat).toBe("");
    expect(pasaFiltros(prenda({ categoriaId: "" }), { ...SIN_FILTROS, cat: "" })).toBe(true);
    expect(pasaFiltros(prenda(), { ...SIN_FILTROS, cat: "" })).toBe(false);
  });
  it("buscar dos palabras («blusa wayra») encuentra la prenda", () => {
    expect(pasaFiltros(prenda({ productoNombre: "Blusa Wayra manga globo" }), { ...SIN_FILTROS, q: "blusa wayra" })).toBe(true);
    expect(pasaFiltros(prenda({ productoNombre: "Blusa Wayra manga globo" }), { ...SIN_FILTROS, q: "blusa wayra " })).toBe(true);
  });
  it("el panel guarda los filtros en su estado y lee la URL una sola vez (con la URL como fuente, «blusa » perdía el espacio y el cursor saltaba)", () => {
    const panel = readFileSync(new URL("../components/frescura/FrescuraPanel.tsx", import.meta.url), "utf8");
    expect(panel).toMatch(/useState<Filtros>\(\(\) => filtrosDeUrl\(/);
    expect(panel.match(/filtrosDeUrl\(/g)).toHaveLength(1);
    // Y la categoría que no está en la tabla se normaliza a «todas» contra las opciones del combo.
    expect(panel).toMatch(/opcionesCategoria\.some\(\(o\) => o\.valor === pedidos\.cat\)/);
    // «Por decidir» NO es una cifra aparte de la cabecera: lo dice la frase de arriba y lo filtra la píldora (una sola vez, ADR-0350).
    expect(panel).not.toMatch(/etiqueta: "por decidir"/);
  });
});

describe("Formidable (ADR-0350) · una fila, una prenda, una frase", () => {
  const sem = (tramo: "nueva" | "vigente" | "envejecida" | "critica", alMenos = false) => ({ ...ESTADO_BASE, tipo: "semaforo" as const, tramo, alMenos });

  it("los cuatro estados se llaman como los diría la tienda, en la fila, el filtro y la escala (una sola lista)", () => {
    expect(NOMBRE_TRAMO).toEqual({ nueva: "Recién llegada", vigente: "En su tiempo", envejecida: "Se está quedando", critica: "Hay que moverla" });
    const filtros = FILTROS_ESTADO.filter((f) => ["nueva", "vigente", "envejecida", "critica"].includes(f.valor)).map((f) => f.texto);
    expect(filtros).toEqual(Object.values(NOMBRE_TRAMO));
    for (const tramo of ["nueva", "vigente", "envejecida", "critica"] as const) expect(estadoVista(prenda({ estado: sem(tramo) })).texto).toBe(NOMBRE_TRAMO[tramo]);
  });

  it("la línea de días dice «Lleva N días», con «o más» cuando no se sabe desde cuándo está", () => {
    expect(llevaTexto(prenda({ reloj: { segundos: 6 * DIA, alMenos: false } }), false)).toBe("Lleva 6 días");
    expect(llevaTexto(prenda({ reloj: { segundos: 1 * DIA, alMenos: false } }), false)).toBe("Lleva 1 día");
    expect(llevaTexto(prenda({ reloj: { segundos: 6 * DIA, alMenos: true } }), false)).toBe("Lleva 6 días o más");
  });

  it("la apartada dice que está en pausa y la que no cuadra no dice días (no los tiene)", () => {
    expect(llevaTexto(prenda({ reloj: { segundos: 6 * DIA, alMenos: false } }), true)).toBe("En pausa: está apartada");
    expect(llevaTexto(prenda({ estado: { ...ESTADO_BASE, tipo: "dudosa" } }), false)).toBeNull();
  });

  it("sin nada que hacer, la fila dice «Déjala así»; la apartada y la que no cuadra, lo suyo", () => {
    expect(filaVista(prenda({ estado: sem("vigente") }), ctx()).nada).toBe("Déjala así");
    expect(filaVista(prenda({ pisoHoy: 0, apartadasHoy: 2, apartadasPisoHoy: 2, estado: sem("vigente") }), ctx()).nada).toBe("Nada: tiene dueño");
    expect(filaVista(prenda({ estado: { ...ESTADO_BASE, tipo: "dudosa" } }), ctx()).nada).toBe("Revisa su stock primero");
  });
});

describe("Formidable (ADR-0350) · la pantalla dice qué le toca a la persona", () => {
  it("la frase bajo el título es la PREGUNTA de Felipe y su respuesta de hoy (ADR-0208, act. 2026-10-10 (b))", () => {
    expect(fraseEncabezado(null)).toBe("¿Tu piso está fresco?");
    expect(fraseEncabezado({ pregunta: "¿Tu piso está fresco?", respuesta: "58 de cada 100 prendas colgadas están frescas.", afirma: true, tendencia: null, antes: null })).toBe(
      "¿Tu piso está fresco? **58 de cada 100 prendas colgadas están frescas.**",
    );
    // Sin la puerta (la tienda no registra lo que vende), la respuesta es un «todavía no», nunca un porcentaje.
    expect(fraseEncabezado(respuestaDelPiso(pisoPorFamilia(SEDE.prendas, { familiaDe: () => null, familias: [] })[0] ?? null, null))).toBe(
      "¿Tu piso está fresco? **Todavía no se puede saber.**",
    );
  });

  it("de entrada, lo por decidir va PRIMERO; cualquier filtro o «Ver todas» suelta el resto", () => {
    const entrada = vistaDeEntrada(SIN_FILTROS, 5);
    expect(entrada.primeroLoDecidible).toBe(true);
    expect(entrada.efectivos).toEqual({ ...SIN_FILTROS, porDecidir: true });
    // Sin nada por decidir se ve todo: no hay nada que poner primero.
    expect(vistaDeEntrada(SIN_FILTROS, 0)).toEqual({ primeroLoDecidible: false, efectivos: SIN_FILTROS });
    // La persona pidió todas, buscó, filtró por categoría o por estado: se respeta lo que pidió.
    for (const pedido of [{ todas: true }, { q: "blusa" }, { cat: "blu" }, { estado: "critica" as const }, { decididas: true }]) {
      const f = { ...SIN_FILTROS, ...pedido };
      expect(vistaDeEntrada(f, 5), JSON.stringify(pedido)).toEqual({ primeroLoDecidible: false, efectivos: f });
    }
  });

  it("«todas» viaja en la URL: un enlace abre lo mismo, y «todas» solo no cuenta como filtro", () => {
    const f = filtrosDeUrl((k) => (k === "todas" ? "1" : null));
    expect(f).toEqual({ ...SIN_FILTROS, todas: true });
    expect(consultaDe(f, null)).toBe("todas=1");
    expect(hayFiltros(f)).toBe(false);
    expect(filtrosDeUrl(() => null).todas).toBe(false);
  });
});

describe("Formidable (ADR-0350) · lo aproximado se dice UNA vez cuando es la regla, y se marca cuando es la excepción", () => {
  const pocas = { cortes: { p50: 18 * DIA, p75: 33 * DIA, p90: 51 * DIA }, tMax: 60 * DIA, vendidas: 4 };
  const firmes = { cortes: { p50: 18 * DIA, p75: 33 * DIA, p90: 51 * DIA }, tMax: 60 * DIA, vendidas: 40 };
  const conPocas = (clave: string) => prenda({ clave, categoriaSinElla: pocas, estado: { ...ESTADO_BASE, tipo: "semaforo", tramo: "vigente", alMenos: false } });
  const conFirmes = (clave: string) => prenda({ clave, categoriaSinElla: firmes, estado: { ...ESTADO_BASE, tipo: "semaforo", tramo: "vigente", alMenos: false } });

  it("una prenda es aproximada si se comparó con menos de 10 ventas, o si todavía no hay con qué comparar", () => {
    expect(esAproximada(conPocas("a"))).toBe(true);
    expect(esAproximada(conFirmes("a"))).toBe(false);
    expect(esAproximada(prenda({ estado: { ...ESTADO_BASE, tipo: "sin_ventas_sede" } }))).toBe(true);
    expect(esAproximada(prenda({ estado: { ...ESTADO_BASE, tipo: "sin_vara" } }))).toBe(true);
    expect(esAproximada(prenda({ estado: { ...ESTADO_BASE, tipo: "clasico", fueraDeSuEstacion: false } }))).toBe(false);
  });

  it("con MÁS de la mitad aproximada hay un solo aviso, con el nombre de la sede; con la mitad o menos, ninguno", () => {
    const aviso = avisoPocasVentas([conPocas("a"), conPocas("b"), conFirmes("c")], "Tienda TRU");
    expect(aviso).toBe("**Todavía hay pocas ventas en Tienda TRU.** Por eso lo de abajo es aproximado y algunas prendas dicen «Aún no se sabe»: en unas semanas se afina.");
    expect(avisoPocasVentas([conPocas("a"), conFirmes("b")], "Tienda TRU")).toBeNull();
    expect(avisoPocasVentas([conFirmes("a"), conFirmes("b")], "Tienda TRU")).toBeNull();
    expect(avisoPocasVentas([], "Tienda TRU")).toBeNull();
  });
});

describe("el tablero por categoría (nivel 1; ADR-0208, act. 2026-10-07)", () => {
  const sem = (tramo: "nueva" | "vigente" | "envejecida" | "critica", quieta = false) => ({ ...ESTADO_BASE, tipo: "semaforo" as const, tramo, alMenos: false, quieta, sugerencias: [] });

  /** Una prenda con `n` unidades colgadas hace `dias` días (una talla, una tanda), coherente con lo que cuenta la barra. */
  const colgada = (n: number, dias: number, o: Partial<FrescuraPrenda>) =>
    prenda({
      ...o,
      pisoHoy: n,
      reloj: { segundos: dias * DIA, alMenos: false },
      relojUnidad: { segundos: dias * DIA, alMenos: false },
      tallas: [{ varianteId: `${o.clave ?? "prod-1"}-m`, talla: "M", pisoHoy: n, almacenHoy: 0, apartadasHoy: o.apartadasHoy ?? 0, apartadasPisoHoy: o.apartadasPisoHoy ?? 0, colgadas: n > 0 ? [{ segundos: dias * DIA, unidades: n, edadDesconocida: false }] : [] }],
    });

  it("una fila por categoría: unidades colgadas por tramo, prendas, por decidir y la vara; primero lo que más se queda", () => {
    const c = ctx({ categorias: new Map([["blu", vara("blu")], ["cap", vara("cap", { categoriaNombre: "Capas", nivel: "pocos_datos", vendidas: 3 })]]) });
    // Sus cortes sin ella: P50 18 días, P75 33, P90 51.
    const filas = tableroVista(
      [
        colgada(4, 10, { categoriaId: "blu", categoriaNombre: "Blusas", estado: sem("nueva"), porDecidir: false }),
        colgada(2, 60, { clave: "b2", categoriaId: "blu", categoriaNombre: "Blusas", estado: sem("critica", true), porDecidir: true }),
        // Sin nada colgado: no suma unidades ni prendas (una apartada entera sigue en la tabla, pero no en la barra).
        colgada(0, 20, { clave: "b3", categoriaId: "blu", categoriaNombre: "Blusas", estado: sem("vigente"), porDecidir: false }),
        // Una categoría con todo apartado (nada colgado) no tiene fila: el tablero cuenta lo que cuelga.
        colgada(0, 20, { clave: "a1", categoriaId: "apa", categoriaNombre: "Apartadas", apartadasHoy: 1, apartadasPisoHoy: 1, estado: sem("vigente"), porDecidir: false }),
        colgada(3, 40, { clave: "c1", categoriaId: "cap", categoriaNombre: "Capas", estado: sem("envejecida", true), porDecidir: true }),
        colgada(1, 40, { clave: "c2", categoriaId: "cap", categoriaNombre: "Capas", estado: { ...ESTADO_BASE, tipo: "sin_vara" }, categoriaSinElla: null, porDecidir: false }),
        colgada(2, 40, { clave: "c3", categoriaId: "cap", categoriaNombre: "Capas", estado: { ...ESTADO_BASE, tipo: "clasico", fueraDeSuEstacion: false }, categoriaSinElla: null, porDecidir: false }),
      ],
      c,
    );
    // Capas: 3 unidades que se quedan; Blusas: 2.
    expect(filas.map((f) => f.nombre)).toEqual(["Capas", "Blusas"]);
    expect(filas[1]).toMatchObject({
      categoriaId: "blu",
      total: 6,
      prendas: 2,
      porDecidir: 1,
      viejas: 2,
      unidades: { fresca: 4, vigente: 0, envejeciendo: 2, sin_saber: 0, clasico: 0 },
      // Vara sólida: no se dice (la regla se calla, la excepción se marca; Felipe 2026-10-09).
      vara: null,
    });
    expect(filas[0]).toMatchObject({ total: 6, prendas: 3, porDecidir: 1, viejas: 3, unidades: { envejeciendo: 3, sin_saber: 1, clasico: 2 }, vara: { texto: "Pocas ventas: aproximado", tono: "ambar" } });
    // Los segmentos de la barra: solo los tramos con unidades, en el orden de la barra y con las palabras de la tienda.
    expect(segmentosDe(filas[1]).map((s) => [s.clave, s.valor])).toEqual([
      ["fresca", 4],
      ["envejeciendo", 2],
    ]);
    expect(segmentosDe(filas[0]).map((s) => s.nombre)).toEqual(["Envejeciendo", "Aún no se sabe", "Clásico"]);
    expect(tableroVista([], c)).toEqual([]);
  });

  it("cuenta unidad por unidad: un modelo con una unidad vieja y dos repuestas ayer pinta 1 Envejeciendo y 2 Vigentes", () => {
    const c = ctx();
    const repuesto = prenda({
      pisoHoy: 3,
      reloj: { segundos: 70 * DIA, alMenos: false },
      relojUnidad: { segundos: 40 * DIA, alMenos: false },
      tallas: [{ varianteId: "v-m", talla: "M", pisoHoy: 3, almacenHoy: 0, apartadasHoy: 0, apartadasPisoHoy: 0, colgadas: [{ segundos: 40 * DIA, unidades: 1, edadDesconocida: false }, { segundos: 1 * DIA, unidades: 2, edadDesconocida: false }] }],
      estado: sem("envejecida"),
    });
    expect(tableroVista([repuesto], c)[0].unidades).toMatchObject({ envejeciendo: 1, vigente: 2 });
  });

  it("con la salida real de la base, las categorías suman exactamente la barra de la tienda", () => {
    const filas = tableroVista(SEDE.prendas.filter(enLaTabla), CTX_REAL);
    const tienda = pisoPorFamilia(SEDE.prendas, { familiaDe: () => null, familias: [] })[0];
    for (const t of TRAMOS_BARRA) expect(filas.reduce((s, f) => s + f.unidades[t], 0)).toBe(tienda.unidades[t]);
    expect(filas.reduce((s, f) => s + f.total, 0)).toBe(SEDE.cifras.unidadesEnPiso);
  });

  it("la vara, solo cuando es la excepción (Felipe 2026-10-09): contra CAYLA, pocas ventas o ninguna; sólida o aceptable, nada", () => {
    const base = vara("x");
    const respaldo = { ...base, respaldo: undefined, vendidas: 30, unidades: 40, nivel: "solido" as const, calculadaEn: AHORA, enUso: true };
    expect(varaTablero(vara("x", { nivel: "pocos_datos", respaldo }))).toEqual({ texto: "Comparada con las 3 tiendas", tono: "pizarra" });
    expect(varaTablero(vara("x", { nivel: "pocos_datos", respaldo: { ...respaldo, enUso: false } }))).toEqual({ texto: "Pocas ventas: aproximado", tono: "ambar" });
    expect(varaTablero(vara("x", { nivel: "solido" }))).toBeNull();
    expect(varaTablero(vara("x", { nivel: "aceptable" }))).toBeNull();
    // «Sin ventas aún», nunca tachado: el tablero pasa `tachado={false}` (el tono apagado tacha por defecto, y eso se lee como negación).
    expect(varaTablero(vara("x", { nivel: null }))).toEqual({ texto: "Sin ventas aún", tono: "apagado" });
    expect(varaTablero(undefined)).toEqual({ texto: "Sin ventas aún", tono: "apagado" });
  });

  it("la consecuencia del botón de la fila se dice antes de tocarlo, con el plazo que se va a anotar", () => {
    expect(textoConsecuenciaFila("cambie_lugar", 7)).toBe("Cuando la hayas movido, toca el botón: la miro 7 días y te digo si sirvió.");
    expect(textoConsecuenciaFila("hasta_agotar", 9)).toBe("Si la dejas colgada, toca el botón: no te la vuelvo a preguntar en 9 días.");
    expect(textoConsecuenciaFila("hasta_agotar", 1)).toBe("Si la dejas colgada, toca el botón: no te la vuelvo a preguntar en 1 día.");
    expect(textoConsecuenciaFila("rebaje", 9)).toBe("Toca el botón cuando lo hayas hecho: queda anotado a tu nombre.");
  });

  it("el pie en cifras: cuántas guardadas, cuántas nunca colgadas y cuántas agotadas, con la concordancia; sin nada, null", () => {
    expect(resumenPie({ guardadas: ["a (1)", "b (2)"], nuncaColgadas: ["c (18)"], agotadas: 1 })).toEqual({
      guardadas: "2 prendas guardadas en el almacén después de colgarse: no cuentan días mientras estén guardadas.",
      nuncaColgadas: "1 prenda solo en el almacén, nunca colgada: no se mide hasta que se cuelgue.",
      agotadas: "1 prenda se agotó en lo que mira esta pantalla: ya no está en la tienda.",
    });
    expect(resumenPie({ guardadas: ["a (1)"], nuncaColgadas: ["c", "d"], agotadas: 2 })).toEqual({
      guardadas: "1 prenda guardada en el almacén después de colgarse: no cuenta días mientras esté guardada.",
      nuncaColgadas: "2 prendas solo en el almacén, nunca colgadas: no se miden hasta que se cuelguen.",
      agotadas: "2 prendas se agotaron en lo que mira esta pantalla: ya no están en la tienda.",
    });
    expect(resumenPie({ guardadas: [], nuncaColgadas: [], agotadas: 0 })).toEqual({ guardadas: null, nuncaColgadas: null, agotadas: null });
  });

  it("accionDeFila: la primera sugerencia es un botón con su verbo; anota, enlaza o abre la hoja; sin piso o con decisión vigente, nada", () => {
    const con = (sugerencias: Sugerencia[], extra: Partial<FrescuraPrenda> = {}) =>
      prenda({ pisoHoy: 2, estado: { ...ESTADO_BASE, tipo: "semaforo", tramo: "critica", alMenos: false, quieta: true, sugerencias }, ...extra });
    const c = ctx();
    expect(accionDeFila(con(["cambiar_lugar", "trasladar"]), c, false)).toEqual({ tipo: "anotar", verbo: "La cambié de lugar", accion: "cambie_lugar" });
    expect(accionDeFila(con(["dejar_hasta_agotar"]), c, false)).toEqual({ tipo: "anotar", verbo: "La dejo hasta agotar", accion: "hasta_agotar" });
    expect(accionDeFila(con(["trasladar"], { almacenHoy: 3 }), c, false)).toMatchObject({ tipo: "enlace", verbo: "Armar traslado", href: expect.stringContaining("/inventario/mover?lineas=") });
    expect(accionDeFila(con(["retirar"]), c, false)).toMatchObject({ tipo: "enlace", verbo: "Retirar del piso", href: expect.stringContaining("/inventario?variante=") });
    expect(accionDeFila(con(["guardar_hasta_su_estacion"]), c, false)).toMatchObject({ tipo: "enlace", verbo: "Guardar en el almacén" });
    expect(accionDeFila(con(["revisar_ventas"]), c, false)).toMatchObject({ tipo: "enlace", verbo: "Ver sus ventas", href: expect.stringContaining("/vender/historial?q=") });
    expect(accionDeFila(con(["sigue_vendiendo"]), c, false)).toEqual({ tipo: "hoja", verbo: "Decidir", modo: "decidir", opcion: "hasta_agotar" });
    expect(accionDeFila(con(["rebaja_chica"]), c, false)).toEqual({ tipo: "hoja", verbo: "Decidir", modo: "decidir", opcion: "rebaje" });
    // Sin la pantalla que lo hace, la hoja (nunca un enlace que termine en «Sin acceso»); «Ver por qué» abre el detalle, no «Ya decidí».
    const sinNada = ctx({ acceso: { existencias: false, historial: false, traslados: false, conteos: false, atributos: false } });
    const porque = { tipo: "hoja", verbo: "Ver por qué", modo: "detalle", opcion: null };
    expect(accionDeFila(con(["trasladar"], { almacenHoy: 3 }), sinNada, false)).toEqual({ tipo: "hoja", verbo: "Decidir", modo: "decidir", opcion: null });
    expect(accionDeFila(con(["retirar"]), sinNada, false)).toEqual({ tipo: "hoja", verbo: "Decidir", modo: "decidir", opcion: null });
    expect(accionDeFila(con(["revisar_ventas"]), sinNada, false)).toEqual(porque);
    // Sin la libreta leída (`fn_frescura_decisiones` falló) no se anota ni se abre «Ya decidí»: solo el porqué; los enlaces siguen.
    expect(accionDeFila(con(["cambiar_lugar"]), c, false, false)).toEqual(porque);
    expect(accionDeFila(con(["sigue_vendiendo"]), c, false, false)).toEqual(porque);
    expect(accionDeFila(con(["trasladar"], { almacenHoy: 3 }), sinNada, false, false)).toEqual(porque);
    expect(accionDeFila(con(["revisar_ventas"]), c, false, false)).toMatchObject({ tipo: "enlace", verbo: "Ver sus ventas" });
    // Nada que hacer: sin sugerencias, sin nada en el piso, o con una decisión vigente (la fila ya dice qué se decidió).
    expect(accionDeFila(con([]), c, false)).toBeNull();
    expect(accionDeFila(con(["cambiar_lugar"], { pisoHoy: 0 }), c, false)).toBeNull();
    expect(accionDeFila(con(["cambiar_lugar"]), c, true)).toBeNull();
  });

  it("tramoBarraDe: el semáforo manda, en las palabras de la tienda; el clásico va aparte; lo demás, «aún no se sabe»", () => {
    expect(tramoBarraDe(prenda({ estado: sem("nueva") }))).toBe("fresca");
    expect(tramoBarraDe(prenda({ estado: sem("vigente") }))).toBe("vigente");
    expect(tramoBarraDe(prenda({ estado: sem("envejecida") }))).toBe("envejeciendo");
    expect(tramoBarraDe(prenda({ estado: sem("critica") }))).toBe("envejeciendo");
    expect(tramoBarraDe(prenda({ estado: { ...ESTADO_BASE, tipo: "clasico", fueraDeSuEstacion: true } }))).toBe("clasico");
    for (const tipo of ["sin_vara", "sin_ventas_sede", "sin_edad_conocida", "dudosa"] as const) {
      expect(tramoBarraDe(prenda({ estado: { ...ESTADO_BASE, tipo } }))).toBe("sin_saber");
    }
  });
});
