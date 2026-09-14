-- ============================================================================
-- Adjuntos de factura de proveedor — el PDF o la foto del papel, pegados a la compra
--
-- EL PROBLEMA. Una factura de proveedor se registra copiando el papel a mano
-- (CompraFormV2) y el papel se va a un cajón. Cuando hay que revisar una
-- diferencia con el proveedor, un pago que no cuadra o una consulta de SUNAT,
-- nadie encuentra el documento — o está en el WhatsApp de alguien. Felipe pidió
-- (2026-09-14) poder adjuntar la factura y sus documentos relacionados (guía,
-- nota de crédito, foto del fardo) al registrarla y desde su detalle.
--
-- ES LA PRIMERA VEZ QUE EL SISTEMA GUARDA ARCHIVOS. Verificado antes de escribir
-- esto: cero llamadas a Storage en apps/web (el bucket `fotos-productos` que
-- menciona el diccionario es herencia de Dynamic, sin código en retail). Por eso
-- las decisiones de acá son las que van a heredar los siguientes archivos del
-- sistema (fotos de producto, comprobantes escaneados):
--
--   · BUCKET PRIVADO. Una factura de proveedor lleva RUC, montos y condiciones
--     de pago. No va en una URL pública adivinable: se abre con URL firmada de
--     una hora, generada en el servidor. Nombre `retail-compras-adjuntos` con
--     prefijo porque producción comparte el proyecto de Supabase con Dynamic
--     (CLAUDE.md §"Cómo aplicar SQL a producción") y un bucket `adjuntos` a
--     secas sería de los dos.
--   · NUNCA SE BORRA. "Quitar" pone `archivado_en`; el objeto queda en el
--     bucket. Un adjunto de factura es evidencia contable: se saca de la vista,
--     no se destruye. Misma regla que `movimientos` y que desactivar un
--     proveedor. No hay política de DELETE ni en la tabla ni en el bucket.
--   · LA TABLA ES LA VERDAD, NO EL BUCKET. Un objeto en el bucket sin fila en
--     `compra_adjuntos` no existe para el sistema (quedó de una subida a medias
--     y no se muestra). La fila se escribe por RPC, que valida que la compra
--     exista, que no esté anulada y que la ruta viva en la carpeta de ESA
--     compra — así nadie "adjunta" a la factura B un archivo subido a la A.
--   · EL ARCHIVO SUBE DESDE EL NAVEGADOR AL BUCKET, no pasa por Next: un PDF
--     de 8 MB no tiene por qué atravesar un servidor de São Paulo dos veces.
--     La política de INSERT en storage.objects deja subir a cualquier persona
--     autenticada solo dentro de este bucket; el candado de negocio está en la
--     RPC, no en la subida.
--
-- LOCAL: el servicio de Storage está apagado en supabase/config.toml (choque
-- entre los dos stacks) y el Postgres local ni siquiera tiene el schema
-- `storage`. El bloque del bucket y sus políticas se ejecuta SOLO si
-- `storage.buckets` existe — en producción sí, en `db reset` local se salta y
-- deja un NOTICE. Tabla y RPCs funcionan igual en los dos lados; la subida
-- real se ve en producción (o encendiendo Storage local, ver config.toml).
--
-- LÍMITES: 10 MB por archivo; PDF, JPG, PNG, WebP y HEIC (foto del iPhone).
-- La pantalla los repite como cortesía; el bucket y la RPC son el candado.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. La tabla
-- ---------------------------------------------------------------------------
create table retail.compra_adjuntos (
  id uuid primary key default gen_random_uuid(),
  compra_id uuid not null references retail.compras (id),
  -- Ruta dentro del bucket: `<compra_id>/<uuid>-<nombre>`. Única: un objeto,
  -- una fila.
  ruta text not null unique,
  -- El nombre tal como lo subió la persona, para mostrarlo ("factura.pdf").
  nombre text not null,
  tipo text not null,
  bytes integer not null check (bytes > 0),
  subido_por uuid references public.personas (id),
  created_at timestamptz not null default now(),
  -- null = visible. Con fecha = quitado de la vista (nunca borrado).
  archivado_en timestamptz,
  archivado_por uuid references public.personas (id),
  constraint compra_adjuntos_ruta_de_su_compra check (ruta like compra_id::text || '/%'),
  constraint compra_adjuntos_tipo_permitido check (
    tipo in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif')
  ),
  constraint compra_adjuntos_tamano_maximo check (bytes <= 10 * 1024 * 1024)
);
create index compra_adjuntos_compra_idx on retail.compra_adjuntos (compra_id) where archivado_en is null;

