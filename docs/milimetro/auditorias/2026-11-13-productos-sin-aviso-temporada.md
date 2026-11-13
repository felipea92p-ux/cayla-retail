# Auditoría al milímetro — /productos (sin el aviso «prendas sin temporada») · 2026-11-13 · claude/catalog-prendas-sin-temporada-3b08e3 @ d6ce8a8ba
Medido: 1440×900 claro · 1440×900 claro con foco · 375×812 claro · 1440×900 oscuro · quieto     Servidor: http://localhost:3010 (base local, cuenta Admin en Tienda Lima)
Medidores: estados (`milimetro`), `espacio`, `tipografia`, `color`, `movimiento`, `textos`. Sin gráficos en la vista.

**Qué cambia el PR:** quita una pieza (el aviso plegado en `nota-cayla` con «Completar») entre los avisos y el buscador. No dibuja nada nuevo:
el filtro que la reemplaza («Por completar ▸ Sin temporada») ya existía. **Ningún hallazgo de abajo vive en la zona que cambió ni lo introdujo
este PR**: son de piezas que el PR no toca. Por eso quedan anotados, no arreglados aquí (auditar solo mira; arreglarlos es otro PR con el OK de Felipe).

Resumen: 0 graves nuevos · 0 medias nuevas · 0 leves nuevas · hallazgos heredados abajo.

## Lo que cambió, medido
- Sin el aviso, el buscador sube ~70 px a 1440 y queda dentro del primer pliegue junto con los filtros abiertos (captura de 1440×900).
- Foco: 80 controles medidos, 0 sin anillo, 0 anillo flojo, 0 foco tapado. Etiquetas y errores: 0.
- Color: 78 textos medidos, 0 fallan en claro ni en oscuro. Movimiento: 0 animaciones en bucle.

## Heredados (no los introdujo este PR)
1. «Ver todos los colores» de la tarjeta de la grilla mide 17×23 y 13×23 px — `components/ProductoPiezas.tsx:97` — mínimo 24 px (WCAG 2.5.8 AA) — va a /espacio.
2. Puntos de color de la tarjeta (`vg-punto`): el elegido solo lo dice ARIA en 14 casos según el medidor — revisar a ojo si el anillo lo marca (WCAG 1.4.1) — va a /milimetro.
3. Segmento «Grande / Mediano / Pequeño» (`segmento-cayla`): el medidor no ve borde de 3:1 en las opciones; es la pieza decidida `SegmentoDeslizante forma="modo"` (ADR-0358), «decidido a propósito» — va a /unificar si se revisa.
4. Versalitas bajo 11 px: «Muestra» sobre la foto (9 px), Grilla/Tabla y tamaños (10,5 px), «Ctrl K» del marco (10 px) — va a /tipografia.
5. 63 cifras sin números tabulares (precios de tarjeta y conteos de píldoras) — va a /tipografia.
6. Nombres de prenda cortados con «…» en la tarjeta (nombres de prueba largos) — va a /textos; es el truncado a propósito de la grilla.
7. A 375 px: 43 blancos bajo 44 px con el dedo (puntos de color de 24 px, Rótulos y Revisar precios de 42×44) — va a /espacio.

## Sin medir
- 375 px oscuro y los estados que exigen guardar (no aplica: el cambio no guarda nada).
