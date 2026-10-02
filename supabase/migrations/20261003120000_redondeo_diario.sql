-- ============================================================================
-- 20261003120000_redondeo_diario.sql — CAYLA V2 (ADR-0310, actividad 3)
--
-- EL CAMBIO. El diario contable (Finanzas) aprende a asentar el redondeo del efectivo: lo que no se cobró por llegar a la moneda
-- de S/ 0.10, hacia abajo (una fila `metodo = 'redondeo'` en `venta_pagos`). Es un GASTO de CAYLA (cede ese céntimo por la ley),
-- no plata en el banco. Sin filas de redondeo no cambia ni un número.
--
--   1. Una cuenta nueva de gasto, 6598 «Redondeo de efectivo (a favor del cliente)», en gastos de operación: así el Estado de
--      resultados muestra cuánto cede CAYLA por la ley, sin mezclarlo con los faltantes de caja (6599) ni con las mermas (659).
--      PROVISIONAL hasta el visto bueno del contador (el PCGE no tiene una cuenta oficial del redondeo; la práctica va de
--      659/6599 a 6799): mismo estado que las cuentas 451, 122 y 655 de las migraciones de Finanzas.
--   2. `fn_asiento_cuenta_de_medio('redondeo')` → '6598'. Hoy un medio que no conoce cae en `else '104'`: el redondeo de una
--      venta de 79.88 pagada con 79.80 en efectivo quedaba como 0.08 «en el banco» (una plata que nunca llegó) y la pérdida no
--      llegaba nunca al Estado de resultados.
--
-- POR QUÉ NO HACE FALTA TOCAR `fn_asientos`. Cada fila de `venta_pagos` genera su Debe (por medio) contra el Haber de la venta
-- (7011 + 4011, de la suma de los ítems). Con el redondeo como una fila más, la suma de las filas sigue igualando la suma de los
-- ítems: el asiento cuadra solo, sin una línea de ajuste forzada (ADR-0198, «cada asiento cuadra»), y el Cierre de mes no se
-- bloquea. La anulación usa la misma función y revierte el redondeo contra la misma cuenta: queda en cero. «Caja» (101) trae
-- el efectivo físico, igual que el esperado de las cajas, así que el Balance concilia sin una causa nueva.
--
-- QUÉ NO CAMBIA. El comprobante SUNAT, el IGV de la venta (7011 + 4011 salen de los ítems, exactos) y las ventas netas.
--
-- COMO SE PARCHA. `fn_asiento_cuenta_de_medio` (una función de 330 caracteres, IMMUTABLE) se corta sobre `pg_get_functiondef`,
-- anclada en un texto que debe aparecer exactamente una vez, con candado de huella antes y después (md5 normalizado, sin
-- comentarios ni espacios). Huella «antes» verificada en producción, solo lectura, el 2026-10-02.
--
-- PRODUCCIÓN. Pegar SOLA, después de las partes de la actividad 2 y antes de publicar la web. Sin tablas ni políticas ni
-- `drop trigger`: un `insert` en el plan de cuentas y un `create or replace`. Idempotente. Si el contador pide otro código,
-- se renombra ANTES de cerrar el primer mes (el cierre congela la huella del diario con su código).
--
-- VERIFICACIÓN (solo lectura):
--   select codigo, nombre, tipo, seccion_resultados from retail.cuentas where codigo = '6598';       → 1 fila
--   select retail.fn_asiento_cuenta_de_medio('redondeo');                                             → 6598
--   select retail.fn_asiento_cuenta_de_medio('efectivo'), retail.fn_asiento_cuenta_de_medio('yape');  → 101 | 104 (no cambian)
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- 1. La cuenta. Provisional hasta el contador. `on conflict do nothing`: si ya existe (otra sesión, o esta migración por segunda
--    vez) no se pisa su nombre.
insert into retail.cuentas (codigo, nombre, tipo, seccion_resultados, orden) values
  ('6598', 'Redondeo de efectivo (a favor del cliente)', 'gasto', 'gastos_operacion', 46)
on conflict (codigo) do nothing;

