-- ============================================================================
-- 20261003140000_acepta_redondeo_efectivo.sql — CAYLA V2 (ADR-0310, actividad 5, PARTE 2 de 2: la bandera, VA ÚLTIMA)
--
-- EL CAMBIO. `retail.fn_acepta_redondeo_efectivo()`: la pantalla de Vender la pregunta al cargar. Si dice `true`, la hoja de cobro
-- redondea el efectivo al múltiplo de S/ 0.10, hacia abajo (la ley) y manda la fila de redondeo; si dice `false` —o la función no existe
-- todavía, porque esta migración aún no está en producción— cobra exacto como hasta ahora. Es el interruptor del despliegue: la web
-- nunca ofrece algo que la base rechazaría entera (molde: `fn_acepta_pago_qr`, 20261002130000).
--
-- NO ES UN `select true`. Dice `true` solo si la base de verdad puede recibir el redondeo (Lamport: un estado imposible no debe poder
-- existir): (1) `venta_pagos_metodo_check` acepta el medio 'redondeo', (2) existe la regla `fn_redondeo_efectivo`, y (3)
-- `registrar_venta` Y (4) `entregar_separacion` —Vender y la entrega de un apartado cobran con la misma bandera— traen la validación
-- del redondeo. Si alguien pega esta parte sin las demás, la bandera dice `false` y la caja sigue cobrando exacto, en vez de mandar
-- una venta o una entrega que se rechazaría. Y se apaga sola si algo de eso se pierde (por ejemplo, si una
-- migración recrea `registrar_venta` desde un archivo viejo y le quita la validación).
--
-- APAGAR EL REDONDEO (si alguna vez hiciera falta, p. ej. si un abogado dijera otra cosa): `create or replace` de esta función
-- devolviendo `false`. Las ventas que ya se registraron con redondeo no cambian; la caja vuelve a cobrar exacto desde que cada
-- pantalla se recargue (la bandera se lee al cargar /vender).
--
-- PRODUCCIÓN. Pegar SOLA y ÚLTIMA, cuando ya están pegadas las demás partes (20261003100000 a 20261003135000) y publicada la web;
-- después, recargar Vender (F5) en cada caja: una pestaña abierta desde antes no vuelve a preguntar. Una función `stable` que solo lee
-- el catálogo; sin tablas, políticas ni `drop trigger`. Idempotente.
--
-- VERIFICACIÓN (solo lectura):
--   select retail.fn_acepta_redondeo_efectivo();   → true (y false si falta alguna parte)
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.fn_acepta_redondeo_efectivo() returns boolean
language sql stable set search_path = retail, public, extensions as $$
  select
    exists (
      select 1 from pg_constraint c
       where c.conrelid = 'retail.venta_pagos'::regclass and c.conname = 'venta_pagos_metodo_check'
         and pg_get_constraintdef(c.oid) like '%''redondeo''%'
    )
    and to_regprocedure('retail.fn_redondeo_efectivo(numeric)') is not null
    and exists (
      select 1 from pg_proc p
       where p.pronamespace = 'retail'::regnamespace and p.proname = 'registrar_venta'
         and p.prosrc like '%venta_redondeo_invalido%'
    )
    and exists (
      select 1 from pg_proc p
       where p.pronamespace = 'retail'::regnamespace and p.proname = 'entregar_separacion'
         and p.prosrc like '%venta_redondeo_invalido%'
    );
$$;

comment on function retail.fn_acepta_redondeo_efectivo() is
  'ADR-0310: ¿la base ya recibe el redondeo del efectivo? (el medio redondeo en venta_pagos, la regla y la validación de registrar_venta y de entregar_separacion). Vender y Apartados la preguntan al cargar; con false cobra exacto. Para apagar el redondeo: create or replace devolviendo false.';

revoke all on function retail.fn_acepta_redondeo_efectivo() from public, anon;
grant execute on function retail.fn_acepta_redondeo_efectivo() to authenticated;

-- Validación final: con las partes anteriores pegadas la bandera tiene que decir true; si no, esta parte se pegó antes de tiempo.
do $$
begin
  if not retail.fn_acepta_redondeo_efectivo() then
    raise notice 'fn_acepta_redondeo_efectivo() dice false: faltan partes por pegar (20261003100000, 20261003110000, 20261003130000 o 20261003135000). La caja seguirá cobrando exacto hasta que estén.';
  end if;
end $$;
