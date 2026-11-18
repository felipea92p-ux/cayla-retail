## Libro de Reclamaciones virtual (ADR-0679, 2026-11-18)

- [x] La hoja en la tienda, sin cuenta, con número correlativo por año, constancia imprimible y tope por conexión (`20261118145000`).
- [x] El enlace en la Ayuda del pie de toda página.
- [x] La copia por correo, enseguida y con reintentos cada 5 minutos (`20261118150000`, `/api/libro-copias`).
- [x] El módulo del ERP con el plazo de 15 días hábiles y los feriados (`20261118151000`).
- [x] Responder desde el ERP, confirmado, con su correo y en la constancia del cliente (`20261118152000`).
- [x] Lo que pidió la revisión legal (`20261118170000`): código del libro «LR-WEB-01», datos completos de quien representa a un menor, la casilla de conformidad, la línea de privacidad y la respuesta como «4. Observaciones y acciones adoptadas».
- [ ] **Felipe:** OK para pegar en producción las 5 migraciones, en orden (145000 → 150000 → 151000 → 152000 → 170000). La tienda en producción necesita además el usuario `tienda_web` ya existente.
- [ ] **Felipe:** crear la llave de Resend de la tienda y ponerla en Vercel (`TIENDA_RESEND_KEY`); sin ella, las copias quedan en cola.
- [ ] Revisión legal (sesión aparte): ajustar campos y textos a lo que exija; un abogado colegiado firma antes de publicar.
- [ ] Sumar los feriados nacionales sumados desde 2022 (6 de agosto, 9 de diciembre, 23 de julio, 7 de junio) cuando la revisión legal los confirme, y los de 2028 antes de que termine 2027.
- [ ] **Felipe:** confirmar con las ventas del año anterior que CAYLA no llega a 3 000 UIT (si llega, reporta al SIREC de Indecopi; no está construido).
- [ ] El abogado: copiar literalmente las leyendas del Anexo I y el aviso del Anexo II, y confirmar los 2 años de conservación.
- [ ] `/chaos` y `/formidable` de la pantalla del ERP y del formulario de la tienda, y una prueba con una colaboradora real.
