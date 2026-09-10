-- ============================================================================
-- 22 — CANDADOS Y PERMISOS
-- Se pega en el SQL Editor de PRODUCCIÓN (proyecto de cayla-DYNAMIC,
-- vovjyyiafkxteijimpuy). Solo toca el schema `retail`.
--
-- ORDEN DE PEGADO DE ESTA TANDA:  22  →  24  →  25
-- (el 23 ya no hace falta: ver la nota "LO QUE PRODUCCIÓN YA RESOLVIÓ" abajo)
--
-- ############################################################################
-- ##  REESCRITO EL 2026-09-08 CONTRA EL ESTADO REAL DE PRODUCCIÓN DE HOY.    ##
-- ##  La versión del 05-sep reescribía abrir_caja, cerrar_caja y             ##
-- ##  registrar_venta. YA NO LO HACE — producción se arregló sola en el      ##
-- ##  camino y volver a escribirlas era riesgo sin ganancia. Ver abajo.      ##
-- ############################################################################
--
-- ---------------------------------------------------------------------------
-- LO QUE PRODUCCIÓN YA RESOLVIÓ ENTRE EL 05 Y EL 08 DE SEPTIEMBRE
-- ---------------------------------------------------------------------------
-- Verificado hoy con pg_get_functiondef, no asumido:
--
--   * `abrir_caja`, `cerrar_caja` y `registrar_venta` YA tienen el candado de
--     sede. Y lo tienen en la forma correcta:
--         if retail.puede_operar_sede(...) is not true then raise ...
--     `is not true` ya cubre el NULL por sí solo (en SQL, `NULL is not true`
--     es TRUE, así que sí lanza). No hace falta envolverlo en coalesce.
--   * `es_lider` y `puede_operar_sede` YA están envueltas en coalesce(...,false),
--     así que el hueco del NULL que encontró la auditoría está cerrado.
--   * `comprobantes.items` y `retail.actualizar_transmision_comprobante` YA
--     existen — el archivo 23 quedó sin objeto.
--
-- Ese arreglo llegó desde la rama `claude/inventory-system-optimization-005f1e`,
-- que a la fecha NO está fusionada en `main`. Producción va por delante del
-- repositorio: es el mismo agujero de siempre (nadie registra qué corrió),
-- ahora en la dirección contraria. Lo cierra el archivo 25.
--
-- POR ESO ESTE ARCHIVO YA NO TOCA NINGUNA FUNCIÓN DE DINERO. Reescribir
-- `registrar_venta` para agregarle un candado que ya tiene sería pisar, con una
-- copia del 05-sep, la única versión probada que hay. Un script que se pega a
-- mano en la base con el dinero de tres tiendas se hace lo más chico posible.
--
-- ---------------------------------------------------------------------------
-- QUÉ ARREGLA (lo que sigue faltando hoy, 4 huecos verificados)
-- ---------------------------------------------------------------------------
--
-- (1) LA ESCALADA A ADMIN. Es el más grave y lleva abierto desde julio.
--     `retail.personas` es una vista con security_invoker=false sobre la tabla
--     de identidad de Dynamic: corre como `postgres` (rolbypassrls=true), así
--     que las 5 políticas RLS de la tabla real quedan inertes al entrar por la
--     vista, y `auth_user_id` es is_updatable=YES. Verificado hoy:
--         has_table_privilege('authenticated','retail.personas','UPDATE') → true
--     Cualquiera de los 24 logins activos puede hacer, desde la consola del
--     navegador y con su propia sesión:
--         update retail.personas set auth_user_id='<el suyo>' where id='<el del admin>'
--     y quedar como Líder de todo el sistema. Sin rastro: la vista no tiene
--     trigger y `personas` no guarda historial. Se cierra con un revoke.
--
-- (2) EX-COLABORADORAS QUE TODAVÍA PUEDEN OPERAR — y son más que el viernes.
--     Conteo de hoy sobre logins vivos (auth.users sin deleted_at):
--         activo   + login .... 24
--         inactivo + login ....  5   ← el viernes eran 4
--     `public.fn_rol_actual()` filtra estado='activo', pero
--     `public.fn_sede_actual_persona()` NO lo filtra — y a `puede_operar_sede`
--     le basta con que la sede coincida. Resultado: 5 personas que ya no
--     trabajan en CAYLA inician sesión y operan su sede de siempre: abren caja,
--     venden, mueven stock. Se cierra exigiendo la fila ACTIVA dentro de las
--     funciones de `retail`, sin depender de esa asimetría de Dynamic.
--
-- (3) La cláusula perdida de la 0012. `supabase/migrations/0012_rpc_valida_sede.sql`
--     dejaba operar también sobre el almacén asociado a la propia tienda
--     (`tienda_asociada_id`). La transcripción de julio a `retail` la perdió.
--     Hoy es inerte (las 5 sedes tienen tienda_asociada_id NULL), pero es la que
--     hace falta el día que exista el almacén interno del Taller (ADR-0016). Se
--     repone ahora para no volver a descubrirla en caliente.
--
-- (4) `check (cantidad >= 0)` en stock y stock_almacen: el BACKLOG lo daba por
--     aplicado desde julio y no existe (pg_constraint sobre retail.stock
--     devuelve 0 CHECKs). Hoy hay 0 filas negativas, así que entra sin pelear.
--
-- ---------------------------------------------------------------------------
-- QUÉ NO HACE (a propósito)
-- ---------------------------------------------------------------------------
-- NO TOCA NADA DEL SCHEMA `public`. `public.personas`, `public.fn_rol_actual` y
-- `public.fn_sede_actual_persona` son de cayla-dynamic: otro sistema, con su
-- propio dueño y su propio contrato (ADR-0012). A `fn_sede_actual_persona` le
-- falta el filtro de estado y es asimétrica con `fn_rol_actual` — pero eso se
-- arregla allá, coordinado con Dynamic. Acá las funciones de `retail` dejan de
-- confiar en esa asimetría y comprueban el estado por su cuenta.
--
-- NO FILTRA `estado` DENTRO DE LA VISTA `retail.personas`. Sería lo más corto y
-- estaría MAL: las claves foráneas de ventas, movimientos, gastos y comprobantes
-- apuntan a esas filas. Esconder a una persona inactiva dejaría huérfano el
-- historial de todo lo que hizo mientras trabajaba acá — se perdería justo la
-- auditoría. Lo que se corta es el PERMISO DE OPERAR, no la existencia.
--
-- NO toca `alter view retail.personas set (security_invoker = on)`: puede
-- reabrir la recursión que motivó la 0023 y hay que probarlo en local primero.
-- El revoke de escritura, solo, ya cierra el daño real.
--
-- REVERSIBLE: sí, entero. Los `create or replace` vuelven atrás recreando el
-- cuerpo anterior (queda transcrito arriba de cada bloque); los revoke con el
-- grant equivalente; los CHECK con `drop constraint`.
-- ============================================================================

