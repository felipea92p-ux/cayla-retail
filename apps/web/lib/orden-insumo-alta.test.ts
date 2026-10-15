import { describe, expect, it } from "vitest";
import { sePuedeConfirmar, siguienteDe } from "./guia-campos";
import {
  argsCrearOrdenInsumo,
  argsEditarOrdenInsumo,
  avisoDeUnidadCambiada,
  borradorDeDetalleInsumo,
  camposDeLaOrdenInsumo,
  cantidadesDelBorrador,
  dudaDeLineaInsumo,
  lineaInsumoVacia,
  lugarDelError,
  opcionesDeInsumo,
  problemaDeLineaInsumo,
  type ContextoOrdenInsumo,
  type LineaInsumoBorrador,
  type OrdenInsumoBorrador,
} from "./orden-insumo-alta";
import { calcularLineaInsumo, totalCentimosInsumo, type DetalleOrdenInsumo } from "./ordenes-insumo-reglas";

// La guía de foco de «Nueva orden de insumos» sale de las MISMAS reglas que `fn_orden_insumo_validar` (ADR-0284, regla 5): cada caso de
// abajo es uno de `scripts/pruebas/ordenes_insumo.mjs` (CR3, CR4, CR5, CR5b, CR5c, E6, E7), dicho para quien llena. Si la base rechaza
// algo que esto dejaba pasar —o al revés—, esta prueba es la que tiene que fallar.

const CTX: ContextoOrdenInsumo = {
  hoy: "2026-10-13",
  proveedores: new Set(["prov"]),
  talleres: new Set(["taller"]),
  insumos: new Map([
    ["lino", "metro"],
    ["hilo", "cono"],
    ["boton", "unidad"],
    ["avio", "docena"],
  ]),
};
const linea = (o: Partial<LineaInsumoBorrador> = {}): LineaInsumoBorrador => ({ ...lineaInsumoVacia("l1"), insumoId: "lino", cantidad: "1", precio: "10", ...o });
const orden = (o: Partial<OrdenInsumoBorrador> = {}): OrdenInsumoBorrador => ({ proveedorId: "prov", destinoId: "taller", entrega: "", nota: "", lineas: [linea()], ...o });
const SIN_COMBO = { pide: false, listo: true, motivo: null };

