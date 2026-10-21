-- ============================================================================
-- La ficha de pago de un gasto fijo (ADR-0452, Felipe 2026-10-18)
--
-- EL PROBLEMA PRIMERO. El modal «Nuevo gasto fijo» le pedía un «Proveedor»: la lista de MERCADERÍA (95 proveedores, solo 3 de
-- gastos, 2026-10-18). Pero a quién se le paga el alquiler no es un proveedor de mercadería: es el propietario de un local, o
-- una empresa de luz, agua o internet. Y lo que alguien necesita para pagar mañana sin Felipe no está en ningún lado: ni el
-- nombre del propietario, ni la cuenta a la que se transfiere, ni el código de suministro del recibo, ni cuándo vence el
-- contrato. Vive en la cabeza de una persona. Si esa persona falta, nadie sabe a quién ni cómo pagar.
--
-- LA DECISIÓN. Cada gasto fijo tiene UNA ficha de pago (`gastos_fijos_ficha`, una fila por fijo), todo opcional para completarla
-- de a poco: a quién se le paga (propietario o empresa, documento, teléfono, correo), cómo se paga (forma, banco, cuenta, CCI,
-- Yape o Plin, a nombre de quién), cómo reconocerlo (código de suministro, contrato o cliente; cómo llega el recibo; cuándo
-- vence el contrato) y notas para quien herede. El gasto fijo sigue siendo lo que era (cuánto, cuándo, de qué tienda): la ficha
-- es lo que se SABE de él, no lo que cuesta.
--
-- DATOS BANCARIOS: SOLO LÍDER Y ADMIN (Felipe 2026-10-18; en proveedores es más amplio, ver 20261013161000). Cambiar a dónde se
-- transfiere el alquiler es el cambio que más conviene a un fraude. Las seis columnas bancarias (banco, cuenta, CCI, Yape o Plin
-- y a nombre de quién) las lee y las escribe `fn_es_lider()`; el resto de la ficha, quien ve el fijo (`fn_gastos_puede`). Cada
-- cambio de a quién ni cómo se paga queda en `gastos_fijos_ficha_cambios` (antes, después, quién, cuándo), escrito por un
-- disparador en la misma transacción, venga de la función que venga.
--
-- CONTRATO (Liskov)
--   PROMETE: `guardar_gasto_fijo` gana un 11.º argumento opcional, `p_ficha jsonb` (nulo = no toca la ficha); una llamada de 9 o
--            de 10 argumentos se comporta exactamente igual que antes. Con `p_ficha`, solo se cambian las llaves que vienen: el
--            resto de la ficha queda como estaba, y mandar `null` en una llave la borra. Una llave que no existe, un dato mal
--            formado o un dato bancario de quien no es líder abortan TODO el guardado (el fijo tampoco se guarda).
--            Nadie lee ni escribe las tablas directo: RLS encendido, sin políticas, sin permisos (ADR-0195).
--   ASUME:   `guardar_gasto_fijo` de 10 argumentos de 20261017190000 (o esta misma, ya aplicada) y `fn_es_lider()`.
--   NO HACE: no toca `gastos_fijos` ni `fn_gastos_fijos_mes` (Flujo, Resumen y Cierre siguen leyendo lo mismo); no avisa en el
--            Inicio de un cambio de cuenta (queda en el historial; el aviso es otra decisión); no guarda claves ni contraseñas:
--            la pantalla lo dice y el texto libre es de quien lo escribe.
--
-- DECIDÍ: una tabla 1:1 aparte, no columnas en `gastos_fijos`. DESCARTÉ columnas en `gastos_fijos` porque la leen el Flujo, el
-- Resumen, el Cierre y el Presupuesto y ninguno necesita una cuenta bancaria; y DESCARTÉ una tabla compartida de «beneficiarios»
-- (un propietario con dos locales) porque hoy cada fijo tiene el suyo y duplicar una cuenta entre dos fichas cuesta menos que
-- un directorio más. SE ROMPE SI: un mismo propietario o empresa repite en muchos fijos y la cuenta se desactualiza en una.
--
-- CÓMO SE PEGA EN PRODUCCIÓN. Después de 20261017190000. Una sola parte, sin políticas ni `drop trigger` (ADR-0195): una tabla
-- nueva, su historial, un disparador (`create or replace trigger`) y funciones. `lock_timeout` de 3 s. Re-pegable. La web se
-- publica antes sin problema: solo manda `p_ficha` cuando la persona llenó algo. La última línea dice «QUEDÓ BIEN».
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $$
begin
  if to_regprocedure('retail.guardar_gasto_fijo(uuid, uuid, text, text, uuid, text, numeric, boolean, integer, text)') is null
     and to_regprocedure('retail.guardar_gasto_fijo(uuid, uuid, text, text, uuid, text, numeric, boolean, integer, text, jsonb)') is null then
    raise exception 'Pega antes 20261017190000_gastos_fijos_momento_del_mes.sql (guardar_gasto_fijo con «cuándo llega»).';
  end if;
  if to_regprocedure('retail.fn_es_lider()') is null then
    raise exception 'Falta retail.fn_es_lider().';
  end if;
