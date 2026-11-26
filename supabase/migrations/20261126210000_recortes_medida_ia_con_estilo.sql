-- 20261126210000_recortes_medida_ia_con_estilo.sql — CAYLA V2 · «Arma el tuyo»: la IA dice también el ESTILO de cada recorte (ADR-0705, act. 2026-11-26)
--
-- PROBLEMA: «Sorpréndeme» elige prendas solo por su color (los que dice Colores ▸ «combina con») y por tener foto propia: puede juntar una
--   blusa de fiesta con un jean deportivo (Felipe, 2026-11-26, «¿en qué se basan las combinaciones?»).
-- DECIDÍ: la misma pregunta que ya mide las axilas (`GET /api/fotos/medir-recortes`) pide además el estilo (basico, casual, oficina, fiesta,
--   deportivo) y queda en `medida_ia.estilo`; la tienda junta prendas del mismo estilo («basico» va con todas). Casi sin costo: es la
--   misma llamada.
--
-- QUÉ HACE: `retail.recortes_sin_medida_ia` también devuelve los recortes medidos ANTES de que se preguntara el estilo (medida vigente, sin
--   `estilo` y que no es un fallo), detrás de los que no tienen ninguna medida: se vuelven a preguntar solos, una vez. Nada más cambia:
--   `anotar_medida_ia` guarda la medida entera (el estilo entra sin tocarla) y `tienda_probador` ya la entrega.
--
-- SE DEGRADA ASÍ: un recorte sin estilo se trata como «combina con todo» en la tienda; la prenda sigue igual.
--
-- PRODUCCIÓN: una parte, re-ejecutable (create or replace de una función de solo lectura, sin tablas).

set lock_timeout = '3s';
set search_path = retail, public, extensions;

create or replace function retail.recortes_sin_medida_ia(p_limite integer default 20)
returns table (foto text, recorte text)
language sql
stable
security definer
set search_path = retail, public
as $$
  select r.foto, r.recorte
    from retail.foto_recortes r
   where r.estado in ('listo', 'por_revisar')
     and (r.medida_ia is null
          or r.medida_ia ->> 'recorte' is distinct from r.recorte
          -- Medida de antes de que se preguntara el estilo (2026-11-26): se vuelve a preguntar una vez.
          or (r.medida_ia ->> 'estilo' is null and not coalesce((r.medida_ia ->> 'fallo')::boolean, false)))
   -- Primero lo que no tiene ninguna medida (lo que cambia la figura), después lo que solo le falta el estilo.
   order by (r.medida_ia is null or r.medida_ia ->> 'recorte' is distinct from r.recorte) desc,
            (r.estado = 'listo') desc, r.actualizado_en desc nulls last, r.foto
   limit greatest(1, least(coalesce(p_limite, 20), 100));
$$;

comment on function retail.recortes_sin_medida_ia(integer) is
  'ADR-0705: los recortes (listos primero) cuya medida de la IA falta, es de otro recorte o no trae el estilo. Solo el servidor (cron /api/fotos/medir-recortes).';
revoke all on function retail.recortes_sin_medida_ia(integer) from public, anon, authenticated;
grant execute on function retail.recortes_sin_medida_ia(integer) to service_role;
