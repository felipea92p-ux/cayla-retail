## 📲 Celular del cliente y boleta por WhatsApp desde la caja (2026-10-03, ADR-0288 act. o) — solo web, sin migración; rama `claude/caja-trujillo-customer-number-3de645`

- [x] **A.** Celular opcional en «Registrar cliente» (Cobrar y Nueva cliente), con la regla de la base y la guía de foco (opcional; a medias frena el botón); el buscador precarga un celular escrito.
- [x] **B.** Celular en el paso Comprobante del cobro (boleta y factura), con el de la ficha ya puesto; es de esa boleta, no se guarda en la ficha; a medias frena el cobro.
- [ ] **DECIDIR A, B o las dos.** Recomendación: dejar solo B y quitar el campo de «Registrar cliente» (el buscador ya recibe «documento, celular o nombre»).
- [x] «Venta registrada»: tarjeta «Enviar por WhatsApp» (espera el PDF hasta 20 s; sin PDF → «se envía desde Comprobantes»; sandbox → no se ofrece). Pruebas: `lib/comprobante-whatsapp-reglas.test.ts` (11).
- [x] Probado en el navegador (escritorio y 375 px) con una pila Supabase propia; 313 archivos / 154.989 pruebas verdes; tipos y lint sin errores.
- [ ] **Actividad 2: guardar el celular en la ficha al cobrar** si el cliente no tenía (todos los registrados antes del 2026-10-03 no tienen). Propuesta: función `agregar_celular_clienta(p_id, p_celular)` que solo llena si está vacío y falla con `ya_tiene_celular` si no (el celular de una socia no se cambia en caja: le quitaría la publicidad). Lleva migración: esperar el OK de Felipe antes de pegarla en producción.
- [ ] Unificar los botones «WhatsApp» de Comprobantes (`ComprobantesPanel`, `OpcionesComprobante`) con `mensajeDelComprobante` y la regla del sandbox (hoy mandan el PDF aunque sea de pruebas).
- [ ] Probar con un PDF real de Lucode en producción y con el WhatsApp de la tienda abriéndose (aquí se simuló el PDF en la base; el enlace `wa.me` se verificó, no se abrió).
- [ ] Decidir si «se mandó» se guarda (auditoría de quién recibió qué boleta): hoy no hay registro; sería una tabla propia, no una columna en `comprobantes`.
- [ ] Mirar «Registrar cliente» y el campo de B a 375 px (la tarjeta de «Venta registrada» sí se midió) y la hoja de Clientas ▸ Nueva cliente en el navegador (comparte regla, no se abrió).
