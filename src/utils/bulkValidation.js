/**
 * Core validation logic for Bulk Product Upload
 */

export function validateRow(row) {
  let errors = [];
  
  const parseNum = (val, defaultVal = 0) => {
    const num = Number(val);
    return isNaN(num) ? defaultVal : num;
  };

  const mrp = parseNum(row.mrp);
  const price = parseNum(row.price);
  const costPrice = parseNum(row.costPrice);
  const stock = parseNum(row.stock);
  const gstRate = parseNum(row.gstRate);
  
  if (!row.parentSlug || !String(row.parentSlug).trim()) {
    errors.push("parentSlug is required");
  }
  if (!row.name || !String(row.name).trim()) {
    errors.push("Product name is required");
  }
  if (!row.brand || !String(row.brand).trim()) {
    errors.push("Brand is required");
  }
  if (!row.category || !String(row.category).trim()) {
    errors.push("Category is required");
  }
  if (!row.quantity || parseNum(row.quantity) <= 0) {
    errors.push("Valid quantity / pack size is required");
  }
  if (!row.unit || !String(row.unit).trim()) {
    errors.push("Unit is required");
  }

  // Price & Stock Validation
  if (mrp <= 0) errors.push("MRP must be > 0");
  if (price <= 0) errors.push("Selling price must be > 0");
  if (price > mrp) errors.push(`Selling price (₹${price}) cannot exceed MRP (₹${mrp})`);
  if (costPrice < 0) errors.push("Cost price cannot be negative");
  if (stock < 0) errors.push("Stock cannot be negative");

  // Category Specific Validation
  const category = String(row.category).trim();
  const unit = String(row.unit).trim().toLowerCase();

  if (category === "Seeds" || category === "Seed") {
    if (gstRate !== 0) errors.push("Seeds must have 0% GST");
    if (["ml", "l", "liter", "litre"].includes(unit)) {
      errors.push("Seeds cannot have liquid units (ml, L)");
    }
  } else if (["Insecticide", "Fungicide", "Herbicide"].includes(category)) {
    if (gstRate !== 18) errors.push(`${category} must have 18% GST`);
    if (!row.technicalName || !String(row.technicalName).trim()) {
      errors.push(`technicalName is mandatory for ${category}`);
    }
    if (!row.formulation || !String(row.formulation).trim()) {
      errors.push(`formulation type (EC/SC/WP, etc) is mandatory for ${category}`);
    }
  } else if (category === "Micronutrient") {
    if (gstRate !== 12) errors.push("Micronutrient must have 12% GST");
  }

  return {
    ...row,
    isValid: errors.length === 0,
    errors
  };
}

export function groupVariantsByParentSlug(validatedRows) {
  const grouped = {};
  
  validatedRows.forEach(row => {
    const slug = String(row.parentSlug).trim();
    if (!grouped[slug]) {
      grouped[slug] = [];
    }
    grouped[slug].push(row);
  });
  
  return grouped;
}
