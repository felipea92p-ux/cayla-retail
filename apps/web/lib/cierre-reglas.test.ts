import { describe, expect, it } from "vitest";
import {
  avisosPendientes,
  bajadaUnidad,
  claveUnidad,
  deUnidad,
  deUnidadLarga,
  diaDe,
  enlaceChequeo,
  enumerar,
  estadoConsolidado,
  estadoTarjeta,
  historiaDe,
  huellaCorta,
  leerPanelCierre,
  primerNombre,
  puedeCerrar,
  textoBotonCerrar,
  textoChequeo,
  textoOpcionMes,
  tituloPantalla,
  tituloUnidad,
  unidadInicial,
  validarMotivo,
  type Chequeo,
  type Unidad,
} from "./cierre-reglas";

// La forma que devuelve `fn_cierre_panel` (20260925180000), sacada de la base local: agosto de 2026 con Trujillo cerrada,
// Lima con un depósito sin clasificar, el Taller listo y la empresa con un banco sin conciliar.
const HUELLA = "d6aa0f74fc5b2445e7ffb3db5fa087e1a86e1259b32d93218e94b12dfecb41bf";
const TRU = "f775651f-62c8-4ff4-a414-b5614026d0cd";
const LIM = "2d97d322-8a0a-4cd5-99c4-70e52b9c01db";
const RESPUESTA = {
  mes: "2026-08",
  mes_actual: "2026-09",
  meses: [
    { mes: "2026-08", cerradas: 1, consolidado: false },
    { mes: "2026-07", cerradas: 0, consolidado: false },
  ],
  historia: [
    { alcance: "ubicacion", ubicacion_id: TRU, version: 1, cerrado_en: "2026-09-25T01:11:30.876463+00:00", cerrado_por: "Felipe Alvarez", huella: HUELLA, lineas: 2, reabierto_en: null, reabierto_por: null, motivo_reapertura: null, avisos: [] },
  ],
  unidades: [
    {
      alcance: "ubicacion", ubicacion_id: LIM, nombre: "Tienda Lima", tipo: "tienda", estado: "abierto", cierre: null, bloqueantes: 1, avisos: 0,
      chequeos: [
        { clave: "cajas", ok: true, bloquea: true, datos: { desde: null, abiertas: 0, cerradas: 1 } },
        { clave: "egresos", ok: false, bloquea: true, datos: { n: 1, fecha: "2026-08-31", monto: 2300, monto1: 2300, motivo: "Depósito bancario" } },
        { clave: "diario", ok: true, bloquea: true, datos: { lineas: 3, ejemplo: null, asientos: 1, descuadrados: 0 } },
      ],
    },
    {
      alcance: "ubicacion", ubicacion_id: TRU, nombre: "Tienda Trujillo", tipo: "tienda", estado: "cerrado", bloqueantes: 0, avisos: 0,
      cierre: { id: "05e0", version: 1, cerrado_en: "2026-09-25T01:11:30.876463+00:00", cerrado_por: "Felipe Alvarez", huella: HUELLA, lineas: 2, reabierto_en: null, reabierto_por: null, motivo_reapertura: null, avisos: [] },
      chequeos: [{ clave: "diario", ok: true, bloquea: true, datos: { lineas: 2, asientos: 1, descuadrados: 0 } }, { clave: "huella", ok: true, bloquea: false, datos: {} }],
    },
    { alcance: "ubicacion", ubicacion_id: "tal", nombre: "Taller", tipo: "taller", estado: "abierto", cierre: null, bloqueantes: 0, avisos: 0, chequeos: [{ clave: "diario", ok: true, bloquea: true, datos: { lineas: 0, asientos: 0 } }] },
    {
      alcance: "empresa", ubicacion_id: null, nombre: "De la empresa", tipo: "empresa", estado: "abierto", cierre: null, bloqueantes: 0, avisos: 1,
      chequeos: [
        { clave: "conciliacion", ok: false, bloquea: false, datos: { bancos: 1, faltan: [{ nombre: "BCP · Cta. corriente", ultima: null }] } },
        { clave: "diario", ok: true, bloquea: true, datos: { lineas: 0, asientos: 0 } },
      ],
    },
    { alcance: "consolidado", ubicacion_id: null, nombre: "CAYLA entera", tipo: "consolidado", estado: "abierto", cierre: null, bloqueantes: 3, avisos: 0, chequeos: [] },
  ],
};
const panel = leerPanelCierre(RESPUESTA)!;
const unidad = (nombre: string) => panel.unidades.find((u) => u.nombre === nombre)!;
const ch = (clave: string, ok: boolean, datos: Record<string, unknown>, bloquea = true): Chequeo => ({ clave, ok, bloquea, datos });

