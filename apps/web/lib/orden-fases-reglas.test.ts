import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FASES_DE_LA_HOJA,
  FASES,
  FIJO_MAXIMO,
  HINTS_FASE,
  TARIFA_MAXIMA,
  avisoMinimo,
  costoServiciosEstimado,
  esFechaIso,
  faseViaja,
  fasesEncendidas,
  fasesIniciales,
  fasesParaRpc,
  leerEntero,
  leerServicio,
  ordenarFases,
  problemasFases,
  proveedoresQueSirven,
  secuenciaDe,
  serviciosConCosto,
  tarifaSugerida,
  type FaseBorrador,
  type FaseClave,
  type FaseRpc,
  type HintFase,
  type Posicion,
  type ProveedorServicio,
  type TarifaDeLista,
} from "./orden-fases-reglas";

// Contrato. PROMETE: que el bloque «Fases y quién las hace» dice «falta…» con las mismas reglas que `fn_produccion_fases_normalizar` (la prueba al azar
// comprueba que `problemasFases` está vacío EXACTAMENTE cuando lo que se manda cumple lo que la función exige, en los dos sentidos); que la secuencia de la
// ruta, los nombres y los topes son LOS DE LA MIGRACIÓN (se leen del SQL, no se copian a mano); y que cada `hint` que la pantalla puede decir existe en la
// base. NO PROMETE que la base acepte: ella valida otra vez (proveedor vivo, lista de precios de hoy, permisos); su prueba contra Postgres es
// `scripts/pruebas/produccion_fases.mjs`.

const RAIZ = join(__dirname, "..", "..", "..");
// La ruta, los nombres y el CHECK de la clave vigentes salen de 20261019191000; la normalización (con el ploteo por orden y los hints nuevos), de 20261019192000.
const MIGRACION = "supabase/migrations/20261019191000_produccion_fases_nuevas_expandir.sql";
const MIGRACION_NORMALIZAR = "supabase/migrations/20261019192000_produccion_ploteo_la_fase_de_un_toque.sql";
const HOY = "2026-10-14";

const CONF: ProveedorServicio = { id: "prov-conf", nombre: "Confecciones del Norte", rubro: "maquila", activo: true };
const BORD: ProveedorServicio = { id: "prov-bord", nombre: "Bordados Lima", rubro: "otro", activo: true };
const INACTIVO: ProveedorServicio = { id: "prov-inactivo", nombre: "Taller Cerrado", rubro: "maquila", activo: false };
const TELAS: ProveedorServicio = { id: "prov-telas", nombre: "Telas del Sur", rubro: "tela", activo: true };
const AVIOS: ProveedorServicio = { id: "prov-avios", nombre: "Avíos Gamarra", rubro: "avios", activo: true };
const PROVEEDORES = [CONF, BORD, INACTIVO, TELAS, AVIOS];

const LISTA: TarifaDeLista[] = [
  { proveedorId: CONF.id, faseClave: "costura", tarifa: 4.5, minimo: 150, fijo: 0, vigenteDesde: "2026-01-01" },
  { proveedorId: CONF.id, faseClave: "costura", tarifa: 5, minimo: 150, fijo: 0, vigenteDesde: "2026-10-01" },
  { proveedorId: CONF.id, faseClave: "costura", tarifa: 6, minimo: 200, fijo: 0, vigenteDesde: "2026-11-01" }, // todavía no vige
  { proveedorId: BORD.id, faseClave: "bordado", tarifa: 1.2, minimo: 100, fijo: 80, vigenteDesde: "2026-09-01" },
];
const CTX = { hoy: HOY, proveedores: PROVEEDORES, lista: LISTA };

/**
 * La hoja de ANTES de la ruta nueva (corte · costura · acabado y las tres que se encienden): casi todas las reglas de abajo no dependen de qué fases se ofrecen, y la base
 * sigue aceptando esa ruta (`fn_produccion_fases_normalizar`). La hoja de HOY (`fasesIniciales`) tiene sus propias pruebas.
 */
const iniciales = (): FaseBorrador[] =>
  ordenarFases(
    FASES.filter((f) => f.ruta !== "nueva").map((f) => ({
      clave: f.clave,
      encendida: f.siempre,
      quien: "taller" as const,
      proveedorId: null,
      tarifa: "",
      fijo: "",
      minimo: "",
      fechaPrometida: "",
      posicion: f.posicionable ? ("pieza" as const) : null,
    }))
  );
/** Las fases iniciales de la hoja de antes con una de ellas cambiada. */
const con = (clave: FaseClave, cambios: Partial<FaseBorrador>, base: FaseBorrador[] = iniciales()): FaseBorrador[] =>
  base.map((f) => (f.clave === clave ? { ...f, ...cambios } : f));
/** Una fase que sale afuera, con todo en orden (Confecciones del Norte a S/ 4.50). */
const afuera = (clave: FaseClave, cambios: Partial<FaseBorrador> = {}, base?: FaseBorrador[]) =>
  con(clave, { encendida: true, quien: "servicio", proveedorId: CONF.id, tarifa: "4.50", ...cambios }, base);
const hints = (fases: FaseBorrador[]) => problemasFases(fases, CTX).map((p) => p.hint);

