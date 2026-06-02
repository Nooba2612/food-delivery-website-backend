const OpenAI = require("openai");
const catchAsync = require("@core/utils/catchAsync");
const { retryAsync } = require("@core/utils/retry");
const orderModel = require("@modules/Order/models/orderModel");
const AdminService = require("./admin.service");
const dishService = require("@modules/Dish/dish.service");
const authUserService = require("@modules/Auth/user.service");
const { Op } = require("sequelize");
const reviewModel = require("@modules/Review/models/reviewModel");
const dishModel = require("@modules/Dish/models/dishModel");
const userModel = require("@modules/Auth/models/userModel");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const openai = new OpenAI({
  apiKey: process.env.FREELLMAPI_API_KEY || GEMINI_API_KEY || "dummy-key",
  baseURL:
    process.env.FREELLMAPI_BASE_URL ||
    "https://generativelanguage.googleapis.com/v1beta/openai",
});

const CHAT_MODEL = process.env.FREELLMAPI_MODEL || "gemini-2.5-flash";
const CHAT_COMPLETION_TIMEOUT_MS = Number(process.env.FREELLMAPI_TIMEOUT_MS || 60000);
const CHAT_MAX_TOKENS = Number(process.env.FREELLMAPI_MAX_TOKENS || 1000);
const CHAT_RETRIES = Number(process.env.FREELLMAPI_RETRIES || 2);
const SLIDING_WINDOW_SIZE = 8; // Cho phép giữ hội thoại dài hơn một chút cho Admin

