---
name: multi-view-responsive
description: "Revisa el responsive de un módulo, una ruta o todo el ERP en local: siete tamaños de escritorio (1024 a 1920) o, con `celular`, seis de teléfono y tablet. Mide el DOM, captura y reporta; no toca código. Úsala cuando pidan revisar el responsive."
---

## Qué hace y cuándo se usa

Recorre las pantallas, pestañas, modales y hojas de un módulo del ERP CAYLA en LOCAL a siete tamaños de laptop y monitor (1024 a 1920) o, con `celular`, a seis de teléfono y tablet (360 a 844), mide el DOM y captura cada vista para encontrar errores de responsive (desborde, texto cortado, solapes, hojas y tablas rotas, espacio desperdiciado; en celular, además, toques chicos, campos que hacen zoom y barras pegadas que fallan) y los reporta en el chat de forma concreta para que la persona los ordene arreglar. Solo mide y reporta, no toca código. Úsala cuando pidan revisar el responsive de un módulo, una ruta o todo el ERP, en escritorio o en celular.

Revisa el responsive de: $ARGUMENTS

**Entrada:** un módulo (`inventario`, `vender`, `finanzas`), una ruta (`/vender/apartados`) o `todo`; y, si se quiere, la palabra `celular`. Sin argumento, pregunta cuál y para.
**Dos modos, nunca los dos en una corrida:** sin `celular` mides **escritorio** (los siete tamaños de laptop y monitor, como siempre); con `celular` (`/multi-view-responsive vender celular`) mides **teléfono y tablet** (los seis tamaños de más abajo). Si te piden «los dos», primero escritorio, entregas su reporte, y después celular.
**Regla madre:** solo mides y reportas. No edites código, docs, backlog ni migraciones, no hagas commit, no escribas archivos de reporte: el reporte va **solo en el chat**. Arreglar es un paso aparte que la persona ordena («arregla el 1, 3 y 5»).
**Solo LOCAL.** Nunca navegues a producción ni a un dominio de Vercel, ni siquiera de solo lectura (decisión del equipo, 2026-09-30).

## Qué necesita (cualquier persona con Claude Code)

La skill necesita **un navegador que Claude pueda manejar**, con cuatro capacidades: fijar el tamaño del viewport, ejecutar JavaScript en la página, tomar capturas y pulsar o escribir teclas. Sirve cualquiera de estos; los nombres de abajo son los del navegador integrado de la app de escritorio:

| Capacidad | App de escritorio (navegador integrado) | Claude in Chrome | Playwright MCP |
|---|---|---|---|
| Tamaño | `resize_window` | `resize_window` | `browser_resize` |
| JavaScript | `javascript_tool` | `javascript_tool` | `browser_evaluate` |
| Captura | `computer` → `screenshot` | `computer` → `screenshot` | `browser_take_screenshot` |
| Pulsar y teclas | `computer`, `find` | `computer`, `find` | `browser_click`, `browser_press_key` |

Si la sesión no tiene ninguno, **para y dilo**: no instales nada ni busques un navegador en el repo o en npm (Playwright y Chrome son herramientas de cada usuario, no dependencias del proyecto). Además necesitas el repo con `apps/web/.env.local` y la base local (Supabase) levantada, y **tu propia sesión iniciada** en la app local: cada persona entra con su usuario.

## Los siete tamaños

| Ancho × alto | Qué representa |
|---|---|
| 1024 × 768 | El límite inferior: ventana reducida o tablet horizontal |
| 1280 × 720 | Laptop pequeña |
| 1366 × 768 | Laptop común de tienda |
| 1440 × 900 | MacBook Air |
| 1536 × 864 | Laptop con Windows a 125 % |
| 1600 × 900 | Laptop y monitor intermedio |
| 1920 × 1080 | Monitor de escritorio estándar |

El alto importa tanto como el ancho: las hojas y los modales se rompen primero en 720 y 768 de alto.

## Los seis tamaños de celular y tablet (solo con `celular`)

