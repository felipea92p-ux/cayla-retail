// «Ventas de hoy» firma cada venta con la integrante que la hizo — Xstore lo llama
// "Associate"; sin la firma, los objetivos por integrante se miden a mano. Se lee el
// primer nombre, y solo si dos integrantes del día comparten primer nombre se agrega la
// inicial del apellido (o el apellido entero, si hasta la inicial coincide): lo justo
// para distinguirlas, nada más.
//
// `fn_ventas_del_dia` devuelve `vendedor` como "nombres apellidos" y, cuando no hay
// persona, el relleno «—» — eso no es una integrante y no se pinta. Puro y probado solo.

const SIN_INTEGRANTE = new Set(["", "—"]);

/** Nombre completo → nombre corto, solo para los nombres que sí son una integrante. */
export function nombresCortos(nombresCompletos: (string | null | undefined)[]): Map<string, string> {
  const partesDe = new Map<string, string[]>();
  for (const n of nombresCompletos) {
    if (n == null) continue;
    const partes = n.trim().split(/\s+/);
    if (partes.length === 0 || SIN_INTEGRANTE.has(partes[0])) continue;
    partesDe.set(n, partes);
  }

  // Cuántas integrantes DISTINTAS comparten cada primer nombre y cada "nombre + inicial".
  const distintas = new Set(Array.from(partesDe.values()).map((p) => p.join(" ")));
  const porPrimerNombre = new Map<string, number>();
  const porNombreEInicial = new Map<string, number>();
  for (const completo of distintas) {
    const [primero, segundo] = completo.split(" ");
    porPrimerNombre.set(primero, (porPrimerNombre.get(primero) ?? 0) + 1);
    const clave = `${primero} ${segundo?.[0] ?? ""}`;
    porNombreEInicial.set(clave, (porNombreEInicial.get(clave) ?? 0) + 1);
  }

  const cortos = new Map<string, string>();
  for (const [original, partes] of partesDe) {
    const [primero, segundo] = partes;
    if (!segundo || (porPrimerNombre.get(primero) ?? 0) <= 1) {
      cortos.set(original, primero);
    } else if ((porNombreEInicial.get(`${primero} ${segundo[0]}`) ?? 0) <= 1) {
      cortos.set(original, `${primero} ${segundo[0]}.`);
    } else {
      cortos.set(original, `${primero} ${segundo}`);
    }
  }
  return cortos;
}
