-- ============================================================================
-- 20261004233000_actividad_regularizar_anota_en_existencias.sql — CAYLA V2 (ADR-0207, act. 2026-10-04)
--
-- EL PROBLEMA. `retail.fn_actividad_regularizar` (20261003210000, sección 5) anota cada «regularicé una venta sin
-- registrar» en Actividad con `modulo = 'recibir'`, porque ese día la lista vivía en Recibir mercadería. Desde ADR-0330
-- (2026-10-04) vive en `/inventario/por-regularizar`, que es del módulo Existencias, y Recibir quedó solo para lo que llega
-- de un proveedor. Quien filtra Actividad por «Existencias» no ve las regularizaciones; quien filtra por «Recibir» ve algo
-- que ya no es de ahí. La cola de arranque (ADR-0334) ya anota con `existencias`: dejar esta con `recibir` partiría la
-- misma historia en dos filtros.
--
-- LA DECISIÓN. Cambiar el módulo de la anotación a `existencias`. Solo esa palabra: la frase, la sede, la firma y el
-- `detalle` quedan idénticos. El cuerpo es el vigente (huella md5 `ac3c874e146dc40a665c9499ff9950b5`, igual en el repo y en
-- producción el 2026-10-04), así que no se pisa ningún parche vivo.
--
-- LO QUE NO HACE: no reescribe filas viejas. `retail.actividad` es de solo agregar (`trg_actividad_inmutable`, ADR-0207):
-- reetiquetar exigiría apagar ese candado, como lo hizo una sola vez la sección 13 de 20260928190000. Hoy no hay nada que
-- reetiquetar: el 2026-10-04 había 0 filas con `accion = 'prenda_regularizada'` en producción (267 prendas pendientes, ninguna
-- regularizada todavía). Por eso conviene pegarla ANTES de que se empiece a regularizar: cada fila que nazca con `recibir`
-- ya no se puede corregir sin abrir el candado.
--
-- QUIÉN LA VE NO CAMBIA. `fn_actividad` filtra por sede y por el módulo «Actividad» de quien lee, nunca por el módulo de la
-- fila: el cambio mueve la fila de un filtro a otro, no la muestra a nadie nuevo ni se la quita a nadie.
--
-- PRODUCCIÓN. Una sola parte: un `create or replace function` (no toma candados de tabla) y una comprobación. Sin `alter`,
-- sin políticas, sin `drop trigger` (CLAUDE.md, «Políticas y deadlocks»). Re-ejecutable. Prueba: `pnpm pruebas:actividad-gestion`
-- (caso 6). Antes de pegar, sonda de solo lectura (debe dar 0; si da más, esas filas quedan con `recibir` y se lo dices a Felipe):
--   select count(*) from retail.actividad where accion = 'prenda_regularizada';
-- ============================================================================

set lock_timeout = '3s';

create or replace function retail.fn_actividad_regularizar(p_id uuid, p_origen text default 'vivo') returns void
language plpgsql security definer set search_path = retail, public, extensions as $fn$
declare
  r retail.prendas_por_regularizar;
begin
  select * into r from retail.prendas_por_regularizar where id = p_id;
  if r.id is null or r.estado <> 'regularizada' then return; end if;
  perform retail.fn_actividad_anotar(
    'existencias', 'prenda_regularizada',
    'regularizó la prenda vendida sin registrar «' || btrim(r.descripcion) || '»: '
      || case r.forma when 'llego_nueva' then 'la registró como «' else 'era «' end
      || coalesce(retail.fn_actividad_prenda(r.variante_id), 'una prenda') || '»'
      || ' · precio oficial ' || retail.fn_actividad_soles(r.precio_oficial) || ', se cobró ' || retail.fn_actividad_soles(r.precio_cobrado),
    r.regularizado_por, case when p_origen = 'vivo' then retail.fn_actividad_terminal_ahora() end, r.ubicacion_id, null,
    'prendas_por_regularizar', r.id::text, r.regularizado_en,
    jsonb_build_object('forma', r.forma, 'precio_cobrado', r.precio_cobrado, 'precio_oficial', r.precio_oficial,
                       'diferencia', nullif(r.diferencia, 0), 'vendido_por', r.vendido_por),
    p_origen);
end;
$fn$;

-- `create or replace` conserva los permisos de la función (solo la llaman los disparadores); aun así se comprueba que la
-- versión nueva quedó puesta, para que un pegado que no aplicó no pase por bueno.
do $$
begin
  if pg_get_functiondef('retail.fn_actividad_regularizar(uuid,text)'::regprocedure) not like '%''existencias'', ''prenda_regularizada''%' then
    raise exception 'fn_actividad_regularizar no quedó anotando en existencias';
  end if;
end;
$$;
