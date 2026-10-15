## 🛍️ Tienda online en producción (2026-10-15) — lo que falta después del primer día

- [ ] **Direcciones del proyecto de clientes** (paso 8 de la guía): «Site URL» `https://cayla-tienda.vercel.app/nueva-contrasena` y «Redirect
  URLs» `https://cayla-tienda.vercel.app/**`. Sin esto, el enlace de «Olvidé mi contraseña» lleva a una página que no existe.
- [ ] **`TIENDA_URL` en el proyecto del ERP en Vercel** (paso 9): `https://cayla-tienda.vercel.app` y volver a publicar el ERP; sin esto,
  «Restablecer acceso» en la ficha de un cliente dice que no encuentra la tienda.
- [ ] **Configuración ▸ Tienda web:** Lima no puede verse en la web hasta tener su WhatsApp cargado.
- [ ] **`TIENDA_FOTOS_ORIGEN` en Vercel:** averiguar por qué llegaba a la tienda al funcionar y no al compilar (¿el candado?). Con este PR
  las fotos ya no dependen de ella en producción.
- [ ] **El plan gratis de Supabase pausa el proyecto de clientes tras 7 días sin uso:** sumar un saludo diario a la tarea
  `/api/cuentas-cerradas`, o pasar a Pro cuando la tienda despegue.
- [ ] **El pooler en modo sesión** reserva una conexión por cada conexión de la tienda (hasta 3 por instancia de Vercel): mirar el tope
  de conexiones si un día hay muchas visitas a la vez.
- [ ] **El catálogo, siguiente cuello:** `fn_precio_en_sede` se llama una vez por talla (14 922 veces, ~0,5 s de 1,2 s). Si el catálogo
  crece mucho, calcular el precio por sede en una sola pasada.
- [ ] **La boleta real por Lucode:** solo con el OK de Felipe y del contador.
- [ ] **`pnpm datos:generar:produccion` y `pnpm datos:comparar`** con las 40 migraciones de la tienda ya en producción.
- [ ] **El correo de «Cambió el correo de tu cuenta»** dice «escríbenos a caylaperu@gmail.com»: ¿pasarlo a una dirección `@cayla.pe`?
