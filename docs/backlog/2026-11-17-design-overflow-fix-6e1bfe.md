## 2026-11-17 · Encuadre en el celular: matriz de Editar producto y barra de Atributos

Rama `claude/design-overflow-fix-6e1bfe`. Sin migración ni cambios de reglas de negocio.

### Hecho
- [x] Visto en las pantallas reales a 375 y 350 px, en escritorio y en oscuro; `/milimetro auditar` (0 graves, informe en `docs/milimetro/auditorias/2026-11-17-encuadre-celular-matriz-y-atributos.md`) y `guias:recorrer` a 375 y 1440.

### Falta
- [ ] Ver en una base con más de 8 categorías desactivadas la paginación real, y una prenda de talla «Estándar» (la base local solo tiene «Única»). Las dos se midieron en un banco de pruebas.

### Quedó sin tocar (decidir)
- [ ] En escritorio el botón sigue diciendo «+ Agregar categoría» (y «+ Agregar color», «talla»…). Acortarlo a «Agregar» es un cambio de las cinco listas a la vez.
- [ ] De la auditoría, heredado: con el dedo, el lápiz y el tacho de la matriz miden 24–28 px (pasan los 24 de WCAG, no los 44 de `tacto.css`), y las cajas de precio y costo marcan el foco solo con el borde.
- [ ] En un teléfono de 320 px, una prenda de UNA talla de nombre largo desliza la tabla 14 px de lado (el color nunca baja de 168 px). Con 350 px o más no pasa.
- [ ] En Costos, una celda «—» (combinación que no se vende) mide 48 px dentro de una fila que ahora puede medir 56: su rayado no llega a los bordes.
- [ ] La fila «Total» de Unidades queda en blanco cuando el total es 0.
