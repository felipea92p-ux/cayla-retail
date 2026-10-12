-- ============================================================================
-- pegar-en-produccion-bolsas-reclasificar-aqp-2026-10-10.sql — Bolsas de despacho, actividad 5
-- SCRIPT DE UNA SOLA VEZ (no es una migración: no tiene versión, no entra al CI de migraciones y no se vuelve a pegar).
--
-- EL PROBLEMA PRIMERO. Hasta que la bolsa existió como producto, caja la vendía como «prenda sin registrar» y anotaba la categoría que se le ocurría:
-- Bolsos y Carteras («BOLSA DE COMPRAS», a S/ 0.50), Anillos o Aretes («bolsa papel»). Esas 62 ventas de Tienda AQP (S/ 37.69, del 30-sep al 11-oct) ya
-- están cerradas casi todas, pero siguen contando como demanda de esas categorías en el motor del piso, en Análisis y en Frescura. Con la familia
-- «Empaque» apagada (20261010231000 a 20261010233000), pasarlas a la categoría de las bolsas las saca de todo eso.
--
-- QUÉ HACE. Para cada id de la lista llama a `corregir_prenda_sin_registrar` —LA MISMA función del botón «Corregir lo anotado» (ADR-0369)—: cambia
-- SOLO lo anotado (categoría, talla «Única» y, si la descripción era la automática «Categoría · Color · Talla», la vuelve «Bolsa»). No toca el
-- precio, el stock, la venta ni el comprobante. Cada una deja su foto de antes y después en `prendas_por_regularizar_correcciones` (solo se agrega)
-- y su línea en Actividad, firmada por el administrador cuyo correo pongas abajo. TODO O NADA: una sola transacción; si algo no cuadra, no cambia nada.
--
-- ANTES DE PEGAR (se detiene sin tocar nada y dice cuál falta):
--   1. 20261010231000, 20261010232000 y 20261010233000 ya pegadas (las tres).
--   2. En Catálogo ▸ Familias: la familia «Empaque» creada y con el interruptor «Cuenta en Análisis, Frescura y el plan del piso» APAGADO.
--   3. En Catálogo ▸ Categorías: una categoría activa con el nombre de abajo (por defecto «Bolsas») colgada de esa familia.
--   4. La talla «Única» aprobada (ya existe: la usan Bolsos, Relojes, Aretes…).
--   5. Cambiar `PON-AQUI-TU-CORREO` por el correo de UN administrador activo (quien firma el rastro).
--
-- LA LISTA. Sale de producción (solo lectura, 2026-10-11): estado `pendiente` o `cerrada_sin_prenda`, y (a) la descripción dice «bolsa» y se cobró
-- S/ 5 o menos, o (b) la categoría anotada es Bolsos y Carteras y se cobró S/ 1.99 o menos (una cartera no cuesta S/ 0.50: son bolsas sin descripción).
-- Queda FUERA, a propósito, una venta de «Anillos · Blanco · Talla 6» a S/ 1.00 (puede ser un anillo barato): si es una bolsa, se corrige a mano.
-- Cada fila se vuelve a comprobar contra esa regla antes de tocarla; un id que no existe, repetido, fuera de la regla o ya regularizado frena o se salta:
--   · no existe / repetido / fuera de la regla → ABORTA TODO (la lista está mal).
--   · ya regularizada o anulada → se OMITE y se cuenta (alguien la resolvió con su prenda real; nunca se reescribe).
--   · ya estaba en la categoría y la talla de destino → «ya estaba» (volver a pegar el script no hace nada).
--
-- PRODUCCIÓN. Una sola parte, sin `alter` ni políticas ni `drop trigger` (ADR-0195). Sin `select … into` dentro de textos entre comillas (ADR-0288).
-- VERIFICACIÓN (solo lectura, después):
--   select estado, categoria_id, count(*) from retail.prendas_por_regularizar where id in (select id from _bolsas_ids) group by 1, 2;
--   → una sola categoría (la de las bolsas) y los estados de siempre. Y el último `select` de este archivo trae el resumen.
-- ============================================================================

