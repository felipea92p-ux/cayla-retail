import { describe, expect, it } from "vitest";
import {
  AVISO_DE_CORTE_COMPROBANTE,
  argsRegistrarComprobante,
  calcularRenglon,
  camposDelComprobante,
  costoNetoCentimos,
  cuadrarCentavos,
  deMasPorLinea,
  detalleDeRegistro,
  discriminaIgv,
  esEnvioConOtrosDatos,
  igvDeCentimos,
  leerResultadoComprobante,
  lineasDePedida,
  lineasParaBase,
  nombreDeLinea,
  pagoParaBase,
  palabrasDelTipo,
  pidePapel,
  pedidasSinRenglon,
  pendienteDe,
  precargarLineas,
  primerProblema,
  problemaDeEmision,
  problemaDeLinea,
  problemaDeMotivoComprobante,
  problemaDePago,
  problemaDeVencimiento,
  renglonesDePedida,
  resumenDeAvisos,
  sePuedeAnularComprobante,
  subtotalNetoCentimos,
  sugerirSerie,
  sumaDePago,
  textoDeTipo,
  tituloDeRegistro,
  TIPOS_COMPROBANTE,
  toleranciaDelTotalDecimas,
  totalesComprobante,
  unidadesDelPapel,
  vencimientoSugerido,
  type BorradorComprobante,
  type ContextoComprobante,
  type LineaComprobante,
} from "./comprobante-orden-reglas";
import type { LineaDetalle } from "./ordenes-compra-reglas";

// Lo que cuida este archivo: la pantalla de «Registrar comprobante» (ADR-0362, fase 2) calcula, valida y arma el envío con las MISMAS reglas
// que `registrar_comprobante_orden` (docs/compras/ordenes-de-compra-2026-10/contrato-comprobante-de-orden.md). Si una cifra aquí difiere de
// la de la base, el papel y «Por pagar» dejan de coincidir.

const CAT = "0b6f1c2e-0000-4000-8000-0000000000c1";
const MARCA = "0b6f1c2e-0000-4000-8000-0000000000d1";
const ITEM_1 = "0b6f1c2e-0000-4000-8000-000000000011";
const ITEM_2 = "0b6f1c2e-0000-4000-8000-000000000022";
const ITEM_3 = "0b6f1c2e-0000-4000-8000-000000000033";
const ORDEN = "0b6f1c2e-0000-4000-8000-000000000001";
const TOKEN = "0b6f1c2e-0000-4000-8000-0000000000ff";

function pedida(over: Partial<LineaDetalle> = {}): LineaDetalle {
  return {
    id: ITEM_1,
    posicion: 1,
    categoriaId: CAT,
    categoria: "Polos",
    marcaId: MARCA,
    marca: "Kero",
    descripcion: null,
    cantidad: 10,
    precioUnitario: 25.5,
    descuento: 0,
    descuentoPct: null,
    subtotal: 255,
    facturado: 0,
    pendiente: 10,
    enviado: null,
    porEnviar: null,
    ...over,
  };
}

/** El contador de claves de la pantalla. */
function claves() {
  let n = 0;
  return () => `l${++n}`;
}

const CTX: ContextoComprobante = {
  hoy: "2026-10-12",
  categoriasActivas: new Set([CAT]),
  marcasActivas: new Set([MARCA]),
  lineasDeLaOrden: new Set([ITEM_1, ITEM_2, ITEM_3]),
};

function renglon(over: Partial<LineaComprobante> = {}): LineaComprobante {
  return { clave: "l1", ordenItemId: ITEM_1, categoriaId: CAT, marcaId: MARCA, descripcion: "", cantidad: "10", costo: "25.50", precioVenta: "", ...over };
}

function borrador(over: Partial<BorradorComprobante> = {}): BorradorComprobante {
  return {
    tipo: "factura",
    serie: "F001",
    numero: "123",
    emision: "2026-10-12",
    condicion: "credito",
    vencimiento: "2026-11-11",
    sumaIgv: true,
    totalDelPapel: "",
    lineas: [renglon()],
    pagos: [],
    nota: "",
    ...over,
  };
}

const ELEGIDO = { tipo: true, condicion: true };
const SIN_TERMINAL = { pide: false, listo: true, motivo: null };

describe("sugerirSerie: el ejemplo de la serie sigue al tipo (ADR-0290)", () => {
  it("factura F001, boleta B001; una nota de venta lleva un ejemplo neutro de solo cifras", () => {
    expect(sugerirSerie("factura")).toBe("F001");
    expect(sugerirSerie("boleta")).toBe("B001");
    expect(sugerirSerie("nota_venta")).toMatch(/^\d+$/);
  });
  it("sin tipo no promete nada, y recorre todos los tipos sin repetir el de otro", () => {
    expect(sugerirSerie("")).toBe("Serie");
    const series = (["factura", "boleta", "nota_venta"] as const).map(sugerirSerie);
    expect(new Set(series).size).toBe(3);
  });
  it("el tipo se dice como se lee y solo una factura discrimina IGV", () => {
    expect(textoDeTipo("nota_venta")).toBe("Nota de venta");
    expect(textoDeTipo("")).toBe("Comprobante");
    expect(discriminaIgv("factura")).toBe(true);
    expect(discriminaIgv("boleta")).toBe(false);
    expect(discriminaIgv("nota_venta")).toBe(false);
    expect(discriminaIgv("")).toBe(false);
  });
});

