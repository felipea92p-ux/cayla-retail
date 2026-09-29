-- ============================================================================
-- 20260930020100_conteo_editar_cerrado.sql — CAYLA V2 · Inventario > Conteo: editar un conteo cerrado (2026-09-29)
-- UNA sola parte (funciones nuevas y una reescrita; sin políticas ni `drop trigger`; idempotente).
--
-- EL PROBLEMA PRIMERO. Un conteo cerrado no se podía corregir: si alguien se equivocó al teclear una cantidad (contó 5 y
-- eran 4), el ajuste ya estaba en el stock y la única salida era un ajuste manual suelto en Existencias, sin relación con
-- el conteo. El líder pidió «Ver → editar de nuevo ese conteo».
--
-- DECIDÍ
--   · `reabrir_conteo(id)`: un conteo CERRADO vuelve a «abierto» (mismas líneas, mismo «debe haber», misma foto). Se edita con
--     las pantallas de siempre (Contar → Revisar → Confirmar) y se cierra con `cerrar_conteo`, que NO cambió.
--   · Nada se deshace. `movimientos` es solo-agregar: el primer cierre queda escrito. El segundo cierre ajusta solo lo que
--     se volvió a contar, y lo hace como DELTA sobre el stock de ese momento (contado − «debe haber» leído al re-verificar):
--     el primer ajuste ya está en el stock, así que ese «debe haber» ya lo incluye. Ejemplo: esperaba 6, contó 5 → −1
--     (stock 5). Se reabre y se corrige a 4 → «debe haber» 5, contado 4 → −1 (stock 4). Si se corrige a 6 → +1 (stock 6).
--   · Lo que se cierra dos veces lo decide `diferencia`: `cerrar_conteo` solo ajusta líneas con `diferencia is null`. Una línea
--     ya ajustada que nadie toca conserva su `diferencia` y no se ajusta otra vez. Una que se vuelve a contar la suelta
--     (`conteo_contar`, abajo) y se ajusta con su nueva diferencia. Por eso `cerrar_conteo` no se toca.
--   · Solo un líder (`fn_puede_ajustar_inventario`, igual que cerrar) y solo un conteo cerrado del modelo nuevo (con `foto_en`:
--     los de antes del rediseño no traen confirmaciones y no podrían cerrarse de nuevo). Sin actor propio: reabrir no
--     mueve stock ni escribe movimientos; quien ajusta es el cierre siguiente, que sí firma.
-- DESCARTÉ
--   · Deshacer el primer cierre con movimientos inversos y volver a aplicar todo: Finanzas lee cada ajuste `motivo = 'conteo'`
--     como merma o sobrante (cuenta 659); un inverso duplicaría el asiento, y revertir un sobrante que ya se vendió dejaría
--     el stock en negativo. Con el delta cada ajuste se explica solo.
--   · Editar una línea de un conteo cerrado sin reabrirlo: sería una segunda puerta que escribe stock fuera de `cerrar_conteo`.
-- SE ROMPE SI
--   · hay otro conteo abierto en la misma sede: `conteos_un_abierto_por_ubicacion` no deja abrir dos; `reabrir_conteo` lo
--     dice con `hint = 'ya_hay_abierto'` y no toca nada;
--   · alguien reabre y deja una variante ya ajustada «pendiente» (la des-cuenta o la manda a recontar y no la vuelve a
--     contar): su ajuste anterior se queda en el stock y el cierre parcial no la toca — es lo que dice el resultado;
--   · una migración futura hace que `cerrar_conteo` ajuste líneas con `diferencia` ya escrita (se ajustaría dos veces).
--
-- PARA VOLVER: `drop function retail.reabrir_conteo(uuid);` y volver a pegar `conteo_contar` de 20260930010100.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- ----------------------------------------------------------------------------
-- 1. reabrir_conteo — un conteo cerrado vuelve a abierto para editarlo.
--    ORDEN DE ERRORES (P0001 con hint): existe → está cerrado → es del modelo nuevo → permiso → no hay otro abierto.
-- ----------------------------------------------------------------------------
create or replace function retail.reabrir_conteo(p_conteo_id uuid)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $function$
declare
  c conteos%rowtype;
