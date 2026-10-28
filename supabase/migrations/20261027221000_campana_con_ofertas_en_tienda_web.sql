-- ============================================================================
-- 20261027221000_campana_con_ofertas_en_tienda_web.sql — Una campaña que solo tiene OFERTAS también sale en la Tienda web (ADR-0496, «Lo que NO cubre»)
--
-- EL PROBLEMA PRIMERO. Desde el 2026-10-23 una campaña ya no guarda su descuento en `etiquetas.descuento_pct`: el descuento se arma con OFERTAS
-- (`retail.campana_reglas`, un % menos con fechas, días y categorías). La caja las lee (`fn_campanas_en_sede` mira las ofertas) y cobra bien. Pero
-- cuatro funciones de la Tienda web siguen preguntando solo por `descuento_pct > 0`:
--   · `fn_campana_web_valida`   → la lista de Tienda web ▸ Campañas y quién puede diseñar la campaña;
--   · `tienda_portada`          → lo que anuncia la portada pública de la tienda online;
--   · `tienda_diseno_campana`   → el diseño programado que pinta la tienda;
--   · `fn_campana_web_fila`     → el % que dice la lista (salía vacío).
-- Resultado: una campaña con 1 oferta y «sin descuento» (el caso «Día del perro» del 2026-10-27, en local) cobra en caja pero NO sale en
-- Tienda web ▸ Campañas, ni en la portada, ni se le puede programar diseño. Lo dejó escrito ADR-0496 («Una campaña con solo ofertas cobra bien en
-- caja pero puede no salir en esas pantallas»). Consultado en producción el 2026-10-27: las tres exigían `descuento_pct > 0`, ninguna miraba `campana_reglas`.
--
-- LO QUE HACE (Felipe, 2026-10-27: «el % que anuncia la portada es el mayor entre las ofertas que rigen hoy»)
--   1. `fn_campana_oferta_hoy(etiqueta, hoy)`: la mejor oferta que rige HOY de una campaña (la de mayor %; empatadas, la que termina primero),
--      con la MISMA regla de la caja (`fn_regla_rige_en`: estado `activa`, fechas y día de la semana). Un borrador o una retirada nunca cuenta.
--   2. `fn_campana_portada()`: LA campaña que gana la portada, con el % que anuncia y hasta cuándo. Una sola definición para `tienda_portada` y
--      `tienda_diseno_campana` (antes cada una repetía la consulta: dos copias que se podían desfasar y la tienda aplica el diseño solo si el
--      nombre de la campaña coincide con el de la portada).
--   3. `fn_campana_web_valida`: una campaña es de la Tienda web si tiene descuento de siempre O al menos una oferta `activa` (de cualquier fecha:
--      la lista también muestra las que van a empezar y las que terminaron hace menos de 120 días).
--   4. `fn_campana_web_fila`: su `pct` es el mayor entre el descuento de siempre y sus ofertas activas.
--   5. `tienda_portada` y `tienda_diseno_campana` pasan a leer `fn_campana_portada()`. La forma de lo que devuelven no cambia.
--
-- REGLAS
--   · Sin ofertas, TODO queda idéntico a antes: mismo orden (termina primero, mayor %, nombre), mismo % y mismo «hasta». Para toda campaña que
--     hoy sale, la respuesta es la misma (prueba: `pnpm pruebas:campana-con-ofertas`).
--   · El % de la portada es el que cobra la caja: el mayor entre el descuento de siempre y las ofertas que rigen hoy. El cliente nunca ve un número
--     menor al que luego paga.
--   · El «hasta» (la cuenta regresiva) es el de lo que da ese %: el de la campaña si gana el descuento de siempre (o empatan), el de la oferta si
--     gana ella. Así la cuenta no sigue corriendo cuando la oferta ya terminó.
--   · La portada pide que la campaña tenga prendas: marcadas, por categoría, o —como la caja— de las categorías «solo estas» de una oferta que
--     rige hoy (la oferta dice dónde rige, ADR-0496).
--
-- QUÉ NO HACE
--   · No toca `etiquetas.descuento_pct`, `campana_reglas`, `fn_campanas_en_sede` ni `registrar_venta`: no cambia lo que cobra nadie.
--   · No mira las sedes de la campaña ni de la oferta: la portada no tiene tienda (igual que antes con el descuento de siempre; ADR-0486).
--   · Quedan sin cambiar, como dice ADR-0496, `campana_detalle`, el reporte de Finanzas (`fn_campanas_reporte`), `fn_configuracion_tiendas` y las
--     copias en TypeScript (`lib/precio-de-hoy.ts`, `lib/etiqueta-campana.ts`): pendientes aparte.
--
-- DECIDÍ: una función interna que devuelve la ganadora y que las dos funciones públicas llaman, y no pegar la misma consulta nueva en las dos.
-- DESCARTÉ: un texto genérico sin % cuando solo hay ofertas («Ofertas por el Día del Perro»): más simple, pero pierde el «−20 %», que es lo que
--   atrae, y Felipe eligió el mayor % activo hoy.
-- DESCARTÉ: contar el borrador: un borrador nunca cobra (solo se activa con llave), y la tienda anunciaría un descuento que la caja no da.
-- DESCARTÉ: exigir que el día de la semana rija en la LISTA del ERP: el líder necesita ver y diseñar la campaña un miércoles aunque su oferta sea de
--   martes y jueves. En la PORTADA sí cuenta (la tienda anuncia lo que cobra hoy).
-- SE ROMPE SI: alguien reescribe `tienda_portada` o `tienda_diseno_campana` con una consulta propia (vuelven a pasar dos copias y el diseño no
--   coincide con la campaña de la portada), o si `fn_regla_rige_en` cambia sin avisar a la caja y a la tienda a la vez.
--
-- PRODUCCIÓN. NO está aplicada: la decide Felipe (cambia lo que lee la tienda pública). Una sola parte, re-ejecutable: solo `create or replace` de
-- funciones (ni `alter` de tablas en uso, ni políticas, ni triggers: ADR-0195). Una guarda al principio comprueba que cada función viva sea la de
-- producción del 2026-10-27 (md5) o esta misma; si no, no aplica nada. Dentro de los textos entre comillas no hay `select … into` (ADR-0288).
-- Verificación después de pegar: `pnpm pruebas:campana-con-ofertas` (local) y, en producción, `select retail.tienda_portada();` sigue devolviendo
-- la misma campaña que antes.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 0. Guarda: cada función viva es la de producción (2026-10-27) o ya es esta migración ----------
do $guarda$
declare
  v record;
  v_md5 text;
  v_cuerpo text;