describe("problemaDeLineaInsumo: las reglas de una línea de `fn_orden_insumo_validar` (CR4, CR5, CR5b de la base)", () => {
  const casos: [string, Partial<LineaInsumoBorrador>, string | null][] = [
    ["lista", {}, null],
    ["sin insumo", { insumoId: "" }, "Elige el insumo."],
    ["insumo archivado o que no existe (no está entre los que se pueden elegir)", { insumoId: "viejo" }, "Elige el insumo."],
    ["descripción de 201 letras", { descripcion: "x".repeat(201) }, "La descripción va hasta 200 letras."],
    ["descripción de 200 letras", { descripcion: "x".repeat(200) }, null],
    ["sin cantidad: la pide en la unidad del insumo", { cantidad: "" }, "Escribe la cantidad en metros."],
    ["cantidad con cuatro decimales", { cantidad: "1.2345" }, "La cantidad va de 0.001 a 99 999.999 metros, con hasta tres decimales."],
    ["cantidad 0", { cantidad: "0" }, "La cantidad va de 0.001 a 99 999.999 metros, con hasta tres decimales."],
    ["cantidad negativa", { cantidad: "-1" }, "La cantidad va de 0.001 a 99 999.999 metros, con hasta tres decimales."],
    ["cantidad de más (100 000)", { cantidad: "100000" }, "La cantidad va de 0.001 a 99 999.999 metros, con hasta tres decimales."],
    ["cantidad en letras", { cantidad: "NaN" }, "La cantidad va de 0.001 a 99 999.999 metros, con hasta tres decimales."],
    ["la mitad de una milésima (0.0005)", { cantidad: "0.0005" }, "La cantidad va de 0.001 a 99 999.999 metros, con hasta tres decimales."],
    ["el mínimo, 0.001 metros", { cantidad: "0.001" }, null],
    ["tres decimales", { cantidad: "12.505" }, null],
    ["el máximo, 99 999.999 conos a S/ 99 999.9999", { insumoId: "hilo", cantidad: "99999.999", precio: "99999.9999" }, null],
    ["la cantidad dice su unidad (conos)", { insumoId: "hilo", cantidad: "1.2345" }, "La cantidad va de 0.001 a 99 999.999 conos, con hasta tres decimales."],
    ["sin precio: lo pide por la unidad", { precio: "" }, "Escribe el precio por metro."],
    ["precio con cinco decimales", { precio: "10.55555" }, "El precio va de S/\u00a00 a S/\u00a099 999.9999, con hasta cuatro decimales."],
    ["precio en letras", { precio: "diez" }, "El precio va de S/\u00a00 a S/\u00a099 999.9999, con hasta cuatro decimales."],
    ["precio 0 (un regalo del proveedor)", { precio: "0" }, null],
    ["un botón a S/ 0.0350", { insumoId: "boton", cantidad: "1000", precio: "0.0350" }, null],
    ["descuento en soles mayor que la línea", { cantidad: "2", precio: "10", descuento: "20.01", modoDescuento: "soles" }, "El descuento no puede pasar de lo que cuesta la línea."],
    ["descuento en soles igual a la línea", { cantidad: "2", precio: "10", descuento: "20", modoDescuento: "soles" }, null],
    // El tope del descuento en soles es el IMPORTE REDONDEADO (12.5 × 13.3333 = 166.67), como el candado de la base.
    ["descuento en soles igual al importe redondeado", { cantidad: "12.5", precio: "13.3333", descuento: "166.67", modoDescuento: "soles" }, null],
    ["descuento en soles un céntimo más que el importe redondeado", { cantidad: "12.5", precio: "13.3333", descuento: "166.68", modoDescuento: "soles" }, "El descuento no puede pasar de lo que cuesta la línea."],
    ["101 %", { descuento: "101" }, "El descuento va de 0 % a 100 %."],
    ["100 %", { descuento: "100" }, null],
    ["15 % con cuatro decimales", { descuento: "15.1234" }, null],
  ];
  it.each(casos)("%s", (_, cambios, esperado) => {
    expect(problemaDeLineaInsumo(linea(cambios), CTX)).toBe(esperado);
  });

  it("miles con punto: la línea dice cómo escribirlo (a la vista, bajo la línea), con la unidad", () => {
    expect(problemaDeLineaInsumo(linea({ cantidad: "1.500" }), CTX)).toBe("¿«1.500» son 1500 metros o 1.5 metros? Escríbelo sin punto (1500) o así: 1.5.");
    expect(dudaDeLineaInsumo(linea({ insumoId: "boton", cantidad: "1.000" }), "unidad")).toBe("¿«1.000» son 1000 unidades o 1 unidad? Escríbelo sin punto (1000) o así: 1.");
    expect(dudaDeLineaInsumo(linea({ precio: "1.500" }), "metro")).toContain("¿«1.500» es S/\u00a01500 o S/\u00a01.50?");
    expect(dudaDeLineaInsumo(linea({ modoDescuento: "soles", descuento: "1.000", cantidad: "2000", precio: "5" }), "metro")).toContain("¿«1.000» es S/\u00a01000 o S/\u00a01.00?");
    // En % no hay duda: «1.000» es 1 %.
    expect(dudaDeLineaInsumo(linea({ descuento: "1.000" }), "metro")).toBeNull();
    expect(dudaDeLineaInsumo(linea(), "metro")).toBeNull();
  });
});

