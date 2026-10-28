---
name: multi-view-responsive
description: Recorre las pantallas, pestañas, modales y hojas de un módulo del ERP CAYLA en LOCAL a siete tamaños de laptop y monitor (1024 a 1920), mide el DOM y captura cada vista para encontrar errores de responsive (desborde, texto cortado, solapes, hojas y tablas rotas, espacio desperdiciado) y los reporta en el chat de forma concreta para que la persona los ordene arreglar. Solo mide y reporta, no toca código. Sin celular por ahora. Úsala cuando pidan revisar el responsive de un módulo, una ruta o todo el ERP.
---

Revisa el responsive de escritorio de: $ARGUMENTS

**Entrada:** un módulo (`inventario`, `vender`, `finanzas`), una ruta (`/vender/apartados`) o `todo`. Sin argumento, pregunta cuál y para.
**Regla madre:** solo mides y reportas. No edites código, docs, backlog ni migraciones, no hagas commit, no escribas archivos de reporte: el reporte va **solo en el chat**. Arreglar es un paso aparte que la persona ordena («arregla el 1, 3 y 5»).
**Solo LOCAL.** Nunca navegues a producción ni a un dominio de Vercel, ni siquiera de solo lectura (decisión del equipo, 2026-09-30).
**Sin celular:** los anchos son de laptop y monitor. No uses el preset `mobile` ni anchos menores a 1024.

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

## Paso 0 — Terreno (si algo falla, para y dilo)

1. **Rama y base:** `git status --short` y `git rev-list --left-right --count HEAD...origin/main`. Dilo en una línea: qué rama y cuántos commits va detrás de `main` (lo medido es el código de la rama, no el de producción). No arregles nada.
2. **Entorno local:** existe `apps/web/.env.local` (si no, pídele a la persona que lo copie; no lo leas ni lo crees). La base local responde (`curl -s -o /dev/null -w "%{http_code}" http://localhost:54421/rest/v1/`); si no, dile que levante Supabase local.
3. **Servidor:** en la app de escritorio, `preview_start` con `cayla-retail-dev` (puerto 3010; tarda en pasar de `starting` a escuchar, revisa con `preview_list` y `lsof -iTCP:3010`). En la terminal, `PORT=3010 pnpm --filter web dev` en segundo plano y espera a que el puerto escuche. Si ya estaba corriendo, reutilízalo y **no lo detengas al terminar**. Si el 3010 lo ocupa otro worktree, no toques `launch.json`: avisa a la persona.
4. **Tu propia pestaña:** el panel se comparte con la persona que te invoca. `tabs_create` y pasa `tabId` en TODAS las llamadas. Usa `http://localhost:3010`, nunca `127.0.0.1` (Next no hidrata en esa dirección).
5. **Sesión:** si aparece `/login`, dile a la persona que inicie sesión ella misma en esa pestaña y espera. Nunca escribas contraseñas ni credenciales.
6. **El tamaño emulado se borra** cuando termina tu turno: vuelve a fijarlo si sigues en otro turno. Al terminar, `resize_window` con `preset: "desktop"`.

## Paso 1 — Inventario de vistas (antes de capturar nada)

Arma la lista de lo que vas a recorrer y dile a la persona cuántas vistas y cuántas capturas salen (vistas × 7):

- **Rutas del módulo:** `lib/menu.ts` da los nodos del módulo; el resto (rutas sin menú, como `/pedidos-no-atendidos`) sale de `grep -oE '^  "/[^"]*"' apps/web/lib/guia-de-foco-pantallas.ts`. Una ruta con `[id]` se abre desde su lista con un dato del seed, no inventando un id.
- **Estados de cada ruta:** pestañas y filtros que cambian la vista, lista vacía y lista con datos, cajón o vista rápida abierta.
- **Modales y hojas:** los de `MODALES` en el mismo registro (la clave es el archivo). Para cada uno, encuentra qué botón lo abre leyendo dónde se importa. Las rutas con `@modal` (por ejemplo `compras/@modal`) se abren por clic y también por URL directa.
- **`todo`:** son unas 86 rutas y unos 90 modales, o sea más de mil capturas. Confirma con la persona y luego avanza **módulo por módulo**, entregando el reporte de cada uno antes de seguir.

## Paso 2 — Reglas de seguridad al abrir estados (local, pero igual)

La base local es compartida entre sesiones y algunas acciones llaman afuera (Lucode, padrón de SUNAT). Por eso:

