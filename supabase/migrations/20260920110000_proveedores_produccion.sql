-- ============================================================================
-- 20260920110000_proveedores_produccion.sql — CAYLA V2 (ADR-0133, F4a; decisión D-H)
--
-- PROBLEMA. Producción (tela, avíos, maquila) y Compras (mercadería que se vende) son
-- módulos distintos, pero hoy comparten UN directorio de proveedores (`retail.proveedores`):
-- quien compra tela por metro aparece mezclado con quien vende blusas, y las fichas, los
-- saldos y los plazos de uno ensucian los del otro. Felipe decidió (D-H, 2026-09-19) que
-- Producción tenga **su propio directorio**, sin tocar el de Compras.
--
-- QUÉ HACE.
--  1. `proveedores_produccion` — mismo molde de datos que `proveedores` (RUC, contacto, plazo
--     de crédito, forma de pago, banco, CCI, billetera Yape/Plin, titular) con los mismos
--     CHECK, más `rubro` obligatorio y acotado: tela | avios | maquila | otro.
--     Nace **solo-líder** (RLS): los datos bancarios de un tercero son dinero (D-G). Quien
--     trabaja en el Taller conocerá el NOMBRE del proveedor por una función operativa en F4d.
--  2. Escritura solo por RPC de líder: `guardar_proveedor_produccion` (id nulo = crear;
--     valida y normaliza RUC, CCI, celular, billeteras, plazo y forma de pago con los
--     mismos mensajes de Compras) y `cambiar_estado_proveedor_produccion` (archivar y
--     reactivar: nunca se borra, hay historia que cuelga de él).
--  3. `fn_proveedores_produccion()` — la lista con lo que ya se sabe de cada proveedor
--     (lotes recibidos, total comprado, última entrega), solo para el líder.
--     `fn_proveedor_produccion_metricas(uuid)` — lo mismo para una ficha.
--  4. `insumos.proveedor_id` e `insumo_lotes.proveedor_id` se **repuntan** al directorio
--     nuevo. Ambas tablas están en 0 filas en producción; la migración lo COMPRUEBA y se
--     detiene si algún día no fuera así (no se pierde ni se reasigna nada en silencio).
--
-- QUÉ NO TOCA. `retail.proveedores`, `compras`, `fn_proveedores()`, `guardar_cuentas_proveedor`
-- y `fn_proveedor_metricas_insumos(uuid)` quedan idénticas: Compras sigue como está. Esa
-- última función (que lee `insumo_lotes` por `proveedor_id`) devolverá ceros para los
-- proveedores de Compras, que es lo correcto: los insumos ya no son suyos. NO se reescribe
-- para no cambiar una función de producción que Compras usa. Ojo: deja pasar el costo a
-- quien opere la ubicación; el candado de D-G (F4e) la cierra junto con `insumo_lotes`.
--
-- SE ROMPE SI: `retail.fn_es_lider()` cambia de significado, o si alguien inserta un
-- `insumo_lotes.proveedor_id` apuntando al directorio de Compras antes de pegar esto
-- (la migración lo detecta y avisa).
--
-- ESTADO: solo local hasta que Felipe la pegue en producción (prefijo `retail.` ya incluido).
-- Idempotente: se puede pegar dos veces.
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- 1. la tabla ----------
create table if not exists retail.proveedores_produccion (
  id                   uuid primary key default gen_random_uuid(),
  nombre               text not null check (char_length(btrim(nombre)) > 0),
  rubro                text not null check (rubro in ('tela', 'avios', 'maquila', 'otro')),
  ruc                  text check (ruc is null or ruc ~ '^[0-9]{11}$'),
  contacto             text,
  telefono             text,
  plazo_credito_dias   integer check (plazo_credito_dias is null or plazo_credito_dias > 0),
  forma_pago_preferida text check (forma_pago_preferida is null or forma_pago_preferida in ('transferencia', 'yape', 'plin', 'efectivo', 'deposito', 'otro')),
  banco                text,
  cuenta_bancaria      text,
  cci                  text check (cci is null or cci ~ '^[0-9]{20}$'),
  celular_billetera    text check (celular_billetera is null or celular_billetera ~ '^9[0-9]{8}$'),
  billeteras           text[] check (billeteras is null or (cardinality(billeteras) between 1 and 2 and billeteras <@ array['yape', 'plin'])),
  titular_cuenta       text check (titular_cuenta is null or char_length(titular_cuenta) between 2 and 120),
  activo               boolean not null default true,
  created_at           timestamptz not null default now(),
  constraint proveedores_produccion_billetera_coherente check ((celular_billetera is null) = (billeteras is null))
);

