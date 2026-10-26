import { describe, expect, it } from "vitest";
import { GUIAS } from "../guias/registro";
import type { Guia } from "../guias/tipos";
import { preseleccionar } from "./preseleccion";

const guia = (ruta: string, titulo: string, resumen: string, pasos: [string, string][] = []): Guia => ({
  id: ruta.slice(1).replaceAll("/", ".") || "inicio",
  ruta,
  titulo,
  resumen,
  pasos: [
    { id: "hola", ancla: null, titulo: `Bienvenida a ${titulo}`, texto: resumen },
    ...pasos.map(([t, x], i) => ({ id: `p${i}`, ancla: `${ruta}.p${i}`, titulo: t, texto: x })),
  ],
});

const COMPROBANTES = guia("/vender/comprobantes", "Comprobantes", "Las boletas y facturas emitidas.", [["Anular un comprobante", "Desde el detalle, «Anular» lo da de baja."]]);
const COMPRAS = guia("/compras", "Compras", "Las facturas de proveedores.", [["Anular una compra", "Una compra no se borra: se anula."]]);
const CAMBIOS = guia("/cambios", "Cambios", "Cambiar una prenda por otra talla o color.");
const TALLER = guia("/produccion", "Producción", "Lo que hace el taller.", [["El taller", "Las órdenes del taller."]]);
const FACTURA = guia("/compras/[id]", "Una compra", "El detalle de una factura de proveedor.", [["Anular", "Anula la compra si fue un error."]]);
const TODAS = [COMPROBANTES, COMPRAS, CAMBIOS, TALLER, FACTURA];
const MENU = ["/vender/comprobantes", "/compras", "/cambios", "/produccion"];

const rutas = (pregunta: string, op: { menu?: string[]; aqui?: string } = {}) =>
  preseleccionar({ pregunta, guias: TODAS, rutasDelMenu: op.menu ?? MENU, rutaActual: op.aqui ?? "/" }).map((s) => s.guia.ruta);

describe("preseleccionar: las guías que más se parecen a la pregunta", () => {
  it("«¿Cómo anulo una boleta?» lleva a Comprobantes, no a Compras («compras» y «comprobante» no se confunden)", () => {
    expect(rutas("¿Cómo anulo una boleta?")[0]).toBe("/vender/comprobantes");
  });

  it("«talla» no empata con «taller»", () => {
    expect(rutas("cambio de talla")).toEqual(["/cambios"]);
  });

  it("solo palabras vacías o nada escrito: no sugiere nada", () => {
    expect(rutas("")).toEqual([]);
    expect(rutas("¿cómo hago para...?")).toEqual([]);
  });

  it("solo ofrece las pantallas del menú de la cuenta", () => {
    expect(rutas("anular una boleta", { menu: ["/compras"] })).toEqual(["/compras"]);
    expect(rutas("anular una boleta", { menu: [] })).toEqual([]);
  });

  it("una pantalla interna (con [id]) solo sale si la persona ya está ahí, y entonces no hay a dónde llevarla", () => {
    expect(rutas("anular la compra")).not.toContain("/compras/[id]");
    const aqui = preseleccionar({ pregunta: "anular la compra", guias: TODAS, rutasDelMenu: MENU, rutaActual: "/compras/9f3a" });
    expect(aqui.map((s) => s.guia.ruta)).toContain("/compras/[id]");
    expect(aqui.find((s) => s.guia.ruta === "/compras/[id]")?.href).toBeNull();
    expect(aqui.find((s) => s.guia.ruta === "/compras")?.href).toBe("/compras");
  });

  it("la entrada del menú se usa tal cual para llevar (con su ?tab=)", () => {
    const [s] = preseleccionar({ pregunta: "cambio de talla", guias: TODAS, rutasDelMenu: ["/cambios?vista=hoy"], rutaActual: "/" });
    expect(s?.href).toBe("/cambios?vista=hoy");
  });

  it("dice el paso que responde, y nunca la bienvenida (sin ancla)", () => {
    const [s] = preseleccionar({ pregunta: "anular un comprobante", guias: TODAS, rutasDelMenu: MENU, rutaActual: "/" });
    expect(s?.paso?.titulo).toBe("Anular un comprobante");
    const [solo] = preseleccionar({ pregunta: "comprobantes", guias: [guia("/vender/comprobantes", "Comprobantes", "Lo emitido.")], rutasDelMenu: MENU, rutaActual: "/" });
    expect(solo?.paso).toBeNull();
  });

  it("a igual puntaje gana la pantalla donde está la persona; y no hay azar", () => {
    const a = guia("/a", "Caja", "La caja.");
    const b = guia("/b", "Caja", "La caja.");
    const con = (aqui: string) => preseleccionar({ pregunta: "caja", guias: [a, b], rutasDelMenu: ["/a", "/b"], rutaActual: aqui }).map((s) => s.guia.ruta);
    expect(con("/")).toEqual(["/a", "/b"]);
    expect(con("/b")).toEqual(["/b", "/a"]);
    expect(con("/")).toEqual(con("/"));
  });

  it("devuelve como mucho las que se piden", () => {
    expect(preseleccionar({ pregunta: "anular", guias: TODAS, rutasDelMenu: MENU, rutaActual: "/compras/1", cuantas: 2 })).toHaveLength(2);
  });
});

// Con el catálogo real: las preguntas de tienda más comunes encuentran su pantalla entre las 3 primeras. Si una guía cambia de palabras y
// esto falla, la búsqueda sin IA dejó de encontrarla: revisa la guía o las equivalencias, no borres el caso.
describe("con las guías de verdad", () => {
  const menu = GUIAS.filter((g) => !/[[(]/.test(g.ruta)).map((g) => g.ruta);
  it.each([
    ["¿Cómo anulo una boleta?", "/vender/comprobantes"],
    ["dónde cierro la caja", "/caja"],
    ["cómo registro un gasto", "/finanzas/gastos"],
    ["quiero apartar una prenda", "/vender/apartados"],
    ["cómo creo un producto nuevo", "/productos/nuevo"],
    ["ajustar stock", "/inventario"],
    ["como hago un traslado a otra tienda", "/inventario/traslados/nuevo"],
    ["devolver dinero a un cliente", "/devoluciones"],
    ["cambio de talla", "/cambios"],
  ])("«%s» → %s", (pregunta, ruta) => {
    const top = preseleccionar({ pregunta, guias: GUIAS, rutasDelMenu: menu, rutaActual: "/" }).map((s) => s.guia.ruta);
    expect(top).toContain(ruta);
  });
});
