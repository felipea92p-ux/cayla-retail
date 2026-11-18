## 2026-11-03 — Recibir ▸ el costo fuera de lo normal también pide confirmar sin aviso (ADR-0393)

Qué hice: un costo disparatado ya no entra sin aviso en un envío sin aviso (`20261103222000`), y la hoja de confirmar dice lo que cuesta hoy la prenda (`fn_costos_de_hoy`).
Por qué así: `sobrante_causa` NULL volvía NULL el filtro del regalo y el revisor nunca corría. La línea del filtro queda igual porque otra migración recargada la busca tal cual.
Verificado: `pruebas:envio-sin-aviso` 18/18 (S3b y S3c fallaban sin la migración), navegador con S/ 9 999 de punta a punta en Tienda Lima. En producción ningún costo quedó dañado. Sin probar: en un teléfono y con una colaboradora real.