describe("«Sin comprobante», el cuarto tipo (decisión 50, Felipe 2026-10-12)", () => {
  const SIN = borrador({ tipo: "sin_comprobante", serie: "", numero: "" });
  it("son cuatro tipos, en el orden de la pantalla; sin comprobante no pide papel ni lleva IGV", () => {
    expect(TIPOS_COMPROBANTE.map((t) => t.texto)).toEqual(["Boleta", "Nota de venta", "Factura", "Sin comprobante"]);
    expect(pidePapel("sin_comprobante")).toBe(false);
    expect((["boleta", "nota_venta", "factura", ""] as const).every(pidePapel)).toBe(true);
    expect(discriminaIgv("sin_comprobante")).toBe(false);
    expect(totalesComprobante([renglon({ cantidad: "3", costo: "10" })], { tipo: "sin_comprobante", sumaIgv: true }).totalCentimos).toBe(3000);
  });
  it("la guía no pide serie ni número, y la fecha es la de la compra", () => {
    const campos = camposDelComprobante(SIN, CTX, ELEGIDO, SIN_TERMINAL);
    expect(campos.map((c) => c.id)).toEqual(["tipo", "emision", "condicion", "vencimiento", "linea-l1", "nota"]);
    expect(campos.find((c) => c.id === "emision")?.nombre).toBe("Fecha de la compra");
    expect(primerProblema(SIN, CTX)).toBeNull();
  });
  it("a la base no viaja serie ni número aunque hayan quedado escritos de antes (la base pone SC-000001)", () => {
    const args = argsRegistrarComprobante(borrador({ tipo: "sin_comprobante", serie: "b001", numero: "77" }), { ordenId: ORDEN, token: TOKEN, pago: null });
    expect(args).toMatchObject({ p_tipo: "sin_comprobante", p_serie: "", p_numero: "", p_suma_igv: false });
  });
  it("las palabras de la pantalla dicen «compra», no «papel»; con papel no cambian", () => {
    expect(palabrasDelTipo("sin_comprobante")).toMatchObject({
      total: "Total de la compra",
      seccion: "Lo que compraste",
      boton: "Registrar sin comprobante",
      sinIgv: "Sin comprobante no hay IGV: lo que pagaste es el costo.",
    });
    expect(palabrasDelTipo("boleta")).toMatchObject({ total: "Total del papel", seccion: "Lo que dice el papel", boton: "Registrar la compra" });
    // Sin papel elegido todavía (la pantalla arranca así): no habla de «una comprobante», dice que elija.
    expect(palabrasDelTipo("").sinIgv).toBe("Solo una factura suma el IGV aparte: elige qué papel te dieron.");
    expect(palabrasDelTipo("boleta").sinIgv).toBe("Una boleta no lleva IGV aparte: el costo del papel es el costo.");
    expect(palabrasDelTipo("factura").sinIgv).toBeNull();
  });
  it("el aviso al guardar nombra el número interno", () => {
    expect(tituloDeRegistro("sin_comprobante", "SC-000004")).toBe("Compra sin comprobante SC-000004 registrada");
    expect(tituloDeRegistro("boleta", "B001-123")).toBe("B001-123 registrado");
  });
});

describe("cuadrar centavos: el papel suma lo mismo que la orden", () => {
  it("3 unidades de S/ 29.00 no son 3 × 9.67 (29.01): son 2 × 9.67 + 1 × 9.66", () => {
    expect(cuadrarCentavos(3, 2900)).toEqual([
      { cantidad: 2, costoCentimos: 967 },
      { cantidad: 1, costoCentimos: 966 },
    ]);
  });
  it("si el costo ya es exacto, un solo renglón; si el resto es chico, van primero las unidades del costo de abajo", () => {
    expect(cuadrarCentavos(10, 25500)).toEqual([{ cantidad: 10, costoCentimos: 2550 }]);
    expect(cuadrarCentavos(3, 2899)).toEqual([
      { cantidad: 2, costoCentimos: 966 },
      { cantidad: 1, costoCentimos: 967 },
    ]);
  });
  it("lo que no se puede partir no devuelve nada", () => {
    expect(cuadrarCentavos(0, 100)).toEqual([]);
    expect(cuadrarCentavos(2.5, 100)).toEqual([]);
    expect(cuadrarCentavos(3, -1)).toEqual([]);
  });
  it("siempre alcanzan dos renglones que suman las unidades y los céntimos exactos, con costos a un centavo de distancia", () => {
    // 120 mil casos: se juntan los fallos y se compara una sola vez (un `expect` por caso tardaba seis segundos).
    const fallos: string[] = [];
    for (let cantidad = 1; cantidad <= 40; cantidad++) {
      for (let total = 0; total <= 3000; total++) {
        const filas = cuadrarCentavos(cantidad, total);
        const unidades = filas.reduce((a, f) => a + f.cantidad, 0);
        const centimos = filas.reduce((a, f) => a + f.cantidad * f.costoCentimos, 0);
        const bien =
          filas.length >= 1 &&
          filas.length <= 2 &&
          unidades === cantidad &&
          centimos === total &&
          filas.every((f) => f.cantidad > 0) &&
          // El renglón de más unidades (o el más caro si empatan) va primero: es el costo redondeado al más cercano.
          (filas.length === 1 || (Math.abs(filas[0]!.costoCentimos - filas[1]!.costoCentimos) === 1 && filas[0]!.cantidad >= filas[1]!.cantidad));
        if (!bien) fallos.push(`${cantidad} × ${total}: ${JSON.stringify(filas)}`);
      }
    }
    expect(fallos.slice(0, 5)).toEqual([]);
  });
});

