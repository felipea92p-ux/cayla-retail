# 2026-11-25 · El pedestal de la portada ya no parpadea al rotar las prendas

- **Qué:** en la portada de la tienda («Lo nuevo»), cada 6 s cambian las tres prendas y, junto con ellas, parpadeaban el pedestal, su sombra y la flor. Causa: cada podio llevaba como clave el id de la prenda (`key={p.id}`), y React borraba y volvía a crear el podio entero al cambiar de grupo.
- **Cómo:** en `apps/tienda/components/EscenaPortada.tsx` el podio lleva como clave su lugar (`key={i}`) y solo la foto de la prenda lleva el id. Medido en el navegador con 3 rotaciones: antes se borraban 9 pedestales, 9 sombras y 6 flores; ahora, 0 (solo se cambian las 9 fotos). Sin errores en la consola, también a 375 px.
- **Falta:** verlo con las prendas reales de producción: se probó con una página temporal e imágenes de relleno.
