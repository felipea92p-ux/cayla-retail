# ADR-0584 · Al apartar se puede descontar a mano, con las mismas reglas de la venta

- **Fecha:** 2026-10-30 · **Estado:** construido y probado en local (base con todas las migraciones y datos inventados). **Migraciones sin pegar en producción:** `20261030220000_apartar_con_descuento_manual.sql` (y la de agregar prendas, `20261030221000`, de la actividad 3).
- **Pedido (Felipe, 2026-10-30):** «al momento de separar una prenda, que permita aplicar descuentos también como en la venta».
- **Decisiones de Felipe (las tres recomendadas):** las mismas reglas de la venta; el descuento del ticket de Vender viaja a Apartar; al agregar prendas a un apartado ya hecho también se puede descontar.
- **Complementa:** ADR-0166 (apartados con adelanto), R-45 / ADR-0153 (motivo y escalonado del descuento de venta), ADR-0403 (precio sin céntimos sueltos), ADR-0486 (campañas por sede).

## El problema primero

Una clienta pide un 10 % para cerrar la venta y la colaboradora se lo da. Si en vez de llevársela la deja apartada, hasta hoy no
podía: `separar_prendas` aceptaba **solo** el descuento de la campaña («el único descuento permitido es la campaña vigente… sin
descuentos manuales», 20260923090000). Eso obliga a una de dos cosas malas: decirle a la clienta que no, o venderle la prenda y
«apartarla» por fuera del sistema, sin adelanto registrado.

Y había una mentira escondida esperando: `entregar_separacion` escribe la venta marcando **«campaña»** todo descuento de la línea.
Con un descuento a mano eso habría dejado en `venta_items` un descuento de campaña sin etiqueta (el candado
`venta_items_campana_coherente` lo rechaza) o, peor, un margen perdido sin motivo.

## Qué se decidió

```
DECIDÍ:    La regla del descuento a mano es UNA función de la base, `retail.fn_exigir_descuento_manual`, copia exacta de la de
           `registrar_venta`: solo si supera a la campaña, motivo de la lista (y detalle si es «Otro»), nunca bajo el costo ni
           gratis, un Líder no pasa del 35 %, argumento escrito pasado el 15 %. Los errores tienen los MISMOS nombres que en la
           venta, así que la web ya los traduce. `separar_prendas` la llama; la línea guarda el motivo, el detalle y el argumento;
           la entrega los lleva a la venta.
DESCARTÉ:  Que `registrar_venta` también llame a la función nueva: su versión viva lleva más de veinte parches anclados, y cortar
           su bloque del descuento es tocar lo que cobra la caja, con su propio OK. Mientras tanto la regla vive en dos lugares y
           `scripts/pruebas/apartar_con_descuento.mjs` corre cada rechazo en Apartar Y en la venta y exige el mismo error: si una
           cambia sin la otra, el CI falla.
DESCARTÉ:  Una tabla aparte para el descuento del apartado: es una propiedad de la línea, como en `venta_items`.
DESCARTÉ:  Llevar el descuento del ticket a Apartar en la URL: lleva un motivo y un argumento escritos. Va en el `sessionStorage`
           de la pestaña, atado a las mismas prendas (si cambiaron, no se usa).
SE ROMPE SI: alguien cambia el escalonado en `registrar_venta` y no en `fn_exigir_descuento_manual` (la prueba gemela lo caza), o
           pega la web nueva antes que la base (un apartado con descuento a mano se rechaza con `separacion_descuento_no_coincide`,
           sin guardar nada: molesta, no descuadra).
```

1. **Base** (`20261030220000`):
   - `separacion_items` gana `motivo_descuento`, `motivo_descuento_detalle` y `argumento_descuento`;
   - el candado «descuento ⇔ etiqueta de campaña» pasa a ser «descuento ⇔ etiqueta **o** motivo, nunca los dos» (`separacion_items_descuento_con_origen`);
   - el motivo tiene su lista (`separacion_items_motivo_descuento_valido`);
   - todos los cambios a funciones son reemplazos ANCLADOS sobre la definición viva (ADR-0288).
2. **Cómo distingue la base un descuento a mano:** si una prenda trae un descuento **mayor** que el de su campaña (más un céntimo) y un motivo que no es «campana», es a mano y se exige con la regla. Si no, todo sigue como antes: la campaña es obligatoria y exacta. Un descuento a mano sin motivo responde `venta_descuento_requiere_motivo`, como en la venta.
3. **Web:**
   - Apartar tiene su hoja **«Descuento»** (`components/apartados/DescuentoApartado.tsx`): % o S/, atajos, motivo, argumento pasado el 15 % y a qué prendas, con la guía de foco. Las cuentas son las del ticket (`lib/apartar-descuento-reglas.ts` sobre `vender-reglas.ts`): el % deja el precio sin céntimos sueltos; en S/ el monto es del total de lo elegido y se reparte según el precio; si la campaña da igual o más, gana la campaña.
   - Cada línea muestra su descuento y su motivo, con «Cambiar».
   - El total, el adelanto sugerido (30 %, la mitad, todo) y el saldo ya lo descuentan.
4. **Del ticket a Apartar:** el descuento a mano de cada prenda viaja si todas sus líneas del ticket llevan el mismo. Con dos distintos no se adivina: llega sin descuento y se avisa. La campaña no viaja (Apartar la pone sola con la de hoy) ni la parte del Club.

## Cómo se verifica

- `pnpm pruebas:apartar-con-descuento`: 19 casos. Apartar con 10 % (total 71.90, motivo guardado, sin etiqueta); recoger (la venta lleva el mismo descuento, motivo y argumento, y cobra el saldo justo); cada regla rechaza igual al apartar que al vender; el candado de origen; la migración se pega dos veces sin cambiar nada.
- `pnpm pruebas:separaciones` sigue 101/101. Se actualizó UN caso a propósito: «un descuento manual se rechaza» pasa a ser «un descuento manual **sin motivo** se rechaza».
- `lib/apartar-descuento-reglas.test.ts` y `lib/apartar-desde-ticket-descuento.test.ts`.
- En el navegador (local):
  - APT-LIM-0001, Blusa Emma S/ 79.90 con 10 % «Cerrar la venta» → total 71.90, adelanto 22.00, saldo 49.90; en la base: `descuento_unitario` 8.00, `motivo_descuento` `cerrar_venta`, `fn_verificar_separaciones()` = 0.
  - Del ticket de Vender con 10 % «Prenda con desperfecto» → Apartar llega con el mismo descuento y total.

## Producción

Pegar `20261030220000` **solo con el OK de Felipe** (cambia lo que acepta Apartar y lo que escribe la entrega), **antes** de publicar la
web. Una sola parte (alter + funciones, sin políticas, ADR-0195), idempotente, `lock_timeout` 3 s.
