# Auditoría al milímetro — `/recibir/envio/[id]` ▸ hoja «Crear la prenda que llegó» ▸ ficha «Igual que la anterior» · 2026-11-14 · `claude/recibir-igual-que-anterior-7212c1`
Medido: 1440×900 claro (quieto) · 1440 oscuro · foco con teclado     Servidor: local (puerto 3012)
Resumen: 0 graves · 1 media (de las piezas del sistema) · 0 leves · 0 decididos a propósito

La ficha se arma solo con piezas del sistema: la placa `nota-cayla sin-i`, `<FiltroPuesto>` (un dato que se quita con su ✕) y `<Boton peso="fantasma" className="btn-chico">` («Usar»).
En `NuevoModelo`, la oferta de marca repite el patrón de «Usar ese nombre» de la misma hoja: un texto de 14 px en taupe con su `btn-enlace`.

## Graves
Ninguna. Color: 0 textos que fallen en claro ni en oscuro (37 medidos). Estados: 0 apagados y 0 ocupados que se puedan pulsar. Espacio: 0 blancos bajo 24 px.
Tipografía: 0 textos de lectura bajo 14 px; la línea «Igual que …» mide 15 px. Foco: visible en los 4 controles y ninguno tapado.

## Medias
1. Anillo de foco de 1,25:1 en las píldoras y en «Usar» (`button.vacio-filtro`, `button.btn-cayla.btn-secundario`) — WCAG 2.4.13, que es AAA. Es el anillo de las piezas del sistema
   sobre la hoja de vidrio, no de esta ficha: va a `/color` como asunto de las piezas, no de este PR.

## Leves
Ninguna.

## Sin medir
- 375 px: Recibir es de escritorio (PL-105 no la incluye).
- El color de las píldoras en oscuro salió «no concluyente» (1,09:1) para el medidor por su animación de entrada; a ojo, crema sobre tinta, como en todo `FiltroPuesto`.
- Movimiento: medido en quieto. La ficha no agrega animación propia, solo la entrada `anim-entrada` de `FiltroPuesto`.
- Lo que los medidores marcaron fuera de la ficha (versalitas de 10,5 px de `PuntosAvance`, el borde de 2,35:1 del combo del nombre, un desajuste de hidratación del Dial) es de antes.
