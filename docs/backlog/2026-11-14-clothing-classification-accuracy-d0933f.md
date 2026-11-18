## 📸 Catálogo con IA: la ficha de la prenda (2026-11-14, ADR-0659 act. b) — rama `claude/clothing-classification-accuracy-d0933f`, sin migración

Un pantalón de lino sostenido a mano salió como buzo: el pedido no sabía qué prenda ni qué tela era, y estaba escrito para blusas.

- [x] **La ficha viaja a la IA:** categoría, tipo, tejido y patrón ya elegidos (`lib/ficha-foto-ia.ts`), al final de los tres pedidos. Nuevo, Editar y Recibir.
- [x] **Lo que cuelga de la cintura** (PAN, JEA, SHO, FAL) se pide con pretina y basta, sin elástico ni puños que la foto no muestre.
- [x] Pruebas con control: un buzo real no se dice «plano»; sin datos, el pedido es el medido.
- [ ] **Lámina con fotos reales** (~1 USD): este pantalón de lino sostenido y en plano, un palazzo, otra prenda de lino, y un jogger y un buzo reales como control; pedido actual contra el nuevo. Felipe elige mirando.
- [ ] **Las líneas de la hoja de ángulos** (`HojaCatalogoIA.tsx`): «Entera, como siempre.» → algo como «Sola y en plano, sin personas.». Pasa por `/milimetro` y la regla de poco texto.
- [x] **Revisión independiente** (2026-11-14): Editar busca el tejido y el patrón en todas las categorías y, si no, usa el guardado; el tipo sale
  del nombre en Editar y de la hoja en Recibir; el pedido de varias fotos de un pantalón ya no habla de escote ni de gancho; la ficha se lee al
  mandar el pedido (un color que espera al molde no va con un tejido viejo); la prueba de totalidad ya no depende del orden de las claves.
- [ ] **Subcategorías** (p. ej. una hija de Pantalón con su propio prefijo): no están en `ZONA_POR_PREFIJO` ni en `TIPOS_POR_CATEGORIA`, así que
  van con el pedido de hombros. Arreglo: que las pantallas manden el prefijo del padre y `fichaParaIA` lo pruebe después del de la hija. Ninguna
  de las tres pantallas lo tiene hoy (cambia tres cargadores). Antes, contar cuántas subcategorías de ropa hay en producción.
- [ ] **Recibir ▸ sumar un color a una prenda que ya existe:** la hoja no trae su tejido ni su patrón; solo viajan la categoría, el tipo y el molde.
- [ ] **Si la lámina no basta:** una descripción previa con un modelo de visión barato (~0,002 USD, 3–5 s) que se pegue al pedido; si falla, el pedido normal.
