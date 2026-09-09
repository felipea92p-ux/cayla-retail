-- ============================================================================
-- 0047 — Código corto y parlante, y varios códigos de barras por prenda
--
-- QUÉ ARREGLA (1): EL CÓDIGO NO CABE FÍSICAMENTE EN LA ETIQUETA
--   Hoy el SKU se genera en el cliente como slug de la referencia
--   (`NuevoProductoForm.tsx:31-37`, `RecibirLoteForm.tsx:55-61`):
--   "Blusa manga larga escote V" talla M color Azul marino →
--   `BLUSA-MANGA-LARGA-ESCOTE-V-M-AZUL-MARINO`, 40 caracteres.
--
--   `EtiquetasGenerator.tsx:66-71` dibuja el Code 128 con
--   `preserveAspectRatio="none"` y `width: 100%` — o sea que **el código se
--   estira al ancho de la etiqueta sin importar cuántos módulos tenga**. Code
--   128 usa 11 módulos por carácter, más start (11), checksum (11) y stop (13):
--
--     texto                                      módulos   mm/módulo   puntos@300dpi
--     BLUSA-MANGA-...-AZUL-MARINO (40 ch)          475       0.105        1.2
--     BLU-0042-AZM-M              (14 ch)          189       0.265        3.1
--
--   La regla de impresión térmica es ≥3 puntos por módulo. A 1.2 la impresora
--   redondea a 1 punto, con ~20% de error en el ancho de cada barra — y Code 128
--   se decodifica por PROPORCIÓN de anchos. **Ésta es la razón real de que la
--   pistola "a veces no lea" y haya que acercarla mucho.** El código corto no es
--   una preferencia estética: es un requisito de la impresora ya comprada.
--   (Verificar el dpi exacto de la Brother QL de Felipe; a 203 dpi es peor.)
--
-- QUÉ ARREGLA (2): EL CÓDIGO CAMBIA SI CORRIGES UN TYPO
--   Al derivarse de la referencia, arreglar "escote V" → "escote en V" cambia el
--   SKU de una prenda que ya tiene la etiqueta pegada. Un identificador que se
--   mueve no es un identificador.
--
-- QUÉ ARREGLA (3): CUATRO PERSONAS CREAN LA MISMA PRENDA CUATRO VECES
--   No hay `unique (producto_id, talla, color)`. Nada a nivel base impide dos
--   variantes idénticas del mismo modelo. Con cuatro Encargadas capturando en
--   paralelo, el censo nace duplicado el primer día. Se cierra acá.
--
-- EL CONTRA-ARGUMENTO CLÁSICO, Y POR QUÉ NO APLICA
--   La ortodoxia dice que un identificador que codifica atributos miente cuando
--   el atributo cambia. Es correcto — **para claves**. `productos.id` y
--   `variantes.id` (uuid) siguen siendo las únicas claves: toda FK, todo join,
--   toda policy. `codigo` no es clave: es un NOMBRE. Los nombres pueden cargar
--   significado y pueden volverse históricamente inexactos (alguien apellidado
--   Herrero no forja).
--
--   Tres invariantes que mantienen esto honesto, y que hay que respetar:
--     1. `codigo` se asigna UNA VEZ y nunca se recalcula — ni al reclasificar,
--        ni al renombrar la categoría, ni al corregir el color.
--     2. Ninguna consulta deriva significado del prefijo. "Todas las blusas" es
--        `where categoria_id = …`, NUNCA `where codigo like 'BLU-%'`.
--     3. `codigo` es `unique` pero no es PK ni destino de ninguna FK.
--   Si mañana una prenda pasa de Blusas a Tops y sigue diciendo `BLU-0042`, no
--   es un bug: se compró y se etiquetó como blusa, y la etiqueta ya está pegada.
--   El almacén manda sobre la taxonomía.
--
-- LA PIEZA QUE MÁS CAMBIA EL CENSO: `codigos_barras`
--   Felipe confirmó (2026-09-09) que **casi todas las prendas ya traen código de
--   barras de fábrica**. Una tabla donde una variante puede tener VARIOS códigos
--   —el de CAYLA y el del proveedor— convierte el censo de "imprimir y pegar 900
--   etiquetas antes de poder escanear" a "escanear lo que ya está en la percha".
--   Escanear cualquiera de ellos encuentra la misma prenda.
--   Y de yapa resuelve el problema de compatibilidad: el backfill mete también
--   el `sku` viejo, así que **toda etiqueta ya impresa sigue funcionando**.
--   Se descartó adoptar el código del proveedor COMO sku: dejaría los SKU
--   heterogéneos y perdería el código corto, que es lo que se dicta por teléfono.
--
-- POR QUÉ TABLA CONTADORA Y NO `create sequence`
--   (a) Las secuencias de Postgres son no-transaccionales: un insert que hace
--       rollback quema el número y deja huecos. Felipe va a leer `BLU-0042` como
--       "el modelo 42 de blusas", y los huecos lo van a hacer desconfiar.
--   (b) Una secuencia por prefijo obligaría a ejecutar DDL dentro de una función
--       cada vez que se crea una categoría — privilegios que no queremos regalar.
--   (c) `insert … on conflict do update … returning` toma el lock de fila: es
--       atómico y sin huecos en una sola sentencia. Descartado también
--       `max(numero)+1`: es la misma idea sin el lock, o sea con carrera.
--
-- SE ROMPE SI: dos proveedores distintos reutilizan el mismo código de barras.
--   El `unique` sobre `codigos_barras.codigo` lo rechaza ruidosamente, que es lo
--   correcto — es raro, y adivinar cuál de los dos es peor que preguntar.
-- ============================================================================

