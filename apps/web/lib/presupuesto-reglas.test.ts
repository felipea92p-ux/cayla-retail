import { describe, expect, it } from "vitest";
import {
  cambiosDePropuesta,
  chipPpto,
  claveCelda,
  leerConfigPpto,
  leerFilaPpto,
  leerPropuesta,
  lotePropuesta,
  mesesParaPresupuestar,
  parsearTope,
  pctPpto,
  textoOrigen,
  textoTope,
  type FilaPpto,
} from "./presupuesto-reglas";

const TRU = "u-tru";
const LIM = "u-lim";
const TAL = "u-tal";

// Filas como las devuelve `fn_presupuesto_vs_real` (los numeric viajan como texto), el 10 de marzo (día 10 de 31).
const cruda = (x: Record<string, unknown>) => ({
  momento: "en_curso",
  dia: 10,
  dias: 31,
  se_pasa: false,
  fijo: null,
  ...x,
});
const FILAS: FilaPpto[] = [
  cruda({ ubicacion_id: LIM, unidad: "tienda", nombre: "Tienda Lima", orden: 1, linea: "ventas", linea_nombre: "Ventas", tipo: "meta", orden_linea: 0, presupuesto: null, a_la_fecha: "1000", proyeccion: "3100", avance: null, estado: "sin_meta" }),
  cruda({ ubicacion_id: TRU, unidad: "tienda", nombre: "Tienda Trujillo", orden: 1, linea: "636", linea_nombre: "Servicios básicos", tipo: "tope", orden_linea: 2, presupuesto: "650.00", a_la_fecha: "100", proyeccion: "818.47", fijo: "508.47", avance: "1.2592", se_pasa: true, estado: "se_pasa" }),
  cruda({ ubicacion_id: TRU, unidad: "tienda", nombre: "Tienda Trujillo", orden: 1, linea: "ventas", linea_nombre: "Ventas", tipo: "meta", orden_linea: 0, presupuesto: "36000.00", a_la_fecha: "9000", proyeccion: "32400", avance: "0.9", estado: "bajo_meta" }),
  cruda({ ubicacion_id: TRU, unidad: "tienda", nombre: "Tienda Trujillo", orden: 1, linea: "635", linea_nombre: "Alquileres", tipo: "tope", orden_linea: 1, presupuesto: "4500", a_la_fecha: "4500", proyeccion: "4500", fijo: "4500", avance: "1", estado: "dentro" }),
  cruda({ ubicacion_id: TRU, unidad: "tienda", nombre: "Tienda Trujillo", orden: 1, linea: "631", linea_nombre: "Transporte y movilidad", tipo: "tope", orden_linea: 3, presupuesto: null, a_la_fecha: "50", proyeccion: "155", avance: null, estado: "sin_tope" }),
  cruda({ ubicacion_id: TAL, unidad: "taller", nombre: "Taller", orden: 2, linea: "635", linea_nombre: "Alquileres", tipo: "tope", orden_linea: 1, presupuesto: "1800", a_la_fecha: "0", proyeccion: "1800", fijo: "1800", avance: "1", estado: "dentro" }),
  cruda({ ubicacion_id: null, unidad: "empresa", nombre: "De la empresa", orden: 3, linea: "637", linea_nombre: "Publicidad y marketing", tipo: "tope", orden_linea: 6, presupuesto: "2500", a_la_fecha: "1000", proyeccion: "3100", avance: "1.24", se_pasa: true, estado: "se_pasa" }),
  cruda({ ubicacion_id: null, unidad: "consolidado", nombre: "CAYLA", orden: 4, linea: "ventas", linea_nombre: "Ventas", tipo: "meta", orden_linea: 0, presupuesto: "36000", a_la_fecha: "10000", proyeccion: "35500", avance: "0.9861", estado: "en_camino" }),
  cruda({ ubicacion_id: null, unidad: "consolidado", nombre: "CAYLA", orden: 4, linea: "637", linea_nombre: "Publicidad y marketing", tipo: "tope", orden_linea: 6, presupuesto: "2500", a_la_fecha: "1000", proyeccion: "3100", avance: "1.24", se_pasa: true, estado: "se_pasa" }),
].map(leerFilaPpto);

describe("leerFilaPpto", () => {
  it("convierte los numeric que viajan como texto y respeta los nulos", () => {
    const f = FILAS.find((x) => x.ubicacionId === TRU && x.linea === "636")!;
    expect(f).toMatchObject({ presupuesto: 650, aLaFecha: 100, proyeccion: 818.47, fijo: 508.47, avance: 1.2592, sePasa: true, estado: "se_pasa", tipo: "tope" });
    const lim = FILAS.find((x) => x.ubicacionId === LIM)!;
    expect(lim.presupuesto).toBeNull();
    expect(lim.avance).toBeNull();
  });
  it("un valor desconocido cae en algo seguro", () => {
    const f = leerFilaPpto({ unidad: "rara", estado: "raro", momento: "raro", tipo: "otro" });
    expect(f).toMatchObject({ unidad: "tienda", estado: "dentro", momento: "en_curso", tipo: "tope", presupuesto: null, proyeccion: null });
  });
});

