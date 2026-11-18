-- ============================================================================
-- 20261110001000 — Una cuenta de otra empresa no es plata de CAYLA: el filtro y los candados, con efecto cero (ADR-0638, actividad 2 de Lima, parte 1 de 3)
--
-- EL PROBLEMA PRIMERO. En Tienda LIM, lo de CLAURE que se paga con Yape o Plin llega al número de Claudia. Esa plata nunca entra a un banco de CAYLA,
-- pero hoy el sistema no tiene dónde anotarla: se sella en BCP Empresa, infla el banco y hace que CAYLA «le deba» a Claudia algo que ya tiene ella.
-- La solución es una cuenta de la empresa CLAURE («Yape de Claudia · LIM», parte 3). Pero una cuenta nueva de tipo `banco` entraría sola a los saldos, al
-- Flujo, al Balance, a la conciliación y a todos los combos que ofrecen «un banco». Esta parte los prepara ANTES de que la cuenta exista.
--
-- QUÉ PROMETE. Mientras ninguna cuenta tenga una empresa distinta de CAYLA, nada cambia: hoy las 0 filas ajenas hacen que todo filtro deje pasar todo.
--   · `fn_cuenta_es_de_casa(cuenta)`: una sola pregunta, sin dato responde sí.
--   · El libro del dinero (`fn_dinero_libro`) ya no devuelve líneas de una cuenta ajena; sus 22 lectores lo heredan. Tampoco el efectivo que se queda con Claudia,
--     que hasta hoy entraba sin cuenta y habría salido en «Decir de qué cuenta fue lo pasado».
--   · Las tres listas que leen la tabla directo (saldos, conciliación, cierre de mes) y el conteo de bancos del medidor de confianza no la ven.
--   · No aparece para elegir: `fn_cuentas_para_elegir` y las cuatro listas de banco (destinos de un depósito, Mi plata, devolver a Compras, Fondos por rendir).
--   · No paga ni recibe nada de CAYLA: `fn_cuenta_sellada` (gastos, compras, activos, asignar lo pasado), `fn_movimientos_dinero_validar`, `fn_medios_de_cobro_validar`,
--     el depósito del cierre, Mi plata, cerrar la ronda de compras, el banco de una máquina y la cuenta de la planilla.
--   · Lo único que SÍ puede: cobrar Yape o Plin en una sede de su empresa (clase `cobro`), que es lo que usa la actividad siguiente para mover ahí pagos ya registrados
--     con `corregir_pagos_venta` y cuenta explícita.
--
-- QUÉ NO PROMETE. No crea la cuenta (parte 3), no toca el Diario (parte 2), no cambia a qué cuenta se sella un Yape nuevo (actividad 3) ni cuánto se le debe a Claudia (actividad 4).
--
-- DECIDÍ un `where` en el libro y no renombrar su cuerpo: nadie necesita las líneas ajenas del libro; el estado de cuenta sale de los cobros sellados (parte 2).
-- DECIDÍ un candado en `fn_cuentas_dinero_inmutable`: `empresa_id` no cambia nunca y una cuenta ajena es `banco`, con saldo 0 y sin `saldo_desde`. Con eso, «saldo inicial + libro» da 0 en
--   cualquier suma, presente o futura, sin tener que anclar cada lectura.
-- DESCARTÉ un tipo de cuenta nuevo: se colaría por todos los `not in` que hay en la base.
-- DESCARTÉ filtrar solo los combos: una RPC llamada directo seguiría guardando la cuenta y el error saltaría después (o nunca: el libro la esconde y el Diario la pone en la 104).
-- SE ROMPE SI alguien crea la cuenta (parte 3) antes de esta parte: un gasto podría salir de ella y desaparecer del libro.
-- SE ROMPE SI una migración vieja vuelve a pegarse y parte un bloque: por eso cada ancla va ANTES o DESPUÉS de lo que dejó la migración anterior, nunca adentro
--   (`pnpm pruebas:fondos`, `pruebas:gastos-viaje`, `pruebas:rendicion-fondo`, `pruebas:deuda-fondo` y `pruebas:pos-maquinas` vuelven a pegarlas).
--
-- CÓMO VERIFICAR, antes y después de pegar, de noche y sin ventas en curso. Las cinco huellas tienen que salir iguales:
--   with h as (select retail.fn_hoy_lima() d)
--   select 'libro' k, count(*) n, md5(string_agg(x::text, '|' order by x::text)) huella from h, retail.fn_dinero_libro(h.d) x
--   union all select 'bal_dinero', count(*), md5(string_agg(x::text, '|' order by x::text)) from h, retail.fn_bal_dinero(h.d) x where x.saldo <> 0
--   union all select 'otro_camino', count(*), md5(string_agg(x::text, '|' order by x::text)) from h, retail.fn_bal_otro_camino(h.d) x
--   union all select 'flujo_lineas', count(*), md5(string_agg(x::text, '|' order by x::text)) from h, retail.fn_flujo_lineas(date '2026-10-01', h.d) x
--   union all select 'asientos_dinero', count(*), md5(string_agg(x::text, '|' order by x::text)) from h, retail.fn_asientos_dinero_y_caja(date '2026-10-01', h.d, true, null) x;
-- Y la última línea de esta parte dice «QUEDÓ BIEN».
--
-- CÓMO SE PEGA. Una sola parte: solo funciones (`create or replace` por los reemplazos anclados), sin `alter` ni políticas. Cada reemplazo frena si su texto viejo no aparece
-- las veces esperadas y no hace nada si ya está el nuevo: se puede pegar dos veces.
-- VOLVER ATRÁS. Pegar cada reemplazo al revés (`scripts/pruebas/_deshacer_claure.mjs` sabe leerlos de este archivo).
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

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

