# ADR-0646 — «Algo nuevo»: la marca es opcional y la tienda la pone al recibir

- **Fecha:** 2026-11-11 · **Estado:** construido en la rama `claude/marca-opcional-recepcion-6c0e33`. La migración
  `20261111192000_marca_opcional_en_algo_nuevo.sql` **no está en producción**: espera el OK de Felipe para pegarla.
- **Nace de:** Felipe, 2026-11-11: «que la marca sea opcional, igual en recepción que la puedan colocar» y «al colocar la marca se vincula
  automáticamente con el proveedor». También quitó el párrafo de explicación de «Algo nuevo» («innecesario»).
- **Relacionados:** ADR-0393 (prenda sin marca), ADR-0480 (Compras simple), ADR-0604 (Recibir «B»), ADR-0644 (la marca primero).

## Contexto (medido en producción el 2026-11-11, solo lectura)

- `orden_compra_items.marca_id` y `despacho_items.marca_id` eran `not null`; `compra_items`, `productos` y las tablas del conteo ya la aceptaban vacía.
- `fn_orden_compra_validar` (la regla común de las órdenes) rechazaba una línea sin marca.
- 11 funciones de Compras y Recibir leían la marca de la línea con `join` (no `left join`): una línea sin marca habría desaparecido de la
  recepción, del detalle de la orden y de los avisos. Tres comparaban por marca con `=` o `<>` (lo que el proveedor nos debe).
- En la web, `leerLineaEnvio` descartaba la línea del envío sin marca.

## Decisión

DECIDÍ: **la marca es opcional en la base y en «Algo nuevo»; quien recibe se la pone a la prenda «por crear» en «¿Ya existe?», que ya existía
(`cambiar_linea_de_pendiente`), y al hacerlo la marca queda vinculada al proveedor de la compra.**

1. Las dos columnas aceptan vacío; la regla común y `corregir_compra_rapida` aceptan la marca vacía (si viene, activa). La pantalla de Órdenes de
   compra del escritorio sigue pidiéndola por su cuenta.
2. Los `join retail.marcas` de esas 11 funciones pasan a `left join`; las comparaciones de deuda por marca, a `is not distinct from`.
3. `fn_habituales_proveedor`: las prendas sin marca no se juntan en una (su clave quedaba vacía).
4. `cambiar_linea_de_pendiente` registra la pareja marca–proveedor (`marca_proveedores`) al poner la marca a una línea del envío. Antes solo
   pasaba al crear la prenda nueva.
5. Web: «¿De qué marca? · opcional», tocar otra vez la marca elegida la quita, y una marca empezada a escribir con «+» que no se entiende sigue
   frenando. Recibir lee la línea sin marca y la muestra «Sin marca».

DESCARTÉ:
- **Que `preparar_prenda_al_recibir` tome la marca elegida en la hoja de la prenda:** el flujo «B» ya la pide antes, en «¿Ya existe?», y tocar una
  función que escribe stock sin una pantalla que la use es riesgo sin ganancia.
- **Anotar la marca también en la línea de la compra al recibir:** una compra que ya llegó no se cambia (`fn_compra_unida_no_se_cambia`); su marca es
  la referencia de lo que se pidió.
- **Dejar elegir «Sin marca» en una línea del aviso:** `cambiar_linea_de_pendiente` pide una marca; la que llegó sin marca se queda así si nadie la pone.

SE ROMPE SI: **(a)** alguna de las 15 funciones cambia antes de pegar: el reemplazo anclado frena con su nombre y no se aplica nada; **(b)** se publica
la web sin pegar la migración: «Algo nuevo» sin marca da el error de siempre («La línea 1 necesita una marca activa»), sin dejar nada a medias;
**(c)** una línea sin marca sobra: no se ofrece como «reposición» de lo que faltó (`nos-debe-reglas` se salta las deudas sin marca).

## Verificación

- Las 19 anclas, contadas contra el texto vivo de producción (solo lectura): cada una aparece las veces esperadas.
- Web: 890 archivos de prueba en verde, `tsc` y Knip limpios; `migraciones:versiones`, `sin-drop-trigger` y `pg-temp` en verde.
- **No verificado:** la migración aplicada sobre una base con todas las migraciones (lo hace el CI), ni el recorrido en el navegador.
