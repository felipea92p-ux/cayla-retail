-- ============================================================================
-- 20260930050000_terminales_pasan_la_puerta_de_lectura.sql — CAYLA V2 · ADR-0289
-- Las terminales entran a las cuatro lecturas de retail que solo reconocían personas.
--
-- EL PROBLEMA PRIMERO. El 2026-09-30 Compras ▸ Proveedores le mostró «Esta pantalla no está mostrando datos» a la
-- terminal administrativa de Tienda TRU. No fue un corte de conexión: la base respondió 200 con `[]` a las tres lecturas
-- de la pantalla. La pantalla dejó entrar a la terminal (`fn_persona_actual_resumen` y `fn_mis_modulos` la conocen desde
-- ADR-0162, y su rol trae el módulo `proveedores`), pero `fn_proveedores()` y `fn_proveedores_resumen()` terminan en
-- `where retail.fn_tiene_acceso_retail()`, y esa puerta solo reconoce «persona activa con colaborador activo». Una
-- terminal no es ninguna de las dos cosas (ADR-0162: cuenta de aparato, sin persona): la puerta la deja fuera SIN error,
-- las funciones devuelven cero filas, y `getProveedoresResumen()` (apps/web/lib/proveedores.ts) convierte «cero filas»
-- en una excepción. Con la misma cuenta, `fn_existencias()` también devuelve cero filas: el stock se vería vacío.
--
-- POR QUÉ ES LA PUERTA Y NO CADA FUNCIÓN. `fn_tiene_acceso_retail()` nació el 2026-09-22 (20260922170000) y las terminales
-- ese mismo día (20260922200000); la puerta nunca se enteró. Consultado en producción el 2026-09-30, solo cuatro funciones
-- la usan —fn_proveedores, fn_proveedores_resumen, fn_existencias, fn_existencias_productos— y nada más depende de ella
-- (ni políticas, ni vistas, ni otro schema). Enseñarle la terminal a la puerta arregla las cuatro y a cualquier lectura
-- futura que la use; parchar una por una habría dejado la trampa armada para la quinta.
--
-- QUÉ CAMBIA. `fn_tiene_acceso_retail()` pasa de «persona con colaborador activo» a «eso, o una terminal activa de una
-- sede activa» (`retail.fn_terminal_actual()`, la misma pieza que ya usan `fn_ubicacion_actual_persona` y `fn_mi_rol_id`).
--
-- QUÉ NO CAMBIA (y por qué esto no abre de más).
--   · Lo que ve cada cuenta lo sigue decidiendo su ROL (ADR-0161). La puerta solo dice «esta cuenta es un actor de retail»;
--     la terminal de ventas no ve Proveedores en la web porque su rol no trae ese módulo.
--   · El dinero sigue cerrado por rol: `fn_puede_ver_dinero_de_compras()` es falso para la terminal de ventas, así que
--     facturas, saldos y deudas le llegan en NULL, igual que a un integrante sin Compras. A la terminal administrativa
--     le llegan solo los de SU tienda (`fn_compras_ubicaciones()` ya arma «mis tiendas» con la terminal, ADR-0184).
--   · Una terminal desactivada, o de una sede desactivada, sigue afuera: `fn_terminal_actual()` ya lo exige.
--   · Las funciones de escritura no usan esta puerta; siguen firmando con `fn_actor_persona_id` (ADR-0162).
--   · Lo que ya era cierto y no se toca aquí: el directorio de proveedores (incluidos banco, cuenta, CCI y billetera) lo
--     lee cualquier cuenta que pase la puerta. Con este cambio esa lista suma a las terminales. Si Felipe quiere que el
--     directorio dependa del módulo `proveedores` y no de la puerta, es otra decisión (ADR-0289, «Pendiente»).
--
-- ORDEN AL PEGAR. Va sola, sin la web: la web de `main` no cambia y hoy ya espera que esto funcione (una terminal que
-- entra a Proveedores). Es un solo `create or replace function`: no crea políticas ni toca tablas, así que no toma los
-- bloqueos de `auth`/`storage` (ADR-0195) y se pega en el SQL Editor sin partirla en PARTES.
--
-- GUARDIA. Antes de reemplazar compara el md5 del cuerpo vivo con el de producción (consultado el 2026-09-30) y con el de
-- este archivo. Si es otro, alguien la cambió en vivo: se detiene sin tocar nada. Se puede pegar dos veces.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $$
declare
  v_md5 text;
begin
  if to_regprocedure('retail.fn_terminal_actual()') is null then
    raise exception 'Faltan las terminales: pega antes 20260923010000_terminales_sin_persona.sql.';
  end if;
  select md5(p.prosrc) into v_md5 from pg_proc p where p.oid = to_regprocedure('retail.fn_tiene_acceso_retail()');
  if v_md5 is null then
    raise exception 'fn_tiene_acceso_retail() no está en la base: pega antes 20260922170000_alta_colaborador_requiere_aprobacion.sql.';
  end if;
  if v_md5 not in ('403086e4cf5f29e8edfe4e1fff620fb9', '709e77234c9ec6f3877fef5b30f7bf49') then
    raise exception 'fn_tiene_acceso_retail() tiene otro cuerpo (md5 %): no es la de 20260922170000 ni la de este archivo. Alguien la cambió en vivo: reescribe desde su definición real antes de pegar.', v_md5;
  end if;
end $$;

create or replace function retail.fn_tiene_acceso_retail() returns boolean
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select exists (
    select 1 from public.personas p
    join retail.colaboradores c on c.persona_id = p.id
    where p.auth_user_id = auth.uid() and p.estado = 'activo' and c.estado = 'activo'
  )
  -- Una terminal (ADR-0162) es una cuenta de aparato: no tiene persona ni colaborador, pero es un actor de retail.
  or exists (select 1 from retail.fn_terminal_actual());
$$;

comment on function retail.fn_tiene_acceso_retail() is
  'ADR-0289: ¿esta sesión es un actor activo de retail? Una persona con colaborador activo, o una terminal activa de una sede activa. La usan fn_proveedores, fn_proveedores_resumen, fn_existencias y fn_existencias_productos. NO decide qué ve cada cuenta: eso es su rol (ADR-0161).';
