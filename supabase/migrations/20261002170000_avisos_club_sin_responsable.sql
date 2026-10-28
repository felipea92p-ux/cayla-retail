-- ============================================================================
-- 20261002170000_avisos_club_sin_responsable.sql — CAYLA V2 · Avisos del club sin elegir quién envía
-- Felipe, 2026-10-02: en Clientes ▸ Avisos no hace falta elegir «Quién envía». Se suman tres acciones a la lista de las que
-- se guardan sin el combo «Responsable» (`retail.acciones_sin_responsable`, 20260929230000; espejo en
-- `apps/web/lib/responsable-omitido.ts`):
--   · aviso_club_enviar    → registrar_aviso_enviado («Enviar»)
--   · aviso_club_deshacer  → deshacer_aviso_enviado («Deshacer», dentro de 10 minutos)
--   · aviso_club_baja      → registrar_baja_whatsapp («Pidió BAJA»)
-- Con la cuenta de una PERSONA, cada una firma a su nombre (`fn_actor_persona_id` respeta el encabezado
-- `x-responsable-omitido` porque la clave está en la lista). Con una TERMINAL (cuenta de la tienda, sin persona) la web
-- sigue pidiendo quién envía: `club_avisos_enviados.enviado_por` es obligatorio y la función rechaza un actor vacío, igual
-- que «Apartar prenda».
--
-- No cambia ninguna función: el único punto de decisión es `fn_actor_persona_id`. Una sola parte; solo inserta en una
-- tabla que lee una función `security definer` (no la usa la tienda directamente). Se puede pegar dos veces.
-- PARA VOLVER: `delete from retail.acciones_sin_responsable where clave like 'aviso_club_%';` (la web, en una terminal,
-- ya pide quién envía; con la cuenta de una persona habría que revertir también el commit de la pantalla).
-- Verificación: select count(*) from retail.acciones_sin_responsable where clave like 'aviso_club_%';   → 3
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

insert into retail.acciones_sin_responsable (clave, descripcion) values
  ('aviso_club_enviar', 'Anotar un aviso del club como enviado por WhatsApp'),
  ('aviso_club_deshacer', 'Deshacer un aviso del club anotado como enviado'),
  ('aviso_club_baja', 'Registrar que un cliente pidió BAJA de los mensajes del club')
on conflict (clave) do update set descripcion = excluded.descripcion;

reset lock_timeout;