-- ---------- 1. prefijo por categoría ----------
alter table categorias add column prefijo text;

-- Las 37 escritas a mano, sin derivar del nombre: derivarlas daría colisiones
-- (Chompas y Chocolate → CHO) y prefijos que nadie reconocería. Ninguna repite
-- un código de `colores` (0046), para que leer `CAM-0042-CAM-M` no sea un acertijo.
update categorias set prefijo = case familia || '|' || nombre
  -- indumentaria
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
  -- accesorios
  when 'accesorios|Bufandas/Chalinas'        then 'BUF'
  when 'accesorios|Carteras/Bolsos'          then 'CAR'
  when 'accesorios|Cinturones'               then 'CIN'
  when 'accesorios|Gorros/Sombreros'         then 'GOR'
  when 'accesorios|Lentes de sol'            then 'LSO'
  when 'accesorios|Mochilas'                 then 'MOC'
  -- bisutería (ANL, no ANI: ANI es Animal print en `colores`)
  when 'bisuteria|Anillos'                   then 'ANL'
  when 'bisuteria|Aretes'                    then 'ARE'
  when 'bisuteria|Collares'                  then 'COL'
  when 'bisuteria|Pulseras'                  then 'PUL'
  -- calzado
  when 'calzado|Botas'                       then 'BOT'
  when 'calzado|Sandalias'                   then 'SAN'
  when 'calzado|Zapatillas'                  then 'ZAP'
  when 'calzado|Zapatos formales'            then 'ZFO'
  -- belleza y papelería
  when 'belleza|Maquillaje'                  then 'MAQ'
  when 'papeleria|Colores'                   then 'CLR'
  when 'papeleria|Lapiceros'                 then 'LAP'
end;

-- Si alguna categoría quedó sin prefijo, el `set not null` de abajo falla y la
-- migración aborta — ruidoso a propósito: significa que se agregó una categoría
-- que este archivo no conoce y hay que darle su prefijo.
alter table categorias alter column prefijo set not null;
alter table categorias add constraint categorias_prefijo_formato check (prefijo ~ '^[A-Z]{3}$');
create unique index categorias_prefijo_unico on categorias (prefijo);

-- ---------- 2. correlativo transaccional y sin huecos ----------
create table codigos_correlativos (
  prefijo text primary key,
  ultimo integer not null default 0 check (ultimo >= 0),
  updated_at timestamptz not null default now()
);
alter table codigos_correlativos enable row level security;
create policy codigos_correlativos_select on codigos_correlativos
  for select using (auth.role() = 'authenticated');
-- Sin policy de escritura: solo se toca vía la función security definer.

create or replace function fn_siguiente_correlativo(p_prefijo text)
returns integer language plpgsql security definer set search_path = public
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
alter table productos add column codigo text;
create unique index productos_codigo_unico on productos (codigo);
alter table variantes add column codigo text;
create unique index variantes_codigo_unico on variantes (codigo);

