from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.utils import timezone
from .models import (
    Branch, Category, Supplier, Product, Inventory,
    Customer, Sale, SaleItem, MpesaTransaction,
    LoyaltyTransaction, AuditLog, CashDrawer, Discount
)

User = get_user_model()


# ─── Auth Serializers ─────────────────────────────────────────────────────────

class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    branch_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'email', 'first_name', 'last_name', 'full_name',
            'role', 'employee_id', 'phone', 'is_active',
            'branch', 'branch_name', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']

    def get_full_name(self, obj):
        return obj.full_name

    def get_branch_name(self, obj):
        return obj.branch.name if obj.branch else None


class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = [
            'email', 'first_name', 'last_name', 'role',
            'employee_id', 'phone', 'branch', 'password', 'confirm_password'
        ]

    def validate(self, data):
        if data['password'] != data.pop('confirm_password'):
            raise serializers.ValidationError({'confirm_password': 'Passwords do not match.'})
        return data

    def create(self, validated_data):
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True)

    def validate(self, data):
        if data['new_password'] != data['confirm_password']:
            raise serializers.ValidationError({'confirm_password': 'Passwords do not match.'})
        return data


# ─── Branch Serializer ────────────────────────────────────────────────────────

class BranchSerializer(serializers.ModelSerializer):
    class Meta:
        model = Branch
        fields = '__all__'


# ─── Category Serializers ─────────────────────────────────────────────────────

class CategorySerializer(serializers.ModelSerializer):
    parent_name = serializers.SerializerMethodField()
    children = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = ['id', 'name', 'slug', 'parent', 'parent_name', 'icon', 'is_active', 'children']

    def get_parent_name(self, obj):
        return obj.parent.name if obj.parent else None

    def get_children(self, obj):
        children = obj.children.filter(is_active=True)
        return CategorySerializer(children, many=True).data


class CategoryMinSerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'name', 'slug', 'icon']


# ─── Supplier Serializer ──────────────────────────────────────────────────────

class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = '__all__'


# ─── Product Serializers ──────────────────────────────────────────────────────

class ProductSerializer(serializers.ModelSerializer):
    category_name = serializers.SerializerMethodField()
    supplier_name = serializers.SerializerMethodField()
    current_stock = serializers.ReadOnlyField()
    tax_amount = serializers.ReadOnlyField()
    low_stock = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            'id', 'name', 'barcode', 'sku', 'category', 'category_name',
            'supplier', 'supplier_name', 'description', 'image',
            'cost_price', 'selling_price', 'tax_rate', 'tax_amount',
            'unit', 'min_stock_level', 'is_active', 'is_weighable',
            'allow_discount', 'current_stock', 'low_stock',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_category_name(self, obj):
        return obj.category.name if obj.category else None

    def get_supplier_name(self, obj):
        return obj.supplier.name if obj.supplier else None

    def get_low_stock(self, obj):
        return obj.current_stock <= obj.min_stock_level


class ProductMinSerializer(serializers.ModelSerializer):
    """Lightweight serializer for POS quick lookup."""
    category_name = serializers.SerializerMethodField()
    current_stock = serializers.ReadOnlyField()

    class Meta:
        model = Product
        fields = [
            'id', 'name', 'barcode', 'selling_price', 'tax_rate',
            'unit', 'is_weighable', 'allow_discount', 'category_name',
            'current_stock', 'image',
        ]

    def get_category_name(self, obj):
        return obj.category.name if obj.category else None


class ProductBarcodeSerializer(serializers.ModelSerializer):
    """Used for barcode scanner lookup."""
    class Meta:
        model = Product
        fields = ['id', 'name', 'barcode', 'selling_price', 'tax_rate', 'unit', 'is_weighable', 'current_stock']


# ─── Inventory Serializer ─────────────────────────────────────────────────────

class InventorySerializer(serializers.ModelSerializer):
    product_name = serializers.SerializerMethodField()
    branch_name = serializers.SerializerMethodField()

    class Meta:
        model = Inventory
        fields = ['id', 'product', 'product_name', 'branch', 'branch_name', 'quantity', 'updated_at']

    def get_product_name(self, obj):
        return obj.product.name

    def get_branch_name(self, obj):
        return obj.branch.name


