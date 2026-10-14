# Cómo seguir con `/unificar` desde otra sesión

Escrito el 2026-10-07 al cerrar la ronda 4 y puesto al día el 2026-10-08 al cerrar la ronda 5 (rama `claude/unificar-next-round-bdaaa0`), el 2026-10-09 con la ronda 5b, la barra apilada (rama `claude/keen-feistel-35a4cb`), el 2026-10-12 con las rondas 6 y 7 armadas, el 2026-10-13 con las rondas 6, 7 y 8 decididas y migradas (rama `claude/unificar-componentes-animaciones-f811a1`, PR #1026, fusionado el mismo día) y sus herramientas de migración en el repo (rama `claude/unificar-herramientas-deuda`), y ese mismo día con la ronda 9 —las seis que quedaron abiertas— y la ronda 10 —descargar, filtros y ver en otra pantalla— decididas y migradas, más el censo del mostrador rastreado al código, y el 2026-10-14 con la ronda 11 —cancelar, limpiar e imprimir— decidida y migrada (rama `claude/mystifying-jang-ef15d0`). Es el punto de partida para la próxima sesión: qué está
decidido, qué falta, cómo se trabaja y lo que se aprendió en el camino. **Léelo antes de abrir la skill** (`/unificar`) y mantenlo al día
al cerrar cada ronda: la próxima sesión no ve esta conversación.

**Para arrancar, pega esto en la sesión nueva:**

> Seguimos con `/unificar`. Lee `docs/unificar/CONTINUAR.md`, `docs/unificar/README.md` y `docs/unificar/MIGRAR.md`. Las rondas 1 a 11
> están decididas y migradas (deuda 0 en todas las familias). Arma la ronda 12 del tablero («Por analizar»: `modal`, `grafico` y los botones
> de una función que quedan —`accion.guardar`, `accion.editar`, `accion.buscar`, `accion.copiar`, `accion.menu`—) con un censo nuevo, y cierra
> lo que quedó de «Lo que falta, en orden».

## Dónde quedó

Veintiocho familias decididas por Felipe, todas **mirando** (y de la ronda 3 en adelante, **tocando** demos vivas), migradas y vigiladas
por `lib/unificar.test.ts`. **Todas las que tienen candado están en deuda 0** desde la ronda 9 (2026-10-13), también tras las rondas 10 y
11. La tabla de abajo es la de las rondas 1–5b; las de las rondas 6–11 están en el tablero (`README.md`) y en «Piezas únicas» de `CLAUDE.md`.

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
| 5 | `vacio` | `<Vacio>`: el ícono de lo que falta que se dibuja, título serif, frase que dice qué hacer y su botón; chico en tablas y hojas; al no encontrar, lo deshace ahí mismo | [vacio.md](vacio.md) |
| 5 | `aviso` | `<Aviso tono>` en franja (el error destella una vez); `nota-cayla` con su «i»; el error de un dato bajo su campo | [aviso.md](aviso.md) |
| 5 | `buscador` | `<Buscador>`: la caja hundida (lista) y la píldora que se despega (mostrador); «Buscando…» solo si tarda; busca mientras se escribe (salvo Cambios y Devoluciones) | [buscador.md](buscador.md) |
| 5b | `grafico.barra` | `<BarraApilada>`: pista de arena + el movimiento de Compras (entra, se reacomoda, el apuntado se estira y los demás bajan); 12 · 8 · 4 px; si responde, cada tramo es un botón. **Deuda: 0**; migrada entera (Compras, Vender, Caja y Producción) | [grafico.barra.md](grafico.barra.md) |

Lo mismo, en corto, está en la tabla «Piezas únicas» de `CLAUDE.md`, que es lo que lee cualquier sesión que construya una pantalla.

## Ronda 11 (2026-10-14): cancelar, limpiar e imprimir, decididas y migradas

Censo nuevo de las tres familias (Admin y el terminal del mostrador, con escenarios) y una página de elegir con el CSS del ERP de ese día
(`rondas/11/bajar-css.mjs` con la cuenta `integrante`, para no pisar la sesión de un censo). Felipe eligió **P1 · P2 · P1**: el pie de una hoja con
«Cancelar» a su medida ANTES de «Guardar» (`pie-acciones` / `<PieAcciones>`), los filtros puestos con la píldora de los vacíos y «Limpiar todo»
punteado (`<FiltroPuesto>`, `<BotonLimpiar>`), e imprimir con la impresora y «Imprimir» + qué (`<BotonImprimir>`). Migrado el mismo día: 116 pies
en 86 archivos (con dos scripts: uno por el texto «Cancelar» y otro por `botonCancelar`, que alcanzó los «Mejor no» de Apartados), 8 filtros
puestos y 11 «Limpiar», 24 botones de imprimir. Deuda 0 en las tres.

Lo aprendido en esta ronda:
- **Una regla sin `@layer` le gana a las utilidades de Tailwind.** El pie decide el ancho de sus botones aunque traigan `flex-1` (los pies de
  antes): así la migración fue cambiar la caja, no cada botón. Pero hay que acotarla: solo a `button` y `a` (una nota con `flex-1` a la
  izquierda conserva su lugar) y nunca a la flecha de `<Volver>` (`data-pieza="volver"`), que perdería su círculo.
- **Un pie que comparte la fila (`ml-auto`, al lado de «Falta: …») se encoge al ancho de sus palabras:** sus mitades a 375 px no eran mitades.
  En el celular el pie ocupa toda la fila (menos el `pie-hoja-fijo`, que se estira con sus márgenes negativos). Se vio mirando la captura.
- **Ningún Cancelar va después de Guardar:** había tres (Editar marca, «Liquidar desde» de Análisis, el aviso de una venta sin conexión). El
  script que migra también tiene que revisar el orden, y el aviso de «orden» de un script que ya cambió las clases que buscaba es falso.
- **Una prueba que busca el texto del código** (`modelo-nuevo-reglas.test.ts`, «className={botonCancelar}») se rompe con la migración aunque el
  comportamiento no cambie: se actualiza lo que espera, sin comillas dobles anidadas.
- **Un `unificar-fijo` dentro de un botón le borra el nombre a la huella de la guía** («(sin nombre)»); va dentro de la etiqueta de apertura,
  como comentario de JS (`<BotonEnlace … /* unificar-fijo: … */>`).
- **La caché de Turbopack llegó a 19 GB** (disco a 5 GB libres) y no se puede borrar desde la sesión: se detiene el servidor y se le pide a
  Felipe. Al detenerlo, el disco volvió a 14 GB.
- **La app apaga los servidores de vista previa al cerrar el turno:** un censo, una página de elegir o una verificación se hacen dentro del mismo
  turno, y la página de elegir se entrega empaquetada en un solo archivo (abre sin servidor).

## Ronda 10 (2026-10-13): descargar, filtros y ver en otra pantalla, decididas y migradas

Una página de elegir con tres preguntas (fuentes en `rondas/10/`, que reusa el CSS y el guion de la ronda 9). Felipe eligió las tres **P1**:
`<BotonDescargar>` («Descargar» + qué, el ícono que baja 2 px, el hilo mientras se arma el archivo), `<BotonFiltros>` como una píldora más
con su número en el globito, y `<BotonVer>` (el secundario con la flecha que avanza; nunca negro). Migrado el mismo día: 17 descargas y
17 «ver», deuda 0; la acción de un vacío sigue negra con su `unificar-fijo`. Registros: `accion.exportar.md`, `accion.filtrar.md`,
`accion.ver.md`.

**El censo del mostrador** (`terminal-ventas`, 61 de 133 vistas), rastreado al código, encontró **49 frases grises sueltas** en 40
archivos que la ronda 5 ya prohibía («Sin ventas todavía.», «No hay tickets en espera.»): pasaron a `<Vacio>` y la firma de `vacio` aprendió
a verlas (`ventana: 2`, ver `vacio.md`). Y tres «Ver … →» de Caja cuya clase iba en una constante pasaron a `<EnlaceVer>`.

Lo aprendido en esta ronda:
- **Una caja `inline-flex` dentro de `<Boton>` hace crecer el botón.** `<Boton>` envuelve su texto en un `<span>` de bloque; una caja
  `inline-flex` adentro (el «+» de «+ Nuevo cliente», el ícono de descarga) arma su propia línea de texto y suma hasta 5 px: en Clientes
  había 39,75 · 45,25 · 43,25 px en la misma fila. Las cajas de adentro van en `flex` (de bloque) y un ícono más alto que la letra lleva
  `-my-1`. Mide el alto de los botones de una fila (`getBoundingClientRect().height`), no lo mires a ojo.
- **El CSS base dibuja todo `svg` como bloque:** un ícono suelto dentro de `<Boton>` baja de línea. Siempre en una caja `flex` con el texto.
- **Una firma que lee la clase escrita no ve una clase en una constante** (`className={enlaceVer}`). El censo sí: por eso se rastrea.
- **Una firma atada a clases exactas deja pasar casi todo.** La de vacíos conocía seis combinaciones; el ERP tenía 49 frases con otras.
  La nueva mira lo que la frase DICE («Sin», «No hay», «Todavía no») en un texto gris, y deja pasar «Nada se guarda todavía», que explica.
- **El panel del navegador integrado no sirve para medir a 1440 px** (se encoge a su ancho y `sm:` no aplica): `resize_window` con
  `width: 1440` y, para fotos, un script de Playwright con la sesión del auditor (`.salida/elegir-ronda9/vacios-foto.mjs`, `escenas.mjs`).

## Ronda 9 (2026-10-13): las seis que quedaron abiertas, decididas y migradas

Una página de elegir con las seis preguntas (fuentes en `rondas/9/`): **lo de hoy copiado del DOM real del ERP** (`piezas-vivas.mjs` guarda
el `outerHTML` de cada pieza ya dibujada) y las propuestas con las clases reales; todo vivo. Felipe eligió P1 · P1 · P1 · P1 · P2 · P2 (en la
1 tomó P1, «una lista para las tres», en vez de la recomendada). Piezas nuevas: `<ListaSugerencias>` (+ `ariaDelBuscador`), `apartado` en
`DesplegablePildora`, `cuenta` y `nota` en los títulos (el globito de las pestañas, `titulo-cuenta`). Migrado: Llegó mercadería, Recibir
contra factura, Registrar nota de crédito, Contar, Frescura, Colores, ocho acciones chicas y doce títulos con número. **Deuda
4 → 0.** Firmas nuevas: desactivar escrito como enlace (`accion.eliminar`) y un conteo puesto como `dato` (`titulo-seccion`).

Lo aprendido en esta ronda:
- **Turbopack puede servir un CSS de hace una semana.** El `next dev` de esta worktree arrancó con un `.next/dev` del 6 de octubre y servía
  el CSS sin NINGUNA pieza de las rondas 6–8 (sin `titulo-seccion`, sin `caja-campo`): la pantalla parecía rota y no lo estaba. Si una foto
  sale con títulos en sans o cajas sin estilo, mira si el CSS servido trae la clase (`curl` del `.css` del `<link>` + `grep`); se arregla
  tocando `app/globals.css` con el servidor arriba (sumar y quitar una línea).
- **El `.next` crece 4 GB en media hora con un censo.** Con el disco al 96 % hay que liberarlo antes (Felipe borró el de esta worktree: 18 GB)
  y correr el censo con un vigía que lo detenga si el disco baja de 8 GB (ver `rondas/9/README.md`). `pkill -f "unificar/cli.mjs"` mata
  también al vigía si su línea de comandos nombra el censo: guarda el pid.
- **`pnpm` reescribe `pnpm-lock.yaml`** al levantar el servidor y en el gancho de commit (quita `@pnpm/exe`): `git checkout -- pnpm-lock.yaml`
  antes de cada commit, o viaja un cambio que nadie pidió.
- **Lo que el seed no tiene se mira en una página de ensayo** con datos en memoria (`app/(app)/ensayo-r9/page.tsx` para Contar, sin un conteo
  abierto en la base local), borrada antes del commit. No se crean datos en la base compartida para una foto.
- **Una animación de `<tr>` que se quita vuelve a correr la de entrada:** el respiro de la fila recién contada vive en sus celdas
  (`tr.fila-cayla[data-recien] > :is(td, th)`), y se quita el atributo solo al terminar ESE respiro (`animationName`), porque el estado de
  adentro también anima.
- **Una firma con `\b` después de un tamaño entre corchetes no ve nada:** entre «]» y un espacio no hay límite de palabra. La de títulos en
  sans dejó pasar 10 archivos hasta que el censo de después, rastreado al código, los encontró. Termina un tamaño con `(?![\w-])`.
  Rastrear el censo al código (el texto de cada variante, con `grep`) es lo que encuentra lo que las firmas no ven.
