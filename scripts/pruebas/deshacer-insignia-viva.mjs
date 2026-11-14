/**
 * Deshacer 20261114130000 (una oferta no llega a las prendas de una insignia desactivada, ADR-0655) dentro de una transacción de prueba.
 *
 * POR QUÉ. Esa migración cambia líneas de `fn_campanas_en_sede`, `fn_oferta_alcanza_variante_con_insignias` y
 * `fn_variantes_de_oferta_con_insignias` que 20261114060000 (las ofertas por insignia) usa para saber si ya se pegó. Una prueba que vuelve a
 * pegar 20261114060000 sobre una base que ya tiene 20261114130000 (el CI) se detendría con «el ancla aparece 0 veces». Como
 * DESHACER_POSTERIORES en las suites de la venta: se deshace la de después, se pega la de antes y se vuelve a pegar la de después.
 *
 * Lee los reemplazos del propio archivo de la migración, así que no hay una segunda copia que se desactualice. Nunca se commitea:
 * va dentro del `begin … rollback` de cada caso.
 */

import { readFileSync } from "node:fs";

export const INSIGNIA_VIVA = "supabase/migrations/20261114130000_oferta_no_llega_por_insignia_desactivada.sql";

/** El SQL que devuelve cada función a como estaba antes de 20261114130000 (si ya lo tiene; si no, no hace nada). */
export function deshacerInsigniaViva() {
  const sql = readFileSync(INSIGNIA_VIVA, "utf8");
  const pares = [...sql.matchAll(/select pg_temp\.reemplazar_insignia_viva\(\s*'([^']+)',\s*\$v\$([\s\S]*?)\$v\$,\s*\$n\$([\s\S]*?)\$n\$/g)];
  if (pares.length !== 6) throw new Error(`Se esperaban 6 reemplazos en ${INSIGNIA_VIVA} y se leyeron ${pares.length}: revisa esta ayuda.`);
  return pares
    .map(
      ([, firma, viejo, nuevo]) => `do $d$ declare d text := pg_get_functiondef('${firma}'::regprocedure); begin
  if position($n$${nuevo}$n$ in d) > 0 then execute replace(d, $n$${nuevo}$n$, $v$${viejo}$v$); end if; end $d$;`,
    )
    .join("\n");
}

/** La migración tal cual, para volver a pegarla después de deshacerla. */
export const pegarInsigniaViva = () => readFileSync(INSIGNIA_VIVA, "utf8");
