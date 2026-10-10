import { describe, expect, it } from "vitest";
import {
  ESTADO_ORDEN,
  POR_REPARTIR_LISTA,
  TODAS,
  argsLista,
  conteoDeDestino,
  filtrosDeLista,
  fraseDestino,
  generadasDe,
  hrefLista,
  leerDetalleOrden,
  leerFilaOrden,
  leerFilasOrdenes,
  leerResumen,
  numeroOrdenCompra,
  paginaDeOrdenes,
  paramsDeLista,
  problemaDeMotivo,
  pildorasDeDestino,
  textoDestino,
  vacioDeLista,
} from "./ordenes-compra-reglas";

const LIMA = "0b6f1c2e-0000-4000-8000-0000000000b2";
const TRU = "0b6f1c2e-0000-4000-8000-0000000000b1";
const CTX_LISTA = { sedeActual: LIMA, destinos: [LIMA, TRU] };

describe("filtrosDeLista: la lista arranca en la sede donde se trabaja (decisión 37)", () => {
  it("sin destino en la URL, la sede actual; si no es una tienda de la lista (el Taller, CAYLA Global), todas", () => {
    expect(filtrosDeLista({}, CTX_LISTA).destino).toBe(LIMA);
    expect(filtrosDeLista({}, { sedeActual: "taller", destinos: [LIMA, TRU] }).destino).toBe(TODAS);
    expect(filtrosDeLista({}, { sedeActual: null, destinos: [LIMA] }).destino).toBe(TODAS);
  });
  it("respeta lo elegido: todas, por repartir u otra tienda; un destino raro vuelve a la sede", () => {
    expect(filtrosDeLista({ destino: TODAS }, CTX_LISTA).destino).toBe(TODAS);
    expect(filtrosDeLista({ destino: POR_REPARTIR_LISTA }, CTX_LISTA).destino).toBe(POR_REPARTIR_LISTA);
    expect(filtrosDeLista({ destino: TRU }, CTX_LISTA).destino).toBe(TRU);
    expect(filtrosDeLista({ destino: "cualquiera" }, CTX_LISTA).destino).toBe(LIMA);
  });
  it("estado, búsqueda y página: lo que no se entiende se ignora", () => {
    expect(filtrosDeLista({ estado: "anulada", q: "  pena ", cursor: "40" }, CTX_LISTA)).toMatchObject({ estado: "anulada", q: "pena", antesDe: 40 });
    expect(filtrosDeLista({ estado: "perdida", cursor: "-3" }, CTX_LISTA)).toMatchObject({ estado: null, antesDe: null });
    expect(filtrosDeLista({ cursor: "0" }, CTX_LISTA).antesDe).toBeNull();
    expect(filtrosDeLista({ q: "x".repeat(200) }, CTX_LISTA).q).toHaveLength(80);
  });
  it("argsLista: «todas» viaja como destino nulo; pide una de más para saber si hay otra página", () => {
    expect(argsLista(filtrosDeLista({ destino: TODAS }, CTX_LISTA))).toEqual({ p_destino: null, p_estado: null, p_busqueda: null, p_antes_de: null, p_limite: 51 });
    expect(argsLista(filtrosDeLista({ destino: POR_REPARTIR_LISTA, q: "OC-12", cursor: "9" }, CTX_LISTA))).toMatchObject({ p_destino: POR_REPARTIR_LISTA, p_busqueda: "OC-12", p_antes_de: 9 });
  });
  it("hrefLista: cambiar un filtro conserva los demás y vuelve a la primera página", () => {
    const f = filtrosDeLista({ destino: TRU, estado: "generada", q: "pena", cursor: "30" }, CTX_LISTA);
    expect(hrefLista(f, { destino: TODAS })).toBe("/compras/ordenes?destino=todas&estado=generada&q=pena");
    expect(hrefLista(f, { estado: null })).toBe(`/compras/ordenes?destino=${TRU}&q=pena`);
    expect(hrefLista(f, { antesDe: 12 })).toBe(`/compras/ordenes?destino=${TRU}&estado=generada&q=pena&cursor=12`);
    expect(paramsDeLista(f)).toEqual({ destino: TRU, estado: "generada", q: "pena" });
    expect(paramsDeLista(filtrosDeLista({ destino: TODAS }, CTX_LISTA))).toEqual({ destino: TODAS, estado: undefined, q: undefined });
  });
  it("paginaDeOrdenes: muestra 50; si llegó la 51, la siguiente página sigue desde el número de la última mostrada", () => {
    const filas = (n: number) => Array.from({ length: n }, (_, i) => ({ numero: 200 - i }));
    expect(paginaDeOrdenes(filas(51))).toEqual({ filas: filas(50), cursorSiguiente: "151" });
    expect(paginaDeOrdenes(filas(50)).cursorSiguiente).toBeNull();
    expect(paginaDeOrdenes([])).toEqual({ filas: [], cursorSiguiente: null });
  });
});

