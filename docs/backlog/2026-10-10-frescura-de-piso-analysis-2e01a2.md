## Inventario ▸ Frescura del piso: la tienda de un vistazo (2026-10-10) — rama `claude/frescura-de-piso-analysis-2e01a2`

Decisiones de Felipe y técnicas en ADR-0208, «Actualización 2026-10-10 (b)». Lista de `/construir` aprobada por Felipe el 2026-10-10;
una actividad por commit, sin migración en ninguna.

- [x] 0 · Rama al día con `main` (`27b99e57`, con el #922 de Formidable), ADR-0208 con las 7 decisiones, fila en `SESIONES-ACTIVAS.md`, este archivo y la bitácora.
- [ ] 1 · **La regla:** cada unidad se juzga por sus días colgada (FIFO) contra la vara de su categoría congelada el día 1 (89 días hasta las 00:00 de Lima); con menos de 10 ventas en la vara del mes, la curva viva y «aún aprendiendo su ritmo». Pruebas puras: el polo de 8 días contra 9 es fresco, reponer no envejece, un mes lento sube «envejeciendo».
- [ ] 2 · **La barra de la tienda por familia** (Indumentaria arriba; Bisutería y Accesorios en su línea), Fresca · Vigente · Envejeciendo · Sin fecha, en unidades y con soles a precio de lista; las dos puertas de `preparacionDeSede`; AQP dice la verdad y lo que se lleva la gente según lo anotado. Navegador local, claro y oscuro.
- [ ] 3 · **Contra el mes anterior:** la barra de hace 4 semanas reconstruida desde el libro y la frase «más fresca / más vieja que hace un mes»; callada hasta tener 4 semanas (~27-oct). Si los 120 días no alcanzan, se propone la foto diaria aparte (migración, OK de Felipe).
- [ ] 4 · **Lo que mueve la aguja:** hasta 3 categorías por ritmo contra su vara del mes («antes 9 días, ahora 15») y por lo que ocupan del piso contra lo que venden (unidad-días del libro, contracción, anotadas como chequeo); su acción: completa tallas → cambia de lugar → trasladar (líder).
- [ ] 5 · **Sin estrenar:** lo del almacén que el cliente nunca vio colgado en esta tienda, con un botón a Bajar al piso ya cargado.
- [ ] 6 · **Las prendas con el mismo idioma:** lista plegada abajo, chips Fresca / Vigente / Envejeciendo, «Hay que moverla» como acción; «Por decidir» con evidencia (q90 de Gamma(3+O, 3+E) < 0,7); se corrige el comentario del «1 de 7».
- [ ] 7 · **CAYLA Global ▸ Frescura:** `frescura` en la vista global (`lib/vista-global.ts`), una barra por tienda en la misma escala, el total y la cuadrícula categoría × tienda; para quien tenga `cayla_global`.
- [ ] 8 · **Cierre:** `/formidable` (incluida la prueba de «Vigente»), `tema:auditar`, `/unificar`, `/focus`, ARQUITECTURA, bitácora y PR.
- [ ] **Después, con migración y OK de Felipe:** foto diaria `frescura_foto_diaria` (tendencia larga; un gerente que no es líder en CAYLA Global), aviso al Taller por poca novedad, ciclo de visita medido con el club.
