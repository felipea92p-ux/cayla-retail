-- ============================================================================
-- 20261128165000 — Compras: el mismo comprobante del mismo proveedor vive una sola vez, por su clave (auditoría 2026-11-28, N.º 10 y N.º 31).
--
-- EL PROBLEMA PRIMERO. 20261128164000 hace que los controles `papel_repetido` comparen por `fn_numero_comprobante_clave` («F777-000123» y
--   «F777-123» son el mismo papel), pero un control que mira antes de escribir no alcanza: dos personas que anotan a la vez el mismo papel
--   pasan las dos (N.º 31), y Gastos, Activos y el registro de facturas del escritorio todavía comparan el texto tal cual. Lo único que la
--   base no deja romper es un índice único.
--
-- LO QUE HACE.
--   1. Busca pares repetidos por la clave, en lo vigente, en las dos tablas. Si hay, ABORTA con cuántos y cuáles (proveedor y documentos):
--      no crea nada a medias y no decide por nadie cuál de los dos papeles es el bueno. Compras los resuelve (anula el repetido o corrige
--      su número) y se vuelve a pegar.
--   2. `compras`: `compras_comprobante_clave_vigente_unico` (proveedor, clave) en las vigentes REEMPLAZA a `compras_papel_vigente_unico`
--      (proveedor, serie, numero), que nació en 20261012205000. El nuevo es más estricto (todo par que el viejo frenaba, el nuevo también
--      lo frena), así que el viejo sobra. Sin el tipo, como el viejo: la serie ya dice si es factura (F…) o boleta (B…), y agregarlo lo
--      aflojaría. Nadie atrapa el viejo por su nombre (las funciones solo miran `compras_token_cliente_key`).
--   3. `compra_papeles`: `compra_papeles_comprobante_unico` (proveedor, tipo, clave) en lo que no está anulado y tiene número: la misma
--      regla que el control de `registrar_compra_rapida` (compara el tipo y no cuenta lo anulado). Es lo que cierra N.º 31 aunque el
--      candado por comprobante de 164000 no estuviera.
--
-- DECIDÍ: índices únicos parciales sobre la clave, no columnas nuevas: el papel sigue diciendo lo que dice el papel y la regla vive en
--   la función. Y SIN `concurrently`: el SQL Editor pega todo en una transacción y `create index concurrently` no corre dentro de una.
--   Son tablas chicas (cientos o pocos miles de filas): el índice se arma en milisegundos con el candado de siempre, y `lock_timeout`
--   corta en 3 s si alguien tiene la tabla tomada, sin dejar nada a medias.
-- DESCARTÉ: (a) un candado por comprobante solamente (sin índice): no frena a Gastos ni al escritorio, y un candado se olvida en la
--   próxima función que inserte; (b) arreglar los repetidos desde aquí (anular el más nuevo): toca dinero y deuda, eso lo decide Compras.
-- SE ROMPE SI: alguien cambia `fn_numero_comprobante_clave` sin `reindex` de estos dos índices (ver su comentario). Gastos, Activos y
--   `registrar_compra` del escritorio todavía tienen su control previo con el texto tal cual: un repetido con ceros ya no entra, pero lo
--   frena este índice con el mensaje de Postgres en vez del suyo (`registrar_compra` sí lo traduce: «La factura … ya está registrada»).
--
-- CÓMO SE PEGA EN PRODUCCIÓN (solo con el OK de Felipe). DESPUÉS de 20261128164000 (la función de la clave). Una sola parte, re-pegable:
--   índices en tablas en uso, sin políticas ni disparadores (regla «Políticas y deadlocks»). Si aborta por repetidos, no quedó nada escrito.
-- Prueba: `pnpm pruebas:compras-simple-historial` (los índices frenan, y esta migración aborta con repetidos).
-- ============================================================================
set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- ---------- 1. Antes de crear nada: ¿ya hay comprobantes repetidos? ----------
do $$
declare
  v_n integer;
  v_lista text;