end;
$$;

-- 1. La ficha. Todo es opcional: se completa de a poco. --------------------------------------------------------------------

create table if not exists retail.gastos_fijos_ficha (
  gasto_fijo_id uuid primary key references retail.gastos_fijos (id),
  -- A quién se le paga.
  beneficiario text,
  documento_tipo text,
  documento_numero text,
  telefono text,
  correo text,
  -- Cómo se paga. Los seis siguientes (banco…titular) son bancarios: solo líder y admin.
  forma_de_pago text,
  banco text,
  cuenta_bancaria text,
  cci text,
  celular_billetera text,
  billeteras text[],
  titular_cuenta text,
  -- Cómo reconocerlo.
  codigo_servicio text,
  recibo_llega text,
  contrato_vence date,
  notas text,
  actualizado_por uuid references public.personas (id),
  actualizado_en timestamptz not null default now(),
  constraint gastos_fijos_ficha_sin_vacios check (
        (beneficiario is null or btrim(beneficiario) <> '') and (documento_numero is null or btrim(documento_numero) <> '')
    and (telefono is null or btrim(telefono) <> '') and (correo is null or btrim(correo) <> '')
    and (banco is null or btrim(banco) <> '') and (cuenta_bancaria is null or btrim(cuenta_bancaria) <> '')
    and (titular_cuenta is null or btrim(titular_cuenta) <> '') and (codigo_servicio is null or btrim(codigo_servicio) <> '')
    and (recibo_llega is null or btrim(recibo_llega) <> '') and (notas is null or btrim(notas) <> '')),
  constraint gastos_fijos_ficha_textos_con_tope check (
        char_length(beneficiario) <= 120 and char_length(telefono) <= 30 and char_length(correo) <= 120
    and char_length(banco) <= 60 and char_length(cuenta_bancaria) <= 40 and char_length(titular_cuenta) <= 120
    and char_length(codigo_servicio) <= 60 and char_length(recibo_llega) <= 200 and char_length(notas) <= 500),
  constraint gastos_fijos_ficha_documento check (
        (documento_tipo is null) = (documento_numero is null)
    and (documento_tipo is null or documento_tipo in ('dni', 'ruc', 'ce', 'otro'))
    and (documento_tipo is distinct from 'dni' or documento_numero ~ '^[0-9]{8}$')
    and (documento_tipo is distinct from 'ruc' or documento_numero ~ '^[0-9]{11}$')
    and (documento_tipo is distinct from 'ce' or documento_numero ~ '^[A-Za-z0-9]{6,20}$')
    and (documento_tipo is distinct from 'otro' or char_length(documento_numero) between 1 and 20)),
  constraint gastos_fijos_ficha_forma_valida check (
    forma_de_pago is null or forma_de_pago in ('transferencia', 'billetera', 'deposito', 'efectivo', 'recibo', 'debito')),
  constraint gastos_fijos_ficha_contacto_formato check (
        (telefono is null or (telefono ~ '^[0-9+() -]+$' and char_length(regexp_replace(telefono, '[^0-9]', '', 'g')) between 6 and 15))
    and (correo is null or correo ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  -- Los mismos candados que las cuentas de un proveedor (20260919170000).
  constraint gastos_fijos_ficha_cci_formato check (cci is null or cci ~ '^[0-9]{20}$'),
  constraint gastos_fijos_ficha_celular_formato check (celular_billetera is null or celular_billetera ~ '^9[0-9]{8}$'),
  constraint gastos_fijos_ficha_billeteras_validas check (
    billeteras is null or (cardinality(billeteras) between 1 and 2 and billeteras <@ array['yape', 'plin']::text[])),
  constraint gastos_fijos_ficha_billetera_coherente check ((celular_billetera is null) = (billeteras is null)),
  constraint gastos_fijos_ficha_contrato_fecha_real check (contrato_vence is null or contrato_vence between date '2000-01-01' and date '2100-01-01')
);
alter table retail.gastos_fijos_ficha enable row level security;
revoke all on table retail.gastos_fijos_ficha from public, anon, authenticated;
comment on table retail.gastos_fijos_ficha is
  'Lo que se sabe de un gasto fijo para poder pagarlo sin quien lo cargó (ADR-0452): a quién se le paga, cómo, el código del recibo, el contrato y notas. Una fila por fijo, todo opcional. Banco, cuenta, CCI, Yape/Plin y titular: solo líder y admin. Se lee y escribe por funciones.';
comment on column retail.gastos_fijos_ficha.cci is
  'Dato bancario: solo líder y admin (fn_gasto_fijo_ficha). No se lee directo.';

-- 2. El historial: cada cambio de a quién y cómo se paga. -------------------------------------------------------------------

create table if not exists retail.gastos_fijos_ficha_cambios (
  id uuid primary key default gen_random_uuid(),
  gasto_fijo_id uuid not null references retail.gastos_fijos (id),
  campo text not null check (campo in ('beneficiario', 'documento', 'forma_de_pago', 'banco', 'cuenta_bancaria', 'cci', 'celular_billetera', 'billeteras', 'titular_cuenta')),
  antes text,
  despues text,
  cambiado_por uuid,
  cambiado_en timestamptz not null default now(),
  constraint gastos_fijos_ficha_cambios_cambio_real check (antes is distinct from despues)
);
create index if not exists gastos_fijos_ficha_cambios_fijo_idx on retail.gastos_fijos_ficha_cambios (gasto_fijo_id, cambiado_en desc);
alter table retail.gastos_fijos_ficha_cambios enable row level security;
revoke all on table retail.gastos_fijos_ficha_cambios from public, anon, authenticated;
comment on table retail.gastos_fijos_ficha_cambios is
  'Cada cambio de a quién y cómo se paga un gasto fijo (ADR-0452): antes, después, quién y cuándo. Lo escribe un disparador; nadie lo edita ni lo borra. Se lee por fn_gasto_fijo_ficha_cambios (solo líder y admin).';

create or replace function retail.fn_gastos_fijos_ficha_anotar_cambio()
returns trigger
language plpgsql
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
declare
  v_persona uuid;
begin
  -- Quién firmó el cambio (el responsable del combo, ADR-0162). Sin saberlo (SQL Editor) queda sin persona, pero se anota.
  begin
    v_persona := retail.fn_actor_persona_id(true);
  exception when others then
    v_persona := null;
  end;
  insert into retail.gastos_fijos_ficha_cambios (gasto_fijo_id, campo, antes, despues, cambiado_por)
  select new.gasto_fijo_id, c.campo, c.antes, c.despues, v_persona
    from (values
      ('beneficiario', case when tg_op = 'UPDATE' then old.beneficiario end, new.beneficiario),
      ('documento', case when tg_op = 'UPDATE' then concat_ws(' ', upper(old.documento_tipo), old.documento_numero) end,
                    concat_ws(' ', upper(new.documento_tipo), new.documento_numero)),
      ('forma_de_pago', case when tg_op = 'UPDATE' then old.forma_de_pago end, new.forma_de_pago),
      ('banco', case when tg_op = 'UPDATE' then old.banco end, new.banco),
      ('cuenta_bancaria', case when tg_op = 'UPDATE' then old.cuenta_bancaria end, new.cuenta_bancaria),
      ('cci', case when tg_op = 'UPDATE' then old.cci end, new.cci),
      ('celular_billetera', case when tg_op = 'UPDATE' then old.celular_billetera end, new.celular_billetera),
      ('billeteras', case when tg_op = 'UPDATE' then array_to_string(old.billeteras, ', ') end, array_to_string(new.billeteras, ', ')),
      ('titular_cuenta', case when tg_op = 'UPDATE' then old.titular_cuenta end, new.titular_cuenta)
    ) as c(campo, antes, despues)
   where nullif(c.antes, '') is distinct from nullif(c.despues, '');
  return null;
end;
$$;
revoke all on function retail.fn_gastos_fijos_ficha_anotar_cambio() from public, anon, authenticated;

create or replace trigger gastos_fijos_ficha_anotar_cambio
  after insert or update on retail.gastos_fijos_ficha
  for each row execute function retail.fn_gastos_fijos_ficha_anotar_cambio();

-- 3. Aplicar lo que manda la pantalla. Solo la llama `guardar_gasto_fijo`. ---------------------------------------------------
-- Cada llave que viene se cambia; la que no viene se queda como estaba; `null` la borra. Todo se normaliza aquí (la base es la
-- que manda) y los errores comunes hablan en criollo; los candados de la tabla son la red de seguridad de lo demás.

create or replace function retail.fn_gasto_fijo_ficha_aplicar(p_id uuid, p_ficha jsonb, p_actor uuid)
returns void
language plpgsql
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
declare
  v_old retail.gastos_fijos_ficha%rowtype;
  v_new retail.gastos_fijos_ficha%rowtype;
  v_permitidas constant text[] := array['beneficiario', 'documento_tipo', 'documento_numero', 'telefono', 'correo', 'forma_de_pago',
    'banco', 'cuenta_bancaria', 'cci', 'celular_billetera', 'billeteras', 'titular_cuenta', 'codigo_servicio', 'recibo_llega',
    'contrato_vence', 'notas'];
  v_bancarias constant text[] := array['banco', 'cuenta_bancaria', 'cci', 'celular_billetera', 'billeteras', 'titular_cuenta'];
  v_k text;
  v_x text;
  v_dig text;
  v_b text[];
begin
  if jsonb_typeof(p_ficha) is distinct from 'object' then
    raise exception 'La ficha de pago llega mal armada.' using errcode = 'P0001';
  end if;
  for v_k in select jsonb_object_keys(p_ficha) loop
    if not (v_k = any (v_permitidas)) then
      raise exception 'La ficha de pago no tiene el campo «%».', v_k using errcode = 'P0001';
    end if;
    if jsonb_typeof(p_ficha -> v_k) not in ('string', 'null') and not (v_k = 'billeteras' and jsonb_typeof(p_ficha -> v_k) = 'array') then
      raise exception 'El campo «%» de la ficha tiene que ser un texto.', v_k using errcode = 'P0001';
    end if;
    if v_k = any (v_bancarias) and not retail.fn_es_lider() then
      raise exception 'Los datos bancarios de un gasto fijo (banco, cuenta, CCI, Yape o Plin y titular) los cambia solo un líder o admin.' using errcode = '42501';
    end if;
  end loop;

  select * into v_old from retail.gastos_fijos_ficha where gasto_fijo_id = p_id;
  v_new := v_old;
  v_new.gasto_fijo_id := p_id;

  -- A quién se le paga.
  if p_ficha ? 'beneficiario' then v_new.beneficiario := nullif(btrim(p_ficha ->> 'beneficiario'), ''); end if;
  if p_ficha ? 'documento_tipo' then v_new.documento_tipo := nullif(lower(btrim(p_ficha ->> 'documento_tipo')), ''); end if;
  if p_ficha ? 'documento_numero' then v_new.documento_numero := nullif(btrim(p_ficha ->> 'documento_numero'), ''); end if;
  if p_ficha ? 'telefono' then v_new.telefono := nullif(btrim(p_ficha ->> 'telefono'), ''); end if;
  if p_ficha ? 'correo' then v_new.correo := nullif(lower(btrim(p_ficha ->> 'correo')), ''); end if;
  -- Cómo se paga.
  if p_ficha ? 'forma_de_pago' then v_new.forma_de_pago := nullif(btrim(p_ficha ->> 'forma_de_pago'), ''); end if;
  if p_ficha ? 'banco' then v_new.banco := nullif(btrim(p_ficha ->> 'banco'), ''); end if;
  if p_ficha ? 'cuenta_bancaria' then v_new.cuenta_bancaria := nullif(btrim(p_ficha ->> 'cuenta_bancaria'), ''); end if;
  if p_ficha ? 'cci' then v_new.cci := nullif(regexp_replace(coalesce(p_ficha ->> 'cci', ''), '[\s.-]', '', 'g'), ''); end if;
  if p_ficha ? 'celular_billetera' then
    v_dig := regexp_replace(coalesce(p_ficha ->> 'celular_billetera', ''), '[^0-9]', '', 'g');
    if length(v_dig) = 11 and v_dig like '51%' then v_dig := substr(v_dig, 3); end if;
    v_new.celular_billetera := nullif(v_dig, '');
  end if;
  if p_ficha ? 'billeteras' then
    if jsonb_typeof(p_ficha -> 'billeteras') = 'array' then
      select array_agg(distinct lower(btrim(e)) order by lower(btrim(e))) into v_b from jsonb_array_elements_text(p_ficha -> 'billeteras') e;
    end if;
    v_new.billeteras := v_b;
  end if;
  if p_ficha ? 'titular_cuenta' then v_new.titular_cuenta := nullif(btrim(p_ficha ->> 'titular_cuenta'), ''); end if;
  -- Cómo reconocerlo.
  if p_ficha ? 'codigo_servicio' then v_new.codigo_servicio := nullif(btrim(p_ficha ->> 'codigo_servicio'), ''); end if;
  if p_ficha ? 'recibo_llega' then v_new.recibo_llega := nullif(btrim(p_ficha ->> 'recibo_llega'), ''); end if;
  if p_ficha ? 'notas' then v_new.notas := nullif(btrim(p_ficha ->> 'notas'), ''); end if;
  if p_ficha ? 'contrato_vence' then
    v_x := nullif(btrim(p_ficha ->> 'contrato_vence'), '');
    begin
      v_new.contrato_vence := v_x::date;
    exception when others then
      raise exception 'La fecha en que vence el contrato no es una fecha válida.' using errcode = 'P0001';
    end;
  end if;

  -- Los errores comunes, con palabras de tienda (lo demás lo ataja el candado de la tabla).
  if (v_new.documento_tipo is null) <> (v_new.documento_numero is null) then
    raise exception 'Elige el tipo de documento y escribe su número, o deja los dos vacíos.' using errcode = 'P0001';
  end if;
  if v_new.documento_tipo is not null then
    if v_new.documento_tipo in ('dni', 'ruc') then
      v_new.documento_numero := regexp_replace(v_new.documento_numero, '[\s.-]', '', 'g');
    end if;
    if v_new.documento_tipo = 'dni' and v_new.documento_numero !~ '^[0-9]{8}$' then
      raise exception 'El DNI tiene 8 números.' using errcode = 'P0001';
    elsif v_new.documento_tipo = 'ruc' and v_new.documento_numero !~ '^[0-9]{11}$' then
      raise exception 'El RUC tiene 11 números.' using errcode = 'P0001';
    end if;
  end if;
  if v_new.forma_de_pago is not null and v_new.forma_de_pago not in ('transferencia', 'billetera', 'deposito', 'efectivo', 'recibo', 'debito') then
    raise exception 'Elige cómo se paga de la lista.' using errcode = 'P0001';
  end if;
  if v_new.correo is not null and v_new.correo !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'El correo no parece un correo (le falta algo antes o después de la arroba).' using errcode = 'P0001';
  end if;
  if v_new.telefono is not null and (v_new.telefono !~ '^[0-9+() -]+$' or length(regexp_replace(v_new.telefono, '[^0-9]', '', 'g')) not between 6 and 15) then
    raise exception 'El teléfono lleva solo números (de 6 a 15).' using errcode = 'P0001';
  end if;
  if v_new.cci is not null and v_new.cci !~ '^[0-9]{20}$' then
    raise exception 'El CCI tiene 20 números. Si solo tienes el número de cuenta, va en «Cuenta».' using errcode = 'P0001';
  end if;
  if v_new.celular_billetera is not null and v_new.celular_billetera !~ '^9[0-9]{8}$' then
    raise exception 'El celular de Yape o Plin tiene 9 números y empieza con 9.' using errcode = 'P0001';
  end if;
  if v_new.billeteras is not null and not (cardinality(v_new.billeteras) between 1 and 2 and v_new.billeteras <@ array['yape', 'plin']::text[]) then
    raise exception 'Elige Yape, Plin o los dos.' using errcode = 'P0001';
  end if;
  if (v_new.celular_billetera is null) <> (v_new.billeteras is null) then
    raise exception 'Para Yape o Plin hacen falta el celular y la app (Yape, Plin o los dos).' using errcode = 'P0001';
  end if;

  -- Sin cambios (o nada que guardar): no se toca la fila, así «actualizado» dice la verdad.
  if to_jsonb(v_new) - 'actualizado_por' - 'actualizado_en' = to_jsonb(v_old) - 'actualizado_por' - 'actualizado_en' then
    return;
  end if;
  if v_old.gasto_fijo_id is null and jsonb_strip_nulls(to_jsonb(v_new) - 'gasto_fijo_id' - 'actualizado_por' - 'actualizado_en') = '{}'::jsonb then
    return;
  end if;

  insert into retail.gastos_fijos_ficha (gasto_fijo_id, beneficiario, documento_tipo, documento_numero, telefono, correo, forma_de_pago,
    banco, cuenta_bancaria, cci, celular_billetera, billeteras, titular_cuenta, codigo_servicio, recibo_llega, contrato_vence, notas,
    actualizado_por, actualizado_en)
  values (p_id, v_new.beneficiario, v_new.documento_tipo, v_new.documento_numero, v_new.telefono, v_new.correo, v_new.forma_de_pago,
    v_new.banco, v_new.cuenta_bancaria, v_new.cci, v_new.celular_billetera, v_new.billeteras, v_new.titular_cuenta, v_new.codigo_servicio,
    v_new.recibo_llega, v_new.contrato_vence, v_new.notas, p_actor, now())
  on conflict (gasto_fijo_id) do update set
    beneficiario = excluded.beneficiario, documento_tipo = excluded.documento_tipo, documento_numero = excluded.documento_numero,
    telefono = excluded.telefono, correo = excluded.correo, forma_de_pago = excluded.forma_de_pago, banco = excluded.banco,
    cuenta_bancaria = excluded.cuenta_bancaria, cci = excluded.cci, celular_billetera = excluded.celular_billetera,
    billeteras = excluded.billeteras, titular_cuenta = excluded.titular_cuenta, codigo_servicio = excluded.codigo_servicio,
    recibo_llega = excluded.recibo_llega, contrato_vence = excluded.contrato_vence, notas = excluded.notas,
    actualizado_por = excluded.actualizado_por, actualizado_en = excluded.actualizado_en;
end;
$$;
revoke all on function retail.fn_gasto_fijo_ficha_aplicar(uuid, jsonb, uuid) from public, anon, authenticated;

-- 4. Guardar un fijo, con su ficha si viene. ----------------------------------------------------------------------------------
-- Igual que la de 20261017190000, más el 11.º argumento. La de 10 argumentos se retira: con los dos últimos opcionales, una
-- llamada de 9 o de 10 resuelve a esta.

drop function if exists retail.guardar_gasto_fijo(uuid, uuid, text, text, uuid, text, numeric, boolean, integer, text);

create or replace function retail.guardar_gasto_fijo(
  p_id uuid,
  p_ubicacion_id uuid,
  p_categoria text,
  p_descripcion text,
  p_proveedor_id uuid,
  p_comprobante_tipo text,
  p_monto numeric,
  p_monto_variable boolean,
  p_dia_del_mes integer,
  p_momento text default 'dia',
  p_ficha jsonb default null
) returns uuid
language plpgsql security definer set search_path = retail, public, extensions as $$
declare v_actual retail.gastos_fijos%rowtype; v_actor uuid; v_id uuid := p_id;
        v_momento text := coalesce(p_momento, 'dia'); v_dia integer;
begin
  if not retail.fn_gastos_puede(p_ubicacion_id) then
    raise exception 'No puedes guardar gastos fijos de esa tienda.' using errcode = '42501';
  end if;
  if not exists (select 1 from retail.categorias_gasto where codigo = p_categoria and activo) then
    raise exception 'Elige una categoría de la lista.' using errcode = 'P0001';
  end if;
  if p_descripcion is null or trim(p_descripcion) = '' then
    raise exception 'Escribe qué se paga.' using errcode = 'P0001';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.' using errcode = 'P0001';
  end if;
  if v_momento not in ('dia', 'primera_semana', 'quincena', 'fin_de_mes') then
    raise exception 'Elige cuándo llega: un día fijo, la primera semana, la quincena o fin de mes.' using errcode = 'P0001';
  end if;
  if v_momento = 'dia' then
    if p_dia_del_mes is null or p_dia_del_mes not between 1 and 28 then
      raise exception 'El día va del 1 al 28. Si llega el 29, 30 o 31, elige «Fin de mes».' using errcode = 'P0001';
    end if;
    v_dia := p_dia_del_mes;
  else
    v_dia := case v_momento when 'primera_semana' then 7 when 'quincena' then 15 else 28 end;
  end if;
  if p_proveedor_id is not null and not exists (select 1 from retail.proveedores where id = p_proveedor_id) then
    raise exception 'Ese proveedor no existe.' using errcode = 'P0001';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if p_id is null then
    insert into retail.gastos_fijos (ubicacion_id, categoria, descripcion, proveedor_id, comprobante_tipo, monto, monto_variable,
                                     dia_del_mes, momento, creado_por, actualizado_por)
    values (p_ubicacion_id, p_categoria, trim(p_descripcion), p_proveedor_id, coalesce(p_comprobante_tipo, 'factura'),
            round(p_monto, 2), coalesce(p_monto_variable, false), v_dia, v_momento, v_actor, v_actor)
    returning id into v_id;
  else
    select * into v_actual from retail.gastos_fijos where id = p_id for update;
    if not found or not v_actual.activo then
      raise exception 'Ese gasto fijo no existe o está archivado.' using errcode = 'P0001';
    end if;
    if not retail.fn_gastos_puede(v_actual.ubicacion_id) then
      raise exception 'Ese gasto fijo es de otra tienda.' using errcode = '42501';
    end if;
    update retail.gastos_fijos
       set ubicacion_id = p_ubicacion_id, categoria = p_categoria, descripcion = trim(p_descripcion), proveedor_id = p_proveedor_id,
           comprobante_tipo = coalesce(p_comprobante_tipo, 'factura'), monto = round(p_monto, 2),
           monto_variable = coalesce(p_monto_variable, false), dia_del_mes = v_dia, momento = v_momento,
           actualizado_por = v_actor, actualizado_en = now()
     where id = p_id;
  end if;
  if p_ficha is not null then
    perform retail.fn_gasto_fijo_ficha_aplicar(v_id, p_ficha, v_actor);
  end if;
  return v_id;
end $$;
revoke all on function retail.guardar_gasto_fijo(uuid, uuid, text, text, uuid, text, numeric, boolean, integer, text, jsonb) from public, anon;
grant execute on function retail.guardar_gasto_fijo(uuid, uuid, text, text, uuid, text, numeric, boolean, integer, text, jsonb) to authenticated;

-- 5. Leer la ficha de UN fijo (el modal y la hoja de «Registrar»). -----------------------------------------------------------
-- Una fila siempre que la cuenta ve el fijo (aunque aún no tenga ficha); cero filas si no lo ve. Los seis datos bancarios salen
-- vacíos para quien no es líder, y `tiene_cuenta` también (no se acusa que «falta» lo que no se puede ver).

create or replace function retail.fn_gasto_fijo_ficha(p_gasto_fijo_id uuid)
returns table (
  gasto_fijo_id uuid, beneficiario text, documento_tipo text, documento_numero text, telefono text, correo text,
  forma_de_pago text, banco text, cuenta_bancaria text, cci text, celular_billetera text, billeteras text[], titular_cuenta text,
  codigo_servicio text, recibo_llega text, contrato_vence date, notas text,
  actualizado_por_nombre text, actualizado_en timestamptz, puede_ver_banco boolean, tiene_cuenta boolean
)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare v_ubic uuid; v_banco boolean := retail.fn_es_lider();
begin
  if not retail.fn_tiene_acceso_retail() then
    return;
  end if;
  select f.ubicacion_id into v_ubic from retail.gastos_fijos f where f.id = p_gasto_fijo_id;
  if not found or not retail.fn_gastos_puede(v_ubic) then
    return;
  end if;
  return query
  select f.id, x.beneficiario, x.documento_tipo, x.documento_numero, x.telefono, x.correo, x.forma_de_pago,
         case when v_banco then x.banco end, case when v_banco then x.cuenta_bancaria end, case when v_banco then x.cci end,
         case when v_banco then x.celular_billetera end, case when v_banco then x.billeteras end,
         case when v_banco then x.titular_cuenta end,
         x.codigo_servicio, x.recibo_llega, x.contrato_vence, x.notas,
         nullif(concat_ws(' ', pe.nombres, pe.apellidos), ''), x.actualizado_en, v_banco,
         case when v_banco then (x.cuenta_bancaria is not null or x.cci is not null or x.celular_billetera is not null) end
    from retail.gastos_fijos f
    left join retail.gastos_fijos_ficha x on x.gasto_fijo_id = f.id
    left join public.personas pe on pe.id = x.actualizado_por
   where f.id = p_gasto_fijo_id;
end $$;
revoke all on function retail.fn_gasto_fijo_ficha(uuid) from public, anon;
grant execute on function retail.fn_gasto_fijo_ficha(uuid) to authenticated;

-- 6. Lo que la lista de fijos necesita de todas las fichas (sin cuentas): quién cobra y qué falta. -----------------------------

create or replace function retail.fn_gastos_fijos_fichas()
returns table (gasto_fijo_id uuid, beneficiario text, forma_de_pago text, codigo_servicio text, contrato_vence date, tiene_cuenta boolean, actualizado_en timestamptz)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare v_ubics uuid[] := retail.fn_gastos_ubicaciones(); v_todo boolean := retail.fn_ve_finanzas_de_todo(); v_banco boolean := retail.fn_es_lider();
begin
  if not retail.fn_tiene_acceso_retail() or (not v_todo and coalesce(cardinality(v_ubics), 0) = 0) then
    return;
  end if;
  return query
  select x.gasto_fijo_id, x.beneficiario, x.forma_de_pago, x.codigo_servicio, x.contrato_vence,
         case when v_banco then (x.cuenta_bancaria is not null or x.cci is not null or x.celular_billetera is not null) end,
         x.actualizado_en
    from retail.gastos_fijos_ficha x
    join retail.gastos_fijos f on f.id = x.gasto_fijo_id
   where f.activo and ((f.ubicacion_id is null and v_todo) or f.ubicacion_id = any (v_ubics));
end $$;
revoke all on function retail.fn_gastos_fijos_fichas() from public, anon;
grant execute on function retail.fn_gastos_fijos_fichas() to authenticated;

-- 7. El historial de una ficha: solo líder y admin (trae cuentas). ------------------------------------------------------------

create or replace function retail.fn_gasto_fijo_ficha_cambios(p_gasto_fijo_id uuid)
returns table (campo text, antes text, despues text, cambiado_por_nombre text, cambiado_en timestamptz)
language sql stable security definer set search_path = retail, public, extensions as $$
  select x.campo, x.antes, x.despues, nullif(concat_ws(' ', pe.nombres, pe.apellidos), ''), x.cambiado_en
    from retail.gastos_fijos_ficha_cambios x
    left join public.personas pe on pe.id = x.cambiado_por
   where x.gasto_fijo_id = p_gasto_fijo_id
     and retail.fn_tiene_acceso_retail()
     and retail.fn_es_lider()
   order by x.cambiado_en desc, x.campo
   limit 50;
$$;
revoke all on function retail.fn_gasto_fijo_ficha_cambios(uuid) from public, anon;
grant execute on function retail.fn_gasto_fijo_ficha_cambios(uuid) to authenticated;

-- ¿SE PEGÓ ENTERO? Esta es la ÚLTIMA instrucción del archivo. Si no ves «QUEDÓ BIEN», es seguro volver a pegarlo completo.
select '20261018003000 · ficha de pago del gasto fijo' as parte,
       case when to_regclass('retail.gastos_fijos_ficha') is not null
             and to_regclass('retail.gastos_fijos_ficha_cambios') is not null
             and to_regprocedure('retail.guardar_gasto_fijo(uuid, uuid, text, text, uuid, text, numeric, boolean, integer, text, jsonb)') is not null
             and to_regprocedure('retail.guardar_gasto_fijo(uuid, uuid, text, text, uuid, text, numeric, boolean, integer, text)') is null
             and to_regprocedure('retail.fn_gasto_fijo_ficha(uuid)') is not null
             and to_regprocedure('retail.fn_gastos_fijos_fichas()') is not null
             and to_regprocedure('retail.fn_gasto_fijo_ficha_cambios(uuid)') is not null
             and exists (select 1 from pg_trigger where tgrelid = 'retail.gastos_fijos_ficha'::regclass and tgname = 'gastos_fijos_ficha_anotar_cambio')
            then 'QUEDÓ BIEN' else 'REVISAR: falta algún paso' end as resultado;
