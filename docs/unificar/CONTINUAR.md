# Cómo seguir con `/unificar` desde otra sesión

Escrito el 2026-10-07, al cerrar la ronda 4 (rama `claude/unificar-boton`). Es el punto de partida para la próxima sesión: qué está
decidido, qué falta, cómo se trabaja y lo que se aprendió en el camino. **Léelo antes de abrir la skill** (`/unificar`) y mantenlo al día
al cerrar cada ronda: la próxima sesión no ve esta conversación.

**Para arrancar, pega esto en la sesión nueva:**

> Seguimos con `/unificar`. Lee `docs/unificar/CONTINUAR.md` y `docs/unificar/README.md`, revisa qué cambió en `main` desde el
> 2026-10-07 y propónme la próxima ronda (la primera de «Lo que falta», con un censo nuevo antes).

## Dónde quedó

Ocho familias decididas por Felipe, todas **mirando** (y la 3 y la 4, **tocando** botones vivos), migradas y vigiladas por
`lib/unificar.test.ts`. **Las siete con candado están en deuda 0.**

| Ronda | Familia | La pieza | Registro |
|---|---|---|---|
| 1 | `accion.volver` | `<Volver>`: la flecha redonda. Desde la ronda 3 también es el «Atrás» de un paso a paso («volver solo es una flecha») | [accion.volver.md](accion.volver.md) |
| 1 | `pestanas` | `<Pestanas>` (cambia de sección), `pildora-cayla` (filtra), `SegmentoEnlaces` / `SegmentoDeslizante forma="modo"` (otra forma de ver) | [pestanas.md](pestanas.md) |
| 1 | `cifra` | `<TarjetaCifra>` | [cifra.md](cifra.md) |
| 2 | `estado` | `<Chip>` (sin candado: quedan 7 píldoras a mano que son contadores o etiquetas) | [estado.md](estado.md) |
| 2 | `accion.nuevo` | `<Boton>` / `<BotonEnlace>` / `<BotonAncla>` | [accion.nuevo.md](accion.nuevo.md) |
| 3 | movimiento | `.mov-boton` (`app/globals.css`): sube 2 px con sombra, luz que cruza, el «+» gira, la flecha avanza, se encoge al presionar; un botón negro pasa a rojo profundo | [accion.nuevo.md](accion.nuevo.md) |
| 4 | `boton` | **Dos voces**: la voz la pone el LUGAR (`data-voz="cabecera"` → versalitas de 11 px y 40 px; hojas, tarjetas y filas → letra normal de 13,5 px). Pieza: `btn-cayla` (que `<Boton>` dibuja). **Onda al clic** (`<OndaBotones>` en `app/layout.tsx`). Todo `btn-cayla` tiene el movimiento | [boton.md](boton.md) |
| 4 | `accion.eliminar` | `btn-peligro` (rojo desde el principio); en la barra de vidrio, `fila-alerta` | [boton.md](boton.md) |
| 4 | `accion.cerrar` | la × de `<Modal conCerrar>`; `ModalRuta` la trae por defecto | [boton.md](boton.md) |

Lo mismo, en corto, está en la tabla «Piezas únicas» de `CLAUDE.md`, que es lo que lee cualquier sesión que construya una pantalla.

## Ronda 5 (abierta el 2026-10-07 por la noche, rama `claude/unificar-next-round-bdaaa0`): esperando que Felipe elija

`vacio`, `aviso` y `buscador`, juntas. Censo nuevo de Admin (242 vistas) y del mostrador (`terminal-ventas`), depurado contra el código.
Propuestas en `propuestas/vacio.html`, `aviso.html` y `buscador.html`. **La página de elegir** está en
`apps/web/unificar/.salida/elegir-ronda5/elegir.html` (servida por `unificar-laminas`: `/elegir-ronda5/elegir.html`), fuera de git: si
se perdió, se rehace con `node construir.mjs` desde esa carpeta (sus scripts: `bajar-css.mjs` copia el CSS y las fuentes del ERP,
`fotos-vivas.mjs` pone cada propuesta sobre la pantalla real y fotografía antes/después en claro, oscuro y 375 px, `fotos-hoy.mjs`
fotografía las formas de hoy forzando «zzzz», `armar-fotos.mjs` las reparte y `vista.mjs` fotografía la página). Si la worktree se
borró, esos scripts tampoco están: el `spec` vive en la carpeta y la idea en `propuestas/*.html`.

