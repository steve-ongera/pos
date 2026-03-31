from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('pos.urls')),
    path('api/auth/', include('pos.auth_urls')),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

# Custom 404 / 500
handler404 = 'pos.views.custom_404'
handler500 = 'pos.views.custom_500'