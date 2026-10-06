# ADR-0357 · Unificar: una función, una pieza

- **Fecha:** 2026-10-06 · **Estado:** skill y motor escritos y probados contra el ERP local. Primera ronda decidida por Felipe el mismo día
  (Volver, Pestañas y Tarjetas de cifra; ver «Decisiones»). Sin migración de base de datos.
- **Pedido:** Felipe, 2026-10-06: una skill o un agente «que vaya módulo por módulo analizando componentes, tablas, etiquetas, iconos, gráficos»,
  para ver si hay «dos botones que tienen la misma función en diferentes pantallas pero con un diseño completamente distinto»; que diga
  **cuántas** variantes hay, las muestre **con capturas**, las **compare** y **elabore un diseño extra**, para elegir con cuál se queda y que
  esa «se use de ahí en adelante para todo el sistema, en todos los módulos, incluso para las vistas nuevas». Nombre: `/unificar`. Pidió además
  la recomendación entre skill y agente.
- **Complementa:** ADR-0169 (paleta y piezas de la guía), ADR-0336 (modo oscuro: solo tokens), ADR-0350 (`/formidable`: se entiende en 5 s),
  ADR-0351 (un solo anillo de foco), ADR-0220 (la cabecera de cada módulo). El eje E de `/revision` busca mecanismos duplicados **en el código**;
  ninguna herramienta medía lo que la persona **ve** repetido con distinta cara. Ese era el hueco.

## Qué había (medido)

Antes de escribir la skill, en el código: `components/ui/` ofrece **cuatro** piezas de pestañas (`Pestanas` en 2 archivos, `TabsSubrayado` en 2,
`SegmentoDeslizante` en 17, `SegmentoEnlaces` en 2) más `pestanas-vidrio` y `fin-pestana` en CSS; **tres** insignias (`Chip` en 121 archivos,
`Insignia` en 1, `badge` en 1); **cuatro** tarjetas de cifra (`TarjetaCifra` en 30, `TarjetaKpiVidrio` en 2, `TarjetaIndicador` y `TarjetaSenal`
en ninguno); 40 archivos con `<table>` propio frente a 27 con `Tabla`; y la pieza `Volver` con dos formas por decisión (ADR-0220).

El primer censo del ERP local (cuenta Admin, 1440 × 900, rama `claude/unificar-componentes-skill-7e9d26` @ `c215dd2f`): **101 de 109 vistas medidas** (77 pantallas y 32
modales y estados de Inventario; las 8 sin cubrir son 4 redirecciones y 4 escenarios que no abrieron) y **30 familias con más de una forma**:

| Familia | Formas distintas | En cuántas pantallas | Nota |
|---|---:|---:|---|
| Botones (estilo) | 123 (46 contando solo esquinas, fondo y borde) | 88 | el sistema define 5; solo 123 de los 591 botones en pantalla usan `btn-cayla` |
| Pestañas y segmentos | 25 | 54 | |
| Tablas | 30 | 36 | |
| Combos | 26 | 39 | |
| Estados vacíos | 23 | 24 | sin pieza del sistema |
| Buscadores | 18 | 49 | |
| Tarjetas de cifra | 17 | 46 | |
| Insignias de estado | 11 | 39 | |
| Títulos de pantalla | 8 | 97 | `EncabezadoPagina` en 56 |
| Botón «Ver» / «Nuevo» / «Volver» | 13 / 12 / 6 | 23 / 27 / 20 | «Volver»: botón secundario con destino (14), versalitas de 11 px, una X, un «Volver» a secas, un botón oscuro |
| La flecha de «siguiente» | 9 dibujos | — | `chevron-right` con trazo 1.5 (119), el glifo «→» (77), `chevron-right` con trazo 2 (16), «›»… |

Una forma distinta no es siempre un problema (la jerarquía de botones tiene 5 a propósito, y el motor cuenta 2 px de diferencia como otra
forma): separar el accidente de la decisión es el paso 2 de la skill.

## Decisión

