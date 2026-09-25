const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { db, admin } = require("../core/admin");
const { isAdminRequest } = require("../core/utils");

const REGION = 'asia-south1';

/**
 * Month lookup map supporting English and Hindi names or numeric strings.
 */
const MONTH_INDEX_MAP = {
    "january": 0, "jan": 0, "जनवरी": 0, "1": 0, "01": 0,
    "february": 1, "feb": 1, "फरवरी": 1, "2": 1, "02": 1,
    "march": 2, "mar": 2, "मार्च": 2, "3": 2, "03": 2,
    "april": 3, "apr": 3, "अप्रैल": 3, "4": 3, "04": 3,
    "may": 4, "मई": 4, "5": 4, "05": 4,
    "june": 5, "jun": 5, "जून": 5, "6": 5, "06": 5,
    "july": 6, "jul": 6, "जुलाई": 6, "7": 6, "07": 6,
    "august": 7, "aug": 7, "अगस्त": 7, "8": 7, "08": 7,
    "september": 8, "sep": 8, "सितंबर": 8, "सितम्बर": 8, "9": 8, "09": 8,
    "october": 9, "oct": 9, "अक्टूबर": 9, "10": 9,
    "november": 10, "nov": 10, "नवंबर": 10, "नवम्बर": 10, "11": 10,
    "december": 11, "dec": 11, "दिसंबर": 11, "दिसम्बर": 11, "12": 11
};

/**
 * Normalizes crop names across English and Hindi strings to canonical keys.
 */
function normalizeCropKey(cropName) {
    if (!cropName || typeof cropName !== "string") return "GENERIC";
    const lower = cropName.toLowerCase();

    if (lower.includes("dhan") || lower.includes("paddy") || lower.includes("धान") || lower.includes("rice") || lower.includes("चावल")) {
        return "DHAN";
    }
    if (lower.includes("gobhi") || lower.includes("फूलगोभी") || lower.includes("cauliflower") || lower.includes("cabbage") || lower.includes("पत्तागोभी") || lower.includes("बंदगोभी")) {
        return "GOBHI";
    }
    if (lower.includes("kaddu") || lower.includes("कद्दू") || lower.includes("pumpkin") || lower.includes("lauki") || lower.includes("लौकी") || lower.includes("gourd")) {
        return "KADDU";
    }
    if (lower.includes("makka") || lower.includes("मक्का") || lower.includes("maize") || lower.includes("corn") || lower.includes("भुट्टा")) {
        return "MAKKA";
    }
    if (lower.includes("aloo") || lower.includes("आलू") || lower.includes("potato")) {
        return "ALOO";
    }
    if (lower.includes("sarson") || lower.includes("सरसों") || lower.includes("mustard") || lower.includes("राई")) {
        return "SARSON";
    }
    if (lower.includes("gehun") || lower.includes("गेहूं") || lower.includes("wheat")) {
        return "GEHUN";
    }
    if (lower.includes("tamatar") || lower.includes("टमाटर") || lower.includes("tomato")) {
        return "TAMATAR";
    }
    if (lower.includes("pyaz") || lower.includes("प्याज") || lower.includes("onion")) {
        return "PYAZ";
    }
    if (lower.includes("mirch") || lower.includes("मिर्च") || lower.includes("chilli")) {
        return "MIRCH";
    }
    if (lower.includes("baingan") || lower.includes("बैंगन") || lower.includes("brinjal") || lower.includes("eggplant")) {
        return "BAINGAN";
    }
    if (lower.includes("ganna") || lower.includes("गन्ना") || lower.includes("sugarcane")) {
        return "GANNA";
    }

    return "GENERIC";
}

/**
 * Agronomy Advisory Knowledge Base for stages 1, 2, and 3
 */
