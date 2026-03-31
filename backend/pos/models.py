import uuid
from django.db import models
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin, BaseUserManager
from django.utils import timezone
from django.core.validators import MinValueValidator, MaxValueValidator


# ─── Custom User Manager ──────────────────────────────────────────────────────
class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('Email is required')
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('role', User.ADMIN)
        return self.create_user(email, password, **extra_fields)


# ─── User ─────────────────────────────────────────────────────────────────────
class User(AbstractBaseUser, PermissionsMixin):
    ADMIN = 'admin'
    MANAGER = 'manager'
    CASHIER = 'cashier'
    SUPERVISOR = 'supervisor'

    ROLE_CHOICES = [
        (ADMIN, 'Administrator'),
        (MANAGER, 'Manager'),
        (CASHIER, 'Cashier'),
        (SUPERVISOR, 'Supervisor'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default=CASHIER)
    employee_id = models.CharField(max_length=20, unique=True, blank=True, null=True)
    phone = models.CharField(max_length=15, blank=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    branch = models.ForeignKey('Branch', on_delete=models.SET_NULL, null=True, blank=True, related_name='staff')
    created_at = models.DateTimeField(auto_now_add=True)
    last_login_ip = models.GenericIPAddressField(null=True, blank=True)
    failed_login_attempts = models.IntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)
    pin = models.CharField(max_length=128, blank=True)  # Hashed 4-digit PIN for quick re-auth at counter

    objects = UserManager()
    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['first_name', 'last_name']

    class Meta:
        db_table = 'pos_users'
        ordering = ['first_name', 'last_name']

    def __str__(self):
        return f"{self.first_name} {self.last_name} ({self.role})"

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}"

    @property
    def is_locked(self):
        if self.locked_until and timezone.now() < self.locked_until:
            return True
        return False

    def has_pos_permission(self, perm):
        """Fine-grained POS permission check."""
        permissions = {
            'admin': ['all'],
            'manager': ['view_reports', 'manage_products', 'approve_discount', 'void_sale', 'manage_customers'],
            'supervisor': ['approve_discount', 'void_sale', 'view_reports'],
            'cashier': ['create_sale', 'view_own_sales'],
        }
        role_perms = permissions.get(self.role, [])
        return 'all' in role_perms or perm in role_perms


# ─── Branch ───────────────────────────────────────────────────────────────────
class Branch(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    code = models.CharField(max_length=10, unique=True)
    address = models.TextField()
    phone = models.CharField(max_length=15)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'pos_branches'
        verbose_name_plural = 'Branches'

    def __str__(self):
        return self.name


# ─── Category ─────────────────────────────────────────────────────────────────
class Category(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100)
    slug = models.SlugField(unique=True)
    parent = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='children')
    icon = models.CharField(max_length=50, blank=True)  # Bootstrap icon name
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'pos_categories'
        verbose_name_plural = 'Categories'

    def __str__(self):
        return self.name


# ─── Supplier ─────────────────────────────────────────────────────────────────
class Supplier(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    contact_person = models.CharField(max_length=100, blank=True)
    phone = models.CharField(max_length=15)
    email = models.EmailField(blank=True)
    address = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'pos_suppliers'

    def __str__(self):
        return self.name


# ─── Product ──────────────────────────────────────────────────────────────────
class Product(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    barcode = models.CharField(max_length=50, unique=True, blank=True, null=True, db_index=True)
    sku = models.CharField(max_length=50, unique=True, blank=True, null=True)
    category = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, related_name='products')
    supplier = models.ForeignKey(Supplier, on_delete=models.SET_NULL, null=True, blank=True)
    description = models.TextField(blank=True)
    image = models.ImageField(upload_to='products/', blank=True, null=True)
    cost_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    selling_price = models.DecimalField(max_digits=10, decimal_places=2)
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=16.00)  # Kenya VAT 16%
    unit = models.CharField(max_length=20, default='piece')  # piece, kg, litre
    min_stock_level = models.IntegerField(default=10)
    is_active = models.BooleanField(default=True)
    is_weighable = models.BooleanField(default=False)  # For items sold by weight
    allow_discount = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'pos_products'
        ordering = ['name']

    def __str__(self):
        return self.name

    @property
    def current_stock(self):
        inv = self.inventories.filter(branch__isnull=False).first()
        return inv.quantity if inv else 0

    @property
    def tax_amount(self):
        return (self.selling_price * self.tax_rate) / (100 + self.tax_rate)

    @property
    def price_before_tax(self):
        return self.selling_price - self.tax_amount


