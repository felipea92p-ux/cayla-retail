# Maquetas del módulo Compras (2026-09-18)

Diseño aprobado por Felipe para las pantallas de Compras. **La implementación debe verse
igual que estas imágenes** — mismas jerarquías, espaciados, colores, textos y estados.
Decisiones y contrato de datos: `docs/adr/0111-compras-indicadores-pago-por-lote-y-faltantes.md`.

Cada `NN-nombre.html` es autocontenido (CSS inline con los tokens reales de
`apps/web/app/globals.css`); ábrelo en un navegador o léelo para sacar medidas exactas
(paddings, tamaños de fuente, anchos de columna). El `.png` es la captura de referencia.
Los números negros de las imágenes son marcadores de la leyenda, **no forman parte de la
interfaz**. Los datos son de ejemplo (proveedores y montos inventados).

| # | Archivo | Ruta | Notas |
|---|---|---|---|
| 1 | `01-comprobantes` | `/compras` | KPIs nuevos, pestañas de vista, orden, exportar, chip + monto |
| 2 | `02-por-pagar` | `/compras/por-pagar` | KPIs, vencimiento, salidas de caja, casillas, barra fija |
| 3 | `03-pago-multiple` | modal desde «Pagar juntos» | pago por lote (D3) |
| 4 | `04-recibir-pendientes` | `/compras/recibir` | KPIs, lista por urgencia, líneas en 0 (D1) |
| 5 | `05-faltante-nota-credito` | **desactualizada** (ver abajo): en la guía es el panel «Lo que faltó»; el modal solo queda en el detalle del comprobante | D2 |
| 6 | `06-recibir-recibidas` | `/compras/recibir?vista=recibidas` | KPIs y demora |
| 7 | `07-recibir-sin-comprobante` | `/inventario/recibir` | **ojo: la maqueta quedó desactualizada**, ver abajo |
| 8 | `08-proveedores` | `/compras/proveedores` | KPIs, filtro por rubro, orden |
| 9 | `09-proveedor-ficha` | `/compras/proveedores/[id]` | acciones, métricas, costo, últimos comprobantes |
| 10 | `10-registrar-comprobante` | `/compras/nueva` | contexto, vencimiento sugerido, llegada estimada |
| 11 | `11-celular` | Recibir y Por pagar en celular | pasos de a dedo, barra fija |

## Correcciones posteriores a las imágenes (mandan sobre ellas)

- **Pantalla 5 (cerrar con faltante) y las filas de la 4.** Felipe probó la primera versión
  (2026-09-18) y pidió dos cambios que mandan sobre la imagen: (1) la columna «Llegó» arranca
  **vacía**, no en 0 —un 0 escrito es «no llegó nada» y ofrece cerrar el faltante—; (2) «cerrar con
  faltante» **no abre un modal por línea**: bajo las líneas aparece el panel «Lo que faltó», con una
  decisión por línea corta («lo espero» o el motivo) y una sola nota de crédito por comprobante, y el
  botón de confirmar de la barra fija registra todo junto («Recibir 30 unidades y cerrar 2 faltantes»).

- **Pantalla 7 (Ingreso sin comprobante).** Felipe decidió (2026-09-18) mantenerla como
  *excepción*: se llama «Ingreso sin comprobante», vive en Inventario, **sale de la
  tarjeta del Inicio y del menú «+ Nuevo»** (queda una sola puerta «Recibir mercadería»,
  la de con comprobante). En la imagen las filas «Producción propia del Taller» están
  **mal**: la producción propia entra por `cerrar_produccion`, no por esta pantalla. Los
  casos reales de esta pantalla son mercadería de un proveedor sin comprobante todavía, y
  muestras u obsequios. Sus dos indicadores (unidades sin comprobante, sin costo) se mantienen.
- **Ficha de proveedor, «Evolución del costo».** Sale de `compra_items` (lo que ESTE
  proveedor cobra por cada compra), no de `costo_historial` (que mezcla proveedores).
- **Pantalla 1, pestaña «Por pagar».** Es «con saldo» (`p_con_saldo` de `listar_compras`,
  que la consulta ya soporta pero la URL todavía no expone).
