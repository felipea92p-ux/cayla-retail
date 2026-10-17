import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Las lecturas de Análisis de punta a punta, con una base de mentira: lo que cada una devuelve cuando la base responde, falla o se
// cuelga. Vitest no resuelve el alias `@/` (ver `imagen-de-prenda.test.tsx`): las piezas puras se entregan por ruta relativa, así que
// lo que corre es el código verdadero; solo la base y el aviso a Sentry son de mentira.

const fakes = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  getConteosResumen: vi.fn(),
  getPedidosNoAtendidos: vi.fn(),
  getPreciosPorSede: vi.fn(),
  leerVendidoSinRegistrar: vi.fn(),
  contarPendientes: vi.fn(),
  getLecturaFrescuraDeTienda: vi.fn(),
}));
const { rpc } = fakes;
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: fakes.rpc, from: fakes.from }) }));
vi.mock("@/lib/ubicaciones", () => ({
  getUbicaciones: async () => [
    { id: "aaaaaaaa-0000-0000-0000-000000000001", nombre: "Tienda Trujillo", tipo: "tienda", activo: true },
    { id: "aaaaaaaa-0000-0000-0000-000000000002", nombre: "Tienda Arequipa", tipo: "tienda", activo: true },
    { id: "aaaaaaaa-0000-0000-0000-000000000003", nombre: "Tienda Lima", tipo: "tienda", activo: true },
  ],
}));
// Las lecturas que NO son de Análisis (las comparte con otras pantallas): de mentira, para decidir qué responden.
vi.mock("@/lib/conteos", () => ({ getConteosResumen: fakes.getConteosResumen }));
vi.mock("@/lib/pedidos-no-atendidos", () => ({ getPedidosNoAtendidos: fakes.getPedidosNoAtendidos }));
vi.mock("@/lib/precios-sede-datos", () => ({ getPreciosPorSede: fakes.getPreciosPorSede }));
vi.mock("@/lib/vendido-sin-registrar", () => ({
  leerVendidoSinRegistrar: fakes.leerVendidoSinRegistrar,
  contarPendientes: fakes.contarPendientes,
  sinRegistrarPorTipo: () => ({}),
}));
vi.mock("@/lib/frescura", () => ({ getLecturaFrescuraDeTienda: fakes.getLecturaFrescuraDeTienda }));
vi.mock("./errores", () => ({ capturarError: vi.fn() }));
vi.mock("@/lib/analisis-con-tope", async () => await import("./analisis-con-tope"));
vi.mock("@/lib/analisis-lectura", async () => await import("./analisis-lectura"));
vi.mock("@/lib/analisis-sede-lectura", async () => await import("./analisis-sede-lectura"));
vi.mock("@/lib/analisis-por-llegar-lectura", async () => await import("./analisis-por-llegar-lectura"));
vi.mock("@/lib/analisis-liquidar-reglas", async () => await import("./analisis-liquidar-reglas"));
vi.mock("@/lib/analisis-reglas", async () => await import("./analisis-reglas"));
vi.mock("@/lib/analisis-sede", async () => await import("./analisis-sede"));
vi.mock("@/lib/analisis-por-llegar", async () => await import("./analisis-por-llegar"));
vi.mock("@/lib/analisis-proveedores", async () => await import("./analisis-proveedores"));
vi.mock("@/lib/analisis-proveedores-lectura", async () => await import("./analisis-proveedores-lectura"));
vi.mock("@/lib/resultado", async () => await import("./resultado"));
vi.mock("@/lib/analisis-liquidar", async () => await import("./analisis-liquidar"));
vi.mock("@/lib/analisis-rinde", async () => await import("./analisis-rinde"));
vi.mock("@/lib/analisis-pedir", async () => await import("./analisis-pedir"));
vi.mock("@/lib/analisis-vara", async () => await import("./analisis-vara"));
vi.mock("@/lib/analisis-armado", async () => await import("./analisis-armado"));
vi.mock("@/lib/analisis-modelo", async () => await import("./analisis-modelo"));
vi.mock("@/lib/analisis-piso", async () => await import("./analisis-piso"));
vi.mock("@/lib/motor-demanda-reglas", async () => await import("./motor-demanda-reglas"));
vi.mock("@/lib/fechas-lima", async () => await import("./fechas-lima"));
vi.mock("@/lib/registro-contable", async () => await import("./registro-contable"));