describe("leer lo que devuelve la base", () => {
  it("separa las unidades del consolidado y respeta el orden", () => {
    expect(panel.mes).toBe("2026-08");
    expect(panel.mesActual).toBe("2026-09");
    expect(panel.unidades.map((u) => u.nombre)).toEqual(["Tienda Lima", "Tienda Trujillo", "Taller", "De la empresa"]);
    expect(panel.consolidado.alcance).toBe("consolidado");
    expect(panel.consolidado.bloqueantes).toBe(3);
  });
  it("la clave de una unidad es su ubicación, «empresa» o «consolidado»", () => {
    expect(unidad("Tienda Lima").clave).toBe(LIM);
    expect(unidad("De la empresa").clave).toBe("empresa");
    expect(panel.consolidado.clave).toBe("consolidado");
    expect(claveUnidad("empresa", null)).toBe("empresa");
  });
  it("lee el cierre (y un «reabierto por» vacío como nulo)", () => {
    const tru = unidad("Tienda Trujillo");
    expect(tru.estado).toBe("cerrado");
    expect(tru.cierre?.huella).toBe(HUELLA);
    expect(tru.cierre?.reabiertoPor).toBeNull();
    expect(leerPanelCierre({ ...RESPUESTA, unidades: [{ ...RESPUESTA.unidades[1], cierre: { ...RESPUESTA.unidades[1]!.cierre, reabierto_por: "" } }, RESPUESTA.unidades[4]] })?.unidades[0]?.cierre?.reabiertoPor).toBeNull();
  });
  it("una respuesta sin consolidado o sin mes no se dibuja", () => {
    expect(leerPanelCierre(null)).toBeNull();
    expect(leerPanelCierre({ ...RESPUESTA, unidades: RESPUESTA.unidades.slice(0, 4) })).toBeNull();
    expect(leerPanelCierre({ ...RESPUESTA, mes: undefined })).toBeNull();
  });
});

describe("palabras", () => {
  it("el título y el botón, como el spike", () => {
    expect(tituloPantalla("2026-08")).toBe("Cerrar agosto 2026");
    expect(textoBotonCerrar("2026-08", { alcance: "ubicacion", nombre: "Tienda LIM", tipo: "tienda" })).toBe("Cerrar agosto de LIM");
    expect(textoBotonCerrar("2026-08", { alcance: "ubicacion", nombre: "Taller", tipo: "taller" })).toBe("Cerrar agosto del Taller");
    expect(textoBotonCerrar("2026-08", { alcance: "empresa", nombre: "De la empresa", tipo: "empresa" })).toBe("Cerrar agosto de la empresa");
    expect(deUnidad({ alcance: "consolidado", nombre: "CAYLA entera", tipo: "consolidado" })).toBe("de CAYLA entera");
    // En el título de la hoja, el nombre entero (spike: «Reabrir agosto 2026 de Tienda TRU»).
    expect(deUnidadLarga({ alcance: "ubicacion", nombre: "Tienda TRU", tipo: "tienda" })).toBe("de Tienda TRU");
    expect(deUnidadLarga({ alcance: "ubicacion", nombre: "Taller", tipo: "taller" })).toBe("del Taller");
    expect(deUnidadLarga({ alcance: "empresa", nombre: "De la empresa", tipo: "empresa" })).toBe("de la empresa");
    expect(tituloUnidad("2026-08", { nombre: "Tienda LIM" })).toBe("Tienda LIM · agosto 2026");
  });
  it("la huella corta, el primer nombre y el día de Lima de un instante", () => {
    expect(huellaCorta(HUELLA)).toBe("d6aa…41bf");
    expect(huellaCorta(null)).toBe("");
    expect(primerNombre("Felipe Alvarez")).toBe("Felipe");
    // 01:11 UTC del 25 = 20:11 del 24 en Lima.
    expect(diaDe("2026-09-25T01:11:30.876463+00:00")).toBe("2026-09-24");
  });
  it("«a, b y c»", () => {
    expect(enumerar([])).toBe("");
    expect(enumerar(["Alquiler"])).toBe("Alquiler");
    expect(enumerar(["Alquiler", "Luz", "Internet"])).toBe("Alquiler, Luz y Internet");
  });
  it("lo que dice el bloque bajo su título: quién cerró, quién reabrió y por qué, o qué se revisa", () => {
    expect(bajadaUnidad(unidad("Tienda Trujillo"))).toBe("Cerrado el 24 sep por Felipe Alvarez.");
    expect(bajadaUnidad(unidad("Tienda Lima"))).toBe("Lo que el sistema revisa antes de dejarte cerrar.");
    const reabierta: Unidad = {
      ...unidad("Tienda Trujillo"),
      estado: "reabierto",
      cierre: { ...unidad("Tienda Trujillo").cierre!, reabiertoEn: "2026-09-26T15:00:00Z", reabiertoPor: "Felipe Alvarez", motivoReapertura: "llegó una factura tarde" },
    };
    expect(bajadaUnidad(reabierta)).toBe("Reabierto el 26 sep por Felipe Alvarez: «llegó una factura tarde». Lo que el sistema revisa antes de dejarte cerrar.");
  });
  it("el selector de mes dice cuántas unidades cerraron o si CAYLA entera ya cerró", () => {
    expect(textoOpcionMes({ mes: "2026-07", cerradas: 0, consolidado: false })).toBe("Julio 2026");
    expect(textoOpcionMes({ mes: "2026-08", cerradas: 1, consolidado: false })).toBe("Agosto 2026 · 1 cerrada");
    expect(textoOpcionMes({ mes: "2026-08", cerradas: 3, consolidado: false })).toBe("Agosto 2026 · 3 cerradas");
    expect(textoOpcionMes({ mes: "2026-06", cerradas: 5, consolidado: true })).toBe("Junio 2026 · cerrado");
  });
});

