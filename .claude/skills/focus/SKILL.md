---
name: focus
description: Recorre las pantallas Y los modales que estás construyendo o editando y verifica si tienen la guía de foco estandarizada (qué está hecho, qué sigue, qué falta; dentro de un modal se ENCIENDE el control que sigue: caja de texto, combo, chips, interruptor…; CLAUDE.md «Guía de foco», ADR-0284). Si a alguno le falta, primero se lo avisa a Felipe con la lista y después lo implementa con el estándar. Con `todo` solo informa el tablero de todo el ERP; con una ruta (`/vender`) o un módulo (`compras`) trabaja solo eso. Úsala antes de dar por terminada cualquier pantalla o modal con campos o pasos, y cuando Felipe diga «focus».
---

Verifica y completa la guía de foco de las pantallas y los modales en construcción: $ARGUMENTS

**Regla madre:** una pantalla o un modal con campos o pasos que no guía a la persona no está terminado (CLAUDE.md «Guía de foco»). Esta skill **recorre → avisa → implementa**, en ese orden. No decide reglas de negocio: la guía solo hace visible lo que la validación real ya exige.

**Dos objetivos, cada uno con su registro:** las *pantallas* (`page.tsx`, `PANTALLAS`) y los *modales* (todo archivo que dibuja un `<Modal>`, `<ModalRuta>` o `Dialog.Content` con campos, `MODALES`), ambos en `lib/guia-de-foco-pantallas.ts`. Una pantalla no queda «con guía» porque uno de sus modales la tenga, ni al revés.

**Alcance según `$ARGUMENTS`:**
- *(vacío)* las pantallas y los modales tocados por tus cambios: la rama contra `origin/main` más lo que está sin commitear.
- `todo` solo **informa** el tablero (85 pantallas y 90 modales). No implementa: son decenas y el módulo por el que se empieza lo elige Felipe (`/focus compras`, `/focus /vender`).
- una ruta (`/compras/nueva`) o un módulo (`compras`): esa pantalla, o las de ese módulo en el registro.

## Paso 1 — Recorre (el escáner, y después tus ojos)

1. `git fetch origin main` (la base tiene que estar fresca; si la rama sale de otra, `--base <rama>`).
2. `node scripts/focus/escanear.mjs` (o `--todo`, o `--ruta <ruta>`). Trae, por pantalla: si tiene campos o pasos, si usa las piezas de la guía y su estado en `lib/guia-de-foco-pantallas.ts`.
3. **El escáner es por texto: no juzga, ayuda a no olvidarse.** Trae dos tablas: pantallas y modales (con cuántos controles trae cada modal y desde qué pantallas se abre). Confirma cada veredicto leyendo:
   - `sin-guia`: ¿tiene de verdad campos o pasos? Un buscador de una sola caja o un filtro no la necesita → pásala a `no-aplica` en el registro, **con su motivo escrito** (sin motivo la prueba falla).
   - `no-aplica`: si abre un modal o un flujo desde otro archivo que el escáner no alcanzó, léelo.
   - Un **modal de UN solo control** (un motivo, una confirmación) no tiene camino que indicar: propónlo `no-aplica` con su motivo y déjalo en la lista del cierre para que Felipe lo vete. Con dos controles o más, lleva guía.
   - «Archivos con campos que no llegan a ninguna pantalla»: un componente en construcción que ni es modal. La regla vale igual.
   - «Registro por ajustar»: pantallas con guía que siguen «pendiente», o «aplicada» sin guía.
4. Mira `docs/SESIONES-ACTIVAS.md`: si otra sesión toca los mismos archivos, **avísalo y no la pises**.

## Paso 2 — Avisa (ANTES de tocar código)

Un mensaje corto, en la conversación, con esta forma, y después sigues sin esperar respuesta (salvo en las «Paradas»):