# ─── Customer Serializers ─────────────────────────────────────────────────────

class CustomerSerializer(serializers.ModelSerializer):
    full_name = serializers.ReadOnlyField()
    total_sales = serializers.SerializerMethodField()

    class Meta:
        model = Customer
        fields = [
            'id', 'first_name', 'last_name', 'full_name', 'phone', 'email',
            'loyalty_points', 'loyalty_card_number', 'date_of_birth',
            'is_active', 'created_at', 'total_spent', 'total_sales',
        ]
        read_only_fields = ['id', 'created_at', 'loyalty_points', 'total_spent']

    def get_total_sales(self, obj):
        return obj.sales.filter(status=Sale.COMPLETED).count()

    def validate_phone(self, value):
        # Normalize Kenyan phone number
        value = value.replace(' ', '').replace('-', '')
        if value.startswith('0'):
            value = '254' + value[1:]
        elif value.startswith('+'):
            value = value[1:]
        if not value.startswith('254') or len(value) != 12:
            raise serializers.ValidationError('Enter a valid Kenyan phone number (e.g., 0712345678)')
        return value


class CustomerMinSerializer(serializers.ModelSerializer):
    full_name = serializers.ReadOnlyField()

    class Meta:
        model = Customer
        fields = ['id', 'full_name', 'phone', 'loyalty_points', 'loyalty_card_number']


# ─── Sale Item Serializers ────────────────────────────────────────────────────

class SaleItemSerializer(serializers.ModelSerializer):
    product_name = serializers.SerializerMethodField()
    product_barcode = serializers.SerializerMethodField()

    class Meta:
        model = SaleItem
        fields = [
            'id', 'product', 'product_name', 'product_barcode',
            'quantity', 'unit_price', 'tax_rate', 'tax_amount',
            'discount_amount', 'line_total',
        ]
        read_only_fields = ['id', 'tax_amount', 'line_total']

    def get_product_name(self, obj):
        return obj.product.name

    def get_product_barcode(self, obj):
        return obj.product.barcode


class SaleItemCreateSerializer(serializers.Serializer):
    product_id = serializers.UUIDField()
    quantity = serializers.DecimalField(max_digits=10, decimal_places=3)
    discount_amount = serializers.DecimalField(max_digits=10, decimal_places=2, default=0)

    def validate_product_id(self, value):
        try:
            product = Product.objects.get(id=value, is_active=True)
            return value
        except Product.DoesNotExist:
            raise serializers.ValidationError('Product not found or inactive.')


# ─── Sale Serializers ─────────────────────────────────────────────────────────

class SaleSerializer(serializers.ModelSerializer):
    items = SaleItemSerializer(many=True, read_only=True)
    cashier_name = serializers.SerializerMethodField()
    customer_name = serializers.SerializerMethodField()
    customer_phone = serializers.SerializerMethodField()

    class Meta:
        model = Sale
        fields = [
            'id', 'receipt_number', 'branch', 'cashier', 'cashier_name',
            'customer', 'customer_name', 'customer_phone',
            'status', 'payment_method',
            'subtotal', 'tax_total', 'discount_amount', 'discount_percent',
            'points_redeemed', 'points_redeemed_value', 'total_amount',
            'amount_paid', 'change_given', 'points_earned',
            'mpesa_reference', 'mpesa_phone',
            'void_reason', 'supervisor_override',
            'notes', 'created_at', 'completed_at', 'items',
        ]
        read_only_fields = ['id', 'receipt_number', 'created_at', 'completed_at']

    def get_cashier_name(self, obj):
        return obj.cashier.full_name

    def get_customer_name(self, obj):
        return obj.customer.full_name if obj.customer else None

    def get_customer_phone(self, obj):
        return obj.customer.phone if obj.customer else None


