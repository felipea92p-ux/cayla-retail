# 2026-11-26 — La espera de las pantallas de entrar, sin la franja

- **Qué:** Entrar, Crear cuenta y las tres de volver a entrar tienen su propio `loading.tsx` (`components/cuenta/EsperaDeCuenta.tsx`):
  el logo solo y la forma del formulario que brilla (quieta con movimiento reducido). Antes caían en la espera de toda la tienda
  (`app/loading.tsx`), que dibujaba un instante la franja roja vacía y la cabecera con menú.
- **Por qué:** sigue a `2026-11-26-cuenta-sin-franja` (Felipe: «Sí, quítala»). Verificado en local con una pausa de 15 s en Entrar,
  a 1440 px, claro y oscuro: sin `.t-anuncio` en la espera.
