# Investigación: IGV, costo y precio al recibir (2026-11-15)

Síntesis escrita ANTES de que Felipe decidiera «todas las prendas iguales, sin distinguir factura»: donde recomienda preguntar el papel por envío, manda la decisión de Felipe (ver el backlog de la rama).

SÍNTESIS DEL ESCÉPTICO: IGV, costo y precio al recibir mercadería
(Revisado contra origin/main 9d7744d7c. Volví a leer las líneas clave: margen-a-la-vista.ts:30-64, precio-propuesto-reglas.ts:34-40 y :115-121, recepcion-vitrina-reglas.ts:31, productos-vista.ts:72 y proveedor-prendas-reglas.ts:199. Coinciden con lo que reportaron las investigaciones.)

Descarté lo que no tiene evidencia:
- Siigo y Nubox: no hay fuente oficial, no se citan.
- El arrastre del saldo a favor (art. 25): no se verificó y queda solo como nota.
- La subida falsa de 18 % en «Antes → ahora» salió de leer el código, no se vio en el navegador. Queda como PLAUSIBLE.

======================================================================
A) CORRECCIÓN A FELIPE: en qué tiene razón y en qué no
======================================================================

TIENE RAZÓN en tres cosas:
1. El precio a la vista va siempre con IGV, y no es solo por comodidad: la Ley 29571, art. 4.1, exige que el precio exhibido incluya los tributos. Un precio sin IGV nunca debe ser un campo que se escribe ni la cifra principal.
2. El costo a la vista va con IGV, «como está en el papel». Así ya se escribe hoy. La base le quita el 18 % por su cuenta solo si hay factura (fn_costo_de_entrada, migración 20261106005000:8-10).
3. Lo que confunde hoy es real. Después del PR #1867, bajo dos campos escritos con IGV sale «Ganas S/ 23.32», una cifra sin IGV que la integrante no puede cuadrar. Peor todavía: en la misma hoja hay tres «ganas» distintas (Vitrina, LineaMargen y la propuesta de la IA).

NO TIENE RAZÓN (o hay que matizarlo) en una cosa: «no mezcles el IGV aquí» no puede querer decir que el sistema calcule sin el IGV. Si la pantalla muestra la resta simple, miente. Puede no nombrar el IGV, pero la cuenta tiene que tomarlo en cuenta. Además, lo que mueve el resultado no es el IGV del precio: es si la compra trajo factura o no.

Con números (IGV 18 %, ambos montos escritos con IGV):

Caso 1: costo 36, precio 70
  - A mano (lo que haría la integrante): S/ 34.00 · 48.6 %
  - Real con factura: S/ 28.81 · 48.6 %. El % es idéntico porque el 1,18 se cancela. Solo los soles se inflan.
  - Real con boleta, nota de venta o sin papel: S/ 23.32 · 39.3 %. El % sale inflado 9,3 puntos (0,18 × 36 ÷ 70).

Caso 2, margen bajo: costo 36, precio 51.90 (el piso que propone hoy la IA)
  - A mano: S/ 15.90 · 30.6 %
  - Con factura: S/ 13.47 · 30.6 %. Pasa.
  - Sin factura: S/ 7.98 · 18.2 %. Sale ámbar, y la propia propuesta de la IA queda «bajo 30 %».

Caso 3, pierde sin saberlo: costo 36, precio 40, sin factura
  - A mano: «gano S/ 4 · 10 %»
  - Real: pierde S/ 2.10 por prenda (−6 %). Hoy la base lo acepta, porque compara el precio con IGV contra el costo.

Regla que conviene que Felipe se lleve:
- Con factura, «todo con IGV» da el % correcto. Solo infla los soles, en 18 %.
- Sin factura, infla el % en 0,18 × costo ÷ precio: unos 7 a 10 puntos en ropa.
- Por eso la única pregunta que mueve el resultado es «¿qué papel te dieron?», y tiene que salir del comprobante, nunca del RUC (ver B).

Otras dos correcciones:
- En 2026 el 18 % es 15,5 % de IGV + 2,5 % de IPM (Ley 32387), no 16 + 2. La constante 1,18 sigue bien, pero ningún texto debe desglosarlo.
- El IGV de una factura nueva no vuelve en plata: se suma al saldo a favor que CAYLA ya arrastra (S/ 62,035 según la memoria; no verificado hoy). El margen contable está bien, pero la caja no ve ese 18 %. Eso le toca explicarlo a Finanzas, no a Recibir.

