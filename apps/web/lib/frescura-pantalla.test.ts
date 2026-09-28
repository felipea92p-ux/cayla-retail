import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  FILTROS_ESTADO,
  FRASE_ENCABEZADO,
  FRASE_SIN_ELLA,
  NOMBRE_TRAMO,
  SIN_FILTROS,
  TONO_TRAMO,
  cifrasVista,
  claveRapidez,
  consultaDe,
  decimal,
  detalleVista,
  diasDe,
  enLaTabla,
  estadoVista,
  fechaCorta,
  filaVista,
  filtrosDeUrl,
  grupoVista,
  hayFiltros,
  muchasSinTemporada,
  nombreMes,
  pasaEstado,
  pasaFiltros,
  pieVista,
  presenciaDe,
  rapidezVista,
  reglaVista,
  registroCorto,
  textoRegistro,
  textoSugerencia,
  trozosRicos,
  type AccesoFrescura,
  type ContextoFrescura,
} from "./frescura-pantalla";
import { analizarSede, leerFrescuraSede, type EstadoFrescura, type Sugerencia, type FrescuraPrenda, type FrescuraSede, type VaraCategoria } from "./frescura-reglas";

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

function ctx(p: Partial<ContextoFrescura> = {}): ContextoFrescura {
  return {
    sede: "Tienda Trujillo",
    desde: DESDE,
    ahora: AHORA,
    categorias: new Map([["blu", vara("blu")]]),
    cayla: null,
    caylaFallo: null,
    temporadas: { invierno: "Invierno", verano: "Verano", clasico: "Clásico" },
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
      { varianteId: "v-s", talla: "S", pisoHoy: 1, almacenHoy: 2, apartadasHoy: 0 },
      { varianteId: "v-m", talla: "M", pisoHoy: 1, almacenHoy: 2, apartadasHoy: 0 },
    ],
    pisoHoy: 2,
    almacenHoy: 4,
    apartadasHoy: 0,
    reloj: { segundos: 61 * DIA, alMenos: false },
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
    estado: { ...ESTADO_BASE, tipo: "semaforo", tramo: "critica", alMenos: false, quieta: true, sugerencias: ["cambiar_lugar", "trasladar"] },
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
  const partes: string[] = [FRASE_ENCABEZADO, FRASE_SIN_ELLA];
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
      const e = estadoVista(p, CTX_REAL);
      expect(e.tono, p.productoNombre).not.toBe("rojo");
    }
  });

  it("la Crítica es `tinta` también cuando es «al menos» (y no lleva «quizá más»: no hay nada después)", () => {
    const e = estadoVista(prenda({ estado: { ...ESTADO_BASE, tipo: "semaforo", tramo: "critica", alMenos: true } }), ctx());
    expect(e).toMatchObject({ texto: "Crítica", tono: "tinta" });
    expect(e.debajo).not.toContain("quizá más");
  });

  it("«quizá más» y «con pocos datos» van debajo del chip", () => {
    const c = ctx({ categorias: new Map([["blu", vara("blu", { nivel: "pocos_datos", vendidas: 7 })]]) });
    const e = estadoVista(prenda({ estado: { ...ESTADO_BASE, tipo: "semaforo", tramo: "vigente", alMenos: true } }), c);
    expect(e).toMatchObject({ texto: "Vigente", tono: "neutro", debajo: ["quizá más", "con pocos datos"] });
  });

  it("los estados especiales dicen su porqué (frases C) en pizarra, la que no cuadra apagada y con ícono, la apartada en neutro", () => {
    const c = ctx();
    expect(estadoVista(prenda({ estado: { ...ESTADO_BASE, tipo: "sin_ventas_sede" } }), c)).toMatchObject({ texto: "Aún no hay ventas que sirvan de medida", tono: "pizarra" });
    expect(estadoVista(prenda({ estado: { ...ESTADO_BASE, tipo: "sin_vara" } }), c)).toMatchObject({ texto: "Todavía no se sabe cuánto tardan", tono: "pizarra" });
    expect(estadoVista(prenda({ estado: { ...ESTADO_BASE, tipo: "sin_edad_conocida" } }), c)).toMatchObject({ texto: "Parece nueva, pero no se sabe cuándo llegó", tono: "pizarra" });
    expect(estadoVista(prenda({ estado: { ...ESTADO_BASE, tipo: "clasico", fueraDeSuEstacion: true } }), c)).toMatchObject({ texto: "Clásico, espera su estación", tono: "pizarra" });
    expect(estadoVista(prenda({ estado: { ...ESTADO_BASE, tipo: "dudosa" } }), c)).toMatchObject({ texto: "Sus números no cuadran", tono: "apagado", icono: true });
    const apartada = prenda({ pisoHoy: 0, apartadasHoy: 3, estado: { ...ESTADO_BASE, tipo: "semaforo", tramo: "vigente", alMenos: false } });
    expect(estadoVista(apartada, c)).toMatchObject({ texto: "Apartada para clientas", tono: "neutro", previo: "iba en Vigente · 3 apartadas" });
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
    expect(presenciaDe({ pisoHoy: 1, almacenHoy: 0, apartadasHoy: 0, primeraExhibicion: null })).toBe("en_piso");
    expect(presenciaDe({ pisoHoy: 0, almacenHoy: 0, apartadasHoy: 2, primeraExhibicion: AHORA })).toBe("apartada");
    expect(presenciaDe({ pisoHoy: 0, almacenHoy: 3, apartadasHoy: 0, primeraExhibicion: AHORA })).toBe("guardada");
    expect(presenciaDe({ pisoHoy: 0, almacenHoy: 3, apartadasHoy: 0, primeraExhibicion: null })).toBe("nunca_colgada");
    // El pedido de otra sede separado al instante: nunca estuvo libre en el piso (revisión 9, N3).
    expect(presenciaDe({ pisoHoy: 0, almacenHoy: 0, apartadasHoy: 1, primeraExhibicion: null })).toBe("nunca_colgada");
    expect(presenciaDe({ pisoHoy: 0, almacenHoy: 0, apartadasHoy: 0, primeraExhibicion: AHORA })).toBe("agotada");
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
    expect(pieVista([guardada, agotada])).toEqual({ guardadas: ["Blusa Wayra Negro (4), iba en Crítica"], nuncaColgadas: [], agotadas: 1 });
  });

  it("sin temporada: el aviso único sale solo con MÁS de la mitad sin temporada", () => {
    const sin = (n: number, total: number) =>
      Array.from({ length: total }, (_, i) => prenda({ clave: `p${i}`, estado: { ...ESTADO_BASE, tipo: "semaforo", tramo: "nueva", alMenos: false, sinTemporada: i < n } }));
    expect(muchasSinTemporada(sin(2, 4))).toBe(false);
    expect(muchasSinTemporada(sin(3, 4))).toBe(true);
    expect(muchasSinTemporada([])).toBe(false);
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

  it("las otras cuatro, con sus datos", () => {
    expect(textoSugerencia("trasladar", prenda(), c)).toBe("Hay 4 en el almacén: ¿otra sede la vende antes?");
    expect(textoSugerencia("retirar", prenda(), c)).toBe("Ya pasó su temporada: ¿la sacas del piso?");
    expect(textoSugerencia("sigue_vendiendo", prenda(), c)).toBe("Pasó su temporada y se sigue vendiendo: ¿hasta agotar o la sacas?");
    expect(textoSugerencia("guardar_hasta_su_estacion", prenda({ temporada: "verano" }), c)).toBe("Es de verano: ¿la guardas hasta su estación?");
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
    expect(leer("cat=blu&estado=critica&pordecidir=1&q=wayra")).toEqual({ cat: "blu", estado: "critica", porDecidir: true, q: "wayra" });
    expect(consultaDe(SIN_FILTROS, null)).toBe("");
    expect(consultaDe({ cat: "blu", estado: "critica", porDecidir: true, q: " wayra " }, "prod-1|NEG")).toBe("cat=blu&estado=critica&pordecidir=1&q=wayra&prenda=prod-1%7CNEG");
    expect(hayFiltros(SIN_FILTROS)).toBe(false);
    expect(hayFiltros({ ...SIN_FILTROS, q: "x" })).toBe(true);
  });

  it("Estado: 11 opciones (con buscador, ADR-0209); las «al menos» cuentan en su edad; «Temporada» se cruza con las demás", () => {
    expect(FILTROS_ESTADO).toHaveLength(11);
    const alMenos = prenda({ estado: { ...ESTADO_BASE, tipo: "semaforo", tramo: "vigente", alMenos: true, temporadaPasada: true } });
    expect(pasaEstado(alMenos, "vigente")).toBe(true);
    expect(pasaEstado(alMenos, "temporada_pasada")).toBe(true);
    expect(pasaEstado(alMenos, "sin_comparar")).toBe(false);
    const apartada = prenda({ pisoHoy: 0, apartadasHoy: 2, estado: { ...ESTADO_BASE, tipo: "semaforo", tramo: "vigente", alMenos: false } });
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
    expect(pasaFiltros(prenda({ estado: { ...ESTADO_BASE, tipo: "semaforo", tramo: "nueva", alMenos: false } }), { ...SIN_FILTROS, porDecidir: true })).toBe(false);
  });
});

