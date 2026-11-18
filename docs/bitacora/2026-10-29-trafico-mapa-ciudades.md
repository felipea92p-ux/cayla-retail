# 2026-10-29 · Tráfico, el mapa y la lista de ciudades (rama trafico-mapa-ciudades)

- **Qué:** Felipe pidió, mirando la pantalla publicada, que el mapa diga un solo «Lima» (el contorno trae aparte Lima provincias, Lima
  Metropolitana y el Callao), que al pasar el mouse por una ciudad de la lista se ilumine en el mapa, y que la lista muestre solo las 5 con más
  gente y el resto en «Otras ciudades». `regionEnElMapa` junta los tres de Lima (nombre «Lima», la cifra de los tres y el mismo color);
  `ciudadesDeLaLista` arma las 5 (más la filtrada, si no está) y suma lo demás —otras ciudades, el extranjero, sin dato— en «Otras ciudades», que
  no filtra pero ilumina sus departamentos. Sin cambio en la base.
- **Verificado:** vitest de reglas 100/100 (3 casos nuevos), movimiento, tokens, hover, unificar, guías y colores, tsc y knip; en el navegador con
  una página temporal (ya borrada) con las cifras de la captura de Felipe: el globito de Lima Metropolitana y del Callao dice «Lima · 32», y el
  mouse sobre «Lima» y sobre «Otras ciudades» ilumina sus departamentos.
