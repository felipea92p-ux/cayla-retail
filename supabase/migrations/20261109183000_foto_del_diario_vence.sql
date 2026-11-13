-- ============================================================================
-- 20261109183000 — La foto del diario, parte 3: la foto vence sola cuando algo de su mes cambia (ADR-0633)
--
-- EL PROBLEMA PRIMERO. Con las partes 1 y 2, `fn_diario` puede leer la foto de un mes que ya terminó. Pero si mañana alguien registra una
-- factura con fecha de octubre, anula un gasto de septiembre o cambia el costo de una prenda, la foto de esos meses ya no es el diario: hay
-- que saberlo en el acto, o el Estado de resultados mostraría una cifra vieja.
--
-- LO QUE HACE.
--   1. `diario_vencido_marcas`: cada anotación es UNA FILA NUEVA con la fecha más antigua que tocó una escritura. Las fotos de ese mes y
--      de los siguientes ya no valen. Se AGREGA, nunca se actualiza una fila común: dos escrituras a la vez sobre meses pasados no se
--      esperan ni se trancan (con una sola fila actualizada, la segunda esperaba a la primera y podían cruzarse en un deadlock). El trabajo
--      programado (parte 4) rehace desde la marca más antigua y borra SOLO las marcas que ya procesó; las que llegan mientras rehace quedan
--      para la vuelta siguiente. Arranca con una marca de 1900: ninguna foto vale hasta la primera vuelta.
--   2. `fn_diario_vence()`: el disparador de cada tabla que alimenta el diario. Mira las fechas de la fila (las de antes y las de después;
--      de una fila hija sin fecha, las de su madre) y SOLO si la más antigua es de un mes pasado, anota. Una venta de hoy no escribe nada:
--      el mostrador no paga este cambio ni espera turno. Con el argumento `todo` (configuración: tarifas de máquina, cuentas, sedes,
--      empresas, parámetros…), vence todos los meses: cambian poco.
--   3. `diario_fuentes_exentas`: las tablas que el diario lee y que NO vencen nada, cada una con su motivo (las de permisos: deciden quién
--      ve, no qué cifras hay; la foto guarda todo y el permiso se aplica al leer; y las de Dynamic, que son de otro sistema: su planilla se
--      compara por huella al leer, parte 1). `pnpm pruebas:foto-diario` falla si el diario lee una tabla que no está ni vigilada ni aquí.
--   4. `fn_foto_diario_vale(mes)` suma la condición: no hay ninguna marca de ese mes o de antes.
--
-- CÓMO SE PEGA EN PRODUCCIÓN — TRES EJECUCIONES SEPARADAS, EN ORDEN (CLAUDE.md «Políticas y deadlocks»; sin políticas en ninguna):
--   PARTE 1  lo nuevo: dos tablas, tres funciones. No toca ninguna tabla en uso.
--   PARTE 2  los disparadores de las tablas de poco movimiento (compras, gastos, configuración…).
--   PARTE 3  los disparadores de las tablas del mostrador (ventas, sus prendas y pagos, movimientos, cajas): DE NOCHE. Crear un disparador
--            frena un instante las escrituras en esa tabla.
--   Cada parte con `lock_timeout = 3s`: si dice «lock timeout», alguien estaba escribiendo en esa tabla; se repite ESA parte. Todas son
--   idempotentes (`create or replace trigger`, que no toma las tablas de `auth`/`storage` como `drop trigger`). Mientras el interruptor de
--   la parte 2 esté apagado, nada de esto cambia lo que alguien ve.
-- ============================================================================

-- ═════════════════════════════════════════ PARTE 1 ═════════════════════════════════════════
set search_path = retail, public, extensions;
set lock_timeout = '3s';

create table if not exists retail.diario_vencido_marcas (
  id bigint generated always as identity primary key,
  fecha date not null,
  anotada_en timestamptz not null default now()
);
create index if not exists diario_vencido_marcas_fecha_idx on retail.diario_vencido_marcas (fecha);
comment on table retail.diario_vencido_marcas is
  'ADR-0633: desde qué fecha las fotos del diario ya no valen, una fila por anotación (sin ninguna, todas valen). Las agregan los disparadores; las borra el trabajo que rehace las fotos, solo las que ya procesó. Es una cola derivada, no un dato del negocio.';
insert into retail.diario_vencido_marcas (fecha)
  select date '1900-01-01' where not exists (select 1 from retail.diario_vencido_marcas);
alter table retail.diario_vencido_marcas enable row level security;
revoke all on retail.diario_vencido_marcas from public, anon, authenticated;

