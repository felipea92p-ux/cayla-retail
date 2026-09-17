-- =============================================================================
-- SQL PENDIENTE DE PEGAR EN PRODUCCIÓN — CAYLA
-- Preparado el 2026-09-12 · verificado contra la base real (proyecto de Dynamic,
-- schema `retail`). NADA de esto se ha ejecutado.
--
-- QUIÉN LO PEGA: solo Felipe (decisión D-11), y deja constancia al final.
-- CÓMO SE PEGA: bloque por bloque, NO el archivo entero de una vez. Cada bloque
-- dice qué arregla, qué pasa si no lo pegas, y cómo comprobar que funcionó.
--
-- EL CONTEXTO QUE HACE QUE ESTO SEA BARATO HOY: producción tiene 28 movimientos,
-- 2 ventas y 0 gastos. El sistema casi no se ha usado todavía. Cada uno de estos
-- cambios cuesta minutos ahora y costaría un fin de semana con 900 SKUs cargados
-- y tres tiendas vendiendo.
--
-- ORDEN: por riesgo de lo que protege, no por dificultad.
-- =============================================================================


-- =============================================================================
-- BLOQUE 1 · Quitarle a la aplicación el permiso de vaciar tablas
-- RIESGO DE PEGARLO: ninguno.  RIESGO DE NO PEGARLO: perder CAYLA entera.
-- =============================================================================
--
-- QUÉ PASA HOY. El rol `authenticated` —el que usa cualquier persona con sesión
-- iniciada— tiene el permiso TRUNCATE sobre las tablas de `retail`, incluida
-- `movimientos`. Y esto es lo que lo vuelve grave: **la seguridad por fila NO se
-- aplica a TRUNCATE**. Las políticas gobiernan leer, insertar, actualizar y borrar
-- filas; TRUNCATE las ignora por completo y vacía la tabla de un golpe.
--
-- `movimientos` es la única fuente desde la que se puede reconstruir el stock. Si
-- se vacía, no hay de dónde reconstruir nada: el inventario de CAYLA deja de existir.
--
-- Hoy no es explotable desde la aplicación porque la API web no ofrece ese verbo.
-- Pero eso es una propiedad de la API, no una garantía de la base — y deja de ser
-- cierto en cuanto alguien escriba una función nueva o use la llave de servicio.
--
-- POR QUÉ NO ROMPE NADA. La aplicación nunca vacía tablas. Las funciones que sí
-- borran filas (`recalcular_stock` sobre `stock`) corren como dueño y conservan
-- sus permisos: este `revoke` solo toca a `authenticated` y `anon`.

revoke truncate on all tables in schema retail from authenticated, anon;

-- Y que las tablas que se creen mañana nazcan igual de cerradas:
alter default privileges for role postgres in schema retail
  revoke truncate on tables from authenticated, anon;

-- CÓMO COMPRUEBAS QUE FUNCIONÓ — tiene que devolver 0 filas:
--
--   select table_name, grantee
--   from information_schema.role_table_grants
--   where table_schema = 'retail'
--     and privilege_type = 'TRUNCATE'
--     and grantee in ('authenticated', 'anon');


-- =============================================================================
-- BLOQUE 2 · El candado de verdad sobre el historial (decisión D-22)
-- RIESGO DE PEGARLO: ninguno, verificado.  RIESGO DE NO PEGARLO: historia editable.
-- =============================================================================
--
-- QUÉ PASA HOY. `movimientos` se presenta en toda la documentación como una tabla
-- que nunca se edita ni se borra. Eso lo sostiene la costumbre, no la base: la
-- tabla no tiene política de UPDATE ni de DELETE, así que se salva **por omisión**.
-- Cualquier función que corra como dueño puede modificar el pasado sin dejar rastro.
--
-- POR QUÉ NO ROMPE NADA — esto se verificó antes de escribirlo. Se le preguntó a
-- producción qué funciones actualizan o borran movimientos:
--
--   select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'retail' and p.prokind = 'f'
--     and (p.prosrc ~* 'update\s+(retail\.)?movimientos'
--       or p.prosrc ~* 'delete\s+from\s+(retail\.)?movimientos');
--
-- Devolvió CERO. Ninguna función del sistema toca el pasado, así que el candado no
-- le quita nada a nadie: solo vuelve imposible lo que ya nadie hacía.
--
-- CÓMO SE CORRIGE UN ERROR A PARTIR DE AHORA. No borrando: escribiendo lo
-- contrario. Un movimiento de corrección con signo opuesto y su motivo. El stock
-- queda bien y el historial muestra las dos cosas — el error y quién lo corrigió.
-- Igual que un contador, que no borra un asiento sino que hace uno que lo revierte.
--
-- LA PUERTA DE ATRÁS, a propósito. Este candado frena a la aplicación y a las
-- funciones. NO te frena a ti desde el editor SQL de producción, porque el dueño
-- de la tabla puede desactivar sus propios disparadores. Imposible por accidente,
-- posible a propósito, y con rastro.

