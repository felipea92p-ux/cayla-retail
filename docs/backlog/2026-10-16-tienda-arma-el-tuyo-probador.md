## «Arma el tuyo» en la tienda (ADR-0434, PR 2: actividades 4 a 7)

- [x] **Actividad 4 — El probador en el celular** (`/looks/arma`): figura a escala, deslizar, colores, tira, «Tu look» con candados,
  «Sorpréndeme», el look en la dirección y su esqueleto de carga. Prueba en la base `pnpm pruebas:tienda-probador` (20/20) y reglas
  `apps/tienda/lib/probador.test.ts`; mirado a 375 px en claro y oscuro contra un banco propio.
- [x] **En producción desde el 2026-10-17**, con el OK de Felipe: `supabase/migrations/20261017025000_tienda_probador.sql`, verificada
  contra la base (md5 de `tienda_probador` `4f835fad…`, solo la llama `tienda_web`). Responde con 0 prendas hasta que alguien apriete
  «Preparar recortes» en el ERP.
- [x] El volcado se refrescó el 2026-10-17: `tienda_probador` ya está en el diccionario.
- [x] **Actividad 5 — Buscar una prenda y ver todas las de una zona** («Ver todas» y «Buscar otra»): hoja a pantalla completa con la
  caja, las zonas, el conteo, tarjetas con colores y «Probar», sugerencias que salen de lo que hay y su vacío; «atrás», la flecha y
  Escape la cierran (el primer Escape borra lo escrito). El «Solo en Trujillo» del lienzo es la franja «Ver lo que hay en» de toda la
  tienda. Reglas en `apps/tienda/lib/probador-buscar.test.ts`.
- [x] **Actividad 6 — Tallas y a la bolsa:** «Agregar a mi bolsa» en la barra de abajo pide las tallas de cada prenda en su color (la
  ficha que la tienda ya guarda), abre la misma hoja de tallas de los looks y usa la misma acción de la bolsa. Probado de punta a punta
  en el banco: 3 prendas a la bolsa con su color y talla, y el total de la bolsa igual al del probador.
- [x] **Actividad 7 — El probador en la computadora:** la misma pieza reacomodada (grilla con áreas): la figura a la izquierda, fija al
  bajar; a la derecha «Tu look», los colores, las opciones en grilla (3 por fila en 1024 px, 4 desde 1200), el total con «Agregar» y las
  promesas. Mirado a 1440×900 y 1024×768, y el celular igual que antes.
- [ ] Pendiente de revisar con prendas reales de producción: cómo se ve una prenda de más de 104 cm (la figura se achica entera) y las
  que asoman a los lados en modo oscuro (sobre el fondo oscuro se ven como sombras grises).
