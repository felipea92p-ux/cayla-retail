# Auditoría al milímetro — Mis compras ▸ Apunte de compras, paso 3 «Papel y pago» · 2026-11-13 · `claude/mis-compras-medio-sin-elegir`

Medido: 1440×900 claro vivo · 375×812 oscuro táctil · Servidor local, base desechable con todas las migraciones; compra de prueba armada por la pantalla.
Raíz de los medidores: el `<form>` del paso 3.

Resumen: **0 graves · 0 medias · 0 leves abiertos** en lo que cambió · **1 grave arreglada** (de antes, en la misma pantalla) · 3 «revisar» descartados.

## Lo que cambió (decisión B de la auditoría del 2026-11-12, Felipe 2026-11-13: «sin elegir»)
- «¿Con qué pagaste?» llega **sin medio elegido** (`PAGO_DE_FABRICA.medio = null`): las tres fichas sin marcar (`aria-checked` en las tres = false;
  una sola parada de Tab, la primera), la guía dice «Sigue: Con qué pagaste» y, al pulsar «Guardar la compra» sin elegir, el error sale bajo las fichas
  («Elige con qué pagaste.») y el pie lo lista en «Falta». Nada se guarda.
- «Tu compra» (panel derecho) decía «Sigue: guardar la compra» mientras la guía pedía otro campo; ahora dice el mismo campo que la guía («Sigue: con qué pagaste»).
- Fichas: 110×50 a 1440 y 109×50 a 375 (sobre los 44 px del dedo); sin desborde horizontal (`scrollWidth` 375).

## Grave arreglada (ya estaba)
1. La ayuda de la tarjeta elegida de «¿Qué papel te dieron?» («No me dieron nada») en taupe sobre la tarjeta hundida: **4,18:1** (WCAG 1.4.3 pide 4,5)
   — `components/mi-plata/RegistrarCompra.tsx` (tarjetas de papel y de «¿Quién paga?») — `[Norma]` — /color. Elegida, la ayuda va en `text-tinta/75`:
   claro 0 textos que fallan en el medidor; oscuro 9,56:1 sobre el negro cálido y 8,98:1 sobre el gris del cajón.

## Revisar descartado
- Borde de las fichas de medio de pago 1,16:1 (`controlFalla` 3): las fichas son la pieza compartida de Vender (`FichasMedio`, `.hoja-cobro-medio`) y se
  identifican por su texto, su ícono y su franja de color, no por el borde; 1.4.11 no lo exige. Si se quiere un borde que se vea con las tres sin elegir,
  es una propuesta para la pieza compartida (Vender, gasto rápido, pedidos web), no para esta pantalla.
- `montoMal «S/64.00»`: es la caja del monto con su prefijo «S/» separado del número; en pantalla se lee «S/ 64.00».
- `botonEnDos «Paga Compras · Después, desde Por pagar»`: es la opción en tarjeta (título y ayuda), decidida así.

## Notas del resto de la pantalla (ya estaban, no son de este cambio)
- Nombres de las fichas a 9,6 px en versalitas (`.hoja-cobro-nombre`): de la pieza compartida.
- `/espacio` marca 5 valores fuera de escala, 17 medios pasos y 1 grupo con la proximidad rota en el formulario: de la pantalla, para su propia auditoría.
- Bajo 44 px con dedo: «Animaciones» del marco (36) y la flecha «Volver al paso anterior» (42).

## Sin medir
- Foco con Tab real y la vista quieta en este paso (la pieza cambiada no agrega controles ni movimiento). Gráficos: no hay.