create or replace function pg_temp.redondeo_md5(p_firma text)
returns text
language sql
as $f$
  select md5(regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g'))
    from pg_proc p where p.oid = to_regprocedure(p_firma)
$f$;

-- 2. El medio 'redondeo' va a la cuenta del gasto.
do $migracion$
declare
  c_firma constant text := 'retail.fn_asiento_cuenta_de_medio(text,text)';
  c_antes constant text := '9d9d0c71a9867ab1f4f7262ba7f13c7a';
  c_despues constant text := '6b4982f3847cb817c3a26155f043f047';
  c_ancla constant text := $a$when p_medio = 'saldo_a_favor' then '421'$a$;
  c_nuevo constant text := $n$when p_medio = 'saldo_a_favor' then '421'
    when p_medio = 'redondeo' then '6598'   -- ADR-0310: lo que no se cobró por redondear el efectivo (gasto; cuenta provisional)$n$;
  v_md5 text;
  v_def text;
begin
  v_md5 := pg_temp.redondeo_md5(c_firma);
  if v_md5 is null then
    raise exception '% no existe en esta base.', c_firma;
  end if;
  if v_md5 = c_despues then
    raise notice 'fn_asiento_cuenta_de_medio ya conoce el redondeo: no se toca.';
    return;
  end if;
  if v_md5 <> c_antes then
    raise exception '% cambió desde que se escribió esta migración (md5 normalizado %; se esperaba % —antes— o % —después—). No se reemplaza a ciegas: lee su definición viva y rehace este parche sobre ESA versión.',
      c_firma, v_md5, c_antes, c_despues;
  end if;

  v_def := pg_get_functiondef(c_firma::regprocedure);
  if (length(v_def) - length(replace(v_def, c_ancla, ''))) / length(c_ancla) <> 1 then
    raise exception 'redondeo: la marca «%» no aparece exactamente una vez en fn_asiento_cuenta_de_medio. No se toca nada.', c_ancla;
  end if;
  execute replace(v_def, c_ancla, c_nuevo);

  -- Validación final: si algo no quedó como se espera, se aborta TODO.
  v_md5 := pg_temp.redondeo_md5(c_firma);
  if v_md5 <> c_despues then
    raise exception 'redondeo: fn_asiento_cuenta_de_medio quedó con md5 % y se esperaba %.', v_md5, c_despues;
  end if;
  if (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'fn_asiento_cuenta_de_medio') <> 1 then
    raise exception 'redondeo: quedaron sobrecargas de fn_asiento_cuenta_de_medio.';
  end if;
  if retail.fn_asiento_cuenta_de_medio('redondeo') <> '6598'
     or retail.fn_asiento_cuenta_de_medio('efectivo') <> '101'
     or retail.fn_asiento_cuenta_de_medio('yape') <> '104'
     or retail.fn_asiento_cuenta_de_medio('anticipo') <> '122'
     or retail.fn_asiento_cuenta_de_medio('tarjeta') <> '105'
     or retail.fn_asiento_cuenta_de_medio('tarjeta', 'sale') <> '451'
     or retail.fn_asiento_cuenta_de_medio('saldo_a_favor') <> '421' then
    raise exception 'redondeo: fn_asiento_cuenta_de_medio no da las cuentas esperadas.';
  end if;
end
$migracion$;

-- 3. Validación de la cuenta: tiene que estar en gastos de operación (el Estado de resultados solo muestra las cuentas con
--    sección: una sin ella desaparecería del estado sin dar error).
do $$
begin
  if not exists (select 1 from retail.cuentas where codigo = '6598' and tipo = 'gasto' and seccion_resultados = 'gastos_operacion' and activo) then
    raise exception 'redondeo: la cuenta 6598 no está como gasto de operación activo.';
  end if;
end $$;

-- ¿SE PEGÓ ENTERO? Esta es la ÚLTIMA instrucción del archivo. Si al terminar no ves una fila con esta parte y «QUEDÓ BIEN», el texto se
-- pegó cortado (el editor de Supabase no avisa si el corte cae entre dos instrucciones: «Success» no quiere decir que se aplicó todo).
-- Copia el archivo COMPLETO (en la terminal: `pbcopy < supabase/migrations/<archivo>`) y vuelve a pegarlo: es seguro repetirlo.
select '20261003120000 · el diario contable (cuenta 6598 y su asiento)' as parte,
       case when retail.fn_asiento_cuenta_de_medio('redondeo') = '6598' and exists (select 1 from retail.cuentas where codigo = '6598' and tipo = 'gasto' and activo)
            then 'QUEDÓ BIEN' else 'REVISAR: falta alguna parte anterior o el texto se pegó cortado' end as resultado;
