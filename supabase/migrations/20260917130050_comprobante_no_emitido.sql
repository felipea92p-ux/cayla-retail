-- ============================================================================
-- 20260917130050_comprobante_no_emitido.sql — CAYLA V2
--
-- Libera un comprobante que reservó correlativo SUNAT pero nunca se
-- transmitió (`estado = 'pendiente'`, `enviado_at is null`) — decisión de
-- producto de Felipe: "Liberar sin espera" (sin el plazo de 48h que se
-- barajó y se descartó). El número reservado NUNCA se reutiliza — un hueco
-- de numeración es normal y legal en facturación electrónica peruana; lo
-- único que cambia es que la fila deja de aparecer como pendiente de
-- acción. Como nunca se transmitió, esta migración no habla con
-- Lucode/SUNAT en absoluto (a diferencia de `anular_comprobante`, que sí
-- transmite una baja real). Razonamiento completo en
-- docs/adr/0077-liberar-comprobante-pendiente-sin-transmitir.md.
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- rastro auditable — nunca un DELETE, mismo patrón que la
-- anulación (motivo_anulacion / anulado_por / anulado_at) ----------
alter table retail.comprobantes
  add column motivo_no_emitido text,
  add column marcado_no_emitido_por uuid references public.personas(id),
  add column marcado_no_emitido_at timestamptz;

-- ---------- el estado nuevo entra al candado que ya limitaba los valores
-- posibles de `estado` — nunca fue "text libre sin CHECK", como sí lo es
-- hoy en producción por una razón histórica aparte (ver ADR-0077) ----------
alter table retail.comprobantes drop constraint comprobantes_estado_check;
alter table retail.comprobantes add constraint comprobantes_estado_check
  check (estado in ('pendiente', 'enviado', 'aceptado', 'rechazado', 'anulado', 'no_emitido'));

-- `comprobantes_transmitido_tiene_entorno` (0010) exigía `entorno_transmision`
-- para cualquier estado que no fuera 'pendiente' — un 'no_emitido' nunca lo
-- tiene tampoco (nunca se transmitió), así que entra a la misma excepción.
-- Recreada NOT VALID por la misma razón que la original (0010, comentario de
-- 0040): ya existe en producción una boleta transmitida antes de que la
-- columna `entorno_transmision` existiera, con `entorno_transmision is
-- null` y `estado <> 'pendiente'` — un DROP+ADD validado a secas rompería
-- el día que esto se pegue allá. Sigue exigiéndose para toda fila nueva o
-- actualizada de acá en adelante (NOT VALID no exime updates, solo el
-- historial ya escrito).
alter table retail.comprobantes drop constraint comprobantes_transmitido_tiene_entorno;
alter table retail.comprobantes add constraint comprobantes_transmitido_tiene_entorno
  check (estado in ('pendiente', 'no_emitido') or entorno_transmision is not null) not valid;

-- Estado imposible eliminado por diseño (principio 2): un 'no_emitido' sin
-- motivo no puede existir en el esquema, igual que un 'anulado' sin
-- `motivo_anulacion`. Sin filas existentes en este estado todavía —
-- ninguna migración anterior pudo haber escrito 'no_emitido' — así que se
-- valida de una sola vez, sin NOT VALID.
alter table retail.comprobantes add constraint comprobantes_no_emitido_tiene_motivo
  check (estado <> 'no_emitido' or motivo_no_emitido is not null);

-- ---------- la RPC ----------
-- Mismo nivel de guardas que `anular_comprobante` (mismo archivo,
-- 0010_facturacion.sql): security definer, exige líder, exige motivo — es
-- una decisión irreversible con implicancia de compliance, igual que
-- anular. Se diferencia en UNA sola cosa a propósito: solo acepta
-- `estado = 'pendiente'`. Un 'rechazado' YA fue transmitido (SUNAT
-- respondió) y su único camino sigue siendo reintentar "Transmitir" con el
-- mismo número — mezclar un segundo camino ahí no es parte de esta
-- decisión de Felipe ("nunca transmitió, no hay nada que avisarle a
-- SUNAT"); ver ADR-0077 para el razonamiento completo.
create function retail.marcar_comprobante_no_emitido(p_comprobante_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare v_comp comprobantes%rowtype; v_persona uuid;
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder puede liberar un comprobante no emitido — es una decisión irreversible con implicancia de compliance';
  end if;
  select * into v_comp from comprobantes where id = p_comprobante_id;
  if not found then
    raise exception 'El comprobante % no existe', p_comprobante_id;
  end if;
  if v_comp.estado <> 'pendiente' then
    raise exception 'Solo se puede liberar un comprobante pendiente que nunca se transmitió a SUNAT (este está %)', v_comp.estado;
  end if;
  if p_motivo is null or length(trim(p_motivo)) < 3 then
    raise exception 'El motivo es obligatorio para liberar un comprobante como no emitido';
  end if;
  select id into v_persona from public.personas where auth_user_id = auth.uid();
  update comprobantes set
    estado = 'no_emitido',
    motivo_no_emitido = p_motivo,
    marcado_no_emitido_por = v_persona,
    marcado_no_emitido_at = now()
  where id = p_comprobante_id;
end;
$$;

grant execute on function retail.marcar_comprobante_no_emitido to authenticated;
