import { describe, expect, it } from "vitest";
import { sePuedeConfirmar, siguienteDe } from "./guia-campos";
import {
  POR_REPARTIR,
  aTexto,
  argsCrearOrden,
  textoParaBase,
  argsEditarOrden,
  borradorDeDetalle,
  calcularLinea,
  camposDeLaOrden,
  descuentoDesdePct,
  leerNumero,
  lineaVacia,
  problemaDeEntrega,
  problemaDeLinea,
  totalCentimos,
  unidades,
  type ContextoValidacion,
  type LineaBorrador,
  type OrdenBorrador,
} from "./orden-compra-alta";

const CTX: ContextoValidacion = {
  hoy: "2026-10-10",
  proveedoresActivos: new Set(["prov"]),
  categoriasActivas: new Set(["cat"]),
  marcasActivas: new Set(["marca"]),
  destinos: new Set(["tru", "lima"]),
};
const linea = (o: Partial<LineaBorrador> = {}): LineaBorrador => ({ ...lineaVacia("l1"), categoriaId: "cat", marcaId: "marca", cantidad: "1", precio: "10", ...o });
const orden = (o: Partial<OrdenBorrador> = {}): OrdenBorrador => ({ proveedorId: "prov", destino: "tru", entrega: "", nota: "", lineas: [linea()], ...o });
const SIN_COMBO = { pide: false, listo: true, motivo: null };

describe("textoParaBase: lo invisible no viaja a la base (chaos 2026-10-10)", () => {
  it("quita los caracteres de control (el nulo, la campana…) pero deja saltos de línea y tabulaciones", () => {
    expect(textoParaBase("hola\u0000mundo")).toBe("holamundo");
    expect(textoParaBase("a\u0007b\u001Fc\u007F")).toBe("abc");
    expect(textoParaBase("  línea 1\nlínea 2\tfin  ")).toBe("línea 1\nlínea 2\tfin");
    expect(textoParaBase("\u0000")).toBe("");
  });
  it("la nota y las descripciones salen limpias en los argumentos de la orden; una nota que solo era invisible, no viaja", () => {
    const args = argsCrearOrden("id-1", orden({ nota: "hola\u0000mundo", lineas: [linea({ descripcion: "Cuello\u0000 alto" })] }));
    expect(args.p_nota).toBe("holamundo");
    expect(args.p_lineas[0]?.descripcion).toBe("Cuello alto");
    expect(argsCrearOrden("id-2", orden({ nota: "\u0000" })).p_nota).toBeNull();
  });
});

