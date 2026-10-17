## ⚡ La tienda online, más rápida (2026-10-17) — rama `claude/cayla-tienda-optimizacion-fdbd9c`, PR #1163

### Hecho

- [x] **Medir en producción** dónde se iba el tiempo: CDN y fotos bien; la base no (`tienda_catalogo` 2,36 s de media, 208 cortes por el
  límite de 5 s en 24 h; looks 2,76 s; un look 3,69 s; Mi Club ~0,3 s). Los cortes no salen en `pg_stat_statements`: se ven en el registro
  de Postgres (`query_logs`, `source = 'postgres_logs'`, «canceling statement due to statement timeout», usuario `tienda_web_prod`).
- [x] **`20261017171000`** — `fn_tienda_precio_talla` materializa `base` y `con_campana` (31 914 → 3 546 llamadas a `fn_precio_en_sede`).
  **EN PRODUCCIÓN** 2026-10-17 con el OK de Felipe (versión `20261017172850`).
- [x] **`20261017172000`** — la cadena «¿se puede mostrar?» (`fn_tienda_modelo_se_ve`, `fn_vitrina_publicable`, `fn_vitrina_por_que_no`,
  `fn_categoria_entra_a_motores`) en PL/pgSQL, misma regla: 298 revisiones de ~250 ms a ~30 ms. También la usan los motores del ERP
  (Análisis, Frescura, plan del piso). **EN PRODUCCIÓN** (versión `20261017172931`).
- [x] **`20261017173000`** — `tienda_catalogo` arma colores, fotos y stock agrupados por prenda; JSON idéntico byte a byte con «Todas» y con
  cada tienda. **EN PRODUCCIÓN** (versión `20261017173001`). Las seis funciones, revisadas otra vez por md5 en producción: siguen iguales.
- [x] **Prueba `pnpm pruebas:tienda-rapida`** (15 escenarios, en el CI): llamadas por carga, lenguaje y permisos de la cadena, el JSON contra la
  versión de antes, los candados de md5 y que se pueden pegar dos veces; con mutantes.
- [x] **Web:** `MENSAJES` a `lib/cuentas-mensajes.ts` y la cuenta regresiva a `lib/cuenta-regresiva.ts` (la portada ya no carga zod); AVIF en
  `next.config.ts` (21 % menos que WebP, medido con sharp sobre 6 fotos reales).
- [x] **«Atrás instantáneo» (`staleTimes`):** medido, no hace falta: volver atrás no pide nada al servidor. No se activó.
- [x] **PR #1163** abierto con `/abrir-pr`, CI en verde (12/12), sin choques.

### Falta de esta obra

- [ ] **Fusionar el PR #1163** (Felipe): recién ahí llegan a los clientes la portada sin zod y las fotos en AVIF. La base ya está.
- [ ] **Después de publicar, confirmar AVIF en producción:** `curl -sI -H 'Accept: image/avif,image/webp,*/*' "https://tienda.cayla.pe/_next/image?url=<foto>&w=640&q=75"`
  debe decir `content-type: image/avif`.
- [ ] **Mirar en Vercel la primera semana** que «Image Optimization» no se dispare (cada foto y ancho se convierte una vez más). Felipe, en el panel.
- [ ] **Volver a mirar los cortes en unos días** (deben quedar en 0 para `tienda_web_prod`), con el registro de Postgres de producción:
  `select log_attributes['parsed.query_id'] as q, count(*) from logs where source = 'postgres_logs' and event_message ilike '%canceling statement due to statement timeout%' and log_attributes['parsed.user_name'] = 'tienda_web_prod' group by q`
  y el `queryid` en `pg_stat_statements` para saber qué consulta fue.
- [ ] **El probador** (`tienda_probador`, escondido, ADR-0434) sigue en ~0,6 s: 384 ms propios por armar lo de cada prenda con subconsultas,
  el mismo patrón que tenía el catálogo. Lo arregla su obra («Arma el tuyo»); quedó propuesto como sesión aparte.
- [ ] **El diccionario de datos** (`docs/datos/generado/`) cuando se refresque el volcado de producción: cambiaron cuerpos y lenguaje de 6
  funciones (ninguna firma).

### Más mejoras posibles (velocidad real y la que se siente)

Ordenadas por lo que gana el cliente contra lo que cuesta. Ninguna está empezada; «quién decide» dice si basta construirla o si es de Felipe.

