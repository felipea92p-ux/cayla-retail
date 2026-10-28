import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { claveReferencia } from "./alta-producto";
import {
  buscarEnHoja,
  codigoDeMarca,
  crearMotor,
  dentroDeUnaEdicion,
  distanciaUno,
  fraseDeMotivo,
  ordenarConMotor,
  ordenarParecidas,
  rotuloDeTiempo,
  sonCategoriasVecinas,
  tramoDeCodigo,
} from "./parecidas-alta-reglas";
import { LEXICO_PARECIDAS } from "./parecidas-lexico";
import { UMBRAL_PARECIDA_PROVISIONAL, type CandidataAlta, type ConsultaAlta, type MotivoParecida } from "./parecidas-alta-tipos";
import datosReales from "./parecidas-alta-fixtures/datos-reales-8-productos.json";
import dorado from "./parecidas-alta-fixtures/golden-set-buscar-existentes.json";
import subconjunto from "./parecidas-alta-fixtures/corpus-sintetico-subconjunto.json";

// Reglas de «¿ya tenemos esta prenda?». Cómo leer los datos de las pruebas:
//   · «dato real»  = uno de los 8 productos que producción tenía el 2026-09-30 (fixtures/datos-reales-8-productos.json).
//   · «ejemplo»    = lo inventamos para ilustrar un caso (p. ej. «Polo G45» NO existe en el sistema).
//   · «sintético»  = del corpus de la investigación (fixtures/corpus-sintetico-subconjunto.json): comparar técnicas, no medir el futuro.

const AHORA = Date.parse("2026-09-30T15:00:00-05:00");
const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-");

function candidata(p: Partial<CandidataAlta> & { referencia: string }): CandidataAlta {
  return {
    id: p.id ?? `${slug(p.referencia)}|${p.marca ?? "sin"}`,
    referencia: p.referencia,
    categoriaId: p.categoriaId === undefined ? (p.categoria ? slug(p.categoria) : null) : p.categoriaId,
    categoria: p.categoria ?? null,
    marcaId: p.marcaId === undefined ? (p.marca ? slug(p.marca) : null) : p.marcaId,
    marca: p.marca ?? null,
    estado: p.estado ?? "activo",
    descripcion: p.descripcion ?? null,
    tejido: p.tejido ?? null,
    patron: p.patron ?? null,
    temporada: p.temporada ?? null,
    creadoEn: p.creadoEn === undefined ? "2026-09-29T11:00:00-05:00" : p.creadoEn,
    fotoUrl: null,
    colores: [],
    tallas: [],
    disponible: p.disponible === undefined ? null : p.disponible,
    cargadaEn: null,
  };
}

/** Lo que la pantalla arma: los ids Y los nombres de la marca y la categoría elegidas (el puntaje no los deduce de las candidatas). */
function consulta(nombre: string, marca: string | null, categoria: string | null, extra: Partial<ConsultaAlta> = {}): ConsultaAlta {
  return {
    marcaId: marca ? slug(marca) : null,
    categoriaId: categoria ? slug(categoria) : null,
    marca,
    categoria,
    nombre,
    descripcion: "",
    tejido: null,
    patron: null,
    ahora: AHORA,
    ...extra,
  };
}

/** Los 8 productos reales como candidatas (la fecha de alta es del 2026-09-29, hora de Lima). */
const REALES: CandidataAlta[] = datosReales.productos.map((p) => {
  const [dia, hora] = p.alta.split(" ");
  const stock = Object.entries(p.stock as Record<string, number>);
  return candidata({
    referencia: p.nombre,
    marca: p.marca,
    categoria: p.categoria,
    descripcion: p.descripcion,
    tejido: p.tejido,
    patron: p.patron,
    temporada: p.temporada,
    creadoEn: `2026-${dia}T${hora}:00-05:00`,
    disponible: { total: stock.reduce((a, [, n]) => a + n, 0), porSede: stock.map(([sede, disponible]) => ({ sede, disponible })) },
  });
});
const real = (nombre: string) => {
  const c = REALES.find((x) => x.referencia === nombre);
  if (!c) throw new Error(`no hay un producto real llamado ${nombre}`);
  return c;
};
const de = (r: ReturnType<typeof ordenarParecidas>, nombre: string) => {
  const x = r.lista.find((y) => y.candidata.referencia === nombre);
  if (!x) throw new Error(`«${nombre}» no está en la lista`);
  return x;
};

