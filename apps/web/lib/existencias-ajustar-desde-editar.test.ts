import { describe, expect, it } from "vitest";
import { hrefAjustarDesdeEditar, pideAjustar, vueltaAEditar } from "./existencias-ajustar-desde-editar";

const PRODUCTO = "11111111-2222-4333-8444-555555555555";
const VARIANTE = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

describe("el candado de Editar lleva a «Ajustar stock» de Existencias", () => {
  it("arma el enlace con la talla, la planilla y el producto de vuelta", () => {
    expect(hrefAjustarDesdeEditar({ varianteId: VARIANTE, productoId: PRODUCTO })).toBe(`/inventario?variante=${VARIANTE}&ajustar=1&de=${PRODUCTO}`);
  });

  it("conserva la vista de Productos de donde se salió, y solo si es de Productos", () => {
    const bueno = hrefAjustarDesdeEditar({ varianteId: VARIANTE, productoId: PRODUCTO, desde: "/productos?vista=tabla&q=polo" });
    expect(bueno).toContain(`&desde=${encodeURIComponent("/productos?vista=tabla&q=polo")}`);
    expect(hrefAjustarDesdeEditar({ varianteId: VARIANTE, productoId: PRODUCTO, desde: "https://malo.example" })).not.toContain("desde=");
  });

  it("solo «1» pide la planilla", () => {
    expect(pideAjustar("1")).toBe(true);
    expect(pideAjustar(["1", "0"])).toBe(true);
    for (const v of [undefined, "", "0", "true", "si", ["0"]]) expect(pideAjustar(v)).toBe(false);
  });

  it("la vuelta es la ficha de ese producto, con su vista de Productos", () => {
    expect(vueltaAEditar(PRODUCTO, null)).toBe(`/productos/${PRODUCTO}/editar`);
    expect(vueltaAEditar(PRODUCTO, "/productos?vista=tabla")).toBe(`/productos/${PRODUCTO}/editar?desde=${encodeURIComponent("/productos?vista=tabla")}`);
  });

  it("nadie manda a otro lado escribiendo la URL: un producto que no es uuid no vuelve a ninguna parte", () => {
    for (const v of [undefined, "", "1", "../../etc", "//malo.example", "javascript:alert(1)", `${PRODUCTO}/../x`, `${PRODUCTO}?x=1`]) expect(vueltaAEditar(v, null)).toBeNull();
  });
});