**Una función, una pieza.** Dos piezas que hacen lo mismo para quien usa el ERP se ven igual en todo el sistema. Cuál es la forma de cada familia
**lo decide Felipe**, mirando las variantes reales lado a lado y una propuesta nueva; desde ese día es la única, también en las pantallas nuevas,
y una prueba del CI lo hace cumplir.

| | |
|---|---|
| **Forma** | **skill** `/unificar` (`.claude/skills/unificar/`) + un **motor** sin IA (`apps/web/unificar/`, Playwright) que mide y captura |
| **Familias** | 22 de estructura (botones por estilo, insignias, contadores, filtros, buscadores, pestañas, paginación, enlaces, cajas de texto, títulos de campo, combos, casillas, tablas, cifras, gráficos, títulos de pantalla y de sección, vacíos, avisos, iconos, hojas, avatares) + 18 de **botones por función** (Volver, Cerrar, Cancelar, Guardar, Limpiar, Nuevo, Editar, Eliminar, Buscar, Filtrar, Exportar, Imprimir, Siguiente, Anterior, Ver, Menú, Copiar, Deshacer). Una sola definición: `apps/web/unificar/familias.mjs` |
| **Cómo se reconoce una función** | por lo que el botón **dice** (texto, `aria-label` o `title`, sin tildes); si no dice nada, por su icono de lucide. «Cerrar caja» no es cerrar una hoja; «Quitar filtros» es limpiar, no eliminar (22 casos en la prueba) |
| **Qué es una variante** | la **huella** de lo que se ve: alto, esquinas, fondo, borde, relleno, letra, icono, con el color traducido al token («tinta», «rojo/35», «≈taupe», o el hex si no es ninguno). El tono de una insignia y el color de un icono no separan variantes (son dato) |
| **Fuera** | el marco (lateral y cabecera), el papel físico (`.papel-fijo`, `[data-papel]`) y el color de una prenda (`[data-color-dato]`, muestras) |
| **Salida** | `reporte.md` (lo lee la skill), `lamina.html` (las variantes A, B, C… con su captura a ×2, usos, pantallas, archivo probable y lo que cambia frente a la A en rojo, con la propuesta dibujada con el CSS real **en claro y oscuro**), `comparativas/<familia>.png` (una imagen por familia, para el chat). Fuera de git; se regenera |
| **Juicio** | el motor encuentra y cuenta; la skill **juzga** qué es la misma función, qué es un accidente (1–2 px) y qué es una decisión (`referencia/criterio.md`) |
| **Elección** | `AskUserQuestion` por familia, con la recomendación primero; nunca la toma la skill |
| **Cumplimiento** | `DECISIONES` en `familias.mjs`: pieza, ADR, registro, **firmas** (expresiones que reconocen la variante a mano) y **deuda**. `lib/unificar.test.ts` falla si un archivo nuevo tiene la firma o si la deuda no baja; `// unificar-fijo: <por qué>` exime una línea. Regla en `CLAUDE.md` con su tabla «Piezas únicas» |
| **Migrar** | `/unificar migrar <familia> [módulo]`, con el OK de Felipe (toca varios módulos), un commit por módulo, **solo presentación** (mismos handlers, textos y permisos), antes/después al mismo ancho y el censo de después con **una** forma |
| **Costo** | el motor es gratis y repetible (todo el ERP más los 32 modales de Inventario: 109 vistas en 10 min); la skill usa hasta 2 agentes (un cartógrafo de archivos, un escéptico) y avisa antes; sin `Workflow` salvo que Felipe lo pida |
| **Respeta** | lo que existe por un ADR (Finanzas ADR-0195, vista rápida ADR-0136, Movimientos ADR-0353, Observatorio ADR-0322, persiana de Caja ADR-0301, cabecera ADR-0220) se presenta como «decidido a propósito»: Felipe dice si se unifica |

