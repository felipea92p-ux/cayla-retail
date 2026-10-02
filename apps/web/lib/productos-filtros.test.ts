import { describe, expect, it } from "vitest";
import {
  cambiosTipeados,
  consultaConCambios,
  consultaSinFiltros,
  hrefDeConsulta,
  mismaConsulta,
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

  it("dos consultas con las mismas claves en otro orden son la misma URL", () => {
    expect(mismaConsulta("a=1&b=2", "b=2&a=1")).toBe(true);
    expect(mismaConsulta("a=1", "a=2")).toBe(false);
    expect(mismaConsulta("", "")).toBe(true);
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
