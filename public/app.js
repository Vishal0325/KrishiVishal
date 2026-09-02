// KrishiVishal Web Portal Logic

document.addEventListener('DOMContentLoaded', () => {
    // 1. Tab Switching
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            const targetElement = document.getElementById(`tab-${targetTab}`);
            if (targetElement) targetElement.classList.add('active');
        });
    });

    // 2. Master SKU Data Store (Syncable)
    const skus = [
        {
            skuCode: "FE-URE-GRN-46-050KG-IFF",
            name: "IFFCO Neem Coated Urea 50kg Bag",
            category: "FE",
            brand: "IFFCO (IFF)",
            pack: "50 KG",
            availableStock: 480,
            committedStock: 20,
            totalStock: 500,
            mrp: 266.50,
            price: 266.50,
            reorderLevel: 100,
            status: "IN_STOCK"
        },
        {
            skuCode: "FE-DAP-GRN-18-050KG-IFF",
            name: "IFFCO Di-Ammonium Phosphate (DAP) 50kg",
            category: "FE",
            brand: "IFFCO (IFF)",
            pack: "50 KG",
            availableStock: 220,
            committedStock: 10,
            totalStock: 230,
            mrp: 1350.00,
            price: 1350.00,
            reorderLevel: 50,
            status: "IN_STOCK"
        },
        {
            skuCode: "PE-GLY-LIQ-41-001LT-BAY",
            name: "Bayer Roundup Glyphosate 41% SL 1L",
            category: "PE",
            brand: "Bayer (BAY)",
            pack: "1 LT",
            availableStock: 12,
            committedStock: 4,
            totalStock: 16,
            mrp: 520.00,
            price: 475.00,
            reorderLevel: 25,
            status: "LOW_STOCK"
        },
        {
            skuCode: "PE-COR-LIQ-18-500ML-FMC",
            name: "FMC Coragen Chlorantraniliprole 18.5% SC 500ml",
            category: "PE",
            brand: "FMC (FMC)",
            pack: "500 ML",
            availableStock: 5,
            committedStock: 2,
            totalStock: 7,
            mrp: 2450.00,
            price: 2190.00,
            reorderLevel: 10,
            status: "CRITICAL_LOW"
        },
        {
            skuCode: "SE-WHT-HYB-00-040KG-MAH",
            name: "Mahyco Hybrid Wheat Seeds HD-2967 40kg",
            category: "SE",
            brand: "Mahyco (MAH)",
            pack: "40 KG",
            availableStock: 140,
            committedStock: 0,
            totalStock: 140,
            mrp: 1800.00,
            price: 1650.00,
            reorderLevel: 30,
            status: "IN_STOCK"
        },
        {
            skuCode: "NT-ZNC-POW-21-005KG-TCL",
            name: "Tata Paras Zinc Sulphate Heptahydrate 21% 5kg",
            category: "NT",
            brand: "Tata (TCL)",
            pack: "5 KG",
            availableStock: 3,
            committedStock: 1,
            totalStock: 4,
            mrp: 420.00,
            price: 380.00,
            reorderLevel: 15,
            status: "CRITICAL_LOW"
        }
    ];

    // 3. Batches Data
    const batches = [
        {
            batchNumber: "BTH-2026-001",
            skuCode: "FE-URE-GRN-46-050KG-IFF",
            warehouse: "WH-PURNEA-01 (R2-S1)",
            mfgDate: "15 Jan 2026",
            expiryDate: "14 Jan 2029",
            stock: 300,
            qualityStatus: "PASSED",
            priority: "FEFO-1 (Active)"
        },
        {
            batchNumber: "BTH-2026-002",
            skuCode: "FE-URE-GRN-46-050KG-IFF",
            warehouse: "WH-PURNEA-01 (R2-S2)",
            mfgDate: "01 Feb 2026",
            expiryDate: "31 Jan 2029",
            stock: 200,
            qualityStatus: "PASSED",
            priority: "FEFO-2"
        },
        {
            batchNumber: "BTH-GLY-2025-A",
            skuCode: "PE-GLY-LIQ-41-001LT-BAY",
            warehouse: "WH-PURNEA-01 (CHEM-01)",
            mfgDate: "10 Oct 2024",
            expiryDate: "09 Oct 2026",
            stock: 16,
            qualityStatus: "PASSED",
            priority: "FEFO-1 (< 45d Near Expiry)"
        }
    ];

    // 4. Ledger Movements
    const movements = [
        {
            time: "Just now",
            type: "ORDER_RESERVED",
            skuCode: "FE-URE-GRN-46-050KG-IFF",
            batch: "BTH-2026-001",
            qty: -2,
            availBefore: 482,
            availAfter: 480,
            committedBefore: 18,
            committedAfter: 20,
            refId: "ORD-984210",
            actor: "Customer Checkout"
        },
        {
            time: "10 mins ago",
            type: "PURCHASE_RECEIPT",
            skuCode: "FE-DAP-GRN-18-050KG-IFF",
            batch: "BTH-DAP-088",
            qty: +50,
            availBefore: 170,
            availAfter: 220,
            committedBefore: 10,
            committedAfter: 10,
            refId: "GRN-2026-042",
            actor: "Admin (Vishal)"
        },
        {
            time: "1 hour ago",
            type: "ORDER_COMPLETED",
            skuCode: "SE-WHT-HYB-00-040KG-MAH",
            batch: "BTH-WHT-009",
            qty: -5,
            availBefore: 140,
            availAfter: 140,
            committedBefore: 5,
            committedAfter: 0,
            refId: "ORD-984180",
            actor: "Rider Delivery OTP"
        }
    ];

    // Render Table Functions
    function renderSkuTable(filterCat = "ALL") {
        const tbody = document.getElementById('sku-table-body');
        if (!tbody) return;

        const filtered = filterCat === "ALL" ? skus : skus.filter(s => s.category === filterCat);
        tbody.innerHTML = filtered.map(sku => {
            const statusBadge = sku.availableStock <= 10 
                ? '<span class="badge badge-danger">Critical Low</span>'
                : sku.availableStock <= sku.reorderLevel 
                    ? '<span class="badge badge-warning">Low Stock</span>'
                    : '<span class="badge badge-success">In Stock</span>';

            return `
                <tr>
                    <td><span class="badge badge-sku">${sku.skuCode}</span></td>
                    <td><strong>${sku.name}</strong></td>
                    <td>${sku.brand}</td>
                    <td>${sku.pack}</td>
                    <td><strong>${sku.availableStock}</strong></td>
                    <td class="text-muted">${sku.committedStock}</td>
                    <td><span class="text-muted">₹${sku.mrp}</span> / <strong style="color:var(--primary);">₹${sku.price}</strong></td>
                    <td>${statusBadge}</td>
                </tr>
            `;
        }).join('');
    }

    function renderBatchTable() {
        const tbody = document.getElementById('batch-table-body');
        if (!tbody) return;

        tbody.innerHTML = batches.map(b => `
            <tr>
                <td><strong>${b.batchNumber}</strong></td>
                <td><span class="badge badge-sku">${b.skuCode}</span></td>
                <td>${b.warehouse}</td>
                <td>${b.mfgDate}</td>
                <td><strong style="color: ${b.expiryDate.includes('2026') ? 'var(--secondary-orange)' : 'var(--text-main)'}">${b.expiryDate}</strong></td>
                <td>${b.stock}</td>
                <td><span class="badge badge-success">${b.qualityStatus}</span></td>
                <td><span class="badge ${b.priority.includes('Near') ? 'badge-warning' : 'badge-info'}">${b.priority}</span></td>
            </tr>
        `).join('');
    }

    function renderLedgerTable() {
        const tbody = document.getElementById('ledger-table-body');
        if (!tbody) return;

        tbody.innerHTML = movements.map(m => `
            <tr>
                <td class="text-muted">${m.time}</td>
                <td><span class="badge ${m.type.includes('IN') || m.type.includes('RECEIPT') ? 'badge-success' : 'badge-info'}">${m.type}</span></td>
                <td><span class="badge badge-sku">${m.skuCode}</span></td>
                <td>${m.batch}</td>
                <td><strong>${m.qty > 0 ? '+' + m.qty : m.qty}</strong></td>
                <td>${m.availBefore} → <strong>${m.availAfter}</strong></td>
                <td class="text-muted">${m.committedBefore} → ${m.committedAfter}</td>
                <td><code>${m.refId}</code></td>
                <td>${m.actor}</td>
            </tr>
        `).join('');
    }

    // Category Filter Listener
    const catFilter = document.getElementById('category-filter');
    if (catFilter) {
        catFilter.addEventListener('change', (e) => renderSkuTable(e.target.value));
    }

    // Global Search Listener
    const searchInput = document.getElementById('global-search-input');
    const searchBtn = document.getElementById('search-btn');
    const searchResultBanner = document.getElementById('search-result-banner');

    function executeSearch() {
        const q = searchInput.value.trim().toUpperCase();
        if (!q) {
            searchResultBanner.classList.add('hidden');
            return;
        }

        const match = skus.find(s => s.skuCode.includes(q) || s.name.toUpperCase().includes(q));
        if (match) {
            searchResultBanner.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <span class="badge badge-sku">${match.skuCode}</span>
                        <h4 style="margin:4px 0; font-size:16px;">${match.name}</h4>
                        <p style="font-size:13px; color:var(--text-muted);">Pack: <strong>${match.pack}</strong> | Brand: <strong>${match.brand}</strong> | MRP: ₹${match.mrp} | Consumer Price: <strong style="color:var(--primary)">₹${match.price}</strong></p>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size:20px; font-weight:800; color:var(--primary-dark);">${match.availableStock} Available</div>
                        <span style="font-size:12px; color:var(--text-muted);">${match.committedStock} Reserved</span>
                    </div>
                </div>
            `;
            searchResultBanner.classList.remove('hidden');
        } else {
            searchResultBanner.innerHTML = `<p style="color:var(--error);"><i class="fa-solid fa-circle-exclamation"></i> No SKU or Barcode found matching '<strong>${q}</strong>'.</p>`;
            searchResultBanner.classList.remove('hidden');
        }
    }

    if (searchBtn) searchBtn.addEventListener('click', executeSearch);
    if (searchInput) searchInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') executeSearch();
    });

    // SKU Generator Live Calculation
    const genCat = document.getElementById('gen-cat');
    const genItem = document.getElementById('gen-item');
    const genVariety = document.getElementById('gen-variety');
    const genGrade = document.getElementById('gen-grade');
    const genSize = document.getElementById('gen-size');
    const genUnit = document.getElementById('gen-unit');
    const genBrand = document.getElementById('gen-brand');

    const skuPreview = document.getElementById('generated-sku-preview');
    const parentIdPreview = document.getElementById('generated-parent-id');

    function updateGeneratorPreview() {
        const cat = (genCat?.value || 'FE').padEnd(2, '0').slice(0, 2).toUpperCase();
        const item = (genItem?.value || 'URE').padEnd(3, '0').slice(0, 3).toUpperCase();
        const variety = (genVariety?.value || 'GRN').padEnd(3, '0').slice(0, 3).toUpperCase();
        const grade = (genGrade?.value || '00').padStart(2, '0').slice(-2).toUpperCase();
        const sizeStr = (genSize?.value || '50').toString().padStart(3, '0').slice(-3);
        const unit = (genUnit?.value || 'KG').padEnd(2, '0').slice(0, 2).toUpperCase();
        const brand = (genBrand?.value || 'IFF').padEnd(3, '0').slice(0, 3).toUpperCase();

        const skuCode = `${cat}-${item}-${variety}-${grade}-${sizeStr}${unit}-${brand}`;
        const parentId = `${cat}-${item}-${variety}-${brand}`;

        if (skuPreview) skuPreview.innerText = skuCode;
        if (parentIdPreview) parentIdPreview.innerText = parentId;
    }

    [genCat, genItem, genVariety, genGrade, genSize, genUnit, genBrand].forEach(el => {
        if (el) el.addEventListener('input', updateGeneratorPreview);
    });

    // Initial Renders
    renderSkuTable();
    renderBatchTable();
    renderLedgerTable();
    updateGeneratorPreview();
});
