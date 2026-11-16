-- ============================================================================
-- 20261116230000_recepcion_otro_tambien_si_falta.sql — CAYLA V2 · ADR-0393 (act. 2026-11-16)
-- Al cerrar un envío: «Otro» también para lo que FALTA, con su explicación obligatoria. Sin deuda: lo asume CAYLA.
--
-- EL PROBLEMA PRIMERO. Al cerrar un envío con prendas de menos, las únicas respuestas eran «No vino», «Se perdió en el camino» y «Llegó a otra
-- sede». Si pasó otra cosa (una caja abierta, un conteo del proveedor que no se entiende), no había dónde decirlo y se elegía una causa falsa. Lo
-- que sobra ya tenía «Otro» desde el 2026-10-28 (20261028182000), pero lo que falta no: esa migración lo dejó fuera a propósito porque «una
-- causa `otro` ahí tendría que decidir si debe o no, y esa decisión no se tomó».
--
-- LA DECISIÓN (Felipe, 2026-11-16): un faltante «Otro» NO es deuda del proveedor. Lo asume CAYLA, igual que «Se perdió en el camino»: al proveedor
-- se le paga completo y la explicación queda escrita en el envío. Por eso esta migración no toca «Nos debe»: la deuda solo nace de `no_vino` y
-- `devuelta` (`fn_proveedor_nos_debe`, `fn_recepcion_cerrar`, los chequeos del cierre de mes), y `otro` no está ahí.
--
-- QUÉ CAMBIA (con reemplazos ANCLADOS sobre la definición viva: si el texto no es el esperado, se detiene sin cambiar nada)
--   1. `despacho_diferencias_causa` (el candado): un faltante también puede ser `otro`.
--   2. `cerrar_conteo_envio`: acepta `otro` como `faltante_causa` y lo EXIGE con su explicación: la `nota` de esa línea (hasta 300 letras) no puede
--      venir vacía (`recepcion_faltante_otro`). La nota ya la guardaba `fn_recepcion_entrar` en el faltante: no cambia.
--   3. El comentario de la tabla, al día con las causas que de verdad acepta.
--
-- LO QUE NO CAMBIA
--   · `recibir_despacho` (el formulario de la fase 4): sigue con sus tres causas. `otro` solo se ofrece al cerrar contando (ADR-0393).
--   · «Nos debe», la reposición y el cierre de mes: un faltante `otro` no crea deuda ni saldo, como `se_perdio`.
--
-- DESCARTÉ
--   · Que un faltante «Otro» quede como deuda hasta que Compras lo revise: Felipe eligió que lo asuma CAYLA (no reclamarle al proveedor algo que
--     quizás no fue suyo). Si después se decide lo contrario, es sumar `otro` a la lista de `no_vino` en las funciones de «Nos debe».
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe, ANTES de fusionar el PR #1906: la pantalla nueva ofrece «Otro» en lo que falta y, sin esto,
-- cerrar con esa respuesta fallaría). UNA parte, sin políticas ni `drop trigger` (ADR-0195): un `alter table … constraint` sobre
-- `despacho_diferencias` (que solo se toca por funciones security definer) y un reemplazo anclado, con `lock_timeout`. Idempotente. Sin
-- `select … into` dentro de textos entre comillas (ADR-0288). El bloque final comprueba que quedó todo.
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

-- ---------- 1. El candado de la causa: un faltante también puede ser «otro» ----------
-- Se suelta y se vuelve a poner con la lista nueva (más ancha: toda fila de hoy la cumple). NOT VALID + VALIDATE: el candado corto es el del
-- cambio de la definición; la revisión de las filas no frena a quien lee.
alter table retail.despacho_diferencias drop constraint if exists despacho_diferencias_causa;
alter table retail.despacho_diferencias add constraint despacho_diferencias_causa check (
  (tipo = 'faltante' and causa in ('no_vino', 'se_perdio', 'otra_sede', 'devuelta', 'otro'))
  or (tipo = 'sobrante' and causa in ('regalo', 'cobra_aparte', 'proxima_compra', 'reposicion_faltante', 'otro'))) not valid;
alter table retail.despacho_diferencias validate constraint despacho_diferencias_causa;

-- ---------- 2. Cerrar el conteo: acepta «otro» en lo que falta y pide su explicación ----------
select pg_temp.reemplazar('retail.cerrar_conteo_envio(uuid,integer,jsonb,text,uuid)',
$v$if v_falt not in ('no_vino', 'se_perdio', 'otra_sede') then$v$,
$n$if v_falt not in ('no_vino', 'se_perdio', 'otra_sede', 'otro') then$n$,
1);
select pg_temp.reemplazar('retail.cerrar_conteo_envio(uuid,integer,jsonb,text,uuid)',
$v$v_k.donde using hint = 'recepcion_sobrante_otro';
    end if;$v$,
$n$v_k.donde using hint = 'recepcion_sobrante_otro';
    end if;
    -- ADR-0393 (2026-11-16, Felipe): lo que falta también puede ser «Otro», y se explica en una línea. No es deuda: lo asume CAYLA.
    if v_falt = 'otro' and v_nota_u is null then
      raise exception 'Cuenta qué pasó con lo que falta de %: escribe en una línea qué pasó', v_k.donde using hint = 'recepcion_faltante_otro';
    end if;$n$,
1);

-- ---------- 3. El comentario de la tabla, al día ----------
comment on table retail.despacho_diferencias is
  'ADR-0362 (fases 4 y 5) y ADR-0393: lo que faltó o sobró al recibir un envío, con su causa (faltante: no_vino, se_perdio, otra_sede, devuelta, otro; sobrante: regalo, cobra_aparte, proxima_compra, reposicion_faltante, otro). Un faltante no_vino o devuelta es una deuda del proveedor: lo resuelto va en proveedor_deuda_resoluciones; se_perdio, otra_sede y otro no lo son. Con causa otro, la nota explica qué pasó. Solo se agrega, mientras el envío está abierto. Solo se lee y escribe por funciones (RLS sin políticas).';

-- ---------- 4. Comprobación ----------
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'retail.despacho_diferencias'::regclass and conname = 'despacho_diferencias_causa'
                    and convalidated
                    and pg_get_constraintdef(oid) ~ $r$'faltante'::text\) AND \(causa = ANY \(ARRAY\[[^]]*'otro'::text$r$) then
    raise exception 'despacho_diferencias_causa no acepta otro en lo que falta';
  end if;
  if position($t$'otra_sede', 'otro') then$t$ in pg_get_functiondef('retail.cerrar_conteo_envio(uuid,integer,jsonb,text,uuid)'::regprocedure)) = 0
     or position('recepcion_faltante_otro' in pg_get_functiondef('retail.cerrar_conteo_envio(uuid,integer,jsonb,text,uuid)'::regprocedure)) = 0 then
    raise exception 'cerrar_conteo_envio no quedó aceptando otro en lo que falta con su explicación';
  end if;
end;
$$;

reset lock_timeout;
