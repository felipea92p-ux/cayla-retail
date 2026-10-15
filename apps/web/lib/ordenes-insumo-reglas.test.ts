import { describe, expect, it } from "vitest";
import {
  argsListaInsumo,
  calcularLineaInsumo,
  cantidadConUnidad,
  cifrasDeOrdenesInsumo,
  descuentoPorPctCentimos,
  dudaDeCantidadInsumo,
  dudaDePrecioInsumo,
  filtrosDeListaInsumo,
  hrefListaInsumo,
  hrefOrdenInsumoGuardada,
  importeCentimos,
  leerCantidadInsumo,
  leerCantidades,
  leerDetalleOrdenInsumo,
  leerFilaOrdenInsumo,
  leerFilasOrdenesInsumo,
  leerOpcionesOrdenInsumo,
  leerPrecioInsumo,
  lineasConUnidadCambiada,
  nombreUnidad,
  numeroOrdenInsumo,
  paramsDeListaInsumo,
  precioUnitarioTexto,
  puedeAnularOrdenInsumo,
  puedeEditarOrdenInsumo,
  recienDeInsumo,
  textoCantidades,
  totalCentimosInsumo,
  vacioDeListaInsumo,
  type LineaParaCuenta,
} from "./ordenes-insumo-reglas";

const linea = (o: Partial<LineaParaCuenta> = {}): LineaParaCuenta => ({ cantidad: "1", precio: "10", descuento: "", modoDescuento: "pct", ...o });

describe("la cuenta de una línea es EXACTA como la base (importe = round(cantidad × precio, 2); el % sobre ese importe)", () => {
  it("mil botones a S/ 0.0350 son S/ 35.00, no S/ 40.00 (el precio lleva cuatro decimales: caso CR5b de la prueba de la base)", () => {
    expect(importeCentimos(1_000_000, 350)).toBe(3500);
    expect(calcularLineaInsumo(linea({ cantidad: "1000", precio: "0.0350" }))).toMatchObject({ importeCentimos: 3500, descuentoCentimos: 0, subtotalCentimos: 3500 });
    expect(calcularLineaInsumo(linea({ cantidad: "1000", precio: "0.035" })).subtotalCentimos).toBe(3500);
  });
  it("12.5 m a S/ 13.3333 son S/ 166.67 y el 15 % es S/ 25.00 (no 25.0005): subtotal S/ 141.67 (caso CR5c)", () => {
    expect(importeCentimos(12_500, 133_333)).toBe(16_667);
    expect(descuentoPorPctCentimos(16_667, 150_000)).toBe(2_500);
    expect(calcularLineaInsumo(linea({ cantidad: "12.5", precio: "13.3333", descuento: "15" }))).toMatchObject({
      importeCentimos: 16_667,
      descuentoCentimos: 2_500,
      subtotalCentimos: 14_167,
    });
  });
  it("redondea como Postgres (mitad hacia arriba) y el % va sobre el importe YA redondeado: 0.125 × 1.00 = 0.13; 50 % = 0.07, no 0.06 (caso C1b)", () => {
    expect(importeCentimos(125, 10_000)).toBe(13);
    expect(calcularLineaInsumo(linea({ cantidad: "0.125", precio: "1", descuento: "50" }))).toMatchObject({ importeCentimos: 13, descuentoCentimos: 7, subtotalCentimos: 6 });
  });
  it("los casos de CR1 de la base: 12.505 m a 13.33 con 10 % = 150.02; 4 conos a 5.50 menos S/ 1.50 = 20.50; 99 999.999 conos a 0 = 0", () => {
    expect(calcularLineaInsumo(linea({ cantidad: "12.505", precio: "13.33", descuento: "10" }))).toMatchObject({ importeCentimos: 16_669, descuentoCentimos: 1_667, subtotalCentimos: 15_002 });
    expect(calcularLineaInsumo(linea({ cantidad: "4", precio: "5.50", descuento: "1.50", modoDescuento: "soles" })).subtotalCentimos).toBe(2_050);
    expect(calcularLineaInsumo(linea({ cantidad: "99999.999", precio: "0" })).subtotalCentimos).toBe(0);
    // El total de la orden de CR1: S/ 170.58.
    expect(
      totalCentimosInsumo([
        linea({ cantidad: "12.505", precio: "13.33", descuento: "10" }),
        linea({ cantidad: "4", precio: "5.50", descuento: "1.50", modoDescuento: "soles" }),
        linea({ cantidad: "0.125", precio: "1", descuento: "50" }),
        linea({ cantidad: "99999.999", precio: "0" }),
      ]),
    ).toBe(17_058);
  });
  it("sin desbordarse con lo más grande que acepta la base: 99 999.999 × S/ 99 999.9999 con 99.9999 %", () => {
    const importe = importeCentimos(99_999_999, 999_999_999);
    // 99 999.999 × 99 999.9999 = 9 999 999 890.000 000 1 → S/ 9 999 999 890.00
    expect(importe).toBe(999_999_989_000);
    expect(descuentoPorPctCentimos(importe, 999_999)).toBe(999_998_989_000);
  });
  it("el descuento en soles da su % equivalente, y sin precio no hay importe ni subtotal", () => {
    const c = calcularLineaInsumo(linea({ cantidad: "2", precio: "30", descuento: "5.50", modoDescuento: "soles" }));
    expect(c).toMatchObject({ importeCentimos: 6_000, descuentoCentimos: 550, subtotalCentimos: 5_450 });
    expect(Math.round((c.pctEscalado ?? 0) / 100)).toBe(917); // 9.17 %
    expect(calcularLineaInsumo(linea({ precio: "" }))).toMatchObject({ importeCentimos: null, subtotalCentimos: null });
  });
});