begin
  for v in
    select * from (values
      ('retail.fn_campana_web_valida(uuid)',   '36b356cff4df85569b800945dcc1e7b1'),
      ('retail.fn_campana_web_fila(uuid,date)', 'e353f5460a651dc5b9158c74e1f1316e'),
      ('retail.tienda_portada()',               '1c1e45c5d72db986e85ed8c895614eec'),
      ('retail.tienda_diseno_campana()',        '282c8d0da5c4a8bd4354fa674fcf156e')
    ) as t (firma, md5_esperado)
  loop
    if to_regprocedure(v.firma) is null then
      raise exception 'campana_con_ofertas: % no existe; no se aplica nada.', v.firma;
    end if;
    v_cuerpo := (select p.prosrc from pg_proc p where p.oid = to_regprocedure(v.firma));
    v_md5 := md5(v_cuerpo);
    if v_md5 <> v.md5_esperado and position('campana_reglas' in v_cuerpo) = 0 and position('fn_campana_portada' in v_cuerpo) = 0 then
      raise exception 'campana_con_ofertas: % no es la de producción del 2026-10-27 (md5 %); no se aplica nada. Léela antes de reemplazarla.', v.firma, v_md5;
    end if;
  end loop;

  if to_regprocedure('retail.fn_regla_rige_en(date,date,smallint[],date,integer)') is null then
    raise exception 'campana_con_ofertas: falta fn_regla_rige_en (ofertas de ADR-0496); no se aplica nada.';
  end if;
  if to_regclass('retail.campana_reglas') is null then
    raise exception 'campana_con_ofertas: falta retail.campana_reglas (20261023232000); no se aplica nada.';
  end if;
