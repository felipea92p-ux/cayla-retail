-- ============================================================================
-- 20260917100500 — variantes.talla deja de ser texto libre
--
-- Toca el núcleo (`variantes`, `fn_asignar_codigo_variante` — el código de
-- barras real) — principio 1 de CLAUDE.md: solo se hace con una razón de
-- peso. La razón: Felipe (2026-09-17), con el censo real por arrancar,
-- "M"/"m"/"Medium"/"Mediano" conviviendo como tallas distintas para siempre
-- es más caro de deshacer después que ahora, con datos de prueba.
--
-- QUÉ NO SE ROMPE
--   `fn_asignar_codigo_variante` arma el código (AZM-M) leyendo
--   `variantes.talla` hoy — pasa a leer `tallas.valor` vía join por
--   `talla_id`. El formato del código NO cambia (sigue siendo el valor de
--   texto de la talla, vía `fn_token_talla`), solo de dónde sale ese texto.
--   Ningún código de barras ya asignado se recalcula (la función solo corre
--   una vez por variante, en el INSERT — ver 20260912235500).
-- ============================================================================

alter table retail.variantes add column if not exists talla_id uuid references retail.tallas (id);

-- ---------- backfill: cada valor de texto existente encuentra o crea su fila en tallas ----------
-- Mismo motivo que 20260917100400: sin esto, cualquier talla nueva que este
-- backfill cree (una que no vino ya de tallas_sugeridas) nacería 'pendiente'
-- porque fn_es_lider() no tiene sesión durante una migración.
alter table retail.tallas disable trigger tallas_estado_biut;

do $$
declare
  v_var record;
  v_talla_id uuid;
begin
  for v_var in select id, talla from retail.variantes where talla is not null and trim(talla) <> '' loop
    select id into v_talla_id from retail.tallas
      where retail.fn_clave_texto(valor) = retail.fn_clave_texto(v_var.talla);

    if v_talla_id is null then
      insert into retail.tallas (valor, estado, notas)
        values (trim(v_var.talla), 'aprobado', 'Migrado desde variantes.talla (texto libre) el 2026-09-17 — ya era una variante real, no una propuesta nueva.')
        returning id into v_talla_id;
    end if;

    update retail.variantes set talla_id = v_talla_id where id = v_var.id;
  end loop;
end $$;

alter table retail.tallas enable trigger tallas_estado_biut;

-- ---------- nueva unicidad, reemplaza (producto_id, talla, color_codigo) ----------
-- DROP COLUMN talla más abajo se lleva la constraint vieja sola (Postgres
-- no permite que una constraint sobreviva sin una de sus columnas) — no
-- hace falta nombrarla ni dropearla a mano.
alter table retail.variantes add constraint variantes_producto_talla_color_unico
  unique (producto_id, talla_id, color_codigo);

-- ---------- fn_asignar_codigo_variante: lee tallas.valor por talla_id, no variantes.talla ----------
create or replace function retail.fn_asignar_codigo_variante(p_variante_id uuid)
returns text language plpgsql security definer set search_path = retail, public
as $$
declare v_codigo text; v_base text; v_producto_id uuid; v_color_codigo text; v_talla text; v_sku text;
begin
  select v.codigo, p.codigo, v.producto_id, v.color_codigo, fn_token_talla(t.valor), v.sku
    into v_codigo, v_base, v_producto_id, v_color_codigo, v_talla, v_sku
    from variantes v
      join productos p on p.id = v.producto_id
      left join tallas t on t.id = v.talla_id
    where v.id = p_variante_id;
  if not found then raise exception 'La variante % no existe', p_variante_id; end if;
  if v_codigo is not null then return v_codigo; end if;

  if v_base is null then v_base := fn_asignar_codigo_producto(v_producto_id); end if;

  v_codigo := v_base || case when v_color_codigo is null then '' else '-' || v_color_codigo end
                     || '-' || v_talla;
  update variantes set codigo = v_codigo where id = p_variante_id;

  insert into codigos_barras (codigo, variante_id, origen)
    values (v_codigo, p_variante_id, 'propio')
    on conflict (codigo) do nothing;
  if v_sku is not null then
    insert into codigos_barras (codigo, variante_id, origen)
      values (v_sku, p_variante_id, 'propio')
      on conflict (codigo) do nothing;
  end if;

  return v_codigo;
end $$;

-- ---------- variantes.talla se retira — talla_id es la única fuente de verdad ----------
alter table retail.variantes drop column talla;

-- ---------- ahora sí: el candado de tallas puede mirar variantes.talla_id ----------
create or replace function retail.fn_tallas_estado_trigger()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
begin
  select id into v_persona from public.personas where auth_user_id = auth.uid();

  if tg_op = 'INSERT' then
    new.propuesto_por := v_persona;
    if retail.fn_es_lider() then
      new.estado := 'aprobado';
      new.aprobado_por := v_persona;
      new.aprobado_en := now();
    else
      new.estado := 'pendiente';
      new.aprobado_por := null;
      new.aprobado_en := null;
    end if;
    return new;
  end if;

  if new.estado = 'aprobado' and old.estado is distinct from 'aprobado' then
    if old.estado <> 'pendiente' then
      raise exception 'Solo se puede aprobar una talla que todavía está pendiente.';
    end if;
    if coalesce(trim(new.notas), '') = '' then
      raise exception 'Aprobar una talla exige un comentario breve (a qué categoría aplica, por qué es distinta de las que ya existen).';
    end if;
    new.aprobado_por := v_persona;
    new.aprobado_en := now();
  elsif new.estado = 'rechazado' and old.estado is distinct from 'rechazado' then
    if old.estado <> 'pendiente' then
      raise exception 'Solo se puede rechazar una propuesta que todavía está pendiente de aprobar.';
    end if;
    if exists (select 1 from variantes where talla_id = old.id and activo) then
      raise exception 'Ya hay una variante activa con esta talla — apruébala y desactívala si ya no sirve.';
    end if;
    new.activo := false;
    new.aprobado_por := v_persona;
    new.aprobado_en := now();
  end if;

  return new;
end;
$$;