describe("precarga: lo pendiente de cada línea, al costo neto", () => {
  it("el costo neto es (precio × cantidad − descuento) / cantidad a dos decimales", () => {
    const l = pedida({ cantidad: 3, precioUnitario: 10, descuento: 1, descuentoPct: null, subtotal: 29, pendiente: 3 });
    expect(subtotalNetoCentimos(l)).toBe(2900);
    expect(costoNetoCentimos(l)).toBe(967);
    expect(costoNetoCentimos(pedida({ cantidad: 4, subtotal: 360 }))).toBe(9000);
    expect(costoNetoCentimos(pedida({ cantidad: 0, subtotal: 0 }))).toBe(0);
  });
  it("lo pendiente: el que dice la base; si no lo dice, lo pedido menos lo facturado; nunca menos de cero", () => {
    expect(pendienteDe(pedida({ cantidad: 10, facturado: 4, pendiente: 6 }))).toBe(6);
    expect(pendienteDe(pedida({ cantidad: 10, facturado: 4, pendiente: null }))).toBe(6);
    expect(pendienteDe(pedida({ cantidad: 10, facturado: null, pendiente: null }))).toBe(10);
    expect(pendienteDe(pedida({ cantidad: 10, facturado: 12, pendiente: null }))).toBe(0);
  });
  it("con todo por llegar en papel, los centavos se cuadran contra la orden (2 × 9.67 + 1 × 9.66)", () => {
    const lineas = lineasDePedida(pedida({ id: ITEM_2, cantidad: 3, precioUnitario: 10, descuento: 1, subtotal: 29, pendiente: 3, descripcion: "Manga corta" }), claves());
    expect(lineas.map((l) => [l.cantidad, l.costo])).toEqual([
      ["2", "9.67"],
      ["1", "9.66"],
    ]);
    expect(lineas.every((l) => l.ordenItemId === ITEM_2 && l.categoriaId === CAT && l.marcaId === MARCA && l.descripcion === "Manga corta")).toBe(true);
    expect(lineas.map((l) => l.clave)).toEqual(["l1", "l2"]);
    // Y suman lo mismo que la orden.
    const suma = lineas.reduce((a, l) => a + (calcularRenglon(l).subtotalCentimos ?? 0), 0);
    expect(suma).toBe(2900);
  });
  it("con una parte ya facturada queda un solo renglón con lo pendiente y el costo redondeado", () => {
    expect(renglonesDePedida(pedida({ cantidad: 10, facturado: 8, pendiente: 2 }))).toEqual([{ cantidad: 2, costoCentimos: 2550 }]);
  });
  it("sin nada pendiente, un renglón con el costo y la cantidad vacía; sin id de línea no hay nada que precargar", () => {
    const [ya] = lineasDePedida(pedida({ facturado: 10, pendiente: 0 }), claves());
    expect(ya).toMatchObject({ cantidad: "", costo: "25.50", ordenItemId: ITEM_1 });
    expect(lineasDePedida(pedida({ id: null }), claves())).toEqual([]);
  });
  it("la orden entera: solo las líneas con algo pendiente, en su orden, con claves distintas", () => {
    const orden = {
      lineas: [
        pedida(),
        pedida({ id: ITEM_2, posicion: 2, cantidad: 3, precioUnitario: 10, descuento: 1, subtotal: 29, pendiente: 3 }),
        pedida({ id: ITEM_3, posicion: 3, cantidad: 4, subtotal: 360, facturado: 4, pendiente: 0 }),
      ],
    };
    const lineas = precargarLineas(orden, claves());
    expect(lineas.map((l) => [l.ordenItemId, l.cantidad, l.costo])).toEqual([
      [ITEM_1, "10", "25.50"],
      [ITEM_2, "2", "9.67"],
      [ITEM_2, "1", "9.66"],
    ]);
    expect(new Set(lineas.map((l) => l.clave)).size).toBe(3);
    // La línea que ya llegó completa se ofrece para poner a mano; las demás ya están.
    expect(pedidasSinRenglon(orden, lineas).map((l) => l.id)).toEqual([ITEM_3]);
    expect(pedidasSinRenglon(orden, [])).toHaveLength(3);
  });
});

describe("cantidades y costos: se leen como se tipean", () => {
  it("calcula el subtotal del renglón en céntimos exactos", () => {
    expect(calcularRenglon({ cantidad: "10", costo: "25.50" })).toEqual({ cantidad: 10, costoCentimos: 2550, subtotalCentimos: 25500 });
    expect(calcularRenglon({ cantidad: "3", costo: "9,67" })).toMatchObject({ costoCentimos: 967, subtotalCentimos: 2901 });
    expect(calcularRenglon({ cantidad: "", costo: "9.67" }).subtotalCentimos).toBeNull();
    expect(calcularRenglon({ cantidad: "2", costo: "abc" }).subtotalCentimos).toBeNull();
  });
  it("suma las unidades de los renglones que se pueden leer", () => {
    expect(unidadesDelPapel([renglon({ cantidad: "10" }), renglon({ clave: "l2", cantidad: "3" }), renglon({ clave: "l3", cantidad: "x" })])).toBe(13);
  });
});