describe("la cabecera de cada categoría", () => {
  it("con la curva completa: la mitad, 3 de cada 4, casi todas; la escala y la base", () => {
    const g = grupoVista("blu", "Blusas", ctx());
    expect(g.comparacion).toBe("A los 18 días ya se vendió la mitad de las prendas de Blusas en Tienda Trujillo; a los 34, 3 de cada 4; a los 52, casi todas.");
    expect(g.escala).toEqual([
      { nombre: "Nueva", rango: "antes de 18 d" },
      { nombre: "Vigente", rango: "18–34 d" },
      { nombre: "Envejecida", rango: "34–52 d" },
      { nombre: "Crítica", rango: "más de 52 d" },
    ]);
    expect(g.base).toBe("con 37 ventas de los últimos 60 días");
    expect(g.cayla).toBeNull(); // quien no es líder no ve la referencia de CAYLA
  });

  it("sin la mitad todavía: el % vendido a los días más largos (decisión 6); sin ventas: no hay con qué comparar", () => {
    const sinMitad = ctx({ categorias: new Map([["blu", vara("blu", { cortes: { p50: null, p75: null, p90: null }, tMax: 42 * DIA, vendidoAlFinal: 0.25, vendidas: 1 })]]) });
    expect(grupoVista("blu", "Chompas", sinMitad).comparacion).toBe(
      "A los 42 días ya se vendieron 3 de cada 10 de las prendas de Chompas en Tienda Trujillo: todavía no se sabe cuánto tarda la mitad.",
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
      cifrasVista({ unidadesEnPiso: 45, edadDelPisoDias: 23.6, edadDelPisoAlMenos: true, unidadesNuevas: 7, unidadesConTramo: 29, pctNuevas: 24.1, porDecidir: 6 }),
    ).toEqual({ edad: 24, edadQuizaMas: true, pctNuevas: 24, nuevas: 7, conTramo: 29, porDecidir: 6, unidades: 45 });
  });
});