describe("el resumen por destino: las cifras y el número de cada píldora", () => {
  const resumen = leerResumen([
    { ubicacion_destino_id: TRU, destino_nombre: "Tienda Trujillo", generadas: 2, monto_generadas: "615.00", anuladas: 1 },
    { ubicacion_destino_id: null, destino_nombre: null, generadas: 1, monto_generadas: "150.00", anuladas: 0 },
    "fila rara",
  ]);
  it("lee las filas (los montos llegan como texto) y descarta lo que no es una fila", () => {
    expect(resumen).toEqual([
      { destinoId: TRU, destinoNombre: "Tienda Trujillo", generadas: 2, montoGeneradas: 615, anuladas: 1 },
      { destinoId: null, destinoNombre: null, generadas: 1, montoGeneradas: 150, anuladas: 0 },
    ]);
    expect(leerResumen(null)).toEqual([]);
  });
  it("cada píldora cuenta lo de su destino con el estado elegido; «Todas» suma todo", () => {
    expect(conteoDeDestino(resumen, TRU, null)).toBe(3);
    expect(conteoDeDestino(resumen, TRU, "generada")).toBe(2);
    expect(conteoDeDestino(resumen, TRU, "anulada")).toBe(1);
    expect(conteoDeDestino(resumen, POR_REPARTIR_LISTA, null)).toBe(1);
    expect(conteoDeDestino(resumen, LIMA, null)).toBe(0);
    expect(conteoDeDestino(resumen, TODAS, null)).toBe(4);
  });
  it("las generadas y su monto, de un destino o de todos", () => {
    expect(generadasDe(resumen, TODAS)).toEqual({ cantidad: 3, monto: 765 });
    expect(generadasDe(resumen, POR_REPARTIR_LISTA)).toEqual({ cantidad: 1, monto: 150 });
  });
});

describe("las píldoras de «Llega a» y lo que dice la lista vacía", () => {
  const resumen = leerResumen([
    { ubicacion_destino_id: TRU, destino_nombre: "Tienda Trujillo", generadas: 2, monto_generadas: "615.00", anuladas: 1 },
    { ubicacion_destino_id: "vieja", destino_nombre: "Tienda Cusco", generadas: 1, monto_generadas: "80.00", anuladas: 0 },
    { ubicacion_destino_id: null, destino_nombre: null, generadas: 1, monto_generadas: "150.00", anuladas: 0 },
  ]);
  const destinos = [
    { id: LIMA, nombre: "Tienda Lima" },
    { id: TRU, nombre: "Tienda Trujillo" },
  ];
  it("siempre en el mismo orden: Todas las sedes, cada sede por su nombre corto, una sede inactiva con órdenes, Por repartir", () => {
    expect(pildorasDeDestino(destinos, resumen, null)).toEqual([
      { valor: TODAS, texto: "Todas las sedes", conteo: 5 },
      { valor: LIMA, texto: "Lima", conteo: 0 },
      { valor: TRU, texto: "Trujillo", conteo: 3 },
      { valor: "vieja", texto: "Cusco", conteo: 1 },
      { valor: POR_REPARTIR_LISTA, texto: "Por repartir", conteo: 1 },
    ]);
  });
  it("el número sigue al estado elegido; sin resumen, las píldoras salen igual pero sin número", () => {
    expect(pildorasDeDestino(destinos, resumen, "anulada").map((p) => p.conteo)).toEqual([1, 0, 1, 0, 0]);
    expect(pildorasDeDestino(destinos, null, null).map((p) => p.conteo)).toEqual([null, null, null, null]);
  });
  it("sin resultados por los filtros: dice qué se está mirando y deja quitar cada filtro", () => {
    const f = filtrosDeLista({ destino: TRU, estado: "anulada" }, CTX_LISTA);
    expect(vacioDeLista(f, "Tienda Trujillo")).toEqual({
      titulo: "No hay ninguna orden anulada que llegue a Trujillo",
      frase: "Mira las de todas las sedes, o crea una nueva.",
      filtros: [
        { texto: "Trujillo", href: "/compras/ordenes?destino=todas&estado=anulada" },
        { texto: "Anuladas", href: `/compras/ordenes?destino=${TRU}` },
      ],
    });
    expect(vacioDeLista(filtrosDeLista({ destino: POR_REPARTIR_LISTA }, CTX_LISTA), null).titulo).toBe("No hay ninguna orden por repartir");
    expect(vacioDeLista(filtrosDeLista({ destino: TODAS, estado: "generada" }, CTX_LISTA), null)).toMatchObject({
      titulo: "No hay ninguna orden generada",
      frase: "Quita el filtro para ver todas.",
    });
  });
  it("sin resultados por la búsqueda: nombra lo buscado; la búsqueda no va entre los filtros (se borra con su botón)", () => {
    const v = vacioDeLista(filtrosDeLista({ destino: TODAS, q: "Zara" }, CTX_LISTA), null);
    expect(v).toEqual({ titulo: "Ninguna orden coincide con «Zara»", frase: "Busca por el número de la orden o por el nombre del proveedor.", filtros: [] });
  });
});

