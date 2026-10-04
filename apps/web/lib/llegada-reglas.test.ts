import { describe, it, expect } from "vitest";
import {
  avisoMismaCaja,
  ayudaDelBuscador,
  camposDeLlegada,
  DIAS_SIN_FACTURA,
  despuesDeRecibir,
  facturasDelProveedor,
  fijarCantidad,
  fijarCosto,
  leerTexto,
  llegadasSinFacturaPorAvisar,
  nombreDeLlegada,
  pedidoRecibirLote,
  PLACEHOLDER_BUSCADOR,
  sugerirPrendas,
  sumarPrenda,
  textoDelProveedor,
  TOPE_SIN_FACTURA,
  totalUnidades,
  urlContraFactura,
  varianteDeLineaEnviada,
  VENTANA_SIN_FACTURA,
  yaEntroHoy,
  type FacturaPendiente,
  type LlegadaReciente,
  type LineaLlegada,
  type PrendaLlegada,
} from "./llegada-reglas";
import { sePuedeConfirmar } from "./guia-campos";

const prenda = (varianteId: string, referencia: string, marca: string | null, extra: Partial<PrendaLlegada> = {}): PrendaLlegada => ({
  varianteId,
  productoId: `p-${varianteId}`,
  sku: `COD-${varianteId}`,
  referencia,
  talla: "M",
  color: "Negro",
  codigosBarras: [],
  marca,
  ...extra,
});

const catalogo = [
  prenda("a", "Blusa Aurora", "Kero"),
  prenda("b", "Body Bonita", "Lasak"),
  prenda("c", "Body Lavie", "Lasak", { codigosBarras: ["7750001"] }),
  prenda("d", "Blusa Lavanda", null),
];

describe("sumarPrenda / fijarCantidad / fijarCosto", () => {
  it("una prenda nueva entra arriba y una repetida crece en su lugar", () => {
    let l: LineaLlegada[] = [];
    l = sumarPrenda(l, "a");
    l = sumarPrenda(l, "b");
    l = sumarPrenda(l, "a");
    expect(l).toEqual([
      { varianteId: "b", cantidad: 1, costo: "" },
      { varianteId: "a", cantidad: 2, costo: "" },
    ]);
    expect(totalUnidades(l)).toBe(3);
  });

  it("deshacer una lectura (−1) que deja la prenda en 0 la quita", () => {
    const l = sumarPrenda(sumarPrenda([], "a"), "a", -1);
    expect(l).toEqual([]);
  });

  it("escribir 0 o algo que no es número quita la prenda; un decimal se redondea hacia abajo", () => {
    const base = sumarPrenda(sumarPrenda([], "a"), "b");
    expect(fijarCantidad(base, "a", 0).map((x) => x.varianteId)).toEqual(["b"]);
    expect(fijarCantidad(base, "a", Number.NaN).map((x) => x.varianteId)).toEqual(["b"]);
    expect(fijarCantidad(base, "a", 3.7).find((x) => x.varianteId === "a")?.cantidad).toBe(3);
  });

  it("el costo vacío queda vacío (sin costo) y un negativo se recorta a 0", () => {
    const base = sumarPrenda([], "a");
    expect(fijarCosto(base, "a", "")[0].costo).toBe("");
    expect(fijarCosto(base, "a", "-5")[0].costo).toBe("0");
    expect(fijarCosto(base, "a", "39.9")[0].costo).toBe("39.9");
  });
});

describe("sugerirPrendas y leerTexto", () => {
  it("con el proveedor elegido, sus marcas van primero sin esconder las demás", () => {
    expect(sugerirPrendas("bl", catalogo, ["Lasak"]).map((p) => p.varianteId)).toEqual(["a", "d"]);
    expect(sugerirPrendas("body", catalogo, ["Lasak"]).map((p) => p.varianteId)).toEqual(["b", "c"]);
    expect(sugerirPrendas("la", catalogo, ["Lasak"]).map((p) => p.varianteId).slice(0, 2)).toEqual(["b", "c"]);
  });

  it("sin proveedor, el orden es el del catálogo; con una letra no sugiere", () => {
    expect(sugerirPrendas("la", catalogo, []).map((p) => p.varianteId)).toEqual(["b", "c", "d"]);
    expect(sugerirPrendas("b", catalogo, [])).toEqual([]);
  });

  it("la marca se compara sin tildes ni mayúsculas", () => {
    expect(sugerirPrendas("la", catalogo, ["LASAK"])[0].varianteId).toBe("b");
  });

  it("Enter: el código exacto (o el de barras) gana; si no, la primera sugerencia; si nada coincide, null", () => {
    expect(leerTexto("COD-d", catalogo, ["Lasak"])?.varianteId).toBe("d");
    expect(leerTexto("7750001", catalogo, [])?.varianteId).toBe("c");
    expect(leerTexto("lav", catalogo, ["Lasak"])?.varianteId).toBe("c");
    expect(leerTexto("zzz", catalogo, [])).toBeNull();
  });
});

