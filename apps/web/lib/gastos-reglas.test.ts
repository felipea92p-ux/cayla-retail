import { describe, expect, it } from "vitest";
import {
  borradorDesdeFijo,
  estadoGasto,
  igvDeFactura,
  leerPanel,
  leerVer,
  mediosPara,
  mesesRecientes,
  parsearMonto,
  partirSerieNumero,
  puedeAnular,
  leerActivo,
  resumenActivosPorSede,
  puedeAnularActivo,
  rangoMes,
  resumenFijos,
  sugerenciaParaEgreso,
  textoMes,
  textoPago,
  solesRedondo,
  fechaCorta,
  textoVidaUtil,
  totalesActivos,
  validarActivo,
  validarFijo,
  leerFijoMes,
  AYUDA_MOMENTO_FIJO,
  MOMENTOS_FIJO,
  TEXTO_MOMENTO_FIJO,
  textoCuandoVence,
  textoDiasAntes,
  textoPagarDesde,
  textoColumnaCuando,
  validarGasto,
  leerGasto,
  papelDelGasto,
  papelEnUnaLinea,
  tieneComprobante,
  TEXTO_PAPEL_DE_GASTO,
  bajadaIgvDelMes,
  conIgvPerdido,
  igvBajoElMonto,
  igvDelGasto,
  igvEnRiesgo,
  igvParaLaTarjeta,
  notaIgvPerdido,
  perdidoEnOtroMes,
  textoIgvPerdido,
  type BorradorGasto,
  type GastoFila,
  type PapelDeGasto,
} from "./gastos-reglas";
import { UMBRAL_BANCARIZACION } from "./no-deducible-reglas";
import { TEXTO_PAPEL, type PapelGastoViaje } from "./gastos-viaje-reglas";

const HOY = "2026-09-24";
const base: BorradorGasto = {
  ubicacion: "tru",
  categoria: "servicios_basicos",
  descripcion: " Luz de septiembre ",
  fecha: "2026-09-20",
  monto: "648",
  comprobante: "sin_comprobante",
  proveedorId: "",
  serie: "",
  numero: "",
  condicion: "contado",
  vence: "",
  medio: "yape",
  cajaId: "",
  egresoId: "",
  referencia: "",
};

describe("montos, IGV y meses", () => {
  it("lee montos con coma de miles y S/, y rechaza lo que no es un monto", () => {
    expect(parsearMonto("S/ 1,500.50")).toEqual({ ok: true, valor: 1500.5 });
    expect(parsearMonto("0").ok).toBe(false);
    expect(parsearMonto("12.345").ok).toBe(false);
    expect(parsearMonto("").ok).toBe(false);
  });
  it("el IGV de una factura sale del total, como en la base (648 → 98.85)", () => {
    expect(igvDeFactura(648)).toBe(98.85);
    expect(igvDeFactura(118)).toBe(18);
  });
  it("el rango de un mes incluye su último día, también en febrero bisiesto", () => {
    expect(rangoMes("2026-09")).toEqual({ desde: "2026-09-01", hasta: "2026-09-30" });
    expect(rangoMes("2028-02")).toEqual({ desde: "2028-02-01", hasta: "2028-02-29" });
  });
  it("los meses recientes cruzan el año y se nombran en español", () => {
    expect(mesesRecientes("2026-02-10", 3)).toEqual(["2026-02", "2026-01", "2025-12"]);
    expect(textoMes("2026-09")).toBe("septiembre 2026");
  });
});

describe("«Ver»: qué mira la pantalla", () => {
  const ubics = [{ id: "tru", nombre: "Tienda Trujillo" }, { id: "lim", nombre: "Tienda Lima" }];
  it("el líder mira, por defecto, la sede donde trabaja; puede pedir todas o lo de la empresa", () => {
    expect(leerVer(undefined, ubics, true, "lim")).toEqual({ clave: "lim", ubicacionId: "lim", soloEmpresa: false });
    expect(leerVer("todas", ubics, true, "lim")).toEqual({ clave: "todas", ubicacionId: null, soloEmpresa: false });
    expect(leerVer("empresa", ubics, true, "lim")).toEqual({ clave: "empresa", ubicacionId: null, soloEmpresa: true });
    expect(leerVer("xx", ubics, true, null).clave).toBe("todas");
  });
  it("quien no es líder ve solo su tienda, aunque la URL pida otra cosa", () => {
    expect(leerVer("empresa", [ubics[0]!], false, "lim")).toEqual({ clave: "tru", ubicacionId: "tru", soloEmpresa: false });
  });
});

