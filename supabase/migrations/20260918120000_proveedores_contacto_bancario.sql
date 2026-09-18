-- ============================================================================
-- Proveedores: teléfono y datos bancarios — por primera vez en el esquema V2
--
-- EL PROBLEMA. La auditoría de 09-compras-y-proveedores.md (2026-09-17) mostró
-- que `retail.proveedores` no tiene `telefono` ni `banco`/`cuenta_bancaria`.
-- Nunca los tuvo en V2 — solo existieron en el esquema viejo de la
-- "unificación" que V2 reemplazó el 2026-09-12. No es restaurar una columna
-- borrada, es agregarla por primera vez.
--
-- POR QUÉ IMPORTA. El módulo existe porque "CAYLA le compra a mucha gente
-- distinta, casi siempre por WhatsApp" — sin `telefono` en la ficha, ese
-- número vive solo en la cabeza de quien negoció. `banco`/`cuenta_bancaria`
-- cierran el otro lado: al pagar por transferencia o depósito, hoy no hay
-- ninguna cuenta en ficha a la que mirar (20260918130000 conecta esto con el
-- modal de pago).
--
-- CAMBIO DE PLAN respecto al análisis original, por lo que se fusionó de
-- `main` hoy mismo (PR #117, `20260918071000_proveedores_rubro_plazo_forma_pago.sql`):
-- se había propuesto restaurar también `marca` ("la línea que maneja el
-- proveedor, ej. jeans"), pero `rubro` (agregado hoy, texto libre a
-- propósito, mismo motivo) ya cubre exactamente esa necesidad. Agregar
-- `marca` encima sería el mismo dato dos veces con nombre distinto — se
-- descarta.
--
-- VISIBILIDAD (decisión de Felipe, confirmada de nuevo hoy): igual que el
-- resto del directorio — cualquier colaborador autenticado los ve. Esto
-- calza con el criterio que la migración de hoy (`20260918073000`) ya fijó:
-- los campos de FICHA (nombre/ruc/contacto/rubro/plazo/forma de pago) quedan
-- abiertos para cualquiera; solo lo que se AGREGA desde `compras` (montos,
-- saldo, vencidas) pasa a ser de líder. `telefono`/`banco`/`cuenta_bancaria`
-- son ficha, no agregado — quedan abiertos, del mismo lado que `rubro`.
--
-- Sin constraints nuevos sobre estos 3 campos: mismo nivel de permisividad
-- que tenían en el esquema viejo. El único candado real de esta tabla sigue
-- siendo el `check` de `ruc`.
-- ============================================================================

alter table retail.proveedores
  add column telefono text,
  add column banco text,
  add column cuenta_bancaria text;

-- ---------- lectura: el directorio, con los campos nuevos ----------
-- `create or replace` no alcanza (cambia el RETURNS TABLE) — hay que borrar
-- primero, mismo motivo que ya documentó 20260918071000/073000 para esta
-- misma función. `facturas_atrasadas` se agrega en 20260918130000 (necesita
-- `compras.fecha_estimada_llegada`, que todavía no existe en este punto).
drop function retail.fn_proveedores();
create function retail.fn_proveedores()
returns table (
  id uuid,
  nombre text,
  ruc text,
  contacto text,
  telefono text,
  banco text,
  cuenta_bancaria text,
  activo boolean,
  facturas bigint,
  total_facturado numeric,
  saldo numeric,
  ultima_compra date,
  facturas_vencidas bigint,
  facturas_recibidas_completas bigint,
  facturas_con_recepcion_pendiente bigint,
  rubro text,
  plazo_credito_dias integer,
  forma_pago_preferida text
)
language sql stable security definer set search_path = retail, public, extensions as $$
  select p.id, p.nombre, p.ruc, p.contacto, p.telefono, p.banco, p.cuenta_bancaria, p.activo,
         case when fn_es_lider() then count(c.id) filter (where c.estado <> 'anulada') end as facturas,
         case when fn_es_lider() then coalesce(sum(c.total) filter (where c.estado <> 'anulada'), 0) end as total_facturado,
         case when fn_es_lider() then coalesce(sum(c.saldo) filter (where c.estado <> 'anulada'), 0) end as saldo,
         case when fn_es_lider() then max(c.fecha_emision) filter (where c.estado <> 'anulada') end as ultima_compra,
         case when fn_es_lider() then count(c.id) filter (where c.estado = 'vigente' and c.saldo > 0 and c.fecha_vencimiento < current_date) end as facturas_vencidas,
         case when fn_es_lider() then count(c.id) filter (where c.estado <> 'anulada' and c.estado_recepcion = 'recibida') end as facturas_recibidas_completas,
         case when fn_es_lider() then count(c.id) filter (where c.estado <> 'anulada' and c.estado_recepcion in ('parcial', 'sin_recibir')) end as facturas_con_recepcion_pendiente,
         p.rubro, p.plazo_credito_dias, p.forma_pago_preferida
  from retail.proveedores p
  left join retail.compras c
    on c.proveedor_id = p.id
    and fn_puede_operar_ubicacion(c.ubicacion_destino_id)
  where retail.fn_tiene_acceso_retail()
  group by p.id, p.nombre, p.ruc, p.contacto, p.telefono, p.banco, p.cuenta_bancaria, p.activo, p.rubro, p.plazo_credito_dias, p.forma_pago_preferida
  order by p.activo desc, p.nombre;
$$;

comment on function retail.fn_proveedores() is
  'Directorio de proveedores para cualquiera con cuenta (nombre/RUC/contacto/teléfono/banco/cuenta/rubro/plazo/forma de pago). Lo financiero (facturas, total facturado, saldo, vencidas, recepción) sale NULL si quien pregunta no es líder — mismo criterio del 2026-09-17.';

-- ---------- escritura: alta y edición aceptan los 3 campos nuevos ----------
-- DROP de la firma REAL de hoy (6/7 parámetros, no la vieja de 3/4): la
-- migración de esta misma tarde (20260918071000) ya advirtió del bug exacto
-- que esto evita — agregar parámetros con `create or replace` sin borrar
-- primero deja dos sobrecargas vivas y PostgREST no siempre resuelve cuál.
drop function retail.registrar_proveedor(text, text, text, text, integer, text);
drop function retail.actualizar_proveedor(uuid, text, text, text, text, integer, text);

create function retail.registrar_proveedor(
  p_nombre text,
  p_ruc text default null,
  p_contacto text default null,
  p_rubro text default null,
  p_plazo_credito_dias integer default null,
  p_forma_pago_preferida text default null,
  p_telefono text default null,
  p_banco text default null,
  p_cuenta_bancaria text default null
) returns uuid
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_nombre text := retail.fn_texto_o_null(p_nombre);
  v_ruc text := retail.fn_texto_o_null(p_ruc);
  v_contacto text := retail.fn_texto_o_null(p_contacto);
  v_rubro text := retail.fn_texto_o_null(p_rubro);
  v_telefono text := retail.fn_texto_o_null(p_telefono);
  v_banco text := retail.fn_texto_o_null(p_banco);
  v_cuenta_bancaria text := retail.fn_texto_o_null(p_cuenta_bancaria);
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

  insert into retail.proveedores (nombre, ruc, contacto, rubro, plazo_credito_dias, forma_pago_preferida, telefono, banco, cuenta_bancaria)
  values (v_nombre, v_ruc, v_contacto, v_rubro, p_plazo_credito_dias, p_forma_pago_preferida, v_telefono, v_banco, v_cuenta_bancaria)
  returning id into v_id;
  return v_id;
end;
$$;

create function retail.actualizar_proveedor(
  p_proveedor_id uuid,
  p_nombre text,
  p_ruc text default null,
  p_contacto text default null,
  p_rubro text default null,
  p_plazo_credito_dias integer default null,
  p_forma_pago_preferida text default null,
  p_telefono text default null,
  p_banco text default null,
  p_cuenta_bancaria text default null
) returns void
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_nombre text := retail.fn_texto_o_null(p_nombre);
  v_ruc text := retail.fn_texto_o_null(p_ruc);
  v_contacto text := retail.fn_texto_o_null(p_contacto);
  v_rubro text := retail.fn_texto_o_null(p_rubro);
  v_telefono text := retail.fn_texto_o_null(p_telefono);
  v_banco text := retail.fn_texto_o_null(p_banco);
  v_cuenta_bancaria text := retail.fn_texto_o_null(p_cuenta_bancaria);
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
         rubro = v_rubro, plazo_credito_dias = p_plazo_credito_dias, forma_pago_preferida = p_forma_pago_preferida,
         telefono = v_telefono, banco = v_banco, cuenta_bancaria = v_cuenta_bancaria
   where id = p_proveedor_id;
end;
$$;

grant execute on function retail.fn_proveedores() to authenticated;
grant execute on function retail.registrar_proveedor(text, text, text, text, integer, text, text, text, text) to authenticated;
grant execute on function retail.actualizar_proveedor(uuid, text, text, text, text, integer, text, text, text, text) to authenticated;
