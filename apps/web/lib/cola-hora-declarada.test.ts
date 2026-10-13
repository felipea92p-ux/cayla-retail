import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Candado de la auditoría del 2026-10-13 (punto 17, migración 20261013155000): la base acepta la hora declarada (`x-momento`)
// SOLO en las funciones que la web encola sin conexión; en las demás firma quien está de turno ahora. La lista vive en SQL
// (`fn_actor_persona_id`) y las colas viven en la web: si alguien encola una función nueva y no la suma a la lista, al volver el
// internet la base mira la asistencia de AHORA y rechaza lo hecho por quien ya marcó su salida. Pasó en la primera versión de la
// migración: olvidó `recibir_lote` y `recibir_envio`, que la cola genérica también firma con la hora (`nuevaOperacion`).
//
// PROMETE: falla si una función que la web encola (las de `RPCS_*`, las que se pasan a `nuevaOperacion({ rpc })` y la venta sin
// conexión) no está en la lista de la última migración que parcha `fn_actor_persona_id` con `request.path`. NO PROMETE: ver una
// cola armada con un nombre dinámico.

const WEB = join(__dirname, "..");
const MIGRACIONES = join(WEB, "..", "..", "supabase", "migrations");

function archivos(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" || e.name.startsWith(".") ? [] : archivos(ruta);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.(ts|tsx)$/.test(e.name) ? [ruta] : [];
  });
}

/** Las funciones que la web encola sin conexión. */
function encoladas(): string[] {
  const nombres = new Set<string>(["registrar_venta"]); // la venta sin conexión tiene su propia cola (`lib/ventas-offline.ts`)
  for (const ruta of ["app", "components", "lib"].flatMap((d) => archivos(join(WEB, d)))) {
    const fuente = readFileSync(ruta, "utf8");
    for (const m of fuente.matchAll(/export const RPCS_\w+\s*=\s*\[([^\]]*)\]/g)) for (const n of m[1].matchAll(/"([a-z_]+)"/g)) nombres.add(n[1]);
    for (const m of fuente.matchAll(/nuevaOperacion\(\{[\s\S]{0,400}?rpc:\s*"([a-z_]+)"/g)) nombres.add(m[1]);
  }
  return [...nombres].sort();
}

/** La lista de la última migración que decide, por `request.path`, dónde vale la hora declarada. */
function listaDeLaBase(): { archivo: string; funciones: string[] } {
  const candidatas = readdirSync(MIGRACIONES)
    .filter((f) => /^\d{14}_.*\.sql$/.test(f))
    .sort()
    .filter((f) => {
      const sql = readFileSync(join(MIGRACIONES, f), "utf8");
      return sql.includes("fn_actor_persona_id") && /request\.path/.test(sql) && /\/rpc\/\(/.test(sql);
    });
  const archivo = candidatas.at(-1);
  if (!archivo) return { archivo: "(ninguna)", funciones: [] };
  const lista = readFileSync(join(MIGRACIONES, archivo), "utf8").match(/\/rpc\/\(([a-z_|]+)\)/);
  return { archivo, funciones: lista ? lista[1].split("|").sort() : [] };
}

describe("la hora declarada vale en todo lo que la web encola sin conexión (auditoría 2026-10-13, punto 17)", () => {
  it("encuentra las colas de la web (si esto falla, cambió cómo se encola y la prueba ya no mira nada)", () => {
    expect(encoladas()).toEqual(expect.arrayContaining(["registrar_venta", "recibir_lote", "recibir_envio", "crear_producto_con_stock_inicial"]));
  });

  it("toda función encolada está en la lista de fn_actor_persona_id", () => {
    const { archivo, funciones } = listaDeLaBase();
    const faltan = encoladas().filter((f) => !funciones.includes(f));
    expect(faltan, `Falta en ${archivo}: súmalas a la lista de request.path de fn_actor_persona_id`).toEqual([]);
  });
});