create table if not exists retail.diario_fuentes_exentas (
  tabla text primary key,
  clase text not null check (clase in ('permisos', 'dynamic')),
  motivo text not null check (length(motivo) >= 20)
);
comment on table retail.diario_fuentes_exentas is
  'ADR-0633: tablas que el diario lee y que no vencen la foto, con su motivo. pruebas:foto-diario exige que toda tabla del diario esté vigilada o aquí.';
alter table retail.diario_fuentes_exentas enable row level security;
revoke all on retail.diario_fuentes_exentas from public, anon, authenticated;
insert into retail.diario_fuentes_exentas (tabla, clase, motivo) values
  ('retail.colaboradores', 'permisos', 'Decide quién ve qué (fn_es_lider, fn_diario_ubicaciones): la foto guarda todo y el permiso se aplica al leer.'),
  ('retail.roles', 'permisos', 'Decide quién ve qué (fn_capacidad_por_modulos): la foto guarda todo y el permiso se aplica al leer.'),
  ('retail.rol_modulos', 'permisos', 'Decide quién ve qué (fn_capacidad_por_modulos): la foto guarda todo y el permiso se aplica al leer.'),
  ('retail.modulos', 'permisos', 'Decide quién ve qué (fn_capacidad_por_modulos): la foto guarda todo y el permiso se aplica al leer.'),
  ('retail.terminales', 'permisos', 'Decide quién ve qué (fn_terminal_actual, fn_mi_rol_id): la foto guarda todo y el permiso se aplica al leer.'),
  ('public.personas', 'permisos', 'Tabla de Dynamic que decide quién ve qué (fn_es_lider): la foto guarda todo y el permiso se aplica al leer.'),
  ('public.sedes', 'dynamic', 'Tabla de Dynamic: une la planilla con su sede. No se le ponen disparadores desde retail; la planilla se compara por huella al leer (fn_huella_planilla_mes) y la foto se rehace cada madrugada.')
on conflict (tabla) do update set clase = excluded.clase, motivo = excluded.motivo;

-- La fecha más antigua de una fila (sus columnas de fecha o de instante, en hora de Lima). Null si no tiene ninguna.
create or replace function retail.fn_diario_fecha_min(p_fila jsonb)
returns date
language sql
stable
set search_path = retail, public, extensions
as $$
  select min(case when length(e.v) = 10 then e.v::date else (e.v::timestamptz at time zone 'America/Lima')::date end)
    from jsonb_each_text(coalesce(p_fila, '{}'::jsonb)) e(k, v)
   where e.v ~ '^\d{4}-\d{2}-\d{2}($|[T ])';
$$;
comment on function retail.fn_diario_fecha_min(jsonb) is 'ADR-0633: la fecha más antigua de una fila, para saber desde cuándo vence la foto del diario.';

-- El disparador: anota desde cuándo vencen las fotos, SOLO si la fila toca un mes pasado. Argumentos: (nada) = las fechas de la fila;
-- 'todo' = vence todos los meses (configuración); 'madre:<tabla>:<columna>' = también las fechas de su fila madre (filas sin fecha propia).
create or replace function retail.fn_diario_vence()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_mes date := date_trunc('month', retail.fn_hoy_lima())::date;
  v_min date;
  v_fila jsonb;
  v_madre jsonb;
  v_partes text[];
begin
  if tg_nargs > 0 and tg_argv[0] = 'todo' then
    v_min := date '1900-01-01';
  else
    for v_fila in
      select x from (values (case when tg_op <> 'INSERT' then to_jsonb(old) end), (case when tg_op <> 'DELETE' then to_jsonb(new) end)) t(x)
       where x is not null
    loop
      v_min := least(v_min, retail.fn_diario_fecha_min(v_fila));
      if tg_nargs > 0 and tg_argv[0] like 'madre:%' then
        v_partes := string_to_array(tg_argv[0], ':');
        execute format('select to_jsonb(m) from retail.%I m where m.id = $1', v_partes[2]) into v_madre using (v_fila ->> v_partes[3])::uuid;
        v_min := least(v_min, retail.fn_diario_fecha_min(v_madre));
      end if;
    end loop;
  end if;
  if v_min is not null and v_min < v_mes then
    insert into retail.diario_vencido_marcas (fecha) values (v_min);
  end if;
  return null;
end;
$$;
comment on function retail.fn_diario_vence() is
  'ADR-0633: disparador de las tablas del diario. Agrega a diario_vencido_marcas desde cuándo vencen las fotos, solo si la fila toca un mes pasado.';
revoke all on function retail.fn_diario_vence() from public, anon, authenticated;

