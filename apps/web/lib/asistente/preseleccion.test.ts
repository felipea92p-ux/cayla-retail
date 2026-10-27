import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GUIAS } from "../guias/registro";
import type { Guia } from "../guias/tipos";
import { moduloDeRuta } from "../actividad-reglas";
import { PIDEN_OTRO_MODULO, preseleccionar, raices } from "./preseleccion";

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

// Las faltas de ortografía de tienda (se escribe rápido, en el celular, como suena): la búsqueda local tiene que encontrar la pantalla
// igual, porque si no la deja entre las primeras, la IA nunca la ve.
describe("con faltas de ortografía", () => {
  it("lo que suena igual queda en la misma raíz", () => {
    const igual = (a: string, b: string) => expect([...raices(a)], `${a} / ${b}`).toEqual([...raices(b)]);
    igual("caaja", "caja");
    igual("caha", "caja");
    igual("bender", "vender");
    igual("sierro", "cierro");
    igual("taya", "talla");
    igual("canbio", "cambio");
    igual("debolucion", "devolución");
    igual("trujiyo", "Trujillo");
    igual("kiero", "quiero");
  });

  it("«kiero» y «aser» son palabras vacías, como «quiero» y «hacer»", () => {
    expect([...raices("kiero aser")]).toEqual([]);
  });

  it("una letra de menos o cambiada de lugar se perdona en una raíz de 4 letras o más, a la mitad del peso", () => {
    const APARTADOS = guia("/vender/apartados", "Apartados", "Guardar una prenda para un cliente.");
    const [exacta] = preseleccionar({ pregunta: "apartar", guias: [APARTADOS], rutasDelMenu: ["/vender/apartados"], rutaActual: "/" });
    const [falta] = preseleccionar({ pregunta: "apartr", guias: [APARTADOS], rutasDelMenu: ["/vender/apartados"], rutaActual: "/" });
    const [vuelta] = preseleccionar({ pregunta: "aprtaar", guias: [APARTADOS], rutasDelMenu: ["/vender/apartados"], rutaActual: "/" });
    expect(exacta?.puntos).toBe(5);
    expect(falta?.puntos).toBe(2.5);
    expect(vuelta?.guia.ruta).toBe("/vender/apartados");
  });

  it("una raíz de 3 letras no se perdona: «taler» no llega ni a «talla» ni a «taller»", () => {
    expect(rutas("cambio de taya")).toEqual(["/cambios"]);
    expect(rutas("taler")).toEqual([]);
  });

  it("los falsos amigos siguen separados: «compras» no trae Comprobantes, ni «talla» el taller", () => {
    expect(rutas("compras")).not.toContain("/vender/comprobantes");
    expect(rutas("comprobante")).not.toContain("/compras");
    expect(rutas("talla")).not.toContain("/produccion");
    expect(rutas("taller")).not.toContain("/cambios");
  });

  const menu = GUIAS.filter((g) => !/[[(]/.test(g.ruta)).map((g) => g.ruta);
  it.each([
    ["kiero bender un chort", "vender"],
    ["como sierro la caha", "caja"],
    ["aser un canbio de taya", "cambios"],
    ["debolucion de plata", "devoluciones"],
    ["mandar ropa a trujiyo", "inventario.traslados.nuevo"],
    ["como apartr una prenda", "vender.apartados"],
    ["registrar un prodcto nuebo", "productos.nuevo"],
    ["conteo de imbentario", "inventario.conteo"],
    ["yego mercaderia del probedor", "recibir"],
    ["poner una prenda en liquidasion", "productos.liquidacion"],
  ])("«%s» → %s", (pregunta, id) => {
    const top = preseleccionar({ pregunta, guias: GUIAS, rutasDelMenu: menu, rutaActual: "/", cuantas: 5 }).map((s) => s.guia.id);
    expect(top).toContain(id);
  });
});

describe("preseleccionar: las pantallas que cuelgan de una entrada del menú", () => {
  const HISTORIAL = guia("/caja/historial", "Historial de cierres", "Los cierres de caja de cada día.");
  const POR_PAGAR = guia("/compras/por-pagar", "Por pagar", "Lo que se le debe a cada proveedor.");
  const CON_ID = guia("/caja/[id]", "Un cierre", "El detalle de un cierre de caja.");
  const elegidas = (pregunta: string, menu: string[]) =>
    preseleccionar({ pregunta, guias: [HISTORIAL, POR_PAGAR, CON_ID], rutasDelMenu: menu, rutaActual: "/" }).map((s) => [s.guia.ruta, s.href]);

  it("una del mismo módulo y sin id se ofrece, y lleva a su dirección («Historial de cierres» cuelga de Caja)", () => {
    expect(elegidas("¿Dónde veo los cierres de caja?", ["/caja"])).toEqual([["/caja/historial", "/caja/historial"]]);
  });
  it("sin la entrada de la que cuelga, no", () => {
    expect(elegidas("¿Dónde veo los cierres de caja?", ["/cambios"])).toEqual([]);
  });
  it("una que pide otro módulo no se ofrece por colgar (Por pagar bajo Historial de compras)", () => {
    expect(elegidas("¿Cuánto le debemos al proveedor?", ["/compras"])).toEqual([]);
    expect(elegidas("¿Cuánto le debemos al proveedor?", ["/compras", "/compras/por-pagar"])).toEqual([["/compras/por-pagar", "/compras/por-pagar"]]);
  });

  it("la lista de las que piden otro módulo está al día con las páginas", () => {
    // Una pantalla de guía, sin id, cuya página (o un layout de su camino) exige un módulo distinto del que `moduloDeRuta` le da.
    const piden = GUIAS.filter((g) => !g.ruta.includes("[") && g.ruta !== "/").flatMap((g) => {
      const direccion = g.ruta.replace(/\/\([^)]+\)/g, "");
      const modulo = moduloDeRuta(direccion);
      if (modulo === null) return [];
      const partes = g.ruta.split("/").filter(Boolean);
      const exigidos = partes.flatMap((_, i) => {
        const base = `app/(app)/${partes.slice(0, i + 1).join("/")}`;
        return [`${base}/layout.tsx`, ...(i === partes.length - 1 ? [`${base}/page.tsx`] : [])]
          .filter((f) => existsSync(f))
          .flatMap((f) => [...readFileSync(f, "utf8").matchAll(/exigirModulo\("([a-z_]+)"\)/g)].map((m) => m[1]));
      });
      return exigidos.some((m) => m !== modulo) ? [direccion] : [];
    });
    expect([...PIDEN_OTRO_MODULO].sort()).toEqual(piden.sort());
  });
});
