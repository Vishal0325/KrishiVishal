import { calculateOrderMetrics } from '../utils/revenueMetrics';

self.onmessage = function(e) {
  const { allOrders, products } = e.data;

  let totalOrders = 0;
  let pendingDelivery = 0;
  let inventoryValue = 0;
  let lowStockCount = 0;
  let codCollection = 0; // Preserved original definition

  if (allOrders) {
    totalOrders = allOrders.length;
    allOrders.forEach(o => {
      const s = o.status?.toLowerCase();
      // Preserved original definition for pending delivery
      if (s && !['delivered', 'cancelled'].includes(s)) {
        pendingDelivery++;
      }
    });
  }

  if (products) {
    products.forEach(p => {
      inventoryValue += (Number(p.price || 0) * Number(p.stock || 0));
      if (Number(p.stock || 0) <= 10) lowStockCount++;
    });
  }

  // Standardized Revenue & GMV Metrics calculation
  const revenueMetrics = calculateOrderMetrics(allOrders || []);

  self.postMessage({
    totalOrders,
    pendingDelivery,
    inventoryValue,
    lowStockCount,
    codCollection,
    ...revenueMetrics
  });
};
