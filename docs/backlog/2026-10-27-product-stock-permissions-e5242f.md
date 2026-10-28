## Stock solo en Existencias · lo que queda (2026-10-27, ADR-0494 actividad 3)

Hecho: Editar con candado y «Ajustar stock», «Agregar color/talla» con unidades de partida, archivar solo con 0 unidades, el sello de Nuevo producto.

Pendiente, de Felipe:
- **Una cerradura real en la base.** Hoy Editar ya no ajusta stock, pero `ajustar_inventario` acepta la llamada desde cualquier lado (y `catalogo_actualizar_producto` desactiva una variante con stock). Pide una migración (un origen en la función y en `movimientos`, y un candado al desactivar) con sus pruebas de Postgres.
- **La transición en olas** (aviso → puente → candado) de la maqueta: no se hizo; se entregó directo la dirección A. Si las colaboradoras la necesitan, el puente es la dirección C (cajón con Existencias dentro de Editar).
- **Una variante creada en 0 sin «Ajustar stock»** (cuenta sin el módulo) sigue naciendo sin unidades: ahora lo dice el modal; se cargan después en Recibir mercadería.
- **`/formidable`** de la hoja «Ajustar stock» de Editar y de los dos modales rehechos: no se corrió.
- La regla de movimiento de `CLAUDE.md` no lista el sello ni el destello del candado (están en ADR-0136, act. 2026-10-27).
