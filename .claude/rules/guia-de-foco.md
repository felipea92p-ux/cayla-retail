---
paths:
  - "apps/web/components/**/*.tsx"
  - "apps/web/app/**/*.tsx"
  - "apps/web/app/**/*.css"
  - "apps/web/lib/*-guia.ts"
  - "apps/web/lib/guia-*"
  - "scripts/focus/**"
---

## Guía de foco: cada pantalla dice qué falta y qué sigue (regla — ADR-0284, Felipe 2026-09-29)

**Toda pantalla o modal donde alguien llena campos o avanza por pasos le dice, en el propio lugar, qué está hecho, qué sigue y qué
falta. Es OBLIGATORIO en toda interfaz nueva o rediseñada, sin esperar a que Felipe lo pida módulo por módulo.** Nació de probar
Nuevo producto con una trabajadora real que «no sabía por dónde ir, qué seguía ni qué le faltaba»: el sistema ya decía «qué falta»,
pero en letra chica al fondo, y los campos mismos no decían nada. Una pantalla que la persona no puede recorrer sola no está terminada.

Lo que se exige (el mínimo; en Nuevo producto y Editar producto está hecho y es el modelo):
1. **Cada campo dice su estado**, en su título: ✓ hecho · «Sigue» (uno solo a la vez, con su hilo) · falta. Lo opcional no lleva marca: lo dice su texto.
   Piezas: `MarcaCampo`, `EtiquetaAhora`, `ConMarca` (`components/alta-producto/guia.tsx`, `components/ficha-producto/TiraFicha.tsx`);
   en un formulario por pasos, `<FilaAlta campo= estado=>` (`alta-producto/piezas.tsx`) y `<PasoAlta pie={{ faltan }}>`.
   **El control que sigue lleva «El hilo»** (Felipe 2026-11-05, cara A de `docs/maquetas/guia-que-acompana-2026-11/`): una línea fina de tinta al costado del bloque y la palabra
   «Sigue». **Nunca rojo: el rojo es solo del error**, y cuando un campo dice su error la guía se quita. La receta es UNA (`--hilo-guia` en `vidrio/recetas.css`); la usan `.hilo-luz`,
   `.hilo-fila`, `.hilo-tarjeta` (`app/estilos/alta-guia.css`) y `.hoja-cobro-paso.sigue-aqui` (Vender). Sirve a cualquier control —caja, combo, chips, interruptor, un grupo— y al
   completarlo pasa al siguiente. Se hace con `useGuiaCampos` + `<CampoGuiado>` alrededor de cada bloque + `<PieGuia>` sobre el botón principal (`components/guia-de-foco/`; lógica en
   `lib/guia-campos.ts`; piloto: `components/NuevaClientaModal.tsx`). Una regla de grupo («basta uno de tres datos») es UN campo virtual que envuelve a los tres. **La guía no cambia qué se puede confirmar.**
   **La guía no invade:** nada se mueve cuando la luz llega (la palabra va fuera de flujo y se calla si no le cabe), la hoja no se desplaza sola (solo al tocar lo que falta o al intentar guardar),
   el hilo cede mientras se escribe en cualquier caja de texto, y el pie dice «Sigue: Nombre · quedan 2 más»: la lista completa sale al intentar guardar. Lo que la persona no puede llenar
   (el nombre del padrón) es `noSeEscribe`: sigue impidiendo confirmar, pero no se le pide. Al llevarte a un campo, una luz difuminada, nunca un bloque teñido.
2. **«Falta: …» tocable** al pie del paso (`FaltanDelPaso`), o «Lo que falta» en el panel derecho de una ficha que se edita (Editar producto):
   cada cosa **lleva al campo** (lo deja a la vista, lo destella una vez y, si es de texto, le pone el cursor). Los campos se
   encuentran por `data-campo` con `irAlIdCampo` / `useGuiaAlta` (`alta-producto/useGuiaAlta.ts`), **nunca por clases de estilo**.
3. **«Siguiente: …» tocable** en el resumen o la barra fija (`FichaPrevia`); en celular, la barra de abajo.
4. **Un paso o una sección solo lleva ✓ si la persona la visitó** (`pasoConfirmado`); uno que viene armado dice «Por revisar».
   Una ficha que ya venía completa no se llena de marcas: solo llevan marca los campos que llegaron pendientes.
