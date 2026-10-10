// Las pruebas que vuelven a pegar una migración VIEJA de `registrar_venta` (el redondeo, 20261003130000) o que comparan su huella
// exacta con la que esa migración prometió, corren sobre una base donde después se aplicó el precio por sede (20261010100200,
// ADR-0370), que cambió una línea de la función. El candado de huella de la migración vieja la rechaza, y está bien que lo haga.
//
// Para probar la migración vieja sobre SU punto de partida, este texto devuelve la función a como estaba antes del precio por sede.
// SOLO va dentro de una transacción que se deshace, o seguido de `REHACER_PRECIO_SEDE` (el archivo de la migración, re-ejecutable),
// para que la base termine igual que empezó.
import { readFileSync } from "node:fs";

export const DESHACER_PRECIO_SEDE = `do $deshacer$
declare
  v_firma text := (select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'retail' and p.proname = 'registrar_venta');
begin
  execute replace(pg_get_functiondef(v_firma::regprocedure),
    'retail.fn_precio_en_sede(v.id, p_ubicacion_id), p.referencia, coalesce(v.codigo, v.sku, ''sin código'')',
    'v.precio, p.referencia, coalesce(v.codigo, v.sku, ''sin código'')');
end $deshacer$;
`;

export const REHACER_PRECIO_SEDE = readFileSync("supabase/migrations/20261010100200_venta_cobra_precio_de_sede.sql", "utf8");
