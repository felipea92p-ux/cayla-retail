import { describe, expect, it } from "vitest";
import { COMPORTAMIENTOS, type ClaseDeAvio, type ComportamientoClase } from "./avio-clases-reglas";
import {
  MENSAJE_CLASE,
  MENSAJE_MERMA_SIN_METRO,
  MENSAJE_NOMBRE,
  MENSAJE_SALDO_DEL_LIDER,
  MENSAJE_SIN_COLORES,
  MENSAJE_SIN_COSTO,
  avioParecido,
  camposDeAvioNuevo,
  codigoDeVistaPreviaAvio,
  columnasDeLaTablaAvio,
  coloresDelAvioParaLaBase,
  llevaMerma,
  materialDelAvioParaLaBase,
  medidaEscrita,
  nombreCompuesto,
  problemasDeLaMedida,
  problemasDeAvioNuevo,
  tituloDeLaMedida,
  type EntradaAvioNuevo,
} from "./avio-nuevo-reglas";
import { sePuedeConfirmar } from "./guia-campos";
import type { MaterialVista } from "./insumos-reglas";

// «Nuevo avío» (ADR-0580). Lo que estas pruebas protegen: que la guía de foco NO pueda contradecir a la validación (ADR-0284 lo exige), que las reglas sean las mismas que las de la base
// (`fn_material_leer`) y que lo que viaja a `crear_material` sea exactamente lo que ella espera.

const CLASES: ClaseDeAvio[] = [
  { id: "k-bot", nombre: "Botón", prefijo: "BOT", comportamiento: "pieza", unidadSugerida: "unidad", pideColor: true, orden: 10, activo: true, nota: null },
  { id: "k-cie", nombre: "Cierre", prefijo: "CIE", comportamiento: "largo", unidadSugerida: "unidad", pideColor: true, orden: 20, activo: true, nota: null },
  { id: "k-hil", nombre: "Hilo", prefijo: "HIL", comportamiento: "titulo", unidadSugerida: "cono", pideColor: true, orden: 30, activo: true, nota: null },
  { id: "k-eti", nombre: "Etiqueta", prefijo: "ETI", comportamiento: "etiqueta", unidadSugerida: "unidad", pideColor: false, orden: 40, activo: true, nota: null },
  { id: "k-ela", nombre: "Elástico y cinta", prefijo: "ELA", comportamiento: "ancho", unidadSugerida: "metro", pideColor: true, orden: 50, activo: true, nota: null },
  { id: "k-otr", nombre: "Otro", prefijo: "AVI", comportamiento: "otro", unidadSugerida: "unidad", pideColor: true, orden: 99, activo: true, nota: null },
];

const base: EntradaAvioNuevo = {
  claseId: "k-bot",
  nombre: "Botón nácar",
  unidad: "unidad",
  medida: "18",
  medidaUnidad: "linea",
  merma: "",
  filas: [{ color: "NEG", ya: "", costo: "", minimo: "" }],
  puedeSaldo: true,
  responsableListo: true,
};
const e = (extra: Partial<EntradaAvioNuevo> = {}): EntradaAvioNuevo => ({ ...base, ...extra });

const avio = (extra: Partial<MaterialVista> = {}): MaterialVista => ({
  id: "m1",
  codigo: "BOT-01",
  nombre: "Botón nácar",
  tipo: "avio",
  tejidoId: null,
  composicion: null,
  claseId: "k-bot",
  medida: { valor: 18, unidad: "linea" },
  unidad: "unidad",
  merma: 0,
  compra: "unidad",
  ancho: null,
  gramaje: null,
  metrosPorRollo: null,
  version: "v1",
  ...extra,
});

describe("lo mínimo para guardar un avío", () => {
  it("con su clase, su nombre, su medida y un color, se puede guardar", () => {
    expect(problemasDeAvioNuevo(e(), CLASES)).toEqual([]);
  });
  it("sin clase no se guarda: el sistema tiene que saber que un botón es un botón", () => {
    expect(problemasDeAvioNuevo(e({ claseId: "" }), CLASES)).toContain(MENSAJE_CLASE);
    expect(problemasDeAvioNuevo(e({ claseId: "k-inventada" }), CLASES)).toContain(MENSAJE_CLASE);
  });
  it("sin nombre tampoco", () => {
    expect(problemasDeAvioNuevo(e({ nombre: "   " }), CLASES)).toContain(MENSAJE_NOMBRE);
  });
  it("sin color tampoco, salvo que la clase no lleve color", () => {
    expect(problemasDeAvioNuevo(e({ filas: [] }), CLASES)).toContain(MENSAJE_SIN_COLORES);
    expect(problemasDeAvioNuevo(e({ claseId: "k-eti", medida: "", medidaUnidad: "", filas: [{ color: "", ya: "", costo: "", minimo: "" }] }), CLASES)).toEqual([]);
  });
});

