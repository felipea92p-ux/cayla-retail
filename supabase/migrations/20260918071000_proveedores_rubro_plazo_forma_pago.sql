-- ============================================================================
-- PROVEEDORES: RUBRO, PLAZO DE CRÉDITO Y FORMA DE PAGO PREFERIDA
--
-- Hasta hoy `proveedores` solo guardaba nombre/RUC/contacto — nada de con qué
-- plazo trabaja habitualmente, ni de qué rubro es (tela, avíos, prenda
-- terminada, servicios), ni cómo prefiere cobrar. Sale del análisis de
-- métricas de proveedor de hoy: para "negociar mejor" y "cuidar el flujo de
-- caja" (los dos objetivos que Felipe eligió) hace falta poder filtrar/
-- agrupar proveedores por esto, no solo verlo factura por factura.
--
-- `rubro` es texto libre, a propósito — NO el patrón de vocabulario cerrado
-- de `colores`/`categorias` (ADR-0070, `fn_clave_texto` + proponer/aprobar).
-- Esa maquinaria existe para vocabulario que alimenta lógica de negocio real
-- (una talla, un color, tienen que calzar exacto para que el inventario
-- cuadre). "Rubro" es metadata descriptiva de agrupación, no un candado de
-- integridad — construir la maquinaria completa para un campo nuevo sin
-- historia de uso real sería sobre-construir (principio 5). Si en la
-- práctica el texto libre genera "Tela"/"tela"/"TELA" como si fueran tres
-- rubros distintos, ESE día se justifica el vocabulario cerrado, no antes.
--
-- `plazo_credito_dias` y `forma_pago_preferida` sí son datos de la ficha del
-- proveedor (no de una factura puntual) — `compras.condicion`/
-- `compra_pagos.metodo` siguen siendo lo que manda por factura; esto es solo
-- el default esperado, para poblar el formulario más rápido y para poder
-- filtrar "a quién le pago siempre por Yape". `forma_pago_preferida` reusa
-- el MISMO vocabulario que ya usa `compra_pagos.metodo`
-- (20260912231956_compras_desde_factura.sql) — un solo catálogo de formas de
-- pago en todo el sistema, no dos que puedan desalinearse.
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- 1. columnas nuevas ----------
alter table retail.proveedores add column rubro text;
alter table retail.proveedores add column plazo_credito_dias integer;
alter table retail.proveedores add column forma_pago_preferida text;

alter table retail.proveedores
  add constraint proveedores_plazo_credito_positivo check (plazo_credito_dias is null or plazo_credito_dias > 0);

alter table retail.proveedores
  add constraint proveedores_forma_pago_valida check (
    forma_pago_preferida is null
    or forma_pago_preferida in ('transferencia', 'yape', 'plin', 'efectivo', 'deposito', 'otro')
  );

comment on column retail.proveedores.rubro is
  'Texto libre para agrupar reportes (tela, avíos, prenda terminada, servicios...). A propósito sin vocabulario cerrado — ver cabecera de esta migración.';
comment on column retail.proveedores.plazo_credito_dias is
  'Plazo de crédito habitual pactado con este proveedor, en días. Es un default de referencia — cada factura sigue fijando su propio vencimiento en compras.fecha_vencimiento.';
comment on column retail.proveedores.forma_pago_preferida is
  'Cómo suele cobrar. Mismo vocabulario que compra_pagos.metodo — un solo catálogo de formas de pago.';

-- ---------- 2. fn_proveedores(): el directorio trae también rubro/plazo/forma de pago ----------
-- `create or replace` no alcanza: Postgres no deja cambiar las columnas que
-- devuelve una función (el RETURNS TABLE), solo su cuerpo — hay que borrarla
-- primero.
drop function retail.fn_proveedores();
create function retail.fn_proveedores()
returns table (
  id uuid,
  nombre text,
  ruc text,
  contacto text,
  activo boolean,
  facturas bigint,
  saldo numeric,
  ultima_compra date,
  rubro text,
  plazo_credito_dias integer,
  forma_pago_preferida text
)
language sql stable security definer set search_path = retail, public, extensions as $$
  select p.id, p.nombre, p.ruc, p.contacto, p.activo,
         count(c.id) filter (where c.estado <> 'anulada') as facturas,
         coalesce(sum(c.saldo) filter (where c.estado <> 'anulada'), 0) as saldo,
         max(c.fecha_emision) filter (where c.estado <> 'anulada') as ultima_compra,
         p.rubro, p.plazo_credito_dias, p.forma_pago_preferida
  from retail.proveedores p
  left join retail.compras c on c.proveedor_id = p.id
  where retail.fn_tiene_acceso_retail()
  group by p.id, p.nombre, p.ruc, p.contacto, p.activo, p.rubro, p.plazo_credito_dias, p.forma_pago_preferida
  order by p.activo desc, p.nombre;
$$;

comment on function retail.fn_proveedores() is
  'Directorio de proveedores con cuántas facturas vigentes tiene cada uno, cuánto se le debe, la fecha de la última, y su rubro/plazo/forma de pago habituales. Desactivados incluidos, al final.';

