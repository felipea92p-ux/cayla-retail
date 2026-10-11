# ADR-0377 — Bolsas de despacho: una familia fuera de los motores y «Agregar bolsa» en Vender

- **Fecha:** 2026-10-10 · **Estado:** construido y verificado en local, **SQL todavía NO en producción** (tres migraciones y un script de una sola vez,
  en el orden de abajo). Decidido con Felipe: «familia fuera de los motores» y «reclasificar en bloque con rastro» (preguntas con opciones, 2026-10-10),
  más la bolsa de obsequio como línea de S/ 0.00 («ya», contra la recomendación de esperar al contador).
- **Pedido:** «¿cómo regularizo eso? es una bolsa de despacho que damos por 0.5… puede alterar la categoría de bolsos» y, después: «debe salir en el
  punto de venta: agregar bolsa»; la de papel CAYLA pequeña a S/ 0.50, la grande a S/ 1.20, las de TNT ecoamigables a S/ 3.90 y una de obsequio a S/ 0.00.

## El problema (cifras de producción, solo lectura, 2026-10-10 y 11)

No existía ningún producto ni categoría de empaque (las familias eran indumentaria, calzado, accesorios, bisutería, belleza y papelería; «crear bolsas,
cajas y sorpresas como productos» seguía como tarea del equipo desde el ADR-0328). Caja vendía la bolsa como «prenda sin registrar» y anotaba la categoría
que se le ocurría: **62 ventas de Tienda AQP (S/ 37.69)** anotadas como Bolsos y Carteras (incluso «Bolsos y Carteras · Beige · Talla Única» a S/ 0.50),
Anillos o Aretes. Regularizarlas contra una cartera habría dado de baja una cartera real (o creado historial de stock y un «descuento» de −S/ 58).
Peor: el motor del piso, el de demanda, el plan de campaña, Análisis y Frescura **cuentan esas ventas como demanda de su categoría**, y la bolsa a precio
de lista en casi cada venta diluía además la cifra de «rebaja» de Análisis.

## Decisión

1. **Una marca en la FAMILIA: `familias.entra_a_motores`** (por defecto `true`: ninguna familia existente cambia) y una pregunta única,
   `retail.fn_categoria_entra_a_motores(categoría)` (sin dato responde `true`: lo que no se sabe sigue contando). Un líder crea la familia «Empaque», le apaga
   «Cuenta en Análisis, Frescura y el plan del piso» (Catálogo ▸ Familias) y cuelga de ella la categoría «Bolsas»; el tipo de bolsa (papel pequeña, grande,
   TNT, obsequio) son **productos** de esa categoría. `20261010231000`.
2. **Los motores de decisión la preguntan; la plata no.** Ignoran lo apagado: `fn_piso_plan_lectura`, `fn_demanda_sede`, `fn_plan_compra`
   (`20261010232000`), `fn_analisis_sede` (también su cifra «rebaja_de_100») y `fn_frescura_sede` (`20261010233000`), y las dos lecturas directas de la cola
   que `lib/frescura.ts` hace (`lib/familias-motores.ts`). Caja, comprobante, Ventas, Finanzas y Resumen **siguen contando la bolsa**: es una venta real.
3. **«Agregar bolsa» en Vender.** Una fila «Bolsas» bajo la del cliente en el ticket (`punto-de-venta/BolsaDelTicket.tsx`) abre una hoja con las bolsas de
   la sede (las prendas de una familia apagada, `lib/bolsas-reglas.ts`), cada una con el precio DE ESTA TIENDA y su stock; tocar una la agrega por el mismo
   `agregar()` de siempre y la hoja sigue abierta. Sin bolsas en el catálogo no hay fila. A 375 px el botón mide 44 px.
4. **La bolsa de obsequio (S/ 0.00) es una línea más del ticket** (la variante acepta precio 0): descuenta stock y sale en el ticket. Un ticket que no cobra
   nada no se cobra y lo dice (`motivoBloqueoCobro`). **No se declara a SUNAT**: `itemsParaLucode` salta una línea de PRECIO de etiqueta 0 (una prenda regalada
   con descuento sí se declara) y, si todas lo son, no hay comprobante que transmitir. Ver «Pendientes» (contador).
5. **Lo ya vendido: el script de una sola vez** `supabase/migrations/pegar-en-produccion-bolsas-reclasificar-aqp-2026-10-10.sql` llama a
   `corregir_prenda_sin_registrar` (la misma función de «Corregir lo anotado», ADR-0369) para esas 62 ventas: cambia solo categoría, talla «Única» y la
   descripción automática; deja la foto de antes y después y su línea en Actividad; todo o nada. Los ids salen de producción (huella `59144f00…`).

## Alternativas descartadas

- **La marca en la categoría.** Una categoría exige familia y la bolsa no cabe en ninguna de las seis; colgarla de «Accesorios» obligaría a apagar también
  carteras y relojes. Con la marca en la familia, «Empaque» agrupa bolsas, cajas y sorpresas con un solo interruptor.
