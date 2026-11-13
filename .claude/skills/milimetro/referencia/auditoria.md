# Auditar y proponer: severidad, informe y tablero

## Severidad (un hallazgo, una severidad)

| Severidad | Cuándo | Ejemplos |
|---|---|---|
| **Grave** | Rompe una `[Norma]` de nivel A o AA, una regla del repo **que tiene prueba**, o deja un estado imposible | letra < 4.5:1; foco invisible o tapado entero; blanco < 24 px; error solo en rojo o sin ligar; pieza decidida dibujada a mano; hex suelto; el botón que confirma apagado por lo que falta; un ocupado que se puede pulsar otra vez |
| **Media** | Se aparta de una regla del repo sin prueba, de una `[Evidencia]` o de una `[Norma]` AAA | un `:hover` fuera de `(hover: hover)` sin `hover-tactil`; lo elegido que solo dice ARIA; validar a la primera letra; una duración escrita a mano; anillo de foco < 3:1 (2.4.13 es AAA); apagado sin motivo a la vista |
| **Leve** | Pulido de `[Práctica]` | 1–2 px de diferencia; una opacidad de hover distinta de su familia |

Reglas: lo que el medidor marca **«revisar»** no es hallazgo hasta confirmarlo con `grep` en el código. Lo que existe por un ADR (vista rápida, sellos de Movimientos,
Observatorio, persiana de Caja, kit de Finanzas, Estados financieros) va como **«decidido a propósito»**, sin severidad. Un hallazgo que dos medidores ven va una vez,
en la skill dueña del tema (contraste → `/color`, alto → `/espacio`, duración → `/movimiento`, palabra → `/textos`, estado → `/milimetro`).

## Informe de `auditar` (`docs/milimetro/auditorias/<fecha>-<slug>.md`)

```
# Auditoría al milímetro — <ruta o pieza> · <fecha> · <rama y SHA>
Medido: 1440×900 claro vivo · 375×812 claro · 1440 oscuro · quieto     Servidor: <url local>
Resumen: <n> graves · <n> medias · <n> leves · <n> decididos a propósito

## Graves
1. <qué> — <dónde: selector y archivo:línea> — medido <valor> — regla <valor exigido> — [Nivel] fuente — va a /<skill>
## Medias
## Leves
## Decidido a propósito
## Sin medir
- <medidor que no existe todavía, vista que no se abrió, estado que exige guardar>
```

En el chat, primero la línea de resumen y los graves; lo demás, en el archivo.

## Tablero de `proponer` (`docs/milimetro/propuestas.md`)

```
# Propuestas al repo del set «Al milímetro» · <fecha>
| # | Skill | Regla de hoy (archivo / ADR) | Propuesta | Nivel | Riesgo | Cómo se mide | Módulos que toca | Choca con | Felipe decidió |
```

Orden: primero `[Norma]` A/AA y `[Evidencia]`, después lo que toca más pantallas. Dos propuestas que piden cosas distintas del mismo token van juntas, con «Choca con».
Para que Felipe elija **mirando**, la especificación de `node unificar/elegir.mjs` (formato en la cabecera del script) lleva, por propuesta, un grupo con dos opciones:

```json
{ "id": "p3-apagado", "nombre": "Apagado legible", "pregunta": "¿Cómo se ve un botón que no se puede usar?",
  "opciones": [
    { "id": "hoy", "tipo": "hoy", "nombre": "Hoy: disabled al 50 %", "detalle": "globals.css .btn-cayla:disabled", "imagenes": [], "demo": "<button class='btn-cayla btn-primario' disabled>Guardar</button>" },
    { "id": "propuesta", "tipo": "propuesta", "nombre": "aria-disabled + motivo", "detalle": "se alcanza con Tab y dice por qué", "imagenes": [], "demo": "…" } ] }
```

Con `css` apuntando al CSS real del ERP, la demo se dibuja con los tokens de verdad, en claro y en oscuro («Ver en oscuro» de la página).

---

## Propuestas de /milimetro, en detalle

Todas: **propuesta, espera a Felipe.**

### 1. Un aviso con acción no se va solo
- **Regla de hoy:** `DURACION_CON_ACCION = 7000` ms (`apps/web/lib/avisos-reglas.ts`; ADR-0146 act. 2026-10-14; CLAUDE.md «Carga y espera»: «un aviso con botón dura 7 s como mínimo»).
- **Qué hacen los mejores:** Carbon: un toast con acción «debe permanecer en pantalla hasta que el usuario lo cierre», y la acción tiene que existir por otra vía `[Práctica]`.
- **Propuesta:** el aviso con acción no lleva reloj mientras la acción siga valiendo (por ejemplo, «Deshacer» hasta que otra acción lo invalide), con su × siempre.
- **Riesgo:** avisos que se acumulan; hay que decidir qué invalida un «Deshacer» (ADR-0146 ya resolvió los que resucitaban).
- **Cómo se mide:** `avisos-reglas.test.ts` (`duracionDe` con `accion` → `null`); en vivo, un «Deshacer» sigue a la vista después de 30 s.

