import React, { createContext, useContext, useState, useEffect } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../hooks/useAuth";

const WarehouseContext = createContext();

export const WarehouseProvider = ({ children }) => {
  const { user, role } = useAuth();
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState(() => {
    return localStorage.getItem("kv_selected_warehouse") || "ALL";
  });

  // Listen to active warehouses in Firestore
  useEffect(() => {
    try {
      const unsub = onSnapshot(collection(db, "warehouses"), (snapshot) => {
        if (!snapshot.empty) {
          const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
          setWarehouses(list);
        } else {
          setWarehouses([]);
        }
        setLoading(false);
      }, (err) => {
        console.warn("Error fetching warehouses in context:", err);
        setWarehouses([]);
        setLoading(false);
      });
      return () => unsub();
    } catch (e) {
      setWarehouses([]);
      setLoading(false);
    }
  }, []);

  // Update selected warehouse ID & save to localStorage
  const selectWarehouse = (id) => {
    setSelectedWarehouseId(id);
    if (id) {
      localStorage.setItem("kv_selected_warehouse", id);
    } else {
      localStorage.removeItem("kv_selected_warehouse");
    }
  };

  const isGlobalView = selectedWarehouseId === "ALL" || !selectedWarehouseId;
  const selectedWarehouse = warehouses.find((w) => w.id === selectedWarehouseId || w.code === selectedWarehouseId) || null;

  return (
    <WarehouseContext.Provider
      value={{
        warehouses,
        selectedWarehouseId,
        selectedWarehouse,
        selectWarehouse,
        isGlobalView,
        loading
      }}
    >
      {children}
    </WarehouseContext.Provider>
  );
};

export const useWarehouse = () => {
  const context = useContext(WarehouseContext);
  if (!context) {
    throw new Error("useWarehouse must be used within a WarehouseProvider");
  }
  return context;
};