describe("el formulario", () => {
  it("sin comprobante, por Yape: sin comprobante ni caja, la descripción sin espacios de más", () => {
    const r = validarGasto(base, HOY);
    expect(r).toEqual({
      ok: true,
      valor: {
        p_ubicacion_id: "tru", p_categoria: "servicios_basicos", p_descripcion: "Luz de septiembre", p_fecha: "2026-09-20", p_monto_total: 648,
        p_comprobante: null, p_medio_pago: "yape", p_caja_id: null, p_caja_movimiento_id: null, p_referencia: null,
      },
    });
  });
  it("en efectivo, pide la caja abierta; con ella, la manda", () => {
    expect(validarGasto({ ...base, medio: "efectivo" }, HOY).ok).toBe(false);
    const r = validarGasto({ ...base, medio: "efectivo", cajaId: "caja1" }, HOY);
    expect(r.ok && r.valor.p_caja_id).toBe("caja1");
  });
  it("factura a crédito: sin medio ni caja, con vencimiento; la serie va en mayúsculas", () => {
    const r = validarGasto({ ...base, comprobante: "factura", proveedorId: "p1", serie: "s120", numero: "560233", condicion: "credito", vence: "2026-10-12", medio: "" }, HOY);
    expect(r.ok && r.valor.p_comprobante).toEqual({ tipo: "factura", proveedor_id: "p1", serie: "S120", numero: "560233", condicion: "credito", fecha_vencimiento: "2026-10-12" });
    expect(r.ok && r.valor.p_medio_pago).toBe(null);
  });
  it("a crédito sin vencimiento, o que vence antes de la fecha: se pide", () => {
    const b = { ...base, comprobante: "factura" as const, proveedorId: "p1", serie: "F1", numero: "1", condicion: "credito" as const, medio: "" as const };
    expect(validarGasto({ ...b, vence: "" }, HOY).ok).toBe(false);
    expect(validarGasto({ ...b, vence: "2026-09-01" }, HOY).ok).toBe(false);
  });
  it("con comprobante pide proveedor, serie y número", () => {
    expect(validarGasto({ ...base, comprobante: "boleta" }, HOY)).toEqual({ ok: false, error: "Elige el proveedor del comprobante." });
    expect(validarGasto({ ...base, comprobante: "boleta", proveedorId: "p1" }, HOY)).toEqual({ ok: false, error: "Escribe la serie y el número del comprobante." });
  });
  it("«de la empresa» va sin tienda; la fecha futura no pasa", () => {
    const r = validarGasto({ ...base, ubicacion: "empresa" }, HOY);
    expect(r.ok && r.valor.p_ubicacion_id).toBe(null);
    expect(validarGasto({ ...base, fecha: "2026-09-25" }, HOY).ok).toBe(false);
  });
  it("F3b · «Salió de»: en efectivo de la caja fuerte basta la cuenta (sin caja); la cuenta viaja a la base", () => {
    const r = validarGasto({ ...base, medio: "efectivo", cuentaId: "fuerte" }, HOY);
    expect(r.ok && [r.valor.p_caja_id, r.valor.p_cuenta_id]).toEqual([null, "fuerte"]);
    const banco = validarGasto({ ...base, medio: "transferencia", cuentaId: "bcp" }, HOY);
    expect(banco.ok && banco.valor.p_cuenta_id).toBe("bcp");
  });
  it("F3b · a crédito o clasificando un egreso, no viaja ninguna cuenta (la dice el pago o el egreso)", () => {
    const credito = validarGasto({ ...base, comprobante: "factura", proveedorId: "p1", serie: "F1", numero: "1", condicion: "credito", vence: "2026-10-12", medio: "", cuentaId: "bcp" }, HOY);
    expect(credito.ok && "p_cuenta_id" in credito.valor).toBe(false);
    const egreso = validarGasto({ ...base, medio: "", egresoId: "eg1", cuentaId: "bcp" }, HOY);
    expect(egreso.ok && "p_cuenta_id" in egreso.valor).toBe(false);
  });
  it("clasificar un egreso: efectivo, sin caja nueva, con el egreso", () => {
    const r = validarGasto({ ...base, medio: "", egresoId: "eg1" }, HOY);
    expect(r.ok && [r.valor.p_medio_pago, r.valor.p_caja_id, r.valor.p_caja_movimiento_id]).toEqual(["efectivo", null, "eg1"]);
  });
  it("el depósito solo existe con comprobante", () => {
    expect(mediosPara("sin_comprobante")).not.toContain("deposito");
    expect(mediosPara("factura")).toContain("deposito");
    expect(validarGasto({ ...base, medio: "deposito" }, HOY).ok).toBe(false);
  });
  it("parte «F001-00140» en serie y número (sin ceros a la izquierda)", () => {
    expect(partirSerieNumero("f001-00140")).toEqual({ serie: "F001", numero: "140" });
    expect(partirSerieNumero("E001 12")).toEqual({ serie: "E001", numero: "12" });
    expect(partirSerieNumero("nada")).toEqual({ serie: "", numero: "" });
  });
});

describe("estado, anular y cómo se pagó", () => {
  it("con factura: por pagar, pago parcial o pagado; sin factura, pagado; anulado es anulado", () => {
    expect(estadoGasto({ estado: "vigente", compraId: "c", saldo: 648, montoTotal: 648 })).toBe("por_pagar");
    expect(estadoGasto({ estado: "vigente", compraId: "c", saldo: 48, montoTotal: 648 })).toBe("parcial");
    expect(estadoGasto({ estado: "vigente", compraId: "c", saldo: 0, montoTotal: 648 })).toBe("pagado");
    expect(estadoGasto({ estado: "vigente", compraId: null, saldo: null, montoTotal: 10 })).toBe("pagado");
    expect(estadoGasto({ estado: "anulado", compraId: "c", saldo: 648, montoTotal: 648 })).toBe("anulado");
  });
  it("un gasto con factura ya pagada no se anula; uno sin factura, sí", () => {
    expect(puedeAnular({ estado: "vigente", compraId: "c", tienePagos: true })).toBe(false);
    expect(puedeAnular({ estado: "vigente", compraId: "c", tienePagos: false })).toBe(true);
    expect(puedeAnular({ estado: "vigente", compraId: null, tienePagos: false })).toBe(true);
    expect(puedeAnular({ estado: "anulado", compraId: null, tienePagos: false })).toBe(false);
  });
  it("cómo se pagó, en una línea", () => {
    const f = (iso: string) => iso.slice(5);
    expect(textoPago({ medioPago: null, cajaMovimientoId: null, compraId: "c", condicion: "credito", fechaVencimiento: "2026-10-12", tienePagos: false, saldo: 100, estado: "vigente", ubicacionNombre: "Tienda TRU" }, f)).toBe("vence 10-12");
    expect(textoPago({ medioPago: "transferencia", cajaMovimientoId: null, compraId: "c", condicion: "credito", fechaVencimiento: "2026-10-12", tienePagos: true, saldo: 0, estado: "vigente", ubicacionNombre: "Tienda TRU" }, f)).toBe("Transferencia");
    expect(textoPago({ medioPago: "efectivo", cajaMovimientoId: "m", compraId: null, condicion: null, fechaVencimiento: null, tienePagos: false, saldo: null, estado: "vigente", ubicacionNombre: "Tienda TRU" }, f)).toBe("Cajón · Tienda TRU");
    expect(textoPago({ medioPago: "yape", cajaMovimientoId: null, compraId: null, condicion: null, fechaVencimiento: null, tienePagos: false, saldo: null, estado: "vigente", ubicacionNombre: null }, f)).toBe("Yape");
  });

  it("formatos del spike: cifras redondas y «23 sep»", () => {
    expect(solesRedondo(5472.4)).toBe("S/\u00a05,472");
    expect(fechaCorta("2026-09-03")).toBe("3 sep");
    expect(fechaCorta("2026-09-23", true)).toBe("23 sep 2026");
  });
  it("lo que se propone al clasificar un egreso, según el motivo de la tienda", () => {
    expect(sugerenciaParaEgreso("Depósito bancario")).toBe("deposito");
    expect(sugerenciaParaEgreso("Retiro de efectivo")).toBe("retiro");
    expect(sugerenciaParaEgreso("Ajuste de caja (faltante)")).toBe("ajuste");
    expect(sugerenciaParaEgreso("Compra de insumos")).toBe("gasto");
    expect(sugerenciaParaEgreso("Otro")).toBe("gasto");
  });
  it("lee el panel de la base (numéricos como texto) sin perder nada", () => {
    const p = leerPanel({ total: "202.50", igv: "0", n: 3, por_pagar: "48.00", por_categoria: [{ categoria: "publicidad", nombre: "Publicidad", cuenta: "637", monto: "150", n: 1 }], por_ubicacion: [{ ubicacion_id: null, nombre: "De la empresa", monto: "800", n: 1 }] });
    expect(p.total).toBe(202.5);
    expect(p.porPagar).toBe(48);
    expect(p.porCategoria[0]!.monto).toBe(150);
    expect(p.porUbicacion[0]!.ubicacionId).toBe(null);
  });
});

