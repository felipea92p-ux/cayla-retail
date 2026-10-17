## ⚡ La tienda online, más rápida (2026-10-17) — rama `claude/cayla-tienda-optimizacion-fdbd9c`

- [x] **Medir en producción** dónde se iba el tiempo: CDN y fotos bien; la base no (`tienda_catalogo` 2,36 s de media, 208 cortes por el
  límite de 5 s en 24 h; looks 2,76 s; un look 3,69 s; Mi Club ~0,3 s). Los cortes no salen en `pg_stat_statements`: se ven en el registro
  de Postgres (`query_logs`, `source = 'postgres_logs'`, «canceling statement due to statement timeout», usuario `tienda_web_prod`).
- [x] **`20261017171000`** — `fn_tienda_precio_talla` materializa `base` y `con_campana` (31 914 → 3 546 llamadas a `fn_precio_en_sede`).
  **EN PRODUCCIÓN** 2026-10-17 con el OK de Felipe (versión `20261017172850`).
- [x] **`20261017172000`** — la cadena «¿se puede mostrar?» (`fn_tienda_modelo_se_ve`, `fn_vitrina_publicable`, `fn_vitrina_por_que_no`,
  `fn_categoria_entra_a_motores`) en PL/pgSQL, misma regla: 298 revisiones de ~250 ms a ~30 ms. También la usan los motores del ERP
  (Análisis, Frescura, plan del piso). **EN PRODUCCIÓN** (versión `20261017172931`).
- [x] **`20261017173000`** — `tienda_catalogo` arma colores, fotos y stock agrupados por prenda; JSON idéntico byte a byte con «Todas» y con
  cada tienda. **EN PRODUCCIÓN** (versión `20261017173001`).
- [x] **Prueba `pnpm pruebas:tienda-rapida`** (15 escenarios, en el CI): llamadas por carga, lenguaje y permisos de la cadena, el JSON contra la
  versión de antes, los candados de md5 y que se pueden pegar dos veces; con mutantes.
- [x] **Web:** `MENSAJES` a `lib/cuentas-mensajes.ts` y la cuenta regresiva a `lib/cuenta-regresiva.ts` (la portada ya no carga zod); AVIF en
  `next.config.ts` (21 % menos que WebP, medido con sharp sobre 6 fotos reales).
- [x] **«Atrás instantáneo» (`staleTimes`):** medido, no hace falta: volver atrás no pide nada al servidor. No se activó.
- [ ] **Confirmar en Vercel** después de publicar la web: las fotos salen `image/avif` y el consumo de «Image Optimization» no se dispara la
  primera semana (cada foto y ancho se convierte una vez más). Lo mira Felipe en el panel de Vercel.
- [ ] **Volver a mirar los cortes** en el registro de Postgres en unos días: deberían quedar en 0 para `tienda_web_prod`.
- [ ] **El probador** (`tienda_probador`, escondido, ADR-0434) sigue en ~0,6 s: 384 ms propios por armar lo de cada prenda con subconsultas,
  el mismo patrón que tenía el catálogo. Lo arregla su obra («Arma el tuyo»), que lo está tocando.
- [ ] **`fn_precio_en_sede`** se lleva 117 ms del catálogo (3 546 llamadas). Pasarla a PL/pgSQL ahorraría unos 60 ms, pero es la regla del
  precio de toda la caja: no se tocó sin una razón más fuerte.
- [ ] **El diccionario de datos** (`docs/datos/generado/`) cuando se refresque el volcado de producción: cambiaron cuerpos y lenguaje de 6
  funciones (ninguna firma).
