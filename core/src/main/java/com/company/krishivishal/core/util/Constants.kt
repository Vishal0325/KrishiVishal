package com.company.krishivishal.core.util

import com.company.krishivishal.core.model.Product

object Constants {
    const val GUEST_USER_ID = "guest_user"

    val PRODUCT_CATEGORIES = listOf(
        "Insecticide",
        "Fungicide",
        "Herbicide",
        "PGR",
        "Tools",
        "Micro Nutrients",
        "Seeds"
    )

    val SAMPLE_CATEGORIES = listOf(
        com.company.krishivishal.core.model.Category("cat_1", "Insecticide", "https://firebasestorage.googleapis.com/v0/b/krishivishal-1.appspot.com/o/categories%2Finsecticide.png?alt=media"),
        com.company.krishivishal.core.model.Category("cat_2", "Fungicide", "https://firebasestorage.googleapis.com/v0/b/krishivishal-1.appspot.com/o/categories%2Ffungicide.png?alt=media"),
        com.company.krishivishal.core.model.Category("cat_3", "Herbicide", "https://firebasestorage.googleapis.com/v0/b/krishivishal-1.appspot.com/o/categories%2Fherbicide.png?alt=media"),
        com.company.krishivishal.core.model.Category("cat_4", "Seeds", "https://firebasestorage.googleapis.com/v0/b/krishivishal-1.appspot.com/o/categories%2Fseeds.png?alt=media"),
        com.company.krishivishal.core.model.Category("cat_5", "PGR", "https://firebasestorage.googleapis.com/v0/b/krishivishal-1.appspot.com/o/categories%2Fpgr.png?alt=media")
    )

    val SAMPLE_BRANDS = listOf(
        com.company.krishivishal.core.model.Brand("b_1", "Syngenta", "https://firebasestorage.googleapis.com/v0/b/krishivishal-1.appspot.com/o/brands%2Fsyngenta.png?alt=media"),
        com.company.krishivishal.core.model.Brand("b_2", "Bayer", "https://firebasestorage.googleapis.com/v0/b/krishivishal-1.appspot.com/o/brands%2Fbayer.png?alt=media"),
        com.company.krishivishal.core.model.Brand("b_3", "UPL", "https://firebasestorage.googleapis.com/v0/b/krishivishal-1.appspot.com/o/brands%2Fupl.png?alt=media"),
        com.company.krishivishal.core.model.Brand("b_4", "PI Industries", "https://firebasestorage.googleapis.com/v0/b/krishivishal-1.appspot.com/o/brands%2Fpi.png?alt=media"),
        com.company.krishivishal.core.model.Brand("b_5", "BASF", "https://firebasestorage.googleapis.com/v0/b/krishivishal-1.appspot.com/o/brands%2Fbasf.png?alt=media")
    )

    val SAMPLE_CROPS = listOf(
        com.company.krishivishal.core.model.Crop("cr_1", "Rice", "https://firebasestorage.googleapis.com/v0/b/krishivishal-1.appspot.com/o/crops%2Frice.png?alt=media"),
        com.company.krishivishal.core.model.Crop("cr_2", "Wheat", "https://firebasestorage.googleapis.com/v0/b/krishivishal-1.appspot.com/o/crops%2Fwheat.png?alt=media"),
        com.company.krishivishal.core.model.Crop("cr_3", "Cotton", "https://firebasestorage.googleapis.com/v0/b/krishivishal-1.appspot.com/o/crops%2Fcotton.png?alt=media"),
        com.company.krishivishal.core.model.Crop("cr_4", "Sugarcane", "https://firebasestorage.googleapis.com/v0/b/krishivishal-1.appspot.com/o/crops%2Fsugarcane.png?alt=media"),
        com.company.krishivishal.core.model.Crop("cr_5", "Maize", "https://firebasestorage.googleapis.com/v0/b/krishivishal-1.appspot.com/o/crops%2Fmaize.png?alt=media")
    )

    val SAMPLE_BANNERS = listOf(
        com.company.krishivishal.core.model.BannerItem("b1", "https://firebasestorage.googleapis.com/v0/b/krishivishal-1.appspot.com/o/banners%2Fbanner1.png?alt=media"),
        com.company.krishivishal.core.model.BannerItem("b2", "https://firebasestorage.googleapis.com/v0/b/krishivishal-1.appspot.com/o/banners%2Fbanner2.png?alt=media")
    )

