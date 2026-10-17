-- ============================================================================
-- 20261015011000_pedidos_web_en_catalogo_y_existencias.sql — CAYLA V2 · Tienda online (ADR-0408), actividad 8: lo que los
-- pedidos web cambian FUERA de su pantalla
--
-- EL PROBLEMA PRIMERO.
--   · Catálogo ▸ Productos ofrecía «Eliminar» para una prenda que un cliente ya pidió por la web (aunque nunca haya movido stock: se
--     puede separar algo por conseguir) y la llave de `pedido_web_lineas` lo frenaba recién al borrar, con un «otra parte del sistema
--     todavía lo usa» que no dice qué. Lo frena desde que nació el motor (`eliminar_producto.mjs` ya la clasifica como HISTORIA).
--   · La reserva de un pedido web es un apartado más («Pedido web W-0001», sin el nombre del cliente) y sale en la lista de apartados
--     abiertos de Inventario ▸ Existencias con su botón «Liberar», que la base rechaza (se libera desde Pedidos web): un botón que
--     siempre falla.
--
-- LO QUE HACE
--   1. `fn_producto_historia` (reemplazo ANCLADO de una función viva de Catálogo): un renglón más, «pedidos web», que NO se borra.
--      `fn_producto_se_puede_eliminar` arma su frase con estos renglones, así que dice «tiene pedidos web (1)» sin tocarla.
--   2. `fn_apartados_de_pedidos_web(tienda)`: cuáles de los apartados abiertos de una tienda son la reserva de un pedido web, con su
--      número y la tienda del pedido. Existencias la usa para rotularlos («Pedido web W-0001») y no ofrecer «Liberar». No exige el
--      módulo Pedidos web: dice lo mismo que el apartado ya dice en su nombre, solo a quien opera esa tienda (como `listar_apartados`).
--
-- DECIDÍ rotular y no ocultar: en Existencias la unidad sigue «apartada» en el stock, y una lista que la escondiera dejaría ese número
-- sin explicación. DESCARTÉ cambiar `listar_apartados` (viva, de Existencias): agregarle una columna obliga a borrarla y recrearla.
-- SE ROMPE SI alguien vuelve a pegar una migración que recree `fn_producto_historia` desde su archivo (borra el renglón 25: Catálogo
-- volvería a ofrecer «Eliminar» y la llave lo frenaría con el aviso genérico; `pnpm pruebas:pedidos-web-erp` lo marca).
--
-- PRODUCCIÓN. NO está aplicada (actividad 13, con el OK de Felipe), y va DESPUÉS de `20261014235000_pedidos_web_modelo.sql`. Una sola
-- parte: solo funciones (sin tablas, políticas ni disparadores). El ancla es el final de la consulta de `fn_producto_historia`
-- («) h / where h.n > 0»), que no cambia cuando otra migración le suma un renglón: re-ejecutable, y aborta sin tocar nada si la
-- función viva cambió de forma. Ningún `select … into` dentro de un texto entre comillas.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

create or replace function pg_temp.anclar(p_firma text, p_viejo text, p_nuevo text)
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
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el texto ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición viva.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ----------------------------------------------------------------------------
-- 1. «Tiene pedidos web»: historia de la prenda, como un pedido a otra sede (renglón 16). Cuenta toda línea, también la quitada
--    o la de un pedido vencido: el pedido no se borra nunca y su llave apunta a la prenda.
-- ----------------------------------------------------------------------------
select pg_temp.anclar(
  'retail.fn_producto_historia(uuid)',
  $v$    ) h
   where h.n > 0;$v$,
  $n$      -- ADR-0408 (actividad 8): lo que un cliente pidió por la web, con su precio y quizá su pago. No se borra nunca.
      union all select 25, 'pedidos web', count(*), false
        from retail.pedido_web_lineas x where x.variante_id in (select id from vs)
    ) h
   where h.n > 0;$n$
);

-- ----------------------------------------------------------------------------
-- 2. Cuáles apartados abiertos de una tienda son la reserva de un pedido web (para rotularlos en Existencias).
-- ----------------------------------------------------------------------------
create or replace function retail.fn_apartados_de_pedidos_web(p_ubicacion_id uuid)
returns table (apartado_id uuid, pedido_codigo text, tienda_pedido text, para_otra_tienda boolean)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select a.id, w.codigo, u.nombre, w.ubicacion_id <> a.ubicacion_id
    from retail.apartados a
    join retail.pedido_web_lineas l on l.apartado_id = a.id
    join retail.pedidos_web w on w.id = l.pedido_id
    join retail.ubicaciones u on u.id = w.ubicacion_id
   where a.ubicacion_id = p_ubicacion_id
     and a.estado = 'abierto'
     and coalesce(retail.fn_puede_operar_ubicacion(p_ubicacion_id), false);
$$;

comment on function retail.fn_apartados_de_pedidos_web(uuid) is
  'Existencias (ADR-0408, act. 8): los apartados abiertos de una tienda que son la reserva de un pedido web, con su número. Se rotulan y no se liberan desde ahí. Solo a quien opera la tienda.';

revoke all on function retail.fn_apartados_de_pedidos_web(uuid) from public, anon;
grant execute on function retail.fn_apartados_de_pedidos_web(uuid) to authenticated;

-- Comprobación: si algo no quedó, la migración no se da por aplicada.
do $$
begin
  if position('from retail.pedido_web_lineas x where x.variante_id in (select id from vs)'
              in pg_get_functiondef('retail.fn_producto_historia(uuid)'::regprocedure)) = 0 then
    raise exception 'fn_producto_historia no quedó con el renglón de los pedidos web (25)';
  end if;
end;
$$;

reset lock_timeout;
notify pgrst, 'reload schema';
