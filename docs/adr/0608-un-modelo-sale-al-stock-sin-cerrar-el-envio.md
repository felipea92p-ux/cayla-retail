# ADR-0608 · Un modelo sale al stock sin cerrar el envío

- **Fecha:** 2026-11-03 · **Estado:** construido y probado en local (`pnpm pruebas:envio-sin-aviso`, 37 casos; navegador a 1280 px).
- **Decide:** Felipe, 2026-11-03: «Digamos que empiezo a contar y quiero contar solo un modelo de polo primero […] esos polos tienen que salir primero». «Si hay que hacerlo y debe quedar absolutamente perfecto».
- **Toca:** ADR-0393 (recepción contando primero), ADR-0604 (contar modelo por modelo). Cambia tres reglas anteriores, abajo.
- **Migración:** `20261104005000_salida_anticipada_de_un_modelo.sql`.

## El problema primero

El único camino al stock era cerrar el envío, y cerrar exige contar todas las líneas. Con 70 prendas en la mesa, unos polos que tenían que venderse esperaban a todo lo demás. Abrir y cerrar a medias dejaba deudas de lo que aún no se contó.

## La decisión

**`llevar_al_stock_ahora` mete lo repartido de una prenda por `fn_recepcion_entrar`, el único camino que escribe stock de un envío.** Lo contado no cambia y lo que entró sale de lo separado. Es la misma forma que deja reabrir un envío: `fn_envio_cuentas`, el cierre final y la pantalla no aprendieron nada nuevo.

- **Una parte:** sale lo repartido; lo demás sigue por repartir y puede salir en otra tanda.
- **Costo:** el de la orden o el que escriba quien ve el dinero. Sin aviso y sin ver el dinero, entra sin costo. Uno fuera de lo normal pide confirmar.
- **Después:** hoja con «Imprimir N etiquetas» (solo de esa tanda), «Bajar al piso» y «Seguir contando».
- **Doble clic y corte de red:** un token por tanda. Si no hubo respuesta, el reintento va con el mismo token, y la base devuelve lo que ya hizo.
- **Dos personas:** el envío se toma en exclusiva, en el orden del cierre (ADR-0190), y otra versión del conteo se rechaza con `conteo_cambiado`.
- **Lima:** lleva su dueño, como el cierre (ADR-0542).

**Corregir** (`corregir_salida`) deshace una tanda con un movimiento de salida, con quién y por qué, mientras siga en el almacén y el envío esté abierto. Lo recibido de esa tanda se mueve a `despacho_salidas.recibidos_archivados`, las unidades vuelven a lo separado y el costo vuelve al de antes si nadie lo cambió. Si ya bajó, se vendió, está unida a una factura o trae dañadas, lleva a Ajustar stock.

**El cierre final** mide lo que falta o sobra contando lo que ya salió, y solo ahí. **Con algo en stock no se cancela:** se cierra con lo que hay. **Compras** ve «12 de 70 ya en stock · se sigue contando». **Lo que queda a medias** sale en Te toca y en Recibir (`fn_envios_a_medias`); a los 3 días es urgente y también le aparece al líder.

## Tres reglas que cambian

1. **Proveedor (ADR-0393, 2026-10-14: «sin proveedor no entra al stock»).** Lo que llegó sin aviso y sin saber de quién también sale: su lote queda a nombre de un proveedor «Por confirmar», inactivo, que no se elige en ninguna lista. `poner_proveedor_envio` lo cambia al real, y el envío no cierra hasta tenerlo.
2. **Tienda web (ADR-0436 de la vitrina, 2026-10-19: «lo nuevo nace visible»).** Lo creado al recibir nunca sale solo, lo cree quien lo cree y aunque un líder lo apruebe (`20261104003000`). Nuevo producto sigue igual.
3. **Nombre (ADR-0604, 2026-11-03: «un nombre provisional no deja cerrar»).** Contado con «Aretes 1», cierra y queda pendiente de crear; no se vende hasta tener nombre (`20261104000000`).

También: al recibir, **tejido y patrón son opcionales**, aun donde la familia los exige (`20261104003000`). Editar producto ya los lista en «Lo que falta».

## Lo que descarté

- **Cerrar y reabrir por debajo:** deja una deuda de lo que no se contó y un cierre que nadie hizo.
- **Una fila negativa en lo recibido para corregir:** `cantidad > 0` es un candado, y todos los que suman lo recibido tendrían que restarla.
- **Guardar el nombre tal como se escribe:** el formato único del catálogo vale en todas las pantallas. «a» pasó a ser conector: «Polo a rayas» se guarda «Polo a Rayas». Felipe había pedido que no cambie, así que queda para que lo decida.

## Qué se rompería sin esto

Sin la misma entrada al stock, una tanda se saltaría el costo fuera de lo normal, el dueño o el costo promedio. Sin el token, un corte de red metería dos veces. Sin `recibidos_archivados`, corregir borraría el rastro de lo que entró.

## Lo no cubierto

Dos personas a la vez solo corre en el CI (`DOS_SESIONES`). No se probó con una colaboradora real ni en un teléfono real.