describe("el papel de un gasto en la lista, también el de un gasto del viaje (ADR-0362, fase 6)", () => {
  // Lo que puede traer `comprobante_tipo`: los tipos de `compras` y los papeles de `gastos_viaje` (los dos candados de la base).
  // `pruebas:gastos-lista-viaje` compara esta misma lista con la base.
  const TODOS: PapelDeGasto[] = ["factura", "boleta", "nota_venta", "recibo_por_honorarios", "sin_comprobante", "ticket", "planilla_movilidad"];
  const fila = (comprobante_tipo: string | null, comprobante: string | null = null) =>
    leerGasto({ id: "g", categoria: "viaje_compra", categoria_nombre: "Viaje de compra", cuenta: "631", descripcion: "Hotel", fecha: "2026-10-14", comprobante_tipo, comprobante });

  it("cada valor que la base puede mandar tiene su texto", () => {
    expect(Object.keys(TEXTO_PAPEL_DE_GASTO).sort()).toEqual([...TODOS].sort());
    for (const t of TODOS) expect(papelDelGasto(fila(t)).tipo).not.toBe("");
  });
  it("con las mismas palabras que la hoja «Gasto del viaje»: quien lo registró reconoce lo que eligió", () => {
    for (const p of Object.keys(TEXTO_PAPEL) as PapelGastoViaje[]) expect(TEXTO_PAPEL_DE_GASTO[p]).toBe(TEXTO_PAPEL[p]);
  });
  it("la factura del hotel dice Factura y su número (antes decía «Sin comprobante»)", () => {
    expect(papelDelGasto(fila("factura", "F001-4321"))).toEqual({ tipo: "Factura", detalle: "F001-4321" });
    expect(papelEnUnaLinea(fila("factura", "F001-4321"))).toBe("Factura F001-4321");
  });
  it("un ticket sin número dice «Ticket o boleto», no «Sin comprobante»", () => {
    expect(papelDelGasto(fila("ticket"))).toEqual({ tipo: "Ticket o boleto", detalle: null });
    expect(papelEnUnaLinea(fila("ticket"))).toBe("Ticket o boleto");
    expect(papelEnUnaLinea(fila("ticket", "0001-552"))).toBe("Ticket o boleto 0001-552");
  });
  it("la planilla de movilidad dice «Sin comprobante» y, debajo, que va en la planilla", () => {
    expect(papelDelGasto(fila("planilla_movilidad"))).toEqual({ tipo: "Sin comprobante", detalle: "Planilla de movilidad" });
    expect(papelEnUnaLinea(fila("planilla_movilidad"))).toBe("Sin comprobante (planilla de movilidad)");
  });
  it("un gasto de Finanzas se dice igual que antes", () => {
    expect(papelDelGasto(fila(null))).toEqual({ tipo: "Sin comprobante", detalle: null });
    expect(papelEnUnaLinea(fila(null))).toBe("Sin comprobante");
    expect(papelEnUnaLinea(fila("boleta", "B001-9"))).toBe("Boleta B001-9");
    expect(papelEnUnaLinea(fila("recibo_por_honorarios", "E001-3"))).toBe("Recibo por honorarios E001-3");
  });
  it("un valor que la pantalla no conoce dice «Comprobante», nunca «Sin comprobante»", () => {
    expect(papelDelGasto(fila("liquidacion_de_compra", "L001-1"))).toEqual({ tipo: "Comprobante", detalle: "L001-1" });
  });
  it("trae comprobante todo menos «sin comprobante» y la planilla de movilidad (lo que dice la Caja de un gasto del turno)", () => {
    expect(TODOS.filter((t) => !tieneComprobante(t)).sort()).toEqual(["planilla_movilidad", "sin_comprobante"]);
  });
});