// ---------------------------------------------------------------------------------------------------------------------
describe("dentroDeUnaEdicion: espejo de retail.fn_dentro_de_una_edicion", () => {
  it("idénticas, una letra cambiada, de más o de menos: dentro de una edición", () => {
    expect(dentroDeUnaEdicion("polog44", "polog44")).toBe(true);
    expect(dentroDeUnaEdicion("polog44", "polog45")).toBe(true); // ejemplo: G44 / G45
    expect(dentroDeUnaEdicion("camisalara", "camisalaras")).toBe(true);
    expect(dentroDeUnaEdicion("camisalaras", "camisalara")).toBe(true);
    expect(dentroDeUnaEdicion("polo", "pelo")).toBe(true);
  });

  it("dos ediciones, una diferencia de largo de 2, o una transposición (son DOS ediciones) quedan fuera", () => {
    expect(dentroDeUnaEdicion("polog44", "polog55")).toBe(false);
    expect(dentroDeUnaEdicion("camisalara", "camisalarass")).toBe(false);
    expect(dentroDeUnaEdicion("ab", "ba")).toBe(false);
    expect(dentroDeUnaEdicion("polo", "polera")).toBe(false);
  });

  it("los bordes: cadenas vacías", () => {
    expect(dentroDeUnaEdicion("", "")).toBe(true);
    expect(dentroDeUnaEdicion("", "a")).toBe(true);
    expect(dentroDeUnaEdicion("a", "")).toBe(true);
    expect(dentroDeUnaEdicion("", "ab")).toBe(false);
    expect(dentroDeUnaEdicion("a", "b")).toBe(true);
  });

  // Las dos pruebas exhaustivas de abajo comparan cada par de cadenas de hasta 5 letras sobre 3 símbolos (364 cadenas,
  // 132 496 pares) contra la distancia de edición calculada con su tabla de siempre. Armar una tabla NUEVA por par era el
  // 97 % del tiempo de «distanciaUno == …» (distanciaUno en sí cuesta 5-10 ms): con la máquina cargada por otras sesiones
  // (carga ~100, 2026-10-02) la prueba llegaba a 1,9 s, camino del límite de 5 s que frena el pre-commit. Ahora la tabla se
  // arma una vez y cada par la reescribe: repone la fila y la columna 0, y escribe cada celda de adentro antes de leerla.
  // Por la misma razón juntan los pares que discrepan en UN `expect`, que los nombra uno por uno.
  const LARGO_MAXIMO = 5;
  const tabla = Array.from({ length: LARGO_MAXIMO + 1 }, () => new Array<number>(LARGO_MAXIMO + 1).fill(0));
  /** Distancia de edición. Con `transponer`, dos letras contiguas intercambiadas son UNA edición (Damerau-Levenshtein, en
   *  su forma de alineación óptima); sin él son dos (Levenshtein). Es la única diferencia entre las dos definiciones. */
  const distancia = (a: string, b: string, transponer: boolean) => {
    for (let j = 0; j <= b.length; j++) tabla[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      tabla[i][0] = i;
      for (let j = 1; j <= b.length; j++) {
        tabla[i][j] = Math.min(tabla[i - 1][j] + 1, tabla[i][j - 1] + 1, tabla[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (transponer && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) tabla[i][j] = Math.min(tabla[i][j], tabla[i - 2][j - 2] + 1);
      }
    }
    return tabla[a.length][b.length];
  };
  /** Todas las cadenas de 0 a LARGO_MAXIMO letras sobre `alfabeto`. */
  const todasLasCadenas = (alfabeto: string) => {
    const todas: string[] = [""];
    for (let largo = 1; largo <= LARGO_MAXIMO; largo++) for (const base of todas.filter((t) => t.length === largo - 1)) for (const l of alfabeto) todas.push(base + l);
    return todas;
  };

  it("es exactamente «distancia de Levenshtein ≤ 1»: todas las cadenas de hasta 5 letras sobre {a, b, 1}", () => {
    const todas = todasLasCadenas("ab1");
    const discrepan: string[] = [];
    for (const a of todas)
      for (const b of todas) {
        const dice = dentroDeUnaEdicion(a, b);
        const lev = distancia(a, b, false);
        if (dice !== lev <= 1) discrepan.push(`«${a}» / «${b}»: dentroDeUnaEdicion dice ${dice}, Levenshtein da ${lev}`);
      }
    expect(discrepan).toEqual([]);
  });

  it("distanciaUno == (Damerau-Levenshtein === 1): letra cambiada, de más, de menos o dos contiguas intercambiadas", () => {
    const todas = todasLasCadenas("abc");
    const discrepan: string[] = [];
    for (const a of todas)
      for (const b of todas) {
        const dice = distanciaUno(a, b);
        const damerau = distancia(a, b, true);
        if (dice !== (damerau === 1)) discrepan.push(`«${a}» / «${b}»: distanciaUno dice ${dice}, Damerau-Levenshtein da ${damerau}`);
      }
    expect(discrepan).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("rotuloDeTiempo: «hace 6 min», «hace 21 h», «hace 2 días», «hace 11 meses»", () => {
  const antes = (ms: number) => new Date(AHORA - ms).toISOString();
  const MIN = 60_000;
  const H = 60 * MIN;
  const D = 24 * H;

  it("los cuatro ejemplos del pedido", () => {
    expect(rotuloDeTiempo(antes(6 * MIN), AHORA)).toBe("hace 6 min");
    expect(rotuloDeTiempo(antes(21 * H), AHORA)).toBe("hace 21 h");
    expect(rotuloDeTiempo(antes(2 * D), AHORA)).toBe("hace 2 días");
    expect(rotuloDeTiempo(antes(335 * D), AHORA)).toBe("hace 11 meses");
  });

  it("sin fecha, o con una que no se entiende, no dice nada del tiempo", () => {
    expect(rotuloDeTiempo(null, AHORA)).toBeNull();
    expect(rotuloDeTiempo("", AHORA)).toBeNull();
    expect(rotuloDeTiempo("ayer por la tarde", AHORA)).toBeNull();
    expect(rotuloDeTiempo(antes(MIN), Number.NaN)).toBeNull();
  });

  it("los bordes entre unidades y el singular", () => {
    expect(rotuloDeTiempo(antes(30_000), AHORA)).toBe("hace un momento");
    expect(rotuloDeTiempo(antes(59 * MIN), AHORA)).toBe("hace 59 min");
    expect(rotuloDeTiempo(antes(60 * MIN), AHORA)).toBe("hace 1 h");
    expect(rotuloDeTiempo(antes(24 * H - MIN), AHORA)).toBe("hace 23 h");
    expect(rotuloDeTiempo(antes(24 * H), AHORA)).toBe("hace 1 día");
    expect(rotuloDeTiempo(antes(29 * D), AHORA)).toBe("hace 29 días");
    expect(rotuloDeTiempo(antes(30 * D), AHORA)).toBe("hace 1 mes");
    expect(rotuloDeTiempo(antes(359 * D), AHORA)).toBe("hace 11 meses");
    expect(rotuloDeTiempo(antes(360 * D), AHORA)).toBe("hace 1 año");
    expect(rotuloDeTiempo(antes(800 * D), AHORA)).toBe("hace 2 años");
  });

  it("un reloj apenas adelantado (hasta 5 min) no inventa tiempos negativos: «hace un momento»", () => {
    expect(rotuloDeTiempo(new Date(AHORA + 2 * MIN).toISOString(), AHORA)).toBe("hace un momento");
    expect(rotuloDeTiempo(new Date(AHORA + 5 * MIN).toISOString(), AHORA)).toBe("hace un momento");
  });

  it("una fecha más adelantada que eso (reloj roto o dato corrupto) no se rotula: la tarjeta no dice nada del tiempo", () => {
    expect(rotuloDeTiempo(new Date(AHORA + 5 * MIN + 1000).toISOString(), AHORA)).toBeNull();
    expect(rotuloDeTiempo(new Date(AHORA + 2 * H).toISOString(), AHORA)).toBeNull();
    expect(rotuloDeTiempo("2036-09-30T15:00:00-05:00", AHORA)).toBeNull();
    expect(rotuloDeTiempo("9999-12-31T00:00:00Z", AHORA)).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("codigoDeMarca: lee «SS25 311», «79-SS24», «G44» del texto que ya escriben", () => {
  it("los tres formatos reales (dato real: 2 descripciones y 1 nombre)", () => {
    expect(codigoDeMarca("wide leg corto - SS25 311 - C")).toBe("SS25 311");
    expect(codigoDeMarca("Wide leg - |79-SS24")).toBe("79-SS24");
    expect(codigoDeMarca("Polo G44")).toBe("G44");
  });

  it("lo escriben de muchas formas y sale igual", () => {
    for (const t of ["SS25 311", "ss25311", "SS25-311", "ss25/311", "  Ss25   311  "]) expect(codigoDeMarca(t)).toBe("SS25 311");
    for (const t of ["G44", "g 44", "G-44", "polo g44", "Polo G 44"]) expect(codigoDeMarca(t)).toBe("G44");
    expect(codigoDeMarca("79 - ss24")).toBe("79-SS24");
    expect(codigoDeMarca("FW24-102")).toBe("FW24 102");
    expect(codigoDeMarca("Ref. 4567")).toBe("4567");
  });

  it("lo que NO es un código: nombres, precios, tallas, medidas, packs, composición, años y cantidades", () => {
    for (const t of ["", "  ", "Camisa Lara", "Blusa S/ 89.90", "Talla 38", "talla M", "x12", "2 piezas", "100% algodón", "180gr", "95cm", "2025", "Polo de 2 piezas", "$25", "Polo en talla 38"]) {
      expect(codigoDeMarca(t), t).toBeNull();
    }
  });

  it("si trae varios, devuelve el primero (la temporada con su número gana sobre un número suelto)", () => {
    expect(codigoDeMarca("Wide Leg SS25 311 ref 9988")).toBe("SS25 311");
  });

  it("el prefijo «Modelo», «Código», «Item»… se quita entero (con «mod» antes que «modelo» salía «ELO311»)", () => {
    expect(codigoDeMarca("Modelo 311")).toBe("311");
    expect(codigoDeMarca("Código 311")).toBe("311");
    expect(codigoDeMarca("Codigo 311")).toBe("311");
    expect(codigoDeMarca("Polo Modelo 44")).toBe("44");
    expect(codigoDeMarca("Modelo55")).toBe("55");
    expect(codigoDeMarca("Modelo A12")).toBe("A12");
    expect(codigoDeMarca("Item 7788")).toBe("7788");
    for (const p of ["Mod 311", "Mod. 311", "Modelo: 311", "Cod 311", "Ref 311", "Art. 311", "SKU 311", "Modelo 311"]) expect(codigoDeMarca(p), p).toBe("311");
  });

  it("el mismo código con o sin espacio se lee igual, también con una letra final («SS25311A» = «SS25 311A»)", () => {
    expect(codigoDeMarca("SS25 311A")).toBe("SS25 311A");
    expect(codigoDeMarca("SS25311A")).toBe("SS25 311A");
    expect(codigoDeMarca("ss25-311a")).toBe("SS25 311A");
  });
});

describe("tramoDeCodigo: dónde está, en el texto como lo escribieron, el código que se leyó", () => {
  /** El texto sin el tramo del código: lo que la tarjeta deja como descripción. */
  const sinCodigo = (texto: string): string | null => {
    const c = codigoDeMarca(texto);
    const t = c ? tramoDeCodigo(texto, c) : null;
    return t ? texto.slice(0, t.desde) + texto.slice(t.hasta) : null;
  };

  it("lo encuentra escrito de cualquier forma: el código normalizado casi nunca es lo escrito", () => {
    const formas: [string, string][] = [
      ["wide leg corto - SS25 311 - C", "wide leg corto -  - C"],
      ["corto SS25-311 cuello", "corto  cuello"],
      ["corto ss25/311 cuello", "corto  cuello"],
      ["corto SS2025 311 cuello", "corto  cuello"],
      ["corto SS25311 cuello", "corto  cuello"],
      ["Wide leg - |79-SS24", "Wide leg - |"],
      ["cuello 79 / SS24 corto", "cuello  corto"],
      ["cuello 79/ss24 corto", "cuello  corto"],
      ["cuello G-44 corto", "cuello  corto"],
      ["cuello g 44 corto", "cuello  corto"],
      ["cuello G44 corto", "cuello  corto"],
    ];
    for (const [texto, esperado] of formas) expect(sinCodigo(texto), texto).toBe(esperado);
  });

  it("se lleva su prefijo («Ref.», «Mod.», «Modelo»…): no queda una palabra colgando", () => {
    expect(sinCodigo("Ref. 4567 cuello")).toBe(" cuello");
    expect(sinCodigo("cuello Mod. 311")).toBe("cuello ");
    expect(sinCodigo("cuello Modelo: 311 redondo")).toBe("cuello  redondo");
    expect(sinCodigo("cuello SKU 311")).toBe("cuello ");
  });

  it("no corta a la mitad de otra palabra ni de otro número", () => {
    expect(tramoDeCodigo("mega 44", "G44")).toBeNull(); // «g 44» está dentro de «mega 44»
    expect(tramoDeCodigo("tela 3110", "311")).toBeNull();
    expect(tramoDeCodigo("SS25 3115", "SS25 311")).toBeNull();
  });

  it("devuelve los índices del texto original y no toca nada; sin código o sin coincidencia, null", () => {
    expect(tramoDeCodigo("hola SS25-311 y más", "SS25 311")).toEqual({ desde: 5, hasta: 13 });
    expect(tramoDeCodigo("Camisa Lara", "SS25 311")).toBeNull();
    expect(tramoDeCodigo("", "SS25 311")).toBeNull();
    expect(tramoDeCodigo("SS25 311", "")).toBeNull();
    expect(tramoDeCodigo("SS25 311", "   ")).toBeNull();
  });

  it("todo código que codigoDeMarca lee de un texto, tramoDeCodigo lo encuentra en ese mismo texto", () => {
    const textos = ["Polo G44", "Polo G 44", "wide leg corto - SS25 311 - C", "Wide leg - |79-SS24", "Ref. 4567", "Modelo 311", "SS25311A", "SS25 311 y 79-SS24", "E-14 tejido", "Chaleco K3"];
    for (const t of textos) {
      const c = codigoDeMarca(t);
      expect(c, t).not.toBeNull();
      expect(tramoDeCodigo(t, c as string), t).not.toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("niveles con los productos reales", () => {
  it("«Camisa Lara» exacto = idéntico: frena, y la frase dice «Mismo nombre»", () => {
    const r = ordenarParecidas(consulta("Camisa Lara", "La Femme 21", "Camisas y Blusas"), REALES);
    const x = de(r, "Camisa Lara");
    expect(x.nivel).toBe("identico");
    expect(x.motivo).toBe("mismo_nombre");
    expect(x.frase).toBe("Mismo nombre");
    expect(r.hayIdentico).toBe(true);
    expect(r.lista[0]).toBe(x);
  });

  it("idéntico es la misma CLAVE: mayúsculas, tildes, espacios y signos no cuentan (dato real: «Polo G44»)", () => {
    for (const t of ["Polo G 44", "polo g44", "POLO G-44", "Polo  G.44", "Pólo G44"]) {
      const r = ordenarParecidas(consulta(t, "Krisstell", "Polos"), REALES);
      expect(de(r, "Polo G44").nivel, t).toBe("identico");
      expect(claveReferencia(t), t).toBe(claveReferencia("Polo G44"));
    }
  });

  it("idéntico lo es aunque sea de otra marca u otra categoría (la base no deja pasar el mismo nombre)", () => {
    const r = ordenarParecidas(consulta("Camisa Lara", "Wayi", "Jeans"), REALES);
    const x = de(r, "Camisa Lara");
    expect(x.nivel).toBe("identico");
    expect(r.hayIdentico).toBe(true);
  });

  it("«Polo G45» (ejemplo) contra «Polo G44» (dato real) = casi igual: una letra. Frena en la Fase 1 hasta que la persona responda", () => {
    const r = ordenarParecidas(consulta("Polo G45", "Krisstell", "Polos"), REALES);
    const x = de(r, "Polo G44");
    expect(x.nivel).toBe("casi_igual");
    expect(x.motivo).toBe("una_letra");
    expect(x.frase).toBe("Casi igual: una letra de diferencia");
    expect(r.hayCasiIgual).toBe(true);
    expect(r.hayIdentico).toBe(false);
    expect(x.puntaje).toBeGreaterThanOrEqual(UMBRAL_PARECIDA_PROVISIONAL); // el puntaje no contradice al nivel
    expect(x.codigo).toEqual({ suyo: "G45", deLaOtra: "G44", distintos: true }); // se muestra, sin veredicto
  });

  it("«Polo Evalunna» (un error de tipeo) = casi igual a «Polo Evaluna» (dato real)", () => {
    const r = ordenarParecidas(consulta("Polo Evalunna", "Krisstell", "Polos"), REALES);
    expect(de(r, "Polo Evaluna").nivel).toBe("casi_igual");
  });

  it("«Lara Camisa» contra «Camisa Lara»: el orden de las palabras no importa (parecida, no idéntica)", () => {
    const r = ordenarParecidas(consulta("Lara Camisa", "La Femme 21", "Camisas y Blusas"), REALES);
    const x = de(r, "Camisa Lara");
    expect(x.nivel).toBe("parecida");
    expect(x.puntaje).toBeGreaterThan(0.9);
    expect(x.frase).toBe("Mismo modelo: Lara");
    expect(r.hayIdentico).toBe(false);
  });

  it("«Camisa Lara Negra» (ejemplo): un color en el nombre no cambia el modelo, y sube «Camisa Lara»", () => {
    const r = ordenarParecidas(consulta("Camisa Lara Negra", "La Femme 21", "Camisas y Blusas"), REALES);
    expect(r.lista[0].candidata.referencia).toBe("Camisa Lara");
    expect(r.lista[0].nivel).toBe("parecida");
    expect(r.lista[0].puntaje).toBeGreaterThan(0.9);
    expect(r.lista[1].nivel).toBe("contexto");
  });

  it("«Blusa Lara» y «Lara» encuentran «Camisa Lara»: el tipo de prenda pesa poco, el nombre propio mucho", () => {
    for (const t of ["Blusa Lara", "Lara", "Top Lara"]) {
      const r = ordenarParecidas(consulta(t, "La Femme 21", t === "Top Lara" ? "Tops" : "Camisas y Blusas"), REALES);
      expect(de(r, "Camisa Lara").nivel, t).toBe("parecida");
    }
  });

  it("«Wide Leg Corto» sube «Wide Leg Corto Comfo» y deja «Wide Leg» debajo, sin penalizarlo por su código", () => {
    const r = ordenarParecidas(consulta("Wide Leg Corto", "Jirish", "Jeans"), REALES);
    const comfo = de(r, "Wide Leg Corto Comfo");
    const ancho = de(r, "Wide Leg");
    expect(r.lista[0]).toBe(comfo);
    expect(comfo.nivel).toBe("parecida");
    expect(comfo.frase).toBe("Mismo modelo: Wide Leg Corto");
    expect(r.lista.indexOf(ancho)).toBeGreaterThan(r.lista.indexOf(comfo));
    expect(ancho.nivel).toBe("contexto");
    // su código (79-SS24) se ve, pero no entra al puntaje ni cuenta como «otro diseño»: la consulta no trae código
    expect(ancho.codigo).toEqual({ suyo: null, deLaOtra: "79-SS24", distintos: false });
    expect(comfo.codigo).toEqual({ suyo: null, deLaOtra: "SS25 311", distintos: false });
    expect(ancho.frase).toBe("Misma marca y categoría");
  });

  it("sin tildes en la frase de «mismo modelo» no se pierden las de la persona (nombre escrito con tilde)", () => {
    const c = candidata({ referencia: "Polo Mía", marca: "Krisstell", categoria: "Polos" });
    const r = ordenarParecidas(consulta("Camiseta Mía", "Krisstell", "Polos"), [c]);
    expect(r.lista[0].frase).toBe("Mismo modelo: Mía");
  });

  it("marca sin candidatas: ámbito «marca», lista vacía, nada que avisar", () => {
    const r = ordenarParecidas(consulta("Vestido Aurora", "Marca Nueva", "Vestidos"), []);
    expect(r).toEqual({ lista: [], ambito: "marca", hayIdentico: false, hayCasiIgual: false, hayParecida: false });
  });

  it("sin marca pero con categoría (D5): ámbito «categoría», la lista sale de la categoría", () => {
    const r = ordenarParecidas(consulta("Polo Evaluna", null, "Polos"), REALES.filter((c) => c.categoria === "Polos"));
    expect(r.ambito).toBe("categoria");
    expect(de(r, "Polo Evaluna").nivel).toBe("identico");
    const otra = de(ordenarParecidas(consulta("Polo Mia", null, "Polos"), REALES.filter((c) => c.categoria === "Polos")), "Polo G44");
    expect(otra.nivel).toBe("contexto");
    expect(otra.motivo).toBe("misma_categoria");
    expect(otra.frase).toBe("Misma categoría");
  });

  it("sin marca ni categoría: ámbito «ninguno» y lista vacía, aunque haya un idéntico", () => {
    const r = ordenarParecidas(consulta("Camisa Lara", null, null), REALES);
    expect(r).toEqual({ lista: [], ambito: "ninguno", hayIdentico: false, hayCasiIgual: false, hayParecida: false });
  });

  it("una prenda que llega dos veces (por la marca y por la comprobación de nombres de la base) cuenta una sola vez", () => {
    const r = ordenarParecidas(consulta("Camisa Lara", "La Femme 21", "Camisas y Blusas"), [...REALES, real("Camisa Lara")]);
    expect(r.lista.filter((x) => x.candidata.id === real("Camisa Lara").id)).toHaveLength(1);
    expect(r.lista).toHaveLength(REALES.length);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("código de la marca: un código igual sube; uno distinto solo informa", () => {
  const comfo = real("Wide Leg Corto Comfo"); // SS25 311
  const ancho = real("Wide Leg"); // 79-SS24

  it("igual (ejemplo: «SS25 311» tecleado con otro formato): sube fuerte y produce «coincide el código»", () => {
    const sin = ordenarParecidas(consulta("Wide Leg Corto", "Jirish", "Jeans"), [comfo]).lista[0];
    for (const t of ["Wide Leg Corto SS25 311", "Wide Leg Corto ss25-311", "Wide Leg Corto SS25311"]) {
      const con = ordenarParecidas(consulta(t, "Jirish", "Jeans"), [comfo]).lista[0];
      expect(con.motivo, t).toBe("coincide_codigo");
      expect(con.frase, t).toBe("Coincide el código: SS25 311");
      expect(con.puntaje, t).toBeGreaterThan(sin.puntaje);
      expect(con.codigo, t).toEqual({ suyo: "SS25 311", deLaOtra: "SS25 311", distintos: false });
    }
  });

  it("distinto NO baja a la candidata del corte: el puntaje y el nivel son los mismos, y solo el ORDEN cede un poco", () => {
    const base = ordenarParecidas(consulta("Pantalón Wide Leg", "Jirish", "Jeans"), [ancho]).lista[0];
    const conOtro = ordenarParecidas(consulta("Pantalón Wide Leg SS25 311", "Jirish", "Jeans"), [ancho]).lista[0];
    expect(base.nivel).toBe("parecida");
    expect(conOtro.nivel).toBe("parecida");
    expect(conOtro.puntaje).toBeCloseTo(base.puntaje, 12);
    expect(conOtro.codigo).toEqual({ suyo: "SS25 311", deLaOtra: "79-SS24", distintos: true });
    expect(conOtro.frase).toBe("Mismo modelo: Wide Leg");

    // el ×0,85 del orden: a igual puntaje, la de código distinto queda DESPUÉS de la que no trae código
    const igualSinCodigo = candidata({ id: "ancho-2", referencia: "Wide Leg", marca: "Jirish", categoria: "Jeans", descripcion: "Wide leg", tejido: "Denim", patron: "Liso", creadoEn: "2026-09-29T09:00:00-05:00" });
    const r = ordenarParecidas(consulta("Pantalón Wide Leg SS25 311", "Jirish", "Jeans"), [ancho, igualSinCodigo]);
    expect(r.lista.map((x) => x.candidata.id)).toEqual(["ancho-2", ancho.id]);
    expect(r.lista[0].puntaje).toBeCloseTo(r.lista[1].puntaje, 12);
  });

  it("un código distinto entre dos nombres idénticos por texto sigue siendo «parecida» (una reedición cambia de código)", () => {
    const vieja = candidata({ referencia: "Polo Lara", marca: "Krisstell", categoria: "Polos", descripcion: "polo SS24 102" });
    const r = ordenarParecidas(consulta("Polo Lara SS25 311", "Krisstell", "Polos"), [vieja]);
    expect(r.lista[0].nivel).toBe("parecida");
    expect(r.lista[0].codigo.distintos).toBe(true);
  });

  it("el mismo número en otra temporada (SS24 311 / SS25 311) no es el mismo código", () => {
    const vieja = candidata({ referencia: "Polo Lara", marca: "Krisstell", categoria: "Polos", descripcion: "polo SS24 311" });
    const r = ordenarParecidas(consulta("Polo Lara SS25 311", "Krisstell", "Polos"), [vieja]);
    expect(r.lista[0].motivo).not.toBe("coincide_codigo");
    expect(r.lista[0].codigo.distintos).toBe(true);
  });

  it("un número suelto repetido («311») no basta: sin texto en común no cuenta como coincidencia ni sube el puntaje", () => {
    const otra = candidata({ referencia: "Short Jade", marca: "Wayi", categoria: "Shorts", descripcion: "bolsillos 311" });
    const r = ordenarParecidas(consulta("Blusa Nora 311", "Wayi", "Camisas y Blusas"), [otra]);
    expect(r.lista[0].nivel).toBe("contexto");
    expect(r.lista[0].motivo).not.toBe("coincide_codigo");
    expect(r.lista[0].puntaje).toBe(0);
  });

  it("un código con letras SÍ basta para subir (G44 es específico)", () => {
    const otra = candidata({ referencia: "Polo Evaluna", marca: "Krisstell", categoria: "Polos", descripcion: "cuello redondo G44" });
    const r = ordenarParecidas(consulta("Top Lola G44", "Krisstell", "Polos"), [otra]);
    expect(r.lista[0].motivo).toBe("coincide_codigo");
    expect(r.lista[0].frase).toBe("Coincide el código: G44");
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("el orden de las palabras no cambia de qué prenda se habla (siluetas compuestas)", () => {
  const conCorto = "Wide Leg Corto Comfo";
  const r = (t: string) => ordenarParecidas(consulta(t, "Jirish", "Jeans"), REALES);

  it("«Wide Leg Corto Comfo» escrito en otro orden, con la silueta partida o con su alias «Pierna Ancha»: la misma prenda, arriba", () => {
    for (const t of ["Comfo Wide Leg Corto", "Wide Leg Comfo Corto", "Corto Comfo Wide Leg", "Comfo Corto Wide Leg", "Corto Wide Leg Comfo", "Pierna Ancha Corto Comfo", "Comfo Pierna Ancha Corto", "Culotte Comfo"]) {
      const res = r(t);
      const x = de(res, conCorto);
      expect(x.nivel, t).toBe("parecida");
      expect(x.puntaje, t).toBeGreaterThan(0.9);
      expect(res.lista[0], t).toBe(x);
    }
  });

  it("y no se mezcla con «Wide Leg» a secas, que para Felipe es OTRA prenda (decisión 1: el diseño lo decide la persona)", () => {
    for (const t of [conCorto, "Comfo Wide Leg Corto", "Wide Leg Comfo Corto", "Corto Comfo Wide Leg", "Pierna Ancha Corto Comfo"]) expect(de(r(t), "Wide Leg").nivel, t).toBe("contexto");
    // y al revés: «Wide Leg» solo no sube a «Wide Leg Corto Comfo»
    expect(de(r("Wide Leg"), conCorto).nivel).toBe("contexto");
    expect(de(r("Wide Leg Largo"), conCorto).nivel).toBe("contexto"); // «largo» y «corto» se contradicen: no se junta nada
  });

  it("un «corto» sin la silueta no se junta con nada: «Top Corto» sigue siendo un largo, no una silueta", () => {
    const top = candidata({ id: "t", referencia: "Top Nube Corto", marca: "Krisstell", categoria: "Tops" });
    const nivel = ordenarParecidas(consulta("Corto Nube Top", "Krisstell", "Tops"), [top]).lista[0];
    expect(nivel.nivel).toBe("parecida");
    const otro = ordenarParecidas(consulta("Top Nube Largo", "Krisstell", "Tops"), [top]).lista[0];
    expect(otro.puntaje).toBeLessThan(nivel.puntaje); // largo distinto: sigue separando
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("código de la marca coincidente: cada lado como lo escribió, y la frase dice el de la otra prenda", () => {
  it("con varios códigos, `suyo` es el que coincidió (no el primero que se leyó)", () => {
    const c = candidata({ referencia: "Polo Evaluna", marca: "Krisstell", categoria: "Polos", descripcion: "G44" });
    const x = ordenarParecidas(consulta("Top Lola SS25 311 G44", "Krisstell", "Polos"), [c]).lista[0];
    expect(x.motivo).toBe("coincide_codigo");
    expect(x.frase).toBe("Coincide el código: G44");
    expect(x.codigo).toEqual({ suyo: "G44", deLaOtra: "G44", distintos: false });
  });

  it("un número suelto contra el código completo de la otra: la frase y la tarjeta muestran el de la otra («SS25 311»)", () => {
    const x = ordenarParecidas(consulta("Wide Leg Corto 311", "Jirish", "Jeans"), [real("Wide Leg Corto Comfo")]).lista[0];
    expect(x.motivo).toBe("coincide_codigo");
    expect(x.frase).toBe("Coincide el código: SS25 311");
    expect(x.codigo).toEqual({ suyo: "311", deLaOtra: "SS25 311", distintos: false });
  });

  it("sin coincidencia: el primero que se leyó de cada lado, y `distintos`", () => {
    const c = candidata({ referencia: "Polo Lara", marca: "Krisstell", categoria: "Polos", descripcion: "polo SS24 102 G9" });
    const x = ordenarParecidas(consulta("Polo Lara SS25 311", "Krisstell", "Polos"), [c]).lista[0];
    expect(x.codigo).toEqual({ suyo: "SS25 311", deLaOtra: "SS24 102", distintos: true });
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("conflictos por campo: pack, versión, largo, manga, cuello", () => {
  const una = (nombre: string, desc = "") => candidata({ referencia: nombre, marca: "Krisstell", categoria: "Polos", descripcion: desc || null });
  const nivelDe = (tecleado: string, existente: string, descTecleada = "", descExistente = "") =>
    ordenarParecidas(consulta(tecleado, "Krisstell", "Polos", { descripcion: descTecleada }), [una(existente, descExistente)]).lista[0].nivel;

  it("dos valores distintos de la misma cosa separan (×0,4): «Polo Lara II» no es «Polo Lara Plus»", () => {
    expect(nivelDe("Polo Lara II", "Polo Lara Plus")).toBe("contexto");
    expect(nivelDe("Aretes Luna x12", "Aretes Luna x6")).toBe("contexto");
  });

  it("ojo: «Polo Lara 2» y «Polo Lara 3» difieren en UNA letra, y eso lo frena la base (casi igual), no el conflicto de versión", () => {
    expect(nivelDe("Polo Lara 2", "Polo Lara 3")).toBe("casi_igual");
  });

  it("que solo UN lado diga «Petit» o «Plus» pesa menos (×0,6): sigue siendo parecida", () => {
    expect(nivelDe("Polo Lara Petit", "Polo Lara")).toBe("parecida");
    expect(nivelDe("Polo Lara", "Polo Lara Plus")).toBe("parecida");
  });

  it("dos dígitos en el nombre son una talla, no una versión: «Nika 38» y «Nika 40» siguen juntas", () => {
    expect(nivelDe("Zapatilla Nika 38", "Zapatilla Nika 40")).toBe("parecida");
  });

  it("manga distinta en las descripciones baja el puntaje", () => {
    const a = nivelDe("Camisa Lara", "Camisa Lara", "manga larga", "manga corta");
    expect(a).toBe("identico"); // el nombre manda: la clave es la misma
    const r = ordenarParecidas(consulta("Blusa Lara", "Krisstell", "Polos", { descripcion: "manga larga" }), [una("Camisa Lara", "manga corta")]);
    const igual = ordenarParecidas(consulta("Blusa Lara", "Krisstell", "Polos", { descripcion: "manga larga" }), [una("Camisa Lara", "manga larga")]);
    expect(r.lista[0].puntaje).toBeLessThan(igual.lista[0].puntaje);
  });

  it("el patrón NO veta (D10): «Polo Nara Lunares» y «Polo Nara Rayas» no se separan por eso", () => {
    const lunares = candidata({ referencia: "Polo Nara", marca: "Krisstell", categoria: "Polos", patron: "Lunares" });
    const liso = ordenarParecidas(consulta("Polo Nara", "Krisstell", "Polos", { patron: "Rayas" }), [lunares]).lista[0];
    const igual = ordenarParecidas(consulta("Polo Nara", "Krisstell", "Polos", { patron: "Lunares" }), [lunares]).lista[0];
    expect(liso.nivel).toBe("identico");
    const distinto = ordenarParecidas(consulta("Top Nara", "Krisstell", "Polos", { patron: "Rayas" }), [lunares]).lista[0];
    const mismo = ordenarParecidas(consulta("Top Nara", "Krisstell", "Polos", { patron: "Lunares" }), [lunares]).lista[0];
    expect(distinto.nivel).toBe("parecida");
    expect(distinto.puntaje).toBeGreaterThan(0.9);
    expect(mismo.puntaje).toBeGreaterThanOrEqual(distinto.puntaje);
    expect(igual.nivel).toBe("identico");
  });

  it("el tejido y el patrón suman muy poco: el mismo nombre con otro material sigue casi igual de arriba", () => {
    const denim = candidata({ referencia: "Falda Kira", marca: "Wayi", categoria: "Faldas", tejido: "Denim", patron: "Liso" });
    const con = ordenarParecidas(consulta("Top Kira", "Wayi", "Faldas", { tejido: "Denim", patron: "Liso" }), [denim]).lista[0].puntaje;
    const otro = ordenarParecidas(consulta("Top Kira", "Wayi", "Faldas", { tejido: "Lino", patron: "Floral" }), [denim]).lista[0].puntaje;
    expect(con - otro).toBeGreaterThanOrEqual(0);
    expect(con - otro).toBeLessThan(0.1);
    expect(otro).toBeGreaterThanOrEqual(UMBRAL_PARECIDA_PROVISIONAL);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("marca y categoría pesan, nunca bloquean", () => {
  it("con la marca distinta el puntaje baja ×0,4; el idéntico de otra marca sigue frenando", () => {
    const de1 = candidata({ referencia: "Camisa Lara", marca: "La Femme 21", categoria: "Camisas y Blusas" });
    const mismaMarca = ordenarParecidas(consulta("Blusa Lara", "La Femme 21", "Camisas y Blusas"), [de1]).lista[0];
    const otraMarca = ordenarParecidas(consulta("Blusa Lara", "Wayi", "Camisas y Blusas"), [de1]).lista[0];
    expect(otraMarca.puntaje).toBeCloseTo(mismaMarca.puntaje * 0.4, 12);
    expect(otraMarca.nivel).toBe("contexto");
    expect(otraMarca.motivo).toBe("otra_marca");
    expect(otraMarca.frase).toBe("De otra marca");
  });

  it("categoría distinta pesa ×0,7; categoría vecina (Pantalones ~ Jeans) ×0,9", () => {
    const base = candidata({ referencia: "Palazo Billie", marca: "Wayi", categoria: "Jeans" });
    const puntaje = (categoria: string, conNombre = true) => ordenarParecidas({ ...consulta("Billie", "Wayi", categoria), categoria: conNombre ? categoria : null }, [base]).lista[0].puntaje;
    const misma = puntaje("Jeans");
    // para saber que «Pantalones» es vecina de «Jeans» la consulta lleva el NOMBRE de su categoría (la pantalla lo tiene)
    expect(puntaje("Pantalones")).toBeCloseTo(misma * 0.9, 12);
    expect(puntaje("Polos")).toBeCloseTo(misma * 0.7, 12);
    expect(puntaje("Pantalones", false)).toBeCloseTo(misma * 0.7, 12); // sin el nombre: lo seguro, categoría distinta
    expect(sonCategoriasVecinas("Pantalones", "Jeans")).toBe(true);
    expect(sonCategoriasVecinas("Polos", "Jeans")).toBe(false);
    expect(sonCategoriasVecinas(null, "Jeans")).toBe(false);
  });

  it("los motivos de contexto dicen la verdad: misma marca y categoría / misma marca, otra categoría", () => {
    const r = ordenarParecidas(consulta("Kira Nueva", "Wayi", "Jeans"), [
      candidata({ referencia: "Culotte Sara", marca: "Wayi", categoria: "Jeans" }),
      candidata({ referencia: "Falda Mora", marca: "Wayi", categoria: "Faldas" }),
    ]);
    expect(de(r, "Culotte Sara").motivo).toBe("misma_marca_y_categoria");
    expect(de(r, "Culotte Sara").frase).toBe("Misma marca y categoría");
    expect(de(r, "Falda Mora").motivo).toBe("misma_marca_otra_categoria");
    expect(de(r, "Falda Mora").frase).toBe("Misma marca, otra categoría");
    expect(r.lista[0].candidata.referencia).toBe("Culotte Sara"); // la misma categoría va primero
  });

  it("una prenda SIN marca en la lista de una marca no es «de otra marca»: dice «Sin marca»", () => {
    const sin = candidata({ id: "sin", referencia: "Short Jade", marca: null, categoria: "Shorts" });
    const x = ordenarParecidas(consulta("Polo Nuevo", "Krisstell", "Polos"), [sin]).lista[0];
    expect(x.nivel).toBe("contexto");
    expect(x.frase).toBe("Sin marca");
    expect(x.motivo).toBe("otra_marca");
  });

  it("sin marca elegida, una de otra categoría dice «De otra categoría» con su propio motivo (no «otra marca»)", () => {
    const top = candidata({ id: "top", referencia: "Top Sol", marca: "Krisstell", categoria: "Tops" });
    const x = ordenarParecidas(consulta("Polo Nuevo", null, "Polos"), [top]).lista[0];
    expect(x.nivel).toBe("contexto");
    expect(x.motivo).toBe("otra_categoria");
    expect(x.frase).toBe("De otra categoría");
  });

  it("la marca dentro del nombre no cuenta: «Krisstell Polo Evaluna» es «Polo Evaluna»", () => {
    const r = ordenarParecidas(consulta("Krisstell Polo Evaluna Nuevo", "Krisstell", "Polos"), REALES);
    const x = de(r, "Polo Evaluna");
    expect(x.nivel).toBe("parecida");
    expect(x.puntaje).toBeGreaterThan(0.9);
  });

  it("el nombre de la marca viaja en la consulta: con él se quita de lo escrito, sin él no se quita nada", () => {
    const c = candidata({ referencia: "Polo Evaluna", marca: "Krisstell", categoria: "Polos" });
    const conNombre = consulta("Krisstell Polo Evaluna Nuevo", "Krisstell", "Polos");
    const sinNombre = { ...conNombre, marca: null };
    expect(ordenarParecidas(conNombre, [c]).lista[0].puntaje).toBeGreaterThan(ordenarParecidas(sinNombre, [c]).lista[0].puntaje);
    // un nombre sin su id no vale: sin marca elegida no hay marca que quitar
    const sinId = { ...conNombre, marcaId: null };
    expect(ordenarParecidas(sinId, [c]).lista[0].puntaje).toBe(ordenarParecidas({ ...sinId, marca: null }, [c]).lista[0].puntaje);
  });

  it("los nombres NO se deducen de las candidatas: sin ellos, una candidata de esa marca en la lista no cambia el puntaje de otra", () => {
    const jeans = candidata({ id: "j", referencia: "Palazo Billie", marca: "Wayi", categoria: "Jeans" });
    const pantalones = candidata({ id: "p", referencia: "Polo Sol", marca: "Wayi", categoria: "Pantalones" });
    const q = { ...consulta("Pantalón Palazo Billie", "Wayi", "Pantalones"), marca: undefined, categoria: undefined };
    const sola = ordenarParecidas(q, [jeans]).lista[0].puntaje;
    const conLaCategoria = ordenarParecidas(q, [jeans, pantalones]).lista.find((x) => x.candidata.id === "j")!.puntaje;
    expect(conLaCategoria).toBe(sola);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("el tiempo solo desempata y rotula: nunca filtra ni cambia el nivel", () => {
  const vieja = candidata({ id: "vieja", referencia: "Camisa Lara Crop", marca: "La Femme 21", categoria: "Camisas y Blusas", creadoEn: "2025-10-29T10:00:00-05:00" });
  const nueva = candidata({ id: "nueva", referencia: "Camisa Lara Crop", marca: "La Femme 21", categoria: "Camisas y Blusas", creadoEn: "2026-09-30T14:54:00-05:00" });
  const sinFecha = candidata({ id: "sin-fecha", referencia: "Camisa Lara Crop", marca: "La Femme 21", categoria: "Camisas y Blusas", creadoEn: null });
  const q = consulta("Blusa Lara Crop", "La Femme 21", "Camisas y Blusas");

  it("la misma prenda hace 11 meses, hace 6 minutos o sin fecha: mismo nivel, mismo puntaje, y todas aparecen", () => {
    const r = ordenarParecidas(q, [vieja, nueva, sinFecha]);
    expect(r.lista).toHaveLength(3);
    const niveles = new Set(r.lista.map((x) => x.nivel));
    const puntajes = new Set(r.lista.map((x) => x.puntaje));
    expect(niveles.size).toBe(1);
    expect(puntajes.size).toBe(1);
    expect([...niveles][0]).toBe("parecida");
    expect(rotuloDeTiempo(vieja.creadoEn, AHORA)).toBe("hace 11 meses");
    expect(rotuloDeTiempo(nueva.creadoEn, AHORA)).toBe("hace 6 min");
  });

  it("a igual fuerza: la más reciente primero; sin fecha al final", () => {
    const r = ordenarParecidas(q, [sinFecha, vieja, nueva]);
    expect(r.lista.map((x) => x.candidata.id)).toEqual(["nueva", "vieja", "sin-fecha"]);
  });

  it("a igual fuerza y fecha: con stock antes que sin stock; si también empatan, por nombre y luego por id", () => {
    const fecha = "2026-09-29T11:00:00-05:00";
    const conStock = candidata({ id: "b", referencia: "Camisa Lara Crop", marca: "La Femme 21", categoria: "Camisas y Blusas", creadoEn: fecha, disponible: { total: 3, porSede: [] } });
    const sinStock = candidata({ id: "a", referencia: "Camisa Lara Crop", marca: "La Femme 21", categoria: "Camisas y Blusas", creadoEn: fecha, disponible: { total: 0, porSede: [] } });
    const sinLeer = candidata({ id: "c", referencia: "Camisa Lara Crop", marca: "La Femme 21", categoria: "Camisas y Blusas", creadoEn: fecha, disponible: null });
    expect(ordenarParecidas(q, [sinLeer, sinStock, conStock]).lista.map((x) => x.candidata.id)).toEqual(["b", "a", "c"]);
  });

  it("una fecha del futuro (reloj roto o dato corrupto) no queda primera: cuenta como «sin fecha», y no cambia ni nivel ni puntaje", () => {
    const corrupta = candidata({ id: "corrupta", referencia: "Camisa Lara Crop", marca: "La Femme 21", categoria: "Camisas y Blusas", creadoEn: "9999-12-31T00:00:00Z" });
    const adelantada = candidata({ id: "adelantada", referencia: "Camisa Lara Crop", marca: "La Femme 21", categoria: "Camisas y Blusas", creadoEn: new Date(AHORA + 2 * 60_000).toISOString() });
    const r = ordenarParecidas(q, [corrupta, sinFecha, vieja, adelantada, nueva]);
    // un reloj apenas adelantado (2 min) sigue siendo creíble: va con las recientes; la corrupta se trata como sin fecha (al final, por id)
    expect(r.lista.map((x) => x.candidata.id)).toEqual(["adelantada", "nueva", "vieja", "corrupta", "sin-fecha"]);
    expect(new Set(r.lista.map((x) => x.nivel)).size).toBe(1);
    expect(new Set(r.lista.map((x) => x.puntaje)).size).toBe(1);
    // sin `ahora` el desempate no mira el futuro: no se inventa un reloj
    const sinAhora = ordenarParecidas({ ...q, ahora: undefined }, [corrupta, nueva]);
    expect(sinAhora.lista.map((x) => x.candidata.id)).toEqual(["corrupta", "nueva"]);
  });

  it("el tiempo NO pasa por encima de la fuerza: una parecida vieja va antes que una «contexto» recién creada", () => {
    const reciente = candidata({ id: "r", referencia: "Short Jade", marca: "La Femme 21", categoria: "Shorts", creadoEn: "2026-09-30T14:59:00-05:00" });
    const r = ordenarParecidas(q, [reciente, vieja]);
    expect(r.lista.map((x) => x.candidata.id)).toEqual(["vieja", "r"]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("descontinuada: aparece, con su nivel, pero después de las activas de su mismo nivel", () => {
  const q = consulta("Top Lara", "La Femme 21", "Camisas y Blusas");
  const activa = candidata({ id: "activa", referencia: "Camisa Lara", marca: "La Femme 21", categoria: "Camisas y Blusas" });
  const vieja = candidata({ id: "descontinuada", referencia: "Lara", marca: "La Femme 21", categoria: "Camisas y Blusas", estado: "descontinuado" });
  const debil = candidata({ id: "debil", referencia: "Short Jade", marca: "La Femme 21", categoria: "Camisas y Blusas", estado: "activo" });

  it("con nivel calculado igual (no se esconde) y al final de su nivel", () => {
    const r = ordenarParecidas(q, [vieja, debil, activa]);
    const nivel = (id: string) => r.lista.find((x) => x.candidata.id === id)?.nivel;
    expect(nivel("descontinuada")).toBe(nivel("activa"));
    expect(nivel("descontinuada")).toBe("parecida");
    const orden = r.lista.map((x) => x.candidata.id);
    expect(orden.indexOf("activa")).toBeLessThan(orden.indexOf("descontinuada"));
    // y una activa de MENOR nivel no la pasa
    expect(r.lista.find((x) => x.candidata.id === "descontinuada")?.nivel).not.toBe("contexto");
    expect(orden.indexOf("descontinuada")).toBeLessThan(orden.indexOf("debil"));
  });

  it("un idéntico descontinuado igual frena (el índice único de la base no mira el estado)", () => {
    const r = ordenarParecidas(consulta("Camisa Lara", "La Femme 21", "Camisas y Blusas"), [{ ...activa, estado: "descontinuado" }]);
    expect(r.lista[0].nivel).toBe("identico");
    expect(r.hayIdentico).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("la caja de búsqueda de la hoja (buscarEnHoja): un texto filtra, un código solo ordena", () => {
  const todas = REALES.filter((c) => c.marca === "Jirish");
  /** La lista que la hoja recibe: ya ordenada por `ordenarParecidas`, sin búsqueda. */
  const lista = (nombre = "Wide Leg Nuevo", pool: CandidataAlta[] = todas, marca = "Jirish", categoria = "Jeans") => ordenarParecidas(consulta(nombre, marca, categoria), pool).lista;
  const nombres = (busqueda: string, l = lista()) => buscarEnHoja(l, busqueda).lista.map((x) => x.candidata.referencia);

  it("vacía, solo espacios o solo signos: devuelve la lista tal cual, sin código", () => {
    for (const q of ["", "   ", "---", "¿?"]) {
      const r = buscarEnHoja(lista(), q);
      expect(r.lista.map((x) => x.candidata.id), q).toEqual(lista().map((x) => x.candidata.id));
      expect(r.codigo, q).toBeNull();
      expect(r.llevanCodigo, q).toEqual([]);
      expect(r.coincideEn, q).toEqual({});
    }
  });

  it("un TEXTO filtra: sin tildes ni mayúsculas, con Y de palabras y cada una como comienzo de palabra", () => {
    expect(nombres("WIDE LEG").sort()).toEqual(["Wide Leg", "Wide Leg Corto Comfo"]);
    expect(nombres("wide corto")).toEqual(["Wide Leg Corto Comfo"]);
    expect(nombres("corto wide")).toEqual(["Wide Leg Corto Comfo"]);
    expect(nombres("wide le")).toHaveLength(2); // lo que se va escribiendo
    expect(nombres("denim")).toHaveLength(2); // también busca en tejido, marca y categoría
    expect(nombres("jirish jeans")).toHaveLength(2);
    expect(nombres("wide camisa")).toEqual([]);
    expect(nombres("COMFÓ")).toEqual(["Wide Leg Corto Comfo"]);
  });

  it("no muta la lista que recibe", () => {
    const l = lista();
    const antes = JSON.stringify(l);
    buscarEnHoja(l, "wide");
    expect(JSON.stringify(l)).toBe(antes);
  });

  it("busca también en el color y la temporada, y dice en qué campo coincidió lo que el nombre no tiene", () => {
    const celeste = candidata({ id: "c", referencia: "Polo Luna", marca: "Krisstell", categoria: "Polos", descripcion: "cuello redondo", temporada: "Verano", tejido: "Algodon", patron: "Liso" });
    const conColor: CandidataAlta = { ...celeste, colores: [{ nombre: "Celeste", hex: "#9ad" }, { nombre: "Negro", hex: "#000" }] };
    const otra = candidata({ id: "o", referencia: "Polo Sol", marca: "Krisstell", categoria: "Polos" });
    const l = ordenarParecidas(consulta("Polo Nuevo", "Krisstell", "Polos"), [conColor, otra]).lista;
    const ids = (q: string) => buscarEnHoja(l, q).lista.map((x) => x.candidata.id);
    expect(ids("celeste")).toEqual(["c"]);
    expect(ids("verano")).toEqual(["c"]);
    expect(ids("algodon")).toEqual(["c"]);
    expect(buscarEnHoja(l, "celeste").coincideEn).toEqual({ c: { campo: "color", texto: "Celeste, Negro" } });
    expect(buscarEnHoja(l, "verano").coincideEn).toEqual({ c: { campo: "temporada", texto: "Verano" } });
    expect(buscarEnHoja(l, "redondo").coincideEn).toEqual({ c: { campo: "descripción", texto: "cuello redondo" } });
    expect(buscarEnHoja(l, "algodon").coincideEn).toEqual({ c: { campo: "tejido", texto: "Algodon" } });
    expect(buscarEnHoja(l, "liso").coincideEn).toEqual({ c: { campo: "patrón", texto: "Liso" } });
    // lo que el nombre ya tiene no lleva rótulo: «Coincide en…» es solo para lo que el nombre no dice
    expect(buscarEnHoja(l, "luna").coincideEn).toEqual({});
    // palabras repartidas entre el nombre y un campo: «polo» está en el nombre, «celeste» en el color
    expect(buscarEnHoja(l, "polo celeste").coincideEn).toEqual({ c: { campo: "color", texto: "Celeste, Negro" } });
    // repartidas entre dos campos: aparece, pero sin rótulo (no hay UN campo que decir)
    expect(ids("celeste verano")).toEqual(["c"]);
    expect(buscarEnHoja(l, "celeste verano").coincideEn).toEqual({});
  });

  it("un CÓDIGO no oculta nada: la lista sigue completa, sube la que lo lleva y se dice cuáles lo llevan", () => {
    const l = lista();
    const r = buscarEnHoja(l, "SS25 311");
    expect(r.lista).toHaveLength(l.length);
    expect(r.lista.map((x) => x.candidata.referencia)).toEqual(["Wide Leg Corto Comfo", "Wide Leg"]);
    expect(r.llevanCodigo).toEqual([real("Wide Leg Corto Comfo").id]);
    expect(r.codigo).toBe("SS25 311");
    expect(r.coincideEn).toEqual({});
  });

  it("un código que NADIE lleva (una reedición cambió de código): la lista sigue completa, no dice «si no la ves, es nueva»", () => {
    const l = lista();
    for (const q of ["SS99 999", "ss24 311", "SS24 311", "9999", "K77"]) {
      const r = buscarEnHoja(l, q);
      expect(r.lista.map((x) => x.candidata.id).sort(), q).toEqual(l.map((x) => x.candidata.id).sort());
      expect(r.llevanCodigo, q).toEqual([]);
      expect(r.codigo, q).not.toBeNull();
    }
    expect(buscarEnHoja(l, "ss99 999").codigo).toBe("SS99 999");
  });

  it("entiende el código escrito como sea, en el nombre o en la descripción", () => {
    const llevan = (q: string) => buscarEnHoja(lista(), q).llevanCodigo.map((id) => todas.find((c) => c.id === id)?.referencia);
    for (const q of ["SS25 311", "ss25311", "SS25-311", "ss25/311", "311", "ss2025 311"]) expect(llevan(q), q).toEqual(["Wide Leg Corto Comfo"]);
    for (const q of ["79-SS24", "79 ss24", "79ss24", "79 - SS24"]) expect(llevan(q), q).toEqual(["Wide Leg"]);
    // y dice el código normalizado, igual al de las tarjetas
    expect(buscarEnHoja(lista(), "ss25311").codigo).toBe("SS25 311");
    expect(buscarEnHoja(lista(), "79-ss24").codigo).toBe("79-SS24");
    expect(buscarEnHoja(lista(), "79 ss24").codigo).toBe("79 ss24"); // con espacio no se lee como código: sale como lo tecleó, y aun así encuentra «79-SS24»
    expect(buscarEnHoja(lista(), "  g44 ").codigo).toBe("G44");
  });

  it("el código en el NOMBRE también: «Polo G44»", () => {
    const l = ordenarParecidas(consulta("Polo Nuevo", "Krisstell", "Polos"), REALES.filter((c) => c.marca === "Krisstell")).lista;
    const r = buscarEnHoja(l, "g44");
    expect(r.lista).toHaveLength(l.length);
    expect(r.lista[0].candidata.referencia).toBe("Polo G44");
    expect(r.llevanCodigo).toEqual([real("Polo G44").id]);
  });

  it("lo que frena (idéntico, casi igual) va siempre primero, aunque otra lleve el código o coincida mejor con el texto", () => {
    const enLista = ordenarParecidas(consulta("Wide Leg", "Jirish", "Jeans"), todas).lista;
    expect(enLista[0].nivel).toBe("identico");
    expect(buscarEnHoja(enLista, "SS25 311").lista[0].nivel).toBe("identico"); // código de la otra
    expect(buscarEnHoja(enLista, "wide").lista[0].nivel).toBe("identico");
    expect(buscarEnHoja(enLista, "comfo").lista.map((x) => x.candidata.referencia)).toEqual(["Wide Leg Corto Comfo"]); // el texto sí filtra: «Wide Leg» no lleva «comfo»
  });

  it("con un texto, lo demás se ordena por cuánto coincide; el nombre pesa más que la descripción", () => {
    const enNombre = candidata({ id: "n", referencia: "Polo Sol", marca: "Krisstell", categoria: "Polos" });
    const enDescripcion = candidata({ id: "d", referencia: "Polo Luna", marca: "Krisstell", categoria: "Polos", descripcion: "sol de verano" });
    const l = ordenarParecidas(consulta("Polo Nuevo", "Krisstell", "Polos"), [enDescripcion, enNombre]).lista;
    expect(buscarEnHoja(l, "sol").lista.map((x) => x.candidata.id)).toEqual(["n", "d"]);
  });

  it("una búsqueda NO destraba el «Crear»: los avisos son los de ordenarParecidas, que no sabe de la búsqueda", () => {
    const r = ordenarParecidas(consulta("Wide Leg", "Jirish", "Jeans"), todas);
    expect(r.hayIdentico).toBe(true);
    // la búsqueda solo recorta la lista de la hoja; el idéntico sigue estando en `r`
    expect(buscarEnHoja(r.lista, "corto").lista.map((x) => x.candidata.referencia)).toEqual(["Wide Leg Corto Comfo"]);
    expect(buscarEnHoja(r.lista, "zzzz").lista).toEqual([]);
    expect(r.hayIdentico).toBe(true);
    expect(r.lista).toHaveLength(2);
  });

  it("lo que recibe es lo que entrega: los mismos objetos, sin inventar ni perder datos", () => {
    const l = lista();
    const r = buscarEnHoja(l, "wide");
    for (const x of r.lista) expect(l.includes(x)).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("frases: una sola cosa, en español de tienda, sin veredicto", () => {
  it("cada motivo tiene su frase exacta", () => {
    const esperadas: Record<MotivoParecida, string> = {
      mismo_nombre: "Mismo nombre",
      una_letra: "Casi igual: una letra de diferencia",
      mismo_modelo: "Mismo modelo",
      coincide_codigo: "Coincide el código",
      nombre_parecido: "Nombre parecido",
      misma_marca_y_categoria: "Misma marca y categoría",
      misma_marca_otra_categoria: "Misma marca, otra categoría",
      misma_categoria: "Misma categoría",
      otra_marca: "De otra marca",
      otra_categoria: "De otra categoría",
    };
    for (const [motivo, frase] of Object.entries(esperadas)) expect(fraseDeMotivo(motivo as MotivoParecida)).toBe(frase);
    expect(fraseDeMotivo("mismo_modelo", "Wide Leg Corto")).toBe("Mismo modelo: Wide Leg Corto");
    expect(fraseDeMotivo("coincide_codigo", "SS25 311")).toBe("Coincide el código: SS25 311");
  });

  it("«Nombre parecido»: parecida por un error de tipeo en el nombre propio, sin palabra del modelo en común", () => {
    const r = ordenarParecidas(consulta("Polo Evalunna Rojo", "Krisstell", "Polos"), REALES);
    const x = de(r, "Polo Evaluna");
    expect(x.nivel).toBe("parecida");
    expect(x.frase).toBe("Nombre parecido");
  });

  it("ninguna frase de ninguna prueba dice «es la misma» ni «son distintas»: eso lo decide la persona", () => {
    const consultas = [
      consulta("Camisa Lara", "La Femme 21", "Camisas y Blusas"),
      consulta("Polo G45", "Krisstell", "Polos"),
      consulta("Wide Leg Corto SS25 311", "Jirish", "Jeans"),
      consulta("Lara Camisa", "La Femme 21", "Camisas y Blusas"),
      consulta("Polo Mia", "Krisstell", "Polos"),
      consulta("Kira", null, "Jeans"),
    ];
    const frases = new Set<string>();
    for (const c of consultas) for (const x of ordenarParecidas(c, REALES).lista) frases.add(x.frase);
    expect(frases.size).toBeGreaterThan(5);
    for (const f of frases) expect(f, f).not.toMatch(/es la misma|son distintas|es otro|es otra|duplicad|iguales?\b(?!: una letra)/i);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("conjunto dorado: 18 casos tipeados sobre los 8 productos reales", () => {
  const casos = dorado.casos as { id: number; tipeado: string; marca: string; categoria: string; existente: string | null }[];
  const avisa = (id: number) => {
    const c = casos.find((x) => x.id === id);
    if (!c) throw new Error(`caso ${id}`);
    return ordenarParecidas(consulta(c.tipeado, c.marca, c.categoria), REALES).lista.some((x) => x.nivel !== "contexto");
  };

  it("los 12 que deben avisar, avisan", () => {
    expect(dorado.esperado_avisa_true).toHaveLength(12);
    for (const id of dorado.esperado_avisa_true) expect(avisa(id), `caso ${id}: «${casos.find((c) => c.id === id)?.tipeado}»`).toBe(true);
  });

  it("los 4 negativos no avisan", () => {
    expect(dorado.esperado_no_avisa).toHaveLength(4);
    for (const id of dorado.esperado_no_avisa) expect(avisa(id), `caso ${id}: «${casos.find((c) => c.id === id)?.tipeado}»`).toBe(false);
  });

  it("los 2 de otra marca solo informan: aparecen como contexto «De otra marca», no como alerta", () => {
    expect(dorado.solo_informa_otra_marca).toHaveLength(2);
    for (const id of dorado.solo_informa_otra_marca) {
      const c = casos.find((x) => x.id === id)!;
      const r = ordenarParecidas(consulta(c.tipeado, c.marca, c.categoria), REALES);
      expect(r.lista.some((x) => x.nivel !== "contexto"), `caso ${id}`).toBe(false);
      // aparece la prenda de OTRA marca que el caso nombra (Wide Leg Corto Comfo o Camisa Lara), y con el motivo «otra marca»
      const deOtraMarca = r.lista.filter((x) => x.motivo === "otra_marca" && (x.candidata.referencia.includes("Wide Leg Corto Comfo") || x.candidata.referencia === "Camisa Lara"));
      expect(deOtraMarca.length, `caso ${id}`).toBeGreaterThan(0);
    }
  });

  it("y cada aviso apunta a la prenda que el caso dice (no avisa «por casualidad» con otra)", () => {
    const esperadas: Record<number, string[]> = {
      1: ["Camisa Lara"], 2: ["Camisa Lara"], 3: ["Camisa Lara"], 4: ["Camisa Lara"], 6: ["Palazo Billie"], 7: ["Culotte Petit Yani"],
      8: ["Wide Leg Corto Comfo"], 9: ["Wide Leg Corto Comfo", "Wide Leg"], 11: ["Polo Evaluna"], 12: ["Polo Evaluna"], 16: ["Polo G44"], 18: ["Culotte Petit Yani"],
    };
    for (const [id, nombres] of Object.entries(esperadas)) {
      const c = casos.find((x) => x.id === Number(id))!;
      const altas = ordenarParecidas(consulta(c.tipeado, c.marca, c.categoria), REALES).lista.filter((x) => x.nivel !== "contexto");
      expect(altas.some((x) => nombres.includes(x.candidata.referencia)), `caso ${id}: «${c.tipeado}»`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("regresión con un subconjunto del corpus (SINTÉTICO, 128 registros)", () => {
  // Regla del subconjunto, fijada ANTES de mirar los puntajes: componentes enteras (grupos unidos por negativos duros) con
  // sha256("subconjunto|<grupo raíz>") mod 3 === 2. Sirve para detectar que un cambio empeora al comparador, no para prometer precisión.
  type Reg = { id: string; grupoId: string; marca: string; categoria: string; nombre: string; descripcion: string | null; tejido: string | null; patron: string | null; creadoEn: string };
  const registros = (subconjunto.registros as Reg[]).map((r, i) => ({ ...r, pos: i })).sort((a, b) => Date.parse(a.creadoEn) - Date.parse(b.creadoEn) || a.pos - b.pos);
  const aCandidata = (r: Reg) =>
    candidata({ id: r.id, referencia: r.nombre, marca: r.marca, categoria: r.categoria, descripcion: r.descripcion, tejido: r.tejido, patron: r.patron, creadoEn: r.creadoEn });
  const aConsulta = (r: Reg) => consulta(r.nombre, r.marca, r.categoria, { descripcion: r.descripcion ?? "", tejido: r.tejido, patron: r.patron, ahora: Date.parse(r.creadoEn) });

  it("el subconjunto es el que dice ser", () => {
    expect(subconjunto.rotulo).toMatch(/^SINTÉTICO/);
    expect(registros).toHaveLength(128);
    expect(new Set(registros.map((r) => r.grupoId)).size).toBe(76);
  });

  it("recall@5 ≥ 0,95 con la marca conocida (lo creado antes de esa marca es el pool)", () => {
    let consultas = 0;
    let acierta5 = 0;
    const fallos: string[] = [];
    registros.forEach((q, k) => {
      const antes = registros.slice(0, k);
      if (!antes.some((c) => c.grupoId === q.grupoId)) return;
      const r = ordenarParecidas(aConsulta(q), antes.filter((c) => c.marca === q.marca).map(aCandidata));
      const grupoDe = (id: string) => registros.find((x) => x.id === id)?.grupoId;
      const rango = r.lista.findIndex((x) => grupoDe(x.candidata.id) === q.grupoId) + 1;
      consultas++;
      if (rango >= 1 && rango <= 5) acierta5++;
      else fallos.push(`${q.nombre} → ${rango || "fuera"}`);
    });
    expect(consultas).toBeGreaterThan(40);
    expect(acierta5 / consultas, `no los encontró: ${fallos.join("; ")}`).toBeGreaterThanOrEqual(0.95);
  });

  it("PR-AUC de pares ≥ 0,90 (misma marca y categoría + negativos duros, sin lo que el índice único ya frena)", () => {
    const duros = new Set((subconjunto.negativosDuros as { a: string; b: string }[]).map((d) => [d.a, d.b].sort().join("|")));
    const items: { s: number; y: number }[] = [];
    for (let q = 0; q < registros.length; q++)
      for (let c = 0; c < q; c++) {
        const A = registros[q];
        const B = registros[c];
        const dup = A.grupoId === B.grupoId;
        const mismo = A.marca === B.marca && A.categoria === B.categoria;
        if (!dup && !mismo && !duros.has([A.id, B.id].sort().join("|"))) continue;
        if (claveReferencia(A.nombre) === claveReferencia(B.nombre)) continue; // lo que la base ya frena no es mérito del puntaje
        items.push({ s: ordenarParecidas(aConsulta(A), [aCandidata(B)]).lista[0].puntaje, y: dup ? 1 : 0 });
      }
    const ordenados = items.slice().sort((a, b) => b.s - a.s);
    const positivos = ordenados.filter((x) => x.y).length;
    let tp = 0;
    let fp = 0;
    let previo = 0;
    let ap = 0;
    for (let i = 0; i < ordenados.length; ) {
      let j = i;
      while (j < ordenados.length && ordenados[j].s === ordenados[i].s) {
        if (ordenados[j].y) tp++;
        else fp++;
        j++;
      }
      const recall = tp / positivos;
      if (ordenados[i].s > 0) ap += (recall - previo) * (tp / (tp + fp));
      previo = recall;
      i = j;
    }
    expect(positivos).toBeGreaterThan(50);
    expect(ap).toBeGreaterThanOrEqual(0.9);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("determinismo e independencia", () => {
  const q = consulta("Wide Leg Corto SS25 311", "Jirish", "Jeans", { descripcion: "corto", tejido: "Denim" });
  const pool = [...REALES, candidata({ id: "x1", referencia: "Wide Leg Corto", marca: "Jirish", categoria: "Jeans" }), candidata({ id: "x2", referencia: "Polo Mia", marca: "Krisstell", categoria: "Polos", creadoEn: null })];

  it("misma entrada, misma salida (con el caché caliente y con un motor nuevo)", () => {
    const a = JSON.stringify(ordenarParecidas(q, pool));
    const b = JSON.stringify(ordenarParecidas(q, pool));
    const c = JSON.stringify(ordenarConMotor(crearMotor(), q, pool));
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it("el orden en que llegan las candidatas no cambia el resultado", () => {
    const base = ordenarParecidas(q, pool).lista.map((x) => x.candidata.id);
    let semilla = 20260930;
    const azar = () => ((semilla = (Math.imul(semilla, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (let vuelta = 0; vuelta < 20; vuelta++) {
      const mezcla = pool.slice();
      for (let i = mezcla.length - 1; i > 0; i--) {
        const j = Math.floor(azar() * (i + 1));
        [mezcla[i], mezcla[j]] = [mezcla[j], mezcla[i]];
      }
      expect(ordenarParecidas(q, mezcla).lista.map((x) => x.candidata.id)).toEqual(base);
    }
  });

  it("el nivel, el puntaje y la frase de una candidata no dependen de las otras (peso estático, sin IDF; los nombres viajan en la consulta)", () => {
    const billie = candidata({ id: "billie", referencia: "Palazo Billie", marca: "Wayi", categoria: "Jeans" });
    const todas = [...pool, billie];
    // incluye el caso en que la lista NO trae ninguna prenda de la categoría de la consulta («Pantalones» contra una marca que solo tiene «Jeans»)
    const consultas = [q, consulta("Pantalón Palazo Billie", "Wayi", "Pantalones"), consulta("Krisstell Polo Evaluna Nuevo", "Krisstell", "Polos"), consulta("Top Lara", "La Femme 21", "Tops")];
    for (const c of consultas) {
      const enLista = new Map(ordenarParecidas(c, todas).lista.map((x) => [x.candidata.id, x]));
      for (const cand of todas) {
        const sola = ordenarParecidas(c, [cand]).lista[0];
        const x = enLista.get(cand.id)!;
        expect([x.puntaje, x.nivel, x.frase, x.motivo], `${c.nombre} contra ${cand.referencia}`).toEqual([sola.puntaje, sola.nivel, sola.frase, sola.motivo]);
      }
    }
  });

  it("no muta lo que recibe", () => {
    const antes = JSON.stringify([q, pool]);
    ordenarParecidas(q, pool);
    expect(JSON.stringify([q, pool])).toBe(antes);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("candado de dinero (ADR-0126): nada del módulo lee precio ni costo", () => {
  const PROHIBIDAS = /^(precio|costo|price|cost|precioVenta|costoUnitario|margen)/i;

  it("ninguna lectura de campos de dinero, ni siquiera por un spread, aunque la candidata los traiga", () => {
    const tocadas: string[] = [];
    const espia = (c: CandidataAlta): CandidataAlta =>
      new Proxy({ ...c, precio: 99.9, costo: 12, precioVenta: 120, costoUnitario: 8 } as CandidataAlta, {
        get(objetivo, propiedad, receptor) {
          if (typeof propiedad === "string" && PROHIBIDAS.test(propiedad)) tocadas.push(propiedad);
          return Reflect.get(objetivo, propiedad, receptor);
        },
        ownKeys(objetivo) {
          tocadas.push("ownKeys");
          return Reflect.ownKeys(objetivo);
        },
      });
    const q = consulta("Wide Leg Corto", "Jirish", "Jeans", { busqueda: "wide" });
    ordenarParecidas(q, REALES.map(espia));
    ordenarParecidas(consulta("Polo G45", "Krisstell", "Polos"), REALES.map(espia));
    expect(tocadas).toEqual([]);
  });

  it("el código fuente del comparador y su léxico no mencionan propiedades de dinero", () => {
    const leer = (nombre: string) => readFileSync(new URL(nombre, import.meta.url), "utf8");
    for (const archivo of ["./parecidas-alta-reglas.ts", "./parecidas-lexico.ts"]) {
      // Lo ÚNICO permitido: los patrones que DESCARTAN un precio escrito en el nombre («S/ 59.90»); no leen dinero de ninguna ficha.
      const fuente = leer(archivo)
        .replace(/\/\/.*$/gm, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/patronesPrecio|lex\.patrones\.precios|precios: \[|"precio_soles"|"precio_dolares"/g, "");
      expect(fuente, archivo).not.toMatch(/\.(precio|costo|price|cost|margen)\w*\b/i);
      expect(fuente, archivo).not.toMatch(/["'`](precio|costo|price|cost|margen)\w*["'`]/i);
    }
  });

  it("el léxico no trae dinero: los precios en el texto («S/ 59.90») se descartan antes de comparar", () => {
    expect(LEXICO_PARECIDAS.patrones.precios.map((p) => p.nombre)).toEqual(["precio_soles", "precio_dolares", "descuento_porcentaje"]);
    const a = ordenarParecidas(consulta("Blusa Lara S/ 59.90", "La Femme 21", "Camisas y Blusas"), REALES).lista.find((x) => x.candidata.referencia === "Camisa Lara")!;
    const b = ordenarParecidas(consulta("Blusa Lara", "La Femme 21", "Camisas y Blusas"), REALES).lista.find((x) => x.candidata.referencia === "Camisa Lara")!;
    expect(a.puntaje).toBe(b.puntaje);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("robustez: lo que la gente escribe de verdad", () => {
  it("entradas raras no rompen nada y el puntaje siempre está entre 0 y 1", () => {
    const raros = ["", " ", "  \t ", "✨Blusa  Dalia Nueva✨!!", "SHORT BERMUDA KIARA REF 2214 - TELA POPELINA - C/BOLSILLOS - TALLA UNICA - S/ 39.90", "Ñandú Ñ", "🔥🔥🔥", "a", "1", "---", "x12", "100%", "s/", "c/", "m/l", "Pant. Palazo Mía Wayi", "Polo\nG44", "Vest. Camisero Dayana M/L"];
    for (const t of raros) {
      const r = ordenarParecidas(consulta(t, "Wayi", "Jeans", { descripcion: t, busqueda: t }), REALES);
      for (const x of r.lista) {
        expect(Number.isFinite(x.puntaje), t).toBe(true);
        expect(x.puntaje, t).toBeGreaterThanOrEqual(0);
        expect(x.puntaje, t).toBeLessThanOrEqual(1);
        expect(typeof x.frase, t).toBe("string");
      }
    }
  });

  it("texto aleatorio (con semilla): nunca lanza, nunca sale NaN, y es determinista", () => {
    const palabras = ["polo", "Camisa", "LARA", "g44", "ss25", "311", "-", "/", "x12", "manga", "larga", "corto", "wide", "leg", "petit", "II", "S/", "59.90", "ñ", "á", "🔥", "de", "la", "y", "m/l", "c/"];
    let semilla = 7;
    const azar = () => ((semilla = (Math.imul(semilla, 1103515245) + 12345) >>> 0) / 4294967296);
    for (let i = 0; i < 150; i++) {
      const largo = 1 + Math.floor(azar() * 12);
      const texto = Array.from({ length: largo }, () => palabras[Math.floor(azar() * palabras.length)]).join(azar() < 0.5 ? " " : "");
      const a = ordenarParecidas(consulta(texto, "Krisstell", "Polos", { descripcion: texto, busqueda: texto.slice(0, 5) }), REALES);
      const b = ordenarParecidas(consulta(texto, "Krisstell", "Polos", { descripcion: texto, busqueda: texto.slice(0, 5) }), REALES);
      expect(JSON.stringify(a), texto).toBe(JSON.stringify(b));
      for (const x of a.lista) expect(Number.isFinite(x.puntaje), texto).toBe(true);
    }
  });

  it("un texto larguísimo no se cuelga (sin retrocesos catastróficos en las expresiones)", () => {
    const largo = "Polo Lara SS25 311 ".repeat(1500) + "x".repeat(20_000);
    const t0 = performance.now();
    ordenarParecidas(consulta(largo, "Krisstell", "Polos", { descripcion: largo }), REALES);
    expect(performance.now() - t0).toBeLessThan(5000);
  });

  it("100 candidatas responden enseguida (la pantalla lo llama en cada tecla)", () => {
    const cien = Array.from({ length: 100 }, (_, i) => candidata({ id: `c${i}`, referencia: `Modelo ${["Lara", "Billie", "Yani", "Nora", "Kira"][i % 5]} ${i}`, marca: "Wayi", categoria: "Jeans", descripcion: `SS25 ${300 + i}` }));
    const q = consulta("Wide Leg Yani", "Wayi", "Jeans");
    ordenarParecidas(q, cien); // calienta
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) ordenarParecidas({ ...q, nombre: q.nombre + " " + "abcdefghijklmnopqrst"[i] }, cien);
    const porConsulta = (performance.now() - t0) / 20;
    expect(porConsulta).toBeLessThan(250); // holgado a propósito: en una máquina normal son ~1 ms
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("léxico: tamaño y forma", () => {
  it("está normalizado (minúsculas, sin tildes) y sin entradas de confianza baja", () => {
    const palabras: string[] = [];
    for (const s of LEXICO_PARECIDAS.sinonimos) palabras.push(s.canon, ...s.alias);
    for (const s of LEXICO_PARECIDAS.siluetas) palabras.push(s.canon, ...s.alias);
    for (const lista of Object.values(LEXICO_PARECIDAS.atributos)) for (const a of lista) palabras.push(a.canon, ...a.alias);
    palabras.push(...LEXICO_PARECIDAS.ruido, ...LEXICO_PARECIDAS.conocidas);
    for (const p of palabras) expect(p, p).toBe(p.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase());
    for (const s of LEXICO_PARECIDAS.sinonimos) expect(["alta", "media"]).toContain(s.confianza);
  });

  it("todo patrón compila y ninguno casa con la cadena vacía", () => {
    for (const p of [...LEXICO_PARECIDAS.patrones.precios, ...LEXICO_PARECIDAS.patrones.orden]) {
      const re = new RegExp(p.regex, "g");
      expect(re.test(""), p.nombre).toBe(false);
    }
  });
});