describe("la medida: lo que cada comportamiento pide, igual que `fn_material_leer`", () => {
  it("un cierre SIN su largo no se guarda: es lo que lo distingue de otro cierre", () => {
    const p = problemasDeAvioNuevo(e({ claseId: "k-cie", nombre: "Cierre invisible", medida: "", medidaUnidad: "" }), CLASES);
    expect(p.some((x) => x.includes("Dile su largo"))).toBe(true);
  });
  it("una etiqueta CON medida tampoco: lo que la distingue es su nombre", () => {
    const p = problemasDeAvioNuevo(e({ claseId: "k-eti", nombre: "Etiqueta de composición", medida: "3", medidaUnidad: "centimetro", filas: [{ color: "", ya: "", costo: "", minimo: "" }] }), CLASES);
    expect(p.some((x) => x.includes("no lleva medida"))).toBe(true);
  });
  it("un botón SIN medida sí se guarda: en un botón la medida es recomendada, no obligatoria", () => {
    expect(problemasDeAvioNuevo(e({ medida: "", medidaUnidad: "" }), CLASES)).toEqual([]);
  });
  it("la medida de un botón no se escribe en centímetros", () => {
    const p = problemasDeLaMedida(e({ medidaUnidad: "centimetro" }), CLASES[0]);
    expect(p.some((x) => x.includes("Elige en qué se mide"))).toBe(true);
  });
  it("una medida que no se entiende, o imposible, se rechaza en vez de leerse como cero", () => {
    expect(problemasDeAvioNuevo(e({ medida: "dieciocho" }), CLASES).length).toBeGreaterThan(0);
    expect(problemasDeAvioNuevo(e({ medida: "0" }), CLASES).length).toBeGreaterThan(0);
    expect(problemasDeAvioNuevo(e({ medida: "99999" }), CLASES).length).toBeGreaterThan(0);
    // La coma decimal sí se entiende (es como se escribe en Perú).
    expect(medidaEscrita({ medida: "11,4" })).toBe(11.4);
  });
  it("RECORRE LOS SEIS COMPORTAMIENTOS: lo que exige medida la exige, lo que no la admite la rechaza, y lo que la admite la acepta", () => {
    for (const clase of CLASES) {
      const c: ComportamientoClase = clase.comportamiento;
      const sin = problemasDeLaMedida(e({ claseId: clase.id, medida: "", medidaUnidad: "" }), clase);
      expect(sin.length > 0).toBe(COMPORTAMIENTOS[c].requerida);
      const unidad = COMPORTAMIENTOS[c].medidas[0];
      const con = problemasDeLaMedida(e({ claseId: clase.id, medida: "10", medidaUnidad: unidad ?? "linea" }), clase);
      expect(con.length > 0).toBe(COMPORTAMIENTOS[c].medidas.length === 0);
    }
  });
});

describe("la merma: solo de lo que se mide en metros", () => {
  it("un botón que se cuenta por unidad no la lleva", () => {
    expect(llevaMerma({ unidad: "unidad" })).toBe(false);
    expect(problemasDeAvioNuevo(e({ merma: "5" }), CLASES)).toContain(MENSAJE_MERMA_SIN_METRO);
  });
  it("un elástico por metro sí, y se valida como la de una tela", () => {
    expect(llevaMerma({ unidad: "metro" })).toBe(true);
    const elastico = e({ claseId: "k-ela", nombre: "Elástico plano", unidad: "metro", medida: "3", medidaUnidad: "centimetro", merma: "3" });
    expect(problemasDeAvioNuevo(elastico, CLASES)).toEqual([]);
    expect(problemasDeAvioNuevo({ ...elastico, merma: "80" }, CLASES).length).toBeGreaterThan(0);
  });
});

describe("el saldo inicial de cada color", () => {
  it("quien no es líder no lo anota: la hoja lo dice en vez de dejar que la base lo rechace", () => {
    const p = problemasDeAvioNuevo(e({ puedeSaldo: false, filas: [{ color: "NEG", ya: "10", costo: "1", minimo: "" }] }), CLASES);
    expect(p).toContain(MENSAJE_SALDO_DEL_LIDER);
  });
  it("con saldo y sin costo, no se guarda (un lote a costo cero es plata perdida en silencio)", () => {
    const p = problemasDeAvioNuevo(e({ filas: [{ color: "NEG", ya: "10", costo: "", minimo: "" }] }), CLASES);
    expect(p).toContain(MENSAJE_SIN_COSTO);
  });
  it("un costo o una cantidad que no se entienden se rechazan, nunca se leen como cero", () => {
    expect(problemasDeAvioNuevo(e({ filas: [{ color: "NEG", ya: "1.200", costo: "1", minimo: "" }] }), CLASES).length).toBeGreaterThan(0);
    expect(problemasDeAvioNuevo(e({ filas: [{ color: "NEG", ya: "10", costo: "dos", minimo: "" }] }), CLASES).length).toBeGreaterThan(0);
  });
});

