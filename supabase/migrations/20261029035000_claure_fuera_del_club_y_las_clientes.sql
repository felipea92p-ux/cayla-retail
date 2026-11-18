-- ============================================================================
-- 20261029035000 — Lo vendido de CLAURE no da puntos ni cuenta en el Club ni en la ficha de la cliente (ADR-0560; actividad 6c)
--
-- EL PROBLEMA PRIMERO. El club da puntos por lo que una miembro compra (`fn_club_puntos_por_venta` → `fn_club_monto_neto_venta`), cuenta sus compras
-- (`fn_club_compras_netas`, de donde salen el resumen del club y el aniversario) y su ficha muestra todo lo que compró. En Tienda LIM se vende lo de CAYLA y lo de CLAURE
-- (de Claudia) en la misma caja: una miembro que compra una prenda de CLAURE recibiría puntos del club de CAYLA, y su ficha diría que compró más de lo que compró a
-- CAYLA. Felipe (2026-10-28): «CLAURE no suma en … Club y clientes».
--
-- CONTRATO (Liskov)
--   PROMETE: (1) los PUNTOS se calculan solo sobre las líneas de CAYLA de la venta (`fn_club_monto_neto_venta`: lo de CLAURE no cuenta); como la conciliación de una devolución o una
--            anulación (`fn_club_puntos_conciliar_venta`) usa esa misma función, quita solo lo que corresponde; (2) una compra solo de CLAURE no es «compra» del club
--            (`fn_club_compras_netas`; la mixta sí); (3) la ficha de la cliente (`fn_clienta_compras`, `fn_clienta_cambios`, `fn_clienta_devoluciones`) no lista las líneas de CLAURE ni los
--            cambios o devoluciones que son solo de CLAURE. La regla es la de 6a (`fn_item_es_de_claure`: sede donde opera CLAURE, venta desde el arranque de su cuenta, dueño real
--            de la línea). Con una sede sin CLAURE, o antes del arranque, los resultados son EXACTAMENTE los de antes.
--   ASUME:   (a) los puntos que ya se dieron por una compra de CLAURE entre el 23-oct y el día que se pegue esto NO se quitan solos: si esa venta se devuelve o se anula
--            después, la conciliación descuenta la parte de CLAURE (lo correcto, pero Felipe debe saberlo); (b) `fn_club_conservacion_hasta` (cuánto se guarda la ficha, por su última
--            compra) y los avisos del club (`fn_club_avisos_pendientes`, que deduce su talla de lo que compró) NO cambian: son plazos legales y datos de la persona, no sumas de CAYLA;
--            (c) una devolución con prendas de CAYLA y de CLAURE se lista entera en la ficha (su reembolso es de las dos).
--   FALLA:   igual que antes (cada función conserva sus candados).
--   NO HACE: no cambia puntos ya dados, ni el saldo de nadie, ni ninguna tabla.
--
-- CÓMO SE PEGA EN PRODUCCIÓN — UNA SOLA EJECUCIÓN, después de 20261029030000. Solo reemplazos anclados; sin tablas, políticas ni `drop trigger`. Idempotente. Si una función de
-- producción no tiene el texto esperado, ABORTA sin cambiar nada y dice cuál (no pude leer los textos vivos).
-- SE ROMPE SI: alguna de las cinco funciones cambió en producción sin dejar archivo.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------- 1. Los puntos: solo lo de CAYLA cuenta ----------
select pg_temp.reemplazar('retail.fn_club_monto_neto_venta(uuid)',
$v$   where vi.venta_id = p_venta_id;$v$,
$n$   where vi.venta_id = p_venta_id
     -- ADR-0560 (6c): una prenda de CLAURE no da puntos del club de CAYLA.
     and not retail.fn_item_es_de_claure(vi.id, (select v.ubicacion_id from retail.ventas v where v.id = p_venta_id),
                                         (select v.created_at from retail.ventas v where v.id = p_venta_id));$n$,
1);

-- ---------- 2. Las compras del club: una compra solo de CLAURE no cuenta ----------
select pg_temp.reemplazar('retail.fn_club_compras_netas(uuid)',
$v$     and not v.es_prueba
     and not retail.fn_venta_devuelta_entera(v.id);$v$,
$n$     and not v.es_prueba
     and not retail.fn_venta_devuelta_entera(v.id)
     -- ADR-0560 (6c): una compra solo de CLAURE no es compra de CAYLA (la mixta sí).
     and (not exists (select 1 from retail.venta_items vi where vi.venta_id = v.id and retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at))
          or exists (select 1 from retail.venta_items vi where vi.venta_id = v.id and not retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at)));$n$,
1);

-- ---------- 3. La ficha de la cliente: sus compras de CAYLA ----------
select pg_temp.reemplazar('retail.fn_clienta_compras(uuid)',
$v$  where v.cliente_id = p_id and v.estado = 'completada'
  order by v.created_at desc;$v$,
$n$  where v.cliente_id = p_id and v.estado = 'completada'
    and not retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at)
  order by v.created_at desc;$n$,
1);

-- ---------- 4. La ficha de la cliente: sus cambios de prendas de CAYLA ----------
select pg_temp.reemplazar('retail.fn_clienta_cambios(uuid)',
$v$  where v.cliente_id = p_id
  order by c.created_at desc;$v$,
$n$  where v.cliente_id = p_id
    and not retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at)
  order by c.created_at desc;$n$,
1);

-- ---------- 5. La ficha de la cliente: sus devoluciones (una solo de CLAURE no sale) ----------
select pg_temp.reemplazar('retail.fn_clienta_devoluciones(uuid)',
$v$  where v.cliente_id = p_id
  order by d.created_at desc;$v$,
$n$  where v.cliente_id = p_id
    and (not exists (select 1 from retail.devolucion_items di join retail.venta_items vi on vi.id = di.venta_item_id
                      where di.devolucion_id = d.id and retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at))
         or exists (select 1 from retail.devolucion_items di join retail.venta_items vi on vi.id = di.venta_item_id
                     where di.devolucion_id = d.id and not retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at)))
  order by d.created_at desc;$n$,
1);

-- ---------- Que quedó como se prometió ----------
do $$
begin
  if position('fn_item_es_de_claure' in pg_get_functiondef('retail.fn_clienta_cambios(uuid)'::regprocedure)) = 0 then
    raise exception 'ADR-0560: fn_clienta_cambios no quedó sin lo de CLAURE';
  end if;
  if position('fn_item_es_de_claure' in pg_get_functiondef('retail.fn_clienta_compras(uuid)'::regprocedure)) = 0 then
    raise exception 'ADR-0560: fn_clienta_compras no quedó sin lo de CLAURE';
  end if;
  if position('fn_item_es_de_claure' in pg_get_functiondef('retail.fn_clienta_devoluciones(uuid)'::regprocedure)) = 0 then
    raise exception 'ADR-0560: fn_clienta_devoluciones no quedó sin lo de CLAURE';
  end if;
  if position('fn_item_es_de_claure' in pg_get_functiondef('retail.fn_club_compras_netas(uuid)'::regprocedure)) = 0 then
    raise exception 'ADR-0560: fn_club_compras_netas no quedó sin lo de CLAURE';
  end if;
  if position('fn_item_es_de_claure' in pg_get_functiondef('retail.fn_club_monto_neto_venta(uuid)'::regprocedure)) = 0 then
    raise exception 'ADR-0560: fn_club_monto_neto_venta no quedó sin lo de CLAURE';
  end if;
end $$;
