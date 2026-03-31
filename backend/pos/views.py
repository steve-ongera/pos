import logging
import requests
import base64
from datetime import datetime, timedelta
from decimal import Decimal
from django.db import models

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Sum, Count, Q
from django.utils import timezone
from django.http import JsonResponse

from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken, BlacklistedToken

from .models import (
    Branch, Category, Supplier, Product, Inventory,
    Customer, Sale, SaleItem, MpesaTransaction,
    LoyaltyTransaction, AuditLog, CashDrawer, Discount
)
from .serializers import (
    LoginSerializer, UserSerializer, UserCreateSerializer, ChangePasswordSerializer,
    BranchSerializer, CategorySerializer, SupplierSerializer,
    ProductSerializer, ProductMinSerializer, ProductBarcodeSerializer,
    InventorySerializer, CustomerSerializer, CustomerMinSerializer,
    SaleSerializer, CreateSaleSerializer, VoidSaleSerializer,
    MpesaSTKPushSerializer, MpesaTransactionSerializer,
    LoyaltyTransactionSerializer, RedeemPointsSerializer,
    AuditLogSerializer, CashDrawerSerializer, OpenDrawerSerializer, CloseDrawerSerializer,
    DiscountSerializer, DashboardSummarySerializer,
)
from .permissions import IsCashierOrAbove, IsManagerOrAbove, IsAdminOnly, IsSupervisorOrAbove

User = get_user_model()
logger = logging.getLogger('pos')


# ─── Helper: get client IP ────────────────────────────────────────────────────
def get_client_ip(request):
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        return x_forwarded_for.split(',')[0]
    return request.META.get('REMOTE_ADDR')


def log_action(user, action, model_name='', object_id='', changes=None, request=None):
    AuditLog.objects.create(
        user=user,
        action=action,
        model_name=model_name,
        object_id=str(object_id),
        changes=changes or {},
        ip_address=get_client_ip(request) if request else None,
        user_agent=request.META.get('HTTP_USER_AGENT', '') if request else '',
    )


# ─── Auth Views ───────────────────────────────────────────────────────────────

class LoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email']
        password = serializer.validated_data['password']

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return Response({'error': 'Invalid credentials.'}, status=status.HTTP_401_UNAUTHORIZED)

        if user.is_locked:
            return Response({'error': 'Account locked. Try again later.'}, status=status.HTTP_403_FORBIDDEN)

        if not user.check_password(password):
            user.failed_login_attempts += 1
            if user.failed_login_attempts >= 5:
                user.locked_until = timezone.now() + timedelta(minutes=15)
                logger.warning(f"Account locked for {email} after {user.failed_login_attempts} failed attempts")
            user.save()
            return Response({'error': 'Invalid credentials.'}, status=status.HTTP_401_UNAUTHORIZED)

        if not user.is_active:
            return Response({'error': 'Account deactivated. Contact administrator.'}, status=status.HTTP_403_FORBIDDEN)

        # Reset failed attempts
        user.failed_login_attempts = 0
        user.locked_until = None
        user.last_login_ip = get_client_ip(request)
        user.save()

        refresh = RefreshToken.for_user(user)
        refresh['role'] = user.role
        refresh['name'] = user.full_name

        log_action(user, 'LOGIN', request=request)

        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'user': UserSerializer(user).data,
        })


class LogoutView(APIView):
    def post(self, request):
        try:
            refresh_token = request.data.get('refresh')
            if refresh_token:
                token = RefreshToken(refresh_token)
                token.blacklist()
            log_action(request.user, 'LOGOUT', request=request)
            return Response({'message': 'Logged out successfully.'})
        except Exception:
            return Response({'message': 'Logged out.'})


class CurrentUserView(APIView):
    def get(self, request):
        return Response(UserSerializer(request.user).data)


class ChangePasswordView(APIView):
    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user
        if not user.check_password(serializer.validated_data['old_password']):
            return Response({'error': 'Current password is incorrect.'}, status=status.HTTP_400_BAD_REQUEST)
        user.set_password(serializer.validated_data['new_password'])
        user.save()
        log_action(user, 'PASSWORD_CHANGE', request=request)
        return Response({'message': 'Password changed successfully.'})


