import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { borradorNuevoDeOrdenInsumo } from "./orden-insumo-alta";
import { leerPrecargaDePedido, urlPedirInsumo } from "./pedir-insumo-reglas";

// «Pedir N m» lleva la cantidad (Formidable de Producción, 2026-10-16): el botón del Resumen y de la orden dice cuánto falta, y el enlace lo
// lleva a la hoja de Nueva orden de insumos, que lo pone en la primera línea. La URL es de quien la escriba, así que la hoja descarta
// todo lo que no entiende sin romperse (ADR-0284: la guía no adivina; la base sigue juzgando lo que se guarda).

describe("urlPedirInsumo: el enlace de «Pedir» con el insumo y lo que falta", () => {
  it("lleva el insumo y la cantidad en su unidad, tal como se lee: sin ceros de más ni ruido de flotantes", () => {
    expect(urlPedirInsumo("lino", 31.6)).toBe("/ordenes-insumos/nueva?insumo=lino&cantidad=31.6");
    expect(urlPedirInsumo("lino", 110)).toBe("/ordenes-insumos/nueva?insumo=lino&cantidad=110");
    expect(urlPedirInsumo("lino", 146.5)).toBe("/ordenes-insumos/nueva?insumo=lino&cantidad=146.5");
    expect(urlPedirInsumo("lino", 0.1 + 0.2)).toBe("/ordenes-insumos/nueva?insumo=lino&cantidad=0.3");
    expect(urlPedirInsumo("lino", 200 - 168.4)).toBe("/ordenes-insumos/nueva?insumo=lino&cantidad=31.6");
  });
  it("la hoja guarda hasta tres decimales: más se redondea a milésimas", () => {
    expect(urlPedirInsumo("lino", 31.5004)).toContain("cantidad=31.5");
    expect(urlPedirInsumo("lino", 31.5006)).toContain("cantidad=31.501");
    expect(urlPedirInsumo("lino", 12.505)).toContain("cantidad=12.505");
  });
  it("sin una cantidad que se pueda pedir (cero, negativa, NaN, infinita, nula, de más), lleva solo el insumo", () => {
    for (const mala of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, null, undefined, 0.0004, 100_000, 1e9]) {
      expect(urlPedirInsumo("lino", mala), String(mala)).toBe("/ordenes-insumos/nueva?insumo=lino");
    }
    // El tope de la base: 99 999.999.
    expect(urlPedirInsumo("lino", 99_999.999)).toContain("cantidad=99999.999");
    expect(urlPedirInsumo("lino", 99_999.9996)).toBe("/ordenes-insumos/nueva?insumo=lino");
  });
  it("sin insumo no hay nada que precargar: la hoja de siempre, aunque venga una cantidad", () => {
    for (const vacio of ["", "   ", null, undefined]) expect(urlPedirInsumo(vacio, 10), String(vacio)).toBe("/ordenes-insumos/nueva");
  });
  it("el id viaja codificado: no puede colar otro parámetro", () => {
    expect(urlPedirInsumo("a&cantidad=9", 5)).toBe("/ordenes-insumos/nueva?insumo=a%26cantidad%3D9&cantidad=5");
    expect(urlPedirInsumo("3f0c1e2a-7b44-4d2e-9a10-5c8f6e1b2d77", 12.5)).toBe("/ordenes-insumos/nueva?insumo=3f0c1e2a-7b44-4d2e-9a10-5c8f6e1b2d77&cantidad=12.5");
  });
});

