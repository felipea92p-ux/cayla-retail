-- ============================================================================
-- 20260922151500_comprobantes_cola_de_reintento.sql — CAYLA V2
--
-- D-60 de `docs/datos/DECISIONES-2026-09-21-menu-comercial.md`: «transmisión a SUNAT de lo
-- que emite retail automática al cobrar, con reintento si Lucode/SUNAT no responden — cola
-- visible, y si pasan horas sin transmitir, avisa al líder». ADR-0153 (misma pieza que
-- `20260922150000_venta_asesora_emisor_descuento_lider.sql`).
--
-- QUÉ ES ESTA MIGRACIÓN Y QUÉ NO ES. Esto diseña el ESQUEMA y las DOS RPC que una cola de
-- reintento necesita — no la automatiza. D-8 (Vogels, «todo falla, todo el tiempo») pide decir
-- explícito qué pasa cuando la dependencia externa está caída: acá dice exactamente eso. SE
-- DEGRADA ASÍ, NO PIERDE ESTE DATO: un comprobante que Lucode/SUNAT no aceptaron por un error de
-- red o del proveedor (nunca un rechazo real de SUNAT, que ya tiene su propio estado
-- `rechazado`) queda en `estado = 'pendiente_reintento'`, visible en una cola
-- (`fn_comprobantes_cola_reintento`), con cuántas veces se intentó y hace cuánto — nunca
-- desaparece, nunca se reintenta solo dentro de esta migración, nunca pierde el correlativo que
-- ya reservó.
--
-- LO QUE ESTA TANDA NO CONSTRUYE (a propósito, ver PENDIENTE) porque de verdad necesita
-- infraestructura fuera del alcance de «RPC + esquema»:
--   1. Quién LLAMA a `fn_marcar_reintento_transmision` cuando Lucode falla — hoy
--      `apps/web/app/api/lucode/emitir/route.ts` (línea ~154) deja el comprobante como estaba
--      («No se toca estado: sigue pendiente/rechazado») en vez de marcarlo para la cola. Es un
--      cambio de una línea en un route handler — código de aplicación, fuera del alcance de esta
--      tanda (SOLO backend RPC + esquema).
--   2. El disparo AUTOMÁTICO al cobrar (hoy la transmisión es un botón manual en
--      ComprobantesPanel) — también código de aplicación.
--   3. El reintento PERIÓDICO de lo que queda en la cola, y el aviso al líder cuando pasan
--      horas — ninguna RPC sola puede despertarse sola: Postgres no llama a Lucode (no hay
--      `pg_net`/`http` en este esquema) y no hay un scheduler corriendo. Esto necesita una Edge
--      Function con cron (o un cron de Vercel) que llame periódicamente a
--      `fn_comprobantes_cola_reintento` y dispare `/api/lucode/emitir` por cada fila vencida —
--      infraestructura nueva, fuera de esta tanda.
--
-- QUÉ CAMBIA
--   · `retail.comprobantes.estado` admite un valor nuevo: 'pendiente_reintento'.
--   · 4 columnas de bitácora de intentos (todas nullable/con DEFAULT — no rompen ninguna fila
--     existente ni ninguna lectura actual de `comprobantes`).
--   · `retail.fn_marcar_reintento_transmision(uuid, text)` — nueva RPC de escritura: registra un
--     intento fallido y mueve el comprobante a la cola.
--   · `retail.fn_comprobantes_cola_reintento(uuid)` — nueva RPC de lectura: la cola visible.
--   · `retail.anular_venta` — UN cambio quirúrgico (mismo patrón que
--     `20260921121500_anular_venta_libera_el_comprobante_pendiente.sql`: `create or replace`,
--     misma firma, sin tocar ninguna otra guarda). Hallado al diseñar esto: si una venta con un
--     comprobante YA en la cola de reintento se anula, la liberación a `no_emitido` de esa
--     migración solo miraba `estado = 'pendiente'` — un comprobante `pendiente_reintento`
--     habría sobrevivido a la anulación de su propia venta, reintentando para siempre declarar
--     ante SUNAT una venta que ya no existe. Se agrega `pendiente_reintento` a esa misma
--     liberación, nada más.
--
-- SE ROMPE SI (además de lo ya dicho en la cabecera de `anular_venta`): alguien reintroduce el
-- botón «Transmitir» de `ComprobantesPanel.tsx` para un comprobante `pendiente_reintento` sin
-- primero agregar ese estado a `motivoParaNoTransmitir` (`apps/web/lib/transmision-reglas.ts`,
-- que hoy solo deja pasar `pendiente`/`rechazado`) — quedaría visible en la cola pero
-- intransmisible desde la pantalla. Ver PENDIENTE.
--
-- PENDIENTE (para quien conecte esto — próxima tanda, fuera de «RPC + esquema»):
--   1. `apps/web/app/api/lucode/emitir/route.ts`: en la rama `if (!resultado.ok)`, llamar
--      `fn_marcar_reintento_transmision(fila.id, resultado.detalle ?? resultado.motivo ?? null)`
--      en vez de dejar el estado como estaba.
--   2. `apps/web/lib/transmision-reglas.ts:21` (`motivoParaNoTransmitir`): agregar
--      `c.estado !== "pendiente_reintento"` a la condición que hoy solo acepta
--      `pendiente`/`rechazado`, para que un reintento manual desde la pantalla siga
--      funcionando.
--   3. Disparo automático al cobrar + Edge Function con cron para el reintento periódico y el
--      aviso al líder — infraestructura nueva (fuera de esta tanda).
--
-- Verificado contra el Postgres 17 desechable local (194 migraciones + esta pieza aplicadas
-- antes) — ver cabecera de la migración hermana para el detalle del entorno.
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- 1. comprobantes: nuevo estado + bitácora de intentos ----------