describe("textos que siguen al proveedor (ADR-0290)", () => {
  it("la ayuda nombra la marca única, o el proveedor si tiene varias o ninguna; sin proveedor no promete nada", () => {
    expect(ayudaDelBuscador(null)).toBe("Cada lectura suma una prenda");
    expect(ayudaDelBuscador({ nombre: "Textil Ejemplo SAC", marcas: ["Lasak"] })).toBe("Cada lectura suma una prenda de Lasak");
    expect(ayudaDelBuscador({ nombre: "Textil Ejemplo SAC", marcas: ["Lasak", "Kero"] })).toBe("Cada lectura suma una prenda de Textil Ejemplo SAC");
    expect(ayudaDelBuscador({ nombre: "Gamarra 12", marcas: [] })).toBe("Cada lectura suma una prenda de Gamarra 12");
  });

  it("sigue al control: proveedor A → B → A da el mismo texto que la primera vez", () => {
    const a = { nombre: "A SAC", marcas: ["Lasak"] };
    const b = { nombre: "B SAC", marcas: ["Kero"] };
    const primero = ayudaDelBuscador(a);
    expect(ayudaDelBuscador(b)).not.toBe(primero);
    expect(ayudaDelBuscador(a)).toBe(primero);
  });

  it("la caja del buscador es corta: cabe a 375 px aunque el proveedor tenga un nombre largo", () => {
    // ~7,5 px por letra con la letra de la caja (15 px DM Sans); a 375 px la caja deja ~250 px.
    expect(PLACEHOLDER_BUSCADOR.length).toBeLessThanOrEqual(30);
  });

  it("el proveedor se lee con sus marcas, sin repetir la que se llama igual", () => {
    expect(textoDelProveedor("Lasak", ["Lasak"])).toBe("Lasak");
    expect(textoDelProveedor("Textil SAC", ["Kero", "Lasak"])).toBe("Textil SAC · Kero, Lasak");
    expect(textoDelProveedor("Gamarra 12", [])).toBe("Gamarra 12");
  });
});

describe("camposDeLlegada", () => {
  it("sin proveedor, sin prendas o sin responsable no se puede recibir; con los tres, sí", () => {
    const lineas = sumarPrenda([], "a");
    const base = { proveedorId: "prov", lineas, responsableListo: true, responsableMotivo: null };
    expect(sePuedeConfirmar(camposDeLlegada(base))).toBe(true);
    expect(sePuedeConfirmar(camposDeLlegada({ ...base, proveedorId: "" }))).toBe(false);
    expect(sePuedeConfirmar(camposDeLlegada({ ...base, lineas: [] }))).toBe(false);
    expect(sePuedeConfirmar(camposDeLlegada({ ...base, responsableListo: false, responsableMotivo: "Elige quién recibe." }))).toBe(false);
  });

  it("el orden es el de la pantalla: de quién → qué llegó → quién recibe", () => {
    const ids = camposDeLlegada({ proveedorId: "", lineas: [], responsableListo: false, responsableMotivo: null }).map((c) => c.id);
    expect(ids).toEqual(["llegada-proveedor", "llegada-prendas", "llegada-responsable"]);
  });
});

