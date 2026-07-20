-- registrar_gasto acepta el método de pago (F1 — cuadre de efectivo continuo).
-- Un gasto en efectivo descuenta del cajón de la sede; uno por banco/yape no.
-- Se elimina la firma vieja para no dejar dos versiones conviviendo.

drop function if exists registrar_gasto(uuid, text, numeric, numeric, numeric, text);

create or replace function registrar_gasto(
  p_sede_id uuid,
  p_categoria text,
  p_subtotal numeric,
  p_igv numeric,
  p_total numeric,
  p_especificacion text default null,
  p_metodo_pago text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_persona_id uuid;
  v_gasto_id uuid;
begin
  if not fn_es_lider() then
    raise exception 'Solo un Líder puede registrar gastos';
  end if;
  if p_metodo_pago is not null and p_metodo_pago not in ('efectivo', 'banco', 'yape', 'tarjeta') then
    raise exception 'Método de pago inválido';
  end if;

  select id into v_persona_id from personas where auth_user_id = auth.uid();

  insert into gastos (sede_id, categoria, subtotal, igv, total, especificacion, usuario_id, metodo_pago)
    values (p_sede_id, p_categoria, p_subtotal, p_igv, p_total, p_especificacion, v_persona_id, p_metodo_pago)
    returning id into v_gasto_id;

  return v_gasto_id;
end;
$$;
