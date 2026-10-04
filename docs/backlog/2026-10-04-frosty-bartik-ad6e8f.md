## 🚪 «Dónde más hay» para las terminales: `fn_stock_por_sede` usa la puerta única (2026-10-04, ADR-0289 segunda tanda) — migración `20261004110000` **EN PRODUCCIÓN (verificada 2026-10-04)**; rama `claude/frosty-bartik-ad6e8f`

`fn_stock_por_sede()` tenía su propia puerta «persona con colaborador» y no usaba `fn_tiene_acceso_retail()`: una terminal recibía cero
filas sin error y `fn_stock_por_sede_json()` devolvía `[]`, así que Vender, Cambios, Apartados y «Pedir a otra sede» veían «ninguna
otra sede tiene stock». Producción tiene 6 terminales activas (administrativa y de ventas en AQP, LIM y TRU). Solo base y prueba; la web no cambia.

- [x] **Base:** `20261004110000_stock_por_sede_pasa_la_puerta_de_lectura.sql` — un `create or replace function` + `comment on function`;
  mismo cuerpo salvo la puerta, mismo `security definer`/`search_path`/ACL. Guardia por md5 y exige la puerta con terminal. Se pega dos veces.
- [x] **Producción leída (solo lectura, 2026-10-04):** `fn_stock_por_sede` md5 `19273e623fa7554c4cf8c0b3986fbb0e` = el del repo;
  `fn_tiene_acceso_retail` md5 `709e77234c9ec6f3877fef5b30f7bf49` (ya con la terminal, ADR-0289). De las 11 funciones con puerta propia, las
  otras 10 son la puerta misma, las que ya conocen la terminal o las que excluyen a la terminal a propósito (lista en el ADR-0289).
- [x] **Prueba:** `pnpm pruebas:terminales-red`, 27 casos y en el CI. Sin el arreglo 9 rojos; con él 27/27; `--en-seco` sobre base sin él 27/27.
  Mutación de costo (puerta por fila): el caso falla con 96 llamadas. Vecinas en verde: `terminales-lecturas` 27/27, `catalogo_lee_la_cifra_unica` 14/14,
  `arreglos_en_vivo` 47/47, `actor_firma_las_operaciones` 30/30.
- [x] **Pegada en producción el 2026-10-04.** Cuando Felipe pidió pegarla, producción ya tenía el cuerpo nuevo (la pegó alguien antes, en el
  SQL Editor: no deja fila en `schema_migrations`), así que esta sesión NO la volvió a pegar; verificó en solo lectura: una firma,
  md5 `b7396e8adcf99dba24dc7fb71fbd0211`, ACL `{postgres=X/postgres,authenticated=X/postgres}`, `security definer`, `stable`, `search_path`
  fijo, comentario nuevo, sin `colaboradores` y con `retail.fn_tiene_acceso_retail()`. **Humo revertido** (rol `authenticated`, termina en
  excepción): las 6 terminales activas y el líder reciben las mismas 538 filas (y `fn_stock_por_sede_json()` 538 elementos); una cuenta
  de Auth ajena recibe 0.
- [ ] **Falta:** abrir Vender con la sesión real de una terminal de ventas y mirar «Dónde más hay» con una prenda que esté en otra
  sede; y `pnpm datos:generar:produccion` + `pnpm datos:comparar`.
- [ ] **Pendiente de diseño (lo que no se pidió):** la puerta cierra EN SILENCIO (cero filas, sin 42501) y la web trata «lista vacía» como
  «no hay stock»: así estuvieron invisibles este bug y el del 2026-09-30. Una lectura de red que reciba una sesión autenticada pero sin
  puerta podría lanzar, o la web distinguir «sin acceso» de «sin stock». Cambia contratos de varias lecturas: decisión de Felipe.
- [x] La regla «¿es actor de retail? se pregunta con `fn_tiene_acceso_retail()`» (pendiente de la primera tanda) quedó como candado: el caso INVENTARIO de
  la prueba tiene la lista cerrada de las 5 funciones con puerta propia a propósito. Subirla también a `CLAUDE.md` sigue siendo opcional.
