const { Op } = require("sequelize");
const { v4: uuidv4 } = require("uuid");
const dishModel = require("./models/dishModel");
const categoryModel = require("./models/categoryModel");
const { uploadToS3 } = require("@core/config/multer");

const slugify = (str) =>
  str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();

class dishController {
  async getDishes(req, res) {
    try {
      const searchCondition = {};
      const { name, sort, category } = req.query;

      if (name) {
        searchCondition.name = { [Op.like]: `%${name}%` };
      }

      if (category) {
        const categoryRecord = await categoryModel.findOne({
          where: { name: category },
        });

        if (!categoryRecord) {
          return res.status(404).json({
            success: false,
            message: "Category not found",
          });
        }
        searchCondition.category_id = categoryRecord.category_id;
      }

      const dishes = await dishModel.findAll({
        where: searchCondition,
        include: [
          {
            model: categoryModel,
            as: "category",
            attributes: ["category_id", "name"],
          },
        ],
        order: [["price", sort || "ASC"]],
      });

      return res.status(200).json({
        success: true,
        data: dishes,
      });
    } catch (error) {
      console.error("Error in getDishes:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
        message: error.message,
      });
    }
  }

  async getDishById(req, res) {
    try {
      const { id } = req.params;

      const dish = await dishModel.findOne({
        where: { dish_id: id },
      });

      if (!dish) {
        return res.status(404).json({
          message: "Dish not found",
        });
      }

      return res.status(200).json(dish);
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        message: "Internal server error",
      });
    }
  }
  async getSimilarDishes(req, res) {
    try {
      const { id } = req.params;

      // 1. Lấy dish hiện tại
      const currentDish = await dishModel.findOne({
        where: { dish_id: id },
      });

      if (!currentDish) {
        return res.status(404).json({
          message: "Dish not found",
        });
      }

      // 2. Lấy các dish cùng category (trừ chính nó)
      const similarDishes = await dishModel.findAll({
        where: {
          category_id: currentDish.category_id,
          dish_id: {
            [Op.ne]: id,
          },
        },
        limit: 8,
      });

      return res.status(200).json(similarDishes);
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        message: "Internal server error",
      });
    }
  }
  // POST /api/dish  –  Tạo món ăn mới
  async createDish(req, res) {
    try {
      const {
        name,
        category_id,
        price,
        stock = 0,
        discount_amount = 0,
        status = "active",
        available = true,
        description,
        brand,
        preparation_time,
        calories,
      } = req.body;

      if (!name || !price) {
        return res.status(400).json({
          success: false,
          message: "Vui lòng nhập tên và giá sản phẩm",
        });
      }

      let thumbnail_path = req.body.thumbnail_path || null;

      // Nếu có file ảnh được upload → upload lên S3
      if (req.file) {
        try {
          thumbnail_path = await uploadToS3(req.file, "dishes");
        } catch (uploadErr) {
          console.error("S3 upload error:", uploadErr.message);
          return res.status(500).json({
            success: false,
            message: "Tải ảnh lên thất bại",
          });
        }
      }

      if (!thumbnail_path) {
        return res.status(400).json({
          success: false,
          message: "Vui lòng cung cấp ảnh sản phẩm",
        });
      }

      let slug = slugify(name);
      const existing = await dishModel.findOne({ where: { slug } });
      if (existing) slug = `${slug}-${Date.now()}`;

      const newDish = await dishModel.create({
        dish_id: uuidv4(),
        name,
        slug,
        category_id: category_id || null,
        price,
        stock,
        discount_amount,
        status,
        available,
        description: description || null,
        thumbnail_path,
        brand: brand || null,
        preparation_time: preparation_time || null,
        calories: calories || null,
      });

      return res.status(201).json({
        success: true,
        message: "Tạo món ăn thành công",
        data: newDish,
      });
    } catch (error) {
      console.error("Error in createDish:", error);
      return res.status(500).json({
        success: false,
        message: "Lỗi server khi tạo món ăn",
        error: error.message,
      });
    }
  }

  // PUT /api/dish/:id  –  Cập nhật món ăn
  async updateDish(req, res) {
    try {
      const { id } = req.params;

      const dish = await dishModel.findByPk(id);
      if (!dish) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy món ăn",
        });
      }

      const {
        name,
        category_id,
        price,
        stock,
        discount_amount,
        status,
        available,
        description,
        thumbnail_path,
        brand,
        preparation_time,
        calories,
      } = req.body;

      let newThumbnail = dish.thumbnail_path;

      // Nếu có file ảnh mới → upload lên S3
      if (req.file) {
        try {
          newThumbnail = await uploadToS3(req.file, "dishes");
        } catch (uploadErr) {
          console.error("S3 upload error:", uploadErr.message);
          return res.status(500).json({
            success: false,
            message: "Tải ảnh lên thất bại",
          });
        }
      }

      let slug = dish.slug;
      if (name && name !== dish.name) {
        slug = slugify(name);
        const exists = await dishModel.findOne({
          where: { slug, dish_id: { [Op.ne]: id } },
        });
        if (exists) slug = `${slug}-${Date.now()}`;
      }

      await dish.update({
        ...(name !== undefined && { name, slug }),
        ...(category_id !== undefined && { category_id }),
        ...(price !== undefined && { price }),
        ...(stock !== undefined && { stock }),
        ...(discount_amount !== undefined && { discount_amount }),
        ...(status !== undefined && { status }),
        ...(available !== undefined && { available }),
        ...(description !== undefined && { description }),
        thumbnail_path: newThumbnail,
        ...(brand !== undefined && { brand }),
        ...(preparation_time !== undefined && { preparation_time }),
        ...(calories !== undefined && { calories }),
      });

      return res.status(200).json({
        success: true,
        message: "Cập nhật món ăn thành công",
        data: dish,
      });
    } catch (error) {
      console.error("Error in updateDish:", error);
      return res.status(500).json({
        success: false,
        message: "Lỗi server khi cập nhật món ăn",
        error: error.message,
      });
    }
  }

  // DELETE /api/dish/:id  –  Xóa món ăn
  async deleteDish(req, res) {
    try {
      const { id } = req.params;

      const dish = await dishModel.findByPk(id);
      if (!dish) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy món ăn",
        });
      }

      await dish.destroy();

      return res.status(200).json({
        success: true,
        message: "Xóa món ăn thành công",
      });
    } catch (error) {
      console.error("Error in deleteDish:", error);
      return res.status(500).json({
        success: false,
        message: "Lỗi server khi xóa món ăn",
        error: error.message,
      });
    }
  }
}

module.exports = new dishController();
