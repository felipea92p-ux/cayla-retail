import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// La pila local del proyecto de clientes (`apps/tienda/supabase/`) se levanta con `pnpm --filter tienda pila`. Sus scripts fijan la CLI de
// Supabase a la MISMA versión que el CI: con `npx supabase` a secas cada máquina usaba la que tuviera guardada, y la 2.109 leía las rutas
// de los avisos (`auth.email.notification.*.content_path`) desde `supabase/` y no desde la raíz, así que la pila no arrancaba (lo arregló
// la 2.115, cambio #6160, 2026-08-18). Visto el 2026-10-17.
const TIENDA = resolve(__dirname, "..");
const RAIZ = resolve(TIENDA, "..", "..");

const scripts: Record<string, string> = JSON.parse(readFileSync(join(TIENDA, "package.json"), "utf8")).scripts;
const delCi = readFileSync(join(RAIZ, ".github/workflows/ci.yml"), "utf8").match(/SUPABASE_CLI:\s*supabase@(\d+\.\d+\.\d+)/)?.[1];
const version = (texto: string) => texto.match(/supabase@(\d+\.\d+\.\d+)/)?.[1];
const numero = (v: string) => v.split(".").reduce((total, parte) => total * 1000 + Number(parte), 0);

describe("la pila local de clientes", () => {
  const dePila = Object.entries(scripts).filter(([nombre]) => nombre === "pila" || nombre.startsWith("pila:"));

  it("tiene sus scripts: levantar, parar y ver las llaves", () => {
    expect(dePila.map(([nombre]) => nombre).sort()).toEqual(["pila", "pila:llaves", "pila:parar"]);
  });

  it("todos usan la versión de la CLI del CI (para subirla, se cambian los dos en el mismo PR)", () => {
    expect(delCi).toBeDefined();
    for (const [nombre, comando] of dePila) expect([nombre, version(comando)]).toEqual([nombre, delCi]);
  });

  it("la versión resuelve las rutas de las plantillas y de los avisos desde la raíz (2.115 o más nueva)", () => {
    expect(numero(delCi!)).toBeGreaterThanOrEqual(numero("2.115.0"));
    const config = readFileSync(join(TIENDA, "supabase/config.toml"), "utf8");
    const rutas = [...config.matchAll(/^content_path = "(.+)"/gm)].map((m) => m[1]);
    expect(rutas.length).toBeGreaterThan(0);
    for (const ruta of rutas) expect(ruta).toMatch(/^\.\/supabase\/plantillas\/[\w-]+\.html$/);
  });

  it("el README no manda a usar `npx supabase` sin versión para la pila", () => {
    const readme = readFileSync(join(TIENDA, "README.md"), "utf8");
    expect(readme).not.toMatch(/npx supabase (start|stop|status) --workdir apps\/tienda/);
    expect(readme).toContain("pnpm --filter tienda pila");
  });
});