create or replace function retail.fn_foto_diario_vale(p_mes date)
returns boolean
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select exists (select 1 from retail.diario_fotos d
                  where d.mes = date_trunc('month', p_mes)::date
                    and d.huella_planilla = retail.fn_huella_planilla_mes(p_mes))
     and not exists (select 1 from retail.diario_vencido_marcas m
                      where m.fecha < (date_trunc('month', p_mes) + interval '1 month')::date);
$$;
comment on function retail.fn_foto_diario_vale(date) is
  'ADR-0633: si la foto del diario de ese mes existe, la planilla de Dynamic no cambió y no hay ninguna marca de vencimiento de ese mes o de antes.';
revoke all on function retail.fn_foto_diario_vale(date) from public, anon, authenticated;

select '20261109183000 · PARTE 1 QUEDÓ BIEN: la foto del diario sabe cuándo vence' as resultado;

-- ═════════════════════════════════════════ PARTE 2 ═════════════════════════════════════════
-- Las tablas de poco movimiento. Configuración: 'todo'. Filas hijas sin fecha: 'madre:…'. El resto, sus propias fechas.
set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace trigger diario_vence after insert or update or delete on retail.activos_fijos for each row execute function retail.fn_diario_vence();
create or replace trigger diario_vence after insert or update or delete on retail.caja_traslados for each row execute function retail.fn_diario_vence();
create or replace trigger diario_vence after insert or update or delete on retail.cambio_salidas for each row execute function retail.fn_diario_vence('madre:cambios:cambio_id');
create or replace trigger diario_vence after insert or update or delete on retail.cambios for each row execute function retail.fn_diario_vence();
create or replace trigger diario_vence after insert or update or delete on retail.categorias_gasto for each row execute function retail.fn_diario_vence('todo');
create or replace trigger diario_vence after insert or update or delete on retail.compra_notas_credito for each row execute function retail.fn_diario_vence();
create or replace trigger diario_vence after insert or update or delete on retail.compra_notas_proveedor for each row execute function retail.fn_diario_vence();
create or replace trigger diario_vence after insert or update or delete on retail.compra_pagos for each row execute function retail.fn_diario_vence();
create or replace trigger diario_vence after insert or update or delete on retail.compras for each row execute function retail.fn_diario_vence();
create or replace trigger diario_vence after insert or update or delete on retail.comprobantes_produccion for each row execute function retail.fn_diario_vence();
create or replace trigger diario_vence after insert or update or delete on retail.comprobantes_produccion_items for each row execute function retail.fn_diario_vence('madre:comprobantes_produccion:comprobante_id');
create or replace trigger diario_vence after insert or update or delete on retail.comprobantes_produccion_pagos for each row execute function retail.fn_diario_vence();
create or replace trigger diario_vence after insert or update or delete on retail.costo_historial for each row execute function retail.fn_diario_vence();
create or replace trigger diario_vence after insert or update or delete on retail.cuentas_dinero for each row execute function retail.fn_diario_vence('todo');
create or replace trigger diario_vence after insert or update or delete on retail.devolucion_items for each row execute function retail.fn_diario_vence('madre:devoluciones:devolucion_id');
create or replace trigger diario_vence after insert or update or delete on retail.devoluciones for each row execute function retail.fn_diario_vence();
create or replace trigger diario_vence after insert or update or delete on retail.empresa_sedes for each row execute function retail.fn_diario_vence('todo');
create or replace trigger diario_vence after insert or update or delete on retail.empresas for each row execute function retail.fn_diario_vence('todo');
create or replace trigger diario_vence after insert or update or delete on retail.gasto_reparto_claure for each row execute function retail.fn_diario_vence('todo');
create or replace trigger diario_vence after insert or update or delete on retail.gastos for each row execute function retail.fn_diario_vence();
create or replace trigger diario_vence after insert or update or delete on retail.gastos_viaje for each row execute function retail.fn_diario_vence('madre:gastos:gasto_id');
create or replace trigger diario_vence after insert or update or delete on retail.impuestos_pagos for each row execute function retail.fn_diario_vence();
create or replace trigger diario_vence after insert or update or delete on retail.movimientos_dinero for each row execute function retail.fn_diario_vence();
create or replace trigger diario_vence after insert or update or delete on retail.movimientos_insumo for each row execute function retail.fn_diario_vence();
-- Los parámetros de Finanzas vencen todo, salvo el propio interruptor de la foto y quién lo cambió: prenderlo no cambia ninguna cifra.
create or replace trigger diario_vence after update on retail.parametros_finanzas for each row
  when ((to_jsonb(old) - 'usar_foto_diario' - 'actualizado_en' - 'actualizado_por') is distinct from (to_jsonb(new) - 'usar_foto_diario' - 'actualizado_en' - 'actualizado_por'))
  execute function retail.fn_diario_vence('todo');
