/**
 * RECONCILE ENGINE - GOLD LAUNDRY
 * Module Đối Soát Dự Phòng Đa Tầng (Multi-Layer Reconciliation Engine)
 * Tự động đối chiếu giao dịch chuyển khoản ngân hàng (MBBank) với đơn hàng AppSheet
 */

/**
 * Chuẩn hóa đối tượng đơn hàng từ các nguồn dữ liệu đa dạng (AppSheet, Google Sheet, Webhook)
 */
function normalizeOrder(order) {
  if (!order) return null;
  const invoiceIdRaw =
    order.Invoice_Number ||
    order.invoice_number ||
    order["Số hóa đơn"] ||
    order.Invoice_ID ||
    order.Order_ID ||
    order.Order_Code ||
    order.Ma_Don ||
    order.ID ||
    order.Row_ID ||
    "";
  const cleanInvoiceId = String(invoiceIdRaw).replace(/[^a-zA-Z0-9]/g, "").toUpperCase();

  const phoneRaw = order.Customer_Phone || order.Phone || order.SĐT || order.number_phone || "";
  const cleanPhone = String(phoneRaw).replace(/[^0-9]/g, "");

  const amountRaw = order.Bill_Amount || order.Amount || order.Total || order.Thành_tiền || 0;
  const cleanAmount = parseInt(String(amountRaw).replace(/[^0-9]/g, ""), 10) || 0;

  return {
    raw: order,
    Invoice_ID: cleanInvoiceId,
    Customer_Name: order.Customer_Name || order.Name || order.Khách_hàng || "",
    Customer_Phone: cleanPhone,
    Bill_Amount: cleanAmount,
    Complete_Date: order.Complete_Date || order.Date || "",
    Row_ID: order.Row_ID || cleanInvoiceId
  };
}

/**
 * Thuật toán phân tích và đối soát 1 giao dịch ngân hàng với danh sách đơn hàng chờ thanh toán
 * @param {Object} tx - Giao dịch ngân hàng { amount, content/description, transactionDate, senderName }
 * @param {Array} pendingOrders - Danh sách đơn hàng mở / chưa thanh toán
 * @returns {Object} Kết quả đối soát { matched: boolean, layer: number, rule: string, confidence: string, order: Object, note: string }
 */
function reconcileBankTransaction(tx, pendingOrders = []) {
  if (!tx) {
    return { matched: false, layer: 0, rule: "INVALID_TRANSACTION", confidence: "0%", note: "Dữ liệu giao dịch rỗng" };
  }

  const rawContent = String(tx.content || tx.description || tx.addInfo || tx.remark || "").toUpperCase();
  const txAmount = parseInt(String(tx.amount || 0).replace(/[^0-9]/g, ""), 10) || 0;
  const normalizedOrders = (pendingOrders || []).map(normalizeOrder).filter(Boolean);

  // =========================================================================
  // TẦNG 1: Regex bóc tách Mã Hóa Đơn (Độ tin cậy: 100% - Tuyệt đối)
  // Xử lý trường hợp: Khách giữ nguyên mã, hoặc gõ thêm tên/lời nhắn (VD: "INV12029 Le Tien Dat ck")
  // =========================================================================
  const invoiceMatch = rawContent.match(/\b(INV\d+)\b/i);
  if (invoiceMatch) {
    const extractedId = invoiceMatch[1].toUpperCase();
    const matchedOrder = normalizedOrders.find(
      (o) => o.Invoice_ID === extractedId || String(o.Row_ID).toUpperCase() === extractedId
    );
    if (matchedOrder) {
      return {
        matched: true,
        layer: 1,
        rule: "EXACT_INVOICE_REGEX",
        confidence: "100%",
        order: matchedOrder,
        extractedInvoiceId: extractedId,
        note: `Khớp chuẩn xác 100% theo mã hóa đơn #${extractedId} (bất chấp nội dung phụ đính kèm)`
      };
    }
  }

  // =========================================================================
  // TẦNG 2: Regex bóc tách Số Điện Thoại (Độ tin cậy: 95% - 98%)
  // Xử lý trường hợp: Khách xóa mã INV nhưng quen tay gõ SĐT vào nội dung chuyển khoản
  // =========================================================================
  const phoneMatch = rawContent.match(/(?:0|\+84)[35789]\d{8}\b/);
  if (phoneMatch) {
    const rawPhone = phoneMatch[0].replace("+84", "0");
    const phoneSuffix = rawPhone.slice(-9);

    const matchedByPhone = normalizedOrders.filter((o) => o.Customer_Phone && o.Customer_Phone.endsWith(phoneSuffix));

    if (matchedByPhone.length === 1) {
      return {
        matched: true,
        layer: 2,
        rule: "PHONE_MATCH_SINGLE",
        confidence: "95%",
        order: matchedByPhone[0],
        extractedPhone: rawPhone,
        note: `Khớp qua Số điện thoại ${rawPhone} tìm thấy trong nội dung chuyển khoản`
      };
    } else if (matchedByPhone.length > 1) {
      // Nếu khách có nhiều đơn cùng lúc, đối chiếu thêm số tiền
      const exactAmountOrder = matchedByPhone.find((o) => o.Bill_Amount === txAmount);
      if (exactAmountOrder) {
        return {
          matched: true,
          layer: 2,
          rule: "PHONE_AND_AMOUNT_MATCH",
          confidence: "98%",
          order: exactAmountOrder,
          extractedPhone: rawPhone,
          note: `Khớp qua Số điện thoại ${rawPhone} kết hợp trùng số tiền ${txAmount.toLocaleString("vi-VN")}đ`
        };
      }
    }
  }

  // =========================================================================
  // TẦNG 3: Khớp Số Tiền Lẻ Duy Nhất Trong Ngày (Độ tin cậy: 90%)
  // Xử lý trường hợp: Khách xóa sạch thông tin (nội dung chỉ có tên mặc định của ngân hàng)
  // =========================================================================
  if (txAmount > 0) {
    const sameAmountOrders = normalizedOrders.filter((o) => o.Bill_Amount === txAmount);
    if (sameAmountOrders.length === 1) {
      return {
        matched: true,
        layer: 3,
        rule: "UNIQUE_ODD_AMOUNT_MATCH",
        confidence: "90%",
        order: sameAmountOrders[0],
        note: `Khớp tự động vì trong ngày chỉ có DUY NHẤT 1 đơn mang số tiền lẻ ${txAmount.toLocaleString("vi-VN")}đ`
      };
    }

    // =========================================================================
    // TẦNG 4: Hàng Đợi Chờ Xác Nhận Thủ Công (Độ tin cậy: Cần duyệt 1-click)
    // Xử lý trường hợp: Tiền chẵn phổ thông (50k, 100k...) trùng nhiều đơn
    // =========================================================================
    if (sameAmountOrders.length > 1) {
      return {
        matched: false,
        layer: 4,
        rule: "AMBIGUOUS_ROUND_AMOUNT",
        confidence: "NEED_MANUAL_CONFIRM",
        candidateOrders: sameAmountOrders,
        note: `Có ${sameAmountOrders.length} đơn có cùng số tiền ${txAmount.toLocaleString("vi-VN")}đ - Chuyển sang hàng đợi duyệt 1-click`
      };
    }
  }

  return {
    matched: false,
    layer: 4,
    rule: "NO_MATCH",
    confidence: "0%",
    note: `Không tìm thấy đơn hàng phù hợp cho giao dịch ${txAmount.toLocaleString("vi-VN")}đ`
  };
}

