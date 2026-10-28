-- ============================================================================
-- 20261001223000_club_saludo_v2_sin_baja.sql — CAYLA V2 · Club de clientas · el saludo, versión 2
-- ADR-0288 act. (j). Felipe, 2026-10-01: el mensaje de WhatsApp que la clienta envía a la tienda al unirse («Saludar a …»)
-- ya no termina con «Sé que me doy de baja escribiendo BAJA.». Lo que ella firma sigue diciendo cómo darse de baja: la casilla
-- de WhatsApp (`casilla_publicidad`) y la Política de privacidad (2.8); los avisos de la tienda siguen cerrando con «responde
-- BAJA» (candado `club_textos_aviso_con_baja`). Esto solo cambia el saludo.
--
-- POR QUÉ UNA VERSIÓN NUEVA Y NO UN UPDATE: `club_textos` no se edita ni se borra (los permisos citan cada versión que ella
-- leyó); el vigente de cada tipo es su versión más alta. `registrarse_en_el_club` compara la versión que la página leyó con la
-- vigente: quien tenga la página abierta justo al pegar esto ve «Los textos del club cambiaron mientras te registrabas: vuelve
-- a leerlos.» y se une al recargar. No se pierde nada.
--
-- Se pega SOLA en el SQL Editor, de una vez; se puede pegar dos veces (`on conflict do nothing`). Sin políticas ni triggers.
-- Verificación (1 fila, versión 2, sin «BAJA»):
--   select version, texto from retail.club_textos where tipo = 'saludo' order by version desc limit 1;
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

insert into retail.club_textos (tipo, version, texto, creado_por) values
  ('saludo', 2,
   $texto$Hola CAYLA, soy {nombre}. Me acabo de unir al Club CAYLA ({codigo}) y quiero recibir sus novedades y promociones por este WhatsApp.$texto$,
   null)
on conflict (tipo, version) do nothing;

reset lock_timeout;
notify pgrst, 'reload schema';