describe("pedidoRecibirLote", () => {
  it("manda el costo solo si se escribió, la guía solo si tiene algo, y la marca de confirmación solo en las líneas confirmadas", () => {
    const lineas: LineaLlegada[] = [
      { varianteId: "a", cantidad: 2, costo: "" },
      { varianteId: "b", cantidad: 1, costo: "40" },
    ];
    expect(pedidoRecibirLote({ ubicacionId: "tru", proveedorId: "prov", lineas, numeroGuia: "  ", token: "t1" })).toEqual({
      p_ubicacion_id: "tru",
      p_proveedor_id: "prov",
      p_items: [
        { variante_id: "a", cantidad: 2 },
        { variante_id: "b", cantidad: 1, costo_unitario: 40 },
      ],
      p_numero_guia: undefined,
      p_token: "t1",
    });
    const conf = pedidoRecibirLote({ ubicacionId: "tru", proveedorId: "prov", lineas, numeroGuia: "T001-9", token: "t1", confirmadas: [2] });
    expect(conf.p_items[1]).toMatchObject({ confirma_costo: true });
    expect(conf.p_items[0]).not.toHaveProperty("confirma_costo");
    expect(conf.p_numero_guia).toBe("T001-9");
  });

  it("la línea atípica que dice la base (desde 1) es la prenda de la pantalla", () => {
    const lineas: LineaLlegada[] = [
      { varianteId: "a", cantidad: 2, costo: "" },
      { varianteId: "b", cantidad: 1, costo: "40" },
    ];
    expect(varianteDeLineaEnviada(lineas, 2)).toBe("b");
    expect(varianteDeLineaEnviada(lineas, null)).toBeNull();
    expect(varianteDeLineaEnviada(lineas, 9)).toBeNull();
  });
});

describe("despuesDeRecibir", () => {
  const lineas: LineaLlegada[] = [
    { varianteId: "a", cantidad: 2, costo: "" },
    { varianteId: "b", cantidad: 1, costo: "" },
  ];

  it("con lote: etiquetas primero (principal) y bajar al piso con las prendas que llegaron", () => {
    expect(despuesDeRecibir({ loteId: "L1", lineas, veExistencias: true })).toEqual([
      { clave: "etiquetas", texto: "Imprimir 3 etiquetas de precio", href: "/etiquetas-de-precio?lotes=L1", principal: true },
      { clave: "bajar", texto: "Bajar al piso", href: "/inventario/bajar?lineas=a:2,b:1", principal: false },
    ]);
  });

  it("sin conexión (sin lote) no hay etiquetas por lote: bajar pasa a ser lo principal; sin Existencias, no se ofrece", () => {
    expect(despuesDeRecibir({ loteId: null, lineas, veExistencias: true })).toEqual([
      { clave: "bajar", texto: "Bajar al piso", href: "/inventario/bajar?lineas=a:2,b:1", principal: true },
    ]);
    expect(despuesDeRecibir({ loteId: null, lineas, veExistencias: false })).toEqual([]);
    expect(despuesDeRecibir({ loteId: "L1", lineas: [lineas[0]].map((l) => ({ ...l, cantidad: 1 })), veExistencias: false })[0].texto).toBe(
      "Imprimir la etiqueta de precio",
    );
  });
});

describe("la factura como opción (ADR-0330, act. 2)", () => {
  const facturas: FacturaPendiente[] = [
    { id: "f2", proveedorId: "lasak", documento: "F001-20", fechaEmision: "2026-10-02", pendientes: 5 },
    { id: "f1", proveedorId: "lasak", documento: "F001-10", fechaEmision: "2026-09-28", pendientes: 12 },
    { id: "f3", proveedorId: "kero", documento: "F002-1", fechaEmision: "2026-09-20", pendientes: 3 },
    { id: "f4", proveedorId: "lasak", documento: "F001-30", fechaEmision: "2026-10-03", pendientes: 0 },
  ];

  it("solo las del proveedor elegido que aún tienen algo por llegar, la más antigua primero", () => {
    expect(facturasDelProveedor(facturas, "lasak").map((f) => f.id)).toEqual(["f1", "f2"]);
    expect(facturasDelProveedor(facturas, "kero").map((f) => f.id)).toEqual(["f3"]);
    expect(facturasDelProveedor(facturas, "otro")).toEqual([]);
    expect(facturasDelProveedor(facturas, "")).toEqual([]);
  });

  it("lleva a la vista contra factura con el comprobante marcado", () => {
    expect(urlContraFactura("f1")).toBe("/recibir?vista=factura&compra=f1");
  });

  it("la pregunta es sugerida: aparece solo si hay facturas y no bloquea recibir", () => {
    const base = { proveedorId: "lasak", lineas: sumarPrenda([], "a"), responsableListo: true, responsableMotivo: null };
    expect(camposDeLlegada({ ...base, facturaRespondida: null }).map((c) => c.id)).not.toContain("llegada-factura");
    const sinResponder = camposDeLlegada({ ...base, facturaRespondida: false });
    expect(sinResponder.map((c) => c.id)).toEqual(["llegada-proveedor", "llegada-factura", "llegada-prendas", "llegada-responsable"]);
    expect(sePuedeConfirmar(sinResponder)).toBe(true);
  });
});