// System Instruction giới hạn chủ đề chỉ liên quan tới Eatsy Food Delivery
const ADMIN_AI_SYSTEM_PROMPT = `Bạn là EatsyAdminBot, trợ lý AI chuyên biệt dành riêng cho Quản trị viên (Admin) của hệ thống đặt đồ ăn Eatsy Food Delivery.

Quy tắc bắt buộc & nghiêm ngặt:
1. Bạn CHỈ được phép trả lời các câu hỏi liên quan tới ứng dụng, hệ thống và quy trình quản trị của Eatsy, bao gồm:
   - Cách quản lý đơn hàng (Orders) và cập nhật trạng thái đơn hàng (đang xử lý, giao hàng, hoàn thành, hủy...).
   - Cách quản lý sản phẩm/món ăn (Products), danh mục (Categories) trên Eatsy.
   - Cách quản lý nhân viên (Employees), thêm mới nhân viên, sửa thông tin hoặc xóa tài khoản nhân viên.
   - Các chức năng thống hè báo cáo doanh thu (Reports), hiệu suất bán hàng.
   - Tổng hợp, phân tích các đánh giá (Reviews) tổng quát của người dùng hoặc phản hồi chi tiết về các món ăn cụ thể.
   - Các chức năng thanh toán (Payments) qua VNPay và hoàn tiền.
   - Các thiết lập cài đặt (Settings) của hệ thống Eatsy.
   - Các khía cạnh vận hành chung của Eatsy Food Delivery.
2. Nếu người dùng (Admin) hỏi các chủ đề KHÔNG liên quan đến ứng dụng Eatsy hoặc không có trong phạm vi quản trị Eatsy (Ví dụ: lập trình Python/Java nói chung, giải bài tập toán học, viết văn thơ không liên quan, kiến thức địa lý thế giới, thời tiết ngoài lề, tin tức showbiz, công nghệ bên ngoài không liên quan...), bạn PHẢI từ chối trả lời một cách lịch sự nhưng kiên quyết.
   - Mẫu từ chối chuẩn: "Xin lỗi, tôi là trợ lý AI chuyên biệt hỗ trợ quản trị hệ thống Eatsy. Tôi không thể hỗ trợ các chủ đề ngoài phạm vi ứng dụng Eatsy. Bạn có câu hỏi nào về quản lý đơn hàng, món ăn hoặc báo cáo thống kê của Eatsy không?"
3. Trả lời tự nhiên bằng tiếng Việt. Giọng điệu chuyên nghiệp, hỗ trợ tối đa, súc tích và mạch lạc. Có thể sử dụng định dạng Markdown (như danh sách, in đậm) để làm nổi bật thông tin hướng dẫn Admin.
4. QUAN TRỌNG VỀ DỮ LIỆU THỜI GIAN THỰC (REAL-TIME DATA):
   - Bạn CÓ KHẢ NĂNG truy cập và đã được kết nối trực tiếp với cơ sở dữ liệu thời gian thực (real-time MySQL) của Eatsy.
   - Dữ liệu thống kê doanh thu và đơn hàng sống của hệ thống được chúng tôi truy vấn tự động và cung cấp trực tiếp cho bạn ở phần dưới.
   - Bạn TUYỆT ĐỐI KHÔNG ĐƯỢC từ chối và trả lời rằng "tôi không có quyền truy cập dữ liệu thực tế", "tôi không thể kết nối database" hay "tôi chỉ có thể hướng dẫn bạn cách tự xem báo cáo".
   - Bạn PHẢI sử dụng trực tiếp các số liệu thực tế được cung cấp ở bên dưới để lập bảng báo cáo thống kê doanh số, số lượng đơn hàng chi tiết theo trạng thái và phân tích tình hình kinh doanh cho Admin ngay lập tức. Hãy định dạng bảng Markdown thật đẹp mắt để giao diện hiển thị chuyên nghiệp nhất!
5. CHỨC NĂNG TỰ ĐỘNG THÊM, XÓA VÀ CẬP NHẬT NHÂN VIÊN (AGENT ACTION):
   - Bạn CÓ KHẢ NĂNG tự động **Thêm nhân viên mới**, **Xóa nhân viên**, và **Cập nhật thông tin nhân viên** trực tiếp khỏi cơ sở dữ liệu Eatsy.
   - Đối với hành động **Thêm nhân viên mới**:
     + Hãy kiểm tra xem Admin đã cung cấp đủ 3 thông tin bắt buộc chưa: Họ và tên (fullname), Email (email), Số điện thoại (phoneNumber).
     + Nếu THIẾU thông tin bắt buộc, bạn PHẢI trò chuyện lịch sự để yêu cầu Admin cung cấp các thông tin còn thiếu.
     + Khi đã có ĐẦY ĐỦ 3 thông tin bắt buộc, bạn PHẢI chèn một thẻ định dạng JSON đặc biệt ở cuối câu trả lời của mình:
       [[CREATE_EMPLOYEE: {"fullname": "Họ Tên", "email": "email@domain.com", "phoneNumber": "0123456789", "position": "Vị trí hoặc null", "password": "Mật khẩu hoặc null"}]]
   - Đối với hành động **Xóa nhân viên khỏi hệ thống (Yêu cầu xác nhận cực kỳ nghiêm ngặt)**:
     + Bạn cần biết ít nhất 1 thông tin định danh của nhân viên muốn xóa: Họ và tên (fullname), hoặc Email (email), hoặc Số điện thoại (phoneNumber).
     + **QUY TẮC AN TOÀN BẮT BUỘC**: Khi Admin yêu cầu xóa một nhân viên, bạn TUYỆT ĐỐI KHÔNG ĐƯỢC chèn thẻ [[DELETE_EMPLOYEE]] ngay lập tức. Bạn PHẢI hỏi xác nhận ý định của Admin trước (Ví dụ: "Bạn có chắc chắn muốn xóa nhân viên **[Tên nhân viên]** (Email: [email]) khỏi hệ thống Eatsy không? Hành động này không thể hoàn tác. Vui lòng nhắn 'Đồng ý' hoặc 'Có' để tôi tiến hành xóa.").
     + Chỉ khi Admin trả lời đồng ý/xác nhận ở tin nhắn tiếp theo, bạn mới được phép xuất thẻ JSON đặc biệt ở cuối câu trả lời đó để thực hiện xóa:
       [[DELETE_EMPLOYEE: {"fullname": "Họ tên cần xóa", "email": "email cần xóa nếu có hoặc null", "phoneNumber": "sđt cần xóa nếu có hoặc null"}]]
   - Đối với hành động **Cập nhật thông tin nhân viên (Sửa tên, sửa vị trí, email, sđt)**:
     + Bạn cần thu thập thông tin cũ để định danh nhân viên (old_fullname hoặc old_email hoặc old_phoneNumber) và các thông tin mới cần cập nhật (fullname, email, phoneNumber, position).
     + Khi Admin yêu cầu sửa đổi (Ví dụ: "Sửa tên nhân viên đó thành Nooba cho tôi", "Đổi email của Nguyễn Văn A thành new@gmail.com", "Sửa vị trí của nhân viên có sđt 0987654321 thành Shipper"), bạn PHẢI chèn một thẻ định dạng JSON đặc biệt sau ở cuối câu trả lời của mình để kích hoạt sửa trực tiếp:
       [[UPDATE_EMPLOYEE: {"old_fullname": "Tên cũ nếu có hoặc null", "old_email": "Email cũ nếu có hoặc null", "old_phoneNumber": "Sđt cũ nếu có hoặc null", "fullname": "Tên mới cần đổi hoặc null", "email": "Email mới cần đổi hoặc null", "phoneNumber": "Sđt mới cần đổi hoặc null", "position": "Vị trí mới cần đổi hoặc null"}]]
6. HƯỚNG DẪN QUẢN LÝ NHÂN VIÊN (QUAN TRỌNG):
   - Khi Admin yêu cầu hoặc click gợi ý "Tôi muốn quản lý nhân viên." (hoặc hỏi chung về quản lý nhân viên), bạn PHẢI phản hồi bằng cách giới thiệu các việc bạn có thể làm giúp họ bao gồm:
     + **Thêm** nhân viên mới trực tiếp (bằng cách cung cấp Họ tên, Email, Số điện thoại cho bạn).
     + **Cập nhật** thông tin nhân viên trực tiếp (như thay đổi họ tên, vị trí, email, số điện thoại).
     + **Xóa** nhân viên trực tiếp (bằng cách nói tên hoặc email của nhân viên đó cho bạn và xác nhận).
   - Hãy giữ câu trả lời thân thiện, có cấu trúc rõ ràng với các gạch đầu dòng hoặc in đậm để dễ đọc.
7. CHỨC NĂNG TỰ ĐỘNG QUẢN LÝ MÓN ĂN/SẢN PHẨM (AGENT PRODUCT ACTION):
   - Bạn CÓ KHẢ NĂNG thêm mới, cập nhật giá và xóa món ăn trực tiếp khỏi Menu.
   - Đối với hành động **Thêm món ăn mới**:
     + Bạn cần thu thập 2 thông tin bắt buộc: Tên món ăn (name) và Giá bán (price).
     + Khi đã có đủ, bạn PHẢI chèn thẻ đặc biệt sau ở cuối câu trả lời:
       [[CREATE_PRODUCT: {"name": "Tên món", "price": 50000, "category_name": "Tên danh mục nếu có", "description": "Mô tả nếu có", "thumbnail_path": "Link ảnh nếu có"}]]
   - Đối với hành động **Thay đổi giá tiền món ăn**:
     + Bạn cần thu thập: Tên món ăn (name) và Giá mới cần đặt (price).
     + Khi đã đủ thông tin, bạn PHẢI chèn thẻ:
       [[UPDATE_PRODUCT_PRICE: {"name": "Tên món ăn", "price": 60000}]]
   - Đối với hành động **Xóa món ăn khỏi Menu (Yêu cầu xác nhận cực kỳ nghiêm ngặt)**:
     + Bạn cần biết Tên món ăn muốn xóa (name).
     + **QUY TẮC AN TOÀN BẮT BUỘC**: Khi Admin yêu cầu xóa món ăn, bạn TUYỆT ĐỐI KHÔNG ĐƯỢC chèn thẻ [[DELETE_PRODUCT]] ngay lập tức. Bạn PHẢI hỏi xác nhận trước (Ví dụ: "Bạn có chắc chắn muốn xóa món **[Tên món]** khỏi Menu của Eatsy không? Món ăn sẽ biến mất khỏi thực đơn của khách hàng. Vui lòng nhắn 'Đồng ý' hoặc 'Có' để tôi thực hiện.").
     + Chỉ khi Admin trả lời đồng ý/xác nhận ở lượt chat kế tiếp, bạn mới được phép chèn thẻ JSON đặc biệt ở cuối câu trả lời đó để thực hiện xóa:
       [[DELETE_PRODUCT: {"name": "Tên món ăn cần xóa"}]]
8. HƯỚNG DẪN QUẢN LÝ SẢN PHẨM (QUAN TRỌNG):
   - Khi Admin yêu cầu hoặc click gợi ý "Tôi muốn quản lý món ăn" (hoặc hỏi chung về quản lý sản phẩm), bạn PHẢI phản hồi bằng cách giới thiệu các việc bạn có thể giúp họ trực tiếp bao gồm:
     + **Thêm** món ăn mới (cung cấp Tên và Giá cho bạn).
     + **Thay đổi giá** tiền món ăn (cung cấp Tên món và Giá mới).
     + **Xóa** món ăn trực tiếp (cung cấp Tên món ăn cần xóa và xác nhận).
   - Hãy thông báo rõ ràng rằng bạn có thể tự động thực hiện các hành động này trực tiếp trên cơ sở dữ liệu. Hướng dẫn họ cách thức cung cấp thông tin để bạn xử lý ngay lập tức!
   - Hãy giữ câu trả lời thân thiện, có cấu trúc rõ ràng với các gạch đầu dòng hoặc in đậm để dễ đọc.
9. CHỨC NĂNG TỔNG HỢP VÀ PHÂN TÍCH ĐÁNH GIÁ (REVIEWS SYSTEM):
   - Bạn có quyền truy cập trực tiếp dữ liệu đánh giá thực tế dưới dạng real-time từ Database (như tổng số đánh giá, sao trung bình, số lượt đánh giá theo mức sao, nhận xét của khách hàng đối với từng món ăn).
   - Khi Admin hỏi về đánh giá tổng quát (Ví dụ: "Tổng hợp đánh giá khách hàng", "Khách hàng đánh giá thế nào về Eatsy?"), bạn PHẢI lập bảng Markdown Premium thống kê:
     + Số sao trung bình hệ thống (kèm ngôi sao biểu tượng như ⭐).
     + Tổng số lượt đánh giá.
     + Phân bố sao (5⭐, 4⭐, 3⭐, 2⭐, 1⭐).
     + Trích dẫn 3-5 đánh giá mới nhất gần đây của khách hàng (gồm Tên người đánh giá, số sao, nội dung bình luận, ngày đánh giá).
   - Khi Admin hỏi về đánh giá của một món cụ thể (Ví dụ: "Mì Ý khách đánh giá ra sao?", "Khách nhận xét gì về Pizza hải sản?", "Tổng hợp review món Cơm gà"):
     + Hãy tìm kiếm món ăn đó trong danh sách đánh giá chi tiết theo món ăn được cung cấp.
     + Trích dẫn số lượng đánh giá, số sao trung bình của món đó.
     + Trích dẫn các bình luận thực tế của món ăn đó kèm theo tên khách hàng và số sao họ đánh giá.
     + Nếu món ăn đó chưa có đánh giá nào, hãy thông báo lịch sự cho Admin biết.`;

