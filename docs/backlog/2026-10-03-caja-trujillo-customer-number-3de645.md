## 📲 Celular del cliente y boleta por WhatsApp desde la caja (2026-10-03, ADR-0288 act. o) — solo web, sin migración; rama `claude/caja-trujillo-customer-number-3de645`

- [x] Celular opcional en el paso Comprobante del cobro (boleta y factura), con el de la ficha ya puesto; es de esa boleta, no se guarda en la ficha; a medias frena el cobro. **Decidido por Felipe (B)**; «Registrar cliente» sigue solo con el documento.
- [x] «Venta registrada»: tarjeta «Enviar por WhatsApp» (espera el PDF hasta 20 s; sin PDF → «se envía desde Comprobantes»; sandbox → no se ofrece). Pruebas: `lib/comprobante-whatsapp-reglas.test.ts` (11).
- [x] Probado en el navegador (escritorio y 375 px, sin desborde) con una pila Supabase propia; 320 archivos / 155.170 pruebas verdes; tipos y lint sin errores.
- [ ] **Actividad 2: guardar el celular en la ficha al cobrar** si el cliente no tenía (todos los registrados antes del 2026-10-03 no tienen; sin ella, B lo vuelve a pedir en la próxima compra). Propuesta: función `agregar_celular_clienta(p_id, p_celular)` que solo llena si está vacío y falla con `ya_tiene_celular` si no (el celular de una socia no se cambia en caja: le quitaría la publicidad). Lleva migración: esperar el OK de Felipe antes de pegarla en producción.
- [ ] Unificar los botones «WhatsApp» de Comprobantes (`ComprobantesPanel`, `OpcionesComprobante`) con `mensajeDelComprobante` y la regla del sandbox (hoy mandan el PDF aunque sea de pruebas).
- [ ] Probar con un PDF real de Lucode en producción y con el WhatsApp de la tienda abriéndose (aquí se simuló el PDF en la base; el enlace `wa.me` se verificó, no se abrió).
- [ ] Decidir si «se mandó» se guarda (auditoría de quién recibió qué boleta): hoy no hay registro; sería una tabla propia, no una columna en `comprobantes`.