describe("camposDeLaOrdenInsumo: la guía de foco (CR3, E6, E7 de la base)", () => {
  it("de arriba abajo: proveedor, entrega (sugerida), cada línea, la nota opcional; con un solo taller, «Llega a» no es un campo", () => {
    const vacia = orden({ proveedorId: "", lineas: [lineaInsumoVacia("l1")] });
    const campos = camposDeLaOrdenInsumo(vacia, CTX, SIN_COMBO);
    expect(campos.map((c) => c.id)).toEqual(["proveedor", "entrega", "linea-l1", "nota"]);
    expect(siguienteDe(campos)?.id).toBe("proveedor");
    expect(sePuedeConfirmar(campos)).toBe(false);
  });
  it("una orden completa se puede guardar; la entrega estimada no bloquea", () => {
    const campos = camposDeLaOrdenInsumo(orden(), CTX, SIN_COMBO);
    expect(sePuedeConfirmar(campos)).toBe(true);
    expect(siguienteDe(campos)?.id).toBe("entrega");
  });
  it("proveedor (vacío o que no es de los que se pueden elegir) y destino (que no es un taller activo) bloquean", () => {
    expect(sePuedeConfirmar(camposDeLaOrdenInsumo(orden({ proveedorId: "" }), CTX, SIN_COMBO))).toBe(false);
    expect(sePuedeConfirmar(camposDeLaOrdenInsumo(orden({ proveedorId: "de-tienda" }), CTX, SIN_COMBO))).toBe(false);
    const sinTaller = camposDeLaOrdenInsumo(orden({ destinoId: "tienda" }), CTX, SIN_COMBO);
    expect(sinTaller.find((c) => c.id === "destino")).toMatchObject({ requerido: true, hecho: false, pendiente: "Elige a qué taller llega." });
    expect(sePuedeConfirmar(sinTaller)).toBe(false);
    const ninguno = camposDeLaOrdenInsumo(orden({ destinoId: "" }), { ...CTX, talleres: new Set() }, SIN_COMBO);
    expect(ninguno.find((c) => c.id === "destino")?.pendiente).toBe("No hay un taller activo al que pueda llegar: pídele al líder que active uno.");
  });
  it("con varios talleres, «Llega a» viene puesto (el taller donde se trabaja) y es sugerido hasta que la persona lo elige: la luz pasa por él y no bloquea", () => {
    const dos = { ...CTX, talleres: new Set(["taller", "taller2"]) };
    const deFabrica = camposDeLaOrdenInsumo(orden(), { ...dos, destinoElegido: false }, SIN_COMBO);
    expect(deFabrica.find((c) => c.id === "destino")).toMatchObject({ requerido: false, sugerido: true, hecho: false });
    expect(siguienteDe(deFabrica)?.id).toBe("destino");
    expect(sePuedeConfirmar(deFabrica)).toBe(true);
    expect(camposDeLaOrdenInsumo(orden(), { ...dos, destinoElegido: true }, SIN_COMBO).find((c) => c.id === "destino")?.hecho).toBe(true);
  });
  it("una entrega ESCRITA fuera de rango bloquea (desde hoy y hasta un año); al editar, la que ya tenía vale aunque haya pasado (E6, E7)", () => {
    for (const entrega of ["2026-10-12", "2027-10-14"]) expect(sePuedeConfirmar(camposDeLaOrdenInsumo(orden({ entrega }), CTX, SIN_COMBO)), entrega).toBe(false);
    for (const entrega of ["2026-10-13", "2027-10-13"]) expect(sePuedeConfirmar(camposDeLaOrdenInsumo(orden({ entrega }), CTX, SIN_COMBO)), entrega).toBe(true);
    expect(sePuedeConfirmar(camposDeLaOrdenInsumo(orden({ entrega: "2026-10-10" }), { ...CTX, entregaOriginal: "2026-10-10" }, SIN_COMBO))).toBe(true);
    expect(sePuedeConfirmar(camposDeLaOrdenInsumo(orden({ entrega: "2026-10-11" }), { ...CTX, entregaOriginal: "2026-10-10" }, SIN_COMBO))).toBe(false);
  });
  it("sin líneas pide agregar un insumo; más de 100 no se guardan; una nota de 501 letras bloquea", () => {
    expect(camposDeLaOrdenInsumo(orden({ lineas: [] }), CTX, SIN_COMBO).find((c) => c.id === "lineas")).toMatchObject({ requerido: true, hecho: false, pendiente: "Agrega al menos un insumo." });
    const muchas = Array.from({ length: 101 }, (_, i) => linea({ clave: `l${i}` }));
    expect(sePuedeConfirmar(camposDeLaOrdenInsumo(orden({ lineas: muchas }), CTX, SIN_COMBO))).toBe(false);
    expect(sePuedeConfirmar(camposDeLaOrdenInsumo(orden({ lineas: muchas.slice(0, 100) }), CTX, SIN_COMBO))).toBe(true);
    expect(sePuedeConfirmar(camposDeLaOrdenInsumo(orden({ nota: "a".repeat(501) }), CTX, SIN_COMBO))).toBe(false);
    expect(sePuedeConfirmar(camposDeLaOrdenInsumo(orden({ nota: "a".repeat(500) }), CTX, SIN_COMBO))).toBe(true);
  });
  it("una línea con problema dice cuál es y bloquea; el responsable solo se pide en una terminal (decisión 39)", () => {
    const campos = camposDeLaOrdenInsumo(orden({ lineas: [linea(), linea({ clave: "l2", precio: "" })] }), CTX, SIN_COMBO);
    expect(campos.find((c) => c.id === "linea-l2")).toMatchObject({ nombre: "Línea 2", hecho: false, pendiente: "Escribe el precio por metro." });
    expect(camposDeLaOrdenInsumo(orden(), CTX, SIN_COMBO).some((c) => c.id === "responsable")).toBe(false);
    const terminal = camposDeLaOrdenInsumo(orden(), CTX, { pide: true, listo: false, motivo: "Elige quién hace esta operación." });
    expect(terminal.at(-1)).toMatchObject({ id: "responsable", requerido: true, hecho: false });
    expect(sePuedeConfirmar(terminal)).toBe(false);
  });
});

