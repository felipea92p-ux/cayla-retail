# 2026-11-16 · El ayudante de la Mac contesta también a retail.cayla.pe

- **Qué:** el ayudante (`servidor.sh`) deja pasar `https://retail.cayla.pe`, el dominio propio del ERP; la primera pregunta de la boleta al
  ayudante espera 5 s (el aviso «acceso a la red local» de Chrome) en vez de 1,2 s.
- **Por qué:** en la Mac del piso de Trujillo el ayudante v3 respondía bien (`ticketera: true`), pero el ERP se abría desde
  `retail.cayla.pe` y el ayudante solo atendía a `cayla-retail.vercel.app`: la boleta salía por el cuadro (y las etiquetas igual).
- **Verificado:** prueba del ayudante con el origen nuevo (CORS) y `mac-etiquetas.test.ts`. Falta reinstalar el ayudante en la Mac.
