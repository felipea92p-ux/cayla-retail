-- ============================================================================
-- 25 — retail.migraciones_aplicadas: el registro de qué se pegó de verdad
-- Se pega en el SQL Editor de PRODUCCIÓN (proyecto de cayla-DYNAMIC,
-- vovjyyiafkxteijimpuy). Solo toca el schema `retail`.
--
-- ORDEN DE PEGADO DE ESTA TANDA:  22  →  23  →  24  →  **25**
-- Va ÚLTIMO, siempre: registra los tres archivos anteriores, así que pegarlo
-- antes escribiría una afirmación falsa.
--
-- ---------------------------------------------------------------------------
-- QUÉ ARREGLA
-- ---------------------------------------------------------------------------
-- Hoy nada en producción registra qué se corrió. Las migraciones de `retail` se
-- pegan a mano en el SQL Editor, así que `supabase list_migrations` ni siquiera
-- ve este schema. Toda la auditoría de septiembre tuvo que hacerse por
-- inferencia: probando el EFECTO de cada archivo contra information_schema y
-- pg_proc. Eso funciona para saber si algo existe, y no alcanza para saber si
-- existe la VERSIÓN correcta.
--
-- ---------------------------------------------------------------------------
-- LAS DOS DECISIONES DE DISEÑO QUE IMPORTAN
-- ---------------------------------------------------------------------------
--
-- (1) LA CLAVE ES LA RUTA DEL ARCHIVO, NO UN NÚMERO.
--     La numeración de retail es dual y colisiona: el `0019` de
--     supabase/migrations/ no es el `19` de supabase/unificacion/. La ruta
--     ('unificacion/20_comprobantes_items.sql') es el único identificador
--     estable que existe.
--
-- (2) EL sha256 NO ES DECORACIÓN: ES LA PREGUNTA ÚTIL.
--     "¿Corrí el archivo 20?" no sirve de nada. La pregunta que evita el
--     desastre es "¿corrí LA VERSIÓN del 20 que hoy está en el repo?". Sin el
--     hash, un archivo editado tres semanas después de aplicarse se ve
--     exactamente igual que uno al día.
--
-- ---------------------------------------------------------------------------
-- POR QUÉ LAS 17 FILAS RETRO LLEVAN sha256 = 'RETRO-DESCONOCIDO'
-- ---------------------------------------------------------------------------
-- Esta es la parte que NO se puede negociar por comodidad. Es tentador poner el
-- hash de hoy en las filas viejas — quedaría todo "verde". Sería mentira, y la
-- mentira caería justo en los dos archivos que sabemos drifteados:
--
--   * unificacion/05_operacion.sql — lo que corrió en producción NO tiene el
--     `check (metodo_pago in (...))` que el archivo del repo declara.
--   * unificacion/07_funciones_operacion.sql — lo que corrió en producción dejó
--     `registrar_gasto` con 6 parámetros; el repo promete 7.
--
-- Si esas dos filas llevaran el hash del archivo de hoy, la tabla afirmaría
-- exactamente lo contrario de lo que pasó, y la próxima auditoría le creería.
-- 'RETRO-DESCONOCIDO' dice la verdad: "esto se aplicó, no sé con qué texto".
-- El hash REAL solo empieza a existir desde el 22 en adelante, porque desde acá
-- cada archivo se registra con el texto exacto que se pegó.
--
-- `aplicada_at` de las filas retro es la fecha del COMMIT del archivo
-- (`git log -1 --format=%cI -- <archivo>`), que es una COTA INFERIOR: se aplicó
-- ese día o después, nunca antes. No es la fecha real de aplicación y la `nota`
-- lo dice en cada fila.
--
-- ---------------------------------------------------------------------------
-- QUÉ ARCHIVOS **NO** APARECEN ACÁ, Y POR QUÉ
-- ---------------------------------------------------------------------------
--   13_recibir_lote_valida_sede.sql .... SUPERADO por el 14 (ya marcado en su
--                                        cabecera). Nunca se aplicó. No se aplica.
--   16_crear_producto_variantes.sql .... SUPERADO por el 18. Define la firma de
--                                        7 args de crear_producto_con_variantes;
--                                        producción tiene la de 8 y ninguno de
--                                        los dos archivos hace `drop`. Pegarlo
--                                        HOY recrearía la sobrecarga fantasma del
--                                        ADR-0004. No se aplica.
--   20_comprobantes_items.sql .......... SUPERADOS por el 23, que los fusiona.
--   21_actualizar_transmision_...sql ... Se registran como 'unificacion/23_...'.
--
-- Esta tabla registra lo APLICADO. Que un archivo peligroso no tenga fila acá no
-- impide que alguien lo pegue: eso lo evita la cabecera SUPERADO del propio
-- archivo, y de fondo lo evitaría un `pnpm db:diff` que le pregunte a producción
-- qué tiene y lo compare contra el repo. Esta tabla dice lo que CREEMOS haber
-- corrido; el diff diría lo que HAY. Hacen falta las dos, y la que falta es el diff.
--
-- REVERSIBLE: sí, `drop table retail.migraciones_aplicadas`. No hay ninguna
-- dependencia de código sobre ella.
-- ============================================================================