import { capturarError } from "./errores";
import { TOPE_LECTURA_MS } from "./analisis-con-tope";
import { LIQUIDAR_DEFECTO } from "./analisis-reglas";
import { FALLA_LEER_LIQUIDAR } from "./analisis-liquidar-reglas";
import { FALLA_RINDE } from "./analisis-pedir";
import { getPrendasPorSede } from "./analisis-sede";
import { getPorLlegar } from "./analisis-por-llegar";
import { FALLA_PROVEEDORES, getProveedoresAnalisis } from "./analisis-proveedores";
import { getLiquidarDesde } from "./analisis-liquidar";
import { getRindePorCategoria } from "./analisis-rinde";
import { getDatosAnalisis } from "./analisis-datos";
import { miTiendaSinLeer } from "./analisis-con-tope";

const TRU = "aaaaaaaa-0000-0000-0000-000000000001";
const AQP = "aaaaaaaa-0000-0000-0000-000000000002";
const LIM = "aaaaaaaa-0000-0000-0000-000000000003";

/** Una consulta `.from(tabla).select().not().order().range()` de mentira: responde `resultado` (una promesa) al pedir la página. */
const consulta = (resultado: PromiseLike<unknown>) => {
  const q: Record<string, unknown> = { range: () => resultado };
  for (const paso of ["select", "not", "order"]) q[paso] = () => q;
  return q;
};
const PROV_A = "bbbbbbbb-0000-0000-0000-00000000000a";
const PROV_B = "bbbbbbbb-0000-0000-0000-00000000000b";
const MODELO_1 = "cccccccc-0000-0000-0000-000000000001";
const MODELO_2 = "cccccccc-0000-0000-0000-000000000002";
/** El catálogo sano: dos modelos con proveedor, y los dos proveedores (uno archivado). */
const tablasSanas = (tabla: string) =>
  consulta(
    Promise.resolve(
      tabla === "productos"
        ? { data: [{ id: MODELO_1, proveedor_id: PROV_A }, { id: MODELO_2, proveedor_id: PROV_B }], error: null }
        : { data: [{ id: PROV_A, nombre: "Textil Andino", activo: true }, { id: PROV_B, nombre: "Hilos del Sur", activo: false }], error: null },
    ),
  );

const sedeSana = (id: string, rebaja: number) => ({ data: { ubicacion_id: id, hoy: "2026-10-16", rebaja_de_100: rebaja, prendas: [] }, error: null });
const seCae = () => ({ data: null, error: { code: "57014", message: "canceling statement due to statement timeout (Tienda Lima)" } });
const seCuelga = () => new Promise<never>(() => {});

let prueba = 0;
beforeEach(() => {
  vi.useFakeTimers();
  // El freno de avisos es por hora y vive en el módulo: cada prueba parte dos horas después de la anterior.
  vi.setSystemTime(Date.UTC(2026, 9, 16, 8) + ++prueba * 2 * 60 * 60 * 1000);
  for (const f of Object.values(fakes)) f.mockReset();
  vi.mocked(capturarError).mockClear();
});
afterEach(() => vi.useRealTimers());

