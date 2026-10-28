import { describe, expect, it } from "vitest";
import { leerCategoriasDeProveedor,
  ESTADO_ENVIO,
  ESTADO_ORDEN,
  POR_REPARTIR_LISTA,
  TODAS,
  argsLista,
  avisoDeCorte,
  conteoDeDestino,
  estadoDeEnvioDeOrden,
  filtrosDeLista,
  fraseDestino,
  generadasDe,
  hrefLista,
  hrefOrdenGuardada,
  leerComprobantes,
  leerDetalleOrden,
  leerEnvios,
  leerFilaOrden,
  leerFilasOrdenes,
  leerPorEnviar,
  leerResumen,
  lugarDeLlegada,
  numeroEnvio,
  numeroOrdenCompra,
  paginaDeOrdenes,
  puedeAnularOrden,
  puedeEditarOrden,
  puedeEnviarOrden,
  puedeRegistrarComprobante,
  paramsDeLista,
  problemaDeMotivo,
  pildorasDeDestino,
  recienDe,
  textoEnvioDeLinea,
  textoPapelDeLinea,
  tieneComprobante,
  tieneComprobanteVigente,
  tieneEnvio,
  tieneEnvioVivo,
  textoDestino,
  vacioDeLista,
  vacioEnOtrasSedes,
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
  it("siempre en el mismo orden: Todas las sedes, cada sede por su nombre COMPLETO («Tienda Lima», no «Lima»), una sede inactiva con órdenes, Por repartir", () => {
    expect(pildorasDeDestino(destinos, resumen, null)).toEqual([
      { valor: TODAS, texto: "Todas las sedes", conteo: 5 },
      { valor: LIMA, texto: "Tienda Lima", conteo: 0 },
      { valor: TRU, texto: "Tienda Trujillo", conteo: 3 },
      { valor: "vieja", texto: "Tienda Cusco", conteo: 1 },
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
      titulo: "No hay ninguna orden anulada que llegue a Tienda Trujillo",
      frase: "Mira las de todas las sedes, o crea una nueva.",
      filtros: [
        { texto: "Tienda Trujillo", href: "/compras/ordenes?destino=todas&estado=anulada" },
        { texto: "Anuladas", href: `/compras/ordenes?destino=${TRU}` },
      ],
    });
    expect(vacioDeLista(filtrosDeLista({ destino: POR_REPARTIR_LISTA }, CTX_LISTA), null).titulo).toBe("No hay ninguna orden por repartir");
    expect(vacioDeLista(filtrosDeLista({ destino: TODAS, estado: "generada" }, CTX_LISTA), null)).toMatchObject({
      titulo: "No hay ninguna orden generada",
      frase: "Quita el filtro para ver todas.",
    });
  });
  it("lo buscado está en otra sede: dice dónde y lleva a todas las sedes con la misma búsqueda (Felipe 2026-10-13)", () => {
    const f = filtrosDeLista({ destino: TRU, q: "OC-002783" }, CTX_LISTA);
    expect(vacioEnOtrasSedes(f, [{ destinoNombre: "Tienda Arequipa" }])).toEqual({
      titulo: "«OC-002783» está en Tienda Arequipa",
      frase: "Aquí solo ves las de la sede elegida: míralas en todas las sedes.",
      href: "/compras/ordenes?destino=todas&q=OC-002783",
    });
    expect(vacioEnOtrasSedes(f, [{ destinoNombre: "Tienda Arequipa" }, { destinoNombre: "Tienda Arequipa" }])?.titulo).toBe(
      "Las 2 órdenes con «OC-002783» están en Tienda Arequipa",
    );
    expect(vacioEnOtrasSedes(f, [{ destinoNombre: "Tienda Arequipa" }, { destinoNombre: "Tienda Lima" }, { destinoNombre: null }])).toMatchObject({
      titulo: "Hay 3 órdenes con «OC-002783» en otras sedes",
      frase: "Están en Tienda Arequipa, Tienda Lima y por repartir. Aquí solo ves las de la sede elegida.",
    });
    expect(vacioEnOtrasSedes(f, [{ destinoNombre: null }])?.titulo).toBe("«OC-002783» está por repartir");
    // No corresponde: nada en otras sedes, sin búsqueda, ya en todas o en «Por enviar».
    expect(vacioEnOtrasSedes(f, [])).toBeNull();
    expect(vacioEnOtrasSedes(filtrosDeLista({ destino: TRU }, CTX_LISTA), [{ destinoNombre: "Tienda Lima" }])).toBeNull();
    expect(vacioEnOtrasSedes(filtrosDeLista({ destino: TODAS, q: "Zara" }, CTX_LISTA), [{ destinoNombre: "Tienda Lima" }])).toBeNull();
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
  it("bajo un rótulo «Llega a» dice el lugar, nunca «Llega a» otra vez: la tienda, o Lima para repartir", () => {
    expect(lugarDeLlegada("Tienda Trujillo")).toBe("Tienda Trujillo");
    expect(lugarDeLlegada(null)).toBe("Lima, para repartir");
    expect(lugarDeLlegada("Tienda Trujillo")).not.toMatch(/llega a/i);
  });
});

describe("después de guardar, la lista muestra la orden (Formidable, 2026-10-10)", () => {
  const ID = "6f1c2e0b-1111-4222-8333-444455556666";
  it("vuelve a la lista filtrada en el destino de ESA orden, con ella marcada", () => {
    expect(hrefOrdenGuardada(TRU, ID)).toBe(`/compras/ordenes?destino=${TRU}&recien=${ID}`);
    expect(hrefOrdenGuardada(null, ID)).toBe(`/compras/ordenes?destino=${POR_REPARTIR_LISTA}&recien=${ID}`);
  });
  it("un id raro no viaja en la URL y la lista no marca nada", () => {
    expect(hrefOrdenGuardada(TRU, "<script>")).toBe(`/compras/ordenes?destino=${TRU}`);
    expect(recienDe({ recien: ID })).toBe(ID);
    expect(recienDe({ recien: ID.toUpperCase() })).toBe(ID);
    expect(recienDe({ recien: "x" })).toBeNull();
    expect(recienDe({})).toBeNull();
  });
  it("la marca no es un filtro: cambiar un filtro la quita", () => {
    const f = filtrosDeLista({ destino: TRU, recien: ID }, CTX_LISTA);
    expect(hrefLista(f, { estado: "generada" })).not.toContain("recien");
    expect(paramsDeLista(f)).not.toHaveProperty("recien");
  });
});

describe("avisoDeCorte: la señal se cortó al guardar (Formidable, 2026-10-10)", () => {
  it("nunca dice que no se guardó nada: dice que no se sabe, qué botón pulsar y que se reintente sin cambiar nada", () => {
    for (const [accion, boton] of [
      ["crear", "«Guardar orden»"],
      ["editar", "«Guardar cambios»"],
      ["anular", "«Anular orden»"],
    ] as const) {
      const aviso = avisoDeCorte(accion);
      expect(aviso).toContain("no sabemos si");
      expect(aviso).toContain(boton);
      expect(aviso).not.toMatch(/no se guardó nada/i);
      expect(aviso).toMatch(/sin cambiar nada|con el mismo motivo/);
    }
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

// ---------------------------------------------------------------------------------------------------------------------------------
// Fase 2: el papel de la orden (comprobantes). Todo llega con tolerancia: una base que todavía no los cuenta no rompe la orden abierta.
// ---------------------------------------------------------------------------------------------------------------------------------

describe("leerDetalleOrden con comprobantes (fase 2)", () => {
  const BASE = {
    id: "0b6f1c2e-0000-4000-8000-000000000001",
    numero: 12,
    estado: "generada",
    proveedor: { id: "p1", nombre: "Confecciones Peña", ruc: "20123456789" },
    destino: { id: TRU, nombre: "Tienda Trujillo" },
    fecha_emision: "2026-10-10",
    creada_en: "2026-10-10T21:50:00+00:00",
    lineas: [{ id: "i1", posicion: 1, categoria_id: "c1", categoria: "Polos", marca_id: "m1", marca: "Kero", cantidad: 10, precio_unitario: 25.5, subtotal: 255 }],
  };
  const NUEVA = {
    ...BASE,
    lineas: [{ ...BASE.lineas[0], facturado: 8, pendiente: 2 }, { ...BASE.lineas[0], id: "i2", posicion: 2, facturado: "12", pendiente: -2 }],
    papel: "en_parte",
    comprobantes: [
      { id: "k2", documento: "F001-124", tipo: "factura", condicion: "credito", fecha_emision: "2026-10-12", total: "1486.80", saldo: 1486.8, estado: "vigente", estado_pago: "pendiente" },
      { id: "k1", documento: "B001-9", tipo: "boleta", condicion: "contado", fecha_emision: "2026-10-11", total: 100, saldo: 0, estado: "anulada", estado_pago: "anulada" },
      { id: "", documento: "sin id" },
      "raro",
    ],
  };
  it("lee por línea su id, lo facturado y lo pendiente (nunca menos de cero), y los comprobantes del más reciente al más antiguo", () => {
    const d = leerDetalleOrden(NUEVA)!;
    expect(d.papel).toBe("en_parte");
    expect(d.lineas[0]).toMatchObject({ id: "i1", facturado: 8, pendiente: 2 });
    expect(d.lineas[1]).toMatchObject({ id: "i2", facturado: 12, pendiente: 0 });
    expect(d.comprobantes).toEqual([
      { id: "k2", documento: "F001-124", tipo: "factura", condicion: "credito", fechaEmision: "2026-10-12", total: 1486.8, saldo: 1486.8, estado: "vigente", estadoPago: "pendiente" },
      { id: "k1", documento: "B001-9", tipo: "boleta", condicion: "contado", fechaEmision: "2026-10-11", total: 100, saldo: 0, estado: "anulada", estadoPago: "anulada" },
    ]);
  });
  it("una base que todavía no los cuenta: la orden se lee igual, sin ids, sin papel y sin comprobantes", () => {
    const d = leerDetalleOrden(BASE)!;
    expect(d.papel).toBeNull();
    expect(d.comprobantes).toEqual([]);
    expect(d.lineas[0]).toMatchObject({ id: "i1", facturado: null, pendiente: null });
    const sinId = leerDetalleOrden({ ...BASE, lineas: [{ ...BASE.lineas[0], id: undefined }] })!;
    expect(sinId.lineas[0]!.id).toBeNull();
    expect(leerDetalleOrden({ ...BASE, papel: "inventado" })!.papel).toBeNull();
    expect(leerComprobantes(undefined)).toEqual([]);
    expect(leerComprobantes({ no: "es lista" })).toEqual([]);
  });
});

describe("qué se puede hacer con una orden que ya tiene (o no) papel", () => {
  const tru = { id: TRU, nombre: "Tienda Trujillo" };
  const linea = { id: "i1" } as { id: string | null };
  const vigente = { id: "k1", documento: "F001-1", tipo: "factura", condicion: "credito", fechaEmision: null, total: 1, saldo: 1, estado: "vigente", estadoPago: "pendiente" };
  const anulado = { ...vigente, id: "k2", estado: "anulada", estadoPago: "anulada" };
  const orden = (o: object = {}) => ({ estado: "generada" as const, destino: tru, papel: "sin_comprobante" as const, lineas: [linea] as never, comprobantes: [], deudaDe: null, ...o });

  it("«Registrar comprobante»: una generada con «Llega a» cuya base ya sabe de comprobantes, aun con todo el papel completo", () => {
    expect(puedeRegistrarComprobante(orden())).toBe(true);
    expect(puedeRegistrarComprobante(orden({ papel: "en_parte" }))).toBe(true);
    expect(puedeRegistrarComprobante(orden({ papel: "completa" }))).toBe(true);
  });
  it("una «Por repartir» se ofrece solo si la base ya dice de qué sede queda la deuda (decisión 46: la de quien hizo la orden)", () => {
    expect(puedeRegistrarComprobante(orden({ destino: null, deudaDe: { id: "lim", nombre: "Tienda Lima" } }))).toBe(true);
    expect(puedeRegistrarComprobante(orden({ destino: null, deudaDe: null }))).toBe(false);
  });
  it("no se ofrece en una anulada, en una «Por repartir» con una base de la fase 2, con una base que no conoce el papel, sin líneas o con líneas sin id", () => {
    expect(puedeRegistrarComprobante(orden({ estado: "anulada" }))).toBe(false);
    expect(puedeRegistrarComprobante(orden({ destino: null }))).toBe(false);
    expect(puedeRegistrarComprobante(orden({ papel: null }))).toBe(false);
    expect(puedeRegistrarComprobante(orden({ lineas: [] }))).toBe(false);
    expect(puedeRegistrarComprobante(orden({ lineas: [{ id: null }] }))).toBe(false);
  });
  it("con algún comprobante (aun anulado) la orden no se edita; con uno vigente tampoco se anula", () => {
    expect(puedeEditarOrden(orden())).toBe(true);
    expect(puedeEditarOrden(orden({ comprobantes: [anulado] }))).toBe(false);
    expect(puedeEditarOrden(orden({ estado: "anulada" }))).toBe(false);
    expect(puedeAnularOrden(orden())).toBe(true);
    expect(puedeAnularOrden(orden({ comprobantes: [anulado] }))).toBe(true);
    expect(puedeAnularOrden(orden({ comprobantes: [vigente] }))).toBe(false);
    expect(puedeAnularOrden(orden({ estado: "anulada" }))).toBe(false);
    expect(tieneComprobante({ comprobantes: [anulado] })).toBe(true);
    expect(tieneComprobanteVigente({ comprobantes: [anulado] })).toBe(false);
    expect(tieneComprobanteVigente({ comprobantes: [anulado, vigente] })).toBe(true);
  });
  it("cuánto llegó en papel por línea se dice «8 de 10», y «12 de 10 · 2 de más» si pasa lo pedido", () => {
    expect(textoPapelDeLinea({ cantidad: 10, facturado: 8 })).toBe("8 de 10");
    expect(textoPapelDeLinea({ cantidad: 10, facturado: 10 })).toBe("10 de 10");
    expect(textoPapelDeLinea({ cantidad: 10, facturado: 12 })).toBe("12 de 10 · 2 de más");
    expect(textoPapelDeLinea({ cantidad: 10, facturado: null })).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Fase 3: los envíos a las sedes. Todo llega con tolerancia: una base que todavía no los cuenta no rompe la orden abierta ni la lista.
// ---------------------------------------------------------------------------------------------------------------------------------

describe("la píldora «Por enviar» de la lista (fase 3)", () => {
  it("es una vista de TODAS las sedes y solo de las generadas: la sede y el estado de la URL no cuentan", () => {
    const f = filtrosDeLista({ enviar: "1", destino: TRU, estado: "anulada", q: " pena " }, CTX_LISTA);
    expect(f).toMatchObject({ porEnviar: true, destino: TODAS, estado: null, q: "pena" });
    expect(filtrosDeLista({ destino: TRU }, CTX_LISTA).porEnviar).toBe(false);
    expect(filtrosDeLista({ enviar: "si" }, CTX_LISTA).porEnviar).toBe(false);
  });
  it("a la base le pide las generadas y deja el resto (qué órdenes tienen algo por enviar) a quien cruza", () => {
    expect(argsLista(filtrosDeLista({ enviar: "1" }, CTX_LISTA))).toEqual({ p_destino: null, p_estado: "generada", p_busqueda: null, p_antes_de: null, p_limite: 51 });
  });
  it("hrefLista: tocarla enciende la vista (todas las sedes, sin estado) y vuelve a tocarla la apaga; buscar y pasar de página la conservan", () => {
    const f = filtrosDeLista({ destino: TRU, estado: "generada", q: "pena" }, CTX_LISTA);
    expect(hrefLista(f, { porEnviar: true })).toBe("/compras/ordenes?destino=todas&enviar=1&q=pena");
    const v = filtrosDeLista({ enviar: "1", q: "pena" }, CTX_LISTA);
    expect(hrefLista(v, { porEnviar: false })).toBe("/compras/ordenes?destino=todas&q=pena");
    expect(hrefLista(v, { q: "" })).toBe("/compras/ordenes?destino=todas&enviar=1");
    expect(hrefLista(v, { antesDe: 12 })).toBe("/compras/ordenes?destino=todas&enviar=1&q=pena&cursor=12");
  });
  it("elegir una sede o un estado saca de la vista (su cifra cuenta todas las sedes)", () => {
    const v = filtrosDeLista({ enviar: "1" }, CTX_LISTA);
    expect(hrefLista(v, { destino: TRU })).toBe(`/compras/ordenes?destino=${TRU}`);
    expect(hrefLista(v, { estado: "generada" })).toBe("/compras/ordenes?destino=todas&estado=generada");
  });
  it("la paginación conserva la vista", () => {
    expect(paramsDeLista(filtrosDeLista({ enviar: "1" }, CTX_LISTA))).toMatchObject({ destino: TODAS, enviar: "1" });
    expect(paramsDeLista(filtrosDeLista({ destino: TRU }, CTX_LISTA)).enviar).toBeUndefined();
  });
  it("vacía no es un problema: todo lo que se pidió ya salió; con una búsqueda, dice qué se buscó", () => {
    const v = filtrosDeLista({ enviar: "1" }, CTX_LISTA);
    expect(vacioDeLista(v, null)).toEqual({
      titulo: "No hay nada por enviar",
      frase: "Todo lo que se pidió ya salió hacia su sede.",
      filtros: [{ texto: "Por enviar", href: "/compras/ordenes?destino=todas" }],
    });
    expect(vacioDeLista(filtrosDeLista({ enviar: "1", q: "Zara" }, CTX_LISTA), null).titulo).toBe("Ninguna orden por enviar coincide con «Zara»");
  });
});

describe("leerPorEnviar: fn_ordenes_compra_por_enviar", () => {
  it("deja las órdenes con algo por enviar y cuántas unidades (los numeric llegan como texto)", () => {
    const m = leerPorEnviar([
      { orden_compra_id: "o1", unidades_por_enviar: 14 },
      { orden_compra_id: "o2", unidades_por_enviar: "3" },
      { orden_compra_id: "o3", unidades_por_enviar: 0 },
      { orden_compra_id: "", unidades_por_enviar: 5 },
      { orden_compra_id: "o5" },
      "raro",
      null,
    ]);
    expect([...m!.entries()]).toEqual([
      ["o1", 14],
      ["o2", 3],
    ]);
  });
  it("sin lista (la base todavía no tiene la función) no hay nada que filtrar: null, no «ninguna»", () => {
    expect(leerPorEnviar(null)).toBeNull();
    expect(leerPorEnviar({ filas: [] })).toBeNull();
    expect(leerPorEnviar([])?.size).toBe(0);
  });
});

describe("numeroEnvio y leerEnvios", () => {
  it("«ENV-000012»: ya escrito, o armado desde la cifra", () => {
    expect(numeroEnvio("ENV-000012")).toBe("ENV-000012");
    expect(numeroEnvio(" env-12 ")).toBe("ENV-12");
    expect(numeroEnvio(12)).toBe("ENV-000012");
    expect(numeroEnvio("12")).toBe("ENV-000012");
    expect(numeroEnvio("doce")).toBeNull();
    expect(numeroEnvio(null)).toBeNull();
  });
  it("lee la lista de envíos de la orden; una fila sin id, sin número o con un estado que no se conoce se descarta", () => {
    const envios = leerEnvios([
      { id: "e2", numero: "ENV-000012", sede: "Tienda Trujillo", numero_guia: "001-123", estado: "en_camino", despachado_en: "2026-10-12T21:00:00+00:00", unidades: "14", version: 1 },
      { id: "e1", numero: 11, sede: { id: "s", nombre: "Tienda Lima" }, estado: "anulado", unidades: 3 },
      { id: "e0", numero: "ENV-000010", estado: "perdido" },
      { id: "", numero: "ENV-000009", estado: "cerrado" },
      { id: "e9", estado: "abierto" },
      "raro",
    ]);
    expect(envios).toEqual([
      { id: "e2", numero: "ENV-000012", sede: "Tienda Trujillo", numeroGuia: "001-123", estado: "en_camino", despachadoEn: "2026-10-12T21:00:00+00:00", unidades: 14, version: 1 },
      { id: "e1", numero: "ENV-000011", sede: "Tienda Lima", numeroGuia: null, estado: "anulado", despachadoEn: null, unidades: 3, version: null },
    ]);
  });
  it("sin lista (la base no los cuenta) es null; una lista vacía es «sin envíos»", () => {
    expect(leerEnvios(undefined)).toBeNull();
    expect(leerEnvios({ no: "es lista" })).toBeNull();
    expect(leerEnvios([])).toEqual([]);
  });
  it("cada estado tiene su texto y su tono (el de camino es informativo, no semáforo)", () => {
    expect(ESTADO_ENVIO.en_camino).toEqual({ texto: "En camino", tono: "pizarra" });
    expect(ESTADO_ENVIO.abierto).toEqual({ texto: "Abierto", tono: "ambar" });
    expect(ESTADO_ENVIO.cerrado).toEqual({ texto: "Cerrado", tono: "verde" });
    expect(ESTADO_ENVIO.anulado).toEqual({ texto: "Anulado", tono: "apagado" });
  });
});

describe("leerDetalleOrden con envíos (fase 3)", () => {
  const BASE = {
    id: "0b6f1c2e-0000-4000-8000-000000000001",
    numero: 12,
    estado: "generada",
    proveedor: { id: "p1", nombre: "Confecciones Peña", ruc: null },
    destino: { id: TRU, nombre: "Tienda Trujillo" },
    fecha_emision: "2026-10-10",
    creada_en: "2026-10-10T21:50:00+00:00",
    lineas: [{ id: "i1", posicion: 1, categoria_id: "c1", categoria: "Polos", marca_id: "m1", marca: "Kero", cantidad: 10, precio_unitario: 25.5, subtotal: 255 }],
  };
  it("lee por línea lo enviado y lo que queda (nunca menos de cero) y la lista de envíos", () => {
    const d = leerDetalleOrden({
      ...BASE,
      lineas: [{ ...BASE.lineas[0], enviado: 4, por_enviar: 6 }, { ...BASE.lineas[0], id: "i2", posicion: 2, enviado: "10", por_enviar: -1 }],
      envios: [{ id: "e1", numero: "ENV-000001", sede: "Tienda Trujillo", estado: "en_camino", unidades: 14 }],
    })!;
    expect(d.lineas[0]).toMatchObject({ enviado: 4, porEnviar: 6 });
    expect(d.lineas[1]).toMatchObject({ enviado: 10, porEnviar: 0 });
    expect(d.envios).toHaveLength(1);
  });
  it("una base que todavía no los cuenta: la orden se lee igual, sin envíos y sin saber qué queda", () => {
    const d = leerDetalleOrden(BASE)!;
    expect(d.envios).toBeNull();
    expect(d.lineas[0]).toMatchObject({ enviado: null, porEnviar: null });
  });
  it("una base que sabe de envíos pero todavía no hay ninguno: la lista vacía, no «no sabe»", () => {
    const d = leerDetalleOrden({ ...BASE, lineas: [{ ...BASE.lineas[0], enviado: 0, por_enviar: 10 }] })!;
    expect(d.envios).toEqual([]);
  });
});

describe("qué se puede hacer con una orden que tiene (o no) envíos", () => {
  const linea = (over: object = {}) => ({ id: "i1", posicion: 1, enviado: 0, porEnviar: 10, ...over }) as never;
  const vivo = (estado: "en_camino" | "abierto" | "cerrado" | "anulado" = "en_camino") => ({
    id: "e1",
    numero: "ENV-000001",
    sede: "Tienda Trujillo",
    numeroGuia: null,
    estado,
    despachadoEn: null,
    unidades: 5,
    version: 1,
  });
  const orden = (o: object = {}) => ({ estado: "generada" as const, comprobantes: [], envios: [], lineas: [linea()], ...o });

  it("«Enviar a una sede»: una generada con algo por enviar cuya base ya sabe de envíos, con o sin papel", () => {
    expect(puedeEnviarOrden(orden())).toBe(true);
    expect(puedeEnviarOrden(orden({ envios: [vivo()] }))).toBe(true);
  });
  it("no se ofrece en una anulada, con una base que no conoce los envíos, sin nada por enviar ni con líneas sin id", () => {
    expect(puedeEnviarOrden(orden({ estado: "anulada" }))).toBe(false);
    expect(puedeEnviarOrden(orden({ envios: null }))).toBe(false);
    expect(puedeEnviarOrden(orden({ lineas: [linea({ porEnviar: 0 })] }))).toBe(false);
    expect(puedeEnviarOrden(orden({ lineas: [linea({ porEnviar: null })] }))).toBe(false);
    expect(puedeEnviarOrden(orden({ lineas: [linea({ id: null })] }))).toBe(false);
    expect(puedeEnviarOrden(orden({ lineas: [] }))).toBe(false);
  });
  it("un envío vivo (en camino, abierto o cerrado) cuenta; uno anulado, no", () => {
    expect(tieneEnvioVivo({ envios: [vivo("en_camino")] })).toBe(true);
    expect(tieneEnvioVivo({ envios: [vivo("abierto")] })).toBe(true);
    expect(tieneEnvioVivo({ envios: [vivo("cerrado")] })).toBe(true);
    expect(tieneEnvioVivo({ envios: [vivo("anulado")] })).toBe(false);
    expect(tieneEnvioVivo({ envios: [] })).toBe(false);
    expect(tieneEnvioVivo({ envios: null })).toBe(false);
    expect(tieneEnvioVivo({})).toBe(false);
  });
  it("con un envío vivo la orden no se edita ni se anula; con uno solo anulado no se edita (la guía cuelga de sus líneas) pero sí se anula", () => {
    expect(puedeEditarOrden(orden())).toBe(true);
    expect(puedeAnularOrden(orden())).toBe(true);
    for (const estado of ["en_camino", "abierto", "cerrado"] as const) {
      expect(puedeEditarOrden(orden({ envios: [vivo(estado)] })), estado).toBe(false);
      expect(puedeAnularOrden(orden({ envios: [vivo(estado)] })), estado).toBe(false);
    }
    expect(puedeEditarOrden(orden({ envios: [vivo("anulado")] }))).toBe(false);
    expect(puedeAnularOrden(orden({ envios: [vivo("anulado")] }))).toBe(true);
    // Una base que no cuenta envíos no esconde nada: se queda como en la fase 2.
    expect(puedeEditarOrden({ estado: "generada", comprobantes: [] })).toBe(true);
    expect(puedeAnularOrden({ estado: "generada", comprobantes: [] })).toBe(true);
    expect(tieneEnvio({ envios: [vivo("anulado")] })).toBe(true);
    expect(tieneEnvio({ envios: [] })).toBe(false);
    expect(tieneEnvio({ envios: null })).toBe(false);
  });
  it("cuánto de una línea salió se dice «8 de 10»; el total es lo que se llegó a pedir o a facturar", () => {
    expect(textoEnvioDeLinea({ cantidad: 10, enviado: 8, porEnviar: 2 })).toBe("8 de 10");
    expect(textoEnvioDeLinea({ cantidad: 10, enviado: 12, porEnviar: 0 })).toBe("12 de 12");
    expect(textoEnvioDeLinea({ cantidad: 10, enviado: 0, porEnviar: null })).toBe("0 de 10");
    expect(textoEnvioDeLinea({ cantidad: 10, enviado: null, porEnviar: null })).toBeNull();
  });
  it("de la orden entera: nada, una parte o todo enviado", () => {
    expect(estadoDeEnvioDeOrden({ envios: null, lineas: [] })).toBeNull();
    expect(estadoDeEnvioDeOrden({ envios: [], lineas: [linea({ enviado: 0 })] })).toBe("ninguno");
    expect(estadoDeEnvioDeOrden({ envios: [vivo()], lineas: [linea({ enviado: 4, porEnviar: 6 })] })).toBe("en_parte");
    expect(estadoDeEnvioDeOrden({ envios: [vivo()], lineas: [linea({ enviado: 10, porEnviar: 0 }), linea({ id: "i2", enviado: 0, porEnviar: 0 })] })).toBe("completo");
  });
});

describe("leerCategoriasDeProveedor: lo que devuelve fn_proveedor_categorias (una fila por proveedor)", () => {
  it("arma el mapa proveedor → categorías, sin repetir", () => {
    const r = leerCategoriasDeProveedor([
      { proveedor_id: "p1", categorias: ["c1", "c2", "c1"] },
      { proveedor_id: "p2", categorias: ["c3"] },
    ]);
    expect(r).toEqual({ p1: ["c1", "c2"], p2: ["c3"] });
  });
  it("una lista vacía es «nadie maneja nada todavía», no «no se pudo leer»", () => {
    expect(leerCategoriasDeProveedor([])).toEqual({});
  });
  it("si la respuesta no es una lista (la base aún no tiene la función) es null: no se filtra", () => {
    expect(leerCategoriasDeProveedor(null)).toBeNull();
    expect(leerCategoriasDeProveedor({})).toBeNull();
    expect(leerCategoriasDeProveedor(undefined)).toBeNull();
  });
  it("ignora filas incompletas, sin arreglo o con categorías que no son texto", () => {
    expect(
      leerCategoriasDeProveedor([null, 3, {}, { proveedor_id: "p1" }, { categorias: ["c1"] }, { proveedor_id: "p1", categorias: "c1" }, { proveedor_id: "p1", categorias: [7, "", "c1"] }]),
    ).toEqual({ p1: ["c1"] });
  });
  it("con cientos de proveedores sigue siendo una fila por proveedor (el tope de PostgREST son 1.000 filas)", () => {
    const filas = Array.from({ length: 300 }, (_, i) => ({ proveedor_id: `p${i}`, categorias: Array.from({ length: 52 }, (_, k) => `c${k}`) }));
    expect(filas.length).toBeLessThan(1000);
    const r = leerCategoriasDeProveedor(filas)!;
    expect(Object.keys(r)).toHaveLength(300);
    expect(r["p299"]).toHaveLength(52);
  });
});
