# Spike visual · Punto de Venta conectado y usable en el celular (2026-09-26)

> **Estado (2026-09-26): en revisión con Felipe.** Sin aplicar. No toca `PuntoDeVenta.tsx`
> ni ninguna RPC: es HTML/CSS/JS autocontenido con datos inventados, para decidir qué se
> construye antes de construirlo.

`punto-venta-spike.html`: un solo archivo, ábrelo en el navegador. La barra negra de arriba no
existe en el ERP; sirve para cambiar lo que se ve:

- **Escritorio / Celular / Otros POS / Hallazgos**: las cuatro vistas.
- **Hoy / Propuesta**: «Hoy» reproduce la pantalla actual (capturas del 2026-09-26); «Propuesta»
  enciende las opciones marcadas en la segunda fila.
- **Celular**: A · barra fija de cobro, B · pestañas Catálogo/Ticket, C · apilado (como hoy), o
  las tres lado a lado.
- **Abrir**: cada escena (talla sin stock, buscador, clienta, apartar/proforma, prenda sin
  registrar, tickets en espera, ventas de hoy, «Más»).

## De dónde sale

Felipe pidió conectar el Punto de Venta con las pantallas nuevas que trabajan de la mano con él,
y que funcione en el teléfono, que es donde la mayoría de colaboradoras pasa el día. Se revisaron
sus 13 capturas y el código de `main` (`b6935a18`). Los once hallazgos están en la vista
«Hallazgos»; los tres más grandes son:

1. **Hay piezas en la base que nunca llegaron al mostrador**: la ficha de clienta
   (`20260922140000`, `buscar_clienta`) y los pedidos no atendidos (`20260922190000`,
   `registrar_pedido_no_atendido`). Sus pantallas mínimas (`/clientas`, `/pedidos-no-atendidos`)
   dicen en su cabecera que la integración con el POS «es de otra tanda».
2. **Los accesos desaparecen en el celular** (`PuntoDeVenta.tsx:1203`, `hidden sm:flex`) y
   faltan Apartados, Historial y Proformas.
3. **En el celular, para cobrar hay que bajar todo el catálogo** (`PuntoDeVenta.tsx:1185`: el
   POS se apila bajo `lg`).

## Qué pide cada opción

| Opción | Solo pantalla | Usa una función que ya existe | Pide decisión o base |
|---|---|---|---|
| Barra de accesos / mínimo | ✓ | | |
| Resumen de hoy arriba | ✓ (`fn_ventas_del_dia`) | | |
| Tickets en espera con nombre | ✓ (viven en el navegador) | | |
| Buscador: vendible primero | ✓ | | |
| Admin como chip, catálogo denso, prenda sin registrar | ✓ | | |
| Celular A / B / C | ✓ | | |
| Clienta en el ticket | | `buscar_clienta`, `registrar_clienta` | la pregunta del club y «es para regalo» son el paso 1 del acta de clientas (`docs/datos/DECISIONES-2026-09-26-clientas.md`, D-92 a D-111) |
| «Anotar que no había» | | `registrar_pedido_no_atendido` | |
| Proforma desde el ticket | | proformas (ADR-0167) | |
| Apartar con adelanto desde el ticket | | | ¿`apartar_stock`/separaciones reciben el pago? |
| Pedir al almacén / traslado desde la talla | | | hoy el traslado lo inicia Inventario |
| Cámara para escanear | | | librería de lectura de códigos |

## Decisión de diseño ya tomada en el spike

En escritorio, **los seis accesos no caben** junto a la píldora «Hoy» y «Cerrar caja»: medido,
la cabecera desborda 58 px a 1320 px, y con el lateral abierto desborda más. Quedan a la vista
los cuatro de uso diario (Caja, Apartados, Cambios, Devoluciones) y «Más» guarda Historial y
Proformas. En el celular «Más» guarda los seis.

## Referentes

La vista «Otros POS» compara Shopify POS, Square Retail, Lightspeed Retail, Odoo PdV y Loyverse
con lo que se sabe de su documentación pública y de su uso conocido. **No se revisaron en vivo
el 2026-09-26.**