| Ancho × alto | Qué representa | El navegador lo trata como |
|---|---|---|
| 360 × 800 | El Android más común | Dedo |
| 375 × 812 | iPhone chico: **el ancho que exige el PR** en Vender, Cambios y Devoluciones (PL-105) | Dedo |
| 430 × 932 | iPhone grande | Dedo |
| 844 × 390 | Teléfono acostado: casi no queda alto | Mouse |
| 768 × 1024 | Tablet de pie, justo sobre el corte de 640 | Mouse |
| 820 × 1180 | Tablet de pie más ancha, todavía bajo 1024 | Mouse |

**«Dedo» y «mouse» importan** (medido el 2026-11-18 en el navegador integrado): bajo 768 px de ancho el navegador se presenta como un teléfono táctil y `app/estilos/tacto.css` (`pointer: coarse`) se activa; desde 768 **no**, aunque una tablet de verdad sí sea táctil. Por eso el toque de 44 px y el zoom de los campos solo se miden en los tres primeros, y el reporte lo dice en «No cubierto». Las reglas de CSS cambian al instante al cambiar de tamaño, pero lo que la página decidió al cargar no: al pasar de los tamaños de dedo a los de mouse, **recarga la página** antes de medir. Si tu navegador no emula el dedo a ningún ancho (`tactil: false` a 375), dilo y sigue con lo demás.

El ERP es **escritorio primero** (ADR-0350): el celular solo es obligatorio en `/vender`, `/vender/apartados`, `/cambios` y `/devoluciones`. En las demás pantallas se mide igual, pero el hallazgo no lleva la marca `[celular obligatorio]`.

## Paso 0 — Terreno (si algo falla, para y dilo)

1. **Rama y base:** `git status --short` y `git rev-list --left-right --count HEAD...origin/main`. Dilo en una línea: qué rama y cuántos commits va detrás de `main` (lo medido es el código de la rama, no el de producción). No arregles nada.
2. **Entorno local:** existe `apps/web/.env.local` (si no, pídele a la persona que lo copie; no lo leas ni lo crees). La base local responde (`curl -s -o /dev/null -w "%{http_code}" http://localhost:54421/rest/v1/`); si no, dile que levante Supabase local.
3. **Servidor:** en la app de escritorio, `preview_start` con `cayla-retail-dev` (puerto 3010; tarda en pasar de `starting` a escuchar, revisa con `preview_list` y `lsof -iTCP:3010`). En la terminal, `PORT=3010 pnpm --filter web dev` en segundo plano y espera a que el puerto escuche. Si ya estaba corriendo, reutilízalo y **no lo detengas al terminar**. Si el 3010 lo ocupa otro worktree, no toques `launch.json`: avisa a la persona.
4. **Tu propia pestaña:** el panel se comparte con la persona que te invoca. `tabs_create` y pasa `tabId` en TODAS las llamadas. Usa `http://localhost:3010`, nunca `127.0.0.1` (Next no hidrata en esa dirección).
5. **Sesión:** si aparece `/login`, dile a la persona que inicie sesión ella misma en esa pestaña y espera. Nunca escribas contraseñas ni credenciales.
6. **El tamaño emulado se borra** cuando termina tu turno: vuelve a fijarlo si sigues en otro turno. Al terminar, `resize_window` con `preset: "desktop"`.

## Paso 1 — Inventario de vistas (antes de capturar nada)

Arma la lista de lo que vas a recorrer y dile a la persona cuántas vistas y cuántas capturas salen (vistas × 7; con `celular`, vistas × 6, y las rutas de celular obligatorio van primero):

- **Rutas del módulo:** `lib/menu.ts` da los nodos del módulo; el resto (rutas sin menú, como `/pedidos-no-atendidos`) sale de `grep -oE '^  "/[^"]*"' apps/web/lib/guia-de-foco-pantallas.ts`. Una ruta con `[id]` se abre desde su lista con un dato del seed, no inventando un id.
- **Estados de cada ruta:** pestañas y filtros que cambian la vista, lista vacía y lista con datos, cajón o vista rápida abierta.
- **Modales y hojas:** los de `MODALES` en el mismo registro (la clave es el archivo). Para cada uno, encuentra qué botón lo abre leyendo dónde se importa. Las rutas con `@modal` (por ejemplo `compras/@modal`) se abren por clic y también por URL directa.
- **`todo`:** son unas 86 rutas y unos 90 modales, o sea más de mil capturas. Confirma con la persona y luego avanza **módulo por módulo**, entregando el reporte de cada uno antes de seguir.

