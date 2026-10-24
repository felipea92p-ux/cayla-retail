# ADR-0504 · Historial de compras: una fila de menú, tres pestañas, tres módulos

- **Fecha:** 2026-10-24 · **Estado:** aceptado (Felipe, 2026-10-24: opción A y cabecera A). **Paso 1 construido** (el menú acepta varios módulos
  alternos); los pasos 2 a 5 están por construir.
- **Pedido:** Felipe, 2026-10-24: unificar «Revisar compras» y «Por pagar» dentro de «Historial de compras», porque son la misma cadena
  (revisar → comprobante → pagar). Maqueta navegable: `docs/maquetas/compras-historial-unificado-2026-10/index.html`.
- **Sigue de:** ADR-0480 (Compras simple, que dejó el Historial en solo lectura), ADR-0306 (un módulo es una entrada del menú), ADR-0387
  («el módulo es la llave»), ADR-0358 (una función, una pieza).

## El problema primero

Una compra cambia de estado: la anota quien compra, Compras confirma la plata y completa el papel, el comprobante entra al libro y, si quedó
a crédito, se paga. Esa cadena vivía en **tres filas sueltas** del menú de Compras (Revisar compras, Historial de compras, Por pagar; seis
filas en total), y para saber si había algo pendiente había que entrar a cada pantalla. Además el Historial tenía vistas «Por pagar» y
«Vencidos» que eran otra lista de lo mismo que Por pagar, y «Revisar compras» decía «Tienda TRU» arriba aunque mostraba todas las tiendas.

## Lo que se midió antes de decidir (2026-10-24, solo lectura)

- **Los roles reales reparten los tres módulos distinto:** Compras (1 colaborador) tiene los tres; Producción (1) solo el Historial; Terminal
  Almacén (0) el Historial y Por pagar. Pagar a un proveedor (`fn_puede_pagar_compras` = líder o módulo `por_pagar`) es dinero: no puede venir
  de regalo con poder ver el historial. Un solo módulo daría ese poder a Producción.
- **En producción hay 9 compras, ninguna a crédito:** «Por pagar» está vacío y la cadena revisar → crédito → pagar nunca ha corrido allí. Se
  recorre en local antes del paso 2.

## Decisión

1. **Una fila de menú, «Historial de compras»** (`/compras`), con tres pestañas: Historial, Revisar compras, Por pagar. **Los tres módulos se
   quedan** en Roles y accesos (`facturas_compra`, `fondos`, `por_pagar`): cada pestaña pide el suyo (`exigirModulo`) y quien no lo tiene ni la
   ve ni entra por URL («Sin acceso»). La fila se abre con **cualquiera** de los tres: `modulo: "facturas_compra"` y
   `modulosAlternos: ["fondos", "por_pagar"]`.
2. **La fila no pide `verDineroCompras`.** El menú exige el permiso **y** el módulo (`cumplePermisos`), y `verDineroCompras` sale de
   Historial o Por pagar: un rol con solo «Revisar compras» no la vería. Quien ve dinero lo decide cada pestaña.
3. **Las URLs no cambian** (`/compras`, `/compras/fondos`, `/compras/por-pagar`): unos 20 archivos las enlazan (Inicio, Observatorio, Finanzas,
   Proveedores, avisos). Las pestañas son enlaces y la URL es la verdad, como en Facturación.
4. **Pestañas con `<Pestanas>`** (la pieza decidida): el contador de Revisar y de Por pagar usa `conteo`, `pide` y `tono` (ámbar si hay algo
   que hacer; Por pagar, ámbar si hay vencidas). **La pestaña de entrada es siempre Historial**, porque es lo que dice el menú.
5. **Cabecera A:** título único «Historial de compras» (la regla dice «el nombre del menú» y ahora hay una sola fila), «Todas las tiendas»
   arriba en las tres, y las acciones de cada pestaña a la derecha de las pestañas. Es el caso de Facturación (una fila, varias vistas), no el
   de Finanzas, cuyos submódulos tienen cada uno su fila en el lateral y por eso su título cambia.
6. **Orden de construcción:** (1) el menú acepta varios módulos alternos, sin cambio visual; (2) pestañas, cabecera y una fila de menú, con
   las guías interactivas, sus huellas y los escenarios del tema; (3) textos y estados de Revisar (Todo al día, «Cierres», «quienes compran»);
   (4) el Historial sin las vistas que repiten Por pagar; (5) **PR aparte, con el OK de Felipe:** la lista de «Entregas y devoluciones» con
   el saldo inicial y los saldos en «Entregar plata».

## Paso 1 (hecho)

`ItemMenu.moduloAlterno` (uno) pasa a `modulosAlternos` (lista) en `lib/menu.ts`; Catálogo ▸ Insignias es el único que lo usa
(`["campanas"]`) y se comporta igual. `menu.test.ts` prueba la lista con tres módulos y que Insignias se abre con Campañas sola;
`modulos.test.ts` entiende la lista en su regla «un módulo es una entrada del menú»; `menu-iconos.test.ts` también. La foto dorada del menú
no cambió.

## Lo que se descartó

- **Un solo módulo con Revisar y Por pagar como «funciones»:** Roles y accesos más simple, pero Producción pasaría a poder pagar y la
  Terminal Almacén a confirmar plata. Es un cambio de permisos sobre dinero, y no lo pidió nadie.
- **Cabecera B (cada pestaña con su título de hoy):** bajo una fila que dice «Historial de compras» la pantalla diría «Por pagar».
- **Contadores en el menú lateral:** cuestan un conteo en cada pantalla del ERP. En las pestañas solo cuestan dos al cargar el grupo.
- **Pestaña de entrada según los pendientes:** la entrada cambiaría de un día a otro y el menú dejaría de decir dónde cae.

## Se rompe si

- Un rol no ve Historial (tiene **solo** «Revisar compras» o solo «Por pagar»): la fila lo deja en la primera pestaña que sí ve, no en
  Historial. Hoy ningún rol real está así.
- Las lecturas de los contadores se vuelven lentas con cientos de compras: se miden entonces (hoy, 9).
- Alguien guarda un enlace a `/compras/por-pagar` y su rol pierde el módulo: ya cae en «Sin acceso», no cambia.

## Fuera de este ADR (y por qué)

La lista de «Entregas y devoluciones» no muestra el saldo inicial que la persona «ya tenía» (lo cuenta `fn_fondos`, no lo lista
`fn_fondos_movimientos`), así que se lee una devolución sin entrega, y «Entregar plata» no dice cuánto hay en la cuenta de origen. Es dinero y
toca funciones de la base: va en un PR aparte, con el OK de Felipe.