describe("leerDetalleOrden", () => {
  const DETALLE = {
    id: "0b6f1c2e-0000-4000-8000-000000000001",
    numero: 12,
    estado: "generada",
    proveedor: { id: "p1", nombre: "Confecciones Peña", ruc: "20123456789" },
    destino: { id: TRU, nombre: "Tienda Trujillo" },
    fecha_emision: "2026-10-10",
    fecha_entrega_estimada: "2026-10-13",
    nota: "Llega en fardo",
    creada_por: "Felipe Pereyra",
    creada_en: "2026-10-10T21:50:00+00:00",
    actualizada_por: null,
    actualizada_en: null,
    version: 1,
    anulada_por: null,
    anulada_en: null,
    motivo_anulacion: null,
    lineas: [
      { posicion: 1, categoria_id: "c1", categoria: "Polos", marca_id: "m1", marca: "Kero", descripcion: null, cantidad: 10, precio_unitario: 25.5, descuento: 0, descuento_pct: null, subtotal: 255 },
      { posicion: 2, categoria_id: "c1", categoria: "Polos", marca_id: "m1", marca: "Kero", descripcion: "Manga larga", cantidad: 4, precio_unitario: 100, descuento: 40, descuento_pct: 10, subtotal: 360 },
      { posicion: 3, categoria: "sin id" },
    ],
    unidades: 14,
    total: 615,
  };
  it("lee la orden con sus líneas; una línea rara se descarta", () => {
    const d = leerDetalleOrden(DETALLE);
    expect(d).toMatchObject({ numero: 12, estado: "generada", proveedor: { nombre: "Confecciones Peña", ruc: "20123456789" }, destino: { nombre: "Tienda Trujillo" }, total: 615, unidades: 14 });
    expect(d?.lineas).toHaveLength(2);
    expect(d?.lineas[1]).toMatchObject({ descripcion: "Manga larga", descuento: 40, descuentoPct: 10, subtotal: 360 });
  });
  it("por repartir llega sin destino; sin orden (null, una lista, sin número) no hay detalle", () => {
    expect(leerDetalleOrden({ ...DETALLE, destino: null })?.destino).toBeNull();
    expect(leerDetalleOrden(null)).toBeNull();
    expect(leerDetalleOrden([DETALLE])).toBeNull();
    expect(leerDetalleOrden({ ...DETALLE, numero: null })).toBeNull();
  });
});

// Una fila tal como la devuelve `fn_ordenes_compra` (PostgREST manda los numeric como texto).
const FILA = {
  id: "0b6f1c2e-0000-4000-8000-000000000001",
  numero: 12,
  estado: "generada",
  proveedor_id: "0b6f1c2e-0000-4000-8000-0000000000a1",
  proveedor_nombre: "Confecciones Peña",
  ubicacion_destino_id: "0b6f1c2e-0000-4000-8000-0000000000b1",
  destino_nombre: "Tienda Trujillo",
  fecha_emision: "2026-10-10",
  fecha_entrega_estimada: null,
  lineas: 2,
  unidades: 14,
  total: "615.00",
  creada_por_nombre: "Felipe Pereyra",
  creada_en: "2026-10-10T21:50:00+00:00",
};