/**
 * Xử lý đối soát hàng loạt danh sách giao dịch ngân hàng cuối ngày (Batch Report)
 * @param {Array} transactions - Mảng các giao dịch ngân hàng trong ngày
 * @param {Array} pendingOrders - Mảng các đơn hàng AppSheet trong ngày
 * @returns {Object} Báo cáo đối soát tổng hợp
 */
function batchReconcile(transactions = [], pendingOrders = []) {
  const remainingOrders = [...pendingOrders];
  const matchedResults = [];
  const pendingReview = [];
  const unmatchedTransactions = [];

  let totalMatchedAmount = 0;
  let totalTxAmount = 0;

  for (const tx of transactions) {
    const txAmount = parseInt(String(tx.amount || 0).replace(/[^0-9]/g, ""), 10) || 0;
    totalTxAmount += txAmount;

    const result = reconcileBankTransaction(tx, remainingOrders);
    if (result.matched && result.order) {
      matchedResults.push({
        transaction: tx,
        reconcile: result
      });
      totalMatchedAmount += txAmount;

      // Loại bỏ đơn đã khớp khỏi danh sách còn lại để tránh khớp trùng giao dịch sau
      const orderIdx = remainingOrders.findIndex(
        (o) =>
          normalizeOrder(o).Invoice_ID === result.order.Invoice_ID &&
          normalizeOrder(o).Row_ID === result.order.Row_ID
      );
      if (orderIdx !== -1) {
        remainingOrders.splice(orderIdx, 1);
      }
    } else if (result.layer === 4 && result.rule === "AMBIGUOUS_ROUND_AMOUNT") {
      pendingReview.push({
        transaction: tx,
        reconcile: result
      });
    } else {
      unmatchedTransactions.push({
        transaction: tx,
        reconcile: result
      });
    }
  }

  return {
    summary: {
      totalTransactions: transactions.length,
      totalTxAmount,
      matchedCount: matchedResults.length,
      matchedAmount: totalMatchedAmount,
      pendingReviewCount: pendingReview.length,
      unmatchedTxCount: unmatchedTransactions.length,
      unpaidOrdersRemainingCount: remainingOrders.length,
      matchRate: transactions.length > 0 ? ((matchedResults.length / transactions.length) * 100).toFixed(1) + "%" : "0%"
    },
    matched: matchedResults,
    pendingReview,
    unmatchedTransactions,
    unpaidOrdersRemaining: remainingOrders
  };
}

module.exports = {
  normalizeOrder,
  reconcileBankTransaction,
  batchReconcile
};
