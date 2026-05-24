const path = require("path");
require("@babel/register")({
    extensions: [".js"],
});
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const { sequelize, connectToDatabase } = require("../config/sequelize");
const categoryModel = require("../models/categoryModel");
const dishModel = require("../models/dishModel");
const userModel = require("../models/userModel");

const categories = [
    {
        name: "Burgers",
        description: "A variety of burgers including beef, chicken, and veggie options",
    },
    {
        name: "Pizza",
        description: "Different types of pizza, from classic to specialty flavors",
    },
    {
        name: "Mì",
        description: "Popular noodle dishes such as spaghetti and stir-fried noodles",
    },
    {
        name: "Cơm",
        description: "Rice dishes including fried rice, rice bowls, and steamed rice",
    },
    {
        name: "Nước uống",
        description: "Soft drinks, coffee, milk tea, and other beverages",
    },
    {
        name: "Combos",
        description: "Meals bundled with a main dish, side, and drink",
    },
];

const dishes = [
    {
        categoryName: "Burgers",
        name: "American Trio Charcoal Burger",
        slug: "american-trio-charcoal-burger",
        description: "Burger voi 3 loai xot moi va vo banh than tre thu cong",
        thumbnail_path: "https://res.cloudinary.com/dgw84jhvl/image/upload/q_auto/f_auto/v1775802062/ex_cheese_whp_jr_1_av3n9m.jpg",
        price: 79000,
        stock: 100,
        brand: "Burger King",
        preparation_time: 12,
        calories: 650,
        tags: ["burger", "beef", "featured"],
        is_featured: true,
    },
    {
        categoryName: "Burgers",
        name: "Double Whopper",
        slug: "double-whopper",
        description: "Double beef burger with fresh vegetables and signature sauce",
        thumbnail_path: "https://res.cloudinary.com/dgw84jhvl/image/upload/q_auto/f_auto/v1775802057/2-mieng-b_-burger-b_-n_ng-whopper_3_eqkc20.jpg",
        price: 175000,
        stock: 80,
        brand: "Burger King",
        preparation_time: 15,
        calories: 920,
        tags: ["burger", "double", "beef"],
    },
    {
        categoryName: "Pizza",
        name: "Pizza Hai San 4 Mua",
        slug: "pizza-hai-san-4-mua",
        description: "Pizza hai san voi de banh mem, pho mai day dan",
        thumbnail_path: "https://res.cloudinary.com/dxitytnx9/image/upload/v1763292400/viber_image_2024-12-20_11-11-37-302_ezuu5p.jpg",
        price: 355000,
        stock: 60,
        brand: "Domino's",
        preparation_time: 20,
        calories: 1100,
        tags: ["pizza", "seafood"],
        is_featured: true,
    },
    {
        categoryName: "Pizza",
        name: "Pizza Hawaiian",
        slug: "pizza-hawaiian",
        description: "Pizza dam bong dua kieu Hawaii",
        thumbnail_path: "https://res.cloudinary.com/dxitytnx9/image/upload/v1763292396/Pizza-Dam-Bong-Dua-Kieu-Hawaii-Hawaiian_hxanox.jpg",
        price: 175000,
        stock: 70,
        brand: "Domino's",
        preparation_time: 18,
        calories: 840,
        tags: ["pizza", "ham", "pineapple"],
    },
    {
        categoryName: "Mì",
        name: "Mi Carbonara",
        slug: "mi-carbonara",
        description: "Mi spaghetti voi thit xong khoi va pho mai Parmesan",
        thumbnail_path: "https://res.cloudinary.com/dxitytnx9/image/upload/v1763292392/mi-carbonara-300x300_rf01bi.jpg",
        price: 155000,
        stock: 50,
        brand: "Pizza Hut",
        preparation_time: 14,
        calories: 760,
        tags: ["pasta", "creamy"],
    },
    {
        categoryName: "Cơm",
        name: "Com Ga Nuoc Mam",
        slug: "com-ga-nuoc-mam",
        description: "Com ga gion voi nuoc mam dam da",
        thumbnail_path: "https://res.cloudinary.com/dxitytnx9/image/upload/v1763292386/38.RM4CmGTNM_t1h8o6.png",
        price: 49000,
        stock: 120,
        brand: "KFC",
        preparation_time: 10,
        calories: 590,
        tags: ["rice", "chicken"],
    },
    {
        categoryName: "Nước uống",
        name: "Coca Cola",
        slug: "coca-cola",
        description: "Nuoc ngot co ga uong lanh",
        thumbnail_path: "https://res.cloudinary.com/dgw84jhvl/image/upload/q_auto/f_auto/v1775802123/Cocazero_fvx0tc.webp",
        price: 15000,
        stock: 300,
        brand: "Coca-Cola",
        preparation_time: 1,
        calories: 140,
        tags: ["drink", "soda"],
    },
    {
        categoryName: "Combos",
        name: "Combo Cap Doi",
        slug: "combo-cap-doi",
        description: "Hai phan an kem nuoc va mon an kem",
        thumbnail_path: "https://res.cloudinary.com/dgw84jhvl/image/upload/q_auto/f_auto/v1775802107/combo-doublewhopper_2_uqqe8q.jpg",
        price: 145000,
        stock: 40,
        brand: "Eatsy",
        preparation_time: 16,
        calories: 1300,
        tags: ["combo", "sharing"],
        is_featured: true,
    },
];

