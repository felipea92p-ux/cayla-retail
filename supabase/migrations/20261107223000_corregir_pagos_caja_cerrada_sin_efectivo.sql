-- ============================================================================
-- 20261107223000_corregir_pagos_caja_cerrada_sin_efectivo.sql — CAYLA V2 (ADR-0630)
--
-- EL PROBLEMA PRIMERO. Al cruzar los reportes de Izipay y Vendemás con el ERP (2026-11-07) aparecieron cobros con el medio o la
-- máquina mal anotados: el cliente paga «con Yape» escaneando el QR de Izipay y la vendedora marca «Yape» (el ERP espera la plata en
-- BCP y llega a Interbank), o una tarjeta pasa por la máquina de Izipay y se anota en la de Vendemás. Esos errores se descubren al
-- cuadrar, días después, con la caja ya cerrada, y `corregir_pagos_venta` (ADR-0365) los rechazaba con `caja_cerrada`. El candado
-- existía para no contradecir el arqueo, pero el arqueo solo guarda EFECTIVO (`cajas.monto_cierre_sistema/real/diferencia`): pasar
-- un Yape a QR no lo toca. Y tampoco se podía cambiar de máquina: las dos son «tarjeta», así que la corrección parecía «sin cambios».
--
-- CONTRATO (cambia solo lo de abajo; lo demás de ADR-0365 sigue igual)
--   PROMETE: · Con la caja CERRADA, un líder puede corregir lo que no es efectivo. El efectivo (y su redondeo) tiene que quedar
--              exactamente igual, céntimo por céntimo; si cambia, `caja_cerrada` como antes.
--            · Cada pago puede traer `cuenta_dinero_id`: la cuenta (la máquina) a la que entró. Sin ella, la de su medio en esa tienda
--              EL DÍA DE LA VENTA (antes se tomaba la de hoy). Cambiar solo la máquina ya es un cambio.
--            · Toda corrección exige que el mes de la venta esté abierto (`fn_exigir_mes_abierto`): el diario lee `venta_pagos` en vivo.
--   ASUME:   lo de ADR-0365; `fn_cuenta_sellada` valida la cuenta elegida (tipo, máquina que cobra ese medio en esa tienda).
--   FALLA:   lo de ADR-0365, más `caja_cerrada` (cerrada y no es líder, o cambia el efectivo), `periodo_cerrado`, y `pagos_invalidos`
--            si el efectivo trae cuenta (va siempre al cajón) o la cuenta no es un uuid.
--   NO HACE: no toca depósitos ya registrados de las máquinas. Si la corrección mueve plata de un día cuyo depósito ya se registró, la
--            puente queda con un residuo; con ADR-0629 (Fase A) uno positivo vuelve a «pendiente»; uno negativo NO se ve (ADR-0630, SE ROMPE SI 1).
--
-- DECIDÍ: reducir el candado a lo que protege (el efectivo contado), en vez de abrirlo entero o de inventar otra puerta.
-- DESCARTÉ: un asiento de reclasificación entre cuentas (BCP → puente) sin tocar la venta: la venta diría «Yape» para siempre y la
--   puente recibiría una línea sin día ni tienda que ningún depósito sabe cubrir. La foto de lo que había queda igual en
--   `venta_pagos_correcciones`, que solo agrega (Helland: lo de antes no se pierde).
-- SE ROMPE SI: alguien agrega al arqueo un medio que no es efectivo (p. ej. guardar al cerrar lo cobrado por tarjeta): entonces esa
--   cifra también tiene que quedar fija con la caja cerrada.
--
-- PRODUCCIÓN. Una sola parte, idempotente: reemplaza una función (no toca tablas ni políticas: ADR-0195 no aplica). Candado de huellas:
-- aborta si producción tiene otra versión que las dos conocidas (la del repo y la pegada, que solo difiere en comentarios).
--
-- VERIFICACIÓN (solo lectura):
--   select pg_get_functiondef('retail.corregir_pagos_venta(uuid,jsonb,text)'::regprocedure) like '%v_caja_cerrada%';   → t
-- Pruebas: `pnpm pruebas:corregir-pagos-caja-cerrada`.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $candado$
declare
  v_def text := pg_get_functiondef('retail.corregir_pagos_venta(uuid,jsonb,text)'::regprocedure);
  v_md5 text := md5(v_def);