-- ---------- 1. La pregunta ----------
create or replace function retail.fn_cuenta_es_de_casa(p_cuenta_id uuid)
returns boolean
language sql
stable
security definer
set search_path = retail, public, extensions
as $f$
  -- Sin cuenta, o sin esa fila, responde sí: los errores de «no existe» los dice cada función, con sus palabras.
  select coalesce((select c.empresa_id = retail.fn_empresa_casa_id() from retail.cuentas_dinero c where c.id = p_cuenta_id), true);
$f$;
comment on function retail.fn_cuenta_es_de_casa(uuid) is
  'ADR-0638. ¿Esta cuenta de dinero es de CAYLA? Una cuenta de otra empresa (el Yape de Claudia) no suma, no se elige y no paga nada de CAYLA.';
revoke all on function retail.fn_cuenta_es_de_casa(uuid) from public, anon, authenticated;

-- ---------- 2. Una cuenta ajena no cambia de dueño y nunca cuenta plata de CAYLA ----------
-- Va ANTES del comentario de «El tipo, su cuenta contable…»: justo después termina el texto que 20261013182000 y 20261014145000 dejaron y sus suites vuelven a pegar.
select pg_temp.reemplazar('retail.fn_cuentas_dinero_inmutable()',
$v$  -- El tipo, su cuenta contable y el saldo inicial los cambia solo `editar_cuenta_dinero`, que valida cuándo se puede.$v$,
$n$  -- ADR-0638: de quién es una cuenta no cambia nunca. Y una cuenta de otra empresa es un banco o billetera con saldo cero y sin fecha de arranque: así «saldo inicial + libro» da 0 en cualquier suma.
  if new.empresa_id is distinct from old.empresa_id then
    raise exception 'Una cuenta no cambia de empresa.' using errcode = 'P0001', hint = 'cuenta_ajena';
  end if;
  if new.empresa_id <> retail.fn_empresa_casa_id() and (new.tipo <> 'banco' or new.saldo_inicial <> 0 or new.saldo_desde is not null) then
    raise exception 'Una cuenta de otra empresa es un banco o billetera con saldo cero: no lleva saldo de CAYLA.' using errcode = 'P0001', hint = 'cuenta_ajena';
  end if;
  -- El tipo, su cuenta contable y el saldo inicial los cambia solo `editar_cuenta_dinero`, que valida cuándo se puede.$n$,
1);