- **Una lista de categorías excluidas dentro de cada función del motor:** cinco funciones con la misma lista a mano se desincronizan.
- **Dejar vender la bolsa sin stock cargado** (cambiar `registrar_venta`): es dinero y stock, y `stock.cantidad >= 0` es un candado de la base. Las bolsas
  se cargan con stock (una carga grande por tienda) como cualquier producto.
- **Sacar la bolsa también de Finanzas, Resumen y Rentabilidad:** son ventas de S/ 0.50 que sí entraron a caja.
- **Una función nueva y permanente de «reclasificar en bloque»:** una limpieza de una sola vez no justifica una RPC permanente (principio 3); el script
  reutiliza la función que ya existe y deja el mismo rastro.

## Se rompe si…

- Un motor NUEVO cuenta ventas o stock por categoría sin preguntar `fn_categoria_entra_a_motores`: la bolsa vuelve a contar. Cada motor ya tiene su caso
  en `pnpm pruebas:motores-familias-apagadas`; uno nuevo debe sumar el suyo.
- Una migración posterior reescribe una de las cinco funciones copiando un archivo anterior: pierde el filtro. Los parches son reemplazos anclados (fallan sin
  tocar nada si la función cambió) con el formato que las suites de Frescura leen para deshacerlos (sumados a sus listas `DESHACER_*`).
- Se apaga una familia que SÍ es mercadería: sus prendas desaparecen de Análisis, Frescura y el plan sin aviso. La tarjeta de la familia lleva el chip
  «Fuera de Análisis y del piso» para que se vea.
- La bolsa de obsequio sin stock cargado: la caja dice «sin stock aquí» y no la agrega (como cualquier prenda en cero).

## Cómo se verifica

- `pnpm pruebas:familias-motores` (6 casos), `pnpm pruebas:motores-familias-apagadas` (11) y `pnpm pruebas:reclasificar-bolsas` (10), todas con ROLLBACK, en el
  CI, y con mutación comprobada (quitar dos anclajes hace fallar exactamente los casos que los vigilan). Las suites vecinas contra la base al día: piso 54/54,
  demanda 11/11 y 13/13, plan de compra 19/19, plan del piso 17/17 y 27/27, Análisis 26/26, capacidad 34/34, cuadrar piso 40/40, bajadas 183/183.
- Las 16 anclas de `232000` y `233000` se contaron contra las definiciones REALES de producción (solo lectura): 16 de 16.
- Punta a punta en local: con la familia apagada, las bolsas valen 0 en los cinco motores y en las listas del plan; con la familia encendida (control) aparecen.
- Vender en el navegador a 1280 y a 375 px; una venta real (2 pequeñas + 1 obsequio) dentro de una transacción que se deshace: la base acepta la línea de S/ 0.00 y
  baja el stock de cada una.

## Orden para producción (todo con tu OK; nada está aplicado)

1. Pegar `20261010231000`, `20261010232000` y `20261010233000` (una parte cada una, tal cual). Verificar con la consulta de solo lectura del PR (2, 3, 1, 5 y 10).
2. Merge de la web.
3. Catálogo: familia «Empaque» (interruptor apagado), categoría «Bolsas» (talla Única), y los productos: bolsa de papel CAYLA pequeña y grande, de TNT y de
   obsequio, con su precio por tienda (ADR-0370) y **stock cargado** en cada tienda (Recibir / carga inicial).
4. El script de reclasificación, con el correo de un administrador y la categoría ya creada.

## Pendientes y riesgos conocidos

- **Contador:** (a) la bolsa de obsequio no se declara a SUNAT: confirmar que es correcto o cómo declararla (transferencia gratuita); (b) el ICBPER (S/ 0.50 por
  bolsa de plástico) no está en el repo: la de papel no lo lleva, la de TNT es de polipropileno.
- **Captura a 375 px:** el panel del navegador estaba oculto y no se pudo sacar; se midió el DOM (fila 333 px, hoja 375×347, filas de 56 px, sin recortes ni
  desborde). Falta mirarla con el panel a la vista (regla de celular de Vender).
- **No corridas:** `/formidable` y `/chaos` (obligatorias) y `tema:auditar` (modo oscuro; solo se usaron tokens). Piden Felipe: lanzan agentes.
- **Tres suites dan un caso en rojo en la base LOCAL compartida** (`frescura_lectura` 256/257, `frescura_decisiones` 155/156 y `frescura_vara_cayla` 11/12), por filas sucias que dejan otras sesiones: dan la misma cifra sin estos cambios y en el CI, con base limpia, pasan. **Corrección (2026-10-11):** en un primer momento dije que `frescura_vara_cayla` también estaba así de antes; no: con mi parche daba 10/12 y el CI lo atrapó (su guarda por md5 de `fn_frescura_sede` no conocía el parche de `20261010233000`). Ya deshace esa migración al empezar cada caso, como `cuadrar_piso`, `frescura_bajadas` y `frescura_lectura`.
  `frescura_vara_cayla` 11/12 (datos sucios de la base local compartida).
- **El volcado del diccionario** (`docs/datos/generado/`) entra con `familias.entra_a_motores` al refrescarlo después de pegar.
- Una venta anotada de «Anillos · Blanco · Talla 6» a S/ 1.00 quedó fuera del script a propósito.