describe("getPrendasPorSede", () => {
  it("una tienda que falla y otra que se cuelga quedan en sedesSinLeer; la sana se lee; nada espera más del tope", async () => {
    rpc.mockImplementation((_nombre: string, args: { p_ubicacion_id: string }) => {
      if (args.p_ubicacion_id === TRU) return Promise.resolve(sedeSana(TRU, 12));
      if (args.p_ubicacion_id === AQP) return Promise.resolve(seCae());
      return seCuelga();
    });
    const espera = getPrendasPorSede([TRU, AQP, LIM]);
    await vi.advanceTimersByTimeAsync(TOPE_LECTURA_MS);
    const lectura = await espera;

    expect(lectura.sedesSinLeer).toEqual([AQP, LIM]);
    expect(lectura.falla).toBe("No se pudieron leer las prendas de Tienda Arequipa y Tienda Lima");
    expect(lectura.porSede).toEqual({ [TRU]: [], [AQP]: [], [LIM]: [] });
    expect(lectura.rebajaDe100).toEqual({ [TRU]: 12, [AQP]: null, [LIM]: null });
    expect(Object.keys(lectura.sabePiso)).toEqual([TRU]);
    expect(Object.keys(lectura.sabeUltimaVenta)).toEqual([TRU]);
  });

  it("si todas responden, sedesSinLeer queda vacío y no hay falla ni aviso", async () => {
    rpc.mockImplementation((_n: string, args: { p_ubicacion_id: string }) => Promise.resolve(sedeSana(args.p_ubicacion_id, 0)));
    const lectura = await getPrendasPorSede([TRU, AQP]);
    expect(lectura.sedesSinLeer).toEqual([]);
    expect(lectura.falla).toBeNull();
    expect(capturarError).not.toHaveBeenCalled();
  });

  it("una respuesta que no se entiende cuenta como no leída (nunca «sin prendas»)", async () => {
    rpc.mockResolvedValue({ data: { algo: "raro" }, error: null });
    const lectura = await getPrendasPorSede([TRU]);
    expect(lectura.sedesSinLeer).toEqual([TRU]);
  });

  it("avisa a Sentry una vez por pieza con el id de la tienda, y sin el nombre de nadie ni lo que dijo la base", async () => {
    rpc.mockImplementation(() => Promise.resolve(seCae()));
    await getPrendasPorSede([TRU, AQP, LIM]);
    expect(capturarError).toHaveBeenCalledTimes(1);
    const [donde, error, contexto] = vi.mocked(capturarError).mock.calls[0]!;
    expect(donde).toBe("analisis.sede");
    expect((error as Error & { code?: string }).code).toBe("57014");
    expect(contexto).toMatchObject({ pieza: "sede", motivo: "error", ubicacion_id: TRU });
    expect(JSON.stringify(vi.mocked(capturarError).mock.calls)).not.toMatch(/Tienda|canceling/);
  });

  it("se avisa de una lectura sana pero lenta (3 s o más) antes de que se acerque a los 8 s de la base", async () => {
    rpc.mockImplementation(
      (_n: string, args: { p_ubicacion_id: string }) => new Promise((resolver) => setTimeout(() => resolver(sedeSana(args.p_ubicacion_id, 0)), 3_400)),
    );
    const espera = getPrendasPorSede([TRU]);
    await vi.advanceTimersByTimeAsync(3_400);
    expect((await espera).sedesSinLeer).toEqual([]);
    expect(capturarError).toHaveBeenCalledTimes(1);
    expect(vi.mocked(capturarError).mock.calls[0]![0]).toBe("analisis.sede.lenta");
  });
});

