-- ============================================================================
-- 20261004200070_cuadre_piso_en_eliminar.sql — CAYLA V2 · ADR-0328 decisión técnica 4 + ADR-0252 «Eliminar con su historia»
-- PARTE 3 de 4 del cuadre del piso: «Eliminar un producto con su historia» aprende que el cuadre existe. Va DESPUÉS de
-- 20261004200000 (las tablas) y ANTES de 20261004200100 (las funciones), cuya guarda la exige. No depende de la de Frescura.
--
-- EL PROBLEMA PRIMERO. `cuadre_piso_items` cita `movimientos` y `variantes` con llave foránea, no se borra en cascada y no se
-- edita ni se borra (disparador). `eliminar_producto_con_historia` no la conocía: después del cuadre de TRU (unas 500 tallas)
-- casi ningún producto de esa tienda se habría podido volver a eliminar —ni el que se cargó por error—, y el mensaje solo
-- decía «otra parte del sistema todavía lo usa» (su red de seguridad `foreign_key_violation`). La purga
-- (`scripts/purga/purgar-producto-de-prueba.sql`) tampoco la conocía. Lo encontró la revisión adversarial con COMMIT, y lo
-- confirman las pruebas de deriva de `pnpm pruebas:eliminar-producto` y `pnpm pruebas:eliminar-producto-con-historia`, que
-- con la rama sin esto quedan en rojo (una tabla que cita productos/variantes/movimientos sin clasificar).
--
-- QUÉ ES UNA LÍNEA DEL CUADRE, PARA ESTE EFECTO. Un traslado interno de la misma tienda (almacén ↔ piso) que corrigió el
-- registro, igual que una bajada al piso: no hay un cliente, un proveedor, otra sede ni dinero del otro lado. ADR-0252 ya
-- decidió la regla («historia de stock sí, documentos no»), y las bajadas (`bajada_piso_items`) son historia borrable. Por
-- eso la línea del cuadre entra como historia de STOCK (`borrable = true`): se respalda en `respaldo_purgas.filas`
-- (`scripts/purga/restaurar-purga.sql` la devuelve) y se borra dentro de la transacción de la función, con su candado
-- (`cuadre_piso_items_inmutables`) apagado SOLO ahí y vuelto a su modo antes de terminar. La cabecera (`cuadres_piso`, la
-- fecha del cuadre de la sede y lo que se le mostró a la persona) no se toca: no cita al producto y es historia de la sede.
--
-- CÓMO: PARCHE POR ANCLA, NO REESCRITURA (como 20261001100200 y 20261003232000). Las dos funciones viven en producción con
-- parches posteriores. `pg_temp.reemplazar_anclado` cambia un texto que tiene que aparecer UNA sola vez; si no, aborta sin
-- tocar nada y dice cuál; si el texto nuevo ya está, no hace nada (re-pegable). Cada texto nuevo deja INTACTO el texto que
-- dejaron los parches anteriores (la libreta de Frescura): volver a pegar uno de ellos sigue sin hacer nada. Al final se
-- exige que las dos funciones nombren `cuadre_piso_items`; si no, se deshace todo (el SQL Editor corre el archivo en una
-- transacción). Sin `select … into` dentro de los textos entre comillas (ADR-0288).
--
-- LO QUE CAMBIA EN CADA FUNCIÓN:
--   fn_producto_historia(uuid)            → un renglón más (20, «cuadres del piso», borrable).
--   eliminar_producto_con_historia(uuid)  → (1) su candado entra a la lista de los que se apagan y vuelven a su modo, (2) su
--     tabla entra al candado de tabla (`lock table … share row exclusive`) en una sentencia aparte, después de las otras
--     cuatro y ANTES de bloquear el producto: `cuadrar_piso` toma `movimientos` antes que `cuadre_piso_items`, igual que
--     esta función, así ninguna espera en círculo; (3) sus filas se respaldan; (4) se borran antes que los movimientos.
--
-- ESTADO QUE DEJA DE SER POSIBLE: un producto con solo historia de stock que no se puede eliminar porque pasó por el cuadre
-- del piso; y un cuadre que existe sin que Eliminar lo conozca (la guarda de la PARTE 4 lo exige).
--
-- CÓMO SE PEGA EN PRODUCCIÓN. Sola, tal cual (trae `retail.` y su `set search_path`), después de 20261004200000 y antes de
-- 20261004200100. Solo funciones (por dentro de `execute`) y `comment`: sin políticas, sin `drop trigger`, sin `alter` de
-- tablas en uso (ADR-0195). Con `lock_timeout` de 3 s. Idempotente.
-- Verificación (solo lectura; tiene que dar t en las dos):
--   select proname, position('cuadre_piso_items' in prosrc) > 0 as conoce_el_cuadre from pg_proc
--    where pronamespace = 'retail'::regnamespace and proname in ('fn_producto_historia', 'eliminar_producto_con_historia') order by 1;
--
-- SE ROMPE SI:
--   · alguien reescribe una de las dos funciones desde una migración anterior (recrea el cuerpo sin el cuadre): eliminar un
--     producto que pasó por el cuadre vuelve a fallar con «otra parte del sistema todavía lo usa». Lo vigila el caso 15 de
--     `eliminar_producto_con_historia.mjs` y sus pruebas de deriva.
--   · otra tabla nueva cita `movimientos` o `variantes` y nadie enseña a estas funciones: pasa lo mismo con ESA tabla.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $$
begin
  if to_regclass('retail.cuadre_piso_items') is null then
    raise exception 'Faltan las tablas del cuadre: pega antes 20261004200000_cuadre_piso_tablas.sql';
  end if;
  if to_regprocedure('retail.fn_producto_historia(uuid)') is null or to_regprocedure('retail.eliminar_producto_con_historia(uuid)') is null then
    raise exception 'Faltan fn_producto_historia o eliminar_producto_con_historia: pega antes 20260928230000_eliminar_producto_con_historia.sql.';
  end if;
  if to_regclass('retail.frescura_decisiones') is not null
     and position('frescura_decisiones' in (select p.prosrc from pg_proc p where p.oid = 'retail.eliminar_producto_con_historia(uuid)'::regprocedure)) = 0 then
    raise exception 'Eliminar con historia todavía no conoce la libreta de Frescura: pega antes 20261001100200_frescura_decisiones_en_eliminar.sql (estas anclas se escribieron sobre ese cuerpo).';
  end if;