describe("leer lo que se tipea: tres decimales en la cantidad, cuatro en el precio; miles con punto no se adivinan", () => {
  it("la cantidad en milésimas y el precio en diezmilésimas", () => {
    expect(leerCantidadInsumo("12.5")).toEqual({ tipo: "ok", escalado: 12_500 });
    expect(leerCantidadInsumo("12,5")).toEqual({ tipo: "ok", escalado: 12_500 });
    expect(leerCantidadInsumo("0.001")).toEqual({ tipo: "ok", escalado: 1 });
    expect(leerCantidadInsumo("12.505")).toEqual({ tipo: "ok", escalado: 12_505 });
    expect(leerCantidadInsumo("1.2345")).toEqual({ tipo: "mal", motivo: "decimales" });
    expect(leerPrecioInsumo("0.0350")).toEqual({ tipo: "ok", escalado: 350 });
    expect(leerPrecioInsumo("13.3333")).toEqual({ tipo: "ok", escalado: 133_333 });
    expect(leerPrecioInsumo("10.55555")).toEqual({ tipo: "mal", motivo: "decimales" });
  });
  it("«1.000», «1.500», «12.500»: ¿mil o uno? No se adivina (en el Perú así se escribe también mil); «1.5» y «1,500» sí se entienden", () => {
    expect(leerCantidadInsumo("1.000")).toEqual({ tipo: "mal", motivo: "ambiguo" });
    expect(leerCantidadInsumo("1.500")).toEqual({ tipo: "mal", motivo: "ambiguo" });
    expect(leerCantidadInsumo("12.500")).toEqual({ tipo: "mal", motivo: "ambiguo" });
    expect(leerCantidadInsumo("1.5")).toEqual({ tipo: "ok", escalado: 1_500 });
    expect(leerCantidadInsumo("1,500")).toEqual({ tipo: "ok", escalado: 1_500_000 });
    expect(leerPrecioInsumo("1.500")).toEqual({ tipo: "mal", motivo: "ambiguo" });
    expect(leerPrecioInsumo("1.50")).toEqual({ tipo: "ok", escalado: 15_000 });
    // Si la lectura en miles no cabe en la caja, no hay duda: 100 000 metros no se pueden pedir.
    expect(leerCantidadInsumo("100.000")).toEqual({ tipo: "ok", escalado: 100_000 });
  });
  it("la duda se dice con la unidad y las dos lecturas", () => {
    expect(dudaDeCantidadInsumo("1.500", "metro")).toBe("¿«1.500» son 1500 metros o 1.5 metros? Escríbelo sin punto (1500) o así: 1.5.");
    expect(dudaDeCantidadInsumo("1.000", "unidad")).toBe("¿«1.000» son 1000 unidades o 1 unidad? Escríbelo sin punto (1000) o así: 1.");
    expect(dudaDePrecioInsumo("1.500")).toBe("¿«1.500» es S/\u00a01500 o S/\u00a01.50? Escríbelo sin punto (1500) o con dos decimales (1.50).");
  });
});

