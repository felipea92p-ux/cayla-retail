import { describe, expect, it } from "vitest";
import { sumarEntradas } from "./etiqueta-precio-reglas";
import { avisoSinStock, lugaresEnSede, unidadesEnSede, type FilaStockConLugar } from "./stock-en-sede-reglas";

describe("lugaresEnSede · dónde está cada unidad dentro de la sede", () => {
  const fila = (variante_id: string, cantidad: number, tipo: string | null | undefined): FilaStockConLugar => ({
    variante_id,
    cantidad,
    sububicacion: tipo === undefined ? null : { tipo },
  });

  it("reparte piso, almacén, dañadas y sin lugar por prenda", () => {
    const l = lugaresEnSede([fila("m", 4, "piso_venta"), fila("m", 3, "almacen_tienda"), fila("m", 1, "cuarentena"), fila("s", 2, undefined)]);
    expect(l.get("m")).toEqual({ piso: 4, almacen: 3, danadas: 1, sinLugar: 0 });
    expect(l.get("s")).toEqual({ piso: 0, almacen: 0, danadas: 0, sinLugar: 2 });
  });

  it("una sububicación de otro tipo (un rack del Taller) o sin tipo cuenta como «sin lugar»: no se pierde", () => {
    const l = lugaresEnSede([fila("x", 5, "rack"), fila("x", 1, null)]);
    expect(l.get("x")).toEqual({ piso: 0, almacen: 0, danadas: 0, sinLugar: 6 });
  });

  it("las cuatro partes suman EXACTAMENTE lo que `sumarEntradas` cuenta con las mismas filas (el «Todo» no cambia)", () => {
    const filas = [fila("a", 2, "piso_venta"), fila("a", 5, "almacen_tienda"), fila("b", 1, "cuarentena"), fila("b", 3, null), fila("c", 7, "piso_venta")];
    const total = sumarEntradas(filas);
    for (const [id, l] of lugaresEnSede(filas)) expect(l.piso + l.almacen + l.danadas + l.sinLugar).toBe(total.get(id));
  });
});

describe("unidadesEnSede", () => {
  const stock = new Map([
    ["xs", 3],
    ["s", 1],
  ]);

  it("suma solo las prendas pedidas", () => {
    expect(unidadesEnSede(stock, ["xs", "s"])).toBe(4);
    expect(unidadesEnSede(stock, ["s"])).toBe(1);
  });

  it("una prenda sin fila de stock cuenta 0 (así la etiqueta de una talla agotada no se abre)", () => {
    expect(unidadesEnSede(stock, ["m"])).toBe(0);
    expect(unidadesEnSede(stock, [])).toBe(0);
  });

  it("un negativo (no debería existir: lo impide fn_aplicar_movimiento) no resta a las demás", () => {
    expect(unidadesEnSede(new Map([["a", -2], ["b", 1]]), ["a", "b"])).toBe(1);
  });
});

describe("avisoSinStock", () => {
  it("nombra la prenda y la sede", () => {
    expect(avisoSinStock("XS Beige", "Tienda Trujillo").texto).toBe("XS Beige no tiene stock en Tienda Trujillo");
  });

  it("varias prendas marcadas concuerdan en plural", () => {
    expect(avisoSinStock("Las 3 prendas marcadas", "Tienda Arequipa", true).texto).toBe("Las 3 prendas marcadas no tienen stock en Tienda Arequipa");
  });

  it("sin nombre de sede no deja un hueco", () => {
    expect(avisoSinStock("Blusa Carlita", " ").texto).toBe("Blusa Carlita no tiene stock en tu sede");
  });
});