describe("lo que viaja a la base: números como texto canónico", () => {
  it("la cantidad con sus decimales justos, el precio con hasta cuatro, el % recortado, los soles con dos; nota y descripción limpias", () => {
    const o = orden({
      entrega: "2026-10-16",
      nota: "  Llega en rollo \u0000 ",
      lineas: [
        linea({ clave: "a", descripcion: "  Crudo, 1.50 m ", cantidad: "12,5", precio: "13.3333", descuento: "15" }),
        linea({ clave: "b", insumoId: "boton", cantidad: "1000", precio: "0.0350" }),
        linea({ clave: "c", insumoId: "hilo", cantidad: "4", precio: "5.50", descuento: "1.5", modoDescuento: "soles" }),
      ],
    });
    expect(argsCrearOrdenInsumo("id-1", o)).toEqual({
      p_id: "id-1",
      p_proveedor_id: "prov",
      p_destino_id: "taller",
      p_fecha_entrega_estimada: "2026-10-16",
      p_nota: "Llega en rollo",
      p_lineas: [
        { insumo_id: "lino", descripcion: "Crudo, 1.50 m", cantidad: "12.5", precio_unitario: "13.3333", descuento_pct: "15" },
        { insumo_id: "boton", cantidad: "1000", precio_unitario: "0.035" },
        { insumo_id: "hilo", cantidad: "4", precio_unitario: "5.5", descuento: "1.50" },
      ],
    });
    expect(argsEditarOrdenInsumo("id-1", 3, o)).toMatchObject({ p_id: "id-1", p_version_esperada: 3 });
    expect(argsCrearOrdenInsumo("id-2", orden())).toMatchObject({ p_fecha_entrega_estimada: null, p_nota: null });
  });
});