### 2. Un error no se va solo
- **Regla de hoy:** `DURACION.error = 8000` ms (`lib/avisos-reglas.ts`).
- **Qué hacen los mejores:** NN/g pone el error junto a su origen, con intensidad según el impacto; Carbon deja los avisos que se van solos para lo que no es crítico `[Práctica]`.
  WCAG 2.2.1 (tiempo ajustable) no se leyó: ver «No verificado».
- **Propuesta:** `tono: "error"` sin reloj, se cierra con su ×. El error de un dato sigue bajo su campo (eso ya es regla).
- **Riesgo:** un error repetido apila tarjetas: se agrupan por mensaje.
- **Cómo se mide:** `avisos-reglas.test.ts`; `grep -rn "avisar.error" apps/web` para ver cuántos son de un campo y deberían ir con `guia.marcarError`.

### 3. Apagado, pero que se pueda leer y alcanzar
- **Regla de hoy:** `.btn-cayla:disabled { opacity: 0.5 }` (`app/globals.css`) con `disabled` nativo; `<Boton>` pasa `disabled` también mientras guarda.
- **Qué hacen los mejores:** Axess Lab: el control apagado no se alcanza con Tab, no dice por qué y, exento de contraste, no se lee; la salida es dejarlo activo y explicar,
  o darle aspecto apagado con contraste suficiente usando `aria-disabled` `[Práctica]`. WCAG 1.4.3 exime a los inactivos `[Norma]`: la exención no hace que se lea.
- **Propuesta:** fuera de «mientras guarda», lo apagado por permiso o por estado usa `aria-disabled="true"` con el motivo a la vista (como `MenuAcciones` y `PasoCantidad`), y su letra
  pasa 4.5:1. `cargando` sigue con `disabled`, por el doble clic.
- **Riesgo:** un `aria-disabled` sin su guarda deja pasar el clic: `<Boton>` tiene que frenarlo en la captura, como ya hace con `confirma`. Toca varios módulos: OK de Felipe.
- **Cómo se mide:** `medir.js` → `apagados`; una prueba nueva junto a `boton-confirma.test.ts`.

### 4. Una cara para «solo lectura»
- **Regla de hoy:** no hay; 12 usos de `readOnly` en `apps/web/components` con la caja del campo de siempre (el pozo «espera tu dato», cuando no espera nada).
- **Qué hacen los mejores:** read-only enfocable, legible y sin cara de apagado (inferido de Axess Lab; Carbon y Primer no se leyeron) `[Práctica]`.
- **Propuesta:** por `/unificar`, familia `campo`: el dato que solo se consulta va en la **placa** (lo que explica es plano, ADR-0596), con su etiqueta y alcanzable con Tab.
- **Riesgo:** confundirlo con un texto suelto; la lámina lo muestra al lado del campo normal.
- **Cómo se mide:** `medir.js` → `soloLectura`; `grep -rn "readOnly" apps/web/components --include=*.tsx`.

### 5. El foco no se esconde bajo lo que flota
- **Regla de hoy:** sin `scroll-padding-top` global (`grep -rn "scroll-padding" apps/web/app` no devuelve nada); la cabecera de vidrio flota (`.marco-cabecera-fila`).
- **Qué hacen los mejores:** WCAG 2.4.11 (AA) pide que el control con foco no quede tapado entero por algo del autor, como una cabecera fija `[Norma]`.
- **Propuesta:** primero medir (`medir.js { foco: true }` → `focoTapado`) en tres pantallas largas a 1440 y a 1024; si aparece, `html { scroll-padding-top: <alto medido> }`.
- **Riesgo:** bajo; un ancla con `scroll-margin` propia (sellos, Finanzas) ya lo resuelve en su lugar.
- **Cómo se mide:** el mismo `focoTapado` en 0 después del cambio.

### 6. Los estados quedan escritos con la pieza
- **Regla de hoy:** el registro `docs/unificar/<familia>.md` guarda el movimiento de la pieza elegida, no sus estados.
- **Qué hacen los mejores:** los sistemas de diseño documentan cada componente por estado (Material 3, capas de estado) `[Práctica]`.
- **Propuesta:** `/unificar` (paso 6) pega la sección «Estados» de la ficha al registrar; las familias ya decididas se completan cuando se tocan.
- **Riesgo:** bajo, es documentación.
- **Cómo se mide:** `grep -L "## Estados" docs/unificar/*.md` baja con el tiempo.