## Paso 2 — Reglas de seguridad al abrir estados (local, pero igual)

La base local es compartida entre sesiones y algunas acciones llaman afuera (Lucode, padrón de SUNAT). Por eso:

- **Puedes pulsar** lo que abre o navega: Nuevo, Editar, Ver, Detalle, Registrar (si solo abre el modal), pestañas, filtros, combos, paginación, el lateral, el selector de sede. Cierras con Escape o Cancelar.
- **No pulses** lo que guarda o dispara algo: Guardar, Confirmar, Emitir, Anular, Enviar, Recibir, Pagar, Cerrar caja, Cerrar conteo, Aprobar, Eliminar, Archivar. Tampoco busques DNI o RUC en el padrón.
- Si una vista solo se alcanza guardando algo, no la fuerces: anótala en «No cubierto».

## Paso 3 — Recorre cada vista en todos los tamaños del modo

**Guarda el script una sola vez** (`javascript_tool`, `javascript_exec`): ejecuta el bloque de abajo con `localStorage.setItem("__m", "(" + f.toString() + ")")` y desde entonces cada medición es `JSON.stringify(eval(localStorage.getItem('__m'))())`. Sobrevive a las navegaciones del mismo origen; si falta, vuelve a guardarlo. El script solo inspecciona, no modifica la página.

Para cada vista: **prepara el estado una vez** (abre el modal, la pestaña), y luego recorre los siete anchos sin recargar; cierra al terminar. Con `celular`: primero los tres tamaños de dedo, después recarga, prepara el estado otra vez y recorre los tres de mouse.

1. **Espera a que la página se asiente antes de medir o capturar.** Muchas pantallas entran con fundidos y cuentan cifras subiendo durante varios segundos (Por pagar, Proveedores); una captura a medias engaña. Una espera fija no alcanza y `getAnimations()` no ve las cifras que suben por JavaScript. Usa: repetir cada 250 ms hasta que `document.body.innerText` no cambie durante 5 lecturas seguidas (tope 15 s). Con un modal recién abierto, además `wait` de 2 s. **Y comprueba que la pantalla llegó:** el texto quieto no basta, porque una pantalla que todavía no cargó también está quieta (el 2026-11-18 Apartados salió «limpia» en tres tamaños midiendo una página vacía). Antes de medir, `main` tiene texto y alto, y el loader (`[data-espera]`) no está a la vista; si a los 10 s no, esa medición no vale: anótala «sin cargar» y repítela. **Con el panel del navegador oculto** (`tabs_context` lo dice; pasa cuando la persona no tiene la sesión a la vista) la página no termina de pintarse sola: toma una captura **antes** de cada medición —la captura obliga a pintar— y otra después para mirarla. Tras cada cambio de tamaño la emulación parpadea un instante (el dedo se apaga y vuelve, y la pantalla cambia de versión): asienta de nuevo antes de medir.
2. Por cada ancho: `resize_window` con `width` y `height`; comprueba que `innerWidth` e `innerHeight` coincidan (si el panel no alcanza, dilo y sigue con lo que dé); **mide** con el script; **captura** con `computer` `screenshot`. La imagen sale a unos 800 px de ancho (el panel escala el viewport) y `zoom` sobre una región **no está disponible** en este panel: para mirar de cerca, apóyate en las medidas del script y en `read_page`.
3. Mira cada imagen: la medición encuentra lo medible y tu ojo lo demás (jerarquía rota, saltos entre anchos cercanos, contenido pegado a un lado, un botón que casi toca la cifra vecina).

