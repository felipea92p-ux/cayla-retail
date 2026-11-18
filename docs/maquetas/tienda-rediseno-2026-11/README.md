# Rediseño de la tienda: maqueta navegable (2026-11-05)

**Qué es:** el rediseño pedido por Felipe (rosa empolvado y borgoña, referencia en escritorio y celular), para verlo antes de tocar la tienda. **Una maqueta no cambia la tienda.**

**Cómo verla:** sirve `docs/maquetas` con `maqueta-referentes` de `.claude/launch.json` y entra a `/tienda-rediseno-2026-11/`. Para probar celular, oscuro y la letra, agrega `?herramientas=1` a la dirección: esa barra es interna y no se muestra sin ese parámetro.

**Lo real:** prendas, fotos, precios, disponibilidad por tienda, looks, tiendas y plazos salen de producción (2026-11-05). Solo 29 prendas traen sus tallas; las demás lo dicen.

**Lo inventado, y lo dice en pantalla:** las ofertas (hoy no hay campañas), la cuenta de María y el pedido de ejemplo. Nada se guarda ni se envía.

**El escenario:** pedestales, flores y textura son dibujo propio, en `recursos/` (76 KB en total). Las prendas son las fotos del catálogo, sin deformar; `escalaDe` en `app.js` equilibra cada una según su categoría y su forma.

**La letra:** la maqueta usa Playfair Display, que es la más cercana a la referencia, con un botón para volver a DM Serif (la elegida en ADR-0612). La decide Felipe mirando; si cambia, se escribe en un ADR.

**Lo que falta:** las fotos de «Arma tu outfit», que muestra sus lugares reservados. Ver `recursos/README.md`.

**Un solo CSS:** `estilos.css` son tokens y piezas compartidas, sin estilos por página: es la regla de Felipe para llevarlo a la tienda real.
