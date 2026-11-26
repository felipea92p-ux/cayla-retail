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
