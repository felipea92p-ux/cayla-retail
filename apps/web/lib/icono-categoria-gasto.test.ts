import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ICONO_DE_CATEGORIA, iconoDeCategoria } from "./icono-categoria-gasto";

// Las categorías de gasto que crean las migraciones: `insert into retail.categorias_gasto (codigo, …) values ('agua', …), (…)` o
// `… select 'limpieza', …` (el código va primero en todas). Se lee hasta el `on conflict` / `where` de cada una.
const MIGRACIONES = join(__dirname, "..", "..", "..", "supabase", "migrations");
function categoriasDeLasMigraciones(): string[] {
  const codigos = new Set<string>();
  for (const f of readdirSync(MIGRACIONES).filter((x) => x.endsWith(".sql"))) {
    const sql = readFileSync(join(MIGRACIONES, f), "utf8");
    for (const bloque of sql.matchAll(/insert into (?:retail\.)?categorias_gasto\s*\(\s*codigo\b[^)]*\)([\s\S]*?);/gi)) {
      const filas = bloque[1]!.split(/\bon conflict\b|\bwhere\b/i)[0]!;
      for (const valor of filas.matchAll(/(?:\(|\bselect)\s*'([a-z_]+)'/gi)) codigos.add(valor[1]!);
    }
  }
  return [...codigos].sort();
}

describe("iconoDeCategoria", () => {
  it("cada categoría que crean las migraciones tiene su ícono (no el recibo de respaldo)", () => {
    expect(categoriasDeLasMigraciones().length).toBeGreaterThanOrEqual(15);
    const sinIcono = categoriasDeLasMigraciones().filter((c) => iconoDeCategoria(c) === "recibo");
    expect(sinIcono).toEqual([]);
  });

  it("dos categorías no comparten dibujo: el ícono tiene que distinguirlas", () => {
    const dibujos = Object.values(ICONO_DE_CATEGORIA);
    expect(new Set(dibujos).size).toBe(dibujos.length);
  });

  it("una categoría creada sin deploy, o sin código, cae al recibo y nunca al de otra", () => {
    expect(iconoDeCategoria("cafeteria_nueva")).toBe("recibo");
    expect(iconoDeCategoria(null)).toBe("recibo");
    expect(iconoDeCategoria("")).toBe("recibo");
  });
});