5. **La lógica es pura, en `lib/<pantalla>-guia.ts`, con su prueba, y NO agrega reglas de negocio**: sale de lo que la validación real
   ya bloquea, y una prueba exige que coincidan (modelo: `lib/alta-producto-guia.test.ts`, que recorre 19 escenarios contra
   `problemasAlta`). Lo opcional de verdad no se lista como «falta»; lo recomendado que no bloquea es «sugerido» y **nunca un candado**.
6. **El botón que confirma no se apaga por lo que falta (ADR-0611, mejora 4):** `<Boton confirma={guia}>`. Al tocarlo (o con Enter en un campo), cada campo pendiente dice su error
   bajo él y el cursor va al primero. Lo que no se arregla llenando un campo sí lo apaga (`disabled={enviando}`). Un error que devuelve el guardado para un campo va con
   `guia.marcarError(campo, mensaje)`, nunca en un aviso de esquina. **Lo mal escrito se dice al salir del campo, no a la primera letra:** `useValidarAlSalir(motivo)`. Lo vigila `lib/boton-confirma.test.ts`.
7. **Tacto:** la luz nunca desplaza la página; **tampoco se va del campo donde la persona está
   escribiendo hasta que sale de él** (una letra no la manda al siguiente; `CampoGuiado` ya lo hace) y un combo con valor de fábrica que
   importa entra a la guía como «sugerido» (ADR-0284 act. h); solo se mueve lo que no se ve; sin animación con
   `prefers-reduced-motion`. Movimiento de ADR-0136 (sin bucle ni rebote); solo tokens, sin rojo (`app/estilos/alta-guia.css`, clases `hilo-*`). Verificado en escritorio y a 375 px (el pie del paso no se pega bajo `lg`).

**Cómo se hace cumplir** (ya no depende de acordarse):
- **`lib/guia-de-foco.test.ts` + `lib/guia-de-foco-pantallas.ts`:** cada `page.tsx` de `app/(app)` (`PANTALLAS`) **y cada modal** (`MODALES`:
  todo archivo de `components/` o `app/(app)/` que dibuja un `<Modal>`, `<ModalRuta>` o `Dialog.Content` con campos; la clave es su archivo)
  se declara `aplicada` (con los archivos que usan las piezas: la prueba los abre y lo comprueba), `no-aplica` (con su motivo; un modal
  de UN solo control suele serlo) o `pendiente` (la deuda de lo hecho ANTES de la regla; las cuentas `PENDIENTES_HOY` y
  `MODALES_PENDIENTES_HOY` son exactas y solo bajan). **Una pantalla o un modal nuevo no puede nacer `pendiente`:** o trae su guía o dice
  por qué no aplica. Ese archivo es también el tablero del despliegue módulo por módulo.
- **`/focus` (skill) + `pnpm focus`:** recorre las pantallas **y los modales** que estás construyendo o editando (`scripts/focus/escanear.mjs`:
  archivos cambiados → pantallas y modales → ¿campos? ¿usa las piezas de la guía? ¿qué dice el registro?), **avisa a Felipe cuáles no la
  tienen y después la implementa** con el estándar. Correla antes de dar por terminada cualquier pantalla o modal con campos o pasos; con `todo` solo
  informa el tablero completo. No decide reglas de negocio: «falta» sale de la validación que ya existe.
- **Lo que la prueba no ve:** un componente con campos que no es página ni modal (un panel embebido, una fila que se edita en la lista).
  La regla vale igual; lo pide la casilla de `.github/pull_request_template.md`.
- Al terminar una pantalla o un modal pendiente: pásalo a `aplicada`, baja el contador que toque (`PENDIENTES_HOY` o `MODALES_PENDIENTES_HOY`), y escribe qué campos cuentan como «falta»
  (una decisión de negocio de Felipe, no tuya: en Editar producto solo cuentan fotos, tejido y patrón). Detalle y decisiones:
  `docs/adr/0284-nuevo-producto-que-guia-a-quien-lo-llena.md`.
