---
paths:
  - "apps/web/app/**/finanzas/**"
  - "apps/web/components/finanzas/**"
  - "apps/web/app/estilos/finanzas.css"
  - "apps/web/app/estilos/vidrio/estados.css"
  - "apps/web/lib/estados-*"
---

## Pantallas de Finanzas (regla — ADR-0195, «Ajuste de diseño al spike», Felipe 2026-09-24)

**Desde el 2026-10-23 Finanzas se rediseña con «El telar de Finanzas» (ADR-0493, `docs/maquetas/finanzas-telar-2026-10/`):** la mesa de
mando común (`app/(app)/finanzas/layout.tsx`) lleva la sede y el mes de todo Finanzas en la URL (`?sede=`, `?mes=`; cada página los lee con
`sedeDeLaUrl`, nunca con un selector propio), y una pantalla rediseñada usa `<EncabezadoPagina>` con `<RespuestaTelar>`, `<Orillo>` y
`<DockTelar>` (`components/finanzas/telar/`). Lo que sigue abajo vale para lo que todavía no se rediseñó.

**Estados financieros (`/finanzas/reportes/*`) tiene su propio vidrio por decisión de Felipe (ADR-0611, 2026-11-05; camino «A · El informe», 2026-11-06):** sin tela de fondo, cifras en Inter, cuatro pestañas fijas y un calendario con las fechas en la URL (`?mes=`,
`?desde=&hasta=`, `lib/estados-periodo.ts`). Cada estado se arma con `<EstadoEnInforme>`: a la izquierda el informe fila por fila (`InformeEstado`, `lib/estados-informe.ts`: columnas de antes, peso de cada fila, la fila que se abre con su detalle y «Nombres del contador»), a la derecha la cifra, la frase, el chip y un gráfico; el Balance que no cuadra se dice en una línea: una cuenta que difiere sale con aviso, y solo si falla el arranque, el diario o la ecuación no se dibuja (ADR-0619). Lo demás va plegado en «Ver más». Sus estilos viven en `app/estilos/vidrio/estados.css` y no salen de esta
pantalla (`lib/estados-movimiento.test.ts`): llevarlos al resto del ERP es otra decisión, anotada en el backlog de la rama.

**Toda pantalla de Finanzas (Gastos, Configuración, y las que vienen: Cuentas y dinero, Reportes, Impuestos, Cierre) se
dibuja como el spike aprobado (`docs/maquetas/finanzas-2026-09/`) y se arma con sus piezas**: `components/finanzas/kit.tsx`
(tarjeta con herramientas + tabla + pie, campos en caja, opciones en tarjeta; sus pestañas, desde el 2026-10-06, son la pestaña de vista
del sistema —el vidrio en mayúsculas—, por decisión de Felipe en `/unificar`, ADR-0358) y `app/estilos/finanzas.css`
(clases `fin-*`), los modales con `<Modal variante="hoja">`. No se reinventa una tabla ni un campo con medidas sueltas.
**Antes de dar una pantalla por terminada, se captura al mismo ancho que el spike y se comparan las dos imágenes**: si no
se parecen, no está terminada. Lo que se aparta del spike a propósito queda escrito en el ADR.