begin
  select * into c from conteos where id = p_conteo_id for update;
  if not found then raise exception 'El conteo % no existe', p_conteo_id; end if;
  if c.estado <> 'cerrado' then
    raise exception 'Solo se puede editar un conteo cerrado (este está %)', c.estado
      using errcode = 'P0001', hint = 'no_esta_cerrado';
  end if;
  if c.foto_en is null then
    raise exception 'Este conteo es de antes del rediseño y no se puede editar'
      using errcode = 'P0001', hint = 'conteo_antiguo';
  end if;
  if not fn_puede_ajustar_inventario() then
    raise exception 'Solo un líder puede editar un conteo cerrado — es la aprobación de lo contado';
  end if;
  if not fn_puede_operar_ubicacion(c.ubicacion_id) then
    raise exception 'No tienes permiso sobre esa ubicación';
  end if;
  if exists (select 1 from conteos where ubicacion_id = c.ubicacion_id and estado = 'abierto' and id <> c.id) then
    raise exception 'Ya hay un conteo abierto en esta sede: ciérralo o cancélalo antes de editar este'
      using errcode = 'P0001', hint = 'ya_hay_abierto';
  end if;

  update conteos set estado = 'abierto', cerrado_en = null, cerrado_por = null where id = p_conteo_id;
end;
$function$;

revoke all on function retail.reabrir_conteo(uuid) from public, anon;
grant execute on function retail.reabrir_conteo(uuid) to authenticated;

comment on function retail.reabrir_conteo(uuid) is
  'Reabre un conteo CERRADO (modelo nuevo, con foto_en) para editarlo: vuelve a abierto con sus líneas. No toca stock ni movimientos; '
  'el siguiente cierre ajusta solo las variantes que se volvieron a contar, como delta sobre el stock de ese momento. Solo líder '
  '(fn_puede_ajustar_inventario). Errores P0001: no_esta_cerrado, conteo_antiguo, ya_hay_abierto.';

