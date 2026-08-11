"""
AWS deployment service: upload build artifacts to S3 and invalidate CloudFront.
boto3 is optional — only imported when AWS credentials are actually provided.
"""
import logging
import os

logger = logging.getLogger(__name__)


async def deploy_to_s3(
    build_path: str,
    bucket: str,
    aws_key: str,
    aws_secret: str,
    region: str = "us-east-1",
    prefix: str = "",
) -> dict:
    """Upload all files under build_path to the S3 bucket."""
    try:
        import boto3
    except ImportError:
        return {"ok": False, "error": "boto3 not installed. Add boto3 to requirements.txt"}

    try:
        s3 = boto3.client(
            "s3",
            region_name=region,
            aws_access_key_id=aws_key,
            aws_secret_access_key=aws_secret,
        )
        uploaded = 0
        for root, _, files in os.walk(build_path):
            for filename in files:
                local_path = os.path.join(root, filename)
                s3_key = os.path.relpath(local_path, build_path)
                if prefix:
                    s3_key = f"{prefix.rstrip('/')}/{s3_key}"
                content_type = _guess_content_type(filename)
                s3.upload_file(local_path, bucket, s3_key, ExtraArgs={"ContentType": content_type})
                uploaded += 1
        logger.info("Uploaded %d files to s3://%s/%s", uploaded, bucket, prefix)
        return {"ok": True, "uploaded": uploaded, "bucket": bucket}
    except Exception as e:
        logger.error("S3 upload failed: %s", e)
        return {"ok": False, "error": str(e)}


async def invalidate_cloudfront(
    distribution_id: str,
    aws_key: str,
    aws_secret: str,
    region: str = "us-east-1",
    paths: list[str] | None = None,
) -> dict:
    """Create a CloudFront invalidation for the given paths (default: /*)."""
    try:
        import boto3
    except ImportError:
        return {"ok": False, "error": "boto3 not installed"}

    paths = paths or ["/*"]
    try:
        cf = boto3.client(
            "cloudfront",
            region_name=region,
            aws_access_key_id=aws_key,
            aws_secret_access_key=aws_secret,
        )
        import time
        resp = cf.create_invalidation(
            DistributionId=distribution_id,
            InvalidationBatch={
                "Paths": {"Quantity": len(paths), "Items": paths},
                "CallerReference": str(int(time.time())),
            },
        )
        inv_id = resp["Invalidation"]["Id"]
        logger.info("CloudFront invalidation %s created for dist %s", inv_id, distribution_id)
        return {"ok": True, "invalidation_id": inv_id}
    except Exception as e:
        logger.error("CloudFront invalidation failed: %s", e)
        return {"ok": False, "error": str(e)}


def _guess_content_type(filename: str) -> str:
    ext = os.path.splitext(filename)[1].lower()
    return {
        ".html": "text/html",
        ".css": "text/css",
        ".js": "application/javascript",
        ".json": "application/json",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".svg": "image/svg+xml",
        ".ico": "image/x-icon",
        ".woff2": "font/woff2",
        ".woff": "font/woff",
        ".ttf": "font/ttf",
    }.get(ext, "application/octet-stream")
