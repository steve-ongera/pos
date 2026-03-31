# permissions.py
from rest_framework.permissions import BasePermission


class IsCashierOrAbove(BasePermission):
    """Allows any authenticated POS staff."""
    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated and request.user.is_active


class IsSupervisorOrAbove(BasePermission):
    ALLOWED_ROLES = ['supervisor', 'manager', 'admin']

    def has_permission(self, request, view):
        return (request.user and request.user.is_authenticated and
                request.user.role in self.ALLOWED_ROLES)


class IsManagerOrAbove(BasePermission):
    ALLOWED_ROLES = ['manager', 'admin']

    def has_permission(self, request, view):
        return (request.user and request.user.is_authenticated and
                request.user.role in self.ALLOWED_ROLES)


class IsAdminOnly(BasePermission):
    def has_permission(self, request, view):
        return (request.user and request.user.is_authenticated and
                request.user.role == 'admin')