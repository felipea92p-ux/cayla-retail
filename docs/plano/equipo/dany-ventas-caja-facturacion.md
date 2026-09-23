# Dany — Colibrí (Ventas y caja) + Cuervo (Facturación SUNAT)

> Extraído del plano maestro (143 decisiones, `docs/plano/00-ACTA-24-DECISIONES.md` y
> `02` a `05-ACTA-SESION-*.md`). Cada línea es una decisión ya tomada por Felipe — no es
> una propuesta, es lo que hay que construir o ya está construido.

## Decisiones

**PL-28** — El saldo/vale de clienta se construye aparte de la nota de crédito SUNAT: un saldo por clienta, con o sin comprobante, canjeable en cualquier compra futura.
  *Pendiente:* Construir la tabla y el flujo del saldo de clienta — no existe todavía.

**PL-29** — Anular una venta exige mismo día calendario (hora Lima) y caja abierta, comparando ventas.created_at, sin necesitar columna nueva en cajas.
  *Pendiente:* Agregar esa comparación de fecha en anular_venta (una línea de código).

**PL-35** — Interbank y BCP son las 2 cuentas bancarias reales, destino de todo cobro electrónico (POS/Yape/Plin/transferencias).
  *Pendiente:* Felipe define cuál es Operativa y cuál Reserva y cómo entran las 'otras cuentas' — sin fecha, no te bloquea a ti.

**PL-37** — Cada tienda tiene un tope de efectivo que Felipe define, con aviso cuando el efectivo esperado del día lo supera.

**PL-40** — La caja offline se construye: abrir y cerrar caja sin internet, extendiendo el mismo mecanismo que ya protege la venta (ADR-0036).
  *Pendiente:* Construirla — el mecanismo base existe, pero caja offline en sí todavía no.

**PL-49** — Los 4 nombres del módulo de venta quedan como están: código en id/ruta, negocio en 'Ventas'/'Punto de Venta'.

**PL-50** — 'Comprobante' y 'Nota de crédito' quedan exclusivos de Ventas (retail.comprobantes, la única tabla que de verdad toca SUNAT); Compras pasa a llamarse 'Factura de proveedor'/'Nota de crédito de proveedor' y el Taller 'Factura de insumos'.
  *Pendiente:* Corregir apps/web/lib/menu.ts:163,187 y las menciones en ADR-0111/0142/BACKLOG.

**PL-61** — ADR-0119 — el candado de ventas/devoluciones, el hueco de seguridad más grave de toda la auditoría — se trae a main y se aplica esta semana, antes de que TRU opere con datos reales.
  *Pendiente:* Traer y aplicar ADR-0119 esta semana (mismo trabajo que el paquete PL-84/85).

**PL-78** — La venta rechaza cualquier stock que salga de la sububicación Cuarentena.
  *Pendiente:* Construir ese candado — no existe todavía.

**PL-79** — La clienta duplicada entre tiendas se cierra con un índice único sobre su documento de identidad.
  *Pendiente:* Construir ese índice único — no existe todavía.

**PL-84** — El corazón de la venta (ventas/venta_items/venta_anulacion_items) todavía acepta escritura directa desde el navegador — se rescata el arreglo ya existente (ADR-0119), se re-ensaya y se pega esta semana.
  *Pendiente:* Tu pendiente más urgente: pegar ADR-0119 en producción esta semana. Ya hay avance — devoluciones/cambios/prendas dañadas los cerró otra sesión (commit 520915d0, ADR-0166, rama claude/pantalla-ventas-module-bf9b1b) — falta fusionarla a main.

**PL-85** — clientas, conteos y lotes tienen el mismo hueco de escritura directa que el corazón de la venta, y se cierran en el mismo paquete.
  *Pendiente:* Se cierra junto con PL-84, en el mismo paquete.

**PL-86** — Tú eres la segunda pegadora de SQL a producción, junto a Felipe.
  *Pendiente:* Ninguna construcción — es una responsabilidad que asumes desde ahora.

**PL-87** — El checklist de SQL a producción (ensayo en Postgres desechable + sonda de solo lectura + registro de qué y cuándo) es obligatorio para Felipe y para ti por igual.

**PL-91** — El tope de descuento queda en: Integrante hasta 5%, Líder de equipo hasta 15%, y una categoría aparte 'liquidación' sin tope pero con motivo obligatorio.
  *Pendiente:* Construir ese control en el flujo de venta — no existe todavía.

**PL-92** — El hueco de V1 donde una colaboradora dada de baja seguía pudiendo vender ya está cerrado en V2: fn_es_lider() y fn_ubicacion_actual_persona() ya filtran estado='activo'.
  *Pendiente:* Solo falta corregir 05-SEGURIDAD.md, que todavía lo lista como pendiente — no hay nada que construir en código.

**PL-94/95** — Como pegadora de SQL de tu propio módulo (Ventas), también ves el negocio completo como Admin — decisión explícita de Felipe, no una separación técnica. Toda aplicación de SQL queda registrada dos veces: en la tabla sql_aplicado y en el PR de GitHub.

**PL-105** — La prueba en ancho de celular por PR es obligatoria para Vender/Cambios/Devoluciones — Caja y Almacén siguen siendo de escritorio.
  *Pendiente:* Exigirla en cada PR que toque esas pantallas.

