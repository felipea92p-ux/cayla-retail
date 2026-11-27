# ADR-0704 — Compras reestructurado: Compradores y Todas las compras, sin pestañas

**Fecha:** 2026-11-26 · **Estado:** aceptado por Felipe (maqueta aprobada el mismo día: «Sí, sigamos»; plan aprobado: «Sí, construye»). La
migración `20261126152000_compras_compradores_y_todas_las_compras.sql` **está en producción desde el 2026-11-26** (pegada por Claude con el OK de
Felipe, antes de fusionar; las cinco funciones verificadas por md5 contra el archivo).

## Contexto

Felipe (2026-11-26): «compras/historial de compras es muy confuso, una persona que ingresa allí se pierde; si quiero ver las compras que están
haciendo las personas que tienen dinero no se puede… hay que reestructurarlo para dejar solo cosas realmente importantes».

Medido en producción ese día (solo lectura):

- Lo que se compra desde «Mis compras» (`compra_papeles`): **54 compras, S/ 30,777**, de 5 personas en 10 rondas; 4 rondas abiertas.
- Una de esas compras **recién llega al Historial (`compras`) cuando Compras la revisa** (`completar_papel_compra` crea su comprobante, con
  `token_cliente` = el id del papel). Había **21 revisadas y 33 ya enviadas a la tienda que no se veían en ninguna lista**: solo en la bandeja
  «Revisar compras», como trabajo pendiente, sin decir quién gastó cuánto.
- Los **36 comprobantes del Historial estaban todos pagados**: la pestaña «Por pagar» siempre estaba en cero.
- El Historial traía 4 cifras, 5 píldoras de estado, 8 filtros, 2 órdenes y 7 columnas; «Revisar compras» y «Por pagar» eran pestañas suyas.
- Rendiciones por aprobar: 0. Entregas de plata: 26 (anularlas sí se usa).

## Decisión

1. **El menú de Compras queda en cinco filas, sin pestañas:** Compradores (nueva, la portada), Todas las compras (antes Historial, misma ruta),
   Mis compras, Plan de campaña y Proveedores.
2. **Compradores** (`/compras/compradores`, módulo `fondos`, que en Roles y accesos pasa a llamarse «Compradores»): quién está comprando con
   plata de CAYLA y en qué la gastó. Tres cifras, una tarjeta por persona con su ronda abierta (le diste · gastó · le queda o «no cuadra»,
   un aviso y sus últimas compras) y las rondas cerradas de 60 días. Las prendas por definir y las rendiciones por aprobar (cuando hay) suben aquí.
3. **El detalle de cada persona** (`/compras/compradores/[personaId]`): su cuenta de la ronda, **lo que espera revisión** —la bandeja de
   «Revisar compras» de siempre, filtrada a esa persona—, todas sus compras con su papel, envío y estado, su plata entregada y devuelta (con
   «Anular», «Registrar devolución» y «Registrar su pago») y sus otras rondas. Reemplaza a «Revisar compras» y a las hojas «Quién tiene
   plata» y «Entregas y devoluciones»; `/compras/fondos` redirige a Compradores.
4. **Todas las compras** (`/compras`, módulo `facturas_compra`, renombrado igual): un solo libro. Una compra de «Mis compras» **entra desde que
   sale en un envío** (Felipe: «luego de hacer el envío, ya que si no la persona de compras lo puede editar»); revisada, sigue en la misma fila
   con su comprobante. Lo que registró la oficina entra como fila propia. Arriba solo buscar, el mes y la persona, y «Descargar el mes».
5. **Si la plata no cuadra, solo se avisa** (Felipe): «Pagó S/ X más de lo que le diste» o «sin plata registrada». No se pregunta ni se
   calcula lo que CAYLA le debe.
6. **Rondas olvidadas: a los 14 días sin compras se avisa** (Felipe), nadie la cierra sola. Compras puede cerrar la de otra persona **solo si
   no tiene nada adentro** (`cerrar_ronda_sin_movimiento`: ni plata, ni compras, ni gastos, ni plata en la mano): no hay plata que decidir.
   Con algo adentro, la cierra su dueña desde «Mis compras», porque al cerrar decide qué hace con lo que le queda.