describe("totales: subtotal, IGV 18 % solo en factura con «Sumar IGV», y total", () => {
  const dos = [renglon({ cantidad: "10", costo: "100.00" }), renglon({ clave: "l2", cantidad: "2", costo: "130.00" })];
  it("factura con IGV: el 18 % del subtotal se suma al total", () => {
    expect(totalesComprobante(dos, { tipo: "factura", sumaIgv: true })).toEqual({
      subtotalCentimos: 126000,
      igvCentimos: 22680,
      totalCentimos: 148680,
      usaTotalDelPapel: false,
      problemaTotalDelPapel: null,
    });
  });
  it("factura sin «Sumar IGV», boleta y nota de venta: el total es exactamente el subtotal", () => {
    expect(totalesComprobante(dos, { tipo: "factura", sumaIgv: false })).toMatchObject({ igvCentimos: 0, totalCentimos: 126000 });
    expect(totalesComprobante(dos, { tipo: "boleta", sumaIgv: true })).toMatchObject({ igvCentimos: 0, totalCentimos: 126000 });
    expect(totalesComprobante(dos, { tipo: "nota_venta", sumaIgv: true })).toMatchObject({ igvCentimos: 0, totalCentimos: 126000 });
  });
  it("el IGV redondea la mitad hacia arriba, como el round de la base", () => {
    expect(igvDeCentimos(100)).toBe(18);
    expect(igvDeCentimos(25)).toBe(5); // 0.045 → 0.05
    expect(igvDeCentimos(24)).toBe(4); // 0.0432 → 0.04
    expect(igvDeCentimos(0)).toBe(0);
    expect(igvDeCentimos(2542)).toBe(458); // 4.5756 → 4.58
  });
  it("el total del papel manda dentro de la tolerancia de la base y el IGV absorbe la diferencia", () => {
    const uno = [renglon({ cantidad: "1", costo: "25.42" })];
    // Subtotal 25.42 + IGV 4.58 = 30.00. El papel dice 30.01: dentro de la tolerancia.
    const t = totalesComprobante(uno, { tipo: "factura", sumaIgv: true, totalDelPapel: "30.01" });
    expect(t).toMatchObject({ subtotalCentimos: 2542, igvCentimos: 459, totalCentimos: 3001, usaTotalDelPapel: true, problemaTotalDelPapel: null });
    // El mismo total que el calculado no cambia nada.
    expect(totalesComprobante(uno, { tipo: "factura", sumaIgv: true, totalDelPapel: "30.00" })).toMatchObject({ usaTotalDelPapel: false, totalCentimos: 3000 });
  });
  it("la tolerancia es la de registrar_comprobante_orden: 0.01 por renglón más uno, más 0.006 por unidad (ni más ni menos)", () => {
    // Un renglón de 1 unidad: 0.01 × 2 + 0.006 × 1 = 0.026 → hasta 2 centavos de diferencia, no 3.
    expect(toleranciaDelTotalDecimas(1, 1)).toBe(26);
    const uno = [renglon({ cantidad: "1", costo: "25.42" })];
    const con = (total: string) => totalesComprobante(uno, { tipo: "factura", sumaIgv: true, totalDelPapel: total });
    expect(con("30.02").problemaTotalDelPapel).toBeNull();
    expect(con("29.98").problemaTotalDelPapel).toBeNull();
    expect(con("30.03").problemaTotalDelPapel).toMatch(/no cuadra/);
    expect(con("29.97").problemaTotalDelPapel).toMatch(/no cuadra/);
    // Con muchas unidades la tolerancia crece (el redondeo de cada costo se agranda con el IGV): 100 unidades × 0.006 = 0.60.
    const muchas = [renglon({ cantidad: "100", costo: "0.10" })];
    expect(totalesComprobante(muchas, { tipo: "factura", sumaIgv: true, totalDelPapel: "11.80" })).toMatchObject({ problemaTotalDelPapel: null });
    expect(totalesComprobante(muchas, { tipo: "factura", sumaIgv: true, totalDelPapel: "12.40" }).problemaTotalDelPapel).toBeNull();
    expect(totalesComprobante(muchas, { tipo: "factura", sumaIgv: true, totalDelPapel: "12.50" }).problemaTotalDelPapel).toMatch(/no cuadra/);
  });
  it("un total del papel por debajo del subtotal no sirve, aunque esté dentro de la tolerancia", () => {
    // 100 unidades × 0.01 = subtotal 1.00; con IGV 1.18. Tolerancia: 0.02 + 0.60 = 0.62; el papel dice 0.90 (< subtotal, a 0.28 del calculado).
    const baratas = [renglon({ cantidad: "100", costo: "0.01" })];
    expect(totalesComprobante(baratas, { tipo: "factura", sumaIgv: true, totalDelPapel: "0.90" }).problemaTotalDelPapel).toMatch(/no cuadra/);
    expect(totalesComprobante(baratas, { tipo: "factura", sumaIgv: true, totalDelPapel: "1.00" }).problemaTotalDelPapel).toBeNull();
  });
  it("un total del papel que se aleja más de la tolerancia, o que no es un monto, no sirve y se dice por qué", () => {
    const uno = [renglon({ cantidad: "1", costo: "25.42" })];
    const lejos = totalesComprobante(uno, { tipo: "factura", sumaIgv: true, totalDelPapel: "31.00" });
    expect(lejos.problemaTotalDelPapel).toMatch(/no cuadra con las líneas/);
    expect(lejos.totalCentimos).toBe(3000);
    expect(lejos.usaTotalDelPapel).toBe(false);
    expect(totalesComprobante(uno, { tipo: "factura", sumaIgv: true, totalDelPapel: "treinta" }).problemaTotalDelPapel).toMatch(/hasta dos decimales/);
  });
  it("sin IGV el total del papel que se haya escrito no cuenta", () => {
    const uno = [renglon({ cantidad: "1", costo: "25.42" })];
    expect(totalesComprobante(uno, { tipo: "boleta", sumaIgv: true, totalDelPapel: "99" })).toMatchObject({ totalCentimos: 2542, problemaTotalDelPapel: null });
    expect(totalesComprobante(uno, { tipo: "factura", sumaIgv: false, totalDelPapel: "99" })).toMatchObject({ totalCentimos: 2542, problemaTotalDelPapel: null });
  });
  it("un renglón a medio llenar no suma", () => {
    expect(totalesComprobante([renglon({ cantidad: "", costo: "9.00" })], { tipo: "boleta", sumaIgv: false }).totalCentimos).toBe(0);
  });
});

