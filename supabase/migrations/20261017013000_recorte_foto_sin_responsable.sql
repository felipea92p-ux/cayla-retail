-- ============================================================================
-- 20261017013000_recorte_foto_sin_responsable.sql — CAYLA V2 · «Arma el tuyo» (ADR-0434), actividad 2: el recorte de una foto nueva
--
-- EL PROBLEMA PRIMERO. Desde la actividad 2, cada foto que se sube (Editar producto, Nuevo producto, la cola sin conexión) guarda
-- también su recorte para el probador de la tienda online, solo y por detrás. `registrar_recorte` firma con `fn_actor_persona_id(true)`
-- y en producción el responsable es obligatorio: sin el combo, el recorte automático se rechazaría con «Elige quién hace esta
-- operación», y nadie está haciendo una operación aparte —solo subió una foto—.
--
-- LO QUE HACE. Suelta del combo la acción `recorte_foto` (Felipe, 2026-10-16: «No, soltarlo del combo»), como las 28 de la siembra
-- (20260929230000): la pantalla manda `x-responsable-omitido: recorte_foto` y la base no pide a nadie. Con la cuenta de una persona
-- firma ella; desde una terminal, el recorte queda sin persona (es un archivo que hace el sistema). «Preparar recortes» de Vitrina ▸
-- Probador sigue pidiendo quién lo hace: es una operación que alguien decide hacer.
--
-- PRODUCCIÓN. APLICADA el 2026-10-16 con el OK de Felipe (actividad 2 del ADR-0434), después de 20261017003000. Una sola parte,
-- re-ejecutable: una fila en `acciones_sin_responsable`; no altera tablas, no crea políticas ni toca disparadores (ADR-0195). Espejo en
-- `apps/web/lib/responsable-omitido.ts` (lo compara `responsable-omitido.test.ts`). Prueba: `pnpm pruebas:vitrina-probador`.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

insert into retail.acciones_sin_responsable (clave, descripcion) values
  ('recorte_foto', 'Guardar el recorte de una foto para el probador de la tienda online al subirla (lo hace el ERP solo, y con la cuenta de una persona firma ella)')
on conflict (clave) do update set descripcion = excluded.descripcion;

do $$
begin
  if not exists (select 1 from retail.acciones_sin_responsable where clave = 'recorte_foto') then
    raise exception 'recorte_foto: falta la clave en acciones_sin_responsable';
  end if;
end $$;

reset lock_timeout;