describe("leerNumero: lo que se tipea en el puesto", () => {
  it("el punto es el decimal (la costumbre del ERP); espacios y «S/» se ignoran; céntimos exactos", () => {
    expect(leerNumero("12.5", 2)).toEqual({ tipo: "ok", escalado: 1250 });
    expect(leerNumero(" 3 ", 0)).toEqual({ tipo: "ok", escalado: 3 });
    expect(leerNumero("0.1", 2)).toEqual({ tipo: "ok", escalado: 10 });
    // «12.500» ya no es 12.50: con tres cifras tras el punto puede ser doce mil quinientos (ver «miles con punto», abajo).
    expect(leerNumero("0.500", 2)).toEqual({ tipo: "ok", escalado: 50 });
    expect(leerNumero("1234.500", 2)).toEqual({ tipo: "ok", escalado: 123450 });
    expect(leerNumero("S/ 25.50", 2)).toEqual({ tipo: "ok", escalado: 2550 });
    expect(leerNumero("12.345", 4)).toEqual({ tipo: "ok", escalado: 123450 });
  });
  it("la coma separa miles («1,950.50», «1,000»); sin punto, «12,50» es doce cincuenta y no mil doscientos cincuenta", () => {
    expect(leerNumero("1,950.50", 2)).toEqual({ tipo: "ok", escalado: 195050 });
    expect(leerNumero("1,000", 0)).toEqual({ tipo: "ok", escalado: 1000 });
    expect(leerNumero("12,345,678", 0)).toEqual({ tipo: "ok", escalado: 12345678 });
    expect(leerNumero("1,500", 2)).toEqual({ tipo: "ok", escalado: 150000 });
    expect(leerNumero("12,50", 2)).toEqual({ tipo: "ok", escalado: 1250 });
    expect(leerNumero("12,5", 4)).toEqual({ tipo: "ok", escalado: 125000 });
  });
  it("lo que no es un número, o trae más decimales de los que caben, se avisa en vez de adivinar o redondear", () => {
    expect(leerNumero("", 2)).toEqual({ tipo: "vacio" });
    expect(leerNumero("diez", 2)).toEqual({ tipo: "mal", motivo: "no_numero" });
    expect(leerNumero("1.2.3", 2)).toEqual({ tipo: "mal", motivo: "no_numero" });
    expect(leerNumero("-5", 2)).toEqual({ tipo: "mal", motivo: "negativo" });
    expect(leerNumero("12.505", 2)).toEqual({ tipo: "mal", motivo: "decimales" });
    expect(leerNumero("10.555", 2)).toEqual({ tipo: "mal", motivo: "decimales" });
    expect(leerNumero("1.5", 0)).toEqual({ tipo: "mal", motivo: "decimales" });
    // A la europea («1.234,50») no se adivina: con punto, la coma es de miles y quedan cinco decimales.
    expect(leerNumero("1.234,50", 2)).toEqual({ tipo: "mal", motivo: "decimales" });
    // «0,500» no es quinientos ni se adivina.
    expect(leerNumero("0,500", 2)).toEqual({ tipo: "mal", motivo: "no_numero" });
  });
  it("miles con punto («1.000», «1.500», «12.500») no se adivinan: en el Perú también se escribe así mil o mil quinientos (chaos 2026-10-10: «1.000» unidades se guardaba como 1)", () => {
    expect(leerNumero("1.000", 0)).toEqual({ tipo: "mal", motivo: "ambiguo" });
    expect(leerNumero("1.500", 2)).toEqual({ tipo: "mal", motivo: "ambiguo" });
    expect(leerNumero("12.500", 2)).toEqual({ tipo: "mal", motivo: "ambiguo" });
    expect(leerNumero("S/ 1.500", 2)).toEqual({ tipo: "mal", motivo: "ambiguo" });
    // Con cuatro decimales (el % de descuento) no hay duda: «1.000» es 1 %.
    expect(leerNumero("1.000", 4)).toEqual({ tipo: "ok", escalado: 10000 });
    // Con coma de miles o con espacio sí se entiende, y con dos decimales también.
    expect(leerNumero("1,000", 0)).toEqual({ tipo: "ok", escalado: 1000 });
    expect(leerNumero("1 000", 0)).toEqual({ tipo: "ok", escalado: 1000 });
    expect(leerNumero("1.50", 2)).toEqual({ tipo: "ok", escalado: 150 });
  });
  it("una línea con miles con punto dice cómo escribirlo, con las dos lecturas", () => {
    expect(problemaDeLinea(linea({ cantidad: "1.000" }), CTX)).toBe("¿«1.000» son 1000? Escribe la cantidad sin punto: 1000.");
    expect(problemaDeLinea(linea({ cantidad: "2", precio: "1.500" }), CTX)).toBe(
      "¿«1.500» es S/ 1500 o S/ 1.50? Escríbelo sin punto (1500) o con dos decimales (1.50).",
    );
  });
  it("aTexto escribe el número canónico que viaja a la base", () => {
    expect(aTexto(2550, 2)).toBe("25.50");
    expect(aTexto(5, 2)).toBe("0.05");
    expect(aTexto(100000, 4, { recortar: true })).toBe("10");
    expect(aTexto(123450, 4, { recortar: true })).toBe("12.345");
  });
});

