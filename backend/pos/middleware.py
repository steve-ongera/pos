# middleware.py
import logging
from django.utils import timezone

logger = logging.getLogger('pos')


class AuditLogMiddleware:
    """Logs all write operations to the audit trail."""
    WRITE_METHODS = {'POST', 'PUT', 'PATCH', 'DELETE'}

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if (request.method in self.WRITE_METHODS and
                hasattr(request, 'user') and
                request.user.is_authenticated and
                response.status_code < 400):
            logger.info(
                f"[AUDIT] {timezone.now().isoformat()} | "
                f"User: {request.user.email} | "
                f"Method: {request.method} | "
                f"Path: {request.path} | "
                f"Status: {response.status_code} | "
                f"IP: {self._get_ip(request)}"
            )
        return response

    def _get_ip(self, request):
        xff = request.META.get('HTTP_X_FORWARDED_FOR')
        return xff.split(',')[0] if xff else request.META.get('REMOTE_ADDR', 'unknown')