begin;

-- ============================================================================
-- 1. LOS TRES HELPERS DE IDENTIDAD
--    Tres cambios, los tres dentro de `retail`, ninguno sobre `public`:
--      a) exigen que la persona esté ACTIVA        → cierra el hueco (2)
--      b) son un `exists`, no una comparación      → el NULL deja de ser
--         posible por estructura, no por un coalesce que la próxima
--         reescritura puede volver a perder
--      c) puede_operar_sede recupera la cláusula del almacén → hueco (3)
--
--    Leen `retail.personas`, la vista sobre la identidad de Dynamic, que expone
--    exactamente lo que hace falta (verificado con information_schema hoy):
--      id, auth_user_id, nombre, sede_id, rol, email, estado
--    Una sola lectura de esa vista reemplaza las dos llamadas separadas a
--    public.fn_rol_actual() y public.fn_sede_actual_persona(): hace menos
--    trabajo, no más. "Líder" es rol='admin', igual que lo definía fn_rol_actual.
-- ============================================================================

-- ANTES en producción (pg_get_functiondef, 2026-09-08):
--   select coalesce(public.fn_rol_actual() = 'admin', false)
--       or coalesce(public.fn_sede_actual_persona() = p_sede_id, false);
create or replace function retail.puede_operar_sede(p_sede_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from retail.personas p
    where p.auth_user_id = auth.uid()
      -- El candado de estado: una ex-colaboradora conserva su fila (el historial
      -- de sus ventas y movimientos apunta ahí) pero pierde el permiso de operar.
      and p.estado = 'activo'
      and (
            -- Líder: cualquier sede.
            p.rol = 'admin'
            -- Integrante: su propia sede.
         or p.sede_id = p_sede_id
            -- Repuesto de 0012_rpc_valida_sede.sql: quien es de una tienda también
            -- opera sobre el almacén asociado a ESA tienda (recibir mercadería y
            -- bajar al piso). Hoy inerte —las 5 sedes tienen tienda_asociada_id
            -- NULL— y deja de serlo con el almacén del Taller.
         or exists (
              select 1 from retail.sedes s
              where s.id = p_sede_id
                and s.tienda_asociada_id = p.sede_id
            )
      )
  );
$$;

