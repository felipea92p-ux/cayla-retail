-- ============================================================================
-- 20261009120000_corregir_pagos_venta.sql — CAYLA V2 (ADR-0365)
--
-- EL PROBLEMA PRIMERO. En la caja se marca «Efectivo» cuando la persona pagó con Yape (o al revés), y al cerrar el cajón no cuadra:
-- el sistema espera billetes que nunca entraron. Hasta hoy no había cómo arreglarlo: `venta_pagos` solo se escribe al cobrar, y la
-- única salida era anular la venta (solo el líder, solo el día) y volver a cobrarla, con otro comprobante. Felipe 2026-10-09: se
-- corrige desde Ventas ▸ Historial, MIENTRAS LA CAJA DE ESA VENTA SIGUE ABIERTA, repartiendo libre el monto entre los medios.
--
-- CONTRATO (Liskov)
--   PROMETE: `corregir_pagos_venta(p_venta_id, p_pagos, p_motivo) → jsonb` con los pagos que quedaron.
--            · La suma de lo cobrado NO cambia: los nuevos pagos suman exactamente lo que sumaban los de antes (sin el adelanto de un
--              apartado, que no se toca). Por eso la venta, el comprobante, el IGV y el diario contable siguen cuadrando.
--            · El redondeo del efectivo (ADR-0311) lo calcula la base: si queda un pago en efectivo y la caja redondea, se cobra al
--              múltiplo de S/ 0.10 hacia abajo y la diferencia va en su fila `redondeo`; si ya no hay efectivo, no hay redondeo.
--            · Lo de antes no se pierde: la foto completa de las filas reemplazadas (con su cuenta sellada) y las nuevas queda en
--              `venta_pagos_correcciones` (solo se agrega) y en Actividad (módulo «Historial de ventas»).
--            · Cada cobro nuevo se sella con la cuenta de su medio (`venta_pagos_sellar_cuenta`): un Yape no queda en el cajón.
--   ASUME:   la cuenta ve «historial» (`fn_exigir_modulo`, antes de resolver al responsable); firma el responsable del combo
--            (`fn_actor_persona_id(true)`, ADR-0162); la venta es de la sede donde está la persona, o quien corrige es líder.
--   FALLA:   `venta_no_existe`, `venta_anulada`, `venta_sin_caja`, `caja_cerrada` (ya se hizo el arqueo: se corrige con un ingreso o
--            egreso de caja, ADR-0186), `pagos_invalidos` (medio, monto o suma), `efectivo_muy_chico` (menos de S/ 0.10 no se
--            entrega), `pagos_sin_cambios` (lo pedido es lo que ya estaba: un doble clic cae aquí y la web lo toma como hecho).
--   NO HACE: no toca la venta, sus prendas, el comprobante ni lo enviado a SUNAT (Lucode no recibe el medio de pago: lib/lucode.ts,
--            `payloadDe`), ni el adelanto de un apartado, ni el vuelto: el «recibido» de antes ya no dice nada y queda vacío.
--
-- ESTADOS IMPOSIBLES (Lamport). (1) La caja se lee `for update`: `cerrar_caja` también la bloquea, así que una corrección y un cierre
-- se turnan — nunca se corrige una venta cuyo arqueo ya quedó guardado en `cajas.monto_cierre_sistema`. (2) La venta también va
-- `for update`: dos pestañas corrigiendo la misma venta se turnan y la segunda ve los pagos de la primera. (3) La suma se compara en
-- `numeric`, exacta, sin tolerancia.
--
-- TRANSACCIÓN (Gray). Foto, borrado de las filas viejas, filas nuevas y anotación: todo o nada, en la misma función.
--
-- DECIDÍ: reemplazar las filas (borrar + insertar) dejando la foto completa en una tabla que solo agrega. `venta_pagos` la leen en vivo
--   la caja, los totales del historial, el libro del dinero y el diario: una fila «tachada» obligaría a filtrarla en cada una de esas
--   funciones, y la que se olvide contaría el efectivo dos veces. El dato no se pierde: vive en `venta_pagos_correcciones.antes`.
-- DESCARTÉ: `update` del medio en la misma fila. El sello de la cuenta no cambia por diseño (`fn_venta_pagos_sellar`) y un Yape
--   quedaría guardado en el cajón; y con un reparto nuevo cambia la cantidad de filas igual.
-- DESCARTÉ: permitirlo con la caja cerrada. El arqueo ya guardó «lo que el sistema esperaba»: el cierre quedaría contradiciendo los
--   pagos. Para eso está el ingreso/egreso de caja del líder.
-- SE ROMPE SI alguien agrega un medio que no suma lo cobrado (un vale, puntos) como fila de `venta_pagos` sin sumarlo a `v_fijos`.
--
-- PRODUCCIÓN. Una sola parte, idempotente: una tabla NUEVA (RLS encendido y SIN políticas: solo la leen y escriben funciones
-- `security definer`), su disparador `create or replace trigger` (nunca `drop trigger`), y dos funciones. No toca tablas en uso ni
-- crea políticas: ADR-0195 no aplica. `fn_sello_caja` se reemplaza entera (su única versión es 20260924140000) sumándole el conteo
-- de correcciones, para que el tablero de Caja en vivo se entere. Pegar ANTES de publicar la web: sin la función, el botón
-- «Corregir pago» responde «todavía no está disponible» y nada más.
--
-- VERIFICACIÓN (solo lectura):
--   select to_regprocedure('retail.corregir_pagos_venta(uuid,jsonb,text)') is not null,
--          to_regclass('retail.venta_pagos_correcciones') is not null;          → t | t
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. La foto de cada corrección (solo se agrega) ----------
create table if not exists retail.venta_pagos_correcciones (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references retail.ventas (id),
  caja_id uuid not null references retail.cajas (id),
  -- Quién corrigió: el responsable que firmó (ADR-0162).
  persona_id uuid references public.personas (id),
  terminal_id uuid references retail.terminales (id),
  motivo text check (motivo is null or length(btrim(motivo)) between 1 and 200),
  -- Las filas de `venta_pagos` reemplazadas, completas (id, metodo, monto, recibido, referencia, cuenta_dinero_id).
  antes jsonb not null,
  -- Las filas que quedaron.
  despues jsonb not null,
  creado_en timestamptz not null default now()
);