======================================================================
B) LO QUE DICEN LOS DATOS REALES (producción, solo agregados)
======================================================================

Aviso de muestra chica: compra_papeles solo tiene comprobantes desde el 28-oct (54 comprobantes, S/ 30,777).

¿Cuántos papeles son factura?
- Facturas: 14 de 54 (26 %), que son el 30 % del monto.
- Notas de venta: 33 (54 %). Boletas: 4. Sin comprobante: 3.
- La compra típica de CAYLA NO trae factura.

¿Funciona suponer «tiene RUC ⇒ trae factura»? Es una mala suposición.
- De los 33 comprobantes de proveedores con RUC, solo 12 son factura. La regla se equivoca en 21 de 33 (64 %), que son S/ 14,601 de S/ 21,737 (67 %).
- 13 de los 23 proveedores con RUC que nos vendieron nunca dieron factura. Con RUC 10 fueron 3 facturas de 14 comprobantes; con RUC 20, 9 de 19.
- Hay 2 facturas (S/ 1,972) de proveedores sin RUC en su ficha: el dato del proveedor está incompleto.
- La ley lo explica: el Nuevo RUS (RUC 10) tiene prohibido emitir facturas (DL 937, art. 16), y un RUC 20 puede dar boleta, nota de venta o nada.

¿Cuántas prendas cambian de color? Sobre 3,960 variantes activas con costo y precio (mediana: costo S/ 30, precio S/ 55):
- Resta simple: mediana 47.7 %, 224 bajo 30 %, 7 negativas.
- Cuenta sin factura (el peor caso): mediana 38.3 %, 919 bajo 30 %, 26 negativas.
- 695 variantes pasan de «bien» a «bajo 30 %».
- Lo que #1867 pinta mal: de las 729 que se pueden rastrear hasta un lote, el grupo «proveedor con RUC que nunca dio factura» son 323 (44 %). La resta simple dice 11 bajo 30 %, la cuenta honesta dice 57. #1867, al suponer factura por el RUC, muestra 11: deja en verde unas 46 que deberían estar en ámbar.
- Límite de la medición: no reconstruí envío por envío qué pinta hoy facturaDelEnvio. Lo de arriba es por proveedor, no por comprobante.

Lo que falta en la base: no hay ningún enlace entre el costo escrito al recibir y su comprobante.
- Ninguna de las 513 filas de despacho_recibidos tiene compra_item_id.
- Ninguna de las 64 filas de compra_items tiene variante_id.
- Hoy nada dice si un variantes.costo está con o sin IGV, y esa columna tiene una base mezclada:
  - sin IGV si entró con factura;
  - con IGV si entró con boleta, sin aviso, por Nuevo producto o por la carga inicial.
- Costos mal escritos hay pocos: 26 con costo ≥ precio (19 son de 2 polos con costo = precio) y 2 cambios de cerca de 18 % entre compras (un IGV sumado o quitado).

======================================================================
C) DISEÑO RECOMENDADO
======================================================================

C.1 Qué ve la integrante en Recibir

DECIDÍ: toda cifra a la vista va con IGV y se puede comparar con las otras. Son tres:
- «Pagaste por prenda»: el TOTAL del papel, con IGV, sin flete.
- «Precio de etiqueta»: con IGV.
- «Precio mínimo S/ 69.90»: con IGV, calculado según el papel.
Junto a ellas, un veredicto en palabras con su color: «Buen precio» / «Aguanta poca rebaja» / «Bajo el mínimo» / «Pierdes».
No hay soles de ganancia, ni %, ni la palabra IGV. La integrante solo compara dos números con la misma base (etiqueta contra mínimo), y eso no necesita explicación. La cuenta real (S/ 23.32 · 39 %) va detrás del «?», para el líder.

DESCARTÉ:
- Los soles sin IGV a la vista (lo de hoy): no cuadran con nada de lo que ella ve. Es la queja de Felipe y el mismo reclamo que tienen los usuarios de Square.
- La resta simple a la vista: con boleta infla el % 9 puntos, y siempre infla los soles 18 %.
- Mostrar dos cifras («con IGV / sin IGV»): pide entender el IGV, justo lo que Felipe quiere evitar.
Shopify prefiere no mostrar el margen antes que mostrar uno mezclado. Aquí sí se puede calcular bien, pero se muestra traducido a un veredicto.