class VerifyPinView(APIView):
    """Quick counter PIN re-authentication."""
    def post(self, request):
        pin = request.data.get('pin', '')
        if not pin or len(pin) != 4:
            return Response({'error': 'Invalid PIN format.'}, status=status.HTTP_400_BAD_REQUEST)
        if request.user.check_password(pin):
            return Response({'verified': True})
        return Response({'verified': False, 'error': 'Incorrect PIN.'}, status=status.HTTP_401_UNAUTHORIZED)


class SupervisorVerifyView(APIView):
    """Cashier requests supervisor override."""
    def post(self, request):
        supervisor_id = request.data.get('supervisor_id')
        pin = request.data.get('pin')
        try:
            supervisor = User.objects.get(id=supervisor_id, role__in=[User.SUPERVISOR, User.MANAGER, User.ADMIN], is_active=True)
        except User.DoesNotExist:
            return Response({'error': 'Supervisor not found.'}, status=status.HTTP_404_NOT_FOUND)
        if supervisor.check_password(pin):
            log_action(request.user, f'SUPERVISOR_OVERRIDE by {supervisor.full_name}', request=request)
            return Response({'verified': True, 'supervisor_name': supervisor.full_name})
        return Response({'verified': False, 'error': 'Invalid PIN.'}, status=status.HTTP_401_UNAUTHORIZED)


# ─── User ViewSet ─────────────────────────────────────────────────────────────

class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all().select_related('branch')
    permission_classes = [IsManagerOrAbove]

    def get_serializer_class(self):
        if self.action == 'create':
            return UserCreateSerializer
        return UserSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        role = self.request.query_params.get('role')
        if role:
            qs = qs.filter(role=role)
        return qs

    def perform_create(self, serializer):
        user = serializer.save()
        log_action(self.request.user, f'CREATE_USER {user.email}', 'User', user.id, request=self.request)

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save()
        log_action(self.request.user, f'DEACTIVATE_USER {instance.email}', 'User', instance.id, request=self.request)

    @action(detail=False, methods=['get'], url_path='supervisors')
    def supervisors(self, request):
        supervisors = User.objects.filter(role__in=[User.SUPERVISOR, User.MANAGER, User.ADMIN], is_active=True)
        return Response(UserSerializer(supervisors, many=True).data)


# ─── Branch ViewSet ───────────────────────────────────────────────────────────

class BranchViewSet(viewsets.ModelViewSet):
    queryset = Branch.objects.all()
    serializer_class = BranchSerializer
    permission_classes = [IsManagerOrAbove]


# ─── Category ViewSet ─────────────────────────────────────────────────────────

class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.filter(is_active=True).prefetch_related('children')
    serializer_class = CategorySerializer
    permission_classes = [IsCashierOrAbove]

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsManagerOrAbove()]
        return super().get_permissions()


# ─── Supplier ViewSet ─────────────────────────────────────────────────────────

class SupplierViewSet(viewsets.ModelViewSet):
    queryset = Supplier.objects.filter(is_active=True)
    serializer_class = SupplierSerializer
    permission_classes = [IsManagerOrAbove]
    search_fields = ['name', 'phone', 'email']


# ─── Product ViewSet ──────────────────────────────────────────────────────────

class ProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.filter(is_active=True).select_related('category', 'supplier').prefetch_related('inventories')
    permission_classes = [IsCashierOrAbove]
    search_fields = ['name', 'barcode', 'sku']
    filterset_fields = ['category', 'is_active', 'is_weighable']
    ordering_fields = ['name', 'selling_price', 'created_at']

    def get_serializer_class(self):
        if self.action == 'list' and self.request.query_params.get('minimal'):
            return ProductMinSerializer
        return ProductSerializer

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsManagerOrAbove()]
        return super().get_permissions()

    def perform_create(self, serializer):
        product = serializer.save()
        log_action(self.request.user, f'CREATE_PRODUCT {product.name}', 'Product', product.id, request=self.request)

    def perform_update(self, serializer):
        product = serializer.save()
        log_action(self.request.user, f'UPDATE_PRODUCT {product.name}', 'Product', product.id, request=self.request)

    @action(detail=False, methods=['get'], url_path='pos-list')
    def pos_list(self, request):
        """Optimized product list for POS screen."""
        products = Product.objects.filter(is_active=True).select_related('category')
        category = request.query_params.get('category')
        if category:
            products = products.filter(category__slug=category)
        search = request.query_params.get('search')
        if search:
            products = products.filter(Q(name__icontains=search) | Q(barcode__icontains=search))
        return Response(ProductMinSerializer(products[:100], many=True).data)


