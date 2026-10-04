## 🧮 Con «Hoy», la lista de Existencias suma lo mismo que «Para hoy» (2026-10-04, ADR-0331 act. c) — solo web, sin migración; rama `claude/existencias-por-colgar-cuadra` (apilada sobre `claude/compassionate-lumiere-1ed7d6`, que va sobre `claude/kind-lederberg-a5bb65`)

- [x] Con un caso de «Hoy», una tarjeta por prenda (modelo + color); sin «Hoy», una por modelo. Una sola regla: `claveDeTarjeta` (`lib/existencias-tarjetas.ts`).
- [x] El número de cada opción de la barra cuenta tarjetas con esa misma regla («Por colgar · 6», antes 5).
- [x] Línea de arriba, pie y botón de la hoja de filtros: «6 prendas · 15 tallas por colgar»; «Sin stock atrás» aclara cuántas ya vienen en camino (lo que «Para hoy» descuenta).
- [x] `agruparPorModelo` (ahora `tarjetasDeExistencias`), `ordenarModelos` y `opcionesOrden` pasan del componente a `lib/`, con prueba (la escena de la semilla, todo caso de «Hoy», candado de fuente). Mutación verificada: 5 pruebas en rojo.
- [x] Verificado en local (Chrome sin ventana, Trujillo): escritorio y 375 px, «Para hoy» 15 → «Ver cuáles» → 6 tarjetas que suman 15, sin desborde ni errores de consola.
- [ ] **Choque con el PR #787 (motor del piso):** ese PR borra `ordenarPorUrgencia` (que usan `porColgarDeLaSede` de la rama de abajo y la lista sin búsqueda), cambia qué es «por colgar» y agrega «En pausa» (la pastilla sin cifra). Quien fusione segundo tiene que reconciliar `porColgarDeLaSede` con la lista del día del motor y volver a correr `lib/existencias-tarjetas.test.ts`.
- [ ] El estado vacío («Quitar Color · 2 productos») sigue contando productos aunque haya un «Hoy» puesto (la lista que trae va por prendas): darle a cada sugerencia su unidad.
- [ ] «Para hoy» dice «empieza por Blusa Valentina, Pantalón Mía y 3 más» contando modelos; la lista a la que lleva cuenta prendas. No es una cifra que se compare, pero «y 3 más» puede no coincidir con las tarjetas que siguen cuando un modelo trae dos colores.
