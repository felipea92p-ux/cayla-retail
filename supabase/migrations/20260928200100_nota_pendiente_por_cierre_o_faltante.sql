-- ============================================================================
-- 20260928200100_nota_pendiente_por_cierre_o_faltante.sql — CAYLA V2 · Compras, notas de crédito (ADR-0111, ADR-0252)
-- «¿Este cierre sigue esperando su nota de crédito?» con UNA sola regla en `main` y en producción, que junta las dos
-- versiones que hoy conviven. Cambia lo que el líder ve en Notas de crédito y en las listas de Comprobantes y Por pagar,
-- y va sin esperar otro visto bueno (decisión técnica del 2026-09-28, ADR-0252) porque:
--   1. no inventa una regla: junta las dos que ya estaban escritas y cumple lo que Felipe pidió el 2026-09-22;
--   2. producción no tiene hoy ni un cierre ni una nota: ninguna cifra que el líder ya vio cambia al pegarla;
--   3. sin ella, `main` (doble conteo) o producción (cierre fantasma) muestran un saldo por reclamar que no existe.
--
-- EL PROBLEMA PRIMERO. Cuando parte de una compra no llega, se «cierra» la línea (`compra_item_cierres`) y el proveedor
-- debe una nota de crédito. `compras_nota_pendiente` (listas) y `notas_credito_tablero` (tablero) dicen qué cierres
-- siguen esperando esa nota, con su monto esperado. Hoy hay DOS versiones de esa pregunta y las dos se equivocan en un
-- caso distinto:
--   · `main` (20260918220000, 20260919211000): un cierre espera mientras el COMPROBANTE no tenga su nota por faltante.
--     Un cierre que el proveedor saldó con una nota por devolución atada a ese cierre sigue «pendiente»: el mismo crédito
--     se ve dos veces, como nota y como saldo por reclamar (hallado el 2026-09-22 con los datos de demostración; Felipe
--     pidió corregirlo).
--   · producción (commit 1807fdfb8, pegado el 2026-09-22 y nunca fusionado; historial de producción:
--     `notas_credito_pendiente_por_cierre`): un cierre espera mientras ESE cierre no tenga ninguna nota atada. Arregla lo
--     de arriba, pero la nota por faltante es UNA por comprobante y cubre todos sus cierres
--     (`fn_insertar_nota_credito_compra` no deja registrar una segunda), y la pantalla la ata solo al último cierre
--     (`RegistrarNotaCreditoModal`, `pendiente.cierreId`). Con dos líneas cerradas, la otra queda «pendiente» para
--     siempre con su monto esperado, y no hay nota que la apague. Reproducido el 2026-09-28 sobre las funciones de
--     producción: comprobante de 24 u con dos líneas cerradas (14 y 10), nota por faltante de S/ 1,416.00 atada al
--     último cierre → el tablero sigue mostrando «10 u, S/ 590.00 por reclamar» (o «14 u, S/ 826.00», según cuál se
--     cerró al último). Y `pnpm pruebas:compras-faltantes` se pone roja con ese cuerpo («tras registrar la nota por
--     faltante DESAPARECE de la lista»).
--
-- DECIDÍ: un cierre deja de esperar si (a) tiene una nota atada a él, de cualquier motivo, O (b) su comprobante ya tiene
--   la nota por faltante, que es una sola y cubre todos sus cierres. Son las dos reglas que ya estaban escritas en la
--   base (la (b) en `fn_insertar_nota_credito_compra`), juntas. El resto de las dos funciones queda como en producción
--   (el candado de líder, `fn_compra_es_de_mis_tiendas`, las columnas, el orden).
-- DESCARTÉ: traer la versión de producción tal cual (lo que pedía la auditoría): deja el cierre fantasma de arriba en la
--   pantalla más usada del módulo y pone roja una prueba del CI. DESCARTÉ: quedarse con la de `main`: vuelve el doble
--   conteo que Felipe pidió corregir el 2026-09-22. DESCARTÉ: que la pantalla ate la nota por faltante a TODOS los
--   cierres: una nota tiene un solo `cierre_id`, cambiaría el modelo por algo que la regla (b) resuelve en una línea.
-- SE ROMPE SI: (1) una nota por descuento u «otro» SIN cierre atado no apaga el pendiente — es a propósito, la regla de
--   siempre («solo la nota por faltante la apaga»); la pantalla solo ata el cierre en la nota por faltante, así que una
--   nota por devolución registrada desde el modal tampoco lo apaga: para que lo haga, el modal tendría que mandar el
--   cierre también con ese motivo (cambio de pantalla, aparte). (2) La regla (a) NO mira el monto: una nota chica
--   atada a un cierre lo apaga entero (una devolución de S/ 59 atada a un cierre de S/ 590 borra el pendiente, y los
--   S/ 531 que faltan dejan de verse). Hoy solo se llega a eso llamando a la RPC a mano, porque el modal ata el cierre
--   solo en la nota por faltante; si la pantalla empieza a atar notas de otro motivo, solo puede hacerlo cuando la nota
--   cubre el esperado de ese cierre (costo + IGV, con MARGEN_NOTA). (3) Si algún día la nota por faltante deja de ser una
--   por comprobante, la regla (b) apagaría cierres que esa nota no cubre: hay que revisar esto el mismo día.
--
-- CÓMO SE PEGA EN PRODUCCIÓN. UNA sola parte, sola, en el SQL Editor, tal cual (ya trae `retail.`), a cualquier hora:
-- una guarda, dos `create or replace` con la misma firma y sus comentarios. Sin políticas, sin `drop trigger`, sin
-- `alter table` (ADR-0195). Se puede pegar dos veces. Da igual antes o después de 20260928200000. Si la guarda aborta,
-- no se toca nada: alguien cambió una de las dos después del 2026-09-28.
-- CÓMO SE VERIFICA DESPUÉS (solo lectura):
--   select p.proname, md5(regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g'))
--     from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname in ('compras_nota_pendiente', 'notas_credito_tablero');
--   Esperado: compras_nota_pendiente a80fc31534b8b63cedfe4732b7601e41 y notas_credito_tablero e9a4ec7b34d54f65ac5be101cb7aa1fd
--   (antes de pegar: fe0f9ae0f1b0… y 802b963051da…).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ── LA GUARDA ───────────────────────────────────────────────────────────────
-- Solo sigue si cada una tiene el cuerpo de `main`, el de producción del 2026-09-28 o el de esta migración (ya pegada):
-- huella del cuerpo sin comentarios ni espacios, igual que `deriva.sql`.
do $guarda$
declare
  r record;
  v_md5 text;
begin
  for r in
    select *
      from (values
        ('retail.compras_nota_pendiente(uuid[])', array['2c5b1a4a3873a5e5392ae2a08d5805f3', 'fe0f9ae0f1b0f987af947a8f3f620e60', 'a80fc31534b8b63cedfe4732b7601e41']),
        ('retail.notas_credito_tablero()',        array['da1c9e49eaeaddee12b8156a59694105', '802b963051dae7e16a631b8f8efcf6c2', 'e9a4ec7b34d54f65ac5be101cb7aa1fd'])
      ) as t(firma, aceptadas)  -- main, producción, esta migración
  loop
    select md5(regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g'))
      into v_md5
      from pg_proc p
     where p.oid = to_regprocedure(r.firma);
    if v_md5 is null then
      raise exception 'Falta % en esta base: pega antes 20260918220000 y 20260919211000.', r.firma;
    end if;
    if not v_md5 = any(r.aceptadas) then
      raise exception '% cambió después del 2026-09-28 (huella del cuerpo: %; se esperaba una de %). No se tocó nada. Si esta migración ya está en main, no la edites: lo que falte va en una migración nueva que parta de la definición real (pg_get_functiondef).',
        r.firma, v_md5, r.aceptadas;
    end if;
  end loop;
end
$guarda$;

-- ── compras_nota_pendiente (listas de Comprobantes y Por pagar) ──────────────
-- El cuerpo de producción, con la regla (b) sumada. `create or replace` conserva sus permisos (solo `authenticated`).
create or replace function retail.compras_nota_pendiente(p_compra_ids uuid[])
returns table(compra_id uuid, unidades_cerradas integer, monto_esperado numeric, resuelto boolean)
language sql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $function$
  select c.id,
         sum(k.cantidad)::integer,
         round(
           sum(k.cantidad * i.costo_unitario)
             * (1 + case when c.subtotal > 0 then c.igv / c.subtotal else 0 end),
           2
         ),
         (c.recibido_cantidad + c.cerrado_cantidad >= c.facturado_cantidad)
  from compras c
  join compra_items i on i.compra_id = c.id
  join compra_item_cierres k on k.compra_item_id = i.id
  where fn_puede_registrar_compras() and retail.fn_compra_es_de_mis_tiendas(c.id)
    and c.id = any(p_compra_ids)
    and c.estado = 'vigente'
    -- (a) el cierre no tiene ninguna nota atada, de ningún motivo...
    and not exists (
      select 1 from compra_notas_credito n
      where n.cierre_id = k.id
    )
    -- (b) ...y el comprobante todavía no tiene su nota por faltante (una sola, cubre todos sus cierres)
    and not exists (
      select 1 from compra_notas_credito n
      where n.compra_id = c.id and n.motivo = 'faltante'
    )
  group by c.id;
$function$;

comment on function retail.compras_nota_pendiente(uuid[]) is
  'Comprobantes vigentes con faltante cerrado que todavía espera su nota de crédito (ADR-0111, ADR-0252): un cierre deja de esperar si tiene una nota atada o si el comprobante ya tiene su nota por faltante. Unidades cerradas, monto esperado (cierres a su costo + IGV) y si ya está resuelto al 100 % (ya se puede registrar la nota). Para las listas de Comprobantes y Por pagar; solo líder, un integrante recibe vacío.';

-- ── notas_credito_tablero (/compras/notas-credito) ───────────────────────────
-- El cuerpo de producción, con la regla (b) sumada en la parte (b). Conserva sus permisos (solo `authenticated`).
create or replace function retail.notas_credito_tablero()
returns table(clase text, id uuid, compra_id uuid, documento text, proveedor_id uuid, proveedor_nombre text,
  serie_numero text, fecha date, monto numeric, aplicado numeric, a_favor numeric, igv numeric, motivo text,
  nota text, cierre_id uuid, compra_total numeric, compra_saldo numeric, compra_fecha_emision date,
  compra_estado text, unidades_cerradas integer, monto_esperado numeric, cerrado_en timestamptz,
  created_at timestamptz, resuelto boolean)
language sql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $function$
  -- CANDADO (ADR-0126): solo el líder ve dinero de Compras. Va primero: si falla, aborta antes de
  -- leer un solo peso.
  select retail.fn_exige_dinero_de_compras('las notas de crédito de proveedores');

  select t.clase, t.id, t.compra_id, t.documento, t.proveedor_id, t.proveedor_nombre,
         t.serie_numero, t.fecha, t.monto, t.aplicado, t.a_favor, t.igv, t.motivo, t.nota,
         t.cierre_id, t.compra_total, t.compra_saldo, t.compra_fecha_emision, t.compra_estado,
         t.unidades_cerradas, t.monto_esperado, t.cerrado_en, t.created_at, t.resuelto
  from (
    -- (a) las notas que ya existen
    select 'nota'::text as clase,
           n.id,
           n.compra_id,
           c.documento,
           c.proveedor_id,
           p.nombre as proveedor_nombre,
           n.serie_numero,
           n.fecha,
           n.monto,
           n.aplicado,
           (n.monto - n.aplicado)::numeric(12, 2) as a_favor,
           n.igv,
           n.motivo,
           n.nota,
           n.cierre_id,
           c.total as compra_total,
           c.saldo as compra_saldo,
           c.fecha_emision as compra_fecha_emision,
           c.estado as compra_estado,
           k.cantidad as unidades_cerradas,
           null::numeric as monto_esperado,
           k.created_at as cerrado_en,
           n.created_at,
           true as resuelto
    from retail.compra_notas_credito n
    join retail.compras c on c.id = n.compra_id
    join retail.proveedores p on p.id = c.proveedor_id
    left join retail.compra_item_cierres k on k.id = n.cierre_id
    where retail.fn_compra_es_de_mis_tiendas(n.compra_id)

    union all

    -- (b) los cierres que todavía esperan su nota: ninguna nota atada a ESE cierre (de cualquier motivo) y el
    -- comprobante sin su nota por faltante, que es una sola y cubre todos sus cierres
    select 'pendiente'::text,
           f.cierre_id,
           f.compra_id,
           f.documento,
           f.proveedor_id,
           f.proveedor_nombre,
           null::text,
           null::date,
           null::numeric,
           null::numeric,
           null::numeric,
           null::numeric,
           'faltante'::text,
           null::text,
           f.cierre_id,
           f.compra_total,
           f.compra_saldo,
           f.compra_fecha_emision,
           f.compra_estado,
           f.unidades_cerradas,
           f.monto_esperado,
           f.cerrado_en,
           f.cerrado_en,
           f.resuelto
    from (
      select c.id as compra_id,
             c.documento,
             c.proveedor_id,
             p.nombre as proveedor_nombre,
             c.total as compra_total,
             c.saldo as compra_saldo,
             c.fecha_emision as compra_fecha_emision,
             c.estado as compra_estado,
             sum(k.cantidad)::integer as unidades_cerradas,
             round(
               sum(k.cantidad * i.costo_unitario)
                 * (1 + case when c.subtotal > 0 then c.igv / c.subtotal else 0 end),
               2
             ) as monto_esperado,
             max(k.created_at) as cerrado_en,
             (array_agg(k.id order by k.created_at desc, k.id desc))[1] as cierre_id,
             (c.recibido_cantidad + c.cerrado_cantidad >= c.facturado_cantidad) as resuelto
      from retail.compras c
      join retail.proveedores p on p.id = c.proveedor_id
      join retail.compra_items i on i.compra_id = c.id
      join retail.compra_item_cierres k on k.compra_item_id = i.id
      where c.estado = 'vigente'
        and retail.fn_compra_es_de_mis_tiendas(c.id)
        and not exists (
          select 1 from retail.compra_notas_credito n
          where n.cierre_id = k.id
        )
        and not exists (
          select 1 from retail.compra_notas_credito n
          where n.compra_id = c.id and n.motivo = 'faltante'
        )
      group by c.id, p.nombre
    ) f
  ) t
  order by coalesce(t.fecha, t.cerrado_en::date) desc nulls last, t.created_at desc, t.id;
$function$;

comment on function retail.notas_credito_tablero() is
  'Tablero de /compras/notas-credito: una fila por nota registrada (clase=nota) y una por comprobante con cierres que todavía esperan su nota (clase=pendiente: sin nota atada al cierre y sin la nota por faltante del comprobante, ADR-0252). Solo líder (ADR-0126).';

-- ── VERIFICACIÓN FINAL ──────────────────────────────────────────────────────
do $verifica$
declare
  r record;
  v_md5 text;
begin
  for r in
    select *
      from (values
        ('retail.compras_nota_pendiente(uuid[])', 'a80fc31534b8b63cedfe4732b7601e41'),
        ('retail.notas_credito_tablero()',        'e9a4ec7b34d54f65ac5be101cb7aa1fd')
      ) as t(firma, md5_esperado)
  loop
    select md5(regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g'))
      into v_md5
      from pg_proc p
     where p.oid = to_regprocedure(r.firma);
    if v_md5 is distinct from r.md5_esperado then
      raise exception '% quedó con la huella % y se esperaba %', r.firma, coalesce(v_md5, '(no existe)'), r.md5_esperado;
    end if;
    if not has_function_privilege('authenticated', to_regprocedure(r.firma), 'execute')
       or has_function_privilege('anon', to_regprocedure(r.firma), 'execute') then
      raise exception '% perdió sus permisos (solo authenticated): la pantalla de Compras se quedaría sin datos', r.firma;
    end if;
  end loop;
end
$verifica$;