const CROP_ADVISORY_KNOWLEDGE_BASE = {
    DHAN: {
        cropDisplayName: "धान (Paddy)",
        durationMonths: 4,
        stages: {
            1: {
                stageName: "Vegetative / Khad Sowing Stage (वानस्पतिक एवं पोषण अवस्था)",
                titleHindi: "🌾 धान पोषण सलाह: नाइट्रोजन, जिंक व फॉस्फोरस प्रबंधन",
                titleEnglish: "🌾 Paddy Nutrition Advisory: Nitrogen, Zinc & Phosphorus Application",
                summaryHindi: "कल्ले फूटने के समय प्रति एकड़ यूरिया (45 किग्रा) और जिंक सल्फेट 33% (5 किग्रा) का पहला छिड़काव/बुड़काव करें।",
                summaryEnglish: "Apply top-dressing of Urea and Zinc Sulphate 33% during tillering to promote vigorous tillers.",
                recommendedActions: [
                    "डीएपी (DAP) व पोटाश की बेसल खुराक के बाद 20-25 दिन पर यूरिया का पहला टॉप-ड्रेसिंग करें।",
                    "जिंक की कमी से खैरा रोग से बचाव हेतु जिंक सल्फेट 33% (5 किग्रा/एकड़) या 21% (10 किग्रा/एकड़) डालें।",
                    "खेत में 2-3 सेमी पानी बनाए रखें ताकि खाद का अवशोषण सुचारु रूप से हो सके।"
                ],
                recommendedProducts: ["Urea 46% N", "Zinc Sulphate 33%", "DAP 18:46:0", "NPK 19:19:19"]
            },
            2: {
                stageName: "Pest & Disease Prevention Stage (कीट एवं रोग रोकथाम अवस्था)",
                titleHindi: "🌾 धान कीट सुरक्षा: तना छेदक व तेला/माहू रोकथाम",
                titleEnglish: "🌾 Paddy Pest Defense: Stem Borer & BPH Prevention",
                summaryHindi: "तना छेदक (Stem Borer) और भूरा माहू/तेला से बचाव हेतु क्लोरेंट्रानिलिप्रोल या कारटाप हाइड्रोक्लोराइड का स्प्रे करें।",
                summaryEnglish: "Spray Chlorantraniliprole or Cartap Hydrochloride to safeguard crop against Stem Borer and Brown Plant Hopper (BPH).",
                recommendedActions: [
                    "तना छेदक (डेड हार्ट / सफेद बाली) दिखने पर कोराजन (Chlorantraniliprole 18.5% SC) 60 मिली/एकड़ स्प्रे करें।",
                    "भूरा माहू (तेला) की रोकथाम के लिए चेस (Pymetrozine 50% WG) 120 ग्राम/एकड़ का छिड़काव पौधे के तने पर करें।",
                    "शीथ ब्लाइट (झुलसा) से बचाव हेतु हेक्साकोनाजोल 5% SC का छिड़काव करें।"
                ],
                recommendedProducts: ["Coragen (Chlorantraniliprole)", "Cartap Hydrochloride 4G/50SP", "Pymetrozine 50% WG", "Hexaconazole 5% SC"]
            },
            3: {
                stageName: "Pre-Harvest / Quality Stage (कटाई पूर्व एवं गुणवत्ता अवस्था)",
                titleHindi: "🌾 धान कटाई पूर्व सलाह: सिंचाई ठहराव एवं समय पर कटाई",
                titleEnglish: "🌾 Paddy Pre-Harvest: Irrigation Cessation & Harvest Timing",
                summaryHindi: "बालियों में 85% दाने सुनहरे होने पर कटाई से 10-14 दिन पूर्व पानी रोकें ताकि दाने ठोस व चमकदार बनें।",
                summaryEnglish: "Stop irrigation 10-14 days prior to harvest when 85% grains turn golden yellow for uniform grain hardening.",
                recommendedActions: [
                    "कटाई से 10-12 दिन पहले खेत से पानी निकाल दें ताकि खेत सूख सके और मशीन/मजदूर से कटाई आसान हो।",
                    "दानों में 14-16% नमी रहने पर कटाई करें, ज्यादा सूखने पर दाने टूटने का डर रहता है।",
                    "कटाई के बाद दानों को तिरपाल पर अच्छी तरह सुखाकर सुरक्षित भंडारण करें।"
                ],
                recommendedProducts: ["Moisture Meter", "Grain Storage Bags", "Tarpaulin"]
            }
        }
    },
    GOBHI: {
        cropDisplayName: "फूलगोभी/पत्तागोभी (Gobhi)",
        durationMonths: 3,
        stages: {
            1: {
                stageName: "Vegetative / Khad Sowing Stage (प्रारंभिक बढ़वार एवं पोषण अवस्था)",
                titleHindi: "🥦 गोभी पोषण सलाह: नाइट्रोजन, फॉस्फोरस एवं बोरॉन खुराक",
                titleEnglish: "🥦 Gobhi Nutrition Advisory: Nitrogen, Phosphorus & Boron Dosing",
                summaryHindi: "रोपाई के 15-20 दिन बाद यूरिया व बोरॉन 20% का प्रयोग करें ताकि पत्तियां चौड़ी और पौधे मजबूत बनें।",
                summaryEnglish: "Apply top-dressing of Urea and Boron 20% 15-20 days after transplanting for strong root and foliage growth.",
                recommendedActions: [
                    "रोपाई के बाद पहली टॉप ड्रेसिंग में 30 किग्रा यूरिया प्रति एकड़ दें।",
                    "गोभी में खोखला तना (Hollow Stem) रोग रोकने हेतु बोरॉन 20% (1 ग्राम/लीटर) का पर्णीय छिड़काव करें।",
                    "जड़ों के फैलाव के लिए ह्यूमिक एसिड 12% का ड्रेंचिंग या छिड़काव करें।"
                ],
                recommendedProducts: ["Urea", "Boron 20%", "NPK 19:19:19", "Humic Acid 12%"]
            },
            2: {
                stageName: "Pest & Disease Prevention Stage (डायमंडबैक मॉथ व कीटनाशक छिड़काव)",
                titleHindi: "🥦 गोभी कीट नियंत्रण: डीबीएम (DBM) इल्ली व तेला रोकथाम",
                titleEnglish: "🥦 Gobhi Pest Shield: Diamondback Moth & Aphid Control",
                summaryHindi: "डायमंडबैक मॉथ (DBM) और माहू/तेला के नियंत्रण के लिए इमामेक्टिन बेंजोएट या स्पाइनोटोरम का छिड़काव करें।",
                summaryEnglish: "Spray Emamectin Benzoate 5% SG or Spinetoram to eliminate Diamondback Moth (DBM) caterpillars and sucking pests.",
                recommendedActions: [
                    "डीबीएम इल्ली दिखते ही प्रोक्लेम (Emamectin Benzoate 5% SG) 80 ग्राम/एकड़ 150-200 लीटर पानी में स्प्रे करें।",
                    "माहू (Aphids) कीट के लिए एसिटामिप्रिड 20% SP (50 ग्राम/एकड़) का इस्तेमाल करें।",
                    "दवा के बेहतर असर के लिए सिलिकॉन स्टिकर (Spreader) अवश्य मिलाएं।"
                ],
                recommendedProducts: ["Emamectin Benzoate 5% SG", "Spinetoram 11.7% SC", "Acetamiprid 20% SP", "Silicon Spreader"]
            },
            3: {
                stageName: "Pre-Harvest / Quality Stage (फूल प्रबंधन एवं कटाई अवस्था)",
                titleHindi: "🥦 गोभी कटाई सलाह: ब्लांचिंग (फूल ढंकना) एवं सुबह की कटाई",
                titleEnglish: "🥦 Gobhi Harvest & Quality: Blanching & Fresh Harvesting",
                summaryHindi: "फूल तैयार होने पर पीलापन रोकने हेतु बाहरी पत्तियों से ढकें (ब्लांचिंग) और सुबह-सुबह कटाई करें।",
                summaryEnglish: "Protect curds from direct sunlight via leaf blanching and harvest early morning to retain maximum freshness.",
                recommendedActions: [
                    "फूलों का रंग सफेद और चमकदार बनाए रखने के लिए पत्तियों से फूल को ढकें।",
                    "फूल जब गठीला और 500-800 ग्राम का हो जाए, तुरंत कटाई करें; अधिक पकने पर फूल बिखरने लगता है।",
                    "कटाई के तुरंत बाद छायादार स्थान पर रखें और मंडी भेजें।"
                ],
                recommendedProducts: ["Crates / Packaging Baskets", "NPK 0:0:50 (Quality booster)"]
            }
        }
    },
    KADDU: {
        cropDisplayName: "कद्दू/लौकी (Kaddu/Cucurbits)",
        durationMonths: 3,
        stages: {
            1: {
                stageName: "Vegetative / Khad Sowing Stage (बेल बढ़वार एवं पोषण अवस्था)",
                titleHindi: "🎃 कद्दू पोषण सलाह: बेलों के तेजी से फैलाव हेतु खाद व जिंक",
                titleEnglish: "🎃 Kaddu Growth Advisory: Balanced Nitrogen, Potash & Zinc",
                summaryHindi: "बेलों के तेज बढ़वार के लिए यूरिया, डीएपी और सूक्ष्म पोषक तत्वों का प्रयोग करें।",
                summaryEnglish: "Apply Urea, DAP, and Micronutrients to support rapid vine branching and root vigor.",
                recommendedActions: [
                    "बेल निकलने पर थाले में 25-30 ग्राम यूरिया प्रति पौधा देकर तुरंत हल्की सिंचाई करें।",
                    "फूलों की संख्या बढ़ाने के लिए NPK 19:19:19 (5 ग्राम/लीटर) का स्प्रे करें।",
                    "बेलों को जलभराव से बचाएं और हवादार जमीन रखें।"
                ],
                recommendedProducts: ["DAP", "Urea", "NPK 19:19:19", "Micronutrient Mix"]
            },
            2: {
                stageName: "Pest & Disease Prevention Stage (फल मक्खी व फफूंद सुरक्षा)",
                titleHindi: "🎃 कद्दू सुरक्षा सलाह: फल मक्खी (Fruit Fly) व लाल भृंग नियंत्रण",
                titleEnglish: "🎃 Kaddu Crop Protection: Fruit Fly & Downy Mildew Control",
                summaryHindi: "फल मक्खी से बचाव के लिए फेरोमोन ट्रैप लगाएं और पाउडरी/डाउनी मिल्ड्यू के लिए मैंकोजेब स्प्रे करें।",
                summaryEnglish: "Install Cue-lure pheromone traps against fruit flies and spray Mancozeb / Metalaxyl against downy mildew.",
                recommendedActions: [
                    "फल मक्खी (Fruit Fly) से 90% बचाव हेतु खेत में 4-6 फेरोमोन ट्रैप प्रति एकड़ लगाएं।",
                    "लाल भृंग (Red Pumpkin Beetle) दिखने पर लैम्ब्डा साइहलोथ्रिन 5% EC (1 मिली/लीटर) स्प्रे करें।",
                    "पत्तियों पर सफेद पाउडर या धब्बे दिखने पर रिडोमिल गोल्ड या हेक्साकोनाजोल का छिड़काव करें।"
                ],
                recommendedProducts: ["Fruit Fly Pheromone Traps", "Mancozeb 75% WP", "Lambda Cyhalothrin 5% EC", "Metalaxyl + Mancozeb"]
            },
            3: {
                stageName: "Pre-Harvest / Quality Stage (परिपक्वता एवं फल तुड़ाई)",
                titleHindi: "🎃 कद्दू तुड़ाई पूर्व सलाह: डंठल सूखने पर सावधानीपूर्वक तुड़ाई",
                titleEnglish: "🎃 Kaddu Harvest & Storage: Stalk Corking & Safe Harvesting",
                summaryHindi: "फल का डंठल सूखने और छिलका कड़ा होने पर तुड़ाई करें; फल को जमीन की सीलन से बचाएं।",
                summaryEnglish: "Harvest when rind hardens and stem turns corky; keep fruits elevated from wet soil to avoid rotting.",
                recommendedActions: [
                    "तुड़ाई से 5-7 दिन पहले सिंचाई बंद करें ताकि फल में मिठास और भंडारण क्षमता बढ़े।",
                    "फल को 2-3 इंच डंठल सहित तेज चाकू से काटें, सीधे न खींचें।",
                    "फलों को हवादार व सूखे स्थान पर भंडारित करें।"
                ],
                recommendedProducts: ["Pruning Shears", "Storage Mats"]
            }
        }
    },
    MAKKA: {
        cropDisplayName: "मक्का (Maize)",
        durationMonths: 3,
        stages: {
            1: {
                stageName: "Vegetative / Khad Sowing Stage (घुटने बराबर बढ़वार एवं टॉप ड्रेसिंग)",
                titleHindi: "🌽 मक्का पोषण सलाह: घुटने बराबर अवस्था पर यूरिया व जिंक",
                titleEnglish: "🌽 Maize Nutrition: Knee-High Stage Nitrogen & Zinc Top-Dressing",
                summaryHindi: "घुटने बराबर अवस्था (Knee-high) पर यूरिया (40 किग्रा/एकड़) व जिंक की टॉप-ड्रेसिंग करें ताकि तना मोटा हो।",
                summaryEnglish: "Side-dress with 40 kg/acre Urea and Zinc Sulphate at knee-high stage for thick stalk and large cob formation.",
                recommendedActions: [
                    "बुवाई के 25-30 दिन बाद मिट्टी चढ़ाते समय यूरिया की पहली टॉप ड्रेसिंग करें।",
                    "जिंक की कमी से पत्तियों में सफेद धारी (White Bud) रोकने हेतु जिंक 33% (4 किग्रा/एकड़) डालें।",
                    "खरपतवार नियंत्रण हेतु एट्राजिन या टेम्बोट्रिओन का अनुशंसित प्रयोग करें।"
                ],
                recommendedProducts: ["Urea 46%", "Zinc Sulphate 33%", "NPK 12:32:16", "Laudis (Tembotrione)"]
            },
            2: {
                stageName: "Pest & Disease Prevention Stage (फॉल आर्मीवर्म / सैनिक कीट रोकथाम)",
                titleHindi: "🌽 मक्का कीट नियंत्रण: फॉल आर्मीवर्म (FAW) रोकथाम स्प्रे",
                titleEnglish: "🌽 Maize Pest Control: Fall Armyworm (FAW) Prevention",
                summaryHindi: "फॉल आर्मीवर्म (सैनिक कीट) से बचाव हेतु पोंगे (Whorl) के अंदर क्लोरेंट्रानिलिप्रोल या नोवाल्यूरॉन का छिड़काव करें।",
                summaryEnglish: "Direct targeted spray into the whorl with Chlorantraniliprole or Novaluron to eliminate Fall Armyworm (FAW) larvae.",
                recommendedActions: [
                    "मक्का के पोंगे में छेद व चूरा दिखने पर कोराजन (0.4 मिली/लीटर) या डेलीगेट (Spinetoram) का छिड़काव सीधे पोंगे में करें।",
                    "जैविक नियंत्रण हेतु मेटाराइजियम या बैसिलस थुरिंजिएंसिस (Bt) का छिड़काव करें।",
                    "तना गलन (Bacterial Stalk Rot) से बचाव के लिए खेत में जल निकासी दुरुस्त रखें।"
                ],
                recommendedProducts: ["Coragen (Chlorantraniliprole 18.5% SC)", "Delegate (Spinetoram 11.7% SC)", "Novaluron 10% EC", "Streptocycline"]
            },
            3: {
                stageName: "Pre-Harvest / Quality Stage (दाना भराव एवं भुट्टा परिपक्वता)",
                titleHindi: "🌽 मक्का कटाई सलाह: भुट्टे के रेशे सूखने पर तुड़ाई एवं सुखाना",
                titleEnglish: "🌽 Maize Harvest: Black Layer Formation & Cob Harvesting",
                summaryHindi: "भुट्टों के छिलके पीले-भूरे होने और दाने के आधार पर काली परत बनने पर सिंचाई रोकें और तुड़ाई करें।",
                summaryEnglish: "Cease irrigation when the black abscission layer forms at grain base; harvest cobs and dry to under 14% moisture.",
                recommendedActions: [
                    "दाना कड़ा होने और दूधियापन खत्म होने पर खेत में पानी देना बंद करें।",
                    "तुड़ाई के बाद भुट्टों को धूप में फैलाकर अच्छी तरह सुखाएं ताकि फंगस या एफ्लाटॉक्सिन न लगे।",
                    "दाने निकालने (Threshing) से पहले नमी 13-14% तक सुनिश्चित करें।"
                ],
                recommendedProducts: ["Cob Sheller", "Hermetic Storage Bags"]
            }
        }
    },
    ALOO: {
        cropDisplayName: "आलू (Potato)",
        durationMonths: 3,
        stages: {
            1: {
                stageName: "Vegetative / Khad Sowing Stage (कंद बढ़वार एवं मिट्टी चढ़ाना)",
                titleHindi: "🥔 आलू पोषण सलाह: मिट्टी चढ़ाने के साथ पोटाश व नाइट्रोजन",
                titleEnglish: "🥔 Potato Nutrition: Earthing-Up Stage Potash & Nitrogen",
                summaryHindi: "बुवाई के 30-35 दिन बाद मिट्टी चढ़ाते समय यूरिया और म्यूरेट ऑफ पोटाश (MOP) की खुराक दें।",
                summaryEnglish: "Apply top-dressing of Urea and MOP during earthing up to maximize tuber initiation and size.",
                recommendedActions: [
                    "कंदों की संख्या और वजन बढ़ाने के लिए पोटाश (MOP या SOP) का प्रयोग बहुत जरूरी है।",
                    "कंदों को धूप से बचाने के लिए अच्छी तरह मिट्टी चढ़ाएं ताकि आलू हरे न हों।",
                    "पोषक तत्वों के त्वरित अवशोषण हेतु NPK 19:19:19 (1 किग्रा/एकड़) का स्प्रे करें।"
                ],
                recommendedProducts: ["MOP (Muriate of Potash)", "Urea", "NPK 19:19:19", "Zinc Chelated"]
            },
            2: {
                stageName: "Pest & Disease Prevention Stage (पछेती झुलसा व माहू/तेला रोकथाम)",
                titleHindi: "🥔 आलू सुरक्षा सलाह: पछेती झुलसा (Late Blight) व माहू रोकथाम",
                titleEnglish: "🥔 Potato Crop Shield: Late Blight & Aphid Prevention",
                summaryHindi: "पछेती झुलसा से बचाव हेतु मैन्कोजेब या साइमोक्सानिल का एहतियाती स्प्रे करें और माहू को रोकें।",
                summaryEnglish: "Apply preventive spray of Mancozeb or Cymoxanil + Mancozeb against Late Blight and Imidacloprid for aphids.",
                recommendedActions: [
                    "कोहरा या बादल छाने पर पछेती झुलसा (Late Blight) का खतरा बढ़ जाता है, तुरंत सेक्टिन (Sectin) या रिडोमिल गोल्ड स्प्रे करें।",
                    "माहू (Aphids) जो वायरस फैलाते हैं, उनके नियंत्रण हेतु कॉन्फिडोर (Imidacloprid 17.8% SL) 50 मिली/एकड़ दें।",
                    "पत्तियों पर जले जैसे धब्बे दिखने पर बिना देरी किए सिस्टेमिक फफूंदनाशक डालें।"
                ],
                recommendedProducts: ["Ridomil Gold (Metalaxyl + Mancozeb)", "Sectin (Fenamidone + Mancozeb)", "Confidor (Imidacloprid)", "Acrobat (Dimethomorph)"]
            },
            3: {
                stageName: "Pre-Harvest / Quality Stage (बेल कटाई एवं छिलका पकाना)",
                titleHindi: "🥔 आलू कटाई पूर्व सलाह: बेल कटाई (Dehaulming) एवं छिलका पकाना",
                titleEnglish: "🥔 Potato Pre-Harvest: Dehaulming & Tuber Skin Curing",
                summaryHindi: "खुदाई से 10-12 दिन पहले आलू की बेलें काट दें (Dehaulming) ताकि कंदों का छिलका सख्त हो सके।",
                summaryEnglish: "Cut potato vines (dehaulming) 10-12 days before harvesting to harden tuber skin and enhance storage life.",
                recommendedActions: [
                    "खुदाई से 12-15 दिन पहले सिंचाई पूरी तरह बंद कर दें।",
                    "बेल कटाई के बाद कंदों को जमीन में ही 10-12 दिन रहने दें ताकि छिलका मजबूत हो और रगड़ न लगे।",
                    "खुदाई के बाद कटे-फटे या रोगग्रस्त आलू अलग छांटकर छाया में सुखाएं।"
                ],
                recommendedProducts: ["Potato Sorting Crates", "Fungicide for storage dip"]
            }
        }
    },
    SARSON: {
        cropDisplayName: "सरसों (Mustard)",
        durationMonths: 4,
        stages: {
            1: {
                stageName: "Vegetative / Khad Sowing Stage (प्रारंभिक बढ़वार व सल्फर प्रयोग)",
                titleHindi: "🌱 सरसों पोषण सलाह: पहली सिंचाई पर यूरिया एवं सल्फर 90%",
                titleEnglish: "🌱 Mustard Nutrition: 1st Irrigation Urea & Sulphur Application",
                summaryHindi: "पहली सिंचाई (30-35 दिन) पर यूरिया (35 किग्रा) और बेंटोनाइट सल्फर 90% (10 किग्रा/एकड़) डालें, इससे तेल प्रतिशत बढ़ता है।",
                summaryEnglish: "Apply 35 kg Urea and 10 kg Sulphur 90% at first irrigation to maximize vegetative vigor and seed oil content.",
                recommendedActions: [
                    "पौधों के बीच 10-15 सेमी की दूरी बनाए रखने हेतु अतिरिक्त पौधे उखाड़ दें (Thinning)।",
                    "सल्फर तेल की मात्रा 2-4% तक बढ़ाता है, इसलिए बेंटोनाइट सल्फर या घुलनशील सल्फर 80% WDG अवश्य दें।",
                    "शाखाएं बढ़ाने के लिए 19:19:19 NPK का एक पर्णीय स्प्रे करें।"
                ],
                recommendedProducts: ["Bentonite Sulphur 90%", "Sulphur 80% WDG", "Urea", "NPK 19:19:19"]
            },
            2: {
                stageName: "Pest & Disease Prevention Stage (माहू/तेला व सफेद रतुआ रोकथाम)",
                titleHindi: "🌱 सरसों कीट नियंत्रण: चेपा/माहू (Mustard Aphid) व झुलसा रोकथाम",
                titleEnglish: "🌱 Mustard Pest Defense: Mustard Aphid (Chepa) & White Rust Control",
                summaryHindi: "फूल और फलियों पर माहू/चेपा दिखने पर डाईमेथोएट या थायमेथॉक्सम 25% WG का छिड़काव करें।",
                summaryEnglish: "Spray Thiamethoxam 25% WG or Dimethoate 30% EC at onset of mustard aphids (Lipaphis erysimi) and White Rust.",
                recommendedActions: [
                    "फूल आते समय जब प्रति शाखा 15-20 माहू दिखें, तुरंत एकतारा (Thiamethoxam 25% WG) 80 ग्राम/एकड़ का छिड़काव करें।",
                    "सफेद रतुआ (White Rust) व अल्टरनेरिया झुलसा से बचाव के लिए मैन्कोजेब 75% WP (2 ग्राम/लीटर) स्प्रे करें।",
                    "छिड़काव दोपहर बाद करें ताकि मधुमक्खियों और परागण पर विपरीत प्रभाव न पड़े।"
                ],
                recommendedProducts: ["Actara (Thiamethoxam 25% WG)", "Rogor (Dimethoate 30% EC)", "Mancozeb 75% WP", "Metalaxyl 35% WS"]
            },
            3: {
                stageName: "Pre-Harvest / Quality Stage (फली परिपक्वता एवं कटाई प्रबंधन)",
                titleHindi: "🌱 सरसों कटाई सलाह: 75% फलियां पीली होने पर सुबह की कटाई",
                titleEnglish: "🌱 Mustard Harvest: Golden Pod Stage Morning Harvesting",
                summaryHindi: "जब 75% फलियां सुनहरी पीली हो जाएं, सुबह के समय कटाई करें ताकि फलियां चटककर दाने न गिरें।",
                summaryEnglish: "Harvest in early morning when 75% siliquae turn golden yellow to prevent pod shattering and seed loss.",
                recommendedActions: [
                    "फली में दाने का रंग भूरा/काला होते ही कटाई की योजना बनाएं, ज्यादा पकने पर फलियां खेत में ही चटक जाती हैं।",
                    "सुबह ओस रहते कटाई करने से दाने झड़ने का नुकसान 90% तक कम हो जाता है।",
                    "खलिहान में 3-4 दिन सुखाने के बाद गहाई (Threshing) करें और दानों में 8% से कम नमी पर भंडारण करें।"
                ],
                recommendedProducts: ["Threshing Sheet / Tirpal", "Hermetic Grain Bags"]
            }
        }
    },
    GENERIC: {
        cropDisplayName: "सामान्य फसल (Crop)",
        durationMonths: 3,
        stages: {
            1: {
                stageName: "Vegetative / Khad Sowing Stage (वानस्पतिक बढ़वार एवं पोषण)",
                titleHindi: "🌱 फसल पोषण सलाह: नाइट्रोजन, फॉस्फोरस एवं जिंक खुराक",
                titleEnglish: "🌱 Crop Nutrition: Balanced Nitrogen, Phosphorus & Micronutrients",
                summaryHindi: "शुरुआती बढ़वार के लिए यूरिया, डीएपी और संतुलित एनपीके का प्रयोग करें।",
                summaryEnglish: "Apply balanced Nitrogen, Phosphorus and Micronutrients during early vegetative growth.",
                recommendedActions: [
                    "पौधों की मजबूत जड़ों के लिए बेसल खाद और समय पर पहली टॉप ड्रेसिंग करें।",
                    "खेत में खरपतवार न पनपने दें और उचित नमी बनाए रखें।"
                ],
                recommendedProducts: ["NPK 19:19:19", "Urea", "Zinc Chelated"]
            },
            2: {
                stageName: "Pest & Disease Prevention Stage (कीट एवं रोग सुरक्षा)",
                titleHindi: "🌿 फसल सुरक्षा सलाह: कीट व फफूंद रोकथाम स्प्रे",
                titleEnglish: "🌿 Crop Protection: Pest & Fungal Disease Prevention",
                summaryHindi: "रस चूसक कीटों और फफूंद जनित रोगों से बचाव हेतु अनुशंसित कीटनाशक/फफूंदनाशक का छिड़काव करें।",
                summaryEnglish: "Spray recommended insecticides and fungicides against sucking pests and foliar diseases.",
                recommendedActions: [
                    "पत्तियों के नीचे और तने का नियमित निरीक्षण करें।",
                    "लक्षण दिखते ही विशेषज्ञ सलाह अनुसार कीटनाशक का स्प्रे करें।"
                ],
                recommendedProducts: ["Imidacloprid 17.8% SL", "Mancozeb 75% WP", "Silicon Spreader"]
            },
            3: {
                stageName: "Pre-Harvest / Quality Stage (कटाई एवं भंडारण प्रबंधन)",
                titleHindi: "🌾 फसल कटाई सलाह: समय पर कटाई एवं सुरक्षित भंडारण",
                titleEnglish: "🌾 Crop Harvest: Timely Harvesting & Storage Guidelines",
                summaryHindi: "फसल के परिपक्व होने पर उचित नमी स्तर पर कटाई करें और सुरक्षित भंडारण करें।",
                summaryEnglish: "Harvest crop at physiological maturity with ideal moisture content and store securely.",
                recommendedActions: [
                    "कटाई से पूर्व सिंचाई रोकें ताकि उपज की गुणवत्ता बनी रहे।",
                    "उपज को अच्छी तरह सुखाकर हवादार गोदाम में रखें।"
                ],
                recommendedProducts: ["Storage Bags", "Tarpaulin"]
            }
        }
    }
};

