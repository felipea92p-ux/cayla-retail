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