set search_path = retail, public, extensions;

-- ===== LO ÚNICO QUE SE EDITA =====
create temp table _bolsas_param as
  select 'PON-AQUI-TU-CORREO'::text as correo,
         'Bolsas'::text as categoria,
         62::integer as esperadas;

-- IDS-INICIO
create temp table _bolsas_ids as
  select x.id from unnest(array[
    '8a0a4031-044d-4f00-9817-96e8229b2355'::uuid,
    'e65fe3fa-a0c2-4c6c-bfab-423c0b540255'::uuid,
    '1929eb7f-a64e-407c-8b9d-524f0b0b0d33'::uuid,
    '585ac276-273a-445d-a4ce-754b628f349d'::uuid,
    '867f9092-4016-4433-aafb-1eff1f5af5a6'::uuid,
    '4239aff2-0e10-479f-be75-bb701b40af6b'::uuid,
    '95f9b74d-7122-48ea-9d30-3750574ba52b'::uuid,
    'b76d5f06-7354-489f-9f19-abecdb482306'::uuid,
    '18e8cf41-23a7-4079-bc84-aeb4e9ded737'::uuid,
    'ee136b9e-f441-4f4e-b3df-8c6600cc2d1e'::uuid,
    'ec858380-1a2b-4584-978f-f610036736c7'::uuid,
    '5d115698-088a-4d64-93b6-fee8731c32f5'::uuid,
    '678969f3-1b61-417b-b75d-a3d8991fcd33'::uuid,
    'fc0b1573-b1f1-45d6-a4aa-4d4a6b7af1a3'::uuid,
    '7e7ea91e-9d61-43c0-a215-8406a3c7d274'::uuid,
    '76cf0585-2775-45ae-84cd-d254f05ac495'::uuid,
    '60c4d53d-ffbd-478b-9fe8-60ae4cad251f'::uuid,
    '3dccac51-91bb-4a47-8ae5-8cbb74dc9cda'::uuid,
    '14e859f6-7890-4d82-bb98-4bb1aa9026fa'::uuid,
    'a59a4443-bd37-4579-9524-6288dccd0727'::uuid,
    'b92f0bf0-6abe-4049-9f6a-b80bc0c915d5'::uuid,
    '283ef7dd-4bc0-45a9-9c86-c8aba7acf683'::uuid,
    '8c175107-3de8-4d32-b9d5-5d3673d0c1b8'::uuid,
    '21138e76-552c-4784-b774-2e827810ab06'::uuid,
    'a61bde45-2af7-4787-bfc4-e53327c3002c'::uuid,
    '5cd9de9b-0c7c-4015-82e5-77f1e4cbcf57'::uuid,
    '8071ae76-ef98-4ddb-8eb6-3aa837bd29b3'::uuid,
    '9c0090bc-77f7-4d1f-9e5d-4748e2c678dd'::uuid,
    '39ae2388-10a4-4c4c-acef-ee424a1b6887'::uuid,
    'e49fc955-01a9-492f-83fd-fa88a55ce6fa'::uuid,
    '949bb548-1a2c-4dba-b1ea-3e0624824dc5'::uuid,
    'c2dbe3ce-ebbb-40f9-be72-ec06d08812c4'::uuid,
    '0a151a08-6cd4-487f-a3b8-03a3562fdcfd'::uuid,
    'fdd83a5a-d5d5-4ec9-ab28-3a449f6df627'::uuid,
    'e9097442-4145-4ff7-95e2-39aa982ef434'::uuid,
    '91921d6d-b218-4f10-bdc6-c628d9a1486e'::uuid,
    '33a7c8ad-1e7e-4946-adc3-670ab0232622'::uuid,
    '97b50c8d-4614-4e55-aef6-b973df7cde74'::uuid,
    '812d0049-7519-4931-b71d-01a31a55f558'::uuid,
    'e83c4e23-1735-489b-a1ad-e46eb27241a4'::uuid,
    '5850a466-a088-4939-81ef-d4ee8737202d'::uuid,
    '0b397cc4-14bc-4294-a155-d9d5fd3a840e'::uuid,
    '680de052-4d58-4ebb-93ac-35f56ec284ae'::uuid,
    '1ef7f68b-3e0c-46a6-adc1-cd0b1b8beae5'::uuid,
    'a9b1d04b-fc17-42de-a4a3-cd1f5cc79dc8'::uuid,
    '66d29009-6806-4042-8718-0f473c89e6c9'::uuid,
    '252a209e-916f-4ca7-bea8-963e4e6c3ceb'::uuid,
    '0d6f8ad6-c500-4b51-ae17-bf15b00319e0'::uuid,
    '57471388-ed48-4fde-8d48-881f73a6469d'::uuid,
    '400ff3ff-3c60-44a9-a95f-7814c0431b73'::uuid,
    '3cc61079-e5dc-442f-a496-1220fc2a688d'::uuid,
    '1e645faa-640c-4074-a32b-6b700edaa258'::uuid,
    '02c96c1e-165a-4950-af0c-1d34ac9944da'::uuid,
    'f2889dbf-e7a3-4a6c-95e5-35d642fe0a9c'::uuid,
    'e1702170-d9dc-429c-bf03-3bd6f183ac4b'::uuid,
    'c5c19ff6-aee8-4bc6-ba18-a6138e3790a7'::uuid,
    '2622bbfd-6d96-47af-bf90-89b208b652ac'::uuid,
    '2caeba83-ba55-42ca-bfd8-4291adcc0944'::uuid,
    'df3369ec-d6ed-43c4-8fd8-875a13c1222c'::uuid,
    '800368aa-6a13-4727-a59c-44026c84be12'::uuid,
    'afc1de14-cde3-41d3-89c9-2a13c1e3c7ac'::uuid,
    '51fb3866-eadf-41e3-96b8-e8e415c63fff'::uuid
  ]) as x(id);
