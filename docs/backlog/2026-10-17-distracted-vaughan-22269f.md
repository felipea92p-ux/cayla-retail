## 📏 La tienda mide a los clientes reales (2026-10-17) — rama `claude/distracted-vaughan-22269f`, ADR-0447

Sigue a `docs/backlog/2026-10-17-tienda-percepcion-fdbd9c.md` (fila 1, «Medir a los clientes reales») y a ADR-0445. Felipe eligió la ruta A
(medición propia en el registro de Vercel, gratis, 1 de cada 2 visitas) sobre Speed Insights ($10/mes). Sin migraciones: solo `apps/tienda`.

### Hecho

- [x] **`components/Medicion.tsx`** en el layout sortea la visita y, si entra (1 de cada 2), carga aparte `MedicionActiva.tsx` (4,9 KB
  comprimidos con web-vitals; la visita que no entra no los baja): LCP, FCP, TTFB, CLS e INP de la entrada (y de cada navegación interna
  en Chrome), y del toque a lo primero que cambia y a la página. Un solo envío al ocultarse o cerrarse la pestaña.
- [x] **`POST /api/medicion`**: valida y escribe una línea `medicion_tienda {…}` en el registro de Vercel. Sin base, sin sesión (el proxy no la mira).
- [x] **`pnpm --filter tienda medicion:leer`**: baja las últimas 24 h, las guarda en `apps/tienda/.medicion/` (fuera de git) y resume 7 días.
- [x] `data-esqueleto` en el esqueleto de página: así se sabe cuándo llegó la página de destino.

### Cómo leer los números

1. **Una vez, en la computadora:** `npm i -g vercel@latest` (hace falta la 64 o más nueva; la de esta Mac era la 58.4.4) y `vercel login`.
2. **Cada día** (el registro del plan Pro guarda uno; lo que no se baja en el día se pierde): `pnpm --filter tienda medicion:leer`. Lee el
   equipo `cayla` y el proyecto `cayla-tienda` (otros: `-- --scope <equipo> --proyecto <nombre>`). Para mirar dos semanas: `-- --dias 14`.
   Solo lo guardado: `-- --sin-bajar`. Para mirar a mano en el panel: Vercel ▸ cayla-tienda ▸ Logs, buscar `medicion_tienda`.
   Lo guardado vive en `apps/tienda/.medicion/`, en esa máquina: si se corre en otra, empieza de cero.
3. **Qué dice cada tabla** (todo es el **percentil 75**: el tiempo que 3 de cada 4 clientes no superan, que es como lo mide Google):
   - **AL ENTRAR**, por la página por la que llegó el cliente (de Instagram o WhatsApp suele ser una ficha). `LCP` es cuándo se ve lo
     principal (bueno ≤ 2,5 s, malo > 4 s); `INP`, cuánto tarda en responder a un toque (bueno ≤ 200 ms, malo > 500 ms); `CLS`, cuánto
     salta la página mientras carga (bueno ≤ 0,1); `FCP`, cuándo se ve algo (≤ 1,8 s); `TTFB`, cuándo responde el servidor (≤ 0,8 s). Las
     filas «interna» son de navegaciones dentro de la tienda, solo en el Chrome que las mide: no se comparan con las de entrada.
   - **AL TOCAR UN ENLACE**, de dónde a dónde: `respuesta` es del toque a lo primero que cambia en la pantalla (el esqueleto o la
     página; bueno ≤ 200 ms, malo > 500 ms), `página` es del toque a la página sin su esqueleto (bueno ≤ 1 s, malo > 2,5 s), `con
     esqueleto` cuántas veces se vio el esqueleto, `tocó de nuevo` cuántas veces la persona volvió a tocar porque no vio nada, y `no
     llegó` cuántas no tenían la página a los 20 s (cuentan como 20 s).
   - Con **menos de 30** en una fila, el p75 cambia de un día a otro por una sola visita: no decidas con eso.
4. **¿Hace falta el esqueleto inmediato de la lista a la ficha?** (ADR-0445, «Lo que cuesta no saber»: si se toca una prenda antes de que
   llegue su precarga, Next espera esa precarga para mostrar el esqueleto; en el banco fue hasta 1,3 s). El lector lo contesta solo, con los
   toques desde `/inicio` y `/catalogo` a `/catalogo/[id]`. **El umbral es el p75 de `respuesta`, con al menos 30 toques:**
   - **≤ 200 ms → no hace falta.** Es la vara del INP de Google: el esqueleto ES la respuesta al toque.
   - **200–500 ms → conviene.** Se nota que tocó y no pasó nada, pero todavía no hace tocar de nuevo.
   - **> 500 ms → hace falta.** Ahí la persona vuelve a tocar. Confírmalo con `tocó de nuevo`: si pasa del 5 %, ya está pasando.
   - Mira también la fila por conexión (`4g`, `3g`): si solo `3g` pasa el umbral, el arreglo es la precarga (precargar primero lo que está a
     la vista, o al apoyar el dedo), no el esqueleto. Safari y Firefox no dicen su conexión: salen como «sin dato».

### Sigue pendiente

- [ ] **Verificar en producción** (no hay mediciones hasta publicar): tras fusionar, navegar la tienda en el celular hasta caer en la
  muestra (una ventana privada nueva vuelve a sortear), cambiar de app y correr `pnpm --filter tienda medicion:leer` con la CLI nueva. Si
  dice «Vercel no tiene envíos» con la tienda en uso, mirar en el panel de Vercel ▸ Logs de `cayla-tienda` si aparece `medicion_tienda`.
- [ ] **Juntar sin acordarse** (opcional, Felipe decide): una tarea programada en la Mac que corra el lector cada día, o encender
  Observability Plus ($10/mes) para que el registro guarde 30 días y bajarlo una vez por semana.
- [ ] **Con 2 semanas de datos**, decidir con la tabla: el esqueleto inmediato de la ficha (arriba), «de una ficha a otra» (fila
  `/catalogo/[id] → /catalogo/[id]`, hoy sin esqueleto) y «de una lista a otra desde la cabecera» (fila `/catalogo → /catalogo`).
- [ ] **Corrección a `2026-10-17-tienda-percepcion-fdbd9c.md`, fila 9 (calentar la caché):** dice que el plan gratis de Vercel corre las
  tareas programadas una vez al día, pero la cuenta es **Pro** (bitácora 2026-09-09): en Pro pueden correr cada minuto. Lo que decide
  esa fila es el costo de las invocaciones, no el plan.
- [ ] **Si se suma una página o un `loading.tsx`:** la página va en `RUTAS_MEDIDAS` (`lib/medicion.ts`; la prueba lo exige) y el
  `loading.tsx` dibuja `EsqueletoDePagina` (si no, sus toques se miden como sin esqueleto).
