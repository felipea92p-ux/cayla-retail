import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Candado de ADR-0262: «cuánto hay» se lee de UNA sola fórmula de la base (`fn_existencias`, y las funciones que la
// usan: `fn_productos`, `fn_stock_por_sede`, `fn_existencias_productos`). Ninguna pantalla vuelve a sumar la tabla `stock`
// a su manera.
//
// Por qué existe: el 2026-09-28 Felipe vio la misma prenda con números distintos en el Catálogo y en Existencias. No
// faltaba ni sobraba ninguna unidad: había SEIS sumas de `stock`, cada pantalla con la suya (con o sin Cuarentena, con o
// sin apartadas, con o sin tallas retiradas y pruebas). Cada una había nacido como «una consulta rápida». Una regla que
// solo vive en un ADR se olvida en la siguiente pantalla; una que vive en una prueba no.
//
// Contrato. PROMETE: que ningún archivo de `app/`, `components/` o `lib/` lee la tabla `stock` (`.from("stock")`, o
// incrustada en un `select` como `stock ( cantidad … )`) salvo los de la lista LEGADO, cada uno con su porqué. Si un
// archivo de la lista deja de leerla, la prueba también falla: hay que sacarlo, para que la lista no mienta. NO PROMETE:
// ver una lectura armada con texto dinámico (`.from(nombre)`), ni una que llegue por otra vía (una vista, una función);
// esas pasan por la base, donde manda `fn_existencias`.

/** Quién puede leer `stock` directo todavía, y por qué. Achicar esta lista es la tarea #4 de ADR-0262; agrandarla, nunca. */
const LEGADO: Record<string, string> = {
  "lib/inventario-v2.ts":
    "Existencias y Vender: piso y almacén por sububicación con los datos de la prenda en una sola consulta. Ya aplica la regla (libre, sin Cuarentena, sin tallas retiradas, sin pruebas); pasa a fn_existencias en la tarea #4.",
  "lib/useStockEnVivo.ts":
    "Vender: relee cada 10 s, desde el navegador, lo cobrable de la sede (la misma regla que getDisponibleEnSede de inventario-v2); pasa a fn_existencias con ella.",
  "lib/conteos.ts": "Conteo: lo libre en el almacén por prenda, para ofrecer «Bajar al piso» después de contar el piso.",
  "lib/movimientos-v2.ts": "Movimientos: «Hoy en la sede» de una prenda en el detalle de un movimiento (físico, a propósito).",
  "lib/etiquetas-precio.ts": "Etiquetas de precio: cuántas imprimir = prendas físicas colgadas. Pendiente: sin Cuarentena.",
  "app/(app)/buscar/page.tsx": "Buscar: «en stock / agotada». Pendiente de pasar a fn_existencias (tarea #4): hoy suma Cuarentena.",
  "components/AjustarInventarioModal.tsx":
    "Ajustar: la cantidad actual de cada talla en la sububicación que se va a ajustar (físico). La valida la base (registrar_movimiento).",
};

const LEE_STOCK = [/\.from\(\s*["'`]stock["'`]\s*\)/, /(^|[\s,`"'(])stock(![a-z_]+)?\s*\(\s*(cantidad|ubicacion|variante|sububicacion|\*)/m];

/** ¿Este código lee la tabla `stock`? */
function leeStock(fuente: string): boolean {
  return LEE_STOCK.some((re) => re.test(fuente));
}

const RAIZ = join(__dirname, "..");

function archivos(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" || e.name.startsWith(".") ? [] : archivos(ruta);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.(ts|tsx)$/.test(e.name) ? [ruta] : [];
  });
}

describe("cómo se reconoce una lectura de `stock`", () => {
  it("`.from(\"stock\")`, con cualquier comilla y espacios", () => {
    expect(leeStock(`supabase.from("stock").select("cantidad")`)).toBe(true);
    expect(leeStock("supabase.from( 'stock' )")).toBe(true);
  });

  it("incrustada en un select", () => {
    expect(leeStock('.select("sku, stock ( cantidad, ubicacion_id )")')).toBe(true);
    expect(leeStock('.select("id, stock!inner(cantidad)")')).toBe(true);
  });

  it("la palabra en un texto, un comentario u otra tabla no cuenta", () => {
    expect(leeStock('const t = "Sin stock (0)"; // stock total')).toBe(false);
    expect(leeStock('supabase.from("stock_minimo")')).toBe(false);
    expect(leeStock('supabase.rpc("fn_existencias", { p_ubicacion_id })')).toBe(false);
  });
});

describe("ADR-0262: ninguna pantalla nueva suma `stock` por su cuenta", () => {
  const encontrados = ["app", "components", "lib"]
    .flatMap((d) => archivos(join(RAIZ, d)))
    .filter((ruta) => leeStock(readFileSync(ruta, "utf8")))
    .map((ruta) => relative(RAIZ, ruta).split("\\").join("/"))
    .sort();

  it("solo los de la lista de legado leen `stock` directo (lo nuevo lee fn_existencias)", () => {
    expect(encontrados.filter((r) => !(r in LEGADO))).toEqual([]);
  });

  it("todos los de la lista siguen leyéndola (si uno dejó de hacerlo, se saca de la lista)", () => {
    expect(Object.keys(LEGADO).filter((r) => !encontrados.includes(r)).sort()).toEqual([]);
  });
});