- **Al elegir una pieza para «desactivar», busca sus gemelas:** la firma nueva encontró «Desactivar proveedor», el mismo enlace en una frase;
  resultó inalcanzable (ninguna pantalla se lo pasaba a la hoja) y Felipe pidió quitarlo. Antes de migrar una gemela, mira si se ve.

## Rondas 6, 7 y 8: decididas el 2026-10-13 y migradas el mismo día

Felipe eligió tocando las demos: P1 en todo salvo el enlace suelto (P2, versalitas rojas con la flecha que avanza). Diez piezas nuevas o
rehechas (la caja que se enciende, la lista de todo combo, la píldora de filtro, el título de campo, la casilla y el interruptor, la tabla
con movimiento, `TituloSeccion` / `TituloGrupo` / `SeparadorDia`, `btn-enlace` y `EnlaceVer`, `<Paginas>`, `AvatarPersona`) y la
migración de toda la deuda en un día: **258 archivos → 4**, en tres lotes en paralelo (dos agentes con la
guía que ahora vive en [MIGRAR.md](MIGRAR.md) y la sesión principal), nueve commits por módulo, la suite entera en verde y
Vender, el ticket, el descuento y Devoluciones probados a 375 px. Lo que quedó abierto está en el README («La migración de las rondas
6–8»): tres combos con fotos o pistola, la tabla de Conteo, los filtros de Frescura, «Desactivar color», los conteos que pasaron a la
derecha y las acciones chicas que dejaron de ser versalitas rojas.

