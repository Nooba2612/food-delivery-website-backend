const { Op } = require("sequelize");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");
const OrderService = require("@services/orderService");
const { emitOrderUpdated } = require("../websocket");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/AppError");
const { userModel, dishModel, categoryModel, orderModel, orderItemModel } = require("@models");
const { normalizePhone } = require("@helpers/phoneHelper");

const slugify = (str) =>
    str.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").trim();

class AdminController {
    updateOrderStatus = catchAsync(async (req, res, next) => {
        const { id } = req.params;
        const { status } = req.body;
        const io = req.app.get("io");

        const updatedOrder = await OrderService.updateOrderStatus(id, status);
        const summary = await OrderService.getOrderSummary(id);

        emitOrderUpdated(io, updatedOrder.account_id, {
            ...summary,
            updatedAt: new Date().toISOString(),
        });

        res.json({
            success: true,
            message: `Order status updated to ${status}`,
            data: {
                order_id: updatedOrder.order_id,
                status: updatedOrder.order_status,
                updated_at: updatedOrder.updatedAt,
            },
        });
    });

    // GET /api/admin/employees
    getEmployees = catchAsync(async (req, res, next) => {
        const { search, position, status, page = 1, limit = 10 } = req.query;

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

        if (position) {
            where.position = position;
        }

        if (status === "active") {
            where.isOnline = true;
        } else if (status === "inactive") {
            where.isOnline = false;
        }

        const offset = (parseInt(page) - 1) * parseInt(limit);

        const { rows, count } = await userModel.findAndCountAll({
            where,
            attributes: { exclude: ["password"] },
            order: [["createdAt", "DESC"]],
            limit: parseInt(limit),
            offset,
        });

        res.json({
            success: true,
            data: {
                employees: rows,
                total: count,
                page: parseInt(page),
                limit: parseInt(limit),
            },
        });
    });

