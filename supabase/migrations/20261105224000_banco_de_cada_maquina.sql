-- ============================================================================
-- 20261105224000 — A qué banco deposita cada máquina de cobro (tarea 3 de «Las 36 de Finanzas»; Felipe 2026-11-05: «banco fijo editable»)
--
-- EL PROBLEMA PRIMERO. La hoja del depósito proponía el primer banco de la lista, y dos abonos del 31 de octubre se fueron ahí. El sistema no
-- sabía a qué banco deposita cada máquina.
--
-- LA DECISIÓN. Cada máquina guarda su banco. La hoja lo trae puesto y se puede cambiar en cada depósito; sin banco guardado, viene vacío y hay
-- que elegirlo (ya no propone el primero). Es una propuesta, no un candado: `registrar_abono_pos` sigue aceptando el banco que se le pase, porque
-- una máquina puede cambiar de banco y lo que manda es dónde llegó la plata. Quién puede: los mismos de la tarifa (`fn_exigir_lider_dinero`).
-- Un banco archivado deja de proponerse.
--
-- CÓMO SE PEGA EN PRODUCCIÓN: una ejecución, idempotente. Agrega columnas a una tabla de configuración y no toca políticas, así que no choca
-- con el Asesor de seguridad (ADR-0195). Verificado: `pnpm pruebas:pos-maquinas`. Lo que cada máquina deposita lo carga Felipe en Configuración ▸ Dinero.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

alter table retail.pos_maquinas
  add column if not exists banco_id uuid references retail.cuentas_dinero (id),
  add column if not exists banco_fijado_por uuid,
  add column if not exists banco_fijado_en timestamptz;
comment on column retail.pos_maquinas.banco_id is
  'A qué banco deposita esta máquina: lo que la hoja del depósito trae puesto. Es una propuesta; lo que llegó de verdad vive en el movimiento.';

create or replace function retail.fn_pos_bancos_de_maquinas()
returns table (maquina_id uuid, cuenta_id uuid, banco_id uuid)
language plpgsql stable security definer
set search_path = retail, public, extensions
as $$
#variable_conflict use_column
begin
  perform retail.fn_exigir_lider_dinero('Ver a qué banco deposita cada máquina');
  return query
  select m.id, m.cuenta_id, case when b.tipo = 'banco' and b.archivada_en is null then m.banco_id end
    from retail.pos_maquinas m
    left join retail.cuentas_dinero b on b.id = m.banco_id
   where m.archivada_en is null;
end $$;
comment on function retail.fn_pos_bancos_de_maquinas() is
  'Tarea 3: el banco de cada máquina vigente; nulo si no tiene o si su banco se archivó. Solo lee.';
revoke all on function retail.fn_pos_bancos_de_maquinas() from public, anon;
grant execute on function retail.fn_pos_bancos_de_maquinas() to authenticated;

create or replace function retail.guardar_banco_de_maquina(p_maquina_id uuid, p_banco_id uuid)
returns void
language plpgsql security definer
set search_path = retail, public, extensions
as $$
begin
  perform retail.fn_exigir_lider_dinero('Cambiar a qué banco deposita una máquina');
  if not exists (select 1 from retail.pos_maquinas m where m.id = p_maquina_id and m.archivada_en is null) then
    raise exception 'Esa máquina no existe o está archivada.' using errcode = 'P0001';
  end if;
  if p_banco_id is not null and not exists (
    select 1 from retail.cuentas_dinero c where c.id = p_banco_id and c.tipo = 'banco' and c.archivada_en is null
  ) then
    raise exception 'Una máquina deposita a un banco vigente.' using errcode = 'P0001';
  end if;
  update retail.pos_maquinas
     set banco_id = p_banco_id, banco_fijado_por = retail.fn_actor_persona_id(true), banco_fijado_en = now()
   where id = p_maquina_id;
end $$;
comment on function retail.guardar_banco_de_maquina(uuid, uuid) is
  'Tarea 3: fija el banco al que deposita una máquina (nulo lo quita). Firma con el responsable del combo.';
revoke all on function retail.guardar_banco_de_maquina(uuid, uuid) from public, anon;
grant execute on function retail.guardar_banco_de_maquina(uuid, uuid) to authenticated;

reset lock_timeout;