describe("leerPrecargaDePedido: lo que la hoja toma de la URL (y lo que descarta sin romperse)", () => {
  const INSUMOS = new Set(["lino", "hilo", "3f0c1e2a-7b44-4d2e-9a10-5c8f6e1b2d77"]);
  const leer = (params: Record<string, string | string[] | undefined> | null | undefined) => leerPrecargaDePedido(params, INSUMOS);

  it("un insumo que existe y una cantidad válida: lo que armó urlPedirInsumo vuelve igual (ida y vuelta)", () => {
    for (const [id, cantidad] of [["lino", 31.6], ["hilo", 150], ["lino", 0.001], ["lino", 99_999.999], ["3f0c1e2a-7b44-4d2e-9a10-5c8f6e1b2d77", 12.505]] as const) {
      const url = new URL(urlPedirInsumo(id, cantidad), "http://x");
      const params = Object.fromEntries(url.searchParams);
      expect(leer(params), `${id} ${cantidad}`).toEqual({ insumoId: id, cantidad: String(cantidad) });
    }
  });
  it("el insumo solo, sin cantidad: precarga el insumo y la cantidad queda para escribirla", () => {
    expect(leer({ insumo: "lino" })).toEqual({ insumoId: "lino", cantidad: null });
  });
  it("sin parámetros, o con otros que no son de aquí: nada que precargar", () => {
    expect(leer({})).toBeNull();
    expect(leer(null)).toBeNull();
    expect(leer(undefined)).toBeNull();
    expect(leer({ recien: "x", q: "lino" })).toBeNull();
    expect(leer({ cantidad: "10" })).toBeNull();
  });
  it("un insumo que no existe (o no se puede elegir) se descarta, y su cantidad con él: sin su unidad no significa nada", () => {
    expect(leer({ insumo: "no-existe", cantidad: "10" })).toBeNull();
    expect(leer({ insumo: "", cantidad: "10" })).toBeNull();
    expect(leer({ insumo: "   ", cantidad: "10" })).toBeNull();
    expect(leer({ insumo: "LINO", cantidad: "10" })).toBeNull();
    expect(leer({ insumo: "__proto__", cantidad: "10" })).toBeNull();
    expect(leer({ insumo: "constructor" })).toBeNull();
    expect(leer({ insumo: "lino' or 1=1 --" })).toBeNull();
    expect(leer({ insumo: "x".repeat(10_000), cantidad: "10" })).toBeNull();
  });
  it("una cantidad que no sirve se descarta sola y el insumo se queda (letras, negativa, cero, científica, de más, con signos o coma)", () => {
    const malas = ["abc", "-5", "+5", "0", "0.000", "0.0004", "1e9", "1e1", "NaN", "Infinity", "-Infinity", "", "  ", "1,5", "1.5.2", ".5", "5.", "1 000", "S/ 10", "99999999999999999999", "100000", "99999.9999", "31.6004", "1.500", "0x10", "٣"];
    for (const cantidad of malas) expect(leer({ insumo: "lino", cantidad }), JSON.stringify(cantidad)).toEqual({ insumoId: "lino", cantidad: null });
  });
  it("lo que sí se lee, se deja como la hoja lo escribe (sin ceros de más)", () => {
    expect(leer({ insumo: "lino", cantidad: "31.60" })).toEqual({ insumoId: "lino", cantidad: "31.6" });
    expect(leer({ insumo: "lino", cantidad: "007" })).toEqual({ insumoId: "lino", cantidad: "7" });
    expect(leer({ insumo: "lino", cantidad: " 12.5 " })).toEqual({ insumoId: "lino", cantidad: "12.5" });
    expect(leer({ insumo: " lino ", cantidad: "12.5" })).toEqual({ insumoId: "lino", cantidad: "12.5" });
    expect(leer({ insumo: "lino", cantidad: "99999.999" })).toEqual({ insumoId: "lino", cantidad: "99999.999" });
  });
  it("un parámetro repetido es ambiguo: no se adivina cuál vale (el insumo repetido se descarta; la cantidad repetida, también)", () => {
    expect(leer({ insumo: ["lino", "hilo"], cantidad: "10" })).toBeNull();
    expect(leer({ insumo: ["lino"], cantidad: "10" })).toBeNull();
    expect(leer({ insumo: "lino", cantidad: ["10", "20"] })).toEqual({ insumoId: "lino", cantidad: null });
    expect(leer({ insumo: "lino", cantidad: [] })).toEqual({ insumoId: "lino", cantidad: null });
  });
});

describe("borradorNuevoDeOrdenInsumo: la primera línea sale con el insumo y la cantidad, y nada más cambia", () => {
  it("sin precarga, la hoja de siempre: una línea vacía", () => {
    expect(borradorNuevoDeOrdenInsumo("taller", null)).toEqual({
      proveedorId: "",
      destinoId: "taller",
      entrega: "",
      nota: "",
      lineas: [{ clave: "l1", insumoId: "", descripcion: "", cantidad: "", precio: "", descuento: "", modoDescuento: "pct" }],
    });
  });
  it("con precarga, solo la primera línea trae el insumo y la cantidad; el proveedor, el precio y lo demás los pone la persona", () => {
    const b = borradorNuevoDeOrdenInsumo("taller", { insumoId: "lino", cantidad: "31.6" });
    expect(b.lineas).toHaveLength(1);
    expect(b.lineas[0]).toMatchObject({ clave: "l1", insumoId: "lino", cantidad: "31.6", precio: "", descripcion: "", descuento: "" });
    expect(b).toMatchObject({ proveedorId: "", destinoId: "taller", entrega: "", nota: "" });
  });
  it("con el insumo y sin cantidad, la cantidad queda vacía para escribirla", () => {
    expect(borradorNuevoDeOrdenInsumo("", { insumoId: "lino", cantidad: null }).lineas[0]).toMatchObject({ insumoId: "lino", cantidad: "" });
  });
});

// Lo que esta prueba no ve —que los tres «Pedir» de verdad usen el enlace con cantidad, y que la hoja lo lea— lo cuida el texto de los archivos
// (como `ordenes-insumo-candados.test.ts`): si alguien vuelve a escribir el enlace pelado, el botón vuelve a prometer una cantidad que no lleva.
describe("los tres «Pedir» llevan la cantidad, y la hoja la lee", () => {
  const leer = (archivo: string) => readFileSync(join(__dirname, "..", archivo), "utf8");
  it.each([
    ["components/orden-pagina/TelaDeLaOrdenVista.tsx", "urlPedirInsumo(f.id, f.faltanNumero)"],
    ["components/ResumenProduccionPanel.tsx", "urlPedirInsumo(t.insumoId, t.faltan)"],
    ["lib/produccion-decisiones.ts", "urlPedirInsumo(i.id, falta - viaja)"],
  ])("%s arma el enlace con %s", (archivo, llamada) => {
    const fuente = leer(archivo);
    expect(fuente).toContain(llamada);
    // El enlace pelado a la hoja de pedir (sin insumo ni cantidad) ya no se escribe a mano en estos archivos.
    expect(fuente).not.toMatch(/["'`]\/ordenes-insumos\/nueva["'`]/);
  });
  it("la página de la hoja lee los parámetros contra la lista de insumos y el formulario abre con ellos y con el cursor en el proveedor", () => {
    const pagina = leer("app/(app)/ordenes-insumos/nueva/page.tsx");
    expect(pagina).toContain("leerPrecargaDePedido(params, new Set(datos.insumos.map((i) => i.id)))");
    expect(pagina).toContain("precarga={precarga}");
    const formulario = leer("components/ordenes-insumo/NuevaOrdenInsumo.tsx");
    expect(formulario).toContain("borradorNuevoDeOrdenInsumo(destinoInicial, precarga ?? null)");
    expect(formulario).toContain("autoFocus={enfocarProveedor}");
  });
});