begin;

-- ============================================================================
-- 1. LA TABLA
--    Append-only para la app, igual que `movimientos`: solo se escribe desde el
--    SQL Editor (que corre como `postgres` y se salta RLS). Sin políticas de
--    insert/update/delete: no es un olvido, es el diseño.
-- ============================================================================
create table if not exists retail.migraciones_aplicadas (
  archivo     text primary key,
  sha256      text not null,
  aplicada_at timestamptz not null default now(),
  aplicada_por text,
  nota        text
);

comment on table retail.migraciones_aplicadas is
  'Qué archivo SQL se pegó en producción, con el sha256 del texto exacto. '
  'sha256=RETRO-DESCONOCIDO significa: se aplicó, pero no sabemos con qué versión '
  '(retro-poblado por inferencia en la auditoría de sep-2026).';

alter table retail.migraciones_aplicadas enable row level security;

drop policy if exists migraciones_select on retail.migraciones_aplicadas;
create policy migraciones_select on retail.migraciones_aplicadas
  for select using (auth.role() = 'authenticated');

grant select on retail.migraciones_aplicadas to authenticated;
revoke insert, update, delete on retail.migraciones_aplicadas from authenticated;

-- ============================================================================
-- 2. RETRO-POBLACIÓN — 17 aplicaciones ya hechas, todas con hash desconocido
--    La `nota` de cada fila lleva la SONDA con la que se comprobó que está
--    aplicada, para que nadie tenga que volver a inferirlo desde cero.
-- ============================================================================
insert into retail.migraciones_aplicadas (archivo, sha256, aplicada_at, aplicada_por, nota) values

  ('unificacion/01_sedes.sql', 'RETRO-DESCONOCIDO', '2026-07-23T12:18:34-05:00', 'retro-inferido',
   'Sonda: to_regclass(''retail.sede_meta'') is not null, con CHECK tipo in (tienda,fabrica,corporativo,almacen). aplicada_at = fecha del commit (cota inferior).'),

  -- Este NO es un archivo: es el paso que creó el schema `retail` en producción.
  -- 03_candados.sql:3 lo menciona ("después del paso 2"), pero su DDL no está
  -- versionado en NINGUNA parte del repo. Se registra igual, porque el agujero
  -- es real y hay que verlo: hoy `npx supabase db reset` en una máquina nueva NO
  -- reproduce producción, y nadie puede auditar con qué permisos se creó.
  ('unificacion/02_schema_retail.SIN-ARCHIVO-EN-EL-REPO', 'RETRO-DESCONOCIDO', '2026-07-23T12:18:34-05:00', 'retro-inferido',
   'PASO SIN ARCHIVO: el DDL que creó el schema retail en producción no existe en el repo. Sonda: to_regnamespace(''retail'') is not null. Recuperarlo es tarea abierta (baseline de migraciones).'),

  ('unificacion/03_candados.sql', 'RETRO-DESCONOCIDO', '2026-07-23T12:54:10-05:00', 'retro-inferido',
   'Sonda: count(*)=2 en information_schema.views where table_schema=''retail'' (vistas sedes y personas).'),

  ('unificacion/04_catalogo.sql', 'RETRO-DESCONOCIDO', '2026-07-23T13:06:51-05:00', 'retro-inferido',
   'Sonda: existen retail.categorias, retail.productos y retail.variantes.'),

  ('unificacion/05_operacion.sql', 'RETRO-DESCONOCIDO', '2026-07-23T13:26:28-05:00', 'retro-inferido',
   'DRIFTEADO: lo aplicado NO es el archivo de hoy. Le falta el check de metodo_pago que 0013_finanzas_nucleo.sql:35-36 declara (pg_constraint sobre retail.gastos solo devolvía gastos_total_check). Repuesto por unificacion/24. Sonda: existe retail.gastos.'),

  ('unificacion/06_contabilidad_produccion.sql', 'RETRO-DESCONOCIDO', '2026-07-23T13:34:13-05:00', 'retro-inferido',
   'INCOMPLETO: creó la tabla cuentas_contables pero NO su semilla de 35 filas (la de 0020_contabilidad_cimientos.sql:49). Sembrada por unificacion/24. Sonda: existen retail.cuentas_contables, retail.asientos, retail.producciones.'),

  ('unificacion/07_funciones_operacion.sql', 'RETRO-DESCONOCIDO', '2026-07-23T13:42:29-05:00', 'retro-inferido',
   'DRIFTEADO: lo aplicado NO es el archivo de hoy. Copió la version PRE-0014 de registrar_gasto (6 args, sin p_metodo_pago), y abrir_caja/cerrar_caja/registrar_venta quedaron sin el candado de sede de 0012. Corregido por unificacion/22 y unificacion/24. Sonda: pg_proc con registrar_venta, abrir_caja, cerrar_caja, registrar_gasto.'),

  ('unificacion/08_funciones_finanzas.sql', 'RETRO-DESCONOCIDO', '2026-07-23T13:48:29-05:00', 'retro-inferido',
   'Sonda: pg_proc con fn_asiento_cuadra, registrar_deposito, recalcular_stock, recibir_lote.'),

  ('unificacion/09_funciones_produccion.sql', 'RETRO-DESCONOCIDO', '2026-07-23T13:53:06-05:00', 'retro-inferido',
   'Sonda: pg_proc con set_etapa_produccion, cerrar_produccion, eliminar_produccion, revertir_produccion_inventario.'),

  ('unificacion/10_storage_fotos.sql', 'RETRO-DESCONOCIDO', '2026-07-23T15:04:29-05:00', 'retro-inferido',
   'Sonda: count(*)=1 en storage.buckets where id=''fotos-productos''.'),

  ('unificacion/11_produccion_material_etapas.sql', 'RETRO-DESCONOCIDO', '2026-07-23T17:57:30-05:00', 'retro-inferido',
   'Sonda: existe retail.productos.material, y el cuerpo de set_etapa_produccion contiene las 6 etapas (patronaje, muestra, escalado, corte, confeccion, acabado).'),

  ('unificacion/12_almacen_interno.sql', 'RETRO-DESCONOCIDO', '2026-09-03T17:43:52-05:00', 'retro-inferido',
   'Sonda: existe retail.stock_almacen, el índice contenedores_un_almacen_por_sede, y pg_proc con bajar_a_piso y devolver_a_almacen.'),

  ('unificacion/14_recibir_lote_produccion.sql', 'RETRO-DESCONOCIDO', '2026-09-03T21:41:03-05:00', 'retro-inferido',
   'Sonda: firma retail.recibir_lote(uuid,text,jsonb,text,text,text,uuid) — 7 args con p_orden_compra_id — y el cuerpo contiene puede_operar_sede y categoria_id (ADR-0004). Supera a unificacion/13, que NO se aplica.'),

  ('unificacion/15_patrimonio_categoria.sql', 'RETRO-DESCONOCIDO', '2026-09-04T17:13:59-05:00', 'retro-inferido',
   'Sonda: existe la columna retail.patrimonio_items.categoria.'),

  ('unificacion/17_facturacion_completa.sql', 'RETRO-DESCONOCIDO', '2026-09-05T00:49:19-05:00', 'retro-inferido',
   'Sonda: existen retail.comprobantes, retail.series_comprobantes y retail.proformas, con sus CHECK (factura_requiere_ruc, nota_requiere_original, tipo, total>0). Completado por unificacion/23 (columna items y actualizar_transmision_comprobante).'),

  ('unificacion/18_productos_proveedor.sql', 'RETRO-DESCONOCIDO', '2026-09-05T12:13:58-05:00', 'retro-inferido',
   'Sonda: existe retail.productos.proveedor_id y la firma crear_producto_con_variantes(text,text,jsonb,uuid,text,text,text,uuid) de 8 args. Supera a unificacion/16, que NO se aplica (recrearía la sobrecarga fantasma del ADR-0004). OJO: la cabecera de este archivo afirma que agregar un parámetro al final no crea una función nueva — es FALSO, hay que corregirla.'),

  ('unificacion/19_categorias_completas.sql', 'RETRO-DESCONOCIDO', '2026-09-05T12:32:56-05:00', 'retro-inferido',
   'Sonda: count(*)=37 en retail.categorias (indumentaria 20, calzado 4, accesorios 6, bisuteria 4, belleza 1, papeleria 2), que es la verificación que el propio archivo pide. Cierra el ítem "faltan 25 categorías" del BACKLOG.')