create or replace function retail.fn_historial_es_inmutable()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'El historial de movimientos no se edita ni se borra. Para corregir un error, '
    'registra un movimiento de corrección con el signo contrario y su motivo — '
    'así el stock queda bien y queda constancia de qué pasó. (docs/datos/01-INVARIANTES.md)';
end;
$$;

comment on function retail.fn_historial_es_inmutable() is
  'Rechaza cualquier UPDATE o DELETE sobre movimientos. D-22: la historia es la '
  'única fuente desde la que se reconstruye el stock, y no puede depender de la '
  'buena fe. Se corrige escribiendo lo contrario, nunca borrando.';

drop trigger if exists movimientos_inmutables on retail.movimientos;

create trigger movimientos_inmutables
  before update or delete on retail.movimientos
  for each row execute function retail.fn_historial_es_inmutable();

-- CÓMO COMPRUEBAS QUE FUNCIONÓ — esto tiene que FALLAR con el mensaje de arriba:
--
--   update retail.movimientos set cantidad = cantidad where false;
--
-- (el `where false` no toca ninguna fila; el disparador es BEFORE ... FOR EACH ROW,
--  así que si quieres verlo saltar de verdad, prueba en una transacción con rollback:
--
--   begin;
--     update retail.movimientos set nota = 'prueba' where id = (select id from retail.movimientos limit 1);
--   rollback;
-- )


-- =============================================================================
-- BLOQUE 3 · Arreglar «registrar un gasto», que hoy falla en las tres tiendas
-- RIESGO DE PEGARLO: bajo.  RIESGO DE NO PEGARLO: no se puede registrar un gasto.
-- =============================================================================
--
-- QUÉ PASA HOY. `RegistrarGastoModal.tsx:57` llama a `registrar_gasto` mandándole
-- siete parámetros, incluido `p_metodo_pago`. La función que vive en producción
-- acepta seis y no conoce ese séptimo. La llamada falla **siempre**, no a veces.
-- Por eso `retail.gastos` tiene 0 filas.
--
-- LO QUE HACE BARATO ESTE ARREGLO: la columna `metodo_pago` YA EXISTE en
-- `retail.gastos` (verificado). Lo único que falta es que la función la acepte y
-- la escriba. No hay cambio de estructura, solo de función.
--
-- QUÉ AÑADE AL NEGOCIO: distinguir un gasto pagado en efectivo —que sale del cajón
-- de la sede y tiene que descontarse del cuadre— de uno pagado por banco, Yape o
-- tarjeta, que no toca el cajón. Sin eso, el cuadre de efectivo miente.
--
-- POR QUÉ HAY UN `drop` ANTES: en Postgres, reemplazar una función con una lista
-- de parámetros distinta NO la reemplaza, crea una segunda. Dos versiones vivas de
-- la misma función es exactamente el problema que ya costó un diagnóstico entero
-- en este sistema. Se borra la firma vieja explícitamente.

set search_path to retail, public;

drop function if exists retail.registrar_gasto(uuid, text, numeric, numeric, numeric, text);

