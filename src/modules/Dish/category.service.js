const categoryModel = require("./models/categoryModel");

const getAllCategories = async () => {
  try {
    return await categoryModel.findAll();
  } catch (error) {
    console.error("Error fetching categories:", error);
    throw error;
  }
};

const getCategoryByName = async (name) => {
  return categoryModel.findOne({
    where: { name },
  });
};

const getCategoryById = async (categoryId) => {
  return categoryModel.findByPk(categoryId);
};

module.exports = { getAllCategories, getCategoryById, getCategoryByName };
