import { describe, expect, it } from "vitest";
import type { RecepcionReciente } from "./compras-reglas";
import {
  cuentaPorVista,
  enVista,
  filasDeLaSede,
  llevaMucho,
  ordenarPorInstante,
  parteEnStock,
  textoBuscableDeFila,
  textoRecibido,
  tramoDeFecha,
  vistaInicial,
  type FilaDeEnvio,
} from "./envios-de-la-sede-reglas";
import type { EnvioPorAbrir, OrdenDirecta } from "./recepcion-envio-reglas";

const HOY = "2026-11-17";
const envio = (o: Partial<EnvioPorAbrir>): EnvioPorAbrir => ({
  id: "d1", numero: "ENV-000001", numeroGuia: null, estado: "en_camino", despachadoEn: "2026-11-16T15:00:00Z", unidades: 100, lineas: 4,
  ordenes: ["OC-000010"], proveedores: ["Textiles Andina SAC"], marcas: ["Anqori"], creadoPorMi: false, ...o,
});
const orden = (o: Partial<OrdenDirecta>): OrdenDirecta => ({ ordenId: "o1", numero: "OC-000020", proveedor: "Confecciones del Sur", marcas: ["Surena"], unidadesPorEnviar: 30, creadaPorMi: false, ...o });
const lote = (o: Partial<RecepcionReciente>): RecepcionReciente => ({
  loteId: "l1", despachoId: null, envioNumero: null, fecha: "2026-11-10T15:00:00Z", ubicacion: "Tienda Trujillo", proveedorId: "p", proveedorNombre: "Textiles Andina SAC",
  numeroGuia: null, nota: null, recibidoPor: "Micaela", unidades: 12, lineas: 1, conFactura: false, compraId: null, documento: null,
  detalle: [{ referencia: "Blusa", sku: "CMS-0002-ROS-M", talla: "M", color: "Rosado", marca: "Anqori", cantidad: 12 }], ...o,
});
const pendiente = (o: Partial<{ despachoId: string; numero: string | null; cerradoEn: string | null; porSeparar: number; porDetallar: number; porCrear: number }>) => ({
  despachoId: "d9", numero: "ENV-000009", cerradoEn: "2026-11-05T15:00:00Z", porSeparar: 0, porDetallar: 0, porCrear: 0, ...o,
});
const fila = (o: Partial<FilaDeEnvio>): FilaDeEnvio => ({
  clave: "x", estado: "contando", numero: "ENV-000001", sinNumero: null, marcas: [], proveedores: [], instante: "2026-11-16T15:00:00Z", unidades: 100, contadas: 0, enStock: 0,
  queFalta: null, creadoPorMi: false, sinAviso: false, href: null, ...o,
});