SE ROMPE SI:
- El tipo de papel está mal anotado. Con «factura» por error, el mínimo sale ~S/ 12 más bajo de lo que aguanta la prenda (costo 36: 69.90 contra 81.90).
- La integrante copia el mínimo como precio sin mirar la rebaja. Lo cubre el veredicto «Aguanta poca rebaja».

C.2 De dónde sale «hay factura»

DECIDÍ: lo dice el comprobante, no el RUC.
- Una pregunta por envío, o por proveedor del envío: «¿Qué papel te dieron? Factura / Boleta o nota de venta / Ninguno».
- Llega marcada si Compras ya anotó el papel en compra_papeles.
- Sin respuesta, se calcula como sin factura (el peor caso).
- Esa misma respuesta alimenta la web (cuentaDeLinea) y la base (fn_costo_de_entrada), y se guarda con la línea recibida. Así el costo queda con su base y se puede auditar.

DESCARTÉ: suponer factura por el RUC (falla en el 64 % de los casos, ver B) y deducirlo del régimen del proveedor (no está en la base y puede cambiar).

SE ROMPE SI:
- La factura llega días después del envío. Hace falta un «papel tardío» que recalcule el costo de esas líneas. Hoy unir la recepción con su compra no recalcula nada (migración 20261110011000, «NO HACE»).
- Un envío mezcla factura y boleta del mismo proveedor. Se toma el que no infla, como hoy.

Esto es estructural: toca el modelo (guardar el papel en la línea recibida) y un RPC de stock y costo. Espera el OK de Felipe.

C.3 Dónde y cómo se explica el IGV: solo al fijar el precio sugerido

Aplica en Nuevo producto, en la línea de la orden de compra y en la propuesta de precio de Recibir. Se dice como multiplicador, que es el idioma que el repo ya usa en sus MOTIVOS («el costo por dos»).

Texto propuesto (lenguaje de tienda, con el piso de Compras de ~48 % sin IGV):
  «Con factura: lo que pagaste × 1.9 → S/ 69.90
   Con boleta o sin papel: × 2.3 → S/ 81.90
   ¿Por qué cambia? (?) De cada venta, 18 de cada 118 soles son del Estado. Con factura te devuelven el impuesto de lo que pagaste; con boleta no, y sale de lo que te queda.
   Con la rebaja de campaña de 35 % todavía te quedan S/ …»
(Lo de la rebaja ya existe: conRebaja, en orden-compra-precio-ayuda.ts.)

Comprobación:
- Costo 36 con factura, precio 69.90: queda 48.5 %. Con la rebaja de 35 % baja a S/ 45.40 y deja 20.7 %.
- Costo 36 sin factura, precio 81.90: con la rebaja baja a S/ 53.20 y deja 20.1 %.

DECIDÍ: el IGV se explica una sola vez, detrás del «?», junto al botón que fija el precio (regla «Poco texto»), con el ejemplo armado con los números de esa prenda.

DESCARTÉ: explicarlo con % («recargo de 92 %»), porque «le subo 40 %» deja 28.6 %, no 40 % (confusión entre recargo y margen); y una nota fija en la pantalla de Recibir, que es ruido para quien solo cuenta prendas.

SE ROMPE SI el piso que se elija no es el 48 %. Con un piso de 30 % sin IGV, los multiplicadores son × 1.43 con factura y × 1.69 sin ella (pregunta F1).

C.4 Lo que calcula el sistema por dentro
- Una sola regla pura, cuentaDeLinea(costo, flete, conFactura, precio): los dos montos entran con IGV y conFactura sale del papel.
- El veredicto, el precio mínimo, pideRevisarAlRecibir, pisoDePrecio de la IA y conRebaja usan esa regla y ninguna otra.
- La base aplica la misma regla en fn_costo_de_entrada y en el freno de precio.

======================================================================
D) LOS 10 ERRORES MÁS PROBABLES Y SU CANDADO
======================================================================

1. El margen suponiendo factura por el RUC (está hoy en main).
   Candado: facturaDelEnvio, sin papeles, devuelve false. Es margen-a-la-vista.ts:61-62. Lleva una prueba que fije «sin papel = sin factura». Después, el papel real (C.2).

2. El precio entre el costo y el costo × 1,18, que pierde y la base acepta (costo 36, precio 40, sin factura: −2.10).
   Candado en la base: cambiar_precio_en_recepcion compara precio ÷ 1,18 contra el costo real según el papel. Es la entrega 2 de ADR-0624. Toca dinero y stock: lo decide Felipe.

