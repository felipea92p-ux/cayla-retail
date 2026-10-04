import { describe, it, expect } from "vitest";
import {
  camposDeLlegada,
  despuesDeRecibir,
  facturasDelProveedor,
  urlContraFactura,
  fijarCantidad,
  fijarCosto,
  leerTexto,
  pedidoRecibirLote,
  sugerirPrendas,
  sumarPrenda,
  textoDelBuscador,
  textoDelProveedor,
  totalUnidades,
  varianteDeLineaEnviada,
  type FacturaPendiente,
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
  it("el buscador nombra la marca única, o el proveedor si tiene varias o ninguna", () => {
    expect(textoDelBuscador(null)).toBe("Escanea la etiqueta o escribe el nombre de la prenda");
    expect(textoDelBuscador({ nombre: "Textil Ejemplo SAC", marcas: ["Lasak"] })).toBe("Escanea o escribe una prenda de Lasak");
    expect(textoDelBuscador({ nombre: "Textil Ejemplo SAC", marcas: ["Lasak", "Kero"] })).toBe("Escanea o escribe una prenda de Textil Ejemplo SAC");
    expect(textoDelBuscador({ nombre: "Gamarra 12", marcas: [] })).toBe("Escanea o escribe una prenda de Gamarra 12");
  });

  it("sigue al control: proveedor A → B → A da el mismo texto que la primera vez", () => {
    const a = { nombre: "A SAC", marcas: ["Lasak"] };
    const b = { nombre: "B SAC", marcas: ["Kero"] };
    const primero = textoDelBuscador(a);
    expect(textoDelBuscador(b)).not.toBe(primero);
    expect(textoDelBuscador(a)).toBe(primero);
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
