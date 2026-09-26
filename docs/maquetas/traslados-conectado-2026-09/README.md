# Traslados conectado · spike (2026-09-26)

`spike.html` se abre directo en el navegador (datos inventados). Muestra la pantalla en computadora (1.440 px) y en
celular (375 px) lado a lado. **Es un spike: no cambia la pantalla real.** Parte de `main` después del PR #509
(ADR-0239: conteo a ciegas guardado, piso o almacén, anular). Las capturas que motivaron el pedido eran de antes de ese PR.

La barra oscura de arriba (no existe en el ERP) alterna lo que Felipe pidió ver antes de elegir:

| Control | Opciones |
|---|---|
| **Pantalla** | Traslados (lista) · Nuevo traslado · Al enviar (lo que acompaña a la caja) · Al recibir (detalle ya confirmado) |
| **Lista** | Pestañas «Por recibir · Por enviar · Enviados · Historial» · Cifras + tabla (lo de hoy sin lo redundante) · «Hoy te toca» (bandeja de tareas) |
| **Agregar prendas** | Escanear + buscar (pistola/cámara y palabras, con foto y − / +) · Solo buscar · Combo por línea (hoy) |
| **Con la caja** | Guía con QR + WhatsApp · Solo guía con QR · Solo WhatsApp · Nada (hoy) |
| **Entró a** (Al recibir) | Almacén · Piso de venta |
| **Conexiones** (se prenden y apagan) | Pedidos de otras tiendas (ADR-0233) · Después de recibir · Sugeridos (Análisis) · Pedir a otra sede (**nuevo, pide migración**) |

En el celular, «Escanear» (botón fijo) abre la cámara simulada: el QR de la guía o la etiqueta de una prenda llevan al
traslado que la trae. «Pedir a otra sede» abre su hoja. Los enlaces no navegan: muestran a qué pantalla irían.
`?solo=pc|tel&esc=…&lista=…&agregar=…&guia=…&lugar=…&tab=…&hoja=scan|pedir&con=ped,desp,sug,pedir` fija un estado; así
se sacaron las capturas (Chrome sin ventana; no se suben al repo, como en los otros spikes).

## Lo que el análisis encontró (y el spike propone)

**Redundante:** el mismo «tienes que recibir» se decía cinco veces (franja, tarjeta, fondo de la fila, chip, botón) y
empujaba el primer traslado a ~990 px en el celular; había tres formas de filtrar para 4 sedes; «Prendas en tránsito» es
un total que no lleva a nada; la nota del pie repite lo que el detalle explica al recibir.

**Nuevo traslado:** destino en 3 botones (hay 3 sedes, no hace falta un combo), llegada por día («Hoy / Mañana / Pasado
mañana / Otro día»), prendas por escaneo o palabras con foto, cantidad con − / +, resumen «La caja» con el botón a la
derecha (en el celular, fijo abajo). Recuerda que desde Existencias se pueden marcar varias y traerlas cargadas.

**Guía de la caja:** el QR abre el conteo de ESE traslado. Ni la guía ni el WhatsApp dicen cuántas van: la otra sede
cuenta a ciegas (ADR-0239, D-130).

**Conexiones, de más a menos beneficio para la colaboradora:**
1. **Después de recibir** — pasa con cada caja que llega; «Bajar al piso» ya cargado evita el «está en el almacén» al
   cobrar; etiquetas y aviso a la clienta del pedido para apartar. Sin migración.
2. **Pedidos de otras tiendas** — hay una clienta esperando en otra sede y hoy el pedido solo se ve en Apartados. Sin migración.
3. **Sugeridos para enviar** — ahorran pensar qué mandar; los decide sobre todo el líder, así que se muestran solo a quien ve Análisis. Sin migración.
4. **Pedir a otra sede** — útil, pero es modelo nuevo (tabla y funciones) y se cruza con los pedidos para apartar;
   conviene como extensión de ADR-0233 con la clienta opcional, después.

## Decisiones que esperan a Felipe

- Qué lista: pestañas, cifras + tabla u «Hoy te toca».
- Cómo se agregan prendas: escanear + buscar, solo buscar o combo.
- Qué acompaña a la caja: guía QR + WhatsApp, solo QR, solo WhatsApp o nada.
- Qué conexiones entran en la primera tanda (las tres sin migración, o también «Pedir a otra sede»).

Datos inventados; el dominio `erp.cayla.pe/t/15` del mensaje es ilustrativo.
