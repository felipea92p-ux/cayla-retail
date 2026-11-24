## 🏷️ Margen objetivo por lo que la prenda tiene (2026-11-24, ADR-0700) — seis migraciones SOLO EN LOCAL; rama `claude/margen-ganancia-atributos-2fe4df`

- [x] **Actividad 1 — Configuración ▸ Precios** (`20261124170000`): `retail.reglas_de_precio` (filas que se agregan, con candados), `tejidos.se_nota`,
  `marcas.conocida`, sus funciones (solo Admin) y la pestaña; base recomendada 37 % con «Usar 37 %». `pruebas:reglas-de-precio` (38).
- [x] **Actividad 2 — el ámbar mide contra el objetivo** de la prenda en `LineaMargen`, Nuevo producto y la propuesta al recibir.
- [x] **Actividad 3 — «Compré ropa»** (`20261124174000`): «¿Qué tiene esta prenda?», «Sugerido S/ …», «¿La vieron más cara afuera?»; se fue
  «Por cada una ganas» (la resta con IGV adentro). `pruebas:compra-con-rasgos` (18).
- [x] **Actividad 4, la base — Recibir** (`20261124180000`): `retail.producto_rasgos`; al recibir, la prenda se queda con las casillas de su
  línea (lo de Catálogo no se pisa). `pruebas:recibir-con-rasgos` (14).
- [x] **«Editar orden» no pierde lo de cada línea** (`20261124181000`). `pruebas:editar-orden-conserva` (23).
- [x] **Actividad 5 — Catálogo** (`20261124183000`): casillas en Nuevo y Editar producto (pieza única `QueTieneLaPrenda`), la matriz de
  Costos con la cuenta única, la IA con piso en el objetivo. `pruebas:rasgos-en-catalogo`.
- [x] **La lista de Productos** (`20261124190000`): misma cuenta y mismo objetivo que la ficha (`fn_rasgos_de_productos`).
- [ ] **Producción (con el OK de Felipe, una por una y en este orden):** `20261124170000` → `174000` → `180000` → `181000` → `183000` →
  `190000`. Cada una es de una sola parte y se puede volver a pegar; las que parchan funciones vivas se detienen solas si el texto de
  producción cambió (md5 comparados el 2026-11-24). Después de pegarlas, `pnpm datos:generar:produccion` para el diccionario.
  **Antes de fusionar** (fusionar = publicar): `pnpm datos:comparar` marca 10 llamadas de esta rama a funciones que la foto de producción
  no tiene. Si la web llegara antes que la base, nada se cae (Configuración ▸ Precios dice que no pudo leer, la lista y las fichas miden con
  la base, Editar producto no dibuja las casillas, la IA usa la regla de fábrica), pero las casillas que se marquen en «Compré ropa» y en
  Nuevo producto no se guardarían (en Nuevo producto, con un aviso).
- [ ] **La pantalla de Recibir** (la web de la actividad 4): en la hoja de la prenda nueva (`recepcion-envio/HojaPrenda.tsx`), mostrar lo que
  marcó quien compró, el sugerido con sus casillas, `LineaMargen` con `rasgos`, y mandar `rasgos` a la propuesta de la IA; leer `rasgos` y
  `precio_visto_afuera` en `leerLineaEnvio`. **Espera al PR #2001** (ADR-0699 toca esos mismos archivos).
- [ ] **Calibrar los +3 %:** son una hipótesis. A los 3–6 meses de casillas guardadas, comparar el margen que se sostuvo (precio al que se
  vendió, rebajas) entre prendas con y sin cada casilla.
- [x] **`/milimetro auditar`** de Configuración ▸ Precios y de la pieza «¿Qué tiene esta prenda?»: 0 graves, 0 medias, 1 leve
  (`docs/milimetro/auditorias/2026-11-24-margen-por-rasgos.md`).
- [ ] **`/formidable` y `/chaos`** de Configuración ▸ Precios y de las casillas de Editar producto: sin correr (la concurrencia y los permisos
  de la base sí tienen sus pruebas).
- [ ] **Sin probar:** la propuesta de la IA en vivo (cuesta por consulta; su piso sí tiene pruebas); Configuración ▸ Precios con una cuenta
  que no es Admin; la base local tiene Lino en la lista de tejidos y CAYLA en la de marcas (de las pruebas a mano).
