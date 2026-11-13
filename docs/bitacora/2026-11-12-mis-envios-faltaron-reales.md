# 2026-11-12 · Recibir lo que mandó Compras, de punta a punta, y «faltaron» de verdad en Mis envíos

- **Qué:** se actualizó la base local a `main` ef26a8a0 (16 migraciones, respaldo en `.flujo-de-negocio/respaldos/`) y se corrió un caso nuevo de
  `/flujo-de-negocio`, `docs/flujos/recibir/con-aviso-de-compras.md`. Felipe compra en «Mis compras», manda ENV-001652 a Trujillo y Micaela lo recibe:
  una blusa manchada, falta 1 pantalón y sobran 2 chalecos. Hubo dos pasadas, una ciega (un agente sin contexto) y una informada (la base revisada en
  cada paso). La base cuadra: 0 descuadres nuevos, un solo cierre con doble clic y la dañada en Cuarentena. Hallazgos: 11, en el backlog de esta rama.
  Se arregló el más grave. «Mis envíos» le decía a Compras «faltaron 10» cuando faltó 1, porque `fn_mis_envios` contaba solo lo que ya entró al stock.
  Ahora lee lo que faltó y sobró de las diferencias del cierre (migración `20261112154000`) y la pantalla dice «faltó 1 · 2 de más».
- **Por qué:** la diferencia ya tiene su fuente de verdad (`despacho_diferencias`, con causa obligatoria, la misma de «Nos debe»). Despejarla con una
  resta la inventaba cada vez que algo contado quedaba «para después» (ADR-0608), y el aviso mandaba a reclamarle al proveedor lo que sí llegó.
  La web cae a la resta de antes si la función no trae el dato, así que el orden de publicación no importa.
- **Verificado:** `compras_simple_dia.mjs` falla sin la migración («contadas 0») y pasa con ella (24/24). `mis-envios-reglas.test.ts` 28/28; tsc, Knip
  y Knip producción en verde. En el navegador, el mismo cierre muestra «Recibido · faltó 1 · 2 de más» y «La tienda contó 16 de 15 · Faltó 1 y
  llegaron 2 de más». La base local quedó como estaba (datos y función).
- **Falta:** que Felipe decida los hallazgos 2–11. (`20261112154000` quedó pegada en producción el 2026-11-12, con su OK.)

# 2026-11-12 · Recibir un envío grande: las 11 notas de Felipe, subsanadas (ADR-0649)

- **Qué:** Felipe recibió él mismo ENV-001660 (119 prendas, 4 proveedores, un fardo a Trujillo) y anotó 11 cosas. Se hicieron en 13 actividades, un commit
  cada una: hojas al centro en Recibir, volver de Etiquetas al envío, «Llevar al stock» con costo y precio a la par, la tabla de tallas (Tab, − y +, total,
  0 centrado, «Llenar todas con»), la carta de colores en una fila de claro a oscuro, las mezclas armadas en la misma carta y ocultas de las listas, el
  contador con paso 1 y paso 2 lado a lado (acomodado por Felipe en una mesa de piezas), la cabecera con «Lo que anotó Compras», el pie sin Anterior ni
  Siguiente, la hoja del envío por proveedor y «Revisa y cierra» rediseñada. De paso: el paso del precio que se saltaba (botones con `key`) y el «60 de 119»
  desfasado.
- **Por qué:** son las notas de quien recibe de verdad, medidas en una recepción real. Ninguna regla del cierre ni de la base cambió (ADR-0649).
- **Verificado:** las 896 pruebas de la web, tsc, lint y Knip en verde en cada commit. En el navegador, con la recepción de Felipe en curso y sin escribir en
  la base (comparada con su foto): el cierre no cierra con cosas pendientes y lleva a lo primero que falta, «Contarla» lleva al modelo, «Llenar todas con»
  llena y vuelve atrás, Vender a 375 px abre el cobro sin registrar la venta. `/milimetro`: 0 graves, 0 medias
  (`docs/milimetro/auditorias/2026-11-12-recibir-envio.md`).
- **Falta:** en Dynamic, la tarea de `Modal`/`HojasAlCentro`. (`20261112154000` quedó pegada en producción el 2026-11-12, con el OK de Felipe.)
