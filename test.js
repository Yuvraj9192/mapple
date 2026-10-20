
import express from "express";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const MAPPLS_URL =
    "https://search.mappls.com/search/places/nearby/json";

// Broad categories first, followed by specific categories.
const categories = [
    // Broad business discovery
    "shops",
    "restaurants",
    "business services",
    "healthcare",
    "education",
    "hotels",
    "offices",
    "professional services",
    "shopping malls",
    "industrial establishments",

    // Food and groceries
    "cafes",
    "bakeries",
    "fast food",
    "sweet shops",
    "grocery stores",
    "supermarkets",
    "dairy shops",
    "fruit and vegetable shops",
    "caterers",

    // Healthcare
    "hospitals",
    "clinics",
    "dentists",
    "pharmacies",
    "diagnostic laboratories",
    "eye clinics",
    "physiotherapy centres",
    "veterinary clinics",

    // Education
    "schools",
    "colleges",
    "universities",
    "coaching centres",
    "computer institutes",
    "preschools",
    "training institutes",

    // Retail
    "clothing stores",
    "footwear stores",
    "mobile shops",
    "electronics stores",
    "furniture stores",
    "hardware stores",
    "jewellery shops",
    "gift shops",
    "stationery shops",
    "building material suppliers",

    // Personal and professional services
    "salons",
    "beauty parlours",
    "gyms",
    "spas",
    "laundry services",
    "photography studios",
    "travel agencies",
    "insurance agencies",
    "accountants",
    "lawyers",
    "consultants",
    "digital marketing agencies",
    "IT companies",
    "web development companies",

    // Automotive
    "car dealerships",
    "car repair shops",
    "motorcycle dealers",
    "automobile spare parts",
    "car wash",
    "tyre shops",
    "petrol pumps",

    // Property and construction
    "real estate agents",
    "property dealers",
    "architects",
    "interior designers",
    "civil contractors",
    "electricians",
    "plumbers",
    "painters",

    // Hospitality and entertainment
    "guest houses",
    "resorts",
    "banquet halls",
    "event planners",
    "cinemas",
    "sports clubs",

    // Other businesses
    "courier services",
    "logistics companies",
    "packers and movers",
    "printing shops",
    "repair services",
    "security services",
    "banks",
    "ATMs",
];

// Convert city name into coordinates using OpenStreetMap.
async function geocodeCity(city) {
    const response = await axios.get(
        "https://nominatim.openstreetmap.org/search",
        {
            params: {
                q: `${city}, India`,
                format: "jsonv2",
                limit: 1
            },
            headers: {
                "User-Agent": "BusinessDiscoveryApp/1.0"
            },
            timeout: 15000
        }
    );

    const location = response.data?.[0];

    if (!location) {
        throw new Error(`City not found: ${city}`);
    }

    return {
        lat: Number(location.lat),
        lng: Number(location.lon)
    };
}

// Search every category and combine unique businesses.
async function searchBusinesses(city, location) {
    const businesses = [];
    const seen = new Set();
    const errors = [];

    for (const category of categories) {
        console.log(`Searching "${category}" in ${city}`);

        try {
            let page = 1;
            let totalPages = 1;

            do {
                const response = await axios.get(MAPPLS_URL, {
                    params: {
                        keywords: category,
                        refLocation: `${location.lat},${location.lng}`,
                        radius: 10000,
                        page,
                        region: "IND",
                        access_token: process.env.MAPPLS_API_KEY
                    },
                    timeout: 20000
                });

                const data = response.data || {};
                const places = data.suggestedLocations || [];

                for (const place of places) {
                    const name = place.placeName || "";
                    const address = place.placeAddress || "";
                    const placeId = place.eLoc || null;

                    const key = placeId
                        ? placeId.toUpperCase()
                        : `${name}|${address}`.toLowerCase().trim();

                    if (!name || seen.has(key)) continue;

                    seen.add(key);

                    businesses.push({
                        placeId,
                        name,
                        address: address || null,
                        phone:
                            place.mobileNo || place.landlineNo || null,
                        email: place.email || null,
                        category: place.keywords || [],
                        type: place.type || null,
                        distance: place.distance ?? null,
                        searchedCategory: category,
                        city
                    });
                }

                totalPages = Number(
                    data.pageInfo?.totalPages || 1
                );

                page++;
            } while (page <= totalPages && page <= 10);

        } catch (error) {
            console.error(
                `Failed category "${category}":`,
                error.response?.data || error.message
            );

            errors.push({
                category,
                message:
                    error.response?.data?.message || error.message
            });

            // Continue with the next category.
        }
    }

    return {
        categoriesSearched: categories.length,
        count: businesses.length,
        businesses,
        errors
    };
}

// GET /api/businesses?city=Zirakpur
app.get("/api/businesses", async (req, res) => {
    try {
        const city = req.query.city?.trim();

        if (!city) {
            return res.status(400).json({
                success: false,
                message: "Please provide a city name.",
                example: "/api/businesses?city=Zirakpur"
            });
        }

        if (!process.env.MAPPLS_API_KEY) {
            return res.status(500).json({
                success: false,
                message: "MAPPLS_API_KEY is missing in .env"
            });
        }

        const location = await geocodeCity(city);
        const result = await searchBusinesses(city, location);

        return res.json({
            success: true,
            totalSearch : result.length,
            city,
            coordinates: location,
            ...result,
            coverage:
                "Searches within a 10 km radius of the geocoded city center.",
            completeCityCoverage: false
        });

    } catch (error) {
        console.error("Request failed:", error.message);

        return res.status(502).json({
            success: false,
            message: "Unable to complete business search.",
            details: error.response?.data || error.message
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
