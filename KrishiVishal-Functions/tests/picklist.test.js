const assert = require('assert');

console.log('========================================================================');
console.log('--- TEST SUITE: STEP 2 - CONSOLIDATED WAREHOUSE PICK-LIST GENERATION ---');
console.log('========================================================================');

// 1. Mock 4 Orders with overlapping and distinct items
const mockOrders = [
  {
    id: 'ORD_2026_001',
    userName: 'Kisan Ramesh',
    warehouseName: 'Samastipur Central Hub',
    items: [
      { productId: 'FE-URE-50KG', productName: 'Organic Urea 50kg', variantLabel: '50kg Bag', quantity: 2, fulfillmentType: 'SELF_STOCK', category: 'Fertilizers' },
      { productId: 'PE-AMI-250ML', productName: 'Amistar Fungicide 250ml', variantLabel: '250ml Bottle', quantity: 1, fulfillmentType: 'SELF_STOCK', category: 'Fungicides' }
    ]
  },
  {
    id: 'ORD_2026_002',
    userName: 'Kisan Suresh',
    warehouseName: 'Samastipur Central Hub',
    items: [
      { productId: 'FE-URE-50KG', productName: 'Organic Urea 50kg', variantLabel: '50kg Bag', quantity: 3, fulfillmentType: 'SELF_STOCK', category: 'Fertilizers' },
      { productId: 'IN-COR-060ML', productName: 'Coragen Insecticide 60ml', variantLabel: '60ml Bottle', quantity: 2, fulfillmentType: 'SELF_STOCK', category: 'Insecticides' }
    ]
  },
  {
    id: 'ORD_2026_003',
    userName: 'Kisan Mahesh',
    warehouseName: 'Samastipur Central Hub',
    items: [
      { productId: 'SE-TOM-100GM', productName: 'Hybrid Tomato Seeds 100g', variantLabel: '100g Pouch', quantity: 4, fulfillmentType: 'ON_DEMAND', category: 'Seeds' },
      { productId: 'PE-AMI-250ML', productName: 'Amistar Fungicide 250ml', variantLabel: '250ml Bottle', quantity: 2, fulfillmentType: 'SELF_STOCK', category: 'Fungicides' }
    ]
  },
  {
    id: 'ORD_2026_004',
    userName: 'Kisan Dinesh',
    warehouseName: 'Samastipur Central Hub',
    items: [
      { productId: 'FE-URE-50KG', productName: 'Organic Urea 50kg', variantLabel: '50kg Bag', quantity: 5, fulfillmentType: 'SELF_STOCK', category: 'Fertilizers' }
    ]
  }
];

function generateConsolidatedPickListData(orders) {
  const summaryMap = new Map();
  let totalOrderUnits = 0;

  orders.forEach(order => {
    const orderShortId = `#${order.id?.slice(-6)?.toUpperCase() || 'ORD'}`;
    const items = order.items || [];
    items.forEach(item => {
      const key = `${item.productId || item.productName}_${item.variantLabel || 'default'}`;
      const qty = Number(item.quantity) || 1;
      totalOrderUnits += qty;

      if (!summaryMap.has(key)) {
        summaryMap.set(key, {
          productId: item.productId,
          productName: item.productName,
          variantLabel: item.variantLabel,
          category: item.category,
          fulfillmentType: item.fulfillmentType || 'SELF_STOCK',
          totalQuantity: 0,
          ordersList: []
        });
      }

      const entry = summaryMap.get(key);
      entry.totalQuantity += qty;
      entry.ordersList.push(`${orderShortId} (${qty})`);
    });
  });

  const sortedItems = Array.from(summaryMap.values()).sort((a, b) => {
    if (a.fulfillmentType !== b.fulfillmentType) {
      return a.fulfillmentType === 'SELF_STOCK' ? -1 : 1;
    }
    return a.productName.localeCompare(b.productName);
  });

  return {
    totalOrders: orders.length,
    uniqueSKUs: summaryMap.size,
    totalUnits: totalOrderUnits,
    items: sortedItems
  };
}

// Test 1: Total Units and Unique SKUs consolidation
{
  const pickList = generateConsolidatedPickListData(mockOrders);
  assert.strictEqual(pickList.totalOrders, 4);
  assert.strictEqual(pickList.uniqueSKUs, 4); // Urea, Amistar, Coragen, Tomato Seeds
  // Total units: (2+3+5 Urea) + (1+2 Amistar) + (2 Coragen) + (4 Tomato) = 10 + 3 + 2 + 4 = 19
  assert.strictEqual(pickList.totalUnits, 19);
  console.log(`PASS: Test 1 - Correctly aggregated 19 units across 4 unique SKUs for 4 orders.`);
}

// Test 2: Quantity and Order references mapping
{
  const pickList = generateConsolidatedPickListData(mockOrders);
  const urea = pickList.items.find(i => i.productId === 'FE-URE-50KG');
  assert(urea, 'Urea item should be present in pick-list');
  assert.strictEqual(urea.totalQuantity, 10, 'Urea should sum to 10 bags');
  assert.strictEqual(urea.ordersList.length, 3, 'Urea is requested in 3 orders');
  assert(urea.ordersList.includes('#26_001 (2)'));
  assert(urea.ordersList.includes('#26_002 (3)'));
  assert(urea.ordersList.includes('#26_004 (5)'));
  console.log('PASS: Test 2 - SKU aggregate quantity (10 bags) & Order references matched exactly.');
}

// Test 3: Prioritizing Self-Stock before On-Demand
{
  const pickList = generateConsolidatedPickListData(mockOrders);
  assert.strictEqual(pickList.items[0].fulfillmentType, 'SELF_STOCK');
  assert.strictEqual(pickList.items[pickList.items.length - 1].fulfillmentType, 'ON_DEMAND');
  console.log('PASS: Test 3 - Self-Stock items correctly grouped first for rapid warehouse shelf-picking.');
}

console.log('========================================================================');
console.log('ALL 3/3 CONSOLIDATED PICK-LIST E2E TESTS PASSED SUCCESSFULLY! ✅');
console.log('========================================================================');