### Cómo se armaron (2026-10-12)

Tres páginas de elegir con TODO vivo (el CSS real del ERP, claro y oscuro) y las fotos de hoy; fuentes en `rondas/6-8/` (se regeneran
desde ahí), fragmentos en `propuestas/` e imágenes chicas en `capturas/*.propuesta.jpg`. **Nada se migró.**

- **Ronda 6 · formularios** (5 preguntas): (1) dónde se escribe y se elige —`campo` y `combo` en UNA pregunta, porque hoy una misma hoja
  mezcla cinco caras: el hilo (CampoTexto, CampoSelect), la caja hundida, la raya del ComboBuscable, la caja crema del Responsable y la cifra
  del CampoMonto—; (2) la lista que se abre; (3) el combo que filtra una lista; (4) el título de cada campo; (5) casillas e interruptores.
  Recomendación: la caja hundida que se enciende (P1), la lista de Desplegable con ✓, la píldora de la ronda 1 para los filtros, las
  versalitas de `Campo` que se oscurecen, la casilla que se dibuja con el interruptor en tinta.
- **Ronda 7 · leer datos** (4 preguntas): (1) la tabla —`<Tabla>` de hoy con movimiento: cascada al cargar, hilo de canto y «›» al
  apuntar, la fila abierta marcada, la flecha de ordenar—; (2) el título de un bloque (serif 21 con su dato a la derecha); (3) el título
  de un grupo dentro de una hoja (versalitas con raya que se dibuja); (4) el separador de día (pegado arriba, con el total del día).
