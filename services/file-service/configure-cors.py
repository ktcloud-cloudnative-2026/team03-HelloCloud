"""Apply private bucket CORS after deployment approval. Requires boto3 and S3_* env."""
import os
import boto3
from botocore.config import Config

origins = [value.strip() for value in os.environ["S3_ALLOWED_ORIGINS"].split(",") if value.strip()]
if not origins or "*" in origins:
    raise ValueError("Explicit frontend origins are required")
client = boto3.client(
    "s3", endpoint_url=os.environ["S3_ENDPOINT"],
    aws_access_key_id=os.environ["S3_ACCESS_KEY"],
    aws_secret_access_key=os.environ["S3_SECRET_KEY"],
    region_name=os.environ.get("S3_REGION", "us-east-1"),
    config=Config(s3={"addressing_style": "path"}),
)
client.put_bucket_cors(
    Bucket=os.environ.get("S3_BUCKET", "chat-attachments"),
    CORSConfiguration={"CORSRules": [{
        "AllowedOrigins": origins,
        "AllowedMethods": ["PUT", "GET", "HEAD"],
        "AllowedHeaders": ["content-type", "x-amz-*"],
        "ExposeHeaders": ["ETag", "Content-Length", "Content-Type"],
        "MaxAgeSeconds": 300,
    }]},
)
print("Bucket CORS configured")
