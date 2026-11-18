# 2026-11-10 · Portada: el recorte ya no deja transparentes las rayas blancas de la tela (ADR-0613)

- **Qué:** `recortarFondo` separa el fondo puro (≥250, se sigue por donde vaya) del claro dudoso (solo es fondo si es ancho, 1,2 % del lado mayor). Versión del recorte a 3.
- **Por qué:** el short de rayas rosa y blanco de la portada salía con las rayas transparentes; igual una falda de rayas, el cinturón blanco y la plata de los accesorios.
- **Verificado:** 38 fotos reales antes/después (mirada cada una que cambia), 1084 pruebas de la tienda, `tsc`, `eslint`, `knip`. **No verificado:** la portada publicada.
