-- ============================================================================
-- Mis compras · la plata que anota la compradora entra SOLA a su fondo (ADR-0574, actividad 2 de 7).
--
-- EL PROBLEMA PRIMERO. Cuando una compradora anotaba «me transfirieron S/ 5,700», la plata quedaba «por confirmar» hasta que una persona de Compras
-- la confirmaba (`confirmar_plata_compras`): mirar el voucher, elegir de qué banco salió y mover el fondo. Mientras tanto la compradora ya la gastaba
-- (contaba en «Tienes para comprar»), pero los libros no la veían, y Compras no podía ni recibir la devolución de la ronda (`recibir_cierre_compras`
-- se niega mientras haya plata por confirmar). Felipe, 2026-10-29: «Compras no tiene que revisar y confirmar estos movimientos, solo lo puede ver
-- como historial».
--
-- QUÉ HACE. Al anotar, si el sistema ya sabe de qué cuenta sale la plata, la confirma en el mismo instante y con la misma plata de siempre:
--   · TRANSFERENCIA con el banco indicado (el formulario ya se lo pide): el mismo movimiento que hace `entregar_fondo` (tipo `entrega_fondo`, del
--     banco que indicó al fondo de la compradora), y la plata queda confirmada por el monto que anotó.
--   · «YA TENÍA PLATA»: no sale de ningún banco, solo fija con cuánto empieza su fondo (como al confirmarlo hoy Compras, con su fecha). Solo la
--     primera vez, como siempre. (Felipe pidió que saliera de «BCP Empresa»; no se puede sin descuadrar los libros: la tabla exige que «ya tenía»
--     no tenga cuenta de origen ni movimiento —no es plata que salga de un banco—, y debitar el banco por plata que ya estaba afuera lo dejaría
--     en menos de lo que tiene. Si se prefiere así, es otra decisión, con un cambio de esquema.)
--   · Yape o Plin, efectivo, o una transferencia sin banco indicado: siguen «por confirmar» para Compras, porque no se sabe de qué caja sale.
-- Quien la «confirma sola» queda registrada como la misma compradora (`confirmada_por = persona_id`), que es como se distingue en el historial.
-- Si algo falla al confirmarla (una cuenta que ya no existe, un fondo que no se puede abrir), la plata queda «por confirmar» como hasta hoy y la
-- compradora no ve el error: anotar nunca se cae por esto (principio 9). La actividad queda anotada para Compras.
--
-- Lo que ya estaba por confirmar antes de esta migración NO se toca: lo confirma Compras como siempre (mover plata de verdad sin que nadie lo mire
-- es otra decisión).
--
-- Solo funciones: sin tablas, políticas ni disparadores nuevos (ADR-0195). Idempotente.
-- ============================================================================
set lock_timeout = '3s';
set search_path = retail, public, extensions;

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

-- ---------- 1. Confirmarla sola ----------
-- Interna: la llama `anotar_plata_compras` con la plata recién anotada. Sin permisos para nadie (se llama dentro de otra función, que ya firmó).
create or replace function retail.fn_plata_confirmar_sola(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_a retail.fondo_plata_anotada%rowtype;
  v_fondo uuid;
  v_mov uuid;
begin
  for v_a in select * from retail.fondo_plata_anotada a where a.id = p_id and a.estado = 'por_confirmar' for update loop
    exit;
  end loop;
  if v_a.id is null then
    return false;
  end if;

  if v_a.medio = 'ya_tenia' then
    -- El saldo inicial de su fondo (la primera plata de su fondo): igual que cuando lo confirma Compras.
    perform pg_advisory_xact_lock(hashtextextended('fondo:' || v_a.persona_id::text, 0));
    v_fondo := retail.fn_fondo_de(v_a.persona_id, true);
    if coalesce((select c.saldo_inicial from retail.cuentas_dinero c where c.id = v_fondo), 0) <> 0 then
      return false;
    end if;
    perform set_config('retail.editando_cuenta', 'si', true);
    update retail.cuentas_dinero
       set saldo_inicial = v_a.monto,
           saldo_desde = least(v_a.fecha, coalesce((select min(d.fecha) from retail.movimientos_dinero d
                                                     where v_fondo in (d.cuenta_origen_id, d.cuenta_destino_id)), v_a.fecha))
     where id = v_fondo;
    perform set_config('retail.editando_cuenta', '', true);
  elsif v_a.medio = 'transferencia' and v_a.cuenta_indicada_id is not null then
    -- El mismo movimiento que `entregar_fondo`, sin pedirle a la compradora el módulo «Fondos por rendir» ni que otra persona lo entregue:
    -- lo que ella dijo (el banco) es la cuenta de origen. El banco tiene que seguir siendo uno que se usa.
    if not exists (select 1 from retail.cuentas_dinero c where c.id = v_a.cuenta_indicada_id and c.tipo = 'banco' and c.archivada_en is null) then
      return false;
    end if;
    perform pg_advisory_xact_lock(hashtextextended('fondo:' || v_a.persona_id::text, 0));
    v_fondo := retail.fn_fondo_de(v_a.persona_id, true);
    insert into retail.movimientos_dinero (tipo, fecha, cuenta_origen_id, cuenta_destino_id, monto, referencia, registrado_por)
    values ('entrega_fondo', v_a.fecha, v_a.cuenta_indicada_id, v_fondo, v_a.monto, 'Plata para compras que anotó (transferencia)', v_a.persona_id)
    returning id into v_mov;
  else
    return false;
  end if;

  update retail.fondo_plata_anotada
     set estado = 'confirmada', monto_confirmado = v_a.monto,
         cuenta_origen_id = case when v_a.medio = 'ya_tenia' then null else v_a.cuenta_indicada_id end,
         movimiento_id = v_mov, confirmada_por = v_a.persona_id, confirmada_en = now()
   where id = v_a.id;

  begin
    perform retail.fn_actividad_anotar('fondos', 'plata_confirmada',
      'pasó sola a su fondo la plata para compras de ' || coalesce((select trim(concat_ws(' ', p.nombres, p.apellidos)) from public.personas p where p.id = v_a.persona_id), 'una compradora'),
      v_a.persona_id, retail.fn_actividad_terminal_ahora(), null, null, 'fondo_plata_anotada', v_a.id::text, now(),
      jsonb_build_object('medio', v_a.medio, 'sola', true), 'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la plata que entró sola %: %', v_a.id, sqlerrm;
  end;
  return true;
end $$;
revoke all on function retail.fn_plata_confirmar_sola(uuid) from public, anon, authenticated;

-- ---------- 2. Anotar la confirma, si se puede ----------
select pg_temp.reemplazar('retail.anotar_plata_compras(text,numeric,text,uuid,uuid)',
$v$  -- Actividad (ADR-0207), en el módulo donde vive el botón. Si falla, igual queda.
  begin
    perform retail.fn_actividad_anotar('ordenes_compra', 'plata_anotada',$v$,
$v$  -- Entra sola a su fondo si ya se sabe de qué cuenta sale (ADR-0574). Si algo falla, queda «por confirmar» para Compras, como siempre.
  begin
    perform retail.fn_plata_confirmar_sola(v_id);
  exception when others then
    raise warning 'plata: no entró sola %: %', v_id, sqlerrm;
  end;

  -- Actividad (ADR-0207), en el módulo donde vive el botón. Si falla, igual queda.
  begin
    perform retail.fn_actividad_anotar('ordenes_compra', 'plata_anotada',$v$, 1);