class ProductBarcodeView(APIView):
    """Barcode scanner endpoint - future hardware integration."""
    permission_classes = [IsCashierOrAbove]

    def get(self, request, barcode):
        try:
            product = Product.objects.get(barcode=barcode, is_active=True)
            return Response(ProductBarcodeSerializer(product).data)
        except Product.DoesNotExist:
            return Response({'error': f'No product found with barcode: {barcode}'}, status=status.HTTP_404_NOT_FOUND)


# ─── Inventory ViewSet ────────────────────────────────────────────────────────

class InventoryViewSet(viewsets.ModelViewSet):
    queryset = Inventory.objects.all().select_related('product', 'branch')
    serializer_class = InventorySerializer
    permission_classes = [IsManagerOrAbove]
    filterset_fields = ['branch', 'product']


# ─── Customer ViewSet ─────────────────────────────────────────────────────────

class CustomerViewSet(viewsets.ModelViewSet):
    queryset = Customer.objects.filter(is_active=True)
    serializer_class = CustomerSerializer
    permission_classes = [IsCashierOrAbove]
    search_fields = ['first_name', 'last_name', 'phone', 'loyalty_card_number']

    def get_permissions(self):
        if self.action in ['destroy']:
            return [IsManagerOrAbove()]
        return super().get_permissions()

    @action(detail=False, methods=['get'], url_path='lookup')
    def lookup(self, request):
        phone = request.query_params.get('phone', '')
        card = request.query_params.get('card', '')
        if phone:
            customers = Customer.objects.filter(phone__icontains=phone, is_active=True)
        elif card:
            customers = Customer.objects.filter(loyalty_card_number=card, is_active=True)
        else:
            return Response({'error': 'Provide phone or card number.'}, status=400)
        return Response(CustomerMinSerializer(customers[:5], many=True).data)

    @action(detail=True, methods=['get'])
    def loyalty_history(self, request, pk=None):
        customer = self.get_object()
        transactions = LoyaltyTransaction.objects.filter(customer=customer)[:50]
        return Response(LoyaltyTransactionSerializer(transactions, many=True).data)


# ─── Sale ViewSet ─────────────────────────────────────────────────────────────

