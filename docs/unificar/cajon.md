# El cajón lateral — una sola pieza (ADR-0358, ronda 17)

**Decidido:** 2026-10-17, Felipe, **mirando** (página de elegir con fotos de los cajones reales y demos; fuentes en
[rondas/17](rondas/17/README.md)). **Elegida:** P1. **Pieza:** `<Cajon>` (`components/ui/Cajon.tsx`).

## Qué se comparó

Siete cajones con tres caras: los cuatro de Compras (Por pagar, Recepciones, Proveedores, Notas de crédito) con una banda arriba —un círculo de
iniciales hecho a mano, versalitas, título serif de 23— y un pie con sus acciones y «1 de 2» con flechas; Movimientos y la ficha del equipo
sin banda (el título dentro del cuerpo, con su sello o su foto grande, una × de 20 px) y sin pie; y la orden de Producción con su banda, otra
× y otro pie. Anchos de 432, 456, 472 y 544 px.

| Opción | Cómo se ve |
|---|---|
| **P1 · la banda de Compras en todos** | banda con la marca a la izquierda (avatar de 40, el sello de un movimiento, el ícono del aparato), versalitas, título serif de 24, la frase en taupe y la × de las hojas; el pie con las acciones y «3 de 12» con ↑ ↓ |
| P2 · la cara de las hojas, de costado | sin banda: título y frase como una hoja al centro, la × arriba a la derecha |
| A · hoy | tres caras |

## Lo que eligió

**P1.** Una pieza con:
- **la banda:** `marca`, `sobre` (versalitas), `titulo`, `frase` (la descripción para el lector) y `debajo` (insignias), con la × de `<Modal conCerrar>`;
- **el cuerpo**, que corre por su cuenta;
- **el pie:** `pie` y `navegacion` (`{ indice, total, onNavegar, que, circular }`, también con ↑ ↓ del teclado por `useFlechasDelCajon`);
- **dos anchos:** `normal`, de 456 px, y `ancho`, de 544 px;
- **`velo`:** sin él la lista sigue viva detrás (Movimientos, Equipo);
- **`encimaDelPie`:** lo que queda fijo sobre el pie, como el «Siguiente paso» de una orden cerrada.

`children` y `pie` pueden ser una función que recibe `cerrar`, para lo que cierra desde adentro.

## El movimiento

El de hoy, ahora en un solo lugar:
- entra 28 px desde la derecha (380 ms) y sale en 240 ms;
- el cierre va en dos tiempos (primero se anima la salida, después se le avisa a quien lo abrió);
- al pasar de un registro a otro (`clave`), el contenido se reacomoda sin cerrar el cajón;
- Escape cierra solo si ningún control de adentro lo usó.

## Migración (2026-10-17)

**Deuda 0.** Pasaron los siete:
- **los cuatro de Compras**, con el círculo de iniciales hecho a mano convertido en `<AvatarPersona>` de 40;
- **Movimientos:** el sello de su tipo (ADR-0353) va a la banda en 40 px, la caja teñida de su cabecera (`.mv-cajon-cab`) se fue y sigue sin velo;
- **la ficha de una persona y la de una terminal:** la foto y el aparato van a la banda en 40 px, y la frase con la sede y el rol queda en `frase`;
- **el «Resumen y avisos» del Plan de campaña;**
- **la orden de Producción**, en el ancho de 544 px.

`CajonFicha.tsx` se borró. Quedan aparte la vista rápida de Productos (una hoja al centro, ADR-0136), `PanelTalla` (`<Modal>`) y `ProveedorModal` (una hoja al centro).
