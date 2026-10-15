import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Candado de la migración 20261013161000 (Felipe 2026-10-13, auditoría punto 18): la tabla `proveedores` ya no entrega a las
// cuentas el banco, la cuenta, el CCI, el Yape ni el titular (permiso por columna). Una consulta que los pida directo —o que
// pida `*`— se cae entera con «permission denied», para todos, líder incluido, y TypeScript no lo ve (los tipos generados
// siguen listando esas columnas). Se leen con `fn_proveedor_datos_bancarios` o `fn_proveedores`.
//
// PROMETE: falla si un archivo de `app/`, `components/` o `lib/` pide esas columnas o `*` en una consulta a `proveedores` (directa
// o incrustada) fuera de la lista PERMITIDOS. NO PROMETE: ver una consulta armada con texto dinámico.

/** Quién puede todavía, y por qué. */
const PERMITIDOS: Record<string, number> = {
  // El respaldo de `getProveedor` mientras la función no exista en la base (PGRST202): con la migración pegada no se usa.
  "lib/proveedores.ts": 1,
};

const BANCARIAS = /\b(banco|cuenta_bancaria|cci|celular_billetera|billeteras|titular_cuenta)\b|\*/;
const RAIZ = join(__dirname, "..");

function archivos(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" || e.name.startsWith(".") ? [] : archivos(ruta);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.(ts|tsx)$/.test(e.name) ? [ruta] : [];
  });
}

/** Cuántas consultas a `proveedores` de este código piden columnas bancarias o `*`. */
function lecturasBancarias(fuente: string): number {
  let n = 0;
  // Directa: .from("proveedores") … .select("…")
  for (const m of fuente.matchAll(/\.from\(\s*["'`]proveedores["'`]\s*\)\s*\.select\(\s*["'`]([^"'`]*)["'`]/g)) if (BANCARIAS.test(m[1])) n++;
  // Incrustada: proveedor:proveedores ( … ) o proveedores!x ( … )
  // (solo nombres de columna, comas y espacios dentro del paréntesis: un comentario «sus proveedores (ADR-0109…)» no cuenta)
  for (const m of fuente.matchAll(/(?:^|[\s,("'`:])proveedores(?:![a-z_]+)?\s*\(([a-z_,\s*]*)\)/g)) if (BANCARIAS.test(m[1])) n++;
  return n;
}

describe("cómo se reconoce una lectura bancaria de proveedores", () => {
  it("directa con columnas bancarias o *", () => {
    expect(lecturasBancarias('supabase.from("proveedores").select("id, cci")')).toBe(1);
    expect(lecturasBancarias("supabase.from('proveedores').select('*')")).toBe(1);
  });
  it("incrustada", () => {
    expect(lecturasBancarias('.select("id, proveedor:proveedores ( nombre, titular_cuenta )")')).toBe(1);
  });
  it("nombre, RUC o rubros no cuentan; otra tabla tampoco", () => {
    expect(lecturasBancarias('supabase.from("proveedores").select("id, nombre, ruc, rubros")')).toBe(0);
    expect(lecturasBancarias('.select("proveedor:proveedores ( nombre )")')).toBe(0);
    expect(lecturasBancarias('supabase.from("cuentas_dinero").select("banco")')).toBe(0);
    expect(lecturasBancarias("/** Marcas y sus proveedores (ADR-0109, `retail.marcas` +\n * marca_proveedores) */")).toBe(0);
  });
});

describe("nadie lee de la tabla los datos bancarios de un proveedor (20261013161000)", () => {
  const conteos = Object.fromEntries(
    ["app", "components", "lib"]
      .flatMap((d) => archivos(join(RAIZ, d)))
      .map((ruta) => [relative(RAIZ, ruta).split("\\").join("/"), lecturasBancarias(readFileSync(ruta, "utf8"))] as const)
      .filter(([, n]) => n > 0)
  );

  it("solo los permitidos, y no más de lo permitido", () => {
    const excedidos = Object.entries(conteos).filter(([r, n]) => n > (PERMITIDOS[r] ?? 0));
    expect(excedidos, "Lee los datos bancarios con fn_proveedor_datos_bancarios o fn_proveedores").toEqual([]);
  });

  it("la lista de permitidos no miente (si uno ya no lee, se saca)", () => {
    expect(Object.keys(PERMITIDOS).filter((r) => (conteos[r] ?? 0) < PERMITIDOS[r])).toEqual([]);
  });
});
