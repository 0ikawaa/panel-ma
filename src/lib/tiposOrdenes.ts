// Formas de los datos que devuelve /api/ventas-ml.
//
// Viven acá y no dentro del componente porque los comparten la pantalla de
// Órdenes y el panel de detalle; teniéndolos en un componente, el otro tendría
// que importar desde él y quedarían importándose en círculo.

export type ApiItem = {
  itemId: string;
  sku: string;
  title: string;
  qty: number;
  unitPrice: number;
  baseCost: number | null; // costo final: override de la API (tal cual) u Odoo×IVA
  overrideCost: number | null; // override manual local
  photo: string | null; // foto a mostrar: manual > MercadoLibre > Excel
};

export type ApiOrder = {
  orderId: string;
  packId: string | null;
  date: string;
  status: string;
  venta: number;
  comision: number;
  logisticType: string | null;
  shipCost: number | null;
  shipSave: number | null;
  envio: number;
  items: ApiItem[];
};

export type ApiResp = {
  orders: ApiOrder[];
  count: number;
  truncated: boolean;
  syncedAt: string;
};

/** Números derivados de una orden (lo que devuelve `metrics`). */
export type MetricasOrden = {
  venta: number;
  costo: number;
  hasCost: boolean;
  comision: number;
  envio: number;
  publi: number;
  margen: number;
  pct: number;
};
