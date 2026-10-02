# Spike v3 · Cobro sin fricción (2026-10-01)

> **Estado: en revisión con Felipe.** Sin aplicar. Tercera ronda: A/B/C (`../cobro-en-grilla-2026-10/`) y D/E/F
> (`../cobro-en-grilla-v2-2026-10/`) se descartaron. Pedido: «lo más entendible posible, con los menores clics o
> tecleos posibles, que no sea tan invasivo, pero siempre sofisticado; guíate de los mejores software».

`cobro-en-grilla-v3.html`: un solo archivo. La barra negra (no existe en el ERP) cambia entre las tres formas, entre 1 y
3 prendas, prende o apaga el **cobro de un toque**, cuenta los **toques** de la venta y tiene **▶ Ver demo**.

## Lo que se tomó de los POS de referencia
| Patrón | De dónde | Aquí |
|---|---|---|
| Un solo medio por defecto; dividir es secundario | Square, Shopify POS | «Dividir el pago entre medios» es un enlace; con un medio, el monto ya es el total. |
| Montos sugeridos de efectivo | Square, Shopify POS, Toast | Exacto + 4 sugeridos (S/59.90 → S/60, 70, 100, 200; S/223.90 → 230, 240, 250, 300) + «Otro». Un toque y sale el vuelto. Con efectivo elegido, teclear números escribe lo recibido sin tocar ningún campo. |
| Comprobante con valor por defecto | Shopify POS (cliente opcional) | Una línea «Boleta · Cliente varios · Cambiar». El popover tiene un solo campo inteligente «DNI o RUC»: 8 dígitos consulta RENIEC, 11 consulta SUNAT y ofrece «Emitir factura» en un toque. |
| Cobrar al tocar, con deshacer | Square (efectivo), Gmail (deshacer) | Si con un toque ya está todo, el botón se llena en 1,5 s y registra; tocarlo deshace. Se puede apagar. |
| Hoja lateral / barra inferior | Shopify POS / Apple Pay, Stripe | H e I dejan el catálogo a la vista. |

## Toques de una venta típica (contados por la maqueta)
- Yape, Plin, tarjeta o transferencia: **Cobrar → Yape = 2 toques**.
- Efectivo: **Cobrar → Efectivo → S/100 = 3 toques** (o Exacto).
- Con DNI: +2 toques (Cambiar, Listo/Enter) y los 8 dígitos.
- Factura: Cambiar → teclear RUC → «Emitir factura» → Listo.

## Las tres formas (mismo flujo, distinta invasión)
| | Ocupa | Para |
|---|---|---|
| **G · Mostrador** (Square) | La zona de la grilla, una columna centrada y tranquila | Si el cobro debe ser el protagonista. |
| **H · Hoja lateral** (Shopify POS) | Una hoja de 476 px pegada al ticket; al elegir medio la lista se pliega | La de menos ruido: una decisión a la vez. |
| **I · Barra inferior** (Apple Pay / Stripe) | Un tercio inferior; el catálogo sigue arriba | La menos invasiva. |

Medidas en el peor caso (3 prendas, los 5 medios divididos, efectivo con recibido, 3 Nº de operación): ninguna desborda
ni tiene scroll.

## Decisiones de negocio que esto abre (para Felipe)
1. **Cobro de un toque.** Registra la venta (y el comprobante sale a SUNAT vía Lucode) sin un «Confirmar» aparte; el
   resguardo es 1,5 s para deshacer. Si se equivoca después, es anular. ¿Se acepta o se deja «Confirmar» siempre?
2. **Efectivo sin «recibido».** Hoy el sistema no lo exige (es solo para el vuelto); aquí tampoco. Un recibido menor al
   monto se avisa en ámbar pero no bloquea, igual que hoy.
3. Celular (375 px, PL-105): sin resolver. H se traduce casi directo a una hoja que sube desde abajo.
