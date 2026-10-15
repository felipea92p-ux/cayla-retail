## Compras ▸ Plan de campaña: «Fijar un mínimo» con el módulo (2026-10-15) — rama `claude/plan-minimo-con-modulo-9b0c82`

- **Qué:** el mínimo de una tienda en una campaña (lo que le toca a Lima aunque venda poco) lo fija quien tiene el módulo «Plan de campaña»,
  sea o no líder (ADR-0362, decisión 64). Y el plan se bloquea al sumar los mínimos: dos personas a la vez ya no pueden pasar del 100 %.
  De paso, el documento de traspaso de Compras quedó con el estado de hoy (~96 de 100; falta la fase 5b).
- **Por qué:** era el último «solo un líder» del Plan; el tope y el % de lo que sobra ya eran del módulo (ADR-0387). Al abrirlo a más
  personas apareció la carrera: con el bloqueo de antes, la prueba de dos sesiones dejaba la campaña en 120 %.
- **Cómo:** `20261015141000` (reemplazo anclado sobre la función viva, misma huella en producción y en el banco), `pruebas:plan-compra-minimo`
  (6/6; sin la migración, 2/6, con «120 %» en la de dos sesiones) y las vecinas en verde (`plan-compra` 29/29, `plan-compra-historia` 18/18,
  `compras-llave` 37/37). Pegada en producción con el OK de Felipe (`20261015141027`, huella igual al banco). En la web, el botón ya no
  depende de ser líder y los textos dicen quién lo fija; «Campaña nueva» sigue siendo de un líder (escribe en Etiquetas).
