# ADR-0130 — Regla de movimiento de los modales del retail

- **Fecha:** 2026-09-19
- **Estado:** Aceptado (Felipe, 2026-09-19: «ese efecto del modal hay que colocarlo como regla para el retail, para que
  si se realizan nuevos modales se sepa qué efecto/animación tomar»). Implementado en el `<Modal>` central: **ya lo
  heredan los 49 modales que lo usan**, sin tocar ninguno.
- **Decide:** Felipe. Arquitectura: este documento.
- **Diseño de referencia:** `docs/maquetas/comprobantes-animaciones-2026-09/comprobantes-vivo.html`
  (`.velo`, `.modal`, `.st`, `@keyframes hoja / velo / sube`).
- **Toca** la regla de movimiento de `app/globals.css` (revisada en ADR-0128: el movimiento responde a una acción o
  acompaña la llegada). No la cambia: la aplica a los modales.

## Contexto — el problema

Cada pantalla que abre un modal necesita saber cómo se mueve. Sin una regla escrita, cada sesión de desarrollo decide sola
—o copia la de la pantalla que tiene a mano—, y el retail termina con modales que entran de tres maneras distintas.
El `<Modal>` real (`components/ui/Modal.tsx`) ya centralizaba el overlay y el foco (Radix Dialog), pero su entrada era
discreta: la hoja subía 8 px con escala .985 y **el contenido aparecía de golpe**. El prototipo aprobado de Comprobantes
se sentía distinto justamente por eso: la hoja sube más, y lo que hay adentro **entra en cascada**, en el orden en que
se lee.

## Decisión — un solo efecto, en un solo lugar

**El efecto lo define `<Modal>` (más `app/globals.css`, sección «REGLA DE MODALES»). Un modal nuevo lo hereda sin escribir
nada; NO define su propia animación de entrada ni reimplementa el overlay.** En orden:

| Paso | Qué pasa | Cómo | Duración |
|---|---|---|---|
| 1 | El velo aparece con desenfoque leve | `anim-velo` (`bg-tinta/35 backdrop-blur-[2px]`) | 220 ms |
| 2 | La hoja sube 18 px y crece de .965 a 1 (escritorio). En móvil sube desde el borde, sin escala | `anim-modal-entra` | 420 ms (380 en móvil), `--ease-cayla` |
| 3 | El contenido entra en cascada: cada pieza sube 10 px y aparece | `cascada-modal` (sobre el panel) | 500 ms por pieza, 55 ms de desfase, empieza 120 ms después de la hoja |
| 4 | Al cerrar, la hoja baja 10 px y se apaga; el velo se apaga | `anim-modal-sale`, `anim-velo-salida` | 220 ms, `--ease-salida` |

- **Qué cuenta como «pieza» de la cascada:** el título, la bajada y los hijos directos del modal; si el modal es un único
  `<form>`, cuentan los hijos del form (el form en sí no se anima: animar el form y sus piezas a la vez multiplica la
  opacidad). Hasta 8 pasos; del octavo en adelante comparten el último desfase.
- **Salirse de la cascada:** `data-sin-cascada` en una pieza (p. ej. una lista larga que ya se anima sola).
- **Movimiento reducido:** todo colapsa a un instante (`prefers-reduced-motion`), incluida la cascada.

### Lo que un modal SÍ puede agregar por su cuenta

Solo respuestas a una acción de la persona, dentro del contenido, nunca la entrada del propio modal: una barra que se
llena (avance), una cifra que cuenta hasta su valor, el «visto» que se dibuja al confirmar (`check-trazo`, `anim-pop`),
una fila nueva que se desliza al entrar a una lista. Siempre con `--ease-cayla`, 200–500 ms, **sin rebote, nunca decorativo y
nunca en bucle**, con dos excepciones que son señal y no adorno: el punto que late en el chip «Vencida» (lo único urgente
se mueve; está en el prototipo aprobado) y el giro del botón mientras la base responde.

### Cómo se hace un modal nuevo

```tsx
<Modal titulo="Pago a Tejidos Rímac" subtitulo="F001-000482 · saldo S/ 3,923.60" onClose={cerrar}>
  {(pedirCierre) => (
    <form onSubmit={…}>   {/* sus hijos entran en cascada, solos */}
      …
    </form>
  )}
</Modal>
```

