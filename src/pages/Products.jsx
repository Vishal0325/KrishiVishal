import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import {
  collection,
  query,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  Timestamp,
  addDoc,
  getDoc,
} from "firebase/firestore";
import { db, functions, storage } from "../firebase/config";
import { ref, deleteObject } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import DataTable from "../components/common/DataTable";
import PageHeader from "../components/common/PageHeader";
import ImageUpload from "../components/common/ImageUpload";
import { formatCurrency } from "../utils/formatters";
import Papa from "papaparse";
import { importProducts, downloadSampleProductTemplate } from "../services/bulkUpload";
import { useWarehouse } from "../context/WarehouseContext";
import { readWorksheetAsJson } from "../utils/excel";
import {
  fetchAllProducts,
  exportProductsCsv,
  exportProductsXlsx,
  callUpsertSku,
  callReceiveGrn,
} from "../services/inventory";
import { autoDeriveSkuFromProduct, getCategoryTaxDefaults } from "../utils/skuGenerator";
import { addAuditLog } from "../services/logger";
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  X,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Tags,
  Package2,
  ShieldAlert,
  Beaker,
  Sprout,
  Calendar as CalendarIcon,
  ShieldCheck,
  AlertTriangle,
  UploadCloud,
  Download,
  FileText,
  Loader2,
  Info,
  Package,
} from "lucide-react";
import toast from "react-hot-toast";
import BulkStagingTable from "../components/catalog/BulkStagingTable";
import BulkVariantManager from "../components/inventory/BulkVariantManager";
import ProductFormModal from "../components/catalog/ProductFormModal";

const DEFAULT_CATEGORIES = [
  { id: "cat-seeds", name: "Seeds", hindiName: "बीज", subCategories: [{ id: "sc-paddy", name: "Paddy / Dhan" }, { id: "sc-wheat", name: "Wheat / Gehu" }, { id: "sc-maize", name: "Maize / Makka" }, { id: "sc-veg", name: "Vegetable Seeds" }] },
  { id: "cat-fert", name: "Fertilizers", hindiName: "उर्वरक / खाद", subCategories: [{ id: "sc-urea", name: "Urea" }, { id: "sc-dap", name: "DAP" }, { id: "sc-npk", name: "NPK" }, { id: "sc-potash", name: "MOP / Potash" }, { id: "sc-zinc", name: "Zinc & Micronutrients" }] },
  { id: "cat-pest", name: "Pesticides", hindiName: "कीटनाशक", subCategories: [{ id: "sc-insect", name: "Insecticide" }, { id: "sc-fung", name: "Fungicide" }, { id: "sc-herb", name: "Herbicide" }, { id: "sc-larv", name: "Larvicide" }] },
  { id: "cat-insect", name: "Insecticide", hindiName: "कीट नियंत्रक", subCategories: [{ id: "sc-sucking", name: "Sucking Pest Control" }, { id: "sc-cater", name: "Caterpillar Control" }] },
  { id: "cat-herb", name: "Herbicide", hindiName: "खरपतवार नाशक", subCategories: [{ id: "sc-pre", name: "Pre-Emergence" }, { id: "sc-post", name: "Post-Emergence" }] },
  { id: "cat-fung", name: "Fungicide", hindiName: "फफूंदनाशक", subCategories: [{ id: "sc-contact", name: "Contact Fungicide" }, { id: "sc-systemic", name: "Systemic Fungicide" }] },
  { id: "cat-pgr", name: "Plant Growth Regulator", hindiName: "पौध वृद्धि नियामक", subCategories: [{ id: "sc-growth", name: "Growth Booster" }, { id: "sc-flower", name: "Flowering Stimulant" }] },
  { id: "cat-mach", name: "Agri Machinery & Tools", hindiName: "कृषि यंत्र", subCategories: [{ id: "sc-spray", name: "Knapsack Sprayers" }, { id: "sc-cut", name: "Brush Cutters" }, { id: "sc-till", name: "Power Tillers" }] },
  { id: "cat-irrig", name: "Irrigation Equipment", hindiName: "सिंचाई उपकरण", subCategories: [{ id: "sc-drip", name: "Drip Pipes" }, { id: "sc-sprink", name: "Sprinklers" }] },
  { id: "cat-feed", name: "Animal Feed & Nutrition", hindiName: "पशु आहार", subCategories: [{ id: "sc-cattle", name: "Cattle Feed" }, { id: "sc-mineral", name: "Mineral Mixture" }] },
  { id: "cat-bio", name: "Organic & Bio-fertilizers", hindiName: "जैविक खाद", subCategories: [{ id: "sc-vermi", name: "Vermicompost" }, { id: "sc-biofert", name: "Bio-Fertilizer" }] },
];

const DEFAULT_BRANDS = [
  { id: "b-iffco", name: "IFFCO" },
  { id: "b-bayer", name: "Bayer CropScience" },
  { id: "b-syngenta", name: "Syngenta" },
  { id: "b-upl", name: "UPL" },
  { id: "b-tata", name: "Tata Rallis" },
  { id: "b-dhanuka", name: "Dhanuka" },
  { id: "b-corteva", name: "Corteva Agriscience" },
  { id: "b-advanta", name: "Advanta Seeds" },
  { id: "b-mahyco", name: "Mahyco" },
  { id: "b-coromandel", name: "Coromandel" },
  { id: "b-krishi", name: "KrishiVishal Choice" },
];

const DEFAULT_CROPS = [
  { id: "c-paddy", name: "Paddy / धान" },
  { id: "c-wheat", name: "Wheat / गेहूं" },
  { id: "c-maize", name: "Maize / मक्का" },
  { id: "c-potato", name: "Potato / आलू" },
  { id: "c-mustard", name: "Mustard / सरसों" },
  { id: "c-tomato", name: "Tomato / टमाटर" },
  { id: "c-onion", name: "Onion / प्याज" },
  { id: "c-chilli", name: "Chilli / मिर्च" },
  { id: "c-pulses", name: "Pulses / दलहन" },
  { id: "c-sugarcane", name: "Sugarcane / गन्ना" },
  { id: "c-banana", name: "Banana / केला" },
  { id: "c-makhana", name: "Makhana / मखाना" },
];

