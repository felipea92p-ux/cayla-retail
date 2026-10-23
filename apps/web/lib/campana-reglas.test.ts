import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  contarPorCategoria,
  prendasQueAlcanza,
  nombresDeTiendas,
  algunDiaCae,
  atajosDeFechas,
  reglasQueSeCruzan,
  resumenAntes,
  cuentaDias,
  DIAS_SEMANA,
  diaDeSemanaIso,
  diasQueCaen,
  esNombreAutomatico,
  fraseDeOferta,
  leerCuerpoOferta,
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
  it("un borrador espera a un líder, salvo que ya terminó", () => {
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
  it("con id y sin categorías es una edición", () => {
    const r = leerCuerpoOferta({ ...bueno, id: ID, categoriasSolo: undefined });
    expect(r.ok && r.valor.id).toBe(ID);
    expect(r.ok && r.valor.categoriasSolo).toEqual([]);
  });
});

describe("ata con la migración", () => {
  const migracion = readFileSync(join(__dirname, "../../../supabase/migrations/20261023190000_campana_reglas_de_precio.sql"), "utf8");
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

describe("cruces entre ofertas", () => {
  const base = (r: Partial<ReglaCampana>): ReglaCampana => ({ ...reglaDeFila({ id: "r", etiqueta_id: "e", nombre: "x", tipo: "pct", porcentaje: 10, desde: "2026-10-26", hasta: "2026-10-31", dias_semana: [1, 2, 3, 4, 5, 6, 7], incluye_claure: false, estado: "activa", categorias_solo: [], categorias_fuera: [], creada_en: "2026-10-23", activada_en: null, cambios: 0, ultimo_cambio: null }), ...r });
  const o = { id: null, desde: "2026-10-27", hasta: "2026-10-30", dias: [2, 4], categoriasSolo: [] as string[], sedeIds: [] as string[] };
  it("se cruza con una que pisa fechas, días y prendas", () => {
    expect(reglasQueSeCruzan(o, [base({ id: "a" })], "2026-10-23").map((r) => r.id)).toEqual(["a"]);
  });
  it("no se cruza si no comparten ningún día de la semana", () => {
    expect(reglasQueSeCruzan(o, [base({ id: "a", dias: [6, 7] })], "2026-10-23")).toEqual([]);
  });
  it("no se cruza si las fechas no se tocan, ni con una retirada o terminada", () => {
    expect(reglasQueSeCruzan(o, [base({ id: "a", desde: "2026-11-02", hasta: "2026-11-05" })], "2026-10-23")).toEqual([]);
    expect(reglasQueSeCruzan(o, [base({ id: "a", estado: "desactivada" })], "2026-10-23")).toEqual([]);
    expect(reglasQueSeCruzan(o, [base({ id: "a", desde: "2026-10-01", hasta: "2026-10-05" })], "2026-10-23")).toEqual([]);
  });
  it("categorías distintas no se cruzan; «toda la campaña» se cruza con todo; ella misma no cuenta", () => {
    expect(reglasQueSeCruzan({ ...o, categoriasSolo: ["blusas"] }, [base({ id: "a", categoriasSolo: ["polos"] })], "2026-10-23")).toEqual([]);
    expect(reglasQueSeCruzan({ ...o, categoriasSolo: ["blusas"] }, [base({ id: "a" })], "2026-10-23")).toHaveLength(1);
    expect(reglasQueSeCruzan({ ...o, id: "a" }, [base({ id: "a" })], "2026-10-23")).toEqual([]);
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
  it("dos ofertas de tiendas distintas no se cruzan; sin tiendas se cruzan con todas", () => {
    const otra = regla({ id: "o1", sedes: ["l"] });
    const mia = { id: null, desde: otra.desde, hasta: otra.hasta, dias: [...otra.dias], categoriasSolo: [] as string[], sedeIds: ["t"] };
    expect(reglasQueSeCruzan(mia, [otra], "2026-10-23")).toEqual([]);
    expect(reglasQueSeCruzan({ ...mia, sedeIds: [] }, [otra], "2026-10-23")).toHaveLength(1);
    expect(reglasQueSeCruzan({ ...mia, sedeIds: ["l"] }, [otra], "2026-10-23")).toHaveLength(1);
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
    expect(prendasQueAlcanza(prendas, todas).map((p) => p.id)).toEqual(["1", "3", "4"]);
    expect(prendasQueAlcanza(prendas, { ...todas, incluyeClaure: true }).map((p) => p.id)).toEqual(["1", "2", "3", "4"]);
    expect(prendasQueAlcanza(prendas, { ...todas, categoriasSolo: ["blusas"] }).map((p) => p.id)).toEqual(["1"]);
    expect(prendasQueAlcanza(prendas, { ...todas, categoriasFuera: ["faldas"] }).map((p) => p.id)).toEqual(["1", "4"]);
  });
  it("el conteo de cada categoría y el de «solo esa categoría» dicen lo mismo", () => {
    const cuenta = contarPorCategoria(prendas, false);
    for (const [cat, n] of cuenta) expect(prendasQueAlcanza(prendas, { ...todas, categoriasSolo: [cat] })).toHaveLength(n);
  });
});