on conflict (archivo) do nothing;

-- ============================================================================
-- 3. LA TANDA DE HOY — con su hash REAL
--    Calculados con `shasum -a 256` sobre los archivos del repo, tal como se
--    pegan. Si alguno de los tres se edita después de pegado, el hash de acá
--    deja de coincidir — y eso es exactamente lo que esta tabla existe para
--    delatar.
--    `on conflict do update`: si se repite el pegado, se actualiza el hash y la
--    fecha en vez de fallar. La tabla refleja el ÚLTIMO texto aplicado.
-- ============================================================================
insert into retail.migraciones_aplicadas (archivo, sha256, aplicada_por, nota) values

  ('unificacion/22_candados_y_permisos.sql',
   '48b2822301b15c3f0fb2ef954696ef463dcd5157bdad72e4ca14bc233185cdb7',
   current_user,
   'Reescrito el 08-sep contra el estado real de produccion. puede_operar_sede, es_lider y persona_actual pasan a exigir persona con estado=activo y a ser un exists (nunca NULL): cierra las 5 ex-colaboradoras con login vivo. Clausula tienda_asociada_id repuesta de 0012; revoke de escritura sobre personas/sedes/movimientos/cajas/ventas (cierra la escalada a admin por la vista personas); revoke execute de fn_aplicar_movimiento/recalcular_stock/persona_actual; check cantidad>=0 en stock y stock_almacen. NO toca abrir_caja/cerrar_caja/registrar_venta: produccion ya tenia esos candados, puestos entre el 05 y el 08 desde la rama claude/inventory-system-optimization-005f1e, y en la forma correcta (is not true ya cubre el NULL).'),

  ('unificacion/23_facturacion_fase1.sql',
   '3b657d266f87fef194924c584c0b067af45452db6d91827d4455c6053c351ceb',
   current_user,
   'Reescrito el 08-sep. comprobantes.items y actualizar_transmision_comprobante YA existian en produccion (los pego otra sesion entre el 05 y el 08), asi que este archivo quedo reducido a UNA linea por funcion: el precio_unitario del item generico de respaldo de emitir_comprobante y emitir_nota pasa de p_subtotal (redondeado a centimos) a round(p_total/1.18, 6). Corrige el descuadre de un centimo en el 15,3% de los precios de CAYLA, verificado en vivo: 19.90 salia 19.89, 129.90 salia 129.89, 109.90 salia 109.91. Urgente porque el arreglo del frontend que evita ese camino no esta desplegado, asi que la primera boleta real pasaria por el fallback. unificacion/20 y 21 quedan SUPERADOS y no se pegan.'),

  ('unificacion/24_registrar_gasto_y_semillas.sql',
   '59486296a12be48cf201fca9f997fb866e733e61cd0c8bc385d4684934bca8d8',
   current_user,
   'drop de registrar_gasto(6 args) + create de 7 con p_metodo_pago; check gastos_metodo_pago_check; semilla de las 35 cuentas_contables; los 14 índices perdidos en la transcripción de julio.'),

  ('unificacion/25_migraciones_aplicadas.sql',
   'AUTO-REFERENCIA',
   current_user,
   'Un archivo no puede contener su propio sha256: escribirlo adentro cambia el archivo y por lo tanto el hash. Su hash real está en supabase/unificacion/README-ORDEN-PEGADO.md, junto con el UPDATE de una línea para estamparlo si se quiere.')