Novedades de la página de elegir (en `elegir.mjs`, sirven a las rondas que vienen): `estilos` y `guion` (hojas y un .js comunes a las
demos), el botón «Ver en oscuro» (cambia `data-tema` y todo se ve con los tokens oscuros del ERP), «Repetir la entrada» y «Ver …» por
escena en cada demo (con `demo.js`), y `fotosAlFinal`. Se arregló un fallo: la página escondía todo `input` dentro de una tarjeta, así
que un buscador vivo no se podía usar (`.op > input`).

Al elegir Felipe: registrar las tres familias (`referencia/decision.md`), construir `<Vacio>`, `<Aviso>` y `<Buscador>` en
`components/ui/` con el movimiento de la propuesta, y migrar módulo por módulo. Ojo con lo que NO es solo cara: sumar «Borrar la
búsqueda» o quitar un filtro con un toque en un vacío que hoy no lo tiene agrega una acción (que ya existe arriba): si Felipe elige
la P1 de la pregunta 3, confirmar pantalla por pantalla.

## Lo que falta, en orden

### 1. Las próximas rondas (de a 3 familias como máximo)

El orden recomendado sale del tablero `README.md` («Por analizar»): primero lo que la colaboradora lee o toca en más pantallas.

1. ~~`vacio`~~, ~~`aviso`~~, ~~`buscador`~~: ronda 5, propuestas esperando la elección (arriba).
4. **`combo`** (42 formas) — la regla de buscar y paginar ya es una (ADR-0209); `SelectFin` es de Finanzas (ADR-0195, decidida a propósito).
5. **`tabla`** (37 formas) — `fin-tabla` de Finanzas queda aparte por ADR-0195.
6. **`campo` + `etiqueta-campo`** — viven en las hojas: censo con `--escenarios`.
7. **`titulo-seccion`** (46 formas, sin pieza del sistema).
8. **`accion.ver`, `accion.filtrar`, `accion.exportar`** — botones de una función.
9. **`casilla`, `enlace`, `modal`, `grafico`, `paginacion`, `avatar`** — pocas formas: rondas cortas. Los gráficos de Análisis tienen su excepción de movimiento (ADR-0357).
10. **`icono`** (250 huellas: casi todo tamaño y trazo de lucide; depurar mucho antes de mostrar).
11. **`contador` y las píldoras-etiqueta** — cierran el candado de `estado` (las 7 a mano: `ExistenciasChips`, `ConfirmarCambios`, `RolesPanel`, `DevolucionesPanel`, `atributos/kit`, `ModalesApartado`, `FichaColaborador`).
12. **`titulo-pagina`** — **no se corre** hasta que Felipe decida la cabecera de Compras, Caja, Recibir y el resto de Catálogo (ADR-0220).

### 2. Preguntas abiertas para Felipe

- **La cabecera de Compras, Caja, Recibir y el resto de Catálogo** (ADR-0220): decidirla destraba `titulo-pagina`.
- **«Piden algo hoy»** de Análisis (la cifra que cuenta tres grupos y filtra uno): va en su propia tarea.
- **Avisar a Dany** de los cambios en Rendimiento y Clientes (dueña del plan de Clientes): pestañas, cifras, botones y la × en
  Beneficios del club. Redactar el mensaje con capturas; lo envía Felipe.
- **Confirmar mirando** tres cosas que se aplicaron por regla:
  - la cabecera de Caja, cuyos botones en versalitas bajan de fila a 1440 px (quedaron a la derecha);
  - la flecha redonda en la banda de color del reverso de los pases de Traslados (ADR-0355);
  - Finanzas en versalitas en su cabecera (commit propio en la ronda 2, por si se revierte).
- **El «Registrar N» del anillo de Análisis** (`components/analisis/TodaviaNo.tsx`): quedó como excepción de `accion.nuevo` (diseño de ADR-0357).

### 3. Deudas chicas que vio la auditoría de modo oscuro (heredadas del claro)