describe("la guía de foco no puede contradecir a la validación (ADR-0284)", () => {
  const ESCENARIOS: EntradaAvioNuevo[] = [
    e(),
    e({ claseId: "" }),
    e({ nombre: "" }),
    e({ medida: "", medidaUnidad: "" }),
    e({ claseId: "k-cie", nombre: "Cierre", medida: "", medidaUnidad: "" }),
    e({ claseId: "k-cie", nombre: "Cierre", medida: "40", medidaUnidad: "centimetro" }),
    e({ claseId: "k-hil", nombre: "Hilo", unidad: "cono", medida: "40", medidaUnidad: "titulo" }),
    e({ claseId: "k-eti", nombre: "Etiqueta", medida: "", medidaUnidad: "", filas: [{ color: "", ya: "", costo: "", minimo: "" }] }),
    e({ claseId: "k-eti", nombre: "Etiqueta", medida: "3", medidaUnidad: "centimetro", filas: [{ color: "", ya: "", costo: "", minimo: "" }] }),
    e({ claseId: "k-ela", nombre: "Elástico", unidad: "metro", medida: "3", medidaUnidad: "centimetro", merma: "3" }),
    e({ claseId: "k-ela", nombre: "Elástico", unidad: "metro", medida: "3", medidaUnidad: "centimetro", merma: "80" }),
    e({ claseId: "k-otr", nombre: "Cordón", medida: "", medidaUnidad: "" }),
    e({ filas: [] }),
    e({ filas: [{ color: "NEG", ya: "10", costo: "", minimo: "" }] }),
    e({ filas: [{ color: "NEG", ya: "10", costo: "2.50", minimo: "5" }] }),
    e({ puedeSaldo: false, filas: [{ color: "NEG", ya: "10", costo: "2", minimo: "" }] }),
    e({ merma: "5" }),
    e({ medida: "dieciocho" }),
    e({ responsableListo: false }),
  ];
  it("en los 19 escenarios, «se puede confirmar» y «no hay problemas» dicen lo mismo", () => {
    for (const x of ESCENARIOS) {
      const problemas = problemasDeAvioNuevo(x, CLASES);
      const puede = sePuedeConfirmar(camposDeAvioNuevo(x, CLASES));
      expect([x.claseId, x.nombre, x.medida, puede]).toEqual([x.claseId, x.nombre, x.medida, problemas.length === 0]);
    }
  });
  it("lo que la guía pone como «falta» tiene siempre una frase que dice qué hacer", () => {
    for (const x of ESCENARIOS) for (const c of camposDeAvioNuevo(x, CLASES)) expect(c.pendiente.length).toBeGreaterThan(5);
  });
  it("una clase que no pide color no pone «Los colores» como pendiente", () => {
    const campos = camposDeAvioNuevo(e({ claseId: "k-eti", medida: "", medidaUnidad: "", filas: [] }), CLASES);
    expect(campos.some((c) => c.id === "colores")).toBe(false);
  });
  it("una clase que no se mide no pone la medida como campo", () => {
    expect(camposDeAvioNuevo(e({ claseId: "k-eti", medida: "", medidaUnidad: "", filas: [] }), CLASES).some((c) => c.id === "medida")).toBe(false);
    expect(camposDeAvioNuevo(e(), CLASES).some((c) => c.id === "medida")).toBe(true);
  });
});

describe("el nombre que se va a leer", () => {
  it("se compone con la medida, igual que lo hace la base", () => {
    expect(nombreCompuesto(e())).toBe("Botón nácar 18 L");
    expect(nombreCompuesto(e({ claseId: "k-cie", nombre: "Cierre invisible", medida: "40", medidaUnidad: "centimetro" }))).toBe("Cierre invisible 40 cm");
  });
  it("sin medida es el nombre tal cual", () => {
    expect(nombreCompuesto(e({ medida: "", medidaUnidad: "" }))).toBe("Botón nácar");
  });
});

