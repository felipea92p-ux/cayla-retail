# Unificar — una función, una pieza (tablero)

`/unificar` (ADR-0358, `.claude/skills/unificar/`) cuenta cuántas formas distintas tiene cada familia de piezas del ERP —el botón «Cancelar»,
las pestañas, la insignia de estado, la tabla, la tarjeta de cifra…—, se las muestra a Felipe con capturas lado a lado y una propuesta nueva,
y **lo que Felipe elige pasa a ser la única forma de esa función en todo el ERP**, también en las pantallas que todavía no existen.
`lib/unificar.test.ts` lo hace cumplir: un archivo nuevo que vuelve a dibujar a mano una familia decidida falla, y la deuda solo baja.

**Felipe elige mirando** (la página de `unificar/elegir.mjs`), nunca por una descripción. **Antes de dibujar una pieza en una pantalla o un modal, mira la primera tabla.** Si su familia está decidida, se usa esa pieza. Si no, se usa la
forma más usada del último censo (la «A» de la lámina) y no se inventa otra.

## Piezas únicas (lo decidido)

| Familia | La pieza | Decidido | Deuda (archivos por migrar) | Registro |
|---|---|---|---:|---|
| Botón «Volver» (`accion.volver`) | `<Volver>` (`components/ui/Volver.tsx`): la flecha redonda, sola, con «Volver a …» para el lector. **También el «Atrás» de un paso a paso** (ronda 3) | 2026-10-06 (mirando) · 2026-10-07 | 0 | [accion.volver.md](accion.volver.md) |
| Pestañas y segmentos (`pestanas`) | `<Pestanas>` (vidrio con píldora oscura, en mayúsculas; también Finanzas) si cambia de sección · `pildora-cayla` si filtra o elige período · `SegmentoEnlaces` / `SegmentoDeslizante forma="modo"` (caja arena) si cambia el modo u orden | 2026-10-06 (mirando) | 0 | [pestanas.md](pestanas.md) |
| Tarjetas de cifra (`cifra`) | `<TarjetaCifra>`: la de Compras tal cual (flecha si lleva, arena si filtra, punteada sin dato) | 2026-10-06 (mirando) | 0 | [cifra.md](cifra.md) |
| Botón «Nuevo / Registrar» (`accion.nuevo`) | `<Boton>` / `<BotonEnlace>` (`components/ui/campos.tsx`): VERSALITAS de 11 px y 40 px; `primario` la acción, `fantasma` su pareja. Movimiento ÚNICO de todo botón (`.mov-boton`, ronda 3): sube con sombra, barrido de luz, el «+» gira y la flecha avanza, se encoge al presionar, hilo al guardar | 2026-10-07 (mirando y tocando) | 0 | [accion.nuevo.md](accion.nuevo.md) |
| Botones (`boton`) — dos voces | `btn-cayla` / `<Boton>`: versalitas dentro de una cabecera de pantalla (`data-voz="cabecera"`), letra normal en hojas y tarjetas; todo con el movimiento único y la onda al clic | 2026-10-07 (mirando y tocando) | 0 | [boton.md](boton.md) |
| Lo peligroso (`accion.eliminar`) | `btn-peligro`: rojo desde el principio | 2026-10-07 (mirando) | 0 | [boton.md](boton.md) |
| Cerrar una hoja (`accion.cerrar`) | la × sola arriba a la derecha (`<Modal conCerrar>`) | 2026-10-07 (mirando) | 0 | [boton.md](boton.md) |
| Insignias de estado (`estado`) | `<Chip>`, como ya era. Se quedan a propósito: los chips con ícono de Análisis y el rol «Líder de equipo» en negro | 2026-10-07 (mirando) | sin candado | [estado.md](estado.md) |

## Propuestas esperando decisión

| Familia | Propuesta | Desde | Nota |
|---|---|---|---|
| `vacio` | `<Vacio>` grande (ícono de lo que falta que se dibuja, título serif, frase que dice qué hacer, botón; distingue «no hay» / «la búsqueda no encontró» / «los filtros dejan cero») y chico (una línea con ícono y enlace) · P2: lo mismo en marco punteado | 2026-10-08 | [propuestas/vacio.html](propuestas/vacio.html). 3 preguntas: el grande, el chico y qué ofrece al no encontrar. Decididas a propósito: la guía de Finanzas (ADR-0195) y la ficha de Análisis (ADR-0357) |
| `aviso` | `<Aviso tono>` con la voz de la esquina (disco con ícono que se dibuja y suelta una onda; error con role=alert que destella una vez), normal y chico · P2: franja a la izquierda · `nota-cayla` se queda · error de un dato bajo su campo, error de la hoja en el aviso | 2026-10-08 | [propuestas/aviso.html](propuestas/aviso.html). 3 preguntas. Los avisos de la esquina (ADR-0146) no se tocan |
| `buscador` | `<Buscador>` lista: la caja hundida con lupa viva, «/», «×», «Buscando…» y el hilo que corre, y el conteo · P2: el subrayado vivo · mostrador: la píldora que se despega de Cambios con el ícono rojo de Vender | 2026-10-08 | [propuestas/buscador.html](propuestas/buscador.html). 2 preguntas. Decididos a propósito: Finanzas (ADR-0195) y Análisis (ADR-0357) |

