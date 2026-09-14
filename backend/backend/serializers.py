from rest_framework import serializers

class TestSerializer(serializers.Serializer):
    message = serializers.CharField()
    random_number = serializers.IntegerField()
    server_time = serializers.DateTimeField()