const { DataTypes } = require('sequelize');
const { sequelize } = require('@core/config/sequelize');

const pendingPaymentModel = sequelize.define(
    'PendingPayment',
    {
        payment_id: {
            type: DataTypes.STRING(255),
            primaryKey: true,
        },
        user_id: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        address_id: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        delivery_address: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        note: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        payment_method: {
            type: DataTypes.STRING(50),
            allowNull: false,
            defaultValue: 'BANK_TRANSFER',
        },
        payment_status: {
            type: DataTypes.ENUM('pending', 'paid', 'expired'),
            allowNull: false,
            defaultValue: 'pending',
        },
        payment_code: {
            type: DataTypes.STRING(50),
            allowNull: false,
        },
        bank_code: {
            type: DataTypes.STRING(30),
            allowNull: false,
        },
        account_no: {
            type: DataTypes.STRING(50),
            allowNull: false,
        },
        account_name: {
            type: DataTypes.STRING(100),
            allowNull: false,
        },
        items_snapshot: {
            type: DataTypes.JSON,
            allowNull: false,
        },
        original_amount: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
            defaultValue: 0,
        },
        discount_amount: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
            defaultValue: 0,
        },
        total_amount: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
            defaultValue: 0,
        },
        voucher_code: {
            type: DataTypes.STRING(50),
            allowNull: true,
        },
        brand: {
            type: DataTypes.STRING(100),
            allowNull: false,
            defaultValue: 'Eatsy',
        },
        estimated_time: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        order_id: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        paid_at: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    },
    {
        tableName: 'PendingPayments',
        timestamps: true,
        underscored: false,
    },
);

module.exports = pendingPaymentModel;