const users = [
    {
        fullname: "Nguyen Van An",
        username: "nguyenvanan",
        email: "nguyenvanan@gmail.com",
        phoneNumber: "901234567",
        countryCode: "+84",
        role: "Customer",
    },
    {
        fullname: "Tran Thi Binh",
        username: "tranthibinh",
        email: "tranthibinh@gmail.com",
        phoneNumber: "902345678",
        countryCode: "+84",
        role: "Customer",
    },
    {
        fullname: "Le Hoang Cuong",
        username: "lehoangcuong",
        email: "lehoangcuong@gmail.com",
        phoneNumber: "903456789",
        countryCode: "+84",
        role: "Customer",
    },
    {
        fullname: "Admin Eatsy",
        username: "admin",
        email: "admin@eatsy.local",
        phoneNumber: "900000001",
        countryCode: "+84",
        role: "Admin",
    },
];

const ensureCategories = async () => {
    const categoryMap = new Map();

    for (const category of categories) {
        const [record] = await categoryModel.findOrCreate({
            where: { name: category.name },
            defaults: {
                category_id: uuidv4(),
                ...category,
            },
        });

        categoryMap.set(category.name, record.category_id);
    }

    return categoryMap;
};

const ensureDishes = async (categoryMap) => {
    for (const dish of dishes) {
        await dishModel.findOrCreate({
            where: { slug: dish.slug },
            defaults: {
                dish_id: uuidv4(),
                category_id: categoryMap.get(dish.categoryName) || null,
                name: dish.name,
                slug: dish.slug,
                description: dish.description,
                thumbnail_path: dish.thumbnail_path,
                price: dish.price,
                stock: dish.stock,
                brand: dish.brand,
                preparation_time: dish.preparation_time,
                calories: dish.calories,
                tags: dish.tags,
                is_featured: dish.is_featured || false,
                available: true,
                status: "active",
            },
        });
    }
};

const ensureUsers = async () => {
    const hashedPassword = await bcrypt.hash("123456", 10);

    for (const user of users) {
        await userModel.findOrCreate({
            where: { phoneNumber: user.phoneNumber },
            defaults: {
                userId: uuidv4(),
                fullname: user.fullname,
                username: user.username,
                email: user.email,
                phoneNumber: user.phoneNumber,
                countryCode: user.countryCode,
                password: hashedPassword,
                typeLogin: "Standard",
                role: user.role,
                isOnline: false,
            },
        });
    }
};

const seedMySqlSampleData = async () => {
    try {
        await connectToDatabase();
        await sequelize.sync();

        const categoryMap = await ensureCategories();
        await ensureDishes(categoryMap);
        await ensureUsers();

        console.log("Seeded MySQL sample data successfully.");
        console.log("Sample login: 900000001 / 123456");
    } catch (error) {
        console.error("Failed to seed MySQL sample data:", error);
        process.exitCode = 1;
    } finally {
        await sequelize.close();
    }
};

seedMySqlSampleData();
