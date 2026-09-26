# Plan B: vender en papel cuando el sistema no funciona

*Para cada sede (TRU, AQP, LIM). Imprímela y tenla junto a la caja, con hojas de venta en blanco.*

## ¿Cuándo se usa?

La clienta **nunca espera** a que vuelva el sistema. Vende en papel si:

- **El sistema no abre** o no te deja entrar (la página no carga).
- **Al cobrar sale un error** y NO sale el aviso «… guardada sin conexión».
- En «¿Quién está atendiendo?» **no aparece nadie** y nadie puede marcar su entrada (la asistencia viene de Dynamic: si Dynamic
  está caído, el sistema no deja cobrar).

Avisa a tu líder de equipo apenas empieces a vender en papel.

## ¿Cuándo NO hace falta?

Si la pantalla de **Vender ya estaba abierta** y solo se cortó el internet, el sistema guarda la venta en esa computadora
(el aviso dice «Venta de S/ … guardada sin conexión») y la sube sola cuando vuelve la conexión. **Esa venta no va al papel**: se registraría dos veces.
Deja esa pantalla abierta, en esa misma computadora, hasta que suba.

Esa venta sin conexión tiene límites; si pasa alguno, vende en papel:

- No imprime el comprobante en ese momento (sale cuando la venta sube).
- No deja vender si la prenda quedaría en 0 en el piso. *(¿Se vende en papel la última prenda? Por confirmar con Felipe.)*
- Sin internet no se puede abrir ni recargar la página.

## Qué se anota por cada venta

Hoja N.º ____ · Sede ________ · Fecha ____/____/______ · Caja a cargo de ______________________

| N.º | Hora | Prendas: SKU · talla · color · cantidad · precio | Descuento (S/ y motivo) | Total cobrado | Medio de pago · n.º de operación | Comprobante: boleta o factura · DNI/RUC · nombre | Vendió | Pasada ✓ y hora |
|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | |
| 2 | | | | | | | | |
| 3 | | | | | | | | |
| 4 | | | | | | | | |
| 5 | | | | | | | | |
| 6 | | | | | | | | |
| 7 | | | | | | | | |
| 8 | | | | | | | | |

- **Una fila por venta**, con la hora al minuto. El SKU está en la etiqueta de la prenda; si no tiene etiqueta, describe la prenda.
- **Medio de pago:** efectivo, tarjeta, Yape, Plin o transferencia. Con tarjeta, Yape, Plin o transferencia, el **n.º de operación**
  es obligatorio. Si pagó con dos medios, anota los dos con su monto.
- **Descuento:** las mismas reglas de siempre; anota cuánto y por qué.
- **Comprobante:** si la clienta lo pide, anota su DNI o RUC y su nombre (con RUC, la razón social).
  **Qué se le entrega en ese momento y en qué plazo se emite: Por confirmar con Felipe / contador.** No inventes un comprobante.
- El efectivo va a la caja como siempre. La hoja no se bota: al final va al líder.

## Cuando vuelve el sistema: pasar las ventas

1. Asegúrate de que el sistema funciona: abre, te deja entrar y cobra.
2. **Con la caja abierta y antes de cerrarla**, pasa las ventas de la hoja **en orden**, una por una, en el Punto de venta:
   las mismas prendas, precio, descuento, medio de pago y monto.
3. En **«Nota para esta venta»** escribe: `Papel · hoja 3 · 15:42 · op. 123456` (hoja, hora real y n.º de operación).
4. En **«¿Quién está atendiendo?»** elige a quien vendió. Si no está de turno, elige a quien la pasa y agrega a la nota
   «vendió Ana».
5. Si pidió comprobante, elige boleta o factura con sus datos (ver «Por confirmar» arriba).
6. Marca ✓ y la hora en la hoja. Al terminar, la suma de la hoja por medio de pago tiene que dar lo mismo que sumó el sistema.

**Lo que tienes que saber:**

- La venta queda con **la fecha y hora en que la pasas**, no con la de la hoja: el sistema no acepta una fecha pasada. La hora
  real queda en la nota y en la hoja.
- Si hay comprobante, sale con la fecha del día en que se pasa. *(Si eso vale ante SUNAT: Por confirmar con Felipe / contador.)*
- Hasta que las pases, el sistema cree que esas prendas siguen en la tienda: pásalas antes de hacer traslados o conteos.
- Si el sistema vuelve otro día, o la caja de ese día nunca se abrió en el sistema, avisa al líder antes de pasarlas.
  *(Por confirmar con Felipe cómo se cuadra ese efectivo.)*

---

<sub>Para quien mantiene el sistema (2026-09-23): `registrar_venta` no recibe fecha (`ventas.created_at` toma `now()`, verificado en
local y en producción) y exige una caja abierta; `venta_pagos` no tiene columna para el n.º de operación, por eso va en la
nota. La venta sin conexión es la cola de `lib/ventas-offline.ts` (ADR-0063, que recupera el ADR-0036 de V1): solo se activa
ante un fallo de red (`esFalloDeRed`), guarda en el navegador de esa sede y reenvía la venta tal cual cuando vuelve la red.</sub>
