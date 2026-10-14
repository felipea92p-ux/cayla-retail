## Un monto no se parte en todo el ERP (2026-10-14) — rama `claude/montos-sin-corte`, ADR-0413

- **Qué:** «S/» y la cifra van con un espacio que no se parte (`\u00a0`, como `Intl` en es-PE) en todo lo que el ERP escribe: `soles` y sus
  quince copias, 173 textos en 111 archivos (plantillas, sumas y texto de JSX con `&nbsp;`). Lo que llega de la base (38 migraciones con
  `'… S/ % …'`, las descripciones de Actividad) pasa por `montosSinCorte` al mostrarse: `traducirError`, los errores de Liquidación y la
  última acción del Inicio. `solesSinCorte` (decisión 83 de ADR-0362) queda absorbido en `soles`.
- **Por qué:** en una frase larga el renglón podía terminar en «S/» y dejar la cifra abajo (Fondos por rendir, /formidable). La causa era
  una sola, el espacio normal donde nace el monto; arreglarlo frase por frase dejaba la forma mala para la próxima pantalla.
- **Cómo:** una transformación sobre el árbol del código (solo textos y JSX), revisada caso por caso; fuera a propósito lo que se guarda en
  la cola de Lucode (`ya-emitido-reglas.ts`, con `// monto-partible:`), los `placeholder` y los exportes. Lo vigila
  `lib/montos-sin-corte.test.ts`. 159 523 pruebas de la web en verde; recorrido en el navegador del banco, en todas las pantallas.