describe("F2b: activos fijos", () => {
  const activo = { ...base, tipo: "muebles", nombre: " Estante en L ", serie: "", vidaUtilMeses: "120", ubicacion: "tru" };
  it("arma lo que pide registrar_activo: el mismo pago que un gasto, más qué es y su vida útil", () => {
    const r = validarActivo(activo, HOY);
    expect(r.ok && r.valor).toMatchObject({ p_ubicacion_id: "tru", p_tipo: "muebles", p_nombre: "Estante en L", p_serie: null, p_vida_util_meses: 120, p_medio_pago: "yape", p_monto_total: 648 });
    expect(r.ok && "p_categoria" in r.valor).toBe(false);
  });
  it("un activo siempre está en una ubicación, no llega con recibo por honorarios y vive de 1 a 50 años", () => {
    expect(validarActivo({ ...activo, ubicacion: "empresa" }, HOY).ok).toBe(false);
    expect(validarActivo({ ...activo, comprobante: "recibo_por_honorarios" }, HOY).ok).toBe(false);
    expect(validarActivo({ ...activo, vidaUtilMeses: "6" }, HOY).ok).toBe(false);
    expect(validarActivo({ ...activo, vidaUtilMeses: "601" }, HOY).ok).toBe(false);
  });
  it("vida útil en palabras", () => {
    expect(textoVidaUtil(120)).toBe("10 años");
    expect(textoVidaUtil(12)).toBe("1 año");
    expect(textoVidaUtil(18)).toBe("1 año y 6 meses");
  });
  it("los totales cuentan solo lo que está en uso, y lo que ya acabó su vida no suma al mes", () => {
    const a = { estado: "activo", costo: 2000, depreciacionAcumulada: 50, valorHoy: 1950, depreciacionMensual: 16.67, mesesDepreciados: 3, vidaUtilMeses: 120 };
    const acabado = { ...a, costo: 1200, depreciacionAcumulada: 1200, valorHoy: 0, depreciacionMensual: 100, mesesDepreciados: 12, vidaUtilMeses: 12 };
    const baja = { ...a, estado: "baja" };
    expect(totalesActivos([a, acabado, baja] as never)).toEqual({ costo: 3200, depreciado: 1250, valorHoy: 1950, alMes: 16.67, enUso: 2 });
  });
  it("con la factura pagada no se anula: se da de baja", () => {
    expect(puedeAnularActivo({ estado: "activo", compraId: "c", tienePagos: true })).toBe(false);
    expect(puedeAnularActivo({ estado: "activo", compraId: "c", tienePagos: false })).toBe(true);
    expect(puedeAnularActivo({ estado: "baja", compraId: null, tienePagos: false })).toBe(false);
  });
  it("la vista integrada: una fila por sede (aun sin activos) y el total de CAYLA, solo de lo que está en uso", () => {
    const base = { estado: "activo", costo: 1000, depreciacionAcumulada: 100, valorHoy: 900, depreciacionMensual: 10, mesesDepreciados: 10, vidaUtilMeses: 120 };
    const activos = [
      { ...base, ubicacionId: "taller", costo: 2928, depreciacionAcumulada: 317.2, valorHoy: 2610.8, depreciacionMensual: 24.4 },
      { ...base, ubicacionId: "taller" },
      { ...base, ubicacionId: "tru", costo: 1899, depreciacionAcumulada: 0, valorHoy: 1899, depreciacionMensual: 15.83, mesesDepreciados: 0 },
      { ...base, ubicacionId: "tru", estado: "baja" }, // dada de baja: no cuenta
      { ...base, ubicacionId: "tru", estado: "anulado" }, // anulada: no cuenta
    ];
    const sedes = [
      { id: "taller", nombre: "Taller" },
      { id: "lim", nombre: "Tienda LIM" },
      { id: "tru", nombre: "Tienda TRU" },
    ];
    const r = resumenActivosPorSede(activos as never, sedes);
    expect(r.porSede.map((s) => s.nombre)).toEqual(["Taller", "Tienda LIM", "Tienda TRU"]); // el orden que se le pasa
    expect(r.porSede[0]).toMatchObject({ ubicacionId: "taller", activos: 2, costo: 3928, depreciado: 417.2, valorHoy: 3510.8 });
    expect(r.porSede[1]).toMatchObject({ ubicacionId: "lim", activos: 0, costo: 0, depreciado: 0, valorHoy: 0, alMes: 0 }); // se ve lo que falta cargar
    expect(r.porSede[2]).toMatchObject({ activos: 1, costo: 1899, valorHoy: 1899 });
    // el total es la suma de las sedes, ni una más ni una menos
    expect(r.total.activos).toBe(r.porSede.reduce((n, s) => n + s.activos, 0));
    expect(r.total.costo).toBeCloseTo(r.porSede.reduce((n, s) => n + s.costo, 0), 2);
    expect(r.total.valorHoy).toBeCloseTo(r.porSede.reduce((n, s) => n + s.valorHoy, 0), 2);
    expect(resumenActivosPorSede([], sedes).total).toEqual({ activos: 0, costo: 0, depreciado: 0, valorHoy: 0, alMes: 0 });
  });
  it("«ya lo teníamos» (ADR-0335): la lista lo marca y, sin comprobante ni pagos, se puede anular para corregirlo", () => {
    const fila = { id: "a1", ubicacion_id: "taller", ubicacion_nombre: "Taller", nombre: "Remalladora", fecha_adquisicion: "2025-10-13", costo: "1337.70", vida_util_meses: 120, estado: "activo" };
    const cargado = leerActivo({ ...fila, carga_inicial: true });
    expect(cargado.cargaInicial).toBe(true);
    expect(cargado.compraId).toBeNull();
    expect(cargado.medioPago).toBeNull();
    expect(puedeAnularActivo(cargado)).toBe(true);
    // una base que todavía no tiene la columna (antes de pegar la migración) no lo marca ni se cae
    expect(leerActivo(fila).cargaInicial).toBe(false);
  });
});

