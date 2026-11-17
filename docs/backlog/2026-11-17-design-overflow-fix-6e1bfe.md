## 2026-11-17 · Encuadre en el celular: matriz de Editar producto y barra de Atributos

Rama `claude/design-overflow-fix-6e1bfe`. Sin migración ni cambios de reglas de negocio.

### Falta antes del PR
- [ ] Ver los cambios en las pantallas reales (`/productos/[id]/editar`, `/productos/categorias`, Atributos) a 375 px, en claro y en oscuro. Se verificó en un banco temporal con datos ficticios: Docker estaba apagado y no había base local.
- [ ] `/milimetro auditar` sobre esas rutas (obligatoria en todo cambio visual) y `pnpm --filter web guias:recorrer` a 375 px: los pasos «filtros» y «agregar» ahora señalan el ícono de filtros y el «+» en el celular.

### Quedó sin tocar (decidir)
- [ ] En escritorio el botón sigue diciendo «+ Agregar categoría» (y «+ Agregar color», «talla»…). Acortarlo a «Agregar» es un cambio de las cinco listas a la vez.
- [ ] En un teléfono de 320 px, una prenda de UNA talla de nombre largo desliza la tabla 14 px de lado (el color nunca baja de 168 px). Con 350 px o más no pasa.
- [ ] En Costos, una celda «—» (combinación que no se vende) mide 48 px dentro de una fila que ahora puede medir 56: su rayado no llega a los bordes.
- [ ] La fila «Total» de Unidades queda en blanco cuando el total es 0.
