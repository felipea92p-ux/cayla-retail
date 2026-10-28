---
name: focus
description: Recorre las pantallas Y los modales que estás construyendo o editando y verifica si tienen la guía de foco estandarizada (qué está hecho, qué sigue, qué falta; dentro de un modal se ENCIENDE el control que sigue: caja de texto, combo, chips, interruptor…; CLAUDE.md «Guía de foco», ADR-0284). Si a alguno le falta, primero se lo avisa a Felipe con la lista y después lo implementa con el estándar, cuidando que la guía ACOMPAÑE y no apure a quien escribe (la luz espera mientras se teclea o se eligen varias opciones; un combo con valor de fábrica también pasa por ella) y verificándolo en el navegador con el recorrido «una letra → Tab → combo». Con `todo` solo informa el tablero de todo el ERP; con una ruta (`/vender`) o un módulo (`compras`) trabaja solo eso. Úsala antes de dar por terminada cualquier pantalla o modal con campos o pasos, y cuando Felipe diga «focus» o que la guía «salta», «apura» o «me manda al siguiente».
---

Verifica y completa la guía de foco de las pantallas y los modales en construcción: $ARGUMENTS

**Regla madre:** una pantalla o un modal con campos o pasos que no guía a la persona no está terminado (CLAUDE.md «Guía de foco»). Esta skill **recorre → avisa → implementa → verifica**, en ese orden. No decide reglas de negocio: la guía solo hace visible lo que la validación real ya exige.

**Segunda regla madre: la guía acompaña, no apura.** Una guía que se adelanta a quien todavía escribe es peor que no tener guía: con UNA letra en «Nombre» la luz saltaba al campo siguiente, y un combo con valor de fábrica («Familia» en «Neutro») se saltaba sin que nadie lo mirara (Felipe, 2026-09-30, ADR-0284 act. h). Por eso cada pantalla se construye Y se prueba contra la sección «La guía acompaña, no apura».

**Dos objetivos, cada uno con su registro:** las *pantallas* (`page.tsx`, `PANTALLAS`) y los *modales* (todo archivo que dibuja un `<Modal>`, `<ModalRuta>` o `Dialog.Content` con campos, `MODALES`), ambos en `lib/guia-de-foco-pantallas.ts`. Una pantalla no queda «con guía» porque uno de sus modales la tenga, ni al revés.

**Alcance según `$ARGUMENTS`:**
- *(vacío)* las pantallas y los modales tocados por tus cambios: la rama contra `origin/main` más lo que está sin commitear.
- `todo` solo **informa** el tablero completo (decenas de pantallas y modales; las cifras exactas las da el escáner). No implementa: el módulo por el que se empieza lo elige Felipe (`/focus compras`, `/focus /vender`).
- una ruta (`/compras/nueva`) o un módulo (`compras`): esa pantalla, o las de ese módulo en el registro.
- Si Felipe reporta un síntoma («la luz salta», «me manda al siguiente»), el alcance es esa pantalla y el paso que manda es el 4 (reprodúcelo primero, después corrige).

## Paso 1 — Recorre (el escáner, y después tus ojos)

1. `git fetch origin main` (la base tiene que estar fresca; si la rama sale de otra, `--base <rama>`).
2. `node scripts/focus/escanear.mjs` (o `--todo`, o `--ruta <ruta>`). Trae, por pantalla: si tiene campos o pasos, si usa las piezas de la guía y su estado en `lib/guia-de-foco-pantallas.ts`.
3. **El escáner es por texto: no juzga, ayuda a no olvidarse.** Trae dos tablas: pantallas y modales (con cuántos controles trae cada modal y desde qué pantallas se abre). Confirma cada veredicto leyendo:
   - `sin-guia`: ¿tiene de verdad campos o pasos? Un buscador de una sola caja o un filtro no la necesita → pásala a `no-aplica` en el registro, **con su motivo escrito** (sin motivo la prueba falla).
   - `no-aplica`: si abre un modal o un flujo desde otro archivo que el escáner no alcanzó, léelo.
   - Un **modal de UN solo control** (un motivo, una confirmación) no tiene camino que indicar: propónlo `no-aplica` con su motivo y déjalo en la lista del cierre para que Felipe lo vete. Con dos controles o más, lleva guía.
   - «Archivos con campos que no llegan a ninguna pantalla»: un componente en construcción que ni es modal. La regla vale igual.
   - «Registro por ajustar»: pantallas con guía que siguen «pendiente», o «aplicada» sin guía.
