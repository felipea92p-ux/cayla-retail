import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Candado del orden de los colores (ADR-0312): la web NO ordena colores con la columna `colores.orden`. El orden sale del hex
// (`enLaCarta`, en `colores-familias.ts`): familia en espectro, gama y claridad OKLab. Un color creado desde Atributos entra con
// orden=2000 y, si una lista plana se pedía a la base con `.order("orden")`, quedaba al final aunque su tono fuera el de un
// rosado: el 2026-10-02 había cuatro cargadores así (Vender, Conteo, Nuevo producto y Editar producto).
//
// Contrato. PROMETE: que ningún archivo de `app/`, `components/` o `lib/` pide `colores` con `.order("orden")`.
// ASUME: la consulta es una cadena de PostgREST que empieza en `.from("colores")` y que otra tabla empieza en su propio
// `.from(`. NO PROMETE: ver una consulta armada por partes (guardar la cadena en una variable y ordenarla después), ni el
// `orden` de otras tablas (`familias.orden` existe y es legítimo). La columna sigue en la base: no se borra.

const PIDE_COLORES_POR_ORDEN = /\.from\("colores"\)(?:(?!\.from\()[\s\S])*?\.order\("orden"\)/g;

function lineasQueOrdenanColoresPorOrden(fuente: string): number[] {
  if (!fuente.includes('from("colores")')) return []; // el atajo barato
  return [...fuente.matchAll(PIDE_COLORES_POR_ORDEN)].map((m) => fuente.slice(0, m.index).split("\n").length);
}

describe("cómo se reconoce un `colores.order(\"orden\")`", () => {
  it("la cadena completa, aunque venga partida en líneas", () => {
    const fuente = `const a = 1;\nawait supabase\n  .from("colores")\n  .select("codigo, nombre")\n  .eq("activo", true)\n  .order("orden")\n  .order("nombre");`;
    expect(lineasQueOrdenanColoresPorOrden(fuente)).toEqual([3]);
  });

  it("ordenar colores por nombre está bien: lo que se prohíbe es depender de `orden`", () => {
    const fuente = `supabase.from("colores").select("codigo, nombre, hex").eq("activo", true).order("nombre"),`;
    expect(lineasQueOrdenanColoresPorOrden(fuente)).toEqual([]);
  });

  it("el `orden` de la tabla que viene después no se le atribuye a colores", () => {
    const fuente = `supabase.from("colores").select("codigo").eq("activo", true),\nsupabase.from("familias").select("codigo").order("orden"),`;
    expect(lineasQueOrdenanColoresPorOrden(fuente)).toEqual([]);
  });
});

// ───────────────────────────── El repo real ─────────────────────────────

const WEB = join(__dirname, "..");

function fuentesBajo(dir: string): string[] {
  return readdirSync(join(WEB, dir), { withFileTypes: true }).flatMap((e) => {
    const ruta = `${dir}/${e.name}`;
    if (e.isDirectory()) return e.name === "node_modules" ? [] : fuentesBajo(ruta);
    return /\.[jt]sx?$/.test(e.name) && !/\.test\.[jt]sx?$/.test(e.name) ? [ruta] : [];
  });
}

describe("la web no depende de `colores.orden`", () => {
  it("ningún archivo de app/, components/ o lib/ ordena colores con .order(\"orden\")", () => {
    const hallados = ["app", "components", "lib"]
      .flatMap(fuentesBajo)
      .flatMap((ruta) => lineasQueOrdenanColoresPorOrden(readFileSync(join(WEB, ruta), "utf8")).map((linea) => `${ruta}:${linea}`));
    expect(
      hallados,
      "Una lista de colores se ordena en código con `enLaCarta` (lib/colores-familias.ts), no con `colores.orden` (ADR-0312): " +
        "esa columna ya no decide nada y un color nuevo entra con orden=2000.",
    ).toEqual([]);
  });
});
