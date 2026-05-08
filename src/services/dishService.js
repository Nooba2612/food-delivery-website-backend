const { Op } = require("sequelize");
const dishModel = require("@models/dishModel");

const getAllDish = async () => {
    try {
        return await dishModel.findAll();
    } catch (error) {
        console.error(error);
    }
};

const getDishesByName = async (name) => {
    try {
        return await dishModel.findAll({
            where: {
                name: {
                    [Op.like]: `%${name}%`,
                },
            },
        });
    } catch (error) {
        console.error("Error finding dishes by name:", error);
        throw error;
    }
};

const getDishById = async (dish_id, attributes) => {
    try {
        return await dishModel.findOne({ attributes: attributes, where: { dish_id: dish_id } });
    } catch (error) {
        console.log("Get dish failed", error);
    }
};

const createDish = async (data) => {
    try {
        return await dishModel.create(data);
    } catch (error) {
        console.error("Create dish failed:", error);
        throw error;
    }
};

const updateDish = async (dish_id, data) => {
    try {
        const dish = await dishModel.findByPk(dish_id);
        if (!dish) return null;
        await dish.update(data);
        return dish;
    } catch (error) {
        console.error("Update dish failed:", error);
        throw error;
    }
};

const deleteDish = async (dish_id) => {
    try {
        const dish = await dishModel.findByPk(dish_id);
        if (!dish) return null;
        await dish.destroy();
        return true;
    } catch (error) {
        console.error("Delete dish failed:", error);
        throw error;
    }
};

module.exports = { getAllDish, getDishesByName, getDishById, createDish, updateDish, deleteDish };
