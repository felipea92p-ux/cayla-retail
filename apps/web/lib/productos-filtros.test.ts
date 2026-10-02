import { describe, expect, it } from "vitest";
import {
  chipsDeFiltros,
  contarFiltrosActivos,
  estadoDeUrl,
  estadoParaBase,
  cambiosTipeados,
  consultaConCambios,
  consultaSinFiltros,
  hrefDeConsulta,
  sinCajas,
  tipeadoPendiente,
  valorDeCaja,
} from "./productos-filtros";

describe("productos-filtros — la URL es la única verdad de la barra", () => {
  it("aplicar un cambio conserva lo demás, borra lo vacío y vuelve a la página 1", () => {
    expect(consultaConCambios("cat=a&pagina=7&vista=tabla", { color: "NEG" })).toBe("cat=a&vista=tabla&color=NEG");
    expect(consultaConCambios("cat=a&color=NEG", { color: "" })).toBe("cat=a");
    expect(consultaConCambios("", {})).toBe("");
    expect(hrefDeConsulta("/productos", "")).toBe("/productos");
    expect(hrefDeConsulta("/productos", "cat=a")).toBe("/productos?cat=a");
  });

  it("«Limpiar todo» quita filtros, búsqueda, precio y orden, pero deja a la persona en la Tabla", () => {
    expect(consultaSinFiltros("q=blusa&cat=a&precioMax=80&orden=precio_asc&vista=tabla&pagina=3")).toBe("vista=tabla");
    expect(consultaSinFiltros("q=blusa&cat=a")).toBe("");
  });

});

describe("productos-filtros — cajas que se escriben", () => {
  it("una caja que no se está escribiendo muestra la URL, no lo que se escribió antes (el chip «Hasta S/100» fantasma)", () => {
    // Escenario real: se filtró hasta S/100, después «A quién pedirle» navegó a ?stock=reponer sin precio.
    expect(valorDeCaja({}, "precioMax", "stock=reponer")).toBe("");
    expect(valorDeCaja({}, "precioMax", "precioMax=100")).toBe("100");
    // Mientras se escribe, manda lo escrito (no se le borra una letra a mitad de palabra).
    expect(valorDeCaja({ q: "blu" }, "q", "q=bl")).toBe("blu");
  });

  it("lo escrito se compara contra la URL vigente: solo se manda lo que de verdad cambió", () => {
    expect(cambiosTipeados("orden=precio_asc", { q: "blusa" })).toEqual({ q: "blusa" });
    expect(cambiosTipeados("q=blusa", { q: " blusa " })).toEqual({});
    expect(cambiosTipeados("q=blusa", { q: "" })).toEqual({ q: "" });
    // Nunca reaparece una caja que no se tocó (antes el precio viejo volvía con la primera letra del buscador).
    expect(cambiosTipeados("stock=reponer", { q: "b" })).toEqual({ q: "b" });
  });

  it("el precio se manda normalizado y a medio escribir se espera, sin borrar el filtro", () => {
    expect(cambiosTipeados("", { precioMax: "39,90" })).toEqual({ precioMax: "39.9" });
    expect(cambiosTipeados("precioMax=60", { precioMax: "39," })).toEqual({}); // a medio escribir: no se toca la URL
    expect(cambiosTipeados("precioMax=60", { precioMax: "" })).toEqual({ precioMax: "" });
    expect(tipeadoPendiente("precioMax=39.9", { precioMax: "39,90" })).toEqual({});
    expect(tipeadoPendiente("precioMax=60", { precioMax: "39," })).toEqual({ precioMax: "39," });
  });

  it("la caja con el cursor no se suelta: el espacio antes de la palabra siguiente no se borra («blusaroja»)", () => {
    expect(tipeadoPendiente("q=blusa", { q: "blusa " }, "q")).toEqual({ q: "blusa " });
    expect(tipeadoPendiente("precioMax=39.9", { precioMax: "39,9" }, "precioMax")).toEqual({ precioMax: "39,9" });
    // Al salir de la caja (sin foco), lo mismo recortado ya está en la URL: se suelta.
    expect(tipeadoPendiente("q=blusa", { q: "blusa " }, null)).toEqual({});
  });

  it("la caja deja de «escribirse» cuando la URL ya dice lo mismo", () => {
    const t = { q: "blusa", precioMax: "80" };
    expect(tipeadoPendiente("q=blusa", t)).toEqual({ precioMax: "80" });
    expect(tipeadoPendiente("q=blusa&precioMax=80", t)).toEqual({});
    expect(tipeadoPendiente("", t)).toBe(t); // nada llegó todavía: el mismo objeto, sin repintar
  });

  it("quitar el chip o «Limpiar todo» también suelta lo que se estaba escribiendo", () => {
    expect(sinCajas({ q: "blu", precioMin: "20" }, ["precioMin", "precioMax"])).toEqual({ q: "blu" });
    const t = { q: "blu" };
    expect(sinCajas(t, ["precioMin"])).toBe(t);
  });
});

describe("productos-filtros — estado, conteo y chips", () => {
  it("al entrar se ven las activas; «Todos» se escribe en la URL y a la base no le llega estado", () => {
    expect(estadoDeUrl(undefined)).toBe("activo");
    expect(estadoDeUrl("raro")).toBe("activo");
    expect(estadoParaBase(estadoDeUrl("todos"))).toBeUndefined();
    expect(estadoParaBase(estadoDeUrl("descontinuado"))).toBe("descontinuado");
    expect(estadoParaBase(estadoDeUrl(null))).toBe("activo");
  });

  it("«Filtros · N» cuenta lo que quita prendas: ni el orden, ni la búsqueda, ni la vista, ni el estado de fábrica", () => {
    expect(contarFiltrosActivos("orden=precio_asc&q=blusa&vista=tabla&pagina=2")).toBe(0);
    expect(contarFiltrosActivos("estado=activo")).toBe(0);
    expect(contarFiltrosActivos("estado=todos")).toBe(1);
    expect(contarFiltrosActivos("cat=a&color=NEG&precioMin=10&precioMax=80")).toBe(3); // el precio cuenta una vez
    expect(contarFiltrosActivos("precioMax=39,90")).toBe(1); // cliente y servidor leen la coma igual: se aplica y se cuenta
    expect(contarFiltrosActivos("precioMax=abc")).toBe(0); // nadie lo aplica: no se cuenta
  });

  it("cada chip dice «Nombre: valor»; el orden no es un chip", () => {
    const nombres = { categoria: () => "Blusas", marca: () => "Adidas", proveedor: () => "Adidas", color: () => "Negro" };
    const chips = chipsDeFiltros("q=top&cat=a&marca=m&proveedor=sin&color=NEG&estado=todos&stock=reponer&precioMax=80&orden=precio_asc", nombres);
    expect(chips.map((c) => c.texto)).toEqual([
      "«top»",
      "Categoría: Blusas",
      "Marca: Adidas",
      "Proveedor: sin proveedor",
      "Color: Negro",
      "Estado: Todos",
      "Stock: Pedir a proveedor",
      "Precio: Hasta S/ 80",
    ]);
    expect(chips.find((c) => c.texto.startsWith("Precio"))?.quitar).toEqual(["precioMin", "precioMax"]);
  });

  it("un id que ya no existe se lee «—», no rompe", () => {
    const vacio = { categoria: () => undefined, marca: () => undefined, proveedor: () => undefined, color: () => undefined };
    expect(chipsDeFiltros("cat=zzz", vacio)[0].texto).toBe("Categoría: —");
  });
});