-- ANTES en producción: select coalesce(public.fn_rol_actual() = 'admin', false);
create or replace function retail.es_lider()
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from retail.personas p
    where p.auth_user_id = auth.uid()
      and p.estado = 'activo'
      and p.rol = 'admin'
  );
$$;

-- ANTES en producción: leía la identidad sin filtrar estado, así que le devolvía
-- su ficha completa a una persona ya dada de baja. Mismo contrato de salida (las
-- 6 columnas, en el mismo orden: la vista arma `nombre` y `sede_id` igual que el
-- cuerpo anterior), pero solo para quien está activa.
-- En el bloque 3 esta función se revoca de `authenticated`; el filtro va igual,
-- para que quede correcta y no dependa de que el revoke siga puesto.
create or replace function retail.persona_actual()
returns table (id uuid, auth_user_id uuid, nombre text, sede_id uuid, rol text, email text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.auth_user_id, p.nombre, p.sede_id, p.rol, p.email
  from retail.personas p
  where p.auth_user_id = auth.uid()
    and p.estado = 'activo';
$$;

-- ============================================================================
-- 2. PERMISOS — cerrar la escritura directa por PostgREST
--    Verificado antes de escribir esto: la app NO escribe en ninguna de estas
--    relaciones por fuera de las RPC (barrido de `.from("personas" | "sedes" |
--    "movimientos" | "cajas" | "ventas")` seguido de insert/update/delete/upsert
--    en apps/web → 0 resultados), y no llama a ninguna de las tres funciones
--    internas. Las RPC son security definer y corren como `postgres`: siguen
--    escribiendo igual. `anon` no aparece acá porque no tiene USAGE sobre el
--    schema `retail` — no alcanza nada de esto ni con la publishable key.
-- ============================================================================

-- La escalada a admin: `retail.personas` es la vista escribible. Esto es el
-- hueco (1), el más grave del informe y el único que sigue abierto sin tocar.
-- `retail.sedes` es un join (is_updatable=NO), pero se cierra igual por simetría.
revoke insert, update, delete on retail.personas, retail.sedes from authenticated;

-- El libro de inventario y el dinero: única entrada, las RPC.
revoke insert, update, delete on retail.movimientos, retail.cajas, retail.ventas from authenticated;

-- Tripas internas publicadas como RPC sin razón.
-- fn_aplicar_movimiento: reaplicar un movimiento infla el stock sin dejar rastro.
-- recalcular_stock: es un TRUNCATE, y aunque ya respalda stock_minimo, no tiene
--   control de rol: cualquiera puede reconstruir el inventario entero.
-- persona_actual: expone la ficha de identidad; la app usa la vista.
revoke execute on function retail.fn_aplicar_movimiento(uuid) from public, authenticated;
revoke execute on function retail.recalcular_stock() from public, authenticated;
revoke execute on function retail.persona_actual() from public, authenticated;

-- ============================================================================
-- 3. STOCK NUNCA NEGATIVO
--    Idempotente a propósito: este archivo se pega a mano y tiene que poder
--    repetirse sin abortar la transacción entera por un constraint ya puesto.
-- ============================================================================

do $$
declare
  v_neg_stock bigint;
  v_neg_almacen bigint;
begin
  select count(*) into v_neg_stock   from retail.stock          where cantidad < 0;
  select count(*) into v_neg_almacen from retail.stock_almacen  where cantidad < 0;

  -- Si esto salta, NO forzar el constraint: hay que entender primero por qué el
  -- snapshot quedó negativo (el libro `movimientos` es la fuente de verdad).
  if v_neg_stock > 0 or v_neg_almacen > 0 then
    raise exception
      'Hay filas con cantidad negativa (stock=%, stock_almacen=%): revisa el inventario ANTES de poner el candado',
      v_neg_stock, v_neg_almacen;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'retail.stock'::regclass
      and conname = 'stock_cantidad_no_negativa'
  ) then
    alter table retail.stock
      add constraint stock_cantidad_no_negativa check (cantidad >= 0);
  else
    raise notice 'stock_cantidad_no_negativa ya existía — sin cambios';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'retail.stock_almacen'::regclass
      and conname = 'stock_almacen_cantidad_no_negativa'
  ) then
    alter table retail.stock_almacen
      add constraint stock_almacen_cantidad_no_negativa check (cantidad >= 0);
  else
    raise notice 'stock_almacen_cantidad_no_negativa ya existía — sin cambios';
  end if;
end;
$$;

commit;