create index if not exists venta_pagos_correcciones_venta_idx on retail.venta_pagos_correcciones (venta_id);
create index if not exists venta_pagos_correcciones_caja_idx on retail.venta_pagos_correcciones (caja_id);

-- Sin políticas: la escribe `corregir_pagos_venta` y la lee el sello de caja, las dos `security definer`.
alter table retail.venta_pagos_correcciones enable row level security;

create or replace function retail.fn_venta_pagos_correcciones_inmutable() returns trigger
language plpgsql set search_path = retail, public, extensions as $$
begin
  raise exception 'Una corrección de pagos queda como se hizo: no se edita ni se borra.' using errcode = 'P0001';
end $$;

create or replace trigger venta_pagos_correcciones_inmutable before update or delete on retail.venta_pagos_correcciones
  for each row execute function retail.fn_venta_pagos_correcciones_inmutable();

comment on table retail.venta_pagos_correcciones is
  'ADR-0365: cada corrección del medio de pago de una venta con la caja abierta. Guarda las filas de venta_pagos reemplazadas (antes) y las nuevas (despues). Solo se agrega.';

-- ---------- 2. La corrección ----------
create or replace function retail.corregir_pagos_venta(p_venta_id uuid, p_pagos jsonb, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  c_medios constant text[] := array['efectivo', 'tarjeta', 'qr', 'yape', 'plin', 'transferencia'];
  v_persona uuid;
  v_venta retail.ventas%rowtype;
  v_caja_estado text;
  v_objetivo numeric;
  v_suma numeric;
  v_n integer;
  v_efectivo numeric;
  v_redondeo numeric := 0;
  v_antes jsonb;
  v_antes_cmp jsonb;
  v_despues jsonb;
  v_despues_cmp jsonb;
  v_nuevos jsonb;
  v_terminal uuid;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_comprobante text;
  e jsonb;
begin
  -- Es una función del Historial de ventas: se pregunta a la CUENTA, antes de resolver quién firma.
  perform retail.fn_exigir_modulo('historial');
  v_persona := retail.fn_actor_persona_id(true);
  -- Desde qué terminal compartida, si fue desde una (o nada).
  v_terminal := (select t.id from retail.fn_terminal_actual() t limit 1);

  select * into v_venta from retail.ventas where id = p_venta_id for update;
  if v_venta.id is null then
    raise exception 'Esa venta ya no existe — actualiza la pantalla.' using errcode = 'P0001', hint = 'venta_no_existe';
  end if;
  if not coalesce(retail.fn_es_lider() or v_venta.ubicacion_id = retail.fn_ubicacion_actual_persona(), false) then
    raise exception 'Esta venta es de otra tienda: la corrige alguien de esa tienda o un líder.' using errcode = '42501', hint = 'venta_de_otra_sede';
  end if;
  if v_venta.estado = 'anulada' then
    raise exception 'Esta venta está anulada: no tiene pagos que corregir.' using errcode = 'P0001', hint = 'venta_anulada';
  end if;
  if v_venta.caja_id is null then
    raise exception 'Esta venta no pasó por una caja: no hay cuadre que corregir.' using errcode = 'P0001', hint = 'venta_sin_caja';
  end if;

  -- La caja bloqueada: `cerrar_caja` también la bloquea, así que el cierre y la corrección se turnan.
  v_caja_estado := (select c.estado from retail.cajas c where c.id = v_venta.caja_id for update);
  if v_caja_estado is distinct from 'abierta' then
    raise exception 'La caja de esta venta ya se cerró: el pago ya no se corrige aquí. El líder lo ajusta con un ingreso o egreso de caja.'
      using errcode = 'P0001', hint = 'caja_cerrada';
  end if;

  -- Lo que se reparte: todo lo cobrado menos el adelanto de un apartado (ese no se toca). Incluye el redondeo: vuelve a calcularse.
  v_objetivo := (select coalesce(sum(p.monto), 0) from retail.venta_pagos p where p.venta_id = p_venta_id and p.metodo <> 'anticipo');
  if v_objetivo <= 0 then
    raise exception 'Esta venta se pagó entera con el adelanto del apartado: no hay otro pago que corregir.' using errcode = 'P0001', hint = 'pagos_invalidos';
  end if;

  -- Validar lo pedido: una lista de 1 a 6 medios distintos, cada uno con un monto positivo de hasta dos decimales.
  if p_pagos is null or jsonb_typeof(p_pagos) <> 'array' then
    raise exception 'Faltan los pagos.' using errcode = '22023', hint = 'pagos_invalidos';
  end if;
  v_n := jsonb_array_length(p_pagos);
  if v_n < 1 or v_n > array_length(c_medios, 1) then
    raise exception 'Indica entre uno y seis medios de pago.' using errcode = '22023', hint = 'pagos_invalidos';
  end if;
  for e in select * from jsonb_array_elements(p_pagos) loop
    if jsonb_typeof(e) <> 'object' or not (e ->> 'metodo' = any (c_medios)) then
      raise exception 'Ese medio de pago no existe: %.', coalesce(e ->> 'metodo', '(vacío)') using errcode = '22023', hint = 'pagos_invalidos';
    end if;
    if jsonb_typeof(e -> 'monto') <> 'number' or (e ->> 'monto')::numeric <= 0 or (e ->> 'monto')::numeric <> round((e ->> 'monto')::numeric, 2) then
      raise exception 'Cada pago lleva un monto mayor que cero, con hasta dos decimales.' using errcode = '22023', hint = 'pagos_invalidos';
    end if;
  end loop;
  if (select count(distinct x ->> 'metodo') from jsonb_array_elements(p_pagos) x) <> v_n then
    raise exception 'Cada medio va una sola vez.' using errcode = '22023', hint = 'pagos_invalidos';
  end if;
  v_suma := (select sum((x ->> 'monto')::numeric) from jsonb_array_elements(p_pagos) x);
  if v_suma <> v_objetivo then
    raise exception 'Los pagos suman S/ % y lo cobrado fue S/ %: tienen que dar lo mismo.', v_suma, v_objetivo
      using errcode = '22023', hint = 'pagos_invalidos';
  end if;

  -- El redondeo del efectivo (ADR-0311), si la caja redondea: se cobra hacia abajo al múltiplo de S/ 0.10.
  v_efectivo := (select (x ->> 'monto')::numeric from jsonb_array_elements(p_pagos) x where x ->> 'metodo' = 'efectivo');
  if v_efectivo is not null
     and to_regprocedure('retail.fn_acepta_redondeo_efectivo()') is not null
     and retail.fn_acepta_redondeo_efectivo() then
    v_redondeo := retail.fn_redondeo_efectivo(v_efectivo);
    if v_efectivo - v_redondeo <= 0 then
      raise exception 'Un efectivo menor de S/ 0.10 no se puede entregar: pásalo a otro medio.' using errcode = '22023', hint = 'efectivo_muy_chico';
    end if;
  end if;

  -- Cómo quedaría, comparable con lo que hay (medio → monto, con el redondeo como una fila más).
  v_despues_cmp := (
    select jsonb_object_agg(m, monto order by m) from (
      select x ->> 'metodo' as m,
             (x ->> 'monto')::numeric - case when x ->> 'metodo' = 'efectivo' then v_redondeo else 0 end as monto
        from jsonb_array_elements(p_pagos) x
      union all
      select 'redondeo', v_redondeo where v_redondeo > 0
    ) s
  );
  v_antes_cmp := (
    select jsonb_object_agg(p.metodo, p.monto order by p.metodo)
      from retail.venta_pagos p where p.venta_id = p_venta_id and p.metodo <> 'anticipo'
  );
  if v_antes_cmp = v_despues_cmp then
    raise exception 'Los pagos ya estaban así: no hubo nada que cambiar.' using errcode = 'P0001', hint = 'pagos_sin_cambios';
  end if;

  -- La foto de lo que se reemplaza, completa.
  v_antes := (
    select jsonb_agg(jsonb_build_object('id', p.id, 'metodo', p.metodo, 'monto', p.monto, 'recibido', p.recibido,
                                        'referencia', p.referencia, 'cuenta_dinero_id', p.cuenta_dinero_id) order by p.metodo)
      from retail.venta_pagos p where p.venta_id = p_venta_id and p.metodo <> 'anticipo'
  );

  -- Las filas nuevas. Un número de operación de Yape/Plin/transferencia se conserva si ese medio sigue; el «recibido» no (el vuelto
  -- de antes ya no dice nada). El disparador sella la cuenta de cada medio al insertar.
  v_nuevos := (
    select jsonb_agg(jsonb_build_object('metodo', n.metodo, 'monto', n.monto, 'referencia', n.referencia)) from (
      select x ->> 'metodo' as metodo,
             (x ->> 'monto')::numeric - case when x ->> 'metodo' = 'efectivo' then v_redondeo else 0 end as monto,
             (select p.referencia from retail.venta_pagos p
               where p.venta_id = p_venta_id and p.metodo = x ->> 'metodo' and p.metodo in ('yape', 'plin', 'transferencia') limit 1) as referencia
        from jsonb_array_elements(p_pagos) x
      union all
      select 'redondeo', v_redondeo, null where v_redondeo > 0
    ) n
  );

  delete from retail.venta_pagos p where p.venta_id = p_venta_id and p.metodo <> 'anticipo';
  insert into retail.venta_pagos (venta_id, metodo, monto, referencia)
  select p_venta_id, n ->> 'metodo', (n ->> 'monto')::numeric, n ->> 'referencia' from jsonb_array_elements(v_nuevos) n;

  v_despues := (
    select jsonb_agg(jsonb_build_object('id', p.id, 'metodo', p.metodo, 'monto', p.monto, 'referencia', p.referencia,
                                        'cuenta_dinero_id', p.cuenta_dinero_id) order by p.metodo)
      from retail.venta_pagos p where p.venta_id = p_venta_id and p.metodo <> 'anticipo'
  );

  insert into retail.venta_pagos_correcciones (venta_id, caja_id, persona_id, terminal_id, motivo, antes, despues)
  values (p_venta_id, v_venta.caja_id, v_persona, v_terminal, v_motivo, v_antes, v_despues);

  v_comprobante := (
    select c.serie || '-' || lpad(c.numero::text, 6, '0') from retail.comprobantes c
     where c.venta_id = p_venta_id and c.comprobante_original_id is null order by c.created_at limit 1
  );
  perform retail.fn_actividad_anotar(
    'historial', 'pagos_corregidos',
    'corrigió el pago de ' || coalesce('la venta ' || v_comprobante, 'una venta') || ' de ' || retail.fn_actividad_soles(v_objetivo)
      || coalesce(' · motivo: ' || v_motivo, ''),
    v_persona, v_terminal, v_venta.ubicacion_id, null, 'ventas', p_venta_id::text, now(),
    jsonb_build_object('antes', v_antes_cmp, 'despues', v_despues_cmp, 'comprobante', v_comprobante, 'motivo', v_motivo),
    'vivo'
  );

  return v_despues;
end;
$$;

comment on function retail.corregir_pagos_venta(uuid, jsonb, text) is
  'ADR-0365: corrige cómo se pagó una venta mientras su caja sigue abierta. Los pagos nuevos suman lo mismo que los de antes (sin el adelanto de un apartado); la base calcula el redondeo del efectivo y sella la cuenta de cada medio. Deja la foto en venta_pagos_correcciones y en Actividad.';

revoke all on function retail.corregir_pagos_venta(uuid, jsonb, text) from public, anon;
grant execute on function retail.corregir_pagos_venta(uuid, jsonb, text) to authenticated;

-- ---------- 3. Roles y accesos dice que Historial ahora también corrige el pago ----------
-- Es una función DENTRO del módulo (ADR-0306), no un módulo nuevo: quien ve Historial la hace. Solo cambia la frase.
update retail.modulos
   set incluye = 'Consultar, reimprimir, exportar y corregir el pago mientras la caja siga abierta'
 where clave = 'historial';

-- ---------- 4. Caja en vivo se entera de una corrección ----------
-- Igual que 20260924140000 con un sexto conteo: las correcciones de pago de ESTA caja (el efectivo esperado cambió).
create or replace function retail.fn_sello_caja(p_caja_id uuid)
returns text
language plpgsql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
declare
  v_ubicacion uuid;
begin
  select c.ubicacion_id into v_ubicacion from cajas c where c.id = p_caja_id;
  if not found or not coalesce(fn_es_lider() or v_ubicacion = fn_ubicacion_actual_persona(), false) then
    raise exception 'No tienes permiso sobre esa caja' using errcode = '42501';
  end if;
  return concat_ws(':',
    (select count(*) from ventas v where v.caja_id = p_caja_id),
    (select count(*) from ventas v where v.caja_id = p_caja_id and v.estado = 'anulada'),
    (select count(*) from caja_movimientos m where m.caja_id = p_caja_id),
    (select count(*) from devoluciones d where d.caja_id = p_caja_id),
    (select count(*) from cambios cb where cb.caja_id = p_caja_id),
    (select count(*) from venta_pagos_correcciones vc where vc.caja_id = p_caja_id)
  );
end;
$$;

comment on function retail.fn_sello_caja(uuid) is
  'Sello corto de una caja para el tablero en vivo: cambia al entrar, anularse o moverse algo, y al corregirse el pago de una venta (ADR-0191, ADR-0365).';

revoke all on function retail.fn_sello_caja(uuid) from public, anon;
grant execute on function retail.fn_sello_caja(uuid) to authenticated;

-- ¿SE PEGÓ ENTERO? Última instrucción del archivo: si no ves esta fila con «QUEDÓ BIEN», el texto se pegó cortado. Es seguro repetirlo.
select '20261009120000 · corregir el pago de una venta' as parte,
       case when to_regprocedure('retail.corregir_pagos_venta(uuid,jsonb,text)') is not null
             and to_regclass('retail.venta_pagos_correcciones') is not null
            then 'QUEDÓ BIEN' else 'REVISAR: falta la función o la tabla' end as resultado;
