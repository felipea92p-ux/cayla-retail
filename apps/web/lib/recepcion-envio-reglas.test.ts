import { describe, expect, it } from "vitest";
import {
  argsPrepararPrenda,
  argsRecibirDespacho,
  atipicosPorLinea,
  borradorDePrenda,
  borradorInicial,
  buenasDeRecibidos,
  buenasPorVariante,
  camposDePrenda,
  camposDeRecepcion,
  combinacionesDeLaHoja,
  confirmadasDe,
  conPrenda,
  contadoDeLinea,
  despuesDeRecibirEnvio,
  detalleDeEnvioPorAbrir,
  detalleDeOrdenDirecta,
  detalleRecibido,
  diferenciaDe,
  esQuienCompro,
  extrasParaBase,
  extraVacio,
  idGuia,
  leerCosto,
  leerCostoAtipicoRecepcion,
  leerDetalleEnvio,
  leerEnviosPorAbrir,
  leerOrdenesDirectas,
  leerPrecioVenta,
  leerPrendaPreparada,
  leerPrendasParaRecibir,
  leerResultadoApertura,
  leerResultadoRecepcion,
  lineasParaBase,
  mensajeDeLaRecepcion,
  matrizDe,
  costoDeReposicion,
  opcionesSobrante,
  proveedorDelExtra,
  reposicionesDe,
  textoCausa,
  preguntaFaltante,
  preguntaSobrante,
  primerProblema,
  proveedoresDelEnvio,
  sugiereRecargarRecepcion,
  sumasDe,
  textoBotonRecibir,
  textoDeLoQueSeCrea,
  textoRecibido,
  TEXTO_QUIEN_COMPRO,
  totalesDeRecepcion,
  type BorradorExtra,
  type BorradorLinea,
  type BorradorRecepcion,
  type ContextoPrenda,
  type ContextoRecepcion,
  type DetalleEnvio,
  type LineaParaBase,
  type ExtraParaBase,
  type PrendaRecepcion,
} from "./recepcion-envio-reglas";

// ---------------------------------------------------------------------------------------------------------------------------------
// Datos de prueba (inventados)
// ---------------------------------------------------------------------------------------------------------------------------------

const PROV_A = { id: "prov-a", nombre: "Textiles Andina" };
const PROV_B = { id: "prov-b", nombre: "Confecciones del Sur" };

/** El detalle como lo manda la base de la fase 4. */
const DETALLE_FASE4 = {
  id: "env-1",
  numero: "ENV-000061",
  estado: "abierto",
  sede: { id: "tru", nombre: "Tienda Trujillo" },
  numero_guia: "001-123",
  nota: null,
  version: 3,
  unidades: 30,
  lineas: [
    {
      id: "di-1",
      orden: { id: "oc-129", numero: "OC-000129" },
      orden_compra_item_id: "oci-1",
      posicion: 1,
      proveedor: PROV_A,
      categoria: { id: "cat-chompas", nombre: "Chompas", prefijo: "CH", familia: "indumentaria" },
      marca: { id: "m-cayla", nombre: "CAYLA" },
      descripcion: "Chompa cuello alto",
      cantidad: 20,
      precio_unitario: 25,
      compra_item_id: null,
      precio_venta_sugerido: 59.9,
    },
    {
      id: "di-2",
      orden: { id: "oc-129", numero: "OC-000129" },
      posicion: 2,
      proveedor: PROV_A,
      categoria: { id: "cat-polos", nombre: "Polos", prefijo: "PO", familia: "indumentaria" },
      marca: { id: "m-cayla", nombre: "CAYLA" },
      descripcion: null,
      cantidad: 10,
      precio_unitario: "12.50",
      compra_item_id: "ci-9",
    },
  ],
};

const detalle = leerDetalleEnvio(DETALLE_FASE4)!;

const prenda = (id: string, variantes: [string, string | null, string | null, string | null, string | null][], nueva = false): PrendaRecepcion => ({
  productoId: id,
  nombre: `Prenda ${id}`,
  codigo: null,
  fotoUrl: null,
  nueva,
  estadoAlta: null,
  variantes: variantes.map(([vid, tallaId, talla, colorCodigo, color]) => ({ id: vid, tallaId, talla, colorCodigo, color, codigo: null, costo: null, precio: null })),
});

const CHOMPA = prenda("p-chompa", [
  ["v-m-ne", "t-m", "M", "NE", "Negro"],
  ["v-s-ne", "t-s", "S", "NE", "Negro"],
  ["v-l-ne", "t-l", "L", "NE", "Negro"],
  ["v-m-bl", "t-m", "M", "BL", "Blanco"],
]);
const POLO = prenda("p-polo", [["v-polo", null, null, null, null]]);

const CTX: ContextoRecepcion = { lineas: detalle.lineas, proveedores: proveedoresDelEnvio(detalle), categoriasActivas: null, marcasActivas: null };

function conLinea(b: BorradorRecepcion, id: string, cambios: Partial<BorradorLinea>): BorradorRecepcion {
  return { ...b, lineas: { ...b.lineas, [id]: { ...b.lineas[id]!, ...cambios } } };
}

/** El envío entero contado tal como llegó: 20 chompas y 10 polos. */
function completo(): BorradorRecepcion {
  let b = borradorInicial(detalle);
  b = conLinea(b, "di-1", { ...conPrenda(b.lineas["di-1"]!, CHOMPA), cantidades: { "v-m-ne": "10", "v-s-ne": "5", "v-l-ne": "5" } });
  b = conLinea(b, "di-2", { ...conPrenda(b.lineas["di-2"]!, POLO), cantidades: { "v-polo": "10" } });
  return b;
}

const LISTO = { listo: true, motivo: null };

// ---------------------------------------------------------------------------------------------------------------------------------
// Lectores
// ---------------------------------------------------------------------------------------------------------------------------------

describe("leer lo que está por recibir en la sede", () => {
  it("lee la forma de la fase 3 (sin estado ni «creado por mí»): todo está en camino", () => {
    const filas = leerEnviosPorAbrir([
      { id: "e1", numero: "ENV-000061", numero_guia: null, unidades: 32, lineas: 2, ordenes: ["OC-000129"], proveedores: ["Textiles Andina"] },
    ]);
    expect(filas).toEqual([
      { id: "e1", numero: "ENV-000061", numeroGuia: null, estado: "en_camino", unidades: 32, lineas: 2, ordenes: ["OC-000129"], proveedores: ["Textiles Andina"], creadoPorMi: false },
    ]);
  });

  it("lee la forma de la fase 4 y descarta lo que no se puede recibir (cerrado, anulado, sin id o sin número)", () => {
    const filas = leerEnviosPorAbrir([
      { id: "e1", numero: 61, estado: "abierto", unidades: "12", creado_por_mi: true, proveedores: [{ id: "x", nombre: "Andina" }] },
      { id: "e2", numero: "ENV-000062", estado: "cerrado" },
      { id: "e3", numero: "ENV-000063", estado: "anulado" },
      { numero: "ENV-000064" },
      { id: "e5" },
      null,
      "raro",
    ]);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ id: "e1", numero: "ENV-000061", estado: "abierto", unidades: 12, creadoPorMi: true, proveedores: ["Andina"] });
  });

  it("no se cae con una respuesta que no es una lista", () => {
    expect(leerEnviosPorAbrir(null)).toEqual([]);
    expect(leerEnviosPorAbrir({ error: "x" })).toEqual([]);
    expect(leerOrdenesDirectas(undefined)).toEqual([]);
  });

  it("las órdenes «directo» sin guía: número como texto o como cifra; sin nada por enviar no se ofrece", () => {
    const filas = leerOrdenesDirectas([
      { orden_id: "o1", numero: "OC-000465", proveedor: "Textiles Andina", unidades_por_enviar: 12, creada_por_mi: false },
      { orden_id: "o2", numero: 466, proveedor: { id: "p", nombre: "Sur" }, unidades_por_enviar: 3, creada_por_mi: true },
      { orden_id: "o3", numero: 467, unidades_por_enviar: 0 },
      { numero: 468, unidades_por_enviar: 4 },
    ]);
    expect(filas).toEqual([
      { ordenId: "o1", numero: "OC-000465", proveedor: "Textiles Andina", unidadesPorEnviar: 12, creadaPorMi: false },
      { ordenId: "o2", numero: "OC-000466", proveedor: "Sur", unidadesPorEnviar: 3, creadaPorMi: true },
    ]);
  });

  it("dice cada fila como se lee en la tienda", () => {
    expect(detalleDeEnvioPorAbrir({ id: "e", numero: "ENV-000061", numeroGuia: "001-9", estado: "en_camino", unidades: 32, lineas: 2, ordenes: [], proveedores: ["Textiles Andina"], creadoPorMi: false })).toBe(
      "Textiles Andina · 32 prendas · guía 001-9",
    );
    expect(detalleDeOrdenDirecta({ ordenId: "o", numero: "OC-000465", proveedor: null, unidadesPorEnviar: 1, creadaPorMi: false })).toBe("llega sin guía · 1 prenda");
  });
});