describe("calcularLinea: igual que la base", () => {
  it("el descuento en % redondea como Postgres (mitad hacia arriba)", () => {
    // round(3 × 33.33 × 10 / 100, 2) = round(9.999, 2) = 10.00 y round(1 × 0.05 × 50 / 100, 2) = round(0.025, 2) = 0.03.
    expect(descuentoDesdePct(3, 3333, 100000)).toBe(1000);
    expect(descuentoDesdePct(1, 5, 500000)).toBe(3);
    // Sin desbordarse con lo más grande que acepta la base: 99 999 × S/ 99 999.99 × 99.9999 % (Postgres da 9 999 889 000.11).
    expect(descuentoDesdePct(99999, 9999999, 999999)).toBe(999988900011);
  });
  it("cada línea: bruto, descuento, porcentaje equivalente y subtotal", () => {
    expect(calcularLinea(linea({ cantidad: "4", precio: "100", descuento: "10" }))).toMatchObject({ brutoCentimos: 40000, descuentoCentimos: 4000, subtotalCentimos: 36000 });
    const soles = calcularLinea(linea({ cantidad: "2", precio: "30", descuento: "5,50", modoDescuento: "soles" }));
    expect(soles).toMatchObject({ brutoCentimos: 6000, descuentoCentimos: 550, subtotalCentimos: 5450 });
    expect(aTexto(Math.round((soles.pctEscalado ?? 0) / 100), 2)).toBe("9.17");
    // Sin precio no hay bruto ni subtotal (todavía no se puede calcular).
    expect(calcularLinea(linea({ precio: "" }))).toMatchObject({ brutoCentimos: null, subtotalCentimos: null });
  });
  it("el total y las unidades de la orden (el caso CR1 de la prueba de la base: S/ 669.50)", () => {
    const ls = [
      linea({ clave: "a", cantidad: "10", precio: "25.50" }),
      linea({ clave: "b", cantidad: "4", precio: "100", descuento: "10" }),
      linea({ clave: "c", cantidad: "2", precio: "30", descuento: "5.50", modoDescuento: "soles" }),
    ];
    expect(totalCentimos(ls)).toBe(66950);
    expect(unidades(ls)).toBe(16);
  });
});

describe("problemaDeLinea: las mismas reglas que crear_orden_compra (CR3 de scripts/pruebas/ordenes_compra.mjs)", () => {
  const casos: [string, Partial<LineaBorrador>, string | null][] = [
    ["lista", {}, null],
    ["sin categoría", { categoriaId: "" }, "Elige la categoría."],
    ["categoría inactiva", { categoriaId: "otra" }, "Elige la categoría."],
    ["sin marca", { marcaId: "" }, "Elige la marca."],
    ["sin cantidad", { cantidad: "" }, "Escribe la cantidad."],
    ["cantidad con decimales", { cantidad: "1.5" }, "La cantidad va de 1 a 99 999 unidades, sin decimales."],
    ["cantidad 0", { cantidad: "0" }, "La cantidad va de 1 a 99 999 unidades, sin decimales."],
    ["cantidad de más", { cantidad: "100000" }, "La cantidad va de 1 a 99 999 unidades, sin decimales."],
    ["sin precio", { precio: "" }, "Escribe el precio por unidad."],
    ["precio con tres decimales", { precio: "10.555" }, "El precio va de S/ 0 a S/ 99 999.99, con hasta dos decimales."],
    ["precio en letras", { precio: "diez" }, "El precio va de S/ 0 a S/ 99 999.99, con hasta dos decimales."],
    ["precio 0 (un regalo del proveedor)", { precio: "0" }, null],
    ["descuento en soles mayor que la línea", { cantidad: "2", precio: "10", descuento: "20.01", modoDescuento: "soles" }, "El descuento no puede pasar de lo que cuesta la línea."],
    ["descuento en soles igual a la línea", { cantidad: "2", precio: "10", descuento: "20", modoDescuento: "soles" }, null],
    ["101 %", { descuento: "101" }, "El descuento va de 0 % a 100 %."],
    ["100 %", { descuento: "100" }, null],
    ["descripción larga", { descripcion: "a".repeat(201) }, "La descripción va hasta 200 letras."],
  ];
  it.each(casos)("%s", (_, cambios, esperado) => {
    expect(problemaDeLinea(linea(cambios), CTX)).toBe(esperado);
  });
});

