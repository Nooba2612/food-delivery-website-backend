"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const router = (0, express_1.Router)();

function sortObject(obj) {
  let sorted = {};
  let str = [];
  for (let key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      str.push(encodeURIComponent(key));
    }
  }
  str.sort();
  for (let key = 0; key < str.length; key++) {
    sorted[str[key]] = encodeURIComponent(obj[str[key]]).replace(/%20/g, "+");
  }
  return sorted;
}
router.post("/create_payment_url", function (req, res) {
  const ipAddr = req.headers["x-forwarded-for"] || "127.0.0.1";
  const dateFormat = require("dateformat");
  const tmnCode = process.env.VNPAY_TMNCODE;
  const secretKey = process.env.VNPAY_HASH_SECRET;
  let vnpUrl =
    process.env.VNPAY_URL ||
    "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html";
  const returnUrl =
    process.env.VNPAY_RETURN_URL ||
    "http://localhost:5678/api/vnpay/vnpay_return";
  const date = new Date();
  const createDate = dateFormat(date, "yyyymmddHHmmss");
  const expireDate = dateFormat(
    new Date(date.getTime() + 60 * 60 * 1000),
    "yyyymmddHHmmss",
  );
  const orderId = `${dateFormat(date, "yyyymmddHHmmss")}_${Math.floor(Math.random() * 1000000)}`;
  const amount = req.body.amount;
  const bankCode = req.body.bankCode;
  const orderInfo = req.body.orderDescription;
  const orderType = req.body.orderType;
  let locale = req.body.language;
  if (locale === null || locale === "") {
    locale = "vn";
  }
  const currCode = "VND";
  let vnp_Params = {};
  vnp_Params["vnp_Version"] = "2.1.0";
  vnp_Params["vnp_Command"] = "pay";
  vnp_Params["vnp_TmnCode"] = tmnCode;
  // vnp_Params['vnp_Merchant'] = ''
  vnp_Params["vnp_Locale"] = locale;
  vnp_Params["vnp_CurrCode"] = currCode;
  vnp_Params["vnp_TxnRef"] = orderId;
  vnp_Params["vnp_OrderInfo"] = orderInfo;
  vnp_Params["vnp_OrderType"] = orderType;
  vnp_Params["vnp_Amount"] = amount * 100;
  vnp_Params["vnp_ReturnUrl"] = returnUrl;
  vnp_Params["vnp_IpAddr"] = ipAddr;
  vnp_Params["vnp_CreateDate"] = createDate;
  vnp_Params["vnp_ExpireDate"] = expireDate;
  if (bankCode !== null && bankCode !== "") {
    vnp_Params["vnp_BankCode"] = bankCode;
  }
  vnp_Params = sortObject(vnp_Params);
  const querystring = require("qs");
  const signData = querystring.stringify(vnp_Params, { encode: false });
  const crypto = require("crypto");
  const hmac = crypto.createHmac("sha512", secretKey);
  const signed = hmac.update(Buffer.from(signData, "utf-8")).digest("hex");
  vnp_Params["vnp_SecureHash"] = signed;
  vnpUrl += "?" + querystring.stringify(vnp_Params, { encode: false });
  console.log(vnpUrl);
  return res.status(200).json({ url: vnpUrl });
});
router.get("/vnpay_return", function (req, res) {
  let vnp_Params = req.query;
  const secureHash = vnp_Params["vnp_SecureHash"];
  delete vnp_Params["vnp_SecureHash"];
  delete vnp_Params["vnp_SecureHashType"];
  vnp_Params = sortObject(vnp_Params);
  const secretKey = process.env.VNPAY_HASH_SECRET;
  const querystring = require("qs");
  const signData = querystring.stringify(vnp_Params, { encode: false });
  const crypto = require("crypto");
  const hmac = crypto.createHmac("sha512", secretKey);
  const signed = hmac.update(Buffer.from(signData, "utf-8")).digest("hex");
  if (secureHash === signed) {
    //Kiem tra xem du lieu trong db co hop le hay khong va thong bao ket qua
    res.render("success", { code: vnp_Params["vnp_ResponseCode"] });
  } else {
    res.render("success", { code: "97" });
  }
});
module.exports = router;