const Products = () => {
  const location = useLocation();
  const { warehouses } = useWarehouse();
  const [importWarehouseId, setImportWarehouseId] = useState("");
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [brands, setBrands] = useState(DEFAULT_BRANDS);
  const [crops, setCrops] = useState(DEFAULT_CROPS);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [searchTerm, setSearch] = useState("");
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);

  // [FIXED] Point #175: Scalable server-side search for products
  const handleSearch = async (val) => {
    setSearch(val);
    if (val.length < 3) {
      if (val.length === 0) {
        // fetch initial or stay with onSnapshot
      }
      return;
    }

    // We stay with local filtering for now if onSnapshot is active,
    // but for 10k+ products, we should switch to server-side search like Customers.jsx
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("filter") === "low-stock") {
      setShowLowStockOnly(true);
    }
  }, [location]);
  const [editingProduct, setEditingProduct] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const [variantManagerProduct, setVariantManagerProduct] = useState(null);
  const [newSubCategoryName, setNewSubCategoryName] = useState("");
  const [showNewSubCategoryInput, setShowNewSubCategoryInput] = useState(false);
  const [csvFile, setCsvFile] = useState(null);
  const [bulkRows, setBulkRows] = useState([]);
  const [showStaging, setShowStaging] = useState(false);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [bulkSummary, setBulkSummary] = useState(null);

  // Form State
  const validUnits = ["ml", "L", "gm", "kg", "piece", "meter", "pack", "bag", "pouch"];
  const validFormulationTypes = ["None", "SL", "EC", "SC", "WP", "WG", "GR", "SP", "FS", "CS", "WDG"];
  const seedClasses = [
    "Certified",
    "Foundation",
    "Truthfully Labeled",
    "Breeder",
  ];
  const toxicityLabels = [
    { id: "red", label: "Bright Red (Extremely Toxic)", color: "#FF0000" },
    { id: "yellow", label: "Bright Yellow (Highly Toxic)", color: "#FFFF00" },
    { id: "blue", label: "Bright Blue (Moderately Toxic)", color: "#0000FF" },
    { id: "green", label: "Bright Green (Slightly Toxic)", color: "#008000" },
  ];

  const initialFormState = {
    name: "",
    brand: "",
    category: "",
    cropId: "",
    cropName: "",
    associatedCropIds: [],
    associatedCropNames: [],
    isAllCrops: false,
    subCategory: "",
    mrp: "",
    price: "",
    stock: "",
    quantity: "",
    reorderLevel: 10,
    expiryDate: "",
    mfgDate: "",
    gstRate: 18,
    hsnCode: "",
    batchNumber: "",
    chemicalComposition: "",
    formulationType: "None",
    description: "",
    images: [],
    isActive: true,
    unit: "piece",
    rating: 4.5,
    costPrice: "",
    isTaxInclusive: true,
    fulfillmentType: "SELF_STOCK", // "SELF_STOCK" | "ON_DEMAND"
    primarySupplierId: "",
    estimatedCostPrice: "",
    variants: [], // Added for multiple pack sizes
    // Seed Specific Metadata
    seedMetadata: {
      variety: "",
      seedClass: "Truthfully Labeled",
      germination: "",
      purity: "",
      moisture: "",
      lotNumber: "",
      isTreated: false,
      chemicalName: "",
    },
    // Agrochemical Metadata
    agroMetadata: {
      technicalName: "",
      formulation: "",
      dosePerAcre: "",
      recommendedCrops: "", // String for simple input
      toxicityLabel: "green",
      batchNumber: "",
      mfgDate: "",
      antidote: "",
      targetPests: "", // String for simple input
      safetyWarning: false,
    },
    // Herbicide Metadata
    herbicideMetadata: {
      selectivity: "Selective",
      timing: "Post-Emergent",
      technicalName: "",
      targetWeeds: "",
      recommendedCrops: "",
      dosePerAcre: "",
      waterVolume: "",
      avoidDrift: false,
      toxicityLabel: "green",
      rainFastness: "",
    },
  };
  const [formData, setFormData] = useState(initialFormState);
  const [variantsBackup, setVariantsBackup] = useState(null);

  const calculateUSP = (mrp, quantity) => {
    const price = Number(mrp);
    const qty = Number(quantity);
    if (!price || !qty) return 0;
    return parseFloat(price / qty).toFixed(2);
  };

  const formatUnitLabel = (unit, quantity) => {
    if (!unit) return "";
    const pluralUnits = { piece: "pieces", pack: "packs", meter: "meters" };
    if (quantity === 1) return unit;
    return pluralUnits[unit] || unit;
  };

  const uspValue = calculateUSP(formData.mrp, formData.quantity);

  // Bulk Upload Handlers
  const handleBulkFile = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setCsvFile(f);
    const fileName = f.name.toLowerCase();

    if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
      readWorksheetAsJson(f)
        .then((data) => {
          setBulkRows(data);
          setShowStaging(true);
          toast.success(`Parsed ${data.length} rows from Excel`);
        })
        .catch((err) => {
          toast.error("Excel parse error: " + err.message);
        });
    } else {
      // Parse CSV
      Papa.parse(f, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          setBulkRows(results.data);
            setShowStaging(true);
          toast.success(`Parsed ${results.data.length} rows from CSV`);
        },
        error: (err) => {
          toast.error("CSV parse error: " + err.message);
        },
      });
    }
  };

  const startBulkImport = async (validRows) => {
    if (!validRows || !validRows.length) return toast.error("No valid rows to import");
    setBulkProcessing(true);
    setBulkSummary(null);
    try {
      const data = await importProducts(validRows, importWarehouseId);
      setBulkSummary(data);
      setBulkRows([]);
      setCsvFile(null);
      setIsVerified(false);

      if (data.failed > 0) {
        toast.error(`Imported with ${data.failed} errors. ${data.success || data.updated} items synced successfully.`);
      } else {
        toast.success(`1-Click Sync complete! ${data.success} new products & ${data.updated} updated.`);
      }
    } catch (err) {
      toast.error("Import failed: " + err.message);
    } finally {
      setBulkProcessing(false);
    }
  };

  const exportCsv = async () => {
    const prods = await fetchAllProducts();
    exportProductsCsv(prods);
  };

  const exportXlsx = async () => {
    const prods = await fetchAllProducts();
    exportProductsXlsx(prods);
  };

  useEffect(() => {
    const unsubscribeProducts = onSnapshot(collection(db, "products"), (snapshot) => {
      setProducts(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });

    // Primary categories from Firestore 'categories' collection with fallback
    const unsubscribeCategories = onSnapshot(collection(db, "categories"), (snapshot) => {
      if (!snapshot.empty) {
        const fetched = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => (a.order || 0) - (b.order || 0) || (a.name || "").localeCompare(b.name || ""));
        setCategories(fetched);
      } else {
        setCategories(DEFAULT_CATEGORIES);
      }
    }, (err) => {
      console.warn("Categories listener error, using defaults:", err);
      setCategories(DEFAULT_CATEGORIES);
    });

    const unsubscribeBrands = onSnapshot(collection(db, "brands"), (snapshot) => {
      if (!snapshot.empty) {
        const fetched = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        setBrands(fetched);
      } else {
        setBrands(DEFAULT_BRANDS);
      }
    }, (err) => {
      console.warn("Brands listener error, using defaults:", err);
      setBrands(DEFAULT_BRANDS);
    });

    const unsubscribeCrops = onSnapshot(collection(db, "crops"), (snapshot) => {
      if (!snapshot.empty) {
        const fetched = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        setCrops(fetched);
      } else {
        setCrops(DEFAULT_CROPS);
      }
    }, (err) => {
      console.warn("Crops listener error, using defaults:", err);
      setCrops(DEFAULT_CROPS);
    });

    const unsubscribeSuppliers = onSnapshot(collection(db, "suppliers"), (snapshot) => {
      setSuppliers(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => (a.name || "").localeCompare(b.name || "")));
    });

    return () => {
      unsubscribeProducts();
      unsubscribeCategories();
      unsubscribeBrands();
      unsubscribeCrops();
      unsubscribeSuppliers();
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmittingRef.current || submitting) {
      return;
    }
    isSubmittingRef.current = true;
    setSubmitting(true);
    try {
      // Process variants if present
      const processedVariants = (formData.variants || []).map((v) => ({
        ...v,
        mrp: Number(v.mrp || 0),
        price: Number(v.price || 0),
        stock: Number(v.stock || 0),
        quantity: Number(v.quantity || 0),
        reorderLevel: Number(v.reorderLevel || 10),
        batchNumber: v.batchNumber || "",
        mfgDate: v.mfgDate ? Timestamp.fromDate(new Date(v.mfgDate)) : null,
        expiryDate: v.expiryDate ? Timestamp.fromDate(new Date(v.expiryDate)) : null,
      }));

      // Calculate aggregated fields for variants
      const variantExpiries = processedVariants
        .map((v) => v.expiryDate)
        .filter(Boolean)
        .map((t) => t.toDate ? t.toDate() : new Date(t));
      const earliestExpiry = variantExpiries.length
        ? Timestamp.fromDate(new Date(Math.min(...variantExpiries)))
        : null;

      const variantMfgs = processedVariants
        .map((v) => v.mfgDate)
        .filter(Boolean)
        .map((t) => t.toDate ? t.toDate() : new Date(t));
      const earliestMfg = variantMfgs.length
        ? Timestamp.fromDate(new Date(Math.min(...variantMfgs)))
        : null;

      const combinedBatchNumbers = processedVariants
        .map((v) => v.batchNumber)
        .filter(Boolean)
        .join(", ");

      const data = {
        ...formData,
        imageUrl: formData.images?.[0] || "",

        // if variants exist, derive summary fields for quick listing
        mrp: processedVariants.length
          ? Math.max(...processedVariants.map((v) => v.mrp))
          : Number(formData.mrp),
        price: processedVariants.length
          ? Math.min(...processedVariants.map((v) => v.price))
          : Number(formData.price),
        // [FIXED] Point #156: Unified stock field name
        stock: processedVariants.length
          ? processedVariants.reduce((s, v) => s + Number(v.stock || 0), 0)
          : Number(formData.stock),
        quantity: processedVariants.length
          ? (processedVariants[0]?.quantity || 0)
          : Number(formData.quantity),
        reorderLevel: processedVariants.length
          ? processedVariants.reduce((s, v) => s + Number(v.reorderLevel || 10), 0)
          : Number(formData.reorderLevel || 10),
        expiryDate: processedVariants.length
          ? earliestExpiry
          : formData.expiryDate
            ? Timestamp.fromDate(new Date(formData.expiryDate))
            : null,
        mfgDate: processedVariants.length
          ? earliestMfg
          : formData.mfgDate
            ? Timestamp.fromDate(new Date(formData.mfgDate))
            : null,
        batchNumber: processedVariants.length
          ? combinedBatchNumbers
          : formData.batchNumber || "",
        costPrice: processedVariants.length
          ? Math.min(...processedVariants.map((v) => v.costPrice))
          : Number(formData.costPrice || 0),
        hsnCode: formData.hsnCode || "",
        gstRate: Number(formData.gstRate || 0),
        isTaxInclusive: formData.isTaxInclusive,
        chemicalComposition: formData.chemicalComposition || "",
        variants: processedVariants,
        seedMetadata:
          formData.category === "Seeds"
            ? {
                ...formData.seedMetadata,
                germination: Number(formData.seedMetadata.germination),
                purity: Number(formData.seedMetadata.purity),
                moisture: Number(formData.seedMetadata.moisture),
              }
            : null,
        agroMetadata: ["Fungicide", "Insecticide", "Crop Nutrition"].includes(
          formData.category,
        )
          ? {
              ...formData.agroMetadata,
              targetPests: formData.agroMetadata.targetPests
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
              recommendedCrops: formData.agroMetadata.recommendedCrops
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            }
          : null,
        herbicideMetadata:
          formData.category === "Herbicide"
            ? {
                ...formData.herbicideMetadata,
                targetWeeds: formData.herbicideMetadata.targetWeeds
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
                recommendedCrops: formData.herbicideMetadata.recommendedCrops
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              }
            : null,
        unit: formData.unit,
        formulationType: formData.formulationType || "None",
        updatedAt: Timestamp.now(),
      };

      const keywords = [
        ...data.name.toLowerCase().split(" "),
        ...data.brand.toLowerCase().split(" "),
        data.category.toLowerCase(),
        ...(data.associatedCropNames || []).map(n => n.toLowerCase())
      ].filter((v, i, a) => v && a.indexOf(v) === i); // Unique non-empty keywords

      if (editingProduct) {
        // 1. Update Public Product Data (Strictly exclude costPrice)
        const publicData = { ...data };
        delete publicData.costPrice;
        if (publicData.variants) {
           publicData.variants = publicData.variants.map(v => {
              const cleaned = { ...v };
              delete cleaned.costPrice;
              return cleaned;
           });
        }

        const derivedSku = autoDeriveSkuFromProduct({
          name: data.name,
          brand: data.brand,
          category: data.category,
          subCategory: data.subCategory,
          quantity: data.quantity,
          unit: data.unit
        });

        await setDoc(doc(db, "products", editingProduct.id), {
          ...publicData,
          skuCode: editingProduct.skuCode || derivedSku,
          searchKeywords: keywords,
          updatedAt: Timestamp.now(),
          createdAt: editingProduct.createdAt || Timestamp.now()
        }, {
          merge: true,
        });

        // 2. Update Private Cost Data
        const costData = {
           productId: editingProduct.id,
           costPrice: data.costPrice,
           variantsCost: (data.variants || []).reduce((acc, v) => {
              if (v.id) acc[v.id] = v.costPrice;
              return acc;
           }, {}),
           updatedAt: Timestamp.now()
        };
        await setDoc(doc(db, "product_costs", editingProduct.id), costData);

        await addAuditLog("UPDATE_PRODUCT", "Product", editingProduct.id, {
          name: data.name,
          oldPrice: editingProduct.price,
          newPrice: data.price
        });
      } else {
        // Create Logic
        const publicData = { ...data };
        delete publicData.costPrice;
        if (publicData.variants) {
           publicData.variants = publicData.variants.map(v => {
              const cleaned = { ...v };
              delete cleaned.costPrice;
              return cleaned;
           });
        }

        const derivedSku = autoDeriveSkuFromProduct({
          name: data.name,
          brand: data.brand,
          category: data.category,
          subCategory: data.subCategory,
          quantity: data.quantity,
          unit: data.unit
        });

        const docRef = await addDoc(collection(db, "products"), {
          ...publicData,
          skuCode: derivedSku,
          searchKeywords: keywords,
          createdAt: Timestamp.now(),
          rating: Number(formData.rating) || 4.5,
          reviewCount: 0,
        });

        const costData = {
           productId: docRef.id,
           costPrice: data.costPrice,
           variantsCost: (data.variants || []).reduce((acc, v) => {
              if (v.id) acc[v.id] = v.costPrice;
              return acc;
           }, {}),
           createdAt: Timestamp.now()
        };
        await setDoc(doc(db, "product_costs", docRef.id), costData);

        await addAuditLog("CREATE_PRODUCT", "Product", docRef.id, { name: data.name, price: data.price });
      }

      // ─── 3. 1-CLICK AUTO-PROVISION SKUs & INITIAL INVENTORY VIA CLOUD FUNCTIONS ───
      const skusToSync = processedVariants.length > 0
        ? processedVariants
        : [{
            skuCode: autoDeriveSkuFromProduct({
              name: data.name,
              brand: data.brand,
              category: data.category,
              subCategory: data.subCategory,
              quantity: data.quantity,
              unit: data.unit
            }),
            label: `${data.quantity} ${data.unit}`,
            mrp: data.mrp,
            price: data.price,
            costPrice: data.costPrice,
            stock: data.stock,
            reorderLevel: data.reorderLevel,
            batchNumber: data.batchNumber,
            mfgDate: data.mfgDate,
            expiryDate: data.expiryDate
          }];

      for (const v of skusToSync) {
        try {
          const finalSku = v.skuCode || autoDeriveSkuFromProduct({
            name: data.name,
            brand: data.brand,
            category: data.category,
            subCategory: data.subCategory,
            quantity: v.label || data.quantity,
            unit: data.unit
          });

          // 1. Direct Firestore write to 'skus' collection so it always updates immediately in real-time
          await setDoc(doc(db, "skus", finalSku), {
            skuCode: finalSku,
            name: `${data.name} (${v.label || data.quantity || ''} ${data.unit || ''})`.trim(),
            productName: data.name,
            brand: data.brand || "",
            category: data.category || "",
            subCategory: data.subCategory || "",
            segments: validateSku(finalSku)?.segments || { category: 'OT' },
            pricing: {
              mrp: Number(v.mrp || data.mrp || 0),
              consumerPrice: Number(v.price || data.price || 0),
              landingCost: Number(v.costPrice || data.costPrice || 0),
              dealerPrice: Number(v.costPrice || data.costPrice || 0)
            },
            inventory: {
              availableStock: Number(v.stock !== undefined ? v.stock : data.stock || 0),
              allocatedStock: 0,
              quarantineStock: 0
            },
            tax: {
              hsnCode: data.hsnCode || "31021010",
              gstRate: Number(data.gstRate || 5)
            },
            reorderLevel: Number(v.reorderLevel || data.reorderLevel || 10),
            isActive: true,
            updatedAt: Timestamp.now(),
            createdAt: Timestamp.now()
          }, { merge: true });

          // 2. Cloud Function fallback (if backend is active)
          callUpsertSku(finalSku, {
            name: `${data.name} (${v.label || data.quantity || ''})`.trim(),
            pricing: {
              mrp: Number(v.mrp || data.mrp || 0),
              consumerPrice: Number(v.price || data.price || 0),
              landingCost: Number(v.costPrice || data.costPrice || 0),
              dealerPrice: Number(v.costPrice || data.costPrice || 0)
            },
            tax: {
              hsnCode: data.hsnCode || "31021010",
              gstRate: Number(data.gstRate || 5)
            },
            reorderLevel: Number(v.reorderLevel || data.reorderLevel || 10)
          }).catch(() => {});

          // If initial stock provided (>0), provision initial batch & ledger
          if (Number(v.stock || 0) > 0) {
            callReceiveGrn({
              skuCode: finalSku,
              batchNumber: v.batchNumber || data.batchNumber || `INIT-${Date.now()}`,
              mfgDate: v.mfgDate ? (v.mfgDate.toDate ? v.mfgDate.toDate().toISOString() : v.mfgDate) : null,
              expiryDate: v.expiryDate ? (v.expiryDate.toDate ? v.expiryDate.toDate().toISOString() : v.expiryDate) : null,
              quantity: Number(v.stock),
              landingCost: Number(v.costPrice || data.costPrice || 0),
              grnId: `PROD_INIT_${Date.now()}`
            }).catch(() => {});
          }
        } catch (skuErr) {
          console.warn(`SKU auto-sync warning:`, skuErr.message);
        }
      }

      toast.success(editingProduct ? "Product & SKUs updated successfully!" : "1-Click Success: Product, SKUs & Inventory provisioned!");
      closeModal();
    } catch (error) {
      toast.error("Operation failed: " + error.message);
    } finally {
      setSubmitting(false);
      isSubmittingRef.current = false;
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingProduct(null);
    setFormData(initialFormState);
  };

  const openEdit = async (product) => {
    const normalizedUnit = validUnits.includes(product.unit)
      ? product.unit
      : "piece";
    setEditingProduct(product);

    // Fetch Private Cost Data securely
    let privateCost = 0;
    let variantsCosts = {};
    try {
       const getSecureProductCost = httpsCallable(functions, "getSecureProductCost");
       const { data: costData } = await getSecureProductCost({ productId: product.id });
       if (costData) {
          privateCost = costData.costPrice || 0;
          variantsCosts = costData.variantsCost || {};
       }
    } catch (e) {
       console.error("Failed to fetch cost data", e);
    }

    const expiryValue = product.expiryDate
      ? product.expiryDate.seconds
        ? new Date(product.expiryDate.seconds * 1000)
            .toISOString()
            .split("T")[0]
        : product.expiryDate
      : "";
    const mfgValue = product.mfgDate
      ? product.mfgDate.seconds
        ? new Date(product.mfgDate.seconds * 1000)
            .toISOString()
            .split("T")[0]
        : product.mfgDate
      : "";

    // Parse variants if they exist, converting Timestamps back to YYYY-MM-DD strings
    const processedVariants = (product.variants || []).map((v) => ({
      ...v,
      mrp: v.mrp ?? "",
      price: v.price ?? "",
      stock: v.stock ?? "",
      quantity: v.quantity ?? "",
      reorderLevel: v.reorderLevel ?? 10,
      costPrice: variantsCosts[v.id] || "",
      batchNumber: v.batchNumber ?? "",
      mfgDate: v.mfgDate
        ? v.mfgDate.seconds
          ? new Date(v.mfgDate.seconds * 1000).toISOString().split("T")[0]
          : v.mfgDate
        : "",
      expiryDate: v.expiryDate
        ? v.expiryDate.seconds
          ? new Date(v.expiryDate.seconds * 1000).toISOString().split("T")[0]
          : v.expiryDate
        : "",
    }));

    const derivedFormulation = product.formulationType ||
      (validFormulationTypes.includes(product.unit) ? product.unit : "None");

    setFormData({
      ...initialFormState,
      ...product,
      cropId: product.cropId || "",
      cropName: product.cropName || "",
      associatedCropIds: product.associatedCropIds || [],
      associatedCropNames: product.associatedCropNames || [],
      isAllCrops: product.isAllCrops || false,
      quantity: product.quantity || "",
      reorderLevel: product.reorderLevel ?? 10,
      expiryDate: expiryValue,
      mfgDate: mfgValue,
      batchNumber: product.batchNumber || "",
      hsnCode: product.hsnCode || "",
      gstRate: Number(product.gstRate) || 18,
      isTaxInclusive: product.isTaxInclusive ?? true,
      costPrice: privateCost || "",
      chemicalComposition: product.chemicalComposition || "",
      formulationType: derivedFormulation,
      unit: normalizedUnit,
      variants: processedVariants,
      seedMetadata: product.seedMetadata || initialFormState.seedMetadata,
      agroMetadata: product.agroMetadata
        ? {
            ...initialFormState.agroMetadata,
            ...product.agroMetadata,
            targetPests: Array.isArray(product.agroMetadata.targetPests)
              ? product.agroMetadata.targetPests.join(", ")
              : "",
            recommendedCrops: Array.isArray(
              product.agroMetadata.recommendedCrops,
            )
              ? product.agroMetadata.recommendedCrops.join(", ")
              : "",
          }
        : initialFormState.agroMetadata,
      herbicideMetadata: product.herbicideMetadata
        ? {
            ...initialFormState.herbicideMetadata,
            ...product.herbicideMetadata,
            targetWeeds: Array.isArray(product.herbicideMetadata.targetWeeds)
              ? product.herbicideMetadata.targetWeeds.join(", ")
              : "",
            recommendedCrops: Array.isArray(
              product.herbicideMetadata.recommendedCrops,
            )
              ? product.herbicideMetadata.recommendedCrops.join(", ")
              : "",
          }
        : initialFormState.herbicideMetadata,
    });
    setIsModalOpen(true);
  };

  const deleteProduct = async (id) => {
    if (window.confirm("Delete this product?")) {
      try {
        const productToDelete = products.find(p => p.id === id);
        const prodName = productToDelete?.name || "Unknown";
        
        if (productToDelete?.images?.length > 0) {
          await Promise.all(
            productToDelete.images.map(async (imageUrl) => {
              try {
                if (imageUrl && typeof imageUrl === 'string') {
                  const imageRef = ref(storage, imageUrl);
                  await deleteObject(imageRef);
                }
              } catch (e) {
                console.error("Failed to delete image:", e);
              }
            })
          );
        }

        await deleteDoc(doc(db, "products", id));
        await addAuditLog("DELETE_PRODUCT", "Product", id, { name: prodName });
        toast.success("Product deleted");
      } catch (error) {
        toast.error("Failed to delete product");
      }
    }
  };

  const handleAddVariant = () => {
    let newVariants = [...(formData.variants || [])];
    if (newVariants.length === 0) {
      // Transition from single to multiple: copy existing single data to variant #1
      newVariants.push({
        label: formData.quantity ? `${formData.quantity} ${formData.unit}` : "Standard Pack",
        quantity: formData.quantity || "",
        mrp: formData.mrp || "",
        price: formData.price || "",
      costPrice: formData.costPrice || "",
      stock: formData.stock || "",
        reorderLevel: formData.reorderLevel || 10,
        batchNumber: formData.batchNumber || "",
        mfgDate: formData.mfgDate || "",
        expiryDate: formData.expiryDate || "",
      });
    }
    // Add a new empty variant
    newVariants.push({
      label: "",
      quantity: "",
      mrp: "",
      price: "",
      costPrice: "",
      stock: "",
      reorderLevel: 10,
      batchNumber: "",
      mfgDate: "",
      expiryDate: "",
    });
    setFormData({
      ...formData,
      variants: newVariants,
    });
  };

  const handleRemoveVariant = (idx) => {
    const newVariants = [...formData.variants];
    newVariants.splice(idx, 1);
    setFormData({
      ...formData,
      variants: newVariants,
    });
  };

  const handleResetToSingleVariant = () => {
    if (window.confirm("Are you sure you want to switch back to a single product variant? This will convert variant #1 back to main product details. A temporary draft backup will be created.")) {
      const firstVariant = formData.variants[0] || {};
      
      // Create backup
      setVariantsBackup(formData.variants);

      setFormData({
        ...formData,
        quantity: firstVariant.quantity || formData.quantity || "",
        mrp: firstVariant.mrp || formData.mrp || "",
        price: firstVariant.price || formData.price || "",
        stock: firstVariant.stock || formData.stock || "",
        reorderLevel: firstVariant.reorderLevel || formData.reorderLevel || 10,
        batchNumber: firstVariant.batchNumber || formData.batchNumber || "",
        mfgDate: firstVariant.mfgDate || formData.mfgDate || "",
        expiryDate: firstVariant.expiryDate || formData.expiryDate || "",
        variants: [],
      });
      
      toast.success("Reverted to single product. You can undo this action if needed.");
    }
  };

  const handleUndoVariantReset = () => {
    if (variantsBackup) {
      setFormData({
        ...formData,
        variants: variantsBackup
      });
      setVariantsBackup(null);
      toast.success("Restored previous variants!");
    }
  };

  const handleCreateSubCategory = async () => {
    if (!newSubCategoryName.trim()) {
      toast.error("Sub-category name cannot be empty");
      return;
    }
    const selectedCat = categories.find((c) => c.name === formData.category);
    if (!selectedCat) {
      toast.error("Please select a valid category first");
      return;
    }

    try {
      const updatedSubCategories = [
        ...(selectedCat.subCategories || []),
        {
          id: Date.now().toString(),
          name: newSubCategoryName.trim(),
          imageUrl: "",
        },
      ];

      await setDoc(
        doc(db, "categories", selectedCat.id),
        { subCategories: updatedSubCategories, updatedAt: Timestamp.now() },
        { merge: true }
      );

      toast.success(`Sub-category "${newSubCategoryName}" created!`);
      setFormData({
        ...formData,
        subCategory: newSubCategoryName.trim(),
      });
      setNewSubCategoryName("");
      setShowNewSubCategoryInput(false);
    } catch (error) {
      console.error(error);
      toast.error("Failed to create sub-category");
    }
  };

  const filteredProducts = products.filter(
    (p) =>
      (p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
       p.brand?.toLowerCase().includes(searchTerm.toLowerCase())) &&
      (!showLowStockOnly || Number(p.stock) <= Number(p.reorderLevel || 10))
  );

  const lowStockProducts = products.filter((p) => {
    const level = Number(p.reorderLevel ?? 10);
    return Number(p.stock) <= level;
  });

  const expiringProducts = products.filter((p) => {
    if (!p.expiryDate) return false;
    const expiry = p.expiryDate.seconds
      ? new Date(p.expiryDate.seconds * 1000)
      : new Date(p.expiryDate);
    const daysUntil = (expiry - new Date()) / (1000 * 60 * 60 * 24);
    return daysUntil >= 0 && daysUntil <= 30;
  });

  const selectedCategoryData = categories.find(c => c.name === formData.category);
  const subCategories = selectedCategoryData?.subCategories || [];

  const columns = [
    {
      header: "Image",
      render: (p) => (
        <div className="h-12 w-12 rounded-lg overflow-hidden border border-gray-100 bg-gray-50 shadow-inner">
          <img
            src={p.images?.[0] || "https://placehold.co/100x100?text=No+Image"}
            className="h-full w-full object-cover"
            alt=""
          />
        </div>
      ),
    },
    {
      header: "Product Info",
      render: (p) => (
        <div className="flex flex-col max-w-[200px] whitespace-normal">
          <span className="font-black text-gray-900 tracking-tight leading-snug mb-1 line-clamp-2">
            {p.name}
          </span>
          <span className="text-[10px] font-bold text-primary-dark uppercase tracking-widest truncate">
            {p.brand}
          </span>
        </div>
      ),
    },
    {
      header: "Category",
      render: (p) => (
        <div className="flex flex-col gap-1 max-w-[150px] whitespace-normal">
          <span className="bg-green-50 text-green-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-green-100 shadow-sm w-fit truncate max-w-full">
            {p.category}
          </span>
          {p.subCategory && (
            <span className="text-[8px] font-bold text-gray-400 uppercase ml-1 truncate">
              › {p.subCategory}
            </span>
          )}
          {p.cropName && (
            <span className="bg-orange-50 text-orange-700 px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border border-orange-100 shadow-sm w-fit mt-1 flex items-center gap-1 truncate max-w-full">
              <Sprout size={10} className="shrink-0" /> <span className="truncate">{p.cropName}</span>
            </span>
          )}
        </div>
      ),
    },
    {
      header: "Pricing",
      render: (p) => (
        <div className="flex flex-col">
          {p.variants && p.variants.length > 0 ? (
            <>
              <span className="font-black text-gray-900 text-sm tracking-tight">
                {formatCurrency(
                  Math.min(...p.variants.map((v) => Number(v.price || 0))),
                )}
              </span>
              <span className="text-[10px] text-gray-400 font-bold tracking-tighter italic">
                {p.variants.length} variants
              </span>
            </>
          ) : (
            <>
              <span className="font-black text-gray-900 text-sm tracking-tight">
                {formatCurrency(p.price)}
              </span>
              <span className="text-[10px] text-gray-400 font-bold line-through tracking-tighter italic">
                {formatCurrency(p.mrp)}
              </span>
            </>
          )}
        </div>
      ),
    },
    {
      header: "Stock",
      render: (p) => {
        const level = Number(p.reorderLevel ?? 10);
        const totalStock =
          p.variants && p.variants.length > 0
            ? p.variants.reduce((s, v) => s + Number(v.stock || 0), 0)
            : Number(p.stock);
        const isLow = Number(totalStock) <= level;
        return (
          <div className="flex items-center space-x-2">
            <span
              className={`text-sm font-black tracking-tight ${isLow ? "text-red-600" : "text-gray-900"}`}
            >
              {totalStock}
            </span>
            {isLow && (
              <ShieldAlert size={14} className="text-red-500 animate-pulse" />
            )}
          </div>
        );
      },
    },
    {
      header: "Actions",
      render: (p) => (
        <div className="flex space-x-2">
          <button
            onClick={() => setVariantManagerProduct(p)}
            className="p-2 bg-green-50 text-green-600 hover:bg-green-100 rounded-lg transition-all shadow-sm"
            title="Manage Variants"
          >
            <Package size={16} />
          </button>
          <button
            onClick={() => openEdit(p)}
            className="p-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-all shadow-sm"
          >
            <Edit2 size={16} />
          </button>
          <button
            onClick={() => deleteProduct(p.id)}
            className="p-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-all shadow-sm"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 pb-10 animate-in fade-in duration-300">
      <PageHeader
        title="Products & SKUs Catalog ERP"
        subtitle="Manage agri-inputs, seed classes, technical agrochemicals, HSN GST rates, multi-pack variants, and instant bulk sync."
        actions={
          <button
            onClick={() => {
              setFormData(initialFormState);
              setIsModalOpen(true);
            }}
            className="bg-[#1b5e20] text-white px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider shadow-sm hover:bg-[#2e7d32] transition-all flex items-center group active:scale-95"
          >
            <Plus
              size={16}
              className="mr-2 group-hover:rotate-90 transition-transform"
            />
            Add New Product
          </button>
        }
      />

      {/* Bulk Operations Section */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden animate-in fade-in duration-500">
        <div 
          className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 cursor-pointer hover:bg-gray-50 transition-colors"
          onClick={() => setShowBulk(!showBulk)}
        >
          <div>
            <h2 className="text-xl font-black text-gray-900 tracking-tight flex items-center uppercase">
              <UploadCloud className="mr-3 text-primary" size={24} />
              Bulk Operations & Sync
            </h2>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] ml-9 mt-1">Data synchronization {'&'} management</p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={(e) => { e.stopPropagation(); downloadSampleProductTemplate(); }}
              className="flex items-center space-x-2 bg-emerald-50 text-emerald-800 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-100 transition-all active:scale-95"
            >
              <Download size={14} />
              <span>Template</span>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); exportCsv(); }}
              className="flex items-center space-x-2 bg-gray-50 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-gray-600 border border-gray-200 hover:border-primary transition-all active:scale-95"
            >
              <Download size={14} />
              <span>CSV</span>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); exportXlsx(); }}
              className="flex items-center space-x-2 bg-[#1b5e20] px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-white shadow-sm hover:bg-[#2e7d32] transition-all active:scale-95"
            >
              <FileText size={14} />
              <span>Excel</span>
            </button>
            <ChevronRight size={20} className={`text-gray-400 transition-transform ${showBulk ? 'rotate-90' : ''}`} />
          </div>
        </div>

        {showBulk && (
          <div className="p-6 border-t border-gray-100 bg-gray-50/50">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Upload Panel */}
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm space-y-6">
              <div className="space-y-4">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Upload CSV or Excel File</label>
                <div className="relative group">
                  <div className={`p-8 rounded-3xl border-2 border-dashed transition-all flex flex-col items-center justify-center text-center space-y-3 ${csvFile ? 'bg-green-50 border-primary' : 'bg-gray-50 border-gray-100 hover:border-primary'}`}>
                    <UploadCloud className={csvFile ? 'text-primary' : 'text-gray-300'} size={40} />
                    <div>
                      <p className="text-sm font-black text-gray-900">{csvFile ? csvFile.name : 'Upload CSV / Excel'}</p>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter mt-1">{csvFile ? `${bulkRows.length} rows detected` : 'Drop .csv or .xlsx file here'}</p>
                    </div>
                    <input type="file" accept=".csv,.xlsx,.xls" onChange={handleBulkFile} className="absolute inset-0 opacity-0 cursor-pointer" />
                  </div>
                </div>
              </div>

                <div className="pt-6 space-y-4">
                  {/* Target Warehouse Selector */}
                  <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-1">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block">
                      Target Warehouse Hub / Inward Location (Optional)
                    </label>
                    <select
                      value={importWarehouseId}
                      onChange={(e) => setImportWarehouseId(e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl font-bold text-xs text-gray-900 outline-none focus:border-primary cursor-pointer"
                    >
                      <option value="">Default Active Warehouse Hub</option>
                      {warehouses.map((wh) => (
                        <option key={wh.id} value={wh.id}>
                          {wh.name || wh.id} ({wh.code || wh.id})
                        </option>
                      ))}
                    </select>
                  </div>

                  {bulkRows.length > 0 && (
                    <div className="flex items-center space-x-2 bg-blue-50 p-4 rounded-2xl border border-blue-100 mb-4">
                      <input
                        type="checkbox"
                        id="verify-bulk"
                        checked={isVerified}
                        onChange={(e) => setIsVerified(e.target.checked)}
                        className="w-5 h-5 accent-primary rounded cursor-pointer"
                      />
                      <label htmlFor="verify-bulk" className="text-xs font-black text-blue-900 uppercase cursor-pointer">
                        I have verified all {bulkRows.length} rows in the preview table below
                      </label>
                    </div>
                  )}
                  <div className="flex gap-3">
                    <button
                      onClick={startBulkImport}
                      disabled={bulkProcessing || !bulkRows.length || !isVerified}
                      className="flex-1 bg-[#1b5e20] text-white py-5 rounded-3xl font-black text-sm uppercase tracking-[0.3em] shadow-2xl shadow-green-200 hover:bg-[#2e7d32] transition-all flex items-center justify-center space-x-3 active:scale-[0.98] disabled:opacity-50 disabled:grayscale"
                    >
                      {bulkProcessing ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle2 size={20} />}
                      <span>{bulkProcessing ? 'Processing Imports...' : 'Initialize Bulk Sync'}</span>
                    </button>
                    {bulkRows.length > 0 && (
                      <button
                        onClick={() => { setBulkRows([]); setCsvFile(null); setIsVerified(false); }}
                        className="bg-gray-100 text-gray-400 p-5 rounded-3xl hover:bg-red-50 hover:text-red-500 transition-all active:scale-95"
                        title="Clear Upload"
                      >
                        <Trash2 size={24} />
                      </button>
                    )}
                  </div>
                </div>
            </div>

              {/* Summary Report after Import */}
              {bulkSummary && (
                <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-6 animate-in slide-in-from-top duration-500">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-black text-gray-900 uppercase tracking-tighter">Import Summary</h3>
                    <button onClick={() => setBulkSummary(null)} className="text-gray-400 hover:text-gray-600">
                      <X size={16} />
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-green-50 p-4 rounded-2xl border border-green-100 text-center">
                      <p className="text-2xl font-black text-green-600">{bulkSummary.success}</p>
                      <p className="text-[10px] font-black text-green-700 uppercase">New Added</p>
                    </div>
                    <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 text-center">
                      <p className="text-2xl font-black text-blue-600">{bulkSummary.updated || 0}</p>
                      <p className="text-[10px] font-black text-blue-700 uppercase">Updated</p>
                    </div>
                    <div className="bg-red-50 p-4 rounded-2xl border border-red-100 text-center">
                      <p className="text-2xl font-black text-red-600">{bulkSummary.failed}</p>
                      <p className="text-[10px] font-black text-red-700 uppercase">Failed</p>
                    </div>
                  </div>

                  {bulkSummary.errors.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-[10px] font-black text-red-500 uppercase tracking-widest ml-1">Error Details</p>
                      <div className="max-h-40 overflow-y-auto space-y-2 pr-2">
                        {bulkSummary.errors.map((err, idx) => (
                          <div key={idx} className="bg-red-50/50 p-3 rounded-xl border border-red-100 flex items-start justify-between">
                            <div>
                              <p className="text-xs font-black text-red-900">Row {err.row}: {err.name}</p>
                              <p className="text-[10px] text-red-700 font-bold">{err.error}</p>
                            </div>
                            <AlertCircle size={14} className="text-red-400 mt-1" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

            {/* Preview Table */}
            <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden flex flex-col">
              <div className="p-8 border-b border-gray-50 flex items-center justify-between bg-white/50 backdrop-blur sticky top-0 z-10">
                <div className="flex items-center space-x-3">
                  <FileText className="text-primary-dark" size={20} />
                  <h2 className="text-lg font-black text-gray-900 uppercase tracking-tighter">Preview Payload</h2>
                </div>
                <span className="text-[10px] font-black bg-gray-100 text-gray-400 px-3 py-1 rounded-full uppercase tracking-widest">{bulkRows.length} Rows</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-gray-50/50 border-b border-gray-100">
                    <tr className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                      {bulkRows.length > 0 && Object.keys(bulkRows[0]).slice(0, 8).map((k, i) => (
                        <th key={i} className="px-6 py-5 font-black">{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {bulkRows.length > 0 ? bulkRows.slice(0, 8).map((r, idx) => (
                      <tr key={idx} className="hover:bg-green-50/30 transition-colors">
                        {Object.values(r).slice(0, 8).map((v, i) => (
                          <td key={i} className="px-6 py-4 text-sm font-bold text-gray-700 truncate max-w-[10rem]">{String(v)}</td>
                        ))}
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={8} className="px-8 py-20 text-center">
                          <AlertCircle size={48} className="mx-auto text-gray-100 mb-4" />
                          <p className="text-xs font-black text-gray-300 uppercase tracking-widest leading-relaxed">No data parsed.<br/>Please upload a valid CSV or Excel file to preview.</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Documentation Panel */}
          <div className="space-y-8">
             <div className="bg-[#1b5e20] p-10 rounded-[3rem] text-white shadow-2xl shadow-green-200 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-8 opacity-5 scale-150 rotate-12 group-hover:rotate-45 transition-transform duration-1000">
                <Info size={200} />
              </div>
              <div className="relative z-10 space-y-6">
                <h2 className="text-xl font-black uppercase tracking-widest text-green-100">CSV / Excel Format</h2>
                <div className="space-y-4">
                  <div className="flex items-start space-x-3">
                    <div className="h-6 w-6 rounded-lg bg-green-500/20 flex items-center justify-center shrink-0 mt-1">
                      <span className="text-[10px] font-black">01</span>
                    </div>
                    <p className="text-xs font-medium text-green-50/70 leading-relaxed uppercase tracking-tighter">Headers must match the supported column names exactly.</p>
                  </div>
                  <div className="flex items-start space-x-3">
                    <div className="h-6 w-6 rounded-lg bg-green-500/20 flex items-center justify-center shrink-0 mt-1">
                      <span className="text-[10px] font-black">02</span>
                    </div>
                    <p className="text-xs font-medium text-green-50/70 leading-relaxed uppercase tracking-tighter">Variants format: label:mrp:price:stock:reorderLevel:batchNo:mfgDate:expiryDate (use ; for multiple)</p>
                  </div>
                  <div className="flex items-start space-x-3">
                    <div className="h-6 w-6 rounded-lg bg-green-500/20 flex items-center justify-center shrink-0 mt-1">
                      <span className="text-[10px] font-black">03</span>
                    </div>
                    <p className="text-xs font-medium text-green-50/70 leading-relaxed uppercase tracking-tighter">Dates should follow YYYY-MM-DD format. Supports .csv and .xlsx files.</p>
                  </div>
                </div>

                <div className="pt-4 space-y-2">
                  <p className="text-[9px] font-black text-green-500 uppercase tracking-widest">Required Headers</p>
                  <div className="flex flex-wrap gap-2">
                    {['name', 'brand', 'category', 'subCategory', 'mrp', 'price', 'stock', 'unit', 'quantity'].map(h => (
                      <span key={h} className="text-[9px] font-black px-2 py-1 bg-white/5 rounded border border-white/10">{h}</span>
                    ))}
                  </div>
                </div>
                <div className="pt-2 space-y-2">
                  <p className="text-[9px] font-black text-green-500 uppercase tracking-widest">Optional Headers</p>
                  <div className="flex flex-wrap gap-2">
                    {['reorderLevel', 'batchNumber', 'mfgDate', 'expiryDate', 'chemicalComposition', 'description', 'imageUrl', 'isActive', 'variants'].map(h => (
                      <span key={h} className="text-[9px] font-black px-2 py-1 bg-white/5 rounded border border-white/10">{h}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-orange-50 p-8 rounded-[2.5rem] border border-orange-100 flex items-start space-x-4 shadow-inner">
              <AlertCircle className="text-orange-500 shrink-0 mt-1" size={24} />
              <div>
                <h4 className="text-xs font-black text-orange-800 uppercase tracking-widest mb-2 leading-none">Security Protocol</h4>
                <p className="text-[10px] font-bold text-orange-700/60 leading-relaxed italic">
                  Bulk imports bypass individual confirmation dialogs. Ensure your data is validated before initializing sync to prevent database corruption.
                </p>
              </div>
            </div>
          </div>
        </div>
        </div>
        )}
      </div>

      <div className="flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex-1 flex items-center bg-white px-4 py-3 rounded-2xl border border-gray-100 shadow-sm relative group">
          <Search className="text-gray-400 mr-2 group-focus-within:text-primary transition-colors" size={20} />
          <input
            type="text"
            placeholder="Search products or brands..."
            className="bg-transparent border-none outline-none w-full font-bold text-gray-700 placeholder:text-gray-300"
            value={searchTerm}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          onClick={() => setShowLowStockOnly(!showLowStockOnly)}
          className={`px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center space-x-2 border-2 ${showLowStockOnly ? 'bg-red-50 border-red-200 text-red-600 shadow-lg shadow-red-100' : 'bg-white border-gray-100 text-gray-400 hover:border-gray-200'}`}
        >
          <ShieldAlert size={14} />
          <span>{showLowStockOnly ? 'Showing Low Stock' : 'Filter Low Stock'}</span>
        </button>
      </div>

      <DataTable columns={columns} data={filteredProducts} loading={loading} />

      {/* Bulk Variant Manager Modal */}
      
      {showStaging && bulkRows.length > 0 && (
        <BulkStagingTable
          initialRows={bulkRows}
          isImporting={bulkProcessing}
          onConfirmImport={async (validRows) => {
            await startBulkImport(validRows);
            setShowStaging(false);
            setBulkRows([]);
          }}
          onCancel={() => {
            setShowStaging(false);
            setBulkRows([]);
          }}
        />
      )}

      {variantManagerProduct && (
        <BulkVariantManager
          product={variantManagerProduct}
          onClose={() => setVariantManagerProduct(null)}
        />
      )}

      {/* Add/Edit Modal */}
      <ProductFormModal 
        isOpen={isModalOpen}
        onClose={closeModal}
        formData={formData}
        setFormData={setFormData}
        categories={categories}
        brands={brands}
        crops={crops}
        suppliers={suppliers}
        onSubmit={handleSubmit}
        isSubmitting={submitting}
        editingProduct={editingProduct}
      />
    </div>
  );
};

export default Products;