alter table retail.comprobantes drop constraint if exists comprobantes_estado_check;
alter table retail.comprobantes add constraint comprobantes_estado_check
  check (estado = any (array['pendiente', 'enviado', 'aceptado', 'rechazado', 'anulado', 'no_emitido', 'pendiente_reintento']));

-- Mismo criterio que 'pendiente'/'no_emitido': un comprobante que todavía no transmitió con
-- éxito (o que falló antes de recibir ambiente de SUNAT) no tiene por qué tener
-- `entorno_transmision` — sigue NOT VALID, igual que el original (0010/0040): no hay fila
-- existente que viole esto, pero mantiene el mismo criterio de no forzar una revalidación
-- completa de la tabla en cada pegado.
alter table retail.comprobantes drop constraint if exists comprobantes_transmitido_tiene_entorno;
alter table retail.comprobantes add constraint comprobantes_transmitido_tiene_entorno
  check (estado = any (array['pendiente', 'no_emitido', 'pendiente_reintento']) or entorno_transmision is not null) not valid;

alter table retail.comprobantes
  add column if not exists intentos_transmision integer not null default 0,
  add column if not exists ultimo_intento_transmision_at timestamptz,
  add column if not exists ultimo_error_transmision text,
  add column if not exists proximo_reintento_at timestamptz;

alter table retail.comprobantes drop constraint if exists comprobantes_intentos_transmision_no_negativo;
alter table retail.comprobantes add constraint comprobantes_intentos_transmision_no_negativo
  check (intentos_transmision >= 0);

comment on column retail.comprobantes.intentos_transmision is
  'D-60: cuántas veces se intentó transmitir a Lucode/SUNAT y falló (error de red o del proveedor — nunca un RECHAZADO real de SUNAT, que tiene su propio estado). 0 = nunca falló.';
comment on column retail.comprobantes.ultimo_intento_transmision_at is
  'D-60: cuándo fue el último intento fallido — con esto una pantalla calcula "lleva N horas esperando" para avisar al líder (mecanismo de aviso: pendiente, ver cabecera).';
comment on column retail.comprobantes.ultimo_error_transmision is
  'D-60: el detalle del último error (red, credenciales, timeout de Lucode) — nunca un rechazo de SUNAT, eso va en motivo_rechazo.';
comment on column retail.comprobantes.proximo_reintento_at is
  'D-60: cuándo conviene reintentar (backoff simple) — lo usará el cron/Edge Function que todavía no existe (ver PENDIENTE de esta migración).';

create index if not exists comprobantes_pendiente_reintento_idx
  on retail.comprobantes (proximo_reintento_at)
  where estado = 'pendiente_reintento';

-- ---------- 2. fn_marcar_reintento_transmision: registra un intento fallido ----------
create or replace function retail.fn_marcar_reintento_transmision(p_comprobante_id uuid, p_error text)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_ubicacion_id uuid;
  v_estado text;
  v_intentos integer;