comment on table retail.proveedores_produccion is
  'Directorio de proveedores de PRODUCCIÓN (tela, avíos, maquila), aparte del de Compras (D-H, ADR-0133). Solo-líder: lleva datos bancarios de terceros. Se archiva con `activo`, nunca se borra.';
comment on column retail.proveedores_produccion.rubro is 'A qué le vende al Taller: tela | avios | maquila | otro.';

create unique index if not exists proveedores_produccion_ruc_unico on retail.proveedores_produccion (ruc) where ruc is not null;
create unique index if not exists proveedores_produccion_nombre_clave_unica on retail.proveedores_produccion (retail.fn_clave_texto(nombre));
create index if not exists proveedores_produccion_nombre_trgm_idx on retail.proveedores_produccion using gin (nombre gin_trgm_ops);

alter table retail.proveedores_produccion enable row level security;

-- Solo lectura directa para el líder. Toda escritura pasa por las RPC de abajo (security definer):
-- ningún grant de insert/update/delete a `authenticated`.
drop policy if exists proveedores_produccion_select_lider on retail.proveedores_produccion;
create policy proveedores_produccion_select_lider on retail.proveedores_produccion
  for select using (retail.fn_es_lider());

revoke all on retail.proveedores_produccion from public, anon, authenticated;
grant select on retail.proveedores_produccion to authenticated;
grant all on retail.proveedores_produccion to service_role;

-- ---------- 2. insumos e insumo_lotes apuntan al directorio de Producción ----------
do $$
begin
  if exists (select 1 from retail.insumos where proveedor_id is not null)
     or exists (select 1 from retail.insumo_lotes where proveedor_id is not null) then
    raise exception 'insumos o insumo_lotes ya tienen proveedor_id apuntando al directorio de Compras: decide qué hacer con esas filas antes de repuntar (esta migración no las reasigna en silencio)';
  end if;
end $$;

alter table retail.insumos drop constraint if exists insumos_proveedor_id_fkey;
alter table retail.insumos
  add constraint insumos_proveedor_id_fkey foreign key (proveedor_id) references retail.proveedores_produccion (id);

alter table retail.insumo_lotes drop constraint if exists insumo_lotes_proveedor_id_fkey;
alter table retail.insumo_lotes
  add constraint insumo_lotes_proveedor_id_fkey foreign key (proveedor_id) references retail.proveedores_produccion (id);

