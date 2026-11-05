# Finanzas v3 · Cuentas y dinero (2026-10-23)

Lo pidió Felipe el 23 de octubre: «todo está muy básico y poco entendible, hay filtros que no funcionan bien, no hay botones para
regresar en ciertas vistas; tiene que estar lo más ordenado posible, siempre dando la opción de separar por sede».

Esta carpeta tiene el diagnóstico de **Finanzas ▸ Cuentas y dinero** (`/finanzas/dinero` y sus pestañas `efectivo`, `por-pagar` y
`conciliacion`) y **tres maquetas tocables** para elegir mirando. No se tocó código de la app, ni migraciones, ni producción.

- Publicada para mirar: https://claude.ai/artifact/1capb59x3wcZynHfJaqSx4 (privada de Felipe).
- `index.html`: las tres direcciones, con el selector **A · B · C** (también `#a`, `#b`, `#c`) y el botón de tema claro/oscuro.
  La sede y la vista viven en la URL (`?sede=tru&vista=debes`), igual que en la maqueta de Cierre.
- `datos.js`: las cifras de ejemplo, en un solo lugar. Es la historia de la v2 (jueves 15 de octubre de 2026) con cada sol
  asignado a una sede. Si una suma deja de cuadrar, la consola lo avisa.
- `base.css` y `base.js`: copiados de `finanzas-v2-2026-10/` sin cambios.

## Cómo se auditó

Se usó el ERP local (`localhost`, con la sesión de líder en Tienda Lima, sobre `main` en `cd7263fcc`), a 1440 px y a 375 px. Se
recorrió cada pestaña con «Ver» en una sede y en «Todas las tiendas», y después se leyó el código de cada cosa que se vio.

La base local tiene Tienda Lima, Tienda Trujillo y el Taller (Arequipa no está), ningún banco, 2 facturas por pagar y ningún
movimiento entre cuentas. Por eso la conciliación y los bancos se auditaron en el código, no en pantalla.

## Hallazgos, de más grave a menos

### Graves: la cifra dice algo que no es

1. **«¿Me alcanza?» mezcla dos alcances cuando se mira una sede.**
   - **Dónde:** `app/(app)/finanzas/dinero/page.tsx:24` y `:45`.
   - **Qué pasa:** la proyección es siempre de CAYLA entera (`getProyeccion(6)` no recibe `ver`), pero `alcanzaPulso(…, tienes.guardado)`
     le suma lo guardado de la sede que se mira, y nada lo avisa.
   - **Ejemplo en local, con «Ver: Tienda Lima»:** arriba dice «tienes S/ 529» y al lado, «la semana 24–30 oct bajas a −S/ 41,888…
     1 día de caja». Es la proyección de toda la empresa.
   - **Lo resuelven las tres maquetas:** con una sede elegida, «¿Me alcanza?» lleva el chip «de CAYLA entera» y dice qué puede aportar
     esa sede, por ejemplo depositar su caja fuerte.
2. **Las cifras de Por pagar no filtran.**
   - **Dónde:** `components/finanzas/PorPagarConsolidado.tsx:68-80`.
   - **Qué pasa:** las cuatro `TarjetaCifra` (Vencidas, Esta semana, La próxima, Más adelante) no llevan `href` ni `onClick`. Se ven
     como las de Compras, que sí filtran, pero tocarlas no hace nada.
   - **Qué falta además:** la lista no tiene buscador ni filtro de tipo o proveedor. Es el «filtros que no funcionan» que nombró Felipe.
3. **El selector «Ver» no es el mismo en las cuatro pestañas.**
   - **Qué pasa:**
     - Cuentas y Efectivo ofrecen «Todas las tiendas» y cada sede (`CuentasDinero.tsx:148-153`).
     - Por pagar agrega «De la empresa» (`PorPagarAcciones.tsx:28-36`).
     - Conciliación lo cambia por un chip «CAYLA entera» y siempre lee «todas» (`conciliacion/page.tsx:16`, `CuentasDinero.tsx:141-144`).
   - **Por qué importa:** al cambiar de pestaña, la sede elegida se conserva o se pierde según la pestaña. Las cuentas que no son de
     líder ven un chip con su tienda y no pueden elegir.
4. **No se puede ver el reparto por sede: se elige una o se ven todas mezcladas.**
   - **Qué pasa:**
     - Con «Todas las tiendas», el número grande es uno solo (`DineroPulso.tsx:26-31`).
     - Las cuentas se agrupan por tipo, no por sede (`agruparCuentas`, `CuentasDinero.tsx:259-288`), así que los cajones de todas las
       tiendas salen juntos.
     - Por pagar tiene una columna «Unidad», pero ningún total por sede.
   - **Lo que no se puede responder:** «¿cuánta plata tiene Trujillo?» y «¿cuánto debe el Taller?».

