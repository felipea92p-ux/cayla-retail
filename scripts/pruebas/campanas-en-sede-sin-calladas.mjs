/**
 * El inverso de 20261116175000 (las cesiones «de una vez» en `fn_campanas_en_sede`), para las suites que vuelven a pegar migraciones
 * VIEJAS que anclan el bloque prenda por prenda (20261113223000): sin esto, sobre una base con 175000 su ancla ya no está y el reemplazo
 * falla. Se arma leyendo los dos reemplazos de la propia migración y cambiando cada uno de lado, en orden inverso.
 */
import { readFileSync } from "node:fs";

const MIGRACION = "supabase/migrations/20261116175000_campanas_en_sede_cesiones_de_una_vez.sql";

/** El SQL que deja `fn_campanas_en_sede` como antes de 20261116175000 (no hace nada si la base no la tiene). */
export function deshacerCalladas() {
  const texto = readFileSync(MIGRACION, "utf8");
  const pares = [...texto.matchAll(/\$v\$([\s\S]*?)\$v\$,\s*\$n\$([\s\S]*?)\$n\$/g)].map((m) => ({ viejo: m[1], nuevo: m[2] }));
  if (pares.length !== 2) throw new Error(`${MIGRACION}: se esperaban 2 reemplazos y hay ${pares.length}`);
  const firma = "retail.fn_campanas_en_sede(date, integer, uuid[], uuid)";
  // Solo si la base la tiene; primero la condición (que usa `calladas`), después el conjunto.
  return [
    "do $deshacer$",
    "declare",
    `  v_def text := pg_get_functiondef('${firma}'::regprocedure);`,
    "begin",
    "  if position('calladas' in v_def) = 0 then",
    "    return;",
    "  end if;",
    `  v_def := replace(v_def, $n1$${pares[1].nuevo}$n1$, $v1$${pares[1].viejo}$v1$);`,
    `  v_def := replace(v_def, $n0$${pares[0].nuevo}$n0$, $v0$${pares[0].viejo}$v0$);`,
    "  execute v_def;",
    "end",
    "$deshacer$;",
  ].join("\n");
}