end
$guarda$;

-- ---------- 1. La mejor oferta que rige hoy ----------
-- Misma regla que `fn_campanas_en_sede` (la caja): oferta `activa`, tipo «un % menos», dentro de sus fechas y en uno de sus días. Interna.
create or replace function retail.fn_campana_oferta_hoy(p_etiqueta_id uuid, p_hoy date)
returns table (pct numeric, hasta date)
language sql
stable
security definer
set search_path = retail, public
as $$
  select r.porcentaje::numeric, r.hasta
    from retail.campana_reglas r
   where r.etiqueta_id = p_etiqueta_id
     and r.estado = 'activa'
     and r.tipo = 'pct'
     and retail.fn_regla_rige_en(r.desde, r.hasta, r.dias_semana, p_hoy, 0)
   order by r.porcentaje desc, r.hasta
   limit 1
$$;

comment on function retail.fn_campana_oferta_hoy(uuid, date) is
  'La oferta de una campaña que rige hoy (mayor %, a igualdad la que termina primero), con la misma regla de la caja. Un borrador o una retirada no cuenta. Interna: la llama fn_campana_portada.';

revoke all on function retail.fn_campana_oferta_hoy(uuid, date) from public, anon, authenticated;

-- ---------- 2. La campaña que gana la portada ----------
-- Estilo campana, aprobada, activa, vigente hoy (Lima), con descuento —de siempre o de una oferta que rige hoy— y con prendas. Gana la que termina
-- primero; a igualdad, la de mayor %; a igualdad, por nombre. Sin ofertas es exactamente la consulta de antes.
create or replace function retail.fn_campana_portada()
returns table (id uuid, nombre text, pct numeric, hasta date)
language sql
stable
security definer
set search_path = retail, public
as $$
  select e.id, e.nombre, x.pct, x.hasta
    from retail.etiquetas e
   cross join (select retail.fn_hoy_lima() as hoy) h
    left join lateral retail.fn_campana_oferta_hoy(e.id, h.hoy) o on true
   cross join lateral (
     select greatest(coalesce(e.descuento_pct, 0), coalesce(o.pct, 0)) as pct,
            case when coalesce(e.descuento_pct, 0) >= coalesce(o.pct, 0) then e.vigente_hasta else o.hasta end as hasta
   ) x
   where e.estilo = 'campana'
     and e.estado = 'aprobado'
     and e.activo
     and x.pct > 0
     and (e.vigente_desde is null or e.vigente_desde <= h.hoy)
     and (e.vigente_hasta is null or e.vigente_hasta >= h.hoy)
     and (
       exists (select 1 from retail.variante_etiquetas ve where ve.etiqueta_id = e.id)
       or exists (select 1 from retail.etiqueta_categorias ec where ec.etiqueta_id = e.id)
       or exists (
         select 1
           from retail.campana_reglas r
           join retail.campana_regla_categorias rc on rc.regla_id = r.id and rc.modo = 'solo'
          where r.etiqueta_id = e.id
            and r.estado = 'activa'
            and r.tipo = 'pct'
            and retail.fn_regla_rige_en(r.desde, r.hasta, r.dias_semana, h.hoy, 0))
     )
   order by x.hasta nulls last, x.pct desc, e.nombre
   limit 1
$$;

comment on function retail.fn_campana_portada() is
  'La campaña que gana la portada de la tienda online: {id, nombre, pct, hasta}. El % es el mayor entre el descuento de siempre y las ofertas que rigen hoy; el hasta es el de lo que da ese %. Una sola definición para tienda_portada y tienda_diseno_campana. Interna.';

revoke all on function retail.fn_campana_portada() from public, anon, authenticated;

