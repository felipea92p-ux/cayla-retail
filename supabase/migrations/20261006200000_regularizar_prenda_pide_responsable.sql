-- ============================================================================
-- 20261006200000_regularizar_prenda_pide_responsable.sql — CAYLA V2 (Felipe, 2026-10-06)
--
-- EL PROBLEMA. «Regularizar» (Existencias ▸ Ventas sin registrar) era una acción soltada del combo «Responsable»
-- (`regularizar_prenda`, 20260929230000). En la cuenta de una persona firma ella, pero en la terminal de la tienda
-- `fn_actor_persona_id(true)` devuelve null: la prenda se regulariza y el movimiento queda SIN nombre. Las mismas colaboradoras
-- que trabajan en la tienda son quienes regularizan: tienen que poder identificarse ellas.
--
-- LA DECISIÓN. Regularizar vuelve a pedir «Responsable» en su hoja (viene elegida con quien inició sesión, si está de turno; en
-- una terminal, la colaboradora elige su nombre). No se toca `regularizar_prenda` ni los permisos (`fn_puede_operar_ubicacion`):
-- basta con sacar la clave de la lista. La identificación en bloque del líder (`cola_arranque_identificar`) sigue soltada.
--
-- ORDEN DE PEGADO. DESPUÉS de que la web nueva esté publicada: la web de antes manda `x-responsable-omitido: regularizar_prenda`
-- sin responsable y, sin la clave en la lista, la base la rechazaría («Elige quién hace esta operación») en cada terminal.
-- Publicar primero la web no rompe nada: la nueva ya manda el responsable, con la clave adentro o afuera.
--
-- PARA VOLVER: `insert into retail.acciones_sin_responsable (clave, descripcion) values ('regularizar_prenda',
-- 'Regularizar una prenda por regularizar');` (y la web vuelve a mandar la firma soltada).
-- Re-ejecutable. Sin políticas ni tablas en uso: una sola parte.
-- ============================================================================

set lock_timeout = '3s';

delete from retail.acciones_sin_responsable where clave = 'regularizar_prenda';