/**
 * Parses sowing month into 0-11 index.
 */
function parseSowingMonth(monthStr) {
    if (!monthStr || typeof monthStr !== "string") return null;
    const clean = monthStr.trim().toLowerCase();
    if (clean in MONTH_INDEX_MAP) {
        return MONTH_INDEX_MAP[clean];
    }
    // Try matching partial name
    for (const [key, index] of Object.entries(MONTH_INDEX_MAP)) {
        if (clean.includes(key) || key.includes(clean)) {
            return index;
        }
    }
    return null;
}

/**
 * Calculates current crop stage (1, 2, or 3) based on sowing month and current evaluation date.
 */
function calculateCropStage(cropName, sowingMonth, evalDate = new Date()) {
    const cropKey = normalizeCropKey(cropName);
    const knowledge = CROP_ADVISORY_KNOWLEDGE_BASE[cropKey] || CROP_ADVISORY_KNOWLEDGE_BASE.GENERIC;
    const totalDuration = knowledge.durationMonths || 3;

    const currentMonthIndex = evalDate.getMonth();
    const sowingMonthIndex = parseSowingMonth(sowingMonth);

    if (sowingMonthIndex === null) {
        // Fallback if sowing month is unparseable: return Stage 1 by default
        return {
            stage: 1,
            cropKey,
            elapsedMonths: 0,
            stageInfo: knowledge.stages[1]
        };
    }

    // Elapsed months (accounting for year wrapping)
    let elapsed = (currentMonthIndex - sowingMonthIndex + 12) % 12;

    let stage = 1;
    if (totalDuration <= 3) {
        // 3-month crops: Month 0 = Stage 1, Month 1 = Stage 2, Month 2+ = Stage 3
        if (elapsed === 0) {
            stage = 1;
        } else if (elapsed === 1) {
            stage = 2;
        } else {
            stage = 3;
        }
    } else {
        // 4+ month crops (e.g. Dhan, Sarson):
        // Month 0-1 = Stage 1, Month 2 = Stage 2, Month 3+ = Stage 3
        if (elapsed <= 1) {
            stage = 1;
        } else if (elapsed === 2) {
            stage = 2;
        } else {
            stage = 3;
        }
    }

    return {
        stage,
        cropKey,
        elapsedMonths: elapsed,
        stageInfo: knowledge.stages[stage] || knowledge.stages[1]
    };
}

