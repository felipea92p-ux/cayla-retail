-- Tres funciones que producción corre con un texto que el repo no tenía (2026-11-09).
--
-- EL PROBLEMA PRIMERO. La revisión diaria «Producción contra main» (ADR-0251) sale en rojo desde el 2026-11-05. Medido el
-- 2026-11-09 por el conector, solo lectura: de `main` no faltaba pegar nada, pero cuatro funciones de producción tienen un texto
-- que no estaba en ninguna rama, PR ni carpeta de trabajo. Alguien las mejoró en el SQL Editor y el texto nunca volvió al repo.
-- El riesgo es silencioso: una migración que recree una de ellas desde el repo devolvería producción a la versión vieja sin
-- ningún error (le pasó a Análisis con el PR 397).
--
-- ANALOGÍA CAYLA. Es la etiqueta de precio que la encargada corrigió a mano en la percha y nunca pasó al sistema: la próxima vez
-- que alguien imprima etiquetas desde el sistema, la percha vuelve al precio viejo y nadie sabe por qué.
--
-- QUÉ HACE. Escribe en el repo, tal cual, tres de esas funciones como corren hoy (pg_get_functiondef, leído el 2026-11-09). En
-- producción NO cambia nada: es el mismo texto, letra por letra. Por eso no hace falta pegarla; si se pega, no pasa nada.
--
-- QUÉ TRAEN, frente a lo que el repo tenía:
--   · corregir_pagos_venta (Historial de ventas ▸ Corregir pago):
--       - con la caja ya cerrada, un líder puede corregir lo que NO es efectivo (el efectivo ya se contó y no se mueve);
--         quien no es líder sigue sin poder;
--       - un mes cerrado no se corrige (fn_exigir_mes_abierto);
--       - cada pago puede decir a qué cuenta entró (no el efectivo, que va al cajón), y si no lo dice se sella con la de su medio
--         ese día (fn_cuenta_sellada); pasar una tarjeta de una máquina a otra cuenta como cambio.
--     La pantalla de `main` todavía no ofrece corregir con la caja cerrada: la base lo acepta, la pantalla no lo pide.
--   · tienda_looks (tienda web ▸ looks): ya no arma el catálogo entero para sacar los looks, solo las prendas que están en un look.
--   · tienda_probador (tienda web ▸ probador): las empresas de la tienda se leen una vez, y colores y recortes se arman por prenda.
--
-- LO QUE NO ENTRA. La cuarta, tienda_catalogo, también corre en producción con otro texto, pero copia adentro la regla de «lo
-- nuevo» y la de «lo más vendido» en vez de pedírselas a fn_tienda_lo_nuevo y fn_tienda_mas_vendidos. La prueba que vigila que
-- esa regla viva en un solo lugar (pnpm pruebas:tienda-club, N3) se pone en rojo con ella. Se decide aparte.
--
-- CÓMO SE VERIFICÓ. Con todas las migraciones de main en una base nueva, más esta, las huellas de las tres funciones
-- (scripts/migraciones/deriva.sql) son las mismas que las de producción.

