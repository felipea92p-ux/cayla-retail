import { describe, expect, it } from "vitest";
import {
  MARCA_SIN_MARCA_ID,
  LecturaParcial,
  ambitoDeLectura,
  claveDeIds,
  coloresDe,
  construirCandidatas,
  disponibleDe,
  fotoDePrenda,
  idsSinRepetir,
  leerFilasFnProductos,
  leerFilasProductos,
  leerFilasVariantesDirectas,
  leerFotos,
  leerOrigenes,
  leerPaginaDeProductos,
  leerSedes,
  nombreLegibleDeTemporada,
  tallasDe,
  totalDeProductos,
  trocear,
  type FilaVariante,
  type SedeActiva,
} from "./candidatas-alta-datos";
import { leerExistenciasProductos } from "./productos-stock";
import type { Temporada } from "./temporada-reglas";
import type { CandidataAlta } from "./parecidas-alta-tipos";

// ============================================================================
// Datos de las pruebas. Dos clases, siempre rotuladas:
//   · REAL      — las 8 prendas que hay en producción (proyecto vovjyyiafkxteijimpuy, schema retail, SOLO LECTURA, 2026-09-30):
//                 nombre, marca, categoría, temporada, tejido, patrón, colores, tallas, descripción y stock. Sus ids, sus horas
//                 exactas y los hex de la mayoría de los colores NO son reales (sintéticos).
//   · SINTÉTICO — filas inventadas con la FORMA real de `fn_productos` (29 columnas, tomadas de una fila real), con precio y
//                 costo de centinela («987.65» / «432.1»): si alguno aparece en la salida, la prueba lo delata.
// ============================================================================

const PRECIO_CENTINELA = 987.65;
const COSTO_CENTINELA = 432.1;
const CENTINELAS = [String(PRECIO_CENTINELA), String(COSTO_CENTINELA), '"precio"', '"costo"', "codigos_barras", "proveedor", "demanda", "stock_minimo"];

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** REAL (2026-09-30). `creado` y `autor` son sintéticos (la hora exacta de cada alta no importa aquí). */
const REALES = [
  { id: uuid(1), nombre: "Camisa Lara", marca: "La Femme 21", categoria: "Camisas y Blusas", temporada: "primavera", tejido: "Seersucker", patron: "Rayas", colores: ["Beige", "Celeste", "Gris antracita", "Rosado"], tallas: ["Estándar"], tru: 5, descripcion: "Manga larga, crop a rayas", creado: "2026-09-29T15:42:21.193571+00:00" },
  { id: uuid(2), nombre: "Palazo Billie", marca: "Wayi", categoria: "Jeans", temporada: null, tejido: "Denim", patron: "Liso", colores: ["Azul denim", "Celeste"], tallas: ["28", "30", "32", "34"], tru: 7, descripcion: "Palazo", creado: "2026-09-29T16:36:46.869933+00:00" },
  { id: uuid(3), nombre: "Culotte Petit Yani", marca: "Wayi", categoria: "Jeans", temporada: null, tejido: "Denim", patron: "Liso", colores: ["Azul denim", "Azul marino", "Celeste"], tallas: ["26", "30", "32"], tru: 4, descripcion: "Palazo", creado: "2026-09-29T16:42:31.190667+00:00" },
  { id: uuid(4), nombre: "Adelle Wide Leg", marca: "Pilar", categoria: "Jeans", temporada: "verano", tejido: "Denim", patron: "Liso", colores: ["Azul marino", "Celeste"], tallas: ["28", "30"], tru: 5, descripcion: "Palazo", creado: "2026-09-29T16:50:45.201895+00:00" },
  { id: uuid(5), nombre: "Wide Leg Corto Comfo", marca: "Jirish", categoria: "Jeans", temporada: "verano", tejido: "Denim", patron: "Liso", colores: ["Celeste"], tallas: ["28", "34"], tru: 2, descripcion: "wide leg corto - SS25 311 - C", creado: "2026-09-29T16:58:41.631114+00:00" },
  { id: uuid(6), nombre: "Polo G44", marca: "Krisstell", categoria: "Polos", temporada: "clasico", tejido: "Rib", patron: "Liso", colores: ["Beige", "Celeste"], tallas: ["Estándar"], tru: 4, descripcion: "Cuello escote redondo en U", creado: "2026-09-29T17:01:04.721842+00:00" },
  { id: uuid(7), nombre: "Wide Leg", marca: "Jirish", categoria: "Jeans", temporada: "verano", tejido: "Denim", patron: "Liso", colores: ["Azul denim", "Celeste"], tallas: ["32"], tru: 2, descripcion: "Wide leg - |79-SS24", creado: "2026-09-29T17:04:35.425844+00:00" },
  { id: uuid(8), nombre: "Polo Evaluna", marca: "Krisstell", categoria: "Polos", temporada: "clasico", tejido: "Rib", patron: "Liso", colores: ["Azul marino", "Beige", "Blanco", "Celeste", "Chocolate", "Marrón", "Negro", "Rosado"], tallas: ["Estándar"], tru: 8, descripcion: "Cuello redondo largo", creado: "2026-09-29T17:06:57.794751+00:00" },
] as const;

/** REAL: las dos sedes que tienen nombre en producción, más las otras dos activas. Los ids son sintéticos. */
const SEDES_RAW = [
  { id: uuid(901), nombre: "Tienda TRU", tipo: "tienda", activo: true },
  { id: uuid(902), nombre: "Tienda AQP", tipo: "tienda", activo: true },
  { id: uuid(903), nombre: "Tienda LIM", tipo: "tienda", activo: true },
  { id: uuid(904), nombre: "Taller", tipo: "taller", activo: true },
];

