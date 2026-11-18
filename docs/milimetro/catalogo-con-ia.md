# Ficha al milímetro · «Catálogo con IA» en Fotos por color (2026-11-13)

Maqueta aprobada por Felipe: `docs/maquetas/fotos-con-ia-2026-11/` (forma A, con molde, sin paso de revisión). Investigación: `docs/investigacion/2026-11-13-fotos-de-prenda-con-ia-opciones.md`.
Regla de textos: CLAUDE.md «Poco texto a la vista».

## Árbol (reglas 1–3): todo con piezas decididas, nada nuevo

| Parte | Pieza del repo | Rama |
|---|---|---|
| Opción en la línea del título | `<TituloSeccion dato accion>` con `accion={<Interruptor etiqueta>}` (`components/ui/campos.tsx:295`) | decidida (`titulo-seccion`, `casilla`, 2026-10-13) |
| Qué hace la opción | el «?» de `<TituloSeccion ayuda>` | decidida (`texto`, 2026-10-30) |
| Hoja de ángulos | `<Modal tamano="ancha">` + `<PieAcciones>` + `<Boton peso="primario" cargando>` | decidida (`modal`, `accion.cancelar`, `accion.guardar`) |
| Casillas de ángulo | el `BotonFoto` vacío punteado de la tarjeta de color (`FotosPorColor`), a 4:5 | forma A existente |
| El molde | una fila en la **placa** (lo que explica es plano) con su miniatura 4:5 | vidrio: placa (ADR-0596) |
| «Preparando…» en la tarjeta | la foto atenuada + `<HiloEnEspera>` (`data-senal`, sigue con las animaciones apagadas) | decidida (`accion.guardar`, señal de espera ADR-0625) |
| «Con IA» | `<Chip tono="pizarra">` sobre la foto | decidida (`estado`) |
| «Usar mi foto» / «Usar la de IA» | `btn-cayla btn-enlace` (corrige una sola cosa, ronda 9) | decidida (`enlace`) |

## Texto (la regla de poco texto)

- Interruptor: «Catálogo con IA». El «?»: «Maniquí invisible, sin fondo. Unos 25 s y 0,05 USD por foto.»
- Hoja: título «Foto de catálogo · {color}»; bajada «Más ángulos, más parecida a la real.»; casillas «De frente» · «Espalda · opcional» · «Detalle de la tela · opcional», con
  una línea cada una: «Entera, como siempre.» · «Escote y caída.» · «De cerca, con buena luz.»; molde: «Misma forma que {color}»; pie: «~25 s · 0,05 USD», «Cancelar», «Preparar foto».
- Tarjeta: «Preparando…»; chip «Con IA»; enlace «Usar mi foto» / «Usar la de IA».
- Error (cae a la foto real): aviso «La IA no respondió: quedó tu foto.» + el motivo para la tienda (`mensajeParaTienda`).

## Estados

| Estado | Interruptor | «Preparar foto» | Tarjeta del color |
|---|---|---|---|
| default | perilla en hueso, borde `borde-control` (3:1) | primario negro | foto o vacío punteado |
| hover | lo trae la pieza (`@media (hover: hover)`) | `mov-boton` | borde tinta/40 (como hoy) |
| focus-visible | `--foco-*` de la pieza | `--foco-*` | `--foco-*` en el botón de la tarjeta |
| active | la perilla se estira (pieza) | `scale .97` | — |
| selected | `aria-checked` + perilla en tinta | no aplica: acción | no aplica |
| disabled | sin llave en el servidor: la opción **no se dibuja** (no hay nada que arreglar llenando algo) | no se apaga: el frente ya viene elegido | mientras prepara, la tarjeta no abre su hoja |
| loading | — | no aplica: la hoja se cierra al instante | foto atenuada + `HiloEnEspera` + «Preparando…» (`aria-busy`) |
| error | — | — | cae a la foto real y avisa (`avisar.aviso`), nunca deja el color vacío |
| read-only | no aplica | no aplica | no aplica |
| vacío | apagado de fábrica | — | «Agregar foto de {color}» (como hoy) |
| quieto | la perilla cambia sin desplazarse (pieza) | sin `mov-boton` | el hilo sigue (es señal de espera) |

Accesibilidad: 4.1.2 (`role="switch"` + `aria-checked`, lo trae la pieza) · 1.4.1 («Con IA» es texto, no solo color) · 1.4.11 (borde del interruptor 3:1, `lib/tema-tokens.test.ts`) ·
4.1.3 (el aviso de error es `role=status`/`alert` por `avisar`).

## Movimiento

Nada nuevo: la hoja trae el de `<Modal>` (ADR-0136), el hilo es la señal de espera. Sin rebote ni bucle decorativo.