describe("problemaDeEntrega", () => {
  it("vacía vale; desde hoy y hasta un año", () => {
    expect(problemaDeEntrega("", CTX.hoy)).toBeNull();
    expect(problemaDeEntrega("2026-10-10", CTX.hoy)).toBeNull();
    expect(problemaDeEntrega("2026-10-09", CTX.hoy)).toBe("La entrega estimada no puede ser antes de hoy.");
    expect(problemaDeEntrega("2027-10-10", CTX.hoy)).toBeNull();
    expect(problemaDeEntrega("2027-10-11", CTX.hoy)).toBe("La entrega estimada va hasta dentro de un año.");
  });
  it("al editar, la fecha que ya tenía la orden vale aunque haya pasado; moverla a otro día pasado, no (como la base, caso E7)", () => {
    expect(problemaDeEntrega("2026-10-07", CTX.hoy, "2026-10-07")).toBeNull();
    expect(problemaDeEntrega("2026-10-08", CTX.hoy, "2026-10-07")).toBe("La entrega estimada no puede ser antes de hoy.");
    const campos = camposDeLaOrden(orden({ entrega: "2026-10-07" }), { ...CTX, entregaOriginal: "2026-10-07" }, SIN_COMBO);
    expect(campos.find((c) => c.id === "entrega")?.hecho).toBe(true);
  });
});