- **Puedes pulsar** lo que abre o navega: Nuevo, Editar, Ver, Detalle, Registrar (si solo abre el modal), pestañas, filtros, combos, paginación, el lateral, el selector de sede. Cierras con Escape o Cancelar.
- **No pulses** lo que guarda o dispara algo: Guardar, Confirmar, Emitir, Anular, Enviar, Recibir, Pagar, Cerrar caja, Cerrar conteo, Aprobar, Eliminar, Archivar. Tampoco busques DNI o RUC en el padrón.
- Si una vista solo se alcanza guardando algo, no la fuerces: anótala en «No cubierto».

## Paso 3 — Recorre cada vista en los siete anchos

**Guarda el script una sola vez** (`javascript_tool`, `javascript_exec`): ejecuta el bloque de abajo con `localStorage.setItem("__m", "(" + f.toString() + ")")` y desde entonces cada medición es `JSON.stringify(eval(localStorage.getItem('__m'))())`. Sobrevive a las navegaciones del mismo origen; si falta, vuelve a guardarlo. El script solo inspecciona, no modifica la página.

Para cada vista: **prepara el estado una vez** (abre el modal, la pestaña), y luego recorre los siete anchos sin recargar; cierra al terminar.

1. **Espera a que la página se asiente antes de medir o capturar.** Muchas pantallas entran con fundidos y cuentan cifras subiendo durante varios segundos (Por pagar, Proveedores); una captura a medias engaña. Una espera fija no alcanza y `getAnimations()` no ve las cifras que suben por JavaScript. Usa: repetir cada 250 ms hasta que `document.body.innerText` no cambie durante 5 lecturas seguidas (tope 15 s). Con un modal recién abierto, además `wait` de 2 s.
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
  r.fueraDeVista = cap(todos.filter(e => !e.children.length || /^(BUTTON|A|INPUT|SELECT|LABEL)$/.test(e.tagName)).filter(e => e.getBoundingClientRect().right > W + 1 && !scrollerX(e)).map(e => nombre(e) + " termina en " + Math.round(e.getBoundingClientRect().right)));
  r.textoCortado = cap(todos.filter(e => e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1 && (e.textContent || "").trim()).filter(e => { const s = getComputedStyle(e); return s.overflowX !== "visible" && s.overflowX !== "auto" && s.overflowX !== "scroll" && s.textOverflow !== "ellipsis"; }).map(e => nombre(e) + " " + e.clientWidth + "/" + e.scrollWidth));
  r.casiInvisible = cap(todos.filter(e => { const s = getComputedStyle(e); return s.textOverflow === "ellipsis" && e.scrollWidth > 2 * e.clientWidth && e.clientWidth < 70; }).map(e => nombre(e) + " " + e.clientWidth + "/" + e.scrollWidth));
  r.scrollbarFantasma = cap(todos.filter(e => { const s = getComputedStyle(e); const ay = (s.overflowY === "auto" || s.overflowY === "scroll") && e.offsetWidth - e.clientWidth >= 8 && e.scrollHeight - e.clientHeight <= 3; const ax = (s.overflowX === "auto" || s.overflowX === "scroll") && e.offsetHeight - e.clientHeight >= 8 && e.scrollWidth - e.clientWidth <= 3; return ay || ax; }).map(e => nombre(e) + " sobra " + (e.scrollHeight - e.clientHeight) + "px"));
  const hit = e => { const b = e.getBoundingClientRect(), x = b.left + b.width / 2, y = b.top + b.height / 2; if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false; const t = document.elementFromPoint(x, y); return !!t && (t === e || e.contains(t) || t.contains(e)); };
  const inter = todos.filter(hit).filter(e => e.matches('button,a[href],input,select,textarea,[role="button"],[role="tab"]'));
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
  const clipped = e => { const b = e.getBoundingClientRect(); for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const st = getComputedStyle(p); if (st.overflowX !== "visible" || st.overflowY !== "visible") { const q = p.getBoundingClientRect(); if (q.height < 2 || b.bottom <= q.top + 1 || b.top >= q.bottom - 1 || b.right <= q.left + 1 || b.left >= q.right - 1) return true; } } return false; };
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

## Lo que esta skill no hace

- No mide celular (menos de 1024) ni impresión.
- No juzga la lógica de negocio ni la estética de marca: eso es `/pantalla`.
- No verifica la guía de foco: eso es `/focus`.
- No corre ni crea pruebas automáticas.