describe("F2b: gastos fijos", () => {
  const fijo = {
    id: "f1", ubicacionId: "tru", ubicacionNombre: "Tienda Trujillo", categoria: "servicios_basicos", categoriaNombre: "Servicios básicos",
    descripcion: "Luz", proveedorId: "p1", proveedorNombre: "Hidrandina", comprobanteTipo: "boleta" as const, monto: 180, montoVariable: true,
    diaDelMes: 10, momento: "dia" as const, fechaEsperada: "2026-09-10", estado: "falta" as const, gastoId: null, gastoMonto: null,
    diasAntes: 0, fechaPago: "2026-09-10", tocaPagar: false,
  };
  it("un gasto que nace de un fijo trae su tienda, categoría, proveedor y comprobante; si el monto varía, no lo inventa", () => {
    expect(borradorDesdeFijo(fijo, HOY)).toEqual({ gastoFijoId: "f1", ubicacion: "tru", categoria: "servicios_basicos", descripcion: "Luz", comprobante: "boleta", proveedorId: "p1", monto: "", fecha: "2026-09-10" });
    expect(borradorDesdeFijo({ ...fijo, montoVariable: false, fechaEsperada: "2026-09-28" }, HOY)).toMatchObject({ monto: "180", fecha: HOY });
  });
  it("el gasto que nace de un fijo manda su fijo a la base", () => {
    const r = validarGasto({ ...base, gastoFijoId: "f1" }, HOY);
    expect(r.ok && r.valor.p_gasto_fijo_id).toBe("f1");
    expect(validarGasto(base, HOY).ok && "p_gasto_fijo_id" in (validarGasto(base, HOY) as { valor: object }).valor).toBe(false);
  });
  it("el resumen del mes: cuántos faltan, cuántos vienen y cuánto queda por registrar", () => {
    const vienen = { ...fijo, id: "f2", estado: "por_llegar" as const, monto: 2500 };
    const listo = { ...fijo, id: "f3", estado: "registrado" as const };
    expect(resumenFijos([fijo, vienen, listo])).toEqual({ faltan: 1, vienen: 1, registrados: 1, montoPendiente: 2680 });
  });
  it("el día va del 1 al 28 y el monto es obligatorio", () => {
    const b = { ubicacion: "tru", categoria: "alquileres", descripcion: "Alquiler", proveedorId: "", comprobante: "factura" as const, monto: "2500", variable: false, dia: "1", momento: "dia" as const, diasAntes: null };
    expect(validarFijo(b).ok && validarFijo(b)).toMatchObject({ valor: { p_ubicacion_id: "tru", p_proveedor_id: null, p_dia_del_mes: 1, p_monto: 2500 } });
    expect(validarFijo({ ...b, dia: "31" }).ok).toBe(false);
    expect(validarFijo({ ...b, monto: "" }).ok).toBe(false);
    expect(validarFijo({ ...b, ubicacion: "empresa" }).ok && validarFijo({ ...b, ubicacion: "empresa" })).toMatchObject({ valor: { p_ubicacion_id: null } });
  });
  it("cuándo vence (ADR-0440, ADR-0487): un día fijo no manda p_momento; los otros tres mandan su momento y su día de respaldo", () => {
    const b = { ubicacion: "tru", categoria: "alquileres", descripcion: "Alquiler", proveedorId: "", comprobante: "factura" as const, monto: "2500", variable: false, dia: "", momento: "dia" as const, diasAntes: null };
    expect(validarFijo(b).ok).toBe(false); // «un día fijo» sin día
    const conDia = validarFijo({ ...b, dia: "12" });
    expect(conDia.ok && "p_momento" in conDia.valor).toBe(false);
    for (const [momento, dia] of [["primera_semana", 7], ["quincena", 15], ["fin_de_mes", 28]] as const) {
      // el día escrito antes de cambiar de opción se ignora
      expect(validarFijo({ ...b, momento, dia: "3" })).toMatchObject({ ok: true, valor: { p_momento: momento, p_dia_del_mes: dia } });
    }
    expect(validarFijo({ ...b, dia: "31" })).toMatchObject({ ok: false, error: expect.stringContaining("A fin de mes") });
  });
  it("cada momento tiene su texto y su ayuda", () => {
    for (const m of MOMENTOS_FIJO) expect(TEXTO_MOMENTO_FIJO[m]).toBeTruthy();
    for (const m of MOMENTOS_FIJO) expect(AYUDA_MOMENTO_FIJO[m]).toMatch(/vence|Vence/);
    expect(AYUDA_MOMENTO_FIJO.fin_de_mes).toContain("28, 29, 30 o 31");
    expect(AYUDA_MOMENTO_FIJO.quincena).toContain("no si no sabes el día");
  });
  it("lee el momento de la base y, sin la columna o con un valor raro, cuenta como un día fijo", () => {
    const fila = { id: "f1", categoria: "alquileres", categoria_nombre: "Alquileres", descripcion: "Alquiler", comprobante_tipo: "factura", monto: "2500", dia_del_mes: 28, fecha_esperada: "2026-09-30", estado: "por_llegar" };
    expect(leerFijoMes({ ...fila, momento: "fin_de_mes" }).momento).toBe("fin_de_mes");
    expect(leerFijoMes(fila).momento).toBe("dia");
    expect(leerFijoMes({ ...fila, momento: "el_30" }).momento).toBe("dia");
  });
  it("dice cuándo vence con palabras de tienda", () => {
    expect(textoCuandoVence("dia", 10)).toBe("el día 10");
    expect(textoCuandoVence("primera_semana", 7)).toBe("la primera semana");
    expect(textoCuandoVence("quincena", 15)).toBe("la quincena");
    expect(textoCuandoVence("fin_de_mes", 28)).toBe("a fin de mes");
    expect(textoColumnaCuando("dia", 10)).toBe("10");
    expect(textoColumnaCuando("fin_de_mes", 28)).toBe("Fin de mes");
  });
  it("pagar antes (ADR-0487): sin la columna en la base no se manda; con ella siempre va explícito, también el 0", () => {
    const b = { ubicacion: "tru", categoria: "luz", descripcion: "Luz", proveedorId: "", comprobante: "boleta" as const, monto: "180", variable: true, dia: "12", momento: "dia" as const };
    const sin = validarFijo({ ...b, diasAntes: null });
    expect(sin.ok && "p_dias_antes" in sin.valor).toBe(false);
    expect(validarFijo({ ...b, diasAntes: "3" })).toMatchObject({ ok: true, valor: { p_dias_antes: 3 } });
    expect(validarFijo({ ...b, diasAntes: "0" })).toMatchObject({ ok: true, valor: { p_dias_antes: 0 } });
    expect(validarFijo({ ...b, diasAntes: "  " })).toMatchObject({ ok: true, valor: { p_dias_antes: 0 } }); // vacío = el mismo día
    expect(validarFijo({ ...b, diasAntes: "30" })).toMatchObject({ ok: true, valor: { p_dias_antes: 30 } });
  });
  it("pagar antes: más de 30, negativo o con decimales se rechaza con su razón (el mismo tope que la base)", () => {
    const b = { ubicacion: "tru", categoria: "luz", descripcion: "Luz", proveedorId: "", comprobante: "boleta" as const, monto: "180", variable: true, dia: "12", momento: "dia" as const };
    for (const malo of ["31", "45", "-1", "2.5", "tres"]) expect(validarFijo({ ...b, diasAntes: malo }), malo).toMatchObject({ ok: false, error: expect.stringContaining("de 0 a 30") });
  });
  it("dice cuánto antes se paga y desde cuándo, sin hacer la cuenta a la persona", () => {
    expect(textoDiasAntes(0)).toBe("el mismo día");
    expect(textoDiasAntes(1)).toBe("1 día antes");
    expect(textoDiasAntes(3)).toBe("3 días antes");
    expect(textoPagarDesde("dia", 15, 3)).toBe("desde el día 12");
    expect(textoPagarDesde("quincena", 15, 3)).toBe("desde el día 12");
    expect(textoPagarDesde("primera_semana", 7, 3)).toBe("desde el día 4");
    expect(textoPagarDesde("fin_de_mes", 28, 3)).toBe("3 días antes de fin de mes");
    expect(textoPagarDesde("dia", 2, 5)).toBe("desde fines del mes anterior");
    expect(textoPagarDesde("dia", 15, 0)).toBeNull();
    expect(textoPagarDesde("dia", Number.NaN, 3)).toBeNull(); // «un día fijo» todavía sin día escrito
  });
  it("lee «pagar antes» de la base y, sin la columna, queda en null (el campo no se pide)", () => {
    const fila = { id: "f1", categoria: "luz", categoria_nombre: "Luz", descripcion: "Luz", comprobante_tipo: "boleta", monto: "180", dia_del_mes: 15, momento: "quincena", fecha_esperada: "2026-10-15", estado: "por_llegar" };
    expect(leerFijoMes(fila)).toMatchObject({ diasAntes: null, fechaPago: null, tocaPagar: false });
    expect(leerFijoMes({ ...fila, dias_antes: 3, fecha_pago: "2026-10-12", toca_pagar: true })).toMatchObject({ diasAntes: 3, fechaPago: "2026-10-12", tocaPagar: true });
    expect(leerFijoMes({ ...fila, dias_antes: 0, fecha_pago: "2026-10-15", toca_pagar: false })).toMatchObject({ diasAntes: 0, tocaPagar: false });
  });
});