describe("las unidades: cada una con lo suyo, nunca metros sumados con conos", () => {
  it("singular y plural, como los dice la base; una unidad nueva del catálogo se dice tal cual", () => {
    expect(nombreUnidad("metro", 1)).toBe("metro");
    expect(nombreUnidad("metro", 12.5)).toBe("metros");
    expect(nombreUnidad("unidad")).toBe("unidades");
    expect(nombreUnidad("par", 2)).toBe("pares");
    expect(nombreUnidad("rollo", 3)).toBe("rollo");
    expect(cantidadConUnidad(1000, "unidad")).toBe("1,000 unidades");
    expect(cantidadConUnidad(12.505, "metro")).toBe("12.505 metros");
  });
  it("lee `cantidades` de la base en el orden en que se dicen (lo que se mide primero), y lo escribe «12.5 metros · 4 conos»", () => {
    const c = leerCantidades({ cono: 4, metro: "12.500", docena: 2, raro: "x" });
    expect(c).toEqual([
      { unidad: "metro", cantidad: 12.5 },
      { unidad: "cono", cantidad: 4 },
      { unidad: "docena", cantidad: 2 },
    ]);
    expect(textoCantidades(c)).toBe("12.5 metros · 4 conos · 2 docenas");
    expect(textoCantidades([])).toBe("—");
    expect(leerCantidades(null)).toEqual([]);
  });
  it("el precio con dos decimales si no usa más, con los cuatro si los usa (un botón)", () => {
    expect(precioUnitarioTexto(25.5)).toBe("S/\u00a025.50");
    expect(precioUnitarioTexto(0.035)).toBe("S/\u00a00.0350");
    expect(precioUnitarioTexto(13.3333)).toBe("S/\u00a013.3333");
    expect(precioUnitarioTexto(1250)).toBe("S/\u00a01,250.00");
  });
});