4. **Mirada de tolerancia** (el escáner no la hace; léela tú en cada pantalla y modal del alcance, con guía nueva o ya puesta): anota, por control, en cuál de las filas de la tabla de «La guía acompaña, no apura» cae. Busca en especial (a) **controles de varias opciones** (chips que se marcan de a uno: tallas, colores, etiquetas) sin `retiene="fila"`, y (b) **combos o chips con valor de fábrica** (`useState("neutro")`, una opción marcada de antemano) que la guía no mira.
5. Mira `docs/SESIONES-ACTIVAS.md`: si otra sesión toca los mismos archivos, **avísalo y no la pises**.

## Paso 2 — Avisa (ANTES de tocar código)

Un mensaje corto, en la conversación, con esta forma, y después sigues sin esperar respuesta (salvo en las «Paradas»):

```
Focus: falta la guía en N pantalla(s)
- /ruta — campos en Archivo.tsx, Otro.tsx · tipo: <formulario por pasos | ficha que se edita | operación en vivo>
  «falta» saldría de: <la validación que hoy apaga el botón principal>
  ojo: varias opciones en <Tallas…> · valor de fábrica en <Familia = Neutro…>   (si los hay; ver «La guía acompaña, no apura»)
- modal components/XModal.tsx (N controles, se abre desde /ruta) — «falta» saldría de: <su validación>
Ya la tienen: … · No aplican (con motivo): …
Voy a implementarlas con el estándar.
```

## Paso 3 — Implementa (una pantalla a la vez)

Lee antes: CLAUDE.md «Guía de foco», `docs/adr/0284-nuevo-producto-que-guia-a-quien-lo-llena.md` (con sus actualizaciones) y el modelo del tipo de pantalla.

| Tipo de pantalla | Modelo (ya hecho) | Qué lleva |
|---|---|---|
| Formulario por pasos o largo (alta, compra nueva, recibir) | `NuevoProductoForm.tsx` + `lib/alta-producto-guia.ts` | `FilaAlta campo= estado=` (con `retiene="fila"` en los campos de varias opciones), `PasoAlta pie={{ faltan }}`, `FaltanDelPaso`, «Siguiente» tocable (`siguienteDelHilo`), ✓ solo si se visitó (`pasoConfirmado`); el formulario guarda `escribiendoEn` y provee `RetencionLuzContexto` |
| Ficha o edición de algo que ya existe | `ProductoForm.tsx` + `TiraFicha` + `lib/producto-ficha-guia.ts` | «Para completar esta ficha»; marca **solo** en lo que llegó pendiente; nunca bloquea guardar |
| **Modal u hoja con campos** | `components/NuevaClientaModal.tsx` (el piloto); con un combo de valor de fábrica, `components/ColoresLista.tsx` («Nuevo color») | `useGuiaCampos` + `<CampoGuiado>` alrededor de cada bloque + `<PieGuia>` sobre el botón principal: **se enciende el control que sigue** (ver «Modales» abajo) |
| Operación en vivo (punto de venta, caja, conteo) | el análogo: «qué falta para poder cobrar / cerrar / confirmar» | sale de las condiciones que hoy apagan el botón principal; se muestra junto a él y cada cosa lleva a su control |

