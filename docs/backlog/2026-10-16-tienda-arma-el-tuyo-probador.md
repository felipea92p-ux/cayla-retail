## «Arma el tuyo» en la tienda (ADR-0434, PR 2: actividades 4 a 7)

- [x] **Actividad 4 — El probador en el celular** (`/looks/arma`): figura a escala, deslizar, colores, tira, «Tu look» con candados,
  «Sorpréndeme», el look en la dirección y su esqueleto de carga. Prueba en la base `pnpm pruebas:tienda-probador` (20/20) y reglas
  `apps/tienda/lib/probador.test.ts`; mirado a 375 px en claro y oscuro contra un banco propio.
- [ ] **No está en producción:** `supabase/migrations/20261017025000_tienda_probador.sql` (una función y sus permisos; se pega con el OK
  de Felipe antes de fusionar el PR 2).
- [x] **Actividad 5 — Buscar una prenda y ver todas las de una zona** («Ver todas» y «Buscar otra»): hoja a pantalla completa con la
  caja, las zonas, el conteo, tarjetas con colores y «Probar», sugerencias que salen de lo que hay y su vacío; «atrás», la flecha y
  Escape la cierran (el primer Escape borra lo escrito). El «Solo en Trujillo» del lienzo es la franja «Ver lo que hay en» de toda la
  tienda. Reglas en `apps/tienda/lib/probador-buscar.test.ts`.
- [ ] Actividad 6 — tallas y a la bolsa (el botón «Agregar a mi bolsa» de la barra de abajo).
- [ ] Actividad 7 — el probador en la computadora (hoy, la columna del celular al centro).
- [ ] Pendiente de revisar con prendas reales de producción: cómo se ve una prenda de más de 104 cm (la figura se achica entera) y las
  que asoman a los lados en modo oscuro (sobre el fondo oscuro se ven como sombras grises).