describe("las demás lecturas dicen lo mismo de siempre cuando fallan", () => {
  it("lo que viene en camino: error, tope y respuesta rara dan «no se pudo leer», nunca «no viene nada»", async () => {
    const NO_SE_PUDO = "No se pudo leer lo que viene en camino";
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "sin permiso" } });
    expect(await getPorLlegar(TRU)).toEqual({ porVariante: {}, falla: NO_SE_PUDO });

    rpc.mockResolvedValueOnce({ data: { no: "es un arreglo" }, error: null });
    expect(await getPorLlegar(TRU)).toEqual({ porVariante: {}, falla: NO_SE_PUDO });

    rpc.mockImplementationOnce(seCuelga);
    const espera = getPorLlegar(TRU);
    await vi.advanceTimersByTimeAsync(TOPE_LECTURA_MS);
    expect(await espera).toEqual({ porVariante: {}, falla: NO_SE_PUDO });

    rpc.mockResolvedValueOnce({ data: [], error: null });
    expect(await getPorLlegar(TRU)).toEqual({ porVariante: {}, falla: null });
  });

  it("«Liquidar desde»: si falla o se cuelga, sigue con el de fábrica y lo dice", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42883", message: "no existe" } });
    expect(await getLiquidarDesde()).toEqual({ dias: LIQUIDAR_DEFECTO, falla: FALLA_LEER_LIQUIDAR });

    rpc.mockImplementationOnce(seCuelga);
    const espera = getLiquidarDesde();
    await vi.advanceTimersByTimeAsync(TOPE_LECTURA_MS);
    expect(await espera).toEqual({ dias: LIQUIDAR_DEFECTO, falla: FALLA_LEER_LIQUIDAR });

    rpc.mockResolvedValueOnce({ data: 45, error: null });
    expect(await getLiquidarDesde()).toEqual({ dias: 45, falla: null });
  });

  it("«Lo que más rinde»: si falla o se cuelga, vacío con su falla; sin ventas, vacío SIN falla", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "57014", message: "tiempo agotado" } });
    expect(await getRindePorCategoria(TRU)).toEqual({ rinde: [], falla: FALLA_RINDE });

    rpc.mockImplementationOnce(seCuelga);
    const espera = getRindePorCategoria(TRU);
    await vi.advanceTimersByTimeAsync(TOPE_LECTURA_MS);
    expect(await espera).toEqual({ rinde: [], falla: FALLA_RINDE });

    rpc.mockResolvedValueOnce({ data: [], error: null });
    expect(await getRindePorCategoria(TRU)).toEqual({ rinde: [], falla: null });
  });

  it("una caída de Supabase (todo se cuelga) no manda un aviso por lectura: uno por pieza", async () => {
    rpc.mockImplementation(seCuelga);
    const espera = Promise.all([getPorLlegar(TRU), getLiquidarDesde(), getRindePorCategoria(TRU), getPrendasPorSede([TRU, AQP, LIM])]);
    await vi.advanceTimersByTimeAsync(TOPE_LECTURA_MS);
    await espera;
    const dondes = vi.mocked(capturarError).mock.calls.map((c) => c[0]).sort();
    expect(dondes).toEqual(["analisis.liquidar_desde", "analisis.por_llegar", "analisis.rinde", "analisis.sede"]);
  });
});

// ───────────────────────── getDatosAnalisis: todas las piezas juntas ─────────────────────────

const ACTIVA = { id: TRU, nombre: "Tienda Trujillo", tipo: "tienda" as const, activo: true, metaVentaDiaria: null, horaCierre: null };

/** La base sana; `cambia` reemplaza la respuesta de una función por su nombre. */
function baseSana(cambia: Record<string, unknown> = {}) {
  rpc.mockImplementation(async (nombre: string, args: { p_ubicacion_id?: string }) => {
    if (nombre in cambia) {
      const v = cambia[nombre];
      return typeof v === "function" ? (v as (a: unknown) => unknown)(args) : v;
    }
    if (nombre === "fn_analisis_sede") return sedeSana(args.p_ubicacion_id!, 0);
    if (nombre === "fn_analisis_por_llegar") return { data: [], error: null };
    if (nombre === "fn_liquidar_desde") return { data: 60, error: null };
    if (nombre === "fn_resumen_comparacion_json") return { data: [], error: null };
    if (nombre === "fn_motor_demanda_preparacion") return { data: [], error: null };
    throw new Error(`rpc inesperada: ${nombre}`);
  });
  fakes.getConteosResumen.mockResolvedValue([]);
  fakes.getPedidosNoAtendidos.mockResolvedValue([]);
  fakes.getPreciosPorSede.mockResolvedValue({ [TRU]: {} });
  fakes.leerVendidoSinRegistrar.mockResolvedValue([]);
  fakes.contarPendientes.mockResolvedValue(3);
  fakes.getLecturaFrescuraDeTienda.mockResolvedValue({ datos: { separaPiso: true, prendas: [], categorias: [] }, fallo: null });
  fakes.from.mockImplementation(tablasSanas);
}