Para cada pantalla:
1. **Lógica pura** en `lib/<pantalla>-guia.ts` con su prueba. `falta` = **solo** lo que la validación real ya exige (la misma regla que apaga el botón); lo recomendado que no bloquea es «sugerido», nunca candado. Incluye la prueba de coherencia: «requerido y sin hacer» ⇔ «hay un problema» (modelo: `lib/alta-producto-guia.test.ts`). Si la lógica decide «quién sigue», que reciba `enFoco` y reuse `siguienteDe` de `lib/guia-campos.ts` (una sola definición de «el que sigue»); prueba «una letra no mueve la luz».
2. **Piezas** que ya existen: `MarcaCampo`, `EtiquetaAhora`, `ConMarca`, `FaltanDelPaso`, `TiraFicha`, `useGuiaAlta` / `irAlIdCampo`, `CampoGuiado`, `useRetenerLuz`; campos con `data-campo`, **nunca** por clases de estilo. Si falta una pieza genérica, extráela, no la copies. Clases `hilo-*` de `app/estilos/alta-guia.css`; solo tokens y **sin rojo**.
3. **Tacto:** nunca se desplaza la página mientras hay foco en un campo de texto; solo se mueve lo que no se ve; sin animación con `prefers-reduced-motion`. Movimiento de respuesta a una acción (ADR-0136): **no agregues ningún bucle** —la única marca que gira es el círculo punteado de un campo opcional, ya hecho en `alta-guia.css` (ADR-0136 act. c)—.
4. **Registro:** en `lib/guia-de-foco-pantallas.ts` pásala a `aplicada` (`evidencia` = los archivos que **usan** las piezas) o `no-aplica` (con motivo) y baja el contador que corresponda: `PENDIENTES_HOY` (pantallas) o `MODALES_PENDIENTES_HOY` (modales).
5. **Verifica** con el Paso 4 (no se da por hecha una pantalla sin él). Vender, Cambios y Devoluciones llevan además la captura a 375 px que pide la plantilla del PR (PL-105).
6. **Checks:** `pnpm typecheck`, eslint de lo tocado, `pnpm --filter web test`, `node --test scripts/focus/escanear.test.mjs` si tocaste el escáner, `node scripts/focus/escanear.mjs --ruta <ruta>` → ✅.
7. **Docs:** actualiza el ADR-0284 (sección «Dónde está aplicada» o una «Actualización» nueva si hubo una decisión) o el backlog de la rama; una entrada de bitácora y de backlog (un archivo por entrada, ADR-0259).

## Modales: enciende el camino

Dentro de un modal el control que sigue se **ilumina**: un halo suave alrededor del bloque, el fondo más claro (papel) en la caja de texto, el combo o el botón desplegable de adentro, y la marca «Sigue aquí» en su título; al completarlo la luz pasa al siguiente. Sirve a **cualquier control**: caja de texto, combo (`ComboBuscable`, `Desplegable`, `ComboResponsable`), chips, interruptor, segmentado, o un grupo de varios. `<CampoGuiado>` envuelve el bloque y no conoce el control; la luz se pinta por detrás y por fuera (no cambia el tamaño de nada).

```tsx
const guia = useGuiaCampos([
  { id: "identificacion", nombre: "Un dato de la clienta", requerido: true, hecho: dni !== "" || nombre !== "", pendiente: "Escribe al menos un dato." },
  { id: "familia", nombre: "Familia", requerido: false, sugerido: true, hecho: familiaElegida, pendiente: "Elige la familia (ahora dice Neutro)." },   // valor de fábrica que importa
  { id: "permiso", nombre: "Permiso de WhatsApp", requerido: false, hecho: acepta, pendiente: "" },
  { id: "responsable", nombre: "Quién registra", requerido: true, hecho: responsable.listo, pendiente: "Elige quién registra." },
]);
<CampoGuiado id="identificacion" guia={guia} titulo="Identificación" ayuda="Basta con uno">   {/* un GRUPO: se enciende el bloque */}
  <CampoTexto etiqueta="DNI" … /> <CampoTexto etiqueta="Nombre" … />
</CampoGuiado>
<CampoGuiado id="familia" guia={guia}><CampoSelect etiqueta={guia.etiqueta("familia", "Familia")} onValor={(v) => { setFamilia(v); setFamiliaElegida(true); }} … /></CampoGuiado>
<CampoGuiado id="permiso" guia={guia}><Interruptor etiqueta={guia.etiqueta("permiso", "Acepta WhatsApp")} … /></CampoGuiado>
<PieGuia guia={guia} />                                            {/* «Falta: ● Un dato · ○ Quién registra», cada uno tocable */}
<Boton disabled={…lo de siempre…} title={guia.frase ?? undefined} className={guia.claseConfirmar}>Registrar</Boton>
```

