-- ============================================================================
-- 29 — Código corto y parlante, y varios códigos de barras por prenda
-- Correr en cayla-DYNAMIC (SQL Editor). Todo en el cajón `retail`.
-- Gemelo de `supabase/migrations/0047_codigos.sql`. Ver ADR-0025 para el porqué.
--
-- ⚠ PEGAR DESPUÉS DE `28_colores.sql`: el código de variante lleva el código de
--   color (`BLU-0042-AZM-M`), así que `retail.colores` y `variantes.color_id`
--   tienen que existir antes.
--
-- LOS TRES PROBLEMAS QUE CIERRA
--   1. **El código no cabe en la etiqueta.** `EtiquetasGenerator.tsx:66-71`
--      dibuja el Code 128 con `preserveAspectRatio="none"` y `width:100%`: el
--      código se estira al ancho de la etiqueta sin importar cuántos módulos
--      tenga. `BLUSA-MANGA-LARGA-ESCOTE-V-M-AZUL-MARINO` son 475 módulos en ~50
--      mm útiles = 1.2 puntos por módulo a 300 dpi; la regla de impresión
--      térmica es ≥3. `BLU-0042-AZM-M` son 189 módulos = 3.1 puntos. Ésta es la
--      razón real de que la pistola "a veces no lea".
--   2. **El código cambia si corriges un typo**, porque se deriva de la
--      referencia. Un identificador que se mueve no es un identificador.
--   3. **No hay `unique (producto_id, talla, color)`**: con cuatro Encargadas
--      capturando en paralelo, el censo nace duplicado el primer día.
--
-- LA PIEZA QUE MÁS CAMBIA EL CENSO: `retail.codigos_barras`
--   Felipe confirmó que casi todas las prendas YA traen código de barras de
--   fábrica. Una tabla donde una variante puede tener VARIOS códigos convierte
--   el censo de "imprimir y pegar 900 etiquetas antes de escanear nada" a
--   "escanear lo que ya está en la percha". Y el backfill registra también el
--   `sku`, así que toda etiqueta ya impresa sigue funcionando.
--
-- `codigo` NO ES CLAVE, es un nombre. `id` (uuid) sigue siendo la única clave.
--   Tres invariantes: se asigna una vez y nunca se recalcula; ninguna consulta
--   deriva significado del prefijo (`where categoria_id = …`, nunca
--   `where codigo like 'BLU-%'`); no es destino de ninguna FK.
-- ============================================================================

-- ============================================================================
-- PASO 0 · PRE-FLIGHT — CORRER LOS TRES, LEER, Y RECIÉN SEGUIR
-- ============================================================================
-- (A) Categorías que este archivo NO conoce. Si devuelve filas, el
--     `set not null` del paso 1 va a fallar: hay que darles su prefijo de 3
--     letras acá antes de pegar (y que no choque con ningún código de
--     `retail.colores`).
--
--   select familia, nombre from retail.categorias
--   where familia || '|' || nombre not in (
--     'indumentaria|Abrigos','indumentaria|Blazers/Sacos','indumentaria|Blusas',
--     'indumentaria|Bodys','indumentaria|Camisas','indumentaria|Casacas/Chaquetas',
--     'indumentaria|Chalecos','indumentaria|Chompas','indumentaria|Conjuntos',
--     'indumentaria|Enterizos','indumentaria|Faldas','indumentaria|Jeans',
--     'indumentaria|Pantalones','indumentaria|Poleras/Sudaderas','indumentaria|Polos/Camisetas',
--     'indumentaria|Ropa interior/Lencería','indumentaria|Shorts/Bermudas','indumentaria|Tops',
--     'indumentaria|Trajes de baño','indumentaria|Vestidos',
--     'accesorios|Bufandas/Chalinas','accesorios|Carteras/Bolsos','accesorios|Cinturones',
--     'accesorios|Gorros/Sombreros','accesorios|Lentes de sol','accesorios|Mochilas',
--     'bisuteria|Anillos','bisuteria|Aretes','bisuteria|Collares','bisuteria|Pulseras',
--     'calzado|Botas','calzado|Sandalias','calzado|Zapatillas','calzado|Zapatos formales',
--     'belleza|Maquillaje','papeleria|Colores','papeleria|Lapiceros');
--
-- (B) Variantes duplicadas. Si devuelve filas, el índice del paso 4 falla. Se
--     resuelve UNA POR UNA con Felipe — nunca borrando: se marca una como
--     `productos.estado='descontinuada'`, o se fusiona moviendo el stock con un
--     movimiento que deje rastro.
--
--   select producto_id, coalesce(talla,'') t, coalesce(color,'') c,
--          count(*), array_agg(sku)
--   from retail.variantes group by 1,2,3 having count(*) > 1;
--
-- (C) SKUs que chocarían entre sí en `codigos_barras` (no debería haber: `sku`
--     ya es unique, esto es por si acaso).
--
--   select sku, count(*) from retail.variantes where sku is not null
--   group by sku having count(*) > 1;
-- ============================================================================

