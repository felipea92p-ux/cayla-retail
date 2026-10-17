## 🫧 La tienda se siente más rápida (2026-10-17) — rama `claude/tienda-percepcion-fdbd9c`, encima de la del PR #1163

Sigue a `docs/backlog/2026-10-17-cayla-tienda-optimizacion-fdbd9c.md` («Más mejoras posibles»). Sin migraciones: solo `apps/tienda`.

### Hecho

- [x] **Banco de pruebas con red lenta**: base desechable con 60 prendas de producción y sus fotos, cuenta de prueba, y un proxy que retrasa
  1,2 s cada respuesta interna. Medido: tocar una prenda muestra el esqueleto de la ficha a los 52 ms (los esqueletos ya estaban bien).
- [x] **El catálogo en tandas** (fila 2 de la tabla): 24 al entrar, la siguiente sola a una pantalla y media del final (24 → 60 → 156 →
  todas), cuatro tarjetas que brillan mientras llega, `?mostrar=` en la dirección. 484 → 288 KB de HTML con 60 prendas.
- [x] **La lista del buscador aparte** (nueva, no estaba en la tabla): `GET /api/buscador`, solo con sesión, guardada 30 s; «Buscando…» con
  filas que brillan y «Volver a intentar». Inicio 134 → 109 KB y ficha 148 → 96 KB por navegación con 60 prendas.
- [x] **Fotos con fundido** al bajar (solo las de carga diferida).
- [x] **Polaroids del héroe antes** (fila 4): primera desde el primer cuadro, tercera quieta a los 0,88 s (antes 1,54 s). Si Felipe prefiere la
  caída de antes, es la línea de `.t-polaroid` en `app/estilos/collage.css`.

### Descartado, con su porqué

- [ ] ~~`content-visibility` en la grilla~~ (fila 3): con las tandas, la grilla ya no tiene cientos de tarjetas fuera de pantalla.
- [ ] ~~«Agregar a la bolsa» antes de que conteste la base~~ (fila 5): ya responde en el toque («Agregando…»); decir «agregada» antes podría
  mentir si la talla se acabó. Mejor, si se quiere más: el hilo que corre en el botón mientras la base revisa.
- [ ] ~~zod fuera de la ficha~~ (fila 6), por ahora: son 13 KB en la PRIMERA visita (después queda guardado) y obliga a partir
  `lib/catalogo.ts`, `club.ts`, `ficha.ts`, `stock.ts` y `probador.ts`, que «Arma el tuyo» está cambiando. Retomarlo cuando esa obra cierre.

### Sigue pendiente

- [ ] **Medir a los clientes reales** (fila 1): Vercel Speed Insights o `useReportWebVitals`. Felipe decide (costo).
- [ ] **El probador** (fila 7): de la obra «Arma el tuyo»; propuesto como sesión aparte.
- [ ] **Transición de la tarjeta a la ficha** (fila 8, View Transitions): Felipe decide (movimiento de marca).
- [ ] **Calentar la caché del catálogo** (fila 9): Felipe decide (en el plan gratis de Vercel las tareas programadas corren una vez al día).
- [ ] **`fn_precio_en_sede`** (fila 10): no se toca sin una razón más fuerte (es la regla del precio de la caja).
- [ ] **El buscador por palabras sueltas** (nueva, no es velocidad): hoy busca la frase tal cual, así que «blusa ray» no encuentra «Blusa Alba
  Rayas». Que cada palabra pueda estar en cualquier parte (`buscarEn` en `lib/buscador.ts`, con su prueba).
- [ ] **Avisos en el registro del servidor** (nuevo, ya estaban antes): con `next start`, el cliente de Supabase (`__loadSession`) usa
  `Date.now()` mientras Next arma la parte dinámica de `/inicio`, `/catalogo`, la ficha y `/bolsa` («blocking-prerender-current-time»).
  No rompe nada visible; revisar si `leerSesion` debe ir detrás de `await connection()`.
- [ ] **Al publicar**: confirmar en producción que `/api/buscador` responde 401 sin sesión y 200 con ella, y que la cabecera ya no trae el
  índice (`"indice"` no aparece en el RSC de `/inicio`).
