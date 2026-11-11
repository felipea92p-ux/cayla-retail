# ADR-0644 — Compras: la marca primero, el proveedor detrás

- **Fecha:** 2026-11-11 · **Estado:** construido en la rama `claude/compras-marca-proveedor-03ef86`. La migración `20261111155000_marcas_de_compras.sql`
  **está en producción** desde el 2026-11-11 (con el OK de Felipe; verificada: una firma, `anon` no, `authenticated` sí).
- **Nace de:** Felipe, 2026-11-11: «En los submódulos de Compras la mayoría de cosas está por proveedor, pero muchas veces no se conoce al proveedor
  sino la marca, y es muy importante que se priorice la marca por encima del proveedor». Después: «un proveedor puede vender varias marcas».
  Eligió mirando la maqueta `docs/maquetas/compras-marca-primero-2026-11/` («Sí, la maqueta», «las cinco pantallas»).
- **Relacionados:** ADR-0109 (marca y proveedor), ADR-0140 (el proveedor se conoce por su marca: búsqueda y etiquetas), ADR-0283 (producto sin marca
  ni proveedor), ADR-0480 (Compras simple), ADR-0635 (Recibir crea proveedor y marca).

## Contexto (medido en producción el 2026-11-11, solo lectura)

- 115 marcas activas: **110 tienen un solo proveedor**, 5 tienen dos o más, ninguna sin proveedor.
- 129 proveedores activos: 93 con una marca, **10 con dos o más** (uno con 5), 26 sin marcas (servicios y gastos).
- 0 de las 35 órdenes de compra mezclan marcas, pero `orden_compra_items.marca_id` es obligatorio: cada línea ya sabe su marca.
- `compras.proveedor_id` y `ordenes_compra.proveedor_id` son obligatorios, y deben seguir siéndolo: la deuda, el pago y la factura son con la razón social.

En las pantallas, la marca casi no se veía: en Mis compras iba en gris bajo la razón social; en la lista del día, Historial y Por pagar no salía; en
Proveedores iba en etiquetas chicas (y en el ranking, ni eso).

## Decisión

DECIDÍ: **la marca es lo que se ve primero y por donde se entra; el proveedor sigue siendo con quién es la compra, y baja a la línea de abajo.**
Lo que se guarda no cambia.

1. **Mis compras ▸ Compré ropa, paso 1:** «¿Qué marca compraste?», una fila por marca con «De Textil Ejemplo SAC» y cuándo se le compró. Con un solo
   proveedor queda puesto solo; con dos o más, una hoja «¿Quién te trajo X esta vez?» (el de la compra más reciente primero). Buscando, también por el
   nombre del proveedor, y los proveedores sin marca registrada salen aparte. «Buscar por proveedor» vuelve a la lista de antes. Si los vínculos
   marca–proveedor no cargan, el paso 1 es por proveedor, como antes. Reglas puras en `lib/compra-rapida-reglas.ts` («La marca primero»).
2. **Paso 2:** si el proveedor trae dos marcas o más, píldoras con cuántas prendas de cada una; se entra filtrado a la marca elegida y «Algo nuevo»
   llega con esa marca puesta. Una marca de **otro** proveedor es otra compra (un papel, una deuda).
3. **Marca nueva cuyo proveedor nadie sabe (Felipe, 2026-11-11):** se deja como funciona hoy. «Es una marca nueva» pregunta primero quién la trae
   (o registra al proveedor con el formulario corto que ya existe) y abre «Algo nuevo» escribiendo la marca; la marca se crea al guardar la compra
   (`registrar_marca_de_compra`).
4. **Lista del día, Historial y Por pagar:** el título de cada fila son las marcas de esa compra («Kero», «Kero · Lolita», «Kero y 2 más»); la razón
   social y el RUC bajan. Las marcas llegan de una función **nueva** de solo lectura, `fn_marcas_de_compras(p_compras, p_papeles)`, que no toca
   ninguna función viva: las listas siguen saliendo de `listar_compras`, `listar_compras_operativo`, la de Por pagar y `fn_mi_plata_compras`.
5. **Proveedores (directorio y ranking):** el título son sus marcas («Kero, Lolita, Mia Rose y 2 más», la buscada primero) y la razón social baja.
   Sin marcas, la razón social sigue de título (`tituloDeMarcas`, `lib/proveedores-reglas.ts`).

DESCARTÉ:
- **Hacer el proveedor opcional en la compra** (Felipe lo planteó y después eligió dejarlo como hoy): obliga a cambiar la base de producción en
  compras y órdenes, y una compra sin proveedor no se puede pagar ni sale en Por pagar.
- **Un proveedor «por completar» creado solo con el nombre de la marca:** fichas a medias y, si el proveedor ya existía, dos fichas que hoy no se
  pueden juntar.
- **Cambiar `listar_compras` y compañía para que traigan las marcas:** son funciones vivas y muy usadas; una función aparte da lo mismo sin riesgo.
- **Leer las marcas directo desde la pantalla:** `compra_items` solo la lee quien ve el dinero de Compras y `orden_compra_items` no tiene políticas.
- **Cuándo se compró cada marca** (en vez de cuándo se le compró al proveedor): pide otra lectura de la base. Hoy la fila dice cuándo se le compró a
  su proveedor, y lo dice así («Le compraste…» bajo «De Textil Ejemplo SAC»).

SE ROMPE SI: **(a)** las marcas de un proveedor no están registradas (`marca_proveedores`): ese proveedor no sale en la lista por marca hasta que se
busca por su nombre; **(b)** la función nueva no se pega en producción: las tres listas se ven como antes, sin aviso a la vista (lo dice el registro
del servidor); **(c)** una marca la venden muchos proveedores: la hoja de «¿Quién te la trajo?» crece, pero es una lista de un toque.

## Lo que queda (segunda parte, pide cambiar funciones vivas)

**Buscar y filtrar por marca en Historial y Por pagar.** Las dos listas se paginan en la base (`listar_compras`, `listar_compras_operativo`, la de Por
pagar): buscar «Kero» o filtrar por una marca exige que esas funciones lo sepan. Es un cambio de funciones vivas y espera el OK de Felipe.

## Verificación

- Pruebas: `lib/compra-marca-primero.test.ts` (listas, búsqueda, detalle, «¿quién te la trajo?», píldoras), `lib/marcas-de-compras-reglas.test.ts`,
  `lib/proveedores-reglas.test.ts` (`tituloDeMarcas`), `lib/mi-plata-reglas.test.ts` (el título de la lista del día). Todo `apps/web` en verde
  (890 archivos), `tsc` y Knip limpios.
- La función, contra una base local dentro de una transacción que se deshizo: compila, devuelve las marcas de comprobantes y de papeles, y rechaza
  sin acceso a Compras (`42501`).
- «Compré ropa» en el navegador con datos inventados (sin base ni sesión): paso 1 por marca, búsqueda por proveedor, la hoja de dos proveedores y el
  paso 2 con píldoras, a 1440 y 375 px, en claro y oscuro, sin desborde ni errores. **No se vio en el navegador** Historial, Por pagar ni Proveedores
  con datos (son páginas del servidor que leen la base): sus cambios son de texto y los cubren tipos y pruebas.
