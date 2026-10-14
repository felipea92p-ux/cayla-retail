# Formidable · Compras ▸ Órdenes de compra ▸ Registrar el comprobante de una orden   (`/compras/ordenes/comprobante/[id]`)

- **Fecha / SHA:** 2026-10-12 · fase 5a (`claude/purchase-order-phase5-9b0c82`) · **Dispositivo que manda:** escritorio y 375 px (se usa en Gamarra)
- **Pregunta que debería resolver (1 frase):** «¿Qué compré, a cuánto, con qué papel y cómo lo pagué?» · **Protagonista:** el dinero de la compra
- **Veredicto en una línea:** «Se termina sin ayuda, pero arranca con cinco respuestas que no son las de la compradora (factura, crédito,
  IGV, transferencia y la caja de otra sede) y aun así dice “Todo listo”: lo más peligroso es guardar sin darse cuenta.»

> Informe parcial, hecho de noche sin el panel del navegador visible: hay **prueba ciega** (un agente, Opus, con una ventana que maneja la
> pantalla real del banco y devuelve texto y captura) pero **sin medir el oficio visual** ni escéptico; las notas son provisionales.

## Notas (0–10, provisionales)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 6 | [Observado] ciega: terminó la tarea (SC-000050 · Sin comprobante · Contado · Pagada) en 13 pasos, con 4 dudas de fondo · real: sin probar |
| 4 Lenguaje de tienda | 6 | [Observado] dudó del botón «Registrar comprobante» sin tener comprobante; «Llegó en papel», «el papel que ya llegó» y «Papel completo» le sonaron raros en una compra sin papel; «Generada» no le dijo nada después de pagar |
| 7 Perdonar antes que preguntar | 4 | [Observado] cinco valores puestos en contra de su caso (FACTURA, CRÉDITO, IGV encendido → S/ 580.56 contra los S/ 492 de la orden, TRANSFERENCIA, «Sale de: Caja fuerte · Tienda Trujillo») y el pie decía «Todo listo» / «puedes seguir así»: es dinero, y un valor de fábrica equivocado se guarda sin que nadie lo note |
| 9 De punta a punta | 6 | [Observado] después de guardar, la lista dice «Recién guardada» pero el estado sigue «Generada»: tuvo que abrir la orden para saber que quedó pagada |
| Oficio visual | sin medir | — |

## Los 3 cambios de mayor impacto (esperan tu OK)
1. **Antes →** el formulario arranca con FACTURA, CRÉDITO e IGV puestos (el total arriba dice S/ 580.56) y el pie dice «Faltan: Tipo de papel» aunque se ve
   FACTURA elegida. **Después →** no viene nada elegido en «¿Qué papel te dieron?» ni en «¿Cómo se paga?»: el total muestra lo de la orden (S/ 492.00) y el IGV
   aparece solo al elegir factura; el medio de pago al contado tampoco viene puesto. **Ley:** 7 y 1 (un valor de fábrica que importa no se adivina). **Se
   verifica:** la misma prueba ciega no se encuentra con ningún valor que no eligió. **Esfuerzo:** S. **Decide:** Felipe (toca cómo se registra dinero).
2. **Antes →** el botón de la orden dice «Registrar comprobante» aunque la compra no tenga papel. **Después →** «Registrar la compra» (y adentro, los cuatro
   tipos: boleta, nota de venta, factura o sin comprobante); el título de la página, «Compra de OC-002783». **Ley:** 4 y 1. **Esfuerzo:** S. **Decide:** Felipe.
3. **Antes →** la lista de órdenes arranca filtrada en la sede donde se trabaja (decisión 37) y buscar «OC-002783», que llega a Trujillo, decía «Ninguna orden
   coincide». **Después →** si lo buscado no está en la sede filtrada pero sí en otra, se muestra igual con «Está en Tienda Trujillo · ver en todas las sedes»
   (o la búsqueda mira todas las sedes). **Ley:** 1 y 9. **Esfuerzo:** S–M. **Decide:** Felipe (la 37 es suya).

## Lo que no pediste y importa más
La compra quedó con «Sale de: Caja fuerte · Tienda Lima» porque la compradora no sabía de dónde salió la plata en Gamarra: hasta que exista su fondo por
rendir (fase 6) cualquier pago al contado de una compra en Gamarra va a salir de una caja que no es la real. Es la razón de fondo para priorizar la fase 6.

## Lista aparte (no se ejecuta)
- La fecha de la compra quedó antes de la emisión de la orden sin ningún aviso (puede ser verdad: se compró y después se hizo la orden).
- Después de guardar no vio el aviso de éxito (pudo ser la ventana de la prueba: el aviso sale después del loader).
- En Por pagar, «% pagado a tiempo — Aparecen con el primer comprobante pagado» con un comprobante ya pagado (pide dos o más).
- Las esperas «Está tardando más de lo normal» son del servidor de desarrollo compilando cada ruta la primera vez, no de producción.

## Prueba ciega (2026-10-12, Opus, cuenta de Felipe, banco)
| Medida | Resultado |
|---|---|
| Lectura de 5 s | «la lista de pedidos a proveedores»; no notó que venía filtrada en Tienda Lima |
| Primer intento | no: la búsqueda falló por el filtro de sede |
| Pasos | 13 |
| Dudas | el filtro de sede; el nombre del botón; FACTURA marcada y «Faltan: Tipo de papel»; el total con IGV; CRÉDITO y TRANSFERENCIA puestos; de qué caja salió la plata; la fecha; «la deuda queda en…» pagando al contado; «Generada» después de pagar |
| Palabras no entendidas | «Abierto» (en un envío), «Llegó en papel» / «Papel completo» sin papel, «Efectivo por rendir» |
| Errores evitables | buscar con un filtro que no eligió; cinco valores de fábrica en contra de su caso |
| ¿Terminó? | sí: SC-000050 · Sin comprobante · Contado · 11/10/2026 · S/ 492.00 · Pagada |

## Antes de decir «listo»
- Concurrencia: [Medido] dos sesiones con el mismo papel → una entra y la otra lee «Ese comprobante ya está registrado» (fase 2).
- Caída externa: el corte de señal dice «no sabemos si llegó: vuelve a pulsar sin cambiar nada» y el token hace seguro el reintento.
- Persona sin contexto: ciega ✓ (arriba) · real: sin probar.

## Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-10-12 | fase 5a | 5,5 (provisional, 4 leyes) | sin medir | — |