Reglas del modal:
- `hecho` y `requerido` salen de la **validación real** del modal (la misma que ya rechaza o apaga el botón). **No cambies qué se puede confirmar**: la guía no agrega candados ni cambia el `disabled` de siempre.
- Una regla de **grupo** («basta uno de tres») es UN campo virtual que envuelve a los tres controles.
- Un `CampoTexto`/`Interruptor` con etiqueta propia recibe la marca por `etiqueta={guia.etiqueta(id, "Texto")}`; un bloque sin etiqueta propia, por `titulo=` en `<CampoGuiado>`.
- El modal pone su propio foco al abrir (en celular ni siquiera enfoca el primer campo: hay que tocarlo): no lo pises. La luz se mueve al completar; **nunca se desplaza el modal mientras se teclea**.
- El orden de `useGuiaCampos([...])` es el orden de pantalla: el primer campo por hacer es el que sigue. Un campo con valor de fábrica que importa va en su lugar de pantalla, no al final.
- Registro: la clave del modal es su archivo (`components/XModal.tsx`) en `MODALES`; al hacerlo pásalo a `aplicada` y baja `MODALES_PENDIENTES_HOY`.

## La guía acompaña, no apura (ADR-0284 act. h)

«Hecho» se calcula de un valor, y un valor existe desde la primera letra o el primer clic. Lo que dice que la persona *terminó* es que salió del campo. Por eso la luz se comporta según el control:

| Control | La luz avanza… | Quién lo hace |
|---|---|---|
| Caja de texto, número, textarea (nombre, precio, cantidades) | al **salir** del campo (Tab o clic fuera), no al teclear; mientras tanto el campo sigue «Sigue aquí», sin ✓ | automático: `CampoGuiado` (modales) y `FilaAlta` (Nuevo producto) usan `useRetenerLuz` |
| Combo, chips, segmentado de **una** opción | en el instante de **elegir** (elegir es «terminé»: no retiene nada) | automático |
| Chips o botones de **varias** opciones (tallas, colores, etiquetas) | al tocar o enfocar **otra cosa** de la página; mientras se sigue eligiendo dentro, la luz se queda | `retiene="fila"` en `FilaAlta` o en `CampoGuiado` (autónomo: no pide cableado) |
| Campo **opcional** con el cursor (la descripción) | no se mueve: un opcional no le quita la luz a lo que sigue de verdad | automático (solo retiene un campo requerido o sugerido) |
| Combo o chips con **valor de fábrica que importa** («Familia» = Neutro, tallas marcadas de antemano) | al elegir (aunque sea lo mismo); hasta entonces la luz pasa por él | tú: `sugerido: true` + `hecho` = «la persona eligió» (estado local que se enciende en su `onValor` y se reinicia al abrir) |