```js
const f = () => {
  const W = innerWidth, H = innerHeight, cap = a => a.slice(0, 8);
  const vis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && +s.opacity > 0; };
  const nombre = el => (el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "") + " «" + (el.textContent || "").trim().slice(0, 28) + "»");
  const scrollerX = el => { for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll") return p; } return null; };
  const scrollerY = el => [el, ...el.querySelectorAll("*")].find(e => { const o = getComputedStyle(e).overflowY; return (o === "auto" || o === "scroll") && e.scrollHeight > e.clientHeight + 1; }) || null;
  const raiz = document.querySelector("main") || document.body;
  const hojas = [...document.querySelectorAll('[role="dialog"]')].filter(vis);
  const todos = [...document.body.querySelectorAll("*")].filter(vis).filter(e => !e.classList.contains("sr-only"));
  const r = { ancho: W, alto: H, paginaDesborda: document.documentElement.scrollWidth - W };
  r.fueraDeVista = cap(todos.filter(e => !e.children.length || /^(BUTTON|A|INPUT|SELECT|LABEL)$/.test(e.tagName)).filter(e => e.getBoundingClientRect().right > W + 1 && !scrollerX(e) && !e.closest("[aria-hidden='true']")).map(e => nombre(e) + " termina en " + Math.round(e.getBoundingClientRect().right)));
  r.textoCortado = cap(todos.filter(e => e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1 && (e.textContent || "").trim()).filter(e => { const s = getComputedStyle(e); return s.overflowX !== "visible" && s.overflowX !== "auto" && s.overflowX !== "scroll" && s.textOverflow !== "ellipsis"; }).map(e => nombre(e) + " " + e.clientWidth + "/" + e.scrollWidth));
  r.casiInvisible = cap(todos.filter(e => { const s = getComputedStyle(e); return s.textOverflow === "ellipsis" && e.scrollWidth > 2 * e.clientWidth && e.clientWidth < 70; }).map(e => nombre(e) + " " + e.clientWidth + "/" + e.scrollWidth));
  r.scrollbarFantasma = cap(todos.filter(e => { const s = getComputedStyle(e); const ay = (s.overflowY === "auto" || s.overflowY === "scroll") && e.offsetWidth - e.clientWidth >= 8 && e.scrollHeight - e.clientHeight <= 3; const ax = (s.overflowX === "auto" || s.overflowX === "scroll") && e.offsetHeight - e.clientHeight >= 8 && e.scrollWidth - e.clientWidth <= 3; return ay || ax; }).map(e => nombre(e) + " sobra " + (e.scrollHeight - e.clientHeight) + "px"));
  const clipped = e => { const b = e.getBoundingClientRect(); for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const st = getComputedStyle(p); if (st.overflowX !== "visible" || st.overflowY !== "visible") { const q = p.getBoundingClientRect(); if (q.height < 2 || b.bottom <= q.top + 1 || b.top >= q.bottom - 1 || b.right <= q.left + 1 || b.left >= q.right - 1) return true; } } return false; };
  const hit = e => { const b = e.getBoundingClientRect(), x = b.left + b.width / 2, y = b.top + b.height / 2; if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false; const t = document.elementFromPoint(x, y); return !!t && (t === e || e.contains(t) || t.contains(e)); };
  const inter = todos.filter(hit).filter(e => !clipped(e)).filter(e => e.matches('button,a[href],input,select,textarea,[role="button"],[role="tab"]'));
  r.solapes = [];
  for (let i = 0; i < inter.length && r.solapes.length < 8; i++) for (let j = i + 1; j < inter.length; j++) {
    const a = inter[i], b = inter[j]; if (a.contains(b) || b.contains(a) || getComputedStyle(a).position === "absolute" || getComputedStyle(b).position === "absolute") continue;
    const A = a.getBoundingClientRect(), B = b.getBoundingClientRect();
    const w = Math.min(A.right, B.right) - Math.max(A.left, B.left), h = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
    if (w > 3 && h > 3) { r.solapes.push(nombre(a) + " ✕ " + nombre(b)); break; }
  }
  r.hojas = hojas.map(h => { const b = h.getBoundingClientRect(), sc = scrollerY(h), p = h.querySelector('button[type="submit"],.btn-primario'); return { alto: Math.round(b.height), cortadaArriba: b.top < -1, cortadaAbajo: b.bottom > H + 1, tieneScroll: !!sc, botonPrincipalFuera: p ? p.getBoundingClientRect().bottom > H + 1 && !sc : false }; });
  r.tablas = cap([...raiz.querySelectorAll("table")].filter(vis).map(t => { const c = scrollerX(t), b = t.getBoundingClientRect(); return { desbordaSinContenedor: !c && b.right > W + 1, columnasApretadas: [...t.querySelectorAll("th")].filter(th => th.clientWidth < 40 && (th.textContent || "").trim().length > 3).map(th => th.textContent.trim().slice(0, 14)) }; }).filter(t => t.desbordaSinContenedor || t.columnasApretadas.length));
  const c = raiz.firstElementChild ? raiz.firstElementChild.getBoundingClientRect() : null;
  r.usoDelAncho = c ? { main: Math.round(raiz.getBoundingClientRect().width), contenido: Math.round(c.width) } : null;
  const textos = todos.filter(e => !clipped(e) && !e.children.length && (e.textContent || "").trim().length > 1 && !e.closest("[aria-hidden='true']"));
  r.textoSolapado = [];
  for (let i = 0; i < textos.length && r.textoSolapado.length < 8; i++) { const A = textos[i].getBoundingClientRect(); for (let j = i + 1; j < textos.length; j++) { const B = textos[j].getBoundingClientRect(); const w = Math.min(A.right, B.right) - Math.max(A.left, B.left), h = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top); if (w > 2 && h > 4) { r.textoSolapado.push(nombre(textos[i]) + " ✕ " + nombre(textos[j])); break; } } }
  r.montoPartido = cap(todos.filter(e => !e.children.length && /^S\/\s?[\d.,]+$/.test((e.textContent || "").trim())).filter(e => { const g = document.createRange(); g.selectNodeContents(e); return g.getClientRects().length > 1; }).map(e => (e.textContent || "").trim()));
  for (const k of Object.keys(r)) { const v = r[k]; if ((Array.isArray(v) && !v.length) || (k === "paginaDesborda" && v <= 0)) delete r[k]; }
  return r;
};
localStorage.setItem("__m", "(" + f.toString() + ")");
JSON.stringify(f())
```