## Por analizar (las próximas rondas)

Faltan **37 familias** de las 40 que reconoce el motor (`apps/web/unificar/familias.mjs`). Las cifras son del censo del 2026-10-06 **sin
depurar**: en la ronda 1 la depuración las bajó mucho (pestañas, de 25 formas a 18 reales; cifras, de 17 a 7), así que sirven para ordenar,
no como veredicto. El orden es la recomendación de Claude: primero lo que la colaboradora lee o toca en más pantallas.

**Antes de la próxima ronda, un censo nuevo.** El de la tabla es de antes de la ronda 1, solo con la cuenta Admin y con foco en Inventario, y
`main` cambió mucho desde entonces (Análisis v4, la billetera de Traslados). Desde `apps/web`, con el servidor de esa worktree:
`pnpm unificar:censo -- --base-url <url> --todas --escenarios`, y una pasada con `--cuenta terminal-ventas` para el mostrador.
Cada ronda se pide con `/unificar familia=<id>` (o `/unificar familia=estado,accion.nuevo` para dos a la vez) y termina con Felipe eligiendo
en la página de elegir, nunca por una descripción.

| # | Familia | Qué es | Formas (sin depurar) · pantallas | Por qué en este orden |
|---:|---|---|---|---|
| ~~1~~ | ~~`estado`~~ | Decidida el 2026-10-07 | | |
| ~~2~~ | ~~`boton`~~ | Decidida el 2026-10-07 (ronda 4): dos voces, peligro en rojo, cerrar con la ×; migrada entera, mostrador incluido | | |
| 3 | `vacio` (ronda 5: propuesta esperando) | Estados vacíos («Todavía no hay…») | 23 · 24 | Ley 9 de Formidable: un vacío dice qué falta. Hoy cada pantalla lo dice a su modo |
| 4 | `aviso` (ronda 5: propuesta esperando) | Avisos y notas (`nota-cayla`, errores, avisos de la esquina) | 13 · 60 | Está en 60 pantallas, y un aviso que se ve distinto se lee distinto |
| 5 | `buscador` (ronda 5: propuesta esperando) | Las cajas de buscar | 18 · 49 | El comportamiento ya es uno (`useBusquedaEnUrl`); la cara no |
| 6 | `combo` | Desplegables | 26 · 39 | La regla de buscar y paginar ya es una (ADR-0209); falta la cara. `SelectFin` es de Finanzas (ADR-0195) |
| 7 | `tabla` | Tablas | 30 · 36 | `<Tabla>` existe; la de Finanzas (`fin-tabla`) queda aparte por ADR-0195 |
| 8 | `campo` + `etiqueta-campo` | Cajas de texto y sus títulos | 12 · 18 / 10 · 34 | Se corre con `--escenarios`: viven en las hojas |
| 9 | `titulo-seccion` | El título de cada bloque dentro de una pantalla | 33 · 54 | Muchas formas; sin pieza del sistema hoy |
| 10 | `accion.ver`, `accion.filtrar`, `accion.exportar`, `accion.eliminar` | Ver el detalle, filtrar, exportar, quitar o anular | 13 / 4 / 4 / 4 | `accion.eliminar` toca dinero y comprobantes cuando anula: migrar no cambia qué hace |
| 11 | `casilla`, `enlace`, `modal`, `grafico`, `paginacion`, `avatar` | Casillas e interruptores, enlaces de texto, hojas, gráficos, paginación, avatares | 6 / 9 / 5 / 5 / 2 / 2 | Pocas formas: rondas cortas. Los gráficos de Análisis tienen su excepción de movimiento (ADR-0357) |
| 12 | `accion.cerrar`, `accion.cancelar`, `accion.guardar`, `accion.limpiar`, `accion.editar`, `accion.buscar`, `accion.imprimir`, `accion.menu`, `accion.copiar` | Los botones de una sola función | 1–2 cada una | Casi todas tienen ya una sola forma: se pueden cerrar juntas en una ronda |
| 13 | `icono` | Iconos (tamaño y trazo) | 122 huellas · 73 | Las 122 son sobre todo tamaños y trazos distintos de lucide; hay que depurar mucho antes de mostrar |
| — | `titulo-pagina` | La cabecera de cada pantalla | 8 · 97 | **No se corre** hasta que Felipe decida la cabecera de los módulos sin decidir (ADR-0220): Compras, Caja, Recibir, el resto de Catálogo |

