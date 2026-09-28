import { describe, expect, it } from "vitest";
import {
  avisoChoque,
  claveNombre,
  EJEMPLO_NEUTRO,
  EJEMPLOS_POR_FAMILIA,
  ejemploParaFamilia,
  prefijoDesdeNombre,
  quienUsaNombre,
  quienUsaPrefijo,
  type CategoriaExistente,
} from "./categoria-alta-reglas";

const cat = (id: string, nombre: string, prefijo: string | null, activo = true): CategoriaExistente => ({ id, nombre, prefijo, activo });

describe("ejemploParaFamilia", () => {
  it("cambia con la familia: Calzado no ofrece Kimonos", () => {
    expect(ejemploParaFamilia("indumentaria", [])).toEqual({ nombre: "Kimonos", prefijo: "KIM" });
    expect(ejemploParaFamilia("calzado", [])).toEqual({ nombre: "Botines", prefijo: "BOT" });
  });

  it("salta el ejemplo que ya existe, por nombre (sin tildes ni mayúsculas) o por prefijo, aunque esté desactivado", () => {
    expect(ejemploParaFamilia("calzado", [cat("1", "BOTINES", "XYZ")])).toEqual({ nombre: "Sandalias", prefijo: "SAN" });
    expect(ejemploParaFamilia("calzado", [cat("1", "Otra", "BOT", false)])).toEqual({ nombre: "Sandalias", prefijo: "SAN" });
  });

  it("una familia sin ejemplos, o con todos tomados, recibe el texto neutro", () => {
    expect(ejemploParaFamilia("mascotas", [])).toEqual(EJEMPLO_NEUTRO);
    const todas = EJEMPLOS_POR_FAMILIA.belleza.map((e, i) => cat(String(i), e.nombre, e.prefijo));
    expect(ejemploParaFamilia("belleza", todas)).toEqual(EJEMPLO_NEUTRO);
  });

  it("ningún ejemplo repite prefijo entre familias ni rompe el formato de la base", () => {
    const prefijos = Object.values(EJEMPLOS_POR_FAMILIA).flat().map((e) => e.prefijo);
    expect(new Set(prefijos).size).toBe(prefijos.length);
    for (const p of prefijos) expect(p).toMatch(/^[A-Z]{3}$/);
  });
});

describe("quienUsaPrefijo", () => {
  const lista = [cat("1", "Blusas", "BLU"), cat("2", "Polos", "POL", false)];

  it("encuentra al dueño, activo o desactivado", () => {
    expect(quienUsaPrefijo("BLU", lista, null)?.nombre).toBe("Blusas");
    expect(quienUsaPrefijo("pol", lista, null)?.nombre).toBe("Polos");
  });

  it("no avisa con menos de 3 letras ni contra la categoría que se está editando", () => {
    expect(quienUsaPrefijo("BL", lista, null)).toBeNull();
    expect(quienUsaPrefijo("BLU", lista, "1")).toBeNull();
    expect(quienUsaPrefijo("KIM", lista, null)).toBeNull();
  });
});

describe("quienUsaNombre", () => {
  it("usa el criterio de fn_clave_texto: tildes, mayúsculas y espacios no cuentan", () => {
    const lista = [cat("1", "Pañuelos", "PAN")];
    expect(claveNombre("  PANUELOS ")).toBe(claveNombre("Pañuelos"));
    expect(quienUsaNombre("pañuelos", lista, null)?.id).toBe("1");
    expect(quienUsaNombre("Pañuelos", lista, "1")).toBeNull();
    expect(quienUsaNombre("   ", lista, null)).toBeNull();
  });
});

describe("avisoChoque", () => {
  it("dice quién lo tiene y si está desactivada", () => {
    expect(avisoChoque("prefijo", cat("1", "Blusas", "BLU"))).toBe("Ya lo usa «Blusas»");
    expect(avisoChoque("nombre", cat("2", "Polos", "POL", false))).toBe("Ya existe «Polos» (desactivada)");
  });
});

describe("prefijoDesdeNombre", () => {
  it("propone las 3 primeras letras, sin tildes ni eñes", () => {
    expect(prefijoDesdeNombre("Ballerinas", [], null)).toBe("BAL");
    expect(prefijoDesdeNombre("  ñustas ", [], null)).toBe("NUS");
    expect(prefijoDesdeNombre("Túnicas", [], null)).toBe("TUN");
  });

  it("si las 3 primeras están tomadas (aunque sea por una desactivada), prueba iniciales y luego consonantes", () => {
    const tar = [cat("1", "Tarjetas", "TAR", false)];
    expect(prefijoDesdeNombre("Tarjetas de regalo", tar, null)).toBe("TDR");
    const bla = [cat("1", "Blanco", "BLA")];
    expect(prefijoDesdeNombre("Blazers", bla, null)).toBe("BLZ");
  });

  it("siempre empieza con la letra del nombre y nunca devuelve uno tomado", () => {
    const tomados = ["BLA", "BLZ", "BLR", "BLS"].map((p, i) => cat(String(i), p, p));
    const p = prefijoDesdeNombre("Blazers", tomados, null);
    expect(p).toMatch(/^B[A-Z]{2}$/);
    expect(tomados.map((c) => c.prefijo)).not.toContain(p);
  });

  it("no cuenta el prefijo de la categoría que se está editando", () => {
    expect(prefijoDesdeNombre("Blusas", [cat("1", "Blusas", "BLU")], "1")).toBe("BLU");
  });

  it("sin 3 letras no propone nada", () => {
    expect(prefijoDesdeNombre("Té", [], null)).toBeNull();
    expect(prefijoDesdeNombre("  12 ", [], null)).toBeNull();
  });

  it("si todo lo posible ya está tomado, devuelve null (la persona lo escribe)", () => {
    expect(prefijoDesdeNombre("Ana", [cat("1", "x", "ANA")], null)).toBeNull();
  });
});
