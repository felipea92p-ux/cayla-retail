## SQL pegado: la casilla, comprobada en producción (2026-10-12, ADR-0251 act.)
- [x] **El CI aplica las migraciones de un PR una por una y sube sus huellas** (`huellas-del-pr.mjs`, artefacto `huellas-del-pr`), apenas
  la base está arriba.
- [x] **«SQL pegado» compara esas huellas con producción** cuando el PR marca «SQL pegado en producción» (`sql-en-produccion.sh` /
  `.mjs`), con la llave de la revisión diaria. Publica solo nombres de archivo del PR, nunca objetos.
- [x] Pruebas: lógica pura, el script del check con `gh`/`curl` falsos (cada «no pude mirar» sale rojo) y de punta a punta contra un
  Postgres (en el CI, una base aparte del mismo contenedor). Verificado con datos reales: #973 sale ✓; un cambio sin pegar, ✗.
- [ ] **Primera corrida real:** el próximo PR con migraciones. Mirar que «Guardar huellas del PR» suba el artefacto y que «SQL pegado»
  diga ✓/✗ por archivo. Si el CI no deja huellas, el check sale rojo diciéndolo (no verde).
- [ ] **La revisión diaria («Producción ≠ main», aviso #612) está en rojo todos los días desde el 2026-10-03.** Medido hoy en privado:
  nada de main falta en producción; todo es producción adelantada (SQL de PR abiertos, respaldos) y 6 funciones con otra versión.
  Decisión de Felipe: que pinte rojo solo cuando main tiene algo que producción no, y lo adelantado vaya como nota. Así el rojo vuelve a
  significar algo.
- [ ] **Las 6 funciones con otra versión en producción** se miran en privado (`deriva.sql` + `pnpm migraciones:deriva`): una ya
  verificada tiene el último cambio de main y algo más encima. Traer a main lo que solo vive en producción, función por función.
