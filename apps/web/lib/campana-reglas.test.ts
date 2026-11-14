import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  contarPorCategoria,
  contarPrendas,
  prendasQueAlcanza,
  nombresDeTiendas,
  algunDiaCae,
  atajosDeFechas,
  choquesDeFilas,
  choqueResuelto,
  choquesSinResolver,
  cesionesQueQuedan,
  tituloDeChoque,
  fraseDeChoque,
  type FilaChoque,
  resumenAntes,
  cuentaDias,
  DIAS_SEMANA,
  diaDeSemanaIso,
  diasQueCaen,
  esNombreAutomatico,
  fraseDeOferta,
  leerCuerpoOferta,
  alcanceDicho,
  MAX_PRODUCTOS_SOLO,
  MAX_INSIGNIAS_SOLO,
  insigniasDichas,
  nombreAutomatico,
  nombreDeOferta,
  ofertaDesdeRegla,
  ofertaNueva,
  ordenarReglas,
  PORCENTAJE_MAX,
  PORCENTAJE_MIN,
  PORCENTAJE_PASO,
  PORCENTAJES_RAPIDOS,
  problemasDeOferta,
  reglaDeFila,
  reglasVivas,
  textoDias,
  textoDiasCorto,
  vigenciaDeRegla,
  type FilaRegla,
  type ReglaCampana,
  textoDeEscalon,
  titularDeEscalon,
  titularDeMonto,
  FORMA_DE_FABRICA,
  problemasDeForma,
  problemasDeMonto,
} from "./campana-reglas";

// El viernes 23 de octubre de 2026 es hoy en la maqueta; el lunes 26, el martes 27, el jueves 29.
const HOY = "2026-10-23";
const ID = "11111111-1111-4111-8111-111111111111";
const CAMPANA = "22222222-2222-4222-8222-222222222222";
const BLUSAS = "33333333-3333-4333-8333-333333333333";
const FALDAS = "44444444-4444-4444-8444-444444444444";
const nombreCat = (id: string) => ({ [BLUSAS]: "Blusas", [FALDAS]: "Faldas" })[id] ?? "";

const fila = (o: Partial<FilaRegla> = {}): FilaRegla => ({
  id: ID,
  etiqueta_id: CAMPANA,
  nombre: "Toda la campaña · −20 %",
  tipo: "pct",
  porcentaje: "20.00",
  desde: "2026-10-23",
  hasta: "2026-10-31",
  dias_semana: [1, 2, 3, 4, 5, 6, 7],
  incluye_claure: false,
  estado: "activa",
  categorias_solo: [],
  categorias_fuera: [],
  creada_en: "2026-10-23T12:00:00Z",
  activada_en: "2026-10-23T12:05:00Z",
  cambios: 0,
  ultimo_cambio: null,
  ...o,
});
const regla = (o: Partial<FilaRegla> = {}): ReglaCampana => reglaDeFila(fila(o));

describe("los días de la semana", () => {
  it("el día de la semana de una fecha, de lunes (1) a domingo (7)", () => {
    expect(diaDeSemanaIso("2026-10-23")).toBe(5); // viernes
    expect(diaDeSemanaIso("2026-10-24")).toBe(6);
    expect(diaDeSemanaIso("2026-10-25")).toBe(7); // domingo
    expect(diaDeSemanaIso("2026-10-26")).toBe(1); // lunes
    expect(diaDeSemanaIso("2024-02-29")).toBe(4); // jueves, año bisiesto
  });
  it("solo caen los días que están entre las fechas: de viernes a domingo no hay martes", () => {
    expect(diasQueCaen("2026-10-23", "2026-10-25")).toEqual([5, 6, 7]);
    expect(diasQueCaen("2026-10-23", "2026-10-31")).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(diasQueCaen("2026-10-26", "2026-10-26")).toEqual([1]);
  });
  it("una oferta de martes y jueves cuenta 2 de los 6 días de 26 al 31 de octubre", () => {
    expect(cuentaDias("2026-10-26", "2026-10-31", [2, 4])).toEqual({ rige: 2, total: 6 });
    expect(cuentaDias("2026-10-23", "2026-10-25", [2, 4])).toEqual({ rige: 0, total: 3 });
  });
  it("sin días en las fechas no rige nunca; con uno, sí", () => {
    expect(algunDiaCae("2026-10-23", "2026-10-25", [2, 4])).toBe(false);
    expect(algunDiaCae("2026-10-23", "2026-10-25", [5])).toBe(true);
  });
  it("las fechas al revés no tienen días (nada que contar)", () => {
    expect(cuentaDias("2026-10-31", "2026-10-26", [1])).toEqual({ rige: 0, total: 0 });
  });
  it("lo dice en palabras de tienda", () => {
    expect(textoDias([1, 2, 3, 4, 5, 6, 7])).toBe("");
    expect(textoDias([2, 4])).toBe("los martes y jueves");
    expect(textoDias([4, 2])).toBe("los martes y jueves");
    expect(textoDias([1, 2, 3, 4, 5])).toBe("de lunes a viernes");
    expect(textoDias([6, 7])).toBe("los sábados y domingos");
    expect(textoDias([1, 3, 5])).toBe("los lunes, miércoles y viernes");
    expect(textoDias([5])).toBe("los viernes");
    expect(textoDias([])).toBe("ningún día");
  });
  it("y en corto, para el nombre y la lista", () => {
    expect(textoDiasCorto([1, 2, 3, 4, 5, 6, 7])).toBe("");
    expect(textoDiasCorto([2, 4])).toBe("mar y jue");
    expect(textoDiasCorto([1, 2, 3, 4, 5])).toBe("lun a vie");
    expect(textoDiasCorto([6, 7])).toBe("fin de semana");
    expect(textoDiasCorto([1, 3, 5])).toBe("lun, mié y vie");
    expect(textoDiasCorto([])).toBe("sin días");
  });
});

