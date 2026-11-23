# Diseño, color y flujo: qué mejoraría aunque rompa una regla (2026-11-19)

**Pregunta de Felipe.** «¿Eso fue lo único que podía mejorar el flujo, aun rompiendo las reglas? También quiero incluir las
reglas de diseño y de colores: no importa cambiarlas, siempre que mejoremos todo, en especial la estética.»

**Respuesta corta: no.** La primera vuelta (`2026-11-19-ecc-reglas-que-chocan.md`) miró solo lo que ecc proponía y una regla
prohibía, y dejó fuera el diseño. Esta segunda vuelta mira el diseño y el flujo enteros, con ecc como excusa y no como límite.

**Cómo se hizo.** Dos revisores en paralelo (uno de diseño, uno de flujo), un escéptico contra las propuestas de diseño y las
cifras comprobadas con comandos sobre `main` del 2026-11-19. Se miraron capturas reales (`docs/capturas/2026-11-18-*`,
`2026-11-19-*`) y maquetas recientes. Lo que el escéptico tumbó con evidencia está dicho donde corresponde: varias ideas buenas
«de manual» no aplican aquí porque Felipe ya las vio, mirando, y eligió otra cosa.

---

## Parte 1 · La estética

### El diagnóstico: el problema no es una pieza, es que faltan escalas debajo

La estética de CAYLA tiene identidad y oficio: el crema cálido, la Garamond en los títulos, los chips finos, el contraste medido
sobre el vidrio de verdad (`vidrio-contraste.test.ts`), el `borde-control` a 3:1 (muchos sistemas grandes fallan WCAG 1.4.11) y
el idioma del material («lo hundido espera tu dato, lo que sobresale es lo que haces, lo que explica es plano»). Nada de eso hay
que tocarlo.

Lo que la frena es la **dispersión**. Cada pieza se eligió mirando, pieza por pieza, en rondas de `/unificar`; pero no hay una
escala cerrada debajo que todas citen. Cada una se ve bien sola, y juntas se desvían un poco. Medido el 2026-11-19 en
`apps/web` (`components/` y `app/`):

| Qué | Cuánto |
|---|---|
| Opacidades distintas de tinta para texto (`text-tinta/25` a `/85`) | 13 escalones, 2.324 usos |
| Texto secundario en café (`text-taupe`), que compite con la tinta al 60–80 % | 1.683 usos |
| Tintes por opacidad en clases (texto, fondo y borde de 6 tokens) | 3.168 |
| `color-mix` en los CSS | 2.028 |
| Tamaños de letra sueltos (`text-[Npx]`) | 37 tamaños, 1.309 usos |
| Letra de 9 a 10,5 px | 197 usos |
| `backdrop-filter` | 231, en 45 archivos; 16 radios de desenfoque y 12 saturaciones distintas |
| Variables en `vidrio/recetas.css` | 217, algunas de una sola pantalla |
| El mismo azul `#2f6aa3` | sede Trujillo, persona 1, transferencia y TikTok a la vez |

El propio brandbook lo pide al revés: «Tres colores. No más, nunca más. La profundidad viene de la tipografía y el espacio»
(`globals.css:146`).

**Lo que hacen los mejores** (Radix Colors, Vercel Geist, Material 3, Apple): primero se fijan las **escalas con nombre** (texto
primario, secundario, terciario; línea fuerte, sutil; relleno), cada una con su valor por tema. Las piezas solo las citan. Lo que
se elige mirando es la escala, y después cada pieza hereda. Linear rehízo así sus temas en 2024: tres variables en LCH generan todo.

### Las propuestas, ordenadas por impacto estético

**1. Escalones con nombre para texto, línea y relleno. CAMBIAR la regla, migrando al tocar.**

- **Hoy:** el texto tenue es `text-tinta/NN` con 13 opacidades. Como varias no pasaban el contraste, `tema.css` les pone «pisos»
  que suben de golpe de `/35` a `/60` al 64 % (`tema.css:248-252`). En la práctica se ven tres niveles con trece nombres, más el
  taupe compitiendo por ser «el secundario».