/**
 * Formats a personalized crop stage advisory for a farmer.
 */
function generatePersonalizedAdvisory(farmer, crop, stageCalculation) {
    const farmerName = farmer.name && farmer.name.trim() ? farmer.name.trim() : "Kisan Mitr";
    const farmName = farmer.farmName && farmer.farmName.trim()
        ? farmer.farmName.trim()
        : `${farmerName} का खेत`;

    const cropName = crop.cropName || "फसल";
    const areaStr = crop.allocatedArea ? `${crop.allocatedArea} ${crop.unit || "Katha"}` : "";
    const sowingMonthStr = crop.sowingMonth ? ` (बोआई: ${crop.sowingMonth})` : "";
    const stageInfo = stageCalculation.stageInfo;
    const stageNum = stageCalculation.stage;

    // Build personalized title and body
    const title = `${stageInfo.titleHindi}`;
    const farmSubtitle = areaStr ? `खेत: ${farmName} [${cropName} - ${areaStr}${sowingMonthStr}]` : `खेत: ${farmName} [${cropName}${sowingMonthStr}]`;
    const body = `नमस्ते ${farmerName} जी! ${farmSubtitle}\n${stageInfo.summaryHindi}`;

    const detailedMessage = [
        `🌱 **${stageInfo.stageName}**`,
        `👨‍🌾 **किसान:** ${farmerName} | 🏡 **फार्म:** ${farmName}`,
        `🌾 **फसल विवरण:** ${cropName} (${areaStr || "रकबा दर्ज नहीं"})${sowingMonthStr}`,
        `\n📋 **मुख्य कृषि सलाह:**`,
        `${stageInfo.summaryHindi}`,
        `\n🛠️ **अनुशंसित कृषि कार्य:**`,
        ...(stageInfo.recommendedActions.map(a => `• ${a}`)),
        `\n🛒 **अनुशंसित उत्पाद / खाद / दवा:**`,
        stageInfo.recommendedProducts.join(", ")
    ].join("\n");

    return {
        stage: stageNum,
        stageName: stageInfo.stageName,
        title,
        body,
        summary: stageInfo.summaryHindi,
        detailedMessage,
        recommendedProducts: stageInfo.recommendedProducts,
        recommendedActions: stageInfo.recommendedActions,
        farmName,
        farmerName,
        cropName,
        allocatedArea: crop.allocatedArea || 0,
        unit: crop.unit || "Katha"
    };
}