describe("el catálogo de fases", () => {
  it("son doce: las seis de siempre y las seis de la ruta nueva; solo bordado y estampado eligen posición; solo Ploteo se marca en vez de contarse", () => {
    expect(FASES).toHaveLength(12);
    expect(FASES.filter((f) => f.ruta !== "nueva").map((f) => f.clave)).toEqual(["corte", "costura", "acabado", "bordado", "estampado", "lavanderia"]);
    expect(FASES.filter((f) => f.ruta !== "anterior" && f.siempre).map((f) => f.clave)).toEqual([
      "ploteo", "corte", "habilitado", "costura", "limpieza_revision", "planchado", "etiquetado_embolsado",
    ]);
    expect(FASES.filter((f) => f.ruta !== "nueva" && f.siempre).map((f) => f.clave)).toEqual(["corte", "costura", "acabado"]);
    expect(FASES.filter((f) => f.posicionable).map((f) => f.clave)).toEqual(["bordado", "estampado"]);
    expect(FASES.filter((f) => f.hito).map((f) => f.clave)).toEqual(["ploteo"]);
    for (const f of FASES) expect(f.ayuda.length, f.clave).toBeGreaterThan(10);
  });
  it("la hoja de «Nueva orden» ofrece la ruta nueva: las siete fijas y Ojales y botones; Acabado, Bordado, Estampado y Lavandería «no se usan por ahora»", () => {
    expect(FASES_DE_LA_HOJA.map((f) => f.nombre)).toEqual([
      "Ploteo", "Corte", "Habilitado", "Costura", "Ojales y botones", "Limpiar hilos y revisar", "Planchado", "Etiquetar y embolsar",
    ]);
    expect(FASES_DE_LA_HOJA.filter((f) => f.siempre).map((f) => f.clave)).toEqual(["ploteo", "corte", "habilitado", "costura", "limpieza_revision", "planchado", "etiquetado_embolsado"]);
  });
  it("secuenciaDe es la tabla de la migración: 5 · 10 · 15 · 20 · 25 · 30 · 35 · 40 · 45 · 50 · 55 · 60 · 65 · 70, y un bordado sin posición no tiene lugar", () => {
    expect(secuenciaDe("ploteo", null)).toBe(5);
    expect(secuenciaDe("habilitado", null)).toBe(15);
    expect(secuenciaDe("ojales_botones", null)).toBe(35);
    expect(secuenciaDe("limpieza_revision", null)).toBe(55);
    expect(secuenciaDe("planchado", null)).toBe(65);
    expect(secuenciaDe("etiquetado_embolsado", null)).toBe(70);
    expect(secuenciaDe("corte", null)).toBe(10);
    expect(secuenciaDe("bordado", "pieza")).toBe(20);
    expect(secuenciaDe("estampado", "pieza")).toBe(25);
    expect(secuenciaDe("costura", null)).toBe(30);
    expect(secuenciaDe("bordado", "prenda")).toBe(40);
    expect(secuenciaDe("estampado", "prenda")).toBe(45);
    expect(secuenciaDe("lavanderia", null)).toBe(50);
    expect(secuenciaDe("acabado", null)).toBe(60);
    expect(secuenciaDe("bordado", null)).toBeNull();
    // La posición de una fase que no la elige se ignora, como en la base.
    expect(secuenciaDe("corte", "prenda")).toBe(10);
  });
});

describe("fasesIniciales y el orden de la ruta", () => {
  it("la hoja de hoy nace con la ruta nueva: las siete fijas encendidas y en el Taller, Ojales y botones apagado, en el orden de la ruta", () => {
    const f = fasesIniciales();
    expect(f.map((x) => x.clave)).toEqual(["ploteo", "corte", "habilitado", "costura", "ojales_botones", "limpieza_revision", "planchado", "etiquetado_embolsado"]);
    expect(f.filter((x) => x.encendida).map((x) => x.clave)).toEqual(["ploteo", "corte", "habilitado", "costura", "limpieza_revision", "planchado", "etiquetado_embolsado"]);
    expect(f.every((x) => x.quien === "taller" && x.proveedorId === null && x.tarifa === "" && x.fijo === "" && x.minimo === "" && x.fechaPrometida === "" && x.posicion === null)).toBe(true);
  });
  it("es válida tal cual: no falta nada, y a la base viajan las siete fijas en el Taller (sin Ojales y botones, sin la ruta anterior)", () => {
    expect(problemasFases(fasesIniciales(), CTX)).toEqual([]);
    const rpc = fasesParaRpc(fasesIniciales(), LISTA, HOY);
    expect(rpc.map((f) => f.clave)).toEqual(["ploteo", "corte", "habilitado", "costura", "limpieza_revision", "planchado", "etiquetado_embolsado"]);
    expect(rpc.every((f) => f.quien === "taller" && f.proveedor_id === null && f.tarifa_prenda === null && f.fijo_orden === null && f.posicion === null)).toBe(true);
  });
  it("Ojales y botones, encendido, viaja justo después de Costura; Acabado, Bordado, Estampado y Lavandería no se ofrecen", () => {
    const rpc = fasesParaRpc(con("ojales_botones", { encendida: true }, fasesIniciales()), LISTA, HOY);
    expect(rpc.map((f) => f.clave)).toEqual(["ploteo", "corte", "habilitado", "costura", "ojales_botones", "limpieza_revision", "planchado", "etiquetado_embolsado"]);
    const ofrecidas = FASES_DE_LA_HOJA.map((f) => f.clave);
    for (const fuera of ["acabado", "bordado", "estampado", "lavanderia"]) expect(ofrecidas, fuera).not.toContain(fuera);
  });
  it("un bordado sobre prenda pasa de antes a después de costura; lavandería va antes del acabado (la ruta anterior, que la base sigue aceptando)", () => {
    const claves = (p: Posicion) => ordenarFases(con("bordado", { posicion: p })).map((f) => f.clave);
    expect(claves("pieza")).toEqual(["corte", "bordado", "estampado", "costura", "lavanderia", "acabado"]);
    expect(claves("prenda")).toEqual(["corte", "estampado", "costura", "bordado", "lavanderia", "acabado"]);
  });
  it("la espina viaja aunque la fila diga apagada, y una clave repetida viaja una sola vez (gana la primera)", () => {
    expect(faseViaja({ clave: "corte", encendida: false })).toBe(true);
    expect(faseViaja({ clave: "ploteo", encendida: false })).toBe(true);
    expect(faseViaja({ clave: "ojales_botones", encendida: false })).toBe(false);
    expect(faseViaja({ clave: "bordado", encendida: false })).toBe(false);
    const apagada = con("corte", { encendida: false }, fasesIniciales());
    expect(fasesEncendidas(apagada).map((f) => f.clave)).toEqual(["ploteo", "corte", "habilitado", "costura", "limpieza_revision", "planchado", "etiquetado_embolsado"]);
    const repetida = [...fasesIniciales(), { ...fasesIniciales()[1], quien: "servicio" as const }];
    const viajan = fasesEncendidas(repetida);
    expect(viajan.filter((f) => f.clave === "corte")).toHaveLength(1);
    expect(viajan.find((f) => f.clave === "corte")?.quien).toBe("taller");
  });
});