begin
  -- Ya aplicada (pegarla dos veces no hace daño) o una de las dos versiones conocidas; cualquier otra, se frena.
  if v_def not like '%v_caja_cerrada%' and v_md5 not in (
    'c3d9956483c11f1ccce57a739017eea7',  -- la que arman las migraciones del repo
    '1452a3cdaeaeffd38fbf950ba8da9d84'   -- la de producción (misma lógica, sin algunos comentarios)
  ) then
    raise exception 'corregir_pagos_venta tiene una versión desconocida (md5 %): revisa qué la cambió antes de pegar esto.', v_md5;
  end if;
end
$candado$;

create or replace function retail.corregir_pagos_venta(p_venta_id uuid, p_pagos jsonb, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $function$
declare
  c_medios constant text[] := array['efectivo', 'tarjeta', 'qr', 'yape', 'plin', 'transferencia'];
  v_persona uuid;
  v_venta retail.ventas%rowtype;
  v_fecha date;
  v_caja_cerrada boolean;
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
  v_fecha := (v_venta.created_at at time zone 'America/Lima')::date;

  -- La caja bloqueada: `cerrar_caja` también la bloquea, así que el cierre y la corrección se turnan.
  v_caja_cerrada := (select c.estado from retail.cajas c where c.id = v_venta.caja_id for update) is distinct from 'abierta';
  -- Con la caja cerrada, solo un líder (un permiso nulo no pasa). Que el efectivo no cambie se mira más abajo, con lo pedido.
  if v_caja_cerrada and not coalesce(retail.fn_es_lider(), false) then
    raise exception 'La caja de esta venta ya se cerró: el pago lo corrige un líder.' using errcode = 'P0001', hint = 'caja_cerrada';
  end if;
  -- El diario lee los pagos en vivo: un mes cerrado no se mueve.
  perform retail.fn_exigir_mes_abierto(v_venta.ubicacion_id, v_fecha, null, 'corregir el pago de esta venta');

  -- Lo que se reparte: todo lo cobrado menos el adelanto de un apartado (ese no se toca). Incluye el redondeo: vuelve a calcularse.
  v_objetivo := (select coalesce(sum(p.monto), 0) from retail.venta_pagos p where p.venta_id = p_venta_id and p.metodo <> 'anticipo');
  if v_objetivo <= 0 then
    raise exception 'Esta venta se pagó entera con el adelanto del apartado: no hay otro pago que corregir.' using errcode = 'P0001', hint = 'pagos_invalidos';
  end if;

  -- Validar lo pedido: una lista de 1 a 6 medios distintos, cada uno con un monto positivo de hasta dos decimales y, si se dice,
  -- la cuenta a la que entró (un uuid; el efectivo no la lleva: va siempre al cajón de la tienda).
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
    if e ? 'cuenta_dinero_id' and jsonb_typeof(e -> 'cuenta_dinero_id') <> 'null' then
      if e ->> 'metodo' = 'efectivo' then
        raise exception 'El efectivo entra al cajón de la tienda: no lleva cuenta.' using errcode = '22023', hint = 'pagos_invalidos';
      end if;
      if jsonb_typeof(e -> 'cuenta_dinero_id') <> 'string'
         or e ->> 'cuenta_dinero_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'La cuenta del pago no es válida. Recarga la pantalla.' using errcode = '22023', hint = 'pagos_invalidos';
      end if;
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

  -- Las filas nuevas, con su cuenta ya resuelta: la elegida (validada) o la de su medio en esa tienda el día de la venta. Un número
  -- de operación de Yape/Plin/transferencia se conserva si ese medio sigue; el «recibido» no (el vuelto de antes ya no dice nada).
  v_nuevos := (
    select jsonb_agg(jsonb_build_object('metodo', n.metodo, 'monto', n.monto, 'referencia', n.referencia,
                                        'cuenta_dinero_id', retail.fn_cuenta_sellada('cobro', n.metodo, v_venta.ubicacion_id, v_fecha, n.elegida)))
      from (
        select x ->> 'metodo' as metodo,
               (x ->> 'monto')::numeric - case when x ->> 'metodo' = 'efectivo' then v_redondeo else 0 end as monto,
               (select p.referencia from retail.venta_pagos p
                 where p.venta_id = p_venta_id and p.metodo = x ->> 'metodo' and p.metodo in ('yape', 'plin', 'transferencia') limit 1) as referencia,
               nullif(x ->> 'cuenta_dinero_id', '')::uuid as elegida
          from jsonb_array_elements(p_pagos) x
        union all
        select 'redondeo', v_redondeo, null, null where v_redondeo > 0
      ) n
  );

  -- Lo de antes y lo de después, comparables: medio → monto (lo que muestra Actividad) y medio → monto + cuenta (lo que decide si
  -- hubo cambio: pasar una tarjeta de una máquina a otra lo es).
  v_antes_cmp := (
    select jsonb_object_agg(p.metodo, p.monto order by p.metodo)
      from retail.venta_pagos p where p.venta_id = p_venta_id and p.metodo <> 'anticipo'
  );
  v_despues_cmp := (select jsonb_object_agg(n ->> 'metodo', (n ->> 'monto')::numeric order by n ->> 'metodo') from jsonb_array_elements(v_nuevos) n);
  if (select jsonb_object_agg(p.metodo, jsonb_build_object('m', p.monto, 'c', p.cuenta_dinero_id) order by p.metodo)
        from retail.venta_pagos p where p.venta_id = p_venta_id and p.metodo <> 'anticipo')
     = (select jsonb_object_agg(n ->> 'metodo', jsonb_build_object('m', (n ->> 'monto')::numeric, 'c', n -> 'cuenta_dinero_id') order by n ->> 'metodo')
          from jsonb_array_elements(v_nuevos) n) then
    raise exception 'Los pagos ya estaban así: no hubo nada que cambiar.' using errcode = 'P0001', hint = 'pagos_sin_cambios';
  end if;

  -- Con la caja cerrada, el efectivo ya se contó: tiene que quedar igual, céntimo por céntimo (con su redondeo).
  if v_caja_cerrada
     and (coalesce((v_antes_cmp ->> 'efectivo')::numeric, 0), coalesce((v_antes_cmp ->> 'redondeo')::numeric, 0))
         is distinct from (coalesce((v_despues_cmp ->> 'efectivo')::numeric, 0), coalesce((v_despues_cmp ->> 'redondeo')::numeric, 0)) then
    raise exception 'La caja de esta venta ya se cerró y su efectivo ya se contó: corrige solo lo que no es efectivo. El efectivo lo ajusta el líder con un ingreso o egreso de caja.'
      using errcode = 'P0001', hint = 'caja_cerrada';
  end if;

  -- La foto de lo que se reemplaza, completa.
  v_antes := (
    select jsonb_agg(jsonb_build_object('id', p.id, 'metodo', p.metodo, 'monto', p.monto, 'recibido', p.recibido,
                                        'referencia', p.referencia, 'cuenta_dinero_id', p.cuenta_dinero_id) order by p.metodo)
      from retail.venta_pagos p where p.venta_id = p_venta_id and p.metodo <> 'anticipo'
  );

  -- El disparador vuelve a validar la cuenta que se le pasa (no la cambia).
  delete from retail.venta_pagos p where p.venta_id = p_venta_id and p.metodo <> 'anticipo';
  insert into retail.venta_pagos (venta_id, metodo, monto, referencia, cuenta_dinero_id)
  select p_venta_id, n ->> 'metodo', (n ->> 'monto')::numeric, n ->> 'referencia', nullif(n ->> 'cuenta_dinero_id', '')::uuid
    from jsonb_array_elements(v_nuevos) n;

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
      || case when v_caja_cerrada then ' (con la caja ya cerrada)' else '' end
      || coalesce(' · motivo: ' || v_motivo, ''),
    v_persona, v_terminal, v_venta.ubicacion_id, null, 'ventas', p_venta_id::text, now(),
    jsonb_build_object('antes', v_antes_cmp, 'despues', v_despues_cmp, 'comprobante', v_comprobante, 'motivo', v_motivo,
                       'caja_cerrada', v_caja_cerrada),
    'vivo'
  );

  return v_despues;
end;
$function$;