```
Focus: falta la guía en N pantalla(s)
- /ruta — campos en Archivo.tsx, Otro.tsx · tipo: <formulario por pasos | ficha que se edita | operación en vivo>
  «falta» saldría de: <la validación que hoy apaga el botón principal>
- modal components/XModal.tsx (N controles, se abre desde /ruta) — «falta» saldría de: <su validación>
Ya la tienen: … · No aplican (con motivo): …
Voy a implementarlas con el estándar.
```

## Paso 3 — Implementa (una pantalla a la vez)

Lee antes: CLAUDE.md «Guía de foco», `docs/adr/0284-nuevo-producto-que-guia-a-quien-lo-llena.md` y el modelo del tipo de pantalla.

| Tipo de pantalla | Modelo (ya hecho) | Qué lleva |
|---|---|---|
| Formulario por pasos o largo (alta, compra nueva, recibir) | `NuevoProductoForm.tsx` + `lib/alta-producto-guia.ts` | `FilaAlta campo= estado=`, `PasoAlta pie={{ faltan }}`, `FaltanDelPaso`, «Siguiente» tocable (`siguienteDelHilo`), ✓ solo si se visitó (`pasoConfirmado`) |
| Ficha o edición de algo que ya existe | `ProductoForm.tsx` + `TiraFicha` + `lib/producto-ficha-guia.ts` | «Para completar esta ficha»; marca **solo** en lo que llegó pendiente; nunca bloquea guardar |
| **Modal u hoja con campos** | `components/NuevaClientaModal.tsx` (el piloto) | `useGuiaCampos` + `<CampoGuiado>` alrededor de cada bloque + `<PieGuia>` sobre el botón principal: **se enciende el control que sigue** (ver «Modales» abajo) |
| Operación en vivo (punto de venta, caja, conteo) | el análogo: «qué falta para poder cobrar / cerrar / confirmar» | sale de las condiciones que hoy apagan el botón principal; se muestra junto a él y cada cosa lleva a su control |

Para cada pantalla:
1. **Lógica pura** en `lib/<pantalla>-guia.ts` con su prueba. `falta` = **solo** lo que la validación real ya exige (la misma regla que apaga el botón); lo recomendado que no bloquea es «sugerido», nunca candado. Incluye la prueba de coherencia: «requerido y sin hacer» ⇔ «hay un problema» (modelo: `lib/alta-producto-guia.test.ts`).
2. **Piezas** que ya existen: `MarcaCampo`, `EtiquetaAhora`, `ConMarca`, `FaltanDelPaso`, `TiraFicha`, `useGuiaAlta` / `irAlIdCampo`; campos con `data-campo`, **nunca** por clases de estilo. Si falta una pieza genérica (hoy viven en `components/alta-producto/`), extráela, no la copies. Clases `hilo-*` de `app/estilos/alta-guia.css`; solo tokens y **sin rojo**.
3. **Tacto:** nunca se desplaza la página mientras hay foco en un campo de texto; solo se mueve lo que no se ve; sin animación con `prefers-reduced-motion`.
4. **Registro:** en `lib/guia-de-foco-pantallas.ts` pásala a `aplicada` (`evidencia` = los archivos que **usan** las piezas) o `no-aplica` (con motivo) y baja el contador que corresponda: `PENDIENTES_HOY` (pantallas) o `MODALES_PENDIENTES_HOY` (modales).
5. **Verifica en el navegador**, escritorio y 375 px (`resize_window` `mobile`), con el recorrido completo y capturas. Vender, Cambios y Devoluciones llevan además la captura a 375 px que pide la plantilla del PR (PL-105).
6. **Checks:** `pnpm typecheck`, eslint de lo tocado, `pnpm --filter web test`, `node scripts/focus/escanear.mjs --ruta <ruta>` → ✅.
7. **Docs:** actualiza el ADR-0284 (sección «Dónde está aplicada») o el backlog de la rama; una entrada de bitácora y de backlog (un archivo por entrada, ADR-0259).

## Modales: enciende el camino