end $$;

-- La misma de 20261004200050 (mismo cuerpo y firma): en una sesión que corre las dos, la segunda la deja igual.
create or replace function pg_temp.reemplazar_anclado(p_firma text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  -- Ya aplicado: el texto nuevo está (se mira primero: en la declaración, el texto nuevo contiene al viejo).
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ==================== 1. La historia de un producto: un renglón más ====================
select pg_temp.reemplazar_anclado(
  'retail.fn_producto_historia(uuid)',
$v$      union all select 13, 'bajadas al piso', count(*), true
        from retail.bajada_piso_items x where x.variante_id in (select id from vs)
$v$,
$n$      union all select 13, 'bajadas al piso', count(*), true
        from retail.bajada_piso_items x where x.variante_id in (select id from vs)
      -- El cuadre del piso (ADR-0328): un traslado interno de la misma tienda que corrigió el registro, como una bajada.
      union all select 20, 'cuadres del piso', count(*), true
        from retail.cuadre_piso_items x where x.variante_id in (select id from vs)
$n$);

-- ==================== 2. Eliminar con su historia: la conoce, la respalda y la borra ====================
-- (1) Su candado de historial entra a la lista de los que se apagan solo dentro de la transacción y vuelven a su modo.
select pg_temp.reemplazar_anclado(
  'retail.eliminar_producto_con_historia(uuid)',
$v$'movimientos_internos_intentos', 'movimientos_internos_intentos_inmutables',
$v$,
$n$'movimientos_internos_intentos', 'movimientos_internos_intentos_inmutables',
                                      'cuadre_piso_items', 'cuadre_piso_items_inmutables',
$n$);
-- (2) Su tabla entra al candado de TABLA, en una sentencia propia justo después de las otras (el texto que dejó la libreta
--     de Frescura sigue igual) y antes de bloquear el producto.
select pg_temp.reemplazar_anclado(
  'retail.eliminar_producto_con_historia(uuid)',
$v$lock table retail.movimientos, retail.movimientos_internos_intentos, retail.bajada_piso_items, retail.frescura_decisiones in share row exclusive mode;$v$,
$n$lock table retail.movimientos, retail.movimientos_internos_intentos, retail.bajada_piso_items, retail.frescura_decisiones in share row exclusive mode;
    -- El cuadre del piso (ADR-0328): cuadrar_piso toma movimientos antes que esta tabla, igual que aquí.
    lock table retail.cuadre_piso_items in share row exclusive mode;$n$);
-- (3) Cada fila, tal cual, antes de tocarla (`scripts/purga/restaurar-purga.sql` la devuelve).
select pg_temp.reemplazar_anclado(
  'retail.eliminar_producto_con_historia(uuid)',
$v$      union all select v_respaldo, 'bajada_piso_items', to_jsonb(t) from retail.bajada_piso_items t where t.variante_id = any (v_vs)
$v$,
$n$      union all select v_respaldo, 'bajada_piso_items', to_jsonb(t) from retail.bajada_piso_items t where t.variante_id = any (v_vs)
      union all select v_respaldo, 'cuadre_piso_items', to_jsonb(t) from retail.cuadre_piso_items t where t.variante_id = any (v_vs)
$n$);
-- (4) Se borra antes que los movimientos (hijos primero). La cabecera del cuadre se queda: es de la sede, no del producto.
select pg_temp.reemplazar_anclado(
  'retail.eliminar_producto_con_historia(uuid)',
$v$      delete from retail.bajada_piso_items where variante_id = any (v_vs);$v$,
$n$      delete from retail.bajada_piso_items where variante_id = any (v_vs);
      delete from retail.cuadre_piso_items where variante_id = any (v_vs);$n$);

comment on function retail.eliminar_producto_con_historia(uuid) is
  'Productos ▸ Eliminar con su historia (ADR-0252, act. 2026-10-03): quien edita el catálogo (fn_puede_editar_catalogo; antes, solo Admin). Borra, todo o nada, un producto cuya historia es solo de stock (movimientos, conteos, bajadas al piso, líneas del cuadre del piso, pedidos no atendidos, apartados cerrados sin dinero, decisiones de Frescura) junto con su ficha. Con ventas, compras, producción, costos, traslados, separaciones o lo recibido de un proveedor se rechaza. Respalda cada fila en respaldo_purgas.filas (scripts/purga/restaurar-purga.sql la devuelve), deja rastro en historial_producto_cambios y en Actividad, y deja los candados de historial como estaban. Devuelve la referencia.';

-- Lo que quedó tiene que conocer el cuadre en las dos: si no, se deshace todo.
do $$
begin
  if position('cuadre_piso_items' in (select p.prosrc from pg_proc p where p.oid = 'retail.fn_producto_historia(uuid)'::regprocedure)) = 0
     or (select count(*) from regexp_matches((select p.prosrc from pg_proc p where p.oid = 'retail.eliminar_producto_con_historia(uuid)'::regprocedure),
                                             'cuadre_piso_items', 'g')) < 4 then
    raise exception 'El reemplazo no dejó a Eliminar conociendo el cuadre del piso. No se aplicó nada.';
  end if;
end $$;

notify pgrst, 'reload schema';

reset lock_timeout;
