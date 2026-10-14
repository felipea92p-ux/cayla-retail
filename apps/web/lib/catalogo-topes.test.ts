import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_DESCRIPCION_PRODUCTO, MAX_NOMBRE_CATALOGO, MAX_NOMBRE_MARCA, MAX_NOMBRE_PRODUCTO } from "./catalogo-topes";
import { MAX_NOMBRE_MODELO } from "./modelo-nuevo-reglas";

const MIG = readFileSync(join(__dirname, "../../../supabase/migrations/20261014182000_catalogo_montos_finitos_y_textos_con_tope.sql"), "utf8");
const tope = (tabla: string, columna: string) => Number(MIG.match(new RegExp(`candado\\('${tabla}'[^;]*char_length\\(${columna}\\) <= (\\d+)`))?.[1]);

describe("los topes del catálogo son los de la base (ADR-0405)", () => {
  it("producto, descripción, marca, categoría, color y familia", () => {
    expect(tope("productos", "referencia")).toBe(MAX_NOMBRE_PRODUCTO);
    expect(tope("productos", "descripcion")).toBe(MAX_DESCRIPCION_PRODUCTO);
    expect(tope("marcas", "nombre")).toBe(MAX_NOMBRE_MARCA);
    for (const t of ["categorias", "colores", "familias"]) expect(tope(t, "nombre")).toBe(MAX_NOMBRE_CATALOGO);
  });
  it("el nombre de un modelo nuevo de Producción (que crea un producto) cabe en el del producto", () => {
    expect(MAX_NOMBRE_MODELO).toBeLessThanOrEqual(MAX_NOMBRE_PRODUCTO);
  });
});