describe("problemaDeLinea: lo mismo que rechaza la función", () => {
  it("un renglón de la orden listo no tiene problema", () => {
    expect(problemaDeLinea(renglon(), CTX)).toBeNull();
    expect(problemaDeLinea(renglon({ costo: "0" }), CTX)).toBeNull();
    expect(problemaDeLinea(renglon({ precioVenta: "59.90" }), CTX)).toBeNull();
  });
  it("un renglón que no es de esta orden se rechaza", () => {
    expect(problemaDeLinea(renglon({ ordenItemId: "otra-orden" }), CTX)).toMatch(/no es de esta orden/);
  });
  it("algo que no estaba en la orden trae su categoría y su marca, activas", () => {
    const fuera = renglon({ ordenItemId: null, categoriaId: "", marcaId: "" });
    expect(problemaDeLinea(fuera, CTX)).toBe("Elige la categoría.");
    expect(problemaDeLinea({ ...fuera, categoriaId: CAT }, CTX)).toBe("Elige la marca.");
    expect(problemaDeLinea({ ...fuera, categoriaId: CAT, marcaId: MARCA }, CTX)).toBeNull();
    expect(problemaDeLinea({ ...fuera, categoriaId: "inactiva", marcaId: MARCA }, CTX)).toBe("Elige la categoría.");
    expect(problemaDeLinea({ ...fuera, categoriaId: CAT, marcaId: MARCA, descripcion: "x".repeat(201) }, CTX)).toMatch(/hasta 200 letras/);
  });
  it("la cantidad es un entero de 1 a 99 999", () => {
    expect(problemaDeLinea(renglon({ cantidad: "" }), CTX)).toBe("Escribe la cantidad.");
    expect(problemaDeLinea(renglon({ cantidad: "0" }), CTX)).toMatch(/de 1 a 99 999/);
    expect(problemaDeLinea(renglon({ cantidad: "2.5" }), CTX)).toMatch(/de 1 a 99 999/);
    expect(problemaDeLinea(renglon({ cantidad: "100000" }), CTX)).toMatch(/de 1 a 99 999/);
    expect(problemaDeLinea(renglon({ cantidad: "-3" }), CTX)).toMatch(/de 1 a 99 999/);
    // «1.000» no se adivina (¿mil o uno?); «1.500» ya es un decimal que la cantidad no admite.
    expect(problemaDeLinea(renglon({ cantidad: "1.000" }), CTX)).toMatch(/1000/);
    expect(problemaDeLinea(renglon({ cantidad: "1.500" }), CTX)).toMatch(/sin decimales/);
  });
  it("el costo es de 0 a 99 999.99 con dos decimales; vacío no vale, cero sí", () => {
    expect(problemaDeLinea(renglon({ costo: "" }), CTX)).toMatch(/Escribe el costo/);
    expect(problemaDeLinea(renglon({ costo: "12.345" }), CTX)).toMatch(/dos decimales/);
    expect(problemaDeLinea(renglon({ costo: "-1" }), CTX)).toMatch(/dos decimales/);
    expect(problemaDeLinea(renglon({ costo: "100000" }), CTX)).toMatch(/dos decimales/);
    expect(problemaDeLinea(renglon({ costo: "1.500" }), CTX)).toMatch(/S\/ 1500/);
  });
  it("el precio de venta es opcional, pero si se escribe tiene que ser un monto", () => {
    expect(problemaDeLinea(renglon({ precioVenta: "" }), CTX)).toBeNull();
    expect(problemaDeLinea(renglon({ precioVenta: "abc" }), CTX)).toMatch(/precio de venta/);
    expect(problemaDeLinea(renglon({ precioVenta: "-5" }), CTX)).toMatch(/precio de venta/);
  });
});

describe("fechas y pago", () => {
  it("la emisión es una fecha real y no es después de hoy", () => {
    expect(problemaDeEmision("2026-10-12", "2026-10-12")).toBeNull();
    expect(problemaDeEmision("2026-09-01", "2026-10-12")).toBeNull();
    expect(problemaDeEmision("2026-10-13", "2026-10-12")).toMatch(/después de hoy/);
    expect(problemaDeEmision("", "2026-10-12")).toMatch(/fecha de emisión/);
    expect(problemaDeEmision("12/10/2026", "2026-10-12")).toMatch(/fecha de emisión/);
  });
  it("al crédito el vencimiento es obligatorio y no es antes de la emisión", () => {
    expect(problemaDeVencimiento("2026-11-11", "2026-10-12")).toBeNull();
    expect(problemaDeVencimiento("2026-10-12", "2026-10-12")).toBeNull();
    expect(problemaDeVencimiento("2026-10-11", "2026-10-12")).toMatch(/antes de la emisión/);
    expect(problemaDeVencimiento("", "2026-10-12")).toMatch(/cuándo vence/);
  });
  it("el vencimiento se sugiere con el plazo del proveedor, o a 30 días si su ficha no lo dice", () => {
    expect(vencimientoSugerido("2026-10-12", 15)).toBe("2026-10-27");
    expect(vencimientoSugerido("2026-10-12", null)).toBe("2026-11-11");
    expect(vencimientoSugerido("2026-10-12", 0)).toBe("2026-10-12");
    expect(vencimientoSugerido("", 15)).toBe("");
  });
  it("al contado el pago suma exactamente el total", () => {
    const efectivo = { metodo: "efectivo", referencia: "" };
    expect(sumaDePago([{ ...efectivo, monto: "100.50" }, { ...efectivo, monto: "50" }])).toEqual({ centimos: 15050, problema: null });
    expect(problemaDePago([{ ...efectivo, monto: "150.50" }], 15050)).toBeNull();
    expect(problemaDePago([{ ...efectivo, monto: "150.49" }], 15050)).toMatch(/Al contado el pago es el total \(S\/ 150\.50\); vas en S\/ 150\.49/);
    expect(problemaDePago([], 15050)).toBe("Agrega el medio de pago.");
    expect(problemaDePago([{ ...efectivo, monto: "" }], 15050)).toMatch(/mayor a cero/);
    expect(problemaDePago([{ ...efectivo, monto: "0" }], 15050)).toMatch(/mayor a cero/);
    expect(problemaDePago([{ ...efectivo, monto: "10.555" }], 15050)).toMatch(/dos decimales/);
    // El medio no viene puesto (Felipe 2026-10-13, /formidable): sin elegirlo, el pago no está listo aunque el monto cuadre.
    expect(problemaDePago([{ monto: "150.50", metodo: "", referencia: "" }], 15050)).toMatch(/Elige con qué se pagó/);
  });
});