**PL-109** — La auditoría de pantallas avanza por relevancia de dinero y stock, empezando por Vender, Caja y Compras.

**PL-110** — Los 3 análisis de pantalla en ramas sin fusionar (Caja, historial de ventas, uno más) se rescatan y se verifican a fondo contra el código de hoy antes de fusionarlos.
  *Pendiente:* Rescatar y re-verificar esas 3 ramas antes de fusionarlas.

**PL-113** — El reintento automático a SUNAT vía Lucode corre con un trabajo programado (Vercel Cron) cada 5-10 minutos sobre todo comprobante 'pendiente', apoyado en el token de idempotencia que ya existe; si pasan varias horas sin transmitir, deja de reintentar solo y dispara el aviso al líder.
  *Pendiente:* Construir el Vercel Cron.

**PL-114** — El aviso al líder de equipo por un comprobante atascado va dentro del sistema (banner/campanita al entrar) — el mismo patrón que ya usan las campañas de descuento.
  *Pendiente:* Construir el banner, junto con el Cron de PL-113.

**PL-115** — El alta del PSE ante SUNAT ya está confirmada y funcionando — no hay que bloquear boletas reales por eso. Si Lucode falla, Alegra sigue disponible como respaldo hasta que el sistema quede resuelto.

**PL-116** — Las 2 boletas con número quemado ante SUNAT (S/655.50 y S/185.30) quedan como están — son pruebas, no se transmiten ni se liberan; Felipe las limpia cuando corresponda.

**PL-117** — La nota de débito de Lucode se prueba contra el ambiente de pruebas esta semana, por las dudas, aunque CAYLA no la usa hoy.
  *Pendiente:* Correr esa prueba esta semana.

**PL-118** — El timeout de 15 segundos de Lucode en plena venta muestra un mensaje claro: 'Lucode no respondió, la venta ya se guardó, transmite luego desde Facturación'.

**PL-119** — La resolución de autorización del PSE se completa en el ticket antes del primer ticket real.
  *Pendiente:* Completar esa variable — lo hace Felipe directamente.

**PL-120** — Si Dynamic o Supabase caen por completo, se acepta vender en papel/manual hasta que vuelvan — cada líder de equipo tiene que saber que ese plan B existe.
  *Pendiente:* Escribir el plan B de papel en el manual de cada sede — hoy no está escrito en ningún lado.

**PL-121** — Cuando Dynamic no responde, los nombres en Caja/Compras degradan a 'integrante' genérico en vez de caerse la pantalla completa.

**PL-126** — Si Alegra cae en pleno cobro, esa venta la emite retail directamente sobre la marcha, sin esperar a que Alegra vuelva.

**PL-127** — Pago con tarjeta/POS y canal online quedan investigándose bajo ti (Colibrí), sin construir nada todavía — tarjeta es extensión natural de Ventas, canal online es más grande y sumará a Tucán si avanza en serio.
  *Pendiente:* Investigar ambos frentes (sin construir aún).


## Tus pendientes, en orden

1. Pegar ADR-0119 en producción esta semana: cierra el hueco de escritura directa en ventas, venta_items, venta_anulacion_items, clientas, conteos y lotes (PL-61, PL-84, PL-85) — es tu pendiente más urgente. Fusionar también la rama que ya cierra devoluciones/cambios/prendas dañadas (commit 520915d0, ADR-0166, rama claude/pantalla-ventas-module-bf9b1b).
2. Construir el tope de descuento en el flujo de venta: Integrante 5%, Líder 15%, 'liquidación' sin tope con motivo obligatorio (PL-91).
3. Construir el candado de venta desde Cuarentena, para que no se pueda vender stock que salga de ahí (PL-78).
4. Construir el índice único de clienta duplicada por documento de identidad (PL-79).
5. Construir el saldo/vale de clienta, aparte de la nota de crédito SUNAT (PL-28).
6. Construir caja offline: abrir y cerrar caja sin internet (PL-40).
7. Construir el Vercel Cron de reintento a SUNAT y el banner de aviso al líder cuando un comprobante queda atascado (PL-113/114).
8. Probar la nota de débito de Lucode contra el ambiente de pruebas esta semana (PL-117).
9. Corregir apps/web/lib/menu.ts:163,187 y las menciones en ADR-0111/0142/BACKLOG para que 'Comprobante'/'Nota de crédito' sean exclusivos de Ventas (PL-50).
10. Agregar la línea de comparación de fecha en anular_venta (PL-29).
11. Exigir la prueba de ancho de celular en cada PR que toque Vender/Cambios/Devoluciones (PL-105).
12. Rescatar y re-verificar las 3 ramas de análisis de pantalla sin fusionar — Caja, historial de ventas, una más — antes de fusionarlas (PL-110).
13. Escribir el plan B de venta en papel en el manual de cada sede, para cuando caiga Dynamic o Supabase (PL-120).
14. Aplicar el checklist de SQL (ensayo + sonda + registro) cada vez que pegues SQL en producción, como segunda pegadora junto a Felipe (PL-86/87).
15. Corregir 05-SEGURIDAD.md, que todavía lista como pendiente la baja de acceso — ya está cerrada en código (PL-92).
16. Investigar, sin construir todavía, pago con tarjeta/POS y canal online (PL-127).