-- ---------- 3. guardar (crear o actualizar) ----------
create or replace function retail.guardar_proveedor_produccion(
  p_proveedor_id uuid,
  p_nombre text,
  p_rubro text,
  p_ruc text default null,
  p_contacto text default null,
  p_telefono text default null,
  p_plazo_credito_dias integer default null,
  p_forma_pago_preferida text default null,
  p_banco text default null,
  p_cuenta_bancaria text default null,
  p_cci text default null,
  p_celular_billetera text default null,
  p_billeteras text[] default null,
  p_titular_cuenta text default null
) returns uuid
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_nombre text := retail.fn_texto_o_null(p_nombre);
  v_rubro text := lower(btrim(coalesce(p_rubro, '')));
  v_ruc text := nullif(regexp_replace(coalesce(p_ruc, ''), '[\s.-]', '', 'g'), '');
  v_cci text := nullif(regexp_replace(coalesce(p_cci, ''), '[\s.-]', '', 'g'), '');
  v_cel text := nullif(regexp_replace(coalesce(p_celular_billetera, ''), '[^0-9]', '', 'g'), '');
  v_bil text[];
  v_titular text := retail.fn_texto_o_null(p_titular_cuenta);
  v_existente text;
  v_id uuid := p_proveedor_id;
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un Líder puede administrar los proveedores de Producción.';
  end if;
  if v_nombre is null then
    raise exception 'El proveedor necesita un nombre.';
  end if;
  if v_rubro not in ('tela', 'avios', 'maquila', 'otro') then
    raise exception 'Elige a qué le vende al Taller: tela, avíos, maquila u otro.';
  end if;
  if v_ruc is not null and v_ruc !~ '^[0-9]{11}$' then
    raise exception 'El RUC tiene que ser de 11 dígitos. Si el proveedor no tiene RUC, déjalo en blanco.';
  end if;
  if p_plazo_credito_dias is not null and p_plazo_credito_dias <= 0 then
    raise exception 'El plazo de crédito tiene que ser un número de días mayor a cero.';
  end if;
  if p_forma_pago_preferida is not null and p_forma_pago_preferida not in ('transferencia', 'yape', 'plin', 'efectivo', 'deposito', 'otro') then
    raise exception 'Esa forma de pago no existe. Elige una de la lista.';
  end if;
  if v_cel ~ '^51[0-9]{9}$' then v_cel := substr(v_cel, 3); end if;  -- «+51 987…» → «987…»
  if v_cci is not null and v_cci !~ '^[0-9]{20}$' then
    raise exception 'El CCI tiene que ser de 20 dígitos. Si solo tienes el número de cuenta, va en «Cuenta».';
  end if;
  if v_cel is not null and v_cel !~ '^9[0-9]{8}$' then
    raise exception 'El celular de Yape/Plin tiene que ser de 9 dígitos y empezar con 9.';
  end if;
  select array_agg(distinct lower(b) order by lower(b)) into v_bil from unnest(coalesce(p_billeteras, '{}'::text[])) b;
  if v_bil is not null and not (v_bil <@ array['yape', 'plin']) then
    raise exception 'Solo se aceptan Yape o Plin.';
  end if;
  if v_cel is not null and v_bil is null then
    raise exception 'Indica si ese celular es Yape, Plin o ambos.';
  end if;
  if v_cel is null and v_bil is not null then
    raise exception 'Escribe el celular de la billetera, o quita Yape/Plin.';
  end if;
  if v_titular is not null and char_length(v_titular) not between 2 and 120 then
    raise exception 'El titular tiene que tener entre 2 y 120 caracteres.';
  end if;

  -- Los índices únicos son el candado de verdad; esto solo hace que el mensaje diga CON QUIÉN choca.
  select nombre into v_existente from retail.proveedores_produccion
   where retail.fn_clave_texto(nombre) = retail.fn_clave_texto(v_nombre) and id is distinct from p_proveedor_id limit 1;
  if v_existente is not null then
    raise exception 'Ya existe un proveedor llamado "%". Búscalo en la lista en vez de crear otro.', v_existente;
  end if;
  if v_ruc is not null then
    select nombre into v_existente from retail.proveedores_produccion where ruc = v_ruc and id is distinct from p_proveedor_id limit 1;
    if v_existente is not null then
      raise exception 'Ese RUC ya está registrado como "%".', v_existente;
    end if;
  end if;

  if p_proveedor_id is null then
    insert into retail.proveedores_produccion (
      nombre, rubro, ruc, contacto, telefono, plazo_credito_dias, forma_pago_preferida, banco, cuenta_bancaria, cci, celular_billetera, billeteras, titular_cuenta
    ) values (
      v_nombre, v_rubro, v_ruc, retail.fn_texto_o_null(p_contacto), retail.fn_texto_o_null(p_telefono), p_plazo_credito_dias, p_forma_pago_preferida,
      retail.fn_texto_o_null(p_banco), retail.fn_texto_o_null(p_cuenta_bancaria), v_cci, v_cel, v_bil, v_titular
    ) returning id into v_id;
  else
    -- Reemplazo completo: lo que llega en NULL se vacía (misma regla que `guardar_cuentas_proveedor`).
    update retail.proveedores_produccion set
      nombre = v_nombre, rubro = v_rubro, ruc = v_ruc, contacto = retail.fn_texto_o_null(p_contacto), telefono = retail.fn_texto_o_null(p_telefono),
      plazo_credito_dias = p_plazo_credito_dias, forma_pago_preferida = p_forma_pago_preferida, banco = retail.fn_texto_o_null(p_banco),
      cuenta_bancaria = retail.fn_texto_o_null(p_cuenta_bancaria), cci = v_cci, celular_billetera = v_cel, billeteras = v_bil, titular_cuenta = v_titular
    where id = p_proveedor_id;
    if not found then
      raise exception 'Ese proveedor ya no existe. Recarga la pantalla.';
    end if;
  end if;
  return v_id;