### Medios: no se sabe volver ni dónde se está

5. **La cabecera de Finanzas no tiene dónde poner la flecha de vuelta.**
   - **Dónde:** `CabeceraPantalla` (`components/ui/CabeceraPantalla.tsx:29-39`) no recibe `volver`, a diferencia de `EncabezadoPagina`.
   - **Desde dónde se llega sin vuelta:**
     - Resumen («Ver lo que debes» y «Pagar»: `lib/resumen-finanzas-reglas.ts:589` y `:605`).
     - Impuestos (`components/ImpuestosPanel.tsx:221`).
     - Qué tan seguro es el número (`lib/finanzas-confianza.ts:160` y `:228`).
     - Balance (`lib/balance-reglas.ts:221`).
   - **Qué pasa:** se aterriza en Cuentas y dinero sin forma de volver al lugar de origen.
6. **La conciliación de otro banco no tiene vuelta.**
   - **Dónde:** `CuentasDinero.tsx:625` y `:814-829`.
   - **Qué pasa:** `?cuenta=` y `?hasta=` cambian el banco y la fecha que se miran. Los demás bancos aparecen como tarjetas sueltas al
     pie de la página.
   - **Por qué importa:** es una vista interna, pero no lo dice ni tiene flecha. Tampoco hay una sola pieza para elegir el banco.
7. **El título no es el nombre del menú y la pregunta se repite.**
   - **Dónde:** la cabecera dice «¿Dónde está la plata?» (`CabeceraDinero.tsx:42`) y, justo debajo, el pulso dice «¿Dónde está mi
     plata?» (`DineroPulso.tsx:21-23`).
   - **Qué dice la regla:** el título es el nombre del menú (ADR-0220, `titulo-pagina`).
   - **Por qué importa:** en Por pagar y en Conciliación, «¿Dónde está la plata?» no responde lo que se ve.
8. **Jerga contable a la vista.**
   - **Dónde:** cada grupo dice «· cuenta 101 / 104 / 105 / 451» (`CuentasDinero.tsx:262`, `lib/cuentas-dinero-reglas.ts:29-34`).
   - **Por qué importa:** la colaboradora no sabe qué es «cuenta 101». Es dato para el contador y cabe en un «¿Por qué?» o en Reportes.

### Leves: cosas que confunden

9. **El efectivo no tiene total ni muestra la caja fuerte.**
   - **Dónde:** `CuentasDinero.tsx:501-565`.
   - **Qué pasa:**
     - La tabla no suma.
     - La caja fuerte de cada sede vive en otra pestaña (Cuentas).
     - El Taller sale como «cerrada» con cinco rayas, cuando en realidad no tiene caja: tiene un fondo fijo.
10. **«Movimientos entre cuentas» no tiene filtros y corta en 150.**
    - **Dónde:** `CuentasDinero.tsx:400-464`; el tope está en `lib/cuentas-dinero.ts:56`.
    - **Qué pasa:** no se puede filtrar por tipo ni por sede, y no tiene paginación.
11. **Plural roto.**
    - **Dónde:** `CuentasDinero.tsx:387`.
    - **Ejemplo:** «1 cobros de tiendas sin cuenta asignada (S/ 54.80)», visto en local con «Todas las tiendas».
12. **Una conciliación vacía no lleva a ninguna parte.**
    - **Dónde:** `CuentasDinero.tsx:616-618`.
    - **Qué pasa:** el vacío «No hay bancos que conciliar» dice dónde agregarlos, pero no tiene el botón que lleva ahí (regla `vacio`).
13. **A 375 px, Por pagar ocupa mucho antes de la lista.**
    - **Qué pasa:** las cuatro cifras se apilan una por fila, unos 520 px antes de la lista, aunque dos estén en S/ 0. Las pestañas se
      cortan («…POR TIENDA», «CONCILIACIÓ»).
14. **Guía de foco pendiente en las cuatro pantallas.**
    - **Dónde:** `lib/guia-de-foco-pantallas.ts:96-99`.
    - **Nota:** la guía interactiva ya existe (`lib/guias/registro.ts:316-319`) y habrá que ponerla al día con el rediseño.

## Las tres direcciones

Las tres tienen lo que se pidió:
- La fila de sedes bajo la cabecera: «Todas las sedes» y cada sede con su cifra. En esta fila, la cifra cambia según la vista: lo que
  tiene, lo que debe, el cajón ahora o lo que falta cuadrar.
- Los filtros puestos a la vista: cada uno en tinta con su ✕, y «Limpiar todo». La sede elegida también es un filtro puesto.
- La flecha de vuelta en toda vista interna, en la línea de sede.
- El orden del ERP: cabecera, cifras, una tarjeta con filtros y tabla, y la nota.
- El título «Cuentas y dinero», sin «cuenta 101» a la vista, y la nota de que los bancos y la tarjeta son de CAYLA entera.