describe("leer un envío por dentro (fn_envio_detalle)", () => {
  it("lee la forma de la fase 4", () => {
    expect(detalle).toMatchObject({ id: "env-1", numero: "ENV-000061", estado: "abierto", version: 3, enviado: 30, sede: { id: "tru", nombre: "Tienda Trujillo" } });
    expect(detalle.lineas[0]).toEqual({
      id: "di-1",
      orden: { id: "oc-129", numero: "OC-000129" },
      posicion: 1,
      proveedor: PROV_A,
      categoria: { id: "cat-chompas", nombre: "Chompas", prefijo: "CH", familia: "indumentaria" },
      marca: { id: "m-cayla", nombre: "CAYLA" },
      descripcion: "Chompa cuello alto",
      enviado: 20,
      costoUnitario: 25,
      compraItemId: null,
      precioVentaSugerido: 59.9,
    });
    // El precio llega como texto desde numeric: se lee igual.
    expect(detalle.lineas[1]!.costoUnitario).toBe(12.5);
    expect(detalle.lineas[1]!.precioVentaSugerido).toBeNull();
  });

  it("lee la forma de la fase 3 (categoría, marca y orden como texto con su id al lado)", () => {
    const d = leerDetalleEnvio({
      id: "env-2",
      numero: "ENV-000062",
      estado: "en_camino",
      sede: { id: "tru", nombre: "Tienda Trujillo" },
      version: 1,
      lineas: [{ id: "di-9", orden_compra_id: "oc-1", orden: "OC-000001", posicion: 1, proveedor: PROV_A, categoria_id: "c", categoria: "Casacas", marca_id: "m", marca: "Kero", cantidad: 4, precio_unitario: 80 }],
    })!;
    expect(d.lineas[0]).toMatchObject({ orden: { id: "oc-1", numero: "OC-000001" }, categoria: { id: "c", nombre: "Casacas", prefijo: null, familia: null }, marca: { id: "m", nombre: "Kero" }, enviado: 4 });
    expect(d.enviado).toBe(4);
    expect(d.recibidos).toBeNull();
    expect(d.diferencias).toBeNull();
    expect(d.lotes).toEqual([]);
  });

  it("un envío cerrado trae cómo se cerró; una fila rara se descarta", () => {
    const d = leerDetalleEnvio({
      ...DETALLE_FASE4,
      estado: "cerrado",
      cerrado_por: "Micaela Ruiz",
      nota_recepcion: "Una caja mojada",
      lotes: ["lote-1", { id: "lote-2" }, null],
      recibidos: [
        { despacho_item_id: "di-1", variante_id: "v-m-ne", prenda: "Chompa Aurora", talla: "M", color: "Negro", cantidad: 10, danadas: 2, costo_unitario: 25 },
        { despacho_item_id: null, producto: { nombre: "Bolso" }, cantidad: 1, costo: "30" },
        { cantidad: -1 },
      ],
      diferencias: [
        { despacho_item_id: "di-1", tipo: "faltante", causa: "no_vino", cantidad: 2 },
        { tipo: "otra cosa", cantidad: 1 },
        { tipo: "sobrante", cantidad: 0 },
      ],
    })!;
    expect(d.estado).toBe("cerrado");
    expect(d.notaRecepcion).toBe("Una caja mojada");
    expect(d.lotes).toEqual(["lote-1", "lote-2"]);
    expect(d.recibidos).toHaveLength(2);
    expect(d.recibidos![0]).toMatchObject({ varianteId: "v-m-ne", prenda: "Chompa Aurora", cantidad: 10, danadas: 2, costoUnitario: 25 });
    expect(d.recibidos![1]).toMatchObject({ prenda: "Bolso", costoUnitario: 30, danadas: 0 });
    expect(d.diferencias).toEqual([{ despachoItemId: "di-1", extra: null, tipo: "faltante", causa: "no_vino", cantidad: 2, categoria: null, marca: null }]);
  });

  it("sin envío (no existe o la respuesta no se entiende) es null", () => {
    expect(leerDetalleEnvio(null)).toBeNull();
    expect(leerDetalleEnvio({ id: "x", numero: "ENV-1" })).toBeNull();
    expect(leerDetalleEnvio({ id: "x", numero: "ENV-000001", estado: "perdido" })).toBeNull();
    expect(leerDetalleEnvio([{ ...DETALLE_FASE4 }])?.id).toBe("env-1");
  });

  it("los proveedores del envío, sin repetir", () => {
    expect(proveedoresDelEnvio(detalle)).toEqual([PROV_A]);
    const dos = leerDetalleEnvio({ ...DETALLE_FASE4, lineas: [DETALLE_FASE4.lineas[0], { ...DETALLE_FASE4.lineas[1], proveedor: PROV_B }] })!;
    expect(proveedoresDelEnvio(dos)).toEqual([PROV_A, PROV_B]);
  });
});