describe("getDatosAnalisis", () => {
  it("con todo sano no hay fallas, ninguna tienda sin leer ni avisos", async () => {
    // Mi tienda tiene UNA prenda: el modelo 1, que se compró a Hilos del Sur (la última compra manda, aunque el catálogo diga otro).
    const unaPrenda = (id: string) => {
      const sede = sedeSana(id, 0);
      return id === TRU ? { ...sede, data: { ...sede.data, prendas: [{ variante_id: "dddddddd-0000-0000-0000-000000000001", producto_id: MODELO_1, nombre: "Blusa Prueba", origen: "terceros", proveedor_id: PROV_B, salio_al_piso: null, ultima_venta: null }] } } : sede;
    };
    baseSana({ fn_analisis_sede: (a: { p_ubicacion_id: string }) => unaPrenda(a.p_ubicacion_id) });
    const d = await getDatosAnalisis(ACTIVA, { conFrescura: true });
    expect(d.fallas).toEqual([]);
    expect(d.sedesSinLeer).toEqual([]);
    expect(d.frescura).toBe("ok");
    expect(d.porRegistrar.pendientes).toBe(3);
    expect(miTiendaSinLeer(d)).toBe(false);
    // A quién se le pide cada modelo, recortado a lo que las prendas de mi tienda pueden usar: el proveedor del catálogo del modelo 1 y los
    // nombres de a quienes apunta (el del catálogo y el de la compra, también el archivado). El modelo 2, que mi tienda no tiene, no viaja.
    expect(d.proveedores).toEqual({
      nombres: { [PROV_A]: { nombre: "Textil Andino", activo: true }, [PROV_B]: { nombre: "Hilos del Sur", activo: false } },
      delCatalogo: { [MODELO_1]: PROV_A },
    });
    expect(capturarError).not.toHaveBeenCalled();
  });

  it("si mi tienda no se pudo leer, lo dice (sedesSinLeer) y la pantalla puede decir «No se pudo leer tu tienda»", async () => {
    baseSana({ fn_analisis_sede: (a: { p_ubicacion_id: string }) => (a.p_ubicacion_id === TRU ? seCae() : sedeSana(a.p_ubicacion_id, 0)) });
    const d = await getDatosAnalisis(ACTIVA);
    expect(d.sedesSinLeer).toEqual([TRU]);
    expect(miTiendaSinLeer(d)).toBe(true);
    expect(d.prendas).toEqual([]);
    expect(d.fallas).toContain("No se pudieron leer las prendas de Tienda Trujillo");
  });

  it("si es OTRA tienda la que no se lee, mi tienda sigue leída (y qué se hace con ella no cambia aquí)", async () => {
    baseSana({ fn_analisis_sede: (a: { p_ubicacion_id: string }) => (a.p_ubicacion_id === LIM ? seCae() : sedeSana(a.p_ubicacion_id, 0)) });
    const d = await getDatosAnalisis(ACTIVA);
    expect(d.sedesSinLeer).toEqual([LIM]);
    expect(miTiendaSinLeer(d)).toBe(false);
  });

  it("cada pieza que falla se dice con la misma frase de siempre y en el mismo orden", async () => {
    baseSana({
      fn_motor_demanda_preparacion: seCae(),
      fn_analisis_por_llegar: seCae(),
      fn_liquidar_desde: seCae(),
      fn_resumen_comparacion_json: seCae(),
    });
    fakes.getConteosResumen.mockRejectedValue(new Error("TEXTO-DE-LA-BASE conteos de Juana Pérez"));
    fakes.getPedidosNoAtendidos.mockRejectedValue(new Error("TEXTO-DE-LA-BASE pedido de Juana Pérez"));
    fakes.getPreciosPorSede.mockResolvedValue({});
    fakes.leerVendidoSinRegistrar.mockRejectedValue(new Error("TEXTO-DE-LA-BASE venta de Juana Pérez"));
    fakes.contarPendientes.mockResolvedValue(null);
    fakes.getLecturaFrescuraDeTienda.mockResolvedValue({ datos: null, fallo: "No se pudo cargar la frescura de Tienda Trujillo." });
    const d = await getDatosAnalisis(ACTIVA, { conFrescura: true });
    expect(d.fallas).toEqual([
      "No se pudo leer si el sistema ya puede recomendar en cada tienda",
      "No se pudo leer el precio propio de tu tienda: las cifras en soles usan el precio de la prenda",
      "No se pudo leer lo que viene en camino",
      FALLA_LEER_LIQUIDAR,
      FALLA_RINDE,
      "No se pudo leer el último conteo",
      "No se pudo leer «Te pidieron y no había»",
      "No se pudo leer lo vendido sin registrar: «Qué pedir» cuenta solo las ventas con su prenda",
      "No se pudo leer Frescura del piso: «No se vende» no sabe qué puede haberse vendido sin registrar",
    ]);
    expect(d.porRegistrar.pendientes).toBeNull();
    expect(d.frescura).toBe("fallo");
    expect(d.liquidarDesde).toBe(LIQUIDAR_DEFECTO);
    // Una pieza que cae es UN aviso, con su pieza como dónde; el nombre de la sede que traía el texto de Frescura no sale.
    const dondes = vi.mocked(capturarError).mock.calls.map((c) => c[0]);
    expect(new Set(dondes).size).toBe(dondes.length);
    expect(dondes).toEqual(expect.arrayContaining(["analisis.preparacion", "analisis.por_llegar", "analisis.liquidar_desde", "analisis.rinde", "analisis.conteos"]));
    expect(dondes).toEqual(expect.arrayContaining(["analisis.pedidos_no_atendidos", "analisis.precios_de_mi_tienda", "analisis.vendido_sin_registrar", "analisis.pendientes_por_registrar", "analisis.frescura"]));
    expect(JSON.stringify(vi.mocked(capturarError).mock.calls)).not.toMatch(/Trujillo|TEXTO-DE-LA-BASE|Juana/);
    // Frescura que devuelve su `fallo` cuenta como ERROR (con su motivo), no como «sin datos»: se distingue en Sentry de una respuesta vacía.
    expect(vi.mocked(capturarError).mock.calls.find((c) => c[0] === "analisis.frescura")![2]).toMatchObject({ motivo: "error" });
  });

  it("Frescura: sin el módulo no se lee, una sede que no separa piso no aplica, y un tope vencido es «fallo»", async () => {
    baseSana();
    expect((await getDatosAnalisis(ACTIVA, { conFrescura: false })).frescura).toBe("sin_modulo");
    expect(fakes.getLecturaFrescuraDeTienda).not.toHaveBeenCalled();

    fakes.getLecturaFrescuraDeTienda.mockResolvedValue({ datos: { separaPiso: false }, fallo: null });
    expect((await getDatosAnalisis(ACTIVA, { conFrescura: true })).frescura).toBe("no_aplica");

    expect((await getDatosAnalisis({ ...ACTIVA, tipo: "almacen" }, { conFrescura: true })).frescura).toBe("no_aplica");

    fakes.getLecturaFrescuraDeTienda.mockImplementation(seCuelga);
    const espera = getDatosAnalisis(ACTIVA, { conFrescura: true });
    await vi.advanceTimersByTimeAsync(TOPE_LECTURA_MS);
    expect((await espera).frescura).toBe("fallo");
  });

  it("si Supabase se cae del todo, la pantalla se arma igual al vencer el tope: todo dicho como «no se pudo leer»", async () => {
    rpc.mockImplementation(seCuelga);
    fakes.from.mockImplementation(() => consulta(seCuelga()));
    for (const f of [fakes.getConteosResumen, fakes.getPedidosNoAtendidos, fakes.getPreciosPorSede, fakes.leerVendidoSinRegistrar, fakes.contarPendientes, fakes.getLecturaFrescuraDeTienda]) {
      f.mockImplementation(seCuelga);
    }
    let listo = false;
    const espera = getDatosAnalisis(ACTIVA, { conFrescura: true }).then((d) => {
      listo = true;
      return d;
    });
    await vi.advanceTimersByTimeAsync(TOPE_LECTURA_MS - 1);
    expect(listo).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const d = await espera;
    expect(d.sedesSinLeer).toEqual([TRU, AQP, LIM]);
    expect(miTiendaSinLeer(d)).toBe(true);
    expect(d.fallas.length).toBeGreaterThanOrEqual(10);
    expect(d.frescura).toBe("fallo");
    expect(d.prendas).toEqual([]);
  });
});