| | Camino | La idea | Qué resuelve |
|---|---|---|---|
| **A** | **La respuesta, sede por sede** | Es la v2 «La respuesta», que Felipe ya eligió, ahora partida por sede. El número grande lleva debajo el reparto por sede, y cada línea abre esa sede. Abajo van cuatro preguntas: ¿me alcanza?, ¿qué debes?, ¿cuánto hay en los cajones ahora? y ¿cuadra con el banco? Cada pregunta abre su vista con la flecha de vuelta. | 1 · 4 · 5 · 6 · 7 · 8 · 9 |
| **B** | **Pestañas ordenadas** | Mantiene las cuatro pestañas de hoy, pero las ordena. Las cifras filtran la tabla, la sede se conserva al cambiar de pestaña y cada pestaña dice en su globito lo que pide atención. Una cuenta se abre en su propia vista, con su vuelta. Es el cambio más chico sobre lo que ya existe. | 1 · 2 · 3 · 4 · 6 · 7 · 8 · 9 · 10 |
| **C** | **El mapa** | Una tabla de sede por lugar. Cada sede es una fila: cajón, caja fuerte, en camino, bancos, lo que tiene, lo que debe y lo que le queda. Tocar una sede abre su ficha, con todo lo suyo en una lista: cuentas, por pagar, movimientos, cierres y lo que falta cuadrar. Desde la ficha se pasa a la sede de al lado con las flechas. | 1 · 3 · 4 · 5 · 9 · 10 |

Todo en las maquetas se puede tocar: las sedes, las cifras que filtran, los filtros puestos, las filas, «Sí, es esto» en la
conciliación y las flechas de vuelta. Nada se guarda. A 375 px no hay scroll lateral: la fila de sedes se parte en varias líneas y
cada fila de una tabla se dibuja como una ficha.

## Lo que pediría a la base (decisiones de Felipe)

Lo que **ya trae sede**, sin tocar nada:
- `cuentas_dinero.ubicacion_id` del cajón y de la caja fuerte.
- `movimientos_dinero.ubicacion_id`.
- `cajas.ubicacion_id`.
- `compras.ubicacion_gestion_id`: quién pidió la factura, con su reparto en `compra_parte_por_tienda`.
- `gastos.ubicacion_id` y `compra_pagos.ubicacion_id`.
- Las lecturas `fn_cuentas_dinero_saldos`, `fn_efectivo_por_tienda` y `fn_por_pagar_consolidado` ya reciben la sede.

Con eso alcanza para todo lo de las maquetas, salvo estas cuatro cosas:

- **D1 · ¿De qué sede es lo «en camino» de las máquinas?** Hoy la cuenta «por depositar» es una por máquina (Izipay, Vendemás) y
  no tiene sede. Las maquetas la parten por la sede que cobró (Izipay · Trujillo, Izipay · Arequipa), sumando los cobros de cada
  tienda. Hace falta una lectura nueva. La alternativa es dejarla en «CAYLA entera».
- **D2 · ¿De qué sede es el efectivo que se entregó al líder?** La cuenta `por_rendir` no tiene sede. Puede quedar en CAYLA entera
  o conservar la sede del cierre que la entregó, hasta que se deposite.
- **D3 · Lo que debe cada sede.** Hoy una factura cuenta entera para la sede que la pidió (decisión 45, ADR-0387). Para dibujar el
  reparto, la fila de `fn_por_pagar_consolidado` necesitaría el id de la sede, no solo el texto `unidades`; es un cambio chico en
  esa función. La decisión de negocio es si se sigue contando la factura entera para quien la pidió, como en las maquetas, o se
  parte por la parte de cada tienda.
- **D4 · Conciliación por sede.** Se puede derivar de `movimientos_dinero.ubicacion_id`: el depósito de la caja fuerte de Trujillo es
  de Trujillo. Hay que decidir si se muestra así o si la conciliación sigue siendo solo de CAYLA entera.

**No se toca** la proyección («¿Me alcanza?» lee `fn_flujo_*`): es de otra sesión (ADR-0433). Las maquetas solo la rotulan como de
CAYLA entera.

## Después de que Felipe elija

Se construye con `/construir` en esta misma rama, pieza por pieza:
1. `volver` en `CabeceraPantalla`.
2. La fila de sedes como una sola pieza, compartida con las demás pantallas de Finanzas (ver la nota de la sesión de Cierre).
3. Las cifras que filtran y los filtros puestos.
4. Cada pestaña o vista.

Lo que necesite base espera las decisiones D1 a D4.
