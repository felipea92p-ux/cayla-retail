-- ============================================================================
-- "DEVOLVER AL PROVEEDOR" TAMPOCO DESAPARECE (cierra lo que la cuarentena dejó flageado)
--
-- La migración de cuarentena de prendas dañadas (2026-09-17) arregló que
-- 'danada_reparacion'/'danada_donar' dejaran de esfumarse sin rastro, y dejó
-- 'devolver_proveedor' explícitamente afuera: "es un concepto distinto
-- (vuelve al proveedor, no se liquida/bota/dona acá) y Felipe no lo mencionó
-- al pedir esto. Queda flageado aparte, no se toca en esta migración."
--
-- Esta migración cierra ese flag. Contexto de por qué ahora, no antes: en una
-- sesión Felipe había dicho de este mismo hueco "no es prioridad [...] si no
-- afecta nuestra actividad actual ahora mismo, entonces no" (ver BACKLOG,
-- sección "Pendientes Benja"). En otra sesión, al analizar qué métricas de
-- proveedor construir, Felipe vio la conexión — "cuánto le debemos a cada
-- proveedor" no puede ser confiable si una devolución hacia él sigue sin
-- dejar rastro — y pidió revisarlo ahora. Misma pieza, contexto nuevo.
--
-- ALCANCE — qué se arregla y qué no:
-- SÍ: la prenda entra a 'cuarentena' igual que Dañado, en vez de desaparecer.
--     Reusa `prendas_danadas`/`resolver_prenda_danada` en vez de crear una tabla
--     y un flujo gemelos — es la misma pregunta ("qué hay guardado esperando una
--     decisión, y por qué") con un cuarto desenlace posible, no un concepto
--     nuevo. (Nota de vocabulario: el nombre `prendas_danadas` ya no describe al
--     100% lo que guarda —una vuelta al proveedor por talla equivocada no es
--     "dañada"—; no se renombra en esta pasada por ser tabla reciente sin
--     beneficio funcional inmediato; si en la práctica confunde, es una
--     migración de rename chica.)
-- NO: ajuste automático de deuda contra una factura del proveedor. Hoy no existe
--     NINGÚN camino de datos de una devolución a una compra específica —
--     `devoluciones` cuelga de `venta_id`, nunca de `compra_id`, y ni siquiera
--     hay un "proveedor preferido del producto" (se buscó `productos.proveedor_id`
--     para intentar inferirlo automáticamente: no existe en este repo, pese a
--     que BITACORA 2026-09-05 lo da por construido — esa entrada describe otra
--     línea de migraciones, no esta). Inventar un descuento automático sin nada
--     real que enganchar sería el mismo error que ADR-0035 evitó con
--     `ordenes_compra` (un número que nunca se concilia). Lo que sí queda: quien
--     resuelve la prenda como "devuelta al proveedor" elige a mano a cuál —
--     misma lógica que ya usan Se botó/Donada (una persona real decide y deja
--     nota), no una inferencia.
--
-- RECONSTRUIDO AL MEZCLAR CON `main` (2026-09-18) — ESTO NO ES LA VERSIÓN
-- ORIGINAL. Mientras esta migración vivía sin pushear, dos sesiones más
-- tocaron las MISMAS dos funciones:
--   1. `20260917195508_liquidar_prenda_danada_como_venta.sql` le sacó
--      'liquidada' a `resolver_prenda_danada` (ahora solo acepta
--      'se_boto'/'donada' — "Liquidada" pasó a `liquidar_prenda_danada`,
--      función aparte, porque mueve dinero real). Si esta migración hubiera
--      seguido escrita contra la versión vieja, habría reabierto sin querer
--      el backdoor que esa migración cerró a propósito (una "liquidada" sin
--      venta real detrás).
--   2. `20260918050000_devolucion_emite_nota_credito.sql` le agregó a
--      `aprobar_devolucion` la emisión automática de Nota de Crédito
--      (cambió hasta el `RETURNS` — de `void` a una fila con el id/serie/
--      número de la nota) cuando la venta devuelta tenía comprobante
--      aceptado por SUNAT.
-- Las dos funciones de abajo parten de esas versiones reales — la última
-- escrita, no la que existía cuando se escribió el primer borrador de esta
-- migración — y les suman SOLO lo de `devolver_proveedor`. Verificado con
-- `npx supabase db reset` sobre el árbol ya mezclado con `main`.
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- 1. prendas_danadas gana un cuarto desenlace y a quién se le devolvió ----------
alter table retail.prendas_danadas drop constraint prendas_danadas_estado_check;
alter table retail.prendas_danadas
  add constraint prendas_danadas_estado_check
  check (estado in ('en_cuarentena', 'liquidada', 'se_boto', 'donada', 'devuelta_proveedor'));

alter table retail.prendas_danadas add column proveedor_id uuid references retail.proveedores (id);
comment on column retail.prendas_danadas.proveedor_id is
  'Solo cuando estado = devuelta_proveedor. Lo elige a mano quien resuelve — no hay hoy ningún camino de datos que lo infiera solo (ver cabecera de esta migración).';

-- Mismo criterio que `prendas_danadas_resolucion_coherente`: el dato y el
-- estado que lo exige cambian juntos, la base lo hace cumplir, no la pantalla.
alter table retail.prendas_danadas
  add constraint prendas_danadas_proveedor_coherente
  check ((estado = 'devuelta_proveedor') = (proveedor_id is not null));

-- ---------- 2. aprobar_devolucion: 'devolver_proveedor' entra a cuarentena igual que 'danada_*' ----------
-- Cuerpo real más reciente (Nota de Crédito automática,
-- 20260918050000_devolucion_emite_nota_credito.sql) + 'devolver_proveedor'
-- sumado al mismo `elsif` que ya maneja 'danada_reparacion'/'danada_donar'.
-- Nada de la lógica de Nota de Crédito se toca.
create or replace function retail.aprobar_devolucion(
  p_devolucion_id uuid, p_reembolso_monto numeric default null, p_reembolso_metodo text default null
)
returns table (nota_credito_id uuid, nota_credito_serie text, nota_credito_numero integer)
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  d devoluciones%rowtype;
  r record;
  v_mov_id uuid;
  v_persona uuid;
  v_sub uuid;
  v_sub_cuarentena uuid;
  v_caja_id uuid;
  v_comprobante comprobantes%rowtype;
  v_total_devuelto numeric;
  v_subtotal numeric;
  v_igv numeric;
  v_nota_id uuid;
  v_es_total boolean;
begin
  select * into d from devoluciones where id = p_devolucion_id for update;
  if not found then raise exception 'La devolución % no existe', p_devolucion_id; end if;
  if d.estado <> 'pendiente' then raise exception 'Esa devolución ya está %', d.estado; end if;
  if not fn_es_lider() then
    raise exception 'Solo un líder puede aprobar una devolución';
  end if;
  select id into v_persona from personas where auth_user_id = auth.uid();
  v_sub := fn_sububicacion_por_defecto(d.ubicacion_id, 'venta');
  select id into v_caja_id from cajas where ubicacion_id = d.ubicacion_id and estado = 'abierta';

  if p_reembolso_metodo = 'efectivo' and coalesce(p_reembolso_monto, 0) > 0 and v_caja_id is null then
    raise exception 'No hay una caja abierta en esta ubicación — ábrela antes de aprobar un reembolso en efectivo';
  end if;

  for r in select * from devolucion_items where devolucion_id = p_devolucion_id loop
    if r.condicion = 'vendible' then
      insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, devolucion_item_id, usuario_id)
        select vi.variante_id, d.ubicacion_id, v_sub, 'entrada', r.cantidad, 'devolucion', r.id, v_persona
        from venta_items vi where vi.id = r.venta_item_id
        returning id into v_mov_id;
      perform fn_aplicar_movimiento(v_mov_id);
      update devolucion_items set movimiento_id = v_mov_id where id = r.id;
    elsif r.condicion in ('danada_reparacion', 'danada_donar', 'devolver_proveedor') then
      -- 'devolver_proveedor' se suma acá: mismo mecanismo que 'danada_*' —
      -- entra a cuarentena real, visible en Existencias, en vez de no dejar
      -- rastro. `resolver_prenda_danada` la saca de ahí cuando alguien
      -- decide/ejecuta qué pasó con ella.
      if v_sub_cuarentena is null then
        select id into v_sub_cuarentena from sububicaciones where ubicacion_id = d.ubicacion_id and tipo = 'cuarentena';
      end if;
      if v_sub_cuarentena is null then
        raise exception 'Esta ubicación no tiene sububicación de cuarentena configurada';
      end if;
      insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, devolucion_item_id, usuario_id)
        select vi.variante_id, d.ubicacion_id, v_sub_cuarentena, 'entrada', r.cantidad, 'devolucion', r.id, v_persona
        from venta_items vi where vi.id = r.venta_item_id
        returning id into v_mov_id;
      perform fn_aplicar_movimiento(v_mov_id);
      update devolucion_items set movimiento_id = v_mov_id where id = r.id;
      insert into prendas_danadas (variante_id, ubicacion_id, cantidad, devolucion_item_id, movimiento_entrada_id)
        select vi.variante_id, d.ubicacion_id, r.cantidad, r.id, v_mov_id
        from venta_items vi where vi.id = r.venta_item_id;
    end if;
  end loop;

  update devoluciones set estado = 'aprobada', aprobado_por = v_persona, aprobado_en = now(),
                          reembolso_monto = p_reembolso_monto, reembolso_metodo = p_reembolso_metodo,
                          caja_id = v_caja_id
    where id = p_devolucion_id;

  -- El comprobante más reciente y ACEPTADO de esta venta — si nunca llegó a
  -- SUNAT (pendiente/rechazado/no_emitido) o ya está anulado, no hay nada
  -- real que corregir.
  select * into v_comprobante from comprobantes
    where venta_id = d.venta_id and tipo in ('boleta', 'factura') and estado = 'aceptado'
    order by created_at desc limit 1;

  if found then
    select coalesce(sum(vi.precio_unitario * di.cantidad), 0) into v_total_devuelto
      from devolucion_items di join venta_items vi on vi.id = di.venta_item_id
      where di.devolucion_id = p_devolucion_id;

    if v_total_devuelto > 0 then
      -- Si nadie registró todavía la serie de Nota de Crédito de esta
      -- ubicación (Facturación → Registrar serie), `emitir_nota` fallaría
      -- con un mensaje genérico de `fn_reservar_numero_serie` y se llevaría
      -- entre las patas la aprobación entera de la devolución (todo-o-nada,
      -- principio 9 de Jim Gray: mejor bloquear con un mensaje claro ahora
      -- que aprobar la devolución y dejar la Nota de Crédito pendiente para
      -- siempre sin que nadie se entere).
      if not exists (select 1 from series_comprobantes where ubicacion_id = v_comprobante.ubicacion_id and tipo = 'nota_credito') then
        raise exception 'Esta venta tiene un comprobante aceptado por SUNAT — hace falta registrar la serie de Nota de Crédito de esta ubicación en Facturación antes de poder aprobar la devolución.';
      end if;

      -- Catálogo 09 SUNAT: "06" devolución total si esta devolución cubre
      -- exactamente todo lo vendido en la venta original, "07" si es parcial
      -- (simplificación documentada: no mira devoluciones previas sobre la
      -- misma venta, solo si ESTA cubre el 100% de cada línea).
      select not exists (
        select 1 from venta_items vi
        where vi.venta_id = d.venta_id
          and vi.cantidad <> coalesce((
            select di.cantidad from devolucion_items di
            where di.venta_item_id = vi.id and di.devolucion_id = p_devolucion_id
          ), 0)
      ) into v_es_total;

      -- Mismo orden de cálculo que ComprobantesPanel.tsx (onEmitir): IGV
      -- primero (total − total/1.18), subtotal = total − igv. Un orden
      -- distinto redondea distinto en el último centavo.
      v_igv := round(v_total_devuelto - v_total_devuelto / 1.18, 2);
      v_subtotal := round(v_total_devuelto - v_igv, 2);

      v_nota_id := emitir_nota(
        v_comprobante.id, 'nota_credito',
        case when v_es_total then '06' else '07' end,
        v_subtotal, v_igv, v_total_devuelto
      );
      update devoluciones set nota_credito_id = v_nota_id where id = p_devolucion_id;
    end if;
  end if;

  -- Subconsultas escalares, no `... from comprobantes where id = v_nota_id`:
  -- con `v_nota_id` null (no aplicaba Nota de Crédito) un `where` habría
  -- devuelto CERO filas en vez de una fila con nulls.
  return query select
    v_nota_id,
    (select serie from comprobantes where id = v_nota_id),
    (select numero from comprobantes where id = v_nota_id);