describe("filasDeLaSede: cada envío, una sola fila con un solo estado", () => {
  it("un envío abierto con prendas en el stock es UNA fila «contando»: sus llegadas no salen además como terminadas", () => {
    const filas = filasDeLaSede({
      envios: [envio({ id: "d21", numero: "ENV-000021", estado: "abierto", unidades: 119 })],
      ordenes: [],
      aMedias: { d21: { enStock: 24, contadas: 68 } },
      porTerminar: [],
      recibidos: [lote({ loteId: "a", despachoId: "d21", envioNumero: "ENV-000021", unidades: 24 }), lote({ loteId: "b" })],
    });
    expect(filas.map((f) => [f.clave, f.estado])).toEqual([["d21", "contando"], ["b", "terminado"]]);
    expect(filas[0]).toMatchObject({ unidades: 119, contadas: 68, enStock: 24, href: "/recibir/envio/d21" });
  });
  it("uno por terminar tampoco sale como terminado, y toma de sus llegadas las marcas, los proveedores y lo que ya entró", () => {
    const filas = filasDeLaSede({
      envios: [],
      ordenes: [],
      porTerminar: [pendiente({ despachoId: "d9", porSeparar: 79, porDetallar: 43 })],
      recibidos: [lote({ loteId: "a", despachoId: "d9", envioNumero: "ENV-000009", unidades: 12 })],
    });
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ estado: "por_terminar", marcas: ["Anqori"], proveedores: ["Textiles Andina SAC"], enStock: 12, unidades: null, queFalta: "79 por separar · 43 por poner tallas", href: "/recibir/envio/d9" });
  });
  it("una orden sin guía y un envío en camino son filas; quien hizo la orden no lleva a recibirla", () => {
    const filas = filasDeLaSede({ envios: [envio({ estado: "abierto", creadoPorMi: true })], ordenes: [orden({})], porTerminar: [], recibidos: [] });
    expect(filas.map((f) => f.estado)).toEqual(["contando", "sin_guia"]);
    expect(filas[0].href).toBeNull();
    expect(filas[1]).toMatchObject({ numero: "OC-000020", instante: null, unidades: 30 });
  });
  it("uno que llegó sin aviso no trae líneas: sus prendas son lo que ya se contó, o nada", () => {
    const sinAviso = envio({ id: "s", lineas: 0, ordenes: [], unidades: 0, estado: "abierto", proveedores: [] });
    const [contado] = filasDeLaSede({ envios: [sinAviso], ordenes: [], aMedias: { s: { enStock: 60, contadas: 60 } }, proveedoresSinAviso: { s: "Jacard Perú SAC y 2 más" }, porTerminar: [], recibidos: [] });
    expect(contado).toMatchObject({ sinAviso: true, unidades: 60, enStock: 60, proveedores: ["Jacard Perú SAC y 2 más"] });
    const [sinContar] = filasDeLaSede({ envios: [sinAviso], ordenes: [], porTerminar: [], recibidos: [] });
    expect(sinContar.unidades).toBeNull();
  });
  it("una llegada sin envío es una fila terminada con su nombre", () => {
    const [f] = filasDeLaSede({ envios: [], ordenes: [], porTerminar: [], recibidos: [lote({ loteId: "z" })] });
    expect(f).toMatchObject({ estado: "terminado", numero: null, sinNumero: "Sin envío", enStock: 12 });
  });
  it("sale del más nuevo al más antiguo; lo que no tiene fecha (una orden sin guía), al final", () => {
    const filas = filasDeLaSede({
      envios: [envio({ id: "viejo", despachadoEn: "2026-11-02T15:00:00Z" }), envio({ id: "nuevo", despachadoEn: "2026-11-16T15:00:00Z" })],
      ordenes: [orden({})],
      porTerminar: [],
      recibidos: [lote({ loteId: "medio", fecha: "2026-11-10T15:00:00Z" })],
    });
    expect(filas.map((f) => f.clave)).toEqual(["nuevo", "medio", "viejo", "o1"]);
    expect(ordenarPorInstante(filas, "asc").map((f) => f.clave)).toEqual(["viejo", "medio", "nuevo", "o1"]);
  });
});

describe("las vistas", () => {
  const filas = [fila({ estado: "contando" }), fila({ estado: "por_terminar" }), fila({ estado: "terminado" })];
  it("«por recibir» es todo menos lo terminado", () => {
    expect(filas.map((f) => enVista(f, "recibir"))).toEqual([true, true, false]);
    expect(filas.map((f) => enVista(f, "terminados"))).toEqual([false, false, true]);
    expect(filas.every((f) => enVista(f, "todos"))).toBe(true);
    expect(cuentaPorVista(filas)).toEqual({ recibir: 2, terminados: 1, todos: 3 });
  });
  it("abre en lo que hay que atender; sin nada por recibir, en lo terminado", () => {
    expect(vistaInicial(filas)).toBe("recibir");
    expect(vistaInicial([fila({ estado: "terminado" })])).toBe("terminados");
    expect(vistaInicial([])).toBe("recibir");
  });
});