describe("la regla del detalle: dónde cae entre las demás (el único rojo de la pantalla es su zona Crítica)", () => {
  it("cuatro zonas con su nombre, anchos que suman 100, las marcas de la mitad, 3 de 4 y 9 de 10", () => {
    const r = reglaVista(prenda())!;
    expect(r.zonas.map((z) => z.nombre)).toEqual(["Nueva", "Vigente", "Envejecida", "Crítica"]);
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
    const apartada = detalleVista(prenda({ pisoHoy: 0, apartadasHoy: 2, estado: { ...ESTADO_BASE, tipo: "semaforo", tramo: "vigente", alMenos: false } }), ctx());
    expect(apartada.acciones).toEqual([]);
    expect(apartada.sinAcciones).toBe("Nada: tiene dueña. Vuelve a medirse si alguna se libera.");
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
    expect(sinFecha.porque).toContain("Por eso es «Vigente quizá más» y nunca «Nueva».");
    const antes = detalleVista(
      prenda({ primeraExhibicion: "2026-04-01T15:00:00Z", reloj: { segundos: 90 * DIA, alMenos: true }, estado: { ...ESTADO_BASE, tipo: "semaforo", tramo: "critica", alMenos: true } }),
      ctx(),
    );
    expect(antes.porque).toContain("Se colgó por primera vez antes del 31 may, más atrás de lo que mira esta pantalla (120 días)");
    expect(antes.porque).toContain("Aunque lleve más, ya es Crítica.");
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
