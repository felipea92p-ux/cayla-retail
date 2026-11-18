# Maqueta · el submenú del lateral con otros efectos de vidrio (2026-11-02)

Felipe: «no me agrada mucho el efecto glass de las opciones del lateral; investiga los mejores efectos glass». Compara SOLO el submenú de «Tienda web»
(la bandeja y la fila activa, hoy `--bandeja-fondo` y `--gota-marca` de `apps/web/app/estilos/vidrio/recetas.css`).

Abrir `index.html` en el navegador (no necesita servidor). La barra negra cambia el fondo (Aurora, Prendas, Plano) y el tema; las filas del submenú se tocan.
**Prendas** es la prueba dura: bloques de color nítidos detrás, donde el vidrio y el contraste del texto se ven de verdad.

| Cara | Qué hace | Costo |
|---|---|---|
| 0 · Como ahora | Bandeja hundida y píldora de vidrio con brillo | — |
| A · Escarcha | Esmerilado: desenfoque 30 px, grano fino, ficha mate sin brillo | Una imagen de ruido (SVG) |
| B · Liquid Glass | Refracción (`backdrop-filter: url(#filtro)` con `feDisplacementMap`) + brillo especular | Solo Chromium; en Safari/Firefox cae a un vidrio liso |
| C · Ahumado | Bandeja de cristal oscuro, la activa se aclara | Texto crema fijo sobre la bandeja |
| D · Borde de luz | Casi sin relleno; un hilo de 1 px con una esquina iluminada (máscara) | Depende del fondo |
| E · Cristal teñido | El vidrio toma el rojo de marca muy suave; activa blanca con filo rojo | Tinte fijo en los dos temas |
| F · Bisel | Piezas con cuerpo: luz arriba, sombra abajo; la activa sale de la bandeja | Sombras más pesadas |

Fuentes de la investigación: tutoriales y proyectos abiertos de Liquid Glass en CSS/SVG (LogRocket y repos de GitHub) y guías de glassmorphism accesible
(contraste, borde interior, grano). Son implementaciones de terceros, no de Apple.

Nada de esto toca el código del ERP todavía. Si Felipe elige una cara, se aplica en `recetas.css` y `marco.css` (una sola fuente) y se verifica con
`pnpm --filter web tema:auditar` en claro y oscuro.
