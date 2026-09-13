-- ============================================================================
-- colaboradores-iniciales-produccion.sql — NO es parte de la cadena
-- 0001-0013 a propósito (mismo motivo que datos-reales-produccion.sql: el
-- nombre no sigue <timestamp>_nombre.sql, así `supabase db reset` local la
-- ignora — local tiene su propia lista via seed.sql, Felipe + Micaela).
--
-- Lista definida por Felipe (2026-09-13): estos 9 correos, y NADIE MÁS,
-- pueden entrar a retail el día que esto se aplique. Resuelve por correo
-- (no por id pegado a mano) para que el script se pueda leer y auditar sin
-- tener que ir a buscar cada uuid aparte.
--
-- SE ROMPE SI: se corre antes de que exista 0013_colaboradores_autorizados.sql
-- en producción (la tabla retail.colaboradores todavía no existiría). Se
-- corre DESPUÉS de aplicar 0001-0013, en el mismo aterrizaje.
-- ============================================================================

set search_path = retail, public, extensions;

insert into retail.colaboradores (persona_id)
select p.id
from public.personas p
join auth.users u on u.id = p.auth_user_id
where u.email in (
  'felipe.a92p@gmail.com',
  'caylaperu@gmail.com',
  'carlosespcu@gmail.com',
  'danteramalt@hotmail.com',
  'lizzelott99@gmail.com',
  'cueva_dev@hotmail.com',
  'alexandernh2002@gmail.com',
  'mafer.santiago2006@gmail.com',
  'danyrf1603@gmail.com'
)
on conflict (persona_id) do nothing;

-- Verificación: debe devolver exactamente 9 filas. Si devuelve menos,
-- algún correo no resolvió a una persona activa — revisar antes de seguir.
select u.email, p.nombres, p.apellidos
from retail.colaboradores c
join public.personas p on p.id = c.persona_id
join auth.users u on u.id = p.auth_user_id
order by p.nombres;
