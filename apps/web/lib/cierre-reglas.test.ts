import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  avisosPendientes,
  bajadaUnidad,
  claveUnidad,
  deUnidad,
  deUnidadLarga,
  enlaceChequeo,
  enumerar,
  etiquetaEnlace,
  estadoConsolidado,
  estadoTarjeta,
  historiaDe,
  huellaCorta,
  leerPanelCierre,
  primerNombre,
  puedeCerrar,
  resumenAvisos,
  textoBotonCerrar,
  textoChequeo,
  textoOpcionMes,
  tituloPantalla,
  tituloUnidad,
  unidadInicial,
  validarMotivo,
  type Chequeo,
  type ClaveChequeo,
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
  it("la huella corta y el primer nombre", () => {
    expect(huellaCorta(HUELLA)).toBe("d6aa…41bf");
    expect(huellaCorta(null)).toBe("");
    expect(primerNombre("Felipe Alvarez")).toBe("Felipe");
  });
  it("«a, b y c»", () => {
    expect(enumerar([])).toBe("");
    expect(enumerar(["Alquiler"])).toBe("Alquiler");
    expect(enumerar(["Alquiler", "Luz", "Internet"])).toBe("Alquiler, Luz y Internet");
  });
  it("lo que dice el bloque bajo su título: quién cerró, quién reabrió y por qué, o qué se revisa", () => {
    // Cerró a las 01:11 UTC del 25 = las 20:11 del 24 en Lima: el día es el 24.
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
    expect(textoChequeo(unidad("Tienda Lima").chequeos[1]!, mes)).toEqual({ titulo: "Egresos de caja clasificados", detalle: "Falta 1: «Depósito bancario» del 31 ago por S/\u00a02,300" });
    expect(textoChequeo(ch("egresos", false, { n: 3, monto: 2512.5, motivo: "Otro", fecha: "2026-08-20" }), mes).detalle).toBe("Faltan 3, por S/\u00a02,512.50 (el último, «Otro» del 20 ago)");
    expect(textoChequeo(ch("egresos", true, { n: 0 }), mes).detalle).toBe("Todos dicen si son gasto, depósito o retiro");
  });
  it("regularizar, fijos y prendas sin costo", () => {
    expect(textoChequeo(ch("regularizar", false, { n: 2 }), mes).detalle).toBe("2 prendas vendidas sin código: después de cerrar ya no se podrían regularizar");
    expect(textoChequeo(ch("fijos", false, { total: 3, faltan: 1, cuales: ["Alquiler TRU"] }, false), mes).detalle).toBe("Falta Alquiler TRU. Si ese mes no correspondía, puedes cerrar igual");
    expect(textoChequeo(ch("fijos", false, { total: 3, faltan: 2, cuales: ["Luz", "Internet"] }, false), mes).detalle).toBe("Faltan 2: Luz y Internet. Si ese mes no correspondía, puedes cerrar igual");
    expect(textoChequeo(ch("fijos", true, { total: 3, faltan: 0 }, false), mes).detalle).toBe("Los 3 gastos fijos del mes están registrados");
    expect(textoChequeo(ch("sin_costo", false, { n: 1 }, false), mes).detalle).toBe("1 prenda vendida sin costo cargado: el margen del mes sale inflado");
  });
  it("ventas cerradas sin prenda (ADR-0337): cuántas, cuánto vendieron y que su costo es desconocido; avisa, no bloquea", () => {
    expect(textoChequeo(ch("cerrada_sin_prenda", false, { n: 2, monto: 150 }, false), mes)).toEqual({
      titulo: "Ventas cerradas sin prenda",
      detalle: "2 ventas sin registrar (S/\u00a0150) se cerraron sin prenda: su costo es desconocido y el margen de agosto sale más alto de lo real. Puedes cerrar igual",
    });
    expect(textoChequeo(ch("cerrada_sin_prenda", false, { n: 1, monto: 80.5 }, false), mes).detalle).toMatch(/^1 venta sin registrar \(S\/\u00a080\.50\) se cerró sin prenda: su costo es desconocido/);
    // El monto llega de la base como numérico con decimales («1170.80»): se lee como número.
    expect(textoChequeo(ch("cerrada_sin_prenda", false, { n: 26, monto: "1170.80" }, false), mes).detalle).toMatch(/^26 ventas sin registrar \(S\/\u00a01,170\.80\) se cerraron/);
    expect(textoChequeo(ch("cerrada_sin_prenda", true, {}, false), mes).detalle).toBe("Ninguna venta se cerró sin prenda");
  });
  it("envíos con faltantes sin resolver: cuántos, cuántas prendas y cuánto al costo, en qué sede; en octubre avisa y en noviembre frena", () => {
    const lim = unidad("Tienda Lima");
    const aviso = ch("envios_con_diferencia", false, { n: 2, unidades: 9, monto: 180 }, false);
    expect(textoChequeo(aviso, mes, lim)).toEqual({
      titulo: "Envíos recibidos sin faltantes por resolver",
      detalle: "2 envíos recibidos en Lima tienen faltantes sin resolver con el proveedor: 9 prendas (S/\u00a0180 al costo). Puedes cerrar agosto igual: el aviso queda guardado en el cierre",
    });
    const frena = ch("envios_con_diferencia", false, { n: 1, unidades: 1, monto: "20.50" }, true);
    expect(textoChequeo(frena, mes, lim).detalle).toBe(
      "1 envío recibido en Lima tiene faltantes sin resolver con el proveedor: 1 prenda (S/\u00a020.50 al costo). Resuélvelo en «Nos debe», en la ficha del proveedor para poder cerrar agosto"
    );
    expect(textoChequeo(ch("envios_con_diferencia", true, { n: 0, unidades: 0, monto: 0 }, false), mes, lim).detalle).toBe("Ningún envío recibido tiene faltantes sin resolver");
    // Sin unidad (quien llama no la tiene) la frase no inventa una sede.
    expect(textoChequeo(aviso, mes).detalle).toMatch(/^2 envíos recibidos tienen faltantes/);
  });
  it("conteos abiertos: cuál es, desde cuándo y en qué sede", () => {
    const tal = unidad("Taller");
    expect(textoChequeo(ch("conteos_abiertos", false, { n: 1, desde: "2026-08-20", numero: 17 }, false), mes, tal)).toEqual({
      titulo: "Conteos de inventario cerrados",
      detalle: "El conteo n.º 17 de inventario en el Taller sigue abierto desde el 20 ago. Puedes cerrar agosto igual: el aviso queda guardado en el cierre",
    });
    expect(textoChequeo(ch("conteos_abiertos", false, { n: 1, desde: "2026-08-20", numero: 17 }, true), mes, tal).detalle).toMatch(
      /sigue abierto desde el 20 ago\. Termínalo o anúlalo en Conteo para poder cerrar agosto$/
    );
    expect(textoChequeo(ch("conteos_abiertos", false, { n: 2, desde: null, numero: null }, true), mes).detalle).toBe(
      "2 conteos de inventario siguen abiertos. Termínalo o anúlalo en Conteo para poder cerrar agosto"
    );
    expect(textoChequeo(ch("conteos_abiertos", true, { n: 0 }, false), mes).detalle).toBe("Ningún conteo de inventario quedó abierto");
  });
  it("prendas de más de un traslado: cuántas esperan que un líder las revise", () => {
    const lim = unidad("Tienda Lima");
    expect(textoChequeo(ch("sobrantes_traslado", false, { n: 2, unidades: 5 }, true), mes, lim)).toEqual({
      titulo: "Prendas de más de traslados revisadas",
      detalle: "5 prendas de más de 2 traslados en Lima esperan que un líder decida de dónde salieron. Un líder las revisa en Traslados para poder cerrar agosto",
    });
    expect(textoChequeo(ch("sobrantes_traslado", false, { n: 1, unidades: 1 }, false), mes, lim).detalle).toMatch(/^1 prenda de más de 1 traslado en Lima espera que un líder/);
    expect(textoChequeo(ch("sobrantes_traslado", true, { n: 0, unidades: 0 }, false), mes, lim).detalle).toBe("Ninguna prenda de más de un traslado espera revisión");
  });
  it("facturas sin recibir: cuántas, cuántas prendas por llegar y por cuánto", () => {
    const lim = unidad("Tienda Lima");
    expect(textoChequeo(ch("facturas_sin_recibir", false, { n: 2, unidades: 16, monto: "1770.00" }, false), mes, lim)).toEqual({
      titulo: "Mercadería facturada ya recibida",
      detalle: "2 facturas de mercadería en Lima tienen prendas sin recibir: 16 prendas por llegar (facturas por S/\u00a01,770). Puedes cerrar agosto igual: el aviso queda guardado en el cierre",
    });
    expect(textoChequeo(ch("facturas_sin_recibir", false, { n: 1, unidades: 6, monto: 590 }, true), mes, lim).detalle).toBe(
      "1 factura de mercadería en Lima tiene prendas sin recibir: 6 prendas por llegar (factura por S/\u00a0590). Recíbelas en Recibir mercadería para poder cerrar agosto"
    );
    expect(textoChequeo(ch("facturas_sin_recibir", true, { n: 0 }, false), mes, lim).detalle).toBe("Toda la mercadería facturada llegó");
  });
  it("la sede se nombra según lo que es: tienda sin «Tienda», el Taller con artículo, la empresa; sin unidad, ninguna", () => {
    const aviso = ch("sobrantes_traslado", false, { n: 1, unidades: 1 }, false);
    const sede = (u?: Unidad) => textoChequeo(aviso, mes, u).detalle.match(/^1 prenda de más de 1 traslado(.*?) espera/)?.[1] ?? "?";
    expect(sede(unidad("Tienda Lima"))).toBe(" en Lima");
    expect(sede(unidad("Taller"))).toBe(" en el Taller");
    expect(sede(unidad("De la empresa"))).toBe(" en la empresa");
    expect(sede()).toBe("");
  });
  it("sin la plata de proveedores el `monto` llega nulo: la frase dice las prendas y calla la cifra, nunca «S/ 0»", () => {
    const lim = unidad("Tienda Lima");
    // Envíos: con la cifra, el costo; sin ella (cuenta con solo «Cierre de mes»), solo las prendas.
    const envios = (monto: unknown) => ch("envios_con_diferencia", false, { n: 2, unidades: 9, monto }, false);
    expect(textoChequeo(envios(180), mes, lim).detalle).toContain("9 prendas (S/\u00a0180 al costo). Puedes");
    const sinCostoEnvios = textoChequeo(envios(null), mes, lim).detalle;
    expect(sinCostoEnvios).toBe("2 envíos recibidos en Lima tienen faltantes sin resolver con el proveedor: 9 prendas. Puedes cerrar agosto igual: el aviso queda guardado en el cierre");
    expect(sinCostoEnvios).not.toMatch(/S\/|\(/);
    // Facturas: lo mismo con «facturas por S/ …».
    const facturas = (monto: unknown) => ch("facturas_sin_recibir", false, { n: 1, unidades: 50, monto }, true);
    expect(textoChequeo(facturas(9440), mes, lim).detalle).toContain("50 prendas por llegar (factura por S/\u00a09,440). Recíbelas");
    const sinTotal = textoChequeo(facturas(null), mes, lim).detalle;
    expect(sinTotal).toBe("1 factura de mercadería en Lima tiene prendas sin recibir: 50 prendas por llegar. Recíbelas en Recibir mercadería para poder cerrar agosto");
    expect(sinTotal).not.toMatch(/S\/|\(/);
    // Un cero REAL (quien lo ve y la cifra es cero) sí se dice: no es lo mismo que no verlo.
    expect(textoChequeo(envios(0), mes, lim).detalle).toContain("9 prendas (S/\u00a00 al costo)");
    expect(textoChequeo(envios(undefined), mes, lim).detalle).not.toContain("S/");
  });
  it("de un mes ya cerrado no se dice «puedes cerrar»: se dice que esto no frena nada", () => {
    const abierta = unidad("Tienda Lima");
    const cerrada: Unidad = { ...abierta, estado: "cerrado" };
    const reabierta: Unidad = { ...abierta, estado: "reabierto" };
    // La base ya manda `bloquea = false` en una unidad cerrada; la frase no puede seguir diciendo que se puede cerrar igual.
    const casos: [string, Record<string, unknown>][] = [
      ["envios_con_diferencia", { n: 1, unidades: 7, monto: 105 }],
      ["conteos_abiertos", { n: 1, desde: "2026-08-10", numero: 4 }],
      ["sobrantes_traslado", { n: 1, unidades: 2 }],
      ["facturas_sin_recibir", { n: 1, unidades: 10, monto: 1180 }],
    ];
    for (const [clave, datos] of casos) {
      const enCerrada = textoChequeo(ch(clave, false, datos, false), mes, cerrada).detalle;
      expect(enCerrada, clave).toMatch(/\. Agosto ya está cerrado: esto no frena nada$/);
      expect(enCerrada, clave).not.toMatch(/Puedes cerrar|para poder cerrar/);
      // Reabierta vuelve a ser un mes por cerrar: frena (o avisa) como siempre.
      expect(textoChequeo(ch(clave, false, datos, true), mes, reabierta).detalle, clave).toMatch(/para poder cerrar agosto$/);
      expect(textoChequeo(ch(clave, false, datos, false), mes, abierta).detalle, clave).toMatch(/Puedes cerrar agosto igual: el aviso queda guardado en el cierre$/);
    }
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
    // La cola vive en Existencias desde ADR-0330: `/recibir` ya no la muestra.
    expect(enlaceChequeo(ch("regularizar", false, {}), lim, "2026-08")).toBe(`/inventario/por-regularizar?ubicacion=${LIM}`);
    expect(enlaceChequeo(ch("cerrada_sin_prenda", false, {}, false), lim, "2026-08")).toBe(`/inventario/por-regularizar?ubicacion=${LIM}`);
    expect(enlaceChequeo(ch("cerrada_sin_prenda", true, {}, false), lim, "2026-08")).toBeNull();
    expect(enlaceChequeo(ch("fijos", false, {}), emp, "2026-08")).toBe("/finanzas/gastos?tab=fijos&mes=2026-08&ver=empresa");
    expect(enlaceChequeo(ch("conciliacion", false, {}), emp, "2026-08")).toBe("/finanzas/dinero/conciliacion");
    // Los cuatro pendientes por sede, a la pantalla donde se resuelve cada uno.
    expect(enlaceChequeo(ch("envios_con_diferencia", false, {}), lim, "2026-08")).toBe("/compras/proveedores");
    expect(enlaceChequeo(ch("conteos_abiertos", false, {}), lim, "2026-08")).toBe("/inventario/conteo");
    expect(enlaceChequeo(ch("sobrantes_traslado", false, {}), lim, "2026-08")).toBe("/inventario/traslados");
    expect(enlaceChequeo(ch("facturas_sin_recibir", false, {}), lim, "2026-08")).toBe("/compras?porrecibir=1");
    expect(enlaceChequeo(ch("facturas_sin_recibir", true, {}, false), lim, "2026-08")).toBeNull();
    expect(enlaceChequeo(ch("diario", false, {}), lim, "2026-08")).toBe(`/finanzas/reportes?mes=2026-08&ver=${LIM}`);
    expect(enlaceChequeo(ch("sin_costo", false, {}), emp, "2026-08")).toBe("/finanzas/reportes?mes=2026-08");
  });
  it("el botón dice «Resolver», salvo en lo que ya no tiene cura: ahí solo se miran las ventas", () => {
    expect(etiquetaEnlace(ch("cajas", false, {}))).toBe("Resolver");
    expect(etiquetaEnlace(ch("sin_costo", false, {}, false))).toBe("Resolver");
    expect(etiquetaEnlace(ch("cerrada_sin_prenda", false, {}, false))).toBe("Ver ventas");
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
  it("una venta cerrada sin prenda es un AVISO, no un bloqueo: la unidad sigue lista y el aviso queda para el modal (ADR-0337)", () => {
    const conVentas: Unidad = { ...unidad("Taller"), avisos: 1, chequeos: [ch("cerrada_sin_prenda", false, { n: 3, monto: 220 }, false), ...unidad("Taller").chequeos] };
    expect(puedeCerrar(conVentas)).toBe(true);
    expect(estadoTarjeta(conVentas)).toEqual({ texto: "lista para cerrar", tono: "pizarra" });
    expect(avisosPendientes(conVentas).map((c) => c.clave)).toEqual(["cerrada_sin_prenda"]);
  });
  it("los cuatro pendientes por sede avisan antes del corte y frenan desde él (la base manda con `bloquea`)", () => {
    const pendientes = (bloquea: boolean) => [
      ch("envios_con_diferencia", false, { n: 1, unidades: 2, monto: 40 }, bloquea),
      ch("conteos_abiertos", false, { n: 1, desde: "2026-08-20", numero: 3 }, bloquea),
      ch("sobrantes_traslado", true, { n: 0, unidades: 0 }, bloquea),
      ch("facturas_sin_recibir", true, { n: 0, unidades: 0, monto: 0 }, bloquea),
    ];
    // Octubre (antes del corte): avisan, no bloquean. La base cuenta 0 bloqueantes y 2 avisos.
    const avisando: Unidad = { ...unidad("Taller"), bloqueantes: 0, avisos: 2, chequeos: [...pendientes(false), ...unidad("Taller").chequeos] };
    expect(puedeCerrar(avisando)).toBe(true);
    expect(estadoTarjeta(avisando)).toEqual({ texto: "lista para cerrar", tono: "pizarra" });
    expect(avisosPendientes(avisando).map((c) => c.clave)).toEqual(["envios_con_diferencia", "conteos_abiertos"]);
    // Noviembre (desde el corte): los mismos dos frenan y ya no son avisos.
    const frenando: Unidad = { ...unidad("Taller"), bloqueantes: 2, avisos: 0, chequeos: [...pendientes(true), ...unidad("Taller").chequeos] };
    expect(puedeCerrar(frenando)).toBe(false);
    expect(estadoTarjeta(frenando)).toEqual({ texto: "2 pendientes", tono: "ambar" });
    expect(avisosPendientes(frenando)).toEqual([]);
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

describe("el aviso del modal «Cerrar el mes»: dice lo que FALTA, no el estado bueno", () => {
  const mes = "2026-10";
  // Una por clave: si nace un chequeo nuevo y nadie le escribe su nombre de aviso, esto no compila.
  const CLAVES: Record<ClaveChequeo, true> = {
    cajas: true, egresos: true, regularizar: true, fijos: true, conciliacion: true, planilla: true, sin_costo: true,
    cerrada_sin_prenda: true, envios_con_diferencia: true, conteos_abiertos: true, sobrantes_traslado: true,
    facturas_sin_recibir: true, diario: true, huella: true,
  };
  it("octubre: cuatro pendientes avisan y el modal los nombra por lo que falta", () => {
    const avisos = ["envios_con_diferencia", "conteos_abiertos", "sobrantes_traslado", "facturas_sin_recibir"].map((c) => ch(c, false, {}, false));
    expect(resumenAvisos(avisos)).toEqual({
      cuenta: "4 avisos",
      lista: "envíos recibidos con faltantes por resolver · conteos de inventario sin cerrar · prendas de más de traslados sin revisar · mercadería facturada sin recibir",
    });
  });
  it("uno solo es «un aviso», y la frase de siempre sigue igual", () => {
    expect(resumenAvisos([ch("fijos", false, {}, false)])).toEqual({ cuenta: "un aviso", lista: "gastos fijos del mes sin registrar" });
    expect(resumenAvisos([])).toEqual({ cuenta: "0 avisos", lista: "" });
  });
  it("ninguna clave se nombra con su título (que dice el estado bueno), vacía ni en crudo", () => {
    for (const clave of Object.keys(CLAVES)) {
      const nombre = resumenAvisos([ch(clave, false, {}, false)]).lista;
      const bueno = textoChequeo(ch(clave, true, {}, false), mes).titulo;
      expect(nombre, clave).not.toBe("");
      expect(nombre, clave).not.toBe(clave);
      // «Ventas cerradas sin prenda» ya nombra lo que falta (es el único título de la lista escrito en negativo).
      if (clave !== "cerrada_sin_prenda") expect(nombre.toLowerCase(), clave).not.toBe(bueno.toLowerCase());
    }
    // Una clave que la web todavía no conoce se muestra en crudo antes que quedar vacía.
    expect(resumenAvisos([ch("clave_nueva", false, {}, false)]).lista).toBe("clave_nueva");
  });
  it("los nombres de los cuatro nuevos no leen como si estuvieran bien (el defecto que tenía el modal)", () => {
    for (const clave of ["envios_con_diferencia", "conteos_abiertos", "sobrantes_traslado", "facturas_sin_recibir"]) {
      const nombre = resumenAvisos([ch(clave, false, {}, false)]).lista;
      expect(nombre, clave).toMatch(/\b(sin|con faltantes|por resolver)\b/);
      expect(nombre, clave).not.toMatch(/\b(ya recibida|revisadas|cerrados)\b/);
    }
  });
  it("el modal usa ese resumen (no el título de cada chequeo)", () => {
    const fuente = readFileSync(join(__dirname, "..", "components", "finanzas", "CierreMes.tsx"), "utf8");
    expect(fuente).toContain("resumenAvisos(");
    expect(fuente).not.toMatch(/avisos\.map\(\(c\) => textoChequeo/);
  });
});