describe("el IGV perdido por pagar sin banco (ADR-0362, fase 6, decisión 76)", () => {
  // El hotel del banco de pruebas (ejemplo inventado): S/ 2 360 con factura F001-4321, IGV 360, pagado en efectivo el 14 de octubre.
  const gasto = (igv: number, monto_total = 2360, fecha = "2026-10-14", extra: Record<string, unknown> = {}): GastoFila =>
    leerGasto({ id: "hotel", categoria: "viaje_compra", categoria_nombre: "Viaje de compra", cuenta: "631", descripcion: "Hotel", fecha, monto_total, igv, ...extra });
  const pago = (gasto_id: string, fecha: string, igv: string | number, monto: string | number, como = "efectivo") => ({
    gasto_id,
    pago_id: `${gasto_id}-${fecha}`,
    fecha,
    igv,
    monto,
    como,
  });
  const [hotel] = conIgvPerdido([gasto(360)], [pago("hotel", "2026-10-14", "360.00", "2360.00")]);
  const [alquiler] = conIgvPerdido([gasto(360)], [pago("hotel", "2026-10-12", 180, 1180)]);

  it("une a cada gasto sus pagos sin banco, del más viejo al más nuevo; el que no tiene, queda igual", () => {
    const [a, b] = conIgvPerdido(
      [gasto(360), { ...gasto(180, 1180), id: "otro" }],
      [pago("hotel", "2026-11-03", 120, 786.67), pago("hotel", "2026-10-14", "120.00", "786.67"), pago("nadie", "2026-10-14", 50, 400)],
    );
    expect(a!.igvPerdido).toBe(240);
    expect(a!.pagosSinBanco.map((p) => p.fecha)).toEqual(["2026-10-14", "2026-11-03"]);
    expect(b!.igvPerdido).toBe(0);
    expect(b!.pagosSinBanco).toEqual([]);
    expect(leerGasto({ id: "x", igv: "18" }).igvPerdido).toBe(0);
  });
  it("lo perdido nunca pasa del IGV del gasto (el redondeo de cada pago podría sumar un céntimo de más)", () => {
    const [g] = conIgvPerdido([gasto(360)], [pago("hotel", "2026-10-01", 120.01, 786.67), pago("hotel", "2026-10-02", 120, 786.67), pago("hotel", "2026-10-03", 120, 786.66)]);
    expect(g!.igvPerdido).toBe(360);
    expect(igvDelGasto(g!)).toEqual({ descontable: 0, perdido: 360 });
  });
  it("la fila, en dos renglones: el IGV de la factura como siempre y, debajo, lo perdido (sin ambigüedad: «¿180 era todo el IGV?»)", () => {
    expect(igvBajoElMonto(gasto(360))).toEqual({ igv: "IGV S/\u00a0360.00", perdido: null });
    expect(igvBajoElMonto(hotel!)).toEqual({ igv: "IGV S/\u00a0360.00", perdido: "perdido S/\u00a0360.00" });
    expect(igvBajoElMonto(alquiler!)).toEqual({ igv: "IGV S/\u00a0360.00", perdido: "perdido S/\u00a0180.00" });
    expect(igvBajoElMonto(gasto(0, 50))).toBe(null);
  });
  it("cada renglón de la fila es corto (no ensancha la columna Monto como «IGV S/ 180.00 · perdido S/ 180.00»)", () => {
    const { igv, perdido } = igvBajoElMonto(alquiler!)!;
    expect(Math.max(igv.length, perdido!.length)).toBeLessThanOrEqual("perdido S/ 1,800.00".length);
  });
  it("lo descontable y lo perdido siempre suman el IGV del gasto", () => {
    for (const perdido of [0, 0.01, 76.27, 180, 359.99, 360]) {
      const [g] = conIgvPerdido([gasto(360)], perdido ? [pago("hotel", "2026-10-14", perdido, 1)] : []);
      const { descontable, perdido: p } = igvDelGasto(g!);
      expect(Math.round((descontable + p) * 100) / 100).toBe(360);
    }
  });
  it("el detalle dice cuánto, cómo y cuándo: el hotel pagado en efectivo el 14 oct", () => {
    expect(textoIgvPerdido(hotel!)).toBe("S/\u00a0360.00 · se pagó en efectivo el 14 oct");
    const [fondo] = conIgvPerdido([gasto(360)], [pago("hotel", "2026-10-14", 360, 2360, "fondo")]);
    expect(textoIgvPerdido(fondo!)).toBe("S/\u00a0360.00 · se pagó desde un fondo el 14 oct");
    expect(textoIgvPerdido(gasto(360))).toBe(null);
  });
  it("el detalle de una factura pagada en partes separa los dos montos con palabras («del pago de»), o dice cuántos pagos y cuándo", () => {
    expect(textoIgvPerdido(alquiler!)).toBe("S/\u00a0180.00 · del pago de S/\u00a01,180.00 en efectivo (12 oct)");
    const [dos] = conIgvPerdido([gasto(360)], [pago("hotel", "2026-10-14", 120, 786.67), pago("hotel", "2026-10-03", 120, 786.67, "fondo")]);
    expect(textoIgvPerdido(dos!)).toBe("S/\u00a0240.00 · de 2 pagos sin banco (3 oct y 14 oct)");
    const [tres] = conIgvPerdido([gasto(360)], ["2026-10-03", "2026-10-09", "2026-10-14"].map((f) => pago("hotel", f, 100, 655.56)));
    expect(textoIgvPerdido(tres!)).toBe("S/\u00a0300.00 · de 3 pagos en efectivo (3 oct, 9 oct y 14 oct)");
  });
  it("la fecha de un pago de otro año lleva su año", () => {
    const [g] = conIgvPerdido([gasto(360, 2360, "2026-12-20")], [pago("hotel", "2027-01-05", 360, 2360)]);
    expect(textoIgvPerdido(g!)).toBe("S/\u00a0360.00 · se pagó en efectivo el 5 ene 2027");
  });
  it("la nota dice la factura, la regla y el mes del pago con la frase de Impuestos; el mes del último pago va al enlace", () => {
    expect(notaIgvPerdido(hotel!)).toEqual({
      texto:
        "Esta factura es de S/\u00a02,360: desde S/\u00a02,000 se paga por el banco, y SUNAT no deja descontar el IGV de lo que se pagó en efectivo o desde un fondo. Ese IGV ya está restado de lo que descuentas en octubre.",
      mes: "2026-10",
    });
    expect(UMBRAL_BANCARIZACION).toBe(2000);
    expect(notaIgvPerdido(gasto(360))).toBe(null);
  });
  it("la nota aclara que la regla mira la factura aunque el pago sin banco sea menor de S/ 2,000 (la prueba ciega pensó que no le tocaba)", () => {
    expect(notaIgvPerdido(alquiler!)!.texto).toContain("en efectivo o desde un fondo, aunque ese pago sea de menos de S/\u00a02,000. Ese IGV");
    const [dos] = conIgvPerdido([gasto(360, 2360, "2026-09-20")], [pago("hotel", "2026-11-02", 120, 786.67), pago("hotel", "2026-10-05", 120, 786.67)]);
    const n = notaIgvPerdido(dos!)!;
    expect(n.texto).toContain("aunque cada pago sea de menos de S/\u00a02,000. Ese IGV ya está restado de lo que descuentas en octubre y noviembre.");
    expect(n.mes).toBe("2026-11");
    const [diciembre] = conIgvPerdido([gasto(360, 2360, "2026-12-20")], [pago("hotel", "2027-01-05", 360, 2360)]);
    expect(notaIgvPerdido(diciembre!)!.texto).toMatch(/descuentas en enero de 2027\.$/);
  });
  it("lo que falta pagar de una factura a crédito de S/ 2,000 o más tiene su IGV en riesgo; el resto, no", () => {
    const credito = (saldo: number, total = 2360, igv = 360) => gasto(igv, total, "2026-10-02", { compra_id: "c", saldo, condicion: "credito" });
    expect(igvEnRiesgo(credito(1180))).toBe(180);
    expect(igvEnRiesgo(credito(2360))).toBe(360);
    expect(igvEnRiesgo(credito(0))).toBe(0);
    expect(igvEnRiesgo(credito(500, 1180, 180))).toBe(0); // menos de S/ 2,000: la regla no toca
    expect(igvEnRiesgo(credito(1180, 2360, 0))).toBe(0); // sin IGV (una boleta)
    expect(igvEnRiesgo(gasto(360))).toBe(0); // sin comprobante de compra: no hay saldo
    expect(igvEnRiesgo({ ...credito(1180), estado: "anulado" })).toBe(0);
  });
  it("la tarjeta resta lo perdido en el mes del pago y lo dice debajo; sin la clave en la base, dice lo de antes", () => {
    const antes = leerPanel({ igv: "1600.00", boletas: 2 });
    expect(antes.igvPerdido).toEqual({ n: 0, igv: 0, deOtrosMeses: 0 });
    expect(antes.igvDescontable).toBe(1600);
    expect(bajadaIgvDelMes(antes)).toBe("Solo de facturas. 2 boletas sin IGV descontable.");
    const p = leerPanel({ igv: "1600.00", boletas: 2, igv_perdido: { n: 1, igv: "360.00", de_otros_meses: 0 } });
    expect(p.igvDescontable).toBe(1240);
    expect(igvParaLaTarjeta(p)).toBe(1240);
    expect(bajadaIgvDelMes(p)).toBe("Solo de facturas, menos S/\u00a0360 que se pierde por pagar sin banco. 2 boletas sin IGV descontable.");
    const parte = leerPanel({ igv: 900, boletas: 0, igv_perdido: { n: 2, igv: 540, de_otros_meses: 180 } });
    expect(bajadaIgvDelMes(parte)).toBe("Solo de facturas, menos S/\u00a0540 que se pierde por pagar sin banco (S/\u00a0180 de gastos de otros meses). 0 boletas sin IGV descontable.");
    const centimos = leerPanel({ igv: 50, boletas: 0, igv_perdido: { n: 1, igv: 0.4, de_otros_meses: 0 } });
    expect(bajadaIgvDelMes(centimos)).toContain("menos S/\u00a00.40 que se pierde");
  });
  it("la tarjeta nunca dice un negativo: si lo perdido pasa el IGV del mes, dice S/ 0 y que Impuestos resta lo que falta", () => {
    const pasa = leerPanel({ igv: 50, boletas: 1, igv_perdido: { n: 2, igv: 230, de_otros_meses: 180 } });
    expect(pasa.igvDescontable).toBe(-180);
    expect(igvParaLaTarjeta(pasa)).toBe(0);
    expect(solesRedondo(igvParaLaTarjeta(pasa))).toBe("S/\u00a00");
    expect(bajadaIgvDelMes(pasa)).toBe(
      "Se pierde S/\u00a0230 por pagar sin banco (S/\u00a0180 de gastos de otros meses), más que los S/\u00a050 de IGV de las facturas del mes: Impuestos resta los S/\u00a0180 que faltan. 1 boleta sin IGV descontable.",
    );
    const sinFacturas = leerPanel({ igv: 0, boletas: 0, igv_perdido: { n: 1, igv: 180, de_otros_meses: 180 } });
    expect(igvParaLaTarjeta(sinFacturas)).toBe(0);
    expect(bajadaIgvDelMes(sinFacturas)).toBe(
      "Las facturas del mes no traen IGV, y se pierde S/\u00a0180 por pagar sin banco (de gastos de otros meses): Impuestos lo resta este mes. 0 boletas sin IGV descontable.",
    );
  });
  it("la tarjeta nunca dice «S/ -0»: un IGV pagado en partes puede perder un céntimo de más al redondear cada pago", () => {
    const p = leerPanel({ igv: 360, boletas: 0, igv_perdido: { n: 3, igv: 360.01, de_otros_meses: 0 } });
    expect(p.igvDescontable).toBe(-0.01);
    expect(solesRedondo(igvParaLaTarjeta(p))).toBe("S/\u00a00");
    expect(solesRedondo(-0.3)).toBe("S/\u00a00");
    expect(solesRedondo(-180)).toBe("S/\u00a0-180");
  });
  it("el mes del gasto dice cuando su tarjeta cuenta un IGV que se pierde por un pago de otro mes (la fila ya dice «perdido»)", () => {
    const [septiembre] = conIgvPerdido([gasto(360, 2360, "2026-09-20")], [pago("hotel", "2026-10-05", 180, 1180)]);
    const [mismoMes] = conIgvPerdido([{ ...gasto(360, 2360, "2026-09-10"), id: "luz" }], [pago("luz", "2026-09-12", 360, 2360)]);
    const anulado = { ...septiembre!, id: "anulado", estado: "anulado" as const };
    const otro = perdidoEnOtroMes([septiembre!, mismoMes!, anulado], "2026-09");
    expect(otro).toEqual({ igv: 180, meses: ["2026-10"] });
    const p = leerPanel({ igv: 720, boletas: 0, igv_perdido: { n: 1, igv: 360, de_otros_meses: 0 } });
    expect(bajadaIgvDelMes({ ...p, mes: "2026-09" }, otro)).toBe(
      "Solo de facturas, menos S/\u00a0360 que se pierde por pagar sin banco. Incluye S/\u00a0180 que se pierde por un pago sin banco de octubre: Impuestos lo resta en ese mes. 0 boletas sin IGV descontable.",
    );
    expect(perdidoEnOtroMes([mismoMes!], "2026-09")).toEqual({ igv: 0, meses: [] });
    const varios = perdidoEnOtroMes(
      conIgvPerdido([gasto(360, 2360, "2026-12-20")], [pago("hotel", "2027-01-05", 120, 786.67), pago("hotel", "2027-02-03", 120, 786.67)]),
      "2026-12",
    );
    expect(bajadaIgvDelMes({ ...leerPanel({ igv: 360, boletas: 0 }), mes: "2026-12" }, varios)).toContain(
      "Incluye S/\u00a0240 que se pierde por pagos sin banco de enero de 2027 y febrero de 2027: Impuestos lo resta en esos meses.",
    );
  });
});

// /chaos de Finanzas 2026-10-14 (ADR-0412): un gasto llega hasta S/ 1 000 000, el mismo tope de la base (`gastos_monto_con_tope`).
describe("el monto de un gasto tiene tope", () => {
  it("un millón entra; un sol más, no", () => {
    expect(validarGasto({ ...base, monto: "1,000,000" }, HOY).ok).toBe(true);
    const r = validarGasto({ ...base, monto: "1000000.01" }, HOY);
    expect(r).toEqual({ ok: false, error: "El monto pasa de S/\u00a01 000 000: revisa que no sobre un cero." });
  });
  it("el 9 pegado de /chaos", () => {
    expect(validarGasto({ ...base, monto: "99999999" }, HOY).ok).toBe(false);
  });
});