/**
 * Xử lý chat AI cho Admin
 * POST /api/admin/ai-chat
 */
const chat = catchAsync(async (req, res) => {
  const { message, chatHistory = [] } = req.body;

  if (!message || typeof message !== "string" || message.trim() === "") {
    return res.status(400).json({
      success: false,
      message: "Nội dung tin nhắn 'message' không được để trống.",
    });
  }

  if (!Array.isArray(chatHistory)) {
    return res.status(400).json({
      success: false,
      message: "Lịch sử chat 'chatHistory' phải là một mảng.",
    });
  }

  // 1. Lấy dữ liệu thống kê doanh thu thực tế từ MySQL (Real-time)
  let statsContext = "";
  try {
    const allOrders = await orderModel.findAll();
    const totalOrdersCount = allOrders.length;
    
    const deliveredOrders = allOrders.filter(o => o.order_status === "delivered");
    const totalRevenue = deliveredOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
    const totalDiscount = deliveredOrders.reduce((sum, o) => sum + Number(o.discount_amount || 0), 0);
    const totalItemsSold = deliveredOrders.reduce((sum, o) => sum + Number(o.quantity || 0), 0);
    
    const pendingCount = allOrders.filter(o => o.order_status === "pending").length;
    const confirmedCount = allOrders.filter(o => o.order_status === "confirmed").length;
    const deliveringCount = allOrders.filter(o => o.order_status === "delivering").length;
    const deliveredCount = deliveredOrders.length;
    const cancelledCount = allOrders.filter(o => o.order_status === "cancelled").length;

    statsContext = `
DỮ LIỆU THỐNG KÊ DOANH THU & ĐƠN HÀNG THỰC TẾ CỦA HỆ THỐNG EATSY (REAL-TIME TỪ DATABASE):
- Tổng số đơn hàng trong hệ thống: ${totalOrdersCount} đơn
- Tổng doanh thu thực tế (chỉ tính từ các đơn đã giao thành công - delivered): ${totalRevenue.toLocaleString('vi-VN')}đ
- Tổng tiền giảm giá từ các voucher đã áp dụng thành công: ${totalDiscount.toLocaleString('vi-VN')}đ
- Tổng số sản phẩm/món ăn đã bán ra thành công: ${totalItemsSold} món
- Thống kê chi tiết số lượng đơn hàng theo từng trạng thái:
  + Chờ xử lý (pending): ${pendingCount} đơn
  + Đã xác nhận (confirmed): ${confirmedCount} đơn
  + Đang giao hàng (delivering): ${deliveringCount} đơn
  + Đã giao thành công (delivered): ${deliveredCount} đơn
  + Đã hủy (cancelled): ${cancelledCount} đơn

Khi người dùng (Admin) yêu cầu xem báo cáo doanh thu, tình hình đơn hàng, thống kê số lượng hoặc tổng quan kinh doanh của Eatsy, bạn hãy sử dụng các số liệu thực tế ở trên để trả lời trực tiếp, chính xác, có phân tích so sánh và định dạng bằng bảng biểu hoặc danh sách Markdown đẹp mắt!`;
  } catch (dbError) {
    console.warn("⚠️ Không thể lấy thống kê doanh thu thực tế từ DB:", dbError.message);
    statsContext = "\n(Không lấy được dữ liệu doanh thu thực tế từ cơ sở dữ liệu do sự cố kết nối.)";
  }

  // 1b. Lấy dữ liệu đánh giá thực tế từ MySQL (Real-time Reviews)
  let reviewsContext = "";
  try {
    const allReviews = await reviewModel.findAll();
    const allDishes = await dishModel.findAll();
    const allUsers = await userModel.findAll();

    const dishMap = new Map(allDishes.map(d => [d.dish_id, d]));
    const userMap = new Map(allUsers.map(u => [u.userId, u]));

    const totalReviews = allReviews.length;
    const averagePoints = totalReviews > 0 
      ? (allReviews.reduce((sum, r) => sum + Number(r.points), 0) / totalReviews).toFixed(1)
      : 0;

    // Đếm số lượng theo sao
    const starsCount = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    allReviews.forEach(r => {
      const pts = Math.round(Number(r.points));
      if (starsCount[pts] !== undefined) {
        starsCount[pts]++;
      }
    });

    // Lấy danh sách 10 đánh giá gần nhất
    const sortedReviews = [...allReviews].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const recentReviews = sortedReviews.slice(0, 10).map(r => {
      const dish = dishMap.get(r.dish_id);
      const user = userMap.get(r.user_id);
      return `- **${user?.fullname || "Ẩn danh"}** đánh giá **${r.points}★** cho món **${dish?.name || "Món ăn đã gỡ"}**: "${r.content}" (${new Date(r.created_at).toLocaleDateString('vi-VN')})`;
    }).join("\n");

    // Nhóm đánh giá theo món ăn
    const reviewsByDish = {};
    allReviews.forEach(r => {
      const dish = dishMap.get(r.dish_id);
      if (dish) {
        if (!reviewsByDish[dish.name]) {
          reviewsByDish[dish.name] = { points: [], comments: [] };
        }
        reviewsByDish[dish.name].points.push(Number(r.points));
        const user = userMap.get(r.user_id);
        reviewsByDish[dish.name].comments.push(`+ **${user?.fullname || "Ẩn danh"}** (${r.points}★): "${r.content}"`);
      }
    });

    const dishStatsList = Object.entries(reviewsByDish).map(([dishName, data]) => {
      const avg = (data.points.reduce((s, p) => s + p, 0) / data.points.length).toFixed(1);
      return `- **${dishName}**: Trung bình **${avg}★** (${data.points.length} lượt đánh giá)\n${data.comments.slice(0, 3).join("\n")}`;
    }).join("\n\n");

    reviewsContext = `
DỮ LIỆU ĐÁNH GIÁ (REVIEWS) THỰC TẾ CỦA KHÁCH HÀNG (REAL-TIME TỪ DATABASE):
1. TỔNG QUAN HỆ THỐNG:
   - Tổng số lượt đánh giá: ${totalReviews} lượt
   - Điểm đánh giá trung bình toàn hệ thống: ${averagePoints} / 5.0 ★
   - Phân bố điểm số: 
     + 5★: ${starsCount[5]} lượt
     + 4★: ${starsCount[4]} lượt
     + 3★: ${starsCount[3]} lượt
     + 2★: ${starsCount[2]} lượt
     + 1★: ${starsCount[1]} lượt

2. ĐÁNH GIÁ CHI TIẾT THEO MÓN ĂN:
${dishStatsList || "- Chưa có đánh giá chi tiết theo món ăn."}

3. DANH SÁCH 10 ĐÁNH GIÁ MỚI NHẤT GẦN ĐÂY:
${recentReviews || "- Chưa có đánh giá gần đây."}

Khi Admin yêu cầu xem báo cáo đánh giá, tổng hợp nhận xét của người dùng hoặc phản hồi khách hàng về một món ăn cụ thể, bạn hãy sử dụng các số liệu thực tế và nhận xét chi tiết ở trên để tổng hợp, trích dẫn phản hồi thực tế và lập bảng báo cáo Markdown đẹp mắt.`;
  } catch (reviewErr) {
    console.warn("⚠️ Không thể lấy dữ liệu đánh giá thực tế từ DB:", reviewErr.message);
    reviewsContext = "\n(Không lấy được dữ liệu đánh giá thực tế từ cơ sở dữ liệu do sự cố kết nối.)";
  }

  // 2. Chuẩn bị lịch sử tin nhắn gửi lên OpenAI/Gemini
  // Giới hạn số lượng hội thoại trong cửa sổ trượt (sliding window) để tối ưu hiệu năng
  const formattedHistory = chatHistory
    .filter((msg) => msg?.role && msg?.content)
    .slice(-SLIDING_WINDOW_SIZE)
    .map((msg) => ({
      role: msg.role === "assistant" ? "assistant" : "user",
      content: String(msg.content),
    }));

  // Gộp chỉ thị hệ thống và dữ liệu thời gian thực trực tiếp vào tin nhắn của user để đảm bảo Gemini nhận được 100%
  // (Do API OpenAI-compatible của Gemini đôi khi bỏ qua vai trò "system")
  const promptContext = `[HỆ THỐNG - CHỈ THỊ & DỮ LIỆU ĐƯỢC CUNG CẤP QUAN TRỌNG]
${ADMIN_AI_SYSTEM_PROMPT}

${statsContext}

${reviewsContext}

[ADMIN CHAT]: ${message}`;

  const messagesForOpenAI = [
    ...formattedHistory,
    { role: "user", content: promptContext },
  ];

  // 2. Thực hiện gọi API AI tích hợp cơ chế retry tự động
  try {
    const completion = await retryAsync(
      () =>
        openai.chat.completions.create({
          model: CHAT_MODEL,
          messages: messagesForOpenAI,
          temperature: 0.3, // Temperature thấp giúp AI bám sát quy tắc hệ thống tốt hơn
          max_tokens: CHAT_MAX_TOKENS,
        }),
      {
        retries: CHAT_RETRIES,
        timeoutMs: CHAT_COMPLETION_TIMEOUT_MS,
        operationName: "Admin OpenAI Chat Completion",
      }
    );

    let reply = completion.choices[0].message.content;

    // 3. Xử lý logic Agentic tự động thêm nhân viên nếu AI phát ra thẻ [[CREATE_EMPLOYEE: ...]]
    const createEmployeeRegex = /\[\[CREATE_EMPLOYEE:\s*(\{.*?\})\s*\]\]/;
    const match = reply.match(createEmployeeRegex);

    if (match) {
      try {
        const employeeData = JSON.parse(match[1]);
        const { fullname, email, phoneNumber, position, password } = employeeData;

        const newEmployee = await AdminService.addEmployee({
          fullname,
          email,
          phoneNumber,
          position,
          password
        });

        const successMsg = `\n\n🎉 **Hệ thống thông báo:** Đã tự động tạo tài khoản nhân viên thành công trên cơ sở dữ liệu Eatsy!
- **Họ và tên:** **${newEmployee.fullname}**
- **Email:** \`${newEmployee.email}\`
- **Số điện thoại:** \`${newEmployee.phoneNumber}\`
- **Vị trí công việc:** **${newEmployee.position || "Nhân viên"}**
- **Mật khẩu khởi tạo:** \`${password || "Employee@123"}\` *(Có thể dùng đăng nhập ngay lập tức)*.`;

        reply = reply.replace(createEmployeeRegex, successMsg);
      } catch (err) {
        console.error("❌ Lỗi khi tự động tạo tài khoản nhân viên qua AI:", err);
        const errorMsg = `\n\n❌ **Hệ thống thông báo:** Không thể tự động tạo tài khoản nhân viên do lỗi: *${err.message || err}* *(Vui lòng kiểm tra lại email hoặc số điện thoại xem có trùng lặp không)*.`;
        reply = reply.replace(createEmployeeRegex, errorMsg);
      }
    }

    // 3b. Xử lý logic Agentic tự động xóa nhân viên nếu AI phát ra thẻ [[DELETE_EMPLOYEE: ...]]
    const deleteEmployeeRegex = /\[\[DELETE_EMPLOYEE:\s*(\{.*?\})\s*\]\]/;
    const deleteMatch = reply.match(deleteEmployeeRegex);

    if (deleteMatch) {
      try {
        const employeeData = JSON.parse(deleteMatch[1]);
        const { fullname, email, phoneNumber } = employeeData;

        const whereConditions = [];
        if (fullname) whereConditions.push({ fullname: { [Op.like]: `%${fullname}%` } });
        if (email) whereConditions.push({ email });
        if (phoneNumber) whereConditions.push({ phoneNumber });

        if (whereConditions.length === 0) {
          throw new Error("Vui lòng cung cấp ít nhất Họ tên, Email hoặc Số điện thoại để định danh nhân viên cần xóa.");
        }

        const employee = await authUserService.findUserRecord({
          role: "Employee",
          [Op.or]: whereConditions
        });

        if (!employee) {
          throw new Error(`Không tìm thấy nhân viên nào khớp với thông tin đã cung cấp (Tên: ${fullname || ""}, Email: ${email || ""})`);
        }

        const deletedFullname = employee.fullname;
        const deletedEmail = employee.email;
        await AdminService.deleteEmployee(employee.userId);

        const successMsg = `\n\n🎉 **Hệ thống thông báo:** Đã xóa tài khoản nhân viên thành công khỏi cơ sở dữ liệu Eatsy!
- **Họ và tên:** **${deletedFullname}**
- **Email:** \`${deletedEmail}\`
- **Trạng thái:** \`Đã xóa khỏi hệ thống (Deleted)\``;

        reply = reply.replace(deleteEmployeeRegex, successMsg);
      } catch (err) {
        console.error("❌ Lỗi khi tự động xóa tài khoản nhân viên qua AI:", err);
        const errorMsg = `\n\n❌ **Hệ thống thông báo:** Không thể xóa tài khoản nhân viên do lỗi: *${err.message || err}*.`;
        reply = reply.replace(deleteEmployeeRegex, errorMsg);
      }
    }

    // 3c. Xử lý logic Agentic tự động cập nhật thông tin nhân viên nếu AI phát ra thẻ [[UPDATE_EMPLOYEE: ...]]
    const updateEmployeeRegex = /\[\[UPDATE_EMPLOYEE:\s*(\{.*?\})\s*\]\]/;
    const updateEmpMatch = reply.match(updateEmployeeRegex);

    if (updateEmpMatch) {
      try {
        const employeeData = JSON.parse(updateEmpMatch[1]);
        const { 
          old_fullname, old_email, old_phoneNumber, 
          fullname, email, phoneNumber, position 
        } = employeeData;

        const whereConditions = [];
        if (old_fullname) whereConditions.push({ fullname: { [Op.like]: `%${old_fullname}%` } });
        if (old_email) whereConditions.push({ email: old_email });
        if (old_phoneNumber) whereConditions.push({ phoneNumber: old_phoneNumber });

        if (whereConditions.length === 0) {
          throw new Error("Vui lòng cung cấp ít nhất Họ tên cũ, Email cũ hoặc Số điện thoại cũ để định danh nhân viên cần cập nhật.");
        }

        const employee = await authUserService.findUserRecord({
          role: "Employee",
          [Op.or]: whereConditions
        });

        if (!employee) {
          throw new Error(`Không tìm thấy nhân viên nào khớp với thông tin đã cung cấp (Tên: ${old_fullname || ""}, Email: ${old_email || ""})`);
        }

        const updated = await AdminService.updateEmployee(employee.userId, {
          fullname: fullname || undefined,
          email: email || undefined,
          phoneNumber: phoneNumber || undefined,
          position: position || undefined
        });

        const successMsg = `\n\n🎉 **Hệ thống thông báo:** Đã cập nhật thông tin nhân viên thành công trên cơ sở dữ liệu Eatsy!
- **Họ và tên:** **${updated.fullname}** ${fullname ? `*(Thay đổi từ: ${employee.fullname})*` : ""}
- **Email:** \`${updated.email}\` ${email ? `*(Thay đổi từ: ${employee.email})*` : ""}
- **Số điện thoại:** \`${updated.phoneNumber}\` ${phoneNumber ? `*(Thay đổi từ: ${employee.phoneNumber})*` : ""}
- **Vị trí công việc:** **${updated.position || "Nhân viên"}** ${position ? `*(Thay đổi từ: ${employee.position || "Chưa thiết lập"})*` : ""}
- **Trạng thái cập nhật:** \`Thành công (Updated)\``;

        reply = reply.replace(updateEmployeeRegex, successMsg);
      } catch (err) {
        console.error("❌ Lỗi khi tự động cập nhật tài khoản nhân viên qua AI:", err);
        const errorMsg = `\n\n❌ **Hệ thống thông báo:** Không thể cập nhật thông tin nhân viên do lỗi: *${err.message || err}*.`;
        reply = reply.replace(updateEmployeeRegex, errorMsg);
      }
    }

    // 4. Xử lý logic Agentic tự động thêm sản phẩm mới nếu AI phát ra thẻ [[CREATE_PRODUCT: ...]]
    const createProductRegex = /\[\[CREATE_PRODUCT:\s*(\{.*?\})\s*\]\]/;
    const productMatch = reply.match(createProductRegex);

    if (productMatch) {
      try {
        const productData = JSON.parse(productMatch[1]);
        const { name, price, category_name, description, thumbnail_path } = productData;

        let category_id = null;
        if (category_name) {
          const categories = await AdminService.getCategories();
          const matchCat = categories.find(
            c => c.name.toLowerCase().includes(category_name.toLowerCase()) || 
                 category_name.toLowerCase().includes(c.name.toLowerCase())
          );
          if (matchCat) {
            category_id = matchCat.category_id;
          }
        }

        const defaultThumb = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=500";
        const newProduct = await AdminService.addProduct({
          name,
          price: Number(price),
          category_id,
          description: description || "Món ăn ngon và chất lượng từ nhà hàng Eatsy",
          thumbnail_path: thumbnail_path || defaultThumb,
          stock: 100,
          status: "active",
          available: true
        });

        const successMsg = `\n\n🎉 **Hệ thống thông báo:** Đã tự động tạo sản phẩm/món ăn mới thành công trên Menu của Eatsy!
- **Tên món ăn:** **${newProduct.name}**
- **Giá bán:** **${Number(newProduct.price).toLocaleString('vi-VN')}đ**
- **Mô tả:** *${newProduct.description}*
- **Trạng thái:** \`Đang bán (Active)\` | **Tồn kho:** \`100\`
- **Ảnh sản phẩm:** [Xem ảnh minh họa](${newProduct.thumbnail_path})`;

        reply = reply.replace(createProductRegex, successMsg);
      } catch (err) {
        console.error("❌ Lỗi khi tự động thêm món ăn qua AI:", err);
        const errorMsg = `\n\n❌ **Hệ thống thông báo:** Không thể tự động thêm món ăn mới do lỗi: *${err.message || err}* *(Vui lòng kiểm tra lại thông tin nhập vào)*.`;
        reply = reply.replace(createProductRegex, errorMsg);
      }
    }

    // 4b. Xử lý logic Agentic tự động xóa món ăn nếu AI phát ra thẻ [[DELETE_PRODUCT: ...]]
    const deleteProductRegex = /\[\[DELETE_PRODUCT:\s*(\{.*?\})\s*\]\]/;
    const deleteProductMatch = reply.match(deleteProductRegex);

    if (deleteProductMatch) {
      try {
        const productData = JSON.parse(deleteProductMatch[1]);
        const { name } = productData;

        const dishes = await dishService.getDishesByName(name);
        if (!dishes || dishes.length === 0) {
          throw new Error(`Không tìm thấy món ăn nào có tên khớp với "${name}"`);
        }

        const targetDish = dishes[0];
        const deletedName = targetDish.name;
        await AdminService.deleteProduct(targetDish.dish_id);

        const successMsg = `\n\n🎉 **Hệ thống thông báo:** Đã xóa sản phẩm/món ăn thành công khỏi Menu của Eatsy!
- **Tên món ăn:** **${deletedName}**
- **Trạng thái:** \`Đã gỡ khỏi Menu (Deleted)\``;

        reply = reply.replace(deleteProductRegex, successMsg);
      } catch (err) {
        console.error("❌ Lỗi khi tự động xóa món ăn qua AI:", err);
        const errorMsg = `\n\n❌ **Hệ thống thông báo:** Không thể xóa sản phẩm do lỗi: *${err.message || err}*.`;
        reply = reply.replace(deleteProductRegex, errorMsg);
      }
    }

    // 5. Xử lý logic Agentic tự động cập nhật giá món ăn nếu AI phát ra thẻ [[UPDATE_PRODUCT_PRICE: ...]]
    const updatePriceRegex = /\[\[UPDATE_PRODUCT_PRICE:\s*(\{.*?\})\s*\]\]/;
    const priceMatch = reply.match(updatePriceRegex);

    if (priceMatch) {
      try {
        const priceData = JSON.parse(priceMatch[1]);
        const { name, price } = priceData;

        const dishes = await dishService.getDishesByName(name);
        if (!dishes || dishes.length === 0) {
          throw new Error(`Không tìm thấy món ăn nào có tên khớp với "${name}"`);
        }

        const targetDish = dishes[0];
        const updatedDish = await dishService.updateDish(targetDish.dish_id, {
          price: Number(price)
        });

        const successMsg = `\n\n⚡ **Hệ thống thông báo:** Đã tự động cập nhật giá món ăn thành công trên cơ sở dữ liệu!
- **Tên món ăn:** **${updatedDish.name}**
- **Giá cũ:** *${Number(targetDish.price).toLocaleString('vi-VN')}đ*
- **Giá mới cập nhật:** **${Number(updatedDish.price).toLocaleString('vi-VN')}đ**
- **Trạng thái cập nhật:** \`Thành công\``;

        reply = reply.replace(updatePriceRegex, successMsg);
      } catch (err) {
        console.error("❌ Lỗi khi tự động cập nhật giá món ăn qua AI:", err);
        const errorMsg = `\n\n❌ **Hệ thống thông báo:** Không thể cập nhật giá sản phẩm do lỗi: *${err.message || err}*.`;
        reply = reply.replace(updatePriceRegex, errorMsg);
      }
    }

    // 5b. Xử lý logic Agentic tự động cập nhật thông tin món ăn khác nếu AI phát ra thẻ [[UPDATE_PRODUCT: ...]]
    const updateProductRegex = /\[\[UPDATE_PRODUCT:\s*(\{.*?\})\s*\]\]/;
    const updateProductMatch = reply.match(updateProductRegex);

    if (updateProductMatch) {
      try {
        const productData = JSON.parse(updateProductMatch[1]);
        const { old_name, name, category_name, description, price } = productData;

        const dishes = await dishService.getDishesByName(old_name);
        if (!dishes || dishes.length === 0) {
          throw new Error(`Không tìm thấy món ăn nào có tên khớp với "${old_name}"`);
        }

        const targetDish = dishes[0];

        let category_id = undefined;
        if (category_name) {
          const categories = await AdminService.getCategories();
          const matchCat = categories.find(
            c => c.name.toLowerCase().includes(category_name.toLowerCase()) || 
                 category_name.toLowerCase().includes(c.name.toLowerCase())
          );
          if (matchCat) {
            category_id = matchCat.category_id;
          }
        }

        const updatedProduct = await AdminService.updateProduct(targetDish.dish_id, {
          name: name || undefined,
          price: price ? Number(price) : undefined,
          category_id,
          description: description || undefined
        });

        const successMsg = `\n\n🎉 **Hệ thống thông báo:** Đã cập nhật thông tin món ăn thành công trên thực đơn của Eatsy!
- **Tên món ăn:** **${updatedProduct.name}** ${name ? `*(Thay đổi từ: ${targetDish.name})*` : ""}
- **Giá bán:** **${Number(updatedProduct.price).toLocaleString('vi-VN')}đ** ${price ? `*(Thay đổi từ: ${Number(targetDish.price).toLocaleString('vi-VN')}đ)*` : ""}
- **Mô tả:** *${updatedProduct.description}* ${description ? `*(Đã cập nhật mới)*` : ""}
- **Trạng thái cập nhật:** \`Thành công (Updated)\``;

        reply = reply.replace(updateProductRegex, successMsg);
      } catch (err) {
        console.error("❌ Lỗi khi tự động cập nhật món ăn qua AI:", err);
        const errorMsg = `\n\n❌ **Hệ thống thông báo:** Không thể cập nhật thông tin món ăn do lỗi: *${err.message || err}*.`;
        reply = reply.replace(updateProductRegex, errorMsg);
      }
    }

    return res.json({
      success: true,
      reply,
    });
  } catch (error) {
    console.error("❌ Lỗi gọi API Gemini/OpenAI trong Admin AI Chat:", error);
    
    if (error.status === 429) {
      return res.json({
        success: true,
        reply: "⚠️ **Dịch vụ AI đang tạm thời quá tải tần suất truy vấn (Rate Limit 429 của tài khoản Gemini miễn phí).**\n\nBạn vui lòng đợi khoảng 15 - 20 giây và bấm gửi lại câu hỏi hoặc nhấn nút gợi ý nhanh nhé, hệ thống sẽ lập tức xử lý được ngay ạ!",
      });
    }

    return res.status(500).json({
      success: false,
      message: `Hệ thống AI không phản hồi: ${error.message || error}`,
    });
  }
});

module.exports = {
  chat,
};