describe("editar: la orden guardada vuelve al formulario", () => {
  const DETALLE: DetalleOrdenInsumo = {
    id: "o1",
    numero: 7,
    estado: "generada",
    proveedor: { id: "prov", nombre: "Hilos del Sur EIRL", ruc: null, rubro: "tela" },
    destino: { id: "taller", nombre: "Taller" },
    fechaEmision: "2026-10-13",
    fechaEntregaEstimada: "2026-10-15",
    nota: "Llega en dos rollos",
    creadaPor: "Felipe",
    creadaEn: "2026-10-13T12:00:00Z",
    actualizadaPor: null,
    actualizadaEn: null,
    version: 3,
    anuladaPor: null,
    anuladaEn: null,
    motivoAnulacion: null,
    lineas: [
      { posicion: 1, insumoId: "lino", insumo: "Lino", codigo: "LIN", tipo: "tela", unidadMedida: "metro", unidadActual: "metro", descripcion: "Crudo", cantidad: 12.5, precioUnitario: 13.3333, descuento: 25, descuentoPct: 15, subtotal: 141.67 },
      { posicion: 2, insumoId: "boton", insumo: "Botón", codigo: "BOT", tipo: "avio", unidadMedida: "unidad", unidadActual: "unidad", descripcion: null, cantidad: 1000, precioUnitario: 0.035, descuento: 0, descuentoPct: null, subtotal: 35 },
      { posicion: 3, insumoId: "hilo", insumo: "Hilo", codigo: "HIL", tipo: "avio", unidadMedida: "cono", unidadActual: "cono", descripcion: null, cantidad: 4, precioUnitario: 5.5, descuento: 1.5, descuentoPct: null, subtotal: 20.5 },
    ],
    cantidades: [],
    total: 197.17,
    versiones: [],
    facturacion: [],
    comprobantes: [],
    plazoCreditoDias: null,
    cierres: [],
  };

  it("el descuento vuelve como se escribió (en % si la línea lo recuerda, si no en soles) y el precio con sus decimales", () => {
    const b = borradorDeDetalleInsumo(DETALLE);
    expect(b).toMatchObject({ proveedorId: "prov", destinoId: "taller", entrega: "2026-10-15", nota: "Llega en dos rollos" });
    expect(b.lineas.map((l) => [l.cantidad, l.precio, l.modoDescuento, l.descuento, l.descripcion])).toEqual([
      ["12.5", "13.3333", "pct", "15", "Crudo"],
      ["1000", "0.035", "pct", "", ""],
      ["4", "5.50", "soles", "1.50", ""],
    ]);
  });

  it("vuelta completa: sin tocar nada, la cuenta da lo mismo que la base y lo que viaja es lo que se guardó", () => {
    const b = borradorDeDetalleInsumo(DETALLE);
    expect(b.lineas.map((l) => calcularLineaInsumo(l).subtotalCentimos)).toEqual([14_167, 3_500, 2_050]);
    expect(totalCentimosInsumo(b.lineas)).toBe(19_717);
    expect(argsEditarOrdenInsumo("o1", 3, b).p_lineas).toEqual([
      { insumo_id: "lino", descripcion: "Crudo", cantidad: "12.5", precio_unitario: "13.3333", descuento_pct: "15" },
      { insumo_id: "boton", cantidad: "1000", precio_unitario: "0.035" },
      { insumo_id: "hilo", cantidad: "4", precio_unitario: "5.5", descuento: "1.50" },
    ]);
  });

  it("una línea cuya unidad cambió vuelve con la cantidad VACÍA y su aviso; la guía la pide en la unidad nueva", () => {
    const d = { ...DETALLE, lineas: [{ ...DETALLE.lineas[0]!, unidadActual: "kilo" }, DETALLE.lineas[1]!] };
    const b = borradorDeDetalleInsumo(d);
    expect(b.lineas[0]).toMatchObject({ cantidad: "", unidadCambio: { de: "metro", a: "kilo", cantidad: 12.5 } });
    expect(b.lineas[1]?.unidadCambio).toBeUndefined();
    expect(problemaDeLineaInsumo(b.lineas[0]!, { insumos: new Map([["lino", "kilo"]]) })).toBe("Escribe otra vez la cantidad, ahora en kilos.");
    expect(avisoDeUnidadCambiada("Lino", b.lineas[0]!.unidadCambio!)).toBe(
      "La unidad de Lino cambió de metro a kilo: vuelve a escribir la cantidad en kilos (la orden decía 12.5 metros).",
    );
  });
});