describe("leer la lista y la orden sin confiar en su forma", () => {
  const FILA = {
    id: "8b8a1c4e-0000-4000-8000-000000000001",
    numero: 12,
    estado: "generada",
    proveedor_id: "p1",
    proveedor_nombre: "Hilos del Sur EIRL",
    ubicacion_destino_id: "t1",
    destino_nombre: "Taller",
    fecha_emision: "2026-10-13",
    fecha_entrega_estimada: "2026-10-16",
    lineas: 3,
    cantidades: { metro: 12.5, cono: 4 },
    total: "627.75",
    creada_por_nombre: "Felipe Pereyra",
    creada_en: "2026-10-13T15:00:00Z",
  };
  it("una fila de `fn_ordenes_insumo`: el número OI-, las cantidades por unidad y el total como cifra", () => {
    expect(numeroOrdenInsumo(12)).toBe("OI-000012");
    expect(leerFilaOrdenInsumo(FILA)).toMatchObject({ numero: 12, estado: "generada", lineas: 3, total: 627.75, cantidades: [{ unidad: "metro", cantidad: 12.5 }, { unidad: "cono", cantidad: 4 }] });
    // Una fila rara se descarta, no tumba la lista.
    expect(leerFilasOrdenesInsumo([FILA, { ...FILA, estado: "perdida" }, "x", null])).toHaveLength(1);
    expect(leerFilasOrdenesInsumo(null)).toEqual([]);
  });
  it("el detalle: cabecera, líneas con la unidad de la orden y la de hoy, versiones; null si no es una orden", () => {
    const d = leerDetalleOrdenInsumo({
      id: "o1",
      numero: 7,
      estado: "generada",
      proveedor: { id: "p1", nombre: "Hilos del Sur EIRL", ruc: "20999888771", rubro: "tela" },
      destino: { id: "t1", nombre: "Taller" },
      fecha_emision: "2026-10-13",
      creada_en: "2026-10-13T15:00:00Z",
      version: 2,
      lineas: [
        { posicion: 1, insumo_id: "i1", insumo: "Lino crudo", codigo: "LIN", tipo: "tela", unidad_medida: "metro", unidad_actual: "kilo", cantidad: 10.5, precio_unitario: 25.5, descuento: 0, descuento_pct: null, subtotal: 267.75 },
        { posicion: 2, insumo_id: "i2", insumo: "Hilo", unidad_medida: "cono", unidad_actual: "cono", cantidad: 4, precio_unitario: 100, descuento: 40, descuento_pct: 10, subtotal: 360 },
        { posicion: 3, insumo: "sin id" },
      ],
      cantidades: { metro: 10.5, cono: 4 },
      total: 627.75,
      versiones: [{ version: 1, reemplazada_por: "Felipe", reemplazada_en: "2026-10-13T16:00:00Z", datos: { proveedor: { nombre: "Otro" }, total: 100, lineas: [] } }],
    });
    expect(d).toMatchObject({ numero: 7, version: 2, proveedor: { ruc: "20999888771", rubro: "tela" }, destino: { nombre: "Taller" }, total: 627.75 });
    expect(d?.lineas).toHaveLength(2);
    expect(d?.versiones).toEqual([{ version: 1, reemplazadaPor: "Felipe", reemplazadaEn: "2026-10-13T16:00:00Z", proveedor: "Otro", fechaEntregaEstimada: null, lineas: [], total: 100 }]);
    expect(lineasConUnidadCambiada(d!).map((l) => l.posicion)).toEqual([1]);
    expect(leerDetalleOrdenInsumo(null)).toBeNull();
    expect(leerDetalleOrdenInsumo({ id: "o1" })).toBeNull();
  });
  it("editar y anular: solo una generada (lo mismo que rechaza la base)", () => {
    expect([puedeEditarOrdenInsumo({ estado: "generada" }), puedeAnularOrdenInsumo({ estado: "generada" })]).toEqual([true, true]);
    expect([puedeEditarOrdenInsumo({ estado: "anulada" }), puedeAnularOrdenInsumo({ estado: "anulada" })]).toEqual([false, false]);
  });
  it("las opciones del formulario: lo que no tiene lo justo se descarta; una respuesta que no se entiende es null", () => {
    const o = leerOpcionesOrdenInsumo({
      proveedores: [{ id: "p1", nombre: "Hilos del Sur EIRL", ruc: "20999888771", rubro: "tela" }, { id: "p2" }],
      insumos: [{ id: "i1", codigo: "LIN", nombre: "Lino", tipo: "tela", unidad_medida: "metro", proveedor_id: "p1" }, { id: "i2", nombre: "Sin unidad" }],
      talleres: [{ id: "t1", nombre: "Taller" }],
    });
    expect(o).toEqual({
      proveedores: [{ id: "p1", nombre: "Hilos del Sur EIRL", ruc: "20999888771", rubro: "tela" }],
      insumos: [{ id: "i1", codigo: "LIN", nombre: "Lino", tipo: "tela", unidadMedida: "metro", proveedorId: "p1" }],
      talleres: [{ id: "t1", nombre: "Taller" }],
    });
    expect(leerOpcionesOrdenInsumo({ proveedores: [] })).toBeNull();
    expect(leerOpcionesOrdenInsumo(null)).toBeNull();
  });
});

