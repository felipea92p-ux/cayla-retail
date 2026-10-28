// «Tienda web» (ADR-0430) no lleva una puerta propia: cada pantalla pide SU módulo (el Resumen, en su página, «tienda_web» o, sin él,
// lleva a la primera del grupo que se ve; Pedidos, «pedidos_web»; Vitrina, «vitrina_web»; Recomendaciones, «recomendaciones»; Ajustes,
// «configuracion»). Así «Sin acceso» nombra la pantalla que se quiso abrir: con una puerta de grupo delante, quien abría Pedidos sin
// permiso leía «Tu rol no ve "Resumen de la tienda web"» (revisión funcional, 2026-10-16). Igual que Gestión (ADR-0392). El candado real
// sigue en la base.
export default function TiendaWebLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
