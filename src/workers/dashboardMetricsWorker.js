self.onmessage = function(e) {
  const { allOrders, products, warehouses } = e.data;

  let totalOrders = 0;
  let totalRevenue = 0;
  let pendingDelivery = 0;
  let inventoryValue = 0;
  let lowStockCount = 0;
  let codCollection = 0;

  if (allOrders) {
    totalOrders = allOrders.length;
    allOrders.forEach(o => {
      totalRevenue += Number(o.totalAmount || 0);
      const s = o.status?.toLowerCase();
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

  self.postMessage({ totalOrders, totalRevenue, pendingDelivery, inventoryValue, lowStockCount, codCollection });
};