7. **Por pagar** deja el menú y las pestañas: queda su pantalla, con su cabecera y la vuelta a Todas las compras, para la compra que se paga después.

## Qué se fue

La cabecera de pestañas (`CabeceraHistorialCompras`, `CabeceraDeCompras`, `lib/compras-pestanas*`), la página «Revisar compras», las hojas
«Quién tiene plata» y «Entregas y devoluciones» (`HojaDeFondos`), las cifras de IGV y del mes anterior, las cinco píldoras, el orden por
vencimiento, seis de los ocho filtros, el N.° de documento y el RUC en la lista (siguen en el detalle), y `ComprobantesListaFilas`/`Vacia`.

## Base

`20261126152000` (una parte, sin políticas): `fn_compradores()` y `fn_todas_las_compras(desde, hasta, persona, busqueda, limite)` —lecturas
`security definer` que piden su módulo— con sus ayudantes `fn_compra_de_papel` y `fn_envios_de_papel` (sin `grant`); `cerrar_ronda_sin_movimiento`
(firma con `fn_actor_persona_id(true)`, clave sin combo `ronda_cerrar_sin_movimiento`); y el nombre nuevo de los dos módulos. Prueba:
`scripts/pruebas/compras_compradores.mjs` (8 casos). Para volver: el `git revert` del PR; en la base, las funciones nuevas pueden quedarse
(nadie más las llama) y los nombres se devuelven con dos `update retail.modulos`.

## Lo que cuesta

- Quien tenía solo «Revisar compras» ve ahora Compradores, no la lista de todas las compras: para verla necesita `facturas_compra`.
- La revisión ya no es una sola cola de todas las personas: se revisa persona por persona (la portada dice cuántas esperan y la tarjeta, de quién).
- «Todas las compras» lee por mes (hasta 300 filas por lado): suficiente para 3 tiendas; si un mes pasara de eso, se pagina.

## Actualización 2026-11-26 (b): la cuenta de cada persona sale de su fondo

**Qué pasó.** El mismo día de la publicación, Felipe preguntó por qué Bhekam salía con «Le diste S/ 0 · Le queda S/ 0» y por qué Claudia, que
tenía plata, no aparecía. En producción Bhekam tenía S/ 13,800 y Claudia S/ 4,967 en su fondo. Dos causas, las dos de lectura:

1. «Le diste» salía de `fn_ronda_compras_cuenta`, que solo suma la plata que la persona **anotó dentro de su ronda**
   (`fondo_plata_anotada.ronda_id`). Lo que la oficina entrega con «Entregar plata» va directo a su fondo (`movimientos_dinero`,
   `entrega_fondo`) y no deja fila ahí. Tampoco contaba lo anotado segundos antes de abrir la ronda ni lo que quedó de la anterior. De ahí
   salían también dos avisos falsos: «pagó S/ 1,497.10 sin plata registrada» (Catherine, con S/ 11,086 entregados) y «pagó S/ 2,941 más de lo
   que le diste» (Lizzelott).
2. `fn_compradores` recorre `compra_rondas`: quien no abrió su ronda no tenía tarjeta, y la hoja «Quién tiene plata» ya no existía.

**Decisión.** Una sola fuente de verdad (principio 4): la plata de una persona es la de su fondo, y la pantalla hace la cuenta igual que
«Mis compras» (`resumenRonda`), despejando desde lo que tiene hoy:

- **Le queda** = `fn_mi_plata_tiene(persona)`, la misma cifra que ella ve en «Mis compras».
- **Gastó** = lo de su ronda (compras pagadas más gastos), como antes.
- **Le diste** = le queda + gastó. Incluye lo que traía al abrir la ronda: es lo que tuvo para comprar.
- Una ronda **cerrada** conserva su cuaderno (`tiene` nulo).
- **Quien tiene plata a favor y no tiene ronda abierta** sale en un grupo propio, «Con plata, sin ronda abierta», con lo que tiene y su última
  entrega. Lo que CAYLA le debe a alguien ya sale en su ronda cerrada: ahí no se repite.
- «Cerrar su ronda» desde Compras ya no se ofrece si la persona tiene plata en la mano (la base lo rechazaba igual).