/**
 * Core engine logic to process crop advisories for users.
 * Supports processing all farmers or a single farmer.
 */
async function processFarmerCropAdvisories(options = {}) {
    const {
        userId = null,
        force = false,
        dryRun = false,
        evalDate = new Date(),
        cooldownDays = 7
    } = options;

    const stats = {
        usersEvaluated: 0,
        usersWithCrops: 0,
        cropsProcessed: 0,
        notificationsCreated: 0,
        pushNotificationsSent: 0,
        skippedCooldown: 0,
        errors: []
    };

    let usersQuery = db.collection("users");
    if (userId) {
        usersQuery = usersQuery.where(admin.firestore.FieldPath.documentId(), "==", userId);
    }

    const snapshot = await usersQuery.get();
    stats.usersEvaluated = snapshot.size;

    const nowTimestamp = admin.firestore.Timestamp.fromDate(evalDate);
    const cooldownMillis = cooldownDays * 24 * 60 * 60 * 1000;

    for (const userDoc of snapshot.docs) {
        const userData = userDoc.data() || {};
        const cropAllocations = userData.cropAllocations;

        if (!Array.isArray(cropAllocations) || cropAllocations.length === 0) {
            continue;
        }

        stats.usersWithCrops++;
        const lastAdvisories = userData.lastCropAdvisories || {};
        let updatedLastAdvisories = { ...lastAdvisories };
        let hasNewAdvisoryForUser = false;

        for (const crop of cropAllocations) {
            if (!crop || !crop.cropName) continue;
            // Ignore crops explicitly marked as HARVESTED if not forcing
            if (!force && crop.status && crop.status.toUpperCase() === "HARVESTED") {
                continue;
            }

            stats.cropsProcessed++;
            const cropIdentifier = crop.id || crop.cropName;
            const stageCalc = calculateCropStage(crop.cropName, crop.sowingMonth, evalDate);
            const advisory = generatePersonalizedAdvisory(userData, crop, stageCalc);

            // Cooldown check: Has this user received an advisory for this crop and stage recently?
            const lastSentForCrop = lastAdvisories[cropIdentifier];
            if (!force && lastSentForCrop && lastSentForCrop.stage === stageCalc.stage) {
                const lastSentDate = lastSentForCrop.sentAt && lastSentForCrop.sentAt.toDate
                    ? lastSentForCrop.sentAt.toDate()
                    : new Date(lastSentForCrop.sentAt || 0);

                if (evalDate.getTime() - lastSentDate.getTime() < cooldownMillis) {
                    stats.skippedCooldown++;
                    continue;
                }
            }

            if (dryRun) {
                stats.notificationsCreated++;
                if (userData.fcmToken) stats.pushNotificationsSent++;
                continue;
            }

            // 1. Create In-App Notification Record in `users/{userId}/notifications`
            try {
                const notificationId = `crop_adv_${cropIdentifier}_stage${stageCalc.stage}_${Date.now()}`;
                const notificationRef = userDoc.ref.collection("notifications").doc(notificationId);

                await notificationRef.set({
                    id: notificationId,
                    title: advisory.title,
                    body: advisory.body,
                    message: advisory.detailedMessage,
                    type: "CROP_ADVISORY",
                    cropId: crop.id || "",
                    cropName: crop.cropName,
                    stage: stageCalc.stage,
                    stageName: stageCalc.stageInfo.stageName,
                    farmName: advisory.farmName,
                    farmerName: advisory.farmerName,
                    recommendedProducts: advisory.recommendedProducts,
                    recommendedActions: advisory.recommendedActions,
                    read: false,
                    isRead: false,
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    data: JSON.stringify({
                        screen: "FARM_PROFILE",
                        actionType: "CROP_STAGE_ADVISORY",
                        cropId: crop.id || "",
                        cropName: crop.cropName,
                        stage: stageCalc.stage
                    })
                });

                stats.notificationsCreated++;
                hasNewAdvisoryForUser = true;

                updatedLastAdvisories[cropIdentifier] = {
                    stage: stageCalc.stage,
                    cropName: crop.cropName,
                    sentAt: nowTimestamp
                };

                // 2. Dispatch FCM Push Notification if token exists
                if (userData.fcmToken && typeof userData.fcmToken === "string" && userData.fcmToken.trim().length > 0) {
                    try {
                        const pushPayload = {
                            token: userData.fcmToken,
                            notification: {
                                title: advisory.title,
                                body: advisory.body.split("\n")[1] || advisory.summary
                            },
                            data: {
                                type: "CROP_ADVISORY",
                                cropName: crop.cropName,
                                stage: String(stageCalc.stage),
                                farmName: advisory.farmName,
                                click_action: "FLUTTER_NOTIFICATION_CLICK"
                            },
                            android: {
                                priority: "high",
                                notification: {
                                    icon: "ic_crop_advisory",
                                    color: "#2E7D32",
                                    channelId: "crop_advisories"
                                }
                            }
                        };

                        await admin.messaging().send(pushPayload);
                        stats.pushNotificationsSent++;
                    } catch (fcmErr) {
                        console.warn(`[CROP ADVISORY FCM] Failed to send push to user ${userDoc.id}:`, fcmErr.message);
                        stats.errors.push({ userId: userDoc.id, type: "FCM_ERROR", error: fcmErr.message });
                    }
                }
            } catch (notifErr) {
                console.error(`[CROP ADVISORY ERROR] Failed to save in-app notification for user ${userDoc.id}:`, notifErr);
                stats.errors.push({ userId: userDoc.id, type: "IN_APP_SAVE_ERROR", error: notifErr.message });
            }
        }

        // Update user document with latest advisory timestamps
        if (!dryRun && hasNewAdvisoryForUser) {
            try {
                await userDoc.ref.update({
                    lastCropAdvisories: updatedLastAdvisories,
                    lastAdvisoryRunAt: admin.firestore.FieldValue.serverTimestamp()
                });
            } catch (updateErr) {
                console.warn(`[CROP ADVISORY] Failed to update lastCropAdvisories for user ${userDoc.id}:`, updateErr.message);
            }
        }
    }

    console.log("[CROP ADVISORY ENGINE] Run finished:", JSON.stringify(stats));
    return stats;
}

