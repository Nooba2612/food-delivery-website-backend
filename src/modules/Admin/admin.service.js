const { Op } = require("sequelize");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");
const authUserService = require("@modules/Auth/user.service");
const dishService = require("@modules/Dish/dish.service");
const categoryService = require("@modules/Dish/category.service");
const orderService = require("@modules/Order/order.service");
const { normalizePhone } = require("@core/helpers/phoneHelper");
const AppError = require("@core/utils/AppError");

const slugify = (str) =>
  str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();

const AdminService = {
  async updateOrderStatus(orderId, status, io) {
    const updatedOrder = await orderService.updateOrderStatus(orderId, status);
    const summary = await orderService.getOrderSummary(orderId);

    return {
      updatedOrder,
      summary: {
        ...summary,
        updatedAt: new Date().toISOString(),
      },
      targetUserId: updatedOrder.user_id || summary.user_id,
    };
  },

  async getEmployees({ search, position, status, page = 1, limit = 10 }) {
    const where = { role: "Employee" };

    if (search) {
      const normalizedSearch = normalizePhone(search, "+84");
      where[Op.or] = [
        { fullname: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
        { phoneNumber: { [Op.like]: `%${search}%` } },
        { phoneNumber: { [Op.like]: `%${normalizedSearch}%` } },
      ];
    }

    if (position) where.position = position;
    if (status === "active") where.isOnline = true;
    if (status === "inactive") where.isOnline = false;

    const parsedPage = parseInt(page, 10);
    const parsedLimit = parseInt(limit, 10);
    const offset = (parsedPage - 1) * parsedLimit;

    const { rows, count } = await authUserService.findAndCountUsers({
      where,
      attributes: { exclude: ["password"] },
      order: [["createdAt", "DESC"]],
      limit: parsedLimit,
      offset,
    });

    return {
      employees: rows,
      total: count,
      page: parsedPage,
      limit: parsedLimit,
    };
  },

  async addEmployee({
    fullname,
    email,
    phoneNumber,
    countryCode = "+84",
    position,
    password,
  }) {
    if (!fullname || !email || !phoneNumber) {
      throw new AppError(
        "Vui lòng điền đầy đủ họ tên, email và số điện thoại",
        400,
      );
    }

    const normalizedPhone = normalizePhone(phoneNumber, countryCode);
    const existing = await authUserService.findUserRecord({
      [Op.or]: [{ email }, { phoneNumber: normalizedPhone }],
    });

    if (existing) {
      throw new AppError("Email hoặc số điện thoại đã tồn tại", 409);
    }

    const hashedPassword = await bcrypt.hash(password || "Employee@123", 10);
    const newEmployee = await authUserService.createUserRecord({
      userId: uuidv4(),
      fullname,
      email,
      phoneNumber: normalizedPhone,
      countryCode,
      position: position || null,
      role: "Employee",
      typeLogin: "Standard",
      password: hashedPassword,
      isOnline: true,
    });

    const { password: _, ...employeeData } = newEmployee.toJSON();
    return employeeData;
  },

  async updateEmployee(id, payload) {
    const employee = await authUserService.findUserRecord({
      userId: id,
      role: "Employee",
    });

    if (!employee) {
      throw new AppError("Không tìm thấy nhân viên", 404);
    }

    const { fullname, email, phoneNumber, position, isOnline } = payload;
    const updateData = {};

    if (email && email !== employee.email) {
      const emailExists = await authUserService.findUserRecord({ email });
      if (emailExists) {
        throw new AppError("Email đã được sử dụng", 409);
      }
      updateData.email = email;
    }

    if (phoneNumber && phoneNumber !== employee.phoneNumber) {
      const normalizedPhone = normalizePhone(
        phoneNumber,
        employee.countryCode || "+84",
      );
      const phoneExists = await authUserService.findUserRecord({
        phoneNumber: normalizedPhone,
      });
      if (phoneExists) {
        throw new AppError("Số điện thoại đã được sử dụng", 409);
      }
      updateData.phoneNumber = normalizedPhone;
    }

    if (fullname !== undefined) updateData.fullname = fullname;
    if (position !== undefined) updateData.position = position;
    if (isOnline !== undefined) updateData.isOnline = isOnline;

    await authUserService.updateUserById(id, updateData);
    const updated = await authUserService.getUserRecordById(id, {
      attributes: { exclude: ["password"] },
    });
    return updated;
  },

  async deleteEmployee(id) {
    const employee = await authUserService.findUserRecord({
      userId: id,
      role: "Employee",
    });

    if (!employee) {
      throw new AppError("Không tìm thấy nhân viên", 404);
    }

    await employee.destroy();
  },

  async getProducts(query) {
    const { search = "", category_id = "", status = "", page = 1, limit = 10 } = query;
    const where = {};
    if (search) where.name = { [Op.like]: `%${search}%` };
    if (category_id) where.category_id = category_id;
    if (status) where.status = status;

    const parsedPage = parseInt(page, 10);
    const parsedLimit = parseInt(limit, 10);
    const offset = (parsedPage - 1) * parsedLimit;

    const { rows, count } = await dishService.findAndCountDishes({
      where,
      order: [["created_at", "DESC"]],
      limit: parsedLimit,
      offset,
    });

    const products = await Promise.all(
      rows.map(async (product) => {
        const plain = product.toJSON();
        const category = plain.category_id
          ? await categoryService.getCategoryById(plain.category_id)
          : null;
        return {
          ...plain,
          category: category
            ? {
                category_id: category.category_id,
                name: category.name,
              }
            : null,
        };
      }),
    );

    return {
      products,
      total: count,
      page: parsedPage,
      limit: parsedLimit,
    };
  },

  async addProduct(payload) {
    const { name, price, thumbnail_path } = payload;
    if (!name || !price || !thumbnail_path) {
      throw new AppError("Vui lòng điền tên, giá và ảnh sản phẩm", 400);
    }

    let slug = slugify(name);
    const exists = await dishService.findDishRecord({ slug });
    if (exists) slug = `${slug}-${Date.now()}`;

    return dishService.createDish({
      dish_id: uuidv4(),
      ...payload,
      slug,
      category_id: payload.category_id || null,
      description: payload.description || null,
      brand: payload.brand || null,
      preparation_time: payload.preparation_time || null,
      calories: payload.calories || null,
    });
  },

  async updateProduct(id, payload) {
    const product = await dishService.findDishById(id);
    if (!product) {
      throw new AppError("Không tìm thấy sản phẩm", 404);
    }

    let slug = product.slug;
    if (payload.name && payload.name !== product.name) {
      slug = slugify(payload.name);
      const exists = await dishService.findDishRecord({
        slug,
        dish_id: { [Op.ne]: id },
      });
      if (exists) slug = `${slug}-${Date.now()}`;
    }

    await product.update({
      ...(payload.name !== undefined && { name: payload.name, slug }),
      ...(payload.category_id !== undefined && { category_id: payload.category_id }),
      ...(payload.price !== undefined && { price: payload.price }),
      ...(payload.stock !== undefined && { stock: payload.stock }),
      ...(payload.discount_amount !== undefined && {
        discount_amount: payload.discount_amount,
      }),
      ...(payload.status !== undefined && { status: payload.status }),
      ...(payload.available !== undefined && { available: payload.available }),
      ...(payload.description !== undefined && { description: payload.description }),
      ...(payload.thumbnail_path !== undefined && {
        thumbnail_path: payload.thumbnail_path,
      }),
      ...(payload.brand !== undefined && { brand: payload.brand }),
      ...(payload.preparation_time !== undefined && {
        preparation_time: payload.preparation_time,
      }),
      ...(payload.calories !== undefined && { calories: payload.calories }),
    });

    return product;
  },

  async deleteProduct(id) {
    const product = await dishService.findDishById(id);
    if (!product) {
      throw new AppError("Không tìm thấy sản phẩm", 404);
    }
    await product.destroy();
  },

  async getProductStats() {
    const [total, active, inactive, outOfStock] = await Promise.all([
      dishService.countDishes(),
      dishService.countDishes({ where: { status: "active" } }),
      dishService.countDishes({ where: { status: "inactive" } }),
      dishService.countDishes({ where: { stock: 0 } }),
    ]);

    return { total, active, inactive, outOfStock };
  },

  async getOrderStats() {
    return orderService.getOrderStats();
  },

  async getOrders(query) {
    return orderService.getOrdersForAdmin(query);
  },

  async getCategories() {
    return categoryService.getAllCategories();
  },
};

module.exports = AdminService;