class CreateSaleSerializer(serializers.Serializer):
    """Full sale creation payload."""
    customer_id = serializers.UUIDField(required=False, allow_null=True)
    customer_phone = serializers.CharField(required=False, allow_blank=True)
    payment_method = serializers.ChoiceField(choices=Sale.PAYMENT_CHOICES)
    items = SaleItemCreateSerializer(many=True)
    discount_amount = serializers.DecimalField(max_digits=10, decimal_places=2, default=0)
    discount_percent = serializers.DecimalField(max_digits=5, decimal_places=2, default=0)
    points_to_redeem = serializers.IntegerField(default=0, min_value=0)
    amount_paid = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    mpesa_phone = serializers.CharField(required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)
    supervisor_pin = serializers.CharField(required=False, allow_blank=True)

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError('Sale must have at least one item.')
        return value

    def validate(self, data):
        pm = data.get('payment_method')
        if pm == Sale.MPESA and not data.get('mpesa_phone'):
            raise serializers.ValidationError({'mpesa_phone': 'Phone number required for M-Pesa payment.'})
        return data


class VoidSaleSerializer(serializers.Serializer):
    void_reason = serializers.CharField(min_length=10)
    supervisor_pin = serializers.CharField()


# ─── MPesa Serializers ────────────────────────────────────────────────────────

class MpesaSTKPushSerializer(serializers.Serializer):
    phone_number = serializers.CharField(max_length=15)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    sale_id = serializers.UUIDField()

    def validate_phone_number(self, value):
        value = value.replace(' ', '').replace('-', '')
        if value.startswith('0'):
            value = '254' + value[1:]
        elif value.startswith('+'):
            value = value[1:]
        if not value.startswith('254') or len(value) != 12:
            raise serializers.ValidationError('Enter a valid Safaricom number.')
        return value


class MpesaCallbackSerializer(serializers.Serializer):
    """Safaricom callback payload parser."""
    Body = serializers.DictField()


class MpesaTransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = MpesaTransaction
        fields = '__all__'


# ─── Loyalty Serializers ──────────────────────────────────────────────────────

class LoyaltyTransactionSerializer(serializers.ModelSerializer):
    customer_name = serializers.SerializerMethodField()

    class Meta:
        model = LoyaltyTransaction
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'balance_after']

    def get_customer_name(self, obj):
        return obj.customer.full_name


class RedeemPointsSerializer(serializers.Serializer):
    customer_id = serializers.UUIDField()
    points_to_redeem = serializers.IntegerField(min_value=1)


# ─── Audit Log Serializer ─────────────────────────────────────────────────────

class AuditLogSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = ['id', 'user', 'user_name', 'action', 'model_name', 'object_id', 'changes', 'ip_address', 'timestamp']
        read_only_fields = fields

    def get_user_name(self, obj):
        return obj.user.full_name if obj.user else 'System'


# ─── Cash Drawer Serializers ──────────────────────────────────────────────────

class CashDrawerSerializer(serializers.ModelSerializer):
    cashier_name = serializers.SerializerMethodField()
    branch_name = serializers.SerializerMethodField()

    class Meta:
        model = CashDrawer
        fields = '__all__'
        read_only_fields = ['id', 'opened_at', 'variance']

    def get_cashier_name(self, obj):
        return obj.cashier.full_name

    def get_branch_name(self, obj):
        return obj.branch.name


class OpenDrawerSerializer(serializers.Serializer):
    opening_float = serializers.DecimalField(max_digits=10, decimal_places=2)


class CloseDrawerSerializer(serializers.Serializer):
    closing_amount = serializers.DecimalField(max_digits=10, decimal_places=2)
    notes = serializers.CharField(required=False, allow_blank=True)


# ─── Discount Serializers ─────────────────────────────────────────────────────

class DiscountSerializer(serializers.ModelSerializer):
    class Meta:
        model = Discount
        fields = '__all__'


# ─── Dashboard / Reports ──────────────────────────────────────────────────────

class DashboardSummarySerializer(serializers.Serializer):
    today_sales = serializers.DecimalField(max_digits=12, decimal_places=2)
    today_transactions = serializers.IntegerField()
    today_items_sold = serializers.IntegerField()
    week_sales = serializers.DecimalField(max_digits=12, decimal_places=2)
    month_sales = serializers.DecimalField(max_digits=12, decimal_places=2)
    active_customers = serializers.IntegerField()
    low_stock_count = serializers.IntegerField()
    top_products = serializers.ListField()
    payment_breakdown = serializers.DictField()
    hourly_sales = serializers.ListField()