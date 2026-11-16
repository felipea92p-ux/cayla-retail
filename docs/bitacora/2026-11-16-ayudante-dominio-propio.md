# 2026-11-16 · El ayudante de la Mac contesta también a retail.cayla.pe

- **Qué:** el ayudante (`servidor.sh`) deja pasar `https://retail.cayla.pe`, el dominio propio del ERP; la primera pregunta de la boleta al
  ayudante espera 5 s (el aviso «acceso a la red local» de Chrome) en vez de 1,2 s.
- **Por qué:** en la Mac del piso de Trujillo el ayudante v3 respondía bien (`ticketera: true`), pero el ERP se abría desde
  `retail.cayla.pe` y el ayudante solo atendía a `cayla-retail.vercel.app`: la boleta salía por el cuadro (y las etiquetas igual).
- **Verificado:** prueba del ayudante con el origen nuevo (CORS) y `mac-etiquetas.test.ts`. Falta reinstalar el ayudante en la Mac.
- **Más rápido y con aviso (Felipe: «no sale ninguna confirmación… la impresión es más lenta»):** la boleta va con sus propios estilos
  dentro del documento (el Chrome del ayudante ya no baja las hojas del ERP: 1,3–1,9 s → 0,5 s), el ayudante mira cada 0,1 s (antes 0,5)
  y tiene `GET /calentar` (v4): la web lo despierta al abrir el cobro, Venta registrada, el detalle, un cambio o un apartado, porque en
  frío el primer PDF tardaba 1,1 s y caliente 0,5. Medido en local: del clic a cerrar el detalle, 2,0 s → 0,8 s. Al salir por el
  ayudante dice «Ticket enviado a la ticketera» y el detalle de la venta se cierra solo.