end;
$$;

comment on function retail.guardar_proveedor_produccion(uuid, text, text, text, text, text, integer, text, text, text, text, text, text[], text) is
  'Crea (p_proveedor_id nulo) o reemplaza un proveedor de Producción. Solo líder. Valida y normaliza RUC, CCI, celular, billeteras, plazo y forma de pago.';

revoke all on function retail.guardar_proveedor_produccion(uuid, text, text, text, text, text, integer, text, text, text, text, text, text[], text) from public, anon;
grant execute on function retail.guardar_proveedor_produccion(uuid, text, text, text, text, text, integer, text, text, text, text, text, text[], text) to authenticated;

-- ---------- 4. archivar / reactivar ----------
create or replace function retail.cambiar_estado_proveedor_produccion(p_proveedor_id uuid, p_activo boolean)
returns void
language plpgsql security definer set search_path = retail, public, extensions as $$
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un Líder puede administrar los proveedores de Producción.';
  end if;
  if p_activo is null then
    raise exception 'Indica si el proveedor queda activo o archivado.';
  end if;
  update retail.proveedores_produccion set activo = p_activo where id = p_proveedor_id;
  if not found then
    raise exception 'Ese proveedor ya no existe. Recarga la pantalla.';
  end if;
end;
$$;

comment on function retail.cambiar_estado_proveedor_produccion(uuid, boolean) is
  'Archiva (false) o reactiva (true) un proveedor de Producción. Nunca se borra: los lotes y comprobantes cuelgan de él.';

revoke all on function retail.cambiar_estado_proveedor_produccion(uuid, boolean) from public, anon;
grant execute on function retail.cambiar_estado_proveedor_produccion(uuid, boolean) to authenticated;

-- ---------- 5. lectura: la lista y la ficha ----------
create or replace function retail.fn_proveedores_produccion()
returns table (
  id uuid, nombre text, rubro text, ruc text, contacto text, telefono text, plazo_credito_dias integer, forma_pago_preferida text,
  banco text, cuenta_bancaria text, cci text, celular_billetera text, billeteras text[], titular_cuenta text, activo boolean,
  lotes bigint, total_comprado numeric, ultima_entrega date
)
language sql stable security definer set search_path = retail, public, extensions as $$
  select p.id, p.nombre, p.rubro, p.ruc, p.contacto, p.telefono, p.plazo_credito_dias, p.forma_pago_preferida,
         p.banco, p.cuenta_bancaria, p.cci, p.celular_billetera, p.billeteras, p.titular_cuenta, p.activo,
         count(l.id) as lotes,
         coalesce(sum(l.cantidad_ingresada * l.costo_unitario), 0) as total_comprado,
         max(l.fecha_ingreso) as ultima_entrega
  from retail.proveedores_produccion p
  left join retail.insumo_lotes l on l.proveedor_id = p.id
  where retail.fn_es_lider()
  group by p.id
  order by p.activo desc, p.nombre;
$$;

comment on function retail.fn_proveedores_produccion() is
  'Lista del directorio de Producción con lotes recibidos, total comprado y última entrega. Solo líder: quien no lo es recibe cero filas.';

create or replace function retail.fn_proveedor_produccion_metricas(p_proveedor_id uuid)
returns table (lotes bigint, total_comprado numeric, ultima_entrega date)
language sql stable security definer set search_path = retail, public, extensions as $$
  select count(*), coalesce(sum(cantidad_ingresada * costo_unitario), 0), max(fecha_ingreso)
  from retail.insumo_lotes
  where proveedor_id = p_proveedor_id and retail.fn_es_lider();
$$;

comment on function retail.fn_proveedor_produccion_metricas(uuid) is
  'Lotes recibidos, total comprado y última entrega de UN proveedor de Producción. Solo líder (ceros para quien no lo es).';

revoke all on function retail.fn_proveedores_produccion() from public, anon;
grant execute on function retail.fn_proveedores_produccion() to authenticated;
revoke all on function retail.fn_proveedor_produccion_metricas(uuid) from public, anon;
grant execute on function retail.fn_proveedor_produccion_metricas(uuid) to authenticated;