-- ---------- 1. prefijo por categoría ----------
alter table retail.categorias add column if not exists prefijo text;

-- Las 37 escritas a mano, sin derivar del nombre: derivarlas daría colisiones
-- (Chompas y Chocolate → CHO) y prefijos que nadie reconocería. Ninguna repite
-- un código de `retail.colores`, para que leer `CAM-0042-CAM-M` no sea un acertijo.
update retail.categorias set prefijo = case familia || '|' || nombre
  when 'indumentaria|Abrigos'                then 'ABR'
  when 'indumentaria|Blazers/Sacos'          then 'BLZ'
  when 'indumentaria|Blusas'                 then 'BLU'
  when 'indumentaria|Bodys'                  then 'BOD'
  when 'indumentaria|Camisas'                then 'CMS'
  when 'indumentaria|Casacas/Chaquetas'      then 'CAS'
  when 'indumentaria|Chalecos'               then 'CHA'
  when 'indumentaria|Chompas'                then 'CMP'
  when 'indumentaria|Conjuntos'              then 'CON'
  when 'indumentaria|Enterizos'              then 'ENT'
  when 'indumentaria|Faldas'                 then 'FAL'
  when 'indumentaria|Jeans'                  then 'JEA'
  when 'indumentaria|Pantalones'             then 'PAN'
  when 'indumentaria|Poleras/Sudaderas'      then 'SUD'
  when 'indumentaria|Polos/Camisetas'        then 'POL'
  when 'indumentaria|Ropa interior/Lencería' then 'LEN'
  when 'indumentaria|Shorts/Bermudas'        then 'SHO'
  when 'indumentaria|Tops'                   then 'TOP'
  when 'indumentaria|Trajes de baño'         then 'TBA'
  when 'indumentaria|Vestidos'               then 'VES'
  when 'accesorios|Bufandas/Chalinas'        then 'BUF'
  when 'accesorios|Carteras/Bolsos'          then 'CAR'
  when 'accesorios|Cinturones'               then 'CIN'
  when 'accesorios|Gorros/Sombreros'         then 'GOR'
  when 'accesorios|Lentes de sol'            then 'LSO'
  when 'accesorios|Mochilas'                 then 'MOC'
  when 'bisuteria|Anillos'                   then 'ANL'  -- ANL, no ANI: ANI es Animal print
  when 'bisuteria|Aretes'                    then 'ARE'
  when 'bisuteria|Collares'                  then 'COL'
  when 'bisuteria|Pulseras'                  then 'PUL'
  when 'calzado|Botas'                       then 'BOT'
  when 'calzado|Sandalias'                   then 'SAN'
  when 'calzado|Zapatillas'                  then 'ZAP'
  when 'calzado|Zapatos formales'            then 'ZFO'
  when 'belleza|Maquillaje'                  then 'MAQ'
  when 'papeleria|Colores'                   then 'CLR'
  when 'papeleria|Lapiceros'                 then 'LAP'
