# Backlog · 2026-10-29 · Insumos: «Retirar color» (ADR-0554, actualización del 29-oct)

**Estado:** construido en la rama `claude/eliminar-color-tela-0fdab8` (dos commits: base y web, más el cierre). **La migración `20261029014000` no está en producción.** La web nueva llama a la función: pegar el SQL antes de fusionar.

## Felipe (en este orden)
- [ ] **Pegar `20261029014000_materiales_retirar_color.sql` entera, en una sola pegada y con el cursor sin selección.** Solo funciones y un disparador nuevo (sin políticas, sin `drop trigger`): no toma candados de `auth` ni de `storage`. Se detiene con «Primero pega 20261028203000» si falta esa. Se puede repetir.
- [ ] **Marcar SOLO la casilla «SQL pegado en producción»** del PR y esperar el ✓ del check «SQL pegado» (nunca la otra casilla). Desde que se pegue, la migración **no se edita** (un cambio en un texto entre comillas cambia la huella; los comentarios no).
- [ ] **Fusionar el PR a mano** cuando los checks estén verdes en el mismo commit.
- [ ] **Retirar el color equivocado** desde Producción ▸ Insumos: abrir el color ▸ «Retirar color». Si tiene saldo, la hoja lo dice y no deja (ver la decisión de abajo).
- [ ] **Decidir: ¿«Agregar colores» debe revivir un color retirado?** Hoy volver a agregarlo **no hace nada y no avisa** (el color ya existe, retirado). Salida corta mientras tanto: `update retail.insumos set archivado_at = null where codigo = '<CÓDIGO>';`.
- [ ] **Decidir una función «anular un ingreso equivocado»** (contra-asiento con motivo, solo líder): hoy no existe cómo dar salida a un saldo fuera de una orden, así que el error más probable al cargar una tela —el color equivocado **con saldo**— no se puede retirar. Es dinero y stock: decide Felipe.
- [ ] **Mirar el costo del lote de 9 m de Arena** (28-oct): el error de la coma pudo dejarlo en S/ 0.00 (es dinero; sigue abierto desde el ADR-0554).

## Pendiente de la sesión (no es de Felipe)
- [ ] `/formidable` con una persona sin contexto sobre la hoja «Retirar color» (hoy la hoja tiene un solo control y un texto de una frase, pero no se probó a ciegas).
- [ ] `/chaos` formal con su catálogo de 69 ataques sobre `RetirarColorModal` (se atacó a mano: doble clic, dos pestañas y tres carreras reales en la base; y la INV-25 vigila el resultado).
- [ ] Refrescar el diccionario de datos cuando la migración esté en producción (`docs/datos/generado/COMO-REFRESCAR.md`); no agrega tablas.
- [ ] **Archivar una tela entera:** una tela con todos sus colores retirados desaparece de la lista y sigue ocupando su código; archivar la tela (`materiales.archivado_at`) no existe.
