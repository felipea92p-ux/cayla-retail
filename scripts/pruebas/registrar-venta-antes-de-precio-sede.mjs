// Las pruebas que vuelven a pegar una migración VIEJA de `registrar_venta` (el redondeo, 20261003130000) o que comparan su huella
// exacta con la que esa migración prometió, corren sobre una base donde después se aplicó el precio por sede (20261010100200,
// ADR-0370), que cambió una línea de la función. El candado de huella de la migración vieja la rechaza, y está bien que lo haga.
//
// Lo mismo con las piezas de liquidación (20261010195000, ADR-0375), que se aplicaron DESPUÉS y le hacen dos reemplazos anclados más: se
// deshacen primero (en orden inverso) y se rehacen al final.
//
// Para probar la migración vieja sobre SU punto de partida, este texto devuelve la función a como estaba antes del precio por sede.
// SOLO va dentro de una transacción que se deshace, o seguido de `REHACER_PRECIO_SEDE` (el archivo de la migración, re-ejecutable),
// para que la base termine igual que empezó.
import { readFileSync } from "node:fs";

// Los dos reemplazos de liquidación (9a y 9b), leídos del archivo para no copiarlos: [viejo, nuevo] en el orden en que se aplican.
const LIQUIDACION = readFileSync("supabase/migrations/20261010195000_piezas_de_liquidacion.sql", "utf8");
const REEMPLAZOS_LIQUIDACION = [...LIQUIDACION.matchAll(/\$v\$([\s\S]*?)\$v\$,\s*\$v\$([\s\S]*?)\$v\$,\s*1\);/g)].map((m) => [m[1], m[2]]);
if (REEMPLAZOS_LIQUIDACION.length !== 2) throw new Error("registrar-venta-antes-de-precio-sede: no encontré los dos reemplazos de liquidación");
const literal = (t) => `$q$${t}$q$`;
/** Deshace los dos reemplazos de liquidación, del último al primero. Si la base no los tiene (aún sin la migración), no cambia nada. */
const DESHACER_LIQUIDACION = [...REEMPLAZOS_LIQUIDACION]
  .reverse()
  .map(([viejo, nuevo]) => `  execute replace(pg_get_functiondef(v_firma::regprocedure), ${literal(nuevo)}, ${literal(viejo)});`)
  .join("\n");

export const DESHACER_PRECIO_SEDE = `do $deshacer$
declare
  v_firma text := (select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'retail' and p.proname = 'registrar_venta');
begin
${DESHACER_LIQUIDACION}
  execute replace(pg_get_functiondef(v_firma::regprocedure),
    'retail.fn_precio_en_sede(v.id, p_ubicacion_id), p.referencia, coalesce(v.codigo, v.sku, ''sin código'')',
    'v.precio, p.referencia, coalesce(v.codigo, v.sku, ''sin código'')');
end $deshacer$;
`;

// Rehacer: el precio por sede (su archivo, re-ejecutable) y DESPUÉS solo los dos reemplazos de liquidación (no la migración entera, que
// volvería a crear la `crear_pieza_liquidacion` de tres parámetros junto a la de cinco).
const REHACER_LIQUIDACION = LIQUIDACION.slice(
  LIQUIDACION.indexOf("create or replace function pg_temp.reemplazar"),
  LIQUIDACION.indexOf("-- ---------- 10."),
);
export const REHACER_PRECIO_SEDE = `${readFileSync("supabase/migrations/20261010100200_venta_cobra_precio_de_sede.sql", "utf8")}
${REHACER_LIQUIDACION}`;