Las otras cinco no salen en el censo del 2026-10-06: `filtro` (las píldoras de filtro) quedó cubierta por la decisión de pestañas —la píldora
rellena, la «A»—, y el censo nuevo dirá si queda alguna dibujada a mano; `contador` (el globito con número), `accion.siguiente` («Siguiente /
Cargar más»), `accion.anterior` y `accion.deshacer` no aparecieron con la cuenta Admin, y se miran en el censo con más cuentas.

## Censos

| Fecha | Rama | Vistas medidas | Familias con más de una forma | Lo que más confunde |
|---|---|---:|---:|---|
| 2026-10-06 | `claude/unificar-componentes-skill-7e9d26` @ `c215dd2f`, cuenta Admin, foco Inventario | 101 de 109 | 30 | 25 formas de pestañas en 54 pantallas; 6 de «Volver»; solo 123 de 591 botones usan `btn-cayla` (detalle: ADR-0358) |
| 2026-10-07 | `claude/unificar-pendiente-7f0794` @ `83aea687`, cuenta `terminal-ventas` (el mostrador), con escenarios | 60 de 122 (las demás: sin acceso) | 26 | tres movimientos de botón principal; dos caras del «Atrás» de un paso; las tallas de Vender salían como «Nuevo» (motor corregido) |
| 2026-10-07 | `claude/unificar-pendiente-7f0794` @ `0807770f`, cuenta Admin, todo el ERP con escenarios | 240 de 247 | 33 | 180 estilos de botón en 219 pantallas; el botón «Nuevo / Registrar» con 2 caras reales (`btn-cayla` y versalitas). Falta la pasada de `terminal-ventas` |
| 2026-10-07 (noche) | `claude/unificar-next-round-bdaaa0` @ `f05530ca`, cuenta Admin, todo el ERP con escenarios, familias `vacio,aviso,buscador` | 242 de 250 | 3 | sin depurar: 23 buscadores, 29 vacíos, 23 avisos. Depurado con el código: 9 formas de vacío (~100 lugares), 6 recuadros de aviso + ~68 párrafos rojos sueltos, 8 buscadores. El motor confunde filas de lista con vacíos (el seed casi no deja listas vacías): las fotos de hoy se sacaron forzando «zzzz» en cada pantalla |
| 2026-10-07 (noche) | `claude/unificar-next-round-bdaaa0` @ `1b5ac53a`, cuenta `terminal-ventas` (el mostrador), con escenarios, familias `vacio,aviso,buscador` | 60 de 122 (las demás: sin acceso) | 3 | 6 buscadores en 24 pantallas (Facturación, Historial, Cambios/Devoluciones, Clientes, Proforma), 8 avisos (el de Facturación «más de 1 hora sin llegar a SUNAT», Caja, Sin conexión) y 5 vacíos |
| 2026-10-07 (noche) | `claude/unificar-next-round-bdaaa0` @ `63b64ba7`, cuenta Admin, todo el ERP con escenarios, familias `combo,tabla,titulo-seccion` (adelanto de la ronda 6, sin depurar) | 243 de 250 | 3 | 42 formas de combo en 118 pantallas, 39 de tabla en 70, 46 de título de sección en 151. Falta depurar y la pasada del mostrador; queda en `apps/web/unificar/.salida/r6-admin/` (fuera de git) |

## Cómo se agrega una fila

- **Piezas únicas:** al registrar una decisión (`.claude/skills/unificar/referencia/decision.md`): la familia, la pieza, la fecha, cuántos
  archivos quedan en la deuda (`pnpm --filter web unificar:deuda <familia>`) y el enlace a `docs/unificar/<familia>.md`. Cuando un módulo se
  migra, baja el número. La misma fila va a la tabla «Piezas únicas» de `CLAUDE.md`.
- **Propuestas:** al dibujar una (`propuestas/<familia>.html`); sale de esta tabla cuando Felipe decide (gane o no).
- **Censos:** una fila por censo de `todo` o de un módulo: lo medido, no lo opinado.

## Qué hay en esta carpeta

| | |
|---|---|
| `README.md` | este tablero |
| `CONTINUAR.md` | cómo seguir desde otra sesión: lo que falta, cómo se trabaja y lo aprendido (se actualiza al cerrar cada ronda) |
| `<familia>.md` | el registro de una decisión: qué se comparó, qué se eligió y por qué, la deuda por módulo |
| `capturas/<familia>.png` | la comparativa con la que Felipe decidió (la evidencia, chica) |
| `propuestas/<familia>.html` | el diseño extra de `/unificar`: un fragmento que la lámina dibuja con el CSS real, en claro y oscuro |

El censo, las capturas sueltas y la lámina se regeneran y viven fuera de git, en `apps/web/unificar/.salida/`.