- **La regla nueva:** cuatro escalones de texto (primario, secundario, terciario, fantasma), tres de línea y dos de relleno, como
  tokens (`--texto-2`, `--linea-sutil`…) definidos en OKLCH para cada tema. Por dentro pueden seguir siendo un `color-mix`
  (corrección del escéptico: así no se rompe `tema-tokens.test.ts` ni el contrato). Se decide una sola vez si el secundario es
  café o tinta.
- **Cómo se aplica:** como toda decisión de `/unificar`: una pantalla se migra cuando se toca; la deuda solo baja y la vigila una
  prueba. Nada de un reemplazo masivo de 3.000 clases.
- **Gana:** una jerarquía que se lee de un vistazo en toda pantalla, y el contraste resuelto por construcción en vez de con pisos.
- **Paga:** una decisión de Felipe y la migración gradual.
- **Cómo mirarlo:** Movimientos en tres versiones (hoy, secundario en taupe, secundario en tinta), en claro y en oscuro, con la
  escalera de contrastes al lado.
- **Actualización 2026-11-23: la lámina está armada** (`docs/milimetro/laminas/2026-11-23-escalas/`), con Compras, Movimientos e
  Historial de ventas reales. Medido: ninguna opción baja de 4,5:1. En oscuro, los textos débiles para APCA son 94 hoy, 46 con la tinta
  en tres tonos y 95 con tinta y café. En claro, la tinta en tres tonos casi no se distingue de hoy: su ganancia es el orden y el oscuro.
  La que más cambia a la vista es la de tinta y café.

**2. Una rampa tipográfica cerrada, con el piso de 11 px y el tamaño óptico. MATIZAR.**

- **Se quedan:** el título de 46 px (ADR-0220, viaja a Dynamic) y las versalitas de 11 px de los botones de la cabecera. Las dos las
  eligió Felipe mirando (ronda 2 de `/unificar`), y el escéptico tiene razón en no reabrirlas sin una razón nueva.
- **Cambia:**
  - Los 37 tamaños sueltos pasan a una rampa con nombre.
  - **Nada nuevo bajo 11 px:** una prueba que falle ante un tamaño nuevo, y una deuda que solo baja (197 usos hoy).
  - ~~**El eje de tamaño óptico de DM Sans** (`opsz`, de 9 a 40), que `layout.tsx:23` no pide.~~ **Retirada el 2026-11-23, después de
    medirla:** la misma frase mide 160,6 contra 160,8 px a 11 px y 204,0 contra 204,7 a 14 px; solo a 46 px cambia (606,7 contra 672,6),
    y la letra grande del ERP es Garamond. En la letra de lectura no se nota.
  - **Cifras tabulares** en toda columna de montos, como ya propone `/tipografia`. Medido el 2026-11-23: DM Sans no trae cifras
    tabulares (ni la de next/font ni la completa de Google); Inter y la Garamond de los montos sí. Va en la misma lámina.
- **Cómo mirarlo:** la lámina del 2026-11-23 (`docs/milimetro/laminas/2026-11-23-escalas/`), con Proveedores y Existencias.
  Recordatorio: una escala de tamaños con nombre ya se mostró en la ronda 19 de `/unificar` y Felipe eligió condensar con piso de 14 px.

**3. El vidrio: concentrarlo donde se luce. Para MIRAR, no para decidir por escrito.**

- **Lo que dice Apple:** Liquid Glass es para la capa que flota sobre el contenido (barras, menús, hojas). En el contenido van
  materiales normales, y nunca vidrio sobre vidrio.
- **Lo que pasa aquí:** el contenido ya perdió el desenfoque por rendimiento (ADR-0623). Las tablas y cifras son «vidrio claro»:
  un blanco translúcido sobre la Aurora. El propio código lo dice: sobre un fondo parejo, una placa de vidrio es una placa crema
  (`marco.css:6`). Y Felipe dijo que el vidrio se veía «algo pobre» (ADR-0611).
- **La paradoja:** el vidrio se ve rico cuando hay **menos** y cuando tiene algo variado detrás. En una tienda de ropa, lo más
  variado son las fotos de las prendas. Una cabecera de vidrio sobre una grilla de prendas luce; diez placas translúcidas sobre
  crema se ven como crema.
- **Por qué no es un veredicto:** el escéptico lo frenó con razón. La regla S5 del contrato con Dynamic dice que una tarjeta o una
  tabla es una placa de vidrio, y Felipe eligió vidrio en todo, pieza por pieza. Cambiarlo es reabrir una decisión de los dos
  sistemas.
