## 🛍️ La tienda web rearma su catálogo solo si algo cambió (2026-11-13, cambiar-de-modulo#11) — migración `20261113202000` SIN PEGAR; rama `claude/pensive-mcnulty-d4d7ea`

- [x] **Medido antes de construir** (`scripts/rendimiento/huella-tienda-por-hora.sql`, solo lectura): sobre el volumen sintético de ADR-0194
  con un día al azar de 3 tiendas a ~60 ventas cada una, la huella cambia como mucho 33 veces en la hora punta de un día normal (32 tramos
  de 30 s), 55 un sábado al doble y 0 entre las 21:00 y las 9:00. Bajo el umbral de ~60/h que pidió la propuesta.
- [x] `retail.tienda_catalogo_version()`: md5 del día de Lima, `fn_catalogo_version()`, los movimientos de desde ayer, una suma de hashes de
  las 18 tablas chicas que leen el catálogo, los filtros y el probador, y la firma de las 32 funciones que los arman. Solo lee: sin tablas
  nuevas ni disparadores. <1 ms en local (con un año sintético: 0,9 ms; el catálogo, 313 ms).
- [x] La tienda (`lecturaPorHuella`, `apps/tienda/lib/compartido-servidor.ts`): cada 30 s (como antes) pregunta la huella; la lectura cara
  se pide JUNTO con su huella y se guarda bajo esa huella solo si es la pedida. Tope de 10 min aunque nada cambie. Catálogo, filtros y
  probador ya la usan. Sin la función en la base, arma como antes.
- [x] **Probado en vivo** (la tienda en `next dev` contra una copia propia de la base local con un año sintético): 3 min de visitas
  continuas a dos tiendas sin cambios = **0** rearmados del catálogo y 6 preguntas de huella. Precio, campaña, foto y venta se ven a los
  3, 4, 18 y 33 s (el tope es el de hoy: la huella de 30 s más la copia de página de 30 s).
- [x] **Trampa de Next 16 encontrada al medir:** una `unstable_cache` llamada desde dentro de otra se salta la caché
  (`isNestedUnstableCache`). La primera versión anidaba la copia por huella y rearmaba igual (8 veces en 5 min sin cambios); ahora las dos
  copias van una al lado de la otra (comentario en `compartido-servidor.ts`).
- [x] Pruebas: `pnpm pruebas:tienda-catalogo-version` (22: venta, precio, campaña que empieza mañana sin escribir nada, foto, Vitrina,
  insignia, familia, «quedan pocas», sede, recorte, Taller, función reemplazada; lo que no mueve la huella; la cobertura de tablas y
  funciones; 2 mutantes; re-pegable) y `apps/tienda/lib/compartido-servidor.test.ts` (10, dos mutantes a mano la rompen).
- [ ] **Pegar `20261113202000_tienda_catalogo_version.sql` en producción (Felipe).** Una sola parte, re-ejecutable, sin políticas ni
  `alter`. Puede ir antes o después de publicar la tienda: sin la función, la tienda rearma cada 30 s como hoy.
- [ ] **Después de pegar:** correr `scripts/rendimiento/huella-tienda-por-hora.sql` en el SQL Editor (`set transaction read only;`) para
  ver la cifra real por hora (no va a ningún archivo: el repo es público), y comparar en `pg_stat_statements` las llamadas de
  `tienda_catalogo` de un día antes y uno después.
- [ ] **Siguiente candidato:** `tienda_looks` (~1,6 s) y `tienda_ficha` también arman el catálogo por dentro y siguen en
  `lecturaCompartida` (30 s). Pasarlas a `lecturaPorHuella` pide sumar a la huella las tablas de los looks; la prueba de cobertura ya
  sabe recorrer funciones.
- [ ] **Decisión que queda escrita, no tomada en silencio:** «Más vendidos» no sigue la venta que cumple 30 días (duplicaría los cambios
  en horario de tienda). Su puesto puede quedar hasta 10 min atrás solo en la hora en que no se mueve nada más.