| # | Mejora | Qué gana el cliente | Costo | Quién decide | Medida |
|---|---|---|---|---|---|
| 1 | **Medir a los clientes reales** (Core Web Vitals: cuánto tarda en verse lo principal y en responder a un toque) con Vercel Speed Insights o `useReportWebVitals` de Next hacia el aviso de errores que ya usa el ERP (Sentry, ADR-0424; la tienda todavía no lo tiene) | Nada directo, pero hoy cada mejora se decide a ciegas: no hay ningún dato de cómo le carga al cliente en su celular | 30 min | Felipe (Speed Insights cobra fuera del cupo gratis) | — |
| 2 | **El catálogo en tandas**: las primeras ~24 prendas y el resto al bajar (o «Ver más»). Hoy `app/(catalogo)/catalogo/page.tsx` dibuja la lista entera de una vez (hasta 298 tarjetas, cada una con su foto, su corazón y «Agregar») | La lista sale antes y el celular no se traba al tocar; menos datos por visita | 2–3 h, con su guía y su prueba | Construirla (Felipe mira el «Ver más» o el scroll) | Sin medir: pide sesión |
| 3 | **`content-visibility: auto`** en las tarjetas de la grilla (`.t-card`, con `contain-intrinsic-size`): el navegador no dibuja lo que está fuera de la pantalla | Bajar por el catálogo se siente más liviano en celulares modestos | 15 min | Construirla | Sin medir |
| 4 | **Las polaroids de la portada, más pronto**: hoy aparecen recién al caer (la primera a los 0,26 s y la tercera queda quieta a los 1,54 s; `app/estilos/collage.css`, `t-caer`). Que la primera ya esté, o la caída en 0,5 s | Lo principal de la portada (las fotos) se ve antes; también lo mide así Google | 15 min | Felipe (es movimiento de marca, ADR-0136 / ADR-0430) | Medido el tiempo de la animación |
| 5 | **«Agregar a la bolsa» al instante**: hoy espera al servidor con «Agregando…» y el botón apagado (`components/bolsa/AgregarALaBolsa.tsx`). Sumarla a la bolsa en la pantalla en el mismo toque y deshacer con su aviso si la base dice que no (como ya hace el corazón, `BotonFavorito.tsx`) | El toque más importante de la tienda responde en el acto, sin la ida y vuelta al servidor | 1–2 h | Felipe (la bolsa diría «agregada» antes de que la base lo confirme; «Separar» igual revisa precio y stock) | Sin medir |
| 6 | **zod fuera del catálogo y de la ficha**: los componentes del navegador de la ficha y las tarjetas importan módulos con zod (`lib/catalogo.ts`, `club.ts`, `ficha.ts`, `stock.ts`, `probador.ts`) por funciones que no lo usan. Separar las funciones puras de los esquemas | 13 KB menos en la PRIMERA visita a una ficha (quien llega de Instagram o WhatsApp directo a una prenda); después ya está guardado | 1–2 h | Construirla | Medido el peso (13 KB comprimido) |
| 7 | **El probador** (fila de arriba, «Falta de esta obra») | «Arma el tuyo» abre en ~0,1 s en vez de ~0,6 s cuando se lance | 1–2 h | Su obra | Medido (384 ms propios) |
| 8 | **Transición de la tarjeta a la ficha** (la foto que crece de la lista a la ficha, View Transitions de React 19 / Next 16) | La espera se siente como movimiento, no como un salto | 2–4 h; experimental en Next 16 | Felipe (movimiento) | — |
| 9 | **Calentar la caché del catálogo** con una tarea programada cada pocos minutos, para que la primera visita después de horas sin tráfico no espere | El primer cliente de la mañana no espera los ~0,3 s del armado | 30 min | Felipe (en el plan gratis de Vercel las tareas programadas corren una vez al día) | Con 0,3 s, poca ganancia |
| 10 | **`fn_precio_en_sede` en PL/pgSQL** | ~60 ms menos en el catálogo (lectura que ya se comparte 30 s) | 1 h | Felipe (es la regla del precio de la caja) | Estimado |

Lo que ya está bien y no hace falta tocar: el corazón de favoritos se marca en el mismo toque y vuelve atrás solo si la base dice que no; cada
página con cuenta tiene su esqueleto con la forma de lo que viene; una prenda sin foto dibuja su silueta en su color mientras carga; las
páginas públicas salen armadas del CDN; volver atrás no pide nada al servidor.