end;
$$;

-- ---------- 3. resolver_prenda_danada: el cuarto desenlace pide a mano a quién se le devuelve ----------
-- Cuerpo real más reciente (20260917195508_liquidar_prenda_danada_como_venta.sql
-- le sacó 'liquidada' — esa función exige venta real, vive en
-- `liquidar_prenda_danada`) + 'devuelta_proveedor' sumado como cuarto estado
-- válido, con `p_proveedor_id` nuevo.
--
-- `create or replace` NO alcanza acá: sumar `p_proveedor_id` cambia la lista
-- de tipos de parámetros (uuid,text,text) → (uuid,text,text,uuid), así que
-- Postgres crea una SEGUNDA sobrecarga en vez de reemplazar — mismo bug que
-- ya se encontró y cerró para `registrar_proveedor`/`actualizar_proveedor`
-- (ver 20260918071000). `ResolverDanadosModal.tsx` llama hoy con 3
-- parámetros nombrados (p_id/p_estado/p_nota, sin p_proveedor_id) para
-- "Se botó"/"Donada" — con las dos firmas vivas, esa llamada sería
-- ambigua para PostgREST. Encontrado en esta misma verificación, antes de
-- mezclar con la pantalla real (nunca llegó a probarse en el navegador con
-- esta firma vieja todavía viva).
drop function retail.resolver_prenda_danada(uuid, text, text);
create function retail.resolver_prenda_danada(
  p_id uuid, p_estado text, p_nota text default null, p_proveedor_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare pd prendas_danadas%rowtype; v_persona uuid; v_mov_id uuid; v_sub_cuarentena uuid; v_proveedor_nombre text;
begin
  if p_estado not in ('se_boto', 'donada', 'devuelta_proveedor') then
    raise exception 'Ese estado no se resuelve acá — "Liquidada" necesita precio y forma de pago: usa liquidar_prenda_danada';
  end if;
  if p_estado = 'devuelta_proveedor' and p_proveedor_id is null then
    raise exception 'Decí a qué proveedor se le devuelve para poder resolverlo como "Devuelta al proveedor".';
  end if;
  if p_estado <> 'devuelta_proveedor' and p_proveedor_id is not null then
    raise exception 'Un proveedor solo aplica cuando el estado es "Devuelta al proveedor".';
  end if;
  if p_proveedor_id is not null then
    select nombre into v_proveedor_nombre from proveedores where id = p_proveedor_id;
    if not found then raise exception 'Ese proveedor ya no existe. Recarga la pantalla.'; end if;
  end if;
  if not fn_es_lider() then
    raise exception 'Solo un líder puede resolver una prenda dañada';
  end if;
  select * into pd from prendas_danadas where id = p_id for update;
  if not found then raise exception 'El registro % no existe', p_id; end if;
  if pd.estado <> 'en_cuarentena' then
    raise exception 'Esta prenda ya se resolvió como %', pd.estado;
  end if;
  select id into v_persona from personas where auth_user_id = auth.uid();
  select id into v_sub_cuarentena from sububicaciones where ubicacion_id = pd.ubicacion_id and tipo = 'cuarentena';

  insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, usuario_id, nota)
    values (pd.variante_id, pd.ubicacion_id, v_sub_cuarentena, 'salida', pd.cantidad, 'cuarentena_' || p_estado, v_persona, p_nota)
    returning id into v_mov_id;
  perform fn_aplicar_movimiento(v_mov_id);

  update prendas_danadas set estado = p_estado, movimiento_salida_id = v_mov_id,
                             resuelto_por = v_persona, resuelto_en = now(), nota = p_nota,
                             proveedor_id = p_proveedor_id
    where id = p_id;
end;
$$;