comment on column productos.codigo is
  'Nombre corto y estable del modelo (BLU-0042). NO es clave — `id` lo es. Se asigna una vez y nunca se recalcula. Ninguna consulta debe derivar la categoría del prefijo.';

-- ---------- 4. identidad de variante ----------
-- PRE-FLIGHT antes de pegar en producción (si devuelve filas, el índice falla y
-- hay que resolver cada caso con Felipe — nunca borrando: se marca una como
-- `productos.estado='descontinuada'` o se fusiona moviendo el stock):
--   select producto_id, coalesce(talla,'') t, coalesce(color,'') c,
--          count(*), array_agg(sku)
--   from retail.variantes group by 1,2,3 having count(*) > 1;
--
-- Expresión con `coalesce` y no `unique nulls not distinct`, para no depender de
-- la versión de Postgres del proyecto Dynamic.
create unique index variantes_identidad_unica
  on variantes (producto_id, coalesce(talla, ''), coalesce(color, ''));

-- ---------- 5. cómo se arma un código ----------
create or replace function fn_token_talla(p_talla text)
returns text language sql immutable as $$
  select case
    when fn_clave_texto(p_talla) is null then 'U'
    when fn_clave_texto(p_talla) in ('unico', 'unica', 'talla unica', 'u') then 'U'
    when fn_clave_texto(p_talla) = 'estandar' then 'STD'
    else upper(regexp_replace(
      translate(p_talla, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'), '[^A-Za-z0-9]', '', 'g'))
  end;
$$;

create or replace function fn_asignar_codigo_producto(p_producto_id uuid)
returns text language plpgsql security definer set search_path = public
as $$
declare v_codigo text; v_prefijo text; v_n integer;
begin
  select p.codigo, coalesce(c.prefijo, 'GEN') into v_codigo, v_prefijo
    from productos p left join categorias c on c.id = p.categoria_id
    where p.id = p_producto_id;
  if not found then raise exception 'El producto % no existe', p_producto_id; end if;
  if v_codigo is not null then return v_codigo; end if;   -- idempotente: nunca renumera
  v_n := fn_siguiente_correlativo(v_prefijo);
  v_codigo := v_prefijo || '-' || lpad(v_n::text, 4, '0');
  update productos set codigo = v_codigo where id = p_producto_id;
  return v_codigo;
end $$;

-- Devuelve NULL —y no asigna nada— cuando la variante tiene un color escrito a
-- mano que todavía no está normalizado (`color_id is null`). Es deliberado:
-- inventar un token de color a partir del texto libre produciría colisiones
-- entre colores distintos y ensuciaría el código con la misma mugre que 0046
-- vino a limpiar. Esas variantes se ven así, y se resuelven poniéndoles color:
--   select sku, color from variantes where codigo is null and color is not null;
create or replace function fn_asignar_codigo_variante(p_variante_id uuid)
returns text language plpgsql security definer set search_path = public
as $$
declare v_codigo text; v_base text; v_producto_id uuid; v_color_id text; v_color text; v_talla text; v_sku text;
begin
  select v.codigo, p.codigo, v.producto_id, v.color_id, v.color, fn_token_talla(v.talla), v.sku
    into v_codigo, v_base, v_producto_id, v_color_id, v_color, v_talla, v_sku
    from variantes v join productos p on p.id = v.producto_id
    where v.id = p_variante_id;
  if not found then raise exception 'La variante % no existe', p_variante_id; end if;
  if v_codigo is not null then return v_codigo; end if;   -- idempotente
  if v_color_id is null and fn_clave_texto(v_color) is not null then
    return null;  -- color sin normalizar: no se inventa
  end if;

  if v_base is null then v_base := fn_asignar_codigo_producto(v_producto_id); end if;

  -- Sin color (una correa, un gorro) el segmento simplemente no existe: el
  -- código queda BASE-TALLA en vez de meter un relleno que no significa nada.
  v_codigo := v_base || case when v_color_id is null then '' else '-' || v_color_id end
                     || '-' || v_talla;
  update variantes set codigo = v_codigo where id = p_variante_id;

  -- El código recién acuñado tiene que quedar ESCANEABLE en el mismo acto, o el
  -- invariante "todo código encuentra su prenda" solo vale para lo que existía
  -- el día de la migración. (Lo encontró la prueba 10: el backfill cubría el
  -- pasado y nada mantenía el futuro.) Se registra también el `sku`, que es lo
  -- que codifican las etiquetas ya impresas — EtiquetasGenerator.tsx:224.
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

-- ---------- 6. codigos_barras: varios códigos, una prenda ----------
-- Va ANTES del backfill a propósito: `fn_asignar_codigo_variante` escribe en
-- esta tabla, así que tiene que existir cuando el backfill la invoque.
create table codigos_barras (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  variante_id uuid not null references variantes (id) on delete cascade,
  origen text not null check (origen in ('cayla', 'proveedor', 'otro')),
  nota text,
  created_at timestamptz not null default now(),
  creado_por uuid references personas (id)
);
create index codigos_barras_variante_idx on codigos_barras (variante_id);

comment on table codigos_barras is
  'Todos los códigos que encuentran una prenda: el corto de CAYLA, el sku viejo (etiquetas ya impresas) y el que la prenda trae de fábrica. Escanear cualquiera resuelve a la misma variante.';

alter table codigos_barras enable row level security;
create policy codigos_barras_select on codigos_barras
  for select using (auth.role() = 'authenticated');
-- Sin policy de escritura: se escribe vía RPC, igual que `stock` y `movimientos`.

create or replace function registrar_codigo_barras(
  p_variante_id uuid, p_codigo text, p_origen text default 'proveedor', p_nota text default null
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare v_id uuid; v_persona_id uuid; v_dueno uuid; v_codigo text;
begin
  v_codigo := nullif(trim(p_codigo), '');
  if v_codigo is null then raise exception 'El código no puede estar vacío'; end if;
  if not exists (select 1 from variantes where id = p_variante_id) then
    raise exception 'La variante % no existe', p_variante_id;
  end if;

  -- Si ya está tomado por OTRA prenda hay que avisar, no pisar en silencio: dos
  -- proveedores que reutilizan un código es raro pero real, y adivinar cuál gana
  -- es peor que preguntar.
  select variante_id into v_dueno from codigos_barras where codigo = v_codigo;
  if v_dueno is not null then
    if v_dueno = p_variante_id then
      return (select id from codigos_barras where codigo = v_codigo);  -- idempotente
    end if;
    raise exception 'El código % ya está asignado a otra prenda', v_codigo;
  end if;

  select id into v_persona_id from personas where auth_user_id = auth.uid();
  insert into codigos_barras (codigo, variante_id, origen, nota, creado_por)
    values (v_codigo, p_variante_id, p_origen, p_nota, v_persona_id)
    returning id into v_id;
  return v_id;
end $$;

-- ---------- 7. backfill de lo que ya existe ----------
-- Por `created_at` para que el correlativo siga el orden real en que nacieron.
-- Los `T########` que genera el taller (0027) también reciben código acá: son el
-- peor caso de todos —no dicen nada, no se dictan por teléfono y no se verifican
-- a ojo contra la prenda— y desde ahora dejan de mostrarse.
-- `fn_asignar_codigo_variante` ya registra cada código en `codigos_barras`, así
-- que este bucle deja las prendas escaneables sin un paso aparte.
do $$ declare r record; begin
  for r in select id from productos where codigo is null order by created_at, id loop
    perform fn_asignar_codigo_producto(r.id);
  end loop;
  for r in select id from variantes where codigo is null order by created_at, id loop
    perform fn_asignar_codigo_variante(r.id);
  end loop;
end $$;

-- Red de arrastre: las variantes que quedaron SIN código corto (color escrito a
-- mano todavía sin normalizar) igual tienen que ser encontrables por su etiqueta
-- ya impresa, que codifica el `sku` (EtiquetasGenerator.tsx:224). Sin esto, esas
-- prendas serían invisibles para la pistola justo durante el censo.
insert into codigos_barras (codigo, variante_id, origen, nota)
  select sku, id, 'cayla', 'sku anterior — etiquetas impresas antes de 0047'
  from variantes where sku is not null
  on conflict (codigo) do nothing;
