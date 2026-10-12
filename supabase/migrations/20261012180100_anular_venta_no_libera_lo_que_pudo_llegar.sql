-- ============================================================================
-- 20261012180100_anular_venta_no_libera_lo_que_pudo_llegar.sql — CAYLA V2 (ADR-0386, opción A, Felipe 2026-10-12)
--
-- EL PROBLEMA. `anular_venta` liberaba (`no_emitido`) también el comprobante que ya estaba en la cola de reintento
-- (`pendiente_reintento`, agregado en 20260922151500). Esa decisión supuso que lo que está en la cola «nunca se
-- transmitió con éxito», y el ADR-0378 mostró que no es así: cuando Lucode tarda más de 15 s el ERP anota «no
-- respondió», pero Lucode sí emite. El 2026-10-12, de 52 comprobantes en la cola de producción, 41 ya estaban en SUNAT.
-- Anular una de esas ventas dejaba una venta declarada ante SUNAT y devuelta a quien compró, sin nota de crédito, con
-- el número dado por libre en el ERP. «Liberar sin espera» (`marcar_comprobante_no_emitido`) ya solo libera un
-- `pendiente`: las dos puertas decían cosas distintas sobre lo mismo.
--
-- LA REGLA (opción A, elegida por Felipe): un comprobante que ya intentó salir a SUNAT pudo haber llegado, así que su
-- venta no se anula. El mensaje lo nombra y dice qué hacer: en Comprobantes ▸ Por enviar, «Reintentar ahora». Con el
-- ADR-0378 eso termina en `aceptado` tanto si ya estaba en SUNAT como si no (en ese caso lo envía); desde ahí, la
-- devolución va por Devolución, con su nota de crédito. Lo que nunca intentó salir (`pendiente` sin intentos, o la
-- nota de venta `interna`) se sigue liberando como siempre.
--
-- QUÉ CAMBIA
--   1. `anular_venta`, por REEMPLAZO ANCLADO (falla sin tocar nada si la función viva no es la revisada; ningún texto
--      de ancla lleva la palabra con que se guarda una consulta en una variable, ADR-0288; y el texto que se inserta no
--      lleva comentarios: si una vía de pegado los quita, volver a pegarlo por otra vía no debe insertar la guarda dos veces):
--        · una guarda nueva, justo después de la de «enviado o aceptado»: si la venta tiene un comprobante pendiente
--          o en la cola con algún intento, se niega;
--        · la liberación ya no incluye `pendiente_reintento`.
--   2. El disparador `comprobantes_estado_no_retrocede` (20261012180000) lo hace cumplir para cualquier escritor:
--      `no_emitido` solo se alcanza desde `pendiente` o `interna` y con cero intentos.
--
-- QUÉ NO CAMBIA: las demás guardas de `anular_venta` (módulo, motivo, caja abierta, mismo día, sin cambios ni
-- devoluciones, una línea cada vez, stock de vuelta), un `rechazado` (sigue sin tocarse, ADR-0093) ni la pantalla: ya
-- muestra el mensaje de la base tal cual (`traducirError`, P0001).
--
-- SE ROMPE SI Lucode está caído cuando la tienda quiere anular una venta cuya boleta ya intentó salir: no se puede
-- anular hasta que «Reintentar ahora» la resuelva. Felipe lo aceptó al elegir la opción A (es raro y anular es del mismo
-- día). Lo cubren `pnpm pruebas:venta-contrato-ampliado` y `pnpm pruebas:sunat-estado-no-retrocede`.
--
-- PRODUCCIÓN. Se pega DESPUÉS de 20261012180000 (si el disparador no existe, se detiene). Una sola parte, sin
-- políticas ni `drop trigger`, re-ejecutable. Huella ANTES de `anular_venta` (md5 de `pg_get_functiondef`):
-- producción 7eec68a5d7d9aa95ef21c8a045a2ad8e, local a594a47b3073ad0d01eb564d22230ced (solo difieren en comentarios
-- del cuerpo); las dos tienen exactamente una vez cada ancla.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'retail.comprobantes'::regclass and tgname = 'comprobantes_estado_no_retrocede') then
    raise exception 'Falta el disparador comprobantes_estado_no_retrocede: pega primero 20261012180000_comprobante_aceptado_no_retrocede.sql';
  end if;
end;
$$;

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

-- ---------- 1a. La liberación ya no alcanza a lo que está en la cola ----------
select pg_temp.reemplazar('retail.anular_venta(uuid, text, jsonb)',
  $v$where venta_id = p_venta_id and estado in ('pendiente', 'pendiente_reintento', 'interna');$v$,
  $v$where venta_id = p_venta_id and estado in ('pendiente', 'interna');$v$,
  1);

-- ---------- 1b. Lo que ya intentó salir frena la anulación, con su número ----------
select pg_temp.reemplazar('retail.anular_venta(uuid, text, jsonb)',
  $v$raise exception 'Esta venta ya tiene un comprobante enviado o aceptado por SUNAT — usa Cambio o Devolución en su lugar';$v$,
  $v$raise exception 'Esta venta ya tiene un comprobante enviado o aceptado por SUNAT — usa Cambio o Devolución en su lugar';
  end if;
  if exists (
    select 1 from comprobantes
     where venta_id = p_venta_id and estado in ('pendiente', 'pendiente_reintento') and intentos_transmision > 0
  ) then
    raise exception 'El comprobante % de esta venta ya se intentó enviar a SUNAT y pudo haber llegado, así que la venta no se anula. En Comprobantes ▸ Por enviar pulsa «Reintentar ahora»; cuando figure aceptado, usa Devolución (sale con su nota de crédito).',
      (select string_agg(c.serie || '-' || c.numero, ', ' order by c.serie, c.numero) from comprobantes c
        where c.venta_id = p_venta_id and c.estado in ('pendiente', 'pendiente_reintento') and c.intentos_transmision > 0);$v$,
  1);

-- ---------- 2. El disparador: no_emitido solo para lo que nunca intentó salir ----------
create or replace function retail.fn_comprobante_estado_no_retrocede()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  if (old.estado in ('pendiente', 'pendiente_reintento')
        and new.estado in ('pendiente_reintento', 'enviado', 'aceptado', 'rechazado'))
     -- ADR-0386 (opción A): solo se libera lo que nunca intentó salir a SUNAT.
     or (old.estado in ('pendiente', 'interna') and new.estado = 'no_emitido' and old.intentos_transmision = 0)
     or (old.estado in ('enviado', 'rechazado') and new.estado in ('enviado', 'aceptado', 'rechazado'))
     or (old.estado = 'aceptado' and new.estado = 'anulado')
  then
    return new;
  end if;
  raise exception 'El comprobante %-% está «%» y no puede pasar a «%»: lo que SUNAT ya respondió, o lo que se liberó, no se deshace desde aquí',
      old.serie, old.numero, old.estado, new.estado
    using errcode = 'check_violation',
          hint = 'Para dar de baja uno aceptado está «Anular» en Comprobantes (ante SUNAT). Lo demás se revisa en el panel de Lucode.';
end;
$$;