    // POST /api/admin/employees
    addEmployee = catchAsync(async (req, res, next) => {
        const { fullname, email, phoneNumber, countryCode = "+84", position, password } = req.body;

        if (!fullname || !email || !phoneNumber) {
            return next(new AppError("Vui lòng điền đầy đủ họ tên, email và số điện thoại", 400));
        }

        const normalizedPhone = normalizePhone(phoneNumber, countryCode);

        const existing = await userModel.findOne({
            where: { [Op.or]: [{ email }, { phoneNumber: normalizedPhone }] },
        });
        if (existing) {
            return next(new AppError("Email hoặc số điện thoại đã tồn tại", 409));
        }

        const rawPassword = password || "Employee@123";
        const hashedPassword = await bcrypt.hash(rawPassword, 10);

        const newEmployee = await userModel.create({
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

        res.status(201).json({
            success: true,
            message: "Thêm nhân viên thành công",
            data: employeeData,
        });
    });

    // PUT /api/admin/employees/:id
    updateEmployee = catchAsync(async (req, res, next) => {
        const { id } = req.params;
        const { fullname, email, phoneNumber, position, isOnline } = req.body;

        const employee = await userModel.findOne({
            where: { userId: id, role: "Employee" },
        });
        if (!employee) {
            return next(new AppError("Không tìm thấy nhân viên", 404));
        }

        if (email && email !== employee.email) {
            const emailExists = await userModel.findOne({ where: { email } });
            if (emailExists) return next(new AppError("Email đã được sử dụng", 409));
        }

        if (phoneNumber && phoneNumber !== employee.phoneNumber) {
            const normalizedPhone = normalizePhone(phoneNumber, employee.countryCode || "+84");
            const phoneExists = await userModel.findOne({ where: { phoneNumber: normalizedPhone } });
            if (phoneExists) return next(new AppError("Số điện thoại đã được sử dụng", 409));
            req.body.phoneNumber = normalizedPhone;
        }

        await employee.update({
            ...(fullname !== undefined && { fullname }),
            ...(email !== undefined && { email }),
            ...(phoneNumber !== undefined && { phoneNumber }),
            ...(position !== undefined && { position }),
            ...(isOnline !== undefined && { isOnline }),
        });

        const updated = await userModel.findByPk(id, {
            attributes: { exclude: ["password"] },
        });

        res.json({
            success: true,
            message: "Cập nhật nhân viên thành công",
            data: updated,
        });
    });

    // DELETE /api/admin/employees/:id
    deleteEmployee = catchAsync(async (req, res, next) => {
        const { id } = req.params;

        const employee = await userModel.findOne({
            where: { userId: id, role: "Employee" },
        });
        if (!employee) {
            return next(new AppError("Không tìm thấy nhân viên", 404));
        }

        await employee.destroy();

        res.json({
            success: true,
            message: "Xóa nhân viên thành công",
        });
    });

    // ─── PRODUCT CRUD ────────────────────────────────────

    // GET /api/admin/products
    getProducts = catchAsync(async (req, res) => {
        const { search = "", category_id = "", status = "", page = 1, limit = 10 } = req.query;
        const where = {};

        if (search) where.name = { [Op.like]: `%${search}%` };
        if (category_id) where.category_id = category_id;
        if (status) where.status = status;

        const offset = (parseInt(page) - 1) * parseInt(limit);

        const { rows, count } = await dishModel.findAndCountAll({
            where,
            include: [{ model: categoryModel, as: "category", attributes: ["category_id", "name"] }],
            order: [["created_at", "DESC"]],
            limit: parseInt(limit),
            offset,
        });

        res.json({
            success: true,
            data: { products: rows, total: count, page: parseInt(page), limit: parseInt(limit) },
        });
    });

    // POST /api/admin/products
    addProduct = catchAsync(async (req, res, next) => {
        const { name, category_id, price, stock = 0, discount_amount = 0, status = "active",
            available = true, description, thumbnail_path, brand, preparation_time, calories } = req.body;

        if (!name || !price || !thumbnail_path) {
            return next(new AppError("Vui lòng điền tên, giá và ảnh sản phẩm", 400));
        }

        let slug = slugify(name);
        const exists = await dishModel.findOne({ where: { slug } });
        if (exists) slug = `${slug}-${Date.now()}`;

        const product = await dishModel.create({
            dish_id: uuidv4(), name, slug, category_id: category_id || null,
            price, stock, discount_amount, status, available,
            description: description || null, thumbnail_path,
            brand: brand || null, preparation_time: preparation_time || null,
            calories: calories || null,
        });

        res.status(201).json({ success: true, message: "Thêm sản phẩm thành công", data: product });
    });

    // PUT /api/admin/products/:id
    updateProduct = catchAsync(async (req, res, next) => {
        const { id } = req.params;
        const product = await dishModel.findByPk(id);
        if (!product) return next(new AppError("Không tìm thấy sản phẩm", 404));

        const { name, category_id, price, stock, discount_amount, status,
            available, description, thumbnail_path, brand, preparation_time, calories } = req.body;

        let slug = product.slug;
        if (name && name !== product.name) {
            slug = slugify(name);
            const exists = await dishModel.findOne({ where: { slug, dish_id: { [Op.ne]: id } } });
            if (exists) slug = `${slug}-${Date.now()}`;
        }

        await product.update({
            ...(name !== undefined && { name, slug }),
            ...(category_id !== undefined && { category_id }),
            ...(price !== undefined && { price }),
            ...(stock !== undefined && { stock }),
            ...(discount_amount !== undefined && { discount_amount }),
            ...(status !== undefined && { status }),
            ...(available !== undefined && { available }),
            ...(description !== undefined && { description }),
            ...(thumbnail_path !== undefined && { thumbnail_path }),
            ...(brand !== undefined && { brand }),
            ...(preparation_time !== undefined && { preparation_time }),
            ...(calories !== undefined && { calories }),
        });

        res.json({ success: true, message: "Cập nhật sản phẩm thành công", data: product });
    });

    // DELETE /api/admin/products/:id
    deleteProduct = catchAsync(async (req, res, next) => {
        const { id } = req.params;
        const product = await dishModel.findByPk(id);
        if (!product) return next(new AppError("Không tìm thấy sản phẩm", 404));

        await product.destroy();
        res.json({ success: true, message: "Xóa sản phẩm thành công" });
    });

    // GET /api/admin/products/stats
    getProductStats = catchAsync(async (_req, res) => {
        const [total, active, inactive, outOfStock] = await Promise.all([
            dishModel.count(),
            dishModel.count({ where: { status: "active" } }),
            dishModel.count({ where: { status: "inactive" } }),
            dishModel.count({ where: { stock: 0 } }),
        ]);
        res.json({ success: true, data: { total, active, inactive, outOfStock } });
    });

    // GET /api/admin/orders/stats
    getOrderStats = catchAsync(async (_req, res) => {
        const [total, pending, confirmed, delivering, delivered, cancelled] = await Promise.all([
            orderModel.count(),
            orderModel.count({ where: { order_status: "pending" } }),
            orderModel.count({ where: { order_status: "confirmed" } }),
            orderModel.count({ where: { order_status: "delivering" } }),
            orderModel.count({ where: { order_status: "delivered" } }),
            orderModel.count({ where: { order_status: "cancelled" } }),
        ]);
        res.json({ success: true, data: { total, pending, confirmed, delivering, delivered, cancelled } });
    });

    // GET /api/admin/orders
    getOrders = catchAsync(async (req, res) => {
        const { search = "", status = "", page = 1, limit = 10 } = req.query;
        const where = {};

        if (status) where.order_status = status;
        if (search) {
            where[Op.or] = [
                { order_id: { [Op.like]: `%${search}%` } },
                { delivery_address: { [Op.like]: `%${search}%` } },
            ];
        }

        const offset = (parseInt(page) - 1) * parseInt(limit);

        const { rows, count } = await orderModel.findAndCountAll({
            where,
            include: [
                {
                    model: userModel,
                    as: "user",
                    attributes: ["fullname", "email", "phoneNumber"],
                },
                {
                    model: orderItemModel,
                    as: "items",
                    include: [{ model: dishModel, as: "dish", attributes: ["thumbnail_path", "name"] }],
                },
            ],
            order: [["order_date", "DESC"]],
            limit: parseInt(limit),
            offset,
        });

        res.json({ success: true, data: { orders: rows, total: count, page: parseInt(page), limit: parseInt(limit) } });
    });

    // GET /api/admin/categories
    getCategories = catchAsync(async (req, res) => {
        const cats = await categoryModel.findAll({
            attributes: ["category_id", "name"],
            order: [["name", "ASC"]],
        });
        res.json({ success: true, data: cats });
    });
}

module.exports = new AdminController();
