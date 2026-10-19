## Tienda minimalista y siempre una tienda (ADR-0455)

- [ ] **Probar «Separar» de punta a punta** con una cuenta de la pila de clientes (buzón en http://127.0.0.1:58424): la bolsa, la tienda elegida y el mensaje de WhatsApp con la nueva cabecera.
- [ ] **Probar el favorito con una cuenta real:** que el corazón vuele hasta «Entrar»/«Cuenta» y que «Favoritos» salga en su menú con su número; en el celular, el vuelo va al ícono de la cuenta.
- [ ] **Capturas a 375 px** de Inicio, catálogo, ficha, bolsa, entrar y crear cuenta (lo pide la plantilla del PR; las hechas fueron a 390, 360 y 320 px).
- [ ] **Google en producción:** el botón sale solo con `NEXT_PUBLIC_TIENDA_GOOGLE=si`; falta configurar el proveedor.
- [ ] **Decisión de Felipe:** el precio es el de la tienda elegida (por defecto Arequipa, la primera en orden alfabético): ¿se prefiere otra tienda por defecto o la más cercana?
- [ ] **Decisión de Felipe (resuelta 2026-10-19):** el botón «Arma tu look personalizado» sale siempre; si no hay prendas que probar, el probador lo dice. ¿Se vuelve a esconder?
- [ ] Las páginas de ayuda para quien no tiene sesión (Cómo separar, Nuestras tiendas) conservan la cabecera de 4 opciones; ¿se llevan también al estilo de Entrar?
- [ ] La cabecera que se ve mientras carga una página (esqueleto) no se ajustó; puede haber un pequeño salto.
- [ ] Limpiar el CSS que quedó sin uso (`.t-circs*`, `.t-ubic*`, `.t-filtro-tienda`, `.ae*` del probador).