describe("leer una fila de la base", () => {
  it("el % llega como texto y los días en orden", () => {
    const r = regla({ porcentaje: "12.50", dias_semana: [4, 2] });
    expect(r.porcentaje).toBe(12.5);
    expect(r.dias).toEqual([2, 4]);
    expect(r.tipo).toBe("pct");
  });
  it("sin categorías son listas vacías, nunca null", () => {
    const r = regla({ categorias_solo: null, categorias_fuera: null });
    expect(r.categoriasSolo).toEqual([]);
    expect(r.categoriasFuera).toEqual([]);
  });
  it("un estado raro se lee como borrador: nunca como una oferta que rige", () => {
    expect(regla({ estado: "algo-raro" }).estado).toBe("borrador");
  });
});

describe("en qué punto está una oferta", () => {
  const v = (estado: ReglaCampana["estado"], desde: string, hasta: string) => vigenciaDeRegla({ estado, desde, hasta }, HOY);
  it("un borrador sigue siendo borrador, salvo que ya terminó", () => {
    expect(v("borrador", "2026-10-23", "2026-10-31")).toBe("borrador");
    expect(v("borrador", "2026-10-01", "2026-10-22")).toBe("terminada");
  });
  it("una activa: programada, vigente o terminada según hoy", () => {
    expect(v("activa", "2026-10-24", "2026-10-31")).toBe("programada");
    expect(v("activa", "2026-10-23", "2026-10-31")).toBe("vigente");
    expect(v("activa", "2026-10-01", "2026-10-23")).toBe("vigente");
    expect(v("activa", "2026-10-01", "2026-10-22")).toBe("terminada");
  });
  it("una retirada es retirada, aunque sus fechas rijan", () => {
    expect(v("desactivada", "2026-10-23", "2026-10-31")).toBe("retirada");
  });
  it("las vivas son las que todavía cuentan para el pase", () => {
    const rs = [regla({ id: "a" }), regla({ id: "b", estado: "desactivada" }), regla({ id: "c", hasta: "2026-10-20", desde: "2026-10-10" }), regla({ id: "d", estado: "borrador" })];
    expect(reglasVivas(rs, HOY).map((r) => r.id)).toEqual(["a", "d"]);
  });
  it("se ordenan: vigentes, programadas, borradores, terminadas y retiradas", () => {
    const rs = [
      regla({ id: "retirada", estado: "desactivada" }),
      regla({ id: "terminada", desde: "2026-10-01", hasta: "2026-10-10" }),
      regla({ id: "borrador", estado: "borrador" }),
      regla({ id: "programada", desde: "2026-10-28", hasta: "2026-10-31" }),
      regla({ id: "vigente" }),
    ];
    expect(ordenarReglas(rs, HOY).map((r) => r.id)).toEqual(["vigente", "programada", "borrador", "terminada", "retirada"]);
  });
});

describe("el nombre y la frase", () => {
  it("el nombre automático sigue lo elegido", () => {
    expect(nombreAutomatico({ porcentaje: 20, dias: [1, 2, 3, 4, 5, 6, 7], categoriasSolo: [] }, nombreCat)).toBe("Toda la campaña · −20 %");
    expect(nombreAutomatico({ porcentaje: 30, dias: [2, 4], categoriasSolo: [] }, nombreCat)).toBe("Toda la campaña · −30 % · mar y jue");
    expect(nombreAutomatico({ porcentaje: 15, dias: [6, 7], categoriasSolo: [BLUSAS, FALDAS] }, nombreCat)).toBe("Blusas y Faldas · −15 % · fin de semana");
  });
  it("con muchas categorías dice cuántas son, no las nombra todas", () => {
    const ids = ["a", "b", "c", "d"];
    const nom = (id: string) => ({ a: "Blusas", b: "Faldas", c: "Polos", d: "Tops" })[id] ?? "";
    expect(alcanceDicho({ categoriasSolo: ["b", "a"] }, nom)).toBe("Blusas y Faldas");
    expect(alcanceDicho({ categoriasSolo: ["a", "b", "c"] }, nom)).toBe("Blusas, Faldas y Polos");
    expect(alcanceDicho({ categoriasSolo: ids }, nom)).toBe("4 categorías");
    expect(nombreAutomatico({ porcentaje: 20, dias: [1, 2, 3, 4, 5, 6, 7], categoriasSolo: ids }, nom)).toBe("4 categorías · −20 %");
    expect(fraseDeOferta({ ...ofertaNueva("2026-10-26", "2026-10-31"), categoriasSolo: ids }, nom)).toContain("solo en 4 categorías");
  });
  it("nunca pasa de 80 letras (lo que pide la base)", () => {
    const largo = Array.from({ length: 30 }, () => BLUSAS);
    expect(nombreAutomatico({ porcentaje: 20, dias: [2], categoriasSolo: largo }, nombreCat).length).toBeLessThanOrEqual(80);
  });
  it("lo que la persona escribe gana al automático", () => {
    const o = { ...ofertaNueva("2026-10-26", "2026-10-31"), nombre: "  Martes de blusas " };
    expect(nombreDeOferta(o, nombreCat)).toBe("Martes de blusas");
    expect(nombreDeOferta({ ...o, nombre: "" }, nombreCat)).toBe("Toda la campaña · −20 %");
  });
  it("un nombre guardado que es el automático se vuelve a armar solo al editarla", () => {
    const r = regla({ nombre: "Toda la campaña · −20 %" });
    expect(esNombreAutomatico(r, nombreCat)).toBe(true);
    expect(ofertaDesdeRegla(r, esNombreAutomatico(r, nombreCat)).nombre).toBe("");
    const a_mano = regla({ nombre: "Martes de blusas" });
    expect(ofertaDesdeRegla(a_mano, esNombreAutomatico(a_mano, nombreCat)).nombre).toBe("Martes de blusas");
  });
  it("la frase dice qué prendas, qué días y cuándo", () => {
    const o = { ...ofertaNueva("2026-10-26", "2026-10-31"), dias: [2, 4], porcentaje: 30 };
    expect(fraseDeOferta(o, nombreCat)).toBe("30 % menos en todas las prendas de la campaña, los martes y jueves, del 26 oct al 31 oct.");
    expect(fraseDeOferta({ ...o, categoriasSolo: [BLUSAS], dias: [1, 2, 3, 4, 5, 6, 7] }, nombreCat)).toContain("solo en Blusas");
    expect(fraseDeOferta({ ...o, categoriasFuera: [FALDAS], incluyeClaure: true }, nombreCat)).toContain("(menos faldas), con las prendas de Claurè");
  });
});