# ─── Inventory ────────────────────────────────────────────────────────────────
class Inventory(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='inventories')
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name='inventories')
    quantity = models.DecimalField(max_digits=10, decimal_places=3, default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'pos_inventory'
        unique_together = ('product', 'branch')

    def __str__(self):
        return f"{self.product.name} @ {self.branch.name}: {self.quantity}"


# ─── Customer ─────────────────────────────────────────────────────────────────
class Customer(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100, blank=True)
    phone = models.CharField(max_length=15, unique=True, db_index=True)
    email = models.EmailField(blank=True)
    loyalty_points = models.IntegerField(default=0)
    loyalty_card_number = models.CharField(max_length=20, unique=True, blank=True, null=True)
    date_of_birth = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    total_spent = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        db_table = 'pos_customers'
        ordering = ['first_name', 'last_name']

    def __str__(self):
        return f"{self.first_name} {self.last_name} ({self.phone})"

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}".strip()


# ─── Sale ─────────────────────────────────────────────────────────────────────
class Sale(models.Model):
    PENDING = 'pending'
    COMPLETED = 'completed'
    VOIDED = 'voided'
    REFUNDED = 'refunded'

    STATUS_CHOICES = [
        (PENDING, 'Pending'),
        (COMPLETED, 'Completed'),
        (VOIDED, 'Voided'),
        (REFUNDED, 'Refunded'),
    ]

    CASH = 'cash'
    MPESA = 'mpesa'
    CARD = 'card'
    POINTS = 'points'
    MIXED = 'mixed'

    PAYMENT_CHOICES = [
        (CASH, 'Cash'),
        (MPESA, 'M-Pesa'),
        (CARD, 'Card'),
        (POINTS, 'Loyalty Points'),
        (MIXED, 'Mixed Payment'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    receipt_number = models.CharField(max_length=20, unique=True, db_index=True)
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name='sales')
    cashier = models.ForeignKey(User, on_delete=models.CASCADE, related_name='sales')
    customer = models.ForeignKey(Customer, on_delete=models.SET_NULL, null=True, blank=True, related_name='sales')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=PENDING)
    payment_method = models.CharField(max_length=20, choices=PAYMENT_CHOICES, default=CASH)

    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tax_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    points_redeemed = models.IntegerField(default=0)
    points_redeemed_value = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    amount_paid = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    change_given = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    points_earned = models.IntegerField(default=0)

    mpesa_reference = models.CharField(max_length=50, blank=True)
    mpesa_phone = models.CharField(max_length=15, blank=True)
    void_reason = models.TextField(blank=True)
    voided_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='voided_sales')
    void_approved_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='approved_voids')

    supervisor_override = models.BooleanField(default=False)
    supervisor = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='supervised_sales')

    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'pos_sales'
        ordering = ['-created_at']

    def __str__(self):
        return f"Receipt #{self.receipt_number}"

    def save(self, *args, **kwargs):
        if not self.receipt_number:
            self.receipt_number = self._generate_receipt()
        super().save(*args, **kwargs)

    def _generate_receipt(self):
        import random
        from django.utils import timezone
        ts = timezone.now().strftime('%y%m%d')
        rand = random.randint(1000, 9999)
        return f"RCP{ts}{rand}"


# ─── Sale Item ────────────────────────────────────────────────────────────────
class SaleItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    quantity = models.DecimalField(max_digits=10, decimal_places=3)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    discount_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    line_total = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        db_table = 'pos_sale_items'

    def __str__(self):
        return f"{self.product.name} x{self.quantity}"

    def save(self, *args, **kwargs):
        self.line_total = (self.unit_price * self.quantity) - self.discount_amount
        self.tax_amount = (self.line_total * self.tax_rate) / (100 + self.tax_rate)
        super().save(*args, **kwargs)


