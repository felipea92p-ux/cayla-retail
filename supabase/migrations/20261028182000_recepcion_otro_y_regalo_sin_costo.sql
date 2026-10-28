-- ============================================================================
-- 20261028182000_recepcion_otro_y_regalo_sin_costo.sql — CAYLA V2 · ADR-0393 (act. 2026-10-28)
-- Al cerrar un envío: «Otro» como causa de lo que vino de más, y un regalo de fuera de la guía entra a S/ 0 sin pedir el costo.
--
-- EL PROBLEMA PRIMERO. Felipe cerró un envío donde llegaron 3 Aretes que no venían en el papel de la compra. Dos cosas no tenían sentido:
--   · Para decir «Regalo» tenía que escribir además un costo, aunque el proveedor no lo cobró: nadie sabe cuánto «costó» un regalo.
--   · Las únicas causas de lo de más eran Regalo, Se cobra aparte y Se arregla en la próxima compra: si pasó otra cosa (una muestra, un
--     cambio con el proveedor, un error de despacho), no había dónde decirlo y se elegía una causa falsa.
--
-- QUÉ CAMBIA (todo con reemplazos ANCLADOS sobre la definición viva: si el texto no es el esperado, se detiene sin cambiar nada)
--   1. `despacho_diferencias_causa` (el candado): un sobrante también puede ser `otro`.
--   2. `cerrar_conteo_envio`:
--        a. Acepta `otro` como `sobrante_causa` y lo EXIGE con su explicación: la `nota` de esa línea (hasta 300 letras, la misma que ya guarda
--           `despacho_diferencias.nota`) no puede venir vacía (`recepcion_sobrante_otro`). Sin columna nueva.
--        b. Una línea de FUERA DE LA GUÍA con causa `regalo` entra con costo 0 (obsequio): no se pide ni se lee el costo de la línea ni los de
--           sus prendas, aunque la pantalla los mande. El costo 0 es el mismo con el que la compra registra un obsequio. Una línea DE la guía que
--           sobra como regalo sigue entrando al costo de su orden: ese costo sí existe.
--   3. `fn_recepcion_entrar`: el revisor del costo atípico no mira lo de fuera de la guía que entra como regalo. Sin esto, el S/ 0 salía como
--      «sin costo» (`fn_costo_fuera_de_banda`), pedía confirmación y se lo negaba a quien no ve los costos de Compras: justo quien recibe.
--
-- LO QUE NO CAMBIA
--   · `recibir_despacho` (el formulario de la fase 4) y su lista de causas: sigue con las tres de siempre. `otro` solo se ofrece al cerrar.
--   · Los faltantes (`no_vino`, `se_perdio`, `otra_sede`): crean o no deuda con el proveedor («Nos debe»); una causa `otro` ahí tendría que
--     decidir si debe o no, y esa decisión no se tomó. Quedan como están.
--   · Un sobrante `otro` no crea deuda ni saldo a favor: solo deja la explicación en el historial del envío.
--
-- DESCARTÉ
--   · Dejar el costo vacío (`null`) en un regalo: `despacho_diferencias.costo_unitario` es NOT NULL, y una prenda sin costo no entra al
--     promedio y distorsiona el margen; 0 es exacto (Felipe lo eligió el 2026-10-28: «regalo entra con S/ 0, sin preguntar el costo»).
--   · Una columna `causa_otro` nueva: la nota por línea ya existe, ya llega al historial y ya tiene tope de 300 letras.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA parte, sin políticas ni `drop trigger` (ADR-0195): dos `alter table … constraint` sobre
-- `despacho_diferencias` (una tabla de lectura por funciones security definer, que la tienda no toca directo) y reemplazos anclados, con
-- `lock_timeout`. Idempotente. Sin `select … into` dentro de textos entre comillas (ADR-0288). El bloque final comprueba que quedó todo.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

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

-- ---------- 1. El candado de la causa ----------
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'retail.despacho_diferencias'::regclass and conname = 'despacho_diferencias_causa'
       and pg_get_constraintdef(oid) like '%''otro''%'
  ) then
    alter table retail.despacho_diferencias drop constraint if exists despacho_diferencias_causa;
    alter table retail.despacho_diferencias add constraint despacho_diferencias_causa check (
      (tipo = 'faltante' and causa in ('no_vino', 'se_perdio', 'otra_sede', 'devuelta'))
      or (tipo = 'sobrante' and causa in ('regalo', 'cobra_aparte', 'proxima_compra', 'reposicion_faltante', 'otro')));
  end if;
end;
$$;