describe("validar antes de ir a la base", () => {
  const ctx = { campanaDesde: "2026-10-01", campanaHasta: "2026-10-31", hoy: HOY };
  const buena = { ...ofertaNueva("2026-10-26", "2026-10-31"), dias: [2, 4] };
  it("una oferta bien armada no tiene problemas", () => {
    expect(problemasDeOferta(buena, ctx)).toEqual([]);
    expect(problemasDeOferta(ofertaNueva("2026-10-23", "2026-10-31"), ctx)).toEqual([]);
  });
  it("el % va de 1 al tope", () => {
    expect(problemasDeOferta({ ...buena, porcentaje: 0 }, ctx)).toHaveLength(1);
    expect(problemasDeOferta({ ...buena, porcentaje: PORCENTAJE_MAX + 1 }, ctx)).toHaveLength(1);
    expect(problemasDeOferta({ ...buena, porcentaje: PORCENTAJE_MAX }, ctx)).toEqual([]);
    expect(problemasDeOferta({ ...buena, porcentaje: Number.NaN }, ctx)).toHaveLength(1);
  });
  it("no empieza antes de hoy, salvo que sea la edición de una que no mueve sus fechas", () => {
    const pasada = { ...buena, desde: "2026-10-10", hasta: "2026-10-31" };
    expect(problemasDeOferta(pasada, ctx)).toContain("La oferta no puede empezar antes de hoy.");
    expect(problemasDeOferta(pasada, { ...ctx, original: { desde: "2026-10-10", hasta: "2026-10-31" } })).toEqual([]);
    expect(problemasDeOferta(pasada, { ...ctx, original: { desde: "2026-10-12", hasta: "2026-10-31" } })).toContain("La oferta no puede empezar antes de hoy.");
  });
  it("cabe dentro de la campaña", () => {
    expect(problemasDeOferta({ ...buena, hasta: "2026-11-05" }, ctx)[0]).toMatch(/dentro de las de la campaña/);
    expect(problemasDeOferta({ ...buena, hasta: "2026-11-05" }, { ...ctx, campanaDesde: null, campanaHasta: null })).toEqual([]);
  });
  it("el fin no puede ser antes del inicio", () => {
    expect(problemasDeOferta({ ...buena, desde: "2026-10-30", hasta: "2026-10-28" }, ctx)).toContain("El inicio no puede ser posterior al fin.");
  });
  it("sin fechas pide las fechas y no sigue", () => {
    expect(problemasDeOferta({ ...buena, desde: "" }, ctx)).toEqual(["Pon cuándo empieza y cuándo termina."]);
  });
  it("al menos un día, y que alguno caiga: de viernes a domingo no hay martes ni jueves", () => {
    expect(problemasDeOferta({ ...buena, dias: [] }, ctx)).toContain("Elige al menos un día de la semana.");
    const nunca = problemasDeOferta({ ...ofertaNueva("2026-10-23", "2026-10-25"), dias: [2, 4] }, ctx);
    expect(nunca).toHaveLength(1);
    expect(nunca[0]).toMatch(/no regiría nunca/);
    expect(problemasDeOferta({ ...ofertaNueva("2026-10-23", "2026-10-25"), dias: [5, 6] }, ctx)).toEqual([]);
  });
  it("una categoría no está a la vez en «solo» y en «fuera»", () => {
    expect(problemasDeOferta({ ...buena, categoriasSolo: [BLUSAS], categoriasFuera: [BLUSAS] }, ctx)).toHaveLength(1);
    expect(problemasDeOferta({ ...buena, categoriasSolo: [BLUSAS], categoriasFuera: [FALDAS] }, ctx)).toEqual([]);
  });
});