describe("cómo se escribe", () => {
  it("el chip de cada estado, como el spike", () => {
    expect(chipPpto({ estado: "se_pasa", avance: 1.188, momento: "en_curso" })).toEqual({ texto: "te pasas 18,8 %", tono: "rojo" });
    expect(chipPpto({ estado: "se_pasa", avance: 1.24, momento: "cerrado" }).texto).toBe("te pasaste 24,0 %");
    expect(chipPpto({ estado: "al_filo", avance: 1.03, momento: "en_curso" })).toEqual({ texto: "al filo", tono: "ambar" });
    expect(chipPpto({ estado: "dentro", avance: 0.5, momento: "en_curso" })).toEqual({ texto: "dentro del tope", tono: "verde" });
    expect(chipPpto({ estado: "en_camino", avance: 0.99, momento: "en_curso" })).toEqual({ texto: "en camino", tono: "verde" });
    expect(chipPpto({ estado: "bajo_meta", avance: 0.9, momento: "en_curso" })).toEqual({ texto: "bajo la meta", tono: "ambar" });
    expect(chipPpto({ estado: "cumplida", avance: 1.1, momento: "cerrado" }).texto).toBe("meta cumplida");
    expect(chipPpto({ estado: "sin_meta", avance: null, momento: "en_curso" }).tono).toBe("pizarra");
    expect(chipPpto({ estado: "por_empezar", avance: null, momento: "por_venir" }).texto).toBe("por empezar");
  });
  it("el porcentaje lleva coma decimal", () => {
    expect(pctPpto(0.188)).toBe("18,8 %");
  });
});

describe("Configuración ▸ Presupuesto", () => {
  const DATOS = leerConfigPpto({
    mes: "2026-09-01",
    unidades: [
      { id: TRU, nombre: "Tienda Trujillo", unidad: "tienda", meta_ventas: "46016.95" },
      { id: TAL, nombre: "Taller", unidad: "taller", meta_ventas: null },
      { id: null, nombre: "De la empresa", unidad: "empresa", meta_ventas: null },
    ],
    lineas: [{ cuenta: "635", nombre: "Alquileres", ejemplos: "Alquiler del local" }],
    montos: [
      { ubicacion_id: TRU, cuenta: "635", monto: "4500.00" },
      { ubicacion_id: null, cuenta: "637", monto: 2500 },
      { ubicacion_id: TAL, cuenta: "635", monto: null },
    ],
    anterior: 3,
  });
  it("lee el mes, las unidades con su meta (sin IGV) y cada casilla por su llave", () => {
    expect(DATOS.mes).toBe("2026-09");
    expect(DATOS.unidades.map((u) => u.unidad)).toEqual(["tienda", "taller", "empresa"]);
    expect(DATOS.unidades[0]!.metaVentas).toBe(46016.95);
    expect(DATOS.montos[claveCelda(TRU, "635")]).toBe(4500);
    expect(DATOS.montos[claveCelda(null, "637")]).toBe(2500);
    expect(DATOS.montos[claveCelda(TAL, "635")]).toBeUndefined();
    expect(DATOS.anterior).toBe(3);
  });
  it("una casilla: vacío o 0 es sin tope; «1,500» y «S/ 300» valen; negativo y letras no", () => {
    expect(parsearTope("")).toEqual({ ok: true, valor: null });
    expect(parsearTope("0")).toEqual({ ok: true, valor: null });
    expect(parsearTope("1,500")).toEqual({ ok: true, valor: 1500 });
    expect(parsearTope("S/ 300.50")).toEqual({ ok: true, valor: 300.5 });
    expect(parsearTope("-5").ok).toBe(false);
    expect(parsearTope("mucho").ok).toBe(false);
  });
  it("cómo se ve un tope en su casilla: sin separador, como el spike", () => {
    expect(textoTope(4500)).toBe("4500");
    expect(textoTope(300.5)).toBe("300.5");
    expect(textoTope(undefined)).toBe("");
  });
  it("los meses que se pueden presupuestar: dos atrás y tres adelante", () => {
    expect(mesesParaPresupuestar("2026-09-24")).toEqual(["2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"]);
    expect(mesesParaPresupuestar("2026-01-05")[0]).toBe("2025-11");
  });
});

describe("proponer", () => {
  const PROPUESTA = [
    { ubicacion_id: TRU, cuenta: "635", actual: "4500.00", propuesto: "4000.00" },
    { ubicacion_id: TRU, cuenta: "656", actual: "250", propuesto: "250" },
    { ubicacion_id: null, cuenta: "637", actual: null, propuesto: 340 },
  ].map(leerPropuesta);
  it("el botón dice de qué mes copia", () => {
    expect(textoOrigen("mes_anterior", "2026-09")).toBe("Copiar de agosto");
    expect(textoOrigen("mes_anterior", "2026-01")).toBe("Copiar de diciembre");
    expect(textoOrigen("promedio_3_meses", "2026-09")).toBe("Sugerir según los últimos 3 meses");
  });
  it("solo cuenta lo que cambia", () => {
    expect(cambiosDePropuesta(PROPUESTA).map((f) => f.cuenta)).toEqual(["635", "637"]);
  });
  it("lo que se manda a guardar es exactamente lo que se vio", () => {
    expect(lotePropuesta(PROPUESTA)).toEqual([
      { ubicacion_id: TRU, cuenta: "635", monto: 4000 },
      { ubicacion_id: null, cuenta: "637", monto: 340 },
    ]);
  });
});
