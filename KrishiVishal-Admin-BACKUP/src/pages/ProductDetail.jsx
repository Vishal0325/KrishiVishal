import React, { useState, useEffect } from "react";
import {
  collection,
  query,
  onSnapshot,
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import { db } from "../firebase/config";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase/config";
import VariantSelector from "../components/common/VariantSelector";
import { formatCurrency } from "../utils/formatters";
import {
  ArrowLeft,
  Share2,
  Heart,
  ShoppingCart,
  Star,
  MapPin,
  Phone,
  Package2,
  Truck,
  Shield,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import toast from "react-hot-toast";
import { useNavigate, useParams } from "react-router-dom";

const ProductDetail = () => {
  const navigate = useNavigate();
  const { productId } = useParams();

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isFavorite, setIsFavorite] = useState(false);
  const [activeTab, setActiveTab] = useState("info");
  const [recommendations, setRecommendations] = useState(null);
  const [loadingRecs, setLoadingRecs] = useState(false);

  useEffect(() => {
    if (activeTab === "recommendations" && !recommendations) {
      fetchRecommendations();
    }
  }, [activeTab]);

  const fetchRecommendations = async () => {
    setLoadingRecs(true);
    try {
      const getRecs = httpsCallable(functions, "getRecommendations");
      const result = await getRecs({ productId });
      setRecommendations(result.data);
    } catch (error) {
      console.error("Error fetching recommendations:", error);
      toast.error("Failed to load recommendations");
    } finally {
      setLoadingRecs(false);
    }
  };

  const handlePinProduct = async (pId, section) => {
    try {
      const docRef = doc(db, "products", productId);
      await updateDoc(docRef, {
        [`recommendationPins.${section}`]: arrayUnion(pId)
      });
      toast.success(`Product pinned to ${section}`);
      fetchRecommendations();
    } catch (error) {
      toast.error("Failed to pin product");
    }
  };

  const handleUpdateUsage = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const updates = {
      usageInstructions: formData.get("usageInstructions"),
      applicationMethod: formData.get("applicationMethod"),
      safetyNotes: formData.get("safetyNotes"),
      mixingCompatibility: formData.get("mixingCompatibility"),
      targetCrops: formData.get("targetCrops").split(",").map(s => s.trim()).filter(s => !!s),
      targetPests: formData.get("targetPests").split(",").map(s => s.trim()).filter(s => !!s),
    };

    try {
      const docRef = doc(db, "products", productId);
      await updateDoc(docRef, updates);
      setProduct({ ...product, ...updates });
      toast.success("Product information updated");
    } catch (error) {
      toast.error("Update failed");
    }
  };

  useEffect(() => {
    if (!productId) return;

    const docRef = doc(db, "products", productId);
    getDoc(docRef).then((snapshot) => {
      if (snapshot.exists()) {
        setProduct({ id: snapshot.id, ...snapshot.data() });
        // Set first variant as default
        const data = snapshot.data();
        if (data.variants && data.variants.length > 0) {
          setSelectedVariant(data.variants[0]);
        }
      }
      setLoading(false);
    });
  }, [productId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin">
          <Package2 size={32} className="text-primary" />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex flex-col items-center justify-center h-screen space-y-4">
        <AlertCircle size={48} className="text-red-500" />
        <h1 className="text-2xl font-black text-gray-900">Product Not Found</h1>
        <button
          onClick={() => navigate("/products")}
          className="bg-primary text-white px-6 py-3 rounded-2xl font-black"
        >
          Back to Products
        </button>
      </div>
    );
  }

  const images = product.images || [];
  const currentImage = images[currentImageIndex] || "https://placehold.co/400x400?text=No+Image";

  // Calculate displayed price and stock
  let displayPrice = product.price;
  let displayMrp = product.mrp;
  let displayStock = product.stockQuantity || product.stock;

  if (selectedVariant) {
    displayPrice = Number(selectedVariant.price);
    displayMrp = Number(selectedVariant.mrp);
    displayStock = Number(selectedVariant.stock);
  }

  const discount = Math.round(
    100 - (displayPrice / displayMrp) * 100
  );

  const handleAddToCart = () => {
    if (displayStock <= 0) {
      toast.error("Product out of stock");
      return;
    }

    const cartItem = {
      productId: product.id,
      productName: product.name,
      brand: product.brand,
      variant: selectedVariant
        ? `${selectedVariant.label} (${selectedVariant.size} ${product.unit})`
        : `${product.weight} ${product.unit}`,
      price: displayPrice,
      mrp: displayMrp,
      quantity: quantity,
      imageUrl: currentImage,
      totalPrice: displayPrice * quantity,
    };

    // IMPLEMENTATION: Save to local storage for Admin-assisted orders or future Web App integration
    const existingCart = JSON.parse(localStorage.getItem("admin_cart") || "[]");
    const newCart = [...existingCart, cartItem];
    localStorage.setItem("admin_cart", JSON.stringify(newCart));

    toast.success(`${quantity} ${cartItem.variant} added to local cart!`);
    console.log("Cart Updated:", newCart);
  };

  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-100 z-40 p-4 md:p-6 flex items-center justify-between">
        <button
          onClick={() => navigate("/products")}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <ArrowLeft size={24} className="text-gray-700" />
        </button>
        <h1 className="flex-1 text-center text-lg font-black text-gray-900 truncate mx-4">
          {product.name}
        </h1>
        <button className="p-2 hover:bg-gray-100 rounded-full transition-colors">
          <Share2 size={20} className="text-gray-700" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 px-4 md:px-6">
        <button
          onClick={() => setActiveTab("info")}
          className={`px-4 py-2 font-black text-sm border-b-2 transition-all ${
            activeTab === "info" ? "border-primary text-primary" : "border-transparent text-gray-400"
          }`}
        >
          Product Info
        </button>
        <button
          onClick={() => setActiveTab("recommendations")}
          className={`px-4 py-2 font-black text-sm border-b-2 transition-all ${
            activeTab === "recommendations" ? "border-primary text-primary" : "border-transparent text-gray-400"
          }`}
        >
          Recommendations
        </button>
        <button
          onClick={() => setActiveTab("usage")}
          className={`px-4 py-2 font-black text-sm border-b-2 transition-all ${
            activeTab === "usage" ? "border-primary text-primary" : "border-transparent text-gray-400"
          }`}
        >
          Usage & Discovery
        </button>
      </div>

      <div className="max-w-4xl mx-auto px-4 md:px-6 space-y-8">
        {activeTab === "info" ? (
          <>
            {/* Image Gallery */}
            <section className="space-y-4">
          <div className="relative bg-gray-100 rounded-3xl overflow-hidden aspect-square flex items-center justify-center">
            <img
              src={currentImage}
              alt={product.name}
              className="w-full h-full object-cover"
            />

            {/* Image Navigation */}
            {images.length > 1 && (
              <>
                <button
                  onClick={() =>
                    setCurrentImageIndex((i) =>
                      i === 0 ? images.length - 1 : i - 1
                    )
                  }
                  className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white p-2 rounded-full transition-all"
                >
                  <ChevronLeft size={24} />
                </button>
                <button
                  onClick={() =>
                    setCurrentImageIndex((i) =>
                      i === images.length - 1 ? 0 : i + 1
                    )
                  }
                  className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white p-2 rounded-full transition-all"
                >
                  <ChevronRight size={24} />
                </button>
              </>
            )}

            {/* Image Counter */}
            {images.length > 1 && (
              <div className="absolute bottom-4 right-4 bg-black/60 text-white px-3 py-1 rounded-full text-xs font-black">
                {currentImageIndex + 1} / {images.length}
              </div>
            )}
          </div>

          {/* Image Thumbnails */}
          {images.length > 1 && (
            <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
              {images.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentImageIndex(idx)}
                  className={`aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                    idx === currentImageIndex
                      ? "border-primary shadow-lg"
                      : "border-gray-200 hover:border-primary"
                  }`}
                >
                  <img src={img} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Product Info */}
        <section className="space-y-4">
          <div>
            <div className="flex items-start justify-between mb-3">
              <div>
                <h1 className="text-3xl md:text-4xl font-black text-gray-900">
                  {product.name}
                </h1>
                {product.brand && (
                  <p className="text-sm text-gray-400 font-bold uppercase tracking-widest mt-1">
                    Brand: {product.brand}
                  </p>
                )}
              </div>
              <button
                onClick={() => setIsFavorite(!isFavorite)}
                className={`p-3 rounded-full transition-all ${
                  isFavorite
                    ? "bg-red-50 text-red-600"
                    : "bg-gray-50 text-gray-400 hover:text-red-600"
                }`}
              >
                <Heart size={24} fill={isFavorite ? "currentColor" : "none"} />
              </button>
            </div>

            {/* Rating */}
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-1">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    size={16}
                    className={
                      i < (product.rating || 4)
                        ? "fill-orange-400 text-orange-400"
                        : "text-gray-300"
                    }
                  />
                ))}
              </div>
              <span className="text-sm font-black text-gray-700">
                {product.rating || 4.5} ({product.reviewCount || 0} reviews)
              </span>
            </div>
          </div>

          {/* Pricing */}
          <div className="bg-green-50 border-2 border-green-200 rounded-3xl p-6 space-y-3">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-2">
                  Current Price
                </p>
                <div className="flex items-center space-x-3">
                  <p className="text-4xl font-black text-green-700">
                    {formatCurrency(displayPrice)}
                  </p>
                  <p className="text-lg font-black text-gray-400 line-through">
                    {formatCurrency(displayMrp)}
                  </p>
                </div>
              </div>
              <div className="bg-orange-500 text-white px-4 py-2 rounded-2xl">
                <p className="font-black text-lg">{discount}% OFF</p>
              </div>
            </div>

            {displayStock > 0 ? (
              <p className="text-sm font-bold text-green-700">
                ✓ {displayStock} units available
              </p>
            ) : (
              <p className="text-sm font-bold text-red-600">
                ✗ Out of stock
              </p>
            )}
          </div>
        </section>

        {/* Variant Selector */}
        {(product.variants && product.variants.length > 0) && (
          <section>
            <VariantSelector
              product={product}
              selectedVariant={selectedVariant}
              onVariantSelect={setSelectedVariant}
              showPrice={true}
            />
          </section>
        )}

        {/* Description */}
        {product.description && (
          <section className="space-y-3">
            <h3 className="text-lg font-black text-gray-900">Description</h3>
            <p className="text-gray-700 leading-relaxed">
              {product.description}
            </p>
          </section>
        )}

        {/* Category & Unit */}
        <section className="grid grid-cols-2 gap-4">
          <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">
              Category
            </p>
            <p className="font-black text-gray-900">{product.category}</p>
          </div>
          <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">
              Unit
            </p>
            <p className="font-black text-gray-900">{product.unit}</p>
          </div>
        </section>

        {/* Benefits */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border-2 border-green-200 rounded-2xl p-4 bg-green-50">
            <Truck className="text-green-600 mb-2" size={24} />
            <p className="font-black text-sm text-gray-900">Free Delivery</p>
            <p className="text-[10px] text-gray-500">On orders above ₹500</p>
          </div>
          <div className="border-2 border-blue-200 rounded-2xl p-4 bg-blue-50">
            <Shield className="text-blue-600 mb-2" size={24} />
            <p className="font-black text-sm text-gray-900">Verified Seller</p>
            <p className="text-[10px] text-gray-500">100% authentic products</p>
          </div>
          <div className="border-2 border-orange-200 rounded-2xl p-4 bg-orange-50">
            <Package2 className="text-orange-600 mb-2" size={24} />
            <p className="font-black text-sm text-gray-900">Easy Returns</p>
            <p className="text-[10px] text-gray-500">7-day money back guarantee</p>
          </div>
        </section>

        {/* Quantity Selector & Add to Cart */}
        <section className="space-y-4 sticky bottom-0 bg-white pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between bg-gray-50 rounded-2xl p-3 border border-gray-100">
            <label className="text-xs font-black text-gray-400 uppercase tracking-widest">
              Quantity
            </label>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="w-8 h-8 bg-white border border-gray-200 rounded-lg font-black text-gray-700 hover:bg-gray-100"
              >
                −
              </button>
              <span className="w-8 text-center font-black text-gray-900">
                {quantity}
              </span>
              <button
                onClick={() =>
                  setQuantity(Math.min(displayStock, quantity + 1))
                }
                className="w-8 h-8 bg-white border border-gray-200 rounded-lg font-black text-gray-700 hover:bg-gray-100"
              >
                +
              </button>
            </div>
          </div>

          <button
            onClick={handleAddToCart}
            disabled={displayStock <= 0}
            className={`w-full py-4 rounded-2xl font-black text-white text-lg uppercase tracking-widest flex items-center justify-center space-x-2 transition-all ${
              displayStock > 0
                ? "bg-primary hover:bg-primary-dark active:scale-95 shadow-lg shadow-green-100"
                : "bg-gray-300 cursor-not-allowed"
            }`}
          >
            <ShoppingCart size={24} />
            <span>
              {displayStock > 0
                ? "Add to Cart"
                : "Out of Stock"}
            </span>
          </button>
        </section>
          </>
        ) : activeTab === "recommendations" ? (
          <section className="space-y-6">
            <h2 className="text-xl font-black text-gray-900">Manage Recommendations</h2>
            {loadingRecs ? (
              <div className="flex justify-center py-10"><div className="animate-spin text-primary"><Package2 /></div></div>
            ) : recommendations ? (
              <div className="space-y-8">
                {Object.entries(recommendations).map(([section, items]) => (
                  <div key={section} className="space-y-3">
                    <h3 className="text-lg font-black capitalize text-gray-700">{section} Results</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {items.map(item => (
                        <div key={item.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
                          <div className="flex items-center space-x-3">
                            <img src={item.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover" />
                            <div>
                              <p className="font-black text-sm text-gray-900">{item.name}</p>
                              <p className="text-xs text-gray-500">{item.brand} | Score: {item.finalScore}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => handlePinProduct(item.id, section)}
                            className="bg-primary/10 text-primary p-2 rounded-xl hover:bg-primary/20"
                          >
                            Pin
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">Click tab to load recommendations</p>
            )}
          </section>
        ) : (
          <section className="space-y-6">
            <h2 className="text-xl font-black text-gray-900">Product Usage & Target Info</h2>
            <form onSubmit={handleUpdateUsage} className="space-y-4 bg-gray-50 p-6 rounded-3xl border border-gray-100">
              <div>
                <label className="text-xs font-black text-gray-400 uppercase">Usage Instructions</label>
                <textarea
                  name="usageInstructions"
                  defaultValue={product.usageInstructions}
                  className="w-full p-4 rounded-2xl border-2 border-gray-200 focus:border-primary outline-none mt-1"
                  rows={4}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-black text-gray-400 uppercase">Target Crops (comma separated)</label>
                  <input
                    name="targetCrops"
                    defaultValue={product.targetCrops?.join(", ")}
                    className="w-full p-4 rounded-2xl border-2 border-gray-200 focus:border-primary outline-none mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-black text-gray-400 uppercase">Target Pests (comma separated)</label>
                  <input
                    name="targetPests"
                    defaultValue={product.targetPests?.join(", ")}
                    className="w-full p-4 rounded-2xl border-2 border-gray-200 focus:border-primary outline-none mt-1"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-black text-gray-400 uppercase">Application Method</label>
                <input
                  name="applicationMethod"
                  defaultValue={product.applicationMethod}
                  className="w-full p-4 rounded-2xl border-2 border-gray-200 focus:border-primary outline-none mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-black text-gray-400 uppercase">Mixing Compatibility</label>
                <input
                  name="mixingCompatibility"
                  defaultValue={product.mixingCompatibility}
                  className="w-full p-4 rounded-2xl border-2 border-gray-200 focus:border-primary outline-none mt-1"
                  placeholder="e.g. Compatible with Urea"
                />
              </div>
              <div>
                <label className="text-xs font-black text-gray-400 uppercase text-red-500">Safety Notes</label>
                <input
                  name="safetyNotes"
                  defaultValue={product.safetyNotes}
                  className="w-full p-4 rounded-2xl border-2 border-red-100 focus:border-red-500 outline-none mt-1"
                />
              </div>
              <button type="submit" className="w-full py-4 bg-primary text-white font-black rounded-2xl shadow-lg shadow-green-100 uppercase tracking-widest">
                Save Usage Info
              </button>
            </form>
          </section>
        )}
      </div>
    </div>
  );
};

export default ProductDetail;