describe("camposDeLaOrden: la guía de foco", () => {
  it("de arriba abajo: proveedor, a dónde llega, entrega (sugerida), cada línea; la nota es opcional", () => {
    const vacia = orden({ proveedorId: "", destino: "", lineas: [lineaVacia("l1")] });
    const campos = camposDeLaOrden(vacia, CTX, SIN_COMBO);
    expect(campos.map((c) => c.id)).toEqual(["proveedor", "destino", "entrega", "linea-l1", "nota"]);
    expect(siguienteDe(campos)?.id).toBe("proveedor");
    expect(sePuedeConfirmar(campos)).toBe(false);
  });
  it("una entrega ESCRITA fuera de rango sí bloquea (la base la rechazaría): la guía no dice «puedes seguir así» (chaos 2026-10-10)", () => {
    for (const entrega of ["2999-01-01", "2026-10-09"]) {
      const campos = camposDeLaOrden(orden({ entrega }), CTX, SIN_COMBO);
      expect(campos.find((c) => c.id === "entrega")).toMatchObject({ requerido: true, hecho: false });
      expect(sePuedeConfirmar(campos)).toBe(false);
    }
    // Al editar, la que ya tenía y no se tocó sigue sin juzgarse (E7 de la base).
    expect(sePuedeConfirmar(camposDeLaOrden(orden({ entrega: "2026-10-01" }), { ...CTX, entregaOriginal: "2026-10-01" }, SIN_COMBO))).toBe(true);
  });
  it("la entrega estimada no bloquea: sin ella se puede guardar", () => {
    const campos = camposDeLaOrden(orden(), CTX, SIN_COMBO);
    expect(sePuedeConfirmar(campos)).toBe(true);
    expect(siguienteDe(campos)?.id).toBe("entrega");
  });
  it("«Por repartir» es un destino válido; uno que no es de la lista, no", () => {
    expect(sePuedeConfirmar(camposDeLaOrden(orden({ destino: POR_REPARTIR }), CTX, SIN_COMBO))).toBe(true);
    expect(sePuedeConfirmar(camposDeLaOrden(orden({ destino: "taller" }), CTX, SIN_COMBO))).toBe(false);
  });
  it("«Llega a» de fábrica (la sede donde se trabaja) no lleva ✓ hasta que la persona lo elige: es sugerido, la luz pasa por él y nunca bloquea (ADR-0284 act. h)", () => {
    const deFabrica = camposDeLaOrden(orden(), { ...CTX, destinoElegido: false }, SIN_COMBO);
    expect(deFabrica.find((c) => c.id === "destino")).toMatchObject({ nombre: "Llega a", requerido: false, sugerido: true, hecho: false });
    expect(siguienteDe(deFabrica)?.id).toBe("destino");
    expect(sePuedeConfirmar(deFabrica)).toBe(true);
    // Elegido (aunque sea la misma tienda), o al editar (sin dato): hecho, y la luz sigue a la entrega.
    const elegido = camposDeLaOrden(orden(), { ...CTX, destinoElegido: true }, SIN_COMBO);
    expect(elegido.find((c) => c.id === "destino")).toMatchObject({ hecho: true });
    expect(siguienteDe(elegido)?.id).toBe("entrega");
    expect(camposDeLaOrden(orden(), CTX, SIN_COMBO).find((c) => c.id === "destino")?.hecho).toBe(true);
  });
  it("un destino que no es de la lista bloquea aunque nadie lo haya elegido", () => {
    const campos = camposDeLaOrden(orden({ destino: "" }), { ...CTX, destinoElegido: false }, SIN_COMBO);
    expect(campos.find((c) => c.id === "destino")).toMatchObject({ requerido: true, hecho: false });
    expect(sePuedeConfirmar(campos)).toBe(false);
  });
  it("una línea con problema dice cuál es, y bloquea", () => {
    const campos = camposDeLaOrden(orden({ lineas: [linea(), linea({ clave: "l2", marcaId: "" })] }), CTX, SIN_COMBO);
    const l2 = campos.find((c) => c.id === "linea-l2");
    expect(l2).toMatchObject({ nombre: "Línea 2", hecho: false, pendiente: "Elige la marca." });
    expect(sePuedeConfirmar(campos)).toBe(false);
  });
  it("sin líneas pide agregar una; una nota de más de 500 letras bloquea", () => {
    expect(camposDeLaOrden(orden({ lineas: [] }), CTX, SIN_COMBO).find((c) => c.id === "lineas")).toMatchObject({ requerido: true, hecho: false });
    expect(sePuedeConfirmar(camposDeLaOrden(orden({ nota: "a".repeat(501) }), CTX, SIN_COMBO))).toBe(false);
    expect(sePuedeConfirmar(camposDeLaOrden(orden({ nota: "a".repeat(500) }), CTX, SIN_COMBO))).toBe(true);
  });
  it("el responsable solo aparece en una terminal (decisión 39), y sin elegirlo no se guarda", () => {
    expect(camposDeLaOrden(orden(), CTX, SIN_COMBO).some((c) => c.id === "responsable")).toBe(false);
    const terminal = camposDeLaOrden(orden(), CTX, { pide: true, listo: false, motivo: "Elige quién hace esta operación." });
    expect(terminal.at(-1)).toMatchObject({ id: "responsable", requerido: true, hecho: false });
    expect(sePuedeConfirmar(terminal)).toBe(false);
  });
});

describe("argsCrearOrden: lo que viaja a la base", () => {
  it("números como texto canónico, el % recortado, los soles con dos decimales, descripción sin espacios de más", () => {
    const o = orden({
      entrega: "2026-10-13",
      nota: "  Llega en fardo  ",
      lineas: [
        linea({ clave: "a", descripcion: "  Polo básico ", cantidad: "10", precio: "25,5" }),
        linea({ clave: "b", cantidad: "4", precio: "100", descuento: "10" }),
        linea({ clave: "c", cantidad: "2", precio: "30", descuento: "5.5", modoDescuento: "soles" }),
      ],
    });
    expect(argsCrearOrden("id-1", o)).toEqual({
      p_id: "id-1",
      p_proveedor_id: "prov",
      p_destino_id: "tru",
      p_fecha_entrega_estimada: "2026-10-13",
      p_nota: "Llega en fardo",
      p_lineas: [
        { categoria_id: "cat", marca_id: "marca", descripcion: "Polo básico", cantidad: "10", precio_unitario: "25.50" },
        { categoria_id: "cat", marca_id: "marca", cantidad: "4", precio_unitario: "100.00", descuento_pct: "10" },
        { categoria_id: "cat", marca_id: "marca", cantidad: "2", precio_unitario: "30.00", descuento: "5.50" },
      ],
    });
  });
  it("«Por repartir» viaja como destino nulo; sin entrega ni nota, nulos", () => {
    expect(argsCrearOrden("id-2", orden({ destino: POR_REPARTIR }))).toMatchObject({ p_destino_id: null, p_fecha_entrega_estimada: null, p_nota: null });
  });
});