describe("la lista: los filtros viven en la URL", () => {
  it("estado, búsqueda y página: lo que no se entiende se ignora", () => {
    expect(filtrosDeListaInsumo({ estado: "anulada", q: "  hilos ", cursor: "40" })).toEqual({ estado: "anulada", q: "hilos", antesDe: 40 });
    expect(filtrosDeListaInsumo({ estado: "perdida", cursor: "-3" })).toEqual({ estado: null, q: "", antesDe: null });
    expect(filtrosDeListaInsumo({ q: "x".repeat(200) }).q).toHaveLength(80);
  });
  it("argsListaInsumo pide UNA de más (51) para saber si hay otra página", () => {
    expect(argsListaInsumo(filtrosDeListaInsumo({ q: "OI-12", cursor: "9" }))).toEqual({ p_estado: null, p_proveedor_id: null, p_busqueda: "OI-12", p_limite: 51, p_antes_de: 9 });
  });
  it("hrefListaInsumo: cambiar un filtro conserva los demás y vuelve a la primera página; sin filtros, la ruta sola", () => {
    const f = filtrosDeListaInsumo({ estado: "generada", q: "lino", cursor: "30" });
    expect(hrefListaInsumo(f, { estado: null })).toBe("/ordenes-insumos?q=lino");
    expect(hrefListaInsumo(f, { antesDe: 12 })).toBe("/ordenes-insumos?estado=generada&q=lino&cursor=12");
    expect(hrefListaInsumo(filtrosDeListaInsumo({}))).toBe("/ordenes-insumos");
    expect(paramsDeListaInsumo(f)).toEqual({ estado: "generada", q: "lino" });
  });
  it("después de guardar vuelve a la lista con la orden marcada; un id raro no viaja", () => {
    const id = "8b8a1c4e-0000-4000-8000-000000000001";
    expect(hrefOrdenInsumoGuardada(id)).toBe(`/ordenes-insumos?recien=${id}`);
    expect(hrefOrdenInsumoGuardada("x")).toBe("/ordenes-insumos");
    expect(recienDeInsumo({ recien: id.toUpperCase() })).toBe(id);
    expect(recienDeInsumo({ recien: "x" })).toBeNull();
  });
  it("lo que dice la lista vacía: qué se buscó, y el filtro que se puede quitar", () => {
    expect(vacioDeListaInsumo(filtrosDeListaInsumo({ q: "lino", estado: "anulada" }))).toEqual({
      titulo: "Ninguna orden coincide con «lino»",
      frase: "Busca por el número de la orden, el proveedor o el insumo (su nombre o su código).",
      filtros: [{ texto: "Anuladas", href: "/ordenes-insumos?q=lino" }],
    });
    expect(vacioDeListaInsumo(filtrosDeListaInsumo({ estado: "anulada" })).titulo).toBe("No hay ninguna orden anulada");
  });
});

describe("las cifras de arriba: solo las generadas", () => {
  it("suma las generadas en céntimos y cuenta las que esperan su entrega desde hoy y hasta dentro de 7 días", () => {
    const c = cifrasDeOrdenesInsumo(
      [
        { estado: "generada", total: 0.1, fechaEntregaEstimada: "2026-10-13" },
        { estado: "generada", total: 0.2, fechaEntregaEstimada: "2026-10-20" },
        { estado: "generada", total: 100, fechaEntregaEstimada: "2026-10-21" },
        { estado: "generada", total: 5, fechaEntregaEstimada: "2026-10-12" },
        { estado: "generada", total: 1, fechaEntregaEstimada: null },
        { estado: "anulada", total: 999, fechaEntregaEstimada: "2026-10-14" },
      ],
      "2026-10-13",
    );
    expect(c).toEqual({ generadas: 5, monto: 106.3, entregaEnLaSemana: 2, proximaEntrega: "2026-10-13" });
    expect(cifrasDeOrdenesInsumo([], "2026-10-13")).toEqual({ generadas: 0, monto: 0, entregaEnLaSemana: 0, proximaEntrega: null });
  });
});