- **Lo que sí conviene:** ponerlo delante de Felipe. Existencias (con fotos), Compras y la hoja de Cobro en dos versiones:
  «vidrio en todo» (hoy) y «vidrio solo en lo que flota, contenido en papel sólido con el mismo idioma de hundido, sobresaliente y
  plano». En claro y en oscuro, a 1440 px y haciendo scroll.
- **Gana, si elige la segunda:** calma, lectura y que el vidrio que queda vuelva a decir «esto flota».
- **Paga:** el contrato S5 y unas 40 hojas de `vidrio/`.

**4. Cerrar las recetas de vidrio. CAMBIAR, sin cambiar el aspecto.**

Pase lo que pase con la propuesta 3, 16 radios de desenfoque y 12 saturaciones no los distingue nadie. Tres niveles de material
(fino, normal, grueso, como los materiales de Apple) y las recetas de una sola pantalla convertidas en una de esas tres. El
aspecto casi no cambia, y `recetas.css` pasa de 217 variables a unas pocas decenas. Ojo: `recetas.css` viaja solo a Dynamic, así
que se hace con el aviso que pide `docs/familia/`.

**5. Una paleta de datos sin colisiones. CAMBIAR, solo donde chocan.**

Cinco paletas de datos (sedes, personas, medios de pago, caminos de venta, reparto) reutilizan los mismos hex con significados
distintos. Corrección del escéptico: no hace falta una paleta única; basta con separar las colisiones que **comparten pantalla**
(Caja junto a los medios de pago, el telar de Finanzas con las sedes). Se revisa con simulación de daltonismo, como pide `/color`.

**6. Tres detalles de oficio que no rompen ninguna regla** (vienen de `make-interfaces-feel-better` de ecc):

- **El contorno de la foto:** una línea interior de 1 px, al 8–10 % de `--color-sombra`, para que una prenda blanca no se funda
  con el papel. Lo vigila `/milimetro`.
- `text-wrap: balance` en los títulos y `pretty` en los párrafos. Hoy `balance` está en 22 lugares.
- Cifras tabulares (repetido de la propuesta 2, porque es lo que más se nota en una tabla).

### Lo que se queda como está (y por qué)

- **La Aurora.** Felipe la eligió con la alternativa plana delante (`docs/vidrio/README.md`, maqueta `marco-vidrio-2026-10`, tres
  fondos). Sin ella, el vidrio de hoy se vuelve crema. Si algún día se elige la propuesta 3, se puede reconsiderar.
- **El oscuro por intercambio de tinta y crema.** No es una inversión ingenua: superficies, rojos, datos y sombras están afinados a
  mano en `tema.css`. Las etiquetas de Apple funcionan igual, con los mismos alfas sobre una base invertida. La propuesta 1 le
  quita los pisos de contraste, que son lo único torpe.
- **El rojo como acento sagrado, con 2 por pantalla**, el claro por defecto y la Garamond como identidad.
- **El movimiento apagado por defecto (ADR-0625).** Es decisión de Felipe, y deja vivas las señales de espera. Queda una pregunta
  que es suya: desde el 2026-11-07 se siguen construyendo animaciones ricas (ADR-0136 act. 2026-11-13 y 2026-11-17) que, por
  defecto, no se ven. Dos salidas, si quiere que se vean: ofrecer el botón «Animaciones» la primera vez que se abre el ERP en
  cada aparato, o encenderlas por defecto solo en equipos que las aguantan. Hoy no se mide cuántos aparatos lo encendieron.

---

## Parte 2 · El flujo

Cifras del revisor de flujo, comprobadas el 2026-11-19.

**Corrección a la primera vuelta:** el CI ya no traba. Desde la cola de fusión (2026-11-07), un PR tarda de mediana 20 minutos
entre abrirse y fusionarse, y hoy no hay ninguno abierto. Las pruebas de punta a punta de la propuesta E cuestan menos de lo que
se dijo.

