## 🧾 Qué se hizo (2026-10-30) — solo medición y documentación, sin migración; rama `claude/nostalgic-knuth-9ae74d`

Continúa el arreglo de los rojos intermitentes de CLAURE (`bff3954ea`, `scripts/pruebas/_claure_prendas.mjs`):
ahí quedó abierto si las otras pruebas que eligen «la primera prenda por id» eran bombas iguales.

- [x] Medidas las **41** pruebas de `scripts/pruebas/*.mjs` que eligen «la primera variante o producto por id»
      (`grep -lnE "from retail\.(variantes|productos)[^;]*order by [a-z]*\.?id limit 1"`, sin el ayudante ni las
      suites de CLAURE), sorteo por sorteo con `offset K`: **ninguna es una bomba**.
- [x] Validado el arnés antes de creerle: la misma suite de CLAURE en su forma ANTERIOR al arreglo sale roja en
      **9 de 42** sorteos con la firma exacta del CI (`se esperaba 3|1 y salió 2|1`).
- [x] Documentado el porqué: la bomba de CLAURE no era elegir al azar, sino elegir **y cambiar el dueño** del
      producto. Estas 41 solo suman sobre la prenda, miden en relativo o se crean su propia variante.
- [x] Base privada propia (Postgres 17 de Homebrew, 987 migraciones, 0 errores), clonada en 4 para barrer en
      paralelo. **No** se tocó la base compartida de Docker.
- [ ] **No medido:** el mismo «primera fila por id» sobre OTRAS tablas que el seed inserta sin id
      (`retail.sububicaciones` en `tienda_avisos_al_entrar.mjs`, `tienda_club.mjs`, `perdidas.mjs`; `retail.cajas`,
      `retail.cuentas_dinero`). El encargo acotaba a `variantes`/`productos`; la bomba es de la misma familia y el
      arnés ya sabe medirla.
- [ ] **Límite del método:** con 2+ sitios de sorteo en un archivo se barre la diagonal (mismo K en todos), no
      todas las combinaciones. Para un archivo de un solo sitio es exhaustivo. `precio_sede.mjs` (5 sitios) y
      `tienda_empresas.mjs` (4) quedan medidos solo en diagonal.
- [ ] **Riesgo que sigue en pie en el arreglo de `main`** (de diseño, no un bug): `PRODUCTO_SIN_HISTORIA` ENUMERA
      las tablas con historia de prenda. Una tabla nueva con historia que nadie sume ahí devuelve el rojo
      intermitente a las suites de CLAURE. Hoy nada lo vigila.
- [ ] **Artefacto de mi arnés, no del repo:** `precio_sede.mjs` falla su caso 30 en la base privada con y sin
      `offset` (idéntico en los 5 sorteos). En el CI de `main` pasa (corrida 41152379490, verde), así que es
      diferencia entre `supabase start` y el Postgres de Homebrew con `bootstrap.sql` de `.entorno-local`.
      No se investigó: no es una bomba del sorteo.