Un modal que se abre por URL (rutas interceptadas `@modal/(.)…`) usa `<ModalRuta>`, que envuelve a `<Modal>`.

## Alternativas descartadas

- **Que cada modal declare su animación.** Es lo que ya pasaba a pequeña escala y produce inconsistencia; además obliga a
  tocar 49 archivos cada vez que se quiera ajustar el movimiento.
- **Cascada con retardos escritos a mano en cada pieza (`style={{ "--k": n }}`).** Funciona en el prototipo (donde el HTML
  es estático), pero en React obliga a numerar piezas y se rompe al agregar o quitar una. Con `:nth-child` en CSS la
  cascada se calcula sola. Costo aceptado: el orden de la cascada es el orden del DOM, y pasa de 8 pasos plano.
- **Botón X de cierre en todos los modales** (lo trae el prototipo). Cambia la cabecera de 49 pantallas y muchas ya
  tienen «Cancelar»/«Cerrar» en el pie. Queda fuera de esta regla; si se quiere, es una decisión aparte.
- **Animar con una librería (Framer Motion/GSAP).** El sistema ya tiene GSAP para lo suyo, pero un modal se resuelve con
  CSS y sin JavaScript en el camino crítico de abrir una hoja.

## Consecuencias

- Los 49 modales del sistema cambian de sensación de golpe (la hoja sube más y su contenido entra escalonado). Es el
  objetivo, pero conviene un recorrido visual por los más usados (Vender, Caja, Compras) al fusionar.
- **Pendiente de decidir:** cuatro piezas dibujan su propio overlay/animación y NO heredan la regla:
  `ProveedorModal.tsx` y `ProveedorVistaRapida.tsx` (movimiento propio desde ADR-0128), `ConteoPanel.tsx`,
  `ProductosAgrupados.tsx`. Migrarlas a `<Modal>` es trabajo mecánico pero cambia su aspecto; se hace pantalla por
  pantalla con ok de Felipe.
- La regla vive también en `CLAUDE.md` (sección «Movimiento y modales») y en el comentario de cabecera de `Modal.tsx`,
  que son lo primero que lee una sesión nueva.

## Implementación en Comprobantes (misma fecha)

La regla se estrenó en las pantallas de Comprobantes, que fueron el origen del prototipo: lista `/compras`, detalle
(`@modal/(.)factura/[compraId]`), pago (individual y en lote) y registro `/compras/nueva`. Estilos propios en
`app/estilos/comprobantes-{lista,detalle,registro}.css` (importados por `globals.css`), cada uno con su bloque de movimiento reducido.
Lo que esas pantallas agregan encima de la regla son respuestas a acciones (barras que se llenan, cifras que cuentan, «visto» al
confirmar), nunca otra entrada de modal. Dos desviaciones conscientes del prototipo, documentadas: las barras de avance se llenan en
1000 ms (más que los 200–500 de la regla, como en el prototipo y en `.hilo-dibuja`), y el giro del botón mientras la base responde es
la única animación en bucle.

## Segunda pasada de fidelidad (misma fecha)

Felipe comparó la pantalla real con el prototipo y no coincidían. La comparación imagen contra imagen encontró diferencias que una lista de
requisitos no había visto: en **Registrar comprobante**, «Tipo de documento» y «Condición» eran desplegable y subrayado en vez de la píldora
deslizante, «Vence el» desaparecía al contado, «Condición / Vence / Llegada» iban en dos filas y no había «← Comprobantes» ni el avance junto
al título; en el **detalle de factura**, la cabecera era un título chico con una cuadrícula, las tarjetas iban Pago | Recepción (el diseño:
Recepción | Pago) y el pie tenía «Cerrar» en vez de «Registrar pago» como botón principal. Todo se alineó, y la llegada estimada ahora muestra
su valor por defecto (emisión + 7 días) en lugar de un campo vacío. **Lección:** un requisito cumplido en el código no es una pantalla igual
al diseño; se verifica comparando las dos a la misma medida.

## Cómo se verifica

1. Abrir cualquier modal: la hoja sube ~18 px con un leve crecimiento y el contenido va apareciendo de arriba hacia
   abajo (título, bajada, campos, botones). Al cerrarlo baja y se apaga en un instante.
2. Activar «reducir movimiento» en el sistema: el modal aparece de una vez, sin cascada.
3. Un modal cuyo hijo directo es un `<form>` cascadea los campos, no el form entero (sin destellos dobles).