describe("lo que lleva mucho y los tramos de la fecha", () => {
  it("contando desde hace 3 días o más avisa; en camino, nunca; por terminar, pasados 7", () => {
    expect(llevaMucho(fila({ estado: "contando", instante: "2026-11-14T15:00:00Z" }), HOY)).toBe(true);
    expect(llevaMucho(fila({ estado: "contando", instante: "2026-11-15T15:00:00Z" }), HOY)).toBe(false);
    expect(llevaMucho(fila({ estado: "en_camino", instante: "2026-11-01T15:00:00Z" }), HOY)).toBe(false);
    expect(llevaMucho(fila({ estado: "por_terminar", instante: "2026-11-10T15:00:00Z" }), HOY)).toBe(false);
    expect(llevaMucho(fila({ estado: "por_terminar", instante: "2026-11-09T15:00:00Z" }), HOY)).toBe(true);
    expect(llevaMucho(fila({ estado: "contando", instante: null }), HOY)).toBe(false);
  });
  it("los tramos: hoy y ayer, últimos 7 días, antes y sin fecha", () => {
    const tramo = (instante: string | null) => tramoDeFecha(fila({ instante }), HOY);
    expect([tramo("2026-11-17T15:00:00Z"), tramo("2026-11-16T15:00:00Z"), tramo("2026-11-10T15:00:00Z"), tramo("2026-11-09T15:00:00Z"), tramo(null)]).toEqual([
      "Hoy y ayer",
      "Hoy y ayer",
      "Últimos 7 días",
      "Antes",
      "Sin fecha",
    ]);
  });
  it("el día se lee en Lima: las 22:00 del 16 en Lima ya son el 17 en UTC, y siguen siendo «ayer»", () => {
    expect(tramoDeFecha(fila({ instante: "2026-11-17T03:00:00Z" }), HOY)).toBe("Hoy y ayer");
    expect(llevaMucho(fila({ estado: "contando", instante: "2026-11-15T03:00:00Z" }), HOY)).toBe(true);
  });
});

describe("lo recibido, en una línea", () => {
  it("dice lo que ya entró; si nada entró, lo contado; si nada se contó, las prendas", () => {
    expect(textoRecibido(fila({ unidades: 119, contadas: 68, enStock: 24 }))).toBe("24 de 119 en stock");
    expect(textoRecibido(fila({ unidades: 177, contadas: 96 }))).toBe("96 de 177 contadas");
    expect(textoRecibido(fila({ estado: "en_camino", unidades: 40 }))).toBe("40 prendas");
    expect(textoRecibido(fila({ unidades: 60, contadas: 60, enStock: 60 }))).toBe("Las 60 en stock");
    expect(textoRecibido(fila({ estado: "terminado", unidades: 92, enStock: 92 }))).toBe("92 en stock");
  });
  it("sin saber cuántas trae, no inventa un total", () => {
    expect(textoRecibido(fila({ unidades: null }))).toBe("Sin contar");
    expect(textoRecibido(fila({ estado: "por_terminar", unidades: null, queFalta: "79 por separar" }))).toBe("79 por separar");
    expect(textoRecibido(fila({ estado: "por_terminar", unidades: null, enStock: 12, queFalta: "79 por separar" }))).toBe("12 en stock · 79 por separar");
  });
  it("la parte en el stock ordena; sin total, no tiene", () => {
    expect(parteEnStock(fila({ unidades: 120, enStock: 30 }))).toBe(0.25);
    expect(parteEnStock(fila({ unidades: null, enStock: 30 }))).toBeNull();
  });
});

describe("la búsqueda", () => {
  it("encuentra por número, guía, orden, marca, proveedor y estado, sin tildes", () => {
    const [f] = filasDeLaSede({ envios: [envio({ numeroGuia: "T001-552", estado: "abierto" })], ordenes: [], porTerminar: [], recibidos: [] });
    const t = textoBuscableDeFila(f);
    for (const q of ["env-000001", "t001-552", "oc-000010", "anqori", "andina", "contando"]) expect(t.includes(q), q).toBe(true);
  });
});