/** REAL: lo que devuelve `select * from retail.fn_temporadas()` en producción. */
const TEMPORADAS: Temporada[] = [
  { clave: "primavera_verano", nombre: "Primavera-Verano", orden: 10, es_clasico: false, estacion_desde: "primavera", estacion_hasta: "otono", mitad: "PV" },
  { clave: "primavera", nombre: "Primavera", orden: 20, es_clasico: false, estacion_desde: "primavera", estacion_hasta: "verano", mitad: "PV" },
  { clave: "verano", nombre: "Verano", orden: 30, es_clasico: false, estacion_desde: "verano", estacion_hasta: "otono", mitad: "PV" },
  { clave: "otono_invierno", nombre: "Otoño-Invierno", orden: 40, es_clasico: false, estacion_desde: "otono", estacion_hasta: "primavera", mitad: "OI" },
  { clave: "otono", nombre: "Otoño", orden: 50, es_clasico: false, estacion_desde: "otono", estacion_hasta: "invierno", mitad: "OI" },
  { clave: "invierno", nombre: "Invierno", orden: 60, es_clasico: false, estacion_desde: "invierno", estacion_hasta: "primavera", mitad: "OI" },
  { clave: "clasico", nombre: "Clásico · todo el año", orden: 70, es_clasico: true, estacion_desde: null, estacion_hasta: null, mitad: null },
  { clave: "clasico_verano", nombre: "Clásico · verano", orden: 80, es_clasico: true, estacion_desde: "verano", estacion_hasta: "otono", mitad: "PV" },
  { clave: "clasico_invierno", nombre: "Clásico · invierno", orden: 90, es_clasico: true, estacion_desde: "invierno", estacion_hasta: "primavera", mitad: "OI" },
];

// Hex REALES de los dos colores que aparecieron en una fila de producción; el resto va sin hex (sintético), para probar el vacío.
const HEX: Record<string, string> = { "Azul denim": "#5979A2", Celeste: "#A9CADA" };
// El código de un color es único en la base (clave primaria de `colores`); aquí sale del nombre entero para que no choquen.
const codigoDe = (nombre: string) => nombre.normalize("NFD").replace(/[^A-Za-z]/g, "").toUpperCase();

/** SINTÉTICO con forma real: UNA fila de `fn_productos` (las 29 columnas, dinero incluido). */
function filaFnProductos(p: { id: string; referencia: string; marca: string | null; categoria: string | null; estado?: string }, v: { talla: string | null; color: string | null; foto?: string | null; activo?: boolean }, total = 8) {
  return {
    total_productos: total,
    producto_id: p.id,
    referencia: p.referencia,
    codigo: "JEA-0008",
    categoria_id: p.categoria ? uuid(700 + p.categoria.length) : null,
    categoria_nombre: p.categoria,
    estado: p.estado ?? "activo",
    stock_minimo: 3,
    stock_total: 2,
    demanda_diaria: 0.4,
    lead_time_dias: 14,
    punto_reorden: 6,
    reponer_de_proveedor: false,
    variante_id: uuid(5000 + Math.floor(Math.random() * 1e6)),
    variante_codigo: "JEA-0008-AZD-32",
    sku: null,
    talla: v.talla,
    color_codigo: v.color ? codigoDe(v.color) : null,
    color_nombre: v.color,
    color_hex: v.color ? (HEX[v.color] ?? null) : null,
    foto_url: v.foto ?? null,
    precio: PRECIO_CENTINELA,
    costo: COSTO_CENTINELA,
    activo: v.activo ?? true,
    codigos_barras: ["JEA-0008-AZD-32"],
    marca_id: p.marca ? uuid(800 + p.marca.length) : null,
    marca_nombre: p.marca,
    proveedor_id: uuid(850),
    proveedor_nombre: "Textil Anqori SAC",
  };
}

const filasDeReales = () =>
  REALES.flatMap((r) =>
    r.tallas.flatMap((talla) => r.colores.map((color) => filaFnProductos({ id: r.id, referencia: r.nombre, marca: r.marca, categoria: r.categoria }, { talla, color }))),
  );

/** SINTÉTICO con la forma del `select` a `productos`. */
type DatosFicha = { id: string; nombre: string; descripcion: string; temporada: string | null; creado: string; categoria: string; marca: string; tejido: string; patron: string };
const filaProducto = (r: DatosFicha, extra: Record<string, unknown> = {}) => ({
  id: r.id,
  referencia: r.nombre,
  descripcion: r.descripcion,
  temporada: r.temporada,
  created_at: r.creado,
  estado: "activo",
  estado_alta: "aprobado",
  propuesto_por: uuid(300),
  categoria_id: uuid(700 + r.categoria.length),
  marca_id: uuid(800 + r.marca.length),
  categoria: { nombre: r.categoria },
  marca: { nombre: r.marca },
  tejido: { nombre: r.tejido },
  patron: { nombre: r.patron },
  ...extra,
});

const existenciasRaw = (r: { id: string; tru: number }) => ({
  producto_id: r.id,
  aqui: 0,
  apartado_aqui: 0,
  danado_aqui: 0,
  en_camino_aqui: 0,
  en_otras_tiendas: r.tru,
  en_taller: 0,
  otras: [{ ubicacion_id: uuid(901), sede: "Tienda TRU", disponible: r.tru }],
  en_tallas_retiradas: 0,
});

const sedes: SedeActiva[] = leerSedes(SEDES_RAW);

/** REAL (2026-09-30): `fn_producto_origen` devuelve «Tienda TRU» para las 8 prendas (los ids de las prendas son sintéticos). */
const ORIGEN_REAL = leerOrigenes(REALES.map((r) => ({ producto_id: r.id, ubicacion_id: uuid(901), ubicacion_nombre: "Tienda TRU" })));
const porNombre = (cs: CandidataAlta[], nombre: string) => cs.find((c) => c.referencia === nombre)!;

