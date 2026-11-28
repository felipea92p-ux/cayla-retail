## 🏷️ Margen objetivo por lo que la prenda tiene (2026-11-24, ADR-0700) — las ocho migraciones EN PRODUCCIÓN (2026-11-24 y 26); PR #2004 fusionado

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
- [x] **Producción (OK de Felipe, 2026-11-24):** `20261124170000` → `174000` → `180000` → `181000` → `183000` → `190000`, aplicadas con
  `apply_migration` en `cayla-dynamic` después de un ensayo de las seis juntas que se deshizo solo («ENSAYO_OK»). Verificadas: las 14
  funciones con el mismo md5 que el local (sin líneas de comentario en los dos lados: la herramienta las quita al enviar), sus permisos
  (`authenticated` sí, `anon` no), los dos parches a funciones vivas, la regla 37 % y +3 y las dos tablas con RLS. La `180000` se reescribió
  para viajar bien (su ancla de comentario va con `||`). Las listas de tejidos y marcas están vacías: las marca un Admin.
- [ ] **Diccionario:** sin refrescar (`pnpm datos:refrescar`): la foto de producción es del 2026-11-17 y el refresco trae también lo de
  otras ramas.
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

## 2026-11-24 (b) — Las casillas como lista que edita el Admin (`20261124201000`)

- [x] Base: `rasgos_de_precio` con seis casillas (más «Detalle de diseño» y «Acabado y confección»), `producto_rasgos` en dos listas,
  `guardar_casilla_de_precio`, disparadores que exigen códigos de la lista y que una casilla no se borre ni cambie de código u origen.
  Pruebas: `pruebas:reglas-de-precio` 63, `pruebas:rasgos-en-catalogo` 29, `pruebas:recibir-con-rasgos` 14, `pruebas:compra-con-rasgos` 18.
- [x] Web: la pieza lee la lista (con su «?»), Configuración ▸ Precios agrega, renombra y apaga (`CasillaDePrecioModal`).
- [x] **Producción:** `20261124201000` pegada el 2026-11-26 (SQL Editor, 16:31 de Lima), antes de fusionar el PR #2004, junto con
  `20261126211000` (las casillas al eliminar y fusionar). Comprobado el 2026-11-28: diez funciones con el mismo md5 que el repo, mismos
  permisos, RLS sin acceso directo; nadie la usó aún (ninguna prenda marcada, listas de tejidos y marcas vacías).
- [ ] **Llenar las listas** de tejidos que se notan y marcas que el cliente conoce en producción (Configuración ▸ Precios, un Admin).
- [ ] **Casillas que calcularía el ERP** («Llega a inicio de temporada», «Pocas unidades»): necesitan un origen nuevo y código; esperan
  a que Felipe elija de las opciones del análisis.
- [ ] **`/milimetro auditar`** de la hoja de una casilla (`CasillaDePrecioModal`) y de la pieza a dos columnas: vistas en el navegador a 1440 y
  375 px (sin desborde, el «?» abre sin marcar la casilla, «Existe también» frena «en tendencia»), pero sin correr los medidores.
- [ ] **Medir las casillas:** con más casillas, varias miden lo mismo; antes de sumar muchas, comparar tras una temporada si las prendas con
  cada una se vendieron más a precio lleno.