describe("Ploteo cobra por ORDEN: el fijo, sin tarifa por prenda ni mínimo", () => {
  const PLOT: ProveedorServicio = { id: "prov-plot", nombre: "Plotter Lima", rubro: "maquila", activo: true };
  const listaPlot: TarifaDeLista[] = [{ proveedorId: PLOT.id, faseClave: "ploteo", tarifa: 0, minimo: null, fijo: 35, vigenteDesde: "2026-09-01" }];
  const ctx = { hoy: HOY, proveedores: [...PROVEEDORES, PLOT], lista: listaPlot };
  const plotAfuera = (cambios: Partial<FaseBorrador> = {}) => con("ploteo", { quien: "servicio", proveedorId: PLOT.id, ...cambios }, fasesIniciales());
  const hintsPlot = (f: FaseBorrador[]) => problemasFases(f, ctx).map((p) => p.hint);

  it("leerServicio: la tarifa por prenda y el mínimo no existen aunque la caja traiga algo; el fijo escrito manda y, vacío, sale de la lista", () => {
    const f = (c: Partial<FaseBorrador>) => leerServicio(plotAfuera(c)[0], listaPlot, HOY);
    expect(f({ fijo: "40", tarifa: "5", minimo: "100" })).toMatchObject({ tarifaPrenda: null, cantidadMinima: null, fijoOrden: 40 });
    expect(f({})).toMatchObject({ tarifaPrenda: null, cantidadMinima: null, fijoOrden: 35 });
    expect(leerServicio(plotAfuera({ fijo: "" })[0], [], HOY)).toMatchObject({ tarifaPrenda: null, fijoOrden: 0 });
  });
  it("las faltas: sin fijo ni lista (fase_sin_fijo), fijo negativo o en cero (fase_sin_fijo), fijo con coma o texto o fuera de rango (fase_tarifa_invalida); con lista o con fijo, ninguna", () => {
    expect(hintsPlot(plotAfuera({ fijo: "" }))).toEqual([]);
    expect(problemasFases(plotAfuera({ fijo: "" }), { ...ctx, lista: [] }).map((p) => p.hint)).toEqual(["fase_sin_fijo"]);
    expect(problemasFases(plotAfuera({ fijo: "0" }), { ...ctx, lista: [] }).map((p) => p.hint)).toEqual(["fase_sin_fijo"]);
    expect(hintsPlot(plotAfuera({ fijo: "-5" }))).toEqual(["fase_sin_fijo"]);
    expect(hintsPlot(plotAfuera({ fijo: "40,00" }))).toEqual(["fase_tarifa_invalida"]);
    expect(hintsPlot(plotAfuera({ fijo: "abc" }))).toEqual(["fase_tarifa_invalida"]);
    expect(hintsPlot(plotAfuera({ fijo: "100000" }))).toEqual(["fase_tarifa_invalida"]);
    expect(hintsPlot(plotAfuera({ fijo: "40" }))).toEqual([]);
    expect(hintsPlot(plotAfuera({ proveedorId: null, fijo: "40" }))).toEqual(["fase_sin_proveedor"]);
  });
  it("la frase de lo que falta nombra la fase y dice qué hacer", () => {
    const [p] = problemasFases(plotAfuera({ fijo: "" }), { ...ctx, lista: [] });
    expect(p.texto).toBe("Falta lo que cobra «Ploteo» por esta orden: escríbelo o guárdalo en la lista de precios del proveedor.");
  });
  it("viaja a la base sin tarifa por prenda ni mínimo, con el fijo (escrito o el de la lista) como texto; el costo estimado es solo el fijo, no depende de las prendas", () => {
    const rpc = fasesParaRpc(plotAfuera({ fijo: "40", tarifa: "5", minimo: "100", fechaPrometida: "2026-10-20" }), listaPlot, HOY)[0];
    expect(rpc).toMatchObject({ clave: "ploteo", quien: "servicio", proveedor_id: PLOT.id, tarifa_prenda: null, fijo_orden: "40", cantidad_minima: null, fecha_prometida: "2026-10-20" });
    expect(fasesParaRpc(plotAfuera({ fijo: "" }), listaPlot, HOY)[0].fijo_orden).toBe("35");
    expect(costoServiciosEstimado(plotAfuera({ fijo: "40" }), 50, listaPlot, HOY)).toBe(40);
    expect(costoServiciosEstimado(plotAfuera({ fijo: "40" }), 500, listaPlot, HOY)).toBe(40);
    expect(serviciosConCosto(plotAfuera({ fijo: "40" }), 50, listaPlot, HOY, [PLOT]).map((x) => [x.clave, x.proveedor, x.costo])).toEqual([["ploteo", "Plotter Lima", 40]]);
  });
  it("sin aviso de mínimo (no tiene) y una fase del Taller no dice nada aunque traiga basura", () => {
    expect(avisoMinimo(plotAfuera({ fijo: "40" })[0], 1, listaPlot, ctx)).toBeNull();
    expect(hintsPlot(con("ploteo", { quien: "taller", fijo: "abc", proveedorId: TELAS.id }, fasesIniciales()))).toEqual([]);
  });
});