-- ---------- 3. El libro: lo de otra empresa no es plata de CAYLA ----------
select pg_temp.reemplazar('retail.fn_dinero_libro(date)',
$v$      or not exists (select 1 from retail.cuentas_dinero c where c.id = t.cuenta_id and c.tipo = 'cajon');$v$,
$n$      or not exists (select 1 from retail.cuentas_dinero c where c.id = t.cuenta_id and (c.tipo = 'cajon' or c.empresa_id <> (select retail.fn_empresa_casa_id())));$n$,
1);
-- El efectivo que se queda con Claudia no es un movimiento de ninguna cuenta de CAYLA: sin esto entra sin cuenta, y saldría en «Decir de qué cuenta fue lo pasado» y como plata sin cuenta.
select pg_temp.reemplazar('retail.fn_dinero_libro(date)',
$v$     where not k.es_prueba and (t.creado_en at time zone 'America/Lima')::date <= p_hasta$v$,
$n$     where not k.es_prueba and t.destino <> 'claudia' and (t.creado_en at time zone 'America/Lima')::date <= p_hasta$n$,
1);

-- ---------- 4. Lo que lee la tabla sin pasar por el libro ----------
select pg_temp.reemplazar('retail.fn_cuentas_dinero_saldos(date, uuid)',
$v$     where (v_lider and (p_ubicacion_id is null or c.ubicacion_id is null or c.ubicacion_id = p_ubicacion_id))
        or (not v_lider and (c.ubicacion_id = any (v_ubics) or (c.tipo = 'banco' and c.archivada_en is null)))$v$,
$n$     where retail.fn_cuenta_es_de_casa(c.id)
       and ((v_lider and (p_ubicacion_id is null or c.ubicacion_id is null or c.ubicacion_id = p_ubicacion_id))
        or (not v_lider and (c.ubicacion_id = any (v_ubics) or (c.tipo = 'banco' and c.archivada_en is null))))$n$,
1);
select pg_temp.reemplazar('retail.fn_conciliacion_cuentas()',
$v$    select c.* from retail.cuentas_dinero c where c.tipo in ('banco', 'por_abonar', 'tarjeta_credito') and c.archivada_en is null$v$,
$n$    select c.* from retail.cuentas_dinero c where c.tipo in ('banco', 'por_abonar', 'tarjeta_credito') and c.archivada_en is null and retail.fn_cuenta_es_de_casa(c.id)$n$,
1);
select pg_temp.reemplazar('retail.fn_cierre_mes_estado(date)',
$v$     where cd.tipo = 'banco' and coalesce(cd.saldo_desde,$v$,
$n$     where cd.tipo = 'banco' and retail.fn_cuenta_es_de_casa(cd.id) and coalesce(cd.saldo_desde,$n$,
1);
select pg_temp.reemplazar('retail.fn_finanzas_confianza(date, uuid)',
$v$'bancos', (select count(*) from retail.cuentas_dinero c where c.tipo = 'banco' and c.archivada_en is null)$v$,
$n$'bancos', (select count(*) from retail.cuentas_dinero c where c.tipo = 'banco' and c.archivada_en is null and retail.fn_cuenta_es_de_casa(c.id))$n$,
2);

-- ---------- 5. Lo que se sella: una cuenta ajena solo cobra Yape o Plin en una sede de su empresa ----------
select pg_temp.reemplazar('retail.fn_cuenta_sellada(text, text, uuid, date, uuid)',
$v$  if not retail.fn_cuenta_sirve(p_clase, p_medio, v_c.tipo) then$v$,
$n$  -- ADR-0638: una cuenta de otra empresa (el Yape de Claudia) está fuera de los números de CAYLA: solo recibe lo cobrado por Yape o Plin en una sede de su empresa.
  -- Nada de CAYLA se paga con ella: el libro no la lee, así que un gasto o una compra que saliera de aquí se volvería invisible.
  if v_c.empresa_id <> retail.fn_empresa_casa_id()
     and not (p_clase = 'cobro' and p_medio in ('yape', 'plin')
              and exists (select 1 from retail.empresa_sedes es where es.empresa_id = v_c.empresa_id and es.ubicacion_id = p_ubicacion_id)) then
    raise exception 'La cuenta «%» es de otra empresa: aquí solo entra lo cobrado por Yape o Plin en su tienda.', v_c.nombre using errcode = 'P0001', hint = 'cuenta_ajena';
  end if;
  if not retail.fn_cuenta_sirve(p_clase, p_medio, v_c.tipo) then$n$,
1);

-- ---------- 6. Los movimientos entre cuentas: antes del comentario con que empieza el bloque de 20261014145000 ----------
select pg_temp.reemplazar('retail.fn_movimientos_dinero_validar()',
$v$  -- ADR-0362 fase 6 · actividad 7: lo que la persona devuelve de la deuda de un faltante entra a una cuenta de CAYLA (banco, caja$v$,
$n$  -- ADR-0638: una cuenta de otra empresa no entra a ningún movimiento de CAYLA, ni de origen ni de destino.
  if v_o.empresa_id <> retail.fn_empresa_casa_id() or v_d.empresa_id <> retail.fn_empresa_casa_id() then
    raise exception 'La cuenta «%» es de otra empresa: no paga ni recibe movimientos de CAYLA.',
      case when v_o.empresa_id <> retail.fn_empresa_casa_id() then v_o.nombre else v_d.nombre end using errcode = 'P0001', hint = 'cuenta_ajena';
  end if;

  -- ADR-0362 fase 6 · actividad 7: lo que la persona devuelve de la deuda de un faltante entra a una cuenta de CAYLA (banco, caja$n$,
1);

-- ---------- 7. A dónde cae un cobro: solo cuentas de CAYLA; antes del comentario con que empieza el bloque de 20261016173000 ----------
select pg_temp.reemplazar('retail.fn_medios_de_cobro_validar()',
$v$    -- ADR-0429: la tarjeta y el QR entran a la cuenta «por depositar» de la máquina que los cobra, o a un banco.$v$,
$n$    -- ADR-0638: a qué cuenta cae lo de otra marca lo decide el dueño de la prenda, no esta tabla: aquí solo van cuentas de CAYLA.
    if v_c.empresa_id <> retail.fn_empresa_casa_id() then
      raise exception 'La cuenta «%» es de otra empresa: no puede ser el destino fijo de un cobro.', v_c.nombre using errcode = 'P0001', hint = 'cuenta_ajena';
    end if;
    -- ADR-0429: la tarjeta y el QR entran a la cuenta «por depositar» de la máquina que los cobra, o a un banco.$n$,
1);

-- ---------- 8. Las listas para elegir ----------
-- Después del `)` que cierra `and (v_lider …`: las tres líneas de 20261013182000 siguen juntas.
select pg_temp.reemplazar('retail.fn_cuentas_para_elegir(text, uuid)',
$v$            or (c.tipo in ('cajon', 'caja_fuerte') and retail.fn_puede_operar_ubicacion(c.ubicacion_id)))$v$,
$n$            or (c.tipo in ('cajon', 'caja_fuerte') and retail.fn_puede_operar_ubicacion(c.ubicacion_id)))
       and retail.fn_cuenta_es_de_casa(c.id)$n$,
1);
select pg_temp.reemplazar('retail.fn_cuentas_dinero_destinos()',
$v$   where c.tipo = 'banco' and c.archivada_en is null$v$,
$n$   where c.tipo = 'banco' and c.archivada_en is null and retail.fn_cuenta_es_de_casa(c.id)$n$,
1);
select pg_temp.reemplazar('retail.fn_bancos_para_plata_compras()',
$v$     where c.tipo = 'banco' and c.archivada_en is null), '[]'::jsonb);$v$,
$n$     where c.tipo = 'banco' and c.archivada_en is null and retail.fn_cuenta_es_de_casa(c.id)), '[]'::jsonb);$n$,
1);
select pg_temp.reemplazar('retail.fn_cuentas_para_devolver_compras()',
$v$     where c.tipo in ('banco', 'caja_fuerte') and c.archivada_en is null), '[]'::jsonb);$v$,
$n$     where c.tipo in ('banco', 'caja_fuerte') and c.archivada_en is null and retail.fn_cuenta_es_de_casa(c.id)), '[]'::jsonb);$n$,
1);
select pg_temp.reemplazar('retail.fn_fondos_opciones()',
$v$         and (c.tipo in ('banco', 'caja_fuerte') or (c.tipo = 'por_rendir' and v_lider))$v$,
$n$         and (c.tipo in ('banco', 'caja_fuerte') or (c.tipo = 'por_rendir' and v_lider)) and retail.fn_cuenta_es_de_casa(c.id)$n$,
1);

