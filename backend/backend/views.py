from rest_framework.decorators import api_view
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema
from .serializers import TestSerializer

@extend_schema(
    request=TestSerializer,
    responses={200: TestSerializer}
)
@api_view(['POST'])
def test_view(request):
    serializer = TestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    return Response(serializer.validated_data)