Dentro de un modal el control que sigue se **ilumina**: un halo suave alrededor del bloque, el fondo más claro (papel) en la caja de texto, el combo o el botón desplegable de adentro, y la marca «Sigue aquí» en su título; al completarlo la luz pasa al siguiente. Sirve a **cualquier control**: caja de texto, combo (`ComboBuscable`, `Desplegable`, `ComboResponsable`), chips, interruptor, segmentado, o un grupo de varios. `<CampoGuiado>` envuelve el bloque y no conoce el control; la luz se pinta por detrás y por fuera (no cambia el tamaño de nada).

```tsx
const guia = useGuiaCampos([
  { id: "identificacion", nombre: "Un dato de la clienta", requerido: true, hecho: dni !== "" || nombre !== "", pendiente: "Escribe al menos un dato." },
  { id: "permiso", nombre: "Permiso de WhatsApp", requerido: false, hecho: acepta, pendiente: "" },
  { id: "responsable", nombre: "Quién registra", requerido: true, hecho: responsable.listo, pendiente: "Elige quién registra." },
]);
<CampoGuiado id="identificacion" guia={guia} titulo="Identificación" ayuda="Basta con uno">   {/* un GRUPO: se enciende el bloque */}
  <CampoTexto etiqueta="DNI" … /> <CampoTexto etiqueta="Nombre" … />
</CampoGuiado>
<CampoGuiado id="permiso" guia={guia}><Interruptor etiqueta={guia.etiqueta("permiso", "Acepta WhatsApp")} … /></CampoGuiado>
<PieGuia guia={guia} />                                            {/* «Falta: ● Un dato · ○ Quién registra», cada uno tocable */}
<Boton disabled={…lo de siempre…} title={guia.frase ?? undefined} className={guia.claseConfirmar}>Registrar</Boton>
```

Reglas del modal:
- `hecho` y `requerido` salen de la **validación real** del modal (la misma que ya rechaza o apaga el botón). **No cambies qué se puede confirmar**: la guía no agrega candados ni cambia el `disabled` de siempre.
- Una regla de **grupo** («basta uno de tres») es UN campo virtual que envuelve a los tres controles.
- Un `CampoTexto`/`Interruptor` con etiqueta propia recibe la marca por `etiqueta={guia.etiqueta(id, "Texto")}`; un bloque sin etiqueta propia, por `titulo=` en `<CampoGuiado>`.
- El modal pone su propio foco al abrir: no lo pises. La luz se mueve al completar; **nunca se desplaza el modal mientras se teclea**.
- El orden de `useGuiaCampos([...])` es el orden de pantalla: el primer campo por hacer es el que sigue.
- Registro: la clave del modal es su archivo (`components/XModal.tsx`) en `MODALES`; al hacerlo pásalo a `aplicada` y baja `MODALES_PENDIENTES_HOY`.

## Paradas (pregunta a Felipe; no decidas tú)

- «Qué falta» **no sale de una validación que ya exista** (qué hace «completa» a una ficha es decisión de negocio suya, como en Editar producto: solo fotos, tejido y patrón).
- Exigir algo bloquearía una operación que hoy se permite. La guía **nunca** bloquea.
- El estándar no cabe (una pantalla sin campos reales pero con un flujo que confunde).
- Otra sesión está tocando esos archivos.

## Cierre

- Corre `node scripts/focus/escanear.mjs` otra vez: el alcance tiene que salir con **0 SIN guía**.
- Informe final corto: antes/después por pantalla, qué se implementó, **las decisiones de negocio que quedan abiertas** (lista corta, para Felipe) y lo que no se pudo verificar.
- **No hagas commit ni push** salvo que Felipe lo pida (o lo pida un evento del autofix).

## Lo que esta skill NO hace

No agrega reglas de negocio ni candados, y **no cambia qué se puede confirmar** en un modal. No rediseña la pantalla. No toca pantallas ni modales fuera del alcance. No baja `PENDIENTES_HOY` ni `MODALES_PENDIENTES_HOY` sin haber hecho la guía, ni manda nada a `no-aplica` sin motivo escrito. Con `todo` no implementa nada.