    val SAMPLE_PRODUCTS = listOf(
        Product(
            id = "prod_1",
            name = "Imidacloprid 17.8% SL",
            brand = "Syngenta",
            description = "Systemic insecticide for sucking pests",
            usage = "Mix 1ml per liter of water",
            price = 450.0,
            mrp = 500.0,
            images = listOf("https://via.placeholder.com/200?text=Imidacloprid"),
            category = "Insecticide",
            subCategory = "Insecticide",
            rating = 4.5f,
            reviewCount = 120,
            stock = 50,
            unit = "500ml",
            weight = "500ml",
            isActive = true
        ),
        Product(
            id = "prod_2",
            name = "Copper Oxychloride 50% WP",
            brand = "Nufarm",
            description = "Fungicide for leaf spots and blights",
            usage = "Mix 3gm per liter of water",
            price = 320.0,
            mrp = 400.0,
            images = listOf("https://via.placeholder.com/200?text=CopperOxychloride"),
            category = "Fungicide",
            subCategory = "Fungicide",
            rating = 4.2f,
            reviewCount = 95,
            stock = 75,
            unit = "1kg",
            weight = "1kg",
            isActive = true
        ),
        Product(
            id = "prod_3",
            name = "Glyphosate 41% SL",
            brand = "Bayer",
            description = "Non-selective herbicide for weed control",
            usage = "Mix 1.5ml per liter of water",
            price = 280.0,
            mrp = 350.0,
            images = listOf("https://via.placeholder.com/200?text=Glyphosate"),
            category = "Herbicide",
            subCategory = "Herbicide",
            rating = 4.6f,
            reviewCount = 200,
            stock = 100,
            unit = "1L",
            weight = "1L",
            isActive = true
        ),
        Product(
            id = "prod_4",
            name = "Gibberellic Acid 40% SL",
            brand = "PI Industries",
            description = "Plant growth regulator for improved yield",
            usage = "Spray 1ml per 100 liters water",
            price = 1200.0,
            mrp = 1500.0,
            images = listOf("https://via.placeholder.com/200?text=GibberelicAcid"),
            category = "PGR",
            subCategory = "PGR",
            rating = 4.4f,
            reviewCount = 80,
            stock = 30,
            unit = "500ml",
            weight = "500ml",
            isActive = true
        ),
        Product(
            id = "prod_5",
            name = "Hand Weeding Tool",
            brand = "KrishiKart",
            description = "Stainless steel weeding tool for easy removal",
            usage = "Manual use for weed removal",
            price = 150.0,
            mrp = 200.0,
            images = listOf("https://via.placeholder.com/200?text=WeedingTool"),
            category = "Tools",
            subCategory = "Tools",
            rating = 4.3f,
            reviewCount = 150,
            stock = 200,
            unit = "1 piece",
            weight = "1 piece",
            isActive = true
        ),
        Product(
            id = "prod_6",
            name = "Zinc Sulphate 21% WS",
            brand = "Rashtriya",
            description = "Micro nutrient for crop nutrition",
            usage = "Mix 5gm per liter water or soil application",
            price = 180.0,
            mrp = 220.0,
            images = listOf("https://via.placeholder.com/200?text=ZincSulphate"),
            category = "Micro Nutrients",
            subCategory = "Micro Nutrients",
            rating = 4.1f,
            reviewCount = 110,
            stock = 80,
            unit = "500kg",
            weight = "500kg",
            isActive = true
        ),
        Product(
            id = "prod_7",
            name = "Basmati Rice Seeds",
            brand = "Monsanto",
            description = "High-quality basmati rice seeds for premium yield",
            usage = "Sow 40-50kg per hectare",
            price = 2500.0,
            mrp = 3000.0,
            images = listOf("https://via.placeholder.com/200?text=RiceSeeds"),
            category = "Seeds",
            subCategory = "Seeds",
            rating = 4.7f,
            reviewCount = 250,
            stock = 40,
            unit = "10kg",
            weight = "10kg",
            isActive = true
        ),
        Product(
            id = "prod_8",
            name = "Thiram 75% WS",
            brand = "Agrichem",
            description = "Fungicide for seed treatment and foliar application",
            usage = "Seed treatment 2.5gm per kg",
            price = 420.0,
            mrp = 500.0,
            images = listOf("https://via.placeholder.com/200?text=Thiram"),
            category = "Fungicide",
            subCategory = "Fungicide",
            rating = 4.5f,
            reviewCount = 140,
            stock = 60,
            unit = "500gm",
            weight = "500gm",
            isActive = true
        )
    )
}
