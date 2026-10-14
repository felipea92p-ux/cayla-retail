## Recibir mercadería ▸ fase 4 de las órdenes de compra: recibir un envío en la sede (2026-10-12) — rama `claude/purchase-order-phase4-9b0c82`

- **Qué:** la sede recibe un envío de orden de compra (o una orden «directo» que llegó sin guía): lo abre, dice qué prenda es cada línea
  (la crea ahí mismo con sus tallas, colores y el precio sugerido, o elige una que ya existe), cuenta talla por talla, corrige el costo,
  marca lo dañado (a cuarentena), dice qué pasó con lo que faltó o vino de más y agrega lo que no estaba en la guía. Al cerrar, el stock
  entra, el costo se promedia, lo recibido se carga al papel hasta su cupo y la recepción muestra cómo se cerró, con etiquetas y «Bajar
  al piso». Quien hizo la orden no la recibe (decisión 17).
- **Por qué:** ADR-0362, fase 4 (decisiones 13–15, 17, 18, 21, 23, 27, 48 y 49). La sesión de Recepción que la iba a hacer no tiene
  rama; Felipe pidió avanzar de corrido hasta la mañana del 2026-10-13. Contrato:
  `docs/compras/ordenes-de-compra-2026-10/contrato-recepcion-de-envio.md` (con «Cambios al construir»).
- **Cómo:** dos agentes en paralelo sobre el contrato (base y pantalla). Migraciones `20261013001000` (esquema y el alta al recibir) y
  `20261013002000` (funciones y lecturas); `pnpm pruebas:recepcion-de-envio` 28/28 en el banco y en la lista del CI; las de órdenes,
  compras, recibir, lote, dañadas, alta, roles y eliminar producto en verde. Web: 83 casos puros, tsc y lint limpios, vitest completo;
  recorrido de punta a punta en el banco (5 envíos: prenda nueva, «Ya la tengo», «+ talla o color», costo atípico confirmado, sin guía,
  «No llegó nada», sobrante «Se cobra aparte»), a 375 px y en modo oscuro (0 hallazgos). El reemplazo anclado de
  `crear_producto_con_variantes` se simuló contra producción (solo lectura): entra. **Sin pegar en producción.**