describe("la lista de precios sugiere; la fase copia", () => {
  it("tarifaSugerida es la vigente más reciente a hoy: ni la vieja ni la que todavía no vige", () => {
    expect(tarifaSugerida(CONF.id, "costura", LISTA, HOY)?.tarifa).toBe(5);
    expect(tarifaSugerida(CONF.id, "costura", LISTA, "2026-09-30")?.tarifa).toBe(4.5);
    expect(tarifaSugerida(CONF.id, "costura", LISTA, "2026-11-01")?.tarifa).toBe(6);
    expect(tarifaSugerida(CONF.id, "corte", LISTA, HOY)).toBeNull();
    expect(tarifaSugerida(BORD.id, "costura", LISTA, HOY)).toBeNull();
    expect(tarifaSugerida(null, "costura", LISTA, HOY)).toBeNull();
  });
  it("leerServicio hace lo que la base: la escrita manda; vacía, copia la de la lista con su mínimo y su fijo (el fijo escrito gana solo si es > 0)", () => {
    const vacia = leerServicio(afuera("costura", { tarifa: "" })[3], LISTA, HOY);
    expect(vacia).toMatchObject({ tarifaPrenda: 5, cantidadMinima: 150, fijoOrden: 0, deLaLista: true });
    const escrita = leerServicio(afuera("costura", { tarifa: "4.50", minimo: "", fijo: "" })[3], LISTA, HOY);
    expect(escrita).toMatchObject({ tarifaPrenda: 4.5, cantidadMinima: null, fijoOrden: 0, deLaLista: false });
    const bordado = (cambios: Partial<FaseBorrador>) => leerServicio(afuera("bordado", { proveedorId: BORD.id, tarifa: "", ...cambios })[1], LISTA, HOY);
    expect(bordado({})).toMatchObject({ tarifaPrenda: 1.2, cantidadMinima: 100, fijoOrden: 80 });
    expect(bordado({ fijo: "0", minimo: "20" })).toMatchObject({ tarifaPrenda: 1.2, cantidadMinima: 20, fijoOrden: 80 });
    expect(bordado({ fijo: "30" })).toMatchObject({ fijoOrden: 30 });
  });
  it("proveedoresQueSirven deja fuera a los inactivos y a quienes venden tela o avíos", () => {
    expect(proveedoresQueSirven(PROVEEDORES).map((p) => p.id)).toEqual([CONF.id, BORD.id]);
  });
});

describe("lecturas estrictas", () => {
  it("la cantidad mínima es un entero con dígitos: «150» sí; «1.5», «-3», «abc» y lo que no cabe en 32 bits, no; vacío es vacío", () => {
    expect(leerEntero("150")).toEqual({ tipo: "ok", valor: 150 });
    expect(leerEntero(" 7 ")).toEqual({ tipo: "ok", valor: 7 });
    expect(leerEntero("0")).toEqual({ tipo: "ok", valor: 0 });
    expect(leerEntero("")).toEqual({ tipo: "vacio" });
    for (const t of ["1.5", "-3", "abc", "1e3", "2147483648"]) expect(leerEntero(t).tipo, t).toBe("invalido");
  });
  it("una fecha es aaaa-mm-dd y existe en el calendario", () => {
    expect(esFechaIso("2026-10-14")).toBe(true);
    expect(esFechaIso("2028-02-29")).toBe(true);
    for (const t of ["2026-02-30", "2026-13-01", "14/10/2026", "mañana", "", "2026-10-14T00:00"]) expect(esFechaIso(t), t).toBe(false);
  });
});

