## 🧪 Pruebas de CLAURE: la escena crea sus prendas (2026-10-30) — solo pruebas y CI, sin migración; rama `claude/determined-villani-6b5355`

- [x] `scripts/pruebas/_prendas_de_prueba.mjs`: la escena CREA la prenda A (de CLAURE) y la B (de CAYLA) dentro de su
      transacción, con los mismos nombres de variables (`:'p_a'`, `:'p_b'`, `:'va_a'`, `:'va_b'`). Antes tomaban
      prestada «la primera prenda por id», que el seed sortea (`gen_random_uuid()`): cuando el sorteo caía en una de
      las 5 prendas con historia del seed, esa historia se contaba como de CLAURE y el CI salía rojo.
- [x] Las 13 suites que usaban el patrón pasaron al ayudante: `claure_cuenta`, `claure_perdidas_y_danadas`,
      `claure_fuera_de_las_cifras`, `claure_apartados_y_pedidos_web`, `claure_club_y_clientes`, `claure_cambios`,
      `claure_cierre`, `claure_efectivo_claudia`, `claure_igv`, `claure_inicio_y_observatorio`,
      `claure_motores_con_cifra`, `claure_proyeccion`, `claure_rendimiento_y_metas`.
- [x] Control: barrido de los 49 sorteos posibles contra una base privada. Antes del arreglo, 40 de 147 corridas rojas
      en las tres suites del informe, con los mensajes exactos del CI; después, 147/147 verdes. Las otras 10, igual.
- [x] `scripts/ci/pruebas-postgres-duraciones.json`: de 189 a 394 medidas (corrida 41137549225). Las 19 suites de
      CLAURE y `pruebas:materiales` estaban sin medir.
- [ ] **Sin tocar (otras pruebas con «la primera que encuentres»):** `tienda_avisos_al_entrar.mjs` y `tienda_club.mjs`
      eligen la variante igual (`from retail.variantes va order by va.id limit 1`), dentro de un cuerpo plpgsql y sin
      cambiarle el dueño a nadie, así que el barrido NO pudo medirlas (su línea no es un `\gset`). Riesgo menor, pero
      si alguna vez miden algo absoluto sobre esa prenda, les toca el mismo ayudante.
- [ ] **Sin verificar en el CI:** el barrido corrió en una base privada. Falta ver las 4 tandas verdes varias veces
      seguidas en GitHub Actions con el reparto nuevo.
