## Probador: la unión sigue el bajo curvo y la figura quieta se une (ADR-0449) — 2026-10-19, solo web, sin migración; rama `claude/looks-union-improvement-a6e3df`

- [x] Perfil del bajo (24 franjas) y pretina en el punto más alto del bajo, con pruebas (`lib/union-prendas.test.ts`).
- [x] La figura quieta (look guardado, tarjetas de «Tus looks», look compartido) usa la misma unión (`FiguraQuietaUnida`).
- [ ] **Verlo en pantalla con una cuenta real:** `/looks/guardado/<id>`, una tarjeta de «Tus looks» y `/tu-look?p=…`, a 375 px y en escritorio; que la prenda de abajo no salte feo al llegar la medida.
- [ ] Probar prendas de arriba con volado o peplum y el encaje con caída fuerte (la «Top Estela» rosa), por si el tope de 25 % del bajo o el ancho de 30–60 % necesitan ajuste.
- [ ] Si al listar muchos looks guardados se miden demasiados recortes a la vez, medirlos en reposo como ya se hace con las vecinas.
- [x] La cintura del pantalón sigue el ancho de toda la zona del bajo (`anchoDelBajo`), no el de la punta de un bajo cruzado: el pantalón deja de encogerse al mínimo y la blusa deja de verse enorme, sin revisar prendas a mano.
- [ ] Mirar en producción los pantalones con piernas muy largas en la foto: con una cintura más ancha el largo sube y puede tocar el tope de 120 cm.
- [x] La prenda de arriba se ajusta sola a su forma cuando su bajo es más angosto que la cintura mínima (`cajaDeArribaAjustada`): solo crece (tope ×1,3), nunca encoge; 80 de 105 prendas de arriba quedan idénticas.
- [ ] Mirar en la tienda real las 25 prendas que crecen (sobre todo el encaje asimétrico, el top con escote y amarre, Top Asim, Top Lin y Top Ranglan Durga) y, si alguna no gusta, decir cuál.
- [ ] Los largos típicos por categoría (65 / 60 / 45) siguen siendo un solo número: si Felipe anota el largo real de una prenda, ese manda como punto de partida.