comment on table retail.compra_adjuntos is
  'Archivos pegados a una factura de proveedor (PDF, foto). El objeto vive en el bucket retail-compras-adjuntos; esta fila es la que lo hace existir. Nunca se borra: se archiva.';

alter table retail.compra_adjuntos enable row level security;
create policy compra_adjuntos_select on retail.compra_adjuntos for select using (auth.role() = 'authenticated');
-- Sin políticas de insert/update/delete: solo las RPC (security definer) escriben.

-- ---------------------------------------------------------------------------
-- 2. Registrar un adjunto (después de subir el objeto)
-- ---------------------------------------------------------------------------
create function retail.registrar_adjunto_compra(
  p_compra_id uuid,
  p_ruta text,
  p_nombre text,
  p_tipo text,
  p_bytes integer
) returns uuid
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_compra retail.compras%rowtype;
  v_persona uuid;
  v_id uuid;
begin
  if not retail.fn_puede_registrar_compras() then
    raise exception 'No tienes permiso para adjuntar documentos a una factura';
  end if;
  select * into v_compra from retail.compras where id = p_compra_id;
  if v_compra.id is null then
    raise exception 'La compra % no existe', p_compra_id;
  end if;
  if v_compra.estado = 'anulada' then
    raise exception 'La factura %-% está anulada, no acepta adjuntos', v_compra.serie, v_compra.numero;
  end if;
  if retail.fn_texto_o_null(p_nombre) is null then
    raise exception 'El adjunto necesita un nombre de archivo';
  end if;
  if p_ruta not like p_compra_id::text || '/%' then
    raise exception 'El archivo tiene que estar en la carpeta de esta factura';
  end if;
  if p_tipo not in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif') then
    raise exception 'Solo se aceptan PDF o imágenes (JPG, PNG, WebP, HEIC); llegó %', p_tipo;
  end if;
  if p_bytes is null or p_bytes <= 0 or p_bytes > 10 * 1024 * 1024 then
    raise exception 'El archivo tiene que pesar entre 1 byte y 10 MB';
  end if;

  select id into v_persona from personas where auth_user_id = auth.uid();

  insert into retail.compra_adjuntos (compra_id, ruta, nombre, tipo, bytes, subido_por)
  values (p_compra_id, p_ruta, trim(p_nombre), p_tipo, p_bytes, v_persona)
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Quitar de la vista (archivar). El objeto se queda en el bucket.
-- ---------------------------------------------------------------------------
create function retail.archivar_adjunto_compra(p_adjunto_id uuid) returns void
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_persona uuid;
  v_archivado timestamptz;
begin
  if not retail.fn_puede_registrar_compras() then
    raise exception 'No tienes permiso para quitar adjuntos de una factura';
  end if;
  select archivado_en into v_archivado from retail.compra_adjuntos where id = p_adjunto_id;
  if not found then
    raise exception 'El adjunto % no existe', p_adjunto_id;
  end if;
  if v_archivado is not null then
    raise exception 'Ese adjunto ya estaba quitado';
  end if;
  select id into v_persona from personas where auth_user_id = auth.uid();
  update retail.compra_adjuntos
     set archivado_en = now(), archivado_por = v_persona
   where id = p_adjunto_id;
end;
$$;

grant execute on function retail.registrar_adjunto_compra(uuid, text, text, text, integer) to authenticated;
grant execute on function retail.archivar_adjunto_compra(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. El bucket y sus políticas — solo donde Storage existe (producción)
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'compras_adjuntos: sin schema storage en este Postgres (Storage local apagado); el bucket retail-compras-adjuntos se crea solo en producción.';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'retail-compras-adjuntos',
    'retail-compras-adjuntos',
    false,
    10 * 1024 * 1024,
    array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
  )
  on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  -- Subir y leer: cualquier persona autenticada, solo en este bucket. Ni
  -- update ni delete: un adjunto no se pisa ni se borra.
  drop policy if exists retail_compras_adjuntos_insert on storage.objects;
  create policy retail_compras_adjuntos_insert on storage.objects
    for insert to authenticated
    with check (bucket_id = 'retail-compras-adjuntos');

  drop policy if exists retail_compras_adjuntos_select on storage.objects;
  create policy retail_compras_adjuntos_select on storage.objects
    for select to authenticated
    using (bucket_id = 'retail-compras-adjuntos');
end;
$$;