function armarReales(cambios: Partial<Parameters<typeof construirCandidatas>[0]> = {}) {
  return construirCandidatas({
    variantes: leerFilasFnProductos(filasDeReales()),
    productos: leerFilasProductos(REALES.map((r) => filaProducto(r))),
    existencias: leerExistenciasProductos(REALES.map(existenciasRaw)),
    sedes,
    temporadas: TEMPORADAS,
    origen: ORIGEN_REAL,
    ...cambios,
  });
}

// ============================================================================

describe("construirCandidatas — las 8 prendas reales (REAL, producción 2026-09-30)", () => {
  const candidatas = armarReales();

  it("una candidata por prenda, en el orden en que llegaron", () => {
    expect(candidatas.map((c) => c.referencia)).toEqual(REALES.map((r) => r.nombre));
  });

  it("agrupa las variantes: los colores y las tallas de cada prenda son los reales", () => {
    for (const r of REALES) {
      const c = porNombre(candidatas, r.nombre);
      expect(c.colores.map((x) => x.nombre)).toEqual([...r.colores].sort((a, b) => a.localeCompare(b, "es")));
      expect(c.tallas).toEqual([...r.tallas]);
    }
  });

  it("lleva marca, categoría, tejido, patrón, descripción y el nombre legible de la temporada", () => {
    const wide = porNombre(candidatas, "Wide Leg Corto Comfo");
    expect(wide).toMatchObject({
      marca: "Jirish",
      categoria: "Jeans",
      tejido: "Denim",
      patron: "Liso",
      descripcion: "wide leg corto - SS25 311 - C",
      temporada: "Verano",
      estado: "activo",
      creadoEn: "2026-09-29T16:58:41.631+00:00", // la base da microsegundos; se entrega al milisegundo
    });
    expect(porNombre(candidatas, "Polo G44").temporada).toBe("Clásico · todo el año");
    expect(porNombre(candidatas, "Palazo Billie").temporada).toBeNull(); // sin temporada propia
  });

  it("deja la descripción tal cual la escribió la persona: el código de la marca se lee de ahí", () => {
    expect(porNombre(candidatas, "Wide Leg").descripcion).toBe("Wide leg - |79-SS24");
  });

  it("las tallas reales salen en el orden de la curva (28 30 32 34; 26 30 32)", () => {
    expect(porNombre(candidatas, "Palazo Billie").tallas).toEqual(["28", "30", "32", "34"]);
    expect(porNombre(candidatas, "Culotte Petit Yani").tallas).toEqual(["26", "30", "32"]);
  });

  it("el stock por sede lista TODAS las sedes activas, con ceros, y el Taller al final", () => {
    const d = porNombre(candidatas, "Palazo Billie").disponible!;
    expect(d.porSede).toEqual([
      { sede: "Tienda AQP", disponible: 0 },
      { sede: "Tienda LIM", disponible: 0 },
      { sede: "Tienda TRU", disponible: 7 },
      { sede: "Taller", disponible: 0 },
    ]);
    expect(d.total).toBe(7);
  });

  it("sin foto: fotoUrl es null («Sin foto todavía»), nunca una inventada", () => {
    expect(candidatas.every((c) => c.fotoUrl === null)).toBe(true);
  });

  it("cargadaEn sale de la sede desde la que se operó el alta (fn_producto_origen)", () => {
    expect(candidatas.every((c) => c.cargadaEn === "Tienda TRU")).toBe(true);
  });
});

describe("construirCandidatas — el contrato y el candado de dinero (ADR-0126)", () => {
  const CLAVES_DEL_CONTRATO = [
    "categoria", "categoriaId", "cargadaEn", "colores", "creadoEn", "descripcion", "disponible", "estado", "fotoUrl", "id",
    "marca", "marcaId", "patron", "referencia", "tallas", "tejido", "temporada",
  ].sort();

  it("ninguna candidata tiene más claves que las del contrato (nada de precio, costo ni proveedor)", () => {
    for (const c of armarReales()) expect(Object.keys(c).sort()).toEqual(CLAVES_DEL_CONTRATO);
  });

  it("precio y costo de las filas de fn_productos no aparecen en NINGÚN lugar de la salida", () => {
    // La entrada trae las 29 columnas, con el precio y el costo de centinela en cada fila.
    const crudas = filasDeReales();
    expect(JSON.stringify(crudas)).toContain(String(PRECIO_CENTINELA));
    const salida = JSON.stringify(armarReales());
    for (const c of CENTINELAS) expect(salida).not.toContain(c);
    // Y ni siquiera después del primer paso: las filas limpias ya no los llevan.
    const limpias = JSON.stringify(leerFilasFnProductos(crudas));
    for (const c of CENTINELAS) expect(limpias).not.toContain(c);
  });

  it("lo que tampoco es del contrato (demanda, stock mínimo, códigos de barras, proveedor) se queda afuera", () => {
    const fila = leerFilasFnProductos([filaFnProductos({ id: uuid(1), referencia: "X", marca: "M", categoria: "C" }, { talla: "S", color: "Negro" })])[0];
    expect(Object.keys(fila).sort()).toEqual(
      ["activo", "categoria", "categoriaId", "colorCodigo", "colorHex", "colorNombre", "estado", "fotoUrl", "marca", "marcaId", "productoId", "referencia", "talla"].sort(),
    );
  });
});