Ninguna la causó la ronda 4, pero fallan contraste (WCAG) en los dos temas:

- el «Pagar» `btn-sutil` de una fila marcada en Por pagar (1,8:1);
- el conteo gris de las píldoras de Clientes (`dark:opacity-85`, 2,5:1);
- 24 textos de filas atenuadas (Por pagar, Compras, Categorías, Configuración).

### 4. Huecos del censo

- **Falta una pasada con la cuenta `integrante`.** Ya hubo con Admin y con `terminal-ventas`.
- **Apartados no tiene escenarios a 375 px:** a ese ancho, la auditoría de modo oscuro solo midió la pantalla principal.
- **Sin escenario:** «Registrar gasto» de Caja, «Nueva serie» y «Registrar» de Series (con la cuenta del mostrador), y «la ficha de
  una prenda» de Análisis. Los modales que el auditor no sabe abrir quedan en «No cubierto».

## Cómo se trabaja (lo que funcionó)

**La rama.** Una rama nueva desde `origin/main` por ronda (`git checkout -b claude/unificar-<familia> origin/main`), commits locales por
actividad y el PR al final, cuando Felipe lo pide.

**El servidor.** Esta worktree no traía `apps/web/.env.local`: se copian **solo** las dos variables de Supabase local de otra worktree
(`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54421` y su `PUBLISHABLE_KEY`). Luego:

- `preview_start` **`cayla-retail-dev-libre`** (puerto 3110) para el ERP;
- `preview_start` **`unificar-laminas`** (puerto 8793) para servir `apps/web/unificar/.salida/` (láminas, páginas de elegir, pruebas).

**Ojo: la app cierra los dos servidores cuando la sesión queda quieta** (pasó cuatro veces). Si un script da `ERR_CONNECTION_REFUSED`
o «fetch failed», se vuelve a hacer `preview_start` y se espera un `200` en `/login` antes de seguir.

**El censo** (desde `apps/web`, unos 10 minutos con escenarios; correlo en segundo plano):

```bash
node unificar/cli.mjs --base-url http://localhost:3110 --todas --escenarios --familia <a,b> --salida unificar/.salida/<carpeta>
node unificar/cli.mjs --base-url http://localhost:3110 --cuenta terminal-ventas --todas --escenarios --salida unificar/.salida/<carpeta>
node unificar/deuda.mjs [familia]
```

El informe trae, por variante, su `movimiento:` (qué hace al pasar el mouse, al presionar, con el foco, en bucle, al aparecer) y lo
`medido:` (el censo le pasa el mouse sin clic). **Felipe quiere conservar, mejorar y unificar también las animaciones**: díselo por
variante y no pierdas ninguna al migrar.

**Depurar antes de mostrar.** Agrupa las variantes por cara y por función con un script sobre `censo.json`. El motor cuenta de más:
- las tallas de Vender salían como «Nuevo» (ya corregido);
- un chip de filtro parece un botón;
- «Volver al inicio» de una paginación parece una vuelta.

**La página de elegir** (`node unificar/elegir.mjs <spec.json>`, cabecera del script). Lo que hizo elegir bien:

- **fotos reales con la pieza cambiada en vivo:** un script de Playwright abre la pantalla, cambia el DOM (las clases o el texto) y
  fotografía el antes y el después en las mismas pantallas, así se compara parejo;
- **`demo`: botones o una hoja VIVOS** dibujados con el CSS real del ERP (`css` apuntando a un `recursos/app.css` de un censo, o al CSS
  descargado del servidor, y `claseHtml` con las clases de las fuentes). Una foto no muestra el movimiento; Felipe eligió la ronda 3 y la
  4 tocándolos;
- **`movimiento`: lo que la foto no muestra**, en una línea por opción;
- `ancha: true` cuando la demo es una hoja (si no, los botones se apilan);
- recomendación en el texto de la respuesta, pero **la elección es de Felipe** y llega pegada al chat («Copiar mi elección»).

**Migrar.**