describe("el combo de insumo, lo que lleva la orden y dónde se dice un rechazo", () => {
  const INSUMOS = [
    { id: "b", codigo: "BOT-15", nombre: "Botón nácar", unidadMedida: "unidad", proveedorId: "p2" },
    { id: "a", codigo: "LIN-01", nombre: "Lino crudo", unidadMedida: "metro", proveedorId: "p1" },
    { id: "c", codigo: "HIL-N", nombre: "Hilo negro", unidadMedida: "cono", proveedorId: "p1" },
  ];
  it("por nombre; con el proveedor elegido, lo que se le compra de costumbre primero; el código y la unidad debajo, y se busca por el código", () => {
    expect(opcionesDeInsumo(INSUMOS, "").map((o) => o.texto)).toEqual(["Botón nácar", "Hilo negro", "Lino crudo"]);
    expect(opcionesDeInsumo(INSUMOS, "p1").map((o) => o.texto)).toEqual(["Hilo negro", "Lino crudo", "Botón nácar"]);
    expect(opcionesDeInsumo(INSUMOS, "p1")[0]).toEqual({ valor: "c", texto: "Hilo negro", detalle: "HIL-N · en conos", claves: ["HIL-N"] });
  });
  it("lo que lleva la orden, por unidad y en milésimas (0.1 + 0.2 metros son 0.3)", () => {
    const ls = [linea({ cantidad: "0.1" }), linea({ clave: "b", cantidad: "0.2" }), linea({ clave: "c", insumoId: "hilo", cantidad: "4" }), linea({ clave: "d", insumoId: "", cantidad: "9" })];
    expect(cantidadesDelBorrador(ls, CTX.insumos)).toEqual([
      { unidad: "metro", cantidad: 0.3 },
      { unidad: "cono", cantidad: 4 },
    ]);
  });
  it("un rechazo de la base va donde corresponde: su campo, su línea (la dice el mensaje), la lista o la hoja", () => {
    expect(lugarDelError({ hint: "orden_insumo_proveedor", message: "Elige un proveedor del Taller activo" })).toEqual({ donde: "proveedor" });
    expect(lugarDelError({ hint: "orden_insumo_destino" })).toEqual({ donde: "destino" });
    expect(lugarDelError({ hint: "orden_insumo_entrega" })).toEqual({ donde: "entrega" });
    expect(lugarDelError({ hint: "orden_insumo_nota" })).toEqual({ donde: "nota" });
    expect(lugarDelError({ hint: "orden_insumo_cantidad", message: "La cantidad de la línea 2 va de 0.001 a 99 999.999 metros, con hasta tres decimales" })).toEqual({ donde: "linea", linea: 2 });
    expect(lugarDelError({ hint: "orden_insumo_insumo", message: "La línea 12 necesita un insumo del catálogo que no esté archivado" })).toEqual({ donde: "linea", linea: 12 });
    expect(lugarDelError({ hint: "orden_insumo_sin_lineas" })).toEqual({ donde: "lineas" });
    expect(lugarDelError({ hint: "orden_insumo_ya_guardada" })).toEqual({ donde: "hoja" });
    expect(lugarDelError({ hint: "version_cambiada" })).toEqual({ donde: "hoja" });
    expect(lugarDelError(null)).toEqual({ donde: "hoja" });
  });
});