/**
 * Scheduled Cloud Function: Runs daily at 06:00 AM IST.
 */
exports.cronCropAdvisory = onSchedule({
    schedule: "0 6 * * *",
    timeZone: "Asia/Kolkata",
    region: REGION
}, async (event) => {
    console.log("[CRON CROP ADVISORY] Starting daily crop advisory scheduled run at 06:00 IST...");
    try {
        const results = await processFarmerCropAdvisories({
            force: false,
            dryRun: false
        });
        console.log("[CRON CROP ADVISORY] Completed successfully:", results);
        return results;
    } catch (error) {
        console.error("[CRON CROP ADVISORY ERROR]:", error);
        throw error;
    }
});

/**
 * Manual Trigger Endpoint (Callable Function)
 * Allows Admin or Farmer to trigger on-demand advisory analysis with optional dryRun and user filtering.
 */
exports.runCropAdvisoryEngine = onCall({ region: REGION }, async (request) => {
    const context = { auth: request.auth };
    const data = request.data || {};
    const { userId = null, force = false, dryRun = false } = data;

    // Check permissions: Admin can run for all or any user; non-admin can only run for their own userId
    const isAdmin = await isAdminRequest(context);
    if (!isAdmin) {
        if (!request.auth || !request.auth.uid) {
            throw new HttpsError("unauthenticated", "Authentication required to run advisory engine.");
        }
        if (userId && userId !== request.auth.uid) {
            throw new HttpsError("permission-denied", "You can only run crop advisories for your own account.");
        }
    }

    const targetUserId = isAdmin ? userId : request.auth.uid;

    try {
        const results = await processFarmerCropAdvisories({
            userId: targetUserId,
            force: Boolean(force),
            dryRun: Boolean(dryRun)
        });

        return {
            success: true,
            timestamp: new Date().toISOString(),
            results
        };
    } catch (error) {
        console.error("[MANUAL CROP ADVISORY ERROR]:", error);
        throw new HttpsError("internal", error.message || "Error running crop advisory engine.");
    }
});

// Export helper utilities for testing or modular reuse
exports.calculateCropStage = calculateCropStage;
exports.normalizeCropKey = normalizeCropKey;
exports.generatePersonalizedAdvisory = generatePersonalizedAdvisory;
exports.processFarmerCropAdvisories = processFarmerCropAdvisories;
exports.CROP_ADVISORY_KNOWLEDGE_BASE = CROP_ADVISORY_KNOWLEDGE_BASE;