describe("lo que viaja a `crear_material`", () => {
  it("el material lleva su clase, su unidad y su medida; la merma solo si se mide en metros", () => {
    expect(materialDelAvioParaLaBase(e({ merma: "5" }), CLASES)).toEqual({
      nombre: "Botón nácar",
      tipo: "avio",
      clase_id: "k-bot",
      unidad_medida: "unidad",
      merma_pct: 0,
      medida_valor: 18,
      medida_unidad: "linea",
    });
    expect(materialDelAvioParaLaBase(e({ claseId: "k-ela", unidad: "metro", medida: "3", medidaUnidad: "centimetro", merma: "3" }), CLASES).merma_pct).toBeCloseTo(0.03);
  });
  it("una clase que no se mide no manda medida, aunque algo hubiera quedado escrito", () => {
    const m = materialDelAvioParaLaBase(e({ claseId: "k-eti", medida: "3", medidaUnidad: "centimetro" }), CLASES);
    expect([m.medida_valor, m.medida_unidad]).toEqual([null, null]);
  });
  it("los colores van con su mínimo, y el saldo solo si hay cantidad Y costo", () => {
    const filas = [
      { color: "NEG", ya: "10", costo: "2.50", minimo: "5" },
      { color: "BLA", ya: "", costo: "", minimo: "" },
    ];
    expect(coloresDelAvioParaLaBase(e({ filas }))).toEqual([
      { color_codigo: "NEG", stock_minimo: 5, saldo_inicial: { cantidad: 10, costo_total: 25 } },
      { color_codigo: "BLA", stock_minimo: null },
    ]);
  });
  it("la línea «sin color» viaja como `color_codigo: null`, que es lo que la base espera", () => {
    expect(coloresDelAvioParaLaBase(e({ filas: [{ color: "", ya: "", costo: "", minimo: "3" }] }))).toEqual([{ color_codigo: null, stock_minimo: 3 }]);
  });
  it("un avío NO convierte nada: lo escrito es lo que entra (no hay kilo→metro como en la tela)", () => {
    const r = coloresDelAvioParaLaBase(e({ filas: [{ color: "NEG", ya: "144", costo: "0.05", minimo: "" }] }));
    expect(r[0].saldo_inicial).toEqual({ cantidad: 144, costo_total: 7.2 });
  });
});

describe("el código y la ficha parecida", () => {
  it("el código sale del prefijo de la CLASE, y toma el siguiente número libre", () => {
    expect(codigoDeVistaPreviaAvio(CLASES[0], [])).toBe("BOT-01");
    expect(codigoDeVistaPreviaAvio(CLASES[0], [avio({ codigo: "BOT-01" }), avio({ codigo: "CIE-09" })])).toBe("BOT-02");
    expect(codigoDeVistaPreviaAvio(null, [])).toBe("AVI-01");
  });
  it("el mismo nombre con la MISMA medida es el mismo avío: hay que sumarle colores, no repetirlo", () => {
    const r = avioParecido({ nombre: "Botón nácar", medida: "18", medidaUnidad: "linea" }, [avio()]);
    expect([r?.igual, r?.avio.codigo]).toEqual([true, "BOT-01"]);
  });
  it("el mismo nombre con OTRA medida son dos avíos distintos: se avisa, pero no se dice que sea el mismo", () => {
    const r = avioParecido({ nombre: "Botón nácar", medida: "24", medidaUnidad: "linea" }, [avio()]);
    expect(r?.igual).toBe(false);
  });
  it("una tela con el mismo nombre no cuenta (son catálogos distintos)", () => {
    expect(avioParecido({ nombre: "Botón nácar", medida: "18", medidaUnidad: "linea" }, [avio({ tipo: "tela" })])).toBeNull();
  });
});

describe("la tabla de colores", () => {
  it("un avío no tiene columna de conversión: se cuenta como se compra", () => {
    const conSaldo = columnasDeLaTablaAvio({ puedeSaldo: true });
    const sinSaldo = columnasDeLaTablaAvio({ puedeSaldo: false });
    expect(conSaldo.plantilla.split(" ").length).toBe(6);
    expect(sinSaldo.plantilla.split(" ").length).toBe(4);
    expect(conSaldo.anchoMinimo).toBeGreaterThan(sinSaldo.anchoMinimo);
  });
});

describe("tituloDeLaMedida: lo que la hoja dibuja", () => {
  it("cada clase que se mide trae su título, su ejemplo y sus unidades", () => {
    expect(tituloDeLaMedida(CLASES[1])?.titulo).toBe("Largo");
    expect(tituloDeLaMedida(CLASES[1])?.unidades).toEqual(["centimetro"]);
    expect(tituloDeLaMedida(CLASES[0])?.unidades).toEqual(["linea"]);
  });
  it("una etiqueta y «sin clase» no dibujan medida", () => {
    expect(tituloDeLaMedida(CLASES[3])).toBeNull();
    expect(tituloDeLaMedida(null)).toBeNull();
  });
});