**DECIDÍ:** skill + motor. La skill porque el trabajo es una **conversación**: mostrar capturas, recomendar, preguntar y esperar la elección de
Felipe, y después migrar con su OK. Un agente (subagente) corre aislado, no puede preguntarle nada y su informe no le llega a Felipe tal cual; la
skill sí puede lanzar agentes cuando conviene (el cartógrafo, el escéptico). El motor porque contar 40 familias en 77 pantallas y unos 190 escenarios de modales
a mano, con capturas de 800 px del panel, sería lento, caro en tokens e imposible de repetir igual; con Playwright es gratis, nítido (×2) y la
misma medida cada vez.

**DESCARTÉ:**
- *Un agente autónomo que detecta y migra solo:* la elección es de Felipe y migrar toca varios módulos (CLAUDE.md: se confirma).
- *Un catálogo de componentes (Storybook):* muestra lo que el código **ofrece**, no lo que la persona **ve** en cada pantalla; una variante
  dibujada a mano con utilidades sueltas no aparece en un catálogo. Más infraestructura para no responder la pregunta.
- *Una regla de lint por imports:* ve `<TabsSubrayado>` pero no ve un `<div className="rounded-full px-2 …">` que imita una insignia. La huella
  visual sí; y la prueba del CI usa firmas por línea, que sí ven lo dibujado a mano, solo para lo ya decidido.
- *Decidir todas las familias de golpe:* 40 familias a la vez no se deciden bien. De a 3 por ronda, primero lo que confunde en el mostrador.

**SE ROMPE SI:** (1) la huella junta dos funciones distintas porque se ven igual o separa una por 1 px — por eso el juicio es de la skill y el
informe marca `[probable]` y «≈»; (2) una firma es tan amplia que atrapa medio repo — `referencia/decision.md` exige probarla con
`unificar:deuda`; (3) el censo corre contra el servidor de otra worktree y mide otro código — el motor se niega salvo `--otra-obra`; (4) un
escenario o una pantalla cambia la sede (visitar `/global`) y el resto del censo cae en «elige una sede» — el motor restituye la sede de la cuenta
antes de cada visita (pasó en la primera corrida: 39 de 77 pantallas sin cubrir).

## Decisiones (una línea por familia; el detalle en `docs/unificar/<familia>.md`)

- **2026-10-06 · ronda 1, por descripción.** Felipe eligió las tres recomendaciones con `AskUserQuestion` (Volver «un solo botón con flecha»,
  Pestañas «tres piezas, lo elegido en tinta», Cifras «una marca por función») y se migraron unos 100 archivos. **Al verlas aplicadas, no le
  gustaron.** Lección que pasó a la skill (paso 5) y a `CLAUDE.md`: se elige **mirando**, en una página con la captura de cada opción
  (`unificar/elegir.mjs`); una pregunta por texto solo confirma.
- **2026-10-07 · `accion.volver` → la flecha redonda** (`<Volver>`): la de `EncabezadoPagina` que nació en `main` el día anterior (ADR-0220
  act.), única cara en todo el ERP. Deuda 0.
- **2026-10-07 · `pestanas` → F, A y L:** cambiar de sección = el vidrio de Comprobantes con la píldora oscura, en mayúsculas (`<Pestanas>`),
  **también Finanzas y Configuración**; filtrar o elegir período = la píldora rellena; ver de otra forma u ordenar = la caja arena de «GRILLA /
  TABLA». Deuda 0.
- **2026-10-07 · `cifra` → B**, la tarjeta de Compras tal cual (`<TarjetaCifra>`), sin las marcas nuevas de la ronda 1. Deuda 0.

**Número:** este ADR nació como 0354; al traer `main` el 2026-10-07, el 0354 (historial de la prenda), el 0355 (billetera de Traslados) y el 0356
(caos) ya estaban tomados, y pasó a 0357.

## Cómo se verifica

`pnpm --filter web unificar:censo -- --base-url <url> --todas` contra el `next dev` de la worktree; `pnpm --filter web test -- unificar`;
`pnpm --filter web unificar:deuda`. Una decisión simulada («las pestañas son `SegmentoDeslizante`», firma `<TabsSubrayado|<Pestanas`) encontró los 5
archivos que hoy usan las piezas perdedoras y rechazó una pieza inexistente y una firma mal escrita.