describe("colores y tallas", () => {
  const fila = (talla: string | null, color: string | null, extra: Partial<FilaVariante> = {}): FilaVariante => ({
    productoId: uuid(1),
    referencia: "X",
    categoriaId: null,
    categoria: null,
    marcaId: null,
    marca: null,
    estado: "activo",
    talla,
    colorCodigo: color ? codigoDe(color) : null,
    colorNombre: color,
    colorHex: color ? (HEX[color] ?? null) : null,
    fotoUrl: null,
    activo: true,
    ...extra,
  });

  it("los colores no se repiten aunque haya una variante por talla, y van por orden alfabético", () => {
    const filas = [fila("S", "Negro"), fila("M", "Negro"), fila("S", "Celeste"), fila("M", "Celeste"), fila("L", "Azul denim")];
    expect(coloresDe(filas)).toEqual([
      { nombre: "Azul denim", hex: "#5979A2" },
      { nombre: "Celeste", hex: "#A9CADA" },
      { nombre: "Negro", hex: "" },
    ]);
  });

  it("un color sin hex sale con hex vacío (la pantalla pinta el tono neutro), y una variante sin color no inventa uno", () => {
    expect(coloresDe([fila("S", "Negro"), fila("M", null)])).toEqual([{ nombre: "Negro", hex: "" }]);
  });

  it("dos colores con el mismo nombre pero código distinto son dos colores; el mismo código es uno", () => {
    const a = fila("S", "Verde", { colorCodigo: "VRD" });
    const b = fila("M", "Verde oliva", { colorCodigo: "VRO" });
    expect(coloresDe([a, b, { ...a, talla: "L" }]).map((c) => c.nombre)).toEqual(["Verde", "Verde oliva"]);
  });

  it("las tallas siguen la curva de compararTallas: letras, numeración y «Única» al final", () => {
    const filas = ["L", "XS", "M", "XL", "S", "XXL"].map((t) => fila(t, "Negro"));
    expect(tallasDe(filas)).toEqual(["XS", "S", "M", "L", "XL", "XXL"]);
    expect(tallasDe(["40", "36", "38"].map((t) => fila(t, "Negro")))).toEqual(["36", "38", "40"]);
    expect(tallasDe(["Estándar", "M", "S"].map((t) => fila(t, "Negro")))).toEqual(["S", "M", "Estándar"]);
  });

  it("las tallas no se repiten", () => {
    expect(tallasDe([fila("M", "Negro"), fila("M", "Celeste"), fila("M", "Rosado")])).toEqual(["M"]);
  });

  it("una variante inactiva (talla retirada) no cuenta; si NINGUNA está activa, cuentan todas para no dejar la tarjeta vacía", () => {
    const uno = (activo: boolean) => armarCon([fila("S", "Negro", { activo: true }), fila("XL", "Rosado", { activo })]);
    expect(uno(false).tallas).toEqual(["S"]);
    expect(uno(false).colores.map((c) => c.nombre)).toEqual(["Negro"]);
    const todasInactivas = armarCon([fila("S", "Negro", { activo: false }), fila("M", "Rosado", { activo: false })]);
    expect(todasInactivas.tallas).toEqual(["S", "M"]);
  });

  function armarCon(filas: FilaVariante[]) {
    return construirCandidatas({ variantes: filas, productos: null, existencias: null })[0];
  }
});

describe("la foto", () => {
  it("usa la foto de una variante cuando la base la trajo", () => {
    const c = construirCandidatas({
      variantes: leerFilasFnProductos([
        filaFnProductos({ id: uuid(1), referencia: "Camisa Lara", marca: "La Femme 21", categoria: "Camisas y Blusas" }, { talla: "Estándar", color: "Beige", foto: null }),
        filaFnProductos({ id: uuid(1), referencia: "Camisa Lara", marca: "La Femme 21", categoria: "Camisas y Blusas" }, { talla: "Estándar", color: "Celeste", foto: "https://fotos.example/celeste.jpg" }),
      ]),
      productos: null,
      existencias: null,
    })[0];
    expect(c.fotoUrl).toBe("https://fotos.example/celeste.jpg");
  });

  it("foto general de respaldo: si a los colores les falta la suya y la prenda tiene una general, sale esa", () => {
    const fotos = leerFotos([{ producto_id: uuid(1), url: "https://fotos.example/general.jpg", orden: 0, es_principal: true, color_codigo: null }]);
    const c = armarReales({ fotos })[0];
    expect(c.referencia).toBe("Camisa Lara");
    expect(c.fotoUrl).toBe("https://fotos.example/general.jpg");
    // Las demás prendas no tienen fotos: siguen en null.
    expect(armarReales({ fotos }).slice(1).every((x) => x.fotoUrl === null)).toBe(true);
  });

  it("la principal gana; a igual, la general; a igual, la de menor orden", () => {
    const f = (url: string, orden: number, es_principal: boolean, color_codigo: string | null) => ({ url, orden, es_principal, color_codigo });
    expect(fotoDePrenda([f("a", 0, false, null), f("b", 1, true, "CEL")], [])).toBe("b");
    expect(fotoDePrenda([f("a", 3, false, "CEL"), f("b", 5, false, null)], [])).toBe("b");
    expect(fotoDePrenda([f("a", 3, false, null), f("b", 1, false, null)], [])).toBe("b");
  });

  it("sin filas de fotos y sin foto en las variantes: null", () => {
    expect(fotoDePrenda([], [null, null])).toBeNull();
    expect(fotoDePrenda([], [null, "https://fotos.example/x.jpg"])).toBe("https://fotos.example/x.jpg");
  });

  it("leerFotos junta por prenda y se salta lo roto", () => {
    const m = leerFotos([
      { producto_id: uuid(1), url: "a", orden: 0, es_principal: true, color_codigo: null },
      { producto_id: uuid(1), url: "b", orden: 1, es_principal: false, color_codigo: "CEL" },
      { producto_id: uuid(2), url: "", orden: 0, es_principal: false, color_codigo: null },
      null,
      { url: "sin producto" },
    ]);
    expect(m.get(uuid(1))).toHaveLength(2);
    expect(m.has(uuid(2))).toBe(false);
  });
});

