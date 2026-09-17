from rest_framework.routers import DefaultRouter

from .views import SchoolClassViewSet

router = DefaultRouter()
router.register("classes", SchoolClassViewSet, basename="schoolclass")

urlpatterns = router.urls
