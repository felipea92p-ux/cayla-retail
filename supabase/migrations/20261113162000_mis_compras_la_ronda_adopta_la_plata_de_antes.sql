-- ============================================================================
-- Mis compras · la plata que Compras manda ANTES de que la compradora abra su ronda es de la ronda que abre (Felipe 2026-11-13, decisión C de
-- la auditoría de Mis compras y Recibir del 2026-11-12; ADR-0480 act. 2026-11-13).
--
-- EL PROBLEMA PRIMERO. El lunes la compradora cierra RC-1. El martes Compras le manda S/ 500 por Yape y ella lo anota («Me dieron plata» no
-- exige ronda abierta: Compras a veces manda la plata antes, 20261023183000). El miércoles abre RC-2 para salir a comprar. Esa plata quedó
-- SIN ronda (el disparador solo pone la ronda abierta en el momento de anotar), así que:
--   · la lista «En esta ronda» la muestra (`movimientosDeLaCompradora` cuenta lo sin ronda anotado después del último cierre),
--   · pero «Te dieron» (`fn_ronda_compras_de`, `fn_ronda_compras_cuenta`) suma solo la plata CON esa ronda: dice S/ 0 y la billetera explica
--     «Incluye S/ 500 que ya tenías al abrir tu ronda»,
--   · y el cierre que ve Compras dice «Tenías al abrirla S/ 500 · Te dieron S/ 0»: no distingue lo que sobró del viaje anterior de lo que se
--     mandó para este. Lo que tiene para gastar siempre estuvo bien (sale del saldo del fondo); lo que estaba mal es de qué ronda es.
--
-- QUÉ HACE.
--   1. `abrir_ronda_compras()`, al abrir una ronda NUEVA (no al devolver la que ya estaba abierta), le pone su `ronda_id` a la plata de esa
--      persona que está sin ronda y que se anotó DESPUÉS de su última ronda cerrada. Solo la plata que le dieron: «Ya tenía plata» (su saldo
--      inicial) es de antes por definición y no se toca. Sin ninguna ronda cerrada antes no adopta nada: lo anotado antes de las rondas sigue
--      siendo de antes (regla de 20261023183000, «no se inventan rondas viejas»), igual que la pantalla lo pone abajo.
--   2. Los dos candados de la plata anotada suman UNA excepción, la misma: pasar de sin ronda a una ronda, solo dentro de la transacción de
--      `abrir_ronda_compras`, solo a la ronda que esa transacción abre (`retail.ronda_adopta`, configuración local) y sin cambiar nada más de
--      la fila. `fn_ronda_id_fija()` («de qué ronda es no cambia») se reescribe entera; `fn_fondo_plata_anotada_inmutable()` («solo cambia al
--      confirmarla, una vez», 20261026170000) se parcha con un reemplazo anclado. Cambiar una ronda puesta sigue prohibido, nadie más adopta.
--   3. Las rondas que hoy están ABIERTAS en producción adoptan lo mismo una sola vez (la plata sin ronda anotada entre su ronda cerrada anterior
--      y su apertura). Las cerradas no se tocan: su cierre ya se hizo con la cuenta de entonces.
--
-- Concurrencia: `abrir_ronda_compras` y «Me dieron plata» toman el mismo candado (`compra_ronda:<persona>`, H11 de 20261027231000): una
-- plata anotada a la vez que se abre la ronda o entra antes (y la adopta) o después (y el disparador ya le pone la ronda). No hay hueco.
--
-- Solo funciones y un UPDATE acotado; sin políticas, sin `drop trigger`, sin `alter table` (ADR-0195). Idempotente: el reemplazo anclado no
-- hace nada si ya está, y el UPDATE de las abiertas solo toca filas sin ronda. Se pega entera, sola.
-- ============================================================================
set lock_timeout = '3s';
set search_path = retail, public, extensions;

create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------- 2. «De qué ronda es no cambia», salvo la adopción al abrir ----------
create or replace function retail.fn_ronda_id_fija()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  if new.ronda_id is distinct from old.ronda_id then
    -- La única excepción (20261113162000): la plata sin ronda que adopta la ronda que se está abriendo, dentro de `abrir_ronda_compras`.
    if tg_table_name = 'fondo_plata_anotada'
       and old.ronda_id is null
       and new.ronda_id is not null
       and coalesce(current_setting('retail.ronda_adopta', true), '') = new.ronda_id::text then
      return new;
    end if;
    raise exception 'De qué ronda es no cambia.' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function retail.fn_ronda_id_fija() from public, anon, authenticated;

