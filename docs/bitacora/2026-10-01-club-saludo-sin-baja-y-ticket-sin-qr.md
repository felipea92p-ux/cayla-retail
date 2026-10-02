## 2026-10-01 (el saludo sin la frase de la BAJA y el ticket sin QR del club)
Qué hice:
- Publiqué el saludo v2, sin «Sé que me doy de baja escribiendo BAJA.»: es la migración `20261001223000`, aplicada en producción.
- Saqué el QR del club del ticket impreso: `ReciboTermico`, `recibo-reglas`, `PuntoDeVenta` y `club-qr-reglas`, con sus pruebas.
- Ajusté el documento legal y la prueba `club_registro_cartel` al saludo v2.
- Registré la decisión en ADR-0288 act. (j).

Por qué así:
- `club_textos` no se edita (los permisos citan cada versión), así que el cambio va como versión nueva.
- Quien tenga la página abierta al publicarse ve «los textos cambiaron» y se une al recargar.
- Los avisos de la tienda conservan su «responde BAJA».

Felipe se lleva: un saludo más corto y un ticket con solo el QR de SUNAT. Falta imprimir un ticket real en la térmica.