begin
  select ubicacion_id, estado, intentos_transmision
    into v_ubicacion_id, v_estado, v_intentos
    from comprobantes where id = p_comprobante_id
    for update;
  if not found then
    raise exception 'El comprobante % no existe', p_comprobante_id;
  end if;
  if not fn_puede_operar_ubicacion(v_ubicacion_id) then
    raise exception 'No tienes permiso para operar ese comprobante';
  end if;
  -- Solo se puede encolar lo que todavía no llegó a un estado final ante SUNAT: un
  -- 'enviado'/'aceptado'/'rechazado'/'anulado'/'no_emitido' NO se pisa (evita que una
  -- respuesta tardía de Lucode que SÍ llegó bien quede sobrescrita por un timeout que
  -- llegó después en el reintento).
  if v_estado not in ('pendiente', 'pendiente_reintento') then
    raise exception 'Este comprobante ya está en estado "%" — no se puede encolar para reintento', v_estado;
  end if;

  update comprobantes set
    estado = 'pendiente_reintento',
    intentos_transmision = v_intentos + 1,
    ultimo_intento_transmision_at = now(),
    ultimo_error_transmision = nullif(btrim(coalesce(p_error, '')), ''),
    -- Backoff simple: 15 minutos por intento, tope de 2 horas — evita machacar a Lucode en
    -- una caída larga sin necesitar una tabla de configuración para esto todavía.
    proximo_reintento_at = now() + least((v_intentos + 1) * interval '15 minutes', interval '2 hours')
  where id = p_comprobante_id;
end;
$$;
grant execute on function retail.fn_marcar_reintento_transmision(uuid, text) to authenticated;

-- ---------- 3. fn_comprobantes_cola_reintento: la cola visible ----------
-- Sin `p_ubicacion_id`: solo un líder ve la cola consolidada de todas las sedes (mismo criterio
-- que D-68 aplica a métricas — Felipe/líder ven más que una sede). Con `p_ubicacion_id`: filtra
-- a esa ubicación y exige el mismo candado que el resto del esquema.
create or replace function retail.fn_comprobantes_cola_reintento(p_ubicacion_id uuid default null)
returns table (
  comprobante_id uuid,
  ubicacion_id uuid,
  tipo text,
  serie text,
  numero integer,
  venta_id uuid,
  intentos_transmision integer,
  ultimo_intento_transmision_at timestamptz,
  ultimo_error_transmision text,
  horas_esperando numeric
)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if p_ubicacion_id is null then
    if not fn_es_lider() then
      raise exception 'Solo un líder puede ver la cola de reintento de todas las sedes';
    end if;
  elsif not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para consultar esa ubicación';
  end if;

  return query
    select
      c.id, c.ubicacion_id, c.tipo, c.serie, c.numero, c.venta_id,
      c.intentos_transmision, c.ultimo_intento_transmision_at, c.ultimo_error_transmision,
      round(extract(epoch from (now() - c.ultimo_intento_transmision_at)) / 3600, 1)
    from comprobantes c
    where c.estado = 'pendiente_reintento'
      and (p_ubicacion_id is null or c.ubicacion_id = p_ubicacion_id)
    order by c.ultimo_intento_transmision_at asc nulls first;
end;
$$;
grant execute on function retail.fn_comprobantes_cola_reintento(uuid) to authenticated;

