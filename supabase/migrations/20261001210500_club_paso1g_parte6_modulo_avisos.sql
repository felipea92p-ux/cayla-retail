-- ============================================================================
-- 20261001210500_club_paso1g_parte6_modulo_avisos.sql — CAYLA V2 · Club de clientas · tanda 1g · PARTE 6 de 8
-- ADR-0288 (G-8 y «Contrato de la tanda 1g») y ADR-0161 («Módulos y roles»): el módulo NUEVO «Avisos del club»
-- (`avisos_club`), la lista de Clientas ▸ Avisos donde la encargada manda por WhatsApp los mensajes del club a las socias
-- con publicidad. Una migración propia, como pide CLAUDE.md: nace SIN rol (ninguna fila en `rol_modulos`): solo lo ve
-- el líder hasta que él lo da en Colaboradores ▸ Roles y accesos. Delegable: sus funciones (PARTE 8:
-- `fn_club_avisos_pendientes`, `registrar_aviso_enviado` y `deshacer_aviso_enviado`) piden este módulo, no al líder.
-- Grupo «Ventas», como Clientas (el menú lo cuelga de Clientas); orden 75, libre entre Clientas (70) y Existencias (80):
-- verificado en todas las migraciones del repo, de main, de las ramas remotas y de los worktrees el 2026-10-01.
-- Se pega SEXTA, sola en el SQL Editor; se puede pegar dos veces (`on conflict do nothing`: no pisa lo que el líder ajuste).
-- Insertar en `modulos` no toma en exclusiva ninguna tabla en uso (las lecturas de `fn_ve_modulo` siguen).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

insert into retail.modulos (clave, grupo, nombre, incluye, orden, solo_lider, delegable) values
  ('avisos_club', 'Ventas', 'Avisos del club', 'Ver los mensajes del club por mandar a las socias con WhatsApp de su tienda (cumpleaños, aniversario, novedades y rebajas en su talla), enviarlos por WhatsApp Web, deshacer un envío y anotar la BAJA', 75, false, true)
on conflict (clave) do nothing;

reset lock_timeout;
notify pgrst, 'reload schema';
