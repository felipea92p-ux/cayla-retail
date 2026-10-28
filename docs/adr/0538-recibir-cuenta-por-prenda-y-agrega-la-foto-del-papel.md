# ADR-0538 — Recibir: «Los papeles de la compra» cuentan por prenda y la tienda puede agregar la foto del papel

**Estado:** aceptada · la web va en este PR · migración `20261027210000` **EN PRODUCCIÓN desde 2026-10-27** (con el OK de Felipe, por el MCP de Supabase; registrada con la hora del pegado) ·
**Fecha:** 2026-10-27 · **Decidió:** Felipe · **Sigue a:** ADR-0480 (Compras simple), ADR-0393 (recibir contando primero)

## Contexto

En Recibir, la columna «Los papeles de la compra» lista «Lo que anotó Felipe»: cada prenda anotada al comprar, con su estado. Dos problemas:

1. **El avance de cada prenda salía del total de la categoría, no de la prenda.** La base guarda un número por línea del envío, y cuando la
   persona escribe UN total de categoría (6 pantalones) ese número se reparte entre las líneas en el orden de la compra
   (`repartirContadas`, ADR-0393 act. 2026-10-26). Con Pantalón Carla (4) identificada en «¿Qué pantalones son?» y 2 pantalones más contados,
   el papel mostraba a Pantalón Mía «2 de 4»: eran los 2 que sobraban del total, no pantalones identificados como Mía.
2. **Un papel sin foto no tenía salida.** La foto es opcional al anotar la compra (20261023180000), pero la base no deja cambiar nada de lo que
   anotó la compradora (`fn_compra_papeles_inmutable`), así que la tienda, con el papel en la mano, veía «No subió foto» sin poder subirla.

## Decisión

1. **Cada línea del papel se cuenta por lo identificado de SU prenda** (`avanceDeAnotadas`, `lib/recibir-papel-reglas.ts`): lo separado de la
   categoría en «¿Qué … son?» (prenda del catálogo por su producto; la anotada solo por nombre, con la nueva descrita igual) más lo que ya
   entró al stock de la línea, sin pasarse de lo que dijeron. La misma prenda anotada en dos líneas se reparte entre ellas en el orden de la
   compra. Una línea sin prenda anotada (ni catálogo ni nombre) no puede identificarse sola y conserva lo contado de la línea. **No cambia qué
   se guarda ni cómo se cierra el envío**: es solo cómo se lee el papel. El total de la categoría (6/8) sigue siendo el del contador grande.
2. **La foto se puede AGREGAR, nunca cambiar ni quitar.** La migración quita la foto de la comparación general del disparador
   `fn_compra_papeles_inmutable` y le pone su propia regla (de «sin foto» a una ruta de `papeles/`), y crea
   `retail.agregar_foto_papel(p_despacho_id, p_papel_id, p_foto_ruta)`: módulo «Recibir mercadería», la sede del envío, firma el
   responsable, el papel tiene que ser de una orden de ESE envío, el envío no está anulado, la misma ruta otra vez no hace nada y un papel
   con foto la rechaza. Monto, tipo, proveedor, fecha, lo pagado… siguen inmutables.
3. **En la pantalla**, junto a «No subió foto» va «Subir foto» (sin `capture`: en el celular el sistema ofrece cámara o galería; en el
   computador, el selector de archivos). Sube al depósito `retail-gastos-viaje` (`papeles/`, que ya permitía la subida y la lectura de quien
   recibe) y guarda la ruta con la RPC; la página se refresca y la foto queda a la vista.

## Por qué no más

- *Cambiar una foto ya subida* abriría un hueco en lo que anotó la compradora y dejaría la anterior huérfana en el depósito (no se borra
  nada). Una foto equivocada se corrige hoy con Compras; si hace falta, es otra decisión.
- *Que el papel cuente lo contado grande* era lo que se quería quitar: hacía parecer completa una prenda que nadie identificó.

## Cómo se prueba

`lib/recibir-papel-reglas.test.ts` (el caso de la captura de Felipe, la misma prenda en dos líneas, nombre sin catálogo, envío reabierto,
línea sin prenda). La migración se ensayó en una base aparte con tablas mínimas: agrega, repite la misma ruta, rechaza otra ruta, un papel con
foto, uno de otro envío, una ruta fuera de `papeles/`, sin módulo, otra sede y sin responsable; el disparador sigue frenando monto, quitar la
foto y borrar; y la migración corre dos veces sin error. **Falta**: probarla contra el stack local completo y la subida real al depósito.

## Cómo se pegó en producción

Una sola parte (dos funciones, sin tablas ni políticas): `supabase/migrations/20261027210000_recibir_agrega_la_foto_del_papel.sql`, con el
reemplazo anclado del disparador (aborta sin cambiar nada si su texto en producción no es el esperado). Verificado después de pegar: el disparador lleva la regla nueva y ya no compara la foto, la función existe como `security definer`, `anon` no puede
ejecutarla y `authenticated` sí.