-- ----------------------------------------------------------------------------
-- 2. conteo_contar — igual que en 20260930010100, salvo que al volver a verificar una variante YA ajustada suelta `diferencia`
--    (ver arriba). En un conteo que nunca se cerró `diferencia` ya es NULL: no cambia nada.
-- ----------------------------------------------------------------------------
create or replace function retail.conteo_contar(
  p_conteo_id uuid,
  p_variante_id uuid,
  p_cantidad_contada integer,
  p_confirmo_fuera_de_alcance boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $function$
declare
  c conteos%rowtype;
  v_item conteo_items%rowtype;
  v_sistema integer;
  v_categoria uuid;
begin
  select * into c from conteos where id = p_conteo_id for update;
  if not found then raise exception 'El conteo % no existe', p_conteo_id; end if;
  if c.estado <> 'abierto' then raise exception 'Ese conteo ya está %', c.estado; end if;
  if not fn_puede_operar_ubicacion(c.ubicacion_id) then
    raise exception 'No tienes permiso para contar en esa ubicación';
  end if;
  perform retail.fn_actor_persona_id(true);

  if p_cantidad_contada < 0 then
    raise exception 'La cantidad contada no puede ser negativa'
      using errcode = 'P0001', hint = 'cantidad_invalida';
  end if;

  -- NULL = des-contar: la variante vuelve a pendiente. No se borra la fila (así el conteo conserva su foto). El «debe
  -- haber» vuelve a la foto. Una variante inesperada (foto 0) a la que se le quita la cantidad queda ignorada, SALVO que
  -- ya se hubiera mandado a recontar: `contada_anterior` se conserva y entonces sigue visible «en reconteo».
  if p_cantidad_contada is null then
    update conteo_items
       set cantidad_contada = null, verificado_en = null, confirmada_en = null,
           cantidad_sistema = coalesce(cantidad_foto, 0)
     where conteo_id = p_conteo_id and variante_id = p_variante_id;
    return (retail.fn_conteo_lineas_json(p_conteo_id, p_variante_id, true)) -> 0;
  end if;

  -- conteo de ubicación completa (sububicacion_id null): sigue sumando TODAS las sububicaciones, igual que antes de
  -- que existiera esa columna. Conteo específico: filtra exacto.
  -- ADR-0189 (conteo-foto): `for share` sobre las filas de stock de la prenda en esta sede: si una venta la está
  -- moviendo, la lectura espera a que termine y la cuenta. Siempre en el mismo orden (por sububicación).
  perform 1 from stock
    where variante_id = p_variante_id and ubicacion_id = c.ubicacion_id
    order by sububicacion_id nulls first
    for share;

  select coalesce(sum(cantidad), 0) into v_sistema from stock
    where variante_id = p_variante_id and ubicacion_id = c.ubicacion_id
      and (c.sububicacion_id is null or sububicacion_id = c.sububicacion_id);

  -- Una variante que NO estaba en la foto y no es de la categoría del conteo: hay que confirmar que se agrega.
  select * into v_item from conteo_items where conteo_id = p_conteo_id and variante_id = p_variante_id;
  if not found and c.alcance = 'categoria' and not coalesce(p_confirmo_fuera_de_alcance, false) then
    select p.categoria_id into v_categoria
      from variantes va join productos p on p.id = va.producto_id
     where va.id = p_variante_id;
    if found and v_categoria is distinct from c.alcance_categoria_id then
      raise exception 'Esta prenda no pertenece al conteo actual.'
        using errcode = 'P0001', hint = 'fuera_de_alcance';
    end if;
  end if;

  -- Verificar = leer el stock AHORA y guardar el total contado. El «debe haber» se renueva en cada verificación: una
  -- venta hecha antes de contar ya no cuenta como falta. `verificado_en` se toma DESPUÉS de leer el stock.
  -- La foto (`cantidad_foto`) no se toca: una variante nueva nace con foto 0. Si la variante se mandó a recontar y sale la
  -- misma cifra que la vez anterior (y sigue habiendo diferencia), la diferencia queda confirmada sola.
  insert into conteo_items (conteo_id, variante_id, cantidad_foto, cantidad_sistema, cantidad_contada, verificado_en)
    values (p_conteo_id, p_variante_id, 0, v_sistema, p_cantidad_contada, clock_timestamp())
    on conflict (conteo_id, variante_id) do update set
      cantidad_sistema = excluded.cantidad_sistema,
      diferencia = null, -- volver a verificar una variante YA ajustada (conteo reabierto) la deja lista para ajustarse otra vez
      cantidad_contada = excluded.cantidad_contada,
      verificado_en = excluded.verificado_en,
      confirmada_en = case
        when conteo_items.contada_anterior is not null
         and excluded.cantidad_contada = conteo_items.contada_anterior
         and excluded.cantidad_contada <> excluded.cantidad_sistema
        then excluded.verificado_en
        else null
      end;

  return (retail.fn_conteo_lineas_json(p_conteo_id, p_variante_id, true)) -> 0;
end;
$function$;

revoke all on function retail.conteo_contar(uuid, uuid, integer, boolean) from public, anon;
grant execute on function retail.conteo_contar(uuid, uuid, integer, boolean) to authenticated;

comment on function retail.conteo_contar(uuid, uuid, integer, boolean) is
  'Verifica una variante de un conteo abierto: lee el stock ahora (for share), guarda el «debe haber» y lo contado, y devuelve '
  'la línea. NULL la deja pendiente; negativo se rechaza (cantidad_invalida); una variante fuera de la categoría del conteo '
  'pide confirmación (fuera_de_alcance). No borra la foto. En un conteo reabierto, volver a verificar una variante ya ajustada suelta '
  '`diferencia`: el próximo cierre ajusta la nueva diferencia sobre el stock de ese momento.';
