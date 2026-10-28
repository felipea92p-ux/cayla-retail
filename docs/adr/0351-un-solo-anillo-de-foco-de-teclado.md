# ADR-0351 · Un solo anillo de foco de teclado para todo el ERP

- **Fecha:** 2026-10-05 · **Estado:** aceptado. Sin migración ni cambio en producción: solo CSS y componentes de la web.
- **Pedido:** Felipe, 2026-10-05, a partir del informe de `/formidable` sobre Frescura (`docs/formidable/inventario-frescura.md`,
  «Lista aparte»): el foco por teclado era débil en piezas compartidas. Pidió un indicador común, una regla compartida, y
  verificar con Tab en Frescura, Existencias y Vender, y a 375 px.
- **Complementa:** ADR-0169 (solo tokens, rojo máx. 2 por pantalla), ADR-0209 (combos), ADR-0136 (no se toca el movimiento).

## Qué se midió (en el navegador, por píxeles; no por código)

Chrome real, una captura del control sin foco y otra con foco por Tab, y el contraste entre los píxeles que cambiaron
(WCAG 1.4.11 pide 3:1). El informe lo había calculado «por código y mezcla de alfa»; las cuatro afirmaciones se confirmaron
**salvo una**:

| Control compartido | Antes | Después |
|---|---|---|
| Combo y buscador en caja (`.caja-cayla`) | borde de 1 px, **2,10:1** | anillo de 2 px, 16,4:1 |
| Pastilla del selector de sede | **0 píxeles cambian**: sin indicador | 2 px, 15,4:1 |
| Fila clicable (`.fila-cayla`, Frescura) | 2 px en rojo al 45 %, **2,04:1** | 2 px, 16,4:1 |
| Cifra clicable de `ResumenSede` | **refutado:** Chrome dibujaba su anillo azul por defecto (5,56:1) | 2 px, 15,2:1 |

El cuarto caso no era «débil» sino **fuera de paleta**: todo control sin `outline-none` caía al anillo azul del navegador
(`#005fcc`), distinto en cada navegador y ajeno a los tokens. Por eso la solución no es solo reforzar los débiles: es que
el sistema tenga un anillo propio. Lo mismo apareció en el recorrido con Tab de las tres pantallas: el interruptor «Solo con
stock» de Vender (**1,54:1**, `ring-rojo/30`), el botón superpuesto de cada tarjeta de prenda (1,8:1, `ring-rojo/40`), el
disparador de las píldoras de filtro («Ordenar por», sin indicador), el punto de color de Existencias (1,36:1) y, a 375 px,
las tallas de cada tarjeta (2,49:1, `outline-tinta/40`) y su botón «Colgar en el piso · más acciones» (2,11:1,
`ring-tinta/30`). El `<Boton>` compartido usaba `outline-rojo/60`: 2,49:1 contra crema (mismo defecto, no medido en pantalla).
**Tinta con transparencia falla igual que rojo con transparencia**: el problema es la transparencia, no el color.

## Decisión

DECIDÍ: **un anillo de tinta de 2 px a 2 px del borde, para todo `:focus-visible`**, con tres variables en `globals.css`
(`--foco-color: var(--color-tinta)`, `--foco-ancho: 2px`, `--foco-separacion: 2px`; no es un color nuevo, es un alias a un
token que ya existe):

1. **`@layer base`: `:focus-visible { outline: … }`.** Especificidad mínima: un control con su propio `outline-*` la sigue
   pisando; uno que solo quiere este anillo no escribe nada. Reemplaza el azul del navegador.
2. **`@layer components`: `.caja-cayla:has(:focus-visible)` y `.fila-cayla:focus-visible`.** La caja se enciende entera
   cuando el cursor está en su `<input>` transparente de adentro (`:has`); la fila lleva el anillo **hacia adentro**
   (`outline-offset: -2px`) porque la tarjeta de la tabla (`overflow-hidden`) lo recortaba hacia afuera. Por ADR-0105 una clase
   de componente pierde contra una utilidad, así que **ningún control con `caja-cayla` o `fila-cayla` escribe `outline-none`**:
   se le quitó a 16 cajas (campos de texto y `ComboBuscable`) y 2 filas (`ExistenciasPorPrenda`, `InventarioPanel`).
3. **Se borraron los `outline-none` y anillos propios con transparencia** de las piezas compartidas: `Boton`, el combo (todas
   sus formas), `BotonCompacto`, `MenuAcciones`, `FiltrosPildora` (disparador y botón de quitar), `TarjetaSenal`, `Graficos`,
   `FrescuraFila`, y los de las tres pantallas que se recorrieron: la tarjeta de prenda y el interruptor de Vender, y la
   tarjeta, las tallas y el botón de acciones de Existencias. El punto de color de Existencias, que usa el `outline` como
   marca de «elegido», suma un anillo de foco con separación de 3 px para no confundirse con el elegido.
   Una fila que se desplaza (`overflow-x-auto`) **recorta el anillo**: el borde que toca el contenedor desaparece. Las dos
   que se vieron cortadas en las capturas —las píldoras de Existencias (`py-0.5`) y las categorías de Vender (0 px arriba)—
   llevan 4 px de holgura (2 de anillo + 2 de separación) con margen negativo, sin mover el
   diseño. Un contenedor con `overflow` que guarde controles necesita esos 4 px. Un control segmentado (`overflow-hidden rounded-lg
   border`: «Solo iconos / Iconos con texto», «Prioridad / A–Z») no tiene dónde crecer: su anillo va hacia adentro
   (`focus-visible:-outline-offset-2`); antes solo se veía el arco derecho.
