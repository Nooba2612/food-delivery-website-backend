const AdminService = require("./admin.service");
const { emitOrderUpdated } = require("@core/websocket");
const catchAsync = require("@core/utils/catchAsync");

class AdminController {
  updateOrderStatus = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const io = req.app.get("io");

    const { updatedOrder, summary, targetUserId } =
      await AdminService.updateOrderStatus(id, status, io);

    emitOrderUpdated(io, targetUserId, summary);

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

  getEmployees = catchAsync(async (req, res) => {
    const data = await AdminService.getEmployees(req.query);
    res.json({ success: true, data });
  });

  addEmployee = catchAsync(async (req, res) => {
    const employee = await AdminService.addEmployee(req.body);
    res.status(201).json({
      success: true,
      message: "Thêm nhân viên thành công",
      data: employee,
    });
  });

  updateEmployee = catchAsync(async (req, res) => {
    const updated = await AdminService.updateEmployee(req.params.id, req.body);
    res.json({
      success: true,
      message: "Cập nhật nhân viên thành công",
      data: updated,
    });
  });

  deleteEmployee = catchAsync(async (req, res) => {
    await AdminService.deleteEmployee(req.params.id);
    res.json({
      success: true,
      message: "Xóa nhân viên thành công",
    });
  });

  getProducts = catchAsync(async (req, res) => {
    const data = await AdminService.getProducts(req.query);
    res.json({ success: true, data });
  });

  addProduct = catchAsync(async (req, res) => {
    const product = await AdminService.addProduct(req.body);
    res.status(201).json({
      success: true,
      message: "Thêm sản phẩm thành công",
      data: product,
    });
  });

  updateProduct = catchAsync(async (req, res) => {
    const product = await AdminService.updateProduct(req.params.id, req.body);
    res.json({
      success: true,
      message: "Cập nhật sản phẩm thành công",
      data: product,
    });
  });

  deleteProduct = catchAsync(async (req, res) => {
    await AdminService.deleteProduct(req.params.id);
    res.json({ success: true, message: "Xóa sản phẩm thành công" });
  });

  getProductStats = catchAsync(async (_req, res) => {
    const data = await AdminService.getProductStats();
    res.json({ success: true, data });
  });

  getOrderStats = catchAsync(async (_req, res) => {
    const data = await AdminService.getOrderStats();
    res.json({ success: true, data });
  });

  getOrders = catchAsync(async (req, res) => {
    const data = await AdminService.getOrders(req.query);
    res.json({ success: true, data });
  });

  getCategories = catchAsync(async (_req, res) => {
    const cats = await AdminService.getCategories();
    res.json({ success: true, data: cats });
  });
}

module.exports = new AdminController();
