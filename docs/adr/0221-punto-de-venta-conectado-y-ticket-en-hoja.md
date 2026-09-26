# ADR-0221 · Punto de venta conectado con sus pantallas vecinas, y el ticket en hoja en el celular

- **Fecha:** 2026-09-26
- **Estado:** aceptado (Felipe aprobó el spike `docs/maquetas/punto-venta-spike-2026-09/`, PR #472, y pidió llevarlo a
  la interfaz). Sin migración: todo lo que toca la base ya existía en producción (verificado ese día con `pg_proc`).

## Problema

Felipe pasó 13 capturas de `/vender` pidiendo que la pantalla trabaje «de la mano» con las pantallas nuevas y que sirva
en el teléfono, donde la mayoría de colaboradoras pasa el día. El análisis encontró once cosas (vista «Hallazgos» del
spike). Las que pedían decisión de arquitectura:

1. Los accesos de la cabecera (Caja · Cambios · Devoluciones) eran texto de 11 px y **se escondían bajo 640 px**
   (`hidden sm:flex`): en el celular no había ninguna puerta desde la caja a las pantallas vecinas.
2. La ficha de clienta (`buscar_clienta`) y los pedidos no atendidos (`registrar_pedido_no_atendido`) existían en la
   base y **nunca llegaron al mostrador**.
3. Apartar o cotizar obligaba a rehacer el ticket en otra pantalla.
4. En el celular el POS se apilaba: para ver el total o cobrar había que bajar todo el catálogo.

## Decisión

1. **Accesos por rol** (`lib/vender-accesos.ts`): Caja, Apartados, Cambios y Devoluciones a la vista; Historial y
   Proformas en «Más». Solo sale lo que la cuenta ve (`persona.modulos`, ADR-0161), y Proformas además pide el poder
   «facturar» (su ruta usa `exigirPermiso`). Medido en el spike: seis no caben junto a «Hoy» y «Cerrar caja». En el
   celular todo va en «Más», incluido «Cerrar caja».
2. **Píldora «Hoy»** en la cabecera (`ResumenDeHoy`): ventas, total y % de `ubicaciones.meta_venta_diaria`. La lista de
   «Ventas de hoy» sale del fondo del catálogo y se abre desde ahí. Los datos se leen UNA vez (`useVentasDeHoy`) y los
   usan la píldora y la lista; la página los trae en el mismo `Promise.all` (antes era un `Suspense` aparte).
3. **Clienta en el ticket** (`ClientaDelTicket`): busca en la libreta por DNI, celular o nombre y llena el comprobante.
   Viaja con el ticket en espera, a la proforma y a «no había».
4. **Tickets en espera con nombre** («Probador 2») y una tira que los retoma de un toque.
5. **Apartar y Proforma desde el ticket.** Apartar **no duplica** el flujo del dinero: lleva las prendas a Apartados
   (`?prendas=<id>:<cant>`, `lib/apartar-desde-ticket.ts`), que sigue cobrando el adelanto y separando el stock
   (ADR-0166); la dirección se limpia apenas se lee. Proforma reutiliza `NuevaProformaModal` con las líneas del ticket.
6. **«Anotar que no había»** en el modal de talla, firmado con el mismo combo «Responsable» del ticket (la función usa
   `fn_actor_persona_id(true)`: sin responsable, con el obligatorio encendido, se rechaza).
7. **El buscador pone lo vendible arriba** (`lib/vender-buscador-reglas.ts`): aquí → almacén → sin stock. Filtra todo el
   catálogo antes de cortar a seis.
8. **Celular: variante A del spike.** Barra fija de cobro abajo que abre el ticket en una hoja. La hoja es una variante
   nueva de `<Modal>`, `variante="ticket"`, igual que se sumó `camara`: hereda velo, entrada, cascada y foco (ADR-0136),
   sin reimplementar un overlay. El ticket se monta en la hoja o en su columna, nunca en los dos.
9. **Ajustes:** el aviso de Admin del combo como chip (`ComboResponsable compacto`, solo en el ticket); «Prenda sin
   registrar» arma sola la descripción y cambia el teclado de pantalla por un campo `inputMode="decimal"`; catálogo con
   foto cuadrada y hasta 5 columnas por **consulta de contenedor** (`@container`), no por ancho de pantalla; el botón de
   contactos de Safari se esconde en los combos (`input[role="combobox"]`).

## Alternativas descartadas

- **Apartar dentro del Punto de venta** (con adelanto, en un modal): duplicaba el cobro del adelanto, la caja y el
  vencimiento que ya viven en Apartados. Llevar las prendas es más chico y no puede desincronizarse.
- **Hoja del celular hecha a mano** (`fixed inset-0` + transform): rompía la regla de modales (ADR-0136). Una variante
  de `Modal` da lo mismo con el foco atrapado y la animación del sistema.
- **Seis accesos siempre a la vista:** no caben con el lateral abierto; un menú de una sola opción tampoco
  (`repartirAccesos` la sube a la vista).

## Lo que queda fuera, a propósito

- **La pregunta del club y «es para regalo»** (paso 1 del acta de clientas, D-92 a D-111): necesitan el historial de
  permisos (G.2) que la base aún no tiene. La fila «Clienta» solo busca en la libreta.
- **Pedir al almacén o un traslado desde la talla:** hoy los traslados los inicia Inventario. El modal dice dónde hay y
  deja anotar «no había».
- **La campaña no pasa a la proforma:** `crear_proforma` acepta sus propios motivos y un tope de 20 %, no el descuento de
  campaña. El Punto de venta lo avisa al abrirla. **Decisión pendiente de Felipe:** si la proforma debe aceptar la campaña.
- **Contadores en los accesos** (apartados por vencer, devoluciones por aprobar): piden consultas nuevas; se decide
  aparte.

## Cómo se verificó

Pruebas nuevas en `lib/vender-conectado.test.ts` (accesos por rol, orden del buscador, resumen y meta, nombre de espera,
traspaso a Apartados, clienta, precio). Suite completa de la web en verde salvo `escaner-qr.test.ts`, que falla solo en
un worktree sin `jsqr` instalado. Navegador: una página temporal montó el Punto de venta real con datos de prueba a
1440 px y a 375 px — accesos y «Más», «Hoy», buscador ordenado, modal de talla con «no había», espera con nombre y
retomar, hoja del ticket, clienta, proforma y «Prenda sin registrar». Pendiente: el clic real con sesión y datos de
producción (Felipe).
