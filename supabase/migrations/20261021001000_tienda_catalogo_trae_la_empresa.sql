-- ============================================================================
-- 20261021001000_tienda_catalogo_trae_la_empresa.sql — CAYLA V2 · Tienda online (ADR-0463, ADR-0465)
-- Cada prenda del catálogo dice a qué empresa pertenece (CAYLA o CLAURE), para que su tarjeta lo muestre.
--
-- EL PROBLEMA PRIMERO. Con dos empresas en la misma tienda online, una tarjeta sin su empresa no dice de quién es la prenda: en Lima
-- conviven CAYLA y CLAURE (ADR-0465, 20261021000000). Felipe (2026-10-20): «todas las tarjetas deben indicar la empresa a la que
-- pertenecen». La tienda solo lee `retail.tienda_*`, y `empresas` no tiene políticas (se lee por funciones): el nombre tiene que
-- venir en el JSON del catálogo.
--
-- ANALOGÍA CAYLA. La etiqueta del perchero ya existía en la base (`productos.empresa_id`); esto la cuelga de cada prenda de la vidriera.
--
-- QUÉ HACE. `tienda_catalogo(sede)` suma a cada prenda `'empresa': {'clave', 'nombre'}`, leída de `empresas` por `productos.empresa_id`
-- (nunca nulo: obligatorio desde ADR-0463). Es un dato más del mismo objeto: la web de antes lo ignora y la web nueva, si no llega,
-- no dibuja la insignia (principio 9: se degrada, no se cae).
--
-- DECIDÍ: el nombre sale de `empresas.nombre` tal cual está (hoy «CLAURE», sin tilde, como lo sembró ADR-0463) y no de un texto
--   escrito en la web: cambiar cómo se llama una empresa es un dato, no un deploy.
-- DECIDÍ: solo el catálogo. La ficha, las listas de looks y las de favoritos arman sus tarjetas desde el catálogo (la web filtra
--   `prendas`); no hay otra función que dibuje una tarjeta.
-- DESCARTÉ: devolver `empresa_id`. La web no tiene qué hacer con el id y obligaría a pedir las empresas aparte.
--
-- SE ROMPE SI: una función nueva de la tienda arma tarjetas de prenda sin pasar por `tienda_catalogo` (no tendría `empresa`; la tarjeta
--   no dibujaría la insignia, sin error).
--
-- PRODUCCIÓN. Una sola parte, idempotente (se puede pegar dos veces): un reemplazo anclado; no toma tablas en exclusiva ni toca
-- políticas (sin riesgo de 40P01). Cuenta que su ancla aparezca UNA vez: si alguien cambió la función, se detiene sin tocar nada. Sin
-- `select … into` dentro de un texto entre comillas. El orden con la publicación de la web no importa. Requiere 20261020225000 y
-- 20261021000000.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function pg_temp.reemplazar_anclado(p_firma text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  -- Ya aplicado: el texto nuevo está. Se mira primero porque, una vez aplicado, el ancla vieja ya no aparece y el conteo abortaría.
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

select pg_temp.reemplazar_anclado(
  'retail.tienda_catalogo(uuid)',
  $v$'categoria', case when c.id is null then null else jsonb_build_object('nombre', c.nombre, 'prefijo', c.prefijo) end,$v$,
  $v$'categoria', case when c.id is null then null else jsonb_build_object('nombre', c.nombre, 'prefijo', c.prefijo) end,
        -- ADR-0465: de qué empresa es la prenda (CAYLA o CLAURE), para su tarjeta.
        'empresa', (select jsonb_build_object('clave', em.clave, 'nombre', em.nombre) from retail.empresas em where em.id = p.empresa_id),$v$
);

select 'ADR-0465 · tienda: el catálogo trae la empresa de cada prenda' as parte,
       case when pg_get_functiondef('retail.tienda_catalogo(uuid)'::regprocedure) like '%''empresa'', (select jsonb_build_object(%'
            then 'QUEDÓ BIEN' else 'REVISAR' end as resultado;