describe("la misma caja dos veces (ADR-0330, act. 3)", () => {
  // 2026-10-04 14:30 en Lima = 19:30 UTC.
  const ahora = new Date("2026-10-04T19:30:00Z");
  const recientes: LlegadaReciente[] = [
    { proveedorId: "andina", fecha: "2026-10-04T19:16:30Z", unidades: 3, recibidoPor: "Ana" },
    { proveedorId: "andina", fecha: "2026-10-04T15:00:00Z", unidades: 9, recibidoPor: null },
    { proveedorId: "andina", fecha: "2026-10-04T04:30:00Z", unidades: 5, recibidoPor: "Luz" }, // 23:30 del 3-oct en Lima
    { proveedorId: "kero", fecha: "2026-10-04T18:00:00Z", unidades: 2, recibidoPor: "Ana" },
  ];

  it("cuenta solo lo de ese proveedor del día de Lima, lo último primero (las 23:30 de ayer no cuentan)", () => {
    expect(yaEntroHoy(recientes, "andina", ahora).map((r) => r.unidades)).toEqual([3, 9]);
    expect(yaEntroHoy(recientes, "otro", ahora)).toEqual([]);
    expect(yaEntroHoy(recientes, "", ahora)).toEqual([]);
  });

  it("una llegada: hora, prendas y quién; varias: cuántas, total y la última", () => {
    expect(avisoMismaCaja(yaEntroHoy(recientes, "kero", ahora), "Kero")).toBe(
      "Hoy a las 13:00 ya entraron 2 prendas de Kero, la recibió Ana. Si es la misma caja, no la recibas de nuevo.",
    );
    expect(avisoMismaCaja(yaEntroHoy(recientes, "andina", ahora), "Textiles Andina")).toBe(
      "Hoy ya entraron 2 llegadas de Textiles Andina (12 prendas; la última a las 14:16, la recibió Ana). Si es la misma caja, no la recibas de nuevo.",
    );
    expect(avisoMismaCaja([], "Kero")).toBeNull();
  });
});

describe("llegadas sin factura por avisar (ADR-0330, aviso de la fase 2)", () => {
  // 2026-10-04 10:00 en Lima.
  const ahora = new Date("2026-10-04T15:00:00Z");
  const llegada = (fechaRecepcion: string, unidades: number, proveedorNombre: string | null = "Textiles Andina SAC") => ({
    fechaRecepcion,
    unidades,
    proveedorNombre,
    ubicacionNombre: "Tienda TRU",
  });

  it("avisa desde una semana (días de Lima) hasta la ventana, la más antigua primero", () => {
    const filas = [
      llegada("2026-10-03T20:00:00Z", 4), // ayer: todavía no
      llegada("2026-09-28T04:30:00Z", 9), // 27-sep 23:30 en Lima → 7 días: ya
      llegada("2026-09-28T15:00:00Z", 2), // 28-sep en Lima → 6 días: todavía no
      llegada("2026-08-20T15:00:00Z", 12), // 45 días: sí
      llegada("2026-08-01T15:00:00Z", 30), // 64 días: fuera de la ventana
    ];
    const r = llegadasSinFacturaPorAvisar(filas, ahora);
    expect(r.llegadas.map((f) => f.dias)).toEqual([45, DIAS_SIN_FACTURA]);
    expect(r.unidades).toBe(21);
    expect(r.puedeHaberMas).toBe(false);
    expect(VENTANA_SIN_FACTURA).toBeGreaterThan(DIAS_SIN_FACTURA);
  });

  it("si la lectura llegó al tope, dice que puede haber más (las más antiguas quedan afuera del tope)", () => {
    const filas = Array.from({ length: TOPE_SIN_FACTURA }, () => llegada("2026-10-03T20:00:00Z", 1));
    expect(llegadasSinFacturaPorAvisar(filas, ahora).puedeHaberMas).toBe(true);
  });

  it("nombra la llegada con proveedor, prendas, sede y día de Lima", () => {
    expect(nombreDeLlegada(llegada("2026-09-27T04:30:00Z", 12))).toBe("Textiles Andina SAC · 12 prendas · Tienda TRU, 26/09");
    expect(nombreDeLlegada(llegada("2026-09-27T15:00:00Z", 1, null))).toBe("Sin proveedor · 1 prenda · Tienda TRU, 27/09");
  });
});