- **Ronda 8 · enlaces, páginas y caras** (4 preguntas, familias cortas): (1) el enlace dentro de una frase —el hilo rojo que se llena
  al pasar el mouse—; (2) el enlace suelto que lleva a ver más —«Ver las 9 →» con la flecha que avanza, la misma acción del título de
  bloque de la ronda 7—; (3) el pie de una lista larga —la página actual como una píldora que se desliza, o «Ver 8 más»—; (4) la cara de
  una persona —AvatarPersona en cuatro tamaños fijos, o con el tono de cada persona de la vista rápida (ADR-0354)—. Fotos de los censos
  del 6 y 7 de octubre (sin base no se pudo medir de nuevo). El `contador` quedó para la ronda de las píldoras-etiqueta (cierra el
  candado de `estado`).
- **Depuración:** combo, de 42 formas a 7 reales (las 23 píldoras de filtro son una sola pieza con otro ícono; dos caras de «papel con borde
  tinta» son la guía de foco encendida, ADR-0284; dos eran buscadores, decididos en la ronda 5); tabla, de 39 a 4 + `fin-tabla` (la
  matriz de tallas de Existencias y el calendario no son tablas); título de sección, de 46 a tres familias —serif en 8 tamaños, versalitas
  en 6, sans en 5— más 4 separadores de día; las serif de 24 a 32 px eran títulos de hoja, fichas o vacíos (otras familias).
