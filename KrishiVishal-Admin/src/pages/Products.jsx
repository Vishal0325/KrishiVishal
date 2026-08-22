import React, { useState, useEffect } from "react";
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
import { db } from "../firebase/config";
import DataTable from "../components/common/DataTable";
import ImageUpload from "../components/common/ImageUpload";
import { formatCurrency } from "../utils/formatters";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { importProducts } from "../services/bulkUpload";
import {
  fetchAllProducts,
  exportProductsCsv,
  exportProductsXlsx,
} from "../services/inventory";
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
import BulkVariantManager from "../components/inventory/BulkVariantManager";

const Products = () => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [crops, setCrops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearch] = useState("");
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [variantManagerProduct, setVariantManagerProduct] = useState(null);
  const [newSubCategoryName, setNewSubCategoryName] = useState("");
  const [showNewSubCategoryInput, setShowNewSubCategoryInput] = useState(false);
  const [csvFile, setCsvFile] = useState(null);
  const [bulkRows, setBulkRows] = useState([]);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [bulkSummary, setBulkSummary] = useState(null);

  // Form State
  const validUnits = ["ml", "gm", "kg", "piece", "meter", "pack", "SL", "EC", "SC", "WP", "WG", "GR", "SP"];
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
    batchNumber: "",
    chemicalComposition: "",
    description: "",
    images: [],
    isActive: true,
    unit: "piece",
    rating: 4.5,
    hsnCode: "",
    gstRate: "18",
    costPrice: "",
    isTaxInclusive: true,
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
      // Parse Excel
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const workbook = XLSX.read(evt.target.result, { type: "binary" });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const data = XLSX.utils.sheet_to_json(sheet, { defval: "" });
          setBulkRows(data);
          toast.success(`Parsed ${data.length} rows from Excel`);
        } catch (err) {
          toast.error("Excel parse error: " + err.message);
        }
      };
      reader.readAsBinaryString(f);
    } else {
      // Parse CSV
      Papa.parse(f, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          setBulkRows(results.data);
          toast.success(`Parsed ${results.data.length} rows from CSV`);
        },
        error: (err) => {
          toast.error("CSV parse error: " + err.message);
        },
      });
    }
  };

  const startBulkImport = async () => {
    if (!bulkRows.length) return toast.error("Upload a CSV or Excel file first");
    setBulkProcessing(true);
    setBulkSummary(null);
    try {
      const res = await importProducts(bulkRows);
      setBulkSummary(res);
      setBulkRows([]);
      setCsvFile(null);
      setIsVerified(false);

      if (res.failed > 0) {
        toast.error(`Import finished with ${res.failed} errors`);
      } else {
        toast.success(`Sync successful: ${res.success} New, ${res.updated} Updated`);
      }
      fetchProducts();
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

    const unsubscribeCategories = onSnapshot(collection(db, "categories"), (snapshot) => {
      setCategories(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => a.order - b.order));
    });

    const unsubscribeBrands = onSnapshot(collection(db, "brands"), (snapshot) => {
      setBrands(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => a.name.localeCompare(b.name)));
    });

    const unsubscribeCrops = onSnapshot(collection(db, "crops"), (snapshot) => {
      setCrops(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => a.name.localeCompare(b.name)));
    });

    return () => {
      unsubscribeProducts();
      unsubscribeCategories();
      unsubscribeBrands();
      unsubscribeCrops();
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
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
        // if variants exist, derive summary fields for quick listing
        mrp: processedVariants.length
          ? Math.max(...processedVariants.map((v) => v.mrp))
          : Number(formData.mrp),
        price: processedVariants.length
          ? Math.min(...processedVariants.map((v) => v.price))
          : Number(formData.price),
        stock: processedVariants.length
          ? processedVariants.reduce((s, v) => s + Number(v.stock || 0), 0)
          : Number(formData.stock),
        stockQuantity: processedVariants.length
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
        chemicalComposition: ["Herbicide", "Insecticide", "PGR", "Plant Growth Regulator", "Fungicide"].map(c => c.toLowerCase()).includes(formData.category?.toLowerCase())
          ? formData.chemicalComposition
          : null,
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

        await setDoc(doc(db, "products", editingProduct.id), {
          ...publicData,
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
        toast.success("Product updated!");
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

        const docRef = await addDoc(collection(db, "products"), {
          ...publicData,
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
        toast.success("Product added!");
      }
      closeModal();
    } catch (error) {
      toast.error("Operation failed");
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

    // Fetch Private Cost Data
    let privateCost = 0;
    let variantsCosts = {};
    try {
       const costSnap = await getDoc(doc(db, "product_costs", product.id));
       if (costSnap.exists()) {
          privateCost = costSnap.data().costPrice || 0;
          variantsCosts = costSnap.data().variantsCost || {};
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
      gstRate: product.gstRate?.toString() || "18",
      isTaxInclusive: product.isTaxInclusive ?? true,
      costPrice: privateCost || "",
      chemicalComposition: product.chemicalComposition || "",
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
        const prodName = products.find(p => p.id === id)?.name || "Unknown";
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
    if (window.confirm("Are you sure you want to switch back to a single product variant? This will convert variant #1 back to main product details.")) {
      const firstVariant = formData.variants[0] || {};
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
        <div className="flex flex-col">
          <span className="font-black text-gray-900 tracking-tight leading-none mb-1">
            {p.name}
          </span>
          <span className="text-[10px] font-bold text-primary-dark uppercase tracking-widest">
            {p.brand}
          </span>
        </div>
      ),
    },
    {
      header: "Category",
      render: (p) => (
        <div className="flex flex-col gap-1">
          <span className="bg-green-50 text-green-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-green-100 shadow-sm w-fit">
            {p.category}
          </span>
          {p.subCategory && (
            <span className="text-[8px] font-bold text-gray-400 uppercase ml-1">
              › {p.subCategory}
            </span>
          )}
          {p.cropName && (
            <span className="bg-orange-50 text-orange-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-orange-100 shadow-sm w-fit mt-1 flex items-center gap-1">
              <Sprout size={10} /> {p.cropName}
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
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center">
          <Package2 className="mr-3 text-primary" size={28} />
          Products Catalog
        </h1>
        <button
          onClick={() => {
            setFormData(initialFormState);
            setIsModalOpen(true);
          }}
          className="bg-[#1b5e20] text-white px-6 py-3 rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-green-100 hover:bg-[#2e7d32] transition-all flex items-center group active:scale-95"
        >
          <Plus
            size={18}
            className="mr-2 group-hover:rotate-90 transition-transform"
          />
          Add New Product
        </button>
      </div>

      {/* Bulk Operations Section */}
      <div className="space-y-10 animate-in fade-in duration-500">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h2 className="text-3xl font-black text-gray-900 tracking-tight flex items-center uppercase">
              <UploadCloud className="mr-3 text-primary" size={32} />
              Bulk Operations
            </h2>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] ml-11">Data synchronization & management</p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={exportCsv}
              className="flex items-center space-x-2 bg-white px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest text-gray-600 border border-gray-100 shadow-sm hover:border-primary transition-all active:scale-95"
            >
              <Download size={16} />
              <span>CSV</span>
            </button>
            <button
              onClick={exportXlsx}
              className="flex items-center space-x-2 bg-[#1b5e20] px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest text-white shadow-xl shadow-green-100 hover:bg-[#2e7d32] transition-all active:scale-95"
            >
              <FileText size={16} />
              <span>Excel</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          {/* Upload Panel */}
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-white p-10 rounded-[3rem] border border-gray-100 shadow-sm space-y-10">
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
      {variantManagerProduct && (
        <BulkVariantManager
          product={variantManagerProduct}
          onClose={() => setVariantManagerProduct(null)}
        />
      )}

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-md p-6 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl shadow-2xl animate-in zoom-in duration-300 relative border border-white/20">
            <div className="p-8 border-b border-gray-50 sticky top-0 bg-white/95 backdrop-blur z-10 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="h-10 w-10 bg-green-50 rounded-xl flex items-center justify-center text-primary-dark">
                  {editingProduct ? <Edit2 size={20} /> : <Plus size={24} />}
                </div>
                <div>
                  <h2 className="text-xl font-black text-gray-900 tracking-tight">
                    {editingProduct ? "Update Product" : "Create New Product"}
                  </h2>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                    Complete all required information
                  </p>
                </div>
              </div>
              <button
                onClick={closeModal}
                className="p-2 hover:bg-red-50 hover:text-red-500 rounded-full transition-all text-gray-300"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-10 space-y-12">
              {/* Image Section */}
              <section className="space-y-6">
                <div className="flex items-center space-x-2 text-primary-dark border-b border-gray-50 pb-2">
                  <Plus size={16} />
                  <h3 className="text-xs font-black uppercase tracking-widest">
                    Product Imagery
                  </h3>
                </div>
                <ImageUpload
                  currentImages={formData.images}
                  onUpload={(urls) =>
                    setFormData({ ...formData, images: urls })
                  }
                />
              </section>

              {/* Basic Info */}
              <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="md:col-span-2 space-y-6">
                  <div className="flex items-center space-x-2 text-primary-dark border-b border-gray-50 pb-2">
                    <Edit2 size={16} />
                    <h3 className="text-xs font-black uppercase tracking-widest">
                      Primary Details
                    </h3>
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="product-name" className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                    Product Name *
                  </label>
                  <input
                    required
                    id="product-name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-gray-900"
                    placeholder="e.g., Organic NPK Fertilizer"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                    Brand Name *
                  </label>
                  <select
                    required
                    value={formData.brand}
                    onChange={(e) =>
                      setFormData({ ...formData, brand: e.target.value })
                    }
                    className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-black text-gray-900 appearance-none cursor-pointer"
                  >
                    <option value="">Select Brand</option>
                    {brands.map((b) => (
                      <option key={b.id} value={b.name}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                    Category *
                  </label>
                  <select
                    required
                    value={formData.category}
                    onChange={(e) =>
                      setFormData({ ...formData, category: e.target.value, subCategory: "" })
                    }
                    className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-black text-gray-900 appearance-none cursor-pointer"
                  >
                    <option value="">Select Category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* GST & Tax Compliance Section */}
                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-6 bg-blue-50/30 p-6 rounded-3xl border border-blue-100">
                  <div className="space-y-2">
                    <label htmlFor="hsn-code" className="text-[10px] font-black text-blue-400 uppercase tracking-widest ml-1">
                      HSN Code *
                    </label>
                    <input
                      required
                      id="hsn-code"
                      value={formData.hsnCode}
                      onChange={(e) => setFormData({ ...formData, hsnCode: e.target.value })}
                      className="w-full px-6 py-4 bg-white border border-blue-100 rounded-2xl focus:border-primary outline-none font-bold text-gray-900"
                      placeholder="e.g., 3101"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest ml-1">
                      GST Rate (%) *
                    </label>
                    <select
                      required
                      value={formData.gstRate}
                      onChange={(e) => setFormData({ ...formData, gstRate: e.target.value })}
                      className="w-full px-6 py-4 bg-white border border-blue-100 rounded-2xl focus:border-primary outline-none font-black text-gray-900"
                    >
                      <option value="0">0% (Exempt)</option>
                      <option value="5">5%</option>
                      <option value="12">12%</option>
                      <option value="18">18%</option>
                      <option value="28">28%</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest ml-1">
                      Tax Treatment
                    </label>
                    <div
                      onClick={() => setFormData({ ...formData, isTaxInclusive: !formData.isTaxInclusive })}
                      className={`flex items-center justify-between px-6 py-4 rounded-2xl border cursor-pointer transition-all ${formData.isTaxInclusive ? 'bg-green-50 border-green-200' : 'bg-orange-50 border-orange-200'}`}
                    >
                      <span className="text-xs font-black uppercase tracking-tighter">
                        {formData.isTaxInclusive ? 'Inclusive of Tax' : 'Exclusive of Tax'}
                      </span>
                      <div className={`h-2 w-2 rounded-full ${formData.isTaxInclusive ? 'bg-green-500' : 'bg-orange-500'}`} />
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2 space-y-4 bg-gray-50/50 p-6 rounded-3xl border border-gray-100">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                      Associated Crops Selection
                    </label>
                    <div className="flex items-center space-x-2 bg-white px-3 py-1.5 rounded-xl border border-gray-100 shadow-sm">
                      <input
                        type="checkbox"
                        id="isAllCrops"
                        checked={formData.isAllCrops}
                        onChange={(e) => setFormData({ ...formData, isAllCrops: e.target.checked })}
                        className="w-4 h-4 accent-primary rounded cursor-pointer"
                      />
                      <label htmlFor="isAllCrops" className="text-[10px] font-black text-gray-700 uppercase cursor-pointer">
                        Available for ALL Crops (e.g. Allwin)
                      </label>
                    </div>
                  </div>

                  {!formData.isAllCrops && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                      {/* Selected Crops Chips */}
                      <div className="flex flex-wrap gap-2">
                        {formData.associatedCropIds && formData.associatedCropIds.map((id, index) => (
                          <div key={id} className="flex items-center space-x-1 bg-primary/10 text-primary-dark px-3 py-1.5 rounded-xl border border-primary/20">
                            <span className="text-[10px] font-black uppercase tracking-tight">
                              {formData.associatedCropNames[index]}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const newIds = [...formData.associatedCropIds];
                                const newNames = [...formData.associatedCropNames];
                                newIds.splice(index, 1);
                                newNames.splice(index, 1);
                                setFormData({
                                  ...formData,
                                  associatedCropIds: newIds,
                                  associatedCropNames: newNames,
                                  // Keep legacy fields updated with the first one for backwards compatibility
                                  cropId: newIds[0] || "",
                                  cropName: newNames[0] || ""
                                });
                              }}
                              className="hover:text-red-500 transition-colors"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                        {(!formData.associatedCropIds || formData.associatedCropIds.length === 0) && (
                          <span className="text-[10px] text-gray-400 font-bold italic py-1.5">No specific crops selected. Product will only show in general categories.</span>
                        )}
                      </div>

                      {/* Dropdown to add crops */}
                      <div className="relative">
                        <select
                          value=""
                          onChange={(e) => {
                            const val = e.target.value;
                            if (!val) return;
                            const selectedCrop = crops.find(c => c.id === val);
                            if (selectedCrop && !formData.associatedCropIds.includes(val)) {
                              const newIds = [...(formData.associatedCropIds || []), val];
                              const newNames = [...(formData.associatedCropNames || []), selectedCrop.name];
                              setFormData({
                                ...formData,
                                associatedCropIds: newIds,
                                associatedCropNames: newNames,
                                // Update legacy fields
                                cropId: newIds[0],
                                cropName: newNames[0]
                              });
                            }
                          }}
                          className="w-full px-6 py-4 bg-white border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-black text-gray-900 appearance-none cursor-pointer pr-12"
                        >
                          <option value="">+ Add Crop to Selection (e.g. Exponus - select 5 crops)</option>
                          {crops.map((c) => (
                            <option key={c.id} value={c.id} disabled={formData.associatedCropIds?.includes(c.id)}>
                              {c.name} {formData.associatedCropIds?.includes(c.id) ? "✓" : ""}
                            </option>
                          ))}
                        </select>
                        <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                          <Plus size={18} />
                        </div>
                      </div>
                    </div>
                  )}
                  <p className="text-[10px] text-gray-400 font-medium italic mt-2 px-1">
                    * {formData.isAllCrops ? "This product will show up for EVERY crop." : "Link specific crops so users find this product when browsing those crops."}
                  </p>
                </div>

                {formData.category && (
                  <div className="space-y-2 animate-in fade-in slide-in-from-top-2 md:col-span-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                        Sub-Category
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowNewSubCategoryInput(!showNewSubCategoryInput)}
                        className="text-[10px] font-black text-primary uppercase tracking-widest hover:underline"
                      >
                        {showNewSubCategoryInput ? "✕ Cancel" : "+ Create New Sub-category"}
                      </button>
                    </div>

                    {showNewSubCategoryInput ? (
                      /* Inline Add Sub-category form */
                      <div className="flex items-center gap-3 p-4 bg-green-50/50 border border-green-100 rounded-2xl animate-in slide-in-from-top-2">
                        <input
                          type="text"
                          value={newSubCategoryName}
                          onChange={(e) => setNewSubCategoryName(e.target.value)}
                          placeholder="Enter new sub-category name..."
                          className="flex-1 px-4 py-3 bg-white border border-gray-200 rounded-xl outline-none text-sm font-bold text-gray-900 focus:border-primary"
                        />
                        <button
                          type="button"
                          onClick={handleCreateSubCategory}
                          className="bg-primary text-white px-5 py-3 rounded-xl font-black text-xs uppercase tracking-wider hover:bg-primary-dark transition-colors shadow-sm"
                        >
                          Create
                        </button>
                      </div>
                    ) : subCategories.length > 0 ? (
                      /* Dropdown */
                      <select
                        value={formData.subCategory}
                        onChange={(e) =>
                          setFormData({ ...formData, subCategory: e.target.value })
                        }
                        className="w-full px-6 py-4 bg-green-50 border border-green-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-black text-gray-900 appearance-none cursor-pointer"
                      >
                        <option value="">None / Select Sub-Category</option>
                        {subCategories.map((sc) => (
                          <option key={sc.id} value={sc.name}>
                            {sc.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      /* Alert to add if none exists */
                      <div className="p-4 bg-orange-50 border border-orange-100 rounded-2xl flex items-center justify-between text-orange-800">
                        <span className="text-xs font-bold">No sub-categories created for this category.</span>
                        <button
                          type="button"
                          onClick={() => setShowNewSubCategoryInput(true)}
                          className="bg-orange-600 text-white px-4 py-2 rounded-xl font-black text-[10px] uppercase hover:bg-orange-700 transition-colors shadow-sm"
                        >
                          Create One Now
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {formData.category && ["Herbicide", "Insecticide", "PGR", "Plant Growth Regulator", "Fungicide"].map(c => c.toLowerCase()).includes(formData.category.toLowerCase()) && (
                  <div className="space-y-2 animate-in fade-in slide-in-from-top-2 md:col-span-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                      Chemical Composition *
                    </label>
                    <input
                      required
                      type="text"
                      value={formData.chemicalComposition || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, chemicalComposition: e.target.value })
                      }
                      className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-gray-900"
                      placeholder="e.g., Glyphosate 41% SL"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                    Unit Type
                  </label>
                  <select
                    value={formData.unit}
                    onChange={(e) =>
                      setFormData({ ...formData, unit: e.target.value })
                    }
                    className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-black text-gray-900 appearance-none cursor-pointer"
                  >
                    <option value="ml">ml</option>
                    <option value="gm">gm</option>
                    <option value="kg">kg</option>
                    <option value="piece">piece</option>
                    <option value="meter">meter</option>
                    <option value="pack">pack</option>
                    <option value="SL">SL (घुलनशील तरल / Soluble Liquid)</option>
                    <option value="EC">EC (तेल आधारित तरल / Emulsifiable Concentrate)</option>
                    <option value="SC">SC (गाढ़ा पेस्ट / Suspension Concentrate)</option>
                    <option value="WP">WP (घुलनशील पाउडर / Wettable Powder)</option>
                    <option value="WG">WG (घुलनशील दाने / Water Dispersible Granules)</option>
                    <option value="GR">GR (मिट्टी में छिटकने वाले दाने / Granules)</option>
                    <option value="SP">SP (पूरी तरह घुलने वाला पाउडर / Soluble Powder)</option>
                  </select>
                </div>
              </section>

              {/* Conditional Section: Single Variant vs Multiple Variants */}
              {(!formData.variants || formData.variants.length === 0) ? (
                /* Single Variant Fields */
                <section className="space-y-8 animate-in fade-in duration-300">
                  <div className="flex items-center justify-between border-b border-gray-50 pb-2">
                    <div className="flex items-center space-x-2 text-primary-dark">
                      <Tags size={16} />
                      <h3 className="text-xs font-black uppercase tracking-widest">
                        Inventory & Pricing (Single Variant)
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddVariant}
                      className="bg-green-50 text-green-700 px-4 py-2 rounded-xl text-xs font-black uppercase hover:bg-green-100 transition-colors shadow-sm"
                    >
                      + Switch to Multiple Variants
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                        Weight / Size *
                      </label>
                      <input
                        required
                        type="text"
                        value={formData.quantity}
                        onChange={(e) =>
                          setFormData({ ...formData, quantity: e.target.value })
                        }
                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-gray-900"
                        placeholder="e.g., 500"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                        MRP (₹) *
                      </label>
                      <input
                        required
                        type="number"
                        value={formData.mrp}
                        onChange={(e) =>
                          setFormData({ ...formData, mrp: e.target.value })
                        }
                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-black text-gray-900"
                        placeholder="0.00"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                        Selling Price (₹) *
                      </label>
                      <input
                        required
                        type="number"
                        value={formData.price}
                        onChange={(e) =>
                          setFormData({ ...formData, price: e.target.value })
                        }
                        className="w-full px-6 py-4 bg-green-50 border border-green-100 rounded-2xl focus:ring-4 focus:ring-green-500/10 focus:border-primary outline-none transition-all font-black text-primary-dark shadow-inner"
                        placeholder="0.00"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-orange-400 uppercase tracking-widest ml-1">
                        Purchase Price (Cost) *
                      </label>
                      <input
                        required
                        type="number"
                        value={formData.costPrice}
                        onChange={(e) =>
                          setFormData({ ...formData, costPrice: e.target.value })
                        }
                        className="w-full px-6 py-4 bg-orange-50 border border-orange-100 rounded-2xl focus:ring-4 focus:ring-orange-500/10 focus:border-orange-400 outline-none transition-all font-black text-orange-800 shadow-inner"
                        placeholder="Secret Cost"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                        Available Stock *
                      </label>
                      <input
                        required
                        type="number"
                        value={formData.stock}
                        onChange={(e) =>
                          setFormData({ ...formData, stock: e.target.value })
                        }
                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-black text-gray-900"
                        placeholder="e.g., 100"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                        Low Stock Reorder Level
                      </label>
                      <input
                        type="number"
                        value={formData.reorderLevel}
                        onChange={(e) =>
                          setFormData({ ...formData, reorderLevel: e.target.value })
                        }
                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-gray-900"
                        placeholder="e.g., 10"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                        Batch Number
                      </label>
                      <input
                        type="text"
                        value={formData.batchNumber}
                        onChange={(e) =>
                          setFormData({ ...formData, batchNumber: e.target.value })
                        }
                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-gray-900"
                        placeholder="e.g., BATCH123"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                        MFG Date
                      </label>
                      <input
                        type="date"
                        value={formData.mfgDate}
                        onChange={(e) =>
                          setFormData({ ...formData, mfgDate: e.target.value })
                        }
                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-gray-900"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                        Expiry Date
                      </label>
                      <input
                        type="date"
                        value={formData.expiryDate}
                        onChange={(e) =>
                          setFormData({ ...formData, expiryDate: e.target.value })
                        }
                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-gray-900"
                      />
                    </div>
                  </div>

                  {/* USP Display Card */}
                  {formData.mrp && formData.quantity && (
                    <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-100 rounded-2xl p-5 flex items-center justify-between shadow-inner animate-in fade-in duration-300">
                      <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Unit Selling Price (USP)</p>
                        <p className="text-[10px] text-gray-400 font-bold mt-1">MRP ÷ Quantity</p>
                      </div>
                      <span className="text-2xl font-black text-primary-dark">₹{calculateUSP(formData.mrp, formData.quantity)} <span className="text-sm font-bold text-gray-400">/ {formData.unit}</span></span>
                    </div>
                  )}
                </section>
              ) : (
                /* Multiple Variants Card Layout */
                <section className="space-y-8 animate-in fade-in duration-300">
                  <div className="flex items-center justify-between border-b border-gray-50 pb-2">
                    <div className="flex items-center space-x-2 text-primary-dark">
                      <Package2 size={16} />
                      <h3 className="text-xs font-black uppercase tracking-widest">
                        Product Variants ({formData.variants.length})
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={handleResetToSingleVariant}
                      className="bg-red-50 text-red-700 px-4 py-2 rounded-xl text-xs font-black uppercase hover:bg-red-100 transition-colors shadow-sm"
                    >
                      ✕ Switch to Single Variant
                    </button>
                  </div>

                  <div className="space-y-6">
                    {formData.variants.map((v, idx) => (
                      <div
                        key={idx}
                        className="p-6 bg-gray-50 rounded-3xl border border-gray-100 relative space-y-6 shadow-sm"
                      >
                        <div className="flex items-center justify-between border-b border-gray-200/50 pb-2">
                          <span className="text-xs font-black uppercase tracking-wider text-gray-500">
                            Variant #{idx + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveVariant(idx)}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors flex items-center space-x-1"
                          >
                            <Trash2 size={16} />
                            <span className="text-[10px] font-bold uppercase tracking-wider">Remove</span>
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">
                              Weight / Size Label *
                            </label>
                            <input
                              required
                              value={v.label || ""}
                              onChange={(e) => {
                                const nv = [...formData.variants];
                                nv[idx] = { ...nv[idx], label: e.target.value };
                                setFormData({ ...formData, variants: nv });
                              }}
                              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl outline-none focus:border-primary text-sm font-bold text-gray-900"
                              placeholder="e.g., 500gm, 1kg"
                            />
                          </div>


                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">
                              MRP *
                            </label>
                            <input
                              required
                              type="number"
                              value={v.mrp || ""}
                              onChange={(e) => {
                                const nv = [...formData.variants];
                                nv[idx] = { ...nv[idx], mrp: e.target.value };
                                setFormData({ ...formData, variants: nv });
                              }}
                              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl outline-none focus:border-primary text-sm font-bold text-gray-900"
                              placeholder="0.00"
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">
                              Selling Price *
                            </label>
                            <input
                              required
                              type="number"
                              value={v.price || ""}
                              onChange={(e) => {
                                const nv = [...formData.variants];
                                nv[idx] = { ...nv[idx], price: e.target.value };
                                setFormData({ ...formData, variants: nv });
                              }}
                              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl outline-none focus:border-primary text-sm font-bold text-gray-900"
                              placeholder="0.00"
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-orange-400 uppercase tracking-widest ml-1">
                              Purchase Cost *
                            </label>
                            <input
                              required
                              type="number"
                              value={v.costPrice || ""}
                              onChange={(e) => {
                                const nv = [...formData.variants];
                                nv[idx] = { ...nv[idx], costPrice: e.target.value };
                                setFormData({ ...formData, variants: nv });
                              }}
                              className="w-full px-4 py-3 bg-orange-50 border border-orange-100 rounded-xl outline-none focus:border-orange-400 text-sm font-bold text-orange-900"
                              placeholder="Secret"
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">
                              Stock *
                            </label>
                            <input
                              required
                              type="number"
                              value={v.stock || ""}
                              onChange={(e) => {
                                const nv = [...formData.variants];
                                nv[idx] = { ...nv[idx], stock: e.target.value };
                                setFormData({ ...formData, variants: nv });
                              }}
                              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl outline-none focus:border-primary text-sm font-bold text-gray-900"
                              placeholder="e.g., 50"
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">
                              Low Stock Level
                            </label>
                            <input
                              type="number"
                              value={v.reorderLevel || ""}
                              onChange={(e) => {
                                const nv = [...formData.variants];
                                nv[idx] = { ...nv[idx], reorderLevel: e.target.value };
                                setFormData({ ...formData, variants: nv });
                              }}
                              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl outline-none focus:border-primary text-sm font-bold text-gray-900"
                              placeholder="e.g., 10"
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">
                              Batch Number
                            </label>
                            <input
                              type="text"
                              value={v.batchNumber || ""}
                              onChange={(e) => {
                                const nv = [...formData.variants];
                                nv[idx] = { ...nv[idx], batchNumber: e.target.value };
                                setFormData({ ...formData, variants: nv });
                              }}
                              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl outline-none focus:border-primary text-sm font-bold text-gray-900"
                              placeholder="e.g., B123"
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">
                              MFG Date
                            </label>
                            <input
                              type="date"
                              value={v.mfgDate || ""}
                              onChange={(e) => {
                                const nv = [...formData.variants];
                                nv[idx] = { ...nv[idx], mfgDate: e.target.value };
                                setFormData({ ...formData, variants: nv });
                              }}
                              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl outline-none focus:border-primary text-sm font-bold text-gray-900"
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">
                              Expiry Date
                            </label>
                            <input
                              type="date"
                              value={v.expiryDate || ""}
                              onChange={(e) => {
                                const nv = [...formData.variants];
                                nv[idx] = { ...nv[idx], expiryDate: e.target.value };
                                setFormData({ ...formData, variants: nv });
                              }}
                              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl outline-none focus:border-primary text-sm font-bold text-gray-900"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div>
                    <button
                      type="button"
                      onClick={handleAddVariant}
                      className="bg-green-50 text-green-700 px-4 py-3 rounded-2xl font-black text-sm flex items-center hover:bg-green-100 transition-colors shadow-sm"
                    >
                      <Plus size={16} className="mr-2" /> Add More Variants
                    </button>
                  </div>
                </section>
              )}

              {/* ─── SEED METADATA ─── */}
              {formData.category === "Seeds" && (
                <section className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="flex items-center space-x-2 border-b border-green-100 pb-2">
                    <Sprout size={16} className="text-green-700" />
                    <h3 className="text-xs font-black uppercase tracking-widest text-green-800">🌾 Seed Metadata</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Variety</label>
                      <input
                        type="text"
                        value={formData.seedMetadata.variety}
                        onChange={(e) => setFormData({ ...formData, seedMetadata: { ...formData.seedMetadata, variety: e.target.value } })}
                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-gray-900"
                        placeholder="e.g., Hybrid, Open Pollinated"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Seed Class</label>
                      <select
                        value={formData.seedMetadata.seedClass}
                        onChange={(e) => setFormData({ ...formData, seedMetadata: { ...formData.seedMetadata, seedClass: e.target.value } })}
                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-black text-gray-900 appearance-none cursor-pointer"
                      >
                        {seedClasses.map(sc => <option key={sc} value={sc}>{sc}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Germination %</label>
                      <input
                        type="number"
                        value={formData.seedMetadata.germination}
                        onChange={(e) => setFormData({ ...formData, seedMetadata: { ...formData.seedMetadata, germination: e.target.value } })}
                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-gray-900"
                        placeholder="e.g., 95"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Purity %</label>
                      <input
                        type="number"
                        value={formData.seedMetadata.purity}
                        onChange={(e) => setFormData({ ...formData, seedMetadata: { ...formData.seedMetadata, purity: e.target.value } })}
                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-gray-900"
                        placeholder="e.g., 99"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Moisture %</label>
                      <input
                        type="number"
                        value={formData.seedMetadata.moisture}
                        onChange={(e) => setFormData({ ...formData, seedMetadata: { ...formData.seedMetadata, moisture: e.target.value } })}
                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-gray-900"
                        placeholder="e.g., 12"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Lot Number</label>
                      <input
                        type="text"
                        value={formData.seedMetadata.lotNumber}
                        onChange={(e) => setFormData({ ...formData, seedMetadata: { ...formData.seedMetadata, lotNumber: e.target.value } })}
                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-gray-900"
                        placeholder="e.g., LOT2024001"
                      />
                    </div>
                    <div className="md:col-span-2 flex items-center justify-between bg-green-50 p-6 rounded-2xl border border-green-100 shadow-inner">
                      <div className="flex items-center space-x-3">
                        <div
                          className={`h-6 w-11 rounded-full transition-all duration-300 relative cursor-pointer ${formData.seedMetadata.isTreated ? "bg-[#2e7d32]" : "bg-gray-300"}`}
                          onClick={() => setFormData({ ...formData, seedMetadata: { ...formData.seedMetadata, isTreated: !formData.seedMetadata.isTreated } })}
                        >
                          <div className={`h-4 w-4 bg-white rounded-full absolute top-1 transition-all duration-300 ${formData.seedMetadata.isTreated ? "left-6" : "left-1"}`} />
                        </div>
                        <span className="text-sm font-black text-gray-700 uppercase tracking-widest">Seed is Treated (Chemical Treatment)</span>
                      </div>
                    </div>
                    {formData.seedMetadata.isTreated && (
                      <div className="md:col-span-2 space-y-2 animate-in fade-in slide-in-from-top-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Treatment Chemical Name</label>
                        <input
                          type="text"
                          value={formData.seedMetadata.chemicalName}
                          onChange={(e) => setFormData({ ...formData, seedMetadata: { ...formData.seedMetadata, chemicalName: e.target.value } })}
                          className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-gray-900"
                          placeholder="e.g., Thiram, Captan"
                        />
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* ─── AGRO METADATA ─── */}
              {["Fungicide", "Insecticide", "Crop Nutrition"].includes(formData.category) && (
                <section className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="flex items-center space-x-2 border-b border-blue-100 pb-2">
                    <Beaker size={16} className="text-blue-700" />
                    <h3 className="text-xs font-black uppercase tracking-widest text-blue-800">🧪 Agrochemical Details</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Technical Name</label>
                      <input
                        type="text"
                        value={formData.agroMetadata.technicalName}
                        onChange={(e) => setFormData({ ...formData, agroMetadata: { ...formData.agroMetadata, technicalName: e.target.value } })}
                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-gray-900"
                        placeholder="e.g., Chlorpyrifos 50% EC"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Formulation</label>
                      <input
                        type="text"
                        value={formData.agroMetadata.formulation}
                        onChange={(e) => setFormData({ ...formData, agroMetadata: { ...formData.agroMetadata, formulation: e.target.value } })}
                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-gray-900"
                        placeholder="e.g., EC, WP, SC, SL"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Dose Per Acre</label>
                      <input
                        type="text"
                        value={formData.agroMetadata.dosePerAcre}
                        onChange={(e) => setFormData({ ...formData, agroMetadata: { ...formData.agroMetadata, dosePerAcre: e.target.value } })}
                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-gray-900"
                        placeholder="e.g., 400ml/acre"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Target Pests (comma separated)</label>
                      <input
                        type="text"
                        value={formData.agroMetadata.targetPests}
                        onChange={(e) => setFormData({ ...formData, agroMetadata: { ...formData.agroMetadata, targetPests: e.target.value } })}
                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-gray-900"
                        placeholder="e.g., Aphids, Whitefly, Thrips"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Recommended Crops (comma separated)</label>
                      <input
                        type="text"
                        value={formData.agroMetadata.recommendedCrops}
                        onChange={(e) => setFormData({ ...formData, agroMetadata: { ...formData.agroMetadata, recommendedCrops: e.target.value } })}
                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-gray-900"
                        placeholder="e.g., Cotton, Wheat, Rice"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Antidote</label>
                      <input
                        type="text"
                        value={formData.agroMetadata.antidote}
                        onChange={(e) => setFormData({ ...formData, agroMetadata: { ...formData.agroMetadata, antidote: e.target.value } })}
                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-gray-900"
                        placeholder="e.g., Atropine Sulphate"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Toxicity Label</label>
                      <select
                        value={formData.agroMetadata.toxicityLabel}
                        onChange={(e) => setFormData({ ...formData, agroMetadata: { ...formData.agroMetadata, toxicityLabel: e.target.value } })}
                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-black text-gray-900 appearance-none cursor-pointer"
                      >
                        {toxicityLabels.map(t => (
                          <option key={t.id} value={t.id}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                    {/* Toxicity color preview */}
                    <div className="flex items-center space-x-3 p-4 rounded-2xl border border-gray-100 bg-gray-50">
                      <div
                        className="h-10 w-10 rounded-full border-2 border-white shadow-md shrink-0"
                        style={{ backgroundColor: toxicityLabels.find(t => t.id === formData.agroMetadata.toxicityLabel)?.color || "#008000" }}
                      />
                      <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Selected Label Color</p>
                        <p className="text-sm font-black text-gray-700">{toxicityLabels.find(t => t.id === formData.agroMetadata.toxicityLabel)?.label}</p>
                      </div>
                    </div>
                    <div className="md:col-span-2 flex items-center justify-between bg-red-50 p-6 rounded-2xl border border-red-100 shadow-inner">
                      <div className="flex items-center space-x-3">
                        <div
                          className={`h-6 w-11 rounded-full transition-all duration-300 relative cursor-pointer ${formData.agroMetadata.safetyWarning ? "bg-red-600" : "bg-gray-300"}`}
                          onClick={() => setFormData({ ...formData, agroMetadata: { ...formData.agroMetadata, safetyWarning: !formData.agroMetadata.safetyWarning } })}
                        >
                          <div className={`h-4 w-4 bg-white rounded-full absolute top-1 transition-all duration-300 ${formData.agroMetadata.safetyWarning ? "left-6" : "left-1"}`} />
                        </div>
                        <span className="text-sm font-black text-gray-700 uppercase tracking-widest">⚠️ Safety Warning Required</span>
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {/* ─── HERBICIDE METADATA ─── */}
              {formData.category === "Herbicide" && (
                <section className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="flex items-center space-x-2 border-b border-orange-100 pb-2">
                    <AlertTriangle size={16} className="text-orange-700" />
                    <h3 className="text-xs font-black uppercase tracking-widest text-orange-800">🌿 Herbicide Details</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Selectivity</label>
                      <select
                        value={formData.herbicideMetadata.selectivity}
                        onChange={(e) => setFormData({ ...formData, herbicideMetadata: { ...formData.herbicideMetadata, selectivity: e.target.value } })}
                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-black text-gray-900 appearance-none cursor-pointer"
                      >
                        <option value="Selective">Selective</option>
                        <option value="Non-Selective">Non-Selective</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Application Timing</label>
                      <select
                        value={formData.herbicideMetadata.timing}
                        onChange={(e) => setFormData({ ...formData, herbicideMetadata: { ...formData.herbicideMetadata, timing: e.target.value } })}
                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-black text-gray-900 appearance-none cursor-pointer"
                      >
                        <option value="Pre-Emergent">Pre-Emergent</option>
                        <option value="Post-Emergent">Post-Emergent</option>
                        <option value="Both">Both (Pre & Post)</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Technical Name</label>
                      <input
                        type="text"
                        value={formData.herbicideMetadata.technicalName}
                        onChange={(e) => setFormData({ ...formData, herbicideMetadata: { ...formData.herbicideMetadata, technicalName: e.target.value } })}
                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-gray-900"
                        placeholder="e.g., Glyphosate 41% SL"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Dose Per Acre</label>
                      <input
                        type="text"
                        value={formData.herbicideMetadata.dosePerAcre}
                        onChange={(e) => setFormData({ ...formData, herbicideMetadata: { ...formData.herbicideMetadata, dosePerAcre: e.target.value } })}
                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-gray-900"
                        placeholder="e.g., 1.5L/acre"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Target Weeds (comma separated)</label>
                      <input
                        type="text"
                        value={formData.herbicideMetadata.targetWeeds}
                        onChange={(e) => setFormData({ ...formData, herbicideMetadata: { ...formData.herbicideMetadata, targetWeeds: e.target.value } })}
                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-gray-900"
                        placeholder="e.g., Grass, Broadleaf Weeds"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Recommended Crops (comma separated)</label>
                      <input
                        type="text"
                        value={formData.herbicideMetadata.recommendedCrops}
                        onChange={(e) => setFormData({ ...formData, herbicideMetadata: { ...formData.herbicideMetadata, recommendedCrops: e.target.value } })}
                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-gray-900"
                        placeholder="e.g., Wheat, Corn, Soybean"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Water Volume</label>
                      <input
                        type="text"
                        value={formData.herbicideMetadata.waterVolume}
                        onChange={(e) => setFormData({ ...formData, herbicideMetadata: { ...formData.herbicideMetadata, waterVolume: e.target.value } })}
                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-gray-900"
                        placeholder="e.g., 200L/acre"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Rain Fastness</label>
                      <input
                        type="text"
                        value={formData.herbicideMetadata.rainFastness}
                        onChange={(e) => setFormData({ ...formData, herbicideMetadata: { ...formData.herbicideMetadata, rainFastness: e.target.value } })}
                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-gray-900"
                        placeholder="e.g., 1 hour after application"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Toxicity Label</label>
                      <select
                        value={formData.herbicideMetadata.toxicityLabel}
                        onChange={(e) => setFormData({ ...formData, herbicideMetadata: { ...formData.herbicideMetadata, toxicityLabel: e.target.value } })}
                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-black text-gray-900 appearance-none cursor-pointer"
                      >
                        {toxicityLabels.map(t => (
                          <option key={t.id} value={t.id}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                    {/* Toxicity color preview */}
                    <div className="flex items-center space-x-3 p-4 rounded-2xl border border-gray-100 bg-gray-50">
                      <div
                        className="h-10 w-10 rounded-full border-2 border-white shadow-md shrink-0"
                        style={{ backgroundColor: toxicityLabels.find(t => t.id === formData.herbicideMetadata.toxicityLabel)?.color || "#008000" }}
                      />
                      <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Selected Label Color</p>
                        <p className="text-sm font-black text-gray-700">{toxicityLabels.find(t => t.id === formData.herbicideMetadata.toxicityLabel)?.label}</p>
                      </div>
                    </div>
                    <div className="md:col-span-2 flex items-center justify-between bg-orange-50 p-6 rounded-2xl border border-orange-100 shadow-inner">
                      <div className="flex items-center space-x-3">
                        <div
                          className={`h-6 w-11 rounded-full transition-all duration-300 relative cursor-pointer ${formData.herbicideMetadata.avoidDrift ? "bg-orange-600" : "bg-gray-300"}`}
                          onClick={() => setFormData({ ...formData, herbicideMetadata: { ...formData.herbicideMetadata, avoidDrift: !formData.herbicideMetadata.avoidDrift } })}
                        >
                          <div className={`h-4 w-4 bg-white rounded-full absolute top-1 transition-all duration-300 ${formData.herbicideMetadata.avoidDrift ? "left-6" : "left-1"}`} />
                        </div>
                        <span className="text-sm font-black text-gray-700 uppercase tracking-widest">⚠️ Avoid Drift Warning</span>
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {/* Description */}
              <section className="space-y-6">
                <div className="flex items-center space-x-2 text-primary-dark border-b border-gray-50 pb-2">
                  <Plus size={16} />
                  <h3 className="text-xs font-black uppercase tracking-widest">
                    Description & Usage
                  </h3>
                </div>
                <div className="space-y-2">
                  <textarea
                    rows="4"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-medium text-gray-700 leading-relaxed"
                    placeholder="Detailed product description..."
                  />
                </div>

                {/* Rating Field */}
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Product Rating (0–5)</label>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min="0"
                      max="5"
                      step="0.1"
                      value={formData.rating || 4.5}
                      onChange={(e) => setFormData({ ...formData, rating: parseFloat(e.target.value) })}
                      className="flex-1 accent-primary h-2 rounded-full cursor-pointer"
                    />
                    <div className="bg-primary text-white px-4 py-2 rounded-xl font-black text-sm min-w-[60px] text-center">
                      ⭐ {(formData.rating || 4.5).toFixed(1)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between bg-gray-50 p-6 rounded-2xl border border-gray-100 shadow-inner">
                  <div className="flex items-center space-x-3">
                    <div
                      className={`h-6 w-11 rounded-full transition-all duration-300 relative cursor-pointer ${formData.isActive ? "bg-[#2e7d32]" : "bg-gray-300"}`}
                      onClick={() =>
                        setFormData({
                          ...formData,
                          isActive: !formData.isActive,
                        })
                      }
                    >
                      <div
                        className={`h-4 w-4 bg-white rounded-full absolute top-1 transition-all duration-300 ${formData.isActive ? "left-6" : "left-1"}`}
                      />
                    </div>
                    <span className="text-sm font-black text-gray-700 uppercase tracking-widest">
                      Show in App
                    </span>
                  </div>
                </div>
              </section>

              {/* Actions */}
              <div className="pt-10 flex gap-4 sticky bottom-0 bg-white/95 backdrop-blur py-4 border-t border-gray-50 z-20">
                <button
                  type="submit"
                  className="flex-1 bg-primary text-white py-5 rounded-2xl font-black text-sm uppercase tracking-[0.2em] shadow-xl shadow-green-100 hover:bg-primary-dark transition-all active:scale-[0.98] flex items-center justify-center space-x-2"
                >
                  {editingProduct ? "Finalize Updates" : "Publish Product"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Products;