begin
  if to_regprocedure('retail.fn_numero_comprobante_clave(text,text)') is null then
    raise exception '20261128165000: falta fn_numero_comprobante_clave. Pega primero 20261128164000.';
  end if;

  v_n := (select count(*) from (
            select 1 from retail.compras c where c.estado = 'vigente'
             group by c.proveedor_id, retail.fn_numero_comprobante_clave(c.serie, c.numero)
            having count(*) > 1) r);
  if v_n > 0 then
    v_lista := (select string_agg(r.txt, '; ' order by r.txt) from (
                  select coalesce(pr.nombre, c.proveedor_id::text) || ': ' || string_agg(c.documento || ' (' || c.id || ')', ', ' order by c.created_at) as txt
                    from retail.compras c left join retail.proveedores pr on pr.id = c.proveedor_id
                   where c.estado = 'vigente'
                   group by c.proveedor_id, pr.nombre, retail.fn_numero_comprobante_clave(c.serie, c.numero)
                  having count(*) > 1
                   limit 20) r);
    raise exception '20261128165000: no se creó nada. Hay % comprobantes repetidos en compras vigentes (mismo proveedor, mismo número sin ceros): %. Compras anula el repetido o corrige su número y se vuelve a pegar.',
      v_n, v_lista;
  end if;

  v_n := (select count(*) from (
            select 1 from retail.compra_papeles x where x.estado <> 'anulado' and x.numero is not null
             group by x.proveedor_id, x.tipo, retail.fn_numero_comprobante_clave(x.serie, x.numero)
            having count(*) > 1) r);
  if v_n > 0 then
    v_lista := (select string_agg(r.txt, '; ' order by r.txt) from (
                  select coalesce(pr.nombre, x.proveedor_id::text) || ' ' || x.tipo || ': '
                         || string_agg(coalesce(x.serie || '-', '') || x.numero || ' (' || x.id || ', ' || x.estado || ')', ', ' order by x.created_at) as txt
                    from retail.compra_papeles x left join retail.proveedores pr on pr.id = x.proveedor_id
                   where x.estado <> 'anulado' and x.numero is not null
                   group by x.proveedor_id, pr.nombre, x.tipo, retail.fn_numero_comprobante_clave(x.serie, x.numero)
                  having count(*) > 1
                   limit 20) r);
    raise exception '20261128165000: no se creó nada. Hay % papeles repetidos en «Mis compras» sin anular (mismo proveedor, tipo y número sin ceros): %. Compras anula el repetido y se vuelve a pegar.',
      v_n, v_lista;
  end if;
end $$;

-- ---------- 2. compras: el índice por la clave reemplaza al del texto tal cual ----------
create unique index if not exists compras_comprobante_clave_vigente_unico
  on retail.compras (proveedor_id, retail.fn_numero_comprobante_clave(serie, numero))
  where estado = 'vigente';
comment on index retail.compras_comprobante_clave_vigente_unico is
  'Auditoría 2026-11-28 (N.º 10): el mismo comprobante del mismo proveedor, vigente una sola vez, por su clave (serie en mayúsculas, número '
  'sin ceros a la izquierda: fn_numero_comprobante_clave). Reemplaza a compras_papel_vigente_unico (serie y número tal cual).';
drop index if exists retail.compras_papel_vigente_unico;

-- ---------- 3. compra_papeles: el mismo papel, una vez ----------
create unique index if not exists compra_papeles_comprobante_unico
  on retail.compra_papeles (proveedor_id, tipo, retail.fn_numero_comprobante_clave(serie, numero))
  where estado <> 'anulado' and numero is not null;
comment on index retail.compra_papeles_comprobante_unico is
  'Auditoría 2026-11-28 (N.º 10 y N.º 31): un papel de «Mis compras» sin anular, una sola vez por proveedor, tipo y clave '
  '(fn_numero_comprobante_clave): dos personas que anotan a la vez el mismo papel no pasan las dos.';

-- ---------- Validación ----------
do $$
begin
  if to_regclass('retail.compras_comprobante_clave_vigente_unico') is null or to_regclass('retail.compra_papeles_comprobante_unico') is null then
    raise exception '20261128165000: no quedaron los dos índices por la clave';
  end if;
  if to_regclass('retail.compras_papel_vigente_unico') is not null then
    raise exception '20261128165000: compras_papel_vigente_unico sigue en pie';
  end if;
end $$;

reset lock_timeout;

select '20261128165000: QUEDÓ BIEN: compras y compra_papeles no aceptan dos veces el mismo comprobante, aunque se escriba con ceros' as resultado;