describe("problemasFases — cada hint se puede provocar desde la hoja, y solo esos", () => {
  const casos: { hint: HintFase; fases: FaseBorrador[]; por: string }[] = [
    { hint: "fase_sin_posicion", fases: con("bordado", { encendida: true, posicion: null }), por: "bordado encendido sin posición" },
    { hint: "fase_sin_proveedor", fases: afuera("costura", { proveedorId: null }), por: "sale afuera sin decir a quién" },
    { hint: "fase_proveedor_inactivo", fases: afuera("costura", { proveedorId: INACTIVO.id }), por: "proveedor inactivo" },
    { hint: "fase_proveedor_inactivo", fases: afuera("costura", { proveedorId: "no-existe" }), por: "proveedor que no está en el directorio" },
    { hint: "fase_proveedor_rubro", fases: afuera("costura", { proveedorId: TELAS.id }), por: "proveedor de tela" },
    { hint: "fase_proveedor_rubro", fases: afuera("costura", { proveedorId: AVIOS.id }), por: "proveedor de avíos" },
    { hint: "fase_sin_tarifa", fases: afuera("corte", { tarifa: "" }), por: "tarifa vacía y la lista no tiene corte" },
    { hint: "fase_sin_tarifa", fases: afuera("costura", { tarifa: "0" }), por: "tarifa en cero" },
    { hint: "fase_sin_tarifa", fases: afuera("costura", { tarifa: "-1" }), por: "tarifa negativa (la base la lee como «sin tarifa»)" },
    { hint: "fase_tarifa_invalida", fases: afuera("costura", { tarifa: "4,50" }), por: "tarifa con coma" },
    { hint: "fase_tarifa_invalida", fases: afuera("costura", { tarifa: "S/ 5" }), por: "tarifa con texto" },
    { hint: "fase_tarifa_invalida", fases: afuera("costura", { tarifa: "10000" }), por: "tarifa fuera de rango" },
    { hint: "fase_tarifa_invalida", fases: afuera("costura", { fijo: "-1" }), por: "fijo negativo" },
    { hint: "fase_tarifa_invalida", fases: afuera("costura", { fijo: "100000" }), por: "fijo fuera de rango" },
    { hint: "fase_tarifa_invalida", fases: afuera("costura", { fijo: "80,00" }), por: "fijo con coma" },
    { hint: "fase_tarifa_invalida", fases: afuera("costura", { minimo: "1.5" }), por: "mínimo con decimales" },
    { hint: "fase_tarifa_invalida", fases: afuera("costura", { minimo: "0" }), por: "mínimo en cero" },
    { hint: "fase_fecha_invalida", fases: afuera("costura", { fechaPrometida: "2026-02-30" }), por: "fecha que no existe" },
    { hint: "fase_fecha_invalida", fases: afuera("costura", { fechaPrometida: "mañana" }), por: "fecha escrita" },
    { hint: "fase_fecha_pasada", fases: afuera("costura", { fechaPrometida: "2026-10-13" }), por: "fecha de ayer" },
  ];
  for (const c of casos) {
    it(`${c.hint}: ${c.por}`, () => {
      expect(hints(c.fases)).toContain(c.hint);
    });
  }
  it("entre todos los casos aparecen los hints de las fases que cuentan prendas, y con el ploteo por orden, los 9: ninguno es inalcanzable desde la hoja", () => {
    const vistos = new Set([...casos.flatMap((c) => hints(c.fases)), ...problemasFases(con("ploteo", { quien: "servicio", proveedorId: CONF.id, fijo: "" }, fasesIniciales()), { ...CTX, lista: [] }).map((p) => p.hint)]);
    expect([...vistos].sort()).toEqual([...HINTS_FASE].sort());
  });
  it("todo en orden: un servicio con proveedor, tarifa y fecha de hoy no tiene faltas; una tarifa vacía con lista de precios TAMPOCO (la base la copia)", () => {
    expect(hints(afuera("costura", { fechaPrometida: HOY }))).toEqual([]);
    expect(hints(afuera("costura", { tarifa: "" }))).toEqual([]);
    expect(hints(afuera("bordado", { proveedorId: BORD.id, tarifa: "", posicion: "prenda" }))).toEqual([]);
  });
  it("una fase del Taller no dice nada aunque sus cajas traigan basura (la base las ignora cuando quien = taller)", () => {
    expect(hints(con("costura", { quien: "taller", proveedorId: TELAS.id, tarifa: "abc", fijo: "-1", fechaPrometida: "ayer" }))).toEqual([]);
  });
  it("una fase apagada no dice nada: no viaja", () => {
    expect(hints(con("lavanderia", { encendida: false, quien: "servicio", proveedorId: null, tarifa: "x" }))).toEqual([]);
  });
  it("las faltas salen en el orden de la ruta y, dentro de una fase, en el orden en que la base las mira (proveedor antes que tarifa antes que fecha)", () => {
    const fases = afuera("acabado", { proveedorId: null, tarifa: "x", fechaPrometida: "2026-01-01" }, afuera("corte", { proveedorId: null }));
    expect(problemasFases(fases, CTX).map((p) => `${p.clave}:${p.hint}`)).toEqual([
      "corte:fase_sin_proveedor",
      "acabado:fase_sin_proveedor",
      "acabado:fase_tarifa_invalida",
      "acabado:fase_fecha_pasada",
    ]);
  });
  it("la frase nombra la fase y dice qué hacer", () => {
    const [p] = problemasFases(afuera("costura", { tarifa: "4,50" }), CTX);
    expect(p.texto).toBe("Escribe la tarifa de «Costura» con punto, por ejemplo 4.50.");
  });
});