describe("cada chequeo en palabras", () => {
  const mes = "2026-08";
  it("cajas: cuántos cierres hubo, o cuál falta cerrar", () => {
    expect(textoChequeo(ch("cajas", true, { abiertas: 0, cerradas: 31 }), mes)).toEqual({ titulo: "Cajas del mes cerradas", detalle: "31 cierres de caja en agosto, ninguna abierta" });
    expect(textoChequeo(ch("cajas", true, { abiertas: 0, cerradas: 0 }), mes).detalle).toBe("Ninguna caja de agosto quedó abierta");
    expect(textoChequeo(ch("cajas", false, { abiertas: 1, desde: "2026-08-31" }), mes).detalle).toBe("Falta cerrar la caja abierta el 31 ago");
    expect(textoChequeo(ch("cajas", false, { abiertas: 2, desde: "2026-08-30" }), mes).detalle).toBe("Faltan cerrar 2 cajas (la primera, abierta el 30 ago)");
  });
  it("egresos: la frase del spike («Falta 1: «Depósito bancario» del 31 ago por S/ 2,300»)", () => {
    expect(textoChequeo(unidad("Tienda Lima").chequeos[1]!, mes)).toEqual({ titulo: "Egresos de caja clasificados", detalle: "Falta 1: «Depósito bancario» del 31 ago por S/ 2,300" });
    expect(textoChequeo(ch("egresos", false, { n: 3, monto: 2512.5, motivo: "Otro", fecha: "2026-08-20" }), mes).detalle).toBe("Faltan 3, por S/ 2,512.50 (el último, «Otro» del 20 ago)");
    expect(textoChequeo(ch("egresos", true, { n: 0 }), mes).detalle).toBe("Todos dicen si son gasto, depósito o retiro");
  });
  it("regularizar, fijos y prendas sin costo", () => {
    expect(textoChequeo(ch("regularizar", false, { n: 2 }), mes).detalle).toBe("2 prendas vendidas sin código: después de cerrar ya no se podrían regularizar");
    expect(textoChequeo(ch("fijos", false, { total: 3, faltan: 1, cuales: ["Alquiler TRU"] }, false), mes).detalle).toBe("Falta Alquiler TRU. Si ese mes no correspondía, puedes cerrar igual");
    expect(textoChequeo(ch("fijos", false, { total: 3, faltan: 2, cuales: ["Luz", "Internet"] }, false), mes).detalle).toBe("Faltan 2: Luz y Internet. Si ese mes no correspondía, puedes cerrar igual");
    expect(textoChequeo(ch("fijos", true, { total: 3, faltan: 0 }, false), mes).detalle).toBe("Los 3 gastos fijos del mes están registrados");
    expect(textoChequeo(ch("sin_costo", false, { n: 1 }, false), mes).detalle).toBe("1 prenda vendida sin costo cargado: el margen del mes sale inflado");
  });
  it("conciliación: qué banco falta y desde cuándo", () => {
    expect(textoChequeo(unidad("De la empresa").chequeos[0]!, mes).detalle).toBe("BCP · Cta. corriente: nunca se concilió");
    expect(textoChequeo(ch("conciliacion", false, { bancos: 2, faltan: [{ nombre: "Interbank", ultima: "2026-08-29" }] }, false), mes).detalle).toBe("Interbank: la última conciliación es del 29 ago");
    expect(textoChequeo(ch("conciliacion", true, { bancos: 0, faltan: [] }, false), mes).detalle).toBe("Todavía no hay bancos en Cuentas y dinero");
    expect(textoChequeo(ch("conciliacion", true, { bancos: 2, faltan: [] }, false), mes).detalle).toBe("Los 2 bancos están conciliados al fin de mes o después");
  });
  it("planilla: sin verla en Dynamic no se cierra; si la ve, el período o el aviso", () => {
    expect(textoChequeo(ch("planilla", false, { visible: false }), mes).detalle).toMatch(/^Tu cuenta no ve la planilla en Dynamic/);
    expect(textoChequeo(ch("planilla", true, { visible: true, ini: "2026-07-29", fin: "2026-08-28", personas: 12 }, false), mes).detalle).toBe("Del 29 jul al 28 ago · 12 personas");
    expect(textoChequeo(ch("planilla", false, { visible: true, ini: null }, false), mes).detalle).toMatch(/^Dynamic todavía no tiene pagada la planilla que termina en agosto/);
  });
  it("diario y huella", () => {
    expect(textoChequeo(ch("diario", true, { asientos: 12, lineas: 40 }), mes).detalle).toBe("Debe = haber en los 12 asientos (40 líneas)");
    expect(textoChequeo(ch("diario", true, { asientos: 1, lineas: 3 }), mes).detalle).toBe("Debe = haber en su único asiento (3 líneas)");
    expect(textoChequeo(ch("diario", true, { asientos: 0, lineas: 0 }), mes).detalle).toBe("Sin movimientos en agosto");
    expect(textoChequeo(ch("diario", false, { descuadrados: 1 }), mes).detalle).toMatch(/^1 asiento descuadrado/);
    expect(textoChequeo(ch("huella", false, {}, false), mes).titulo).toBe("Lo congelado sigue igual al diario de hoy");
    expect(textoChequeo(ch("huella", false, {}, false), mes).detalle).toMatch(/ya no da la misma huella/);
  });
});