-- ---------- 3. ¿Es una campaña de la Tienda web? ----------
create or replace function retail.fn_campana_web_valida(p_etiqueta_id uuid)
returns boolean
language sql
stable
security definer
set search_path = retail, public
as $$
  select exists (
    select 1 from retail.etiquetas e
     where e.id = p_etiqueta_id and e.estilo = 'campana' and e.estado = 'aprobado' and e.activo
       and (
         e.descuento_pct > 0
         or exists (select 1 from retail.campana_reglas r where r.etiqueta_id = e.id and r.estado = 'activa' and r.tipo = 'pct')))
$$;

-- ---------- 4. La campaña como la lista: su % también cuenta las ofertas ----------
create or replace function retail.fn_campana_web_fila(p_etiqueta_id uuid, p_hoy date)
returns jsonb
language sql
stable
security definer
set search_path = retail, public
as $$
  select jsonb_build_object(
    'id', e.id,
    'nombre', e.nombre,
    'pct', nullif(greatest(
             coalesce(e.descuento_pct, 0),
             coalesce((select max(r.porcentaje) from retail.campana_reglas r
                        where r.etiqueta_id = e.id and r.estado = 'activa' and r.tipo = 'pct'), 0)), 0),
    'desde', e.vigente_desde,
    'hasta', e.vigente_hasta,
    'estado', case when e.vigente_desde is not null and e.vigente_desde > p_hoy then 'prog'
                   when e.vigente_hasta is not null and e.vigente_hasta < p_hoy then 'fin'
                   else 'vivo' end,
    'prendas', (
      select count(*) from retail.productos p
       where p.estado = 'activo'
         and (
           exists (select 1 from retail.variante_etiquetas ve
                     join retail.variantes v on v.id = ve.variante_id
                    where ve.etiqueta_id = e.id and v.producto_id = p.id)
           or exists (select 1 from retail.etiqueta_categorias ec
                       where ec.etiqueta_id = e.id and ec.categoria_id = p.categoria_id)
         )
    ),
    'diseno', (
      select jsonb_build_object(
               'modo', d.modo, 'plantilla', d.plantilla, 'estado', d.estado,
               'imagen_ruta', d.imagen_ruta, 'version', d.version, 'actualizado_en', d.actualizado_en)
        from retail.campana_web_disenos d where d.etiqueta_id = e.id)
  )
  from retail.etiquetas e where e.id = p_etiqueta_id
$$;

-- ---------- 5. Lo que lee la tienda: las dos salen de la misma ganadora ----------
create or replace function retail.tienda_portada()
returns jsonb
language sql
stable
security definer
set search_path = retail, public
as $$
  select jsonb_build_object(
    'campana', (
      select jsonb_build_object('nombre', c.nombre, 'pct', c.pct, 'hasta', c.hasta)
        from retail.fn_campana_portada() c
    )
  );
$$;

comment on function retail.tienda_portada() is
  'Tienda online (ADR-0408): la portada sin cuenta. {campana: {nombre, pct, hasta} | null}. El pct es el mayor entre el descuento de siempre y las ofertas que rigen hoy (ADR-0496). Solo la llama tienda_web.';

create or replace function retail.tienda_diseno_campana()
returns jsonb
language sql
stable
security definer
set search_path = retail, public
as $$
  select jsonb_build_object(
    'campana', (
      select jsonb_build_object(
        'nombre', c.nombre,
        'diseno', (
          select retail.fn_campana_web_diseno_tienda(d.etiqueta_id)
            from retail.campana_web_disenos d where d.etiqueta_id = c.id and d.estado = 'programado')
      )
      from retail.fn_campana_portada() c
    )
  );
$$;

comment on function retail.tienda_diseno_campana() is
  'Tienda online: la campaña que gana la portada y su diseño PROGRAMADO (null si no tiene). {campana: {nombre, diseno} | null}. Lee fn_campana_portada, la misma de tienda_portada. Solo la llama tienda_web.';
