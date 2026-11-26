# Formidable (rápido) — Vender ▸ «Mandar a la caja» y «Del piso» · 2026-11-24 · `claude/tickets-compartidos-0511`

Modo `rapido`: solo la medición (paso 1), sin prueba ciega ni agentes. Medido con `referencia/medir-oficio.js` a 1440 × 900 sobre `/vender` con un
ticket del piso esperando, en una base local con el seed; lo que se reporta abajo es lo que cae en las piezas nuevas.

## Medido

- **Oficio, en las piezas nuevas:** 0 blancos bajo 24 px, 0 textos chicos, 0 con poco contraste, 0 bordes casi alineados, 0 rojos de más. Lo que
  el medidor cuenta en la página (9 bordes casi alineados, 13 radios, 5 filas desiguales, 4 textos de 10 px) es del catálogo y del marco: ya estaba.
- **Una acción principal:** el medidor cuenta 1 en la pantalla (Cobrar). «Mandar a la caja» va en peso secundario sobre ella y «Abrir» en la lista.

## Observado (sin agentes)

- **Ley 1, sin manual:** cada fila dice quién lo mandó, cuántas prendas, cuánto y hace cuánto; el verbo del botón es el de la acción («Abrir»).
- **Ley 2, una pregunta:** con el ticket vacío, lo primero que ve la caja es lo que espera del piso; con el ticket ocupado, un solo chip con el número.
- **Ley 7, perdonar:** descartar pide confirmación (no se deshace); mandar y abrir no piden nada porque el ticket no se pierde.
- **Ley 9, de punta a punta:** sin red al mandar, el ticket se queda en el equipo; la hoja «Del piso» vacía dice «Ya no queda ninguno esperando».

## Sin medir

- Prueba ciega con una persona sin contexto (sin agentes en este modo) y con una integrante de TRU.
- 1024 × 768 y la lista dentro de la hoja del celular a 375 px.