-- ============================================================================
-- CÓMO SE VERIFICA — pegar DESPUÉS del commit. Las 5 columnas deben dar `true`.
-- ============================================================================
--
-- select
--   -- (1) la escalada a admin, cerrada
--   (not has_table_privilege('authenticated','retail.personas','UPDATE')
--    and not has_table_privilege('authenticated','retail.movimientos','INSERT')
--    and not has_table_privilege('authenticated','retail.cajas','UPDATE')
--    and not has_table_privilege('authenticated','retail.ventas','INSERT'))
--                                                                    as permisos_cerrados,
--   -- (2) las tres funciones de identidad exigen persona activa
--   (select bool_and(pg_get_functiondef(oid) ~* 'estado\s*=\s*''activo''')
--      from pg_proc where pronamespace='retail'::regnamespace
--      and proname in ('puede_operar_sede','es_lider','persona_actual'))
--                                                                    as exigen_persona_activa,
--   -- (3) volvió la cláusula del almacén asociado
--   (select pg_get_functiondef(oid) ~* 'tienda_asociada_id'
--      from pg_proc where pronamespace='retail'::regnamespace
--      and proname='puede_operar_sede')                              as clausula_almacen,
--   -- (4) los candados de caja siguen intactos (este archivo NO los tocó)
--   ((select count(*) from pg_proc where pronamespace='retail'::regnamespace
--       and proname in ('abrir_caja','cerrar_caja','registrar_venta')
--       and pg_get_functiondef(oid) ~* 'puede_operar_sede') = 3)      as candados_intactos,
--   -- (5) los dos CHECK de stock
--   ((select count(*) from pg_constraint
--       where conname in ('stock_cantidad_no_negativa','stock_almacen_cantidad_no_negativa')) = 2)
--                                                                    as stock_no_negativo;
--
-- QUIÉN QUEDA BLOQUEADO Y QUIÉN NO — CORRER **ANTES** DE PEGAR.
-- Simula, login por login, "¿puedo operar mi propia sede?" con la lógica de hoy
-- y con la de este archivo, sin cambiar nada. Corrida el 2026-09-08 devolvió:
--     estado    logins  pasa_hoy  pasaria_con_22
--     activo      24       24          24      ← nadie legítimo pierde nada
--     inactivo     5        5           0      ← el hueco que se cierra
-- Si `pasaria_con_22` para 'activo' NO da el mismo número que `logins`, PARAR:
-- hay una colaboradora activa que quedaría afuera y hay que entender por qué.
--
--   with logins as (
--     select p.auth_user_id as uid, p.estado, p.sede_base_id as sede
--     from public.personas p
--     join auth.users u on u.id = p.auth_user_id and u.deleted_at is null
--     where p.sede_base_id is not null
--   ), evaluado as (
--     select l.estado,
--       ( coalesce((select pr.rol::text from public.personas pr
--            where pr.auth_user_id = l.uid and pr.estado='activo') = 'admin', false)
--         or coalesce((select pr.sede_base_id from public.personas pr
--              where pr.auth_user_id = l.uid) = l.sede, false) )      as viejo,
--       exists (
--         select 1 from retail.personas p
--         where p.auth_user_id = l.uid and p.estado = 'activo'
--           and ( p.rol = 'admin' or p.sede_id = l.sede
--              or exists (select 1 from retail.sedes s
--                          where s.id = l.sede and s.tienda_asociada_id = p.sede_id) )
--       )                                                             as nuevo
--     from logins l
--   )
--   select estado, count(*) as logins,
--          count(*) filter (where viejo) as pasa_hoy,
--          count(*) filter (where nuevo) as pasaria_con_22
--     from evaluado group by estado order by estado;
--
-- Las 5 inactivas son ex-colaboradoras. Si alguna todavía trabaja en CAYLA, el
-- arreglo NO es tocar este archivo: es poner su fila en 'activo' donde
-- corresponde, en Dynamic. Y aparte, revocarles el login a las que ya no están.
--
-- Y la prueba de negocio, en la app (NO se puede probar desde el SQL Editor, que
-- corre como `postgres` y se salta todo):
--   a) Una integrante ACTIVA de TRU abre caja en TRU → funciona igual que antes.
--   b) Esa misma integrante, desde la consola del navegador:
--        await supabase.from('personas').update({ sede_id: '<id de AQP>' }).eq('auth_user_id','<el suyo>')
--      → debe responder permission denied. ANTES DE ESTE ARCHIVO, FUNCIONABA.
--   c) Una persona INACTIVA con login vivo, desde su sesión:
--        await supabase.rpc('abrir_caja', { p_sede_id: '<su sede de siempre>', p_monto_apertura: 1 })
--      → debe responder 'No tienes permiso...'. Antes, ABRÍA LA CAJA.
-- ============================================================================