CREATE OR REPLACE FUNCTION retail.corregir_pagos_venta(p_venta_id uuid, p_pagos jsonb, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
declare
  c_medios constant text[] := array['efectivo', 'tarjeta', 'qr', 'yape', 'plin', 'transferencia'];
  v_persona uuid;
  v_venta retail.ventas%rowtype;
  v_fecha date;
  v_caja_cerrada boolean;
  v_objetivo numeric;
  v_suma numeric;
  v_n integer;
  v_efectivo numeric;
  v_redondeo numeric := 0;
  v_antes jsonb;
  v_antes_cmp jsonb;
  v_despues jsonb;
  v_despues_cmp jsonb;
  v_nuevos jsonb;
  v_terminal uuid;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_comprobante text;
  e jsonb;
begin
  -- Es una función del Historial de ventas: se pregunta a la CUENTA, antes de resolver quién firma.
  perform retail.fn_exigir_modulo('historial');
  v_persona := retail.fn_actor_persona_id(true);
  -- Desde qué terminal compartida, si fue desde una (o nada).
  v_terminal := (select t.id from retail.fn_terminal_actual() t limit 1);

  select * into v_venta from retail.ventas where id = p_venta_id for update;
  if v_venta.id is null then
    raise exception 'Esa venta ya no existe — actualiza la pantalla.' using errcode = 'P0001', hint = 'venta_no_existe';
  end if;
  if not coalesce(retail.fn_es_lider() or v_venta.ubicacion_id = retail.fn_ubicacion_actual_persona(), false) then
    raise exception 'Esta venta es de otra tienda: la corrige alguien de esa tienda o un líder.' using errcode = '42501', hint = 'venta_de_otra_sede';
  end if;
  if v_venta.estado = 'anulada' then
    raise exception 'Esta venta está anulada: no tiene pagos que corregir.' using errcode = 'P0001', hint = 'venta_anulada';
  end if;
  if v_venta.caja_id is null then
    raise exception 'Esta venta no pasó por una caja: no hay cuadre que corregir.' using errcode = 'P0001', hint = 'venta_sin_caja';
  end if;
  v_fecha := (v_venta.created_at at time zone 'America/Lima')::date;

  -- La caja bloqueada: `cerrar_caja` también la bloquea, así que el cierre y la corrección se turnan.
  v_caja_cerrada := (select c.estado from retail.cajas c where c.id = v_venta.caja_id for update) is distinct from 'abierta';
  -- Con la caja cerrada, solo un líder (un permiso nulo no pasa). Que el efectivo no cambie se mira más abajo, con lo pedido.
  if v_caja_cerrada and not coalesce(retail.fn_es_lider(), false) then
    raise exception 'La caja de esta venta ya se cerró: el pago lo corrige un líder.' using errcode = 'P0001', hint = 'caja_cerrada';
  end if;
  -- El diario lee los pagos en vivo: un mes cerrado no se mueve.
  perform retail.fn_exigir_mes_abierto(v_venta.ubicacion_id, v_fecha, null, 'corregir el pago de esta venta');

  -- Lo que se reparte: todo lo cobrado menos el adelanto de un apartado (ese no se toca). Incluye el redondeo: vuelve a calcularse.
  v_objetivo := (select coalesce(sum(p.monto), 0) from retail.venta_pagos p where p.venta_id = p_venta_id and p.metodo <> 'anticipo');
  if v_objetivo <= 0 then
    raise exception 'Esta venta se pagó entera con el adelanto del apartado: no hay otro pago que corregir.' using errcode = 'P0001', hint = 'pagos_invalidos';
  end if;

  -- Validar lo pedido: una lista de 1 a 6 medios distintos, cada uno con un monto positivo de hasta dos decimales y, si se dice,
  -- la cuenta a la que entró (un uuid; el efectivo no la lleva: va siempre al cajón de la tienda).
  if p_pagos is null or jsonb_typeof(p_pagos) <> 'array' then
    raise exception 'Faltan los pagos.' using errcode = '22023', hint = 'pagos_invalidos';
  end if;
  v_n := jsonb_array_length(p_pagos);
  if v_n < 1 or v_n > array_length(c_medios, 1) then
    raise exception 'Indica entre uno y seis medios de pago.' using errcode = '22023', hint = 'pagos_invalidos';
  end if;
  for e in select * from jsonb_array_elements(p_pagos) loop
    if jsonb_typeof(e) <> 'object' or not (e ->> 'metodo' = any (c_medios)) then
      raise exception 'Ese medio de pago no existe: %.', coalesce(e ->> 'metodo', '(vacío)') using errcode = '22023', hint = 'pagos_invalidos';
    end if;
    if jsonb_typeof(e -> 'monto') <> 'number' or (e ->> 'monto')::numeric <= 0 or (e ->> 'monto')::numeric <> round((e ->> 'monto')::numeric, 2) then
      raise exception 'Cada pago lleva un monto mayor que cero, con hasta dos decimales.' using errcode = '22023', hint = 'pagos_invalidos';
    end if;
    if e ? 'cuenta_dinero_id' and jsonb_typeof(e -> 'cuenta_dinero_id') <> 'null' then
      if e ->> 'metodo' = 'efectivo' then
        raise exception 'El efectivo entra al cajón de la tienda: no lleva cuenta.' using errcode = '22023', hint = 'pagos_invalidos';
      end if;
      if jsonb_typeof(e -> 'cuenta_dinero_id') <> 'string'
         or e ->> 'cuenta_dinero_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'La cuenta del pago no es válida. Recarga la pantalla.' using errcode = '22023', hint = 'pagos_invalidos';
      end if;
    end if;
  end loop;
  if (select count(distinct x ->> 'metodo') from jsonb_array_elements(p_pagos) x) <> v_n then
    raise exception 'Cada medio va una sola vez.' using errcode = '22023', hint = 'pagos_invalidos';
  end if;
  v_suma := (select sum((x ->> 'monto')::numeric) from jsonb_array_elements(p_pagos) x);
  if v_suma <> v_objetivo then
    raise exception 'Los pagos suman S/ % y lo cobrado fue S/ %: tienen que dar lo mismo.', v_suma, v_objetivo
      using errcode = '22023', hint = 'pagos_invalidos';
  end if;

  -- El redondeo del efectivo (ADR-0311), si la caja redondea: se cobra hacia abajo al múltiplo de S/ 0.10.
  v_efectivo := (select (x ->> 'monto')::numeric from jsonb_array_elements(p_pagos) x where x ->> 'metodo' = 'efectivo');
  if v_efectivo is not null
     and to_regprocedure('retail.fn_acepta_redondeo_efectivo()') is not null
     and retail.fn_acepta_redondeo_efectivo() then
    v_redondeo := retail.fn_redondeo_efectivo(v_efectivo);
    if v_efectivo - v_redondeo <= 0 then
      raise exception 'Un efectivo menor de S/ 0.10 no se puede entregar: pásalo a otro medio.' using errcode = '22023', hint = 'efectivo_muy_chico';
    end if;
  end if;

  -- Las filas nuevas, con su cuenta ya resuelta: la elegida (validada) o la de su medio en esa tienda el día de la venta. Un número
  -- de operación de Yape/Plin/transferencia se conserva si ese medio sigue; el «recibido» no (el vuelto de antes ya no dice nada).
  v_nuevos := (
    select jsonb_agg(jsonb_build_object('metodo', n.metodo, 'monto', n.monto, 'referencia', n.referencia,
                                        'cuenta_dinero_id', retail.fn_cuenta_sellada('cobro', n.metodo, v_venta.ubicacion_id, v_fecha, n.elegida)))
      from (
        select x ->> 'metodo' as metodo,
               (x ->> 'monto')::numeric - case when x ->> 'metodo' = 'efectivo' then v_redondeo else 0 end as monto,
               (select p.referencia from retail.venta_pagos p
                 where p.venta_id = p_venta_id and p.metodo = x ->> 'metodo' and p.metodo in ('yape', 'plin', 'transferencia') limit 1) as referencia,
               nullif(x ->> 'cuenta_dinero_id', '')::uuid as elegida
          from jsonb_array_elements(p_pagos) x
        union all
        select 'redondeo', v_redondeo, null, null where v_redondeo > 0
      ) n
  );

  -- Lo de antes y lo de después, comparables: medio → monto (lo que muestra Actividad) y medio → monto + cuenta (lo que decide si
  -- hubo cambio: pasar una tarjeta de una máquina a otra lo es).
  v_antes_cmp := (
    select jsonb_object_agg(p.metodo, p.monto order by p.metodo)
      from retail.venta_pagos p where p.venta_id = p_venta_id and p.metodo <> 'anticipo'
  );
  v_despues_cmp := (select jsonb_object_agg(n ->> 'metodo', (n ->> 'monto')::numeric order by n ->> 'metodo') from jsonb_array_elements(v_nuevos) n);
  if (select jsonb_object_agg(p.metodo, jsonb_build_object('m', p.monto, 'c', p.cuenta_dinero_id) order by p.metodo)
        from retail.venta_pagos p where p.venta_id = p_venta_id and p.metodo <> 'anticipo')
     = (select jsonb_object_agg(n ->> 'metodo', jsonb_build_object('m', (n ->> 'monto')::numeric, 'c', n -> 'cuenta_dinero_id') order by n ->> 'metodo')
          from jsonb_array_elements(v_nuevos) n) then
    raise exception 'Los pagos ya estaban así: no hubo nada que cambiar.' using errcode = 'P0001', hint = 'pagos_sin_cambios';
  end if;

  -- Con la caja cerrada, el efectivo ya se contó: tiene que quedar igual, céntimo por céntimo (con su redondeo).
  if v_caja_cerrada
     and (coalesce((v_antes_cmp ->> 'efectivo')::numeric, 0), coalesce((v_antes_cmp ->> 'redondeo')::numeric, 0))
         is distinct from (coalesce((v_despues_cmp ->> 'efectivo')::numeric, 0), coalesce((v_despues_cmp ->> 'redondeo')::numeric, 0)) then
    raise exception 'La caja de esta venta ya se cerró y su efectivo ya se contó: corrige solo lo que no es efectivo. El efectivo lo ajusta el líder con un ingreso o egreso de caja.'
      using errcode = 'P0001', hint = 'caja_cerrada';
  end if;

  -- La foto de lo que se reemplaza, completa.
  v_antes := (
    select jsonb_agg(jsonb_build_object('id', p.id, 'metodo', p.metodo, 'monto', p.monto, 'recibido', p.recibido,
                                        'referencia', p.referencia, 'cuenta_dinero_id', p.cuenta_dinero_id) order by p.metodo)
      from retail.venta_pagos p where p.venta_id = p_venta_id and p.metodo <> 'anticipo'
  );

  -- El disparador vuelve a validar la cuenta que se le pasa (no la cambia).
  delete from retail.venta_pagos p where p.venta_id = p_venta_id and p.metodo <> 'anticipo';
  insert into retail.venta_pagos (venta_id, metodo, monto, referencia, cuenta_dinero_id)
  select p_venta_id, n ->> 'metodo', (n ->> 'monto')::numeric, n ->> 'referencia', nullif(n ->> 'cuenta_dinero_id', '')::uuid
    from jsonb_array_elements(v_nuevos) n;

  v_despues := (
    select jsonb_agg(jsonb_build_object('id', p.id, 'metodo', p.metodo, 'monto', p.monto, 'referencia', p.referencia,
                                        'cuenta_dinero_id', p.cuenta_dinero_id) order by p.metodo)
      from retail.venta_pagos p where p.venta_id = p_venta_id and p.metodo <> 'anticipo'
  );

  insert into retail.venta_pagos_correcciones (venta_id, caja_id, persona_id, terminal_id, motivo, antes, despues)
  values (p_venta_id, v_venta.caja_id, v_persona, v_terminal, v_motivo, v_antes, v_despues);

  v_comprobante := (
    select c.serie || '-' || lpad(c.numero::text, 6, '0') from retail.comprobantes c
     where c.venta_id = p_venta_id and c.comprobante_original_id is null order by c.created_at limit 1
  );
  perform retail.fn_actividad_anotar(
    'historial', 'pagos_corregidos',
    'corrigió el pago de ' || coalesce('la venta ' || v_comprobante, 'una venta') || ' de ' || retail.fn_actividad_soles(v_objetivo)
      || case when v_caja_cerrada then ' (con la caja ya cerrada)' else '' end
      || coalesce(' · motivo: ' || v_motivo, ''),
    v_persona, v_terminal, v_venta.ubicacion_id, null, 'ventas', p_venta_id::text, now(),
    jsonb_build_object('antes', v_antes_cmp, 'despues', v_despues_cmp, 'comprobante', v_comprobante, 'motivo', v_motivo,
                       'caja_cerrada', v_caja_cerrada),
    'vivo'
  );

  return v_despues;
end;
$function$;

CREATE OR REPLACE FUNCTION retail.tienda_looks(p_sede uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'retail', 'public'
AS $function$
declare
  v_sedes uuid[] := retail.fn_tienda_sedes_web();
  v_sede uuid;
  v_empresas uuid[];
  v_ids uuid[];
  v_catalogo jsonb;
begin
  v_sede := retail.fn_tienda_sede_elegida(p_sede, v_sedes);
  -- Las empresas que se ven en esa tienda, leídas una vez (lo mismo que hace `tienda_catalogo`).
  v_empresas := array(select e.id from retail.fn_empresas_de_sede(v_sede) as e);
  -- Las prendas que el catálogo mostraría en esta tienda (publicada en la vitrina, vendible, de una empresa de la tienda) Y que están en
  -- alguna pieza de algún look. Lo barato (estar en un look) primero; la función cara (`fn_vitrina_publicable`) solo sobre esas pocas.
  v_ids := array(
    with de_looks as materialized (
      select distinct pz.producto_id from retail.vitrina_look_piezas pz
    )
    select vp.producto_id
      from de_looks dl
      join retail.vitrina_productos vp on vp.producto_id = dl.producto_id
     where vp.publicado
       and exists (select 1 from retail.productos pe where pe.id = vp.producto_id and pe.empresa_id = any (v_empresas))
       and retail.fn_vitrina_publicable(vp.producto_id));

  -- El catálogo acotado a esas prendas, con la misma forma y las mismas reglas que `tienda_catalogo` para lo que leen los looks.
  v_catalogo := (
    with pv as materialized (
      select * from retail.fn_tienda_precios(v_ids, v_sede)
    ),
    modelos as (
      select distinct pv.producto_id as id from pv
    ),
    foto_ok as materialized (
      select pf.producto_id, pf.color_codigo, pf.url, pf.es_principal, pf.orden, pf.created_at, pf.id
        from retail.producto_fotos pf
       where pf.producto_id = any (v_ids)
         and pf.url ~ '^https?://[^/?#]+/storage/v1/object/public/retail-productos-fotos/'
    ),
    -- La foto de cada color: la principal, luego por orden, fecha e id (la misma elección del catálogo).
    foto_de_color as (
      select distinct on (fo.producto_id, fo.color_codigo) fo.producto_id, fo.color_codigo, fo.url
        from foto_ok fo
       order by fo.producto_id, fo.color_codigo, fo.es_principal desc, fo.orden, fo.created_at, fo.id
    ),
    -- Los colores de la prenda que se ofrecen (los de sus tallas en `pv`), en el orden del catálogo de colores.
    colores_de as (
      select x.producto_id,
             jsonb_agg(jsonb_build_object('codigo', co.codigo, 'nombre', co.nombre, 'hex', co.hex, 'foto', fc.url)
                       order by co.orden, co.nombre) as colores
        from (select distinct pv.producto_id, pv.color_codigo from pv) x
        join retail.colores co on co.codigo = x.color_codigo
        left join foto_de_color fc on fc.producto_id = x.producto_id and fc.color_codigo = co.codigo
       group by x.producto_id
    ),
    -- Sus dos primeras fotos, con el mismo orden de la foto de cada color.
    fotos_de as (
      select f.producto_id, jsonb_agg(f.url order by f.n) as fotos
        from (select fo.producto_id, fo.url,
                     row_number() over (partition by fo.producto_id
                                        order by fo.es_principal desc, fo.orden, fo.created_at, fo.id) as n
                from foto_ok fo) f
       where f.n <= 2
       group by f.producto_id
    )
    select jsonb_build_object('sede', v_sede, 'prendas', coalesce(jsonb_agg(jsonb_build_object(
        'id', m.id,
        'nombre', p.referencia,
        'categoria', case when c.id is null then null else jsonb_build_object('nombre', c.nombre, 'prefijo', c.prefijo) end,
        -- ADR-0465: de qué empresa es la prenda, solo en una tienda donde operan dos o más empresas (Lima): la regla de `tienda_catalogo`.
        'empresa', case when cardinality(v_empresas) > 1
                        then (select jsonb_build_object('clave', em.clave, 'nombre', em.nombre) from retail.empresas em where em.id = p.empresa_id) end,
        'colores', coalesce(cd.colores, '[]'::jsonb),
        'fotos', coalesce(fd.fotos, '[]'::jsonb)
      ) order by vp.publicado_en desc, p.referencia, m.id), '[]'::jsonb))
    from modelos m
    join retail.productos p on p.id = m.id
    join retail.vitrina_productos vp on vp.producto_id = m.id
    left join retail.categorias c on c.id = p.categoria_id
    left join colores_de cd on cd.producto_id = m.id
    left join fotos_de fd on fd.producto_id = m.id
  );

  return jsonb_build_object('sede', v_catalogo -> 'sede', 'looks', retail.fn_tienda_looks_json(v_catalogo, null, null, false));
end;
$function$;

CREATE OR REPLACE FUNCTION retail.tienda_probador(p_sede uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'retail', 'public'
AS $function$
declare
  v_sedes uuid[] := retail.fn_tienda_sedes_web();
  v_umbral integer := retail.fn_tienda_umbral();
  v_sede uuid;
  v_ids uuid[];
  v_empresas uuid[];
begin
  v_sede := retail.fn_tienda_sede_elegida(p_sede, v_sedes);

  -- Las empresas que se ven en esa tienda, leídas una vez por carga (antes, `fn_tienda_empresa_se_ve` una vez por prenda: ~0,4 ms cada
  -- una; es lo mismo que ya hace `tienda_catalogo` desde 20261031161000).
  v_empresas := array(select e.id from retail.fn_empresas_de_sede(v_sede) as e);

  -- Las prendas del probador: publicadas y vendibles (lo mismo que mira el catálogo), con largo y con al menos un recorte listo de una
  -- foto del almacén público (la misma condición de foto que el catálogo). Lo barato primero (incluida la empresa); la regla cara
  -- (fn_vitrina_publicable, plpgsql) solo sobre lo que sobrevive: `as materialized` fija ese orden.
  v_ids := array(
    with candidatas as materialized (
      select vp.producto_id
        from retail.vitrina_productos vp
        join retail.productos p on p.id = vp.producto_id
        left join retail.vitrina_largos_tipicos lt on lt.categoria_id = p.categoria_id
       where vp.publicado
         and coalesce(vp.largo_cm, lt.largo_cm) is not null
         and exists (
           select 1
             from retail.producto_fotos pf
             join retail.foto_recortes r
               on r.foto = substring(split_part(pf.url, '?', 1) from '/storage/v1/object/public/retail-productos-fotos/(.+)$')
            where pf.producto_id = vp.producto_id
              and pf.url ~ '^https?://[^/?#]+/storage/v1/object/public/retail-productos-fotos/'
              and r.estado = 'listo')
    )
    select c.producto_id
      from candidatas c
     where exists (select 1 from retail.productos pe where pe.id = c.producto_id and pe.empresa_id = any (v_empresas))  -- fn_tienda_empresa_se_ve, con la lista ya leída
       and retail.fn_vitrina_publicable(c.producto_id));

  return (
    with pv as materialized (
      -- Lo que se ofrece de esas prendas en la tienda elegida, con el resumen por COLOR (el que cobra la bolsa).
      select * from retail.fn_tienda_precios(v_ids, v_sede, true)
       where color_codigo is not null
    ),
    del_color as (
      select distinct on (pv.producto_id, pv.color_codigo)
             pv.producto_id, pv.color_codigo, pv.resumen_precio, pv.resumen_final, pv.resumen_desde, pv.resumen_campana
        from pv
       order by pv.producto_id, pv.color_codigo
    ),
    -- Lo libre de cada color en cada tienda de la web, solo de sus tallas que se ofrecen (la regla única de «hay»).
    disponible as materialized (
      select x.producto_id, x.color_codigo, d.ubicacion_id, sum(d.disponible)::integer as n
        from retail.fn_tienda_disponible(v_ids, v_sedes) d
        join pv x on x.variante_id = d.variante_id
       group by x.producto_id, x.color_codigo, d.ubicacion_id
    ),
    -- Lo libre de cada color en total: una sola suma por color, en vez de releer `disponible` por cada color de cada prenda.
    total_color as (
      select d.producto_id, d.color_codigo, sum(d.n) as n
        from disponible d
       group by d.producto_id, d.color_codigo
    ),
    -- El nivel de cada color en cada tienda de la web (también donde no hay fila: nivel de 0), en una pasada.
    sedes_color as (
      select dc.producto_id, dc.color_codigo,
             jsonb_object_agg(s.id::text, retail.fn_tienda_nivel(coalesce(d.n, 0), v_umbral)) as sedes
        from del_color dc
        cross join unnest(v_sedes) as s (id)
        left join disponible d on d.producto_id = dc.producto_id and d.color_codigo = dc.color_codigo and d.ubicacion_id = s.id
       group by dc.producto_id, dc.color_codigo
    ),
    -- Los colores de cada prenda, armados una vez y unidos por prenda.
    colores_prenda as (
      select dc.producto_id,
             jsonb_agg(jsonb_build_object(
                         'codigo', dc.color_codigo,
                         'precio', dc.resumen_precio,
                         'precio_final', dc.resumen_final,
                         'desde', dc.resumen_desde,
                         'campana', dc.resumen_campana,
                         'stock', jsonb_build_object(
                           'total', retail.fn_tienda_nivel(coalesce(tc.n, 0)::integer, v_umbral),
                           'sedes', coalesce(sc.sedes, '{}'::jsonb)))
                       order by dc.color_codigo) as colores
        from del_color dc
        left join total_color tc on tc.producto_id = dc.producto_id and tc.color_codigo = dc.color_codigo
        left join sedes_color sc on sc.producto_id = dc.producto_id and sc.color_codigo = dc.color_codigo
       group by dc.producto_id
    ),
    -- Los recortes listos de cada prenda, en el orden de sus fotos, armados una vez y unidos por prenda.
    recortes_prenda as (
      select pf.producto_id,
             jsonb_agg(jsonb_build_object('color', pf.color_codigo, 'color_nombre', co.nombre, 'url', f.base || r.recorte, 'proporcion', r.proporcion)
                       order by pf.es_principal desc, pf.orden, pf.created_at, pf.id) as recortes
        from retail.producto_fotos pf
        cross join lateral (
          select substring(pf.url from '^(https?://[^/?#]+/storage/v1/object/public/retail-productos-fotos/)') as base,
                 substring(split_part(pf.url, '?', 1) from '/storage/v1/object/public/retail-productos-fotos/(.+)$') as archivo
        ) f
        join retail.foto_recortes r on r.foto = f.archivo and r.estado = 'listo'
        left join retail.colores co on co.codigo = pf.color_codigo
       where pf.producto_id = any (v_ids)
         and f.base is not null
       group by pf.producto_id
    )
    select jsonb_build_object(
      'sede', v_sede,
      'prendas', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', p.id,
                 'largo', coalesce(vp.largo_cm, lt.largo_cm)::integer,
                 'recortes', rp.recortes,
                 'colores', cp.colores
               ) order by vp.publicado_en desc, p.referencia, p.id)
          from retail.productos p
          join retail.vitrina_productos vp on vp.producto_id = p.id
          left join retail.vitrina_largos_tipicos lt on lt.categoria_id = p.categoria_id
          -- Sin un color que se ofrezca en esa tienda, no hay nada que ponerse.
          join colores_prenda cp on cp.producto_id = p.id
          left join recortes_prenda rp on rp.producto_id = p.id
         where p.id = any (v_ids)), '[]'::jsonb),
      'combina', coalesce((
        select jsonb_object_agg(co.codigo, to_jsonb(co.combina_con))
          from retail.colores co
         where co.codigo in (select dc.color_codigo from del_color dc)
           and cardinality(co.combina_con) > 0), '{}'::jsonb)
    )
  );
end;
$function$;