describe("a dónde lleva «Resolver»", () => {
  const lim = unidad("Tienda Lima");
  const emp = unidad("De la empresa");
  it("cada chequeo que falla, a su pantalla, con la unidad y el mes", () => {
    expect(enlaceChequeo(ch("cajas", false, {}), lim, "2026-08")).toBe("/caja");
    expect(enlaceChequeo(ch("egresos", false, {}), lim, "2026-08")).toBe(`/finanzas/gastos?tab=egresos&ver=${LIM}`);
    expect(enlaceChequeo(ch("regularizar", false, {}), lim, "2026-08")).toBe("/recibir");
    expect(enlaceChequeo(ch("fijos", false, {}), emp, "2026-08")).toBe("/finanzas/gastos?tab=fijos&mes=2026-08&ver=empresa");
    expect(enlaceChequeo(ch("conciliacion", false, {}), emp, "2026-08")).toBe("/finanzas/dinero/conciliacion");
    expect(enlaceChequeo(ch("diario", false, {}), lim, "2026-08")).toBe(`/finanzas/reportes?mes=2026-08&ver=${LIM}`);
    expect(enlaceChequeo(ch("sin_costo", false, {}), emp, "2026-08")).toBe("/finanzas/reportes?mes=2026-08");
  });
  it("lo que pasa o no tiene pantalla (la planilla vive en Dynamic) no lleva a ningún lado", () => {
    expect(enlaceChequeo(ch("egresos", true, {}), lim, "2026-08")).toBeNull();
    expect(enlaceChequeo(ch("planilla", false, {}), lim, "2026-08")).toBeNull();
    expect(enlaceChequeo(ch("huella", false, {}), lim, "2026-08")).toBeNull();
  });
});