-- ---------- 9. Las puertas que solo miraban «es un banco» ----------
select pg_temp.reemplazar('retail.fn_caja_traslados_sellar()',
$v$        raise exception 'El depósito del cierre va a un banco o billetera.' using errcode = 'P0001';
      end if;$v$,
$n$        raise exception 'El depósito del cierre va a un banco o billetera.' using errcode = 'P0001';
      end if;
      if not retail.fn_cuenta_es_de_casa(v_c.id) then
        raise exception 'La cuenta «%» es de otra empresa: el depósito del cierre va a un banco de CAYLA.', v_c.nombre using errcode = 'P0001', hint = 'cuenta_ajena';
      end if;$n$,
1);
select pg_temp.reemplazar('retail.anotar_plata_compras(text, numeric, text, uuid, uuid)',
$v$    if not exists (select 1 from retail.cuentas_dinero c where c.id = p_cuenta_indicada_id and c.tipo = 'banco' and c.archivada_en is null) then$v$,
$n$    if not exists (select 1 from retail.cuentas_dinero c where c.id = p_cuenta_indicada_id and c.tipo = 'banco' and c.archivada_en is null and retail.fn_cuenta_es_de_casa(c.id)) then$n$,
1);
select pg_temp.reemplazar('retail.terminar_dia_compras(text, uuid)',
$v$                      where c.id = p_cuenta_indicada_id and c.archivada_en is null and c.tipo in ('banco', 'caja_fuerte')) then$v$,
$n$                      where c.id = p_cuenta_indicada_id and c.archivada_en is null and c.tipo in ('banco', 'caja_fuerte') and retail.fn_cuenta_es_de_casa(c.id)) then$n$,
1);
select pg_temp.reemplazar('retail.guardar_banco_de_maquina(uuid, uuid)',
$v$    select 1 from retail.cuentas_dinero c where c.id = p_banco_id and c.tipo = 'banco' and c.archivada_en is null$v$,
$n$    select 1 from retail.cuentas_dinero c where c.id = p_banco_id and c.tipo = 'banco' and c.archivada_en is null and retail.fn_cuenta_es_de_casa(c.id)$n$,
1);
select pg_temp.reemplazar('retail.guardar_cuenta_planilla(text, uuid)',
$v$    select 1 from retail.cuentas_dinero c where c.id = p_cuenta_id and c.tipo = 'banco' and c.archivada_en is null$v$,
$n$    select 1 from retail.cuentas_dinero c where c.id = p_cuenta_id and c.tipo = 'banco' and c.archivada_en is null and retail.fn_cuenta_es_de_casa(c.id)$n$,
1);

