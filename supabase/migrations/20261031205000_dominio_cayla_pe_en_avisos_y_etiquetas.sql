-- ============================================================================
-- 20261031205000_dominio_cayla_pe_en_avisos_y_etiquetas.sql — CAYLA V2 · la tienda web pasa de tienda.cayla.pe a cayla.pe (ADR-0595)
--
-- EL PROBLEMA. Felipe (2026-10-31) cerró la tienda de Shopify y la tienda web ocupa ahora el dominio principal, cayla.pe. Dos cosas que la
-- base guarda dicen todavía «tienda.cayla.pe»: el link que se imprime en las etiquetas (`empresas.web`) y el cierre de los avisos del Club
-- que sale por WhatsApp («Recuerda que en *tienda.cayla.pe* puedes ver tus puntos…»). La web, la tienda y los carteles se corrigen en el
-- código; esto es lo único que vive en datos.
--
-- QUÉ HACE
--   1. `empresas.web`: de 'tienda.cayla.pe' a 'cayla.pe'. Solo donde decía eso: si alguien puso otro link, no se toca.
--   2. `club_textos`: de cada aviso (`aviso_*`: el cierre y los mensajes) se mira la versión
--      vigente y, SOLO si nombra 'tienda.cayla.pe', se guarda una versión nueva con 'cayla.pe'. Cada aviso guarda el mensaje COMPLETO
--      (cuerpo + cierre + BAJA; ver 20261020144000), por eso se cambia en los cinco, no solo en el cierre.
--
-- DECIDÍ: las versiones viejas NO se editan. La tabla es de solo agregar (hay permisos que citan cada versión) y aquí además basta: el
-- vigente de cada tipo es su versión más alta. Un mensaje que un líder ya reescribió desde la pantalla y que no nombra el dominio viejo
-- queda intacto.
-- DESCARTÉ: tocar los textos legales del Club (`club`, `mensaje_personal`, `pagina_publicidad`, `terminos`): son los que la persona aceptó, y
-- cambiar su letra pide una versión nueva con revisión del abogado. Se listan en el ADR-0595 para que Felipe decida.
--
-- Idempotente (pegarla otra vez no hace nada: ya no queda 'tienda.cayla.pe' en la versión vigente). Sin políticas ni `alter`: se pega
-- entera en el SQL Editor sin riesgo de deadlock (CLAUDE.md «Políticas y deadlocks»).
-- ============================================================================
set search_path = retail, public, extensions;

-- 1. El link de las etiquetas.
update retail.empresas set web = 'cayla.pe' where web = 'tienda.cayla.pe';

-- 2. Los avisos del Club. Mismo candado que `guardar_mensajes_avisos`: si un líder guarda a la vez, uno espera al otro.
select pg_advisory_xact_lock(hashtext('retail.club_textos.avisos'));

insert into retail.club_textos (tipo, version, texto)
select v.tipo, v.version + 1, replace(v.texto, 'tienda.cayla.pe', 'cayla.pe')
  from (select distinct on (t.tipo) t.tipo, t.version, t.texto
          from retail.club_textos t
         where t.tipo like 'aviso\_%'
         order by t.tipo, t.version desc) v
 where position('tienda.cayla.pe' in v.texto) > 0;
