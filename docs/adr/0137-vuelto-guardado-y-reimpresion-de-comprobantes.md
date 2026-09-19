# ADR-0137 — El vuelto se guarda y los comprobantes se reimprimen desde Caja (ticket y A4)

**Fecha:** 2026-09-19
**Estado:** Aplicado en local (rama `claude/caja-cabecera-atelier`).
**Migración `20260919210000_venta_pagos_recibido.sql`: PENDIENTE en producción.** La pega
Felipe en el SQL Editor de cayla-dynamic (ya lleva `retail.` y su `search_path`). **Va ANTES de
fusionar el front**: el detalle de venta lee `venta_pagos.recibido` y, sin la columna, esa lectura falla.
**Afecta:** `retail.venta_pagos` (columna nueva), `retail.registrar_venta` (misma firma de 11
parámetros), Vender (`PuntoDeVenta`, cola offline), Caja (`CajaAbiertaPanel` y tres componentes
nuevos), `BoletaA4`, `globals.css` (página de impresión `a4`).

## Contexto

Felipe pidió que en «Movimientos recientes» de Caja hubiera un «Ver todo» y que al abrir una venta
se pudieran ver todos sus detalles y **volver a imprimir** el comprobante, en ticket y en A4.

Al mirarlo aparecieron tres huecos:

1. **El vuelto no existía en la base.** Vender sabía cuánto entregó la clienta, pero solo mandaba
   `{ método, monto }` a `registrar_venta`; el ticket reimpreso no podía traer el vuelto.
2. **De Lucode solo guardamos enlaces.** `comprobantes.respuesta_sunat` tiene `pdfUrl`, `xmlUrl`,
   `cdrUrl`, `hash` y `estado`. Lo estructurado (serie, número, cliente, ítems, subtotal, IGV, total)
   ya está en nuestra propia fila `comprobantes`, que es lo que se le mandó a Lucode.
3. **La boleta de referencia era de otro proveedor.** El PDF que Felipe pasó (Alegra) trae una
   «Autorizado mediante resolución N° …» que es la de Alegra, no la de Lucode; `lib/emisor.ts` ya
   la deja vacía a propósito.

## Decisión

1. **El vuelto se guarda como `venta_pagos.recibido`** (lo que entregó la clienta, solo efectivo).
   El vuelto **no** se guarda: se calcula (`recibido − monto`), así no hay dos cifras que se
   desincronicen (principio 4). Candado `venta_pagos_recibido_coherente`: `recibido` solo existe en
   efectivo y nunca es menor que `monto`. El arqueo y el cierre de caja siguen sumando `monto`.
2. **`registrar_venta` conserva UNA sola firma** (`create or replace` sobre los mismos 11
   parámetros; `p_pagos` sigue siendo `jsonb` y solo se lee una clave más). Una sobrecarga duplicada
   tumba la pantalla en producción (ya pasó con `/productos`).
3. **`pagosParaRpc` decide qué viaja**: solo montos > 0 y el `recibido` únicamente en efectivo y
   únicamente si cubre lo que corresponde, porque el candado rechazaría **toda** la venta por una
   cifra a medio escribir.
4. **Las ventas anteriores no tienen `recibido`** y su reimpresión sale **sin línea de vuelto**.
   Es un dato que nunca se guardó; inventarlo sería mentir en un documento.
5. **El A4 se arma desde nuestra fila `comprobantes`**, no leyendo el XML de Lucode: mismos datos
   que vio SUNAT, sin depender de una API externa (principio 9). Se toma la **estructura** de la
   boleta de Alegra, con el diseño de CAYLA; **no** se copia su resolución ni su pie.
6. **Solo se reimprime lo que tiene validez** (`puedeImprimir`): `aceptado` sin leyenda;
   `pendiente` y `enviado` con «pendiente de validación en SUNAT»; `rechazado`, `anulado` y
   `no_emitido` no, con su motivo. Un papel que parece válido y no lo es, es peor que no imprimirlo.
7. **Una sola raíz de impresión a la vez** pegada a `<body>` (`#comprobante-print` para la térmica,
   `#boleta-a4-print` para el A4) y una **página CSS nombrada** (`@page a4`: A4, margen 12 mm) que no
   pisa la regla de la térmica.
8. **Valores del A4 sin IGV a 2 decimales**, y el centavo de diferencia entre la suma de líneas y la
   «Op. gravada» de la base se le da a la última línea (`lineasA4`), para que la columna Total sume
   exactamente lo que dice el pie. El correlativo del A4 va a **8 dígitos** (`B002-00009380`, el de
   la representación impresa); el ticket y el resto de la app siguen con 6.

## Consecuencias

- **Orden de despliegue: la migración primero.** Vercel despliega cada push a `main`; si el front
  llega antes, el detalle de venta de Caja falla al leer `venta_pagos.recibido`. Cruzar también los
  `.rpc(` del front contra `pg_proc` de producción (una sola sobrecarga de `registrar_venta`).
- **La migración se renombró** de `20260919160000_…` a `20260919210000_…` al fusionar `main`: `main` trajo
  `20260919160000_dinero_de_compras_lectura_operativa.sql` con la misma versión, y dos migraciones con el
  mismo número rompen `migration up`. `210000` estaba libre en todas las ramas y carpetas de trabajo.
- **Al aplicarla en producción** hay que refrescar el volcado de `docs/datos/generado/` y correr
  `pnpm datos:generar:produccion` (regla de oro de `docs/datos/`). **No** `pnpm datos:generar` a secas.
- **Lo que solo se probó en el motor de Chrome:** el A4 se verificó generando el PDF real
  (`page.pdf()`): 1 hoja A4 exacta, contenido de la app oculto, y con 45 líneas 3 hojas con el
  encabezado repetido. **No** se probó con la impresora de Felipe ni con el diálogo real.
- **Chrome no imprime nada en el margen de la hoja.** El texto lateral «Generado por Cayla POS» se
  perdió en la primera versión por estar en el margen; vive en un canal de 6 mm dentro del área
  imprimible y, al imprimir, con `position: fixed` para repetirse en cada hoja.
- **La dirección de la clienta no se guarda.** La factura imprime la línea «Dirección» en blanco. La
  consulta de RUC al padrón sí la trae, pero no llega a la venta; guardarla exige una columna en
  `comprobantes` y llevarla a lo que se manda a Lucode. Queda en el BACKLOG.
- **Desvío del spec:** «Importe de venta» (el total con IGV) **volvió** al bloque de importes por
  pedido de Felipe tras ver la maqueta; y no se generó un `pegar-en-produccion-…sql` aparte porque
  la migración ya es pegable tal cual.
- **Un solo A4 para boleta y factura**; las firmas («Elaborado por», «Aceptada, firma y/o sello»)
  salen solo en la factura.