describe("avisos y textos", () => {
  it("avisoMinimo avisa (no bloquea) cuando la orden lleva menos prendas que el mínimo del servicio, con el nombre del proveedor", () => {
    const costura = afuera("costura", { minimo: "150" })[3];
    expect(avisoMinimo(costura, 50, LISTA, CTX)).toBe("Confecciones del Norte cobra desde 150 prendas: esta orden lleva 50");
    expect(avisoMinimo(costura, 150, LISTA, CTX)).toBeNull();
    expect(avisoMinimo(costura, 0, LISTA, CTX)).toBeNull();
    // El mínimo también puede venir de la lista (tarifa vacía: la base copia el mínimo de la lista).
    expect(avisoMinimo(afuera("costura", { tarifa: "", minimo: "" })[3], 50, LISTA, CTX)).toMatch(/desde 150 prendas/);
    expect(avisoMinimo(afuera("costura", { tarifa: "4.50", minimo: "" })[3], 50, LISTA, CTX)).toBeNull();
    expect(avisoMinimo(iniciales()[3], 50, LISTA, CTX)).toBeNull();
    expect(avisoMinimo(costura, 50, LISTA, { hoy: HOY })).toBe("Este servicio cobra desde 150 prendas: esta orden lleva 50");
    // Sigue siendo un aviso: no es una falta.
    expect(hints(afuera("costura", { minimo: "150" }))).toEqual([]);
  });
  it("costoServiciosEstimado suma tarifa × prendas + fijo de lo que sale afuera; null si todo queda en el Taller", () => {
    expect(costoServiciosEstimado(iniciales(), 50, LISTA, HOY)).toBeNull();
    expect(costoServiciosEstimado(afuera("costura", { fijo: "100" }), 50, LISTA, HOY)).toBe(325);
    const dos = afuera("bordado", { proveedorId: BORD.id, tarifa: "" }, afuera("costura", { tarifa: "" }));
    expect(costoServiciosEstimado(dos, 50, LISTA, HOY)).toBe(50 * 5 + 50 * 1.2 + 80);
    // Una tarifa que aún no se lee suma 0 (es un estimado, no una cuenta).
    expect(costoServiciosEstimado(afuera("costura", { tarifa: "abc", fijo: "10" }), 50, LISTA, HOY)).toBe(10);
    expect(costoServiciosEstimado(afuera("costura", { tarifa: "0.1" }), 3, LISTA, HOY)).toBe(0.3);
  });
});

describe("serviciosConCosto — la cuenta de los servicios, fase por fase", () => {
  it("parte `costoServiciosEstimado` en una fila por fase de afuera, con su proveedor y en el orden de la ruta; lo que se queda en el Taller no entra", () => {
    expect(serviciosConCosto(iniciales(), 50, LISTA, HOY, PROVEEDORES)).toEqual([]);
    const dos = afuera("bordado", { proveedorId: BORD.id, tarifa: "" }, afuera("costura", { tarifa: "" }));
    const filas = serviciosConCosto(dos, 50, LISTA, HOY, PROVEEDORES);
    // El bordado sobre pieza va antes que la costura en la ruta; cada uno toma la tarifa vigente de su lista (costura S/ 5.00, bordado S/ 1.20 + S/ 80 fijo).
    expect(filas.map((s) => [s.clave, s.nombre, s.proveedor, s.costo])).toEqual([
      ["bordado", "Bordado", "Bordados Lima", 140],
      ["costura", "Costura", "Confecciones del Norte", 250],
    ]);
    expect(filas.reduce((suma, s) => suma + s.costo, 0)).toBe(costoServiciosEstimado(dos, 50, LISTA, HOY));
  });
  it("una tarifa que aún no se lee cuesta 0 (solo cuenta el fijo) y una fase sin proveedor no inventa uno", () => {
    const [solo] = serviciosConCosto(afuera("costura", { tarifa: "abc", fijo: "10" }), 50, LISTA, HOY, PROVEEDORES);
    expect(solo.costo).toBe(10);
    const [sinQuien] = serviciosConCosto(afuera("costura", { proveedorId: null }), 50, LISTA, HOY, PROVEEDORES);
    expect(sinQuien.proveedor).toBeNull();
  });
  it("sin prendas solo queda el fijo, nunca un costo negativo", () => {
    const [f] = serviciosConCosto(afuera("costura", { fijo: "100" }), 0, LISTA, HOY, PROVEEDORES);
    expect(f.costo).toBe(100);
    const [g] = serviciosConCosto(afuera("costura"), -5, LISTA, HOY, PROVEEDORES);
    expect(g.costo).toBe(0);
  });
});

describe("fasesParaRpc — lo que viaja", () => {
  it("un servicio lleva la tarifa escrita (o la sugerida con su mínimo y su fijo), el proveedor, la fecha y, si corresponde, la posición; los números como texto", () => {
    const fases = afuera("bordado", { proveedorId: BORD.id, tarifa: "", posicion: "prenda", fechaPrometida: "2026-10-20" }, afuera("costura", { fijo: "100", minimo: "150" }));
    const rpc = fasesParaRpc(fases, LISTA, HOY);
    expect(rpc.map((f) => f.clave)).toEqual(["corte", "costura", "bordado", "acabado"]);
    expect(rpc[1]).toEqual({ clave: "costura", quien: "servicio", proveedor_id: CONF.id, tarifa_prenda: "4.5", fijo_orden: "100", cantidad_minima: "150", fecha_prometida: null, posicion: null });
    expect(rpc[2]).toEqual({ clave: "bordado", quien: "servicio", proveedor_id: BORD.id, tarifa_prenda: "1.2", fijo_orden: "80", cantidad_minima: "100", fecha_prometida: "2026-10-20", posicion: "prenda" });
    for (const f of rpc) for (const v of [f.tarifa_prenda, f.fijo_orden, f.cantidad_minima]) expect(v === null || typeof v === "string").toBe(true);
  });
  it("lo que no se pudo leer viaja TAL CUAL (la base lo rechaza con su hint): nunca se arregla en silencio", () => {
    const [, costura] = fasesParaRpc(afuera("costura", { tarifa: " 4,50 ", fijo: "abc" }), LISTA, HOY);
    expect(costura.tarifa_prenda).toBe("4,50");
    expect(costura.fijo_orden).toBe("abc");
    const [vacia] = fasesParaRpc(afuera("corte", { tarifa: "" }), LISTA, HOY);
    expect(vacia.tarifa_prenda).toBeNull();
    expect(vacia.fijo_orden).toBe("0");
  });
  it("las llaves de cada fase son exactamente las que `fn_produccion_fases_normalizar` lee (`v_f ->> '…'`), menos la nota, que la hoja no pide", () => {
    const cuerpo = funcion("fn_produccion_fases_normalizar", SQL_NORMALIZAR);
    const enSql = new Set([...cuerpo.matchAll(/v_f ->> '(\w+)'/g)].map((m) => m[1]));
    const [corte] = fasesParaRpc(iniciales(), LISTA, HOY);
    const llaves = Object.keys(corte).sort();
    expect(llaves).toEqual([...enSql].filter((k) => k !== "nota").sort());
  });
});