El script devuelve solo lo que encontró (una clave que no aparece es una medición limpia). Cómo leerlo (la medición señala, tú decides):
- `paginaDesborda`, `fueraDeVista`, `textoCortado` y `solapes` son roturas casi seguras. Recorren **todo el documento**, lateral y cabecera incluidos, no solo el contenido principal: el 2026-09-30 una etiqueta del lateral recortada pasó inadvertida cuando el script solo miraba `main`.
- `casiInvisible`: un texto con puntos suspensivos en una columna de menos de 70 px, donde no se lee nada. `montoPartido`: una cifra con «S/» que se parte en dos líneas.
- `scrollbarFantasma`: una barra de desplazamiento que aparece por 1 o 2 px de sobra; en Windows se ve como una barra permanente.
- `textoSolapado` es ruidoso: puede traer textos ocultos (tooltips, pies del lateral que hacen scroll por debajo). Confirma con la captura antes de reportarlo.
- Una hoja con `cortadaAbajo` o `botonPrincipalFuera` sin `tieneScroll` no deja completar la acción: es lo más grave. Una hoja con scroll interno cuyo botón principal solo aparece al llegar al final se reporta como Sugerencia.
- Una tabla con scroll horizontal propio **no** es error por sí sola; sí lo es sin contenedor, o con columnas apretadas.
- `usoDelAncho`: si a 1920 el contenido ocupa menos de ~55 % del ancho útil, es «Sugerencia», no rotura.
- Lo que sea intencional (puntos suspensivos con espacio suficiente, un carrusel con scroll) no se reporta.
- Falsos avisos conocidos (2026-11-18), que se miran en la captura antes de reportar: un `textoCortado` de 4 a 20 px en un `btn-cayla` es la luz del botón, no su texto; con el lateral plegado, `textoCortado` en «Retail» y en filas del menú es la etiqueta que el riel esconde; un `textoSolapado` contra la barra de abajo es lo que pasa por detrás de una barra fija.

### Con `celular`: un segundo medidor

Todo lo anterior vale igual (el script de arriba no depende del ancho; `usoDelAncho` no aplica). Además, guarda una vez este segundo bloque y mide con los dos: `JSON.stringify({ ...eval(localStorage.getItem('__m'))(), ...eval(localStorage.getItem('__c'))() })`. Tampoco modifica la página.