-- IDS-FIN

create temp table _bolsas_resumen (movidas integer, ya_estaban integer, omitidas integer);

do $reclasificar$
declare
  v_correo text := (select p.correo from _bolsas_param p);
  v_nombre_categoria text := (select p.categoria from _bolsas_param p);
  v_esperadas integer := (select p.esperadas from _bolsas_param p);
  v_auth uuid;
  v_categoria uuid;
  v_talla uuid;
  v_ids integer := (select count(*) from _bolsas_ids);
  v_distintos integer := (select count(distinct i.id) from _bolsas_ids i);
  v_existen integer := (select count(*) from retail.prendas_por_regularizar p join _bolsas_ids i on i.id = p.id);
  v_movidas integer := 0;
  v_ya integer := 0;
  v_omitidas integer := 0;
  v_desc text;
  r record;
begin
  if v_correo is null or v_correo like 'PON-AQUI%' then
    raise exception 'Falta poner tu correo: cambia PON-AQUI-TU-CORREO por el correo de un administrador activo (quien firma el rastro).';
  end if;
  v_auth := (select p.auth_user_id from public.personas p
              where lower(p.email) = lower(v_correo) and p.rol = 'admin' and p.estado = 'activo' and p.auth_user_id is not null limit 1);
  if v_auth is null then
    raise exception 'El correo % no es el de un administrador activo con cuenta: pon el de uno.', v_correo;
  end if;

  if to_regprocedure('retail.fn_categoria_entra_a_motores(uuid)') is null
     or to_regprocedure('retail.corregir_prenda_sin_registrar(uuid,text,uuid,uuid,text)') is null then
    raise exception 'Faltan las migraciones: pega primero 20261010231000, 20261010232000 y 20261010233000 (y 20261010150000, «Corregir lo anotado»).';
  end if;

  v_categoria := (select c.id from retail.categorias c where c.nombre = v_nombre_categoria and c.activo);
  if v_categoria is null then
    raise exception 'No hay una categoría activa llamada «%»: créala en Catálogo ▸ Categorías, colgada de la familia «Empaque».', v_nombre_categoria;
  end if;
  if retail.fn_categoria_entra_a_motores(v_categoria) then
    raise exception 'La familia de «%» todavía cuenta en los motores: apaga su interruptor en Catálogo ▸ Familias (si no, pasar las ventas ahí no sacaría nada de Análisis).', v_nombre_categoria;
  end if;
  v_talla := (select t.id from retail.tallas t where t.activo and t.estado = 'aprobado' and lower(t.valor) in ('única', 'unica') order by t.valor limit 1);
  if v_talla is null then
    raise exception 'No hay una talla «Única» aprobada y activa.';
  end if;

  if v_ids <> v_esperadas or v_distintos <> v_ids or v_existen <> v_ids then
    raise exception 'La lista no cuadra: se esperaban % ids, hay % (distintos: %) y existen % en la cola. Alguien la tocó: no se cambia nada.',
      v_esperadas, v_ids, v_distintos, v_existen;
  end if;

  -- Firma del rastro: la cuenta del administrador (sin sesión, `auth.uid()` sale de estas dos claves, como en las pruebas de la base).
  perform set_config('request.jwt.claim.sub', v_auth::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_auth::text, 'role', 'authenticated')::text, true);

  for r in
    select p.*, c.nombre as categoria_anotada
      from retail.prendas_por_regularizar p
      join retail.categorias c on c.id = p.categoria_id
      join _bolsas_ids i on i.id = p.id
     order by p.vendido_en, p.id
  loop
    -- La misma regla con la que se armó la lista: si una fila ya no la cumple, la lista está mal y no se sigue.
    if not ((r.descripcion ilike '%bolsa%' and r.precio_cobrado <= 5)
            or (r.categoria_anotada = 'Bolsos y Carteras' and r.precio_cobrado <= 1.99)
            or (r.categoria_id = v_categoria)) then
      raise exception 'La venta % («%», S/ %) ya no cumple la regla de la lista: no se cambia nada.', r.id, r.descripcion, r.precio_cobrado;
    end if;
    if r.estado not in ('pendiente', 'cerrada_sin_prenda') then
      v_omitidas := v_omitidas + 1;
      continue;
    end if;
    if r.categoria_id = v_categoria and r.talla_id = v_talla then
      v_ya := v_ya + 1;
      continue;
    end if;
    -- La descripción automática («Bolsos y Carteras · Beige · Talla Única») nombra una categoría que ya no es: queda «Bolsa». La de caja se conserva.
    v_desc := case when r.descripcion like '%·%' then 'Bolsa' else r.descripcion end;
    perform retail.corregir_prenda_sin_registrar(r.id, v_desc, v_categoria, v_talla, r.color_codigo);
    v_movidas := v_movidas + 1;
  end loop;

  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  insert into _bolsas_resumen values (v_movidas, v_ya, v_omitidas);
end
$reclasificar$;

-- El resumen: movidas + ya estaban + omitidas = 62 (la primera vez, todas movidas salvo las que alguien ya haya resuelto).
select r.movidas, r.ya_estaban, r.omitidas,
       (select count(*) from retail.prendas_por_regularizar_correcciones c join _bolsas_ids i on i.id = c.prenda_id) as con_rastro,
       (select count(*) from retail.prendas_por_regularizar p join _bolsas_ids i on i.id = p.id
         where p.categoria_id = (select c.id from retail.categorias c where c.nombre = (select categoria from _bolsas_param) and c.activo)) as ya_en_la_categoria
  from _bolsas_resumen r;