**Base.** `20261126223000` (una parte, sin políticas, solo `create or replace function`): `fn_compradores()` suma `tiene` a cada ronda abierta y
nace `fn_compradores_sin_ronda()` (módulo `fondos`). Prueba: `scripts/pruebas/compras_compradores_plata.mjs` (5 casos). La web vieja ignora el
dato nuevo y la nueva, sin la migración, sigue con la cuenta de antes y sin el grupo: no importa cuál llegue primero.

**Lo que cuesta.** «Le diste» ya no es «lo anotado en esta ronda» sino «lo que tuvo para comprar»: si alguien arrastra plata de una ronda
anterior, entra ahí. Cada tarjeta abierta llama a `fn_mi_plata_tiene`, que lee el libro de dinero una vez por persona: con las 4 a 6 personas
que compran hoy no pesa; si fueran decenas, se lee el libro una sola vez (como `fn_fondos`). «Mis compras» sigue llamando «Te dieron» solo a
lo anotado en la ronda y «tenías» a lo demás: no se tocó.

## Actualización 2026-11-26 (c): Compradores es una tabla de «quién tiene plata», y el detalle va en dos columnas

**Qué pidió Felipe.** Con los números ya corregidos: «la pantalla puede mejorar más, información precisa, que realmente sirva», y el detalle de
cada persona «distribuido de manera profesional». Se le mostró en imágenes, con los datos reales del día, y dijo «Sí, constrúyela». Reemplaza la
tarjeta por persona de la decisión 2 de este ADR.

**Compradores.**
- **Una sola tabla, «Quién tiene plata»:** una fila por persona —la que tiene su ronda abierta y la que tiene plata sin haberla abierto, juntas—,
  primero quien más tiene en la mano. Columnas: le diste, gastó (con la parte de su plata ya usada), le queda, sus compras y prendas, y «Qué
  pide»: una etiqueta por lo que toca hacer (por revisar, falta pagar, ronda quieta, cerrar su ronda, sin abrir su ronda) o «Al día». Al pie, el
  total. Un cero va en tono tenue: no compite con las cifras que dicen algo.
- **Cuatro cifras:** «Plata en la calle» (lo que suman las manos de la gente; es igual al total de «Le queda»), lo gastado en el mes con cuántas
  compras y de cuántas personas, lo que espera revisión y de cuántas personas, y «Falta pagar» a proveedores. Se fue «Comprando ahora»: lo
  dice el contador del título de la tabla.
- **Rondas que ya cerraron**, como tabla (compras, prendas, gastó, cómo cerró y si le quedan papeles por revisar). Una ronda cerrada sin
  compras, sin gastos y sin plata no se lista.
- **En el celular** la tabla pasa sola a su forma de una columna (`corteDePlantilla`); ahí cada fila nombra sus tres cifras, porque no hay
  cabecera que las nombre.

**El detalle de una persona.** Cuatro cifras que dicen de dónde sale cada número («En 3 entregas, la última el 13/11»; la barra de lo usado;
lo que falta pagar). Debajo, dos columnas desde 1280 px: a la izquierda lo que se hace ahí (la bandeja de revisión y sus compras, con el número
del comprobante si ya se revisó y cuánto pagó si quedó debiendo); a la derecha su plata, entrega por entrega —sin repetir su nombre en cada
renglón, con su «Anular» de siempre— y sus otras rondas. «Todavía no anota compras» ya no se dice dos veces.

**Dónde vive.** Las cuentas, puras y con pruebas sobre los datos de producción de ese día, en `lib/compradores-reglas.ts`
(`filasDeCompradores`, `loQuePide`, `resumenDeCompradores`, `rondasCerradasConAlgo`, `entregasDe`, `faltaPagarDeCompra`, `pctUsado`); el dibujo,
en `components/compras/CompradoresVista.tsx` y `DetalleComprador.tsx`, con las piezas del sistema (`Tabla`, `TarjetaCifra`, `Chip`,
`BarraAvance`). `TarjetaComprador.tsx` se borró. Sin migración: usa lo que ya manda `20261126223000`.

**Lo que cuesta.** Se pierden de la portada las tres últimas compras de cada persona (están a un toque, en su detalle). «Qué pide» junta en
una celda lo que antes era un aviso con frase completa: es más corto y dice menos del porqué.

## Actualización 2026-11-26 (d): Compradores «como tu banco»