3. El bucle de la IA: propone S/ 51.90, la línea se pone ámbar y vuelve a pedir que se revise.
   Candado: pisoDePrecio(costo, conFactura) mide con cuentaDeLinea. El CHECK precio×0,70 ≥ costo sigue valiendo porque exige ≥. Una prueba: «el precio de la IA nunca deja la línea en ámbar».

4. Tres «ganas» en la misma hoja (Vitrina S/ 39.90, línea S/ 27.71 o 33.81, IA «31 %»).
   Candado: borrar el ganaTexto de caraDeVitrina (recepcion-vitrina-reglas.ts:31) y dejar una sola pieza con el veredicto. Se vigila con una firma en lib/unificar.test.ts.

5. Escribir el subtotal sin IGV de la factura, y que la base lo divida otra vez (30.51 queda en 25.86).
   Candado:
   - el campo dice «Total del papel, con IGV»;
   - si el escrito está a ±2 % de (costo de la orden ÷ 1,18), la pantalla pregunta «¿Escribiste el monto sin impuesto?»;
   - la banda de ADR-0298 no lo atrapa, porque ×0,85 pasa.

6. Una subida falsa de 18 % en «Antes S/ 30.51 → S/ 36.00» cuando se repone con factura al mismo precio.
   Candado: conCostoDeHoy (recepcion-conteo-reglas.ts:910-919) muestra el costo guardado «como el papel», multiplicado por 1,18 si entró con factura, con la misma regla única de ida y vuelta (el «SE ROMPE SI» n.º 1 de ADR-0417).

7. Costo por paquete o docena, o un ×10 o ÷10 por una coma (S/ 360 en vez de 30; 1850 en vez de 18.50).
   Candado:
   - la banda de ADR-0298 (> 2× o < 2/3) y el tope de S/ 5000;
   - en una prenda nueva sin costo previo, comparar con el costo de la orden y con las bandas por categoría que ya existen en orden-compra-precio-ayuda.ts:299-319;
   - confirmar con la cifra grande a la vista.

8. Una etiqueta que no aguanta la campaña (S/ 59.90 sobre costo 36 sin factura: en lista queda 29 %, y con 30 % de rebaja pierde).
   Candado: el veredicto «Aguanta poca rebaja» y la línea «Con 35 % de rebaja te quedan S/ …», con conRebaja y su redondeo a S/ 0.10 hacia abajo (ADR-0403).

9. Una base mezclada en variantes.costo: Nuevo producto, la carga inicial y lo que llega sin aviso guardan el costo con IGV aunque haya factura. El costo de lo vendido se infla 18 % y el IGV se cuenta dos veces en Ganancias.
   Candado: crear_producto_con_variantes y lo que llega sin aviso pasan por fn_costo_de_entrada con el tipo de papel. Corregir hacia atrás espera al contador.

10. Sumar el flete al costo por su cuenta. El mismo modelo queda con dos costos según quién recibió (ADR-0362 d.20 dice que el flete va aparte).
    Candado: el campo dice «sin flete: el flete va en Gastos ▸ Traer la mercadería». Y que el precio cambiado en «solo esta sede» se diga dentro del veredicto («solo TRU»), no en una línea perdida de la confirmación (ADR-0519 d.7).

======================================================================
E) INCONSISTENCIAS DEL ERP: fórmulas de margen distintas
======================================================================

SIN quitar el IGV (precio con IGV − costo tal cual):
- apps/web/lib/recepcion-vitrina-reglas.ts:31. «Ganas por prenda» = precio − costo, en soles. Se dibuja en components/recepcion-conteo/PrendaConCombinaciones.tsx:557-559, a centímetros de LineaMargen (:133-135).
- apps/web/lib/precio-propuesto-reglas.ts:34-40. pisoDePrecio, precio × 0,70 ≥ costo. Más :71-79 (margenPorcentaje). Lo mismo en el prompt (lib/precio-propuesto-ia.ts:50) y en el CHECK de supabase/migrations/20261110203000_precio_propuesto_con_ia.sql:80.
- apps/web/lib/alta-producto.ts:81-94. margenPorcentaje + nivelMargen, umbral 30. Lo usan ProductosTabla.tsx:738-761 y MatrizStockFicha.tsx:687.
- apps/web/lib/productos-vista.ts:72. UMBRAL_MARGEN_BAJO = 45 (provisional, ADR-0254).
- apps/web/lib/proveedor-prendas-reglas.ts:199. MARGEN_BAJO_PCT = 35, sobre el ingreso con IGV. Y lib/proveedor-analisis-reglas.ts:20 y :138-147: estrella con ≥ 40 %.
- apps/web/lib/produccion-reglas.ts:31-50. Semáforo 60 / 40 sobre el costo directo.
- apps/web/lib/plan-compra-reglas.ts:251-256. Solo dice si pierde.
- Revisar precios: SQL con precio × 0,70 < costo, en 20261110203000:380 y lib/revisar-precios-reglas.ts:97-98.

