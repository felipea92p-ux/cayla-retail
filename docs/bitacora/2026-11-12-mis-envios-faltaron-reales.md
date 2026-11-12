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
- **Falta:** pegar `20261112154000` en producción (una parte, solo la función: con el OK de Felipe) y que decida los hallazgos 2–11.
