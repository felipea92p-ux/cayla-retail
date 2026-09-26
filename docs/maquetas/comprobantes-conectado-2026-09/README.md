# Comprobantes conectado, computadora y celular: demo (2026-09-26)

`demo.html` es un demo comparativo: un solo archivo con el isotipo incrustado y datos inventados. **No es el spike final
ni una implementación**: no toca el código del ERP ni la base. Sirve para elegir entre las opciones abiertas con la barra
oscura. La computadora y el celular se dibujan juntos y comparten el estado: lo que abres en uno se abre en el otro.

Análisis de origen: `docs/pantallas/vender-comprobantes.md` (re-análisis del 2026-09-26, SHA `2227a9fd`).

## El pedido (Felipe, 2026-09-26)

Sumar a Comprobantes accesos a las pantallas nuevas y hacerla cómoda en el teléfono. Tras el análisis, Felipe pidió:

1. Un demo de **con qué vista entra quien no es líder**.
2. Revisar qué hacen otras empresas: qué sumar y qué quitar (pestaña «Otras empresas» del demo).
3. Accesos en cada comprobante, aprobados los cuatro: **Ver la venta · Cambio y Devolución · WhatsApp al número de la
   clienta · Nota de crédito ↔ devolución**.
4. Un demo de **Proforma → Apartar**.
5. Un demo de **cómo se ordenan las acciones en el celular**.

## Qué se elige con la barra

| Grupo | Opciones |
|---|---|
| Quién mira | Colaboradora · Líder |
| 1 · Entrada | A «Hoy» para la colaboradora (Series solo para el líder) · B Emitidos para todos · C Series, como hoy |
| 2 · Celular | A tocar la tarjeta abre una hoja · B barra inferior fija (choca con ADR-0206) · C botones grandes en cada fila |
| 3 · Proformas | A Cobrar + Apartar · B solo Cobrar |

## Lo que va en todas las opciones

- La fila abre la venta: un cajón en computadora y una hoja en celular (reusa `DetalleVentaModal`).
- Cambio y Devolución desde un comprobante aceptado (`/cambios?q=`, `/devoluciones?q=`).
- WhatsApp al `telefono_whatsapp` de la clienta. Si no hay número, se pide y se guarda.
- NC ↔ devolución ↔ boleta: pruébalo con B004-000029 y NC01-000001.
- «Por reintentar» pasa a llamarse **«Por enviar»** e incluye las boletas que nunca se intentaron (tarea #1 del análisis).
- XML, CDR y Anular van a «Más». Anular sigue siendo del líder.
- Series dice «7 emitidos · va en el 37» en vez de «números usados».

## Otras empresas (resumen)

Revisados en sus centros de ayuda: Shopify POS, Square, Lightspeed, Nubefact, Alegra y Bsale. Lo que se repite en
todos: **el comprobante vive dentro de la venta**, y desde ahí se reenvía, se devuelve y se reimprime. XML, CDR y los
resúmenes diarios quedan fuera de la vista de la vendedora. Las fuentes están enlazadas en el demo, junto con lo que no
se pudo verificar.

## Decisiones de Felipe

_Pendiente: se completa cuando Felipe elija. Con eso se arma el spike final en esta misma carpeta._