-- ---------- 3. registrar_proveedor / actualizar_proveedor: los 3 campos nuevos, opcionales ----------
-- MISMO PROBLEMA QUE fn_proveedores(), pero sin el error que lo delata:
-- agregar parámetros nuevos al final (aunque tengan default) no cambia el
-- RETURNS de la función, así que Postgres no se queja con `create or
-- replace` — pero tampoco reemplaza nada: registra una SEGUNDA sobrecarga
-- (firma vieja de 3/4 parámetros + firma nueva de 6/7), y deja las dos
-- vivas al mismo tiempo. Es exactamente el bug que ADR-0009/0004 ya nombró
-- y bloqueó para otras funciones ("un candado: una sola firma"). Se
-- encontró probando el formulario real en el navegador (500 al registrar),
-- no en las pruebas por psql con parámetros nombrados — esas sí resuelven
-- sin ambigüedad porque piden los campos nuevos explícitamente; PostgREST,
-- con dos sobrecargas candidatas, no siempre puede.
drop function retail.registrar_proveedor(text, text, text);
drop function retail.actualizar_proveedor(uuid, text, text, text);

create function retail.registrar_proveedor(
  p_nombre text,
  p_ruc text default null,
  p_contacto text default null,
  p_rubro text default null,
  p_plazo_credito_dias integer default null,
  p_forma_pago_preferida text default null
) returns uuid
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_nombre text := retail.fn_texto_o_null(p_nombre);
  v_ruc text := retail.fn_texto_o_null(p_ruc);
  v_contacto text := retail.fn_texto_o_null(p_contacto);
  v_rubro text := retail.fn_texto_o_null(p_rubro);
  v_id uuid;
  v_existente text;
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un Líder puede dar de alta proveedores.';
  end if;
  if v_nombre is null then
    raise exception 'El proveedor necesita un nombre.';
  end if;
  if v_ruc is not null and v_ruc !~ '^[0-9]{11}$' then
    raise exception 'El RUC tiene que ser de 11 dígitos. Si el proveedor no tiene RUC, déjalo en blanco.';
  end if;
  if p_plazo_credito_dias is not null and p_plazo_credito_dias <= 0 then
    raise exception 'El plazo de crédito tiene que ser un número de días mayor a cero.';
  end if;
  if p_forma_pago_preferida is not null and p_forma_pago_preferida not in ('transferencia', 'yape', 'plin', 'efectivo', 'deposito', 'otro') then
    raise exception 'Esa forma de pago no existe. Elegí una de la lista.';
  end if;

  -- El índice único es el candado de verdad; esto solo existe para que el
  -- mensaje diga CON QUIÉN choca en vez de "violates unique constraint".
  select nombre into v_existente from retail.proveedores
   where retail.fn_clave_texto(nombre) = retail.fn_clave_texto(v_nombre) limit 1;
  if v_existente is not null then
    raise exception 'Ya existe un proveedor llamado "%". Búscalo en la lista en vez de crear otro.', v_existente;
  end if;
  if v_ruc is not null then
    select nombre into v_existente from retail.proveedores where ruc = v_ruc limit 1;
    if v_existente is not null then
      raise exception 'Ese RUC ya está registrado como "%".', v_existente;
    end if;
  end if;

  insert into retail.proveedores (nombre, ruc, contacto, rubro, plazo_credito_dias, forma_pago_preferida)
  values (v_nombre, v_ruc, v_contacto, v_rubro, p_plazo_credito_dias, p_forma_pago_preferida)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function retail.actualizar_proveedor(
  p_proveedor_id uuid,
  p_nombre text,
  p_ruc text default null,
  p_contacto text default null,
  p_rubro text default null,
  p_plazo_credito_dias integer default null,
  p_forma_pago_preferida text default null
) returns void
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_nombre text := retail.fn_texto_o_null(p_nombre);
  v_ruc text := retail.fn_texto_o_null(p_ruc);
  v_contacto text := retail.fn_texto_o_null(p_contacto);
  v_rubro text := retail.fn_texto_o_null(p_rubro);
  v_existente text;
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un Líder puede editar proveedores.';
  end if;
  if v_nombre is null then
    raise exception 'El proveedor necesita un nombre.';
  end if;
  if v_ruc is not null and v_ruc !~ '^[0-9]{11}$' then
    raise exception 'El RUC tiene que ser de 11 dígitos. Si el proveedor no tiene RUC, déjalo en blanco.';
  end if;
  if p_plazo_credito_dias is not null and p_plazo_credito_dias <= 0 then
    raise exception 'El plazo de crédito tiene que ser un número de días mayor a cero.';
  end if;
  if p_forma_pago_preferida is not null and p_forma_pago_preferida not in ('transferencia', 'yape', 'plin', 'efectivo', 'deposito', 'otro') then
    raise exception 'Esa forma de pago no existe. Elegí una de la lista.';
  end if;
  if not exists (select 1 from retail.proveedores where id = p_proveedor_id) then
    raise exception 'Ese proveedor ya no existe. Recarga la pantalla.';
  end if;

  select nombre into v_existente from retail.proveedores
   where retail.fn_clave_texto(nombre) = retail.fn_clave_texto(v_nombre)
     and id <> p_proveedor_id limit 1;
  if v_existente is not null then
    raise exception 'Ya existe otro proveedor llamado "%".', v_existente;
  end if;
  if v_ruc is not null then
    select nombre into v_existente from retail.proveedores
     where ruc = v_ruc and id <> p_proveedor_id limit 1;
    if v_existente is not null then
      raise exception 'Ese RUC ya está registrado como "%".', v_existente;
    end if;
  end if;

  update retail.proveedores
     set nombre = v_nombre, ruc = v_ruc, contacto = v_contacto,
         rubro = v_rubro, plazo_credito_dias = p_plazo_credito_dias, forma_pago_preferida = p_forma_pago_preferida
   where id = p_proveedor_id;
end;
$$;