describe("la guía de foco sale de las reglas de la función", () => {
  it("la pantalla arranca el tipo y la condición VACÍOS: son lo que falta y bloquean hasta elegirlos (Felipe 2026-10-13)", () => {
    const vacio = camposDelComprobante(borrador({ tipo: "", condicion: "" }), CTX, { tipo: false, condicion: false }, SIN_TERMINAL);
    expect(vacio.find((c) => c.id === "tipo")).toMatchObject({ requerido: true, hecho: false, pendiente: expect.stringMatching(/^Elige qué papel/) });
    expect(vacio.find((c) => c.id === "condicion")).toMatchObject({ requerido: true, hecho: false, pendiente: expect.stringMatching(/^Elige si lo pagas/) });
    // Sin condición no entran ni el vencimiento ni el pago; sin tipo, el total no suma IGV (es el de la orden).
    expect(vacio.map((c) => c.id)).not.toContain("vencimiento");
    expect(vacio.map((c) => c.id)).not.toContain("pago");
    expect(primerProblema(borrador({ tipo: "", condicion: "" }), CTX)).toMatch(/^Elige qué papel/);
    expect(totalesComprobante(borrador().lineas, { tipo: "", sumaIgv: true }).igvCentimos).toBe(0);
  });
  it("tipo y condición traen un valor que importa: son «sugeridos» hasta que la persona los elige, y nunca bloquean", () => {
    const sinElegir = camposDelComprobante(borrador(), CTX, { tipo: false, condicion: false }, SIN_TERMINAL);
    const tipo = sinElegir.find((c) => c.id === "tipo")!;
    const condicion = sinElegir.find((c) => c.id === "condicion")!;
    expect(tipo).toMatchObject({ requerido: false, sugerido: true, hecho: false });
    expect(condicion).toMatchObject({ requerido: false, sugerido: true, hecho: false });
    expect(sinElegir.some((c) => c.requerido && !c.hecho)).toBe(false);
    const elegidos = camposDelComprobante(borrador(), CTX, ELEGIDO, SIN_TERMINAL);
    expect(elegidos.find((c) => c.id === "tipo")).toMatchObject({ hecho: true });
    expect(elegidos.find((c) => c.id === "condicion")).toMatchObject({ hecho: true });
  });
  it("los campos van en el orden de la pantalla; al crédito entra el vencimiento y al contado el pago", () => {
    const credito = camposDelComprobante(borrador(), CTX, ELEGIDO, SIN_TERMINAL).map((c) => c.id);
    expect(credito).toEqual(["tipo", "serie", "numero", "emision", "condicion", "vencimiento", "linea-l1", "nota"]);
    const contado = camposDelComprobante(borrador({ condicion: "contado", pagos: [{ monto: "255", metodo: "efectivo", referencia: "" }] }), CTX, ELEGIDO, SIN_TERMINAL);
    expect(contado.map((c) => c.id)).toEqual(["tipo", "serie", "numero", "emision", "condicion", "linea-l1", "pago", "nota"]);
    expect(contado.find((c) => c.id === "pago")).toMatchObject({ requerido: true, hecho: false });
  });
  it("cada cosa que la base rechazaría bloquea: serie, número, emisión, vencimiento, renglones y pago", () => {
    const faltan = (b: Partial<BorradorComprobante>) =>
      camposDelComprobante(borrador(b), CTX, ELEGIDO, SIN_TERMINAL).filter((c) => c.requerido && !c.hecho).map((c) => c.id);
    expect(faltan({})).toEqual([]);
    expect(faltan({ serie: "  " })).toEqual(["serie"]);
    expect(faltan({ numero: "" })).toEqual(["numero"]);
    expect(faltan({ emision: "2026-10-13" })).toEqual(["emision"]);
    expect(faltan({ vencimiento: "2026-10-01" })).toEqual(["vencimiento"]);
    expect(faltan({ lineas: [] })).toEqual(["lineas"]);
    expect(faltan({ lineas: [renglon({ cantidad: "" })] })).toEqual(["linea-l1"]);
    expect(faltan({ condicion: "contado", pagos: [] })).toEqual(["pago"]);
    expect(faltan({ nota: "x".repeat(501) })).toEqual(["nota"]);
  });
  it("el total del papel solo entra a la guía si se escribió y no sirve", () => {
    const ids = (b: Partial<BorradorComprobante>) => camposDelComprobante(borrador(b), CTX, ELEGIDO, SIN_TERMINAL).map((c) => c.id);
    expect(ids({ totalDelPapel: "" })).not.toContain("total-papel");
    expect(ids({ totalDelPapel: "300.00" })).toContain("total-papel");
  });
  it("desde una terminal, quién lo registra también es requerido", () => {
    const campos = camposDelComprobante(borrador(), CTX, ELEGIDO, { pide: true, listo: false, motivo: "Elige quién registra." });
    expect(campos.at(-1)).toMatchObject({ id: "responsable", requerido: true, hecho: false, pendiente: "Elige quién registra." });
  });
  it("primerProblema dice de una vez lo primero que falta (la red de seguridad del botón)", () => {
    expect(primerProblema(borrador(), CTX)).toBeNull();
    expect(primerProblema(borrador({ serie: "" }), CTX)).toBe("Escribe la serie que dice el papel.");
    expect(primerProblema(borrador({ lineas: [] }), CTX)).toBe("Pon al menos una prenda del papel.");
    expect(primerProblema(borrador({ tipo: "" }), CTX)).toMatch(/Elige qué papel/);
    expect(primerProblema(borrador({ condicion: "" }), CTX)).toMatch(/Elige si lo pagas/);
  });
});

describe("«de más» antes de guardar: lo mismo que la base avisará después", () => {
  const orden = { lineas: [pedida({ cantidad: 10, facturado: 8, pendiente: 2 }), pedida({ id: ITEM_2, posicion: 2, categoria: "Casacas", descripcion: "Con capucha", cantidad: 4, facturado: 0, pendiente: 4 })] };
  it("avisa cuando lo facturado antes más esta vez pasa lo pedido, sumando los renglones de la misma línea", () => {
    const lineas = [renglon({ cantidad: "2" }), renglon({ clave: "l2", cantidad: "3" }), renglon({ clave: "l3", ordenItemId: ITEM_2, cantidad: "4" })];
    expect(deMasPorLinea(lineas, orden)).toEqual([
      { ordenItemId: ITEM_1, posicion: 1, descripcion: "Polos · Kero", pedido: 10, facturadoAntes: 8, estaVez: 5, deMas: 3 },
    ]);
  });
  it("lo justo no avisa, ni lo que no es de la orden", () => {
    expect(deMasPorLinea([renglon({ cantidad: "2" }), renglon({ clave: "l3", ordenItemId: ITEM_2, cantidad: "4" })], orden)).toEqual([]);
    expect(deMasPorLinea([renglon({ ordenItemId: null, cantidad: "50" })], orden)).toEqual([]);
  });
  it("nombra la línea con su categoría, marca y descripción", () => {
    expect(nombreDeLinea({ categoria: "Casacas", marca: "Kero", descripcion: "Con capucha" })).toBe("Casacas · Kero · Con capucha");
    expect(nombreDeLinea({ categoria: "Polos", marca: "Kero", descripcion: null })).toBe("Polos · Kero");
  });
});