create or replace function retail.registrar_gasto(
  p_sede_id        uuid,
  p_categoria      text,
  p_subtotal       numeric,
  p_igv            numeric,
  p_total          numeric,
  p_especificacion text default null,
  p_metodo_pago    text default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public
as $$
declare
  v_persona_id uuid;
  v_gasto_id   uuid;
begin
  if not retail.es_lider() then
    raise exception 'Solo un Líder de equipo puede registrar gastos';
  end if;

  if p_metodo_pago is not null
     and p_metodo_pago not in ('efectivo', 'banco', 'yape', 'tarjeta') then
    raise exception 'Método de pago inválido: %', p_metodo_pago;
  end if;

  select id into v_persona_id from public.personas where auth_user_id = auth.uid();

  insert into gastos (sede_id, categoria, subtotal, igv, total,
                      especificacion, usuario_id, metodo_pago)
    values (p_sede_id, p_categoria, p_subtotal, p_igv, p_total,
            p_especificacion, v_persona_id, p_metodo_pago)
    returning id into v_gasto_id;

  return v_gasto_id;
end;
$$;

-- CÓMO COMPRUEBAS QUE FUNCIONÓ — tiene que devolver UNA fila, con 7 parámetros:
--
--   select pg_get_function_identity_arguments(p.oid)
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'retail' and p.proname = 'registrar_gasto';
--
-- Si devuelve DOS filas, el `drop` no encontró la firma vieja: mira cuál sobra y
-- bórrala a mano antes de seguir.
--
-- Y después, la prueba de verdad: registrar un gasto desde la pantalla.


-- =============================================================================
-- BLOQUE 4 · ⚠️ NO PEGAR TODAVÍA — las vistas que se saltan los permisos
-- Necesita ensayo previo. Está aquí escrito para que no se pierda, no para hoy.
-- =============================================================================
--
-- QUÉ PASA HOY. `retail.personas` y `retail.sedes` son vistas sobre el sistema de
-- personal, y ninguna de las dos tiene `security_invoker`. Se comprobó:
--
--   select c.relname, pg_options_to_table(c.reloptions) from pg_class c
--   join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname = 'retail' and c.relkind = 'v';
--   -- personas → security_invoker = false
--   -- sedes    → security_invoker = false
--
-- O sea que corren con permisos del dueño y **se saltan las 5 políticas de fila
-- que `public.personas` sí tiene**. Como `authenticated` puede leer la vista,
-- cualquier persona con sesión lista el nombre, correo, rol y sede de las 46
-- personas de CAYLA. No se filtran sueldos ni documentos (esas columnas no están
-- en la vista), pero sí el directorio completo de la empresa — saltándose cinco
-- políticas escritas justamente para impedirlo.
--
-- POR QUÉ ESTE NO SE PEGA HOY. Activar `security_invoker` hace que la vista respete
-- esas políticas. Si las políticas de `public.personas` NO dejan a cada persona
-- verse a sí misma y ver a su sede, al activarlo **el sistema deja de poder
-- resolver quién es quien está usando la aplicación** — y eso tumba todas las
-- pantallas a la vez, no una.
--
-- QUÉ HAY QUE HACER ANTES: leer las 5 políticas de `public.personas` y confirmar
-- que un integrante cualquiera puede leer su propia fila. Es exactamente el tipo
-- de cambio que justifica el entorno de ensayo de la decisión D-18.
--
--   select polname, pg_get_expr(polqual, polrelid)
--   from pg_policy p join pg_class c on c.oid = p.polrelid
--   join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname = 'public' and c.relname = 'personas';
--
-- EL SQL, para cuando esté ensayado (y NO un sábado):
--
--   alter view retail.personas set (security_invoker = true);
--   alter view retail.sedes    set (security_invoker = true);
--
-- Después hay que entrar con una cuenta de Integrante y comprobar que la
-- aplicación sigue sabiendo quién es y en qué sede está.


-- =============================================================================
-- BLOQUE 5 · ⚠️ NO PEGAR — «recibir mercadería ligada a una producción»
-- Necesita una decisión tuya antes que una migración.
-- =============================================================================
--
-- QUÉ PASA HOY. `RecibirLoteForm.tsx:431` llama a `recibir_lote` mandándole
-- `p_orden_produccion_id`. La función de producción acepta siete parámetros y no
-- conoce ese. Recibir mercadería ligada a una producción falla siempre.
--
-- POR QUÉ ESTE NO ES COMO EL BLOQUE 3. En el gasto, la columna ya existía y solo
-- faltaba la función. Aquí NO: `retail.lotes` tiene `orden_compra_id` pero **no
-- tiene ninguna columna para la orden de producción** (verificado). Arreglarlo es
-- una columna nueva más una función nueva, no solo una función.
--
-- Y hay una razón de fondo para no hacerlo a las apuradas: el módulo de producción
-- arrastra dos modelos conviviendo —`producciones`/`produccion_lineas`, que es el
-- vigente, y `ordenes_produccion`/`bom_items`, que es legado y nadie retiró. Antes
-- de agregarle una columna a `lotes` que apunte a una orden de producción, hay que
-- decidir **a cuál de los dos modelos apunta**. Si se elige mal, la columna hay que
-- migrarla después con datos reales encima.
--
-- LA SALIDA BARATA MIENTRAS TANTO: quitar ese parámetro de la llamada en
-- `RecibirLoteForm.tsx:431`. La recepción de mercadería vuelve a funcionar entera;
-- lo único que se pierde es poder marcar que un lote vino de una producción
-- concreta, que hoy no funciona de todos modos.
--
-- Ver `docs/datos/DIAGNOSTICO-PANTALLAS-ROTAS.md` y
-- `docs/datos/modulos/10-produccion-del-taller.md`.


-- =============================================================================
-- DESPUÉS DE PEGAR: deja constancia
-- =============================================================================
--
-- La convención del repo es que todo lo que entra a producción deja su fila. Sin
-- eso, el estado de producción vuelve a ser una suposición en vez de un hecho.

-- insert into retail.migraciones_aplicadas (archivo, aplicada_at, nota) values
--   ('SQL-PENDIENTE-PRODUCCION.sql — bloques 1,2,3', now(),
--    'Retirado TRUNCATE a authenticated/anon; candado de inmutabilidad en movimientos; registrar_gasto acepta metodo_pago');

-- Y corre el comparador para confirmar que la pantalla del gasto dejó de estar rota:
--
--   pnpm datos:comparar
--
-- Tiene que bajar de 2 pantallas rotas a 1 (queda recibir_lote, bloque 5).