-- La plata anotada solo cambia al confirmarla (20261022235000, 20261026170000)… o al adoptarla la ronda que se abre, sin tocar nada más.
select pg_temp.reemplazar('retail.fn_fondo_plata_anotada_inmutable()',
$v$    raise exception 'La plata anotada no se borra.' using errcode = 'P0001';
  end if;$v$,
$n$    raise exception 'La plata anotada no se borra.' using errcode = 'P0001';
  end if;
  -- 20261113162000: la ronda que se abre adopta la plata sin ronda; solo cambia `ronda_id`, y solo a la ronda que `abrir_ronda_compras` abre.
  if old.ronda_id is null and new.ronda_id is not null
     and coalesce(current_setting('retail.ronda_adopta', true), '') = new.ronda_id::text
     and (to_jsonb(new) - 'ronda_id') = (to_jsonb(old) - 'ronda_id') then
    return new;
  end if;$n$,
1);

-- ---------- 1. Abrir una ronda nueva adopta la plata que llegó antes ----------
select pg_temp.reemplazar('retail.abrir_ronda_compras()',
$v$    returning id, numero, abierta_en into v_id, v_numero, v_abierta;$v$,
$n$    returning id, numero, abierta_en into v_id, v_numero, v_abierta;
    -- La plata que Compras mandó antes de abrir (después de cerrar la anterior) es de ESTA ronda (20261113162000, Felipe 2026-11-13).
    -- Sin ronda cerrada antes, nada: lo de antes de las rondas sigue siendo de antes. «Ya tenía plata» nunca: es el saldo inicial.
    perform set_config('retail.ronda_adopta', v_id::text, true);
    update retail.fondo_plata_anotada a
       set ronda_id = v_id
     where a.persona_id = v_actor
       and a.ronda_id is null
       and a.medio <> 'ya_tenia'
       and a.created_at > (select max(r.cerrada_en) from retail.compra_rondas r
                            where r.persona_id = v_actor and r.cerrada_en is not null and r.id <> v_id);
    perform set_config('retail.ronda_adopta', '', true);$n$,
1);

-- ---------- 3. Las rondas abiertas hoy adoptan lo mismo, una sola vez ----------
-- Por cada ronda abierta: la plata sin ronda de su dueña anotada entre su última ronda cerrada (antes de abrir esta) y la apertura. La
-- configuración se pone por ronda, para que el disparador deje pasar exactamente esa adopción.
do $$
declare
  v_ronda record;
  v_n integer;
  v_total integer := 0;
begin
  for v_ronda in
    select r.id, r.persona_id, r.abierta_en,
           (select max(c.cerrada_en) from retail.compra_rondas c
             where c.persona_id = r.persona_id and c.cerrada_en is not null and c.cerrada_en <= r.abierta_en) as desde
      from retail.compra_rondas r
     where r.cerrada_en is null
  loop
    continue when v_ronda.desde is null;
    perform set_config('retail.ronda_adopta', v_ronda.id::text, true);
    update retail.fondo_plata_anotada a
       set ronda_id = v_ronda.id
     where a.persona_id = v_ronda.persona_id
       and a.ronda_id is null
       and a.medio <> 'ya_tenia'
       and a.created_at > v_ronda.desde
       and a.created_at <= v_ronda.abierta_en;
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
  end loop;
  perform set_config('retail.ronda_adopta', '', true);
  raise notice 'Plata adoptada por las rondas abiertas: % fila(s).', v_total;
end $$;

-- ---------- Comprobación ----------
do $$
begin
  if position('retail.ronda_adopta' in pg_get_functiondef('retail.abrir_ronda_compras()'::regprocedure)) = 0 then
    raise exception 'abrir_ronda_compras no quedó con la adopción';
  end if;
  if position('retail.ronda_adopta' in pg_get_functiondef('retail.fn_ronda_id_fija()'::regprocedure)) = 0 then
    raise exception 'fn_ronda_id_fija no quedó con su excepción';
  end if;
  if position('retail.ronda_adopta' in pg_get_functiondef('retail.fn_fondo_plata_anotada_inmutable()'::regprocedure)) = 0 then
    raise exception 'fn_fondo_plata_anotada_inmutable no quedó con su excepción';
  end if;
end $$;
