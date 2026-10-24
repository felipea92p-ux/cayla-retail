-- ============================================================================
-- 20261024001000_ajuste_compara_lo_que_habia_al_contar.sql — CAYLA V2 (ADR-0494, /chaos 2026-10-23 semilla 494, Felipe 2026-10-23)
--
-- EL PROBLEMA PRIMERO. La planilla «Ajustar stock» de Existencias lee el stock al abrirse y, con «Conté y hay otro número», manda
-- la DIFERENCIA entre lo contado y lo que leyó. Si mientras se cuenta otra persona vende o mueve esa talla, la diferencia se aplica
-- sobre un número que ya no existe: con 6 leídas, 1 vendida y 5 contadas, la base quedó en 4 con 5 prendas de verdad, sin aviso
-- (/chaos CON-06). `movimientos` y `stock` cuadran entre sí; lo que no cuadra es la tienda. Se cuenta con la tienda abierta.
--
-- LA DECISIÓN (Felipe: «aplica tu recomendación»). Cada línea de un ajuste puede traer `esperado`: lo que había en ese lugar cuando
-- la persona contó. Con el stock de esas prendas YA bloqueado (`fn_bloquear_en_orden`), la base compara; si alguna cambió, rechaza
-- TODO el ajuste (nada a medias) con `ajuste_cambio_al_contar` y devuelve en `detail` qué cambió, en JSON:
--   [{"variante_id": "…", "esperado": 6, "ahora": 5}, …]
-- La pantalla muestra esas tallas con el número de ahora, conserva lo contado y deja guardar de nuevo.
-- «Lo que había» es la cantidad de esa sububicación; sin sububicación (una sede que no separa piso y almacén), la suma de la sede:
-- lo mismo que la planilla llama «hoy» (`stockEn`, apps/web/lib/ajuste-reglas.ts).
--
-- CONTRATO (Liskov)
--   PROMETE: una línea SIN `esperado` se ajusta igual que antes: la ficha de Editar producto, «Ajustar inventario» y el hallazgo de
--            un conteo no cambian. Con `esperado`, o se aplica todo porque nada cambió, o no se escribe nada. Va DESPUÉS del atajo de la
--            marca: el reintento de un ajuste ya guardado devuelve lo guardado, aunque el stock ya no sea el `esperado` (lo movió ese
--            mismo ajuste). `esperado` no entra a la huella de la marca: el intento es el mismo con o sin él.
--   ASUME:   `ajustar_inventario` viva a la fecha (anclas verificadas en local el 2026-10-23; en otra base la propia migración se niega si
--            no calzan, sin escribir nada).
--   NO HACE: no toca tablas, políticas ni datos. Una web vieja (sin `esperado`) sigue funcionando, y una web nueva contra una base sin
--            esta migración también: la base vieja ignora la clave.
--
-- CÓMO SE PEGA. Una sola parte, solo funciones. Reemplazos ANCLADOS (ADR-0288), anclas de una línea de código. Idempotente. Sin
-- `select … into` dentro de un texto entre comillas (la fila se lee con `for r in … loop`).
-- ============================================================================
set lock_timeout = '3s';

create or replace function pg_temp.insertar_antes(p_firma text, p_ancla text, p_veces integer, p_bloque text, p_marca text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_marca in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_ancla, ''))) / length(p_ancla);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_ancla, v_n;
  end if;
  execute overlay(v_def placing p_bloque || p_ancla from position(p_ancla in v_def) for length(p_ancla));
end;
$f$;

-- 1. La forma: `esperado` es opcional; si viene, es un entero de 0 en adelante.
select pg_temp.insertar_antes(
  'retail.ajustar_inventario(uuid, uuid, jsonb, text, jsonb, boolean, text, uuid)',
  $v$  v_huella := md5(concat_ws('|',$v$, 1,
  $v$  -- ADR-0494: lo que había cuando se contó (opcional). Si viene, es un entero de 0 en adelante.
  if exists (
    select 1 from jsonb_array_elements(v_ajustes) e
     where nullif(e ->> 'esperado', '') is not null and e ->> 'esperado' !~ '^[0-9]{1,6}$'
  ) then
    raise exception 'Lo que había al contar llegó mal armado. Cierra la planilla y vuelve a abrirla.'
      using errcode = 'P0001', hint = 'ajuste_linea_invalida';
  end if;

$v$,
  $v$e ->> 'esperado' !~ '^[0-9]{1,6}$'$v$);

-- 2. La comparación, con el stock de esas prendas ya bloqueado: si algo cambió mientras se contaba, no se guarda nada.
select pg_temp.insertar_antes(
  'retail.ajustar_inventario(uuid, uuid, jsonb, text, jsonb, boolean, text, uuid)',
  $v$  if jsonb_array_length(v_cargas) > 0 then$v$, 1,
  $v$  -- ADR-0494: «Conté y hay otro número» trae lo que había cuando se contó. Si otra venta o movimiento lo cambió, la diferencia ya
  -- no es la de la persona: se rechaza todo y se dice qué cambió (`detail`, JSON), para que lo vea y vuelva a guardar.
  for r in
    select jsonb_agg(jsonb_build_object('variante_id', x.v, 'esperado', x.esperado, 'ahora', x.ahora) order by x.v) as cambios
      from (
        select (e ->> 'variante_id')::uuid as v,
               (e ->> 'esperado')::integer as esperado,
               coalesce((select sum(s.cantidad) from stock s
                          where s.ubicacion_id = p_ubicacion_id
                            and s.variante_id = (e ->> 'variante_id')::uuid
                            and (p_sububicacion_id is null or s.sububicacion_id = p_sububicacion_id)), 0)::integer as ahora
          from jsonb_array_elements(v_ajustes) e
         where nullif(e ->> 'esperado', '') is not null
      ) x
     where x.ahora <> x.esperado
    having count(*) > 0
  loop
    raise exception 'Mientras contabas cambió lo que hay en % %: no se guardó nada. Revisa y vuelve a guardar.',
      jsonb_array_length(r.cambios), case when jsonb_array_length(r.cambios) = 1 then 'talla' else 'tallas' end
      using errcode = 'P0001', hint = 'ajuste_cambio_al_contar', detail = r.cambios::text;
  end loop;

$v$,
  $v$hint = 'ajuste_cambio_al_contar'$v$);
