-- ============================================================================
-- 20261102152000_apartados_liberar_quien_ve_apartados.sql — CAYLA V2 (Felipe, 2026-11-02; ADR-0599)
--
-- EL PROBLEMA. El 2026-10-28 una líder de Arequipa apartó una placa con el selector de sede en Trujillo (APT-TRU-0007): el apartado
-- quedó en una sede donde la prenda no existía. Arreglarlo exige LIBERAR el apartado, y la pantalla solo ofrecía «Liberar» cuando
-- el apartado ya estaba vencido (días de espera) y la base lo pedía a «una líder o la cuenta de ventas» (`fn_puede_gestionar_caja`,
-- es decir, líder o quien ve Caja). Quien atiende Apartados todos los días no podía deshacer su propio error.
--
-- QUÉ HACE. `liberar_separacion` deja de pedir Caja: la pueden liberar la líder, quien ve Caja (como hasta hoy) y TODA cuenta que
-- ve el módulo Apartados (regla ADR-0161: quien ve un módulo hace todo lo que hay en él). Nada más cambia: sigue pidiendo
-- que la cuenta opere esa tienda (`fn_puede_operar_ubicacion`), el motivo, que el apartado esté abierto y la firma del
-- responsable (`fn_actor_persona_id(true)`). El adelanto sigue quedando «por devolver»; devolverlo (dinero) NO cambia: lo sigue
-- registrando quien gestiona la caja.
--
-- PRODUCCIÓN. Una sola parte, re-ejecutable, sin tablas ni políticas. Reemplazo ANCLADO sobre la función viva
-- (`pg_get_functiondef`): conserva lo que producción tenga y el repo no, y falla sin tocar nada si la función viva no es la
-- revisada (revisada el 2026-11-02 contra producción). Ningún texto de ancla lleva la palabra con que se guarda una consulta
-- en una variable (CLAUDE.md, «El SQL Editor agrega líneas por su cuenta»).
-- Pruebas: `pnpm pruebas:separaciones`.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- Reemplazo simple: el texto viejo aparece exactamente p_veces; si el nuevo ya está, no hace nada.
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

select pg_temp.reemplazar(
  'retail.liberar_separacion(uuid, text)',
  $v$  if not fn_puede_gestionar_caja() then
    raise exception 'Solo una líder o la cuenta de ventas de la tienda puede liberar un apartado' using errcode = '42501';$v$,
  $v$  if not (fn_puede_gestionar_caja() or fn_ve_modulo('apartados')) then
    raise exception 'Solo quien ve Apartados, una líder o la cuenta de ventas puede liberar un apartado' using errcode = '42501';$v$,
  1);

comment on function retail.liberar_separacion(uuid, text) is
  'Libera un apartado abierto: las prendas vuelven a estar disponibles y el adelanto queda por devolver. Lo hace la líder, quien ve Caja o quien ve Apartados (ADR-0599).';