-- ---------- 4. anular_venta: libera también un comprobante en la cola de reintento ----------
-- Cuerpo idéntico al de `20260921121500_anular_venta_libera_el_comprobante_pendiente.sql`
-- salvo la única línea marcada abajo. `create or replace` en el mismo lugar (misma firma):
-- ningún llamador cambia, ningún permiso de EXECUTE se toca.
create or replace function retail.anular_venta(
  p_venta_id uuid, p_motivo text, p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_venta ventas%rowtype;
  v_caja_estado text;
  v_persona uuid;
  v_item jsonb;
  v_venta_item venta_items%rowtype;
  v_salida movimientos%rowtype;
  v_salidas integer;
  v_mov_id uuid;
  v_condicion text;
  v_items_venta integer;
  v_items_input integer;
  v_items_distintos integer;
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder puede anular una venta';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Anular una venta necesita un motivo';
  end if;

  -- `for update` primero: una devolución o un cambio de esta misma venta que llegue al
  -- mismo tiempo espera acá (su disparador pide `for share` sobre esta fila).
  select * into v_venta from ventas where id = p_venta_id for update;
  if not found then
    raise exception 'La venta % no existe', p_venta_id;
  end if;
  if v_venta.estado = 'anulada' then
    raise exception 'Esta venta ya está anulada';
  end if;

  if v_venta.caja_id is null then
    raise exception 'Esta venta no tiene caja registrada — no se puede confirmar que sigue abierta';
  end if;
  select estado into v_caja_estado from cajas where id = v_venta.caja_id;
  if v_caja_estado is distinct from 'abierta' then
    raise exception 'La caja de esta venta ya cerró — a partir de ahí, usa Cambio o Devolución';
  end if;

  if exists (
    select 1 from comprobantes where venta_id = p_venta_id and estado in ('enviado', 'aceptado')
  ) then
    raise exception 'Esta venta ya tiene un comprobante enviado o aceptado por SUNAT — usa Cambio o Devolución en su lugar';
  end if;

  -- Un ítem ya tocado por Cambios o Devoluciones no puede volver a contarse acá:
  -- anular movería stock de nuevo sobre una cantidad que ese otro camino ya movió.
  if exists (
    select 1 from venta_items vi
    where vi.venta_id = p_venta_id
      and (
        exists (select 1 from cambios ca where ca.venta_item_id = vi.id)
        or exists (
          select 1 from devolucion_items di join devoluciones d on d.id = di.devolucion_id
          where di.venta_item_id = vi.id and d.estado <> 'rechazada'
        )
      )
  ) then
    raise exception 'Esta venta ya tiene un cambio o una devolución registrada — resuelve sus ítems por separado en vez de anular la venta completa';
  end if;

  -- Cada línea de la venta, una vez cada una. Contar solo cuántas llegan dejaba pasar
  -- una línea repetida en lugar de otra.
  select count(*) into v_items_venta from venta_items where venta_id = p_venta_id;
  select count(*), count(distinct e ->> 'venta_item_id')
    into v_items_input, v_items_distintos
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e;
  if v_items_input <> v_items_venta or v_items_distintos <> v_items_venta then
    raise exception 'Anular una venta necesita la condición de cada una de sus % líneas, una vez cada una (llegaron %)',
      v_items_venta, v_items_input;
  end if;

  select id into v_persona from public.personas where auth_user_id = auth.uid();

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_venta_item from venta_items
      where id = (v_item ->> 'venta_item_id')::uuid and venta_id = p_venta_id;
    if not found then
      raise exception 'El ítem % no pertenece a la venta %', v_item ->> 'venta_item_id', p_venta_id;
    end if;
    v_condicion := v_item ->> 'condicion';
    v_mov_id := null;

    if v_condicion = 'vendible' then
      select count(*) into v_salidas from movimientos
        where venta_item_id = v_venta_item.id and tipo = 'salida' and motivo = 'venta';
      if v_salidas <> 1 then
        raise exception 'La línea % tiene % salidas de stock por venta registradas (se esperaba 1) — esta venta necesita revisarse a mano, no anularse',
          v_venta_item.id, v_salidas;
      end if;
      select * into v_salida from movimientos
        where venta_item_id = v_venta_item.id and tipo = 'salida' and motivo = 'venta';

      insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, venta_item_id, usuario_id)
        values (v_salida.variante_id, v_salida.ubicacion_id, v_salida.sububicacion_id, 'entrada', v_salida.cantidad,
                'anulacion_venta', v_venta_item.id, v_persona)
        returning id into v_mov_id;
      perform fn_aplicar_movimiento(v_mov_id);
    end if;

    insert into venta_anulacion_items (venta_id, venta_item_id, condicion, movimiento_id)
      values (p_venta_id, v_venta_item.id, v_condicion, v_mov_id);
  end loop;

  update ventas set estado = 'anulada', motivo_anulacion = p_motivo, anulado_por = v_persona, anulado_en = now()
    where id = p_venta_id;

  -- Un comprobante PENDIENTE (o ya en la cola de reintento — D-60, agregado acá) de esta venta
  -- reservó su número pero nunca se transmitió con éxito. Con la venta anulada no hay nada que
  -- declarar: se libera igual que «Liberar sin espera» (ADR-0093). El número queda sin usar.
  --   · Uno `rechazado` NO se toca: ya llegó a SUNAT (ADR-0093).
  --   · Uno `enviado` o `aceptado` no llega hasta acá: frenó la anulación más arriba.
  --   · Los que ya estaban `no_emitido` o `anulado` quedan como estaban.
  update comprobantes set
      estado = 'no_emitido',
      motivo_no_emitido = 'Venta anulada: ' || btrim(p_motivo),
      marcado_no_emitido_por = v_persona,
      marcado_no_emitido_at = now()
    where venta_id = p_venta_id and estado in ('pendiente', 'pendiente_reintento');
end;
$$;