end
where prefijo is null;

-- Si alguna categoría quedó sin prefijo, esto falla y aborta — ruidoso a
-- propósito (ver pre-flight A).
alter table retail.categorias alter column prefijo set not null;
alter table retail.categorias drop constraint if exists categorias_prefijo_formato;
alter table retail.categorias add constraint categorias_prefijo_formato check (prefijo ~ '^[A-Z]{3}$');
create unique index if not exists categorias_prefijo_unico on retail.categorias (prefijo);

-- ---------- 2. correlativo transaccional y sin huecos ----------
-- Tabla contadora y no `create sequence`: las secuencias son no-transaccionales
-- (un rollback quema el número y deja huecos, y `BLU-0042` se va a leer como "el
-- modelo 42 de blusas"), y una secuencia por prefijo obligaría a ejecutar DDL
-- dentro de una función. El `insert … on conflict do update … returning` toma el
-- lock de fila: atómico y sin huecos en una sola sentencia.
create table if not exists retail.codigos_correlativos (
  prefijo text primary key,
  ultimo integer not null default 0 check (ultimo >= 0),
  updated_at timestamptz not null default now()
);
alter table retail.codigos_correlativos enable row level security;
drop policy if exists codigos_correlativos_select on retail.codigos_correlativos;
create policy codigos_correlativos_select on retail.codigos_correlativos
  for select using (auth.role() = 'authenticated');
-- Sin policy de escritura: solo vía la función security definer.

create or replace function retail.fn_siguiente_correlativo(p_prefijo text)
returns integer language plpgsql security definer set search_path = retail, public
as $$
declare v integer;
begin
  insert into codigos_correlativos (prefijo, ultimo) values (p_prefijo, 1)
    on conflict (prefijo) do update
      set ultimo = codigos_correlativos.ultimo + 1, updated_at = now()
    returning ultimo into v;
  return v;
end $$;

-- ---------- 3. las columnas ----------
alter table retail.productos add column if not exists codigo text;
create unique index if not exists productos_codigo_unico on retail.productos (codigo);
alter table retail.variantes add column if not exists codigo text;
create unique index if not exists variantes_codigo_unico on retail.variantes (codigo);

-- ---------- 4. identidad de variante (ver pre-flight B) ----------
-- Expresión con `coalesce` y no `unique nulls not distinct`, para no depender de
-- la versión de Postgres del proyecto Dynamic.
create unique index if not exists variantes_identidad_unica
  on retail.variantes (producto_id, coalesce(talla, ''), coalesce(color, ''));

-- ---------- 5. codigos_barras (va ANTES del backfill: la función escribe acá) ----------
create table if not exists retail.codigos_barras (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  variante_id uuid not null references retail.variantes (id) on delete cascade,
  origen text not null check (origen in ('cayla', 'proveedor', 'otro')),
  nota text,
  created_at timestamptz not null default now(),
  creado_por uuid references public.personas (id)
);
create index if not exists codigos_barras_variante_idx on retail.codigos_barras (variante_id);

alter table retail.codigos_barras enable row level security;
drop policy if exists codigos_barras_select on retail.codigos_barras;
create policy codigos_barras_select on retail.codigos_barras
  for select using (auth.role() = 'authenticated');
-- Sin policy de escritura: vía RPC, igual que `stock` y `movimientos`.

create or replace function retail.registrar_codigo_barras(
  p_variante_id uuid, p_codigo text, p_origen text default 'proveedor', p_nota text default null
)
returns uuid language plpgsql security definer set search_path = retail, public
as $$
declare v_id uuid; v_persona_id uuid; v_dueno uuid; v_codigo text;
begin
  v_codigo := nullif(trim(p_codigo), '');
  if v_codigo is null then raise exception 'El código no puede estar vacío'; end if;
  if not exists (select 1 from variantes where id = p_variante_id) then
    raise exception 'La variante % no existe', p_variante_id;
  end if;

  -- Dos proveedores que reutilizan un código es raro pero real, y adivinar cuál
  -- gana es peor que preguntar: se avisa, no se pisa en silencio.
  select variante_id into v_dueno from codigos_barras where codigo = v_codigo;
  if v_dueno is not null then
    if v_dueno = p_variante_id then
      return (select id from codigos_barras where codigo = v_codigo);  -- idempotente
    end if;
    raise exception 'El código % ya está asignado a otra prenda', v_codigo;
  end if;

  select id into v_persona_id from public.personas where auth_user_id = auth.uid();
  insert into codigos_barras (codigo, variante_id, origen, nota, creado_por)
    values (v_codigo, p_variante_id, p_origen, p_nota, v_persona_id)
    returning id into v_id;
  return v_id;
end $$;

-- ---------- 6. cómo se arma un código ----------
create or replace function retail.fn_token_talla(p_talla text)
returns text language sql immutable set search_path = retail, public as $$
  select case
    when retail.fn_clave_texto(p_talla) is null then 'U'
    when retail.fn_clave_texto(p_talla) in ('unico', 'unica', 'talla unica', 'u') then 'U'
    when retail.fn_clave_texto(p_talla) = 'estandar' then 'STD'
    else upper(regexp_replace(
      translate(p_talla, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'), '[^A-Za-z0-9]', '', 'g'))
  end;
$$;

create or replace function retail.fn_asignar_codigo_producto(p_producto_id uuid)
returns text language plpgsql security definer set search_path = retail, public
as $$
declare v_codigo text; v_prefijo text; v_n integer;
begin
  select p.codigo, coalesce(c.prefijo, 'GEN') into v_codigo, v_prefijo
    from productos p left join categorias c on c.id = p.categoria_id
    where p.id = p_producto_id;
  if not found then raise exception 'El producto % no existe', p_producto_id; end if;
  if v_codigo is not null then return v_codigo; end if;   -- idempotente: nunca renumera
  v_n := retail.fn_siguiente_correlativo(v_prefijo);
  v_codigo := v_prefijo || '-' || lpad(v_n::text, 4, '0');
  update productos set codigo = v_codigo where id = p_producto_id;
  return v_codigo;
end $$;

-- Devuelve NULL —y no asigna nada— cuando la variante tiene un color escrito a
-- mano que todavía no está normalizado. Es deliberado: inventar un token de
-- color desde el texto libre produciría colisiones entre colores distintos y
-- ensuciaría el código con la misma mugre que `28_colores.sql` vino a limpiar.
create or replace function retail.fn_asignar_codigo_variante(p_variante_id uuid)
returns text language plpgsql security definer set search_path = retail, public
as $$
declare v_codigo text; v_base text; v_producto_id uuid; v_color_id text; v_color text; v_talla text; v_sku text;
begin
  select v.codigo, p.codigo, v.producto_id, v.color_id, v.color, retail.fn_token_talla(v.talla), v.sku
    into v_codigo, v_base, v_producto_id, v_color_id, v_color, v_talla, v_sku
    from variantes v join productos p on p.id = v.producto_id
    where v.id = p_variante_id;
  if not found then raise exception 'La variante % no existe', p_variante_id; end if;
  if v_codigo is not null then return v_codigo; end if;   -- idempotente
  if v_color_id is null and retail.fn_clave_texto(v_color) is not null then
    return null;  -- color sin normalizar: no se inventa
  end if;

  if v_base is null then v_base := retail.fn_asignar_codigo_producto(v_producto_id); end if;

  -- Sin color (una correa, un gorro) el segmento simplemente no existe: el
  -- código queda BASE-TALLA en vez de meter un relleno que no significa nada.
  v_codigo := v_base || case when v_color_id is null then '' else '-' || v_color_id end
                     || '-' || v_talla;
  update variantes set codigo = v_codigo where id = p_variante_id;

  -- El código recién acuñado queda ESCANEABLE en el mismo acto, o el invariante
  -- "todo código encuentra su prenda" solo valdría para lo que existía el día de
  -- la migración. Se registra también el `sku`, que es lo que codifican las
  -- etiquetas ya impresas (EtiquetasGenerator.tsx:224).
  insert into codigos_barras (codigo, variante_id, origen, nota)
    values (v_codigo, p_variante_id, 'cayla', 'código corto CAYLA')
    on conflict (codigo) do nothing;
  if v_sku is not null then
    insert into codigos_barras (codigo, variante_id, origen, nota)
      values (v_sku, p_variante_id, 'cayla', 'sku de la variante')
      on conflict (codigo) do nothing;
  end if;

  return v_codigo;
end $$;

-- ---------- 7. backfill de lo que ya existe ----------
-- Por `created_at` para que el correlativo siga el orden real en que nacieron.
-- Los `T########` que genera el taller también reciben código acá: son el peor
-- caso de todos —no dicen nada, no se dictan por teléfono, no se verifican a ojo
-- contra la prenda— y desde ahora dejan de mostrarse.
do $$ declare r record; begin
  for r in select id from retail.productos where codigo is null order by created_at, id loop
    perform retail.fn_asignar_codigo_producto(r.id);
  end loop;
  for r in select id from retail.variantes where codigo is null order by created_at, id loop
    perform retail.fn_asignar_codigo_variante(r.id);
  end loop;
end $$;

-- Red de arrastre: las variantes que quedaron SIN código corto (color a mano sin
-- normalizar) igual tienen que ser encontrables por su etiqueta ya impresa.
insert into retail.codigos_barras (codigo, variante_id, origen, nota)
  select sku, id, 'cayla', 'sku anterior — etiquetas impresas antes de la 29'
  from retail.variantes where sku is not null
  on conflict (codigo) do nothing;

-- ============================================================================
-- VERIFICACIÓN (correr a mano después de pegar)
-- ============================================================================
-- 1. Las 37 categorías tienen prefijo y ninguno se repite:
--   select count(*) as categorias, count(distinct prefijo) as prefijos from retail.categorias;
--
-- 2. Cuántos modelos y variantes quedaron con código, y cuántos esperan color:
--   select (select count(*) from retail.productos where codigo is not null) as modelos_con_codigo,
--          (select count(*) from retail.variantes where codigo is not null) as variantes_con_codigo,
--          (select count(*) from retail.variantes where codigo is null) as esperan_color;
--
-- 3. Que el código nuevo sea de verdad más corto (el punto de todo esto):
--   select codigo, length(codigo) as caracteres, 11*length(codigo)+35 as modulos
--   from retail.variantes where codigo is not null order by length(codigo) desc limit 5;
--   -- ninguno debería pasar de ~20 caracteres (~255 módulos, ~2.3 puntos/módulo).
--   -- Si alguno es largo, es por una talla rara (`fn_token_talla` no la acortó).
--
-- 4. Que toda prenda con código sea escaneable por AMBOS códigos:
--   select count(*) from retail.variantes v
--   where v.codigo is not null
--     and not exists (select 1 from retail.codigos_barras cb
--                     where cb.variante_id = v.id and cb.codigo = v.codigo);
--   -- debe dar 0.
--
-- 5. Prueba viva de lo que importa: escanear el código de fábrica de una prenda
--    real y que resuelva a la prenda correcta.
--   select retail.registrar_codigo_barras('<variante_id>', '<el EAN de la etiqueta>', 'proveedor');
--   select v.codigo, p.referencia from retail.codigos_barras cb
--     join retail.variantes v on v.id = cb.variante_id
--     join retail.productos p on p.id = v.producto_id
--   where cb.codigo = '<el EAN de la etiqueta>';
-- ============================================================================
