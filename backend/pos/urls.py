from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'branches', views.BranchViewSet, basename='branches')
router.register(r'categories', views.CategoryViewSet, basename='categories')
router.register(r'suppliers', views.SupplierViewSet, basename='suppliers')
router.register(r'products', views.ProductViewSet, basename='products')
router.register(r'inventory', views.InventoryViewSet, basename='inventory')
router.register(r'customers', views.CustomerViewSet, basename='customers')
router.register(r'sales', views.SaleViewSet, basename='sales')
router.register(r'discounts', views.DiscountViewSet, basename='discounts')
router.register(r'audit-logs', views.AuditLogViewSet, basename='audit-logs')
router.register(r'cash-drawer', views.CashDrawerViewSet, basename='cash-drawer')
router.register(r'users', views.UserViewSet, basename='users')

urlpatterns = [
    path('', include(router.urls)),
    # M-Pesa endpoints
    path('mpesa/stk-push/', views.MpesaSTKPushView.as_view(), name='mpesa-stk-push'),
    path('mpesa/callback/', views.MpesaCallbackView.as_view(), name='mpesa-callback'),
    path('mpesa/status/<str:checkout_request_id>/', views.MpesaStatusView.as_view(), name='mpesa-status'),
    # Dashboard
    path('dashboard/', views.DashboardView.as_view(), name='dashboard'),
    # Reports
    path('reports/sales/', views.SalesReportView.as_view(), name='sales-report'),
    path('reports/products/', views.ProductReportView.as_view(), name='product-report'),
    path('reports/cashier/', views.CashierReportView.as_view(), name='cashier-report'),
    # Barcode lookup
    path('products/barcode/<str:barcode>/', views.ProductBarcodeView.as_view(), name='product-barcode'),
    # Loyalty
    path('loyalty/redeem/', views.RedeemPointsView.as_view(), name='loyalty-redeem'),
    path('loyalty/history/<uuid:customer_id>/', views.LoyaltyHistoryView.as_view(), name='loyalty-history'),
    # Custom 404/500 handlers
]