describe("disponible — el stock en cantidades, sin inventar ceros", () => {
  it("si la lectura del stock falló (existencias null), disponible es null: la tarjeta lo dice", () => {
    expect(armarReales({ existencias: null }).every((c) => c.disponible === null)).toBe(true);
  });

  it("una prenda sin fila en un stock que SÍ se leyó nunca tuvo unidades: cero de verdad, en todas las sedes", () => {
    const d = armarReales({ existencias: new Map() })[0].disponible!;
    expect(d.total).toBe(0);
    expect(d.porSede.map((s) => s.disponible)).toEqual([0, 0, 0, 0]);
  });

  it("varias sedes y el Taller: el total es la suma de las TIENDAS; el Taller va aparte", () => {
    const e = leerExistenciasProductos([
      {
        producto_id: uuid(1),
        aqui: 0,
        apartado_aqui: 0,
        danado_aqui: 0,
        en_camino_aqui: 0,
        en_otras_tiendas: 9,
        en_taller: 40,
        otras: [
          { ubicacion_id: uuid(901), sede: "Tienda TRU", disponible: 7 },
          { ubicacion_id: uuid(903), sede: "Tienda LIM", disponible: 2 },
        ],
        en_tallas_retiradas: 0,
      },
    ]).get(uuid(1));
    // El total es lo vendible en TIENDAS (2 + 7): el Taller (40) se lista aparte y no se suma (ADR-0270, decisión 4).
    expect(disponibleDe(e, sedes)).toEqual({
      total: 9,
      porSede: [
        { sede: "Tienda AQP", disponible: 0 },
        { sede: "Tienda LIM", disponible: 2 },
        { sede: "Tienda TRU", disponible: 7 },
        { sede: "Taller", disponible: 40 },
      ],
    });
  });

  it("si la lista de sedes no se pudo leer, se listan solo las sedes con algo (y el total cuadra igual)", () => {
    const e = leerExistenciasProductos([existenciasRaw(REALES[1])]).get(REALES[1].id);
    expect(disponibleDe(e, null)).toEqual({ total: 7, porSede: [{ sede: "Tienda TRU", disponible: 7 }] });
  });

  it("una sede que la función trajo y la lista no conoce se lista igual (el total no se pierde)", () => {
    const e = leerExistenciasProductos([
      { producto_id: uuid(1), aqui: 0, apartado_aqui: 0, danado_aqui: 0, en_camino_aqui: 0, en_otras_tiendas: 3, en_taller: 0, otras: [{ ubicacion_id: uuid(999), sede: "Tienda CUS", disponible: 3 }], en_tallas_retiradas: 0 },
    ]).get(uuid(1));
    const d = disponibleDe(e, sedes);
    expect(d.total).toBe(3);
    expect(d.porSede).toContainEqual({ sede: "Tienda CUS", disponible: 3 });
  });
});

describe("estado y exclusiones", () => {
  const una = (extra: Record<string, unknown>) =>
    construirCandidatas({
      variantes: leerFilasFnProductos([filaFnProductos({ id: REALES[0].id, referencia: REALES[0].nombre, marca: "La Femme 21", categoria: "Camisas y Blusas" }, { talla: "S", color: "Beige" })]),
      productos: leerFilasProductos([filaProducto(REALES[0], extra)]),
      existencias: null,
    });

  it("descontinuada sigue en la lista, con su estado", () => {
    expect(una({ estado: "descontinuado" })[0].estado).toBe("descontinuado");
  });

  it("pendiente ENTRA; rechazada NO (la base tampoco la cuenta: el índice único la ignora)", () => {
    expect(una({ estado_alta: "pendiente" })).toHaveLength(1);
    expect(una({ estado_alta: "rechazado" })).toHaveLength(0);
  });

  it("un estado desconocido se trata como activo (no inventa «descontinuada»)", () => {
    expect(una({ estado: "raro" })[0].estado).toBe("activo");
  });

  it("si la lectura de fichas falló (null) la lista sale igual, con lo que trajo fn_productos: degrada, no pierde", () => {
    const c = armarReales({ productos: null });
    expect(c).toHaveLength(8);
    // La sede donde se cargó no sale de la ficha (sale de fn_producto_origen): sin fichas, sigue sabiéndose.
    expect(c[4]).toMatchObject({ referencia: "Wide Leg Corto Comfo", marca: "Jirish", categoria: "Jeans", descripcion: null, tejido: null, temporada: null, creadoEn: null, cargadaEn: "Tienda TRU" });
  });

  it("si la lectura de fichas salió bien y una prenda no está, no se ofrece (es una rechazada o no se ve)", () => {
    const c = armarReales({ productos: leerFilasProductos(REALES.slice(0, 7).map((r) => filaProducto(r))) });
    expect(c.map((x) => x.referencia)).not.toContain("Polo Evaluna");
    expect(c).toHaveLength(7);
  });

  it("una prenda sin nombre no se puede comparar: se salta", () => {
    const filas = leerFilasFnProductos([filaFnProductos({ id: uuid(1), referencia: "", marca: null, categoria: null }, { talla: "S", color: "Negro" })]);
    expect(construirCandidatas({ variantes: filas, productos: null, existencias: null })).toEqual([]);
  });
});

