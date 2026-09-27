-- ============================================================================
-- 20260925210000 — Las fotos de perfil salen de Dynamic (Felipe, 2026-09-25: «jala todas las fotos del dynamic»)
--
-- EL PROBLEMA PRIMERO
--   Dynamic ya tiene la foto de cada integrante (`public.personas.foto_url`, bucket público `fotos-perfil`: 18 personas
--   con foto al 2026-09-25, 17 de ellas entre los 25 colaboradores de retail). Retail solo la leía en «Mi perfil», y mal: Dynamic guarda la RUTA
--   dentro del bucket (`perfil/<persona>/<hora>.jpg`), no una URL, y la pantalla la ponía tal cual en la imagen — el
--   navegador la buscaba en el dominio de retail y mostraba el ícono de imagen rota. En el lateral, el combo
--   «Responsable» y Colaboradores ni siquiera se pedía: solo iniciales.
--
-- LA REGLA
--   Retail NO copia las fotos (serían dos archivos por persona que se desincronizan en cuanto alguien cambia la suya en
--   Dynamic). Pide la RUTA y la web arma la URL pública del mismo bucket (`apps/web/lib/foto-perfil.ts`). Una sola
--   función para todas las pantallas, por lista de personas — como `fn_nombres_personas` —, en vez de sumarle una columna
--   a las siete funciones que devuelven personas (cambiarles el tipo de retorno obliga a `drop` + `create` de cada una y a
--   copiar su cuerpo vigente: el riesgo de devolver una función a una versión vieja sin que nada avise).
--
-- A QUIÉN ALCANZA
--   Solo a personas que son colaboradores de retail (cualquier estado): una cuenta de retail no descubre por aquí la foto
--   de alguien de Dynamic que nunca entró a retail. Sin foto = sin fila (la web pinta las iniciales).
--
-- PRODUCCIÓN: no toma ningún candado de `auth`/`storage` (no hay políticas ni `drop trigger`); se pega de una vez con el
-- prefijo `retail.` ya escrito. Idempotente (`create or replace`).
-- ============================================================================

set search_path = retail, public, extensions;

create or replace function retail.fn_fotos_personas(p_ids uuid[])
returns table (persona_id uuid, foto_ruta text)
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select p.id, p.foto_url
  from public.personas p
  where p.id = any(p_ids)
    and p.foto_url is not null
    and exists (select 1 from retail.colaboradores c where c.persona_id = p.id);
$$;

comment on function retail.fn_fotos_personas(uuid[]) is
  'Ruta de la foto de perfil (bucket fotos-perfil de Dynamic) de cada colaborador pedido. Sin foto = sin fila. La URL la arma la web (lib/foto-perfil.ts).';

revoke all on function retail.fn_fotos_personas(uuid[]) from public, anon;
grant execute on function retail.fn_fotos_personas(uuid[]) to authenticated;