-- ---------- Comprobación: todo lo de arriba quedó, y sigue sin haber cuentas ajenas ----------
do $comprobar$
declare
  v_faltan text;
begin
  v_faltan := (select string_agg(x.f, ', ')
                 from unnest(array[
                   'fn_cuentas_dinero_saldos', 'fn_conciliacion_cuentas', 'fn_cierre_mes_estado', 'fn_finanzas_confianza', 'fn_cuentas_para_elegir', 'fn_cuentas_dinero_destinos',
                   'fn_bancos_para_plata_compras', 'fn_cuentas_para_devolver_compras', 'fn_fondos_opciones', 'fn_caja_traslados_sellar', 'anotar_plata_compras', 'terminar_dia_compras',
                   'guardar_banco_de_maquina', 'guardar_cuenta_planilla']) as x (f)
                where not exists (select 1 from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = x.f and p.prosrc like '%fn_cuenta_es_de_casa%'));
  if v_faltan is not null then
    raise exception 'No quedó el filtro en: %', v_faltan;
  end if;
  raise notice 'QUEDÓ BIEN: filtros y candados puestos. Cuentas de otra empresa hoy: %.',
    (select count(*) from retail.cuentas_dinero c where c.empresa_id <> retail.fn_empresa_casa_id());
end
$comprobar$;
select 'QUEDÓ BIEN' as resultado;