create or replace trigger diario_vence_borra after insert or delete on retail.parametros_finanzas for each row execute function retail.fn_diario_vence('todo');
create or replace trigger diario_vence after insert or update or delete on retail.parametros_tributarios for each row execute function retail.fn_diario_vence();
create or replace trigger diario_vence after insert or update or delete on retail.pedido_web_pagos for each row execute function retail.fn_diario_vence();
create or replace trigger diario_vence after insert or update or delete on retail.pedidos_web for each row execute function retail.fn_diario_vence();
create or replace trigger diario_vence after insert or update or delete on retail.pos_abonos_lotes for each row execute function retail.fn_diario_vence();
create or replace trigger diario_vence after insert or update or delete on retail.pos_maquinas for each row execute function retail.fn_diario_vence('todo');
create or replace trigger diario_vence after insert or update or delete on retail.pos_tarifas for each row execute function retail.fn_diario_vence();
create or replace trigger diario_vence after insert or update or delete on retail.prendas_por_regularizar for each row execute function retail.fn_diario_vence();
create or replace trigger diario_vence after insert or update or delete on retail.proveedor_creditos for each row execute function retail.fn_diario_vence();
create or replace trigger diario_vence after insert or update or delete on retail.saldos_iniciales for each row execute function retail.fn_diario_vence();
create or replace trigger diario_vence after insert or update or delete on retail.separacion_pagos for each row execute function retail.fn_diario_vence();
create or replace trigger diario_vence after insert or update or delete on retail.separaciones for each row execute function retail.fn_diario_vence();
create or replace trigger diario_vence after insert or update or delete on retail.tipos_activo for each row execute function retail.fn_diario_vence('todo');
create or replace trigger diario_vence after insert or update or delete on retail.transferencia_items for each row execute function retail.fn_diario_vence('madre:transferencias:transferencia_id');
create or replace trigger diario_vence after insert or update or delete on retail.transferencia_recepciones for each row execute function retail.fn_diario_vence();
create or replace trigger diario_vence after insert or update or delete on retail.transferencias for each row execute function retail.fn_diario_vence();
create or replace trigger diario_vence after insert or update or delete on retail.ubicaciones for each row execute function retail.fn_diario_vence('todo');
-- El catálogo solo vence si cambia lo que entra a un monto: el costo de la prenda (fn_costo_variante_al) y de qué empresa y categoría es
-- (fn_dueno_de_la_linea, fn_conteo_explicado). Un precio o un nombre nuevo no toca ningún mes pasado; una prenda nueva no tiene pasado.
create or replace trigger diario_vence after update on retail.variantes for each row
  when ((old.costo, old.producto_id) is distinct from (new.costo, new.producto_id)) execute function retail.fn_diario_vence('todo');
create or replace trigger diario_vence_borra after delete on retail.variantes for each row execute function retail.fn_diario_vence('todo');
create or replace trigger diario_vence after update on retail.productos for each row
  when ((old.empresa_id, old.categoria_id) is distinct from (new.empresa_id, new.categoria_id)) execute function retail.fn_diario_vence('todo');
create or replace trigger diario_vence_borra after delete on retail.productos for each row execute function retail.fn_diario_vence('todo');

select '20261109183000 · PARTE 2 QUEDÓ BIEN: vigiladas las tablas de poco movimiento' as resultado;

-- ═════════════════════════════════════════ PARTE 3 (DE NOCHE) ═════════════════════════════════════════
-- Las tablas del mostrador. Una venta de hoy pasa por el disparador pero no escribe nada (su fecha es de este mes).
set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace trigger diario_vence after insert or update or delete on retail.ventas for each row execute function retail.fn_diario_vence();
create or replace trigger diario_vence after insert or update or delete on retail.venta_items for each row execute function retail.fn_diario_vence('madre:ventas:venta_id');
create or replace trigger diario_vence after insert or update or delete on retail.venta_pagos for each row execute function retail.fn_diario_vence('madre:ventas:venta_id');
create or replace trigger diario_vence after insert or update or delete on retail.venta_anulacion_items for each row execute function retail.fn_diario_vence('madre:ventas:venta_id');
create or replace trigger diario_vence after insert or update or delete on retail.movimientos for each row execute function retail.fn_diario_vence();
create or replace trigger diario_vence after insert or update or delete on retail.cajas for each row execute function retail.fn_diario_vence();

select '20261109183000 · PARTE 3 QUEDÓ BIEN: vigiladas las tablas del mostrador' as resultado;