// ---------- Paridad con la migración: lo que la pantalla dice sale del SQL, no de la memoria ----------

const SQL = readFileSync(join(RAIZ, MIGRACION), "utf8");
const SQL_NORMALIZAR = readFileSync(join(RAIZ, MIGRACION_NORMALIZAR), "utf8");
/** El cuerpo de una función de la migración (desde su `create or replace function` hasta el `$$;` que la cierra). */
function funcion(nombre: string, sql: string = SQL): string {
  const desde = sql.indexOf(`create or replace function retail.${nombre}(`);
  expect(desde, nombre).toBeGreaterThan(-1);
  return sql.slice(desde, sql.indexOf("$$;", desde));
}

describe("paridad con las migraciones 20261019191000 y 20261019192000", () => {
  it("cada hint que la pantalla puede decir existe en fn_produccion_fases_normalizar, y los de allá que no están acá son imposibles por construcción", () => {
    const cuerpo = funcion("fn_produccion_fases_normalizar", SQL_NORMALIZAR);
    for (const h of HINTS_FASE) expect(cuerpo, h).toContain(`hint = '${h}'`);
    // `fases_mezcla` no puede pasar: la hoja manda una sola ruta.
    const imposibles = ["fases_espina", "fases_mezcla", "fase_desconocida", "fase_repetida", "fase_con_posicion", "fase_quien", "fase_proveedor"];
    const enSql = [...new Set([...cuerpo.matchAll(/hint = '([a-z_]+)'/g)].map((m) => m[1]))].sort();
    expect(enSql).toEqual([...HINTS_FASE, ...imposibles].sort());
  });
  it("la secuencia de la ruta es la de fn_fase_secuencia (se extraen los `when … then N`)", () => {
    const cuerpo = funcion("fn_fase_secuencia");
    const filas = [...cuerpo.matchAll(/when p_clave = '(\w+)'(?: and p_posicion = '(\w+)')? then (\d+)/g)];
    expect(filas).toHaveLength(14);
    for (const [, clave, posicion, n] of filas) {
      expect(secuenciaDe(clave as FaseClave, (posicion as Posicion | undefined) ?? null), `${clave}/${posicion}`).toBe(Number(n));
    }
    // Las claves con posición en el SQL son exactamente las posicionables de acá, y toda clave de acá aparece allá.
    const conPosicion = new Set(filas.filter((f) => f[2]).map((f) => f[1]));
    expect([...conPosicion].sort()).toEqual(FASES.filter((f) => f.posicionable).map((f) => f.clave).sort());
    expect(new Set(filas.map((f) => f[1]))).toEqual(new Set(FASES.map((f) => f.clave)));
  });
  it("los nombres son los de fn_fase_nombre y las claves las del CHECK de produccion_fases", () => {
    const nombres = new Map([...funcion("fn_fase_nombre").matchAll(/when '(\w+)' then '([^']+)'/g)].map((m) => [m[1], m[2]]));
    expect(nombres.size).toBe(12);
    for (const f of FASES) expect(nombres.get(f.clave), f.clave).toBe(f.nombre);
    const check = /add constraint produccion_fases_clave_check check \(clave in \(([^)]+)\)\)/.exec(SQL)?.[1] ?? "";
    const claves = [...check.matchAll(/'(\w+)'/g)].map((m) => m[1]).sort();
    expect(claves).toEqual(FASES.map((f) => f.clave).sort());
  });
  it("las fases que se marcan son las de fn_fase_es_hito (hoy solo ploteo)", () => {
    const cuerpo = funcion("fn_fase_es_hito", SQL_NORMALIZAR);
    const enLaBase = [...cuerpo.matchAll(/p_clave = '(\w+)'/g)].map((m) => m[1]);
    expect(enLaBase.sort()).toEqual(FASES.filter((f) => f.hito).map((f) => f.clave).sort());
  });
  it("los topes de tarifa y fijo son los de la función; el Taller no lleva proveedor ni tarifa ni fecha (el CHECK produccion_fases_quien)", () => {
    const cuerpo = funcion("fn_produccion_fases_normalizar", SQL_NORMALIZAR);
    expect(Number(/v_tarifa > ([\d.]+)/.exec(cuerpo)?.[1])).toBe(TARIFA_MAXIMA);
    expect(Number(/v_fijo < 0 or v_fijo > ([\d.]+)/.exec(cuerpo)?.[1])).toBe(FIJO_MAXIMO);
    expect(SQL_NORMALIZAR).toMatch(/else proveedor_id is null and tarifa_prenda is null and fecha_prometida is null and cantidad_minima is null/);
    // Y la copia de la lista mira la vigente más reciente a hoy, como `tarifaSugerida`.
    expect(cuerpo).toMatch(/t\.vigente_desde <= retail\.fn_hoy_lima\(\)\s+order by t\.vigente_desde desc limit 1/);
  });
});

// ---------- Al azar, con semilla fija: no falta nada ⇔ la base lo aceptaría ----------