describe("editar: la orden guardada vuelve al formulario y viaja con su versión", () => {
  const DETALLE = {
    id: "oc-1",
    numero: 129,
    estado: "generada" as const,
    proveedor: { id: "prov", nombre: "Textiles Andina SAC", ruc: null },
    destino: null,
    fechaEmision: "2026-10-10",
    fechaEntregaEstimada: "2026-10-15",
    nota: "Llega en dos fardos",
    creadaPor: "Felipe",
    creadaEn: "2026-10-10T12:00:00Z",
    actualizadaPor: null,
    actualizadaEn: null,
    version: 3,
    anuladaPor: null,
    anuladaEn: null,
    motivoAnulacion: null,
    lineas: [
      { posicion: 1, categoriaId: "cat", categoria: "Chompas", marcaId: "marca", marca: "CAYLA", descripcion: "Cuello alto", cantidad: 30, precioUnitario: 42, descuento: 0, descuentoPct: null, subtotal: 1260 },
      { posicion: 2, categoriaId: "cat", categoria: "Tops", marcaId: "marca", marca: "CAYLA", descripcion: null, cantidad: 12, precioUnitario: 25.5, descuento: 15.3, descuentoPct: 5, subtotal: 290.7 },
      { posicion: 3, categoriaId: "cat", categoria: "Tops", marcaId: "marca", marca: "CAYLA", descripcion: null, cantidad: 2, precioUnitario: 10, descuento: 2.5, descuentoPct: null, subtotal: 17.5 },
    ],
    unidades: 44,
    total: 1568.2,
  };

  it("el descuento vuelve como se escribió: en % si la línea lo recuerda, si no en soles; sin descuento, en % y vacío", () => {
    const b = borradorDeDetalle(DETALLE);
    expect(b).toMatchObject({ proveedorId: "prov", destino: POR_REPARTIR, entrega: "2026-10-15", nota: "Llega en dos fardos" });
    expect(b.lineas.map((l) => [l.clave, l.cantidad, l.precio, l.modoDescuento, l.descuento, l.descripcion])).toEqual([
      ["l1", "30", "42.00", "pct", "", "Cuello alto"],
      ["l2", "12", "25.50", "pct", "5", ""],
      ["l3", "2", "10.00", "soles", "2.50", ""],
    ]);
  });

  it("vuelta completa: lo que se lee y se vuelve a mandar suma lo mismo que la base (sin tocar nada, nada cambia)", () => {
    const b = borradorDeDetalle(DETALLE);
    expect(b.lineas.map((l) => calcularLinea(l).subtotalCentimos)).toEqual([126000, 29070, 1750]);
    expect(totalCentimos(b.lineas)).toBe(156820);
    const args = argsEditarOrden("oc-1", 3, b);
    expect(args).toMatchObject({ p_id: "oc-1", p_version_esperada: 3, p_destino_id: null, p_fecha_entrega_estimada: "2026-10-15" });
    expect(args.p_lineas).toEqual([
      { categoria_id: "cat", marca_id: "marca", descripcion: "Cuello alto", cantidad: "30", precio_unitario: "42.00" },
      { categoria_id: "cat", marca_id: "marca", cantidad: "12", precio_unitario: "25.50", descuento_pct: "5" },
      { categoria_id: "cat", marca_id: "marca", cantidad: "2", precio_unitario: "10.00", descuento: "2.50" },
    ]);
  });
});
