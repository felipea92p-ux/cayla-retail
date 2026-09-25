-- ============================================================================
-- 20260925211500_admin_se_reasigna_su_propio_rol.sql — CAYLA V2 · ADR-0178, actualización (Felipe, 2026-09-25)
-- (Renumerada de 20260925210000: chocaba con 20260925210000_fotos_de_perfil_desde_dynamic, otra sesión, mismo timestamp.)
--
-- EL PROBLEMA PRIMERO. `asignar_rol` bloquea a CUALQUIERA que intente cambiarse su propio rol, sin excepción — ni
-- siquiera un Admin puede reasignarse a sí mismo desde «Roles y accesos»; el mensaje dice «pídeselo a otro líder». Es
-- el candado de 20260923110000 (previo a ADR-0178), pensado para que ningún líder se suba o baje solo, sin testigo.
-- Felipe lo probó como Admin y no pudo: correcto para un líder cualquiera, pero un Admin ya tiene el poder de tocar a
-- CUALQUIER líder (incluido él mismo, desde otra sesión) — pedirle a otro Admin que lo haga por él es una fricción sin
-- beneficio real de seguridad.
--
-- LA EXCEPCIÓN. Solo para un Admin (`fn_es_admin()`), `asignar_rol` deja de bloquear `p_persona_id = v_yo`. TODO lo
-- demás de la función sigue igual y ya es genérico respecto de quién actúa: si el Admin se autodegrada de Líder, sigue
-- exigiendo que quede OTRO líder activo y OTRO admin activo (`fn_exigir_otro_admin`; ambas comprobaciones miran
-- «alguien más», no «no yo mismo») — no se abre ningún hueco nuevo, se saca solo el candado extra que ya era
-- redundante para este caso.
--
-- Mismo patrón que 20260923174500: se cambia desde la definición VIVA con conteo exacto (inventario contra producción
-- el 2026-09-25); si cambió, aborta sin dejar nada a medias. Re-ejecutable. Requiere 20260923163000 (fn_es_admin).
-- ============================================================================

set search_path = retail, public, extensions;

do $$
begin
  if to_regprocedure('retail.fn_es_admin()') is null then
    raise exception 'Falta 20260923163000_escalon_admin_desde_dynamic.sql: pégala antes que esta';
  end if;
end $$;

create or replace function pg_temp.reemplazar_asignar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  if to_regprocedure(p_firma) is null then
    raise exception '% no existe en esta base: esta migración se escribió contra producción. Revisa qué cambió.', p_firma;
  end if;
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then
    return; -- ya aplicada
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % ocurrencias de "%" y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

select pg_temp.reemplazar_asignar('retail.asignar_rol(uuid, uuid, uuid, uuid)',
  $v$    if p_persona_id = v_yo then
      raise exception 'No puedes cambiar tu propio rol: pídeselo a otro líder' using errcode = '42501';
    end if;$v$,
  $n$    if p_persona_id = v_yo and not retail.fn_es_admin() then -- ADR-0178 (20260925210000): un Admin sí se reasigna a sí mismo
      raise exception 'No puedes cambiar tu propio rol: pídeselo a otro líder' using errcode = '42501';
    end if;$n$, 1);

-- ==================== Verificación ====================
do $$
begin
  if position('and not retail.fn_es_admin()' in pg_get_functiondef('retail.asignar_rol(uuid, uuid, uuid, uuid)'::regprocedure)) = 0 then
    raise exception 'Quedó sin la excepción de Admin al candado de «propio rol»';
  end if;
end $$;
