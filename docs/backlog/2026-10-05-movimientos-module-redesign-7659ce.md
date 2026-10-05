## 🎨 Movimientos: los tipos que se ven (2026-10-05, ADR-0346) — construido; falta pegar la migración en producción; rama `claude/movimientos-module-redesign-7659ce`
- [x] Tres maquetas (`docs/maquetas/movimientos-rediseno-2026-10/`) y elección de Felipe: A · Ruta, botones de tipo en una columna a la derecha
- [x] Palabras «Colgada en piso» y «Guardada en almacén» dentro de Movimientos; colores separados; venta en verde y llegada en verde oliva (`--color-oliva`)
- [x] Act. 1 tipos y palabras · 2 sello y trayecto · 3 base (migración `20261005160000`) · 4 columna de tipos · 5 día con franja y mazos · 6 cajón con sello, ruta y «Qué pasó»
- [ ] **Pegar `supabase/migrations/20261005160000_movimientos_colgada_y_guardada.sql` en producción** (solo funciones de lectura, re-pegable; va ANTES o junto con la web; sin él, los botones de tipo salen en cero). Necesita el ok de Felipe
- [ ] Felipe decide si se unifica el vocabulario en el resto del sistema: «Bajada al piso», «Retiro del piso», el módulo «Bajar al piso», el Punto de venta, Frescura (~170 menciones) y las acciones de Existencias («Colgar en el piso», «Subir a almacén») frente al proceso «Guardada en almacén»
- [ ] Mirar en producción con datos reales los tipos que la base local no tiene (devolución, cambio, dañado, traslado enviado) y ajustar si algo se ve raro
- [ ] Opcional: la fila que se despliega dentro de la lista (la de la maqueta); hoy el cajón cumple ese papel
- [ ] `pnpm datos:generar:produccion` NO hace falta (no hay tablas nuevas); las funciones cambiadas entran al diccionario al refrescar el volcado