// ───────────────────────── A quién se le pide cada modelo (A8) ─────────────────────────

describe("getProveedoresAnalisis (A8)", () => {
  it("lee solo id y proveedor de los modelos, y solo id, nombre y estado de los proveedores (nada bancario)", async () => {
    const pedidas: { tabla: string; columnas: string }[] = [];
    fakes.from.mockImplementation((tabla: string) => {
      const q = tablasSanas(tabla);
      const select = q.select as () => unknown;
      q.select = (columnas: string) => {
        pedidas.push({ tabla, columnas });
        return select();
      };
      return q;
    });
    const lectura = await getProveedoresAnalisis();
    expect(lectura.falla).toBeNull();
    // Lo que se lee es el directorio y el catálogo enteros (el recorte a las prendas de la tienda se hace después, en `getDatosAnalisis`).
    expect(lectura.proveedores).toEqual({
      nombres: { [PROV_A]: { nombre: "Textil Andino", activo: true }, [PROV_B]: { nombre: "Hilos del Sur", activo: false } },
      delCatalogo: { [MODELO_1]: PROV_A, [MODELO_2]: PROV_B },
    });
    expect(pedidas.sort((a, b) => a.tabla.localeCompare(b.tabla))).toEqual([
      { tabla: "productos", columnas: "id, proveedor_id" },
      { tabla: "proveedores", columnas: "id, nombre, activo" },
    ]);
  });

  it("si la base da error, devuelve null con su frase y avisa con el código, sin el nombre de ningún proveedor", async () => {
    fakes.from.mockImplementation((tabla: string) =>
      tabla === "productos"
        ? consulta(Promise.resolve({ data: null, error: { code: "57014", message: "canceling statement (Textil Andino)" } }))
        : tablasSanas(tabla),
    );
    const lectura = await getProveedoresAnalisis();
    expect(lectura).toEqual({ proveedores: null, falla: FALLA_PROVEEDORES });
    expect(capturarError).toHaveBeenCalledTimes(1);
    const [donde, error] = vi.mocked(capturarError).mock.calls[0]!;
    expect(donde).toBe("analisis.proveedores");
    expect((error as Error & { code?: string }).code).toBe("57014");
    expect(JSON.stringify(vi.mocked(capturarError).mock.calls)).not.toMatch(/Textil|canceling/);
  });

  it("si la base se cuelga, no espera más del tope y lo dice igual", async () => {
    fakes.from.mockImplementation(() => consulta(seCuelga()));
    const espera = getProveedoresAnalisis();
    await vi.advanceTimersByTimeAsync(TOPE_LECTURA_MS);
    expect(await espera).toEqual({ proveedores: null, falla: FALLA_PROVEEDORES });
  });

  it("una respuesta que no es una lista cuenta como no leída (nunca «sin proveedor»)", async () => {
    fakes.from.mockImplementation(() => consulta(Promise.resolve({ data: { no: "es una lista" }, error: null })));
    // `leerTodas` junta las páginas con un spread: algo que no es una lista lanza, y `leerPieza` lo cuenta como «no se pudo».
    expect(await getProveedoresAnalisis()).toEqual({ proveedores: null, falla: FALLA_PROVEEDORES });
  });

  it("dentro de la pantalla: sin proveedores, se dice en las fallas y lo demás se lee igual", async () => {
    baseSana();
    fakes.from.mockImplementation(() => consulta(Promise.resolve({ data: null, error: { code: "42501", message: "sin permiso" } })));
    const d = await getDatosAnalisis(ACTIVA, { conFrescura: true });
    expect(d.proveedores).toBeNull();
    expect(d.fallas).toEqual([FALLA_PROVEEDORES]);
    expect(d.sedesSinLeer).toEqual([]);
    expect(d.frescura).toBe("ok");
  });
});