class SaleViewSet(viewsets.ModelViewSet):
    queryset = Sale.objects.all().select_related('cashier', 'customer', 'branch').prefetch_related('items__product')
    serializer_class = SaleSerializer
    permission_classes = [IsCashierOrAbove]
    filterset_fields = ['status', 'payment_method', 'cashier', 'branch']
    search_fields = ['receipt_number', 'customer__phone', 'mpesa_reference']
    ordering_fields = ['created_at', 'total_amount']
    http_method_names = ['get', 'post', 'head', 'options']  # No PUT/PATCH/DELETE on sales

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.role == User.CASHIER:
            # Cashiers can only see their own sales
            qs = qs.filter(cashier=user)
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        if date_from:
            qs = qs.filter(created_at__date__gte=date_from)
        if date_to:
            qs = qs.filter(created_at__date__lte=date_to)
        return qs

    @transaction.atomic
    def create(self, request):
        serializer = CreateSaleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Check cashier has open drawer
        open_drawer = CashDrawer.objects.filter(cashier=request.user, status=CashDrawer.OPEN).first()
        if not open_drawer and data['payment_method'] == Sale.CASH:
            return Response({'error': 'No open cash drawer. Please open your drawer first.'}, status=400)

        # Resolve customer
        customer = None
        if data.get('customer_id'):
            try:
                customer = Customer.objects.get(id=data['customer_id'], is_active=True)
            except Customer.DoesNotExist:
                return Response({'error': 'Customer not found.'}, status=400)
        elif data.get('customer_phone'):
            customer = Customer.objects.filter(phone=data['customer_phone']).first()

        # Validate points redemption
        points_to_redeem = data.get('points_to_redeem', 0)
        points_value = Decimal('0')
        if points_to_redeem > 0:
            if not customer:
                return Response({'error': 'Customer required to redeem points.'}, status=400)
            if customer.loyalty_points < points_to_redeem:
                return Response({'error': f'Insufficient points. Customer has {customer.loyalty_points} points.'}, status=400)
            if points_to_redeem < settings.MIN_REDEMPTION_POINTS:
                return Response({'error': f'Minimum redemption is {settings.MIN_REDEMPTION_POINTS} points.'}, status=400)
            points_value = Decimal(str(points_to_redeem * settings.POINTS_REDEMPTION_RATE))

        # Build sale
        branch = request.user.branch
        if not branch:
            return Response({'error': 'User not assigned to a branch.'}, status=400)

        sale = Sale.objects.create(
            branch=branch,
            cashier=request.user,
            customer=customer,
            payment_method=data['payment_method'],
            discount_amount=data.get('discount_amount', 0),
            discount_percent=data.get('discount_percent', 0),
            points_redeemed=points_to_redeem,
            points_redeemed_value=points_value,
            mpesa_phone=data.get('mpesa_phone', ''),
            notes=data.get('notes', ''),
        )

        # Process items
        subtotal = Decimal('0')
        tax_total = Decimal('0')
        for item_data in data['items']:
            product = Product.objects.select_for_update().get(id=item_data['product_id'])
            # Deduct inventory
            inv, _ = Inventory.objects.get_or_create(product=product, branch=branch)
            if inv.quantity < item_data['quantity'] and not product.is_weighable:
                sale.delete()
                return Response({'error': f'Insufficient stock for {product.name}. Available: {inv.quantity}'}, status=400)

            line_price = product.selling_price * item_data['quantity']
            tax_amount = (line_price * product.tax_rate) / (100 + product.tax_rate)

            sale_item = SaleItem.objects.create(
                sale=sale,
                product=product,
                quantity=item_data['quantity'],
                unit_price=product.selling_price,
                tax_rate=product.tax_rate,
                tax_amount=tax_amount,
                discount_amount=item_data.get('discount_amount', 0),
                line_total=line_price - item_data.get('discount_amount', 0),
            )
            subtotal += sale_item.line_total
            tax_total += tax_amount

            # Update inventory
            inv.quantity -= item_data['quantity']
            inv.save()

        # Calculate totals
        total = subtotal - data.get('discount_amount', 0) - points_value
        points_earned = int(float(total) * settings.POINTS_PER_KES) if customer else 0

        sale.subtotal = subtotal
        sale.tax_total = tax_total
        sale.total_amount = max(total, Decimal('0'))
        sale.points_earned = points_earned
        sale.amount_paid = data.get('amount_paid', sale.total_amount)
        sale.change_given = max(sale.amount_paid - sale.total_amount, Decimal('0'))

        if data['payment_method'] != Sale.MPESA:
            sale.status = Sale.COMPLETED
            sale.completed_at = timezone.now()
        else:
            sale.status = Sale.PENDING

        sale.save()

        # Update loyalty points
        if customer and sale.status == Sale.COMPLETED:
            customer.loyalty_points += points_earned - points_to_redeem
            customer.total_spent += sale.total_amount
            customer.save()

            if points_earned > 0:
                LoyaltyTransaction.objects.create(
                    customer=customer, sale=sale, transaction_type=LoyaltyTransaction.EARN,
                    points=points_earned, balance_after=customer.loyalty_points, created_by=request.user
                )
            if points_to_redeem > 0:
                LoyaltyTransaction.objects.create(
                    customer=customer, sale=sale, transaction_type=LoyaltyTransaction.REDEEM,
                    points=-points_to_redeem, balance_after=customer.loyalty_points, created_by=request.user
                )

        log_action(request.user, f'CREATE_SALE {sale.receipt_number}', 'Sale', sale.id, request=request)
        return Response(SaleSerializer(sale).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def void(self, request, pk=None):
        sale = self.get_object()
        if sale.status != Sale.COMPLETED:
            return Response({'error': 'Only completed sales can be voided.'}, status=400)
        if sale.cashier != request.user and not request.user.has_pos_permission('void_sale'):
            return Response({'error': 'Permission denied.'}, status=403)

        serializer = VoidSaleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Verify supervisor PIN for cashier void
        if request.user.role == User.CASHIER:
            supervisor_pin = serializer.validated_data.get('supervisor_pin')
            if not supervisor_pin:
                return Response({'error': 'Supervisor PIN required to void sale.'}, status=403)

        sale.status = Sale.VOIDED
        sale.void_reason = serializer.validated_data['void_reason']
        sale.voided_by = request.user
        sale.save()

        # Restore inventory
        for item in sale.items.all():
            inv = Inventory.objects.filter(product=item.product, branch=sale.branch).first()
            if inv:
                inv.quantity += item.quantity
                inv.save()

        # Reverse loyalty points
        if sale.customer and sale.points_earned > 0:
            sale.customer.loyalty_points -= sale.points_earned
            sale.customer.total_spent -= sale.total_amount
            sale.customer.save()

        log_action(request.user, f'VOID_SALE {sale.receipt_number}: {sale.void_reason}', 'Sale', sale.id, request=request)
        return Response({'message': 'Sale voided successfully.', 'sale': SaleSerializer(sale).data})

    @action(detail=True, methods=['post'], url_path='complete-mpesa')
    def complete_mpesa(self, request, pk=None):
        """Mark an MPESA sale as complete after callback."""
        sale = self.get_object()
        if sale.status != Sale.PENDING:
            return Response({'error': 'Sale is not pending.'}, status=400)
        mpesa_ref = request.data.get('mpesa_reference', '')
        sale.status = Sale.COMPLETED
        sale.completed_at = timezone.now()
        sale.mpesa_reference = mpesa_ref
        sale.save()
        # Update loyalty
        if sale.customer and sale.points_earned > 0:
            sale.customer.loyalty_points += sale.points_earned
            sale.customer.total_spent += sale.total_amount
            sale.customer.save()
        return Response(SaleSerializer(sale).data)


# ─── M-Pesa Views ─────────────────────────────────────────────────────────────

class MpesaSTKPushView(APIView):
    permission_classes = [IsCashierOrAbove]

    def post(self, request):
        serializer = MpesaSTKPushSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            sale = Sale.objects.get(id=data['sale_id'])
        except Sale.DoesNotExist:
            return Response({'error': 'Sale not found.'}, status=404)

        # ── DEBUG BYPASS ──────────────────────────────────────────────────────
        if settings.MPESA_STK_PUSH_BYPASS:
            logger.info(f"[DEBUG] M-Pesa STK Push bypassed for {data['phone_number']} KES {data['amount']}")
            txn = MpesaTransaction.objects.create(
                sale=sale,
                phone_number=data['phone_number'],
                amount=data['amount'],
                checkout_request_id='DEBUG-' + sale.receipt_number,
                merchant_request_id='DEBUG-MERCHANT',
                mpesa_receipt_number='DEBUG' + sale.receipt_number,
                status=MpesaTransaction.BYPASSED,
            )
            sale.status = Sale.COMPLETED
            sale.completed_at = timezone.now()
            sale.mpesa_reference = txn.mpesa_receipt_number
            sale.save()
            return Response({
                'success': True,
                'debug': True,
                'message': 'DEBUG MODE: STK Push bypassed. Sale marked complete.',
                'checkout_request_id': txn.checkout_request_id,
                'transaction_id': str(txn.id),
            })

        # ── PRODUCTION: Real Safaricom Daraja API ─────────────────────────────
        try:
            access_token = self._get_access_token()
            timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
            password = base64.b64encode(
                (settings.MPESA_SHORTCODE + settings.MPESA_PASSKEY + timestamp).encode()
            ).decode('utf-8')

            payload = {
                "BusinessShortCode": settings.MPESA_SHORTCODE,
                "Password": password,
                "Timestamp": timestamp,
                "TransactionType": "CustomerPayBillOnline",
                "Amount": int(data['amount']),
                "PartyA": data['phone_number'],
                "PartyB": settings.MPESA_SHORTCODE,
                "PhoneNumber": data['phone_number'],
                "CallBackURL": settings.MPESA_CALLBACK_URL,
                "AccountReference": sale.receipt_number,
                "TransactionDesc": f"Payment for {sale.receipt_number}",
            }

            url = "https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest"
            response = requests.post(url, json=payload, headers={"Authorization": f"Bearer {access_token}"}, timeout=30)
            resp_data = response.json()

            txn = MpesaTransaction.objects.create(
                sale=sale,
                phone_number=data['phone_number'],
                amount=data['amount'],
                checkout_request_id=resp_data.get('CheckoutRequestID', ''),
                merchant_request_id=resp_data.get('MerchantRequestID', ''),
                status=MpesaTransaction.PENDING,
            )

            return Response({
                'success': True,
                'message': 'STK Push sent. Waiting for customer to confirm.',
                'checkout_request_id': txn.checkout_request_id,
                'transaction_id': str(txn.id),
            })

        except Exception as e:
            logger.error(f"M-Pesa STK Push failed: {e}")
            return Response({'error': 'M-Pesa service unavailable. Try again.'}, status=503)

    def _get_access_token(self):
        url = "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials"
        if settings.MPESA_ENVIRONMENT == 'sandbox':
            url = "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials"
        credentials = base64.b64encode(
            f"{settings.MPESA_CONSUMER_KEY}:{settings.MPESA_CONSUMER_SECRET}".encode()
        ).decode('utf-8')
        response = requests.get(url, headers={"Authorization": f"Basic {credentials}"}, timeout=10)
        return response.json()['access_token']


class MpesaCallbackView(APIView):
    permission_classes = [permissions.AllowAny]  # Safaricom server calls this

    def post(self, request):
        try:
            body = request.data.get('Body', {})
            stk_callback = body.get('stkCallback', {})
            checkout_request_id = stk_callback.get('CheckoutRequestID')
            result_code = stk_callback.get('ResultCode')

            txn = MpesaTransaction.objects.get(checkout_request_id=checkout_request_id)

            if result_code == 0:
                # Successful
                metadata = stk_callback.get('CallbackMetadata', {}).get('Item', [])
                receipt = next((i['Value'] for i in metadata if i['Name'] == 'MpesaReceiptNumber'), '')
                txn.mpesa_receipt_number = receipt
                txn.status = MpesaTransaction.COMPLETED
                txn.result_code = result_code
                txn.save()

                if txn.sale:
                    txn.sale.status = Sale.COMPLETED
                    txn.sale.completed_at = timezone.now()
                    txn.sale.mpesa_reference = receipt
                    txn.sale.save()
                    # Award loyalty points
                    if txn.sale.customer and txn.sale.points_earned > 0:
                        cust = txn.sale.customer
                        cust.loyalty_points += txn.sale.points_earned
                        cust.total_spent += txn.sale.total_amount
                        cust.save()
            else:
                txn.status = MpesaTransaction.FAILED
                txn.result_code = result_code
                txn.result_description = stk_callback.get('ResultDesc', '')
                txn.save()

        except Exception as e:
            logger.error(f"M-Pesa callback error: {e}")

        return Response({'ResultCode': 0, 'ResultDesc': 'Accepted'})


class MpesaStatusView(APIView):
    permission_classes = [IsCashierOrAbove]

    def get(self, request, checkout_request_id):
        try:
            txn = MpesaTransaction.objects.get(checkout_request_id=checkout_request_id)
            return Response(MpesaTransactionSerializer(txn).data)
        except MpesaTransaction.DoesNotExist:
            return Response({'error': 'Transaction not found.'}, status=404)


# ─── Cash Drawer ViewSet ──────────────────────────────────────────────────────

class CashDrawerViewSet(viewsets.ModelViewSet):
    queryset = CashDrawer.objects.all().select_related('cashier', 'branch')
    serializer_class = CashDrawerSerializer
    permission_classes = [IsCashierOrAbove]

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.user.role == User.CASHIER:
            return qs.filter(cashier=self.request.user)
        return qs

    @action(detail=False, methods=['post'])
    def open(self, request):
        serializer = OpenDrawerSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        existing = CashDrawer.objects.filter(cashier=request.user, status=CashDrawer.OPEN).first()
        if existing:
            return Response({'error': 'You already have an open drawer.'}, status=400)
        if not request.user.branch:
            return Response({'error': 'Not assigned to a branch.'}, status=400)
        drawer = CashDrawer.objects.create(
            branch=request.user.branch, cashier=request.user,
            opening_float=serializer.validated_data['opening_float'],
        )
        log_action(request.user, f'OPEN_DRAWER KES {drawer.opening_float}', 'CashDrawer', drawer.id, request=request)
        return Response(CashDrawerSerializer(drawer).data, status=201)

    @action(detail=True, methods=['post'])
    def close(self, request, pk=None):
        drawer = self.get_object()
        if drawer.status != CashDrawer.OPEN:
            return Response({'error': 'Drawer is already closed.'}, status=400)
        serializer = CloseDrawerSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Calculate expected
        cash_sales = Sale.objects.filter(
            cashier=request.user, status=Sale.COMPLETED,
            payment_method=Sale.CASH, created_at__gte=drawer.opened_at
        ).aggregate(total=Sum('total_amount'))['total'] or Decimal('0')
        expected = drawer.opening_float + cash_sales

        drawer.closing_amount = serializer.validated_data['closing_amount']
        drawer.expected_amount = expected
        drawer.variance = drawer.closing_amount - expected
        drawer.status = CashDrawer.CLOSED
        drawer.closed_at = timezone.now()
        drawer.notes = serializer.validated_data.get('notes', '')
        drawer.save()

        if abs(drawer.variance) > 100:
            log_action(request.user, f'CASH_VARIANCE KES {drawer.variance}', 'CashDrawer', drawer.id, request=request)

        return Response(CashDrawerSerializer(drawer).data)

    @action(detail=False, methods=['get'], url_path='current')
    def current(self, request):
        drawer = CashDrawer.objects.filter(cashier=request.user, status=CashDrawer.OPEN).first()
        if not drawer:
            return Response(None)
        return Response(CashDrawerSerializer(drawer).data)


# ─── Discount ViewSet ─────────────────────────────────────────────────────────

class DiscountViewSet(viewsets.ModelViewSet):
    queryset = Discount.objects.filter(is_active=True)
    serializer_class = DiscountSerializer
    permission_classes = [IsManagerOrAbove]


# ─── Loyalty ──────────────────────────────────────────────────────────────────

class RedeemPointsView(APIView):
    permission_classes = [IsCashierOrAbove]

    def post(self, request):
        serializer = RedeemPointsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            customer = Customer.objects.get(id=serializer.validated_data['customer_id'])
        except Customer.DoesNotExist:
            return Response({'error': 'Customer not found.'}, status=404)
        points = serializer.validated_data['points_to_redeem']
        if customer.loyalty_points < points:
            return Response({'error': 'Insufficient points.'}, status=400)
        if points < settings.MIN_REDEMPTION_POINTS:
            return Response({'error': f'Minimum redemption is {settings.MIN_REDEMPTION_POINTS} points.'}, status=400)
        value = points * settings.POINTS_REDEMPTION_RATE
        return Response({'points': points, 'value': value, 'remaining': customer.loyalty_points - points})


class LoyaltyHistoryView(APIView):
    permission_classes = [IsCashierOrAbove]

    def get(self, request, customer_id):
        try:
            customer = Customer.objects.get(id=customer_id)
        except Customer.DoesNotExist:
            return Response({'error': 'Customer not found.'}, status=404)
        transactions = LoyaltyTransaction.objects.filter(customer=customer)[:50]
        return Response(LoyaltyTransactionSerializer(transactions, many=True).data)


# ─── Dashboard ────────────────────────────────────────────────────────────────

class DashboardView(APIView):
    permission_classes = [IsCashierOrAbove]

    def get(self, request):
        today = timezone.now().date()
        week_start = today - timedelta(days=today.weekday())
        month_start = today.replace(day=1)

        base_qs = Sale.objects.filter(status=Sale.COMPLETED)
        if request.user.role == User.CASHIER:
            base_qs = base_qs.filter(cashier=request.user)

        today_sales = base_qs.filter(created_at__date=today).aggregate(
            total=Sum('total_amount'), count=Count('id')
        )
        week_sales = base_qs.filter(created_at__date__gte=week_start).aggregate(total=Sum('total_amount'))
        month_sales = base_qs.filter(created_at__date__gte=month_start).aggregate(total=Sum('total_amount'))

        today_items = SaleItem.objects.filter(sale__in=base_qs.filter(created_at__date=today)).aggregate(
            total=Sum('quantity')
        )

        payment_breakdown = base_qs.filter(created_at__date=today).values('payment_method').annotate(
            total=Sum('total_amount'), count=Count('id')
        )

        low_stock = Inventory.objects.select_related('product').filter(
            quantity__lte=models.F('product__min_stock_level')
        ).count()

        from django.db import models as dj_models
        top_products = SaleItem.objects.filter(
            sale__in=base_qs.filter(created_at__date__gte=month_start)
        ).values('product__name').annotate(
            total_qty=Sum('quantity'), total_revenue=Sum('line_total')
        ).order_by('-total_revenue')[:5]

        hourly_sales = []
        for hour in range(6, 23):
            h_sales = base_qs.filter(
                created_at__date=today,
                created_at__hour=hour
            ).aggregate(total=Sum('total_amount'))
            hourly_sales.append({'hour': f'{hour:02d}:00', 'total': float(h_sales['total'] or 0)})

        return Response({
            'today_sales': float(today_sales['total'] or 0),
            'today_transactions': today_sales['count'] or 0,
            'today_items_sold': float(today_items['total'] or 0),
            'week_sales': float(week_sales['total'] or 0),
            'month_sales': float(month_sales['total'] or 0),
            'active_customers': Customer.objects.filter(is_active=True).count(),
            'low_stock_count': low_stock,
            'top_products': list(top_products),
            'payment_breakdown': {p['payment_method']: {'total': float(p['total'] or 0), 'count': p['count']} for p in payment_breakdown},
            'hourly_sales': hourly_sales,
        })


# ─── Reports ──────────────────────────────────────────────────────────────────

class SalesReportView(APIView):
    permission_classes = [IsManagerOrAbove]

    def get(self, request):
        date_from = request.query_params.get('date_from', timezone.now().date().isoformat())
        date_to = request.query_params.get('date_to', timezone.now().date().isoformat())
        sales = Sale.objects.filter(status=Sale.COMPLETED, created_at__date__range=[date_from, date_to])
        summary = sales.aggregate(
            total=Sum('total_amount'), count=Count('id'),
            tax=Sum('tax_total'), discounts=Sum('discount_amount')
        )
        by_payment = sales.values('payment_method').annotate(total=Sum('total_amount'), count=Count('id'))
        by_cashier = sales.values('cashier__first_name', 'cashier__last_name').annotate(
            total=Sum('total_amount'), count=Count('id')
        )
        return Response({
            'period': {'from': date_from, 'to': date_to},
            'summary': summary,
            'by_payment': list(by_payment),
            'by_cashier': list(by_cashier),
        })


class ProductReportView(APIView):
    permission_classes = [IsManagerOrAbove]

    def get(self, request):
        date_from = request.query_params.get('date_from', timezone.now().date().isoformat())
        date_to = request.query_params.get('date_to', timezone.now().date().isoformat())
        items = SaleItem.objects.filter(
            sale__status=Sale.COMPLETED, sale__created_at__date__range=[date_from, date_to]
        ).values('product__name', 'product__category__name').annotate(
            qty=Sum('quantity'), revenue=Sum('line_total')
        ).order_by('-revenue')[:50]
        return Response({'period': {'from': date_from, 'to': date_to}, 'products': list(items)})


class CashierReportView(APIView):
    permission_classes = [IsManagerOrAbove]

    def get(self, request):
        date = request.query_params.get('date', timezone.now().date().isoformat())
        drawers = CashDrawer.objects.filter(opened_at__date=date).select_related('cashier', 'branch')
        return Response(CashDrawerSerializer(drawers, many=True).data)


# ─── Audit Log ViewSet ────────────────────────────────────────────────────────

class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditLog.objects.all().select_related('user')
    serializer_class = AuditLogSerializer
    permission_classes = [IsManagerOrAbove]
    filterset_fields = ['user', 'model_name']
    search_fields = ['action', 'user__email']
    ordering_fields = ['timestamp']


# ─── Custom Error Handlers ────────────────────────────────────────────────────

def custom_404(request, exception):
    return JsonResponse({'error': 'Resource not found.', 'status': 404}, status=404)


def custom_500(request):
    return JsonResponse({'error': 'Internal server error.', 'status': 500}, status=500)