-- ============================================================================
-- 20261006180100_editar_producto_pide_responsable.sql — CAYLA V2 (ADR-0354; Felipe, 2026-10-06, opción «a»)
--
-- EL PROBLEMA. El historial de una prenda tiene que decir QUIÉN cambió cada cosa, y en producción los 40 cambios de precio
-- guardados no tenían a nadie (medido el 2026-10-06). «Editar producto» era una acción soltada del combo «Responsable»
-- (`producto_confirmar_cambios`, 20260929230000): en la cuenta de una persona firma ella, pero en una terminal de tienda
-- `fn_actor_persona_id(true)` devuelve null y el cambio queda sin firma.
--
-- LA DECISIÓN (Felipe, 2026-10-06): Editar producto vuelve a pedir «Responsable» al confirmar los cambios. La hoja
-- «Revisa y guarda los cambios» trae el combo (viene elegido con quien inició sesión, si está de turno); con la cuenta de
-- una persona no cambia nada que se note. No se toca `fn_actor_persona_id`: basta con sacar la clave de la lista.
--
-- ORDEN DE PEGADO (importante). Esta parte se pega DESPUÉS de que la web nueva esté publicada: la web de antes manda
-- `x-responsable-omitido: producto_confirmar_cambios` sin responsable y, sin la clave en la lista, la base la rechazaría
-- («Elige quién hace esta operación») en cada terminal. La web nueva ya manda el responsable, así que funciona igual con la
-- clave adentro o afuera: publicar primero la web no rompe nada.
--
-- PARA VOLVER: `insert into retail.acciones_sin_responsable (clave, descripcion) values ('producto_confirmar_cambios',
-- 'Confirmar los cambios de la ficha de un producto');` (y la web vuelve a mandar la firma soltada).
-- Re-ejecutable. Sin políticas ni tablas en uso: una sola parte.
-- ============================================================================

set lock_timeout = '3s';

delete from retail.acciones_sin_responsable where clave = 'producto_confirmar_cambios';