| # | Qué | Evidencia | Qué regla cambia | Veredicto |
|---|---|---|---|---|
| F1 | **Un tablero de sesiones que se arma solo** (`pnpm sesiones`): lee los worktrees, sus archivos cambiados, las ramas `claude/*` empujadas en 48 h, los PR abiertos y las reservas, y cruza choques con el detector de `abrir-pr:choques`. Corre al abrir sesión | `docs/SESIONES-ACTIVAS.md` tiene 143 filas «activas»; la más vieja es del 2026-09-18. Nadie lo usa como fuente de verdad | «Agrégate con una fila»: se va. El estado se deriva, no se escribe | CAMBIAR (construirlo) |
| F2 | **Partir los archivos donde escriben todos**, no los componentes grandes: una guía por pantalla, un archivo por entrada en los tableros de `/formidable` y `/chaos`, y `ARQUITECTURA.md` generado desde el código | En un mes: `ARQUITECTURA.md` 248 commits, `guias/pantallas/inventario.ts` 136, `catalogo.ts` 107. Los componentes de 2.000 líneas casi no chocan | ADR-0259 se extiende a esos tableros | CAMBIAR |
| F3 | **Las skills obligatorias en tres niveles, con un recibo atado al commit**, en vez de una casilla que marca el mismo agente que hizo el trabajo | En 43 PR visuales: `/milimetro`, que el CI exige, 43 de 43; `/chaos` 5, `/sugerir` 5, guía de foco 4, `/formidable` 5, `/textos` 0, `/multi-view-responsive` 1. Puede que se corrieran sin marcarse, pero no hay forma de saberlo | «Obligatoria en toda pantalla» pasa a: todo PR visual, `/milimetro`; lo que guarda, el núcleo de `/chaos` con su recibo; pantalla nueva o rediseñada, `/formidable`, guía, `/focus` y `/sugerir`; lo demás, a pedido | CAMBIAR |
| F4 | **Señalar en la página de elegir** (la idea de `plan-canvas`): un clic sobre un elemento guarda su selector y su texto en la elección, para decir «este borde» y no «el de la izquierda» | `apps/web/unificar/elegir.mjs` solo deja un comentario por grupo | Ninguna | ADAPTAR (unas 100 líneas, sin instalar ecc) |
| F5 | **La memoria guarda decisiones y trampas, nunca estado** | Tres notas daban por abiertos PR ya fusionados (#1617, #1779, #1766; corregidas hoy) | Qué se escribe en la memoria | CAMBIAR |
| F6 | **Un PR por actividad** en las obras grandes (la idea de `blueprint`): un módulo nuevo nace visible solo para el líder, así que una actividad a medias no le llega a nadie | En los últimos 60 PR: mediana de 13 archivos, p90 de 39, máximo 366. En un mes, 1.332 commits que traen `main` a una rama | La nota «el PR al final de una obra grande» | Lo decide Felipe: más revisiones contra PR más chicos |
| F7 | **Modelo según la tarea** en los subagentes de las skills | Los barridos de solo lectura heredan el modelo más caro | Ninguna | ADAPTAR |
| F8 | **Auditar una vez las compuertas** con `loop-design-check` de ecc: ¿cuáles puede engañar el mismo agente que las cumple? | Las casillas del formulario de PR | Ninguna | USAR UNA VEZ |
| F9 | **Limpiar worktrees y ramas** | 39 worktrees locales y 213 ramas remotas | Ninguna | Hacerlo |

**Descartado de ecc para el flujo:** los kanban (`team-agent-orchestration`, `story-lifecycle`: repetirían el tablero que ya
murió), `checkpoint` (usa `git stash`, que comparten todos los worktrees), `dmux` y `devfleet` (fusionan solos, y fusionar es de
Felipe), el tope de 800 líneas por archivo (los grandes no son los que chocan) y el resto de `orch-*`, que ya cubre `/construir`.

---

## Orden recomendado (las dos vueltas juntas)

1. **Partir `CLAUDE.md`** (A de la primera vuelta) junto con **F2** y **F5**: no tocan la pantalla y aligeran todo lo demás.
2. **La lámina de escalas** (propuestas 1 y 2 de diseño): es la base sobre la que se elige el resto. Se arma como en `/unificar`,
   con la pantalla real en claro y en oscuro, y Felipe elige mirando.
3. **La comparación del vidrio** (propuesta 3), en la misma lámina o en la siguiente.
4. **F1** (el tablero que se arma solo) y **F3** (las compuertas con recibo).
5. Lo demás, cuando toque la pantalla.