- **Decididas a propósito que la página presenta aparte:** Finanzas (`fin-control`, `SelectFin`, `fin-tabla`, `fin-etq`, ADR-0195) y la
  tabla de Catálogo ▸ Productos (ADR-0254). Con la P1 de la ronda 6, Finanzas queda a 4 px de ser igual al resto (36 contra 40).
- **Falta, después de la elección:** registrar cada familia (`docs/unificar/<familia>.md`, `DECISIONES` con firmas y deuda), construir
  las piezas (la caja con hilo en `campos.tsx`, la lista con ✓, la píldora de filtro, `Casilla` e `Interruptor`, el movimiento de
  `Tabla`, un `<TituloSeccion>`; en la ronda 8, el enlace en `btn-enlace`, la píldora que se desliza en `PaginacionLocal` y los cuatro
  tamaños de `AvatarPersona`), y migrar módulo por módulo con un censo de después. Y la pasada del mostrador (`terminal-ventas`).

Lo aprendido en estas rondas:
- **El disco lleno apaga Docker y el censo sigue «midiendo» el login.** El 2026-10-12 a las 18:41 el disco llegó al 100 %, Docker
  Desktop se apagó solo (`no space left on device` en `~/Library/Containers/com.docker.docker/Data/log/host/com.docker.backend.log`) y la
  base local cayó: el censo siguió y anotó 227 vistas como «redirige a /login». Antes de un censo largo, `df -h ~` (hacen falta varios
  GB: el `.next` de un `next dev` creció a 7,4 GB en una hora, y el de otra worktree pasaba los 100 GB). Si el informe trae muchos
  «redirige a /login», mira `curl -s -o /dev/null -w "%{http_code}" http://localhost:54421/rest/v1/` antes de culpar a la sesión.
- **No uses la cuenta del censo en otro script mientras corre.** `bajar-css.mjs` (y cualquier `abrirContexto` con `admin`) reusa
  `tema/.sesion/felipe@cayla.local.json`; si refresca el token, el del censo queda viejo.
