---
name: skill-evaluacion-observabilidad
description: Audita la observabilidad del ERP — logs estructurados, métricas y trazas — de un módulo o de todo el sistema: ¿existe algo que mida y registre?, ¿una RPC o la integración con SUNAT/Lucode/apis.net.pe puede fallar sin que nadie se entere?, ¿hay `catch` que se traga el error, `console.*` sueltos, datos personales en logs, `fetch` sin tope de espera? Úsala al tocar integraciones externas, Server Actions o RPC, antes de optimizar nada («medir antes de optimizar») o cuando algo falló en una tienda y nadie supo por qué.
---

Audita la observabilidad de: $ARGUMENTS   (un archivo, un módulo, la integración `sunat`, o `todo`)

**Regla madre:** sin evidencia no hay decisión de rendimiento ni de confiabilidad: hay opinión. Esta skill busca *dónde el sistema no sabe
decir qué le pasó*. Y **Werner Vogels**: toda integración externa se diseña asumiendo que ya está caída; la frase «se degrada así, no pierde este
dato» tiene que existir, y la falla tiene que quedar **registrada con su causa** (principio 9). Solo auditas y propones. Fundamento:
`docs/investigacion/2026-10-03-arboles-ux-observabilidad.md`.

## Qué es y qué NO es observabilidad aquí

- **Auditoría de negocio ≠ observabilidad técnica.** `movimientos` (append-only) y la pantalla Actividad dicen *qué hizo la persona*. Observabilidad dice
  *cuánto tardó, qué falló y por qué*. Son complementarias: no marques «sin observabilidad» algo que solo es de auditoría, ni al revés.
- **El repo ya tiene envoltorios de RPC**: `exigir(...)` y `exigirOpcional(...)` (`lib/resultado.ts`, lanzan un error en idioma CAYLA) y `firmar(...)`
  (`lib/responsable-reglas.ts`, pone la firma del responsable). Esa es **la palanca**: medir y registrar dentro de ellos cubre cientos de llamadas a la
  vez. No propongas tocar cada llamada. El escáner ya las da por tratadas.
- **Datos personales** (DNI, RUC, teléfono, correo, nombre): nunca a un log (Ley 29733). Se registra el `id`, nunca el valor.
- **No instalar una plataforma APM completa de entrada.** Mínimo sensato: (1) logger estructurado, (2) `request_id` por petición, (3) duración y error
  de cada RPC y de cada llamada externa, (4) Core Web Vitals del navegador. Sentry/OpenTelemetry se evalúa *después*, con esa evidencia.

## Paso 1 — Medir

```bash
node scripts/rendimiento/observabilidad.mjs            # infraestructura + higiene de todo el repo
node scripts/rendimiento/observabilidad.mjs --json     # hallazgos con archivo:línea
```

**Infraestructura** (sí/no): logger estructurado · APM/errores · `instrumentation.ts` · Core Web Vitals · `request_id` · límites de error por segmento.
**Higiene** (AST): `console-suelto` · `catch-mudo` (vacío o solo `console`) · `rpc-descartada` (`await supabase.rpc(…);` sin mirar el resultado) ·
`rpc-ignora-error` (`{ data }` sin `error`: una falla se confunde con «no hay datos») · `fetch-sin-tope` (sin `signal`) ·
`dato-personal-en-log` · `accion-sin-rastro` (Server Action sin log, `throw` ni error). Son pistas: **cada una se confirma leyendo** el archivo.

## Paso 2 — Las cuatro preguntas (por cada módulo o integración auditada)

1. **¿Qué pasa cuando no responde?** Una frase escrita: «se degrada así, no pierde este dato». Si no se puede escribir, la integración no está terminada.
   Mira el mecanismo que ya existe (p. ej. la cola `vender/comprobantes/por-reintentar`) antes de proponer otro.
2. **¿Quedó registrada la causa?** Un comprobante que no salió tiene que distinguirse de uno que nunca se intentó, con el error del proveedor.
3. **¿Se puede reconstruir *esta* petición?** De la pantalla a la RPC a SUNAT con un mismo `request_id`. Hoy: no (verifica).
4. **¿Hay cifra?** p50/p95 de cada RPC crítica (`registrar_venta`, comprobantes), tasa de error, y Core Web Vitals en el mostrador. Sin cifra, «Vender está lento» es opinión.

## Paso 3 — Diseño mínimo a proponer (con el formato DECIDÍ/DESCARTÉ/SE ROMPE SI)

Una propuesta de observabilidad **estructural** se presenta con `DECIDÍ / DESCARTÉ / SE ROMPE SI` y espera aprobación de Felipe (afecta a más de un
módulo). Esqueleto de la pieza central, para que la propuesta sea concreta y no consultoría vacía:

```ts
// lib/registro.ts — UN módulo; el resto lo importa
export function registrar(nivel: "info"|"aviso"|"error", evento: string, campos: Record<string, string|number|boolean|null>) {
  // JSON de una línea: { t, nivel, evento, request_id, ...campos } — sin DNI/RUC/nombre/teléfono (solo ids)
}
```
Y el envoltorio de las RPC (donde ya viven `exigir`/`firmar`): medir `performance.now()` alrededor, registrar `{ rpc, ms, ok, codigo }`.

## Paso 4 — Informe

```
### <módulo / integración> — riesgo <alto|medio|bajo> (por qué: qué se pierde si falla en silencio)
- Hallazgo (tipo + archivo:línea) y cómo lo confirmé:
- Qué no sabríamos hoy si falla:
- Cambio mínimo: <diff corto o la pieza que se instrumenta>
- Verificación: <cómo se provoca la falla en local y dónde se ve el registro>
- Dato personal en juego: sí/no
```

Orden de riesgo: (1) lo que mueve dinero o valida legalmente (SUNAT/Lucode, cobro), (2) lo que toca stock, (3) lecturas. Cierra con objeción y «lo que no pidió».
Antes de decir «listo» responde con evidencia: concurrencia · caída externa · persona sin contexto.
