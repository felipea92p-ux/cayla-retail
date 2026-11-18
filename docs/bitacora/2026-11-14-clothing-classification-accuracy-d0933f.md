## 2026-11-14 · Catálogo con IA: lo ya elegido de la prenda viaja a la IA (ADR-0659 act. b)

- **Hecho:** un pantalón de lino salía como buzo porque el pedido era uno solo, escrito para blusas, y no sabía nada de la prenda. Ahora la categoría, el tejido y el patrón ya elegidos van como «Datos de la prenda» (`lib/ficha-foto-ia.ts`), y lo que cuelga de la cintura (pantalón, jean, short, falda) se pide con pretina y basta. Nuevo, Editar y Recibir.
- **Verificado:** `lib/ficha-foto-ia.test.ts` y `lib/openai-imagen-reglas.test.ts` (con un buzo real como control: no se dice «plano»; sin datos, el pedido es el medido palabra por palabra).
- **Sigue:** la lámina con fotos reales (el pantalón de lino, un jogger y un buzo de control) para que Felipe elija mirando; sin ella, el pedido de cintura no está medido.
