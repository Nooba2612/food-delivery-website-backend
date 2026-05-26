const categoryModel = require("./models/categoryModel");

class categoryController {
  async getCategories(req, res) {
    try {
      const categories = await categoryModel.findAll();
      res.json(categories);
    } catch (error) {
      res.status(500).send();
    }
  }
}

module.exports = new categoryController();