describe("prendas de OTRA marca (idsExtra): entran por la consulta directa, con su propia marca y categoría", () => {
  it("una prenda que fn_productos no trajo aparece con lo que dicen sus fichas y sus variantes directas", () => {
    const variantes = [
      ...leerFilasFnProductos(filasDeReales().slice(0, 4)), // Camisa Lara (La Femme 21)
      ...leerFilasVariantesDirectas([
        { producto_id: uuid(7), color_codigo: "AZD", activo: true, talla: { valor: "32" }, color: { nombre: "Azul denim", hex: "#5979A2" } },
        { producto_id: uuid(7), color_codigo: "CEL", activo: true, talla: { valor: "32" }, color: { nombre: "Celeste", hex: "#A9CADA" } },
      ]),
    ];
    const productos = leerFilasProductos([filaProducto(REALES[0]), filaProducto(REALES[6])]);
    const c = construirCandidatas({ variantes, productos, existencias: null, fotos: leerFotos([{ producto_id: uuid(7), url: "https://fotos.example/wide.jpg", orden: 0, es_principal: true, color_codigo: null }]) });
    expect(c.map((x) => x.referencia)).toEqual(["Camisa Lara", "Wide Leg"]);
    const wide = c[1];
    expect(wide).toMatchObject({ marca: "Jirish", categoria: "Jeans", tallas: ["32"], fotoUrl: "https://fotos.example/wide.jpg" });
    expect(wide.colores.map((x) => x.nombre)).toEqual(["Azul denim", "Celeste"]);
  });

  it("una prenda sin variantes (no se pudieron leer) aparece igual, con colores y tallas vacíos", () => {
    const c = construirCandidatas({ variantes: [], productos: leerFilasProductos([filaProducto(REALES[6])]), existencias: null });
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ referencia: "Wide Leg", colores: [], tallas: [] });
  });

  it("las variantes directas salen sin foto ni dinero (la tabla no les da costo y aquí no se pide el precio)", () => {
    const f = leerFilasVariantesDirectas([{ producto_id: uuid(7), color_codigo: "AZD", activo: true, talla: { valor: "32" }, color: { nombre: "Azul denim", hex: "#5979A2" }, precio: PRECIO_CENTINELA, costo: COSTO_CENTINELA }]);
    expect(JSON.stringify(f)).not.toContain(String(PRECIO_CENTINELA));
    expect(f[0].fotoUrl).toBeNull();
  });
});

describe("temporada", () => {
  it("clave → nombre legible de la lista real de producción", () => {
    expect(nombreLegibleDeTemporada("primavera_verano", TEMPORADAS)).toBe("Primavera-Verano");
    expect(nombreLegibleDeTemporada("otono", TEMPORADAS)).toBe("Otoño");
  });

  it("sin temporada propia: null", () => {
    expect(nombreLegibleDeTemporada(null, TEMPORADAS)).toBeNull();
  });

  it("si la lista no se pudo leer, o no conoce la clave, se muestra legible igual (no la clave cruda)", () => {
    expect(nombreLegibleDeTemporada("otono_invierno", null)).toBe("Otono invierno");
    expect(nombreLegibleDeTemporada("verano", [])).toBe("Verano");
  });
});

describe("cargadaEn — la sede desde la que se operó el alta (fn_producto_origen, ADR-0292)", () => {
  it("sale de la base aunque NADIE pueda leer `colaboradores`: un Integrante la ve igual (era el caso que fallaba)", () => {
    // Antes salía de `colaboradores` (0 filas para un Integrante) y la tarjeta nunca decía dónde se cargó.
    const c = construirCandidatas({
      variantes: leerFilasFnProductos(filasDeReales()),
      productos: leerFilasProductos(REALES.map((r) => filaProducto(r))),
      existencias: null,
      origen: leerOrigenes([{ producto_id: uuid(7), ubicacion_id: uuid(901), ubicacion_nombre: "Tienda TRU" }]),
    });
    expect(porNombre(c, "Wide Leg").cargadaEn).toBe("Tienda TRU");
  });

  it("null cuando la función no se pudo leer, o no dice nada de esa prenda (las anteriores a la migración no tienen fila)", () => {
    expect(armarReales({ origen: null }).every((c) => c.cargadaEn === null)).toBe(true);
    expect(armarReales({ origen: undefined }).every((c) => c.cargadaEn === null)).toBe(true);
    expect(armarReales({ origen: new Map() }).every((c) => c.cargadaEn === null)).toBe(true);
    const c = armarReales({ origen: leerOrigenes([{ producto_id: uuid(7), ubicacion_id: uuid(902), ubicacion_nombre: "Tienda AQP" }]) });
    expect(porNombre(c, "Wide Leg").cargadaEn).toBe("Tienda AQP");
    expect(porNombre(c, "Polo G44").cargadaEn).toBeNull();
  });

  it("NO se infiere de dónde trabaja hoy quien la propuso: aunque la ficha traiga `propuesto_por`, sin origen es null", () => {
    const productos = leerFilasProductos(REALES.map((r) => filaProducto(r, { propuesto_por: uuid(300) })));
    const c = armarReales({ productos, origen: null });
    expect(c.every((x) => x.cargadaEn === null)).toBe(true);
    expect(JSON.stringify(productos)).not.toContain(uuid(300)); // tampoco se guarda quién la propuso
  });

  it("leerOrigenes toma el nombre de la sede, y salta la fila sin sede («se registró, pero no sé dónde») y la rota", () => {
    const m = leerOrigenes([
      { producto_id: uuid(1).toUpperCase(), ubicacion_id: uuid(901), ubicacion_nombre: "Tienda TRU" },
      { producto_id: uuid(2), ubicacion_id: null, ubicacion_nombre: null },
      { producto_id: uuid(3), ubicacion_id: uuid(902), ubicacion_nombre: "  " },
      null,
      { ubicacion_nombre: "Tienda LIM" },
    ]);
    expect([...m.entries()]).toEqual([[uuid(1), "Tienda TRU"]]);
    expect(leerOrigenes(null).size).toBe(0);
    expect(leerOrigenes({}).size).toBe(0);
  });
});