# ─── MPesa Transaction ────────────────────────────────────────────────────────
class MpesaTransaction(models.Model):
    INITIATED = 'initiated'
    PENDING = 'pending'
    COMPLETED = 'completed'
    FAILED = 'failed'
    CANCELLED = 'cancelled'
    BYPASSED = 'bypassed'

    STATUS_CHOICES = [
        (INITIATED, 'Initiated'),
        (PENDING, 'Pending'),
        (COMPLETED, 'Completed'),
        (FAILED, 'Failed'),
        (CANCELLED, 'Cancelled'),
        (BYPASSED, 'Bypassed (Debug)'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name='mpesa_transactions', null=True, blank=True)
    phone_number = models.CharField(max_length=15)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    checkout_request_id = models.CharField(max_length=100, blank=True)
    merchant_request_id = models.CharField(max_length=100, blank=True)
    mpesa_receipt_number = models.CharField(max_length=50, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=INITIATED)
    result_code = models.IntegerField(null=True, blank=True)
    result_description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'pos_mpesa_transactions'
        ordering = ['-created_at']

    def __str__(self):
        return f"MPesa {self.phone_number} - {self.amount} ({self.status})"


# ─── Loyalty Points Transaction ───────────────────────────────────────────────
class LoyaltyTransaction(models.Model):
    EARN = 'earn'
    REDEEM = 'redeem'
    ADJUST = 'adjust'
    EXPIRE = 'expire'

    TYPE_CHOICES = [
        (EARN, 'Earned'),
        (REDEEM, 'Redeemed'),
        (ADJUST, 'Adjusted'),
        (EXPIRE, 'Expired'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name='point_transactions')
    sale = models.ForeignKey(Sale, on_delete=models.SET_NULL, null=True, blank=True)
    transaction_type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    points = models.IntegerField()  # Positive=earned, Negative=redeemed/expired
    balance_after = models.IntegerField()
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'pos_loyalty_transactions'
        ordering = ['-created_at']


# ─── Audit Log ────────────────────────────────────────────────────────────────
class AuditLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='audit_logs')
    action = models.CharField(max_length=200)
    model_name = models.CharField(max_length=100, blank=True)
    object_id = models.CharField(max_length=100, blank=True)
    changes = models.JSONField(default=dict)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'pos_audit_logs'
        ordering = ['-timestamp']

    def __str__(self):
        return f"{self.user} - {self.action} @ {self.timestamp}"


# ─── Cash Drawer ──────────────────────────────────────────────────────────────
class CashDrawer(models.Model):
    OPEN = 'open'
    CLOSED = 'closed'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name='cash_drawers')
    cashier = models.ForeignKey(User, on_delete=models.CASCADE, related_name='cash_drawers')
    status = models.CharField(max_length=10, choices=[(OPEN, 'Open'), (CLOSED, 'Closed')], default=OPEN)
    opening_float = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    closing_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    expected_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    variance = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    opened_at = models.DateTimeField(auto_now_add=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        db_table = 'pos_cash_drawers'
        ordering = ['-opened_at']

    def __str__(self):
        return f"{self.cashier.full_name} drawer - {self.opened_at.date()}"


# ─── Discount / Promotion ─────────────────────────────────────────────────────
class Discount(models.Model):
    PERCENTAGE = 'percentage'
    FIXED = 'fixed'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100)
    discount_type = models.CharField(max_length=20, choices=[(PERCENTAGE, 'Percentage'), (FIXED, 'Fixed Amount')], default=PERCENTAGE)
    value = models.DecimalField(max_digits=10, decimal_places=2)
    min_purchase = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    products = models.ManyToManyField(Product, blank=True)
    categories = models.ManyToManyField(Category, blank=True)
    requires_approval = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    valid_from = models.DateTimeField(null=True, blank=True)
    valid_until = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'pos_discounts'

    def __str__(self):
        return self.name