- **La página de elegir usa las clases `.op` y `.grupo` para sus tarjetas y sus preguntas**: una demo que las use se rompe (su `leer()`
  buscaba un `textarea` en cada `.grupo` y caía). Las demos usan `.opc` y `.og`. Y una demo no puede tener `<label>`: la tarjeta ya es un
  `<label>` (se usan `<div>` y el guion pone el cursor). `elegir.mjs` ahora deja escribir y marcar adentro (`input`, `textarea`,
  `select` no se bloquean) y acepta `entera: true` (la tarjeta ocupa todo el ancho: una tabla viva no cabe en media pantalla).
- **Una captura con la pestaña en segundo plano sale a mitad de animación** (`cayla-revelar` arranca en opacidad 0): si una lista «no
  abrió», vuelve a capturar antes de buscar el error.

## Ronda 5b (2026-10-09): la barra apilada, decidida y migrada entera

Se pidió desde Frescura (ADR-0208 act. 2026-10-07: su rama creó `ui/BarraApilada`, la misma barra que «Deuda por vencimiento» de Compras dibujaba a
mano; esa rama entró a `main` por el PR #889). Felipe eligió **P** tocando las demos y pidió migrar las demás: quedó **deuda 0**, un commit por
módulo (Compras, Vender, Caja, Producción). **Falta, para Felipe:** si se unifican las barras de Análisis (ADR-0357) y del aviso de cierre de Caja
(ADR-0359), el medidor de la barra fija de Recibir, si el estirón es 1,35× para todas o 1,7× en las de 8 px, y que Frescura use `<MuestraTramo>` en su
leyenda. Lo aprendido:
- **El censo no veía las barras hechas con cajas**: solo recorría SVG. Ahora `censarBarrasApiladas` (`unificar/motor/censo-en-pagina.js`) las
  reconoce por su forma (fila baja y ancha de tramos pintados sin texto cuyos anchos suman el de la fila) y las anota como `grafico.barra`.
  Con una **familia partida**, `--familia grafico` sigue incluyéndola (el filtro acepta prefijo) y la decisión vive en el id nuevo.
- **Sin el Chromium de Playwright** (170 MB que Felipe no autorizó): `NAVEGADOR_CANAL=chrome` hace que el censo, las fotos y el auditor de
  tema usen el Google Chrome instalado.
- **Una pieza que otra rama ya creó** (`ui/BarraApilada` en la rama de Frescura): se trajo con `git show <rama>:<ruta>` y se extendió como
  superconjunto (mismas props); al traer `main` el choque se resuelve quedándose con la de esta rama.
- **Mirar los datos de verdad antes de escribir el registro**: varias afirmaciones de los borradores eran falsas (el color de «Cómo se pagó» sale
  de un token y no de un hex; `TarjetaCobrado` no se ve en `/caja` por otra razón que «el seed no trae ventas»; `PorPagarProduccionPanel` es de Producción).
- **Una barra que cambia mientras se escribe** (`viva`) no puede desmontar sus tramos: la transición se corta. Una barra decorativa no pone texto
  al pasar el mouse. Un tramo translúcido necesita su propia base de arena y su leyenda, `<MuestraTramo>`.
- **Dos revisiones adversarias** (6 lentes y escépticos por hallazgo, 64 agentes): cada una encontró cosas que la verificación a mano no vio.
  Las páginas de ensayo con datos de prueba (borradas, fuera de git) fueron la única forma de ver barras que el seed no muestra.

## Ronda 5 (2026-10-07/08): cerrada

`vacio`, `aviso` y `buscador`: decididas tocándolas, construidas (`components/ui/Vacio.tsx`, `Aviso.tsx`, `Buscador.tsx`, CSS en
`app/estilos/vacio-aviso-buscador.css`) y migradas enteras, deuda 0 (registros en `vacio.md`, `aviso.md`, `buscador.md`). Lo nuevo de la
página de elegir (`elegir.mjs`): `estilos`, `guion`, «Ver en oscuro», `fotosAlFinal` y demos vivas con «Ver» y «Repetir la entrada».
Para migrar rápido se repartió el ERP en cuatro agentes con instrucciones escritas (`apps/web/unificar/.salida/INSTRUCCIONES-MIGRAR-R5.md`,
fuera de git) y un archivo por agente: funcionó sin choques. Lo aprendido:
- **En JSX, `unificar-fijo` va como `{/* unificar-fijo: … */}` dentro del elemento**: un `//` suelto se dibuja como texto.
- **Una firma tiene que mirar la forma, no la prop**: `inputMode="search"` o un placeholder pasado a la pieza contaban como deuda.
- **Archivos que se prueban sin el alias `@/`** (`PerdidasVista`, `ExistenciasVacio`, los que `lib/*.test.ts` renderiza): no importes
  `components/ui/campos` ahí; usa la clase del botón (`btn-cayla btn-secundario`).
- **Turbopack guarda un CSS roto aunque ya lo arreglaste**: si el error nombra una línea que el archivo no tiene, comenta y vuelve a poner
  su `@import` en `globals.css` (borrar `.next` puede estar bloqueado).
- Las firmas de la ronda no veían todo (Existencias, Apartados): después de migrar, recorre las pantallas con una búsqueda imposible.

## Lo que falta, en orden

### 1. Las próximas rondas (de a 3 familias como máximo)

El orden recomendado sale del tablero `README.md` («Por analizar»): primero lo que la colaboradora lee o toca en más pantallas.

1. ~~`vacio`~~, ~~`aviso`~~, ~~`buscador`~~: ronda 5, decididas y migradas (deuda 0). ~~`combo`, `campo`, `etiqueta-campo`, `casilla`,
   `tabla`, `titulo-seccion`, `enlace`, `paginacion`, `avatar`~~: rondas 6–8, decididas y migradas el 2026-10-13 (deuda 258 → 4; lo
   abierto, en el README). Falta la pasada del mostrador (`terminal-ventas`).
2. ~~Las seis decisiones abiertas de las rondas 6–8~~: ronda 9, decididas y migradas el 2026-10-13 (deuda 0).
8. ~~`accion.ver`, `accion.filtrar`, `accion.exportar`~~: ronda 10, decididas y migradas el 2026-10-13 (deuda 0). ~~La pasada del
   mostrador~~: hecha (49 vacíos a mano encontrados y migrados).
8b. ~~`accion.cancelar`, `accion.limpiar`, `accion.imprimir`~~: ronda 11, decididas y migradas el 2026-10-14 (deuda 0). Quedan
   `accion.guardar`, `accion.editar` y el «Entendido» en versalitas de Movimientos, el «Ver» de 24 px de los pendientes de Caja y los
   «Etiquetas» de Productos (impresora) frente al de Existencias (etiqueta): la misma función con dos íconos.
9. ~~`casilla`, `enlace`, `paginacion`, `avatar`~~ (rondas 6 y 8) · **`modal`, `grafico`** — pocas formas: rondas cortas. De los gráficos, **la barra apilada ya está decidida (ronda 5b)**; faltan la línea (Caja), las barras mensuales (Rendimiento) y la dona (mapa del Inicio). Los de Análisis tienen su excepción de movimiento (ADR-0357).
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

- **Ronda 5, dos «Limpiar filtros» que no se pudieron poner:** el vacío de Recepciones de compra (el filtro llega como prop) y el de
  Proveedores del Taller con todo archivado (su «Limpiar» no cambia nada). Decidir si se arreglan con su pantalla.

### 3. Deudas chicas que vio la auditoría de modo oscuro (heredadas del claro)

Ninguna la causó la ronda 4, pero fallan contraste (WCAG) en los dos temas:

- el «Pagar» `btn-sutil` de una fila marcada en Por pagar (1,8:1);
- el conteo gris de las píldoras de Clientes (`dark:opacity-85`, 2,5:1);
- 24 textos de filas atenuadas (Por pagar, Compras, Categorías, Configuración).

### 4. Huecos del censo

- **La auditoría de modo oscuro de la ronda 5 solo midió la mitad del ERP** (38 de 77 visitas, 0 hallazgos solo en oscuro): la cuenta
  Admin quedó sin sede en la base local y las demás rutas fueron a «elige una sede». Repetirla con la cuenta en una sede
  (`TEMA_BASE_URL=… node tema/cli.mjs --cuenta admin --todas`) antes de la ronda 6, mirando las capturas.
- **Las firmas no ven todo:** en la ronda 5 se escaparon el vacío de Existencias y los de Apartados (hechos con otras clases). Al
  migrar una familia, recorre las pantallas con una búsqueda imposible («zzzz») para encontrar los que la firma no vio.
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

- **Migrar en lotes paralelos funciona con un archivo de instrucciones y lotes que no se tocan.** Cada agente recibió su lista exacta,
  las reglas («cambia cómo se ve, nunca qué hace») y qué NO tocar (`familias.mjs`, las piezas, las huellas). La sesión principal rehace
  la deuda, acepta las huellas y commitea al final. El recorrido y la guía para cada agente: [MIGRAR.md](MIGRAR.md).
- **Un rellenador de deuda que corta en el primer «]» rompe `familias.mjs`:** una ruta como `[compraId]` lleva «]» adentro. El cierre de
  la lista es «]» al empezar una línea. `pnpm --filter web unificar:rellenar <familias…>` (`apps/web/unificar/rellenar-deuda.mjs`) ya lo
  hace bien y, si el archivo queda roto o con una clave repetida, lo deja como estaba.