```js
const g = () => {
  const W = innerWidth, H = innerHeight, cap = a => a.slice(0, 8), px = n => Math.round(n);
  const vis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && +s.opacity > 0; };
  const nombre = el => (el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "") + " «" + (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 28) + "»");
  const corre = s => s === "auto" || s === "scroll" || s === "hidden";
  const todos = [...document.body.querySelectorAll("*")].filter(vis).filter(e => !e.closest("nextjs-portal,[aria-hidden='true']"));
  const r = { tactil: matchMedia("(pointer: coarse)").matches };
  if (r.tactil) {
    r.campoConZoom = cap(todos.filter(e => e.matches("input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]):not([type=button]):not([type=submit]),textarea,select,[contenteditable='true']")).filter(e => parseFloat(getComputedStyle(e).fontSize) < 16).map(e => nombre(e) + " letra " + parseFloat(getComputedStyle(e).fontSize) + " px"));
    const chicos = todos.filter(e => e.matches("button,a[href],input:not([type=hidden]),textarea,[role=button],[role=switch],[role=checkbox],[role=radio],[role=tab],[role=combobox],[role=option],summary") && getComputedStyle(e).pointerEvents !== "none").map(e => {
      const b = e.getBoundingClientRect(); let w = b.width, h = b.height;
      for (const p of [getComputedStyle(e, "::before"), getComputedStyle(e, "::after")]) if (p.content !== "none" && p.position === "absolute" && p.pointerEvents !== "none") { w = Math.max(w, parseFloat(p.width) || 0); h = Math.max(h, parseFloat(p.height) || 0); }
      const caja = e.closest("label, .caja-campo, .buscador, .paso-cantidad, .segmento-cayla"); if (caja) { const c = caja.getBoundingClientRect(); w = Math.max(w, c.width); h = Math.max(h, c.height); }
      return { e, w, h };
    }).filter(x => Math.min(x.w, x.h) < 43.5);
    r.toqueChico = cap(chicos.map(x => nombre(x.e) + " " + px(x.w) + "×" + px(x.h)));
    if (chicos.length > 8) r.toqueChicoTotal = chicos.length;
  }
  const pegados = todos.filter(e => getComputedStyle(e).position === "sticky");
  r.pegadoQueNoPega = cap(pegados.map(e => {
    const s = getComputedStyle(e), vertical = s.top !== "auto" || s.bottom !== "auto";
    let caja = null, afuera = false;
    for (let p = e.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) { const o = getComputedStyle(p); if (corre(o.overflowX) || corre(o.overflowY)) { if (!caja) caja = p; else if (vertical ? p.scrollHeight > p.clientHeight + 1 : p.scrollWidth > p.clientWidth + 1) afuera = true; } }
    if (!caja) return null;
    const cajaCorre = vertical ? caja.scrollHeight > caja.clientHeight + 1 : caja.scrollWidth > caja.clientWidth + 1;
    const paginaCorre = vertical ? document.documentElement.scrollHeight > H + 1 : document.documentElement.scrollWidth > W + 1;
    return !cajaCorre && (afuera || paginaCorre) ? nombre(e) + " dentro de " + nombre(caja) + ", que no se desplaza" : null;
  }).filter(Boolean));
  const ata = o => o.transform !== "none" ? "transform" : o.filter !== "none" ? "filter" : (o.backdropFilter && o.backdropFilter !== "none") ? "backdrop-filter" : o.perspective !== "none" ? "perspective" : /transform|filter|perspective/.test(o.willChange) ? "will-change" : /paint|layout|strict|content/.test(o.contain) ? "contain" : null;
  r.fijoAtrapado = cap(todos.filter(e => getComputedStyle(e).position === "fixed").map(e => {
    for (let p = e.parentElement; p && p !== document.documentElement; p = p.parentElement) { const m = ata(getComputedStyle(p)); if (m) { const q = p.getBoundingClientRect(); if (Math.abs(q.left) <= 1 && Math.abs(q.top) <= 1 && Math.abs(q.width - W) <= 1 && Math.abs(q.height - H) <= 1) return null; return nombre(e) + " queda atado a " + nombre(p) + " (" + m + ")"; } }
    return null;
  }).filter(Boolean));
  const barras = todos.filter(e => { const s = getComputedStyle(e), b = e.getBoundingClientRect(); if (s.position !== "fixed" && s.position !== "sticky") return false; if (e.closest('[role="dialog"]') || b.width < 0.6 * W || b.height > 0.5 * H || b.bottom <= 0 || b.top >= H) return false; return s.position === "fixed" || Math.abs(b.top - parseFloat(s.top)) <= 1 || Math.abs(H - b.bottom - parseFloat(s.bottom)) <= 1; }).filter((e, i, a) => !a.some(o => o !== e && o.contains(e)));
  const arriba = barras.filter(e => e.getBoundingClientRect().top < H / 2).reduce((n, e) => n + e.getBoundingClientRect().height, 0), abajo = barras.filter(e => e.getBoundingClientRect().top >= H / 2).reduce((n, e) => n + e.getBoundingClientRect().height, 0);
  const pct = px(100 * (arriba + abajo) / H);
  if (pct >= 30) r.barrasPegadas = { arriba: px(arriba), abajo: px(abajo), pct, cuales: cap(barras.map(nombre)) };
  for (const k of Object.keys(r)) { const v = r[k]; if (Array.isArray(v) && !v.length) delete r[k]; }
  return r;
};
localStorage.setItem("__c", "(" + g.toString() + ")");
JSON.stringify(g())
```

