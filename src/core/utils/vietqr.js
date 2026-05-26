const buildVietQrImageUrl = ({
    bankCode,
    accountNo,
    accountName,
    amount,
    addInfo,
}) => {
    const safeBankCode = (bankCode || '').trim();
    const safeAccountNo = (accountNo || '').trim();
    const safeAccountName = (accountName || '').trim();
    const safeAmount = Number.isFinite(amount)
        ? Math.max(0, Math.round(amount))
        : 0;

    const baseUrl = `https://img.vietqr.io/image/${encodeURIComponent(safeBankCode)}-${encodeURIComponent(safeAccountNo)}-compact2.png`;
    const params = new URLSearchParams();

    if (safeAmount > 0) params.set('amount', String(safeAmount));
    if (addInfo) params.set('addInfo', addInfo);
    if (safeAccountName) params.set('accountName', safeAccountName);

    const query = params.toString();
    return query ? `${baseUrl}?${query}` : baseUrl;
};

module.exports = {
    buildVietQrImageUrl,
};