4. **`lib/foco-comun.test.ts`** fija la regla: el anillo vive en `globals.css`, ninguna caja ni fila escribe `outline-none`, ninguna
   pieza de `components/ui/` escribe su propio anillo rojo o tinta con transparencia, y la deuda de afuera (64 casos) solo baja.

DESCARTÉ:
- **Rojo (o rojo-profundo) como foco general**, porque el rojo es el acento «sagrado» (máx. 2 por pantalla, ADR-0169) y el foco
  aparece en cada Tab: una pantalla con filtros ya gastaría el rojo en el anillo. Tinta tiene 13,3 a 16,4:1 contra
  crema, papel, hueso y sand, y no compite con nada.
- **Una regla sin capa que le gane a todo `outline-none`** (la primera versión de este cambio): `lib/globals-capas.test.ts`
  (ADR-0105) la rechazó con razón: una clase suelta le gana a toda utilidad de Tailwind y ya causó un bug silencioso
  (`card-cayla border-l-rojo`). Se cumplió la regla del repo y se pagó el costo: borrar una palabra en 18 líneas.
- **Un `!important` universal sobre `:focus-visible`**, porque también dibujaría un anillo alrededor de cada hoja y cada título
  que se enfoca por programa (`tabIndex={-1}` con `outline-none`, a propósito) apenas la persona usa el teclado.
- **Reescribir los 232 `outline-none` de 137 archivos** en este cambio: es una migración mecánica pero ancha que merece su
  revisión pantalla por pantalla; queda como deuda con candado (la cuenta solo baja).
- **Anillo doble (tinta + halo claro)** para superficies oscuras: hoy no hay un control enfocable sobre fondo tinta (se midió
  en las tres pantallas); si aparece, se resuelve en esa superficie, no en la regla general.

SE ROMPE SI: (a) un control enfocable se dibuja sobre un fondo tinta u oscuro (una persiana, un panel invertido): el anillo de
tinta se pierde contra ese fondo y ese control necesita su anillo en crema; (b) una pantalla nueva vuelve a escribir
`outline-none` sin sustituto (lo vigila el informe `/formidable` y, para el rojo con transparencia, la prueba).

## Qué NO se tocó y queda anotado

- **64 anillos propios con transparencia (rojo o tinta)** en 47 archivos (`PuntoDeVentaTicket`, `ProformasPanel`,
  `NuevaProformaModal`, `FacturacionCabecera`, `AbrirConteo`, `conteo/*`…): cada uno migra al anillo común al tocar su pantalla.
  `MuestraColor` (`group-focus-visible:ring-rojo/50` sobre un círculo) queda aparte: su foco revela el nombre del color.
- **Campos con borde de 1 px en rojo pleno al enfocarse** (el buscador de Vender y el de Existencias, 4,8 a 5,2:1): cumplen
  el 3:1 de WCAG 1.4.11 aunque no el 2 px de 2.4.13; no se tocaron.
- **Finanzas** (`.fin-control:focus { outline: none; border … taupe 55 % }`, `finanzas.css`): conserva el borde del spike
  (ADR-0195). Mismo defecto de contraste (≈2,1:1); decidir si el spike lo adopta es de Felipe, no un efecto lateral de aquí.
- **El campo de búsqueda dentro de la lista abierta** de un combo (`campos.tsx`, `FiltrosPildora.tsx`) tiene `outline-none`
  y solo el cursor; está dentro de un popover con foco atrapado. Pendiente.
- **`--color-ring`** sigue en rojo (lo usan 2 componentes `ring-ring`); no es el foco del sistema.
- **El lateral (`AppShell`)** recorta el anillo de cada enlace por los costados (la envoltura del grupo es `overflow-hidden` y no
  deja holgura lateral): se ve arriba y abajo. Ya pasaba con el anillo azul; queda pendiente.
- **Movimiento:** nada de ADR-0136 cambia; el anillo aparece sin transición.

## Cómo se verifica

`pnpm --filter web exec vitest run lib/foco-comun.test.ts` (y la suite entera: 357 archivos, 156.080 pruebas en verde), y a mano con
Tab en `/inventario/frescura`, `/inventario` y `/vender`, a 1280 y a 375 px.

**Resultado (2026-10-05, Chrome real, base local, sesión de Felipe):** ~300 paradas de Tab, cada una con captura sin y con foco:
**0 controles sin indicador o por debajo de 3:1**, salvo el buscador de Vender a 375 px, que el verificador marcó «sin indicador»
por un recorte mal puesto de mi script y que se confirmó aparte (borde de sand a rojo pleno, 4,8:1, 1 px). Los cinco controles
del informe quedaron en 2 px y entre 15,2 y 16,4:1.

**Qué NO prueba esto:** el verificador automático de «anillo completo por los cuatro lados» dio demasiados falsos positivos y no
se usó como criterio. El recorte se comprobó **mirando capturas a 2x** de ~15 controles representativos (píldoras, categorías,
segmentados, tarjeta de prenda, punto de color, acciones a 375 px, enlace del lateral): todos completos salvo el lateral (ver
arriba). Solo se recorrieron tres pantallas; el resto del ERP no se midió. El contraste se mide con una captura del control sin y con
foco (método de `/formidable`; `medir-oficio.js` convierte el color con un canvas).