Cómo leerlo (probado el 2026-11-18 plantando cada falla a propósito: las cinco se detectan):
- `tactil`: si el navegador se presenta como teléfono. Con `false`, `campoConZoom` y `toqueChico` **no se midieron** en ese tamaño: no es «limpio».
- `campoConZoom`: un campo con letra de menos de 16 px. El iPhone agranda toda la pantalla al tocarlo y no la devuelve. El ERP ya los sube a 16 (`app/estilos/campos-y-casillas.css`); uno que aparezca aquí se escapó de esa regla. Rompe.
- `toqueChico`: algo que se toca en menos de 44 × 44 px, contando el área invisible que lo agranda (`area-dedo`) y la caja o etiqueta que lo envuelve. Es la misma cuenta de `apps/web/tacto/medir.mjs`: para el total de una ruta, `pnpm --filter web tacto:medir -- /ruta`. El arreglo va en `app/estilos/tacto.css`, nunca agrandando el dibujo a mano. Rompe; si es el botón principal, Bloquea.
- `pegadoQueNoPega`: algo que debía quedarse pegado al desplazar (una cabecera de tabla, una barra) está dentro de una caja con `overflow` que no se desplaza, así que se va con la página. **Confírmalo desplazando** y con captura antes de reportarlo: si lo pegado no hace falta a ese ancho, no es hallazgo.
- `fijoAtrapado`: algo `fixed` (una barra de abajo, una lista flotante) tiene un ancestro con `transform`, `filter` o `backdrop-filter`, y queda atado a ese ancestro en vez de a la pantalla. Es la misma razón por la que la hoja no lleva `backdrop-filter` (ADR-0596). Míralo en la captura: si se ve en su lugar al desplazar, es Sugerencia; si se corta o se va, Rompe. Si la página está a medio animar da falsos positivos: mide asentada.
- `barrasPegadas`: lo que queda fijo arriba y abajo ocupa el 30 % o más del alto. A 844 × 390 es donde aparece. Sugerencia; Rompe si lo que queda libre no deja ver ni una fila completa.
- Lo que más pesa en celular sigue saliendo del primer medidor: `paginaDesborda` (cualquier desplazamiento de lado en un teléfono es Rompe), `fueraDeVista` y las `hojas` (bajo 640 px la hoja llega desde abajo: `cortadaAbajo` sin scroll es Bloquea).
- **Una vez por corrida, en el código del módulo:** `grep -rnE "100vh|h-screen" <archivos del módulo>`. En un teléfono `100vh` mide más que lo que se ve (cuenta el espacio de la barra del navegador): lo correcto es `dvh`/`svh` o las clases `h-dvh`/`min-h-dvh`. Un `100vh` seguido de la misma propiedad en `dvh` es el respaldo correcto para navegadores viejos (`app/estilos/login.css`), no un hallazgo. Lo demás va como Sugerencia con `[código archivo:línea]`, salvo que la captura muestre un botón tapado.
- Si aparece la oferta de la guía («¿Te mostramos …?») tapa media pantalla: no es un hallazgo. Ciérrala con «Ahora no» y vuelve a medir.

