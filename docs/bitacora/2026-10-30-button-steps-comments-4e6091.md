## 2026-10-30 (Un paso que se olvidó se agrega ya hecho, con su motivo)
Qué hice: el líder puede sumar a una orden un paso que se olvidó anotar (Ojales y botones del Short Sastre Recover) aunque los pasos de después ya avanzaron. Entra en su lugar hecho con las prendas que ya pasaron por él (las que el paso siguiente ya usó; en el Short, las 16). Si lo hizo un servicio, su costo se suma a la orden. Pide el día y el motivo, y queda en la historia con el chip «Agregado tarde». Base: `agregar_paso_tarde` (migración `20261031002000`, 22/22 en su prueba). Web: la hoja «Agregar un paso». ADR-0586.
Por qué así: el estado de cada paso sale de lo anotado. Si el paso entraba vacío, Planchado quedaba con 16 hechas de 0 que le entraron, y se trababa. Por eso el paso entra con su trabajo anotado en la misma operación y los números siguen cuadrando.
Felipe se lleva: la migración `20261031002000` está SIN pegar en producción (va antes de publicar la web). Reabrir pasos (actividades 2 a 5) ya quedó decidido en el ADR-0586 y se construye después, una por una.

## 2026-10-31 (Agregar un paso también mira las prendas con falla)
Qué hice: «Agregar un paso» (la base) ya no deja meter un paso antes de otro que solo tiene prendas con falla. Antes, si Planchado tenía 3 perdidas y ninguna buena, la base lo tomaba como «no empezado» y Ojales y botones entraba vacío antes. Migración `20261031031000`; caso R5b, 25/25.
Por qué así: esas 3 prendas ya pasaron por Planchado. Con un paso vacío antes, Planchado queda con 3 perdidas de 0 que le llegaron y la orden no cuadra. La pantalla ya lo evitaba; el hueco estaba en la base, que es la que manda. Ahora las dos funciones hermanas (`agregar_paso_orden` y `agregar_paso_tarde`) dicen lo mismo de cuándo un paso «ya empezó».
Felipe se lleva: `20261031031000` está SIN pegar en producción; es una sola parte y se puede repetir sin daño.

## 2026-10-31 (El arreglo de las fallas ya no borra el candado del catálogo)
Qué hice: antes de pegar `20261031031000` la comparé con la función viva de producción y no calzaba: mi versión reescribía «Agregar un paso» entera y borraba sin querer el candado «ese proceso está apagado» del catálogo de procesos. La rehice como reemplazo anclado (solo agrega la condición de las fallas) y devolví la base local a la función de producción con el arreglo encima. Prueba 26/26 (nuevo R5c). De paso: `20261031002000` ya estaba en producción, idéntica a la del repo.
Por qué así: el catálogo ya había parchado esa función con un ancla; copiar la primera migración pisa lo que otro le agregó después. El ancla cambia solo lo suyo y, si la función cambió, falla con un error claro en vez de pisarla.
Felipe se lleva: falta pegar solo `20261031031000` (una parte; si se pega dos veces, la segunda no hace nada).

## 2026-10-31 (Las dos migraciones del PR, en producción)
Qué hice: Felipe pegó `20261031031000`. Lo verifiqué en solo lectura: «Agregar un paso» en producción tiene la misma huella que en local, mantiene el candado del catálogo, cuenta las fallas y conserva sus permisos. Con eso, las dos migraciones del PR #1508 están en producción.
Por qué así: se comprueba el efecto en la base viva, no el nombre de la migración (el historial de migraciones de producción no registra lo pegado a mano).
Felipe se lleva: ya se puede fusionar el PR #1508 para publicar la web; la base no tiene nada pendiente.

## 2026-10-31 (Quitar la marca de Ploteo: solo el líder y con motivo — ADR-0586 act. 2)
Qué hice: la marca de Ploteo ya no la quita cualquiera. Desde el paso o desde la historia, solo un líder, y siempre pidiendo por qué; restaurarla también es del líder. Quien no es líder ve que un líder puede quitarla. Se borró el «Deshacer» viejo, que no pedía motivo ni quedaba en la historia de cambios. Migración `20261031160000` (sin pegar en producción); probado en la pantalla con Felipe (líder) y con Micaela como integrante del Taller.
Por qué así: quitar la marca cambia la orden de verdad (Ploteo vuelve a «por hacer» y, si lo hacía un servicio, su costo sale de la orden). Con dos caminos, uno sin motivo, la decisión no quedaba explicada. La regla vive en la base, porque esconder un botón no impide llamar a la función.
Felipe se lleva: falta pegar `20261031160000` antes de publicar la web. La «tablet del Taller» que eligió no existe hoy (una terminal solo se crea en una tienda): su regla quedó escrita en el ADR para cuando se habilite. Y volver a marcar Ploteo sigue abierto a quien opera, como decidió: una integrante puede dejarlo «hecho» otra vez después de que el líder lo quitó.