-- ---------- 2. Cerrar el conteo ----------
-- (a) El costo de lo de fuera de la guía que se regala: 0, sin leer lo que mande la pantalla.
select pg_temp.reemplazar('retail.cerrar_conteo_envio(uuid,integer,jsonb,text,uuid)',
$v$    if v_k.despacho_item_id is not null then
      v_costo := coalesce(v_costo, v_k.precio_unitario);
    elsif exists$v$,
$n$    if v_k.despacho_item_id is null and nullif(btrim(coalesce(v_d ->> 'sobrante_causa', '')), '') = 'regalo' then
      -- ADR-0393 (2026-10-28): un regalo de fuera de la guía no costó nada: entra a S/ 0 (obsequio) sin pedir ni leer el costo.
      v_costo := 0;
    elsif v_k.despacho_item_id is not null then
      v_costo := coalesce(v_costo, v_k.precio_unitario);
    elsif exists$n$,
1);
-- (b) `otro` es una causa válida del sobrante…
select pg_temp.reemplazar('retail.cerrar_conteo_envio(uuid,integer,jsonb,text,uuid)',
$v$      if v_sobr not in ('regalo', 'cobra_aparte', 'proxima_compra', 'reposicion_faltante') then
        raise exception 'No se entiende qué pasa con lo de más de %: elige una opción', v_k.donde using hint = 'recepcion_sobrante_causa';
      end if;$v$,
$n$      if v_sobr not in ('regalo', 'cobra_aparte', 'proxima_compra', 'reposicion_faltante', 'otro') then
        raise exception 'No se entiende qué pasa con lo de más de %: elige una opción', v_k.donde using hint = 'recepcion_sobrante_causa';
      end if;$n$,
1);
-- …y viene con su explicación (la nota de la línea).
select pg_temp.reemplazar('retail.cerrar_conteo_envio(uuid,integer,jsonb,text,uuid)',
$v$      raise exception 'La nota de % es muy larga: hasta 300 letras', v_k.donde using hint = 'recepcion_nota';
    end if;
$v$,
$n$      raise exception 'La nota de % es muy larga: hasta 300 letras', v_k.donde using hint = 'recepcion_nota';
    end if;
    if v_sobr = 'otro' and v_nota_u is null then
      raise exception 'Cuenta qué fue lo de más de %: escribe en una línea qué pasó', v_k.donde using hint = 'recepcion_sobrante_otro';
    end if;
$n$,
1);
-- (c) Los costos propios de las prendas de un regalo no cuentan: todo entra a S/ 0.
select pg_temp.reemplazar('retail.cerrar_conteo_envio(uuid,integer,jsonb,text,uuid)',
$v$    v_cp := retail.fn_envio_costos_prendas(v_d, v_sep, v_k.donde);
$v$,
$n$    v_cp := retail.fn_envio_costos_prendas(v_d, v_sep, v_k.donde);
    if v_k.despacho_item_id is null and v_sobr = 'regalo' then
      v_cp := '{}'::jsonb; -- un regalo de fuera de la guía entra todo a S/ 0
    end if;
$n$,
1);

-- ---------- 3. La puerta única al stock: un regalo de fuera de la guía no es un costo atípico ----------
select pg_temp.reemplazar('retail.fn_recepcion_entrar(uuid,uuid,text,text,uuid,jsonb,uuid[],text)',
$v$   where (v ->> 'cantidad')::integer > 0
     and x.motivo is not null;$v$,
$n$   where (v ->> 'cantidad')::integer > 0
     and x.motivo is not null
     -- ADR-0393 (2026-10-28): lo de fuera de la guía que se regala entra a S/ 0 a propósito (obsequio): no hay costo que revisar.
     and not (u ->> 'tipo' = 'extra' and u ->> 'sobrante_causa' = 'regalo');$n$,
1);

-- ---------- 4. Comprobación ----------
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'retail.despacho_diferencias'::regclass and conname = 'despacho_diferencias_causa'
                    and pg_get_constraintdef(oid) like '%''otro''%') then
    raise exception 'despacho_diferencias_causa no acepta otro';
  end if;
  if position('recepcion_sobrante_otro' in pg_get_functiondef('retail.cerrar_conteo_envio(uuid,integer,jsonb,text,uuid)'::regprocedure)) = 0
     or position('un regalo de fuera de la guía no costó nada' in pg_get_functiondef('retail.cerrar_conteo_envio(uuid,integer,jsonb,text,uuid)'::regprocedure)) = 0 then
    raise exception 'cerrar_conteo_envio no quedó con otro y el regalo a S/ 0';
  end if;
  if position('de fuera de la guía que se regala entra a S/ 0' in pg_get_functiondef('retail.fn_recepcion_entrar(uuid,uuid,text,text,uuid,jsonb,uuid[],text)'::regprocedure)) = 0 then
    raise exception 'fn_recepcion_entrar no quedó sin revisar el costo de un regalo';
  end if;
end;
$$;

reset lock_timeout;