**Qué pasó.** Con la tabla de la actualización (c) ya en producción, Felipe dijo que no le agradaba: «se deben mostrar solo datos necesarios que
realmente aporten, con palabras precisas, sin tanto texto, e intuitiva». Se le mostraron dos direcciones con sus datos reales y eligió «como tu
banco»; después pidió pulirla, pensar en la escalabilidad («¿y cuando tenga muchas compras?») y un filtro de fechas como el de Rendimiento. Reemplaza
la tabla y el detalle en dos columnas de (c).

**Compradores.**
- **Una cifra arriba:** «En la calle», la plata de CAYLA en manos de la gente, y de cuántas personas. Se fueron las otras tres cifras.
- **Una línea por persona:** su nombre, UNA frase («Comprando hace 5 días», «Aún no abre su ronda», «Cerró su ronda el 17/11»; en ámbar solo «Sin
  comprar hace N días»), lo que le queda y una barra de cuánto gastó. Etiquetas solo para lo que se hace ahí: revisar, pagar lo que falta o cerrar
  una ronda vacía. Se fueron las columnas «Le diste», «Gastó» y «Compras», la fila de totales y la tabla de rondas cerradas.
- **Entra a la lista quien ya cerró su ronda y dejó compras por revisar o por pagar:** antes ese pendiente se contaba arriba sin decir de quién era.
- **A escala:** filtros «Por revisar» y «Falta pagar» (solo si hay a quién mostrar), buscador desde 9 personas, y quien no tiene plata ni
  pendientes plegado tras «Ver N más» cuando son más de tres.

**El detalle de una persona es su estado de cuenta.**
- A la izquierda, lo que le queda con su barra, lo que le diste y lo que gastó; y «Te toca», solo si hay algo que hacer.
- A la derecha, día por día: lo que le diste entra con «+» y lo que compró sale con «−». Una compra a medio pagar muestra lo PAGADO y dice cuánto
  falta. Cada día lleva su subtotal; pasadas las 12 líneas, solo los dos días más nuevos van abiertos y aparece el filtro «Pendiente».
- **Se mira por fechas, no por ronda:** el control de período de Gestión ▸ Rendimiento (Hoy · 7 días · Este mes · Rango, con su calendario), la
  misma pieza (`SegmentoDeslizante` + `RangoRendimiento`) y sus mismas reglas (`tramoDeUrl`: hasta 30 días, desde el 1.º del mes pasado). El
  período va en la URL. Se fue «Sus otras rondas».
- Las entregas, devoluciones y pagos de deuda son líneas del estado de cuenta, con su «Anular» y lo anulado tachado a la vista; se borró
  `MovimientosDeFondo.tsx`. La herramienta de revisión de siempre queda debajo, sin cambios, y «Revisar» baja hasta ella.

**Dónde vive.** Las cuentas, puras y con pruebas, en `lib/compradores-reglas.ts` (`filasDeCompradores`, `fraseDePersona`, `etiquetasDePersona`,
`filtrarCompradores`, `repartoDeLista`, `enLaCalle`, `lineasDeCuenta`, `diasDeCuenta`, `totalesDeCuenta`); lo que se toca, en dos piezas de
cliente: `ListaCompradores.tsx` y `EstadoDeCuenta.tsx`. Sin migración.

**Lo que cuesta.**
- De la portada ya no se ve lo gastado en el mes ni cuánto falta pagar en total; del detalle, el envío, el número de comprobante, el medio de
  pago y la cuenta de origen de cada entrega (su motivo sí queda). Felipe lo aceptó mirando la maqueta.
- Los otros gastos de una ronda (pasajes, bolsas) no vienen uno por uno de la base: están en el total «Gastó» del resumen, no en las líneas, así
  que la suma de las líneas puede ser menor que «Gastó» por ese monto. El resumen lo dice en su propia fila.
- El rango de fechas hereda los topes de Rendimiento (30 días, desde el mes pasado) y la lectura trae 60 días de rondas: para mirar más atrás hay
  que ampliar las dos cosas.
- **Escala de la base, anotada:** `fn_compradores` llama `fn_mi_plata_tiene` una vez por persona, y cada llamada lee el libro de dinero. Con 5 o 6
  compradores no pesa; con decenas, se lee el libro una sola vez (como `fn_fondos`). No se tocó aquí.
