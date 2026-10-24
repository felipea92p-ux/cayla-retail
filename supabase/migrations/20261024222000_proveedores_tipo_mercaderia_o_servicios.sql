-- Proveedores: el TIPO como campo propio — «mercaderia» (ropa y lo que se revende) o «servicios» (Entel, luz, agua, alquiler).
--
-- POR QUÉ. Hasta hoy lo único que separaba a Entel de un fabricante de polos era una costumbre: el rubro de texto libre «Gastos»
-- (ADR-0452, `esSoloDeGastos`). El módulo vive dentro de Compras y todo en él (ficha, indicadores, análisis) asume ropa. Felipe
-- 2026-10-24: «el sistema tiene que saber diferenciar los distintos tipos de proveedores».
--
-- QUÉ HACE (aditivo, «expandir»; ninguna función viva cambia de firma):
--   1. `proveedores.tipo` ('mercaderia' | 'servicios'), por defecto 'mercaderia' = lo que todo el directorio viejo ya es.
--   2. Siembra: quien hoy tiene SOLO el rubro «Gastos» pasa a 'servicios' (17 en producción al 2026-10-24). Los que no tienen rubro
--      se quedan en 'mercaderia' —como hoy los trata el sistema— y Felipe decide cuáles son de servicios desde la pantalla.
--   3. Un disparador mantiene la coherencia con el camino viejo: si alguien (el «¿No está? Súmalo» de Gastos, una función que todavía
--      no sabe de tipos) deja a un proveedor con solo el rubro «Gastos», nace/queda como 'servicios'. Nunca lo baja: un servicio que
--      además tiene rubros de ropa lo decide quien edita el tipo, no el disparador.
--
-- QUÉ NO HACE. No toca `registrar_proveedor`, `actualizar_proveedor` ni `fn_proveedores` (la pantalla los usará en la actividad
-- siguiente, con sus firmas ampliadas). No borra nada ni mueve montos.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe): una sola parte, sin políticas (ADR-0195), `lock_timeout`, re-pegable.
-- La base puede ir antes o después de la web: la web de antes no lee la columna.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

alter table retail.proveedores add column if not exists tipo text not null default 'mercaderia';

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'retail.proveedores'::regclass and conname = 'proveedores_tipo_valido') then
    alter table retail.proveedores
      add constraint proveedores_tipo_valido check (tipo in ('mercaderia', 'servicios'));
  end if;
end $$;

comment on column retail.proveedores.tipo is
  'Qué clase de proveedor es: ''mercaderia'' (ropa y lo que se revende: aparece al comprar y recibir) o ''servicios'' (telefonía, luz, agua, alquiler: se les paga, no se les compra mercadería). Antes solo lo decía el rubro «Gastos».';

-- Coherencia con el camino viejo: solo-«Gastos» ⇒ servicios. Solo sube a 'servicios', nunca baja.
create or replace function retail.fn_proveedor_tipo_desde_rubros()
returns trigger
language plpgsql
set search_path to 'retail', 'public', 'extensions'
as $function$
begin
  if cardinality(new.rubros) > 0
     and not exists (select 1 from unnest(new.rubros) r where lower(btrim(r)) <> 'gastos') then
    new.tipo := 'servicios';
  end if;
  return new;
end;
$function$;

create or replace trigger proveedores_tipo_desde_rubros
  before insert or update of rubros on retail.proveedores
  for each row execute function retail.fn_proveedor_tipo_desde_rubros();

-- Siembra: lo que hoy es solo «Gastos».
update retail.proveedores p
   set tipo = 'servicios'
 where p.tipo <> 'servicios'
   and cardinality(p.rubros) > 0
   and not exists (select 1 from unnest(p.rubros) r where lower(btrim(r)) <> 'gastos');

select 'QUEDÓ BIEN: ' || count(*) filter (where tipo = 'servicios') || ' de servicios y '
       || count(*) filter (where tipo = 'mercaderia') || ' de mercadería' as resultado
  from retail.proveedores;