describe("numeroOrdenCompra", () => {
  it("escribe el número con su prefijo y seis cifras", () => {
    expect(numeroOrdenCompra(1)).toBe("OC-000001");
    expect(numeroOrdenCompra(12)).toBe("OC-000012");
    expect(numeroOrdenCompra(1234567)).toBe("OC-1234567");
  });
});

describe("textoDestino y fraseDestino", () => {
  it("en una columna «Llega a» dice la tienda o «Por repartir»", () => {
    expect(textoDestino("Tienda Trujillo")).toBe("Tienda Trujillo");
    expect(textoDestino(null)).toBe("Por repartir");
  });
  it("como frase suelta nunca dice «Llega a Por repartir»", () => {
    expect(fraseDestino("Tienda Trujillo")).toBe("Llega a Tienda Trujillo");
    expect(fraseDestino(null)).toBe("Por repartir desde Lima");
  });
});

describe("ESTADO_ORDEN", () => {
  it("tiene texto y tono para cada estado de la fase 1", () => {
    expect(ESTADO_ORDEN.generada).toEqual({ texto: "Generada", tono: "pizarra" });
    expect(ESTADO_ORDEN.anulada).toEqual({ texto: "Anulada", tono: "apagado" });
  });
});

describe("leerFilaOrden", () => {
  it("lee la fila y convierte el total que llega como texto", () => {
    expect(leerFilaOrden(FILA)).toEqual({
      id: FILA.id,
      numero: 12,
      estado: "generada",
      proveedorId: FILA.proveedor_id,
      proveedorNombre: "Confecciones Peña",
      destinoId: FILA.ubicacion_destino_id,
      destinoNombre: "Tienda Trujillo",
      fechaEmision: "2026-10-10",
      fechaEntregaEstimada: null,
      lineas: 2,
      unidades: 14,
      total: 615,
      creadaPorNombre: "Felipe Pereyra",
      creadaEn: FILA.creada_en,
    });
  });

  it("una orden por repartir llega sin destino", () => {
    expect(leerFilaOrden({ ...FILA, ubicacion_destino_id: null, destino_nombre: null })).toMatchObject({ destinoId: null, destinoNombre: null });
  });

  it("descarta lo que no se puede mostrar sin inventar: sin id, sin número, estado desconocido o sin proveedor", () => {
    expect(leerFilaOrden({ ...FILA, id: null })).toBeNull();
    expect(leerFilaOrden({ ...FILA, numero: "doce" })).toBeNull();
    expect(leerFilaOrden({ ...FILA, estado: "perdida" })).toBeNull();
    expect(leerFilaOrden({ ...FILA, proveedor_nombre: "  " })).toBeNull();
    expect(leerFilaOrden(null)).toBeNull();
    expect(leerFilaOrden("fila")).toBeNull();
  });
});

describe("leerFilasOrdenes", () => {
  it("devuelve solo las filas que se pueden mostrar, y nada si la respuesta no es una lista", () => {
    expect(leerFilasOrdenes([FILA, { ...FILA, id: "" }, 7])).toHaveLength(1);
    expect(leerFilasOrdenes(null)).toEqual([]);
    expect(leerFilasOrdenes({ filas: [FILA] })).toEqual([]);
  });
});

describe("problemaDeMotivo: las reglas de anular_orden_compra", () => {
  it("el motivo es obligatorio (vacío o solo espacios no vale) y va hasta 300 letras", () => {
    expect(problemaDeMotivo("")).toBe("Escribe por qué se anula la orden.");
    expect(problemaDeMotivo("   ")).toBe("Escribe por qué se anula la orden.");
    expect(problemaDeMotivo("El proveedor no tenía la tela")).toBeNull();
    expect(problemaDeMotivo("a".repeat(300))).toBeNull();
    expect(problemaDeMotivo("a".repeat(301))).toBe("El motivo va hasta 300 letras.");
  });
});