describe("el cuerpo que manda la hoja a la API", () => {
  const bueno = {
    id: null,
    etiquetaId: CAMPANA,
    nombre: " Toda la campaña · −20 % ",
    porcentaje: 20,
    desde: "2026-10-26",
    hasta: "2026-10-31",
    dias: [4, 2],
    categoriasSolo: [BLUSAS],
    categoriasFuera: [],
    incluyeClaure: false,
    activar: true,
  };
  it("lo bueno pasa, con el nombre limpio y los días en orden", () => {
    const r = leerCuerpoOferta(bueno);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valor.nombre).toBe("Toda la campaña · −20 %");
      expect(r.valor.dias).toEqual([2, 4]);
      expect(r.valor.id).toBeNull();
      expect(r.valor.activar).toBe(true);
    }
  });
  it("solo un true explícito activa", () => {
    const r = leerCuerpoOferta({ ...bueno, activar: "true" });
    expect(r.ok && r.valor.activar).toBe(false);
  });
  it.each([
    ["sin cuerpo", null],
    ["sin campaña", { ...bueno, etiquetaId: "x" }],
    ["id raro", { ...bueno, id: "no-es-uuid" }],
    ["sin nombre", { ...bueno, nombre: "   " }],
    ["% que no es número", { ...bueno, porcentaje: "20" }],
    ["fecha que no existe", { ...bueno, desde: "2026-02-30" }],
    ["fecha con otro formato", { ...bueno, hasta: "31/10/2026" }],
    ["día fuera de 1 a 7", { ...bueno, dias: [0, 2] }],
    ["días que no son lista", { ...bueno, dias: "2,4" }],
    ["categoría que no es uuid", { ...bueno, categoriasSolo: ["blusas"] }],
  ])("lo malo se rechaza: %s", (_nombre, cuerpo) => {
    expect(leerCuerpoOferta(cuerpo).ok).toBe(false);
  });
  it("los modelos elegidos uno por uno viajan sin repetir y con su tope (ADR-0655)", () => {
    const r = leerCuerpoOferta({ ...bueno, productosSolo: [ID, ID, CAMPANA], teniaModelos: true });
    expect(r.ok && r.valor.productosSolo).toEqual([ID, CAMPANA]);
    expect(r.ok && r.valor.teniaModelos).toBe(true);
    expect(leerCuerpoOferta(bueno).ok && (leerCuerpoOferta(bueno) as { valor: { productosSolo: string[]; teniaModelos: boolean } }).valor).toMatchObject({ productosSolo: [], teniaModelos: false });
    expect(leerCuerpoOferta({ ...bueno, productosSolo: ["polo"] }).ok).toBe(false);
    expect(leerCuerpoOferta({ ...bueno, productosSolo: Array.from({ length: MAX_PRODUCTOS_SOLO + 1 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`) }).ok).toBe(false);
  });
  it("con id y sin categorías es una edición", () => {
    const r = leerCuerpoOferta({ ...bueno, id: ID, categoriasSolo: undefined });
    expect(r.ok && r.valor.id).toBe(ID);
    expect(r.ok && r.valor.categoriasSolo).toEqual([]);
  });
});

describe("ata con la migración", () => {
  const migracion = readFileSync(join(__dirname, "../../../supabase/migrations/20261023232000_campana_reglas_de_precio.sql"), "utf8");
  it("el tope del % es el de la tabla", () => {
    expect(migracion).toContain(`porcentaje > 0 and porcentaje <= ${PORCENTAJE_MAX}`);
    expect(migracion).toContain(`de 1 a ${PORCENTAJE_MAX} %%`);
  });
  it("los pasos del % caben en el tope", () => {
    expect(PORCENTAJE_MIN % PORCENTAJE_PASO).toBe(0);
    expect(PORCENTAJE_MAX % PORCENTAJE_PASO).toBe(0);
    for (const p of PORCENTAJES_RAPIDOS) {
      expect(p).toBeGreaterThanOrEqual(PORCENTAJE_MIN);
      expect(p).toBeLessThanOrEqual(PORCENTAJE_MAX);
    }
  });
  it("los días son los siete de la base (1 lunes … 7 domingo)", () => {
    expect([...DIAS_SEMANA]).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(migracion).toContain("array[1, 2, 3, 4, 5, 6, 7]::smallint[]");
  });
  it("los estados son los de la tabla", () => {
    expect(migracion).toContain("estado in ('borrador', 'activa', 'desactivada')");
  });
});

describe("atajos de fechas", () => {
  // 2026-10-23 es viernes.
  it("ofrece los que caben en la campaña y no repite fechas", () => {
    const a = atajosDeFechas("2026-10-23", "2026-10-25", "2026-10-23");
    expect(a.map((x) => x.texto)).toEqual(["Toda la campaña", "Fin de semana"]);
    expect(a[1]).toMatchObject({ desde: "2026-10-24", hasta: "2026-10-25" });
  });
  it("sin tope de campaña usa 7 días y el fin de mes", () => {
    const a = atajosDeFechas("2026-10-26", null, "2026-10-23");
    expect(a.find((x) => x.texto === "7 días")).toMatchObject({ desde: "2026-10-26", hasta: "2026-11-01" });
    expect(a.find((x) => x.texto === "Hasta fin de mes")).toMatchObject({ hasta: "2026-10-31" });
  });
  it("un sábado, el fin de semana empieza ese mismo día; un domingo, es solo ese día", () => {
    expect(atajosDeFechas("2026-10-24", "2026-10-31", "2026-10-24").find((x) => x.texto === "Fin de semana")).toMatchObject({ desde: "2026-10-24", hasta: "2026-10-25" });
    expect(atajosDeFechas("2026-10-25", "2026-10-31", "2026-10-25").find((x) => x.texto === "Fin de semana")).toMatchObject({ desde: "2026-10-25", hasta: "2026-10-25" });
  });
  it("nunca ofrece fechas fuera de la campaña", () => {
    for (const a of atajosDeFechas("2026-10-23", "2026-10-28", "2026-10-23")) expect(a.hasta <= "2026-10-28" && a.desde >= "2026-10-23").toBe(true);
  });
});

describe("una prenda, una oferta por tienda y por día", () => {
  const fila = (f: Partial<FilaChoque>): FilaChoque => ({ otra_tipo: "oferta", otra_id: "o1", otra_nombre: "Polos 3x2", campana_nombre: "Verano", ubicacion_id: "t", ubicacion_nombre: "Tienda Trujillo", prendas: 4, cedida: false, ...f });
  it("junta las tiendas de la misma oferta, sin «Tienda» y en orden", () => {
    const c = choquesDeFilas([fila({}), fila({ ubicacion_id: "l", ubicacion_nombre: "Tienda Lima" })], []);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ tipo: "oferta", tiendas: ["Lima", "Trujillo"], prendas: 4, deCampana: "Verano", estaCede: false });
    expect(tituloDeChoque(c[0])).toBe("Choca con «Polos 3x2» (de Verano) en Lima y Trujillo");
  });
  it("el descuento de siempre va primero y no se resuelve cediendo", () => {
    const c = choquesDeFilas([fila({}), fila({ otra_tipo: "descuento", otra_id: "i1", otra_nombre: "Rotación", campana_nombre: "Rotación" })], []);
    expect(c.map((x) => x.tipo)).toEqual(["descuento", "oferta"]);
    expect(c[0].deCampana).toBeNull();
    expect(choqueResuelto(c[0], ["i1"])).toBe(false);
    expect(fraseDeChoque(c[0])).toContain("Retíralo");
  });
  it("«que la otra ceda» lo resuelve; sin elegirlo, sigue faltando", () => {
    const c = choquesDeFilas([fila({})], []);
    expect(choquesSinResolver(c, [])).toHaveLength(1);
    expect(choquesSinResolver(c, ["o1"])).toHaveLength(0);
  });
  it("una cesión guardada se lee en su sentido: si la otra le cedía a esta, es una elección que se puede quitar; si esta le cede, ya está resuelto", () => {
    const leCedian = choquesDeFilas([fila({ cedida: true })], ["o1"]);
    expect(leCedian[0]).toMatchObject({ cedidaGuardada: true, estaCede: false });
    expect(choquesSinResolver(leCedian, [])).toHaveLength(1);
    const estaCede = choquesDeFilas([fila({ cedida: true })], []);
    expect(estaCede[0].estaCede).toBe(true);
    expect(choquesSinResolver(estaCede, [])).toHaveLength(0);
    expect(fraseDeChoque(estaCede[0])).toContain("vale «Polos 3x2»");
  });
  it("al guardar solo viajan las cesiones que siguen haciendo falta", () => {
    const c = choquesDeFilas([fila({})], []);
    expect(cesionesQueQuedan(c, ["o1", "ya-no-choca"])).toEqual(["o1"]);
  });
  it("una prenda o varias se dice bien", () => {
    expect(fraseDeChoque(choquesDeFilas([fila({ prendas: 1 })], [])[0])).toMatch(/^1 prenda tendría/);
  });
});

describe("antes: …", () => {
  it("dice el % las fechas y los días", () => {
    expect(resumenAntes({ porcentaje: 15, desde: "2026-10-24", hasta: "2026-10-31", dias_semana: [2, 4] })).toBe("−15 % · 24 oct – 31 oct · mar y jue");
  });
  it("sin días sueltos o sin datos, no inventa", () => {
    expect(resumenAntes({ porcentaje: 20, desde: "2026-10-24", hasta: "2026-10-31", dias_semana: [1, 2, 3, 4, 5, 6, 7] })).toBe("−20 % · 24 oct – 31 oct");
    expect(resumenAntes(null)).toBe("");
    expect(resumenAntes({})).toBe("");
  });
});

describe("el orden en que se eligen las categorías no cambia el nombre", () => {
  const nombres: Record<string, string> = { a: "Faldas", b: "Casacas" };
  const nom = (id: string) => nombres[id] ?? "";
  it("la misma selección da el mismo nombre y la misma frase", () => {
    const x = { porcentaje: 20, dias: [1, 2, 3, 4, 5, 6, 7], categoriasSolo: ["a", "b"] };
    const y = { ...x, categoriasSolo: ["b", "a"] };
    expect(nombreAutomatico(x, nom)).toBe(nombreAutomatico(y, nom));
    expect(nombreAutomatico(x, nom)).toBe("Casacas y Faldas · −20 %");
  });
});

describe("las tiendas de una oferta", () => {
  const sede = (id: string) => ({ t: "Tienda Trujillo", l: "Tienda Lima" })[id as "t" | "l"] ?? "";
  const cat = (id: string) => ({ a: "Faldas", b: "Casacas" })[id as "a" | "b"] ?? "";
  it("las nombra sin «Tienda» y en orden alfabético", () => {
    expect(nombresDeTiendas(["t", "l"], sede)).toEqual(["Lima", "Trujillo"]);
  });
  it("entran al nombre automático y a la frase, y sin tiendas no dicen nada", () => {
    const base = { porcentaje: 20, dias: [1, 2, 3, 4, 5, 6, 7], categoriasSolo: ["a"] };
    expect(nombreAutomatico({ ...base, sedeIds: ["t"] }, cat, sede)).toBe("Faldas · −20 % · Trujillo");
    expect(nombreAutomatico({ ...base, sedeIds: [] }, cat, sede)).toBe("Faldas · −20 %");
    const o = { ...ofertaNueva("2026-10-26", "2026-10-31"), sedeIds: ["t"] };
    expect(fraseDeOferta(o, cat, sede)).toContain("solo en Trujillo");
    expect(fraseDeOferta({ ...o, sedeIds: [] }, cat, sede)).not.toContain("solo en");
  });
  it("un nombre automático con tiendas sigue siendo automático al volver a abrirla", () => {
    const r = regla({ nombre: "Faldas · −20 % · Trujillo", porcentaje: 20, dias_semana: [1, 2, 3, 4, 5, 6, 7], categorias_solo: ["a"], sedes: ["t"] });
    expect(esNombreAutomatico(r, cat, sede)).toBe(true);
    expect(r.sedeIds).toEqual(["t"]);
  });
  it("el cuerpo trae las tiendas y rechaza lo que no es un id", () => {
    const bueno = { etiquetaId: ID, nombre: "x", porcentaje: 10, desde: "2026-10-26", hasta: "2026-10-31", dias: [1], sedeIds: [ID] };
    expect(leerCuerpoOferta(bueno)).toMatchObject({ ok: true, valor: { sedeIds: [ID] } });
    expect(leerCuerpoOferta({ ...bueno, sedeIds: undefined })).toMatchObject({ ok: true, valor: { sedeIds: [] } });
    expect(leerCuerpoOferta({ ...bueno, sedeIds: ["no"] }).ok).toBe(false);
  });
});

describe("cuántas prendas alcanza una oferta", () => {
  const prendas = [
    { id: "1", categoriaId: "blusas" },
    { id: "2", categoriaId: "blusas", deClaure: true },
    { id: "3", categoriaId: "faldas" },
    { id: "4", categoriaId: null },
  ];
  const todas = { categoriasSolo: [] as string[], categoriasFuera: [] as string[], incluyeClaure: false };
  it("cuenta solo las prendas de la campaña que se le pasan, por categoría, sin las de Claurè", () => {
    // La campaña solo trae 3 blusas de las muchas del catálogo: eso es lo que se cuenta, no la categoría entera.
    expect(Object.fromEntries(contarPorCategoria(prendas, false))).toEqual({ blusas: 1, faldas: 1 });
    expect(Object.fromEntries(contarPorCategoria(prendas, true))).toEqual({ blusas: 2, faldas: 1 });
  });
  it("una categoría toda de Claurè sigue en la lista, con 0", () => {
    expect(contarPorCategoria([{ id: "x", categoriaId: "c", deClaure: true }], false).get("c")).toBe(0);
  });
  it("las alcanzadas siguen «solo», «dejar fuera» y Claurè", () => {
    expect(prendasQueAlcanza(prendas, prendas, todas).map((p) => p.id)).toEqual(["1", "3", "4"]);
    expect(prendasQueAlcanza(prendas, prendas, { ...todas, incluyeClaure: true }).map((p) => p.id)).toEqual(["1", "2", "3", "4"]);
    expect(prendasQueAlcanza(prendas, prendas, { ...todas, categoriasSolo: ["blusas"] }).map((p) => p.id)).toEqual(["1"]);
    expect(prendasQueAlcanza(prendas, prendas, { ...todas, categoriasFuera: ["faldas"] }).map((p) => p.id)).toEqual(["1", "4"]);
  });
  it("con «solo estas categorías» rige en ellas aunque la campaña no las tenga; sin ellas, solo en la campaña", () => {
    const campana = [{ id: "1", categoriaId: "blusas" }];
    const catalogo = [...campana, { id: "9", categoriaId: "casacas" }, { id: "10", categoriaId: "casacas" }];
    expect(prendasQueAlcanza(campana, catalogo, todas).map((p) => p.id)).toEqual(["1"]);
    expect(prendasQueAlcanza(campana, catalogo, { ...todas, categoriasSolo: ["casacas"] }).map((p) => p.id)).toEqual(["9", "10"]);
    expect(prendasQueAlcanza(campana, catalogo, { ...todas, categoriasSolo: ["casacas", "blusas"] }).map((p) => p.id)).toEqual(["1", "9", "10"]);
  });
  it("prenda por prenda: los modelos elegidos se suman a «solo estas categorías» y ya no rige en toda la campaña (como fn_campanas_en_sede)", () => {
    const campana = [{ id: "1", categoriaId: "blusas", productoId: "emma" }];
    const catalogo = [...campana, { id: "9", categoriaId: "casacas", productoId: "nube" }, { id: "10", categoriaId: "polos", productoId: "brisa" }];
    expect(prendasQueAlcanza(campana, catalogo, { ...todas, productosSolo: ["nube"] }).map((p) => p.id)).toEqual(["9"]);
    expect(prendasQueAlcanza(campana, catalogo, { ...todas, categoriasSolo: ["blusas"], productosSolo: ["brisa"] }).map((p) => p.id)).toEqual(["1", "10"]);
    expect(prendasQueAlcanza(campana, catalogo, { ...todas, productosSolo: ["nube"], categoriasFuera: ["casacas"] }).map((p) => p.id)).toEqual([]);
  });
  it("dónde rige, dicho una vez: categorías, prendas elegidas, las dos o toda la campaña", () => {
    const nom = (id: string) => ({ blusas: "Blusas", polos: "Polos" })[id] ?? "";
    expect(alcanceDicho({ categoriasSolo: [], productosSolo: [] }, nom)).toBeNull();
    expect(alcanceDicho({ categoriasSolo: ["blusas"] }, nom)).toBe("Blusas");
    expect(alcanceDicho({ categoriasSolo: [], productosSolo: ["a"] }, nom)).toBe("1 prenda elegida");
    expect(alcanceDicho({ categoriasSolo: ["polos"], productosSolo: ["a", "b"] }, nom)).toBe("Polos y 2 prendas elegidas");
    expect(alcanceDicho({ categoriasSolo: ["polos", "blusas"], productosSolo: ["a"] }, nom)).toBe("Blusas, Polos y 1 prenda elegida");
  });
  it("el conteo de cada categoría y el de «solo esa categoría» dicen lo mismo", () => {
    const cuenta = contarPorCategoria(prendas, false);
    for (const [cat, n] of cuenta) expect(contarPrendas(prendasQueAlcanza(prendas, prendas, { ...todas, categoriasSolo: [cat] }))).toBe(n);
  });
  it("una prenda es un modelo en su color: sus tallas cuentan una vez, como en el pase de la campaña", () => {
    const tallas = [
      { id: "s", categoriaId: "blusas", modelo: "emma-rojo" },
      { id: "m", categoriaId: "blusas", modelo: "emma-rojo" },
      { id: "l", categoriaId: "blusas", modelo: "emma-rojo" },
      { id: "u", categoriaId: "blusas", modelo: "emma-azul" },
      { id: "c", categoriaId: "faldas", modelo: "lola-negro", deClaure: true },
    ];
    expect(contarPrendas(tallas)).toBe(3);
    expect(contarPrendas([])).toBe(0);
    // Sin `modelo`, cada fila es una prenda (una base que no lo trae no se rompe).
    expect(contarPrendas([{ id: "a" }, { id: "b" }])).toBe(2);
    expect(Object.fromEntries(contarPorCategoria(tallas, false))).toEqual({ blusas: 2, faldas: 0 });
    expect(Object.fromEntries(contarPorCategoria(tallas, true))).toEqual({ blusas: 2, faldas: 1 });
  });
});

describe("lo que dice un monto (ADR-0655, actividad 8)", () => {
  it("«S/ 30 menos desde S/ 300» o «10 % menos desde S/ 300»; un monto, por su primer escalón", () => {
    expect(textoDeEscalon({ ahorra: 30 }, "soles")).toBe("S/\u00a030.00 menos");
    expect(textoDeEscalon({ ahorra: 12.5 }, "pct")).toBe("12,5 % menos");
    expect(titularDeEscalon({ desde: 300, ahorra: 30 }, "soles")).toBe("S/\u00a030.00 menos desde S/\u00a0300.00");
    expect(titularDeMonto([{ desde: 300, ahorra: 10 }, { desde: 500, ahorra: 15 }], "pct")).toBe("10 % menos desde S/\u00a0300.00");
    expect(titularDeMonto([], "soles")).toBe("Por monto");
  });
});

describe("la hoja con un monto (ADR-0655, actividad 8)", () => {
  const nom = (id: string) => ({ c1: "Blusas" })[id] ?? "";
  const monto = (o: Partial<ReturnType<typeof ofertaNueva>> = {}) => ({ ...ofertaNueva("2026-10-26", "2026-10-31"), ...FORMA_DE_FABRICA.monto, ...o });
  it("lo que impide guardarlo: los mismos límites que la base (fn_escalones_validos)", () => {
    expect(problemasDeMonto([{ desde: 300, ahorra: 30 }], "soles")).toEqual([]);
    expect(problemasDeMonto([], "soles")[0]).toMatch(/de 1 a 3 escalones/);
    expect(problemasDeMonto([{ desde: 300, ahorra: 0 }], "soles")[0]).toBe("Pon desde cuánto y cuánto ahorra.");
    expect(problemasDeMonto([{ desde: 100, ahorra: 100 }], "soles")[0]).toBe("El ahorro tiene que ser menor que el monto.");
    expect(problemasDeMonto([{ desde: 300, ahorra: 80 }], "pct")[0]).toBe(`El ahorro va de 1 a ${PORCENTAJE_MAX} %.`);
    expect(problemasDeMonto([{ desde: 300, ahorra: 30 }, { desde: 300, ahorra: 40 }], "soles")[0]).toMatch(/desde más y ahorra más/);
    expect(problemasDeMonto([{ desde: 300.005, ahorra: 30 }], "soles")[0]).toMatch(/céntimos/);
    expect(problemasDeForma(monto())).toEqual([]);
  });
  it("cómo se dice: la frase, el nombre automático y el titular", () => {
    const escalones = [{ desde: 300, ahorra: 30 }, { desde: 500, ahorra: 60 }];
    expect(fraseDeOferta(monto({ escalones }), nom)).toBe(
      "S/\u00a030.00 menos desde S/\u00a0300.00, S/\u00a060.00 menos desde S/\u00a0500.00 en toda la compra, del 26 oct al 31 oct.",
    );
    expect(fraseDeOferta(monto({ cuenta: "campana", categoriasSolo: ["c1"], cedeAOtras: true }), nom)).toBe(
      "S/\u00a030.00 menos desde S/\u00a0300.00 comprando Blusas, sin contar las prendas que ya tienen otra oferta, del 26 oct al 31 oct.",
    );
    expect(nombreAutomatico(monto(), nom)).toBe("Toda la compra · S/\u00a030.00 menos desde S/\u00a0300.00");
  });
  it("de la base a la hoja y de la hoja a la ruta", () => {
    const r = regla({ tipo: "monto", porcentaje: null, lleva: null, paga: null, escalones: [{ desde: "300", ahorra: "30" }], ahorro_en: "pct", cuenta: "campana", cede_a_otras: true });
    expect(r).toMatchObject({ tipo: "monto", escalones: [{ desde: 300, ahorra: 30 }], ahorroEn: "pct", cuenta: "campana", cedeAOtras: true });
    expect(ofertaDesdeRegla(r, true)).toMatchObject({ tipo: "monto", escalones: [{ desde: 300, ahorra: 30 }], cuenta: "campana", cedeAOtras: true });
    const cuerpo = {
      etiquetaId: "00000000-0000-4000-8000-000000000001", nombre: "Monto", porcentaje: 0, desde: "2026-10-26", hasta: "2026-10-31", dias: [1, 2, 3, 4, 5, 6, 7],
      forma: { tipo: "monto", escalones: [{ desde: 300, ahorra: 30 }], ahorroEn: "soles", cuenta: "compra", cedeAOtras: true },
    };
    const ok = leerCuerpoOferta(cuerpo);
    expect(ok.ok && ok.valor.forma).toMatchObject({ tipo: "monto", escalones: [{ desde: 300, ahorra: 30 }], ahorroEn: "soles", cuenta: "compra", cedeAOtras: true });
    expect(leerCuerpoOferta({ ...cuerpo, forma: { ...cuerpo.forma, escalones: [{ desde: 100, ahorra: 100 }] } }).ok).toBe(false);
  });
  it("toda la compra alcanza a todo el catálogo, salvo Claurè si no la incluye", () => {
    const catalogo = [{ id: "a", categoriaId: "c1" }, { id: "b", categoriaId: "c2" }, { id: "k", categoriaId: "c2", deClaure: true }];
    expect(prendasQueAlcanza([], catalogo, { ...monto() }).map((p) => p.id)).toEqual(["a", "b"]);
    expect(prendasQueAlcanza([], catalogo, { ...monto({ incluyeClaure: true }) }).map((p) => p.id)).toEqual(["a", "b", "k"]);
  });
  it("los choques: «que no cuenten» resuelve todo salvo otro monto, y avisa si la otra tiene todas las prendas", () => {
    const fila = (f: Partial<FilaChoque>): FilaChoque => ({ otra_tipo: "oferta", otra_id: "o1", otra_nombre: "Top", campana_nombre: "Top", ubicacion_id: "t", ubicacion_nombre: "Tienda Lima", prendas: 4, cedida: false, otra_es_monto: false, mias: 10, ...f });
    const c = choquesDeFilas([fila({}), fila({ otra_id: "o2", otra_nombre: "Otro monto", otra_es_monto: true }), fila({ otra_tipo: "descuento", otra_id: "d1", otra_nombre: "Siempre", prendas: 10 })], []);
    const [rebaja, otroMonto, todo] = ["o1", "o2", "d1"].map((id) => c.find((x) => x.id === id)!);
    expect([rebaja.esMonto, otroMonto.esMonto, todo.todaLaTienda, rebaja.todaLaTienda]).toEqual([false, true, true, false]);
    expect(choqueResuelto(rebaja, [], true)).toBe(true);
    expect(choqueResuelto(todo, [], true)).toBe(true);
    expect(choqueResuelto(otroMonto, [], true)).toBe(false);
    expect(choquesSinResolver([rebaja, otroMonto, todo], [], true).map((x) => x.id)).toEqual(["o2"]);
    expect(choquesSinResolver([rebaja], [], false)).toHaveLength(1);
  });
});

describe("por insignia (ADR-0655)", () => {
  const ROTACION = "55555555-5555-4555-8555-555555555555";
  const ARTESANAL = "66666666-6666-4666-8666-666666666666";
  const nom = (id: string) => ({ [BLUSAS]: "Blusas", [FALDAS]: "Faldas", [ROTACION]: "Rotación", [ARTESANAL]: "Artesanal" })[id] ?? "";
  it("de la base a la hoja, y sin la migración ninguna", () => {
    const r = regla({ insignias: [ROTACION] });
    expect(r.insigniasSolo).toEqual([ROTACION]);
    expect(ofertaDesdeRegla(r, true).insigniasSolo).toEqual([ROTACION]);
    expect(regla().insigniasSolo).toEqual([]);
    expect(ofertaNueva("2026-10-26", "2026-10-31").insigniasSolo).toEqual([]);
  });
  it("se dicen con su nombre: una, varias o cuántas", () => {
    expect(insigniasDichas([ROTACION], nom)).toBe("la insignia Rotación");
    expect(insigniasDichas([ROTACION, ARTESANAL], nom)).toBe("las insignias Artesanal y Rotación");
    expect(insigniasDichas([ROTACION, ARTESANAL, BLUSAS, FALDAS], nom)).toBe("4 insignias");
    expect(insigniasDichas([], nom)).toBeNull();
    expect(alcanceDicho({ categoriasSolo: [BLUSAS], insigniasSolo: [ROTACION] }, nom)).toBe("Blusas y la insignia Rotación");
  });
  it("el nombre empieza en mayúscula y la frase dice dónde rige", () => {
    const o = { ...ofertaNueva("2026-10-26", "2026-10-31"), insigniasSolo: [ROTACION] };
    expect(nombreAutomatico(o, nom)).toBe("La insignia Rotación · −20 %");
    expect(fraseDeOferta(o, nom)).toBe("20 % menos solo en la insignia Rotación, del 26 oct al 31 oct.");
    expect(esNombreAutomatico(regla({ nombre: "La insignia Rotación · −20 %", insignias: [ROTACION] }), nom)).toBe(true);
  });
  it("alcanza las prendas que la llevan (a mano o por su categoría), sumadas a categorías y modelos, sin lo que deja fuera", () => {
    const catalogo = [
      { id: "a", categoriaId: BLUSAS, insignias: [ROTACION] },
      { id: "b", categoriaId: FALDAS },
      { id: "c", categoriaId: FALDAS, insignias: [ARTESANAL] },
      { id: "k", categoriaId: BLUSAS, insignias: [ROTACION], deClaure: true },
      { id: "p", categoriaId: null, productoId: "prod" },
    ];
    const campana = [catalogo[1]];
    const o = { categoriasSolo: [] as string[], categoriasFuera: [] as string[], incluyeClaure: false, insigniasSolo: [ROTACION] };
    // Con una insignia y nada más, rige solo en ella: no en las de la campaña.
    expect(prendasQueAlcanza(campana, catalogo, o).map((p) => p.id)).toEqual(["a"]);
    expect(prendasQueAlcanza(campana, catalogo, { ...o, incluyeClaure: true }).map((p) => p.id)).toEqual(["a", "k"]);
    expect(prendasQueAlcanza(campana, catalogo, { ...o, insigniasSolo: [ROTACION, ARTESANAL] }).map((p) => p.id)).toEqual(["a", "c"]);
    expect(prendasQueAlcanza(campana, catalogo, { ...o, productosSolo: ["prod"] }).map((p) => p.id)).toEqual(["a", "p"]);
    expect(prendasQueAlcanza(campana, catalogo, { ...o, categoriasFuera: [BLUSAS] }).map((p) => p.id)).toEqual([]);
    // Sin insignias, lo de siempre: las de la campaña.
    expect(prendasQueAlcanza(campana, catalogo, { ...o, insigniasSolo: [] }).map((p) => p.id)).toEqual(["b"]);
    // Un monto de toda la compra no mira las insignias.
    expect(prendasQueAlcanza(campana, catalogo, { ...o, tipo: "monto", cuenta: "compra" }).map((p) => p.id)).toEqual(["a", "b", "c", "p"]);
  });
  it("viajan a la ruta sin repetir, con su tope y si las tenía", () => {
    const cuerpo = { etiquetaId: CAMPANA, nombre: "Rotación", porcentaje: 20, desde: "2026-10-26", hasta: "2026-10-31", dias: [1, 2, 3, 4, 5, 6, 7] };
    const r = leerCuerpoOferta({ ...cuerpo, insigniasSolo: [ROTACION, ROTACION], teniaInsignias: true });
    expect(r.ok && r.valor).toMatchObject({ insigniasSolo: [ROTACION], teniaInsignias: true });
    expect(leerCuerpoOferta(cuerpo).ok && (leerCuerpoOferta(cuerpo) as { valor: { insigniasSolo: string[]; teniaInsignias: boolean } }).valor).toMatchObject({ insigniasSolo: [], teniaInsignias: false });
    expect(leerCuerpoOferta({ ...cuerpo, insigniasSolo: ["rotacion"] }).ok).toBe(false);
    const muchas = Array.from({ length: MAX_INSIGNIAS_SOLO + 1 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    expect(leerCuerpoOferta({ ...cuerpo, insigniasSolo: muchas }).ok).toBe(false);
  });
  it("el tope es el de la base", () => {
    const migracion = readFileSync(join(__dirname, "../../../supabase/migrations/20261114060000_ofertas_por_insignia.sql"), "utf8");
    expect(migracion).toContain(`cardinality(v_insignias) > ${MAX_INSIGNIAS_SOLO}`);
    expect(migracion).toContain(`hasta ${MAX_INSIGNIAS_SOLO} insignias`);
  });
});