describe("lo que viaja a la base", () => {
  it("p_lineas: los renglones de la orden nombran su línea; lo que no estaba lleva su categoría y marca; los números con dos decimales", () => {
    const lineas = lineasParaBase([
      renglon({ cantidad: "2", costo: "9.67", precioVenta: "59.9" }),
      renglon({ clave: "l2", cantidad: "1", costo: "9.66" }),
      renglon({ clave: "l3", ordenItemId: null, descripcion: "  Gorro de lana \u0000 ", cantidad: "5", costo: "12" }),
    ]);
    expect(lineas).toEqual([
      { orden_compra_item_id: ITEM_1, categoria_id: null, marca_id: null, descripcion: null, cantidad: 2, costo_unitario: 9.67, precio_venta_sugerido: 59.9 },
      { orden_compra_item_id: ITEM_1, categoria_id: null, marca_id: null, descripcion: null, cantidad: 1, costo_unitario: 9.66, precio_venta_sugerido: null },
      { orden_compra_item_id: null, categoria_id: CAT, marca_id: MARCA, descripcion: "Gorro de lana", cantidad: 5, costo_unitario: 12, precio_venta_sugerido: null },
    ]);
  });
  it("p_pago: un medio por línea, con el monto en soles exactos, la referencia que se escribió y la cuenta de «Sale de»", () => {
    const pagos = [
      { monto: "1000.5", metodo: "transferencia", referencia: " OP-123 ", cuentaId: "cta-elegida" },
      { monto: "486.30", metodo: "efectivo", referencia: "" },
      { monto: "100", metodo: "saldo_a_favor", referencia: "", cuentaId: "no-aplica" },
    ];
    expect(pagoParaBase(pagos, (p) => (p.metodo === "efectivo" ? "cta-caja" : p.cuentaId))).toEqual([
      { monto: 1000.5, metodo: "transferencia", referencia: "OP-123", cuenta_id: "cta-elegida" },
      { monto: 486.3, metodo: "efectivo", cuenta_id: "cta-caja" },
      { monto: 100, metodo: "saldo_a_favor" },
    ]);
    // Sin quien resuelva la cuenta, va la que la persona eligió (o ninguna).
    expect(pagoParaBase([{ monto: "10", metodo: "yape", referencia: "" }])).toEqual([{ monto: 10, metodo: "yape" }]);
  });
  it("p_pago: sin medios, o con un monto vacío, en cero o con más de dos decimales, no se arma (la guía ya lo dijo)", () => {
    expect(pagoParaBase([])).toBeNull();
    expect(pagoParaBase([{ monto: "", metodo: "efectivo", referencia: "" }])).toBeNull();
    expect(pagoParaBase([{ monto: "0", metodo: "efectivo", referencia: "" }])).toBeNull();
    expect(pagoParaBase([{ monto: "10.555", metodo: "efectivo", referencia: "" }])).toBeNull();
    expect(pagoParaBase([{ monto: "10", metodo: "efectivo", referencia: "" }, { monto: "x", metodo: "yape", referencia: "" }])).toBeNull();
    expect(pagoParaBase([{ monto: "10", metodo: "", referencia: "" }])).toBeNull();
  });
  it("a crédito: con vencimiento y sin pago; el IGV se suma solo en una factura que lo pide", () => {
    const args = argsRegistrarComprobante(borrador({ serie: " f001 ", numero: " 123 ", nota: " Llegó en bolsa " }), { ordenId: ORDEN, token: TOKEN, pago: [{ monto: 1, metodo: "efectivo" }] });
    expect(args).toEqual({
      p_orden_id: ORDEN,
      p_tipo: "factura",
      p_serie: "F001",
      p_numero: "123",
      p_lineas: [{ orden_compra_item_id: ITEM_1, categoria_id: null, marca_id: null, descripcion: null, cantidad: 10, costo_unitario: 25.5, precio_venta_sugerido: null }],
      p_fecha_emision: "2026-10-12",
      p_condicion: "credito",
      p_fecha_vencimiento: "2026-11-11",
      p_suma_igv: true,
      p_nota: "Llegó en bolsa",
      p_token: TOKEN,
    });
    expect("p_pago" in args).toBe(false);
    expect("p_total" in args).toBe(false);
  });
  it("al contado: lleva su pago y no el vencimiento", () => {
    const pago = [{ monto: 300.9, metodo: "transferencia", referencia: "OP-1", cuenta_id: "cta" }];
    const args = argsRegistrarComprobante(borrador({ condicion: "contado", tipo: "boleta" }), { ordenId: ORDEN, token: TOKEN, pago });
    expect(args.p_pago).toEqual(pago);
    expect("p_fecha_vencimiento" in args).toBe(false);
    expect(args.p_suma_igv).toBe(false);
    expect("p_nota" in args).toBe(false);
  });
  it("una boleta o una nota de venta nunca suman IGV, aunque el interruptor haya quedado prendido; una factura sin «Sumar IGV» tampoco", () => {
    const p = { ordenId: ORDEN, token: TOKEN, pago: null };
    expect(argsRegistrarComprobante(borrador({ tipo: "boleta", sumaIgv: true }), p).p_suma_igv).toBe(false);
    expect(argsRegistrarComprobante(borrador({ tipo: "nota_venta", sumaIgv: true }), p).p_suma_igv).toBe(false);
    expect(argsRegistrarComprobante(borrador({ tipo: "factura", sumaIgv: false }), p).p_suma_igv).toBe(false);
  });
  it("el total del papel solo viaja cuando cuadra un redondeo (distinto del calculado y dentro de la tolerancia)", () => {
    const uno = [renglon({ cantidad: "1", costo: "25.42" })];
    const p = { ordenId: ORDEN, token: TOKEN, pago: null };
    expect(argsRegistrarComprobante(borrador({ lineas: uno, totalDelPapel: "30.01" }), p).p_total).toBe(30.01);
    expect("p_total" in argsRegistrarComprobante(borrador({ lineas: uno, totalDelPapel: "30.00" }), p)).toBe(false);
    expect("p_total" in argsRegistrarComprobante(borrador({ lineas: uno, totalDelPapel: "" }), p)).toBe(false);
  });
});