## Paso 4 — Reporte en el chat (concreto y simple)

Primero, tres líneas: cuántas vistas × anchos se revisaron, cuántas salieron limpias y cuántos hallazgos hay por severidad. Luego, los hallazgos numerados. **Agrupa por causa**: el mismo problema en varios anchos es UN hallazgo con la lista de anchos, y el mismo componente roto en varias pantallas es UN hallazgo con la lista de pantallas.

```
#N · [Severidad] Módulo ▸ pantalla ▸ estado — anchos: 1024, 1280
Qué se ve mal: una frase, con la medida («la página desborda 86 px a 1024»).
Dónde: `archivo` [probable] o `archivo:línea` [código] — cómo lo ubicaste.
Arreglo sugerido: una línea, sin aplicarlo.
```

Severidad, de mayor a menor:
- **Bloquea:** no se puede completar la acción (botón principal inalcanzable, hoja cortada sin scroll, control tapado) o un dato clave desaparece (una columna con 0 px).
- **Rompe:** se ve mal pero se puede usar (desborde de página, texto cortado, solape, tabla ilegible, cifra partida).
- **Sugerencia:** estética o desperdicio (espacio vacío en 1920, contenido pegado a un lado, salto de layout entre anchos cercanos). Va aparte, al final.

Etiqueta cada dato: `[medido]` (script), `[visto]` (captura), `[código archivo:línea]`, `[inferido]`. Con más de 15 hallazgos, lista los 10 más graves y di cuántos quedan.

**Las capturas de cada hallazgo.** Quien lee el reporte tiene que poder ver lo que tú viste. Cada captura que uses como evidencia va con nombre `H<n>_<vista>_<ancho>x<alto>` (por ejemplo `H3_por-pagar_1024x768`; las de comparación, con prefijo `ref_`). El navegador guarda cada imagen y devuelve su ruta en el resultado: cópiala a una carpeta de trabajo (el directorio temporal de la sesión, **no** el repo) con ese nombre. Si tu sesión puede enviar archivos (`SendUserFile`), envíalas al cerrar, agrupadas por hallazgo, con un pie que diga qué imagen es cuál y qué mirar en ella. Si no puede, indica en cada hallazgo la vista y el ancho para que quien lo arregle reproduzca la captura. Nunca envíes una captura tomada con la página a medio animar. Las imágenes salen a unos 800 px de ancho aunque el viewport sea mayor: dilo si alguien pregunta por qué se ven chicas.

Cierra siempre con **«No cubierto»**: modales que el registro declara y no pudiste abrir, vistas que exigían guardar, lo que quedó por debajo del primer pliegue de la captura, y el aviso de que el seed local tiene pocos datos, así que **nombres largos y tablas de cientos de filas no se probaron**. Termina con: «Dime cuáles arreglar (por ejemplo: arregla el 1, 3 y 5)».

**Con `celular`**, cada hallazgo de `/vender`, `/vender/apartados`, `/cambios` o `/devoluciones` lleva `[celular obligatorio]` y va primero dentro de su severidad. Y «No cubierto» dice siempre, además: que es un teléfono **emulado** (no Safari de iPhone, que es el que más difiere); que **el teclado abierto** no se probó (tapa lo que está fijo abajo); que la isla, la muesca y la barra de inicio no existen aquí (`env(safe-area-inset-*)` vale 0); que la tablet y el teléfono acostado se midieron **como mouse**, sin la regla de 44 px; y que no se probó el zoom de la página al 200 %.

## Lo que esta skill no hace

- No mide impresión, ni anchos entre 845 y 1023 px. En celular no ve lo que solo pasa en un aparato de verdad (ver «No cubierto»).
- No arregla ni rediseña para celular: cómo se traduce una pantalla de escritorio (tabla, lateral, filtros) ya lo deciden las piezas del sistema (`<Tabla>`, `<Modal>`, `<Cajon>`, `BarraDeAbajo`; ADR-0479). Si una pantalla necesita otra traducción, es una decisión de Felipe, no un hallazgo.
- No juzga la lógica de negocio ni la estética de marca: eso es `/pantalla`.
- No verifica la guía de foco: eso es `/focus`.
- No corre ni crea pruebas automáticas.