describe("leer las prendas para «Ya la tengo» y lo que crea la hoja", () => {
  it("lee fn_prendas_para_recibir y descarta lo que no tiene id o nombre", () => {
    const prendas = leerPrendasParaRecibir([
      {
        id: "p1",
        nombre: "Chompa Aurora",
        codigo: "CH-0012",
        foto_url: "https://x/foto.jpg",
        variantes: [
          { id: "v1", talla_id: "t-m", talla: "M", color_codigo: "NE", color: "Negro", codigo: "CH-0012-NE-M", costo: "24.5", precio: 59.9 },
          { talla: "L" },
        ],
      },
      { id: "p2" },
      { nombre: "Sin id" },
    ]);
    expect(prendas).toHaveLength(1);
    expect(prendas[0]).toMatchObject({ productoId: "p1", nombre: "Chompa Aurora", codigo: "CH-0012", fotoUrl: "https://x/foto.jpg", nueva: false, estadoAlta: null });
    expect(prendas[0]!.variantes).toEqual([{ id: "v1", tallaId: "t-m", talla: "M", colorCodigo: "NE", color: "Negro", codigo: "CH-0012-NE-M", costo: 24.5, precio: 59.9 }]);
  });

  it("una prenda nueva sale «nueva»; «+ talla o color» junta las variantes de antes con las que devuelve la base", () => {
    const nueva = leerPrendaPreparada({ producto_id: "p9", nombre: "Chompa Brisa", variantes: [{ id: "v9", talla_id: "t-s", talla: "S", color_codigo: null, color: null }] })!;
    expect(nueva).toMatchObject({ productoId: "p9", nueva: true });
    const ampliada = leerPrendaPreparada({ producto_id: "p-chompa", nombre: "Prenda p-chompa", variantes: [{ id: "v-xl-ne", talla_id: "t-xl", talla: "XL", color_codigo: "NE", color: "Negro" }] }, CHOMPA)!;
    expect(ampliada.variantes.map((v) => v.id)).toEqual(["v-m-ne", "v-s-ne", "v-l-ne", "v-m-bl", "v-xl-ne"]);
    expect(ampliada.nueva).toBe(false);
    expect(leerPrendaPreparada({ nombre: "sin id" })).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Matriz y sumas
// ---------------------------------------------------------------------------------------------------------------------------------

describe("la matriz talla × color", () => {
  it("columnas en el orden de la curva y filas en el orden del vocabulario", () => {
    const m = matrizDe(CHOMPA, ["BL", "NE"]);
    expect(m.tallas.map((t) => t.texto)).toEqual(["S", "M", "L"]);
    expect(m.colores.map((c) => c.nombre)).toEqual(["Blanco", "Negro"]);
    expect(m.celda("t-m", "BL")?.id).toBe("v-m-bl");
    // La chompa no tiene S en blanco: la celda sale rayada.
    expect(m.celda("t-s", "BL")).toBeNull();
  });

  it("sin orden de colores, por nombre; una prenda sin talla ni color es una sola celda «Única · Sin color»", () => {
    expect(matrizDe(CHOMPA).colores.map((c) => c.nombre)).toEqual(["Blanco", "Negro"]);
    const m = matrizDe(POLO);
    expect(m.tallas).toEqual([{ id: null, texto: "Única" }]);
    expect(m.colores).toEqual([{ codigo: null, nombre: "Sin color" }]);
    expect(m.celda(null, null)?.id).toBe("v-polo");
  });
});

describe("las sumas de lo contado", () => {
  it("contado = buenas + dañadas; las dañadas solo cuentan con «¿Llegó algo dañado?» abierto", () => {
    const c = { cantidades: { "v-m-ne": "10", "v-s-ne": "", "v-l-ne": "5" }, danadas: { "v-m-ne": "2" }, conDanadas: true, arreglo: null };
    expect(sumasDe(c, CHOMPA)).toEqual({ contado: 15, danadas: 2, buenas: 13, invalidas: 0, danadasInvalidas: 0, danadasDeMas: [] });
    expect(sumasDe({ ...c, conDanadas: false }, CHOMPA)).toMatchObject({ contado: 15, danadas: 0, buenas: 15 });
  });

  it("marca lo que no es una cantidad y las dañadas de más; lo escrito para otra prenda no suma", () => {
    const c = { cantidades: { "v-m-ne": "1.5", "v-s-ne": "3", "otra-prenda": "50" }, danadas: { "v-s-ne": "4", "v-l-ne": "x" }, conDanadas: true, arreglo: null };
    expect(sumasDe(c, CHOMPA)).toMatchObject({ contado: 3, invalidas: 1, danadasInvalidas: 1, danadasDeMas: ["v-s-ne"], danadas: 0 });
    expect(sumasDe(c, null)).toMatchObject({ contado: 0 });
  });

  it("la diferencia contra lo que venía", () => {
    expect(diferenciaDe(20, 18)).toEqual({ tipo: "faltante", cantidad: 2 });
    expect(diferenciaDe(20, 22)).toEqual({ tipo: "sobrante", cantidad: 2 });
    expect(diferenciaDe(20, 20)).toEqual({ tipo: null, cantidad: 0 });
    expect(preguntaFaltante(2)).toBe("Faltan 2: ¿qué pasó?");
    expect(preguntaFaltante(1)).toBe("Falta 1: ¿qué pasó?");
    expect(preguntaSobrante(2)).toBe("Vinieron 2 de más: ¿qué pasa con ellas?");
    expect(preguntaSobrante(1)).toBe("Vino 1 de más: ¿qué pasa con ella?");
  });

  it("los totales del envío y el botón", () => {
    const b = completo();
    expect(totalesDeRecepcion(detalle, b)).toEqual({ contado: 30, buenas: 30, danadas: 0, enviado: 30 });
    expect(textoBotonRecibir(30)).toBe("Recibir 30 prendas");
    expect(textoBotonRecibir(1)).toBe("Recibir 1 prenda");
    expect(textoBotonRecibir(0)).toBe("Recibir");
    expect(textoBotonRecibir(0, true)).toBe("Cerrar sin prendas");
    const noLlego = conLinea(b, "di-2", { noLlego: true });
    expect(contadoDeLinea(noLlego.lineas["di-2"]!)).toBe(0);
    expect(totalesDeRecepcion(detalle, noLlego).contado).toBe(20);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Qué falta
// ---------------------------------------------------------------------------------------------------------------------------------

const requeridosPendientes = (b: BorradorRecepcion, ctx = CTX, resp = LISTO) =>
  camposDeRecepcion(b, ctx, resp)
    .filter((c) => c.requerido && !c.hecho)
    .map((c) => c.id);

describe("qué le falta a la recepción (guía de foco)", () => {
  it("al abrir: cada línea pide su prenda; el costo viene puesto; falta quién recibe si no hay", () => {
    const b = borradorInicial(detalle);
    expect(b.lineas["di-1"]!.costo).toBe("25.00");
    expect(b.lineas["di-2"]!.costo).toBe("12.50");
    expect(requeridosPendientes(b, CTX, { listo: false, motivo: null })).toEqual([idGuia.prenda("di-1"), idGuia.prenda("di-2"), "responsable"]);
  });

  it("todo contado como venía: nada pendiente, se puede recibir", () => {
    expect(requeridosPendientes(completo())).toEqual([]);
    expect(primerProblema(completo(), CTX)).toBeNull();
  });

  it("con la prenda puesta y nada contado, contar es lo que SIGUE (sugerido) y la causa del faltante es lo que bloquea", () => {
    let b = completo();
    b = conLinea(b, "di-1", { cantidades: {} });
    const campos = camposDeRecepcion(b, CTX, LISTO);
    const conteo = campos.find((c) => c.id === idGuia.conteo("di-1"))!;
    expect(conteo).toMatchObject({ requerido: false, sugerido: true, hecho: false });
    expect(requeridosPendientes(b)).toEqual([idGuia.faltante("di-1")]);
  });

  it("contó menos: pide qué pasó; contó más: pide qué pasa con lo de más; la causa que ya no aplica no se pide", () => {
    let b = conLinea(completo(), "di-1", { cantidades: { "v-m-ne": "10", "v-s-ne": "5", "v-l-ne": "3" } });
    expect(requeridosPendientes(b)).toEqual([idGuia.faltante("di-1")]);
    expect(primerProblema(b, CTX)).toBe("Faltan 2: ¿qué pasó?");
    b = conLinea(b, "di-1", { faltanteCausa: "no_vino" });
    expect(requeridosPendientes(b)).toEqual([]);
    b = conLinea(b, "di-1", { cantidades: { "v-m-ne": "12", "v-s-ne": "5", "v-l-ne": "5" } });
    expect(requeridosPendientes(b)).toEqual([idGuia.sobrante("di-1")]);
    b = conLinea(b, "di-1", { sobranteCausa: "regalo" });
    expect(requeridosPendientes(b)).toEqual([]);
  });

  it("«No llegó nada de esto»: sin prenda, todo es faltante y pide su causa (no pide costo)", () => {
    let b = conLinea(completo(), "di-2", { noLlego: true, prenda: null });
    expect(requeridosPendientes(b)).toEqual([idGuia.faltante("di-2")]);
    expect(camposDeRecepcion(b, CTX, LISTO).some((c) => c.id === idGuia.costo("di-2"))).toBe(false);
    b = conLinea(b, "di-2", { faltanteCausa: "se_perdio" });
    expect(requeridosPendientes(b)).toEqual([]);
  });

  it("dañadas: enteras, nunca más que las que llegaron, y con su arreglo", () => {
    let b = conLinea(completo(), "di-1", { conDanadas: true, danadas: { "v-m-ne": "11" } });
    expect(requeridosPendientes(b)).toEqual([idGuia.danadas("di-1")]);
    b = conLinea(b, "di-1", { danadas: { "v-m-ne": "2" } });
    expect(requeridosPendientes(b)).toEqual([idGuia.arreglo("di-1")]);
    b = conLinea(b, "di-1", { arreglo: "pendiente" });
    expect(requeridosPendientes(b)).toEqual([]);
  });

  it("un costo mal escrito bloquea; las cantidades raras también", () => {
    let b = conLinea(completo(), "di-1", { costo: "" });
    expect(requeridosPendientes(b)).toEqual([idGuia.costo("di-1")]);
    b = conLinea(completo(), "di-1", { costo: "-3" });
    expect(primerProblema(b, CTX)).toBe("El costo no puede ser negativo.");
    b = conLinea(completo(), "di-1", { cantidades: { "v-m-ne": "diez" } });
    expect(requeridosPendientes(b)).toContain(idGuia.conteo("di-1"));
  });

  it("lo que no estaba en la guía pide categoría, marca, costo, prenda, cuántas y qué pasa; el proveedor solo si hay dos o más", () => {
    let b: BorradorRecepcion = { ...completo(), extras: [extraVacio("x1")] };
    expect(requeridosPendientes(b)).toEqual(["e-x1-categoria", "e-x1-marca", "e-x1-costo", "e-x1-prenda", "e-x1-sobrante"]);
    const dosProveedores: ContextoRecepcion = { ...CTX, proveedores: [PROV_A, PROV_B] };
    expect(requeridosPendientes(b, dosProveedores)[0]).toBe("e-x1-proveedor");
    const extra: BorradorExtra = { ...extraVacio("x1"), categoriaId: "cat-polos", marcaId: "m-cayla", costo: "10", prenda: POLO, cantidades: {}, sobranteCausa: "regalo" };
    b = { ...b, extras: [extra] };
    expect(requeridosPendientes(b)).toEqual(["e-x1-conteo"]);
    b = { ...b, extras: [{ ...extra, cantidades: { "v-polo": "2" } }] };
    expect(requeridosPendientes(b)).toEqual([]);
  });

  it("una categoría o marca que ya no está activa no cuenta como elegida", () => {
    const extra: BorradorExtra = { ...extraVacio("x1"), categoriaId: "cat-vieja", marcaId: "m-cayla", costo: "10", prenda: POLO, cantidades: { "v-polo": "1" }, sobranteCausa: "regalo" };
    const ctx: ContextoRecepcion = { ...CTX, categoriasActivas: new Set(["cat-polos"]), marcasActivas: new Set(["m-cayla"]) };
    expect(requeridosPendientes({ ...completo(), extras: [extra] }, ctx)).toEqual(["e-x1-categoria"]);
  });

  it("la nota es opcional, pero no pasa de 500 letras", () => {
    expect(requeridosPendientes({ ...completo(), nota: "x".repeat(501) })).toEqual(["nota"]);
    expect(requeridosPendientes({ ...completo(), nota: "Una caja mojada" })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Lo que viaja a la base
// ---------------------------------------------------------------------------------------------------------------------------------

describe("lo que viaja a recibir_despacho", () => {
  it("una entrada por CADA línea, una sola vez; el costo sin corregir va vacío (el del envío)", () => {
    const lineas = lineasParaBase(detalle, completo());
    expect(lineas.map((l) => l.despacho_item_id)).toEqual(["di-1", "di-2"]);
    expect(lineas[0]).toEqual({
      despacho_item_id: "di-1",
      costo_unitario: null,
      confirma_costo: false,
      variantes: [
        { variante_id: "v-m-ne", cantidad: 10, danadas: 0, danada_solucion: null },
        { variante_id: "v-s-ne", cantidad: 5, danadas: 0, danada_solucion: null },
        { variante_id: "v-l-ne", cantidad: 5, danadas: 0, danada_solucion: null },
      ],
      faltante_causa: null,
      sobrante_causa: null,
    });
  });

  it("el costo corregido viaja con 2 decimales («24,90» es 24.90)", () => {
    const lineas = lineasParaBase(detalle, conLinea(completo(), "di-1", { costo: "24,90" }));
    expect(lineas[0]!.costo_unitario).toBe(24.9);
  });

  it("las causas viajan solo cuando corresponden; las variantes en cero no viajan", () => {
    let b = conLinea(completo(), "di-1", { cantidades: { "v-m-ne": "10", "v-s-ne": "8", "v-l-ne": "0" }, faltanteCausa: "no_vino", sobranteCausa: "regalo" });
    let [l1] = lineasParaBase(detalle, b);
    expect(l1!.variantes.map((v) => v.variante_id)).toEqual(["v-m-ne", "v-s-ne"]);
    expect(l1).toMatchObject({ faltante_causa: "no_vino", sobrante_causa: null });
    b = conLinea(b, "di-1", { cantidades: { "v-m-ne": "15", "v-s-ne": "8" } });
    [l1] = lineasParaBase(detalle, b);
    expect(l1).toMatchObject({ faltante_causa: null, sobrante_causa: "regalo" });
  });

  it("«No llegó nada»: sin variantes, sin costo y con su causa", () => {
    const b = conLinea(completo(), "di-2", { noLlego: true, faltanteCausa: "otra_sede" });
    expect(lineasParaBase(detalle, b)[1]).toEqual({ despacho_item_id: "di-2", costo_unitario: null, confirma_costo: false, variantes: [], faltante_causa: "otra_sede", sobrante_causa: null });
  });

  it("las dañadas viajan con su arreglo; cerrado «¿Llegó algo dañado?», no viajan", () => {
    const b = conLinea(completo(), "di-1", { conDanadas: true, danadas: { "v-m-ne": "2" }, arreglo: "sin_solucion" });
    expect(lineasParaBase(detalle, b)[0]!.variantes[0]).toEqual({ variante_id: "v-m-ne", cantidad: 10, danadas: 2, danada_solucion: "sin_solucion" });
    const cerrado = conLinea(b, "di-1", { conDanadas: false });
    expect(lineasParaBase(detalle, cerrado)[0]!.variantes[0]).toEqual({ variante_id: "v-m-ne", cantidad: 10, danadas: 0, danada_solucion: null });
  });

  it("lo que no estaba en la guía: con un proveedor, sin proveedor_id; con dos, el elegido", () => {
    const extra: BorradorExtra = { ...extraVacio("x1", "prov-b"), categoriaId: "cat-polos", marcaId: "m-cayla", costo: "10.5", prenda: POLO, cantidades: { "v-polo": "2" }, sobranteCausa: "cobra_aparte" };
    const b = { ...completo(), extras: [extra] };
    expect(extrasParaBase(b, { proveedores: [PROV_A] })).toEqual([
      { proveedor_id: null, categoria_id: "cat-polos", marca_id: "m-cayla", costo_unitario: 10.5, confirma_costo: false, variantes: [{ variante_id: "v-polo", cantidad: 2, danadas: 0, danada_solucion: null }], sobrante_causa: "cobra_aparte" },
    ]);
    expect(extrasParaBase(b, { proveedores: [PROV_A, PROV_B] })[0]!.proveedor_id).toBe("prov-b");
  });

  it("los argumentos completos: versión, token y la nota solo si se escribió", () => {
    const args = argsRecibirDespacho(detalle, completo(), CTX, { version: 4, token: "tok" });
    expect(args).toMatchObject({ p_despacho_id: "env-1", p_version: 4, p_nota: null, p_token: "tok", p_extras: [] });
    expect(args.p_lineas).toHaveLength(2);
    expect(argsRecibirDespacho(detalle, { ...completo(), nota: "  Caja mojada  " }, CTX, { version: 4, token: "tok" }).p_nota).toBe("Caja mojada");
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Espejo de la base: lo que la guía deja pasar, la base lo acepta; lo que la base rechaza, la guía lo bloquea
// ---------------------------------------------------------------------------------------------------------------------------------

/**
 * Las reglas de `recibir_despacho` tal como las escribe el contrato (docs/compras/ordenes-de-compra-2026-10/contrato-recepcion-de-envio.md):
 * una entrada por cada línea del envío; variantes de la prenda puesta, sin repetir; cantidad ≥ 0 y dañadas ≤ cantidad, con su solución;
 * costo ≥ 0 con 2 decimales; faltante obligatoria si se contó menos (y prohibida si no); sobrante igual; extras con categoría, marca, costo y
 * causa, y el proveedor si el envío trae dos o más. Si la pantalla cambia de reglas sin que cambie la base (o al revés), esto se rompe.
 */
function rechazoDeLaBase(d: DetalleEnvio, args: { p_lineas: LineaParaBase[]; p_extras: ExtraParaBase[] }, proveedores: readonly { id: string }[]): string | null {
  const ids = args.p_lineas.map((l) => l.despacho_item_id);
  if (ids.length !== d.lineas.length || new Set(ids).size !== ids.length || d.lineas.some((l) => !ids.includes(l.id))) return "lineas_incompletas";
  const varianteOk = (v: { variante_id: string; cantidad: number; danadas: number; danada_solucion: string | null }) =>
    Number.isInteger(v.cantidad) && v.cantidad >= 0 && Number.isInteger(v.danadas) && v.danadas >= 0 && v.danadas <= v.cantidad && (v.danadas > 0 ? v.danada_solucion !== null : v.danada_solucion === null);
  const costoOk = (c: number | null) => c === null || (c >= 0 && Math.round(c * 100) === c * 100);
  for (const l of args.p_lineas) {
    const linea = d.lineas.find((x) => x.id === l.despacho_item_id)!;
    const vs = l.variantes.map((v) => v.variante_id);
    if (new Set(vs).size !== vs.length) return "variante_repetida";
    if (!l.variantes.every(varianteOk)) return "variante_mal";
    if (!costoOk(l.costo_unitario)) return "costo_mal";
    const contado = l.variantes.reduce((a, v) => a + v.cantidad, 0);
    if (contado < linea.enviado ? l.faltante_causa === null : l.faltante_causa !== null) return "faltante";
    if (contado > linea.enviado ? l.sobrante_causa === null : l.sobrante_causa !== null) return "sobrante";
  }
  for (const e of args.p_extras) {
    if (!e.categoria_id || !e.marca_id) return "extra_sin_categoria_o_marca";
    if (!costoOk(e.costo_unitario)) return "extra_costo";
    if (!e.sobrante_causa) return "extra_sin_causa";
    if (!e.variantes.every(varianteOk) || e.variantes.reduce((a, v) => a + v.cantidad, 0) <= 0) return "extra_sin_prendas";
    if (proveedores.length >= 2 ? !proveedores.some((p) => p.id === e.proveedor_id) : e.proveedor_id !== null) return "extra_proveedor";
  }
  return null;
}

describe("espejo de recibir_despacho: la guía y la base dicen lo mismo", () => {
  const dosProveedores = leerDetalleEnvio({ ...DETALLE_FASE4, lineas: [DETALLE_FASE4.lineas[0], { ...DETALLE_FASE4.lineas[1], proveedor: PROV_B }] })!;
  const extraBueno: BorradorExtra = { ...extraVacio("x1"), categoriaId: "cat-polos", marcaId: "m-cayla", costo: "10", prenda: POLO, cantidades: { "v-polo": "1" }, sobranteCausa: "regalo" };

  const escenarios: { nombre: string; d: DetalleEnvio; b: BorradorRecepcion }[] = [
    { nombre: "completo", d: detalle, b: completo() },
    { nombre: "sin decidir nada", d: detalle, b: borradorInicial(detalle) },
    { nombre: "faltante sin causa", d: detalle, b: conLinea(completo(), "di-1", { cantidades: { "v-m-ne": "1" } }) },
    { nombre: "faltante con causa", d: detalle, b: conLinea(completo(), "di-1", { cantidades: { "v-m-ne": "1" }, faltanteCausa: "no_vino" }) },
    { nombre: "sobrante sin causa", d: detalle, b: conLinea(completo(), "di-2", { cantidades: { "v-polo": "11" } }) },
    { nombre: "sobrante con causa", d: detalle, b: conLinea(completo(), "di-2", { cantidades: { "v-polo": "11" }, sobranteCausa: "proxima_compra" }) },
    { nombre: "causa que ya no aplica", d: detalle, b: conLinea(completo(), "di-2", { faltanteCausa: "no_vino", sobranteCausa: "regalo" }) },
    { nombre: "no llegó, sin causa", d: detalle, b: conLinea(completo(), "di-2", { noLlego: true }) },
    { nombre: "no llegó, con causa", d: detalle, b: conLinea(completo(), "di-2", { noLlego: true, faltanteCausa: "se_perdio" }) },
    { nombre: "dañadas sin arreglo elegido", d: detalle, b: conLinea(completo(), "di-1", { conDanadas: true, danadas: { "v-m-ne": "1" } }) },
    { nombre: "dañadas con arreglo", d: detalle, b: conLinea(completo(), "di-1", { conDanadas: true, danadas: { "v-m-ne": "1" }, arreglo: "pendiente" }) },
    { nombre: "costo corregido", d: detalle, b: conLinea(completo(), "di-1", { costo: "30.10" }) },
    { nombre: "costo con tres decimales", d: detalle, b: conLinea(completo(), "di-1", { costo: "30.105" }) },
    { nombre: "extra completo", d: detalle, b: { ...completo(), extras: [extraBueno] } },
    { nombre: "extra sin causa", d: detalle, b: { ...completo(), extras: [{ ...extraBueno, sobranteCausa: null }] } },
    { nombre: "extra sin costo", d: detalle, b: { ...completo(), extras: [{ ...extraBueno, costo: "" }] } },
    { nombre: "extra sin prendas contadas", d: detalle, b: { ...completo(), extras: [{ ...extraBueno, cantidades: {} }] } },
    { nombre: "dos proveedores, extra sin proveedor", d: dosProveedores, b: { ...completo(), extras: [extraBueno] } },
    { nombre: "dos proveedores, extra con proveedor", d: dosProveedores, b: { ...completo(), extras: [{ ...extraBueno, proveedorId: "prov-b" }] } },
  ];

  it.each(escenarios.map((e) => [e.nombre, e] as const))("%s", (_, { d, b }) => {
    const ctx: ContextoRecepcion = { lineas: d.lineas, proveedores: proveedoresDelEnvio(d), categoriasActivas: null, marcasActivas: null };
    const guiaDejaPasar = primerProblema(b, ctx) === null;
    const args = argsRecibirDespacho(d, b, ctx, { version: 1, token: "t" });
    const rechazo = rechazoDeLaBase(d, args, ctx.proveedores);
    // La guía es al menos tan estricta como la base (nunca deja pasar algo que la base rechaza)…
    if (guiaDejaPasar) expect(rechazo, "la guía dejó pasar algo que la base rechaza").toBeNull();
    // …y no inventa reglas: lo que la base acepta y la guía bloquea es solo lo que el borrador no puede ni armar (sin decidir la prenda,
    // un costo sin escribir o con decimales de más, un extra sin prendas).
    if (rechazo === null && !guiaDejaPasar) {
      expect(["sin decidir nada", "costo con tres decimales", "extra sin costo", "extra sin prendas contadas"]).toContain(_);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Lo que vuelve
// ---------------------------------------------------------------------------------------------------------------------------------

describe("lo que vuelve de la base", () => {
  it("la recepción y su aviso, con el texto exacto del contrato", () => {
    const r = leerResultadoRecepcion({ despacho_id: "env-1", numero: "ENV-000061", lotes: ["l1", "l2"], unidades: 32, buenas: 30, danadas: 2, faltan: 2, sobran: 0 })!;
    expect(r).toEqual({ despachoId: "env-1", numero: "ENV-000061", lotes: ["l1", "l2"], unidades: 32, buenas: 30, danadas: 2, faltan: 2, sobran: 0 });
    expect(textoRecibido(r)).toBe("ENV-000061 recibido · 30 prendas al almacén, 2 a cuarentena · faltan 2");
    expect(detalleRecibido({ buenas: 1, danadas: 0, faltan: 1, sobran: 3 })).toBe("1 prenda al almacén · falta 1 · 3 de más");
    // No llegó nada de ninguna línea: se cierra sin prendas.
    const vacio = { despachoId: "e", numero: "ENV-000399", lotes: [], unidades: 0, buenas: 0, danadas: 0, faltan: 30, sobran: 0 };
    expect(textoRecibido(vacio)).toBe("ENV-000399 cerrado sin prendas · faltan 30");
  });

  it("sin buenas en la respuesta, salen de unidades − dañadas; sin envío, null", () => {
    expect(leerResultadoRecepcion([{ id: "env-1", numero: 61, unidades: 5, danadas: 1 }])).toMatchObject({ numero: "ENV-000061", buenas: 4, lotes: [] });
    expect(leerResultadoRecepcion({ unidades: 3 })).toBeNull();
    expect(leerResultadoRecepcion(null)).toBeNull();
  });

  it("abrir y recibir sin guía devuelven el envío", () => {
    expect(leerResultadoApertura({ despacho_id: "env-1", estado: "abierto", version: 2 })).toEqual({ despachoId: "env-1", numero: null, estado: "abierto", version: 2 });
    expect(leerResultadoApertura({ despacho_id: "env-9", numero: "ENV-000070" })).toMatchObject({ despachoId: "env-9", numero: "ENV-000070" });
    expect(leerResultadoApertura("raro")).toBeNull();
  });

  it("reconoce cuándo conviene recargar y la regla de quien compró", () => {
    expect(sugiereRecargarRecepcion("Alguien cambió este envío: recarga")).toBe(true);
    expect(sugiereRecargarRecepcion("Esa recepción ya se guardó con otros datos: recarga la pantalla")).toBe(true);
    expect(sugiereRecargarRecepcion("El costo no puede ser negativo")).toBe(false);
    expect(esQuienCompro({ hint: "recibir_quien_compro", message: "x" })).toBe(true);
    expect(esQuienCompro({ message: "Hiciste esta orden: la tiene que recibir otra persona de la tienda" })).toBe(true);
    expect(esQuienCompro(null)).toBe(false);
  });
});

describe("el aviso de costo atípico", () => {
  const nombrar = (despachoItemId: string | null, varianteId: string | null) => (varianteId === "v-m-ne" ? "Chompa Aurora · M · Negro" : despachoItemId);

  it("lee el formato de la recepción (hint + JSON en details) con el nombre de la prenda", () => {
    const costos = leerCostoAtipicoRecepcion(
      { message: "Un costo está fuera de lo normal", hint: "recepcion_costo_atipico", details: JSON.stringify([{ despacho_item_id: "di-1", variante_id: "v-m-ne", motivo: "sube", costo: 80, vigente: 25 }]) },
      nombrar,
    )!;
    expect(costos).toEqual([{ motivo: "sube", costoUnitario: 80, costoVigente: 25, precio: null, sku: "Chompa Aurora · M · Negro", varianteId: "v-m-ne", linea: null, despachoItemId: "di-1", extra: null }]);
  });

  it("acepta `detail`, `{ items }` y el formato de siempre (`costo_atipico`)", () => {
    expect(leerCostoAtipicoRecepcion({ hint: "recepcion_costo_atipico", detail: JSON.stringify({ items: [{ variante_id: "v", motivo: "baja", costo_unitario: 1, costo_vigente: 9 }] }) })?.[0]).toMatchObject({ motivo: "baja", costoUnitario: 1, costoVigente: 9 });
    expect(leerCostoAtipicoRecepcion({ message: "costo_atipico", details: JSON.stringify({ items: [{ motivo: "sin_costo", costo_unitario: 0, variante_id: "v-m-ne" }] }) }, nombrar)?.[0]).toMatchObject({ motivo: "sin_costo", sku: "Chompa Aurora · M · Negro", despachoItemId: null });
  });

  it("no es un aviso de costo: null, sin lanzar", () => {
    expect(leerCostoAtipicoRecepcion({ hint: "recepcion_costo_atipico", details: "{roto" })).toBeNull();
    expect(leerCostoAtipicoRecepcion({ message: "otra cosa" })).toBeNull();
    expect(leerCostoAtipicoRecepcion(null)).toBeNull();
    expect(leerCostoAtipicoRecepcion({ hint: "recepcion_costo_atipico", details: JSON.stringify([{ motivo: "inventado", costo: 1 }]) })).toBeNull();
  });

  it("al confirmar: las líneas marcadas y los extras que traen esa prenda viajan con confirma_costo", () => {
    const extra: BorradorExtra = { ...extraVacio("x1"), categoriaId: "cat-polos", marcaId: "m-cayla", costo: "10", prenda: POLO, cantidades: { "v-polo": "1" }, sobranteCausa: "regalo" };
    const b = { ...completo(), extras: [extra] };
    const conf = confirmadasDe(
      [
        { motivo: "sube", costoUnitario: 80, costoVigente: 25, precio: null, sku: null, varianteId: "v-m-ne", linea: null, despachoItemId: "di-1", extra: null },
        { motivo: "baja", costoUnitario: 1, costoVigente: 9, precio: null, sku: null, varianteId: "v-polo", linea: null, despachoItemId: null, extra: null },
      ],
      b,
    );
    expect([...conf.lineas].sort()).toEqual(["di-1", "di-2"]);
    expect([...conf.extras]).toEqual(["x1"]);
    const args = argsRecibirDespacho(detalle, b, CTX, { version: 1, token: "t", confirmadas: conf });
    expect(args.p_lineas.map((l) => l.confirma_costo)).toEqual([true, true]);
    expect(args.p_extras[0]!.confirma_costo).toBe(true);
  });

  it("el costo escrito se lee como en el resto del ERP", () => {
    expect(leerCosto("25.00")).toEqual({ centimos: 2500, problema: null });
    expect(leerCosto("12,5")).toEqual({ centimos: 1250, problema: null });
    expect(leerCosto("1,950.50").centimos).toBe(195050);
    expect(leerCosto("0").centimos).toBe(0);
    expect(leerCosto("").problema).toBe("Escribe el costo por unidad.");
    expect(leerCosto("1.500").problema).toMatch(/sin el punto de miles/);
    expect(leerCosto("2.555").problema).toBe("El costo va con dos decimales como máximo.");
    expect(leerCosto("abc").problema).toMatch(/punto decimal/);
  });
});

describe("después de recibir", () => {
  it("primero las etiquetas de los lotes, después bajar al piso lo bueno (lo dañado no se baja)", () => {
    const b = conLinea(completo(), "di-1", { conDanadas: true, danadas: { "v-m-ne": "2" }, arreglo: "pendiente" });
    const buenas = buenasPorVariante(detalle, b);
    expect(buenas).toEqual([
      { varianteId: "v-m-ne", cantidad: 8 },
      { varianteId: "v-s-ne", cantidad: 5 },
      { varianteId: "v-l-ne", cantidad: 5 },
      { varianteId: "v-polo", cantidad: 10 },
    ]);
    // Las etiquetas son de todo lo que entró (la pantalla de etiquetas lee el lote entero); bajar al piso, solo lo bueno.
    const acciones = despuesDeRecibirEnvio({ lotes: ["l1", "l2"], buenas, unidades: 30, unidadesBuenas: 28, veExistencias: true });
    expect(acciones).toEqual([
      { clave: "etiquetas", texto: "Imprimir 30 etiquetas de precio", href: "/etiquetas-de-precio?lotes=l1,l2", principal: true },
      { clave: "bajar", texto: "Bajar al piso", href: "/inventario/bajar?lineas=v-m-ne:8,v-s-ne:5,v-l-ne:5,v-polo:10", principal: false },
    ]);
  });

  it("sin lotes no hay etiquetas por lote; sin Existencias no se ofrece bajar; sin buenas, nada", () => {
    expect(despuesDeRecibirEnvio({ lotes: [], buenas: [{ varianteId: "v", cantidad: 1 }], unidades: 1, unidadesBuenas: 1, veExistencias: true })).toEqual([
      { clave: "bajar", texto: "Bajar al piso", href: "/inventario/bajar?lineas=v:1", principal: true },
    ]);
    expect(despuesDeRecibirEnvio({ lotes: ["l"], buenas: [], unidades: 1, unidadesBuenas: 1, veExistencias: false })).toEqual([
      { clave: "etiquetas", texto: "Imprimir la etiqueta de precio", href: "/etiquetas-de-precio?lotes=l", principal: true },
    ]);
    expect(despuesDeRecibirEnvio({ lotes: ["l"], buenas: [], unidades: 0, unidadesBuenas: 0, veExistencias: true })).toEqual([]);
    // Todo llegó dañado: hay etiquetas (el lote las trae), pero nada que bajar al piso.
    expect(despuesDeRecibirEnvio({ lotes: ["l"], buenas: [], unidades: 2, unidadesBuenas: 0, veExistencias: true }).map((a) => a.clave)).toEqual(["etiquetas"]);
    // Un envío ya cerrado, sin saber las variantes: «Bajar al piso» abre la pantalla sin nada marcado.
    expect(despuesDeRecibirEnvio({ lotes: [], buenas: [], unidades: 4, unidadesBuenas: 4, veExistencias: true })[0]!.href).toBe("/inventario/bajar");
  });

  it("lo bueno de un envío cerrado sale de «cómo se cerró» si la base manda la variante", () => {
    expect(
      buenasDeRecibidos([
        { despachoItemId: "di-1", extra: null, varianteId: "v1", prenda: null, talla: null, color: null, cantidad: 5, danadas: 1, costoUnitario: null, categoria: null, marca: null },
        { despachoItemId: null, extra: 1, varianteId: "v1", prenda: null, talla: null, color: null, cantidad: 2, danadas: 0, costoUnitario: null, categoria: null, marca: null },
        { despachoItemId: null, extra: 2, varianteId: null, prenda: null, talla: null, color: null, cantidad: 9, danadas: 0, costoUnitario: null, categoria: null, marca: null },
      ]),
    ).toEqual([{ varianteId: "v1", cantidad: 6 }]);
    expect(buenasDeRecibidos(null)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------
// La hoja de la prenda
// ---------------------------------------------------------------------------------------------------------------------------------

const TALLAS = [
  { id: "t-s", valor: "S", habitual: true },
  { id: "t-m", valor: "M", habitual: true },
  { id: "t-l", valor: "L", habitual: false },
];
const CTX_NUEVA: ContextoPrenda = { modo: "nueva", tallas: TALLAS, exigeTejidoPatron: false, tejidos: [], patrones: [] };

describe("la hoja «Es nueva»", () => {
  it("arranca SIN tallas marcadas (se marcan las que llegaron) y con el precio que sugirió quien compró (Felipe 2026-10-13)", () => {
    expect(borradorDePrenda(CTX_NUEVA, { precioSugerido: 59.9 })).toEqual({ nombre: "", tallaIds: [], colorCodigos: [], precio: "59.90", descripcion: "", tejidoId: "", patronId: "" });
    expect(camposDePrenda(borradorDePrenda(CTX_NUEVA), CTX_NUEVA).find((c) => c.id === "prenda-tallas")).toMatchObject({
      requerido: true,
      hecho: false,
      pendiente: "Marca las tallas que llegaron.",
    });
    expect(borradorDePrenda(CTX_NUEVA).precio).toBe("");
  });

  it("pide nombre, al menos una talla (si la categoría las tiene) y precio mayor que 0; los colores son opcionales", () => {
    const b = { ...borradorDePrenda(CTX_NUEVA), tallaIds: [] };
    const faltan = camposDePrenda(b, CTX_NUEVA).filter((c) => c.requerido && !c.hecho).map((c) => c.id);
    expect(faltan).toEqual(["prenda-nombre", "prenda-tallas", "prenda-precio"]);
    const listo = { ...b, nombre: "chompa aurora", tallaIds: ["t-m"], precio: "59.90" };
    expect(camposDePrenda(listo, CTX_NUEVA).filter((c) => c.requerido && !c.hecho)).toEqual([]);
    expect(camposDePrenda({ ...listo, nombre: "¡¡¡" }, CTX_NUEVA).find((c) => c.id === "prenda-nombre")?.pendiente).toBe("El nombre necesita al menos una letra o un número.");
    // Una categoría sin tallas (un accesorio) no las pide.
    expect(camposDePrenda(listo, { ...CTX_NUEVA, tallas: [] }).some((c) => c.id === "prenda-tallas")).toBe(false);
  });

  it("si la familia los pide, tejido y patrón de la categoría; sin ellos habilitados, lo dice", () => {
    const ctx: ContextoPrenda = { ...CTX_NUEVA, exigeTejidoPatron: true, tejidos: [{ id: "tj", texto: "Algodón" }], patrones: [] };
    const b = { ...borradorDePrenda(ctx), nombre: "Chompa", tallaIds: ["t-m"], precio: "50", tejidoId: "tj" };
    const pendientes = camposDePrenda(b, ctx).filter((c) => c.requerido && !c.hecho);
    expect(pendientes.map((c) => c.id)).toEqual(["prenda-patron"]);
    expect(pendientes[0]!.pendiente).toMatch(/no tiene patrones habilitados/);
  });

  it("el precio de venta: obligatorio y mayor que 0 al crear; opcional al sumar tallas o colores", () => {
    expect(leerPrecioVenta("59.90", true)).toEqual({ centimos: 5990, problema: null });
    expect(leerPrecioVenta("", true).problema).toBe("Escribe el precio de venta.");
    expect(leerPrecioVenta("0", true).problema).toBe("El precio de venta tiene que ser mayor que S/ 0.");
    expect(leerPrecioVenta("", false)).toEqual({ centimos: null, problema: null });
  });

  it("crea TODAS las combinaciones talla × color; sin colores, «Sin color»", () => {
    const b = { ...borradorDePrenda(CTX_NUEVA), tallaIds: ["t-m", "t-s"], colorCodigos: ["NE", "BL"] };
    expect(combinacionesDeLaHoja(b, CTX_NUEVA)).toEqual([
      { talla_id: "t-s", color_codigo: "NE" },
      { talla_id: "t-m", color_codigo: "NE" },
      { talla_id: "t-s", color_codigo: "BL" },
      { talla_id: "t-m", color_codigo: "BL" },
    ]);
    expect(combinacionesDeLaHoja({ ...b, colorCodigos: [] }, CTX_NUEVA)).toEqual([
      { talla_id: "t-s", color_codigo: null },
      { talla_id: "t-m", color_codigo: null },
    ]);
    const nombres: Record<string, string> = { NE: "Negro", BL: "Blanco" };
    expect(textoDeLoQueSeCrea(b, CTX_NUEVA, (c) => nombres[c] ?? c)).toBe("Se crean 4 combinaciones: S y M en Negro y Blanco.");
  });

  it("los argumentos: una línea del envío no manda categoría ni marca; algo fuera de la guía sí", () => {
    const b = { ...borradorDePrenda(CTX_NUEVA), nombre: "  chompa   aurora ", tallaIds: ["t-m"], colorCodigos: ["NE"], precio: "59.9", descripcion: " Cuello alto " };
    const base = { despachoId: "env-1", categoriaId: "cat", marcaId: "m", productoId: null, confirmoDistinto: false, token: "tok" };
    expect(argsPrepararPrenda(b, CTX_NUEVA, { ...base, despachoItemId: "di-1" })).toEqual({
      p_despacho_id: "env-1",
      p_despacho_item_id: "di-1",
      p_categoria_id: null,
      p_marca_id: null,
      p_producto_id: null,
      p_referencia: "Chompa Aurora",
      p_variantes: [{ talla_id: "t-m", color_codigo: "NE" }],
      p_precio: 59.9,
      p_descripcion: "Cuello alto",
      p_tejido_id: null,
      p_patron_id: null,
      p_confirmo_distinto: false,
      p_token: "tok",
      p_proveedor_id: null,
    });
    expect(argsPrepararPrenda(b, CTX_NUEVA, { ...base, despachoItemId: null })).toMatchObject({ p_categoria_id: "cat", p_marca_id: "m", p_proveedor_id: null });
    // Fuera de la guía, en un envío de dos proveedores: va el elegido. En una línea nunca (la base lo saca de su orden).
    expect(argsPrepararPrenda(b, CTX_NUEVA, { ...base, despachoItemId: null, proveedorId: "prov-b" }).p_proveedor_id).toBe("prov-b");
    expect(argsPrepararPrenda(b, CTX_NUEVA, { ...base, despachoItemId: "di-1", proveedorId: "prov-b" }).p_proveedor_id).toBeNull();
  });
});

describe("la hoja «+ talla o color» de una prenda que ya existe", () => {
  const existentes = new Set(CHOMPA.variantes.map((v) => `${v.tallaId ?? ""}|${v.colorCodigo ?? ""}`));
  const ctx: ContextoPrenda = { ...CTX_NUEVA, modo: "agregar", existentes };

  it("viene con lo que la prenda ya tiene y solo crea lo que le falta", () => {
    const b = borradorDePrenda(ctx, { prenda: CHOMPA });
    expect(b.tallaIds).toEqual(["t-s", "t-m", "t-l"]);
    expect(b.colorCodigos).toEqual(["NE", "BL"]);
    // La chompa tiene M en blanco, pero no S ni L en blanco: se crean esas dos.
    expect(combinacionesDeLaHoja(b, ctx)).toEqual([
      { talla_id: "t-s", color_codigo: "BL" },
      { talla_id: "t-l", color_codigo: "BL" },
    ]);
  });

  it("sin nada nuevo que crear, lo dice; no pide nombre ni precio", () => {
    const b = { ...borradorDePrenda(ctx, { prenda: CHOMPA }), colorCodigos: ["NE"] };
    const pendientes = camposDePrenda(b, ctx).filter((c) => c.requerido && !c.hecho);
    expect(pendientes.map((c) => c.id)).toEqual(["prenda-nuevas"]);
    expect(camposDePrenda(b, ctx).some((c) => c.id === "prenda-nombre" || c.id === "prenda-precio")).toBe(false);
  });

  it("manda la prenda que existe, sin nombre ni precio", () => {
    const b = borradorDePrenda(ctx, { prenda: CHOMPA });
    const args = argsPrepararPrenda(b, ctx, { despachoId: "env-1", despachoItemId: "di-1", categoriaId: "cat", marcaId: "m", productoId: "p-chompa", confirmoDistinto: false, token: "t" });
    expect(args).toMatchObject({ p_producto_id: "p-chompa", p_referencia: null, p_precio: null, p_descripcion: null });
    expect(args.p_variantes).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Lo que dice la migración real (20261013002000_recepcion_de_envio.sql) y el contrato no decía igual
// ---------------------------------------------------------------------------------------------------------------------------------

describe("la forma de la base de la fase 4", () => {
  it("fn_envios_por_recibir (jsonb): ordenes y proveedores como listas, con estado y «creado por mí»", () => {
    const filas = leerEnviosPorAbrir([
      { id: "e1", numero: "ENV-000061", estado: "abierto", numero_guia: null, version: 2, lineas: 2, unidades: 32, ordenes: ["OC-000129"], proveedores: ["Textiles Andina"], creado_por_mi: false },
    ]);
    expect(filas[0]).toMatchObject({ estado: "abierto", ordenes: ["OC-000129"], proveedores: ["Textiles Andina"], creadoPorMi: false });
  });

  it("un envío cerrado trae su resumen en `recepcion`, con los lotes; los extras dicen su lugar", () => {
    const d = leerDetalleEnvio({
      ...DETALLE_FASE4,
      estado: "cerrado",
      creado_por_mi: true,
      recepcion: { despacho_id: "env-1", numero: "ENV-000061", lotes: ["l1", "l2"], unidades: 31, buenas: 29, danadas: 2, faltan: 1, sobran: 2 },
      recibidos: [{ despacho_item_id: null, extra: 1, prenda: "Bolso", variante_id: "v9", cantidad: 2, danadas: 0, costo_unitario: 10 }],
      diferencias: [{ despacho_item_id: null, extra: 1, tipo: "sobrante", causa: "regalo", cantidad: 2 }],
    })!;
    expect(d.lotes).toEqual(["l1", "l2"]);
    expect(d.recepcion).toMatchObject({ unidades: 31, buenas: 29, faltan: 1, sobran: 2 });
    expect(d.creadoPorMi).toBe(true);
    expect(d.recibidos![0]).toMatchObject({ extra: 1, varianteId: "v9" });
    expect(d.diferencias![0]).toMatchObject({ extra: 1, tipo: "sobrante", causa: "regalo" });
  });

  it("el costo atípico dice el lugar del extra: se confirma ese extra y no otro con la misma prenda", () => {
    const extra = (clave: string): BorradorExtra => ({ ...extraVacio(clave), categoriaId: "cat-polos", marcaId: "m-cayla", costo: "10", prenda: POLO, cantidades: { "v-polo": "1" }, sobranteCausa: "regalo" });
    const b = { ...completo(), extras: [extra("x1"), extra("x2")] };
    const costos = leerCostoAtipicoRecepcion({
      hint: "recepcion_costo_atipico",
      details: JSON.stringify([{ despacho_item_id: null, extra: 2, variante_id: "v-polo", motivo: "sube", costo: 10, vigente: 3 }]),
    })!;
    expect(costos[0]).toMatchObject({ extra: 2, despachoItemId: null });
    const conf = confirmadasDe(costos, b);
    expect([...conf.extras]).toEqual(["x2"]);
    expect([...conf.lineas]).toEqual([]);
  });

  it("el costo y el precio de venta van hasta S/ 99 999.99, como la base", () => {
    expect(leerCosto("99999.99").problema).toBeNull();
    expect(leerCosto("100000").problema).toBe("El costo va hasta S/ 99,999.99.");
    expect(leerPrecioVenta("100000", true).problema).toBe("El precio va hasta S/ 99,999.99.");
  });

  it("los avisos de la fase se dicen tal cual (también los que llegan con 42501); los demás siguen su camino", () => {
    expect(mensajeDeLaRecepcion({ hint: "recibir_otra_sede", message: "Este envío va a Tienda Lima: lo recibe esa tienda" })).toBe("Este envío va a Tienda Lima: lo recibe esa tienda");
    expect(mensajeDeLaRecepcion({ hint: "recibir_quien_compro", message: "Hiciste esta orden: la tiene que recibir otra persona de la tienda" })).toBe(TEXTO_QUIEN_COMPRO);
    expect(mensajeDeLaRecepcion({ hint: "recepcion_faltante_causa", message: "Faltan 2 de Chompas: elige qué pasó" })).toBe("Faltan 2 de Chompas: elige qué pasó");
    expect(mensajeDeLaRecepcion({ hint: "envio_ya_recibido", message: "Este envío ya se recibió" })).toBe("Este envío ya se recibió");
    expect(mensajeDeLaRecepcion({ hint: "recibir_sin_modulo", message: "x" })).toBeNull();
    expect(mensajeDeLaRecepcion({ hint: "responsable_requerido", message: "Elige quién hace esta operación" })).toBeNull();
    expect(mensajeDeLaRecepcion({ hint: "version_cambiada", message: "Alguien cambió este envío: recarga" })).toBeNull();
    expect(mensajeDeLaRecepcion(null)).toBeNull();
  });
});

describe("lo que viene puesto se revisa (ADR-0284 act. h)", () => {
  it("el precio sugerido es «sugerido» hasta que se toca (la luz pasa y no bloquea); las tallas no vienen puestas: marcadas, están hechas", () => {
    const b = { ...borradorDePrenda(CTX_NUEVA, { precioSugerido: 59.9 }), nombre: "Chompa Aurora", tallaIds: ["t-s", "t-m"] };
    const antes = camposDePrenda(b, CTX_NUEVA);
    expect(antes.find((c) => c.id === "prenda-tallas")).toMatchObject({ requerido: true, hecho: true });
    expect(antes.find((c) => c.id === "prenda-precio")).toMatchObject({ requerido: false, sugerido: true, hecho: false });
    expect(antes.filter((c) => c.requerido && !c.hecho)).toEqual([]);
    const despues = camposDePrenda(b, CTX_NUEVA, { precio: true });
    expect(despues.find((c) => c.id === "prenda-precio")).toMatchObject({ requerido: true, hecho: true });
  });

  it("puesto mal, bloquea aunque nadie lo haya tocado", () => {
    const b = { ...borradorDePrenda(CTX_NUEVA), nombre: "Chompa", tallaIds: [], precio: "0" };
    const faltan = camposDePrenda(b, CTX_NUEVA).filter((c) => c.requerido && !c.hecho).map((c) => c.id);
    expect(faltan).toEqual(["prenda-tallas", "prenda-precio"]);
  });
});

describe("el aviso de costo atípico se lee por línea", () => {
  it("cuatro tallas de la misma línea son UNA línea; lo de fuera de la guía va por su lugar", () => {
    const base = { motivo: "mayor_que_precio" as const, costoUnitario: 95, costoVigente: 42, precio: 89.9, sku: "CMP-0001-NE-S", linea: null };
    const costos = [
      { ...base, varianteId: "v1", despachoItemId: "di-1", extra: null },
      { ...base, varianteId: "v2", despachoItemId: "di-1", extra: null },
      { ...base, varianteId: "v3", despachoItemId: "di-2", extra: null },
      { ...base, varianteId: "v4", despachoItemId: null, extra: 1 },
      { ...base, varianteId: "v5", despachoItemId: null, extra: 1 },
    ];
    const agrupados = atipicosPorLinea(costos, (c) => (c.despachoItemId ? `Línea ${c.despachoItemId}` : `Extra ${c.extra}`));
    expect(agrupados.map((c) => c.sku)).toEqual(["Línea di-1", "Línea di-2", "Extra 1"]);
    // Sin nombre de la línea, queda el código de la variante.
    expect(atipicosPorLinea(costos)[0]!.sku).toBe("CMP-0001-NE-S");
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Fase 5a: «Es la reposición de lo que faltó» (ADR-0362, decisión 14; docs/compras/ordenes-de-compra-2026-10/contrato-nos-debe.md)
// ---------------------------------------------------------------------------------------------------------------------------------

describe("la reposición de lo que faltó en la recepción", () => {
  // Textiles Andina debe 2 polos CAYLA de una recepción anterior; nada de chompas.
  const conDeudas = leerDetalleEnvio({ ...DETALLE_FASE4, deudas_del_proveedor: [{ proveedor_id: "prov-a", categoria_id: "cat-polos", marca_id: "m-cayla", pendiente: 2, costo_unitario: 12.5 }] })!;
  const ctx: ContextoRecepcion = { ...CTX, deudas: conDeudas.deudas };
  const extraPolos: BorradorExtra = { ...extraVacio("x1"), categoriaId: "cat-polos", marcaId: "m-cayla", costo: "12.50", prenda: POLO, cantidades: { "v-polo": "1" }, sobranteCausa: "reposicion_faltante" };

  it("la base de antes de la fase 5 no manda deudas: no se ofrece", () => {
    expect(detalle.deudas).toBeNull();
    expect(opcionesSobrante(CTX, { proveedorId: "prov-a", categoriaId: "cat-polos", marcaId: "m-cayla" }).map((o) => o.valor)).toEqual(["regalo", "cobra_aparte", "proxima_compra"]);
  });

  it("solo si ese proveedor debe esa categoría y marca", () => {
    expect(conDeudas.deudas).toEqual([{ proveedorId: "prov-a", categoriaId: "cat-polos", marcaId: "m-cayla", pendiente: 2, costoUnitario: 12.5 }]);
    const polos = opcionesSobrante(ctx, { proveedorId: "prov-a", categoriaId: "cat-polos", marcaId: "m-cayla" });
    expect(polos.map((o) => o.valor)).toEqual(["regalo", "cobra_aparte", "proxima_compra", "reposicion_faltante"]);
    expect(polos.at(-1)).toMatchObject({ texto: "Es la reposición de lo que faltó" });
    expect(polos.at(-1)!.aviso).toMatch(/^Textiles Andina te debe 2 prendas de un envío anterior/);
    // Con los nombres de la línea, lo dice en sus palabras.
    const conNombres = opcionesSobrante(ctx, { proveedorId: "prov-a", categoriaId: "cat-polos", marcaId: "m-cayla", categoria: "Polos", marca: "CAYLA" });
    expect(conNombres.at(-1)!.aviso).toBe("Textiles Andina te debe 2 polos CAYLA de un envío anterior. Si es lo que faltó, elige «Es la reposición de lo que faltó».");
    expect(opcionesSobrante(ctx, { proveedorId: "prov-a", categoriaId: "cat-chompas", marcaId: "m-cayla" }).map((o) => o.valor)).not.toContain("reposicion_faltante");
    expect(opcionesSobrante(ctx, { proveedorId: "prov-b", categoriaId: "cat-polos", marcaId: "m-cayla" }).map((o) => o.valor)).not.toContain("reposicion_faltante");
    expect(opcionesSobrante(ctx, { proveedorId: null, categoriaId: "cat-polos", marcaId: "m-cayla" }).map((o) => o.valor)).not.toContain("reposicion_faltante");
  });

  it("dentro de lo que debe, la pregunta queda hecha y viaja «reposicion»", () => {
    const b = conLinea(completo(), "di-2", { cantidades: { "v-polo": "12" }, sobranteCausa: "reposicion_faltante" });
    expect(reposicionesDe(b, ctx).get(idGuia.sobrante("di-2"))).toEqual({ disponible: 2, problema: null });
    expect(camposDeRecepcion(b, ctx, { listo: true, motivo: null }).find((c) => c.id === idGuia.sobrante("di-2"))).toMatchObject({ hecho: true });
    expect(primerProblema(b, ctx)).toBeNull();
    expect(argsRecibirDespacho(conDeudas, b, ctx, { version: 3, token: "t" }).p_lineas[1]).toMatchObject({ despacho_item_id: "di-2", sobrante_causa: "reposicion_faltante" });
  });

  it("si pasa de lo que debe, la pregunta lo dice y no deja recibir", () => {
    const b = conLinea(completo(), "di-2", { cantidades: { "v-polo": "13" }, sobranteCausa: "reposicion_faltante" });
    const campo = camposDeRecepcion(b, ctx, { listo: true, motivo: null }).find((c) => c.id === idGuia.sobrante("di-2"))!;
    expect(campo).toMatchObject({ requerido: true, hecho: false });
    expect(campo.pendiente).toBe("Te debe 2 polos CAYLA y aquí hay 3 de más: la reposición cubre hasta 2. Elige otra opción.");
    expect(primerProblema(b, ctx)).toBe(campo.pendiente);
  });

  it("lo que toma una línea ya no está para lo que no estaba en la guía", () => {
    const b = { ...conLinea(completo(), "di-2", { cantidades: { "v-polo": "12" }, sobranteCausa: "reposicion_faltante" as const }), extras: [extraPolos] };
    const r = reposicionesDe(b, ctx);
    expect(r.get(idGuia.sobrante("di-2"))!.problema).toBeNull();
    expect(r.get(idGuia.extra("x1", "sobrante"))!.problema).toMatch(/no te debe nada de esta categoría y marca/);
    expect(primerProblema(b, ctx)).toMatch(/no te debe nada/);
  });

  it("lo que no estaba en la guía dice qué se debe con los nombres del vocabulario", () => {
    const nombres = { categorias: [{ id: "cat-polos", nombre: "Polos" }], marcas: [{ id: "m-cayla", nombre: "CAYLA" }] };
    const b = { ...completo(), extras: [{ ...extraPolos, cantidades: { "v-polo": "3" } }] };
    expect(reposicionesDe(b, { ...ctx, nombres }).get(idGuia.extra("x1", "sobrante"))!.problema).toBe(
      "Te debe 2 polos CAYLA y aquí hay 3 de más: la reposición cubre hasta 2. Elige otra opción.",
    );
    expect(reposicionesDe(b, ctx).get(idGuia.extra("x1", "sobrante"))!.problema).toMatch(/^Te debe 2 prendas y/);
  });

  it("lo que no estaba en la guía se precarga con el costo de la deuda que repone", () => {
    expect(costoDeReposicion(ctx, { proveedorId: "prov-a", categoriaId: "cat-polos", marcaId: "m-cayla" })).toBe(12.5);
    expect(costoDeReposicion(ctx, { proveedorId: "prov-a", categoriaId: "cat-chompas", marcaId: "m-cayla" })).toBeNull();
    expect(costoDeReposicion(CTX, { proveedorId: "prov-a", categoriaId: "cat-polos", marcaId: "m-cayla" })).toBeNull();
    expect(proveedorDelExtra({ proveedorId: "" }, ctx)).toBe("prov-a");
  });

  it("textoCausa la nombra en «cómo se cerró»", () => {
    expect(textoCausa("reposicion_faltante")).toBe("Reposición de lo que faltó");
    expect(textoCausa("regalo")).toBe("Regalo");
  });

  /** La regla de `recibir_despacho` (fase 5a): la reposición solo si ese proveedor debe esa categoría y marca, y nunca más de lo que debe
   *  (lo de varias líneas y extras de la misma categoría y marca se suma). */
  function rechazoPorReposicion(d: DetalleEnvio, args: { p_lineas: LineaParaBase[]; p_extras: ExtraParaBase[] }, proveedores: readonly { id: string }[]): string | null {
    const quedan = new Map((d.deudas ?? []).map((x) => [`${x.proveedorId}|${x.categoriaId}|${x.marcaId}`, x.pendiente]));
    const tomar = (clave: string, n: number) => {
      const q = quedan.get(clave) ?? 0;
      if (q < n) return false;
      quedan.set(clave, q - n);
      return true;
    };
    for (const l of args.p_lineas) {
      if (l.sobrante_causa !== "reposicion_faltante") continue;
      const linea = d.lineas.find((x) => x.id === l.despacho_item_id)!;
      const deMas = l.variantes.reduce((a, v) => a + v.cantidad, 0) - linea.enviado;
      if (!tomar(`${linea.proveedor?.id}|${linea.categoria.id}|${linea.marca.id}`, deMas)) return "reposicion_faltante";
    }
    for (const e of args.p_extras) {
      if (e.sobrante_causa !== "reposicion_faltante") continue;
      const prov = e.proveedor_id ?? (proveedores.length === 1 ? proveedores[0]!.id : null);
      if (!tomar(`${prov}|${e.categoria_id}|${e.marca_id}`, e.variantes.reduce((a, v) => a + v.cantidad, 0))) return "reposicion_faltante";
    }
    return null;
  }

  const escenarios: { nombre: string; b: BorradorRecepcion }[] = [
    { nombre: "una de más, reposición", b: conLinea(completo(), "di-2", { cantidades: { "v-polo": "11" }, sobranteCausa: "reposicion_faltante" }) },
    { nombre: "justo lo que debe", b: conLinea(completo(), "di-2", { cantidades: { "v-polo": "12" }, sobranteCausa: "reposicion_faltante" }) },
    { nombre: "más de lo que debe", b: conLinea(completo(), "di-2", { cantidades: { "v-polo": "13" }, sobranteCausa: "reposicion_faltante" }) },
    { nombre: "de algo que no debe (chompas)", b: conLinea(completo(), "di-1", { cantidades: { "v-m-ne": "11", "v-s-ne": "5", "v-l-ne": "5" }, sobranteCausa: "reposicion_faltante" }) },
    { nombre: "fuera de la guía, dentro de lo que debe", b: { ...completo(), extras: [{ ...extraPolos, cantidades: { "v-polo": "2" } }] } },
    { nombre: "fuera de la guía, más de lo que debe", b: { ...completo(), extras: [{ ...extraPolos, cantidades: { "v-polo": "3" } }] } },
    { nombre: "línea y extra juntos pasan de lo que debe", b: { ...conLinea(completo(), "di-2", { cantidades: { "v-polo": "12" }, sobranteCausa: "reposicion_faltante" }), extras: [extraPolos] } },
    { nombre: "línea y extra juntos dentro de lo que debe", b: { ...conLinea(completo(), "di-2", { cantidades: { "v-polo": "11" }, sobranteCausa: "reposicion_faltante" }), extras: [extraPolos] } },
    { nombre: "fuera de la guía de otra categoría", b: { ...completo(), extras: [{ ...extraPolos, categoriaId: "cat-chompas" }] } },
  ];

  it.each(escenarios.map((e) => [e.nombre, e] as const))("espejo de la base: %s", (_, { b }) => {
    const guiaDejaPasar = primerProblema(b, ctx) === null;
    const args = argsRecibirDespacho(conDeudas, b, ctx, { version: 1, token: "t" });
    const rechazo = rechazoDeLaBase(conDeudas, args, ctx.proveedores) ?? rechazoPorReposicion(conDeudas, args, ctx.proveedores);
    expect(guiaDejaPasar, `${_}: la guía y la base no dicen lo mismo (${rechazo ?? "la base acepta"})`).toBe(rechazo === null);
  });
});