describe("lectores tolerantes: una fila rara se salta, nunca tumba la lista", () => {
  it("lo que no es una lista da vacío", () => {
    for (const malo of [null, undefined, "x", 42, {}]) {
      expect(leerFilasFnProductos(malo)).toEqual([]);
      expect(leerFilasProductos(malo)).toEqual([]);
      expect(leerFilasVariantesDirectas(malo)).toEqual([]);
      expect(leerSedes(malo)).toEqual([]);
      expect(totalDeProductos(malo)).toBe(0);
    }
  });

  it("se salta filas sin id y sigue con las demás", () => {
    const filas = leerFilasFnProductos([null, 3, { referencia: "sin id" }, filaFnProductos({ id: uuid(1), referencia: "Ok", marca: null, categoria: null }, { talla: "S", color: null })]);
    expect(filas).toHaveLength(1);
    expect(filas[0].productoId).toBe(uuid(1));
  });

  it("la fecha llega al milisegundo y con «T» (el Safari viejo no traga microsegundos ni el espacio); Date.parse la entiende", () => {
    const fecha = (created_at: unknown) => leerFilasProductos([filaProducto(REALES[0], { created_at })])[0].creadoEn;
    expect(fecha("2026-09-29T16:58:41.631114+00:00")).toBe("2026-09-29T16:58:41.631+00:00");
    expect(fecha("2026-09-29 16:58:41.631114+00:00")).toBe("2026-09-29T16:58:41.631+00:00");
    expect(fecha("2026-09-29T16:58:41+00:00")).toBe("2026-09-29T16:58:41+00:00");
    expect(fecha("2026-09-29T16:58:41.5+00:00")).toBe("2026-09-29T16:58:41.5+00:00");
    for (const f of ["2026-09-29T16:58:41.631114+00:00", "2026-09-29 16:58:41+00:00"]) expect(Number.isNaN(Date.parse(fecha(f)!))).toBe(false);
    // Lo que no parece fecha con hora sigue siendo null.
    expect(fecha("2026-09-29")).toBeNull();
    expect(fecha(20260929)).toBeNull();
  });

  it("la descripción en blanco es null; la fecha inválida es null", () => {
    const f = leerFilasProductos([filaProducto(REALES[0], { descripcion: "   ", created_at: "no es fecha" })])[0];
    expect(f.descripcion).toBeNull();
    expect(f.creadoEn).toBeNull();
  });

  it("marca y categoría embebidas pueden llegar como objeto o como lista de uno", () => {
    const a = leerFilasProductos([filaProducto(REALES[0], { marca: [{ nombre: "Wayi" }] })])[0];
    expect(a.marca).toBe("Wayi");
  });

  it("un producto sin marca (ADR-0283) sale con marca y marcaId null", () => {
    const c = construirCandidatas({
      variantes: leerFilasFnProductos([filaFnProductos({ id: uuid(1), referencia: "Prenda", marca: null, categoria: "Jeans" }, { talla: "S", color: "Negro" })]),
      productos: leerFilasProductos([filaProducto(REALES[1], { id: uuid(1), referencia: "Prenda", marca_id: null, marca: null })]),
      existencias: null,
    })[0];
    expect(c.marcaId).toBeNull();
    expect(c.marca).toBeNull();
  });

  it("totalDeProductos lee el total de la primera fila", () => {
    expect(totalDeProductos(filasDeReales())).toBe(8);
  });
});

describe("leerPaginaDeProductos — una página que PostgREST cortó en silencio no pasa por completa", () => {
  const filas = (prendas: number, variantesCada: number, total: number, desde = 0) =>
    Array.from({ length: prendas }, (_, i) =>
      Array.from({ length: variantesCada }, (_, j) =>
        filaFnProductos({ id: uuid(3000 + desde + i), referencia: `P${desde + i}`, marca: "M", categoria: "C" }, { talla: String(26 + 2 * (j % 8)), color: `Color ${j}` }, total),
      ),
    ).flat();

  it("página completa: todas las prendas que promete el total, y no llegó al tope de filas", () => {
    const p = leerPaginaDeProductos(filas(50, 6, 130), 1, 50, 1000);
    expect(p).toMatchObject({ total: 130, cortada: false });
    expect(new Set(p.filas.map((f) => f.productoId)).size).toBe(50);
  });

  it("la última página trae menos prendas y está completa (130 prendas → la 3.ª trae 30)", () => {
    expect(leerPaginaDeProductos(filas(30, 6, 130, 100), 3, 50, 1000).cortada).toBe(false);
  });

  it("cortada por el tope: llegaron exactamente 1.000 filas (100 prendas × 12 variantes se quedan en 84)", () => {
    const todas = filas(100, 12, 100);
    expect(todas).toHaveLength(1200);
    const comoPostgrest = todas.slice(0, 1000); // lo que entrega PostgREST
    const p = leerPaginaDeProductos(comoPostgrest, 1, 100, 1000);
    expect(p.cortada).toBe(true);
    expect(new Set(p.filas.map((f) => f.productoId)).size).toBe(84);
  });

  it("cortada aunque no toque el tope: llegaron menos prendas de las que el total promete para esa página", () => {
    expect(leerPaginaDeProductos(filas(40, 3, 130), 1, 50, 1000).cortada).toBe(true);
  });

  it("una respuesta vacía o rota no está «cortada» (no hay nada que prometer): total 0", () => {
    for (const malo of [null, undefined, [], {}, "x"]) expect(leerPaginaDeProductos(malo, 1, 50, 1000)).toMatchObject({ filas: [], total: 0, cortada: false });
  });
});