- Las piezas primero, con una prueba viva para su OK antes de tocar los módulos (como se hizo con la onda y las dos voces).
- Después un **transformador de clases** en Python, corrido primero en seco (`ver`) y luego `aplicar`. Saca la cara a mano (`label-cayla`,
  esquinas, relleno, color, hover, transiciones) y conserva lo que ubica al botón en la fila (`flex-1`, `w-full`, márgenes, alto).
- El peso sale de **cómo se ve en reposo, sin `hover:`**: un `hover:border-rojo` no hace peligroso a un botón.
- Una línea `import { … }` nueva va **después del último import completo**: insertarla tras la última línea que empieza con `import`
  la metió dos veces en medio de un import de varias líneas.
- Un commit por módulo.

**Antes de cerrar.**

- `node unificar/deuda.mjs` con todo en 0, o la deuda declarada.
- `pnpm --filter web typecheck` y `pnpm --filter web test`.
- Fotos antes y después al mismo ancho (`pnpm unificar:fotos`); el mostrador también a 375 px (PL-105).
- `tema:auditar` con 0 hallazgos solo en oscuro, **mirando las capturas**.
- El registro de la familia, `README.md`, `CLAUDE.md`, ADR-0358, y la bitácora y el backlog de la rama.

## Lo que se aprendió (y conviene no repetir)

- **Elegir por descripción falla; mirando y tocando, no.** El 2026-10-06 Felipe eligió tres por su texto y, al verlas, no le gustaron.
- **Una firma del CI puede volverse falsa cuando cambia la pieza.** La de la ronda 2 trataba `btn-cayla` como copia a mano, y en la
  ronda 4 `btn-cayla` pasó a ser la pieza. Revisa las firmas de las familias vecinas al decidir.
- **Las pruebas exactas también bajan:** al quitar un anillo de foco propio, `lib/foco-comun.test.ts` (`PENDIENTES_HOY`) pide bajar la
  cuenta; hazlo con una línea que diga por qué.
- **El motor del censo tenía tres puntos ciegos con `::after`,** ya corregidos (`4cc1e386`):
  - el pseudo-elemento no se puede comparar con `matches()`;
  - un atajo `animation` con `var()` deja vacías sus partes en el CSSOM;
  - lo medido se cortaba en las tres primeras transiciones.

  Si una animación «no aparece», sospecha del motor antes que de la pantalla.
- **El gancho de commit corre todas las pruebas unitarias.** Con la máquina cargada, una de propiedades (`separaciones-reglas`, 29 999
  casos) puede pasar su límite de 5 s: córrela sola y reintenta. No es el cambio.
- **La base local es compartida:** otra sesión cerró y reabrió la caja de Lima a mitad de las fotos (`estado.prueba.mjs`). Si una foto
  cambia sin razón, mira `retail.cajas` antes de buscar el error en el código.
- **`.salida/` está fuera de git:** las láminas, las páginas de elegir y los scripts de captura de esta sesión no viajan a otra worktree.
  Lo que hay que conservar va a `docs/unificar/` (registros y `capturas/*.jpg` chicas).

## Archivos clave

| | |
|---|---|
| `.claude/skills/unificar/` | la skill: método, criterio, propuesta, decisión, informe |
| `apps/web/unificar/familias.mjs` | las familias, las funciones de botón y las `DECISIONES` con firmas, deuda y excepciones (también `ventana`) |
| `apps/web/unificar/motor/censo-en-pagina.js` | la huella y el movimiento de cada pieza (corre en la página) |
| `apps/web/unificar/cli.mjs` | el censo, lo medido al pasar el mouse, el informe y la lámina |
| `apps/web/unificar/elegir.mjs` | la página de elegir (fotos, `demo` vivas, `movimiento`) |
| `apps/web/unificar/deuda.mjs` | la deuda (la usa `lib/unificar.test.ts`) |
| `apps/web/components/ui/campos.tsx` | `Boton`, `BotonEnlace`, `BotonAncla` (y sus pesos) |
| `apps/web/components/ui/OndaBotones.tsx` | la onda al clic |
| `apps/web/app/globals.css` | `btn-cayla`, `.mov-boton`, la voz de la cabecera y `cayla-onda` |
| `docs/adr/0358-unificar-una-funcion-una-pieza.md` | el ADR y la línea de cada decisión |