/** Lo que `fn_produccion_fases_normalizar` exige, reescrito sobre el PAYLOAD (independiente de la implementación): el oráculo de la prueba al azar. */
function laBaseAceptaria(p: FaseRpc[]): boolean {
  if (p.length === 0) return false;
  const claves = new Set<string>();
  const numero = (t: string | null) => (t === null || t.trim() === "" ? null : /^-?(\d+\.?\d*|\.\d+)$/.test(t.trim()) ? Number(t.trim()) : Number.NaN);
  const entero = (t: string | null) => (t === null || t.trim() === "" ? null : /^-?\d+$/.test(t.trim()) ? Number(t.trim()) : Number.NaN);
  for (const f of p) {
    if (!FASES.some((x) => x.clave === f.clave) || claves.has(f.clave)) return false;
    claves.add(f.clave);
    const posicionable = f.clave === "bordado" || f.clave === "estampado";
    if (posicionable ? f.posicion !== "pieza" && f.posicion !== "prenda" : f.posicion !== null) return false;
    if (f.quien !== "taller" && f.quien !== "servicio") return false;
    if (f.quien === "taller") continue;
    if (!f.proveedor_id) return false;
    const prov = PROVEEDORES.find((x) => x.id === f.proveedor_id);
    if (!prov || !prov.activo || prov.rubro === "tela" || prov.rubro === "avios") return false;
    let tarifa = numero(f.tarifa_prenda);
    let fijo = numero(f.fijo_orden) ?? 0;
    let min = entero(f.cantidad_minima);
    if (Number.isNaN(tarifa) || Number.isNaN(fijo) || Number.isNaN(min)) return false;
    if (tarifa === null) {
      const vigentes = LISTA.filter((t) => t.proveedorId === prov.id && t.faseClave === f.clave && t.vigenteDesde <= HOY).sort((a, b) => (a.vigenteDesde < b.vigenteDesde ? 1 : -1));
      if (vigentes[0]) {
        tarifa = vigentes[0].tarifa;
        min = min ?? vigentes[0].minimo;
        fijo = fijo > 0 ? fijo : vigentes[0].fijo;
      }
    }
    if (tarifa === null || tarifa <= 0) return false;
    if (tarifa > 9999.99 || fijo < 0 || fijo > 99999.99 || (min !== null && min <= 0)) return false;
    if (f.fecha_prometida !== null && (!esFechaIso(f.fecha_prometida) || f.fecha_prometida < HOY)) return false;
  }
  return claves.has("corte") && claves.has("costura") && claves.has("acabado");
}

describe("la pantalla no promete lo que la base rechaza, ni frena lo que la base acepta (al azar, con semilla fija)", () => {
  // PRNG determinista (mulberry32): una corrida exacta se repite.
  const prng = (semilla: number) => () => {
    semilla |= 0;
    semilla = (semilla + 0x6d2b79f5) | 0;
    let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const elegir = <X,>(r: () => number, xs: X[]) => xs[Math.floor(r() * xs.length)];
  /** Los valores buenos pesan 3 a 1 frente a los hostiles: si no, casi ningún borrador llega a «todo en orden» y la prueba no probaría nada. */
  const casiSiempreBueno = <X,>(buenos: X[], hostiles: X[]) => [...buenos, ...buenos, ...buenos, ...hostiles];

  it("problemasFases vacío ⇔ fasesParaRpc arma un arreglo con la espina y sin servicios inválidos (1000 borradores)", () => {
    const r = prng(400);
    let sinProblemas = 0;
    let conServicio = 0;
    for (let i = 0; i < 1000; i++) {
      const fases: FaseBorrador[] = iniciales().map((f) => ({
        ...f,
        encendida: r() < 0.5,
        quien: r() < 0.5 ? "taller" : "servicio",
        proveedorId: elegir(r, casiSiempreBueno([CONF.id, BORD.id], [null, INACTIVO.id, TELAS.id, AVIOS.id, "desconocido"])),
        tarifa: elegir(r, casiSiempreBueno(["4.50", "", "12", "9999.99"], ["0", "-1", "12,50", "abc", "10000", "S/ 5"])),
        fijo: elegir(r, casiSiempreBueno(["", "0", "80", "99999.99"], ["-1", "12,50", "abc", "100000"])),
        minimo: elegir(r, casiSiempreBueno(["", "150", "1"], ["0", "1.5", "-3", "abc"])),
        fechaPrometida: elegir(r, casiSiempreBueno(["", HOY, "2026-11-01"], ["2026-10-13", "2026-02-30", "mañana", "14/10/2026"])),
        posicion: f.posicion === null ? null : elegir(r, ["pieza", "prenda", "prenda", null] as (Posicion | null)[]),
      }));
      const problemas = problemasFases(fases, CTX);
      const rpc = fasesParaRpc(fases, LISTA, HOY);
      expect(problemas.length === 0, JSON.stringify({ fases, problemas })).toBe(laBaseAceptaria(rpc));
      if (problemas.length === 0) {
        sinProblemas += 1;
        if (rpc.some((f) => f.quien === "servicio")) conServicio += 1;
        // Y lo que viaja es, por construcción, lo que la base espera: la espina, cada clave una vez, en el orden de la ruta.
        for (const c of ["corte", "costura", "acabado"]) expect(rpc.some((f) => f.clave === c)).toBe(true);
        expect(new Set(rpc.map((f) => f.clave)).size).toBe(rpc.length);
      }
    }
    // Que el azar de verdad llegue a «todo en orden» (y con servicios afuera), si no la prueba no probaría nada.
    expect(sinProblemas).toBeGreaterThan(20);
    expect(conServicio).toBeGreaterThan(5);
  });
});