Reglas:
- **Pantalla nueva con su propio `data-campo`** (no `CampoGuiado` ni `FilaAlta`): usa `useRetenerLuz(id, retencion, modo)` (`components/guia-de-foco/useRetenerLuz.ts`), esparce `{...retener}` en el bloque y pasa `enFoco` a su `siguienteDe`/`campoAhora`. No reimplementes «está escribiendo».
- **El valor de fábrica que sigue siendo lo correcto casi siempre** (la sede actual, la moneda) no se mete en la guía: dilo en el aviso a Felipe. Un valor de fábrica sugerido **nunca bloquea**: el pie dice «Sin elegir: … · puedes seguir así».
- **La señal es el FOCO, no el mouse.** Felipe propuso guiarse por el movimiento del mouse («cuando escribe no mueve el mouse»); comparten la intuición, pero el foco dice exactamente dónde está el cursor y sirve con Tab, con lector de pantalla y en el celular (Vender, Cambios y Devoluciones se usan en teléfono, sin mouse); un roce del mouse a media palabra adelantaría la luz. Si se pide sumar el mouse como segunda señal, es una capa encima de esta, no un reemplazo.
- **La luz no mueve la vista mientras se escribe** y un opcional nunca roba la luz. Solo lo requerido o sugerido la retiene.
- **Nunca cambies el estado de la guía dentro de un `blur` síncrono** (ver la trampa 1 del Paso 4): ese es el arreglo de `useRetenerLuz` y hay que conservarlo.

## Paso 4 — Verifica como lo haría una persona (no solo con pruebas)

Las pruebas unitarias prueban la lógica de «quién sigue»; **no ven** el foco, los eventos ni el DOM, y fue ahí donde estuvieron los dos defectos reales de esta guía. Reprodúcelo antes de dar por buena una pantalla.

**Recorrido mínimo** (escritorio y 375 px; en cada pantalla o modal del alcance). Después de cada paso lee `data-estado` de cada `[data-campo]` y `document.activeElement`:
1. Abre; escribe **UNA letra** en el primer campo de texto y **espera 3 s** (la comprobación asíncrona del nombre termina en ese rato): el campo sigue «Sigue aquí», sin ✓, y nada más se enciende. Si salta, la pantalla tiene el defecto.
2. Completa el texto: sigue ahí (aunque un código se autorrellene).
3. **Tab, Tab, Tab…**: la luz y el foco llegan, en orden de pantalla, a cada campo guiado; el foco **nunca** cae en el contenedor del modal.
4. Un combo con valor de fábrica: la luz pasa por él; elegir (incluso lo mismo) lo deja ✓ y la luz sigue. Con el **mouse**: clic directo en ese combo desde un campo de texto abre la lista y acepta la elección.
5. Campos de varias opciones: marca 2 o 3 seguidas (la luz no sale); toca otra cosa (se suelta).
6. Un opcional con el cursor no roba la luz; los círculos punteados de los opcionales giran (quietos con movimiento reducido).
7. **Nada cambia qué se puede confirmar**: el botón principal se habilita y se apaga igual que antes.
8. 375 px (`resize_window` `mobile`; vuelve a `desktop` al terminar).

Este recorrido inspecciona el estado con:
`[...document.querySelectorAll('[data-campo]')].map(e => e.dataset.campo+':'+e.dataset.estado).join(' ')+' | foco='+(document.activeElement.closest?.('[data-campo]')?.dataset.campo ?? document.activeElement.tagName)`

**Las dos trampas que ya costaron horas** (no las reabras):
1. *Estado dentro del `blur`:* durante un `blur` el foco aún no llegó al control siguiente (`document.activeElement` es `<body>`). Si ahí se cambia un estado que mueve nodos del DOM (la marca «Sigue aquí» cambia de sitio), el `FocusScope` de Radix cree que se perdió el foco y lo devuelve al contenedor del modal: Tab nunca llega al campo de al lado. Se suelta un tick después (`setTimeout 0`). Solo se reproduce con un Tab real.
2. *StrictMode:* en desarrollo React simula un desmontaje con el bloque aún en pantalla y el foco puesto (el `autoFocus`); una limpieza que suelte el registro ahí lo borra. Solo se suelta si el bloque ya salió del DOM (`isConnected`).