describe("ámbito y ids", () => {
  it("con marca lee la marca y la categoría no acota; cambiar de categoría en la misma marca no cambia la clave", () => {
    const a = ambitoDeLectura("ABC-1", uuid(1));
    const b = ambitoDeLectura("abc-1", uuid(2));
    expect(a).toMatchObject({ ambito: "marca", marcaId: "abc-1", categoriaId: null });
    expect(a.clave).toBe(b.clave);
  });

  it("sin marca, manda la categoría (D5)", () => {
    expect(ambitoDeLectura(null, uuid(1))).toMatchObject({ ambito: "categoria", marcaId: null, categoriaId: uuid(1) });
  });

  it("el uuid nulo de «sin marca» (ADR-0283) cuenta como no haber elegido marca: lista la categoría, no todo lo que no tiene marca", () => {
    expect(ambitoDeLectura(MARCA_SIN_MARCA_ID, uuid(1)).ambito).toBe("categoria");
    expect(ambitoDeLectura(MARCA_SIN_MARCA_ID, null).ambito).toBe("ninguno");
  });

  it("una marca comodín REAL («Importado») se lee como marca: por eso quien llama pasa null para ella (D5)", () => {
    const importado = "e0837025-22ac-425d-b99e-327d3c6f8ecc"; // REAL: el id de «Importado» en producción (2026-09-30)
    expect(ambitoDeLectura(importado, uuid(1)).ambito).toBe("marca"); // aquí no se sabe qué marca es comodín
    expect(ambitoDeLectura(null, uuid(1))).toMatchObject({ ambito: "categoria", categoriaId: uuid(1) }); // lo que debe llegar
  });

  it("ni marca ni categoría: no hay qué leer", () => {
    expect(ambitoDeLectura(null, null)).toMatchObject({ ambito: "ninguno", clave: "" });
    expect(ambitoDeLectura("  ", "")).toMatchObject({ ambito: "ninguno" });
  });

  it("idsSinRepetir limpia, quita repetidos y ordena; la clave no depende del orden", () => {
    expect(idsSinRepetir(["B", " a ", "b", "", null, undefined, "A"])).toEqual(["a", "b"]);
    expect(claveDeIds(["b", "a"])).toBe(claveDeIds(["a", "b", "A"]));
  });

  it("trocear parte sin perder ni repetir", () => {
    expect(trocear([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(trocear([], 50)).toEqual([]);
    expect(trocear([1, 2], 0)).toEqual([[1], [2]]); // un tamaño absurdo no cuelga el bucle
  });
});

describe("LecturaParcial", () => {
  it("lleva las candidatas que sí se pudieron armar", () => {
    const parcial = new LecturaParcial(armarReales().slice(0, 2), "motivo");
    expect(parcial).toBeInstanceOf(Error);
    expect(parcial).toBeInstanceOf(LecturaParcial);
    expect(parcial.candidatas).toHaveLength(2);
    expect(parcial.message).toContain("motivo");
  });
});

describe("cuánto pesa la lista (presupuesto)", () => {
  // SINTÉTICO: 50 prendas de una marca, con la cantidad de variantes de las reales (promedio 6; máximo 16), la forma real de
  // fn_productos (29 columnas) y textos de la longitud de los reales.
  const prendas = Array.from({ length: 50 }, (_, i) => ({
    id: uuid(2000 + i),
    nombre: `Modelo de ejemplo ${i + 1}`,
    variantes: [2, 4, 4, 8, 9, 16][i % 6],
  }));
  const crudas = prendas.flatMap((p) =>
    Array.from({ length: p.variantes }, (_, j) =>
      filaFnProductos({ id: p.id, referencia: p.nombre, marca: "Marca de ejemplo", categoria: "Jeans" }, { talla: String(26 + 2 * (j % 4)), color: ["Azul denim", "Celeste", "Negro", "Beige"][j % 4] }, 50),
    ),
  );
  const fichas = prendas.map((p, i) => filaProducto({ ...REALES[i % 8], id: p.id, nombre: p.nombre }));

  it("la lista mapeada de 50 prendas cabe con holgura (y pesa una fracción de lo que respondió fn_productos)", () => {
    const salida = armarMedida();
    const bytesLista = JSON.stringify(salida).length;
    const bytesCrudo = JSON.stringify(crudas).length;
    if (process.env.MEDIR_CANDIDATAS) {
      const bytesFichas = JSON.stringify(fichas).length;
      const bytesStock = JSON.stringify(prendas.map((p) => ({ ...existenciasRaw(REALES[0]), producto_id: p.id }))).length;
      console.log(
        `[medida] 50 prendas · ${crudas.length} variantes · fn_productos crudo ${bytesCrudo} B · fichas ${bytesFichas} B · stock ${bytesStock} B · lista mapeada ${bytesLista} B`,
      );
    }
    expect(salida).toHaveLength(50);
    expect(bytesLista).toBeLessThan(60_000);
    expect(bytesLista).toBeLessThan(bytesCrudo / 4);
  });

  function armarMedida() {
    return construirCandidatas({
      variantes: leerFilasFnProductos(crudas),
      productos: leerFilasProductos(fichas),
      existencias: leerExistenciasProductos(prendas.map((p) => ({ ...existenciasRaw(REALES[0]), producto_id: p.id }))),
      sedes,
      temporadas: TEMPORADAS,
      origen: ORIGEN_REAL,
    });
  }
});