- **Una clave repetida en un objeto de JS gana la última:** un `"excepciones": []` olvidado al final de la decisión borraba las
  excepciones de arriba sin error. Revisa que cada decisión tenga una sola `deuda`, `excepciones` y `firmas`.
- **Una firma con `[^>]*` se corta en la flecha de un `onValor={(v) => …}`:** la de `filtro` dejó escapar seis. Usa `(?:[^>]|=>)*?`.
- **`// unificar-fijo:` vale solo en la MISMA línea que la firma** (la del `<input`, la del `role=`): dentro de un tag, como comentario de
  JS después del atributo; dentro de un `<h3>`, como `{/* … */}` antes del texto. Nunca un `{/* */}` entre `&& (` y su elemento.
- **Una pieza aprende lo que pide la migración, no se esquiva:** `Casilla disabled`, `Encabezado visible`, `EnlaceVer alNavegar` nacieron
  porque tres pantallas los necesitaban; dibujar la cara a mano «porque la pieza no acepta X» deja deuda escondida.

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
| `apps/web/unificar/ver-deuda.mjs` | `unificar:ver`: cada línea de deuda con su contexto, por familia o por archivo |
| `apps/web/unificar/rellenar-deuda.mjs` | `unificar:rellenar`: reescribe la `deuda` de `familias.mjs` y la valida |
| `docs/unificar/MIGRAR.md` | cómo se migra una familia en lotes paralelos, con la guía para cada agente |
| `apps/web/components/ui/campos.tsx` | `Boton`, `BotonEnlace`, `BotonAncla` (y sus pesos) |
| `apps/web/components/ui/OndaBotones.tsx` | la onda al clic |
| `apps/web/app/globals.css` | `btn-cayla`, `.mov-boton`, la voz de la cabecera y `cayla-onda` |
| `docs/adr/0358-unificar-una-funcion-una-pieza.md` | el ADR y la línea de cada decisión |