on conflict (archivo) do update set
  sha256      = excluded.sha256,
  aplicada_at = now(),
  aplicada_por = excluded.aplicada_por,
  nota        = excluded.nota;

commit;

-- ============================================================================
-- CÓMO SE VERIFICA
-- ============================================================================
-- Pegar esto DESPUÉS del commit. Las 3 columnas deben dar `true`.
--
-- select
--   (select count(*) from retail.migraciones_aplicadas) = 21           as registro_sembrado,
--   (select count(*) from retail.migraciones_aplicadas
--      where sha256 = 'RETRO-DESCONOCIDO') = 17                        as retro_sin_hash_mentido,
--   (select count(*) from retail.migraciones_aplicadas
--      where sha256 not in ('RETRO-DESCONOCIDO','AUTO-REFERENCIA')) = 3 as tanda_con_hash_real;
--
-- Para leerla como humano, en orden de aplicación:
--   select archivo, left(sha256, 12) as hash, aplicada_at::date, aplicada_por
--     from retail.migraciones_aplicadas order by aplicada_at, archivo;
--
-- CÓMO SE USA DE ACÁ EN ADELANTE (la regla que evita repetir todo esto):
-- toda migración nueva de `retail` termina, DENTRO de su propio begin/commit,
-- con su línea de registro — así aplicar y registrar son una sola operación y
-- no hay forma de hacer una sin la otra:
--
--   insert into retail.migraciones_aplicadas (archivo, sha256, aplicada_por, nota)
--   values ('unificacion/26_lo_que_sea.sql', '<shasum -a 256 del archivo>',
--           current_user, 'una línea de qué hace')
--   on conflict (archivo) do update set
--     sha256 = excluded.sha256, aplicada_at = now(), nota = excluded.nota;
--
-- Y lo que esta tabla NO puede hacer: decirte si producción tiene lo que el repo
-- promete. Eso es un `pnpm db:diff` que compare pg_proc / pg_policies /
-- information_schema contra el repo y falle cuando el repo declara algo que
-- producción no tiene. Esta tabla registra lo que CREEMOS haber corrido; el diff
-- lee lo que HAY. Los seis drifts de sep-2026 los habría encontrado el diff en
-- dos segundos, y esta tabla no habría atrapado ninguno.
-- ============================================================================