**Entorno** (todo esto ya se resolvió una vez; no lo reinventes):
- *Servidor:* `preview_start` con una entrada de `.claude/launch.json`. Los puertos 3010 y 3070 suelen estar tomados por otras sesiones («Port in use»): agrega una entrada temporal con un puerto libre (`env PORT=3111 pnpm --filter web dev`) y revierte el archivo con `git checkout .claude/launch.json` (nunca se commitea). Al terminar, `preview_stop`, salvo que Felipe pida probarlo él: en ese caso déjalo corriendo y dile la URL.
- *`.env.local`:* un worktree nuevo no lo trae. Cópialo de otro worktree (`apps/web/.env.local`, ignorado por git) **después de comprobar que apunta a la base LOCAL** (`127.0.0.1:54421`); nunca uses claves de producción.
- *Sesión:* el panel del navegador suele traer ya una sesión local; si no, las cuentas de desarrollo están en `supabase/seed.sql` (solo base local). No cierres la sesión del panel.
- *Base local atrasada:* si la pantalla dice «no está mostrando datos» y el log del servidor (`preview_logs`) habla de una columna que no existe, falta una migración en la base de desarrollo. Aplica **solo** la que la pantalla necesita, a la base local (`docker exec -i supabase_db_<proyecto> psql -U postgres -v ON_ERROR_STOP=1 < supabase/migrations/<archivo>.sql`; `docker ps` dice el nombre), nunca `db reset` (la usan otros worktrees) ni nada contra producción, y **dilo en el informe**.
- *No pulses «Guardar» / «Crear»:* crea datos en la base local, y una cuenta de terminal exige asistencia marcada para guardar.
- *Panel oculto:* si `screenshot`, `click` o `type` fallan con «Browser pane is not displayed», la página no pinta cuadros (`show_pane` no abre el navegador: pídeselo a Felipe si hace falta algo real). Con JS puedes avanzar: `el.click()`, el `value` por el setter nativo + un evento `input`, y eventos sintéticos `focusin`, `focusout` y `pointerdown`. Los temporizadores se retrasan: espera 300–400 ms antes de leer. **Dilo en el informe** (qué fue sintético) y deja a Felipe la lista de lo que repetir a mano; la trampa 1 del recorrido no se prueba con eventos sintéticos.
- *Coordenadas:* las de `find`/`ref` y las de una captura pueden estar en marcos distintos: haz clic por las de la captura.

## Paradas (pregunta a Felipe; no decidas tú)

- «Qué falta» **no sale de una validación que ya exista** (qué hace «completa» a una ficha es decisión de negocio suya, como en Editar producto: solo fotos, tejido y patrón).
- Exigir algo bloquearía una operación que hoy se permite. La guía **nunca** bloquea.
- El estándar no cabe (una pantalla sin campos reales pero con un flujo que confunde).
- Otra sesión está tocando esos archivos.
- Decidir si un valor de fábrica «importa» cuando no es evidente (¿es casi siempre el correcto?). Propón y pregunta; el costo de equivocarte es una marca de más o un valor sin mirar.
- Cualquier pedido de **otro bucle de movimiento** distinto del círculo punteado: va contra ADR-0136 y lo decide Felipe con su excepción escrita.

## Cierre

- Corre `node scripts/focus/escanear.mjs` otra vez: el alcance tiene que salir con **0 SIN guía**.
- Informe final corto: antes/después por pantalla, qué se implementó, **las decisiones de negocio que quedan abiertas** (lista corta, para Felipe), **qué se verificó de verdad y qué fue sintético o no se pudo** (panel oculto, Safari, teclado real) y qué tocaste del entorno (migraciones locales, `.env.local`).
- **No hagas commit ni push** salvo que Felipe lo pida (o lo pida un evento del autofix).

## Lo que esta skill NO hace

No agrega reglas de negocio ni candados, y **no cambia qué se puede confirmar** en un modal. No rediseña la pantalla. No toca pantallas ni modales fuera del alcance. No baja `PENDIENTES_HOY` ni `MODALES_PENDIENTES_HOY` sin haber hecho la guía, ni manda nada a `no-aplica` sin motivo escrito. No agrega animaciones en bucle. Con `todo` no implementa nada.
