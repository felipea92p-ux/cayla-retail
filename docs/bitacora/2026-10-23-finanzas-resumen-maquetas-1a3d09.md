# 2026-10-23 · El telar de Finanzas: el Resumen

- **Qué:** el Resumen sobre la barra común (ADR-0493):
  - la cabecera con la respuesta («¿Cuánto te deja octubre?»);
  - el orillo de lo vendido por sede;
  - el recorrido de la plata (`RecorridoPlata`), al lado de «Hoy te toca»;
  - la línea de ventas contra la meta y el dock.

  Antes, cuatro arreglos de la auditoría v3 (`docs/maquetas/finanzas-v3-2026-10/resumen/README.md`):
  - «cubre 100 %» sin gastos;
  - la pérdida pintada en verde;
  - el «S/ 396.00»;
  - el error crudo en inglés.
- **Por qué:** Felipe eligió «El telar» para todo Finanzas. Además, el mes de la barra no filtraba el Resumen: ahora la respuesta, el
  orillo y el recorrido salen del Estado de resultados del mes elegido. Lo que faltó en caja va en su propio hilo, decisión de Felipe.
- **Qué falta:** `/formidable` con el OK de Felipe. El flujo de caja por sede necesita base (sesión de ADR-0433). Las clases `fin-pulso-*`
  que ya nadie usa en `finanzas.css` y `/finanzas` en `CON_TOPE_DE_ANCHO` son de los seis submódulos.
