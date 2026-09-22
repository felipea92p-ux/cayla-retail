# Maqueta — Comprobantes de proveedores (`/compras`, `/compras/nueva`), Stitch, 2026-09-22

Continuación visual de `docs/pantallas/compras-comprobantes.md` (auditoría con `/pantalla`) y del comparativo de
referentes (Odoo, QuickBooks/Xero, Lightspeed/Shopify POS, Linear/Notion) publicado como Artifact en la misma
conversación. Esta carpeta es la versión hecha con **Stitch** (Google), a pedido de Felipe, para ver el diseño
completo de la interfaz — todos los elementos de las 3 capturas que mandó, más las ideas de los referentes que ya
se validaron (documento al lado del formulario, stepper de recepción, "Recibir todo" en la fila, atajo tipo paleta
de comandos).

**Es una maqueta, no código de la app**: no se importa desde `apps/web`.

- Origen: Stitch, proyecto **«CAYLA · Comprobantes de proveedores»** (`projects/3207863516536512333`), sistema de
  diseño propio de este proyecto (`assets/10542183336978512968`, ver `sistema-de-diseno.md` en esta carpeta) — con
  los tokens **reales** del producto: `crema` #f5f0e8, `papel` #fbf8f2 (no #fbf6ec, que es el valor con el que
  derivó otra maqueta anterior — ver nota de `docs/maquetas/historial-ventas-2026-09/README.md`), `tinta` #1a1a18,
  `rojo` #b8412d, `rojo profundo` #8b2a1f, `sand` #e8e0d0, `verde` #5f7a52, `ámbar` #b0812f, `taupe` #a47865. EB
  Garamond en títulos y cifras, DM Sans en el resto.
- **Los datos son ilustrativos**: proveedores (Textiles Gamarra SAC, Hilos y Tejidos del Norte, Avíos Miraflores
  EIRL, Confecciones Vallejo, Telas Andinas del Sur), montos y documentos (F001-000456, B002-000198…) — ninguno
  sale de producción. `docs/pantallas/compras-comprobantes.md` ya documenta que producción tiene **0 filas** en
  `compras` al día de este análisis, así que no había datos reales que copiar.

## Qué se generó

| Pantalla | Estado | Archivo |
|---|---|---|
| `/compras` — Comprobantes de proveedores (listado) | ✅ Generada y exportada | `01-comprobantes-listado.png` |
| `/compras/nueva` — Registrar comprobante | ⚠️ Generada en Stitch (el proyecto avanzó de versión tras el pedido), pero esta sesión no pudo descargar su imagen — ver «Lo que quedó pendiente» | — |

### 01 · Comprobantes de proveedores (listado)

Incluye, de las 3 capturas que mandó Felipe: barra lateral completa (logo, `+ NUEVO`, Compras expandido con
Proveedores/**Comprobantes** activo/Recibir mercadería/Por pagar/Notas de crédito, Ventas, Inventario con
insignia), selector de sede arriba a la derecha, las 4 tarjetas KPI (Por pagar con barra de vencido, Por recibir,
Compras del mes con comparación, IGV del mes), las 5 pestañas con contador, buscador con pastilla `Ctrl K`, botón
Filtros, selector Emisión/Vencimiento, y la tabla con 5 comprobantes de ejemplo.

Encima de lo que ya existe en la app, suma dos ideas de los referentes (marcadas en el comparativo del Artifact):
- **Stepper de recepción** (Lightspeed/QuickBooks) en vez de la barra fina `AvanceFino` actual: Emitida → En
  camino → Recibida, con el segmento en curso en ámbar.
- **"Recibir todo" en la fila** (Lightspeed): acción que solo aparece en la fila con mercadería pendiente.

### 02 · Registrar comprobante — pendiente de exportar

El prompt (guardado en `prompt-02-registrar.md` en esta carpeta) pedía los 4 bloques reales del formulario
(Documento, Líneas, Pago, Resumen con "Dónde cae"/adjuntos/nota/checklist "LISTO N DE 4") **más la idea de Odoo**:
el facsímil del documento escaneado al lado de los campos, en vez de un cajón de adjuntos aparte.

## Lo que quedó pendiente (para quien retome esto)

Stitch generó la segunda pantalla — el `updateTime` del proyecto avanzó dos veces después de pedirla (15:10:59 y
15:14:34) — pero las llamadas `list_screens` y `get_project` de esta sesión no devolvieron su id ni su imagen (la
miniatura del proyecto quedó fija en la primera pantalla). Es una limitación del conector MCP de Stitch de esta
sesión, no un rechazo del pedido. Para cerrarlo:

1. Abrir el proyecto **«CAYLA · Comprobantes de proveedores»** directo en Stitch (con la cuenta de Felipe) y
   revisar si la segunda pantalla aparece en el lienzo o en «Recientes».
2. Si no aparece, volver a pedirla con el prompt de `prompt-02-registrar.md` — el sistema de diseño del proyecto
   ya queda guardado, no hace falta rehacerlo.
3. Exportar la imagen a esta carpeta como `02-registrar-comprobante.png` y agregar su fila a la tabla de arriba.

## Ojo al llevarla al código

- Los valores de color y tipografía coinciden con `apps/web/app/globals.css` — a diferencia de la maqueta de
  Historial (que usó los hex por defecto de Stitch), acá se fijaron explícitamente en el sistema de diseño.
- El "Ctrl K" del buscador es solo una pista visual: no hay paleta de comandos real en la app hoy (si se construye,
  es la tarea de Linear/Notion del comparativo de referentes, no algo que ya exista).
- El stepper de recepción de 3 segmentos reemplaza visualmente a `AvanceFino` (`apps/web/app/(app)/compras/page.tsx`);
  construirlo de verdad es cambiar ese componente, no solo el color.
- El facsímil de documento junto al formulario (pantalla 02) es la pieza más grande de trabajo nuevo: hoy
  `SelectorAdjuntos` (`apps/web/components/AdjuntosCompra.tsx`) es una zona de arrastrar y soltar en el aside, sin
  vista previa junto a los campos.
- Esto es exploración de diseño, no una decisión tomada — el análisis `docs/pantallas/compras-comprobantes.md`
  tiene sus propias 12 tareas priorizadas; esta maqueta no las reemplaza.