QUITANDO el IGV:
- apps/web/lib/margen-a-la-vista.ts:35-53 (cuentaDeLinea, umbral 30) y :60-63 (facturaDelEnvio, que supone factura por el RUC).
- apps/web/lib/precio-propuesto-reglas.ts:115-121 (pideRevisarAlRecibir). Es la misma familia que pisoDePrecio, con otra base.
- apps/web/components/NuevoProductoForm.tsx:582-588 y :1330-1337. Desde #1867, y supone factura por el RUC (:585-586).
- apps/web/lib/orden-compra-precio-ayuda.ts:34-49 y :617-660 (ayudaDePrecio: piso de ~48 % en lista). Está probada y ninguna pantalla la importa (knip.ts:83).
- Estados financieros: ventas 7011 sin IGV − 691, en supabase/migrations/20260925130000_finanzas_diario_y_estado_de_resultados.sql:264 y :659. Confía en que el costo sellado entró bien convertido, y no siempre es así (D9).

Mezcla de bases al comparar:
- lib/recepcion-conteo-reglas.ts:910-919 (conCostoDeHoy).
- lib/productos-vista.ts:89-98. Con factura, 79.90 contra un costo guardado de 33.90 da 57.6 % cuando el real es 49.9 %.
- El costo sugerido de Nuevo producto (lib/alta-producto-datos.ts:150-164) llena un campo que se lee con IGV usando el costo guardado, que puede estar sin IGV.

En resumen: hay cinco umbrales (30, 35, 40, 45 y 60/40) y dos bases. Choca con «Integridad conceptual»: hace falta una regla y un piso por pregunta de negocio. Unificar las pantallas de análisis (Productos, Proveedores, Producción) es otra decisión, aparte de Recibir.

======================================================================
F) LO QUE FELIPE TIENE QUE DECIDIR (la investigación no lo responde)
======================================================================

1. ¿Cuál es el piso único de ganancia, medido sin IGV? 30 % (la IA hoy: multiplicadores × 1.43 y × 1.69) o ~48 % (Compras: aguanta una rebaja de 35 % y deja 20 %; multiplicadores × 1.9 y × 2.3).
2. Si no se sabe el papel, ¿se calcula como sin factura (el peor caso, etiqueta más cara)? ¿O no se dice nada hasta que se sepa?
3. ¿Quién anota el tipo de papel? ¿La integrante al recibir, una pregunta por envío? ¿O solo vale lo que Compras ya registró? ¿Y quién corrige cuando la factura llega días después?
4. En Recibir, ¿la integrante ve solo el veredicto y el precio mínimo? ¿O también los soles que quedan («Te queda S/ 23»), aunque no cuadren con su resta?
5. Un precio que pierde después del IGV, ¿se frena en la base (no se guarda) o solo se avisa en rojo?
6. ¿Se corrige hacia atrás el costo con IGV que entró con factura por Nuevo producto, la carga inicial o sin aviso? Toca Ganancias y el diccionario; antes hay que preguntarle al contador.
7. ¿El precio sugerido redondea siempre hacia arriba a .90, o se puede elegir otro final?
8. Productos (45 %), Proveedores (35/40 %) y Producción (60/40 %), ¿se alinean con el piso de Recibir o cada pantalla conserva su vara porque responde otra pregunta?

LO QUE NO PIDIÓ (lo de mayor consecuencia): el problema de fondo no es cómo se muestra el IGV, sino que la base no sabe con qué papel entró cada costo (0 de 513 recepciones enlazadas). Mientras eso no exista, ninguna pantalla, por bonita que sea, puede dar un margen confiable, y Finanzas hereda la mezcla.