describe("lo que vuelve de la base", () => {
  const RESPUESTA = {
    compra_id: "0b6f1c2e-0000-4000-8000-0000000000aa",
    documento: "F001-123",
    total: "1486.80",
    saldo: 1486.8,
    avisos: [
      { tipo: "de_mas", orden_compra_item_id: ITEM_1, posicion: 1, descripcion: "Polos · Kero", pedido: 10, facturado_antes: 8, esta_vez: 5 },
      { tipo: "fuera_de_orden", descripcion: "Gorros · Kero", esta_vez: 1 },
      { tipo: "raro" },
      { tipo: "de_mas", descripcion: "sin cifras" },
    ],
  };
  it("lee el documento, el total, el saldo y los avisos que se entienden", () => {
    const r = leerResultadoComprobante(RESPUESTA);
    expect(r).toMatchObject({ compraId: "0b6f1c2e-0000-4000-8000-0000000000aa", documento: "F001-123", total: 1486.8, saldo: 1486.8 });
    expect(r?.avisos).toEqual([
      { tipo: "de_mas", ordenItemId: ITEM_1, posicion: 1, descripcion: "Polos · Kero", pedido: 10, facturadoAntes: 8, estaVez: 5 },
      { tipo: "fuera_de_orden", descripcion: "Gorros · Kero", estaVez: 1 },
    ]);
  });
  it("acepta la respuesta como una lista de una fila; sin comprobante no hay resultado", () => {
    expect(leerResultadoComprobante([RESPUESTA])?.documento).toBe("F001-123");
    expect(leerResultadoComprobante(null)).toBeNull();
    expect(leerResultadoComprobante({ documento: "F001-1" })).toBeNull();
    expect(leerResultadoComprobante([])).toBeNull();
    expect(leerResultadoComprobante({ compra_id: "x", documento: "B001-9" })).toMatchObject({ total: 0, saldo: 0, avisos: [] });
  });
  it("los avisos de «de más» se dicen en una frase, sin bloquear nada", () => {
    const r = leerResultadoComprobante(RESPUESTA)!;
    const resumen = resumenDeAvisos(r.avisos)!;
    expect(resumen.titulo).toBe("El papel no calza del todo con la orden");
    expect(resumen.detalle).toContain("Polos · Kero: pediste 10 y el papel ya suma 13 (3 de más)");
    expect(resumen.detalle).toContain("Gorros · Kero: 1 unidad que no estaban en la orden");
    expect(resumen.detalle).toContain("Quedó registrado igual.");
    expect(resumenDeAvisos([])).toBeNull();
    expect(resumenDeAvisos([r.avisos[0]!])?.titulo).toBe("El papel trae más de lo que pediste");
    expect(resumenDeAvisos([r.avisos[1]!])?.titulo).toBe("El papel trae prendas que no estaban en la orden");
  });
  it("con muchos avisos muestra tres y cuenta el resto", () => {
    const muchos = Array.from({ length: 5 }, (_, i) => ({ tipo: "fuera_de_orden" as const, descripcion: `Prenda ${i + 1}`, estaVez: 2 }));
    expect(resumenDeAvisos(muchos)?.detalle).toMatch(/Prenda 3: 2 unidades que no estaban en la orden · y 2 más\./);
  });
  it("dice qué quedó: por pagar o pagado al contado", () => {
    expect(detalleDeRegistro("OC-000129", { total: 1486.8, saldo: 1486.8 })).toBe("OC-000129 · Queda en Por pagar S/ 1,486.80");
    expect(detalleDeRegistro("OC-000129", { total: 1486.8, saldo: 0 })).toBe("OC-000129 · Pagado al contado S/ 1,486.80");
  });
});

describe("cortes de señal y otros envíos", () => {
  it("el aviso de corte manda reintentar sin cambiar nada", () => {
    expect(AVISO_DE_CORTE_COMPROBANTE).toMatch(/sin cambiar nada/);
    expect(AVISO_DE_CORTE_COMPROBANTE).toMatch(/no se repite/);
  });
  it("reconoce cuando la base dice que ese envío ya se guardó con otros datos", () => {
    expect(esEnvioConOtrosDatos("Ese envío ya se guardó con otros datos: recarga la pantalla")).toBe(true);
    expect(esEnvioConOtrosDatos("Ese comprobante ya está registrado")).toBe(false);
    expect(esEnvioConOtrosDatos(null)).toBe(false);
  });
});

describe("anular un comprobante de la orden", () => {
  it("el motivo no puede ir vacío ni pasar de 300 letras", () => {
    expect(problemaDeMotivoComprobante("")).toMatch(/por qué se anula el comprobante/);
    expect(problemaDeMotivoComprobante("   ")).toMatch(/por qué se anula/);
    expect(problemaDeMotivoComprobante("Se registró dos veces")).toBeNull();
    expect(problemaDeMotivoComprobante("x".repeat(301))).toMatch(/hasta 300 letras/);
  });
  it("solo se ofrece anular uno vigente y sin pagos (con pagos la base no lo deja); sin saber el pago, la base decide", () => {
    expect(sePuedeAnularComprobante({ estado: "vigente", estadoPago: "pendiente" })).toBe(true);
    expect(sePuedeAnularComprobante({ estado: "vigente", estadoPago: null })).toBe(true);
    expect(sePuedeAnularComprobante({ estado: "vigente", estadoPago: "pagada" })).toBe(false);
    expect(sePuedeAnularComprobante({ estado: "vigente", estadoPago: "parcial" })).toBe(false);
    expect(sePuedeAnularComprobante({ estado: "anulada", estadoPago: "anulada" })).toBe(false);
  });
});
