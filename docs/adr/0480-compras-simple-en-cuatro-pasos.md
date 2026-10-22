# ADR-0480 — Compras simple: la compra nace en el celular de quien compra

- **Fecha:** 2026-10-22 · **Estado:** en construcción en la rama `claude/modulo-compras-66e94a`, actividad por actividad
  (`/construir`). Actividad 1 (menú y módulos): migración `20261022225000_compras_simple_modulos.sql`, **sin pegar en producción**
  (se pega después de publicar la web, con el OK de Felipe).
- **Maqueta aprobada:** `docs/maquetas/compras-simple-2026-10/` (index.html tocable + README con cada decisión).
- **Relacionados:** ADR-0362 (Órdenes de compra y Fondos por rendir, fases 1–6: lo que se reemplaza), ADR-0111 y ADR-0362 fase 5b
  (notas de crédito y documento interno), ADR-0161 y ADR-0306 (módulos y roles; un módulo es una entrada del menú), ADR-0387 («el
  módulo es la llave»).

## El problema

Reunión del 2026-10-22: «prioridad máxima a Compras y Recibir». Consultado en producción ese día, en solo lectura: **0 órdenes de
compra, 0 fondos por rendir, 0 notas de crédito**; las 9 «compras» eran gastos. 3 065 unidades habían entrado por carga inicial con el
costo escrito a mano en Catálogo, contra 37 por Recibir. Compras estaba construido y nadie lo usaba: pedía a quien compra en la calle
o al proveedor (sin formación técnica, con el celular en la mano) que llenara una orden, una factura y una recepción en un computador.

## Lo que decidió Felipe (2026-10-22, mirando la maqueta)

1. **Paso 1 — la plata.** La misma compradora anota en el celular la plata que recibió (cuánto, cómo le llegó, foto del voucher; «ya
   tenía» solo la primera vez). Quien tiene Compras la confirma. Lo que sobra queda para la próxima.
2. **Paso 2 — «Compré ropa».** Busca al proveedor (por nombre o categoría) o lo registra (con aviso de duplicado); elige de sus
   habituales o «Algo nuevo»; cantidad, costo y precio de venta («igual que la vez pasada»); a qué tienda va; la foto de la boleta con
   el monto. Aparte: «Otro gasto», «Mandar a la tienda» (un envío por tienda) y «Terminé de comprar hoy».
3. **Paso 3 — la tienda recibe** mirando la foto: cuenta, pone el costo (stock y costo entran juntos) y ve como sugerido el precio que
   puso la compradora, que puede cambiar; una prenda nueva se crea ahí con ficha completa, sin ir a Catálogo.
4. **Paso 4 — «Revisar compras»** (quien tenga el módulo, no necesariamente el líder): confirma la plata, copia serie y número del
   comprobante y decide qué pasa con lo que no cuadró.
5. **El menú de Compras queda en 6 opciones:** Plan de campaña (sin tocar), Mi plata para compras, Revisar compras, Proveedores,
   Facturas de proveedor y Por pagar. **Órdenes de compra y Notas de crédito se quitan**: «por ahora no manejaremos notas de crédito».

## Decisiones técnicas (actividad 1)

- **`ordenes_compra` se reusa como «Mi plata para compras»; `fondos` se llama «Revisar compras».** Unas 40 funciones de la base usan
  `ordenes_compra` como llave de permiso (recibir, gastos del viaje, datos bancarios del proveedor, registrar un proveedor nuevo, «Nos
  debe»). Retirarla cambiaría en silencio quién puede qué; reusarla deja todo igual y quien hoy compra sigue pudiendo. Cambian el
  nombre y el «incluye» en `retail.modulos`, el nodo del menú y la ruta (`/compras/mi-plata`). Las pantallas de órdenes siguen en el
  código sin entrada en el menú hasta que una actividad posterior las retire.
- **`notas_credito` se retira del catálogo** como en ADR-0306: se borran sus asignaciones de rol y su fila; nunca historia (la
  migración se detiene si `actividad` o `roles.pantalla_principal` la nombran). Nadie pierde ver el dinero de Compras: las reglas
  piden **cualquiera** de `facturas_compra`, `por_pagar` y `notas_credito`, y los dos roles que tenían notas tienen también las otras.
  Registrar una nota (y adjuntar la del proveedor a un documento interno) queda solo del líder, sin pantalla. `adjuntar_nota_proveedor`
  anotaba su Actividad bajo `notas_credito`: esa anotación ya no puede escribirse y la función sigue sin ella (deja un warning). Si las
  notas vuelven, vuelven con su módulo (`pruebas:nos-debe` lo marca: «0 en Actividad»). **Las tablas y funciones de notas no se tocan**: la historia y el saldo a favor
  (documento interno) siguen leyéndose donde ya se leían.
- **La web deja de dibujar notas**: se borran la pantalla, sus modales, sus avisos del Inicio y del Observatorio, y las reglas que solo
  ellas usaban (Knip). `/compras/notas-credito` redirige a `/compras`. En Recibir, «lo que no llegó» se reclama en «Nos debe» del
  proveedor.

## Cómo se ve mal hecho

- Retirar `ordenes_compra` y crear una clave nueva: el rol «Compras» perdería en silencio recibir, gastos y proveedores.
- Borrar las tablas de notas: se perdería el saldo a favor ya registrado y el documento interno de lo que no llegó.
- Dejar «Notas de crédito» en Roles y accesos sin pantalla detrás: un interruptor que no abre nada.

## Qué queda

Actividades 2 a 8 de la construcción (anotar y confirmar la plata, registrar la compra, algo nuevo y proveedor nuevo, otro gasto y
cierre del día, recibir con costo y precio, revisar compras, cierre con guías y pruebas). Cada una agrega su sección a este ADR.