describe("estados", () => {
  it("la insignia de cada tarjeta: cerrado, N pendientes o lista para cerrar", () => {
    expect(estadoTarjeta(unidad("Tienda Trujillo"))).toEqual({ texto: "cerrado", tono: "verde" });
    expect(estadoTarjeta(unidad("Tienda Lima"))).toEqual({ texto: "1 pendiente", tono: "ambar" });
    expect(estadoTarjeta({ ...unidad("Tienda Lima"), bloqueantes: 2 })).toEqual({ texto: "2 pendientes", tono: "ambar" });
    expect(estadoTarjeta(unidad("Taller"))).toEqual({ texto: "lista para cerrar", tono: "pizarra" });
    // Un aviso no la vuelve «pendiente»: la empresa está lista aunque el banco no esté conciliado.
    expect(estadoTarjeta(unidad("De la empresa"))).toEqual({ texto: "lista para cerrar", tono: "pizarra" });
  });
  it("se cierra sin bloqueantes; los avisos quedan para el modal", () => {
    expect(puedeCerrar(unidad("Tienda Lima"))).toBe(false);
    expect(puedeCerrar(unidad("De la empresa"))).toBe(true);
    expect(puedeCerrar(unidad("Tienda Trujillo"))).toBe(false);
    expect(avisosPendientes(unidad("De la empresa")).map((c) => c.clave)).toEqual(["conciliacion"]);
    expect(avisosPendientes({ ...unidad("Tienda Trujillo"), chequeos: [ch("huella", false, {}, false)] })).toEqual([]);
  });
  it("CAYLA entera: faltan N, lista cuando cerraron todas, o cerrada", () => {
    expect(estadoConsolidado(panel)).toEqual({ estado: "faltan", faltan: 3 });
    const todas = panel.unidades.map((u) => ({ ...u, estado: "cerrado" as const }));
    expect(estadoConsolidado({ ...panel, unidades: todas })).toEqual({ estado: "listo", faltan: 0 });
    expect(estadoConsolidado({ unidades: todas, consolidado: { ...panel.consolidado, estado: "cerrado" } })).toEqual({ estado: "cerrado", faltan: 0 });
    // Reabierta no cuenta como cerrada.
    expect(estadoConsolidado({ ...panel, unidades: todas.map((u, i) => (i === 0 ? { ...u, estado: "reabierto" as const } : u)) })).toEqual({ estado: "faltan", faltan: 1 });
  });
  it("la unidad que se abre al entrar: la pedida, la primera sin cerrar o la primera", () => {
    expect(unidadInicial(panel.unidades, TRU)).toBe(TRU);
    expect(unidadInicial(panel.unidades, "no-existe")).toBe(LIM);
    expect(unidadInicial(panel.unidades.slice(1))).toBe("tal");
    expect(unidadInicial([unidad("Tienda Trujillo")])).toBe(TRU);
    expect(unidadInicial([])).toBeNull();
  });
  it("el motivo de reabrir: obligatorio, al menos 5 letras", () => {
    expect(validarMotivo("")).not.toBeNull();
    expect(validarMotivo("   abc  ")).not.toBeNull();
    expect(validarMotivo("llegó una factura tarde")).toBeNull();
  });
});

describe("la historia de una unidad", () => {
  it("cierres y reaperturas en orden, con quién y por qué", () => {
    const historia = [
      { ...panel.historia[0]!, reabiertoEn: "2026-09-26T15:00:00Z", reabiertoPor: "Felipe Alvarez", motivoReapertura: "llegó una factura tarde" },
      { ...panel.historia[0]!, version: 2, cerradoEn: "2026-09-27T15:00:00Z", huella: "a91f000000000000000000000000000000000000000000000000000000003c0e" },
      { ...panel.historia[0]!, alcance: "empresa" as const, ubicacionId: null },
    ];
    expect(historiaDe({ historia }, { alcance: "ubicacion", ubicacionId: TRU })).toEqual([
      "24 sep · Felipe cerró · d6aa…41bf",
      "26 sep · Felipe reabrió: «llegó una factura tarde»",
      "27 sep · Felipe cerró (versión 2) · a91f…3c0e",
    ]);
    expect(historiaDe({ historia }, { alcance: "empresa", ubicacionId: null })).toHaveLength(1);
    expect(historiaDe(panel, { alcance: "ubicacion", ubicacionId: LIM })).toEqual([]);
  });
});
